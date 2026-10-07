// `cua remote` and `cua agent run` as real processes against scratch homes; the served runtime is the fake upstream
// process (installed-home.mjs). Listeners bind 127.0.0.1 on ports the system picks, so nothing leaves the loopback
// interface. The relay path (connectRelay, `agent run --relay`) runs against fake relays (bare WebSocket servers) and
// the real relay (relay/server.mjs) in this process, over real WebSockets; those tests need the `ws` package and skip,
// saying so, in a checkout where `npm ci` was not run.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {createServer as createNetServer} from 'node:net';
import {join} from 'node:path';
import {REPO, scratch} from './fixtures/runtime-fixture.mjs';
import {fakeInstalledHome, installedHomeSupported} from './fixtures/installed-home.mjs';
import {inProcessConnections, tick} from './fixtures/mcp-harness.mjs';
import {connectRelay, runAgent} from '../src/remote/agent.mjs';
import {checkConsole} from '../src/remote/console.mjs';
import {credentialsOf, readDevice} from '../src/remote/device.mjs';
import {createMcpHttp} from '../src/mcp/http.mjs';

const ws = await import('ws').catch(() => null);
const relayServer = ws ? await import('../relay/server.mjs') : null;
const NEEDS_WS = ws ? false : 'needs the ws package: run npm ci';
const WITHOUT_WS = join(REPO, 'test', 'fixtures', 'without-ws.mjs');

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
// `ready` is what the agent prints once it serves: its listener by default, or the relay's hello (then `endpoint` is
// null unless it also listens).
async function startAgent(t, home, args = ['agent', 'run', '--http', '127.0.0.1:0'], env = {}, {node = [], ready = /listening on (http:\/\/\S+\/mcp)/} = {}) {
  const child = spawn(process.execPath, [...node, CLI, ...args], {env: {...process.env, CUA_HOME: home, ...AGENT_ENV, ...env}, stdio: ['ignore', 'pipe', 'pipe']});
  let stderr = '';
  const exit = new Promise(resolve => child.on('exit', (code, signal) => resolve({code, signal, stderr})));
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`the agent did not start listening; stderr: ${stderr}`)), 10_000);
    child.stderr.on('data', chunk => {
      stderr += chunk;
      const found = ready.exec(stderr);
      if (found) { clearTimeout(timer); resolve(/listening on (http:\/\/\S+\/mcp)/.exec(stderr)?.[1] ?? null); }
    });
    exit.then(() => { clearTimeout(timer); reject(new Error(`the agent exited; stderr: ${stderr}`)); });
  });
  return {child, endpoint, exit, stderr: () => stderr};
}

const post = (endpoint, credential, body, session) => fetch(endpoint, {method: 'POST', body: JSON.stringify(body), headers: {
  authorization: `Bearer ${credential}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream',
  ...(session ? {'mcp-session-id': session} : {}),
}});
// The JSON-RPC messages of an SSE body: unnamed events only (the priming event is named), comments left out.
const sseMessages = text => text.split('\n\n').filter(block => block && !block.startsWith(':') && !/^event: /m.test(block))
  .map(block => JSON.parse(block.split('\n').find(l => l.startsWith('data: ')).slice(6)));

test('remote enroll prints the client credential once; show, a refused re-enrol and a relay update never print it', t => {
  const home = emptyHome(t);
  const enrolled = enroll(home);
  assert.deepEqual(Object.keys(enrolled).sort(), ['clientCredential', 'deviceId', 'devicesEntry', 'ok', 'relayEndpoint', 'relayUrl']);
  assert.equal(enrolled.ok, true);
  assert.match(enrolled.clientCredential, /^[0-9a-f]{64}$/);
  assert.equal(enrolled.relayUrl, null);
  assert.equal(enrolled.relayEndpoint, null);
  const secret = JSON.parse(readFileSync(join(home, 'remote', 'device.json'), 'utf8')).secret;

  const outputs = [];
  const again = cua(['remote', 'enroll'], home);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /remote_already_enrolled/);
  outputs.push(again);
  for (const args of [['remote', 'show'], ['remote', 'show', '--json'], ['remote', 'enroll', '--relay', 'wss://relay.example/ws', '--json']]) {
    const r = cua(args, home, {HOME: home});
    assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
    assert.ok(r.stdout.includes(enrolled.devicesEntry) || r.stdout.includes(JSON.stringify(enrolled.devicesEntry).slice(1, -1)), args.join(' '));
    outputs.push(r);
  }
  const shown = JSON.parse(cua(['remote', 'show', '--json'], home).stdout);
  assert.deepEqual({...shown, enrolledAt: undefined}, {ok: true, deviceId: enrolled.deviceId, relayUrl: 'wss://relay.example/ws', relayEndpoint: `https://relay.example/d/${enrolled.deviceId}/mcp`, enrolledAt: undefined, devicesEntry: enrolled.devicesEntry});
  for (const r of outputs) for (const value of [enrolled.clientCredential, secret]) assert.ok(!(r.stdout + r.stderr).includes(value), 'no credential after the enrolment');

  const text = cua(['remote', 'enroll', '--rotate'], home);
  assert.equal(text.status, 0, text.stderr);
  const rotated = JSON.parse(readFileSync(join(home, 'remote', 'device.json'), 'utf8'));
  assert.notEqual(rotated.secret, secret);
  assert.match(text.stdout, /[0-9a-f]{64}/, 'a rotation shows the new client credential, once');
});

test('enroll and show suggest the client registration: on the relay\'s endpoint when one is enrolled, else on this Mac\'s address', t => {
  const home = emptyHome(t);
  const env = {HOME: emptyHome(t)};   // no launchd job here, so no install hint
  const lan = cua(['remote', 'enroll'], home, env);
  assert.equal(lan.status, 0, lan.stderr);
  const deviceId = readDevice(home).deviceId;
  assert.match(lan.stdout, /claude mcp add --transport http cua_repl http:\/\/<this Mac's address>:7801\/mcp --header "Authorization: Bearer [0-9a-f]{64}"/);
  assert.doesNotMatch(cua(['remote', 'show'], home, env).stdout, /claude mcp add/, 'show has no credential to suggest a LAN registration with');

  const endpoint = `https://relay.example:8443/d/${deviceId}/mcp`;
  const moved = cua(['remote', 'enroll', '--relay', 'wss://relay.example:8443/ws'], home, env);
  assert.equal(moved.status, 0, moved.stderr);
  assert.ok(moved.stdout.includes(`claude mcp add --transport http cua_repl ${endpoint} --header "Authorization: Bearer <client credential>"`), moved.stdout);
  assert.doesNotMatch(moved.stdout, /cua agent install/);
  const shown = cua(['remote', 'show'], home, env).stdout;
  assert.ok(shown.includes(`claude mcp add --transport http cua_repl ${endpoint} --header "Authorization: Bearer <client credential>"`), shown);
  const rotated = cua(['remote', 'enroll', '--rotate', '--json'], home, env);
  const {clientCredential, relayEndpoint} = JSON.parse(rotated.stdout);
  assert.equal(relayEndpoint, endpoint);
  const text = cua(['remote', 'enroll', '--rotate'], home, env).stdout;
  assert.match(text, new RegExp(`claude mcp add --transport http cua_repl ${endpoint.replace(/[.]/g, '\\.')} --header "Authorization: Bearer [0-9a-f]{64}"`));
  assert.doesNotMatch(text, /<this Mac's address>/);
  assert.ok(!text.includes(clientCredential), 'the earlier rotation\'s credential is not shown again');
});

test('enroll --relay says to run cua agent install when the installed job does not dial the relay; never otherwise', t => {
  const home = emptyHome(t);
  const userHome = emptyHome(t);
  const env = {HOME: userHome};
  enroll(home);
  // The installed job as this platform's service manager keeps it: a launchd plist on macOS, a systemd user unit on Linux.
  const linux = process.platform === 'linux';
  const dir = linux ? join(userHome, '.config', 'systemd', 'user') : join(userHome, 'Library', 'LaunchAgents');
  mkdirSync(dir, {recursive: true});
  const job = (...args) => (linux
    ? writeFileSync(join(dir, 'cua-agent.service'), `[Service]\nExecStart=${['/n', '/c', 'agent', 'run', ...args].join(' ')}\n`)
    : writeFileSync(join(dir, 'com.ssfskim.cua.agent.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>Label</key><string>com.ssfskim.cua.agent</string>
<key>ProgramArguments</key><array>${['/n', '/c', 'agent', 'run', ...args].map(a => `<string>${a}</string>`).join('')}</array></dict></plist>
`));
  job('--http', '127.0.0.1:7801');
  let r = cua(['remote', 'enroll', '--relay', 'wss://relay.example/ws'], home, env);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /the installed agent job does not dial the relay.*cua agent install/s);
  r = cua(['remote', 'enroll', '--relay', 'wss://other.example/ws', '--json'], home, env);
  assert.equal(JSON.parse(r.stdout).agentJobLacksRelay, true);
  job('--relay', '--http', '127.0.0.1:7801');
  r = cua(['remote', 'enroll', '--relay', 'wss://relay.example/ws', '--json'], home, env);
  assert.equal(JSON.parse(r.stdout).agentJobLacksRelay, undefined, 'a job that dials the relay follows the new URL by itself');
  assert.doesNotMatch(cua(['remote', 'enroll', '--relay', 'wss://relay.example/ws'], home, env).stdout, /cua agent install/);
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

test('agent run refuses without an enrolment, with --relay on a device enrolled without a relay, and with a bad address or limit', t => {
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

test('a running agent follows device.json: enroll --rotate refuses the old client credential at once and the new one passes', async t => {
  const home = emptyHome(t);
  const {clientCredential} = enroll(home);
  const agent = await startAgent(t, home);
  // A GET without a session header is 400 once the bearer passed, 401 before.
  const status = async credential => (await fetch(agent.endpoint, {headers: {authorization: `Bearer ${credential}`}})).status;
  assert.equal(await status(clientCredential), 400);
  const rotated = JSON.parse(cua(['remote', 'enroll', '--rotate', '--json'], home).stdout);
  assert.equal(await status(clientCredential), 401, 'the old credential is refused without a restart');
  assert.equal(await status(rotated.clientCredential), 400, 'the new one passes');
  assert.match(agent.stderr(), /device\.json changed/);
  for (const secret of [clientCredential, rotated.clientCredential]) assert.ok(!agent.stderr().includes(secret));
  agent.child.kill('SIGTERM');
  assert.equal((await agent.exit).code, 0);
});

test('a rotation ends every open session: a standing stream on the old credential is cut, its session gone', {skip: !installedHomeSupported}, async t => {
  const home = fakeInstalledHome(t);
  const {clientCredential} = enroll(home);
  const agent = await startAgent(t, home);
  const init = await post(agent.endpoint, clientCredential, INITIALIZE);
  const session = init.headers.get('mcp-session-id');
  await init.text();
  const get = await fetch(agent.endpoint, {headers: {authorization: `Bearer ${clientCredential}`, accept: 'text/event-stream', 'mcp-session-id': session}});
  assert.equal(get.status, 200);
  const standing = get.text();
  const rotated = JSON.parse(cua(['remote', 'enroll', '--rotate', '--json'], home).stdout);
  const after = await post(agent.endpoint, rotated.clientCredential, {jsonrpc: '2.0', id: 1, method: 'tools/list'}, session);
  assert.equal(after.status, 404, 'the session opened under the old credential is gone');
  await standing;
  assert.match(agent.stderr(), /client credential changed.*ending every open session/);
  await until(() => new RegExp(`session ${session}: closed \\(eof`).test(agent.stderr()), 'the session closed as eof');
  assert.deepEqual(readdirSync(join(home, 'run')), []);
  agent.child.kill('SIGTERM');
  assert.equal((await agent.exit).code, 0);
});

test('agent run --relay refuses a relay URL that is not wss: or loopback ws: (a hand-edited device.json)', t => {
  const home = emptyHome(t);
  enroll(home);
  const file = join(home, 'remote', 'device.json');
  writeFileSync(file, JSON.stringify({...JSON.parse(readFileSync(file, 'utf8')), relayUrl: 'ws://relay.example/ws'}), {mode: 0o600});
  const r = cua(['agent', 'run', '--relay'], home);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /invalid_relay_url/);
  assert.equal(existsSync(join(home, 'state', 'agent.lock')), false);
});

test('runAgent hands the HTTP handler the real console check on macOS unless CUA_AGENT_CONSOLE_CHECK=off, and none elsewhere', async t => {
  const home = emptyHome(t);
  enroll(home);
  const stop = new Error('captured');
  for (const [env, platform, expected] of [[{}, 'darwin', checkConsole], [{CUA_AGENT_CONSOLE_CHECK: 'on'}, 'darwin', checkConsole],
    [{CUA_AGENT_CONSOLE_CHECK: 'off'}, 'darwin', undefined], [{}, 'linux', undefined], [{CUA_AGENT_CONSOLE_CHECK: 'on'}, 'linux', undefined]]) {
    let options;
    await assert.rejects(runAgent({home, env, platform, http: '127.0.0.1:0', diagnostics: () => {},
      createHttp: given => { options = given; throw stop; }}), stop);
    assert.equal(options.console, expected, JSON.stringify({env, platform}));
  }
  assert.equal(existsSync(join(home, 'state', 'agent.lock')), false);
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
    assert.match(body, /^retry: 15000\nid: \d+-0\nevent: priming\ndata: \{\}\n\n/, 'the stream opens with its priming event');
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

// ---- the relay path ----

const DEVICE_CREDENTIAL = 'd'.repeat(64);
const sha256 = text => createHash('sha256').update(text).digest('hex');
const ACCEPT = 'application/json, text/event-stream';
const b64 = text => Buffer.from(text).toString('base64');
const unb64 = frames => Buffer.concat(frames.filter(f => f.t === 'data').map(f => Buffer.from(f.data, 'base64'))).toString('utf8');
// The reconnect delays the link logged, in ms.
const delaysIn = diagnostics => diagnostics.map(line => /retrying in ([\d.]+) s/.exec(line)?.[1]).filter(Boolean).map(s => Math.round(Number(s) * 1000));

async function until(predicate, label = 'condition', ms = 5000) {
  const deadline = Date.now() + ms;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await tick(5);
  }
}

// A fake relay: a bare WebSocket server on a loopback port the system picks. It records each connection (its upgrade
// request, its frames) and pings only when given `pingMs`; `onConnection` runs for each new socket.
async function fakeRelay(t, {pingMs, onConnection} = {}) {
  const server = new ws.WebSocketServer({host: '127.0.0.1', port: 0});
  await once(server, 'listening');
  const relay = {url: `ws://127.0.0.1:${server.address().port}/ws`, connections: []};
  server.on('connection', (socket, req) => {
    const c = {socket, req, frames: [], send: frame => socket.send(JSON.stringify(frame))};
    c.closed = new Promise(resolve => socket.on('close', code => resolve(code)));
    socket.on('message', data => c.frames.push(JSON.parse(data.toString())));
    if (pingMs) {
      const timer = setInterval(() => socket.ping(), pingMs);
      socket.on('close', () => clearInterval(timer));
    }
    relay.connections.push(c);
    onConnection?.(c);
  });
  t.after(() => new Promise(resolve => {
    for (const c of relay.connections) c.socket.terminate();
    server.close(() => resolve());
  }));
  return relay;
}

async function dial(t, url, options = {}) {
  const diagnostics = [];
  const link = await connectRelay({target: () => ({url, deviceCredential: DEVICE_CREDENTIAL, deviceId: 'dev'}), handle: () => {},
    diagnostics: line => diagnostics.push(line), minBackoffMs: 10, maxBackoffMs: 40, ...options});
  t.after(() => link.close());
  return {link, diagnostics};
}

test('connectRelay dials with the device credential, says hello first, and serves each whole request through the handler, streaming the answer', {skip: NEEDS_WS}, async t => {
  const relay = await fakeRelay(t);
  const seen = [];
  const handle = async (req, res) => {
    const chunks = [];
    for await (const chunk of req.body) chunks.push(chunk);
    const entry = {req, body: Buffer.concat(chunks).toString('utf8'), res, aborted: false};
    req.signal.addEventListener('abort', () => { entry.aborted = true; });
    seen.push(entry);
    if (entry.body === 'throw') throw new Error('handler failed');
    if (entry.body !== 'answer') return;   // 'hold': answered by the test
    res.writeHead(200, {'Content-Type': 'text/event-stream', 'Mcp-Session-Id': 's'});
    res.write('id: 1-0\nevent: priming\ndata: {}\n\n');
    res.write(Buffer.from('id: 1-1\ndata: "é"\n\n'));
    res.end();
  };
  const {diagnostics} = await dial(t, relay.url, {handle});
  await until(() => relay.connections[0]?.frames.length >= 1, 'hello');
  const c = relay.connections[0];
  assert.equal(c.req.headers.authorization, `Bearer ${DEVICE_CREDENTIAL}`);
  assert.deepEqual(c.frames[0], {t: 'hello', deviceId: 'dev'});
  const request = (ch, body, extra = {}) => {
    c.send({ch, t: 'open', method: 'POST', path: '/mcp', headers: {authorization: 'Bearer client', 'content-type': 'application/json', ...extra}});
    for (const part of body.match(/.{1,3}/g)) c.send({ch, t: 'body', data: b64(part)});
  };

  request(1, 'answer', {'mcp-session-id': 's'});
  await tick(30);
  assert.equal(seen.length, 0, 'the handler sees a request only once its body is whole');
  c.send({ch: 1, t: 'end'});
  await until(() => c.frames.some(f => f.ch === 1 && f.t === 'end'), 'channel 1 answered');
  assert.equal(seen[0].req.method, 'POST');
  assert.equal(seen[0].req.url, '/mcp');
  assert.deepEqual(seen[0].req.headers, {authorization: 'Bearer client', 'content-type': 'application/json', 'mcp-session-id': 's'});
  const answer = c.frames.filter(f => f.ch === 1);
  assert.deepEqual(answer[0], {ch: 1, t: 'head', status: 200, headers: {'Content-Type': 'text/event-stream', 'Mcp-Session-Id': 's'}});
  assert.deepEqual(answer.slice(1).map(f => f.t), ['data', 'data', 'end'], 'each write is its own data frame');
  assert.equal(unb64(answer), 'id: 1-0\nevent: priming\ndata: {}\n\nid: 1-1\ndata: "é"\n\n');

  request(2, 'hold');
  c.send({ch: 2, t: 'end'});
  await until(() => seen.length === 2, 'the held request');
  c.send({ch: 2, t: 'abort'});
  await until(() => seen[1].aborted, 'the abort to fire the handler\'s signal');
  seen[1].res.writeHead(200, {});
  seen[1].res.end();
  request(3, 'throw');
  c.send({ch: 3, t: 'end'});
  await until(() => c.frames.some(f => f.ch === 3), 'channel 3');
  assert.deepEqual(c.frames.filter(f => f.ch === 3), [{ch: 3, t: 'abort'}], 'a handler that fails aborts its channel');
  assert.deepEqual(c.frames.filter(f => f.ch === 2), [], 'nothing is sent for an aborted channel');

  c.send({ch: 77, t: 'body', data: 'AA=='});
  c.send({ch: 78, t: 'end'});
  c.socket.send('not json');
  await until(() => diagnostics.filter(line => /unknown channel|not a frame/.test(line)).length >= 3, 'the dropped frames logged');
  request(4, 'answer');
  c.send({ch: 4, t: 'end'});
  await until(() => c.frames.some(f => f.ch === 4 && f.t === 'end'), 'channel 4 answered after the dropped frames');
  for (const line of diagnostics) assert.ok(!line.includes(DEVICE_CREDENTIAL), 'the device credential never reaches the log');
});

for (const [code, reason] of [[4001, 'replaced'], [4003, 'wrong device']]) {
  test(`a lost link aborts its open channels and reconnects; close code ${code} stops it for good`, {skip: NEEDS_WS}, async t => {
    const relay = await fakeRelay(t);
    let held = null;
    const {link, diagnostics} = await dial(t, relay.url, {handle: req => { held = req; }});
    await until(() => relay.connections[0]?.frames.length, 'hello');
    relay.connections[0].send({ch: 1, t: 'open', method: 'GET', path: '/mcp', headers: {}});
    relay.connections[0].send({ch: 1, t: 'end'});
    await until(() => held, 'the request');
    relay.connections[0].socket.terminate();
    await until(() => held.signal.aborted, 'the open channel aborted with the link');
    await until(() => relay.connections[1]?.frames.length, 'a second connection');
    assert.deepEqual(relay.connections[1].frames[0], {t: 'hello', deviceId: 'dev'});
    await until(() => diagnostics.some(line => /reconnected/.test(line)), 'the reconnect line');

    relay.connections[1].socket.close(code, reason);
    assert.deepEqual(await link.stopped, {code, reason});
    await tick(150);
    assert.equal(relay.connections.length, 2, `no reconnect after ${code}`);
    assert.ok(diagnostics.some(line => line.includes(String(code)) && /not reconnecting|stopping/.test(line)), diagnostics.join('\n'));
  });
}

test('reconnect delays double from the first to the ceiling, and start over after each connection', {skip: NEEDS_WS}, async t => {
  const probe = createNetServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const {port} = probe.address();
  await new Promise(resolve => probe.close(resolve));
  const refused = await dial(t, `ws://127.0.0.1:${port}/ws`);
  await until(() => delaysIn(refused.diagnostics).length >= 5, 'five retries');
  assert.deepEqual(delaysIn(refused.diagnostics).slice(0, 5), [10, 20, 40, 40, 40]);
  await refused.link.close();

  const flapping = await fakeRelay(t, {onConnection: c => c.socket.close(1011, 'flap')});
  const reset = await dial(t, flapping.url);
  await until(() => flapping.connections.length >= 4, 'four connections');
  assert.deepEqual([...new Set(delaysIn(reset.diagnostics))], [10], 'each connection resets the delay');
});

test('the watchdog closes a link that hears no ping for watchdogMs and reconnects; a pinged link stays', {skip: NEEDS_WS}, async t => {
  const silent = await fakeRelay(t);
  const {diagnostics} = await dial(t, silent.url, {watchdogMs: 60});
  await until(() => silent.connections.length >= 2, 'a reconnect after the watchdog');
  assert.ok(diagnostics.some(line => /no ping/.test(line)), diagnostics.join('\n'));
  const pinging = await fakeRelay(t, {pingMs: 15});
  await dial(t, pinging.url, {watchdogMs: 60});
  await tick(300);
  assert.equal(pinging.connections.length, 1);
});

test('the link dials the target as it reads at each dial, redials at once when a ping or a refresh finds its URL changed, and waits while there is none', {skip: NEEDS_WS}, async t => {
  const a = await fakeRelay(t, {pingMs: 20});
  const b = await fakeRelay(t);
  let target = {url: a.url, deviceCredential: DEVICE_CREDENTIAL, deviceId: 'dev'};
  const diagnostics = [];
  const link = await connectRelay({target: () => target, handle: () => {}, diagnostics: line => diagnostics.push(line), minBackoffMs: 10, maxBackoffMs: 40});
  t.after(() => link.close());
  await until(() => a.connections[0]?.frames.length, 'hello on the first relay');

  target = {url: b.url, deviceCredential: 'e'.repeat(64), deviceId: 'dev2'};
  await until(() => b.connections[0]?.frames.length, 'a ping found the new URL and the link redialled');
  assert.equal(b.connections[0].req.headers.authorization, `Bearer ${'e'.repeat(64)}`, 'with the credential as it reads now');
  assert.deepEqual(b.connections[0].frames[0], {t: 'hello', deviceId: 'dev2'});
  await a.connections[0].closed;
  assert.ok(diagnostics.some(line => line.includes(b.url) && /changed/.test(line)), diagnostics.join('\n'));

  target = {...target, deviceCredential: 'f'.repeat(64)};
  link.refresh();
  await tick(60);
  assert.equal(b.connections.length, 1, 'a new credential alone does not redial: the relay may not know it yet');

  target = null;
  link.refresh();
  await b.connections[0].closed;
  await until(() => diagnostics.filter(line => /no relay/.test(line)).length >= 2, 'it keeps checking');
  target = {url: a.url, deviceCredential: DEVICE_CREDENTIAL, deviceId: 'dev'};
  await until(() => a.connections[1]?.frames.length, 'dialled once a relay URL is back');
  link.refresh();
  await tick(60);
  assert.equal(a.connections.length, 2, 'an unchanged URL is left alone');
});

test('a dial the WebSocket constructor would refuse (a URL with a fragment, an unsendable credential) is logged and retried, never thrown', {skip: NEEDS_WS}, async t => {
  const relay = await fakeRelay(t);
  const good = {url: relay.url, deviceCredential: DEVICE_CREDENTIAL, deviceId: 'dev'};
  let target = {...good, url: `${relay.url}#x`};
  const diagnostics = [];
  const link = await connectRelay({target: () => target, handle: () => {}, diagnostics: line => diagnostics.push(line), minBackoffMs: 10, maxBackoffMs: 20});
  t.after(() => link.close());
  await until(() => diagnostics.filter(line => /fragment|invalid_relay_url|must be wss/.test(line)).length >= 2, 'a fragment URL refused and retried at startup');

  target = good;
  await until(() => relay.connections[0]?.frames.length, 'connected once the URL is good');
  target = {...good, url: `${relay.url}#y`};
  link.refresh();
  await relay.connections[0].closed;
  await until(() => diagnostics.filter(line => /#y/.test(line) && /retrying/.test(line)).length >= 2, 'a switch to a fragment URL is logged and retried, not thrown');

  target = {...good, url: relay.url.replace('/ws', '/other'), deviceCredential: 'bad\ncredential'};
  link.refresh();
  await until(() => diagnostics.filter(line => /could not dial/.test(line) && /retrying/.test(line)).length >= 2, 'a constructor failure is logged and retried');
  assert.equal(relay.connections.length, 1);
  target = good;
  await until(() => relay.connections[1]?.frames.length, 'connected again once the target is good');
});

test('repeated refreshes before the old socket closes log the URL change and terminate the socket once', {skip: NEEDS_WS}, async t => {
  const a = await fakeRelay(t);
  const b = await fakeRelay(t);
  let target = {url: a.url, deviceCredential: DEVICE_CREDENTIAL, deviceId: 'dev'};
  const diagnostics = [];
  const link = await connectRelay({target: () => target, handle: () => {}, diagnostics: line => diagnostics.push(line), minBackoffMs: 10, maxBackoffMs: 40});
  t.after(() => link.close());
  await until(() => a.connections[0]?.frames.length, 'hello');
  target = {...target, url: b.url};
  for (let i = 0; i < 5; i++) link.refresh();
  await until(() => b.connections[0]?.frames.length, 'hello on the new relay');
  assert.equal(diagnostics.filter(line => /relay URL changed/.test(line)).length, 1, diagnostics.join('\n'));
  assert.equal(b.connections.length, 1);
});

// The real relay in this process, in front of the real HTTP handler over in-process connections.
async function relayed(t, {client = 'c'.repeat(64), handlerCredential = client, streamGraceMs} = {}) {
  const s = scratch();
  t.after(s.cleanup);
  const devicesFile = join(s.dir, 'devices.json');
  writeFileSync(devicesFile, JSON.stringify({dev: {deviceCredentialSha256: sha256(DEVICE_CREDENTIAL), clientCredentialSha256: sha256(client)}}));
  const relayLog = [];
  const start = port => relayServer.startRelay({port, devicesFile, diagnostics: line => relayLog.push(line)});
  const env = {relay: await start(0), relayLog};
  t.after(() => env.relay.close());
  const port = env.relay.port;
  env.restart = async () => {
    await env.relay.close();
    env.relay = await start(port);
  };
  env.online = (n = 1) => until(() => relayLog.filter(line => line === 'device dev online').length >= n, 'the device online');
  const open = inProcessConnections();
  const http = createMcpHttp({home: '/nowhere', env: {}, clientCredential: handlerCredential, open, diagnostics: () => {},
    ...(streamGraceMs === undefined ? {} : {streamGraceMs})});
  t.after(() => http.close('eof'));
  const {link, diagnostics} = await dial(t, `ws://127.0.0.1:${port}/ws`, {handle: http.handle, minBackoffMs: 20});
  await env.online();
  const endpoint = `http://127.0.0.1:${port}/d/dev/mcp`;
  env.request = (body, {session, method = 'POST', headers = {}, signal} = {}) => fetch(endpoint, {method, signal, ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    headers: {authorization: `Bearer ${client}`, 'content-type': 'application/json', accept: ACCEPT, ...(session ? {'mcp-session-id': session} : {}), ...headers}});
  return Object.assign(env, {open, http, link, diagnostics, endpoint});
}

const sseOf = text => text.split('\n\n').filter(block => block && !block.startsWith(':')).map(block => {
  const event = {};
  for (const line of block.split('\n')) event[line.slice(0, line.indexOf(': '))] = line.slice(line.indexOf(': ') + 2);
  return {id: event.id, message: event.data && event.event !== 'priming' ? JSON.parse(event.data) : null};
});
const INIT = {jsonrpc: '2.0', id: 0, method: 'initialize', params: {protocolVersion: '2025-03-26', capabilities: {}, clientInfo: {name: 'test', version: '0'}}};
const js = (id, code) => ({jsonrpc: '2.0', id, method: 'tools/call', params: {name: 'js', arguments: {code}}});

test('the relay forwards the client\'s authorization unchanged and the handler checks it again', {skip: NEEDS_WS}, async t => {
  const env = await relayed(t, {client: 'a'.repeat(64), handlerCredential: 'b'.repeat(64)});
  const res = await env.request(INIT);
  assert.equal(res.status, 401, 'the relay let the bearer through; the agent\'s handler refused it');
  assert.match((await res.json()).error.message, /^cua: unauthorized/);
  assert.equal(env.http.sessions.size, 0);
});

test('a client that goes away mid-stream through the relay gets the answer on a Last-Event-ID resume', {skip: NEEDS_WS}, async t => {
  // A 1 ms grace: an answer that went onto a stream the handler still thought attached would be gone by the resume, so
  // only the relay's abort reaching the handler (the stream dropped with the call pending) keeps it.
  const env = await relayed(t, {streamGraceMs: 1});
  const init = await env.request(INIT);
  const session = init.headers.get('mcp-session-id');
  await init.text();
  const controller = new AbortController();
  const res = await env.request(js(1, 'long'), {session, signal: controller.signal});
  const reader = res.body.getReader();
  let seen = '';
  while (!/id: \d+-0\n/.test(seen)) seen += Buffer.from((await reader.read()).value).toString('utf8');
  const priming = /id: (\d+-0)\n/.exec(seen)[1];
  const upstream = env.open.opened[0].upstream;
  const call = await upstream.next(m => m.method === 'tools/call' && m.params?.arguments?.code === 'long', {timeoutMs: 5000});
  controller.abort();
  await tick(50);
  upstream.text(call, 'kept');
  await tick(20);
  const resumed = await env.request(undefined, {session, method: 'GET', headers: {'last-event-id': priming}, signal: AbortSignal.timeout(3000)});
  assert.equal(resumed.status, 200);
  const events = sseOf(await resumed.text()).filter(e => e.message);
  assert.deepEqual(events.map(e => [e.id, e.message.id]), [[priming.replace(/-0$/, '-1'), 1]]);
  assert.match(events[0].message.result.content[0].text, /kept/);
});

test('a request body over the limit is answered 413 by the agent\'s adapter without reaching the handler', {skip: NEEDS_WS}, async t => {
  const relay = await fakeRelay(t);
  let handled = 0;
  await dial(t, relay.url, {handle: () => { handled++; }, bodyLimit: 10});
  await until(() => relay.connections[0]?.frames.length, 'hello');
  const c = relay.connections[0];
  c.send({ch: 1, t: 'open', method: 'POST', path: '/mcp', headers: {}});
  for (const part of ['0123456', '789ab', 'cdef']) c.send({ch: 1, t: 'body', data: b64(part)});
  c.send({ch: 1, t: 'end'});
  await until(() => c.frames.some(f => f.ch === 1 && f.t === 'end'), 'the refusal');
  const answer = c.frames.filter(f => f.ch === 1);
  assert.equal(answer[0].status, 413);
  assert.equal(JSON.parse(unb64(answer)).error.code, -32000);
  assert.deepEqual(answer.map(f => f.t), ['head', 'data', 'end'], 'answered once, the later body ignored');
  assert.equal(handled, 0);
});

test('through the relay: concurrent calls on their own streams; across a relay restart the session survives, an in-flight js answer is replayed on Last-Event-ID and a server message queued meanwhile arrives on that stream', {skip: NEEDS_WS}, async t => {
  const env = await relayed(t);
  const init = await env.request(INIT);
  assert.equal(init.status, 200);
  const session = init.headers.get('mcp-session-id');
  assert.equal((await init.json()).result.serverInfo.name, 'rmcp');
  assert.equal((await env.request({jsonrpc: '2.0', method: 'notifications/initialized'}, {session})).status, 202);
  const upstream = env.open.opened[0].upstream;
  const callOf = code => upstream.next(m => m.method === 'tools/call' && m.params?.arguments?.code === code, {label: `js ${code}`, timeoutMs: 5000});

  // A js call and a tools/list at once, answered in the opposite order: each answer lands on its own request.
  const [a, b] = [env.request(js(1, 'a'), {session}), env.request({jsonrpc: '2.0', id: 2, method: 'tools/list'}, {session})];
  const callA = await callOf('a');
  upstream.reply(await upstream.nextRequest('tools/list', {timeoutMs: 5000}), {tools: []});
  const listed = sseOf(await (await b).text()).filter(e => e.message);
  assert.deepEqual(listed.map(e => [e.message.id, Array.isArray(e.message.result.tools)]), [[2, true]]);
  upstream.text(callA, 'answer a');
  const answered = sseOf(await (await a).text()).filter(e => e.message);
  assert.deepEqual(answered.map(e => e.message.id), [1]);
  assert.match(answered[0].message.result.content[0].text, /answer a/);

  const inFlight = await env.request(js(3, 'long'), {session});
  assert.equal(inFlight.headers.get('content-type'), 'text/event-stream');
  const reader = inFlight.body.getReader();
  let seen = '';
  while (!/id: \d+-0\n/.test(seen)) seen += Buffer.from((await reader.read()).value).toString('utf8');
  const priming = /id: (\d+-0)\n/.exec(seen)[1];
  const call = await callOf('long');
  await env.restart();
  let cut = null;
  try { while (!(await reader.read()).done); } catch (error) { cut = error; }
  assert.ok(cut, 'the client saw its stream cut, not ended');
  await env.online();
  await until(() => env.diagnostics.some(line => /reconnected/.test(line)), 'the agent\'s reconnect line');
  assert.ok(env.http.sessions.has(session), 'the session lives in the agent, not in the relay');

  upstream.emit({jsonrpc: '2.0', method: 'notifications/message', params: {level: 'info', data: 'queued'}});
  upstream.text(call, 'cell finished');
  await tick(20);
  const resumed = await env.request(undefined, {session, method: 'GET', headers: {'last-event-id': priming}});
  assert.equal(resumed.status, 200);
  const events = sseOf(await resumed.text()).filter(e => e.message);
  assert.deepEqual(events.map(e => e.message.id ?? e.message.method), [3, 'notifications/message'], 'the replayed answer, then the queued message');
  assert.match(events[0].message.result.content[0].text, /cell finished/);

  const next = env.request(js(4, 'next'), {session});
  upstream.text(await callOf('next'), 'same session');
  const after = sseOf(await (await next).text()).filter(e => e.message);
  assert.match(after[0].message.result.content[0].text, /same session/);
});

// ---- runAgent with the relay ----

// Enrols `home`, starts the real relay with its devices.json line, and points the enrolment at it.
async function enrolledAgainstRelay(t, home) {
  const {clientCredential, devicesEntry, deviceId} = enroll(home);
  const s = scratch();
  t.after(s.cleanup);
  const devicesFile = join(s.dir, 'devices.json');
  writeFileSync(devicesFile, `{${devicesEntry}}`);
  const relayLog = [];
  const relay = await relayServer.startRelay({port: 0, devicesFile, diagnostics: line => relayLog.push(line)});
  t.after(() => relay.close());
  const update = cua(['remote', 'enroll', '--relay', `ws://127.0.0.1:${relay.port}/ws`], home);
  assert.equal(update.status, 0, update.stderr);
  return {clientCredential, deviceId, relay, relayLog, endpoint: `http://127.0.0.1:${relay.port}/d/${deviceId}/mcp`};
}

test('agent run --http --relay serves both; a newer connection for the device (4001) makes it close every session and exit 0', {skip: !installedHomeSupported ? 'needs the fake installed home (macOS arm64)' : NEEDS_WS}, async t => {
  const home = fakeInstalledHome(t);
  const {clientCredential, deviceId, endpoint, relayLog} = await enrolledAgainstRelay(t, home);
  const agent = await startAgent(t, home, ['agent', 'run', '--http', '127.0.0.1:0', '--relay'], {}, {ready: /relay: connected/});
  assert.match(agent.endpoint, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/, 'it also listens');
  await until(() => relayLog.includes(`device ${deviceId} online`), 'the device online');

  const viaRelay = await post(endpoint, clientCredential, INITIALIZE);
  assert.equal(viaRelay.status, 200);
  const session = viaRelay.headers.get('mcp-session-id');
  const listed = await post(endpoint, clientCredential, {jsonrpc: '2.0', id: 1, method: 'tools/list'}, session);
  assert.ok(sseMessages(await listed.text())[0].result.tools.some(tool => tool.name === 'js'), 'tools/list answered through the relay');
  const del = await fetch(endpoint, {method: 'DELETE', headers: {authorization: `Bearer ${clientCredential}`, 'mcp-session-id': session}});
  assert.equal(del.status, 200);
  assert.deepEqual(readdirSync(join(home, 'run')), []);
  const viaListener = await post(agent.endpoint, clientCredential, INITIALIZE);
  assert.equal(viaListener.status, 200, 'the LAN listener serves too');
  const open = viaListener.headers.get('mcp-session-id');
  await viaListener.text();

  // Another holder of this device's credential connects: the relay keeps the newer, the agent stops for good.
  const {deviceCredential} = credentialsOf(readDevice(home));
  const usurper = new ws.WebSocket(endpoint.replace(/^http/, 'ws').replace(/\/d\/.*$/, '/ws'), {headers: {authorization: `Bearer ${deviceCredential}`}});
  t.after(() => usurper.terminate());
  await once(usurper, 'open');
  usurper.send(JSON.stringify({t: 'hello', deviceId}));
  const {code, signal, stderr} = await agent.exit;
  assert.deepEqual({code, signal}, {code: 0, signal: null}, stderr);
  assert.match(stderr, /4001/);
  assert.match(stderr, new RegExp(`session ${open}: closed`));
  assert.equal((stderr.match(/relay: connected/g) ?? []).length, 1, 'it never reconnected');
  assert.deepEqual(readdirSync(join(home, 'run')), []);
  assert.equal(existsSync(join(home, 'state', 'agent.lock')), false);
  for (const secret of [clientCredential, deviceCredential]) assert.ok(!stderr.includes(secret), 'no credential in the agent log');
});

test('agent run --relay redials when enroll --relay moves the device to another relay, without a restart', {skip: NEEDS_WS}, async t => {
  const home = emptyHome(t);
  const {deviceId} = enroll(home);
  const first = await fakeRelay(t, {pingMs: 30});
  const second = await fakeRelay(t);
  assert.equal(cua(['remote', 'enroll', '--relay', first.url], home).status, 0);
  const agent = await startAgent(t, home, ['agent', 'run', '--relay'], {}, {ready: /relay: connected/});
  await until(() => first.connections[0]?.frames.length, 'hello on the first relay');
  assert.equal(cua(['remote', 'enroll', '--relay', second.url], home).status, 0);
  await until(() => second.connections[0]?.frames.length, 'hello on the second relay');
  assert.deepEqual(second.connections[0].frames[0], {t: 'hello', deviceId});
  await first.connections[0].closed;
  agent.child.kill('SIGTERM');
  assert.equal((await agent.exit).code, 0);
});

test('a refusal on one path leaves nothing of the other started: a taken --http address never dials the relay', {skip: NEEDS_WS}, async t => {
  const home = emptyHome(t);
  enroll(home);
  const relay = await fakeRelay(t);
  assert.equal(cua(['remote', 'enroll', '--relay', relay.url], home).status, 0);
  const taken = createNetServer();
  await new Promise(resolve => taken.listen(0, '127.0.0.1', resolve));
  t.after(() => taken.close());
  const r = cua(['agent', 'run', '--relay', '--http', `127.0.0.1:${taken.address().port}`], home);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /http_listen_failed/);
  await tick(100);
  assert.equal(relay.connections.length, 0, 'the relay was never dialled');
  assert.doesNotMatch(r.stderr, /relay: dialling/);
  assert.equal(existsSync(join(home, 'state', 'agent.lock')), false);
});

test('without the ws package: --relay refuses before anything starts, while --http and every other command never load it', async t => {
  const home = emptyHome(t);
  enroll(home);
  assert.equal(cua(['remote', 'enroll', '--relay', 'ws://127.0.0.1:9/ws'], home).status, 0);
  const node = ['--import', WITHOUT_WS];
  for (const args of [['agent', 'run', '--relay'], ['agent', 'run', '--http', '127.0.0.1:0', '--relay']]) {
    const r = spawnSync(process.execPath, [...node, CLI, ...args], {env: {...process.env, CUA_HOME: home, ...AGENT_ENV}, encoding: 'utf8', timeout: 30_000});
    assert.equal(r.status, 1, `${args.join(' ')}: ${r.stderr}`);
    assert.match(r.stderr, /relay_unavailable/);
    assert.match(r.stderr, /npm ci/);
    assert.doesNotMatch(r.stderr, /listening on/, 'the listener never started');
  }
  for (const args of [['agent', 'run', '--http', '127.0.0.1:0'], ['serve', '--http', '127.0.0.1:0']]) {
    const agent = await startAgent(t, home, args, {}, {node});
    agent.child.kill('SIGTERM');
    assert.equal((await agent.exit).code, 0, args.join(' '));
  }
  assert.equal(existsSync(join(home, 'state', 'agent.lock')), false);
});

test('a failure while stopping after a refusal is logged and does not replace the refusal', async t => {
  const home = emptyHome(t);
  enroll(home);
  const taken = createNetServer();
  await new Promise(resolve => taken.listen(0, '127.0.0.1', resolve));
  t.after(() => taken.close());
  const diagnostics = [];
  await assert.rejects(runAgent({home, env: AGENT_ENV, http: `127.0.0.1:${taken.address().port}`, diagnostics: line => diagnostics.push(line),
    createHttp: () => ({handle: () => {}, close: async () => { throw new Error('close broke'); }})}), error => error.code === 'http_listen_failed');
  assert.ok(diagnostics.some(line => /close broke/.test(line)), diagnostics.join('\n'));
  assert.equal(existsSync(join(home, 'state', 'agent.lock')), false);
});
