// Item 1's order without a clip (the design session's ruling at the second sitting, 2026-10-31: the recording could not
// be made, since clicking the wallpaper on the owner's Mac reveals the desktop and slides the windows away). The order
// is decided from the engine's own numbers: the click's action is done when its request returns (`engineMs`, the
// client's round trip), and the cursor arrives when its planned glide reaches the engine's arrival point. Per target,
// the change comes before the arrival when engineMs plus one display frame (16.7 ms) is under the planned glide.
//
// The planned glide. The kit cannot read where an element click lands (an observation carries no element frames), so it
// bounds the glide from below instead of computing it:
// - Before the second click the cursor is put at a known point: a scroll in TextEdit's window at the point of it
//   farthest from Chrome for Testing's window (farPoint), from the windows' bounds read at that moment. The cursor then
//   glides from there to the checkbox, which lies somewhere inside Chrome's window, so the move is at least the distance
//   from that point to Chrome's rectangle (dMin).
// - For a move of at least dMin, the engine's arrival (CursorMotion.swift: progress ≥ 0.995 within 3.157 pt, else the
//   settle) can come no earlier than arrivalFloor(dMin), computed with the motion reference's own springs and settle
//   rule (native/engine/Tests/EngineTests/Fixtures/cursor-reference/reference.mjs, run as it stands; the Swift module
//   is tested against it to 1e-9). A path (over 196 pt): the progress spring at the smallest response the response
//   formula allows for that length (an arc with no detour, turn, energy or backward term: 0.81 × (0.46 + 0.22 D), D from
//   the length, which is at least the chord); the arrival cannot precede the spring reaching 0.995, or settling. A scoot
//   (196 pt or less): the point spring over every length from dMin to 196, placed where the settle rule's 1 %
//   displacement term is loosest (the panel's far corner), its arrival or settle. The floor is the least of these, so a
//   "before" with it holds for the real distance too; with a short dMin it is small and the verdict is undetermined.
// - Not counted, so only margin: the plan's 20 ms lead before the motion starts, and the time from the request's
//   receipt to the cursor's act.
// Where it can be wrong:
// - "Done when the request returns" is the ruling's: Chrome applies an AXPress in its renderer, possibly a little after.
// - The first target has no glide: the cursor fades in at it from hidden, so the rule has nothing to compare, and its
//   verdict stays open (undetermined), its engineMs kept.
// - A window moved between the bounds' reading and the click.
import {execFileSync} from 'node:child_process';
import {appendFileSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {compiled} from '../native-matrix/matrix-device.mjs';
import {PROBE_CACHE} from './target-guard.mjs';

export const REFERENCE = fileURLToPath(new URL('../../native/engine/Tests/EngineTests/Fixtures/cursor-reference/reference.mjs', import.meta.url));
export const FRAME_MS = 1000 / 60;
// Where the settle rule's displacement term (1 % of the target's distance from the panel's origin) is loosest: the far
// corner of the MacBook's built-in 1512 × 982 pt display.
const PANEL_DIAGONAL = Math.hypot(1512, 982);
// The TextEdit points the scroll may go to (fractions of its window), away from its edges.
const FAR_FRACTIONS = Object.freeze([[0.1, 0.15], [0.9, 0.15], [0.1, 0.85], [0.9, 0.85]]);

let reference = null;
// The reference's springs and constants, its own source run in a context of its own (its vectors' print discarded).
function motionReference() {
  if (reference) return reference;
  const source = readFileSync(REFERENCE, 'utf8').replace(/^#!.*\n/, '');
  const context = vm.createContext({process: {stdout: {write: () => true}}});
  vm.runInContext(`${source}\n;globalThis.__reference = {Spring, CFG, DT, V, vectorsFor};`, context);
  return (reference = context.__reference);
}

const toRect = (p, r) => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.width)), Math.max(r.y - p.y, 0, p.y - (r.y + r.height)));

// The point of TextEdit's window (`textedit`, global top-left points) farthest from Chrome's (`chrome`), among
// FAR_FRACTIONS. -> {fraction, point, dMin}.
export function farPoint(textedit, chrome) {
  return FAR_FRACTIONS.map(fraction => {
    const point = {x: textedit.x + fraction[0] * textedit.width, y: textedit.y + fraction[1] * textedit.height};
    return {fraction, point, dMin: toRect(point, chrome)};
  }).reduce((best, c) => (c.dMin > best.dMin ? c : best));
}

// The sub-steps until `spring` arrives (`arrived(spring)`) or settles, whichever comes first.
function stepsUntil(spring, arrived) {
  for (let n = 1; n <= 240 * 30; n++) {
    spring.step();
    if (spring.settled() || arrived(spring)) return n;
  }
  return 240 * 30;
}

// The earliest arrival (s) the engine could plan for a move of at least `dMin` pt. -> {seconds, mode, response?}.
export function arrivalFloor(dMin) {
  const {Spring, CFG, DT, V} = motionReference();
  const pathFloor = d => {
    const D = Math.min(Math.max((Math.max(d, CFG.scootDistanceThreshold + 1) - 180) / 760, 0), 1);
    const response = Math.max(0.9 * 0.9 * (0.42 + 0.22 * D + 0.04), CFG.springResponseMin);
    const spring = new Spring({response, damping: CFG.springDampingFraction, idle: 0.01, from: 0, to: 1, now: 0});
    return {seconds: stepsUntil(spring, s => s.x[0] >= 0.995) * DT, mode: 'path', response};
  };
  const scootFloor = d => {
    const to = PANEL_DIAGONAL, from = to - d;
    const spring = new Spring({response: CFG.scootPositionResponse, damping: CFG.scootPositionDampingFraction, idle: CFG.scootPositionSettleVelocity,
      from: V(from, 0), to: V(to, 0), now: 0});
    return {seconds: stepsUntil(spring, s => (d < 0.001 || (s.x[0] - from) / d >= 0.995) && Math.abs(to - s.x[0]) <= 3.157) * DT, mode: 'scoot'};
  };
  const floors = [pathFloor(Math.max(dMin, CFG.scootDistanceThreshold + 1))];
  for (let d = Math.max(0, Math.floor(dMin)); d <= CFG.scootDistanceThreshold && dMin <= CFG.scootDistanceThreshold; d++) floors.push(scootFloor(Math.max(d, dMin)));
  return floors.reduce((least, f) => (f.seconds < least.seconds ? f : least));
}

// Item 1's order from its rows (a no-clip run): each target's engineMs against its planned glide. The first target
// fades in (no glide) and stays undetermined. -> {targets: {target: {...}}}.
export function orderFromMeta(rows) {
  const last = rows.slice(Math.max(0, rows.map(r => r.kind).lastIndexOf('start')));
  const click = target => {
    const row = last.findLast(r => r.kind === 'cell' && r.orderTarget === target);
    if (!row?.ok || !Number.isFinite(row.meta?.engineMs)) throw new Error(`item 1's last run has no answered ${target} click with its engineMs`);
    return row;
  };
  const start = last.findLast(r => r.kind === 'task' && r.task === 'glide-start')?.result;
  if (!start?.ok) throw new Error('item 1\'s last run has no glide-start reading (the windows\' bounds and the scroll point)');
  const first = click('first-target'), second = click('second-target');
  // The glide counted on only when the cursor reached its known start (the positioning scroll answered ok, after the
  // reading and before the click) and nothing lay over Chrome's window right before the click (else the engine may
  // snap: CursorHub.perform skips the glide when both ends are occluded).
  const at = row => last.indexOf(row);
  const scroll = last.findLast(r => r.kind === 'cell' && r.role === 'glide-scroll');
  const cover = last.findLast(r => r.kind === 'task' && r.task === 'glide-cover');
  const startRow = last.findLast(r => r.kind === 'task' && r.task === 'glide-start');
  const gate = !scroll || at(scroll) < at(startRow) || at(scroll) > at(second) ? 'no row of the positioning scroll between the reading and the click: the start is not known'
    : !scroll.ok ? `the positioning scroll failed (${scroll.error ?? 'no answer'}): the cursor may never have reached its start`
      : !cover || at(cover) < at(scroll) || at(cover) > at(second) ? 'no reading of what covers Chrome\'s window right before the click: a snap cannot be ruled out'
        : !cover.result?.ok ? `something lay over Chrome's window right before the click (${cover.result?.problem ?? 'the reading failed'}): the engine may snap instead of gliding`
          : !Number.isFinite(scroll.at) || !Number.isFinite(second.at) ? 'no time of the positioning scroll\'s reply or of the click\'s: whether the cursor was still shown at its start is not known'
            : second.at - second.meta.engineMs - scroll.at > VISIBLE_START_MS
              ? `the click was sent about ${(second.at - second.meta.engineMs - scroll.at).toFixed(0)} ms after the positioning scroll's reply, past ${VISIBLE_START_MS} ms (the engine's 5 s idle less a margin): the cursor may have faded, and would fade in at the target rather than glide`
              : null;
  const floor = arrivalFloor(start.dMin);
  const doneMs = second.meta.engineMs + FRAME_MS, glideMs = floor.seconds * 1000;
  return {
    targets: {
      'first-target': {engineMs: first.meta.engineMs, route: first.route ?? null, verdict: 'undetermined',
        reason: 'no glide: the cursor fades in at its first target from hidden, so a planned glide has nothing to compare'},
      'second-target': {engineMs: second.meta.engineMs, route: second.route ?? null, doneMs, plannedGlide: {floorMs: glideMs, mode: floor.mode, response: floor.response ?? null, dMin: start.dMin, from: start.point},
        verdict: !gate && doneMs < glideMs ? 'pass' : 'undetermined',
        reason: gate ?? (doneMs < glideMs ? `engineMs ${second.meta.engineMs.toFixed(1)} + one frame = ${doneMs.toFixed(1)} ms, under the earliest arrival the engine could plan for a move of at least ${start.dMin.toFixed(0)} pt (${glideMs.toFixed(0)} ms, ${floor.mode})`
          : `engineMs ${second.meta.engineMs.toFixed(1)} + one frame = ${doneMs.toFixed(1)} ms is not under the earliest possible arrival for a move of at least ${start.dMin.toFixed(0)} pt (${glideMs.toFixed(0)} ms), so the engine's numbers do not decide it`)},
    },
  };
}

// `order-from-meta`: the judgement into <out>/item-1-order-meta.json and .md, and both order verdicts appended.
export function writeOrderFromMeta({rows, out, now = () => new Date().toISOString()}) {
  const judged = orderFromMeta(rows);
  writeFileSync(join(out, 'item-1-order-meta.json'), `${JSON.stringify(judged, null, 2)}\n`);
  writeFileSync(join(out, 'item-1-order-meta.md'), ['# Acceptance 1: each control\'s change against the cursor\'s arrival, from the engine\'s numbers (no clip)', '',
    'The action is done when its request returns (engineMs); the cursor arrives when its planned glide reaches the engine\'s arrival point. The glide is bounded from below (scripts/cursor-sitting/glide.mjs): the earliest arrival the engine could plan for a move at least as long as the distance from the cursor\'s known starting point to Chrome\'s window.', '',
    ...Object.entries(judged.targets).map(([target, t]) => `- ${target}: ${t.verdict}. ${t.reason}.`), ''].join('\n'));
  for (const [target, t] of Object.entries(judged.targets)) {
    appendFileSync(join(out, 'verdicts.jsonl'), `${JSON.stringify({item: '1', id: `order-${target}`, verdict: t.verdict, note: `from the engine's numbers (no clip): ${t.reason}`, at: now()})}\n`);
  }
  return judged;
}

// The MacBook's built-in display, as the cursor's panel spans it: its full frame, and the menu bar's height that the
// visible frame (the path choice's preference) leaves out. An assumption where no reading is given.
export const BUILT_IN_SCREEN = Object.freeze({width: 1512, height: 982, menuBar: 37});

// The motion the engine plans for a coordinate move from `from` to `to` (global top-left points) on `screen`, by the
// reference's own vectorsFor (mode, path choice, response, settle). -> {mode, settleSeconds, distance}.
export function plannedSettle(from, to, screen = BUILT_IN_SCREEN) {
  const {V, vectorsFor} = motionReference();
  const H = screen.height;
  const v = vectorsFor({name: 'planned', panelHeight: H, bounds: {x: 0, y: 0, w: screen.width, h: H - screen.menuBar},
    from: V(from.x, H - from.y), to: V(to.x, H - to.y)});
  return {mode: v.mode, settleSeconds: v.settleTime, distance: v.distance};
}

// The windows of a scene's process above its run window `number` (front to back, on screen only): what can stand
// between the run window and the keys, like the 53 × 48 pt window over TextEdit's at the second sitting.
export function overlaysAbove(windows, number) {
  const shown = (windows ?? []).filter(w => w.onScreen !== false);
  const at = shown.findIndex(w => w.number === number);
  return (at < 0 ? shown : shown.slice(0, at)).filter(w => w.number !== number);
}

// What lies over a target window by the engine's occlusion rule (CursorAttachment.swift `occluded`): on-screen windows
// before it in the list (front to back), not the engine's own, at a layer under 20 or the pop-up menu level (101),
// intersecting its bounds. -> the covering windows, or null when the target is not in the list.
export function coverOver(list, number, bounds, enginePids = []) {
  const at = (list ?? []).findIndex(w => w.number === number);
  if (at < 0) return null;
  const r = bounds, meets = b => b.x < r.x + r.width && r.x < b.x + b.width && b.y < r.y + r.height && r.y < b.y + b.height;
  return list.slice(0, at).filter(w => w.onScreen !== false && !enginePids.includes(w.ownerPid) && (w.layer < 20 || w.layer === 101) && meets(w.bounds));
}

// How long after the positioning scroll's reply the click's request may begin with the cursor surely still shown at
// its start: the engine fades it 5 s after its last request ends (CursorLifecycle.swift idleSeconds), less 1 s for the
// rows' times being taken on the replies and for the transport.
export const VISIBLE_START_MS = 4000;

export const WINDOW_LIST_SCRIPT = fileURLToPath(new URL('./window-list.swift', import.meta.url));
// Every on-screen window, front to back, by its owner's pid, number, layer and bounds (./window-list.swift, compiled
// once like the target guard's probe): no names, so no Screen Recording.
export const windowListProbe = ({cache = PROBE_CACHE} = {}) => compiled(WINDOW_LIST_SCRIPT, cache);
export function liveWindowList({cache = PROBE_CACHE} = {}) {
  const bin = windowListProbe({cache});
  return JSON.parse(execFileSync(bin, [], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000}).trim()).windows;
}
