#!/usr/bin/env node
// The Linux probes of #115 M0 (docs/doperpowers/specs/2026-10-17-own-sandbox-design.md, Plan of Work M0 "Linux
// probes"; Design "Linux computer sessions" (a) and (b), "Policy" for the nesting). Each runs a child under the original
// Linux helper invoked directly, as src/sandbox/linux.mjs will (`codex-linux-sandbox --sandbox-policy-cwd <cwd>
// --command-cwd <cwd> --permission-profile <JSON> -- <command>`, spawned in that cwd), with the helper placed where cua
// will place it (`$CUA_HOME/sandbox/<tag>/codex-linux-sandbox`), because it re-executes itself from there inside the
// sandbox. In M0 the helper is the vendor `codex` (codex-cli 0.159.2, arg0 dispatch by that name); M3 runs the same
// probes against its own build with --helper-source.
//
//   node scripts/sandbox-probe/linux-probes.mjs --home <scratch CUA_HOME with an installed runtime> --xshm <built
//       xshm-probe> --out <file.json> [--helper-source <path>] [--tag <dir name>] [--probes xshm,launch,nesting]
//
// It runs on the Linux box, in its X session (the session's DISPLAY, XAUTHORITY and bus are read from the session's
// window manager, scripts/repl-parity/desktop.mjs). Probes:
//   xshm     (a) the worker's shape (scoped filesystem, network enabled): xshm-probe.c outside and inside, and
//            sky_linux's get_screenshot outside and inside (where the file lands, and whether it lands at all).
//   launch   (b) the worker's shape: sky_linux's launch_app of an application outside and inside, and of the launched
//            process: its parent chain, whether it shares the probe's PID and mount namespaces, whether its root is
//            read-only, and whether it survives the end of the sky_linux that launched it. Two applications: the
//            desktop's gedit (D-Bus activatable) and a harness-owned desktop entry running zenity (plain Exec).
//   nesting  the kernel's shape: deny the whole CUA_HOME and a synthetic store directory, re-expose runtimes/, node/
//            and the helper's directory read-only, the launch's run directory and session temp writable (as specials,
//            and again with explicit write entries), run the check with the home's managed Node, and report each
//            read and write it attempted.
// Nothing it records is screen content or a secret: app ids, counts, booleans, errno codes, paths it created itself.
// It signals only processes it started, and a launched application only when that pid carries the launch's own marker
// (endLaunched); it removes what it created.
import {spawn, execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import * as fs from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {discoverDesktopEnvironment} from '../repl-parity/desktop.mjs';
import {homeLayout} from '../../src/runtime/layout.mjs';
import {locateRuntime} from '../../src/runtime/manifest.mjs';
import {managedNode} from '../../src/runtime/managed-node.mjs';

const FIXED_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
const HELPER_NAME = 'codex-linux-sandbox';
let OUTPUT_ROOT = '/tmp';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const special = kind => ({type: 'special', value: {kind}});
const entry = (path, access) => ({path: typeof path === 'string' ? {type: 'path', path} : path, access});
const profileOf = (entries, network) => ({type: 'managed', file_system: {type: 'restricted', entries}, network});

// The worker's shape for a Linux computer session (Design, "Linux computer sessions"): scoped, network enabled.
export function workerProfile() {
  return profileOf([entry(special('root'), 'read'), entry(special('project_roots'), 'write'), entry(special('tmpdir'), 'write')], 'enabled');
}
// The kernel's shape with the deny list (Design, "Policy"): the home and the store denied, the re-exposed paths read;
// `explicitWrites` adds the run directory and session temp again as explicit write entries.
export function kernelProfile({deny, reexposeRead, writes = [], explicitWrites = false}) {
  return profileOf([
    entry(special('root'), 'read'), entry(special('project_roots'), 'write'), entry(special('tmpdir'), 'write'),
    ...deny.map(path => entry(path, 'none')),
    ...reexposeRead.map(path => entry(path, 'read')),
    ...(explicitWrites ? writes.map(path => entry(path, 'write')) : []),
  ], 'restricted');
}
export function helperArgs({cwd, profile, command}) {
  return ['--sandbox-policy-cwd', cwd, '--command-cwd', cwd, '--permission-profile', JSON.stringify(profile), '--', ...command];
}

function sha256(path) { return createHash('sha256').update(fs.readFileSync(path)).digest('hex'); }
function tryText(file, args, env) {
  try { return execFileSync(file, args, {encoding: 'utf8', env: env ?? {PATH: FIXED_PATH}, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000}).trim(); }
  catch (error) { return `error: ${(error.stderr || error.message).toString().trim().split('\n')[0]}`; }
}
function readLink(path) { try { return fs.readlinkSync(path); } catch (error) { return `unreadable (${error.code})`; } }

// Run `command` under the helper (or directly when `profile` is null); resolves {code, signal, stdout, stderr}. The
// child's stdout and stderr are plain files, not the socketpairs Node's spawn makes for pipes: under a restricted
// network the helper's seccomp refuses the socket calls Node makes on a socket stdout, and the child's output then
// vanishes while it exits 0 (the reason cua's own host gives its children FIFOs).
function run({helper, profile, cwd, command, env, timeoutMs = 30000}) {
  const [file, args] = profile ? [helper, helperArgs({cwd, profile, command})] : [command[0], command.slice(1)];
  const outputs = fs.mkdtempSync(join(OUTPUT_ROOT, 'run-'));
  const [outFile, errFile] = [join(outputs, 'stdout'), join(outputs, 'stderr')];
  const [out, err] = [fs.openSync(outFile, 'w'), fs.openSync(errFile, 'w')];
  return new Promise(resolvePromise => {
    const child = spawn(file, args, {cwd, env, stdio: ['ignore', out, err], detached: true});
    fs.closeSync(out); fs.closeSync(err);
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } }, timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const stdout = fs.readFileSync(outFile, 'utf8').trim(), stderr = fs.readFileSync(errFile, 'utf8').trim().slice(-2000);
      fs.rmSync(outputs, {recursive: true, force: true});
      resolvePromise({code, signal, stdout, stderr});
    });
  });
}
const lastJson = text => { try { return JSON.parse(text.split('\n').filter(Boolean).at(-1)); } catch { return null; } };

// sky_linux's own wire (the vendor's sky_linux_transport.js): one JSON request per line, {id, command, input}; one
// response per line, {id, ok, output | error}.
function skyServer({helper, profile, cwd, sky, env}) {
  const [file, args] = profile ? [helper, helperArgs({cwd, profile, command: [sky, 'server']})] : [sky, ['server']];
  const child = spawn(file, args, {cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: true});
  let buffer = '', next = 0, stderr = '';
  const pending = new Map();
  const exited = new Promise(r => child.on('close', (code, signal) => {
    for (const [, settle] of pending) settle({ok: false, error: `sky_linux exited (${code ?? signal}): ${stderr.trim().slice(-500)}`});
    pending.clear();
    r({code, signal});
  }));
  child.stdout.on('data', d => {
    buffer += d;
    for (let i; (i = buffer.indexOf('\n')) >= 0;) {
      const line = buffer.slice(0, i).trim(); buffer = buffer.slice(i + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      pending.get(message.id)?.(message); pending.delete(message.id);
    }
  });
  child.stderr.on('data', d => { stderr += d; });
  const request = (command, input = {}, timeoutMs = 20000) => new Promise(r => {
    const id = ++next;
    const timer = setTimeout(() => { pending.delete(id); r({ok: false, error: `timeout after ${timeoutMs} ms`}); }, timeoutMs);
    pending.set(id, message => { clearTimeout(timer); r(message); });
    child.stdin.write(`${JSON.stringify({id, command, input})}\n`);
  });
  // End it as its worker would (stdin closed), signalling only the process itself if it lingers: what it launched is
  // left to its own fate, which is what the launch probe observes.
  const stop = async () => {
    child.stdin.end();
    const done = await Promise.race([exited, sleep(3000).then(() => null)]);
    if (!done) { try { child.kill('SIGTERM'); } catch { /* gone */ } await Promise.race([exited, sleep(3000)]); }
    if (child.exitCode === null && child.signalCode === null) { try { child.kill('SIGKILL'); } catch { /* gone */ } }
    return exited;
  };
  return {pid: child.pid, request, stop, stderr: () => stderr.trim().slice(-1000)};
}

function pidsNamed(name) {
  return fs.readdirSync('/proc').filter(p => /^\d+$/.test(p)).filter(p => {
    try { return fs.readFileSync(`/proc/${p}/comm`, 'utf8').trim() === name; } catch { return false; }
  }).map(Number);
}
function ancestry(pid) {
  const chain = [];
  for (let current = pid; current > 1 && chain.length < 12;) {
    let stat;
    try { stat = fs.readFileSync(`/proc/${current}/stat`, 'utf8'); } catch { chain.push({pid: current, comm: null}); break; }
    const close = stat.lastIndexOf(')');
    const comm = stat.slice(stat.indexOf('(') + 1, close);
    chain.push({pid: current, comm});
    current = Number(stat.slice(close + 2).split(' ')[1]);
  }
  return chain;
}
function rootMount(pid) {
  try {
    const line = fs.readFileSync(`/proc/${pid}/mountinfo`, 'utf8').split('\n').find(l => l.split(' ')[4] === '/');
    return line ? {options: line.split(' ')[5]} : {options: null};
  } catch (error) { return {options: `unreadable (${error.code})`}; }
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

async function xshmProbe({helper, home, xshm, sky, env, session}) {
  const result = {};
  result.xshmOutside = lastJson((await run({command: [xshm], cwd: session.cwd, env})).stdout);
  const inside = await run({helper, profile: workerProfile(), command: [xshm], cwd: session.cwd, env});
  result.xshmInside = lastJson(inside.stdout) ?? {launch: inside};
  for (const [label, profile] of [['skyScreenshotOutside', null], ['skyScreenshotInside', workerProfile()]]) {
    const server = skyServer({helper, profile, cwd: session.cwd, sky, env});
    const shot = await server.request('get_screenshot');
    const files = shot.ok ? JSON.parse(typeof shot.output === 'string' ? shot.output : JSON.stringify(shot.output)).map(s => s.filepath) : [];
    result[label] = {ok: shot.ok === true, error: shot.ok ? null : shot.error, images: files.length,
      underSessionTmp: files.map(f => f.startsWith(`${session.tmp}/`)), sizes: files.map(f => { try { return fs.statSync(f).size; } catch (e) { return `stat ${e.code}`; } })};
    for (const f of files) { if (f.startsWith(`${session.tmp}/`) || f.startsWith('/tmp/')) fs.rmSync(f, {force: true}); }
    await server.stop();
    result[label].stderr = server.stderr() || null;
  }
  result.skyNamesMitShm = fs.readFileSync(sky).toString('latin1').includes('MIT-SHM');
  return {...result, verdict: xshmVerdict(result)};
}
// (a)'s reading. sky_linux's own screenshot decides whether the worker can stay confined; the raw client says what
// MIT-SHM does for any other X client inside the sandbox (an application launched there, (b)).
export function xshmVerdict({xshmInside, skyScreenshotInside}) {
  if (!skyScreenshotInside?.ok) return 'breaks: sky_linux cannot screenshot inside the worker-shaped sandbox';
  const shm = !xshmInside?.extension ? 'the raw client saw no MIT-SHM'
    : xshmInside.attachError !== 'none' ? `MIT-SHM attach is refused inside (${xshmInside.attachError}), so clients fall back`
      : xshmInside.imageArrived ? 'MIT-SHM works inside'
        : 'MIT-SHM attach "succeeds" inside but the image never reaches the client\'s segment: the server resolved the private-namespace segment id against its own namespace (another process\'s segment)';
  return `proceed for sky_linux (its screenshots work inside); ${shm}`;
}

// A launch's ownership witness. Each launch gives the sky_linux it starts LAUNCH_MARKER=<a fresh id>; sky_linux starts
// applications by fork/exec, so the application inherits it. A new process is this launch's only when its own
// environment carries exactly that id; a pid that cannot be read, or lacks it, is not proven and is never signalled.
export const LAUNCH_MARKER = 'CUA_PROBE_LAUNCH';
// Whether a /proc/<pid>/environ block carries the launch's marker with exactly `id`. Only the marker's entry is looked
// at, and only compared: nothing else in the block is decoded, kept or returned.
export function carriesLaunchMarker(environ, id) {
  const prefix = Buffer.from(`${LAUNCH_MARKER}=`);
  for (let start = 0; start < environ.length;) {
    const nul = environ.indexOf(0, start), end = nul === -1 ? environ.length : nul;
    if (end - start >= prefix.length && environ.subarray(start, start + prefix.length).equals(prefix))
      return environ.subarray(start + prefix.length, end).equals(Buffer.from(id));
    start = end + 1;
  }
  return false;
}
function launchedBy(pid, id) {
  try { return carriesLaunchMarker(fs.readFileSync(`/proc/${pid}/environ`), id); } catch { return false; }
}
// Ends the new processes a launch left that are proven its own (SIGTERM, then SIGKILL after `wait`), re-proving each
// before every signal, since a pid that ended may have been reused. -> {ended: proven pids, unproven: pids left alone}.
export async function endLaunched({pids, owns, alive, kill, wait}) {
  const owned = pids.filter(owns);
  const signal = sig => { for (const pid of owned) if (alive(pid) && owns(pid)) kill(pid, sig); };
  signal('SIGTERM');
  if (owned.some(alive)) { await wait(500); signal('SIGKILL'); }
  return {ended: owned.length, unproven: pids.length - owned.length};
}
const killQuietly = (pid, sig) => { try { process.kill(pid, sig); } catch { /* gone */ } };

async function launchOne({helper, profile, sky, env, session, app, processName}) {
  const before = new Set(pidsNamed(processName));
  const id = randomUUID(), owns = pid => launchedBy(pid, id);
  const server = skyServer({helper, profile, cwd: session.cwd, sky, env: {...env, [LAUNCH_MARKER]: id}});
  const launched = await server.request('launch_app', {app});
  let pid = null;
  for (let i = 0; i < 40 && pid === null; i++) { await sleep(250); pid = pidsNamed(processName).find(p => !before.has(p)) ?? null; }
  const facts = {launch: {ok: launched.ok === true, error: launched.ok ? null : launched.error}, newProcess: pid !== null};
  if (pid !== null) {
    facts.ownershipProven = owns(pid);
    await sleep(1500);
    facts.ancestry = ancestry(pid).map(a => a.comm);
    facts.samePidNamespace = readLink(`/proc/${pid}/ns/pid`) === readLink('/proc/self/ns/pid');
    facts.sameMountNamespace = readLink(`/proc/${pid}/ns/mnt`) === readLink('/proc/self/ns/mnt');
    facts.rootMountOptions = rootMount(pid).options;
    facts.aliveBeforeSkyEnds = alive(pid);
  }
  facts.skyExit = await server.stop();
  if (pid !== null) { await sleep(2000); facts.survivesSkyEnd = alive(pid); }
  // Every new process so named (the observed one, and any a D-Bus activated app left) is ended only if proven this
  // launch's; the rest are counted and left alone.
  facts.cleanup = await endLaunched({pids: pidsNamed(processName).filter(p => !before.has(p)), owns, alive, kill: killQuietly, wait: sleep});
  facts.stderr = server.stderr() || null;
  return facts;
}

async function launchProbe({helper, sky, env, session, userHome}) {
  for (const name of ['gedit', 'zenity']) if (pidsNamed(name).length) throw new Error(`a ${name} is already running; the launch probe needs none`);
  // A harness-owned desktop entry with a plain Exec (no D-Bus activation), removed afterwards.
  const applications = join(userHome, '.local/share/applications');
  const desktop = join(applications, 'cua-probe-zenity.desktop');
  fs.mkdirSync(applications, {recursive: true});
  fs.writeFileSync(desktop, '[Desktop Entry]\nType=Application\nName=cua probe zenity\nExec=/usr/bin/zenity --info --text=cua-probe\nTerminal=false\n');
  try {
    const listing = skyServer({helper, profile: null, cwd: session.cwd, sky, env});
    const apps = await listing.request('list_apps');
    await listing.stop();
    const ids = apps.ok ? (typeof apps.output === 'string' ? JSON.parse(apps.output) : apps.output).map(a => a.id) : [];
    const result = {apps: appInventory(ids), mechanism: skyLaunchStrings(sky), direct: await gtkDirect({helper, env, session})};
    for (const [label, app, processName] of [['gedit', LAUNCH_TARGETS.gedit, 'gedit'], ['zenity', LAUNCH_TARGETS.zenity, 'zenity']]) {
      if (!ids.includes(app)) { result[label] = {listed: false}; continue; }
      result[label] = {
        outside: await launchOne({helper, profile: null, sky, env, session, app, processName}),
        inside: await launchOne({helper, profile: workerProfile(), sky, env, session, app, processName}),
      };
    }
    result.verdict = launchVerdict(['gedit', 'zenity'].map(k => result[k]?.inside).filter(Boolean));
    return result;
  } finally {
    fs.rmSync(desktop, {force: true});
  }
}
// The launched applications' own fate, with their stderr: each GTK client started directly, outside and inside the
// worker's shape, bounded at 6 s (an application still running then is alive and is ended by the bound).
async function gtkDirect({helper, env, session}) {
  const scratchFile = join(session.tmp, 'probe-gedit.txt');
  const result = {};
  for (const [label, command] of [['zenity', ['/usr/bin/zenity', '--info', '--text=cua-probe']], ['gedit', ['/usr/bin/gedit', '--standalone', scratchFile]]]) {
    for (const [side, profile] of [['outside', null], ['inside', workerProfile()]]) {
      const started = Date.now();
      const r = await run({helper, profile, command, cwd: session.cwd, env, timeoutMs: 6000});
      result[`${label}.${side}`] = {aliveAtBound: r.signal === 'SIGKILL', exit: r.code, signal: r.signal, ms: Date.now() - started,
        mitShmBadAccess: /BadAccess[\s\S]*request_code 130 \(MIT-SHM\)/.test(r.stderr), dconfReadOnly: /dconf[^\n]*Read-only file system/.test(r.stderr)};
    }
  }
  fs.rmSync(scratchFile, {force: true});
  return result;
}

// (b)'s reading over the sandboxed launches: each must start a new process, and that process must not be held in the
// worker's sandbox (its PID namespace, ending with the sky_linux that launched it).
export function launchVerdict(inside) {
  if (!inside.length || inside.some(f => !f.launch.ok)) return 'breaks: sky_linux\'s launch_app failed inside the worker-shaped sandbox';
  const died = inside.filter(f => !f.newProcess || !f.aliveBeforeSkyEnds);
  if (died.length) return `breaks: ${died.length} of ${inside.length} applications sky_linux launched inside the worker-shaped sandbox died at start (they inherit the sandbox; see the direct runs for why)`;
  const held = inside.filter(f => f.samePidNamespace === false || f.survivesSkyEnd === false);
  return held.length
    ? `breaks: ${held.length} of ${inside.length} launched applications ran inside the worker's sandbox (its PID namespace and read-only root) and ended with the sky_linux that launched them`
    : 'proceed: launched applications run outside the worker sandbox';
}
// What the app listing contributes to the record: a count and whether the probe's two targets were listed, never the
// inventory itself (the evidence privacy rule: counts and booleans).
export const LAUNCH_TARGETS = {gedit: 'org.gnome.gedit.desktop', zenity: 'cua-probe-zenity.desktop'};
export const appInventory = ids => ({count: ids.length, listed: Object.fromEntries(Object.entries(LAUNCH_TARGETS).map(([name, id]) => [name, ids.includes(id)]))});
// What sky_linux's binary names about how it launches (static evidence beside the observed behaviour).
function skyLaunchStrings(sky) {
  const text = fs.readFileSync(sky).toString('latin1');
  return Object.fromEntries(['gtk-launch', 'gio launch', 'g_app_info_launch', 'systemd-run', 'xdg-open', 'DBusActivatable', 'org.freedesktop.Application', 'posix_spawnp', 'execvp', 'setsid', 'failed to launch application', 'MIT-SHM']
    .map(s => [s, text.includes(s)]));
}

// The check the kernel-shaped child runs: every attempt's outcome, as errno codes.
const NESTING_CHECK = `import * as fs from 'node:fs';import {tmpdir} from 'node:os';
const plan = JSON.parse(process.argv[2]);const out = {execPath: process.execPath, tmpdir: tmpdir(), attempts: []};
const attempt = (label, expect, fn) => { try { fn(); out.attempts.push({label, expect, outcome: 'ok'}); } catch (e) { out.attempts.push({label, expect, outcome: e.code ?? e.message}); } };
for (const [label, path] of plan.denyReads) attempt('read ' + label, 'denied', () => fs.statSync(path).isDirectory() ? fs.readdirSync(path) : fs.readFileSync(path));
for (const [label, path] of plan.allowReads) attempt('read ' + label, 'ok', () => fs.statSync(path).isDirectory() ? fs.readdirSync(path) : fs.readFileSync(path));
for (const [label, path] of plan.allowWrites) attempt('write ' + label, 'ok', () => { fs.writeFileSync(path, 'probe'); fs.rmSync(path); });
for (const [label, path] of plan.denyWrites) attempt('write ' + label, 'denied', () => fs.writeFileSync(path, 'probe'));
for (const [label, from, to] of plan.links) attempt('link ' + label, 'denied', () => fs.linkSync(from, to));
out.mounts = fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\\n').filter(l => plan.mountPrefixes.some(p => (l.split(' ')[4] ?? '').startsWith(p))).map(l => { const f = l.split(' '); return {mountPoint: f[4], options: f[5], fsType: f[f.indexOf('-') + 1]}; });
console.log(JSON.stringify(out));`;

// The nesting's reading: every attempt as expected (reads of denied places and writes outside the session refused;
// re-exposed reads and session writes allowed), checked against a control that read every sentinel unconfined.
export function nestingVerdict(result) {
  const judged = r => {
    if (!r?.attempts) return {holds: false, why: `the helper did not run the check (exit ${r?.launch?.code ?? r?.launch?.signal})`, stderr: r?.launch?.stderr ?? null};
    const wrong = r.attempts.filter(a => (a.expect === 'ok') !== (a.outcome === 'ok'));
    return {holds: wrong.length === 0, wrong: wrong.map(a => `${a.label}: ${a.outcome}`)};
  };
  const judgedAll = {home: judged(result.home), homeExplicit: judged(result.homeExplicit), fallback: judged(result.fallback), homeDiagnostic: judged(result.homeDiagnostic)};
  const controlReadsEverything = result.control?.attempts?.filter(a => a.label.startsWith('read ')).every(a => a.outcome === 'ok') === true;
  const verdict = !controlReadsEverything ? 'invalid: the control could not read the sentinels'
    : judgedAll.home.holds ? 'expressible: the home is denied and runtimes/, node/, the helper directory, the run directory and the session temp are re-exposed as intended'
      : judgedAll.homeExplicit.holds ? 'expressible only with explicit write entries for the run directory and session temp'
        : judgedAll.fallback.holds ? 'not expressible: the fallback applies on Linux, and it holds with run/ denied too (the launch\'s run directory and session temp re-exposed writable inside it)'
          : 'not expressible, and the fallback with run/ denied does not hold either (see judged.fallback)';
  return {judged: judgedAll, controlReadsEverything, verdict};
}

async function nestingProbe({helper, helperDir, home, env, session, scratch}) {
  const layout = homeLayout(home);
  const node = managedNode(home);
  if (!node.path) throw new Error(`the home has no managed Node: ${node.missing}`);
  const otherRun = join(layout.run, 'probe-other-session');
  const store = join(scratch, 'store');
  const seeds = {
    state: join(home, 'state', 'probe-sentinel'),
    remote: join(home, 'remote', 'device.json'),
    chrome: join(home, 'chrome', 'probe-sentinel'),
    otherRun: join(otherRun, 'probe-sentinel'),
    store: join(store, 'PROBE_KEY'),
  };
  for (const file of Object.values(seeds)) { fs.mkdirSync(dirname(file), {recursive: true, mode: 0o700}); fs.writeFileSync(file, 'synthetic sentinel\n', {mode: 0o600}); }
  const check = join(session.cwd, 'nesting-check.mjs');
  fs.writeFileSync(check, NESTING_CHECK);
  const runtimeRoot = locateRuntime({home}).root;
  const variants = nestingVariants({home, layout, runtimeRoot, helperDir, otherRun, store, seeds, session, scratch});
  const result = {node: node.path, helper: join(helperDir, HELPER_NAME)};
  const created = [...variants.home.plan.allowWrites, ...variants.home.plan.denyWrites].map(([, path]) => path).concat(variants.home.plan.links.map(([, , to]) => to));
  // What any attempt may have created, removed after every run so the next one starts from the same state.
  const tidy = () => { for (const path of created) fs.rmSync(path, {force: true}); };
  const control = await run({command: [node.path, check, JSON.stringify(variants.home.plan)], cwd: session.cwd, env});
  tidy();
  result.control = lastJson(control.stdout) ?? {launch: control};
  // A diagnostic beside the three: the home variant again with the helper copied outside the home and the probe's own
  // Node (outside it too) running the check, so each re-exposure is observed even when the helper's re-exec is not.
  const outsideHelper = join(scratch, HELPER_NAME);
  fs.copyFileSync(join(helperDir, HELPER_NAME), outsideHelper);
  fs.chmodSync(outsideHelper, 0o755);
  variants.homeDiagnostic = {...variants.home, helper: outsideHelper, node: process.execPath};
  for (const [label, {plan, profile, helper: launcher = join(helperDir, HELPER_NAME), node: runner = node.path}] of Object.entries(variants)) {
    const launched = await run({helper: launcher, profile, command: [runner, check, JSON.stringify(plan)], cwd: session.cwd, env});
    tidy();
    const out = lastJson(launched.stdout);
    result[label] = {profile, launch: {code: launched.code, signal: launched.signal, stderr: launched.stderr || null, ...(out ? {} : {stdout: launched.stdout.slice(-1000)})}, ...(out ?? {})};
  }
  Object.assign(result, nestingVerdict(result));
  for (const file of Object.values(seeds)) fs.rmSync(file, {force: true});
  for (const dir of [otherRun, store]) fs.rmSync(dir, {recursive: true, force: true});
  return result;
}

// The three shapes the probe tries, each with the outcome every attempt should have:
//   home            the design: the whole home denied, runtimes/, node/ and the helper directory re-exposed read (as
//                   read entries), the run directory and session temp writable (as the project_roots/tmpdir specials);
//   homeExplicit    the same with the run directory and session temp also as explicit write entries;
//   fallback        the Design's fallback (state/, remote/, chrome/ denied one by one) plus run/ itself, with the
//                   launch's run directory and session temp re-exposed as explicit write entries (a writable root
//                   nested in a denied one), so other sessions' run directories stay denied; the home's top level,
//                   current.json and the rest stay readable.
export function nestingVariants({home, layout, runtimeRoot, helperDir, otherRun, store, seeds, session, scratch}) {
  const plan = ({homeDenied}) => ({
    denyReads: [...(homeDenied ? [['the home', home], ['current.json', layout.pointer]] : []), ['state/ sentinel', seeds.state], ['remote/device.json', seeds.remote],
      ['chrome/ sentinel', seeds.chrome], ['another session\'s run directory', otherRun], ['the store', store], ['a store key', seeds.store]],
    allowReads: [...(homeDenied ? [] : [['the home', home], ['current.json', layout.pointer]]), ['runtimes/', layout.runtimes],
      ['the runtime manifest', join(runtimeRoot, 'cua_node', 'manifest.json')], ['node/', layout.node], ['the helper directory', helperDir], ['the run directory', session.cwd]],
    allowWrites: [['the run directory', join(session.cwd, 'probe-write')], ['the session temp', join(session.tmp, 'probe-write')]],
    denyWrites: [['the home', join(home, 'probe-write')], ['runtimes/', join(layout.runtimes, 'probe-write')], ['node/', join(layout.node, 'probe-write')],
      ['another session\'s run directory', join(otherRun, 'probe-write')]],
    links: [['state/ sentinel into the run directory', seeds.state, join(session.cwd, 'probe-link')], ['a store key into the session temp', seeds.store, join(session.tmp, 'probe-link')]],
    mountPrefixes: [home, scratch],
  });
  const writes = [session.cwd, session.tmp];
  const reexposeRead = [layout.runtimes, layout.node, helperDir];
  return {
    home: {plan: plan({homeDenied: true}), profile: kernelProfile({deny: [home, store], reexposeRead, writes, explicitWrites: false})},
    homeExplicit: {plan: plan({homeDenied: true}), profile: kernelProfile({deny: [home, store], reexposeRead, writes, explicitWrites: true})},
    fallback: {plan: plan({homeDenied: false}), profile: kernelProfile({deny: ['state', 'remote', 'chrome', 'run'].map(d => join(home, d)).concat(store), reexposeRead: [], writes, explicitWrites: true})},
  };
}

export async function main(argv = process.argv.slice(2)) {
  const {values} = parseArgs({args: argv, options: {home: {type: 'string'}, xshm: {type: 'string'}, out: {type: 'string'}, 'helper-source': {type: 'string'}, tag: {type: 'string', default: 'rust-v0.159.2-vendor'}, probes: {type: 'string', default: 'xshm,launch,nesting'}}});
  if (!values.home || !values.out) throw new Error('usage: linux-probes.mjs --home <CUA_HOME> --xshm <xshm-probe> --out <file> [--helper-source <path>] [--tag <dir>] [--probes xshm,launch,nesting]');
  if (process.platform !== 'linux') throw new Error('the Linux probes run on Linux');
  const home = fs.realpathSync(resolve(values.home));
  const runtime = locateRuntime({home});
  const source = values['helper-source'] ?? runtime.paths.codexCli;
  const helperDir = join(home, 'sandbox', values.tag);
  fs.mkdirSync(helperDir, {recursive: true, mode: 0o755});
  const helper = join(helperDir, HELPER_NAME);
  fs.copyFileSync(source, helper);
  fs.chmodSync(helper, 0o755);
  const session = {cwd: join(homeLayout(home).run, `probe-${process.pid}`)};
  session.tmp = join(session.cwd, 'tmp');
  fs.mkdirSync(session.tmp, {recursive: true, mode: 0o700});
  const scratch = fs.mkdtempSync(join(dirname(home), 'probe-scratch-'));
  OUTPUT_ROOT = fs.mkdtempSync(join(dirname(home), 'probe-outputs-'));
  const userHome = process.env.HOME;
  const env = {...discoverDesktopEnvironment(fs), HOME: userHome, PATH: FIXED_PATH, TMPDIR: session.tmp, LANG: 'C.UTF-8'};
  const result = {
    at: new Date().toISOString(),
    machine: {kernel: tryText('uname', ['-r']), arch: process.arch, distribution: tryText('lsb_release', ['-ds']), bwrap: tryText('bwrap', ['--version']),
      userns: tryText('sysctl', ['-n', 'kernel.apparmor_restrict_unprivileged_userns']), display: env.DISPLAY},
    helper: {source, sourceVersion: tryText(source, ['--version']), placed: helper, sha256: sha256(helper), tag: values.tag},
    runtime: runtime.release,
    session: {cwd: session.cwd, tmp: session.tmp},
  };
  const sky = runtime.paths.skyLinuxBin;
  const selected = values.probes.split(',');
  try {
    if (selected.includes('xshm')) {
      if (!values.xshm) throw new Error('--xshm names the built xshm-probe');
      result.xshm = await xshmProbe({helper, home, xshm: resolve(values.xshm), sky, env, session});
    }
    if (selected.includes('launch')) result.launch = await launchProbe({helper, sky, env, session, userHome});
    if (selected.includes('nesting')) result.nesting = await nestingProbe({helper, helperDir, home, env, session, scratch});
  } finally {
    fs.rmSync(session.cwd, {recursive: true, force: true});
    fs.rmSync(scratch, {recursive: true, force: true});
    fs.rmSync(OUTPUT_ROOT, {recursive: true, force: true});
  }
  fs.mkdirSync(dirname(resolve(values.out)), {recursive: true});
  fs.writeFileSync(values.out, `${JSON.stringify(result, null, 2)}\n`);
  for (const probe of ['xshm', 'launch', 'nesting']) if (result[probe]) console.log(`${probe}: ${result[probe].verdict}`);
  return result;
}

if (process.argv[1] && basename(process.argv[1]) === 'linux-probes.mjs') {
  main().catch(error => { console.error(error.stack ?? error.message); process.exitCode = 1; });
}
