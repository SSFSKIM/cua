// `cua remote` and `cua agent run --http` as real processes against scratch homes; the served runtime is the fake
// upstream process (installed-home.mjs). The listener binds 127.0.0.1 on a port the system picks, so nothing leaves
// the loopback interface.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {REPO, scratch} from './fixtures/runtime-fixture.mjs';
import {fakeInstalledHome, installedHomeSupported} from './fixtures/installed-home.mjs';

const CLI = join(REPO, 'bin', 'cua.mjs');
// The agents here never read the real console (CUA_AGENT_CONSOLE_CHECK=off): js must run whatever the test Mac's screen
// shows. The console refusal itself is tested in mcp-http.test.mjs and remote-console.test.mjs.
const AGENT_ENV = {CUA_SHIM_SECRETS: 'off', CUA_AGENT_CONSOLE_CHECK: 'off'};
const cua = (args, home, env = {}) => spawnSync(process.execPath, [CLI, ...args], {env: {...process.env, CUA_HOME: home, ...AGENT_ENV, ...env}, encoding: 'utf8', timeout: 30_000});
const INITIALIZE = {jsonrpc: '2.0', id: 0, method: 'initialize', params: {protocolVersion: '2025-03-26', capabilities: {}, clientInfo: {name: 'test', version: '0'}}};

function emptyHome(t) {
  const s = scratch();
  t.after(s.cleanup);
  return s.dir;
}

function enroll(home) {
  const r = cua(['remote', 'enroll', '--json'], home);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

// Starts `cua <args>` and resolves once it is listening, with the endpoint it printed.
async function startAgent(t, home, args = ['agent', 'run', '--http', '127.0.0.1:0'], env = {}) {
  const child = spawn(process.execPath, [CLI, ...args], {env: {...process.env, CUA_HOME: home, ...AGENT_ENV, ...env}, stdio: ['ignore', 'pipe', 'pipe']});
  let stderr = '';
  const exit = new Promise(resolve => child.on('exit', (code, signal) => resolve({code, signal, stderr})));
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`the agent did not start listening; stderr: ${stderr}`)), 10_000);
    child.stderr.on('data', chunk => {
      stderr += chunk;
      const found = /listening on (http:\/\/\S+\/mcp)/.exec(stderr);
      if (found) { clearTimeout(timer); resolve(found[1]); }
    });
    exit.then(() => { clearTimeout(timer); reject(new Error(`the agent exited; stderr: ${stderr}`)); });
  });
  return {child, endpoint, exit, stderr: () => stderr};
}

const post = (endpoint, credential, body, session) => fetch(endpoint, {method: 'POST', body: JSON.stringify(body), headers: {
  authorization: `Bearer ${credential}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream',
  ...(session ? {'mcp-session-id': session} : {}),
}});
const sseData = text => text.split('\n\n').filter(Boolean).map(block => block.split('\n').find(l => l.startsWith('data: ')).slice(6));
const sseMessages = text => sseData(text).filter(Boolean).map(data => JSON.parse(data));

test('remote enroll prints the client credential once; show, a refused re-enrol and a relay update never print it', t => {
  const home = emptyHome(t);
  const enrolled = enroll(home);
  assert.deepEqual(Object.keys(enrolled).sort(), ['clientCredential', 'deviceId', 'devicesEntry', 'ok', 'relayUrl']);
  assert.equal(enrolled.ok, true);
  assert.match(enrolled.clientCredential, /^[0-9a-f]{64}$/);
  assert.equal(enrolled.relayUrl, null);
  const secret = JSON.parse(readFileSync(join(home, 'remote', 'device.json'), 'utf8')).secret;

  const outputs = [];
  const again = cua(['remote', 'enroll'], home);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /remote_already_enrolled/);
  outputs.push(again);
  for (const args of [['remote', 'show'], ['remote', 'show', '--json'], ['remote', 'enroll', '--relay', 'wss://relay.example/ws', '--json']]) {
    const r = cua(args, home);
    assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
    assert.ok(r.stdout.includes(enrolled.devicesEntry) || r.stdout.includes(JSON.stringify(enrolled.devicesEntry).slice(1, -1)), args.join(' '));
    outputs.push(r);
  }
  const shown = JSON.parse(cua(['remote', 'show', '--json'], home).stdout);
  assert.deepEqual({...shown, enrolledAt: undefined}, {ok: true, deviceId: enrolled.deviceId, relayUrl: 'wss://relay.example/ws', enrolledAt: undefined, devicesEntry: enrolled.devicesEntry});
  for (const r of outputs) for (const value of [enrolled.clientCredential, secret]) assert.ok(!(r.stdout + r.stderr).includes(value), 'no credential after the enrolment');

  const text = cua(['remote', 'enroll', '--rotate'], home);
  assert.equal(text.status, 0, text.stderr);
  const rotated = JSON.parse(readFileSync(join(home, 'remote', 'device.json'), 'utf8'));
  assert.notEqual(rotated.secret, secret);
  assert.match(text.stdout, /[0-9a-f]{64}/, 'a rotation shows the new client credential, once');
});

test('remote show before enrolment and agent run usage errors', t => {
  const home = emptyHome(t);
  const show = cua(['remote', 'show'], home);
  assert.equal(show.status, 1);
  assert.match(show.stderr, /remote_not_enrolled/);
  for (const args of [['remote'], ['remote', 'forget'], ['agent'], ['agent', 'start'], ['agent', 'install', '--relay'], ['agent', 'install', 'extra'], ['agent', 'uninstall', '--http', '127.0.0.1:7801'], ['agent', 'status', '--force'], ['agent', 'run'], ['agent', 'run', '--json', '--http', '127.0.0.1:0'], ['agent', 'run', '--http']]) {
    const r = cua(args, home);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`);
    assert.match(r.stderr, /usage: cua/);
  }
});

test('agent run refuses without an enrolment, with --relay before the relay exists, and with a bad address or limit', t => {
  const home = emptyHome(t);
  let r = cua(['agent', 'run', '--http', '127.0.0.1:0'], home);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /remote_not_enrolled/);
  assert.match(r.stderr, /cua remote enroll/);
  enroll(home);
  for (const [args, env, code] of [
    [['agent', 'run', '--relay'], {}, 'remote_no_relay'],
    [['agent', 'run', '--http', '127.0.0.1:0', '--relay'], {}, 'remote_no_relay'],
    [['agent', 'run', '--http', 'localhost'], {}, 'invalid_http_address'],
    [['agent', 'run', '--http', '127.0.0.1:99999'], {}, 'invalid_http_address'],
    [['agent', 'run', '--http', '127.0.0.1:0'], {CUA_AGENT_MAX_SESSIONS: '0'}, 'invalid_setting'],
    [['agent', 'run', '--http', '127.0.0.1:0'], {CUA_AGENT_IDLE_MINUTES: 'soon'}, 'invalid_setting'],
    [['agent', 'run', '--http', '127.0.0.1:0'], {CUA_SHIM_SURFACES: 'iab'}, 'invalid_setting'],
    [['agent', 'run', '--http', '127.0.0.1:0'], {CUA_AGENT_CONSOLE_CHECK: 'sometimes'}, 'invalid_setting'],
  ]) {
    r = cua(args, home, env);
    assert.equal(r.status, 1, `${args.join(' ')} ${JSON.stringify(env)}: ${r.stderr}`);
    assert.match(r.stderr, new RegExp(code), args.join(' '));
  }
  assert.equal(existsSync(join(home, 'state', 'agent.lock')), false, 'every refusal released the agent lock');
});

test('agent run --http serves sessions over HTTP; two sessions (cap 2) have their own run entries and both close on SIGTERM', {skip: !installedHomeSupported}, async t => {
  const home = fakeInstalledHome(t);
  const {clientCredential} = enroll(home);
  const agent = await startAgent(t, home, undefined, {CUA_AGENT_MAX_SESSIONS: '2'});
  assert.match(agent.endpoint, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);

  const unauthorized = await fetch(agent.endpoint, {method: 'POST', body: JSON.stringify(INITIALIZE), headers: {'content-type': 'application/json'}});
  assert.equal(unauthorized.status, 401);

  const sessions = [];
  for (let i = 0; i < 2; i++) {
    const init = await post(agent.endpoint, clientCredential, INITIALIZE);
    assert.equal(init.status, 200);
    assert.equal(init.headers.get('content-type'), 'application/json');
    assert.equal((await init.json()).result.serverInfo.name, 'fake-upstream');
    sessions.push(init.headers.get('mcp-session-id'));
  }
  assert.notEqual(sessions[0], sessions[1]);
  for (const session of sessions) {
    const js = await post(agent.endpoint, clientCredential, {jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'js', arguments: {code: 'hello'}}}, session);
    assert.equal(js.status, 200);
    assert.equal(js.headers.get('content-type'), 'text/event-stream');
    const body = await js.text();
    assert.match(body, /^retry: 15000\nid: \d+-0\ndata: \n\n/, 'the stream opens with its priming event');
    const [reply] = sseMessages(body);
    assert.equal(JSON.parse(reply.result.content[0].text).turn.session_id, session, 'Mcp-Session-Id is the connection\'s session id');
  }
  const entries = readdirSync(join(home, 'run')).sort();
  assert.deepEqual(entries, [...sessions.flatMap(s => [s, `${s}.pid`])].sort(), 'each session has its own run entries');
  const third = await post(agent.endpoint, clientCredential, INITIALIZE);
  assert.equal(third.status, 503, 'both sessions have a task open, so neither is Idle');

  for (const args of [['agent', 'run', '--http', '127.0.0.1:0'], ['serve', '--http', '127.0.0.1:0'], ['agent', 'run', '--relay']]) {
    const second = cua(args, home);
    assert.equal(second.status, 1, args.join(' '));
    assert.match(second.stderr, new RegExp(`agent_already_running|process ${agent.child.pid}`), args.join(' '));
    assert.match(second.stderr, new RegExp(`${agent.child.pid}`));
  }

  agent.child.kill('SIGTERM');
  const {code, signal, stderr} = await agent.exit;
  assert.deepEqual({code, signal}, {code: 0, signal: null}, stderr);
  for (const session of sessions) assert.match(stderr, new RegExp(`session ${session}: closed \\(signal`));
  assert.deepEqual(readdirSync(join(home, 'run')), []);
  assert.equal(existsSync(join(home, 'state', 'agent.lock')), false);
});

test('a lock left by an agent that is gone is broken; a session id answers 404 after DELETE', {skip: !installedHomeSupported}, async t => {
  const home = fakeInstalledHome(t);
  const {clientCredential} = enroll(home);
  const gone = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], {encoding: 'utf8'});
  mkdirSync(join(home, 'state'), {recursive: true});
  writeFileSync(join(home, 'state', 'agent.lock'), `${JSON.stringify({pid: Number(gone.stdout), token: 'stale'})}\n`);
  const agent = await startAgent(t, home, ['serve', '--http', '127.0.0.1:0']);
  assert.equal(JSON.parse(readFileSync(join(home, 'state', 'agent.lock'), 'utf8')).pid, agent.child.pid);
  const init = await post(agent.endpoint, clientCredential, INITIALIZE);
  const session = init.headers.get('mcp-session-id');
  const del = await fetch(agent.endpoint, {method: 'DELETE', headers: {authorization: `Bearer ${clientCredential}`, 'mcp-session-id': session}});
  assert.equal(del.status, 200);
  assert.deepEqual(readdirSync(join(home, 'run')), []);
  const after = await post(agent.endpoint, clientCredential, {jsonrpc: '2.0', id: 1, method: 'tools/list'}, session);
  assert.equal(after.status, 404);
  agent.child.kill('SIGINT');
  assert.equal((await agent.exit).code, 0);
});
