// The shared alert guard's device side (rulings 1154, 1160, 1164; ./alert-guard.mjs): run on the Mac that shows the
// scenes, from a checkout of this repository (over ssh by sittings A and B, in the job's checkout by D), one JSON line on
// stdout per command (exit 1 with {error} when it fails). The matrix reads the same through its own device
// (scripts/native-matrix/matrix-device.mjs read --with alert-bounds, place).
//
//   read --target <scene>:<pid>[:<window>[:only]] ... [--key] [--key-window]
//       one fresh reading: the alert windows' bounds and the target's windows' (./alert-guard.mjs guardReading; null
//       when the window list was unread), the displays, the front application's bundle id (lsappinfo), and with --key
//       the key application's bundle id and whether its focused window is one of the targets' (the approved engine's
//       `--probe focus`; null when unread); with --key-window the first target's app's own key window against its scene
//       window (./key-window.mjs ownKeyWindow, the key-window requirement). -> {bounds, front, key, keyWindow?, ownKey?, at}
//   place --pid <n> | --panel  --window <number> --frame <x,y,w,h>
//       the window moved to the frame by the approved engine's `--probe window-frame` and read back; the window must be
//       one of pid's (or, with --panel, the Open panel's, its service's pid read from the window list), never another
//       application's -> {requested, readBack, matched, exitStatus, pid}
//
// What leaves the device: the targets' and the alerts' numbers and bounds, bundle ids, booleans. Never a title.
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {FRONTMOST_PROCESS_SCRIPT, parseFrontmostProcess} from '../accept/key-guard.mjs';
import {defaultIo as liveIo} from '../native-matrix/live-device.mjs';
import {compiled} from '../native-matrix/matrix-device.mjs';
import {guardReading, isPanelWindow} from './alert-guard.mjs';
import {AX_STATE_SCRIPT, ownKeyWindow} from './key-window.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const SYSTEM_WINDOWS_SCRIPT = fileURLToPath(new URL('../native-matrix/system-windows.swift', import.meta.url));
// The compiled window reader's home: an interpreted read costs seconds, so it is compiled once and reused.
export const GUARD_CACHE = join(homedir(), 'Library', 'Caches', 'cua-harness', 'guard-device');

// `<scene>:<pid>[:<window>[:only]]` -> {scene, pid, number, only}.
export function parseTarget(text) {
  const [scene, pid, number, only] = String(text).split(':');
  if (!/^[A-Za-z]+$/.test(scene ?? '') || !/^\d+$/.test(pid ?? '') || (number !== undefined && !/^\d+$/.test(number)) || (only !== undefined && only !== 'only')) {
    throw new Error('--target needs <scene>:<pid>[:<window>[:only]]');
  }
  return {scene, pid: Number(pid), number: number === undefined ? null : Number(number), only: only === 'only'};
}

const bundleOf = value => (typeof value === 'string' && value.length > 0 && value.length <= 255 ? value : null);
const tryRead = read => { try { return read() ?? null; } catch { return null; } };

// One fresh reading (see the header). io: {screen() -> {windows, displays}, frontmost() -> {pid, bundleId}, focus() ->
// the focus probe's report, axState(pid, bounds) -> ax-state.swift window's answer}.
export function readGuard({targets, key = false, keyWindow = false}, io) {
  const from = Date.now();
  const screen = tryRead(io.screen);
  const out = {bounds: guardReading(screen?.windows, targets, screen?.displays ?? undefined), front: bundleOf(tryRead(io.frontmost)?.bundleId), key: null};
  if (key) {
    const report = tryRead(io.focus);
    out.key = bundleOf(report?.focusedApp?.bundleId);
    const pid = report?.focusedWindow?.pid, owned = Number.isInteger(pid) && targets.some(t => t.pid === pid);
    out.keyWindow = owned ? {owned, bounds: report.focusedWindow.bounds ?? null} : {owned: false};
  }
  if (keyWindow && targets.length) {
    out.ownKey = Array.isArray(screen?.windows) ? ownKeyWindow(screen.windows, targets[0], io.axState)
      : {scene: targets[0].scene, number: null, trusted: null, ok: false, reason: 'the window list was unread'};
  }
  return {...out, at: [from, Date.now()]};
}

// The window moved and read back (see the header). io: {screen(), frameProbe(args)}.
export function placeWindow({pid = null, panel = false, window, frame}, io) {
  const number = Number(window);
  const shown = (io.screen()?.windows ?? []).find(w => w.number === number);
  if (panel) { if (!shown || !isPanelWindow(shown)) throw new Error(`--window names no Open panel window on screen (${window})`); }
  else if (!shown || shown.ownerPid !== Number(pid)) throw new Error(`--window ${window} is not a window of pid ${pid} on screen`);
  const parts = String(frame ?? '').split(',').map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite)) throw new Error('--frame needs x,y,w,h');
  const requested = Object.fromEntries(['x', 'y', 'width', 'height'].map((k, i) => [k, parts[i]]));
  const out = io.frameProbe(['window-frame', '--pid', String(shown.ownerPid), '--window', String(number), '--frame', parts.join(',')]);
  const readBack = out?.readBack ?? null;
  return {requested, readBack, matched: out?.matched === true && ['x', 'y', 'width', 'height'].every(k => readBack?.[k] === requested[k]),
    exitStatus: out?.exitStatus ?? null, pid: shown.ownerPid};
}

export function defaultGuardIo({cache = GUARD_CACHE} = {}) {
  const live = liveIo(null);
  const tool = script => { fs.mkdirSync(cache, {recursive: true, mode: 0o700}); return compiled(script, cache); };
  const windowsReader = () => tool(SYSTEM_WINDOWS_SCRIPT);
  return {
    screen: () => JSON.parse(spawnSync(windowsReader(), [], {encoding: 'utf8', timeout: 60_000}).stdout),
    frontmost: () => parseFrontmostProcess(spawnSync('/bin/sh', ['-c', FRONTMOST_PROCESS_SCRIPT], {encoding: 'utf8', timeout: 10_000}).stdout ?? ''),
    focus: () => live.probe(['focus']),
    frameProbe: args => live.probe(args),
    axState: (pid, bounds) => JSON.parse(spawnSync(tool(AX_STATE_SCRIPT), ['window', String(pid), bounds], {encoding: 'utf8', timeout: 30_000}).stdout),
  };
}

export async function main(argv, {io = null} = {}) {
  const [command, ...rest] = argv;
  const {values} = parseArgs({args: rest, options: {target: {type: 'string', multiple: true}, key: {type: 'boolean', default: false}, 'key-window': {type: 'boolean', default: false}, pid: {type: 'string'},
    panel: {type: 'boolean', default: false}, window: {type: 'string'}, frame: {type: 'string'}}});
  const use = io ?? defaultGuardIo();
  if (command === 'read') return readGuard({targets: (values.target ?? []).map(parseTarget), key: values.key, keyWindow: values['key-window']}, use);
  if (command === 'place') {
    if (!values.window || (!values.panel && !/^\d+$/.test(values.pid ?? ''))) throw new Error('place needs --pid <n> or --panel, --window <number> and --frame <x,y,w,h>');
    return placeWindow({pid: values.pid ?? null, panel: values.panel, window: values.window, frame: values.frame}, use);
  }
  throw new Error('usage: guard-device.mjs read --target <scene>:<pid>[:<window>[:only]] ... [--key] [--key-window] | place --pid <n>|--panel --window <number> --frame <x,y,w,h>');
}

if (process.argv[1] && SCRIPT === fs.realpathSync(process.argv[1])) {
  main(process.argv.slice(2)).then(
    out => { process.stdout.write(`${JSON.stringify(out)}\n`); },
    error => { process.stdout.write(`${JSON.stringify({error: error.message})}\n`); process.exitCode = 1; });
}
