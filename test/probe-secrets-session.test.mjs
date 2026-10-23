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
  const outcomes = await sessions.finishSecretSessions([session], channels);
  assert.equal(outcomes[0].status, 'PASS');
  assert.equal(outcomes[0].detail.code, 0);
  assert.equal(channels.length, 2);
  assert.match(channels[0].text, /bootstrap failed/);
  assert.ok(textLeaks(channels[1].text, fingerprints(sentinel)) > 0, 'even a last stderr write is scanned, not dropped with the failed open');
});

// A real MCP process answers end_task but deliberately stays alive after EOF. Exit 0 from its SIGTERM
// handler must never make an ordinary close (or failed-open cleanup) count as orderly success.
async function fakeSession(t, {failOpen = false, ignoreEof = true} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'cua-probe-close-'));
  const server = join(root, 'fake.mjs');
  writeFileSync(server, `import {createInterface} from 'node:readline';
const keepAlive = setInterval(() => {}, 1000);
process.on('SIGTERM', () => { process.stderr.write('terminated after EOF\\n', () => process.exit(0)); });
const input = createInterface({input: process.stdin});
input.on('line', line => { const msg = JSON.parse(line); if (msg.id === undefined) return;
  const result = msg.method === 'initialize' ? {protocolVersion: '2025-06-18', capabilities: {}, serverInfo: {name: 'fixture', version: '0'}}
    : {isError: ${failOpen}, content: [{type: 'text', text: 'fixture reply'}]};
  process.stdout.write(JSON.stringify({jsonrpc: '2.0', id: msg.id, result}) + '\\n');
});
input.on('close', () => {
  if (${ignoreEof}) process.stderr.write('EOF ignored\\n');
  else clearInterval(keepAlive);
});`);
  const session = openSession({args: [server], env: {HOME: root, PATH: process.env.PATH}});
  session.name = failOpen ? 'failed-open' : 'ordinary';
  const terminate = session.terminate.bind(session);
  session.terminate = () => terminate({budgetMs: 400});
  t.after(async () => { await session.terminate(); rmSync(root, {recursive: true, force: true}); });
  return session;
}

test('ordinary EOF exit passes close and idempotent final teardown', async t => {
  const session = await fakeSession(t, {ignoreEof: false});
  await sessions.openSecretSession(session);
  const step = await sessions.closeSecretSession(session, 'ordinary: close');
  assert.equal(step.status, 'PASS');
  assert.deepEqual(step.detail, {code: 0, signal: null, forced: false, stuck: false});
  const outcomes = await sessions.finishSecretSessions([session], []);
  assert.equal(outcomes[0].status, 'PASS');
  assert.deepEqual(outcomes[0].detail, {...step.detail, streamsComplete: true});
});

test('intentional launch refusal preserves exit one without making teardown fail', async t => {
  const root = mkdtempSync(join(tmpdir(), 'cua-probe-refusal-'));
  const server = join(root, 'refuse.mjs');
  writeFileSync(server, `process.stderr.write('the secret store [sandbox_state_invalid]\\n', () => process.exit(1));`);
  const session = openSession({args: [server], env: {HOME: root, PATH: process.env.PATH}});
  session.name = 'fail-closed store unreadable';
  session.expectedExitCode = 1;
  const terminate = session.terminate.bind(session);
  session.terminate = () => terminate({budgetMs: 400});
  t.after(async () => { await session.terminate(); rmSync(root, {recursive: true, force: true}); });
  const exit = await session.exited;
  const {refusedLaunchResult, STORE_UNREADABLE} = await import('../scripts/probe/fail-closed.mjs');
  const refused = refusedLaunchResult(STORE_UNREADABLE, {answered: false, exit, stderr: session.stderr,
    delivered: 0, expected: 'sandbox_state_invalid', names: ['the secret store']});
  assert.equal(refused.status, 'PASS');
  const channels = [];
  const outcomes = await sessions.finishSecretSessions([session], channels);
  assert.equal(outcomes[0].status, 'PASS');
  assert.deepEqual(outcomes[0].detail, {code: 1, signal: null, forced: false, stuck: false, streamsComplete: true});
  assert.match(channels[1].text, /sandbox_state_invalid/);
});

test('SIGTERM exit zero is a failed ordinary close and retained failed teardown', async t => {
  const session = await fakeSession(t);
  await sessions.openSecretSession(session);
  const step = await sessions.closeSecretSession(session, 'ordinary: close');
  assert.equal(step.name, 'ordinary: close');
  assert.equal(step.status, 'FAIL');
  assert.equal(step.detail.code, 0);
  assert.equal(step.detail.forced, true);
  const channels = [];
  const outcomes = await sessions.finishSecretSessions([session], channels);
  assert.equal(outcomes[0].status, 'FAIL');
  assert.deepEqual(outcomes[0].detail, {...step.detail, streamsComplete: true});
  assert.match(channels[0].text, /end_task/);
  assert.match(channels[1].text, /EOF ignored\nterminated after EOF/);
});

test('failed-open teardown retains forced exit zero and harvests both streams', async t => {
  const session = await fakeSession(t, {failOpen: true});
  await assert.rejects(sessions.openSecretSession(session), /startup failed/);
  const channels = [];
  const outcomes = await sessions.finishSecretSessions([session], channels);
  assert.equal(outcomes[0].status, 'FAIL');
  assert.equal(outcomes[0].detail.code, 0);
  assert.equal(outcomes[0].detail.forced, true);
  assert.match(channels[0].text, /fixture reply/);
  assert.match(channels[1].text, /EOF ignored\nterminated after EOF/);
});

test('teardown continues and harvests after an error; only declared refusal exits are accepted', async () => {
  const stopped = [], channels = [];
  const cases = [
    ['throws', new Error('private-error-value'), 'FAIL'],
    ['ordinary', {code: 0, signal: null}, 'PASS'],
    ['unexpected-nonzero', {code: 1, signal: null}, 'FAIL'],
    ['refused', {code: 1, signal: null}, 'PASS', 1],
    ['forced-refusal', {code: 1, signal: null, forced: true}, 'FAIL', 1],
    ['stuck', {code: 0, signal: null, stuck: true}, 'FAIL'],
    ['signaled', {code: null, signal: 'SIGTERM'}, 'FAIL'],
  ];
  const started = cases.map(([name, exit, , expectedExitCode]) => ({name, expectedExitCode, transcript: [name], stderr: name,
    async terminate() { stopped.push(name); if (exit instanceof Error) throw exit; return exit; }, drainStreams: async () => true}));
  const outcomes = await sessions.finishSecretSessions(started, channels);
  assert.deepEqual(stopped, cases.map(([name]) => name));
  assert.deepEqual(outcomes.map(({status}) => status), cases.map(([, , status]) => status));
  assert.equal(outcomes[0].detail.terminateFailed, true);
  assert.equal(outcomes[3].detail.code, 1);
  assert.doesNotMatch(JSON.stringify(outcomes), /private-error-value/);
  assert.deepEqual(channels.map(({text}) => text), cases.flatMap(([name]) => [name, name]));
});

async function inheritedPipesSession(t) {
  const root = mkdtempSync(join(tmpdir(), 'cua-probe-pipes-'));
  const server = join(root, 'parent.mjs');
  const releaseFile = join(root, 'release');
  const release = () => writeFileSync(releaseFile, '');
  // The parent exits before its owned descendant writes to the inherited pipes. The explicit release keeps
  // the timeout case deterministic under load; neither process is a runtime or engine. Include a final partial line.
  const descendant = `const {existsSync} = require('node:fs');
const timer = setInterval(() => { if (!existsSync(${JSON.stringify(releaseFile)})) return;
  clearInterval(timer); process.stdout.write('late MCP bytes'); process.stderr.write('late stderr sentinel');
}, 10);`;
  writeFileSync(server, `import {spawn} from 'node:child_process';
const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}],
  {stdio: ['ignore', process.stdout, process.stderr]});
child.unref();
process.exit(0);`);
  const session = openSession({args: [server], env: {HOME: root, PATH: process.env.PATH}});
  session.name = 'inherited-pipes';
  const terminate = session.terminate.bind(session);
  session.terminate = () => terminate({budgetMs: 400});
  t.after(async () => {
    await session.terminate();
    release();
    assert.equal(await session.drainStreams({budgetMs: 2000}), true, 'the fixture descendant eventually closes both pipes');
    rmSync(root, {recursive: true, force: true});
  });
  await session.exited;
  return {session, release};
}

test('harvesting waits for inherited stdout and stderr after the parent exits', async t => {
  const {session, release} = await inheritedPipesSession(t);
  const channels = [];
  const finishing = sessions.finishSecretSessions([session], channels, {streamBudgetMs: 1000});
  release();
  const outcomes = await finishing;
  assert.match(channels[0].text, /late MCP bytes/);
  assert.match(channels[1].text, /late stderr sentinel/);
  assert.equal(outcomes[0].detail.streamsComplete, true);
  assert.equal(outcomes[0].status, 'PASS');
});

test('held descendant pipes fail complete-harvesting evidence within a bound', async t => {
  const {session} = await inheritedPipesSession(t);
  const later = await fakeSession(t, {ignoreEof: false});
  await sessions.openSecretSession(later);
  const channels = [];
  const outcomes = await sessions.finishSecretSessions([session, later], channels, {streamBudgetMs: 20});
  assert.equal(outcomes[0].detail.streamsComplete, false);
  assert.deepEqual(outcomes.map(outcome => outcome.status), ['FAIL', 'PASS']);
  assert.equal(channels.length, 4, 'a held pipe does not skip later sessions');
  assert.equal(channels[1].text.includes('late stderr sentinel'), false, 'the missing bytes are not mistaken for a clean scan');
});

test('every started connection is harvested after termination, including a failed open', async () => {
  const events = [], channels = [];
  const make = name => ({name, transcript: ['request'], stderr: '', drainStreams: async () => true, async terminate() {
    events.push(name); this.transcript.push('last reply'); this.stderr = 'last stderr'; return {code: 0};
  }});
  await sessions.finishSecretSessions([make('closed'), make('failed-open')], channels);
  assert.deepEqual(events, ['closed', 'failed-open']);
  assert.deepEqual(channels, ['closed', 'failed-open'].flatMap(name => [
    {name: `${name} MCP transport`, text: 'request\nlast reply'},
    {name: `${name} stderr (serve, runtime, node_repl, kernel, trusted worker)`, text: 'last stderr'},
  ]));
});
