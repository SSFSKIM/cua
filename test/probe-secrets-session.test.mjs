import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as sessions from '../scripts/probe/secrets-session.mjs';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openSession} from '../scripts/accept/mcp-session.mjs';
import {fingerprints, textLeaks} from '../scripts/probe/leak-scan.mjs';

const result = (text, isError = false) => ({result: {content: [{type: 'text', text}], isError}});

test('healthy startup requires both banner and readiness cells', async () => {
  const calls = [];
  await sessions.openSecretSession({name: 'target', initialize: async () => calls.push('init'), js: async code => {
    calls.push(code); return result('ready');
  }});
  assert.deepEqual(calls, ['init', 'nodeRepl.write("banner")', 'nodeRepl.write("ready")']);
});

test('failed initialize sends no cell', async () => {
  let cells = 0;
  await assert.rejects(sessions.openSecretSession({name: 'target', initialize: async () => { throw new Error('private'); },
    js: async () => { cells++; }}), /initialize failed \(no cell sent\)/);
  assert.equal(cells, 0);
});

test('startup refuses a failed banner immediately and keeps allowlisted cause, not raw text', async () => {
  const calls = [];
  const session = {name: 'target-first value', initialize: async () => calls.push('initialize'), js: async code => {
    calls.push(code);
    return result('node_repl kernel unhandled rejection: Trusted RPC dependency must resolve within a configured trusted code path: /private/value-not-for-evidence/target.mjs', true);
  }};
  await assert.rejects(sessions.openSecretSession(session), error => {
    assert.match(error.message, /"stage":"banner"/);
    assert.match(error.message, /"trustedImportRefused":true/);
    assert.doesNotMatch(error.message, /value-not-for-evidence/);
    return true;
  });
  assert.deepEqual(calls, ['initialize', 'nodeRepl.write("banner")']);
});

test('post-banner kernel exit retains the status and reason hidden by the former 300-character slice', async () => {
  let cells = 0;
  const session = {name: 'target', initialize: async () => {}, js: async () => ++cells === 1 ? result('banner')
    : result('node_repl kernel exited unexpectedly\n\nnode_repl diagnostics: ' + JSON.stringify({kernel_pid: 17, kernel_status: 'exited(code=1)',
      kernel_stderr_tail: 'ExperimentalWarning '.repeat(40) + 'private-value', reason: 'stdout_eof', stream_error: null}), true)};
  await assert.rejects(sessions.openSecretSession(session), error => {
    const detail = JSON.parse(error.message.slice(error.message.indexOf('{')));
    assert.deepEqual(detail, {stage: 'ready', timedOut: false, isError: true, trustedImportRefused: false,
      kernel: {pid: 17, status: 'exited(code=1)', reason: 'stdout_eof'}});
    assert.doesNotMatch(error.message, /private-value|ExperimentalWarning/);
    return true;
  });
});

test('failed subprocess open still scans MCP and shutdown stderr for the sentinel', async t => {
  const root = mkdtempSync(join(tmpdir(), 'cua-probe-session-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const server = join(root, 'fake.mjs');
  const sentinel = 'fixture-sentinel-not-a-real-secret';
  writeFileSync(server, `import {createInterface} from 'node:readline';
const input = createInterface({input: process.stdin});
input.on('line', line => { const msg = JSON.parse(line); if (msg.id === undefined) return;
  const result = msg.method === 'initialize' ? {protocolVersion: '2025-06-18', capabilities: {}, serverInfo: {name: 'fixture', version: '0'}}
    : {isError: true, content: [{type: 'text', text: 'bootstrap failed'}]};
  process.stdout.write(JSON.stringify({jsonrpc: '2.0', id: msg.id, result}) + '\\n');
});
input.on('close', () => { process.stderr.write(${JSON.stringify(sentinel)}); });`);
  const session = openSession({args: [server], env: {HOME: root, PATH: process.env.PATH}});
  session.name = 'failed-open';
  const terminate = session.terminate.bind(session);
  session.terminate = () => terminate({budgetMs: 200});
  t.after(() => session.terminate());
  await assert.rejects(sessions.openSecretSession(session), /"stage":"banner"/);
  const channels = [];
  await sessions.finishSecretSessions([session], channels);
  assert.equal(channels.length, 2);
  assert.match(channels[0].text, /bootstrap failed/);
  assert.ok(textLeaks(channels[1].text, fingerprints(sentinel)) > 0, 'even a last stderr write is scanned, not dropped with the failed open');
});

test('every started connection is harvested after termination, including a failed open', async () => {
  const events = [], channels = [];
  const make = name => ({name, transcript: ['request'], stderr: '', async terminate() {
    events.push(name); this.transcript.push('last reply'); this.stderr = 'last stderr'; return {code: 0};
  }});
  await sessions.finishSecretSessions([make('closed'), make('failed-open')], channels);
  assert.deepEqual(events, ['closed', 'failed-open']);
  assert.deepEqual(channels, ['closed', 'failed-open'].flatMap(name => [
    {name: `${name} MCP transport`, text: 'request\nlast reply'},
    {name: `${name} stderr (serve, runtime, node_repl, kernel, trusted worker)`, text: 'last stderr'},
  ]));
});
