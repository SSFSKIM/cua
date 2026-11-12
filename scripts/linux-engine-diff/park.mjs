// The real pointer's park, verified (#171 M4, T16's fix wave; the design session, 2026-11-10). Where the real pointer
// sits can decide a background input's fate (Gecko takes background pointer input only while the pointer is in its
// window, T19; GTK 3 has a hover dependence, #356; LibreOffice corrects its positions at the first pointer event, T16),
// and a park assumed rather than read has misled both T19's and T16's runs: an "outside" park inside a maximized
// window delivered a pointer event to the very application under test. So a park moves the real pointer, then reads
// where it landed through `QueryPointer`'s child chain (`xprobe pointer-chain`) and refuses the trial unless the
// pointer is at the point and on the intended window, or on the bare root where a runner means the root. A refused park
// throws `ParkRefused`, so its trial never counts. (A park that ends on the root names a window the run did not open, by
// the harness's own audit, `foreign.mjs`: a runner that wants the pointer off its application parks it on a window of
// its own, as `parkOnFront` does.)

import { xExecFileSync } from './xspawn.mjs';
import { XPROBE, xdotool, xprobe } from './xtools.mjs';

/** A park whose pointer did not land where it was meant to: the trial is refused and never counts. */
export class ParkRefused extends Error {
  constructor(message) {
    super(message);
    this.name = 'ParkRefused';
  }
}

/** The intent of an outside park: nothing but the root under the pointer. */
export const ROOT = 'root';

const hex = (id) => `0x${Number(id).toString(16).padStart(8, '0')}`;

/**
 * Whether a pointer reading (`xprobe pointer-chain`: `{x, y, same_screen, chain}`, the chain from the root's child
 * down) shows the pointer parked at `point` over `intended`: `ROOT` for the bare root (an empty chain), else a window
 * id, which must be in the chain (a reparenting window manager's frame holds the client, and a toolkit may put child
 * windows under it). Returns `{ok, why}`, `why` saying what was found instead.
 */
export function parkVerdict(reading, point, intended) {
  if (!reading || !Array.isArray(reading.chain)) return { ok: false, why: 'the pointer could not be read' };
  if (reading.same_screen === false) return { ok: false, why: "the pointer is on another screen than the root's" };
  if (reading.x !== point.x || reading.y !== point.y) return { ok: false, why: `the pointer is at (${reading.x}, ${reading.y}), not at (${point.x}, ${point.y})` };
  if (intended === ROOT) {
    return reading.chain.length === 0 ? { ok: true } : { ok: false, why: `the pointer is over window ${hex(reading.chain[0])}, not on the bare root` };
  }
  if (!Number.isSafeInteger(intended) || intended <= 0) throw new Error(`a park's intended window must be a window id or ROOT, not ${intended}`);
  if (reading.chain.includes(intended)) return { ok: true };
  return { ok: false, why: reading.chain.length ? `the pointer is over ${reading.chain.map(hex).join(' > ')}, not over window ${hex(intended)}` : `the pointer is on the bare root, not over window ${hex(intended)}` };
}

/** A synchronous pause, for the reading taken again. */
const pauseMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** The real pointer now: `xprobe pointer-chain`'s reading. */
export const readPointer = () => JSON.parse(xprobe(['pointer-chain']));

/**
 * Parks the real pointer at a screen point `{x, y}` (xdotool, on the harness's display) and verifies it there over
 * `intended` (a window id, or `ROOT`). Throws `ParkRefused` otherwise. Returns the reading. `move` and `read` are the
 * display's tools, given only by the tests.
 */
export function parkPointer(point, intended, { move = (p) => xdotool('mousemove', p.x, p.y), read = readPointer, tries = 10, pause = pauseMs } = {}) {
  // no `--sync`: xdotool's waits for the pointer to move and never ends when it is already at the point; the reading
  // is taken again while it is not yet there
  move(point);
  let reading = read();
  for (let k = 1; k < tries && (reading?.x !== point.x || reading?.y !== point.y); k++) {
    pause(20);
    reading = read();
  }
  const verdict = parkVerdict(reading, point, intended);
  if (!verdict.ok) throw new ParkRefused(`the pointer's park at (${point.x}, ${point.y}) is refused: ${verdict.why}`);
  return reading;
}

/**
 * `parkPointer`'s `move` and `read` on a display of a runner's own (`env`, its `DISPLAY`), for a runner whose tools
 * do not run on the harness's display (events.mjs's private server). `exec` is given only by the tests.
 */
export function displayTools(env, exec = xExecFileSync) {
  const options = { encoding: 'utf8', timeout: 15000, env };
  return {
    move: (p) => exec('xdotool', ['mousemove', String(p.x), String(p.y)], options),
    read: () => JSON.parse(exec(XPROBE, ['pointer-chain'], options)),
  };
}

/**
 * The real pointer parked at a screen point `{x, y}` where the run's window on top there is meant, or the bare root
 * where none is: what is on top is read at the point just before the move (`desktop.topAt` among the run's windows),
 * and a point under another's window, or under a window of the run's it no longer owns (scenes.mjs `pointerSafeAt`),
 * is refused unmoved. The park is then verified (`parkPointer`, whose `options` these are). Throws `ParkRefused`.
 */
export function parkAt(desktop, point, options = {}) {
  const ids = desktop.windows.map((w) => w.id).filter((id) => Number.isSafeInteger(id) && id > 0);
  const { top, holds } = desktop.topAt(point, ids);
  if (top && !(typeof holds === 'number' && desktop.liveOwned(holds))) throw new ParkRefused(`the pointer's park point (${point.x}, ${point.y}) is over a window the run did not open`);
  return parkPointer(point, top ? holds : ROOT, options);
}

/**
 * The real pointer put back where a case found it, once the case is over (`parkAt`, verified the same way): a restore
 * is no trial's park, so one refused does not fail the run but is recorded (`desktop.skip`) and answers null.
 */
export function restorePointer(desktop, point, options = {}) {
  try {
    return parkAt(desktop, point, options);
  } catch (error) {
    if (!(error instanceof ParkRefused)) throw error;
    desktop.skip('pointer restore', `(${point.x}, ${point.y})`, error.message);
    return null;
  }
}

/** The middle of the run's front window (`desktop.front`, the harness's own xterm): `{id, x, y}`, or null for none. */
export function frontPoint(desktop) {
  const id = desktop.front?.id;
  if (!id) return null;
  const g = Object.fromEntries(xdotool('getwindowgeometry', '--shell', id).split('\n').map((l) => l.split('=')).map(([k, v]) => [k, Number(v)]));
  return { id, x: g.X + Math.floor(g.WIDTH / 2), y: g.Y + Math.floor(g.HEIGHT / 2) };
}

/**
 * The real pointer parked on the run's front window (`desktop.front`, the harness's own xterm), at its client's centre,
 * and verified there: a neutral place off every application under test, from which a later park reaches its own point
 * without moving over another window. Returns the reading, or null for a run with no front window.
 */
export function parkOnFront(desktop, options = {}) {
  const front = frontPoint(desktop);
  return front ? parkPointer(front, front.id, options) : null;
}

