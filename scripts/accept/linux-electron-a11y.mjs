#!/usr/bin/env node
// #228's acceptance through the confined service (docs/doperpowers/specs/2026-11-27-electron-a11y-preflight.md, §G's
// live tests 1 and 3, and two checks beside them): each scenario opens `cua serve` over MCP as a session does, runs
// cells in its `js` tool, and judges what the facade answers, with the applications outside the sandbox. Run inside
// linux-runtime-env.sh (a private display, never :0, a session bus and an accessibility bus of the run's own, fresh
// homes), after `cua install` of the CLI under test into CUA_HOME.
//
//   live1       Launched by cua (§G 1): with the session's IsEnabled and ScreenReaderEnabled off, `launch_app` of a
//               desktop entry that runs the Electron fixture; the first observation (getApp's) and the next getAXState
//               have `Fixture button`.
//   live3       Started by hand, off the bus (§G 3): the fixture started by this driver with both switches off and none
//               of the three variables; it is not on the bus, and each observation ends with the first sentence of
//               §E3, word for word, for the window's app.
//   screenshot  A picture asks nothing (§G 5 through the stack): the fixture started by hand with IsEnabled on, on the
//               bus and bare; the facade's own getScreenshot, bound over the session's own computer without getApp's
//               first read (so the picture is the first observation of the app), sends no GetAttributes and has its
//               image; the next getAXState sends one, to the fixture, and has the button.
//   gedit       gedit's observation is unchanged: one gedit, observed through the CLI under test, then through the base
//               CLI (--base-cli, with its own installed --base-home), then the CLI under test again; getApp's
//               observation and the next getAXState are equal byte for byte across the three, and none sends a request.
//
// The bus is watched as task 1's runner watches it (docs/evidence/2026-11-27-electron-a11y/t1-rule/): an unfiltered
// dbus-monitor of the accessibility bus, each observation between two markers, a GetAttributes this driver sends to the
// registry's own object, which no application receives. The second marker's arrival proves the monitor saw everything
// routed before it, so a count of zero is a count. Every expectation is a check; a scenario passes only when each of
// its checks did, and the driver exits 1 unless every scenario passed. A session whose open is refused (an engine below
// the minimum, named by CUA_LINUX_ENGINE_BIN) records the refusal and fails its scenario.
//
//   node scripts/accept/linux-electron-a11y.mjs --out <report.json> [--cli <bin/cua.mjs>] [--scenarios a,b,...]
//        [--base-cli <bin/cua.mjs> --base-home <CUA_HOME>] [--electron <path>]
import {spawn, spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline';
import {pinnedApprovals} from './lib.mjs';
import {parseRefusal} from './linux-runtime-cells.mjs';
import {openSession, resultText} from './mcp-session.mjs';

export const SCENARIOS = ['live1', 'live3', 'screenshot', 'gedit'];
export const FIXTURE_TITLE = 'cua Electron fixture';
export const BUTTON = 'Fixture button';
export const BRIDGE_VARS = ['ACCESSIBILITY_ENABLED', 'GNOME_ACCESSIBILITY', 'QT_ACCESSIBILITY'];
export const REGISTRY = 'org.a11y.atspi.Registry';
export const ROOT = '/org/a11y/atspi/accessible/root';
const REQUESTS = new Set(['GetAttributes', 'GetRelationSet']);
const HEADER = /^(method call|method return|error|signal) /;
const STRING = /^\s+string "(.*)"$/;

// §E3's first sentence, as the ticket states it, for the window's app: written out here, not taken from the facade, so
// the check holds the facade to the text.
export const offTheBusSentence = app => `No accessibility tree: ${app}, an Electron app by its window's role, is not on the accessibility bus, which it joins only as it starts; start it again with launch_app to get its elements.`;

/** One dbus-monitor line folded into `messages` (headers start a message; string arguments join the last one). */
export function foldMonitorLine(messages, line) {
  const header = HEADER.exec(line);
  if (header) {
    const fields = Object.fromEntries(line.slice(header[0].length).replaceAll(';', ' ').split(/\s+/).filter(part => part.includes('='))
      .map(part => [part.slice(0, part.indexOf('=')), part.slice(part.indexOf('=') + 1)]));
    messages.push({type: header[1], sender: fields.sender ?? null, destination: fields.destination ?? null, path: fields.path ?? null,
      interface: fields.interface ?? null, member: fields.member ?? null, args: []});
    return;
  }
  const arg = STRING.exec(line);
  if (arg && messages.length) messages.at(-1).args.push(arg[1]);
}

/** A marker: this driver's GetAttributes to the registry's own object, which no application receives. */
export const isMarker = m => m.type === 'method call' && m.member === 'GetAttributes' && m.destination === REGISTRY && m.path === ROOT;

/** What the bus routed between two markers: every request (GetAttributes, GetRelationSet) that is not a marker. */
export function requestsBetween(messages, start, end) {
  const calls = messages.slice(start + 1, end).filter(m => m.type === 'method call' && !isMarker(m));
  return calls.filter(m => REQUESTS.has(m.member)).map(({sender, destination, path, member}) => ({sender, destination, path, member}));
}

/**
 * The bus names in a registry GetChildren reply as gdbus prints it, `([(':1.5', objectpath '/org/...'), ...],)` (the
 * first element's path typed, the rest bare; an empty one is typed whole, `(@a(so) [],)`), or null for anything else: a
 * reply this cannot read is no listing.
 */
export function registryNames(text) {
  const reply = String(text).trim().replace(/^\(@a\(so\) \[\],\)$/, '([],)');
  if (!/^\(\[.*\],\)$/s.test(reply)) return null;
  const entries = [...reply.matchAll(/\('([^']+)', (?:objectpath )?'\/[^']*'\)/g)];
  const listed = reply.slice(2, -3).trim();
  if (listed !== '' && entries.length !== listed.split('), (').length) return null;
  return entries.map(match => match[1]);
}

/** The `uint32 N` of a gdbus reply, or null. */
export const uintOf = text => { const m = /uint32 (\d+)/.exec(String(text)); return m ? Number(m[1]) : null; };

/** The boolean of a gdbus property reply, `(<true>,)`, or null. */
export const boolOf = text => (/<true>/.test(String(text)) ? true : /<false>/.test(String(text)) ? false : null);

// -- the run's bus

const gdbus = args => {
  const r = spawnSync('gdbus', ['call', ...args], {encoding: 'utf8', timeout: 10_000});
  return {ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim()};
};
const sessionCall = (method, ...args) => gdbus(['--session', '--dest', 'org.a11y.Bus', '--object-path', '/org/a11y/bus', '--method', method, ...args]);
export const a11yAddress = () => /'([^']+)'/.exec(sessionCall('org.a11y.Bus.GetAddress').out)?.[1] ?? null;
const status = name => boolOf(sessionCall('org.freedesktop.DBus.Properties.Get', 'org.a11y.Status', name).out);
export const switches = () => ({IsEnabled: status('IsEnabled'), ScreenReaderEnabled: status('ScreenReaderEnabled')});
function setSwitches(isEnabled) {
  // ScreenReaderEnabled off first: the launcher turns IsEnabled on with it, never off.
  sessionCall('org.freedesktop.DBus.Properties.Set', 'org.a11y.Status', 'ScreenReaderEnabled', '<false>');
  sessionCall('org.freedesktop.DBus.Properties.Set', 'org.a11y.Status', 'IsEnabled', isEnabled ? '<true>' : '<false>');
  return switches();
}

/**
 * The applications on the accessibility bus, [{bus, pid}], read from the registry (no request reaches an application),
 * or null when the listing or any application's process could not be read: then nothing is known about who is on it.
 */
function registry(address) {
  const kids = gdbus(['--address', address, '--dest', REGISTRY, '--object-path', ROOT, '--method', 'org.a11y.atspi.Accessible.GetChildren']);
  const names = kids.ok ? registryNames(kids.out) : null;
  if (names === null) return null;
  const apps = names.map(bus => ({bus, pid: uintOf(gdbus(['--address', address, '--dest', 'org.freedesktop.DBus', '--object-path', '/org/freedesktop/DBus',
    '--method', 'org.freedesktop.DBus.GetConnectionUnixProcessID', bus]).out)}));
  return apps.every(app => Number.isInteger(app.pid)) ? apps : null;
}
// The registry's reply as gdbus printed it, for the record.
const registryReply = address => gdbus(['--address', address, '--dest', REGISTRY, '--object-path', ROOT, '--method', 'org.a11y.atspi.Accessible.GetChildren']).out;
// Whether `pid` is on the bus by a listing that was read whole: true, false, or null (unknown).
const listedPid = (apps, pid) => (apps === null || !Number.isInteger(pid) ? null : apps.some(a => a.pid === pid));
// Whether a request went to `pid`'s application by such a listing.
const sentTo = (apps, request, pid) => apps !== null && Number.isInteger(pid) && apps.some(a => a.bus === request.destination && a.pid === pid);

/** The monitor of the run's accessibility bus, and its markers. */
async function monitor(address) {
  const child = spawn('dbus-monitor', ['--address', address, '--monitor'], {stdio: ['ignore', 'pipe', 'ignore'], detached: true});
  const messages = [];
  createInterface({input: child.stdout}).on('line', line => foldMonitorLine(messages, line));
  const markers = () => messages.reduce((list, m, index) => (isMarker(m) ? [...list, index] : list), []);
  const send = () => spawnSync('dbus-send', [`--address=${address}`, '--print-reply', `--dest=${REGISTRY}`, ROOT, 'org.a11y.atspi.Accessible.GetAttributes'], {timeout: 5000});
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // Up when a marker sent after its start is seen.
  let up = false;
  for (let i = 0; i < 50 && !up; i++) { send(); await sleep(200); up = markers().length > 0; }
  if (!up) { child.kill(); throw new Error('dbus-monitor saw no marker within 10 s'); }
  return {
    messages,
    async mark() {
      const before = markers().length;
      send();
      for (let i = 0; i < 500; i++) { const now = markers(); if (now.length > before) return now[before]; await sleep(20); }
      throw new Error('the monitor did not see a marker within 10 s');
    },
    stop() { try { process.kill(-child.pid, 'SIGTERM'); } catch {} },
  };
}

// -- the driver

function parseArgs(argv) {
  const value = name => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const scenarios = (value('--scenarios') ?? SCENARIOS.join(',')).split(',');
  for (const s of scenarios) if (!SCENARIOS.includes(s)) throw new Error(`unknown scenario ${s}`);
  const out = value('--out');
  if (!out) throw new Error('--out <report.json> is required');
  return {out: resolve(out), scenarios, cli: resolve(value('--cli') ?? new URL('../../bin/cua.mjs', import.meta.url).pathname),
    baseCli: value('--base-cli') && resolve(value('--base-cli')), baseHome: value('--base-home') && resolve(value('--base-home')),
    electron: value('--electron') ?? process.env.CUA_T5_ELECTRON};
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const lastJson = text => { const m = /\{"t5":.*\}$/m.exec(text); return m ? JSON.parse(m[0]).t5 : null; };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixture = join(dirname(args.cli), '..', 'scripts', 'native-matrix', 'fixtures', 'electron');
  const report = {driver: 'linux-electron-a11y', cli: args.cli, home: process.env.CUA_HOME ?? null, baseCli: args.baseCli ?? null, baseHome: args.baseHome ?? null,
    override: process.env.CUA_LINUX_ENGINE_BIN ?? null, display: process.env.DISPLAY ?? null, electron: args.electron ?? null, scenarios: []};
  const preconditions = [];
  if (!/^:\d+/.test(process.env.DISPLAY ?? '') || /^:0(\.\d+)?$/.test(process.env.DISPLAY)) preconditions.push(`the display ${JSON.stringify(process.env.DISPLAY)} is not a private one`);
  for (const name of BRIDGE_VARS) if (process.env[name] !== undefined) preconditions.push(`${name} is set in the driver's environment`);
  if (process.env.CUA_SHIM_SANDBOX !== undefined) preconditions.push('CUA_SHIM_SANDBOX is set: the service must run confined');
  if (!args.electron) preconditions.push('no Electron: --electron or CUA_T5_ELECTRON');
  const address = a11yAddress();
  if (!address) preconditions.push('the session has no accessibility bus');
  report.preconditions = preconditions;
  if (preconditions.length) { report.status = 'FAIL'; return finish(args, report); }
  report.a11yBus = address;
  const watch = await monitor(address);
  const scratch = mkdtempSync(join(process.env.XDG_RUNTIME_DIR ?? '/tmp', 't5-'));
  const started = [];
  const applications = join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'applications');
  // A process this driver started, or that a launch started for it: its command line names this run's scratch.
  const ours = () => readdirSync('/proc').filter(n => /^\d+$/.test(n)).filter(pid => {
    try { return readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(scratch); } catch { return false; }
  }).map(Number);
  const stopOurs = async () => {
    for (const pid of ours()) try { process.kill(pid, 'SIGTERM'); } catch {}
    for (let i = 0; i < 50 && ours().length; i++) await sleep(100);
    for (const pid of ours()) try { process.kill(pid, 'SIGKILL'); } catch {}
  };
  const fixtureArgv = label => [args.electron, fixture, `--cua-fixture-user-data=${join(scratch, label)}`];
  const spawnApp = (argv, {env = process.env} = {}) => {
    const child = spawn(argv[0], argv.slice(1), {detached: true, stdio: 'ignore', env, cwd: scratch});
    started.push(child);
    return child;
  };
  const appEnv = () => { const env = {...process.env}; for (const name of BRIDGE_VARS) delete env[name]; return env; };
  const NO_NETWORK = ['unshare', '--user', '--net', `--map-user=${process.getuid()}`, `--map-group=${process.getgid()}`, '--'];

  // One session of `cli` (and its home), its approvals the `pinned` apps alone. -> {session, open} where open is null or
  // the refusal; the first cell warms the bootstrap so later cells carry only what they emit.
  async function sessionOf({cli = args.cli, home = process.env.CUA_HOME, pinned, label}) {
    const asked = [];
    const session = openSession({args: [cli, 'serve'], env: {...process.env, CUA_HOME: home, CUA_SHIM_PERSIST: 'session'}, clientName: `cua-t5-${label}`,
      onServerRequest: pinnedApprovals(() => pinned, asked)});
    const init = await Promise.race([session.initialize().then(() => ({ok: true}), error => ({ok: false, error: error.message})),
      session.exited.then(exit => ({ok: false, exit}))]);
    if (!init.ok) {
      const exit = await Promise.race([session.exited, sleep(15_000).then(() => null)]);
      const drained = await session.drainStreams({budgetMs: 3000});
      await session.terminate();
      return {session: null, asked, refused: {exit, drained, stderr: session.stderr, refusal: parseRefusal(session.stderr), initialize: init}};
    }
    const warm = await session.js('await cua.listWindows({emit: false}); nodeRepl.write("warm");', 60_000);
    return {session, asked, warm: !warm.result?.isError};
  }
  // One cell between two markers: the tool's text, its images, and the requests the bus routed meanwhile.
  async function observed(session, code, timeoutMs = 60_000) {
    const start = await watch.mark();
    const reply = await session.js(code, timeoutMs);
    const end = await watch.mark();
    const text = resultText(reply);
    return {error: reply.result?.isError === true || reply.timedOut === true, text, images: (reply.result?.content ?? []).filter(c => c.type === 'image').length,
      requests: requestsBetween(watch.messages, start, end), value: lastJson(text)};
  }
  const findWindow = (session, match) => session.js(`const deadline = Date.now() + 30000; let win;
    while (!win && Date.now() < deadline) { win = (await cua.listWindows({emit: false})).find(w => ${match}); if (!win) await new Promise(r => setTimeout(r, 250)); }
    if (!win) throw new Error('the window did not appear');
    globalThis.t5Window = win; nodeRepl.write(JSON.stringify({t5: win}));`, 60_000).then(r => {
    // The engine's window names no process; the window's own _NET_WM_PID does, read from the run's X server.
    const win = lastJson(resultText(r));
    return win && {...win, pid: Number(/= (\d+)$/.exec(spawnSync('xprop', ['-id', String(win.id), '_NET_WM_PID'], {encoding: 'utf8'}).stdout.trim())?.[1]) || null};
  });
  const waitOnBus = async (pid, on, ms = 10_000) => {
    let seen = listedPid(registry(address), pid);
    for (let t = 0; t < ms && seen !== on; t += 200) { await sleep(200); seen = listedPid(registry(address), pid); }
    return seen;
  };
  // getApp's own read is the first observation (its emitted state is the cell's whole text); the next getAXState's
  // string is written back exactly.
  const GET_APP = 'globalThis.t5App = await cua.getApp({windowId: t5Window.id});';
  const AX = 'const s = await t5App.getAXState({emit: false, disableDiffing: true}); nodeRepl.write(JSON.stringify({t5: s}));';

  async function scenario(name, body) {
    const checks = [];
    const check = (what, ok, detail) => { checks.push({what, ok: !!ok, ...(detail === undefined ? {} : {detail})}); return !!ok; };
    const row = {scenario: name, checks};
    try { await body(check, row); } catch (error) { check('the scenario ran to its end', false, error.message); }
    finally { if (row.session) { row.end = (await row.session.call('end_task', {}, 15_000)).result?.structuredContent ?? null; row.exit = await row.session.terminate(); delete row.session; } await stopOurs(); }
    row.status = checks.length && checks.every(c => c.ok) ? 'PASS' : 'FAIL';
    report.scenarios.push(row);
  }
  const opened = (check, row, s) => {
    if (s.refused) row.refused = {exit: s.refused.exit, refusal: s.refused.refusal, initialize: s.refused.initialize, stderr: s.refused.stderr.split('\n').filter(Boolean).slice(-4)};
    row.session = s.session;
    return check('the session opened, its first cell answered', s.session && s.warm, s.refused ? row.refused : undefined);
  };

  try {
    if (args.scenarios.includes('live1')) await scenario('live1', async (check, row) => {
      row.switches = setSwitches(false);
      check('the session\'s IsEnabled and ScreenReaderEnabled are off before the launch', row.switches.IsEnabled === false && row.switches.ScreenReaderEnabled === false, row.switches);
      const id = `cua-t5-fixture-${randomBytes(4).toString('hex')}.desktop`;
      mkdirSync(applications, {recursive: true});
      writeFileSync(join(applications, id), `[Desktop Entry]\nType=Application\nName=cua T5 Electron fixture\nExec=${fixtureArgv('live1').join(' ')}\nTerminal=false\n`);
      row.entry = id;
      const pinned = new Set([id]);
      const s = await sessionOf({pinned, label: 'live1'});
      if (!opened(check, row, s)) return;
      const launched = await s.session.js(`await cua.computer.launch_app({app: ${JSON.stringify(id)}}); nodeRepl.write('launched');`, 60_000);
      check('launch_app answered', !launched.result?.isError, resultText(launched).slice(-300));
      const win = await findWindow(s.session, `w.title === ${JSON.stringify(FIXTURE_TITLE)}`);
      row.window = win;
      if (!check('the fixture\'s window appeared', win)) return;
      // The window's process is the fixture the entry ran (its command line names this run's scratch), in this PID
      // namespace: launch_app started it outside the sandbox.
      const namespace = pid => { try { return readlinkSync(`/proc/${pid}/ns/pid`); } catch { return null; } };
      check('the window\'s process is the launched fixture, outside the sandbox (this PID namespace)',
        ours().includes(win.pid) && namespace(win.pid) !== null && namespace(win.pid) === namespace(process.pid), {pid: win.pid, ours: ours()});
      pinned.add(win.app);
      const first = await observed(s.session, GET_APP);
      const next = await observed(s.session, AX);
      row.observations = [first, next];
      check(`the first observation (getApp's) has ${BUTTON}`, !first.error && first.text.includes(BUTTON), first.text.slice(0, 400));
      check(`the next getAXState has ${BUTTON}`, !next.error && typeof next.value === 'string' && next.value.includes(BUTTON));
      check('the first observation sent one GetAttributes, to the fixture\'s application (on the bus by the launch\'s variable)',
        first.requests.length === 1 && first.requests[0].member === 'GetAttributes' && sentTo(registry(address), first.requests[0], win.pid), first.requests);
      check('the next sent none: asked before', next.requests.length === 0, next.requests);
      row.switchesAfter = switches();
      check('IsEnabled and ScreenReaderEnabled are still off', row.switchesAfter.IsEnabled === false && row.switchesAfter.ScreenReaderEnabled === false, row.switchesAfter);
      rmSync(join(applications, id), {force: true});
    });

    if (args.scenarios.includes('live3')) await scenario('live3', async (check, row) => {
      row.switches = setSwitches(false);
      check('the session\'s IsEnabled and ScreenReaderEnabled are off before the start', row.switches.IsEnabled === false && row.switches.ScreenReaderEnabled === false, row.switches);
      const env = appEnv();
      check('the fixture\'s environment names none of the three variables', BRIDGE_VARS.every(n => env[n] === undefined));
      const app = spawnApp(fixtureArgv('live3'), {env});
      const pinned = new Set();
      const s = await sessionOf({pinned, label: 'live3'});
      if (!opened(check, row, s)) return;
      const win = await findWindow(s.session, `w.title === ${JSON.stringify(FIXTURE_TITLE)}`);
      row.window = win;
      if (!check('the fixture\'s window appeared', win)) return;
      check('the window is the process this driver started', win.pid === app.pid, {window: win.pid, started: app.pid});
      await sleep(1500);
      check('the fixture is not on the accessibility bus (a listing read whole)', (await waitOnBus(win.pid, false, 0)) === false, {listed: registry(address), reply: registryReply(address)});
      pinned.add(win.app);
      const first = await observed(s.session, GET_APP);
      const next = await observed(s.session, AX);
      row.observations = [first, next];
      const sentence = offTheBusSentence(win.app);
      row.sentence = sentence;
      check('the first observation (getApp\'s) ends with the sentence, word for word', !first.error && first.text.endsWith(`\n${sentence}`), first.text.slice(-400));
      check('the next getAXState ends with the sentence, word for word', !next.error && typeof next.value === 'string' && next.value.endsWith(`\n${sentence}`), typeof next.value === 'string' ? next.value.slice(-400) : next.text.slice(-400));
      check('no request was sent', first.requests.length === 0 && next.requests.length === 0, [...first.requests, ...next.requests]);
    });

    if (args.scenarios.includes('screenshot')) await scenario('screenshot', async (check, row) => {
      row.switches = setSwitches(true);
      check('the session\'s IsEnabled is on, ScreenReaderEnabled off', row.switches.IsEnabled === true && row.switches.ScreenReaderEnabled === false, row.switches);
      const app = spawnApp(fixtureArgv('screenshot'), {env: appEnv()});
      const pinned = new Set();
      const s = await sessionOf({pinned, label: 'screenshot'});
      if (!opened(check, row, s)) return;
      const win = await findWindow(s.session, `w.title === ${JSON.stringify(FIXTURE_TITLE)}`);
      row.window = win;
      if (!check('the fixture\'s window appeared', win)) return;
      check('the window is the process this driver started', win.pid === app.pid, {window: win.pid, started: app.pid});
      check('the fixture is on the accessibility bus', (await waitOnBus(win.pid, true)) === true, {listed: registry(address), reply: registryReply(address)});
      pinned.add(win.app);
      // The facade's own bind, over the session's own computer, as getApp makes it, without getApp's first read.
      const bind = pathToFileURL(join(dirname(args.cli), '..', 'src', 'cua-api', 'bind-linux-app.mjs')).href;
      const shot = await observed(s.session, `const {bind_linux_app} = await import(${JSON.stringify(bind)});
        globalThis.t5App = bind_linux_app(cua.computer, t5Window); await t5App.getScreenshot();`);
      const next = await observed(s.session, AX);
      row.observations = [shot, next];
      check('getScreenshot answered with its image', !shot.error && shot.images === 1, shot.text.slice(0, 300));
      check('getScreenshot sent no GetAttributes (nor GetRelationSet)', shot.requests.length === 0, shot.requests);
      check('the next getAXState sent one GetAttributes, to the fixture\'s application',
        next.requests.length === 1 && next.requests[0].member === 'GetAttributes' && sentTo(registry(address), next.requests[0], win.pid), next.requests);
      check(`the next getAXState has ${BUTTON}`, !next.error && typeof next.value === 'string' && next.value.includes(BUTTON), typeof next.value === 'string' ? next.value.slice(0, 300) : next.text.slice(0, 300));
    });

    if (args.scenarios.includes('gedit')) await scenario('gedit', async (check, row) => {
      if (!check('a base CLI and its home are named (--base-cli, --base-home)', args.baseCli && args.baseHome)) return;
      row.switches = setSwitches(true);
      const dir = join(scratch, 'gedit');
      mkdirSync(dir, {recursive: true});
      const file = join(dir, 't5-gedit.txt');
      writeFileSync(file, 'cua T5: gedit, observed through three sessions\n');
      spawnApp([...NO_NETWORK, 'gedit', '--standalone', file], {env: appEnv()});
      // gedit settles first (its status bar shows "Loading file" for a while after its window maps): a session of the
      // candidate reads its tree until two reads 500 ms apart are equal and the load is over, so the three passes
      // compare one state of gedit's. Not compared itself.
      {
        const pinned = new Set();
        const s = await sessionOf({pinned, label: 'gedit-settle'});
        const warm = {label: 'settle'};
        if (!opened(check, warm, s)) { delete warm.session; return; }
        try {
          const win = await findWindow(s.session, `(w.title ?? '').includes('t5-gedit.txt')`);
          if (!check('settle: gedit\'s window appeared', win)) return;
          pinned.add(win.app);
          const settled = await s.session.js(`globalThis.t5App = await cua.getApp({windowId: t5Window.id}); let last = null, reads = 0, steady = false;
            for (const deadline = Date.now() + 30000; Date.now() < deadline && !steady; reads++) {
              await new Promise(r => setTimeout(r, 500));
              const now = await t5App.getAXState({emit: false, disableDiffing: true});
              steady = now === last && !now.includes('Loading file'); last = now;
            }
            nodeRepl.write(JSON.stringify({t5: {reads, steady}}));`, 60_000);
          row.settle = lastJson(resultText(settled));
          if (!check('settle: gedit\'s tree held still for 500 ms with its file loaded', row.settle?.steady === true, row.settle)) return;
        } finally {
          await s.session.call('end_task', {}, 15_000);
          await s.session.terminate();
        }
      }
      const passes = [{label: 'candidate', cli: args.cli, home: process.env.CUA_HOME}, {label: 'base', cli: args.baseCli, home: args.baseHome},
        {label: 'candidate-again', cli: args.cli, home: process.env.CUA_HOME}];
      row.passes = [];
      for (const pass of passes) {
        const pinned = new Set();
        const s = await sessionOf({cli: pass.cli, home: pass.home, pinned, label: `gedit-${pass.label}`});
        const result = {label: pass.label, cli: pass.cli};
        row.passes.push(result);
        if (!opened(check, result, s)) { delete result.session; return; }
        try {
          const win = await findWindow(s.session, `(w.title ?? '').includes('t5-gedit.txt')`);
          result.window = win;
          if (!check(`${pass.label}: gedit's window appeared`, win)) return;
          pinned.add(win.app);
          result.observations = [await observed(s.session, GET_APP), await observed(s.session, AX)];
        } finally {
          await s.session.call('end_task', {}, 15_000);
          result.exit = await s.session.terminate();
          delete result.session;
        }
      }
      const [a, b, c] = row.passes.map(p => p.observations ?? []);
      for (const [i, what] of [[0, 'getApp\'s observation'], [1, 'the next getAXState']]) {
        check(`${what}: the candidate's equals the base's, byte for byte`, a[i] && b[i] && !a[i].error && !b[i].error && a[i].text === b[i].text);
        check(`${what}: the candidate's equals its own again, byte for byte`, a[i] && c[i] && !c[i].error && a[i].text === c[i].text);
      }
      check('gedit\'s tree is there (more than 50 lines)', a[1]?.value?.split('\n').length > 50, a[1]?.value?.split('\n').length);
      check('no request was sent in any pass', [a, b, c].flat().every(o => o.requests.length === 0), [a, b, c].flat().flatMap(o => o.requests));
    });
  } finally {
    watch.stop();
    await stopOurs();
    for (const child of started) try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    rmSync(scratch, {recursive: true, force: true});
  }
  report.status = report.scenarios.length === args.scenarios.length && report.scenarios.every(s => s.status === 'PASS') ? 'PASS' : 'FAIL';
  return finish(args, report);
}

function finish(args, report) {
  writeFileSync(args.out, `${JSON.stringify(report, null, 1)}\n`);
  for (const s of report.scenarios) console.log(`${s.status} ${s.scenario}${s.status === 'FAIL' ? `: ${s.checks.filter(c => !c.ok).map(c => c.what).join('; ')}` : ''}`);
  if (report.preconditions?.length) console.log(`FAIL preconditions: ${report.preconditions.join('; ')}`);
  console.log(`${report.status} ${args.out}`);
  // Exit now: a refused open leaves initialize's own timer pending, which would hold the process for its 120 s.
  process.exit(report.status === 'PASS' ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
