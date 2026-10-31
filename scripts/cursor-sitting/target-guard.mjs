// The sitting's guard on its targets (the kit's task review, finding 1): before any cell that acts on a harness scene is
// sent, outside the engine (no observation of the engine's is added: the cursor's states are request-sensitive), the
// scene must still be the run's own: its process the launch the scene recorded (pid and launch time,
// scripts/accept/fixture-app.mjs isSameLaunch), and that process's front on-screen document window the run's window by number
// (FrontWindowProbe's `windows` reading, front to back, scripts/accept/front-window.swift). A cell that sends keys
// further needs that window on top of the frontmost process (#162's window-aware key guard,
// scripts/accept/key-guard.mjs sendIfFrontmost with a window target, the reading skipping the engine's own windows: its
// cursor panels). A changed target is refused and nothing more is sent on that session.
// The probe runs as a binary compiled once (scripts/native-matrix/matrix-device.mjs compiled) into the harness cache:
// the interpreted script takes seconds a reading.
import {execFileSync} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {launchOf} from '../accept/fixture-app.mjs';
import {FRONT_WINDOW_SCRIPT} from '../accept/key-guard.mjs';
import {compiled} from '../native-matrix/matrix-device.mjs';
import {bundlePids} from '../native-matrix/live-checks.mjs';
import {processTable} from '../native-matrix/live-device.mjs';
import {appWindows, frontWindow} from '../repl-parity/scenes-mac-device.mjs';
import {documentWindows} from '../repl-parity/scenes-mac.mjs';

export const PROBE_CACHE = join(homedir(), 'Library', 'Caches', 'cua-harness', 'cursor-sitting');

// The scenes a cell acts on, from the marker every scene cell carries (./cells.mjs head).
export const SCENE_MARKER = scene => `/* cursor-sitting:scene ${scene} */`;
export const scenesOf = code => [...new Set([...String(code).matchAll(/\/\* cursor-sitting:scene (\w+) \*\//g)].map(m => m[1]))];

// Why `record` ({id, pid, at, window: {number}}) is no longer the run's target, or null. `readings`: {launchAt (the pid's
// launch time now, or null), windows (the pid's layer-0 windows, front to back)}.
export function targetProblem(record, {launchAt, windows}) {
  if (!Number.isSafeInteger(record?.pid) || !Number.isFinite(record?.at) || !Number.isSafeInteger(record?.window?.number))
    return `the ${record?.id} scene's record names no launch and window to check`;
  if (launchAt !== record.at) return `the ${record.id} scene's process ${record.pid} is no longer the launch the scene recorded`;
  // On-screen windows only: a minimised window or one on another Space is not a window the agent may act in now.
  const front = documentWindows(windows ?? []).filter(w => w.onScreen !== false)[0] ?? null;
  if (!front || front.number !== record.window.number)
    return `the ${record.id} app's front window is ${front ? `window ${front.number}` : 'none'}, not the run's window ${record.window.number}`;
  return null;
}

// The live readings, with the probe compiled once. -> {problem(record), frontmost(), windows(pid)}.
export function liveTargetGuard({bundle, cache = PROBE_CACHE} = {}) {
  let bin = null;
  const exec = (command, args, options) => {
    bin ??= compiled(FRONT_WINDOW_SCRIPT, cache);
    return execFileSync(bin, args.slice(1), {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...options});
  };
  const enginePids = () => (bundle ? bundlePids(processTable(), [bundle]) : []);
  return {
    problem: record => {
      try { return targetProblem(record, {launchAt: launchOf(record.pid), windows: appWindows(record.pid, {exec})}); } catch (error) {
        return `the ${record.id} scene could not be read (${error.message.split('\n')[0]})`;
      }
    },
    // The frontmost process with its top window, the engine's windows passed over (key-guard's frontmostFromProbe shape).
    frontmost: () => { const r = frontWindow({skipPids: enginePids(), exec}); return r?.frontmost?.pid ? {...r.frontmost, topWindow: r.topWindow ?? null} : null; },
    // A process's layer-0 windows, front to back ({number, bounds, onScreen}): where a scene's run window is now.
    windows: pid => appWindows(pid, {exec}),
    compile: () => { bin ??= compiled(FRONT_WINDOW_SCRIPT, cache); return bin; },
  };
}
