// The one spawner of everything the harness starts that reaches an X display (#171 M4, task 47; the design session's
// ruling B1, sminos 332): its X tools (xtrace, xprop, xprobe, Xvfb, xdpyinfo, xdotool, xwininfo, xclip and the rest),
// the engines, the scene applications and the run's Chrome, and the session bus daemon, whose activated launcher
// marks the display. Before anything starts it refuses a display the run did not create, unless this process is a
// declared live run (`declareLiveRun`, which the harness's entry points make and a test never can). Two hermetic paths
// reached the person's `:0` before this: x11rb sends a `unix:<path>` or `/path` display string to `/tmp/.X11-unix/X0`
// whatever the path names (task 41), and a red run started a real `xtrace -d :0` (task 45). So the rule is an allowlist
// of exact names, never a reading of what a string might mean:
// - `:N` or `:N.S` for a display this process created: a private X server it started (`startPrivateServer`), or the
//   run's trace proxy in front of one (`startProxy`);
// - a name of the hermetic family `:cua171-…`, which no X library parses as a display (hermetic.mjs's `TEST_DISPLAY`);
// - anything at all in a declared live run, which reaches the person's display by design.
// Every other display, an unset DISPLAY included, is refused. The displays a command reaches are its environment's
// DISPLAY and the value of any display flag on its command line (`-d`, `-display`, `--display`). `guard(launch)` puts the
// check in front of any launcher, an injected one included, so a fake a test passes cannot be bypassed: the check runs
// before the launcher is asked. An accident guard, as the private-display mark is: a live run is declared by the
// environment (`CUA171_LIVE_RUN`, inherited by the run's own children, such as the stub engine), never honored in a test.

import './hermetic.mjs';

import { execFileSync, spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { basename } from 'node:path';

import { inTest } from './hermetic.mjs';

/** The variable that declares a live run: its reason. Inherited by the run's own processes. */
export const LIVE_RUN = 'CUA171_LIVE_RUN';

/** A name of the hermetic family: no X library parses it as a display, so it reaches none. */
const NO_DISPLAY = /^:cua171-[a-z0-9-]+$/;

/** The displays this process created (`:N`), each with what created it. */
const created = new Map();

/** A start refused because it would reach a display the run did not create. */
export class DisplayRefused extends Error {}

/**
 * Declares this process a live run, one that reaches the person's display by design (the harness's entry points, each
 * calling it first). In a test it declares nothing and answers false: a test reaches only the displays it started, and
 * an entry point a test runs (the harness's CLI, in candidate.test.mjs) runs hermetically. Answers whether it declared.
 */
export function declareLiveRun(why) {
  if (!why) throw new Error('a live run says what it is');
  if (inTest()) return false;
  process.env[LIVE_RUN] = String(why);
  return true;
}

/** Whether this process is a declared live run (never in a test). */
export const isLiveRun = (env = process.env) => !inTest(env) && Boolean(env[LIVE_RUN]);

/** `:N` for `:N` or `:N.S`, a local display by number; null for any other form. */
export function localDisplay(display) {
  const m = /^:(\d+)(?:\.\d+)?$/.exec(String(display ?? ''));
  return m ? `:${Number(m[1])}` : null;
}

/** The X sockets now (`/tmp/.X11-unix/X<N>`), by display: what a server this process starts must not report. */
export function displaySockets(dir = '/tmp/.X11-unix') {
  try {
    return new Set(readdirSync(dir).map((name) => /^X(\d+)$/.exec(name)?.[1]).filter(Boolean).map((n) => `:${Number(n)}`));
  } catch {
    return new Set();
  }
}

/**
 * Registers `display` as one this process created (`what`: a private server, or a proxy in front of a created one), so
 * its tools may reach it. Never `:0`, the person's, and never a display whose socket existed before the server was
 * started (`before`, `displaySockets` read before the spawn): another server's. Returns the release.
 */
export function registerDisplay(display, what, { before = new Set() } = {}) {
  const local = localDisplay(display);
  if (!local) throw new Error(`${display} is not a local display the run can create`);
  if (local === ':0') throw new Error(`${what} named :0, the person's display: it is never one the run created`);
  if (before.has(local)) throw new Error(`${what} named ${local}, whose socket was there before it started: that display is another server's`);
  created.set(local, what);
  return () => {
    if (created.get(local) === what) created.delete(local);
  };
}

/** Whether `display` is one this process created and still holds. */
export const isCreatedDisplay = (display) => created.has(localDisplay(display));

/** The displays a command line reaches: its environment's DISPLAY, and each display flag's value. */
export function displaysReached(args, env) {
  const out = [env.DISPLAY];
  const list = args.map(String);
  for (let i = 0; i < list.length; i++) {
    if (['-d', '-display', '--display'].includes(list[i])) out.push(list[i + 1]);
    const m = /^--?display=(.*)$/s.exec(list[i]);
    if (m) out.push(m[1]);
  }
  return out;
}

/** Why `display` may not be reached, or null when it may. */
function refusalOf(display) {
  if (typeof display === 'string' && NO_DISPLAY.test(display)) return null;
  if (isCreatedDisplay(display)) return null;
  if (display === undefined || display === '') return 'DISPLAY is unset, and a tool may then take a default display';
  return 'the run did not create it, and this is no declared live run';
}

/** Throws `DisplayRefused` unless every display `cmd` would reach (`displaysReached`) is one it may. */
export function assertReachable(cmd, args = [], env = process.env) {
  if (isLiveRun()) return;
  for (const display of displaysReached(args, env)) {
    const why = refusalOf(display);
    if (why) throw new DisplayRefused(`refusing to start ${basename(String(cmd))} on the X display ${display || '(none)'}: ${why}. A hermetic run reaches only the displays it started (xspawn.mjs)`);
  }
}

/** `launch` (`(cmd, args, options)`, a spawn or an execFileSync, injected or not) with the display check in front. */
export function guard(launch) {
  return (cmd, args = [], options = {}) => {
    assertReachable(cmd, args, options.env ?? process.env);
    return launch(cmd, args, options);
  };
}

/** `spawn` behind the display check. */
export const xSpawn = guard(spawn);

/** `execFileSync` behind the display check. */
export const xExecFileSync = guard(execFileSync);
