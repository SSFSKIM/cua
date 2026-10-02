#!/usr/bin/env node
// A stand-in for the vendor cua_repl launcher as a real child process, for teardown and end-to-end tests. It speaks
// just enough newline-delimited MCP to be served through, and a mode (argv[2]) selects a teardown behavior:
//   echo         answer requests; exit on stdin EOF (the vendor runtime's normal shape)
//   ignore-term  answer requests; ignore SIGTERM and stdin EOF (only SIGKILL stops it)
//   orphan       on EOF exit, leaving a SIGTERM-ignoring grandchild in the process group
//   unowned      start a grandchild in its own session (like the LaunchServices-started native helper), then echo
//   noise        write a non-JSON line before each response
// When CODEX_HOME is set (an actual `cua serve` launch), every received message plus the launch environment and
// working directory are appended to $CODEX_HOME/fake-upstream.jsonl for the test to inspect.
import {spawn} from 'node:child_process';
import {appendFileSync, writeFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';

const mode = process.argv[2] ?? 'echo';
const pidFile = process.argv[3];
const record = process.env.CODEX_HOME ? join(process.env.CODEX_HOME, 'fake-upstream.jsonl') : null;
const log = entry => { if (record) appendFileSync(record, JSON.stringify(entry) + '\n'); };
log({start: {pid: process.pid, cwd: process.cwd(), cwdMode: statSync(process.cwd()).mode & 0o777, env: process.env, argv: process.argv.slice(2)}});

const TOOLS = [
  {name: 'js', description: 'Fake js.', inputSchema: {type: 'object', properties: {code: {type: 'string'}}, required: ['code']}},
  {name: 'js_add_node_module_dir', description: 'Fake.', inputSchema: {type: 'object', properties: {path: {type: 'string'}}}},
  {name: 'js_reset', description: 'Fake reset.', inputSchema: {type: 'object', properties: {}}},
  {name: 'turn_ended', description: 'Fake turn_ended.', inputSchema: {type: 'object', properties: {}}},
];

const keepAlive = setInterval(() => {}, 1 << 30);
if (mode === 'ignore-term') process.on('SIGTERM', () => {});
if (mode === 'unowned') {
  const helper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1 << 30)'], {detached: true, stdio: 'ignore'});
  writeFileSync(pidFile, String(helper.pid));
  helper.unref();
}

const send = msg => {
  if (mode === 'noise') process.stdout.write('not json from the runtime\n');
  process.stdout.write(JSON.stringify(msg) + '\n');
};
const text = value => ({content: [{type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value)}], isError: false});

createInterface({input: process.stdin}).on('line', line => {
  const msg = JSON.parse(line);
  log({received: msg});
  if (msg.id === undefined || msg.method === undefined) return;
  const reply = result => send({jsonrpc: '2.0', id: msg.id, result});
  switch (msg.method) {
    case 'initialize': return reply({protocolVersion: '2025-06-18', capabilities: {tools: {}}, serverInfo: {name: 'fake-upstream', version: '0'}, instructions: 'Fake upstream.'});
    case 'tools/list': return reply({tools: TOOLS});
    case 'ping': return reply({});
    case 'tools/call': {
      const {name, arguments: args = {}, _meta} = msg.params;
      if (name === 'js' && args.code === 'exit') process.exit(3);
      if (name === 'js') return reply(text({code: args.code, turn: _meta?.['x-codex-turn-metadata']}));
      if (name === 'js_reset') return reply(text('js kernel reset'));
      if (name === 'turn_ended') return reply(text('{}'));
      return send({jsonrpc: '2.0', id: msg.id, error: {code: -32602, message: `unknown tool ${name}`}});
    }
    default: return send({jsonrpc: '2.0', id: msg.id, error: {code: -32601, message: 'method not found'}});
  }
}).on('close', () => {
  if (mode === 'ignore-term') return;
  if (mode === 'orphan') {
    const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1 << 30)'], {stdio: 'ignore'});
    writeFileSync(pidFile, String(child.pid));
    child.unref();
  }
  clearInterval(keepAlive);
  process.exit(0);
});
