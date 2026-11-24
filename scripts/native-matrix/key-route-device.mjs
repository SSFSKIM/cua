// The key-route diagnostic's device side (ruling 1198; #117 M5): run from the harness checkout on the Mac that shows the
// scenes, over ssh (./lane.mjs matrixOps keyRoute), one JSON line on stdout per command (exit 1 with {error} when it
// fails). Every command answers `at`, the device clock around it, so the run charges any activation to its step.
// Hosted only, every command: off a GitHub-hosted runner each answers {answer: {refused}, at} before it reads, compiles,
// opens or writes anything, and the hosted-only functions below check for themselves too.
//
//   read --run <dir> --pid <TextEdit's pid>
//       ./key-route.swift read: the focused element's AXParent chain with AXUIElementGetPid and _AXUIElementGetActualPid,
//       the owners' activation policies, cua's keyboardTarget mirrored, the selected ancestor, and the public routes,
//       each read or named unread -> {answer, at}
//   panel --run <dir> --pid <n> [--frame <x,y,w,h>]
//       whether TextEdit's Open panel is up, by Accessibility and, given the frame `read` found it at, the window list
//       (./key-route.swift panel) -> {answer: {trusted, up, ax, windowAtFrame, frame, unread}, at}; `up` is false only
//       when every reading made says so, null when none could be made
//   cancel --run <dir> --pid <n> [--frame <x,y,w,h>]
//       the panel cancelled by Accessibility, never an engine nor a pointer event (./key-route.swift cancel) ->
//       {answer: {found, via, pressed, closed, unread}, at}; `closed` only when the reading after it says the panel is gone
//   tap start --run <dir> --pid <label>:<pid> ...
//       the tap app (./key-route-tap.swift, built at TAP_APP by the sitting step's buildTapApp) launched through
//       LaunchServices, so it is its own responsible process and its own Input Monitoring row is the one asked, admitted
//       by a fresh nonce in <run>/key-route/tap.admission written just before the launch, and awaited until it reports
//       its taps -> {answer: {launched, ready, pid, listenAccess, taps} | {launched: false, reason}, at}
//   tap stop --run <dir>
//       the tap told to stop (its stop file), awaited, and killed only when it outlives that (its own process, checked by
//       its executable) -> {answer: {exited, killed, why, logRead, ready, events: [{label, tapPid, target, source, at}]}, at}
//
// What leaves the device: pids, roles, bundle ids, activation policies, booleans and the Escape's event fields 40 and 41.
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import * as fs from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertGithubHosted, isGithubHosted} from '../hosted-sittings/runner.mjs';
import {compiled} from './matrix-device.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
export const KEY_ROUTE_SCRIPT = fileURLToPath(new URL('./key-route.swift', import.meta.url));
export const TAP_SCRIPT = fileURLToPath(new URL('./key-route-tap.swift', import.meta.url));
// The tap app: its own bundle id (the TCC writer's DIAGNOSTIC_CLIENT, ../hosted-sittings/tcc.mjs), in the account's
// harness cache, where the sitting step builds it and the device side (the same account over the loopback) launches it.
export const TAP_BUNDLE_ID = 'io.github.ssfskim.cua.key-route-tap';
export const TAP_APP = join(homedir(), 'Library', 'Caches', 'cua-harness', 'key-route', 'KeyRouteTap.app');
export const TAP_EXECUTABLE = join(TAP_APP, 'Contents', 'MacOS', 'key-route-tap');
// The tap's own bound (it exits by itself after it), its readiness and exit waits.
export const TAP_MAX_SECONDS = 120;
export const TAP_READS = 50, TAP_READ_MS = 200;
const REFUSED = 'it runs only on a GitHub-hosted runner (RUNNER_ENVIRONMENT=github-hosted), never on a Mac of the owner\'s';

const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>${TAP_BUNDLE_ID}</string>
  <key>CFBundleExecutable</key><string>key-route-tap</string>
  <key>CFBundleName</key><string>KeyRouteTap</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSBackgroundOnly</key><true/>
</dict>
</plist>
`;

// The tap app built afresh and ad-hoc signed under its own identifier, so its designated requirement (its cdhash) is the
// one the TCC row written after it names. Hosted only: it is built for the runner's sitting and nowhere else.
// -> {app, bundleId}.
export function buildTapApp({exec = (cmd, args) => execFileSync(cmd, args, {stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000}), fsys = fs, env = process.env, platform = process.platform} = {}) {
  assertGithubHosted(env, platform, 'the key-route tap app');
  fsys.rmSync(TAP_APP, {recursive: true, force: true});
  fsys.mkdirSync(dirname(TAP_EXECUTABLE), {recursive: true, mode: 0o700});
  exec('/usr/bin/swiftc', ['-O', TAP_SCRIPT, '-o', TAP_EXECUTABLE]);
  fsys.writeFileSync(join(TAP_APP, 'Contents', 'Info.plist'), INFO_PLIST);
  exec('/usr/bin/codesign', ['--force', '--sign', '-', '--identifier', TAP_BUNDLE_ID, TAP_APP]);
  return {app: TAP_APP, bundleId: TAP_BUNDLE_ID};
}

const linesOf = text => String(text ?? '').split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
const stateFile = run => join(run, 'key-route', 'tap.json');

// The tap launched (see the header). io: {env, platform, now, nonce, exists, mkdir, remove, open(args), readText,
// writeText, sleep}.
export async function startTap({run, targets}, io) {
  if (!isGithubHosted(io.env, io.platform)) return {launched: false, refused: `the key-route tap: refused: ${REFUSED}`};
  if (!targets.length || !targets.every(t => /^[A-Za-z]+:[1-9]\d*$/.test(t))) throw new Error('tap start needs --pid <label>:<pid>, at least one');
  if (!io.exists(TAP_EXECUTABLE)) return {launched: false, reason: `the tap app is not built at ${TAP_APP} (the sitting step builds it)`};
  const dir = join(run, 'key-route'), log = join(dir, 'tap.jsonl'), stop = join(dir, 'tap.stop'), admission = join(dir, 'tap.admission');
  io.mkdir(dir);
  io.remove(log);
  io.remove(stop);
  // This launch's admission (the tap checks it, as `open` hands it none of this guarded caller's environment).
  const nonce = io.nonce();
  io.writeText(admission, JSON.stringify({nonce, at: io.now()}));
  io.open(['-n', '-g', '-a', TAP_APP, '--args', '--admission', admission, '--nonce', nonce, '--out', log, '--stop', stop,
    '--max-seconds', String(TAP_MAX_SECONDS), ...targets.flatMap(t => ['--pid', t])]);
  let ready = null;
  for (let n = 0; n < TAP_READS && !ready; n++) {
    if (n) await io.sleep(TAP_READ_MS);
    ready = linesOf(io.readText(log)).find(line => line.ready === true) ?? null;
  }
  // Kept whatever happened, so `tap stop` tells a tap that is still starting to stop too.
  io.writeText(stateFile(run), JSON.stringify({log, stop, pid: Number.isSafeInteger(ready?.pid) ? ready.pid : null}));
  if (!ready) return {launched: true, ready: false, reason: `the tap reported no readiness within ${(TAP_READS * TAP_READ_MS) / 1000} s`};
  return {launched: true, ready: true, pid: ready.pid, listenAccess: ready.listenAccess === true, taps: Array.isArray(ready.taps) ? ready.taps : []};
}

// The tap stopped (see the header). io: startTap's, with alive(pid), isTap(pid), kill(pid). `logRead`: the tap's log
// was read (readText answers null when it was not), `ready`: it holds the tap's readiness line, so a log that could
// not be read is never taken for a tap that saw no Escape.
export async function stopTap({run}, io) {
  const none = {exited: null, killed: false, why: null, logRead: false, ready: false, events: []};
  if (!isGithubHosted(io.env, io.platform)) return {...none, refused: `the key-route tap: refused: ${REFUSED}`};
  let state;
  try { state = JSON.parse(io.readText(stateFile(run))); } catch { state = null; }
  if (!state) return {...none, reason: 'no tap was started in this run'};
  io.writeText(state.stop, '');
  const waitGone = async () => {
    let alive = io.alive(state.pid);
    for (let n = 0; n < TAP_READS && alive; n++) { await io.sleep(TAP_READ_MS); alive = io.alive(state.pid); }
    return alive;
  };
  let alive = state.pid === null ? null : await waitGone(), killed = false;
  if (alive && io.isTap(state.pid)) { io.kill(state.pid); killed = true; alive = await waitGone(); }
  const text = io.readText(state.log), lines = linesOf(text);
  io.remove(stateFile(run));
  return {exited: alive === null ? null : !alive, killed, why: lines.find(line => line.stopped)?.why ?? null,
    logRead: typeof text === 'string', ready: lines.some(line => line.ready === true),
    events: lines.filter(line => line.keycode === 0x35).map(({label, tapPid, target, source, at}) => ({label, tapPid, target, source, at}))};
}

// The panel cancelled by Accessibility (`frame`: [] or the panel's known frame). io: {env, platform, helper(args)}.
export function cancelPanel(pid, io, frame = []) {
  if (!isGithubHosted(io.env, io.platform)) return {closed: false, refused: `the key-route cancel: refused: ${REFUSED}`};
  return io.helper(['cancel', String(pid), ...frame]);
}

const sleep = ms => new Promise(done => setTimeout(done, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
export function defaultIo(run) {
  return {
    env: process.env, platform: process.platform, sleep, now: Date.now, nonce: () => randomBytes(16).toString('hex'),
    helper: args => JSON.parse(execFileSync(compiled(KEY_ROUTE_SCRIPT, run), args, {encoding: 'utf8', timeout: 60_000})),
    exists: path => fs.existsSync(path), mkdir: path => fs.mkdirSync(path, {recursive: true, mode: 0o700}), remove: path => fs.rmSync(path, {force: true}),
    readText: path => { try { return fs.readFileSync(path, 'utf8'); } catch { return null; } }, writeText: (path, text) => fs.writeFileSync(path, text, {mode: 0o600}),
    open: args => execFileSync('/usr/bin/open', args, {stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000}),
    alive, kill: pid => { try { process.kill(pid, 'SIGTERM'); } catch {} },
    isTap: pid => { try { return execFileSync('/bin/ps', ['-p', String(pid), '-o', 'args='], {encoding: 'utf8', timeout: 10_000}).includes(TAP_EXECUTABLE); } catch { return false; } },
  };
}

function parse(argv) {
  const [command, ...rest] = argv, flags = {pid: []}, positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) { positional.push(rest[i]); continue; }
    const name = rest[i].slice(2), value = rest[++i];
    if (name === 'pid') flags.pid.push(value); else flags[name] = value;
  }
  return {command, positional, flags};
}
const USAGE = 'usage: key-route-device.mjs read --run <dir> --pid <n> | panel|cancel --run <dir> --pid <n> [--frame <x,y,w,h>] | tap start --run <dir> --pid <label>:<pid>... | tap stop --run <dir>';
const timed = async fn => { const from = Date.now(); const answer = await fn(); return {answer, at: [from, Date.now()]}; };

export async function main(argv, {io: given = {}} = {}) {
  const {command, positional, flags} = parse(argv);
  // Hosted only, every command, before anything is dispatched or compiled.
  if (!isGithubHosted(given.env ?? process.env, given.platform ?? process.platform)) return timed(() => ({refused: `the key-route device: refused: ${REFUSED}`}));
  if (!flags.run) throw new Error(USAGE);
  const io = {...defaultIo(flags.run), ...given};
  const pid = () => { if (flags.pid.length !== 1 || !/^[1-9]\d*$/.test(flags.pid[0])) throw new Error(USAGE); return flags.pid[0]; };
  const frame = () => {
    if (flags.frame === undefined) return [];
    if (!/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/.test(flags.frame)) throw new Error('--frame needs x,y,w,h');
    return [flags.frame];
  };
  switch (command) {
    case 'read': return timed(() => io.helper(['read', pid()]));
    case 'panel': return timed(() => io.helper(['panel', pid(), ...frame()]));
    case 'cancel': return timed(() => cancelPanel(pid(), io, frame()));
    case 'tap':
      if (positional[0] === 'start') return timed(() => startTap({run: flags.run, targets: flags.pid}, io));
      if (positional[0] === 'stop') return timed(() => stopTap({run: flags.run}, io));
      throw new Error(USAGE);
    default: throw new Error(USAGE);
  }
}

if (process.argv[1] && SCRIPT === fs.realpathSync(process.argv[1])) {
  main(process.argv.slice(2)).then(
    out => { process.stdout.write(`${JSON.stringify(out)}\n`); },
    error => { process.stdout.write(`${JSON.stringify({error: error.message})}\n`); process.exitCode = 1; });
}
