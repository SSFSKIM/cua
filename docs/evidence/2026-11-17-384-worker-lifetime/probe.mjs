// Drives a REPL host over MCP stdio: does the trusted worker (and its service state) survive js_reset, a hung turn
// end and a cell timeout? Usage: node probe.mjs '<json argv>' '<json env>'
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const [command, ...args] = JSON.parse(process.argv[2]);
const extraEnv = JSON.parse(process.argv[3] ?? '{}');
const home = mkdtempSync(join(tmpdir(), 'vprobe-'));
const child = spawn(command, args, {env: {PATH: process.env.PATH, HOME: home, CODEX_HOME: home, TMPDIR: home, ...extraEnv}, cwd: home, stdio: ['pipe', 'pipe', 'inherit']});
let id = 0; const pending = new Map();
createInterface({input: child.stdout}).on('line', line => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method && m.id != null) child.stdin.write(JSON.stringify({jsonrpc: '2.0', id: m.id, result: {action: 'accept', content: {}}}) + '\n');
});
const req = (method, params) => new Promise(res => { const i = ++id; pending.set(i, res); child.stdin.write(JSON.stringify({jsonrpc: '2.0', id: i, method, params}) + '\n'); });
const meta = (turn, call) => ({callId: call, threadId: 's1', sessionId: 's1', 'x-codex-turn-metadata': {session_id: 's1', thread_id: 's1', turn_id: turn, call_id: call, model: 'probe'}, 'codex/sandbox-state-meta': {permissionProfile: {type: 'disabled'}, sandboxCwd: `file://${home}`}});
const text = r => JSON.stringify(r.result?.content ?? r.error ?? r.result).slice(0, 300);
const timed = async (name, args, turn, call) => { const t = Date.now(); const r = await req('tools/call', {name, arguments: args, _meta: meta(turn, call)}); return `${Date.now() - t}ms ${text(r)}`; };
const pidCode = 'const r = await nodeRepl.rpc("probe", {}); nodeRepl.write(JSON.stringify(r));';
await req('initialize', {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'probe', version: '0'}});
child.stdin.write(JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'}) + '\n');
console.log('1 rpc            ', await timed('js', {code: pidCode, timeout_ms: 20000}, 't1', 'c1'));
console.log('  js_reset       ', await timed('js_reset', {}, 't1', 'c2'));
console.log('2 after js_reset ', await timed('js', {code: pidCode, timeout_ms: 20000}, 't1', 'c3'));
console.log('3 turn_ended     ', await timed('turn_ended', {hook_event_name: 'Stop', session_id: 's1', turn_id: 't1'}, 't1', 'c4'));
console.log('4 after turn end ', await timed('js', {code: pidCode, timeout_ms: 20000}, 't2', 'c5'));
console.log('  js_reset       ', await timed('js_reset', {}, 't2', 'c6'));
console.log('5 after js_reset ', await timed('js', {code: pidCode, timeout_ms: 20000}, 't2', 'c7'));
console.log('6 cell timeout   ', await timed('js', {code: 'await new Promise(r => setTimeout(r, 5000));', timeout_ms: 500}, 't2', 'c8'));
console.log('7 after timeout  ', await timed('js', {code: pidCode, timeout_ms: 20000}, 't2', 'c9'));
child.stdin.end();
setTimeout(() => process.exit(0), 3000).unref();
