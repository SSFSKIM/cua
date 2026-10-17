// Control traffic and cancellation start from the moment a cell's js request is written, not from the call: the
// dispatch may be held at the run's pause (runner.mjs's connection wrapper), and even unheld it is not synchronous.
// An MCP double logs what it receives, in order, and runs each js call for 300 ms.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AttestedConnections, runRawScenario, usePauseGate} from '../../scripts/repl-parity/runner.mjs';

// `queuePings`: a host that answers a ping only once the running js call has answered (no control traffic during execution).
// `rejectJs`: a host that answers a js call with an RPC error at once, and a ping only after `pingDelayMs`.
function host(t, {queuePings = false, rejectJs = false, pingDelayMs = 0} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cua-dispatch-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const server = join(dir, 'server.mjs'), log = join(dir, 'received.jsonl');
  writeFileSync(server, `import {createInterface} from 'node:readline';
import {appendFileSync} from 'node:fs';
const queue = ${queuePings};
let running = 0, queued = [];
const send = message => process.stdout.write(JSON.stringify({jsonrpc: '2.0', ...message}) + '\\n');
createInterface({input: process.stdin}).on('line', line => {
  const m = JSON.parse(line);
  appendFileSync(${JSON.stringify(log)}, line + '\\n');
  if (m.id === undefined) return;
  if (m.method === 'initialize') return send({id: m.id, result: {protocolVersion: '2025-06-18', capabilities: {tools: {}}, serverInfo: {name: 'fake', version: '0'}}});
  if (m.method === 'ping') return queue && running ? queued.push(m.id) : setTimeout(() => send({id: m.id, result: {}}), ${pingDelayMs});
  if (${rejectJs}) return send({id: m.id, error: {code: -32000, message: 'host refused the js call'}});
  running++;
  setTimeout(() => {
    send({id: m.id, result: {content: [{type: 'text', text: 'completed'}], isError: false}});
    if (--running === 0) { for (const id of queued) send({id, result: {}}); queued = []; }
  }, 300);
});`);
  return {dir, command: {command: process.execPath, args: [server]}, received: () => readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line))};
}

async function connect(t, command) {
  const pool = new AttestedConnections('vendor');
  const client = await pool.open(command);
  t.after(() => pool.close());
  return client;
}

const scenario = cell => ({id: 'dispatch', cells: [{label: 'running', code: 'nodeRepl.write("completed")', ...cell}], assert: () => ({ok: true})});
const run = (client, cell) => runRawScenario(scenario(cell), {client, emit: async () => {}, checkout: '', reset: false});

test('a host that queues pings while a js call runs fails the control-traffic probe, with no pause configured', async t => {
  const {command, received} = host(t, {queuePings: true});
  const client = await connect(t, command);
  await assert.rejects(run(client, {ping: true}), /ping completed only after the cell settled/);
  const methods = received().map(m => m.method).filter(m => m === 'tools/call' || m === 'ping');
  assert.deepEqual(methods, ['tools/call', 'ping'], 'the ping follows the js request');
});

test('a host that answers pings while a js call runs passes the control-traffic probe', async t => {
  const {command} = host(t, {queuePings: false});
  const client = await connect(t, command);
  assert.deepEqual(await run(client, {ping: true}), {ok: true});
});

test('a held dispatch emits no cancellation before its js request, and the cancellation carries the request id', async t => {
  usePauseGate({wait: async where => where.startsWith('a js call') ? new Promise(r => setTimeout(() => r(null), 300)) : null,
    begin: () => ({generation: null}), overlapped: () => null});
  t.after(() => usePauseGate(null));
  const {command, received} = host(t, {queuePings: false});
  const client = await connect(t, command);
  await run(client, {cancelAfterMs: 100});
  const messages = received().filter(m => m.method === 'tools/call' || m.method === 'notifications/cancelled');
  assert.deepEqual(messages.map(m => m.method), ['tools/call', 'notifications/cancelled']);
  assert.equal(messages[1].params.requestId, messages[0].id);
});

test('a js call the host rejects while the ping is pending is caught by the harness, which then cleans up', async t => {
  const {dir, command} = host(t, {rejectJs: true, pingDelayMs: 300});
  const harness = join(dir, 'harness.mjs');
  writeFileSync(harness, `import {AttestedConnections, runRawScenario} from ${JSON.stringify(new URL('../../scripts/repl-parity/runner.mjs', import.meta.url).href)};
const pool = new AttestedConnections('vendor');
const client = await pool.open(${JSON.stringify(command)});
try {
  await runRawScenario({id: 'dispatch', cells: [{label: 'running', code: '1', ping: true}], assert: () => ({ok: true})}, {client, emit: async () => {}, checkout: '', reset: false});
} catch (error) { console.log('caught: ' + error.message); }
finally { await pool.close(); console.log('cleanup done'); }`);
  const run = spawnSync(process.execPath, [harness], {encoding: 'utf8', timeout: 20_000, env: {...process.env, CUA_REPL_HOST: 'vendor'}});
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /caught: (host refused the js call|ping completed only after the cell settled)/);
  assert.match(run.stdout, /cleanup done/);
});
