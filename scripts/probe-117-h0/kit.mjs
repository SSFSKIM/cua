// #117 H0 (#175): can a GitHub-hosted macOS runner run cua's engine bundle and the vendor's helper live, with TCC rows
// the job writes? The spike of docs/doperpowers/specs/2026-10-18-own-native-engine-m4m5-preflight.md §4 (on
// docs/117-progress), steps 1 to 4 and 6 to 10; step 5 (the runner labels) is its own dispatch (the workflow's `label`
// mode). No product change: it runs main's `cua engine build --sign adhoc`, `cua install`, `cua serve`, `cua engine
// approve`, `cua doctor` and scripts/repl-parity/scenes-mac.mjs as they stand, and records what each answers.
//
//   node scripts/probe-117-h0/kit.mjs <out> <cua-home> <scene-run> <display-tool>
//
// Part 1 (steps 1 to 4, 6) writes no TCC row. Part 2 (steps 7 to 10) writes rows only through ./tcc.mjs, whose one
// writer refuses unless RUNNER_ENVIRONMENT=github-hosted and the owner's yes (O0) is in the spec's Decision Log.
// Every step runs and is recorded even when an earlier one failed. Evidence: <out>/steps.json, the observations' trees
// (*.txt) and screenshots (*.jpg|png), the TCC row dumps. The runner is disposable; nothing of an owner's is on it.
import {spawn, spawnSync} from 'node:child_process';
import {closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openSession, resultText} from '../accept/mcp-session.mjs';
import {watchCaptureAlerts, enginePaths, engineDirectory} from '../../src/runtime/engine.mjs';
import {BUNDLE_ID as ENGINE_BUNDLE_ID, EXECUTABLE} from '../../src/runtime/engine-bundle.mjs';
import {launchProbe, runProbe} from '../native-matrix/live-device.mjs';
import {USER_DB, readRows, writability, grantRows, revokeRows, restartTccd} from './tcc.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted' || process.platform !== 'darwin') {
  console.error('probe-117-h0: refused: a disposable GitHub-hosted macOS runner only');
  process.exit(2);
}
const [OUT, CUA_HOME, SCENE_RUN, DISPLAY_TOOL] = process.argv.slice(2);
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CLI = join(ROOT, 'bin/cua.mjs');
const PATHS = enginePaths(engineDirectory(homedir()));
const ENGINE_EXE = join(PATHS.bundle, 'Contents', 'MacOS', EXECUTABLE);
const SCENES = {textedit: 'com.apple.TextEdit', finder: 'com.apple.finder', chrome: 'com.google.chrome.for.testing', electron: 'io.github.ssfskim.cua.fixture.electron'};
const APPS = new Set(Object.values(SCENES));
mkdirSync(OUT, {recursive: true});

const record = {};
const save = () => writeFileSync(join(OUT, 'steps.json'), JSON.stringify(record, null, 2) + '\n');
const log = line => console.log(`h0: ${line}`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const err = e => String(e?.message ?? e).slice(0, 500);

function sh(cmd, args, {env = process.env, timeout = 120_000, input} = {}) {
  const started = Date.now();
  const r = spawnSync(cmd, args, {env, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024, ...(input === undefined ? {stdio: ['ignore', 'pipe', 'pipe']} : {input})});
  return {code: r.status, signal: r.signal, stdout: r.stdout ?? '', stderr: r.stderr ?? '', ms: Date.now() - started, ...(r.error ? {error: r.error.code ?? r.error.message} : {})};
}
const cuaEnv = (extra = {}) => ({...process.env, CUA_HOME, CUA_SHIM_PERSIST: 'session', CUA_SHIM_SECRETS: 'off', ...extra});
// The command's JSON answer: its whole stdout (cua prints it indented), else its last line that parses.
const json = text => { try { return JSON.parse(text); } catch {} for (const l of text.trim().split('\n').reverse()) { try { return JSON.parse(l); } catch {} } return null; };
function cua(args, {env = {}, timeout = 15 * 60_000} = {}) {
  const r = sh(process.execPath, [CLI, ...args], {env: cuaEnv(env), timeout});
  const lines = r.stderr.trim().split('\n');
  return {code: r.code, ms: r.ms, json: json(r.stdout), stderrTail: lines.slice(-6).join('\n'),
    ...(r.code ? {stderrKey: lines.filter(l => /error:|Assertion|assert|Stack dump|Program arguments|While |Please submit|crash/i.test(l)).slice(0, 12).map(l => l.slice(0, 300))} : {})};
}

// The engine's own report of its grants (the running engine's `status`), through `cua engine status --json`.
function engineGrants() {
  const r = cua(['engine', 'status', '--json'], {timeout: 60_000});
  const s = r.json?.status;
  return s ? {running: true, pid: s.pid, accessibility: s.accessibility, screenRecording: s.screenRecording, inputMonitoring: s.inputMonitoring, canPostHid: s.canPostHid, bundlePath: s.bundlePath, build: s.build}
    : {running: false, approved: r.json?.approved ?? null, exists: r.json?.exists ?? null, code: r.code, stderr: r.stderrTail};
}
async function untilRunning(ms = 20_000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(500)) { const g = engineGrants(); if (g.running) return g; }
  return engineGrants();
}
function stopEngine() { const r = cua(['engine', 'stop', '--json'], {timeout: 60_000}); return {code: r.code, ...(r.json ?? {}), stderr: r.code ? r.stderrTail : undefined}; }
async function launchLS() {
  const opened = sh('/usr/bin/open', ['-n', '-g', '-a', PATHS.bundle]);
  return {open: opened.code, ...(opened.code ? {openStderr: opened.stderr.slice(0, 300)} : {}), grants: await untilRunning()};
}
async function relaunchLS() { const stopped = stopEngine(); return {stopped, ...await launchLS()}; }
// Whose child the running engine is: launchd's (pid 1, a LaunchServices launch) or this job's.
const parentOf = pid => { const r = sh('/bin/ps', ['-o', 'ppid=,comm=', '-p', String(pid)]); return r.stdout.trim(); };

// approved.json as `cua engine approve` would write it, from pending.json's build and identity: the kit's stand-in where
// no one can approve (part 1), so a session can select cua's engine. Never written over a real approval of this build.
function harnessApproval() {
  const pending = JSON.parse(readFileSync(PATHS.pending, 'utf8'));
  if (existsSync(PATHS.approved)) {
    const approved = JSON.parse(readFileSync(PATHS.approved, 'utf8'));
    if (approved.build === pending.build && approved.identity === pending.identity) return {written: false, approved: 'present'};
  }
  writeFileSync(PATHS.approved, JSON.stringify({build: pending.build, identity: pending.identity, approvedAt: new Date().toISOString(), harness: 'probe-117-h0'}, null, 2) + '\n', {mode: 0o600});
  return {written: true, build: pending.build};
}

function doctorRows(env) {
  const r = cua(['doctor', '--json'], {env, timeout: 180_000});
  const checks = r.json?.checks ?? [];
  return {code: r.code, rows: checks.filter(c => /engine|native|helper|permission|grant/i.test(c.name)).map(c => ({name: c.name, status: c.status, detail: String(c.detail).slice(0, 600)})), engine: r.json?.engine ?? null};
}

// ---- sessions ----

const b64 = `const __b64 = bytes => { if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64'); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };`;
const cellLine = reply => {
  if (reply.timedOut) return {timedOut: true};
  const text = resultText(reply);
  const line = text.split('\n').reverse().find(l => l.startsWith('{"h0"'));
  if (line) { try { return {...JSON.parse(line), isError: Boolean(reply.result?.isError)}; } catch {} }
  return {cellError: text.split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 600) || reply.error?.message || 'no output', isError: true};
};

async function openServe(name, env) {
  const elicitations = [];
  const s = openSession({args: [CLI, 'serve'], env: cuaEnv(env), clientName: `h0-${name}`, onServerRequest: msg => {
    const app = msg.params?._meta?.tool_params?.app ?? null;
    const accept = msg.method === 'elicitation/create' && APPS.has(app) && /^Allow Computer Use to use /.test(String(msg.params?.message));
    elicitations.push({method: msg.method, app, message: String(msg.params?.message ?? '').slice(0, 160), answer: accept ? 'accept' : 'decline'});
    return accept ? {action: 'accept', content: {}} : {action: 'decline'};
  }});
  const opened = {name, elicitations};
  try {
    await s.initialize();
    const first = await s.js('nodeRepl.write(JSON.stringify({h0: "ready"}))', 120_000);
    opened.firstCell = cellLine(first);
    opened.attestation = first.result?._meta?.['cua/nativeEngine'] ?? null;
    opened.host = first.result?._meta ? Object.fromEntries(Object.entries(first.result._meta).filter(([k]) => /host|engine/i.test(k))) : null;
  } catch (e) { opened.openError = err(e); }
  return {s, opened};
}
async function closeServe(s) { try { return await s.close(); } catch (e) { return {error: err(e)}; } }

// One observation of `bundle` on an open session: bind, the tree, the screenshot, replayd's capture alerts around it.
// With `click`, a regexp naming a line of the tree: one element click on it, then the tree again.
async function observe(s, label, bundle, {click} = {}) {
  const watch = watchCaptureAlerts();
  const watchReady = await watch.ready;
  const started = Date.now();
  const reply = await s.js(`${b64}
const __r = {h0: true};
try { globalThis.__app = await cua.getApp(${JSON.stringify(bundle)}); __r.bound = true; } catch (e) { __r.bindError = String(e?.message ?? e); }
if (__r.bound) {
  try { __r.tree = await __app.getAXState({emit: false, disableDiffing: true}); } catch (e) { __r.treeError = String(e?.message ?? e); }
  try { const __s = await __app.getScreenshot({emit: false}); __r.shot = {bytes: __s.length, png: __s[0] === 0x89, b64: __b64(__s)}; } catch (e) { __r.shotError = String(e?.message ?? e); }
}
nodeRepl.write(JSON.stringify(__r));`, 120_000);
  const out = {label, bundle, ms: Date.now() - started, ...cellLine(reply), attestation: reply.result?._meta?.['cua/nativeEngine'] ?? null};
  if (typeof out.tree === 'string') {
    writeFileSync(join(OUT, `${label}.txt`), out.tree);
    out.treeLines = out.tree.split('\n').length;
    out.window = /^Window: "([^"]*)"/m.exec(out.tree)?.[1] ?? null;
    delete out.tree;
  }
  if (out.shot) {
    const file = `${label}.${out.shot.png ? 'png' : 'jpg'}`;
    writeFileSync(join(OUT, file), Buffer.from(out.shot.b64, 'base64'));
    out.shot = {bytes: out.shot.bytes, file};
  }
  if (click && out.bound) {
    const tree = existsSync(join(OUT, `${label}.txt`)) ? readFileSync(join(OUT, `${label}.txt`), 'utf8') : '';
    const line = tree.split('\n').find(l => click.test(l));
    const index = line ? Number(/^[~+-]?[\t ]*(\d+) /.exec(line)?.[1]) : null;
    if (Number.isInteger(index)) {
      const clicked = await s.js(`const __r = {h0: true};
try { __r.result = await __app.click(${index}); __r.ok = true; } catch (e) { __r.clickError = String(e?.message ?? e); }
try { const __t = await __app.getAXState({emit: false, disableDiffing: true}); __r.after = __t.split('\\n').filter(l => /First Text View|focused|selected/i.test(l)).slice(0, 4).join('\\n'); } catch (e) { __r.afterError = String(e?.message ?? e); }
nodeRepl.write(JSON.stringify(__r));`, 120_000);
      out.click = {index, target: line.trim().slice(0, 160), ...cellLine(clicked)};
    } else out.click = {skipped: 'no element in the tree matches the click target'};
  }
  const alerts = await watch.stop();
  out.captureAlerts = {watched: watchReady && alerts.intact, alerts: alerts.alerts};
  log(`${label}: bound ${Boolean(out.bound)}, tree ${out.treeLines ?? out.treeError ?? out.bindError ?? out.cellError ?? (out.timedOut ? 'timed out' : '?')}, screenshot ${out.shot?.bytes ?? out.shotError ?? '-'}, alerts ${out.captureAlerts.alerts}${out.click ? `, click ${out.click.ok ? 'ok' : out.click.clickError ?? out.click.skipped ?? out.click.cellError}` : ''}`);
  return out;
}

async function sessionStep(name, env, targets) {
  const {s, opened} = await openServe(name, env);
  const observations = [];
  if (!opened.openError) for (const t of targets) observations.push(await observe(s, `${name}-${t.label}`, t.bundle, t));
  opened.exit = await closeServe(s);
  opened.stderrTail = s.stderr.trim().split('\n').slice(-8).join('\n').slice(0, 1500);
  return {session: opened, observations};
}
const TEXT_AREA = /First Text View/;

async function step(key, fn) {
  log(`---- ${key}`);
  const started = Date.now();
  try { record[key] = {...await fn(), ms: Date.now() - started}; } catch (e) { record[key] = {...(record[key] ?? {}), error: err(e), stack: String(e?.stack ?? '').slice(0, 800), ms: Date.now() - started}; log(`${key} threw: ${err(e)}`); }
  save();
}

// ---- the scenes, over the loopback device (ssh hosted-macos) ----

const ssh = (args, timeout = 300_000) => {
  const r = sh('/usr/bin/ssh', ['-o', 'BatchMode=yes', 'hosted-macos', `cd '${ROOT}' && node scripts/repl-parity/scenes-mac.mjs ${args}`], {timeout});
  return {code: r.code, ms: r.ms, out: json(r.stdout) ?? r.stdout.slice(0, 400), ...(r.code ? {stderr: r.stderr.slice(-400)} : {})};
};

// ---- (c) the probe modes the matrix starts, each its own LaunchServices instance of the bundle ----
// scripts/native-matrix/live-device.mjs's own launch (`open -n -g --stdout … -a <bundle> --args --probe …`), one use
// each: `focus` (its Accessibility reading and the focused app), `keystroke` into the TextEdit scene's window brought to
// the front (did the text change: the focus probe's value hash before and after), `watch-activations` across two scene
// activations (how many it saw).
const textEditWindow = () => {
  const r = record['step4-scenes']?.up?.textedit?.out;
  const b = r?.window?.bounds;
  return r?.pid && b ? {pid: r.pid, spec: [r.pid, b.x, b.y, b.width, b.height].map(Math.round).join(',')} : null;
};
function probeModes({keystroke = true} = {}) {
  const out = {};
  const probe = args => { try { return runProbe(PATHS.bundle, args); } catch (e) { return {error: err(e)}; } };
  out.focus = probe(['focus']);
  const w = textEditWindow();
  if (keystroke && w) {
    out.activateTextEdit = ssh(`activate textedit --run '${SCENE_RUN}'`);
    const before = probe(['focus', '--window', w.spec]);
    const bounds = w.spec.split(',').slice(1).join(',');
    const keys = probe(['keystroke', '--user-pid', String(w.pid), '--user-bounds', bounds, 'h0keys']);
    const after = probe(['focus', '--window', w.spec]);
    out.keystroke = {result: keys, before: {named: before.named, valueHash: before.valueHash, accessibility: before.accessibility}, after: {named: after.named, valueHash: after.valueHash},
      textChanged: before.valueHash && after.valueHash ? before.valueHash !== after.valueHash : null};
  } else if (keystroke) out.keystroke = {skipped: 'no TextEdit scene window recorded'};
  try {
    const handle = launchProbe(PATHS.bundle, ['watch-activations']);
    spawnSync('/bin/sleep', ['2']);
    const activations = [ssh(`activate finder --run '${SCENE_RUN}'`).code, ssh(`activate textedit --run '${SCENE_RUN}'`).code];
    spawnSync('/bin/sleep', ['2']);
    if (handle.pid) { try { process.kill(handle.pid, 'SIGTERM'); } catch {} }
    spawnSync('/bin/sleep', ['1']);
    const lines = existsSync(handle.out) ? readFileSync(handle.out, 'utf8').trim().split('\n').filter(Boolean) : [];
    out.watchActivations = {pid: handle.pid, activateCodes: activations, lines: lines.length, first: lines[0]?.slice(0, 120) ?? null,
      activated: lines.filter(l => l.includes('"activated"')).map(l => { try { return JSON.parse(l).bundleId; } catch { return null; } })};
  } catch (e) { out.watchActivations = {error: err(e)}; }
  log(`probes: focus ax ${out.focus.accessibility ?? out.focus.error}, keystroke changed ${out.keystroke?.textChanged ?? out.keystroke?.skipped}, activations seen ${out.watchActivations.activated?.length ?? out.watchActivations.error}`);
  return out;
}

// A vendor helper already running (from an earlier step, or anything else on the runner): listed before every vendor step.
const skyProcesses = () => sh('/bin/ps', ['-axo', 'pid=,ppid=,command=']).stdout.split('\n').map(l => l.trim()).filter(l => /Codex Computer Use|SkyComputerUse|com\.openai\.sky|CUAService/i.test(l)).map(l => l.slice(0, 300));

// ---- the run ----

await step('context', async () => {
  const mainSha = sh('/usr/bin/git', ['-C', ROOT, 'merge-base', 'HEAD', 'origin/main']).stdout.trim();
  const kitOnly = sh('/usr/bin/git', ['-C', ROOT, 'diff', '--name-only', mainSha, 'HEAD']).stdout.trim().split('\n').filter(Boolean);
  const display = sh(DISPLAY_TOOL, []);
  return {
    kit: process.env.GITHUB_SHA, run: process.env.GITHUB_RUN_ID, mainSha, diffFromMain: kitOnly,
    image: {os: process.env.ImageOS, version: process.env.ImageVersion, arch: process.env.RUNNER_ARCH, label: process.env.H0_LABEL},
    swVers: sh('/usr/bin/sw_vers', []).stdout.trim(), node: process.version, user: process.env.USER,
    display: json(display.stdout) ?? {error: display.stderr.slice(0, 300)},
    consoleUser: sh('/usr/bin/stat', ['-f', '%Su', '/dev/console']).stdout.trim(),
    managerName: sh('/bin/launchctl', ['managername']).stdout.trim(),
  };
});
await step('step6-tcc-readonly', async () => ({rowsBefore: readRows(), writability: writability()}));

await step('setup', async () => {
  // The image's default toolchain first; when it fails, each other Xcode on the image (DEVELOPER_DIR, for the build
  // only), so the run says which toolchains build the engine and goes on with the first that does.
  const builds = [];
  let build = cua(['engine', 'build', '--sign', 'adhoc', '--json'], {timeout: 30 * 60_000});
  builds.push({developerDir: sh('/usr/bin/xcode-select', ['-p']).stdout.trim(), swift: sh('/usr/bin/xcrun', ['swift', '--version']).stdout.trim().split('\n')[0], code: build.code, ms: build.ms, ...(build.code ? {stderrKey: build.stderrKey, stderrTail: build.stderrTail} : {})});
  if (build.code !== 0) {
    for (const app of readdirSync('/Applications').filter(n => /^Xcode_[\d.]+\.app$/.test(n)).sort()) {
      const dir = `/Applications/${app}/Contents/Developer`;
      if (builds.some(b => b.developerDir === dir)) continue;
      const attempt = cua(['engine', 'build', '--sign', 'adhoc', '--json'], {env: {DEVELOPER_DIR: dir}, timeout: 30 * 60_000});
      builds.push({developerDir: dir, swift: sh('/usr/bin/xcrun', ['swift', '--version'], {env: {...process.env, DEVELOPER_DIR: dir}}).stdout.trim().split('\n')[0], code: attempt.code, ms: attempt.ms, ...(attempt.code ? {stderrKey: attempt.stderrKey, stderrTail: attempt.stderrTail} : {})});
      if (attempt.code === 0) { build = attempt; break; }
    }
  }
  const install = cua(['install', '--json'], {timeout: 15 * 60_000});
  const helpers = [];
  const walk = (dir, depth) => {
    if (depth > 7) return;
    let entries; try { entries = readdirSync(dir, {withFileTypes: true}); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory() && e.name.endsWith('.app')) {
        const id = sh('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', join(p, 'Contents', 'Info.plist')]).stdout.trim();
        helpers.push({path: p, bundleId: id});
      } else if (e.isDirectory() && !e.isSymbolicLink()) walk(p, depth + 1);
    }
  };
  walk(CUA_HOME, 0);
  const chrome = ssh(`place-chrome --cache '${SCENE_RUN}-cache'`, 900_000);
  const electron = ssh(`build-electron --cache '${SCENE_RUN}-cache'`, 900_000);
  return {
    engineBuilds: builds,
    engineBuild: {code: build.code, ms: build.ms, build: build.json?.build, signature: build.json?.signature, bundlePath: build.json?.bundlePath, stderr: build.code ? build.stderrTail : undefined},
    install: {code: install.code, ms: install.ms, release: install.json?.release, stderr: install.code ? install.stderrTail : undefined},
    runtimeApps: helpers, chrome, electron,
  };
});
const chromeApp = record.setup?.chrome?.out?.app ?? record.setup?.chrome?.out?.appPath;
const electronApp = record.setup?.electron?.out?.appPath;

await step('step4-scenes', async () => {
  mkdirSync(SCENE_RUN, {recursive: true, mode: 0o700});
  const preflight = ssh(`preflight --run '${SCENE_RUN}'`);
  const up = {};
  up.textedit = ssh(`up textedit --run '${SCENE_RUN}'`);
  up.finder = ssh(`up finder --run '${SCENE_RUN}'`);
  up.chrome = chromeApp ? ssh(`up chrome --run '${SCENE_RUN}' --chrome-app '${chromeApp}'`) : {skipped: 'no Chrome for Testing placed'};
  up.electron = electronApp ? ssh(`up electron --run '${SCENE_RUN}' --electron-app '${electronApp}'`) : {skipped: 'no Electron fixture built'};
  const shot = sh('/usr/sbin/screencapture', ['-x', join(OUT, 'step4-desktop.png')]);
  return {preflight, up, desktopCapture: {code: shot.code, stderr: shot.stderr.slice(0, 200)}, display: json(sh(DISPLAY_TOOL, []).stdout)};
});

// Part 1, step 1: the bundle at the approved location, its own TCC client through LaunchServices, no rows.
await step('step1-bundle-no-rows', async () => {
  const launched = await launchLS();
  const parent = launched.grants.pid ? parentOf(launched.grants.pid) : null;
  const approval = harnessApproval();
  const doctor = doctorRows({CUA_NATIVE_ENGINE: 'cua'});
  const observed = await sessionStep('s1', {CUA_NATIVE_ENGINE: 'cua'}, [{label: 'textedit', bundle: SCENES.textedit}]);
  const after = engineGrants();
  return {launched, parent, harnessApproval: approval, doctor, ...observed, grantsAfter: after, stopped: stopEngine(), after: front('step1')};
});

// Part 1, (c): the probe modes as their own LaunchServices instances, no rows.
await step('stepC-probes-no-rows', async () => probeModes());

// Part 1, step 3: the child relay. The bundle's executable started by this job (the engine at the socket beside the
// bundle, under the job's grants), then a cua serve session on cua's own host that finds it there.
let child = null;
await step('step3-child-relay', async () => {
  const logFd = openSync(join(OUT, 'step3-engine-stderr.txt'), 'w');
  if (!existsSync(ENGINE_EXE)) { closeSync(logFd); throw new Error(`no engine at ${ENGINE_EXE} (the build failed)`); }
  child = spawn(ENGINE_EXE, [], {stdio: ['ignore', logFd, logFd], detached: true, env: {...process.env}});
  child.on('error', e => log(`child relay: ${err(e)}`));
  closeSync(logFd);
  const grants = await untilRunning();
  const observed = await sessionStep('s3', {CUA_NATIVE_ENGINE: 'cua'}, [
    {label: 'textedit', bundle: SCENES.textedit, click: TEXT_AREA},
    {label: 'finder', bundle: SCENES.finder},
    {label: 'chrome', bundle: SCENES.chrome},
    {label: 'electron', bundle: SCENES.electron},
  ]);
  return {childPid: child.pid, grants, sameProcess: grants.pid === child.pid, parent: grants.pid ? parentOf(grants.pid) : null, ...observed, grantsAfter: engineGrants(), stopped: stopEngine()};
});
if (child && child.exitCode === null) { try { child.kill('SIGTERM'); } catch {} }

// Part 1, step 2: the vendor's helper with no rows: a CUA_NATIVE_ENGINE=vendor session binding TextEdit.
await step('step2-vendor-no-rows', async () => {
  const idleBefore = skyProcesses();
  const doctor = doctorRows({CUA_NATIVE_ENGINE: 'vendor'});
  const observed = await sessionStep('s2', {CUA_NATIVE_ENGINE: 'vendor'}, [{label: 'textedit', bundle: SCENES.textedit, click: TEXT_AREA}]);
  const helperProcs = skyProcesses();
  return {idleBefore, doctor, ...observed, helperProcesses: helperProcs};
});
const vendorHelpers = () => sh('/bin/ps', ['-axo', 'pid=,command=']).stdout.split('\n').map(l => l.trim()).filter(l => l.includes(CUA_HOME) && /\.app\//.test(l));

// ---- Part 2: TCC rows (./tcc.mjs's guarded writer) ----

const ENGINE_ALL = ['accessibility', 'screenRecording', 'inputMonitoring', 'postEvent'];
const bundleOf = () => PATHS.bundle;

// Step 7: does tccd honour a row the job writes? Accessibility for the engine, user database first, then system.
await step('step7-tccd-honours', async () => {
  const out = {};
  out.baseline = await relaunchLS();
  // The macOS 27 image has no user database at all (run 45150346656): that half is skipped there, and said so.
  if (existsSync(USER_DB)) {
    out.userRow = grantRows({client: ENGINE_BUNDLE_ID, bundle: bundleOf(), services: ['accessibility'], db: 'user'});
    await sleep(1000);
    out.afterUserRowLive = engineGrants();
    out.afterUserRowRelaunch = await relaunchLS();
    revokeRows({client: ENGINE_BUNDLE_ID, services: ['accessibility'], db: 'user'});
  } else out.userRow = {skipped: `no user database at ${USER_DB}`};
  out.systemRow = grantRows({client: ENGINE_BUNDLE_ID, bundle: bundleOf(), services: ['accessibility'], db: 'system'});
  await sleep(1000);
  out.afterSystemRowLive = engineGrants();
  out.afterSystemRowRelaunch = await relaunchLS();
  if (out.afterSystemRowRelaunch.grants.accessibility !== true) {
    out.tccdRestart = restartTccd();
    await sleep(2000);
    out.afterRestartRelaunch = await relaunchLS();
  }
  out.rows = readRows();
  out.honoured = {user: out.afterUserRowRelaunch ? out.afterUserRowRelaunch.grants.accessibility === true || out.afterUserRowLive.accessibility === true : null,
    systemLive: out.afterSystemRowLive.accessibility === true, systemRelaunch: out.afterSystemRowRelaunch.grants.accessibility === true,
    systemAfterRestart: out.afterRestartRelaunch?.grants.accessibility ?? null};
  return out;
});
const needsRestart = record['step7-tccd-honours']?.honoured && !record['step7-tccd-honours'].honoured.systemRelaunch && record['step7-tccd-honours'].honoured.systemAfterRestart === true;
async function settle() { if (needsRestart) { restartTccd(); await sleep(2000); } }

// What is in front and the whole desktop, after a step: a capture confirmation (UserNotificationCenter) takes the front.
function front(tag) {
  const shot = sh('/usr/sbin/screencapture', ['-x', join(OUT, `desktop-${tag}.png`)]);
  return {frontmost: ssh('frontmost').out, desktop: shot.code === 0 ? `desktop-${tag}.png` : {code: shot.code}};
}

// Step 8: cua's bundle with all its rows: grants after a relaunch; a session through the product's own launch (no engine
// running: the service launches it), before any approve, so its own first captures show whether they raise replayd's
// confirmation; the probe modes; then `cua engine approve` with nobody at the console, and once more.
// The rows and a relaunch first, then (c) the probe modes before any capture by the bundle: its first capture raises
// replayd's confirmation, which then holds the front and the key focus (run 45142610176).
await step('step8a-rows', async () => {
  const rowsWritten = grantRows({client: ENGINE_BUNDLE_ID, bundle: bundleOf(), services: ENGINE_ALL});
  await settle();
  return {rowsWritten, relaunch: await relaunchLS(), before: front('step8a')};
});
await step('stepC-probes-rows', async () => ({...probeModes(), after: front('stepC-rows')}));
await step('step8-bundle-rows', async () => {
  const out = {};
  out.stoppedBeforeSession = stopEngine();
  Object.assign(out, await sessionStep('s8', {CUA_NATIVE_ENGINE: 'cua'}, [
    {label: 'textedit', bundle: SCENES.textedit, click: TEXT_AREA},
    {label: 'finder', bundle: SCENES.finder},
    {label: 'chrome', bundle: SCENES.chrome},
    {label: 'electron', bundle: SCENES.electron},
  ]));
  out.grantsAfter = engineGrants();
  out.parent = out.grantsAfter.pid ? parentOf(out.grantsAfter.pid) : null;
  out.afterSession = front('step8-session');
  return out;
});
await step('step8b-approve', async () => {
  const out = {};
  const approve = sh(process.execPath, [CLI, 'engine', 'approve', '--json'], {env: cuaEnv(), timeout: 300_000});
  out.approve = {code: approve.code, ms: approve.ms, json: json(approve.stdout), stderr: approve.stderr.trim().split('\n').slice(-10).join('\n')};
  out.afterApprove = front('step8-approve');
  if (out.approve.code !== 0 && /engine_capture_confirmation/.test(out.approve.stderr)) {
    // The confirmation is raised by a copy's first display capture; a second approve shows whether it is raised again.
    const again = sh(process.execPath, [CLI, 'engine', 'approve', '--json'], {env: cuaEnv(), timeout: 300_000});
    out.approveAgain = {code: again.code, ms: again.ms, json: json(again.stdout), stderr: again.stderr.trim().split('\n').slice(-10).join('\n')};
  }
  out.approvedJson = existsSync(PATHS.approved) ? JSON.parse(readFileSync(PATHS.approved, 'utf8')) : null;
  out.stopped = stopEngine();
  out.doctor = doctorRows({CUA_NATIVE_ENGINE: 'cua'});
  out.stoppedAfterDoctor = stopEngine();
  return out;
});

// Step 9: the vendor's helper with rows for every app bundle in the installed runtime that is its helper.
await step('step9-vendor-rows', async () => {
  const out = {};
  const apps = (record.setup?.runtimeApps ?? []).filter(a => /sky|CUAService|computer/i.test(a.bundleId));
  out.helpers = apps;
  out.idleBefore = skyProcesses();
  out.rowsWritten = apps.flatMap(a => { try { return grantRows({client: a.bundleId, bundle: a.path, services: ENGINE_ALL}); } catch (e) { return [{client: a.bundleId, error: err(e)}]; } });
  await settle();
  // A helper left running from step 2 would keep its no-grant decision: stop only processes run from this run's home.
  out.stoppedHelpers = vendorHelpers().map(l => { const pid = Number(l.split(' ')[0]); try { process.kill(pid, 'SIGTERM'); return pid; } catch { return null; } });
  await sleep(2000);
  out.idleAfterStop = skyProcesses();
  out.doctor = doctorRows({CUA_NATIVE_ENGINE: 'vendor'});
  // Chrome for Testing by its path: the image preinstalls another copy in /Applications, and the vendor refuses the
  // bundle id as ambiguous (run 45139175518).
  Object.assign(out, await sessionStep('s9', {CUA_NATIVE_ENGINE: 'vendor'}, [
    {label: 'textedit', bundle: SCENES.textedit, click: TEXT_AREA},
    {label: 'finder', bundle: SCENES.finder},
    {label: 'chrome', bundle: chromeApp ?? SCENES.chrome},
    {label: 'electron', bundle: SCENES.electron},
  ]));
  out.rows = readRows();
  out.after = front('step9');
  return out;
});

// Step 10: the onboarding stages by rows (R5): none, Accessibility only, Screen Recording added, the relaunch. At each:
// the engine's grants, doctor's engine row, one observation, and what `cua engine approve` says with nobody there.
async function stage(name, {relaunch}) {
  const out = {};
  if (relaunch) out.relaunch = await relaunchLS(); else {
    await sleep(1000);
    const g = engineGrants();
    out.grantsLive = g.running ? g : (await launchLS()).grants;
    // A row written while the engine runs: read live, then again after a tccd restart, the engine not relaunched.
    out.tccdRestart = restartTccd();
    await sleep(2000);
    out.grantsLiveAfterTccdRestart = engineGrants();
  }
  out.grantsBeforeObservation = engineGrants();
  Object.assign(out, await sessionStep(`s10-${name}`, {CUA_NATIVE_ENGINE: 'cua'}, [{label: 'textedit', bundle: SCENES.textedit}]));
  out.grantsAfterObservation = engineGrants();
  out.focusProbe = (() => { try { const f = runProbe(PATHS.bundle, ['focus']); return {accessibility: f.accessibility, focusedApp: f.focusedApp?.bundleId ?? null}; } catch (e) { return {error: err(e)}; } })();
  return out;
}
await step('step10-onboarding', async () => {
  const out = {};
  revokeRows({client: ENGINE_BUNDLE_ID, services: ENGINE_ALL});
  out.restartForNone = restartTccd();
  await sleep(2000);
  out.none = await stage('none', {relaunch: true});
  out.none.doctor = doctorRows({CUA_NATIVE_ENGINE: 'cua'});
  out.accessibilityRow = grantRows({client: ENGINE_BUNDLE_ID, bundle: bundleOf(), services: ['accessibility']});
  await settle();
  out.accessibilityOnly = await stage('ax', {relaunch: false});
  out.accessibilityOnly.doctor = doctorRows({CUA_NATIVE_ENGINE: 'cua'});
  // A running engine does not see a row written under it (runs 45141067063, 45144483807): Accessibility only, relaunched.
  out.accessibilityOnlyRelaunched = await stage('ax-relaunch', {relaunch: true});
  out.accessibilityOnlyRelaunched.doctor = doctorRows({CUA_NATIVE_ENGINE: 'cua'});
  out.screenRecordingRow = grantRows({client: ENGINE_BUNDLE_ID, bundle: bundleOf(), services: ['screenRecording']});
  await settle();
  out.screenRecordingAdded = await stage('sr', {relaunch: false});
  out.relaunched = await stage('relaunch', {relaunch: true});
  out.relaunched.doctor = doctorRows({CUA_NATIVE_ENGINE: 'cua'});
  const approve = sh(process.execPath, [CLI, 'engine', 'approve', '--json'], {env: cuaEnv(), timeout: 300_000});
  out.approveAtEnd = {code: approve.code, json: json(approve.stdout), stderr: approve.stderr.trim().split('\n').slice(-10).join('\n')};
  out.rows = readRows();
  out.stopped = stopEngine();
  return out;
});

await step('teardown', async () => {
  const down = ssh(`down all --run '${SCENE_RUN}'`);
  const alerts = sh('/usr/bin/log', ['show', '--last', '90m', '--style', 'ndjson', '--predicate', 'process == "replayd" AND eventMessage CONTAINS "[SCAlert "']);
  const lines = alerts.stdout.split('\n').filter(l => l.startsWith('{') && l.includes('SCAlert'));
  return {front: front('end'), down, replaydSCAlertLinesLast90m: lines.length, rowsAtEnd: readRows()};
});
log('done');
