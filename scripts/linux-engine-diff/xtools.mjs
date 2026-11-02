// The harness's own X tools, and the display they reach (#171 M4, the design session, 2026-11-02: the harness never
// changes a window it did not open). Every tool the harness runs that can change a window, `xdotool` and xprobe's
// commands, connects through `harnessEnv()`: while a Desktop's run is on, the run's own trace (an xtrace proxy that
// `Desktop.begin` starts), so the audit of that trace sees every such request; otherwise the session's display. Only
// observers that read stay off it, for their timing or their volume: the witness, xprobe's RECORD and selection watches,
// `retention`, `snap` and `imgdiff`, and the read-only `xprop` and `xwininfo`. The engines have their own traced pass.

import { execFileSync, spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const XPROBE = join(here, 'xprobe', 'target', 'release', 'xprobe');

let traced = null;

/** The run's trace display for the harness's own tools (`env`, from `startProxy`), or `null` for the session's again. */
export function useHarnessDisplay(env) {
  traced = env;
}

/** The environment the harness's own X tools run with. */
export const harnessEnv = () => traced ?? process.env;

export function xdotool(...args) {
  return execFileSync('xdotool', args.map(String), { encoding: 'utf8', timeout: 15000, env: harnessEnv() }).trim();
}

/** `xdotool` as a process of its own (a chain that runs beside a request). */
export function spawnXdotool(args, options = {}) {
  return spawn('xdotool', args.map(String), { ...options, env: harnessEnv() });
}

/** One xprobe command, its stdout as text. */
export function xprobe(args, options = {}) {
  return execFileSync(XPROBE, args.map(String), { encoding: 'utf8', timeout: 15000, ...options, env: harnessEnv() });
}

/** An xprobe command that keeps running (a recorder, the clipboard owner, an overlay). */
export function spawnXprobe(args, options = {}) {
  return spawn(XPROBE, args.map(String), { ...options, env: harnessEnv() });
}
