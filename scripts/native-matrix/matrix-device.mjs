// The device side of the native matrix (scripts/native-matrix.mjs; docs/doperpowers/specs/2026-10-18-own-native-engine-
// design.md, Verification system parts 4 and 5): run from the harness checkout on the Mac that shows the scenes, over
// ssh, one JSON line on stdout per command (exit 1 with {error} when it fails). The rest of the run's device steps are
// the live hold's (./live-device.mjs begin, watch, recover) and the scenes' (scripts/repl-parity/scenes-mac.mjs).
//
//   read --run <dir> [--focus <pid,x,y,w,h>]
//       the oracle's reading (./oracle.mjs ownedReading): the frontmost application and the top on-screen window
//       (scripts/accept/front-window.swift), the run's scene processes by pid and any other application by bundle id
//       only; with --focus, the approved bundle's `--probe focus` naming that window (one of the run's): whether the
//       system's focused application is one of the run's processes, which, and whether its focused window is the one named
//   launched <scene> --run <dir> --since <unix ms>
//       a launch-path row's app (TextEdit or the Electron fixture) that the engine launched, brought down: the processes
//       of the scene's bundle id the run's state does not record and that launched at or after --since, sent SIGTERM and
//       awaited for LAUNCH_QUIT_MS; one still running is counted (the put-back's apps-check then names it) -> {found, quit, remaining}
//
// What leaves the device: the run's own pids, bounds and window numbers, other applications' bundle ids, booleans and
// counts. Never a title, a value, or another application's pid or window.
import * as fs from 'node:fs';
import {isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchOf, quitOwned} from '../accept/fixture-app.mjs';
import {readState, SCENES} from '../repl-parity/scenes-mac.mjs';
import {defaultIo} from './live-device.mjs';
import {ownedReading} from './oracle.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
// The scenes the launch path covers (part 4: the engine can launch them into their fixed state).
export const LAUNCHABLE = Object.freeze(['textedit', 'electron']);
const LAUNCH_QUIT_MS = 5_000;

// The run's scene processes. -> [pid].
export const ownedPids = state => Object.values(state?.scenes ?? {}).map(record => record?.pid).filter(Number.isInteger);

// The focus probe's report as it may leave the device. -> {appOwned, appPid, named}.
export function ownedFocus(report, owned) {
  const pid = report?.focusedApp?.pid ?? null;
  const mine = Number.isInteger(pid) && owned.includes(pid);
  return {appOwned: mine, appPid: mine ? pid : null, named: report?.named === true};
}

// The oracle's reading. io: {frontWindow(), probe(args), state()}.
export function read({focus = null}, io) {
  const owned = ownedPids(io.state());
  const out = {reading: ownedReading(io.frontWindow(), owned)};
  if (focus !== null) {
    if (!/^\d+,-?\d+(\.\d+)?,-?\d+(\.\d+)?,\d+(\.\d+)?,\d+(\.\d+)?$/.test(focus)) throw new Error('--focus needs pid,x,y,w,h');
    if (!owned.includes(Number(focus.split(',')[0]))) throw new Error('--focus names a window of a process the run does not own');
    out.focus = ownedFocus(io.probe(['focus', '--window', focus]), owned);
  }
  return out;
}

// The engine-launched app of a launch-path row, brought down. io: {state(), runningApps(bundleId), launchOf(pid), quit(pids)}.
export async function launched({scene, since}, io) {
  if (!LAUNCHABLE.includes(scene)) throw new Error(`launched covers ${LAUNCHABLE.join(' and ')}, not ${scene}`);
  if (!Number.isSafeInteger(since)) throw new Error('--since needs a unix time in ms');
  const recorded = new Set(ownedPids(io.state()));
  const floor = Math.floor(since / 1000) * 1000;
  const pids = io.runningApps(SCENES[scene].bundleId).map(p => p.pid).filter(pid => !recorded.has(pid) && (io.launchOf(pid) ?? -Infinity) >= floor);
  if (!pids.length) return {found: 0, quit: 0, remaining: 0};
  const {quit, remaining} = await io.quit(pids);
  return {found: pids.length, quit: quit.length, remaining: remaining.length};
}

function parse(argv) {
  const [command, ...rest] = argv, flags = {}, positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) { flags[rest[i].slice(2)] = rest[i + 1]; i++; } else positional.push(rest[i]);
  }
  return {command, positional, flags};
}
const USAGE = 'usage: matrix-device.mjs read --run <dir> [--focus <pid,x,y,w,h>] | launched <scene> --run <dir> --since <unix ms>';

export async function main(argv, {io: given = {}} = {}) {
  const {command, positional, flags} = parse(argv);
  if (!flags.run || !isAbsolute(flags.run)) throw new Error('--run <absolute directory> is required');
  const run = fs.realpathSync(flags.run);
  const live = defaultIo(run);
  const io = {frontWindow: live.frontWindow, probe: live.probe, runningApps: live.runningApps, state: () => readState(run), launchOf: pid => launchOf(pid),
    quit: pids => quitOwned(pids, {waitMs: LAUNCH_QUIT_MS}), ...given};
  if (command === 'read') return read({focus: flags.focus ?? null}, io);
  if (command === 'launched') return launched({scene: positional[0], since: Number(flags.since)}, io);
  throw new Error(USAGE);
}

if (process.argv[1] && SCRIPT === fs.realpathSync(process.argv[1])) {
  main(process.argv.slice(2)).then(
    out => { process.stdout.write(JSON.stringify(out) + '\n'); },
    error => { process.stdout.write(JSON.stringify({error: error.message}) + '\n'); process.exitCode = 1; });
}
