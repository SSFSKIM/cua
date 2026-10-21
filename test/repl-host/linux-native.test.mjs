// The Linux native route on cua's own REPL host (#116 M4; docs/doperpowers/specs/2026-10-14-own-repl-host-design.md,
// "M4 — Make the Linux native route real", acceptance 5 and 6's native substitution): a Linux computer-only or
// combined session that explicitly selects cua runs the trusted sky wrapper (src/services/sky.mjs) and the vendor's Sky
// service in the owned trusted worker, which starts sky_linux as its own stdio child. Everything below the vendor is a
// double (test/fixtures/linux-native-runtime.mjs), so this runs on any machine with Node 24 (CUA_NODE); the launch is
// the production one (buildLaunch on the Linux pin, the sandbox the proxy derives for Linux (scoped, through a double of
// the pinned helper, #115 M3), the proxy's anchored process
// group, its lazy runtime and idle stop), and so are the supervisor, kernel, worker, the owned facade the production
// banner imports, and the wrapper (on a machine that is not Linux, with its platform pinned to linux:
// test/fixtures/linux-sky-service.mjs). Secrets are synthetic, in a scratch store; nothing records a value.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {PassThrough} from 'node:stream';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BROWSER_SERVICE, SKY_SERVICE, buildLaunch, createLaunchDirs} from '../../src/runtime/launch.mjs';
import {sandboxModeFrom, sandboxState} from '../../src/runtime/sandbox.mjs';
import {spawnUpstream} from '../../src/mcp/upstream.mjs';
import {createServer} from '../../src/mcp/server.mjs';
import {handshakeRecords, lazyRuntime} from '../../src/mcp/lazy-runtime.mjs';
import {REPL_HOST_META_KEY, REPL_HOST_NAME, REPL_HOST_VERSION, hostIdentity} from '../../src/repl-host/identity.mjs';
import {TRUSTED_WORKER} from '../../src/repl-host/supervisor.mjs';
import {kernelNode} from './kernel-harness.mjs';
import {alive, descendants, texts} from './supervisor-harness.mjs';
import {linuxNativeRuntime, sha256} from '../fixtures/linux-native-runtime.mjs';
import {pinnedApprovals} from '../../scripts/accept/lib.mjs';

const {node, skip} = kernelNode();
const own = {skip};
const LINUX_SKY = process.platform === 'linux' ? SKY_SERVICE : fileURLToPath(new URL('../fixtures/linux-sky-service.mjs', import.meta.url));
const DESKTOP = {DISPLAY: ':0', XAUTHORITY: '/home/u/.Xauthority', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus', XDG_RUNTIME_DIR: '/run/user/1000'};
const SENTINEL = 'synthetic-Sentinel-7f3a';
const DEADLINE_MS = 20_000;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const pgidOf = pid => Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(pid)], {encoding: 'utf8'}).trim());
const caught = code => `try { ${code} nodeRepl.write("resolved"); } catch (e) { nodeRepl.write(e.message); }`;

// The app of the fixture's windows (test/fixtures/linux-native-runtime.mjs), the one approval the sessions accept.
const GEDIT = 'org.gnome.gedit';

// A connection for a Linux session on `surfaces`, CUA_REPL_HOST=cua -> the driver: {call, js, stop, terminate, worker(),
// fixture, launch, asked}. cua's proxy (src/mcp/server.mjs createServer) stands in front of the lazy runtime, as `cua
// serve` puts it: it stamps the sandbox state the proxy derives for Linux and these surfaces (sandboxModeFrom with
// CUA_SHIM_SANDBOX unset), adds `_meta.persist: "session"` to accepted approvals and keeps the connection's approval
// memory (#117 M3). Its idle timer is the test's: `stop()` fires it, so the runtime goes through the connection's own
// idle stop, and resolves that stop's teardown. The client offers form elicitation, accepts the approval of the
// fixture's app and declines anything else, recording each request it is asked in `asked`.
async function linuxSession(t, {surfaces, secrets = {}}) {
  const fixture = linuxNativeRuntime(t, {node, secrets});
  const ambient = {HOME: fixture.home, USER: 'u', TMPDIR: process.env.TMPDIR, LANG: 'C.UTF-8', CUA_REPL_HOST: 'cua', ...DESKTOP};
  const services = {...(surfaces.includes('computer') ? {sky: LINUX_SKY} : {}), ...(surfaces.includes('browser') ? {browser: BROWSER_SERVICE} : {})};
  const launch = buildLaunch({runtime: fixture.runtime, home: fixture.home, sessionId: 'linux-native-1', surfaces, services, secretsDir: fixture.secretsDir, ambient, resolveOwnNode: () => node});
  // The pinned wrapper fixture imports the production module: its directory is trusted as it is when that is registered.
  if (services.sky && LINUX_SKY !== SKY_SERVICE) launch.env.CUA_REPL_TRUSTED_CODE_PATHS += `:${dirname(SKY_SERVICE)}`;
  // The helper double stands where `cua install` places the pinned helper; the launch names it as the pinned one.
  assert.equal(launch.env.CUA_REPL_SANDBOX_HELPER.startsWith(join(fixture.home, 'sandbox')), true);
  launch.env.CUA_REPL_SANDBOX_HELPER_SHA256 = fixture.helperSha;
  createLaunchDirs(launch);
  let current = null;
  const upstream = lazyRuntime({start: async () => (current = spawnUpstream(launch, {stderr: 'ignore'})),
    records: handshakeRecords({dir: join(fixture.home, 'state', 'handshake'), surfaces, host: hostIdentity({host: 'cua', release: fixture.runtime.release})})});
  const teardowns = [];
  const stopRuntime = upstream.stop;
  upstream.stop = options => { const teardown = stopRuntime(options); teardowns.push(teardown); return teardown; };
  let idle = null;
  const input = new PassThrough();
  const output = new PassThrough();
  const server = createServer({input, output, upstream, sessionId: 'linux-native-1', surfaces, platform: 'linux', persist: 'session',
    sandboxState: sandboxState(sandboxModeFrom({}), launch.cwd), runtimeIdleMs: 60_000, idleTimer: fn => { idle = fn; return () => { if (idle === fn) idle = null; }; },
    completionDeadlineMs: 5000, teardownBudgetMs: 5000, diagnostics: () => {}});
  const pending = new Map();
  const asked = [];
  const answer = pinnedApprovals(() => [GEDIT], asked);
  const send = msg => input.write(JSON.stringify({jsonrpc: '2.0', ...msg}) + '\n');
  createInterface({input: output}).on('line', line => {
    const msg = JSON.parse(line);
    if (msg.method === 'elicitation/create') return send({id: msg.id, result: answer(msg)});
    pending.get(msg.id)?.(msg);
    pending.delete(msg.id);
  });
  let id = 0;
  const request = (method, params) => new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(new Error(`no reply to ${method} within ${DEADLINE_MS} ms`)); }, DEADLINE_MS);
    pending.set(n, msg => { clearTimeout(timer); resolve(msg); });
    send({id: n, method, params});
  });
  t.after(async () => { await upstream.terminate({budgetMs: 5000}); input.end(); await server.closed; });
  const initialized = await request('initialize', {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'linux-native-test', version: '0'}});
  send({method: 'notifications/initialized', params: {}});
  const call = async (name, args = {}) => (await request('tools/call', {name, arguments: args})).result;
  const js = async (code, extra = {}) => call('js', {code, ...extra});
  // The connection's idle stop: the open task is completed, then the runtime torn down.
  async function stop() {
    for (let i = 0; i < 200 && !idle; i++) await delay(10);
    assert.ok(idle, 'the idle timer is armed once no call runs');
    const before = teardowns.length;
    idle();
    for (let i = 0; i < 500 && teardowns.length === before; i++) await delay(10);
    return teardowns.at(-1);
  }
  // The worker itself, not the helper (double) that launched it with the worker's command line after `--`.
  const worker = () => descendants(current.pid).filter(p => p.command.includes(TRUSTED_WORKER) && !p.command.includes('--permission-profile'));
  return {fixture, launch, initialized, call, js, worker, asked, group: () => current.pid, stop, terminate: () => upstream.terminate({budgetMs: 5000})};
}

const ok = result => { assert.equal(result.isError, false, JSON.stringify(result.content)); return result; };
// Both children went through the pinned helper (#115 M3: the Linux default is scoped, computer surface or not), each
// with its role's profile: the kernel with the deny list and no network, the worker with `worker`'s network.
function assertConfined(launched, {worker}) {
  const profiles = launched.map(argv => ({argv, profile: JSON.parse(argv[argv.indexOf('--permission-profile') + 1])}));
  const kernel = profiles.filter(l => l.argv.some(a => a.endsWith('/kernel.mjs')));
  const workers = profiles.filter(l => l.argv.some(a => a === TRUSTED_WORKER));
  assert.equal(kernel.length, 1, 'the kernel went through the helper');
  assert.ok(workers.length >= 1, 'the trusted worker went through the helper');
  for (const {argv} of profiles) assert.deepEqual(argv.slice(0, 4), ['--sandbox-policy-cwd', argv[1], '--command-cwd', argv[1]]);
  assert.equal(kernel[0].profile.network, 'restricted');
  assert.ok(kernel[0].profile.file_system.entries.some(e => e.access === 'none'), 'the kernel denies its deny list');
  for (const w of workers) {
    assert.equal(w.profile.network, worker);
    assert.ok(!w.profile.file_system.entries.some(e => e.access === 'none'), 'the worker denies nothing');
  }
}

test('a Linux computer session on the own host drives sky_linux through the owned facade and trusted worker; the helper is the worker\'s stdio child in the owned group, outlives kernel ends and goes with the runtime', own, async t => {
  const session = await linuxSession(t, {surfaces: ['computer']});
  assert.deepEqual(session.initialized.result.serverInfo, {name: REPL_HOST_NAME, version: REPL_HOST_VERSION});
  const first = ok(await session.js(`const windows = await cua.listWindows({emit: false});
    const app = await cua.getApp({windowId: windows[0].id});
    await app.typeText('hello'); await app.pressKey('ctrl+a');
    nodeRepl.write(JSON.stringify({target: cua.computer.target, windows: windows.map(w => w.id), keys: Object.keys(cua).sort()}));`));
  assert.deepEqual(first._meta[REPL_HOST_META_KEY], {host: 'cua', version: REPL_HOST_VERSION});
  assert.deepEqual(JSON.parse(texts(first).at(-1)), {target: 'linux', windows: [7, 8],
    keys: ['computer', 'getApp', 'getState', 'initialize', 'listApps', 'listWindows', 'rewriteDocumentation']});
  // Each window method follows the approval's own list_windows (the app sky_linux names for that window id).
  assert.deepEqual(session.fixture.helperLog().map(({command, window, text}) => [command, window, text]), [
    ['list_windows', null, undefined], ['list_windows', null, undefined], ['list_windows', null, undefined], ['get_window_state', 7, undefined],
    ['list_windows', null, undefined], ['type_text', 7, sha256('hello')], ['list_windows', null, undefined], ['press_key', 7, undefined]]);
  assert.deepEqual(session.asked, [{method: 'elicitation/create', app: GEDIT, action: 'accept'}], 'one approval for the window\'s app; the host remembers it');
  assertConfined(session.fixture.launches(), {worker: 'enabled'});

  const [helper] = new Set(session.fixture.helperLog().map(entry => entry.pid));
  const [worker] = session.worker();
  assert.ok(worker, 'one trusted worker');
  const helperRow = descendants(session.group()).find(p => p.pid === helper);
  assert.equal(helperRow?.ppid, worker.pid, 'sky_linux is the trusted worker\'s own child');
  assert.equal(pgidOf(helper), session.group(), 'in the owned process group, not a session of its own');

  // A kernel's end reaps what it left in the owned group; the worker's tree, the helper in it, is not that.
  const timedOut = await session.js('for (;;) {}', {timeout_ms: 300});
  assert.match(texts(timedOut).join('\n'), /timed out/);
  assert.deepEqual(texts(await session.call('js_reset')), ['js kernel reset']);
  await delay(300);
  assert.equal(alive(helper), true, 'the helper survived the kernel\'s timeout and the reset');
  ok(await session.js('const again = await cua.getApp({windowId: 7}); await again.typeText("after");'));
  assert.equal(session.asked.length, 1, 'the approval outlives the kernel\'s timeout and the reset');
  assert.deepEqual([...new Set(session.fixture.helperLog().map(entry => entry.pid))], [helper], 'the same helper answered after the kernel was replaced');

  // The idle stop (lazy-runtime stop: the owned group's teardown) takes the worker and its helper; the next call starts
  // fresh ones.
  assert.equal((await session.stop()).confirmed, true, 'the group emptied, the helper with it');
  assert.equal(alive(helper), false);
  assert.equal(alive(worker.pid), false);
  ok(await session.js('const later = await cua.getApp({windowId: 7}); await later.pressKey("Return");'));
  const relaunched = session.fixture.helperLog().at(-1).pid;
  assert.notEqual(relaunched, helper, 'a fresh helper after the idle stop');
  assert.deepEqual(session.asked.map(entry => entry.app), [GEDIT], 'the approval outlives the kernel and the idle stop: the connection\'s, not the runtime\'s');
  assert.equal((await session.terminate()).confirmed, true, 'the connection\'s close empties the group too');
  assert.equal(alive(relaunched), false);
});

test('Linux native secret substitution: a whole-field reference in typeText and paste reaches sky_linux as the stored value and nowhere else; refusals come before input and errors carry labels only', own, async t => {
  const session = await linuxSession(t, {surfaces: ['computer'], secrets: {WORK_PASSWORD: SENTINEL}});
  ok(await session.js('const app = await cua.getApp({windowId: 7}); const failing = await cua.getApp({windowId: 8});'));
  const typed = () => session.fixture.helperLog().filter(entry => entry.command === 'type_text');
  const results = [];
  const run = async code => { const result = ok(await session.js(code)); results.push(result); return texts(result).at(-1); };

  assert.equal(await run(caught('await app.typeText("{{secret:WORK_PASSWORD}}"); await app.paste("{{secret:WORK_PASSWORD}}");')), 'resolved');
  assert.deepEqual(typed().map(({window, text}) => [window, text]), [[7, sha256(SENTINEL)], [7, sha256(SENTINEL)]], 'typeText and paste (sent as type_text) both substituted');

  assert.equal(await run(caught('await app.typeText("x {{secret:WORK_PASSWORD}}");')), 'resolved');
  assert.equal(typed().at(-1).text, sha256('x {{secret:WORK_PASSWORD}}'), 'a marker inside other text is typed as it is');

  const before = typed().length;
  assert.match(await run(caught('await app.typeText("{{secret:NOT_STORED}}");')), /^cua: no secret named "NOT_STORED" .*\[secret_not_found\]$/);
  assert.match(await run(caught('await app.typeText("{{secret:CUA_DEVICE_TOKEN}}");')), /\[secret_reserved\]$/);
  assert.match(await run(caught('await app.typeText("{{secret:bad label}}");')), /\[invalid_secret_label\]$/);
  assert.equal(await run(caught('await app.paste("{{secret:WORK_PASSWORD}}", {format: "html"});')), 'Linux paste supports only text format.');
  assert.equal(typed().length, before, 'nothing reached the helper for any refusal');

  const failed = await run(caught('await failing.typeText("{{secret:WORK_PASSWORD}}");'));
  assert.match(failed, /^cua: type_text with secret "WORK_PASSWORD" failed \(failed\) after the secret was read; .*\[secret_input_failed\]$/);
  assert.deepEqual([typed().at(-1).window, typed().at(-1).text], [8, sha256(SENTINEL)], 'the value was delivered, then the native error was withheld');
  assert.equal(await run(caught('await failing.typeText("plain");')), 'AT-SPI could not insert plain', 'an ordinary failure keeps the native error');

  assert.equal(JSON.stringify(results).includes(SENTINEL), false, 'no result carries the value');
  assert.deepEqual(session.asked.map(({app, action}) => [app, action]), [[GEDIT, 'accept']], 'both windows are the one app\'s: asked once');
});

test('a combined Linux session on the own host has both surfaces, the scoped default and the same helper; a browser-only one keeps the worker off the network', own, async t => {
  const combined = await linuxSession(t, {surfaces: ['computer', 'browser']});
  const result = ok(await combined.js(`const windows = await cua.listWindows({emit: false});
    nodeRepl.write(JSON.stringify({target: cua.computer.target, windows: windows.length, browsers: await cua.listBrowsers({emit: false}), agent: typeof agent.browsers.list}));`));
  assert.deepEqual(JSON.parse(texts(result).at(-1)), {target: 'linux', windows: 2, browsers: [], agent: 'function'});
  assert.equal(combined.launch.env.CUA_REPL_ENABLED_SURFACES, 'computer,browser');
  assertConfined(combined.fixture.launches(), {worker: 'enabled'});
  const [helper] = combined.fixture.helperLog().map(entry => entry.pid);
  assert.equal(descendants(combined.group()).find(p => p.pid === helper)?.ppid, combined.worker()[0].pid);
  assert.equal((await combined.terminate()).confirmed, true);
  assert.equal(alive(helper), false);

  const browserOnly = await linuxSession(t, {surfaces: ['browser']});
  ok(await browserOnly.js('nodeRepl.write(JSON.stringify(await cua.listBrowsers({emit: false})));'));
  assertConfined(browserOnly.fixture.launches(), {worker: 'restricted'});
  assert.equal(browserOnly.fixture.helperLog().length, 0, 'no computer-use helper without the computer surface');
  assert.equal('OAI_SKY_LINUX_BIN' in browserOnly.launch.env, false);
});
