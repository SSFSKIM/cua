// #200's live check: does a background action raise the driven window above the person's front window where they can
// see it, and is the action delivered? (SSFSKIM/cua#200. The cause, read offline: route 3's activation click consumes
// the activation AppKit arms for the next mouse down, so the action's own mouse down arrives as an "ordering click" and
// the window server raises the window. The fix posts route 3's pointer events through a delivery guard that answers a
// raise inside one screen-update hold and reports it in the reply's `cua/delivery`. The vendor posts that click with ⌘,
// which orders nothing and, in TextEdit, moves no caret, so its "no raise" may be "no delivery".) What is measured:
// - The scene: the harness's Chrome for Testing window frontmost over the right half of the driven harness window
//   (TextEdit's run window; the run's Finder window for e, the Electron fixture's for f), placed by the kit
//   (`raise-place`: harness windows only, moved through Accessibility by scripts/spike/engine/move-window.swift), Chrome
//   then activated. Before each case the arrangement must hold (Chrome's process frontmost, its run window above the
//   driven one in the window list, each planned point under Chrome or clear of it as planned), or the case stops.
// - A watcher (./order-watch.swift) samples the pair's order every 5 ms for the whole case and appends every change to
//   <out>/item-200-<case>-<engine>-order.jsonl, each with the read that saw it and the one before. It reads the window
//   server's real order, which the guard's hold keeps off the display, so it sees a raise the guard undoes too. Per
//   pointer action, on the same Unix-ms clock as the reply's `cua/actionInterval` (the events' post) and `cua/delivery`'s
//   `holdStartedAt` and `releasedAt` (the hold's span): post to the first raise seen, post to the release, a late raise
//   (seen by a read past the release and the watcher's resolution: one the person saw), and a raise before the hold
//   began, which is unguarded, as is a raise during any other call (an element action, a read). A gap in the reads
//   that leaves a raise's side of the hold unknown makes it undecided: the case is then incomplete, not failed
//   (callWatch). After every sample the kit reads the record: the driven window still above Chrome's, a run
//   window gone or the watcher gone stops the case and every case after it (the scene no longer holds).
// - Each sample's action is its cell's last call, so the row keeps that call's route and meta (activationClick,
//   activationGuardMs, actionInterval, delivery); its delivery is read back right after it: TextEdit's selected range
//   through the approved bundle's `--probe text-view` (outside either engine, the same read for both), the alignment,
//   Finder's selection and the fixture's count through an observation.
//     a  a coordinate click in the text, under Chrome and clear of it in turn, a different line each time: delivered when
//        the range is a caret (zero length) other than the one before
//     b  inside a standing activation: an element click on the format bar's alignment (route 1's held activation), then
//        at once a coordinate click in the text under Chrome. Each sample first puts the caret at the start of the line
//        under that click (select_text, an element write), so the click, which lands past the line's end, moves it to
//        the end whatever the alignment, and the alignment read after it is that line's. Both halves judged: the
//        alignment flipped; the caret moved
//     c  a drag in the text: a selection, not empty, other than the one before
//     d  a double click on a word: a selection that is exactly one word of the run's document, other than the one before
//     e  a plain click on a row of the run's Finder window (the date cell, never the name, which would start a rename):
//        that row alone selected, so the click kept its meaning (a ⌘-click adds to a selection)
//     f  a coordinate click on a plain push button in a background window, a view that refuses the first mouse: the
//        Electron fixture's button, at the middle of its frame (./element-frame.swift): its count up by one. The case
//        starts on a fresh fixture process (brought down and up by the kit, its accessibility record off), placed and
//        Chrome activated again; then the engine under test observes it and must find the button by its index (its
//        tree read there, before anything else reads it), then the frame reader, then the clicks. The fixture's
//        activation, focus and blur counters are read before and after each click, recorded only.
// - After the tail, one observation: the engine reports a repair its after-action watch made after an action had
//   answered (`cua/afterActionRepairs`) on the connection's later replies, so the last action's needs a reply after it.
// - The vendor's half runs the same cases (`--engine vendor`); its rows are recorded, never judged.
// A late or outlived raise the engine repaired inside its repair window after the post, by the guard past its cap
// (`repairedAfterRelease`) or by the after-action watch (a later reply's `afterActionRepairs`, keyed by the delivery's
// `postedAt`), and that the watcher saw undone there, is a flash: counted and reported, not failed.
// Pass, for cua's engine: every sample delivered, no late or unguarded raise, no `raiseLeft`, nothing undecided, over
// the case's full count; the case ended cleanly (its last raise check passed, its session closed, its watcher stopped by
// the kit) and the watcher's record whole (started before the first sample, reaching the close after the tail, no gap
// past WATCH_GAP_MS).
import {execFileSync, spawn} from 'node:child_process';
import {closeSync, existsSync, openSync, readFileSync} from 'node:fs';
import {basename, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FIXTURE_ACCESSIBILITY_FILE, FIXTURE_COUNTERS_FILE} from '../native-matrix/fixtures/electron-fixture.mjs';
import {compiled} from '../native-matrix/matrix-device.mjs';
import {readState, textEditDocument} from '../repl-parity/scenes-mac.mjs';
import {ALIGN_CLICK, ALIGNMENT, CARET_BEFORE, CLICK_AT, CONTROL_FOUND, FINDER_ROW_CLICK, FINDER_ROW_READ, FINDER_TOP, OBSERVE, OBSERVED_CLICK, OBSERVED_CLICK_GLOBAL,
  OBSERVED_CLICK_PT, OBSERVED_DRAG, PRESSED} from './cells.mjs';
import {fixtureAccessibility} from './focus.mjs';
import {BUILT_IN_SCREEN} from './glide.mjs';
import {PROBE_CACHE} from './target-guard.mjs';

export const ORDER_WATCH_SCRIPT = fileURLToPath(new URL('./order-watch.swift', import.meta.url));
export const ELEMENT_FRAME_SCRIPT = fileURLToPath(new URL('./element-frame.swift', import.meta.url));
export const MOVE_WINDOW_SCRIPT = fileURLToPath(new URL('../spike/engine/move-window.swift', import.meta.url));
export const WATCH_INTERVAL_MS = 5;
// The longest gap between two of the watcher's reads that still lets the record stand: a raise undone inside a longer
// one could pass unseen. The MacBook held 5 ms with gaps of 12–24 ms at a load average of 70 (measured).
export const WATCH_GAP_MS = 50;
// The engine's repair window after an action's events (native/engine Activation.swift deliveryRepairWindowMs): a raise
// it repairs after the hold's release, inside it, is a flash.
const REPAIR_WINDOW_MS = 1_000;
// A raise still seen this long after the hold's release outlived it: two of the watcher's intervals, its resolution.
export const OUTLIVE_MS = 2 * WATCH_INTERVAL_MS;
// Between samples, so each sample's span is its own and a deferred ordering lands inside it.
export const SAMPLE_GAP_MS = 500;
// After the last sample, before the session closes: a late raise is still the case's.
export const TAIL_MS = 1000;

export const ENGINES = Object.freeze(['cua', 'vendor']);
// Each case's driven scene, its count, and the parts of a sample that are judged delivered (`halves`).
export const CASES = Object.freeze({
  a: {what: 'a coordinate click in TextEdit\'s text, under Chrome and clear of it in turn', back: 'textedit', samples: 40, halves: ['click']},
  b: {what: 'inside a standing activation: an element click on the alignment, then at once a coordinate click in the text under Chrome', back: 'textedit', samples: 20, halves: ['element', 'coordinate']},
  c: {what: 'a drag in TextEdit\'s text', back: 'textedit', samples: 20, halves: ['drag']},
  d: {what: 'a double click on a word in TextEdit\'s text', back: 'textedit', samples: 20, halves: ['double']},
  e: {what: 'a plain click on a row of the run\'s Finder window', back: 'finder', samples: 20, halves: ['row']},
  f: {what: 'a coordinate click on a plain push button that refuses the first mouse: the Electron fixture\'s button', back: 'electron', samples: 20, halves: ['click']},
});
// The window kept in front: Chrome for Testing's.
export const FRONT = 'chrome';
export const itemOf = (kase, engine) => `200-${kase}-${engine}`;
export const orderFileOf = (kase, engine) => `item-${itemOf(kase, engine)}-order.jsonl`;
// The fixture's button, as the frame reader finds it.
export const FIXTURE_BUTTON = Object.freeze({role: 'AXButton', name: 'Fixture button'});

// ---- where each sample acts ----------------------------------------------------------------------------------------

const r3 = x => Math.round(x * 1000) / 1000;
// a: clear of Chrome (the left half) and under it (the right half) in turn, each at another line: twenty heights 0.025 of
// the window apart, visited 7 apart, so two samples in a row are at least 0.175 of the window (several lines) apart.
// Every line is short, so a click right of its text puts the caret at the line's end.
export const aPoint = i => ({fraction: [i % 2 ? 0.75 : 0.25, r3(0.3 + ((i * 7) % 20) * 0.025)], covered: i % 2 === 1});
// b: one point under Chrome, right of every line's text.
export const B_POINT = Object.freeze([0.85, 0.55]);
// c: across two lines, on the left and under Chrome in turn, at heights visited 7 apart.
export const cDrag = i => {
  const y = r3(0.3 + ((i * 7) % 10) * 0.04);
  return i % 2 ? {from: [0.6, y], to: [0.85, r3(y + 0.08)], covered: true} : {from: [0.15, y], to: [0.4, r3(y + 0.08)], covered: false};
};
// d: 18 pt from the window's left edge, inside the first word of every line (Helvetica 14, the text inset about 5 pt:
// "Line", "cua", "Bold"), at heights clear of b's line, two in a row at least 0.24 of the window apart.
export const WORD_X_PT = 18;
const D_HEIGHTS = Object.freeze([0.32, 0.62, 0.38, 0.68, 0.44, 0.74, 0.35, 0.65, 0.41, 0.71]);
export const dPoint = i => ({xPt: WORD_X_PT, y: D_HEIGHTS[i % D_HEIGHTS.length]});
// e: the run folder's first ten rows (shown from the list's top in its fixed state), visited 3 apart.
export const eRow = i => `scene-file-${String(1 + ((i * 3) % 10)).padStart(3, '0')}`;
// f: the middle of the button's frame.
export const middle = frame => ({x: frame.x + frame.width / 2, y: frame.y + frame.height / 2});

// The coordinate points a case's arrangement must hold: each under Chrome's window, or clear of it, as planned.
export function plannedPoints(kase, samples) {
  const n = Array.from({length: samples}, (_, i) => i);
  if (kase === 'a') return n.map(aPoint);
  if (kase === 'b') return [{fraction: [...B_POINT], covered: true}];
  if (kase === 'c') return n.flatMap(i => { const d = cDrag(i); return [{fraction: d.from, covered: d.covered}, {fraction: d.to, covered: d.covered}]; });
  return [];
}

// ---- the scene -----------------------------------------------------------------------------------------------------

// Where the kit puts the harness windows (global top-left points): TextEdit's (`back`) at the screen's left, centred in
// its height under the menu bar, and Chrome's (`front`) from TextEdit's middle, centred on its height, so Chrome covers
// its right half; any other driven window (`extras`: Finder's, the fixture's) where TextEdit's is. Sizes are kept: the
// move only sets positions. -> {back: {x, y}, front: {x, y}, extras: [{x, y}]}.
export function placementPlan({back, front, extras = [], screen = BUILT_IN_SCREEN, margin = 24}) {
  const top = screen.menuBar, visible = screen.height - top;
  const at = {x: margin, y: Math.round(top + Math.max(margin, (visible - back.height) / 2))};
  return {back: at, front: {x: Math.round(at.x + back.width / 2), y: Math.round(Math.max(top + 4, at.y + back.height / 2 - front.height / 2))},
    extras: extras.map(() => ({...at}))};
}

const inside = (p, b) => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
const pointIn = (bounds, f) => ({x: bounds.x + f[0] * bounds.width, y: bounds.y + f[1] * bounds.height});

// Why the scene does not hold for a case, or null: the front scene's process frontmost, both run windows on screen with
// the front one above the driven one, and each planned point (`points`: fractions of the driven window) under the front
// window when it is to be covered, clear of it when not. `list`: the on-screen windows front to back
// (./window-list.swift); `front`, `back`: {id, pid, number}.
export function arrangementProblem({frontmost, list, front, back, points = []}) {
  if (frontmost?.pid !== front.pid) return `the frontmost app is ${frontmost?.pid ?? 'none'}, not the ${front.id} scene's process ${front.pid}`;
  const at = id => (list ?? []).findIndex(w => w.number === id);
  const f = at(front.number), b = at(back.number);
  if (f < 0) return `the ${front.id} scene's run window ${front.number} is not on screen`;
  if (b < 0) return `the ${back.id} scene's run window ${back.number} is not on screen`;
  if (b < f) return `the ${back.id} scene's run window is above the ${front.id} scene's`;
  const fb = list[f].bounds, bb = list[b].bounds;
  for (const p of points) {
    const under = inside(pointIn(bb, p.fraction), fb);
    if (p.covered && !under) return `the point (${p.fraction.join(', ')}) of the ${back.id} window is not under the ${front.id} window`;
    if (!p.covered && under) return `the point (${p.fraction.join(', ')}) of the ${back.id} window is under the ${front.id} window`;
  }
  return null;
}

// Why the fixture button's frame cannot serve case f, or null: found, and its middle inside the fixture's run window.
export function buttonProblem(answer, window) {
  if (answer?.trusted === false) return 'the terminal running the kit is not trusted for Accessibility, so it cannot read the button\'s frame';
  if (!answer?.found) return `the fixture's button was not found: ${answer?.error ?? 'no answer'}`;
  if (!window) return 'the fixture\'s run window is not on screen';
  return inside(middle(answer.frame), window) ? null : 'the button\'s middle is not inside the fixture\'s run window';
}

// Why the relaunched fixture is not fresh, or null: a new process (`before`, `after`: the scene records' pids), whose
// accessibility record (the fixture's JSON lines, appended across launches) has a start line, and no line from it on
// says accessibility is on.
export function freshFixtureProblem({before = null, after, accessibilityText}) {
  if (before !== null && before === after) return `the fixture kept its process ${after}`;
  const lines = orderLines(accessibilityText);
  const k = lines.findLastIndex(l => l.source === 'start');
  if (k < 0) return 'the fixture\'s accessibility record has no start line for its new process';
  const on = lines.slice(k).find(l => l.enabled === true);
  return on ? `the fixture's accessibility was already on (${on.source} at ${on.at}) before the case's first observation` : null;
}

// ---- delivery -----------------------------------------------------------------------------------------------------

const same = (a, b) => a?.location === b?.location && a?.length === b?.length;
const rangeText = r => (r ? `{${r.location}, ${r.length}}` : 'none');
const verdict = why => ({delivered: why === null, why});
// Each predicate -> {delivered, why}: why is null when delivered.

// a, b's second half: the range a caret (zero length), other than the one before.
export function caretMoved(before, after) {
  if (!after) return verdict('the selected range was not read');
  if (after.length !== 0) return verdict(`the range ${rangeText(after)} is not a caret`);
  if (!before) return verdict('the range before was not read, so a move cannot be told');
  return verdict(same(before, after) ? `the caret stayed at ${after.location}` : null);
}

// c: a selection, not empty, other than the one before.
export function selectionMade(before, after) {
  if (!after) return verdict('the selected range was not read');
  if (!(after.length > 0)) return verdict(`the range ${rangeText(after)} is empty`);
  if (!before) return verdict('the range before was not read, so a new selection cannot be told');
  return verdict(same(before, after) ? `the selection ${rangeText(after)} is the one before` : null);
}

// The run's document as TextEdit's text area holds it (scripts/repl-parity/scenes-mac.mjs: its lines, one paragraph
// each). The check runs on a document brought up fresh, which no earlier item has typed into.
export const DOCUMENT_TEXT = textEditDocument().lines.join('\n');
const WORD = /^[A-Za-z0-9]+$/, WORD_CHAR = /[A-Za-z0-9]/;

// d: a selection that is exactly one word of `text` (letters and digits, nothing of either on its sides), other than the
// one before.
export function wordSelected(before, after, text = DOCUMENT_TEXT) {
  const made = selectionMade(before, after);
  if (!made.delivered) return made;
  const {location, length} = after, word = text.slice(location, location + length);
  if (location + length > text.length || !WORD.test(word)) return verdict(`the selection ${rangeText(after)} is not one word of the document`);
  if (WORD_CHAR.test(text[location - 1] ?? '') || WORD_CHAR.test(text[location + length] ?? '')) return verdict(`the selection ${rangeText(after)} is part of a word`);
  return verdict(null);
}

// The line of `text` holding the offset `location` (a caret at a line's end is in that line). -> {index, text, start,
// end} or null.
export function lineAt(location, text = DOCUMENT_TEXT) {
  if (!Number.isInteger(location) || location < 0 || location > text.length) return null;
  let start = 0;
  for (const [index, line] of text.split('\n').entries()) {
    const end = start + line.length;
    if (location <= end) return {index, text: line, start, end};
    start = end + 1;
  }
  return null;
}

// b's first half: the button the click chose (ALIGN_CLICK's {clicked}) reads on after it (ALIGNMENT's {center, left}).
// `click` and `read` are the cells' answers.
export function alignmentFlipped(click, read) {
  if (!click?.ok) return verdict(`the element click failed: ${click?.error ?? 'no answer'}`);
  if (!read?.ok) return verdict(`the alignment was not read: ${read?.error ?? 'no answer'}`);
  const {clicked} = click.value ?? {}, {center, left} = read.value ?? {};
  if (clicked === 'align center') return verdict(center === '1' ? null : `align center reads ${center ?? 'nothing'} after its click`);
  if (clicked === 'align left') return verdict(left === '1' && center !== '1' ? null : `align left reads ${left ?? 'nothing'} (center ${center ?? 'nothing'}) after its click`);
  return verdict(`the element click chose ${clicked ?? 'no button'}`);
}

// e: the clicked row alone selected (FINDER_ROW_READ's answer).
export function finderRowAlone(read) {
  if (!read?.ok) return verdict(`Finder's selection was not read: ${read?.error ?? 'no answer'}`);
  const {rowFound, selected, only} = read.value ?? {};
  if (!rowFound) return verdict('the row is not in the observation');
  return verdict(only ? null : `${selected} row(s) selected, not that row alone`);
}

// f: the fixture's count up by exactly one between two PRESSED reads.
export function pressedOnce(before, after) {
  if (!before?.ok || !Number.isInteger(before.value?.pressed)) return verdict(`the count before was not read: ${before?.error ?? 'no answer'}`);
  if (!after?.ok || !Number.isInteger(after.value?.pressed)) return verdict(`the count after was not read: ${after?.error ?? 'no answer'}`);
  const d = after.value.pressed - before.value.pressed;
  return verdict(d === 1 ? null : `the count went from ${before.value.pressed} to ${after.value.pressed}`);
}

// ---- the watcher's record ------------------------------------------------------------------------------------------

// Its lines, parsed; a line still being written is skipped.
export function orderLines(text) {
  return String(text ?? '').split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
}

// One run of the watcher in the case's file (appended to by every attempt): the one whose start line carries `pid`, else
// the last. -> {start, changes, end} or null.
export function orderAttempt(lines, pid = null) {
  const starts = lines.map((l, k) => (l.kind === 'start' ? k : -1)).filter(k => k >= 0);
  const k = pid === null ? starts.at(-1) : starts.find(s => lines[s].pid === pid);
  if (k === undefined) return null;
  const next = starts.find(s => s > k) ?? lines.length;
  const body = lines.slice(k + 1, next);
  return {start: lines[k], changes: body.filter(l => l.kind === 'order'), end: body.find(l => l.kind === 'end') ?? null};
}
// The raises in a run: every change to the driven window above the front one.
export const raisesIn = attempt => (attempt?.changes ?? []).filter(c => c.state === 'back-above');
// Changes that lost a window from the screen (minimised, closed, another Space): the scene no longer holds.
export const lossesIn = attempt => (attempt?.changes ?? []).filter(c => /missing$/.test(c.state));
// The pair's order at the Unix-ms time `t`: the last change at or before it, else the run's first reading.
export const stateAt = (attempt, t) => (attempt?.changes ?? []).filter(c => c.at <= t).at(-1)?.state ?? attempt?.start?.state ?? null;

// Each change is bracketed by two reads: the one that saw it (`at`) and the one before (`prev`, the last to see the old
// order), so it happened between them; a gap in the reads widens the bracket. A record without `prev` reads as a change
// seen at once.
const prevOf = c => (Number.isFinite(c.prev) ? c.prev : c.at);

// An action's post time: its delivery's `postedAt`, else its interval's start; null for neither.
const postOf = meta => (meta?.delivery?.postedAt > 0 ? meta.delivery.postedAt : meta?.actionInterval?.startedAt ?? null);

// Which cell each raise is judged with (an index into `cells`, sorted by start; -1 before the first): the cell whose span
// holds it, unless that cell's own guard had not begun its hold yet (or it has none) and an earlier guarded action's
// engine watch may still have been running then: the latest action whose hold began before the raise, when the raise
// lies inside its repair window after its post. The engine's watch runs until the next request reaches it, which a
// host-side cell's start precedes (its target guard, its reads), so a raise in that gap is the earlier action's.
export function raiseOwners(cells, raises) {
  const guarded = c => c.meta?.delivery?.releasedAt > 0;
  const holdStart = c => (c.meta.delivery.holdStartedAt > 0 ? c.meta.delivery.holdStartedAt : postOf(c.meta) ?? c.meta.delivery.releasedAt);
  return new Map(raises.map(raise => {
    let k = -1;
    for (let i = 0; i < cells.length && cells[i].startedAt <= raise.at; i++) k = i;
    if (k >= 0 && guarded(cells[k]) && raise.at >= holdStart(cells[k])) return [raise, k];
    for (let j = k; j >= 0; j--) {
      if (!guarded(cells[j]) || holdStart(cells[j]) > raise.at) continue;
      const post = postOf(cells[j].meta);
      return [raise, Number.isFinite(post) && raise.at <= post + REPAIR_WINDOW_MS + OUTLIVE_MS ? j : k];
    }
    return [raise, k];
  }));
}

// What the watcher saw of one call, from `from` to `until` (Unix ms), with the call's meta (`meta`: the cell row's or
// answer's; `actionInterval` and `delivery` when it was a route-3 pointer action). A cell that observes and then acts
// keeps only the action's meta, so the guard covers only what its screen hold covered, from `holdStartedAt` (the post,
// for a guard that reports none) to `releasedAt`. Each raise in the span is one of:
//   unguarded  seen before the hold began, or during a call with no guard: on the display
//   late       first seen by a read past the release and its grace (OUTLIVE_MS, the watcher's resolution)
//   outlived   begun inside the hold, and a read past the grace still saw it (or it was never undone and the watcher
//              read on past the grace)
//   undecided  a gap in the reads leaves it unknown whether it began before the hold or lasted past the grace: incomplete
//              evidence, not a raise
//   flash      late or outlived, but the engine repaired after the release for this action (the guard past its cap, or
//              the after-action watch: `repaired`, the post times a later reply's afterActionRepairs keyed) and the
//              watcher saw it undone inside the repair window after the post
// With the guard, also the first raise after the post and how long after it, and how long after the post the hold was
// released. The post is the delivery's `postedAt` (the engine's own clock for its repair window), else the action
// interval's start. `owned`, when given, picks the raises that are this call's instead of the span from `from` to
// `until` (judgeCase: a raise during a later host-side cell can still be this action's).
// -> {guarded, raises, postToRaiseMs, postToReleaseMs, late, outlived, undecided, unguarded, flash}.
export function callWatch({meta = {}, attempt, from, until = Infinity, repaired = null, owned = null}) {
  const changes = attempt?.changes ?? [];
  const raises = raisesIn(attempt).filter(owned ?? (c => c.at >= from && c.at < until));
  const post = postOf(meta), releasedAt = meta.delivery?.releasedAt > 0 ? meta.delivery.releasedAt : null;
  if (releasedAt === null) return {guarded: false, raises: raises.length, postToRaiseMs: null, postToReleaseMs: null, late: 0, outlived: 0, undecided: 0, unguarded: raises.length, flash: 0};
  const holdStart = meta.delivery.holdStartedAt > 0 ? meta.delivery.holdStartedAt : Number.isFinite(post) ? post : releasedAt;
  const grace = releasedAt + OUTLIVE_MS;
  const counts = {late: 0, outlived: 0, undecided: 0, unguarded: 0, flash: 0};
  // A raise seen past the release that the engine repaired after it (the guard's repairedAfterRelease, or the
  // after-action watch's repair of this action), undone inside the engine's repair window after the post: on the
  // display for that long, a flash, counted apart and not failed.
  const engineRepaired = meta.delivery?.repairedAfterRelease === true || repaired?.has(meta.delivery?.postedAt) === true;
  const repairWindowEnd = engineRepaired && Number.isFinite(post) ? post + REPAIR_WINDOW_MS + OUTLIVE_MS : null;
  const flashOr = (raise, kind) => {
    if (repairWindowEnd === null) return kind;
    const undone = changes.find(c => c.at > raise.at && c.state !== 'back-above');
    return undone && undone.at <= repairWindowEnd ? 'flash' : kind;
  };
  const kindOf = raise => {
    const kind = baseKindOf(raise);
    return kind === 'late' || kind === 'outlived' ? flashOr(raise, kind) : kind;
  };
  const baseKindOf = raise => {
    if (raise.at > grace) return 'late';
    if (raise.at < holdStart) return 'unguarded';
    if (prevOf(raise) < holdStart && raise.at - prevOf(raise) > OUTLIVE_MS) return 'undecided';
    const undone = changes.find(c => c.at > raise.at && c.state !== 'back-above');
    // Never undone: outlived only when the watcher's last read (not its end record's writing) came past the grace.
    if (!undone) return attempt?.end?.lastRead > grace ? 'outlived' : 'undecided';
    if (prevOf(undone) > grace) return 'outlived';
    return undone.at > grace && undone.at - prevOf(undone) > OUTLIVE_MS ? 'undecided' : null;
  };
  for (const raise of raises) { const kind = kindOf(raise); if (kind) counts[kind] += 1; }
  const first = Number.isFinite(post) ? raises.find(c => c.at >= post) : undefined;
  return {guarded: true, raises: raises.length, postToRaiseMs: first ? first.at - post : null, postToReleaseMs: Number.isFinite(post) ? releasedAt - post : null, ...counts};
}

// The connection's after-action repairs as the case's replies carried them (the engine's `afterActionRepairs`,
// cumulative on every later input result and observation of the session): each repaired action's post time to its
// repairs and first repair's latency (the most any reply reported), and the session's total. -> {total, actions: Map}.
export function afterActionRepairsIn(rows) {
  const actions = new Map();
  let total = 0;
  for (const r of rows) {
    const report = r.kind === 'cell' ? r.meta?.afterActionRepairs : null;
    if (!report) continue;
    total = Math.max(total, Number.isInteger(report.repairs) ? report.repairs : 0);
    for (const a of report.actions ?? []) {
      if (!Number.isFinite(a?.postedAt)) continue;
      const was = actions.get(a.postedAt);
      if (!was || a.repairs > was.repairs) actions.set(a.postedAt, {repairs: a.repairs, latencyMs: a.latencyMs ?? null});
    }
  }
  return {total, actions};
}

// ---- the judge ----------------------------------------------------------------------------------------------------

const lastAttempt = rows => rows.slice(Math.max(0, rows.map(r => r.kind).lastIndexOf('start')));
const tally = values => values.reduce((m, v) => ({...m, [v ?? 'none']: (m[v ?? 'none'] ?? 0) + 1}), {});
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
// {n, min, median, p95, max} of `xs`, or {n: 0}.
export function spread(xs) {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return {n: 0};
  const m = s.length >> 1;
  return {n: s.length, min: s[0], median: s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2, p95: quantile(s, 0.95), max: s.at(-1)};
}

// The fixture's counters over a case: each counter's change from the read before a click to the read after it, summed
// over the samples, and how many samples changed it. `rows`: the attempt's fixture-counters task rows.
export function counterDeltas(rows) {
  const reads = new Map();
  for (const r of rows) if (r.result?.counters?.counts) reads.set(`${r.result.i}/${r.result.when}`, r.result.counters.counts);
  const sum = {}, samples = {};
  for (const [key, after] of reads) {
    const [i, when] = key.split('/');
    const before = when === 'after' ? reads.get(`${i}/before`) : null;
    if (!before) continue;
    for (const name of Object.keys(after)) {
      const d = after[name] - (before[name] ?? 0);
      sum[name] = (sum[name] ?? 0) + d;
      if (d) samples[name] = (samples[name] ?? 0) + 1;
    }
  }
  return {sum, samples};
}

// One case on one engine from its rows (the item's jsonl) and the watcher's lines (its order file). -> the counts the
// report prints and the verdict, with `why`.
export function judgeCase({kase, engine, rows, order}) {
  const last = lastAttempt(rows);
  const target = last.find(r => r.kind === 'series')?.counts?.samples ?? CASES[kase].samples;
  const watchRow = last.find(r => r.kind === 'task' && r.task === 'order-watch-start');
  const attempt = watchRow?.result?.pid ? orderAttempt(order, watchRow.result.pid) : null;
  const halves = CASES[kase].halves;
  const byI = new Map();
  for (const d of last.filter(r => r.kind === 'task' && r.task === 'deliver' && Number.isInteger(r.result?.i))) byI.set(d.result.i, {...byI.get(d.result.i), [d.result.part]: d.result});
  const complete = [...byI.entries()].filter(([, h]) => halves.every(part => h[part])).sort(([a], [b]) => a - b);
  const delivered = complete.filter(([, h]) => halves.every(part => h[part].delivered));
  const undelivered = complete.flatMap(([i, h]) => halves.filter(part => !h[part].delivered).map(part => ({i, part, why: h[part].why})));
  // Every cell's span runs to the next cell's start (the last's, to the record's end), and a raise is judged with the
  // cell whose span holds it, or with the earlier action whose watch may still have run then (raiseOwners); the raises
  // before the first cell (the session's opening) are unguarded.
  const cells = last.filter(r => r.kind === 'cell' && Number.isFinite(r.startedAt)).sort((x, y) => x.startedAt - y.startedAt);
  const end = attempt?.end?.at ?? Infinity;
  const afterAction = afterActionRepairsIn(last);
  const owners = raiseOwners(cells, raisesIn(attempt).filter(c => c.at < end));
  const watched = cells.map((c, k) => ({row: c, ...callWatch({meta: c.meta, attempt, repaired: afterAction.actions, owned: raise => owners.get(raise) === k})}));
  const opening = [...owners.values()].filter(k => k < 0).length;
  const actions = watched.filter(w => halves.includes(w.row.sample?.part));
  const deliveries = actions.map(w => w.row.meta?.delivery).filter(Boolean);
  const raises = raisesIn(attempt), losses = lossesIn(attempt);
  const late = watched.reduce((n, w) => n + w.late + w.outlived, 0);
  const flashes = watched.reduce((n, w) => n + w.flash, 0);
  const unguarded = opening + watched.reduce((n, w) => n + w.unguarded, 0);
  const undecided = watched.reduce((n, w) => n + w.undecided, 0);
  const undecidedSamples = [...new Set(watched.filter(w => w.undecided).map(w => w.row.sample?.i ?? null))];
  const raiseLeft = deliveries.filter(d => d.raiseLeft).length;
  const seen = watched.filter(w => w.late || w.outlived || w.unguarded).map(w => ({label: w.row.label, sample: w.row.sample?.i ?? null, late: w.late, outlived: w.outlived, unguarded: w.unguarded}));
  const watcher = attempt ? {started: attempt.start.at, ended: attempt.end?.at ?? null, reads: attempt.end?.samples ?? null, maxGapMs: attempt.end?.maxGapMs ?? null,
    lateSamples: attempt.end?.lateSamples ?? null, realtime: attempt.start.realtime ?? null} : null;
  const sampleCells = cells.filter(c => Number.isInteger(c.sample?.i) && c.sample.i >= 0);
  // The case's end: its last raise check passed, its session closed after the tail, its watcher stopped by the kit. The
  // watcher's record must reach the close, so the tail was watched.
  const closeRow = last.findLast(r => r.kind === 'close');
  const watcherProblem = !attempt ? 'no record of the watcher for this attempt'
    : !attempt.end ? 'the watcher\'s record has no end'
      : sampleCells.length && attempt.start.at > sampleCells[0].startedAt ? 'the watcher started after the first sample'
        : sampleCells.length && attempt.end.at < Math.max(...sampleCells.map(c => c.at ?? 0)) ? 'the watcher ended before the last sample'
          : closeRow && !(attempt.end.at >= closeRow.at) ? `the watcher ended before the case's tail (${attempt.end.at} against ${closeRow.at})`
            : attempt.end.maxGapMs > WATCH_GAP_MS ? `the watcher's longest gap was ${attempt.end.maxGapMs} ms, past ${WATCH_GAP_MS}` : null;
  const stopRow = last.findLast(r => r.kind === 'stopped');
  const endCheck = last.findLast(r => r.kind === 'task' && r.task === 'raise-check' && r.args?.[1] === 'end');
  const watchStop = last.findLast(r => r.kind === 'task' && r.task === 'order-watch-stop');
  const stopped = stopRow ? stopRow.error : !endCheck?.result?.ok ? 'the case\'s last raise check did not pass' : !closeRow ? 'the case\'s session did not close'
    : !watchStop?.result?.ok ? 'the watcher was not stopped by the kit at the case\'s end' : null;
  const base = {case: kase, engine, target, samples: complete.length, delivered: delivered.length,
    halves: Object.fromEntries(halves.map(part => [part, complete.filter(([, h]) => h[part].delivered).length])),
    raises: raises.length, restores: deliveries.reduce((n, d) => n + (d.restores ?? 0), 0), flashes,
    repairedAfterRelease: deliveries.filter(d => d.repairedAfterRelease).length, watchRepaired: deliveries.filter(d => afterAction.actions.has(d.postedAt)).length,
    watchRepairs: afterAction.total, late, unguarded, opening, undecided, undecidedSamples, raiseLeft,
    capped: deliveries.filter(d => d.capped).length, guarded: `${deliveries.length} of ${actions.length}`,
    postToRaiseMs: spread(actions.map(w => w.postToRaiseMs)), postToReleaseMs: spread(actions.map(w => w.postToReleaseMs)),
    postToWatchRepairMs: spread(deliveries.map(d => afterAction.actions.get(d.postedAt)?.latencyMs)),
    seen, losses: losses.length, undelivered, stopped, watcher,
    routes: tally(actions.map(w => (w.row.route == null ? null : `${w.row.sample.part} ${w.row.route}`))),
    activationClicks: tally(actions.map(w => (w.row.meta?.activationClick == null ? null : `${w.row.sample.part} ${w.row.meta.activationClick}`))),
    ...(kase === 'f' ? {counters: counterDeltas(last.filter(r => r.kind === 'task' && r.task === 'fixture-counters'))} : {})};
  const failed = [undelivered.length && `${undelivered.length} half or sample(s) not delivered`, late && `${late} late raise(s)`,
    unguarded && `${unguarded} unguarded raise(s)`, raiseLeft && `${raiseLeft} raise(s) left by the guard`].filter(Boolean);
  const short = complete.length < target ? `${complete.length} of ${target} samples${stopped ? ` (${stopped})` : ''}`
    : stopped ? `stopped: ${stopped}`
      : undecided ? `${undecided} raise(s) undecided by a gap in the watcher's reads (sample${undecidedSamples.length > 1 ? 's' : ''} ${undecidedSamples.join(', ')})`
        : losses.length ? `a run window left the screen ${losses.length} time(s)` : watcherProblem;
  const judged = failed.length ? 'FAIL' : short ? 'INCOMPLETE' : 'PASS';
  const why = failed.length ? failed.join('; ') : short ?? null;
  return {...base, verdict: engine === 'vendor' ? 'recorded' : judged, why, ...(engine === 'vendor' ? {wouldBe: judged} : {})};
}

const listed = m => Object.entries(m).map(([k, n]) => `${k} × ${n}`).join(', ') || '–';
const ms = x => (Number.isFinite(x) ? x.toFixed(1) : '–');
const spreadText = s => (s.n ? `${ms(s.min)} / ${ms(s.median)} / ${ms(s.p95)} / ${ms(s.max)} (${s.n})` : '–');
// The judgements as Markdown: two tables (raises and delivery; timing), then each case's notes.
export function raiseMarkdown(judged) {
  const lines = ['# #200: background actions, raises and delivery (scripts/cursor-sitting/raise.mjs)', '',
    'Raises are what the 5 ms watcher saw of the window server\'s order (the guard\'s screen hold keeps them off the display); restores, capped and raise left are what route 3\'s delivery guard reported (`cua/delivery`); repaired after release counts the actions the engine repaired once the hold was released, by the guard past its cap and by the after-action watch (`cua/afterActionRepairs`, on a later reply), and a flash is a raise past the release that such a repair undid inside 1 s of the events, counted and not failed. A late raise was seen by a read more than 10 ms past the hold\'s release (begun after it, or outliving it) and not so repaired; an unguarded one came before the hold began or during a call with no guard; an undecided one sits in a gap of the watcher\'s reads that leaves either unknown, and makes the case incomplete, not failed. Pass, for cua\'s engine: every sample delivered, no late or unguarded raise, no raise left, nothing undecided, the full count, the case ended cleanly and the watcher\'s record whole through its tail. The vendor\'s rows are recorded, not judged.', '',
    '| case | engine | samples | delivered | raises seen | restores | repaired after release: guard + watch (flashes) | late | unguarded | undecided | capped | raise left | verdict |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const j of judged) {
    const halves = Object.keys(j.halves).length > 1 ? ` (${Object.entries(j.halves).map(([p, n]) => `${p} ${n}`).join(', ')})` : '';
    const verdictText = j.engine === 'vendor' ? `recorded (would be ${j.wouldBe})` : `**${j.verdict}**`;
    lines.push(`| ${j.case}: ${CASES[j.case].what} | ${j.engine} | ${j.samples} / ${j.target} | ${j.delivered}${halves} | ${j.raises} | ${j.restores} | ${j.repairedAfterRelease} + ${j.watchRepaired} (${j.flashes}) | ${j.late} | ${j.unguarded} | ${j.undecided} | ${j.capped} | ${j.raiseLeft} | ${verdictText} |`);
  }
  lines.push('', '| case | engine | post → first raise, ms (min / median / p95 / max, n) | post → hold released, ms | post → watch\'s first repair, ms | guarded actions | routes | activation clicks |', '|---|---|---|---|---|---|---|---|');
  for (const j of judged) lines.push(`| ${j.case} | ${j.engine} | ${spreadText(j.postToRaiseMs)} | ${spreadText(j.postToReleaseMs)} | ${spreadText(j.postToWatchRepairMs ?? {n: 0})} | ${j.guarded} | ${listed(j.routes)} | ${listed(j.activationClicks)} |`);
  for (const j of judged) {
    const notes = [
      ...(j.opening ? [`${j.opening} unguarded raise(s) while the session opened, before the first cell`] : []),
      ...(j.watchRepairs ? [`the after-action watch made ${j.watchRepairs} repair(s) over the session, on ${j.watchRepaired} sample action(s)`] : []),
      ...j.seen.map(s => `${s.late ? `${s.late} late raise(s)` : ''}${s.outlived ? `${s.late ? ', ' : ''}${s.outlived} raise(s) outlived the hold` : ''}${s.unguarded ? `${s.unguarded} unguarded raise(s)` : ''} during "${s.label}"`),
      ...(j.undecided ? [`${j.undecided} raise(s) undecided by a gap in the watcher's reads, in sample(s) ${j.undecidedSamples.join(', ')}: incomplete evidence, not a raise`] : []),
      ...j.undelivered.map(u => `sample ${u.i}${Object.keys(j.halves).length > 1 ? ` (${u.part})` : ''} not delivered: ${u.why}`),
      ...(j.counters ? [`the fixture's counters, summed over the samples' clicks (recorded only): ${listed(j.counters.sum)}; samples that changed each: ${listed(j.counters.samples)}`] : []),
      ...(j.stopped ? [`stopped: ${j.stopped}`] : []),
      ...(j.why ? [`verdict: ${j.why}`] : []),
      ...(j.watcher ? [`watcher: ${j.watcher.reads ?? '?'} reads, longest gap ${j.watcher.maxGapMs ?? '?'} ms, ${j.watcher.lateSamples ?? '?'} late${j.watcher.realtime === false ? ', not under the time-constraint policy' : ''}`] : []),
    ];
    lines.push('', `## ${j.case} on ${j.engine}`, '', ...notes.map(n => `- ${n}`));
  }
  return `${lines.join('\n')}\n`;
}

// ---- the steps ----------------------------------------------------------------------------------------------------

const S = 's';
const at = (kase, i, part, extra = {}) => ({case: kase, i, part, ...extra});
const checked = (kase, i) => [{task: 'raise-check', args: [kase, String(i)], required: true}, {wait: SAMPLE_GAP_MS}];
// The cell labels the deliveries read back by: each sample's action (`action(case, i, part)`) and its reads.
export const LABELS = Object.freeze({
  action: (kase, i, part) => ({
    a: () => `a#${i} click ${aPoint(i).covered ? 'under Chrome' : 'clear of Chrome'}`,
    b: () => (part === 'element' ? `b#${i} element: the alignment` : `b#${i} coordinate: at once, in the line under Chrome`),
    c: () => `c#${i} drag ${cDrag(i).covered ? 'under Chrome' : 'clear of Chrome'}`,
    d: () => `d#${i} double click`,
    e: () => `e#${i} click on ${eRow(i)}'s row`,
    f: () => `f#${i} click on the fixture's button`,
  })[kase](),
  alignment: i => `b#${i} the alignment read`, finderRead: i => `e#${i} Finder's selection read`,
  pressed: i => (i < 0 ? 'f: the fixture\'s count before' : `f#${i} the fixture's count read`),
  found: 'f: the fixture\'s button found by its index in the engine\'s observation',
  tail: kase => `${kase}: one observation after the tail (the after-action repairs read)`,
});

// The placement before the first case: the harness windows moved (Finder's and the fixture's when their cases run),
// Chrome activated.
export const placeSteps = ({extras = []} = {}) => [
  {say: '#200: the harness windows placed (TextEdit at the left, Chrome for Testing over its right half), Chrome brought to the front'},
  {task: 'raise-place', args: extras, required: true},
  {task: 'activate', args: [FRONT], required: true},
];

// One case's steps on `engine`, `samples` of them.
export function raiseSteps(kase, {engine, samples = CASES[kase].samples}) {
  const {back, what} = CASES[kase];
  const n = Array.from({length: samples}, (_, i) => i);
  const body = {
    a: () => n.flatMap(i => { const p = aPoint(i); return [
      {run: S, cell: OBSERVED_CLICK('textedit', p.fraction), label: LABELS.action('a', i, 'click'), sample: at('a', i, 'click', p)},
      {task: 'deliver', args: ['caret', 'a', String(i), 'click']}, ...checked('a', i)]; }),
    b: () => [
      {run: S, cell: CLICK_AT('textedit', B_POINT), label: 'b: the caret put into the line under the coordinate click (a click there)', sample: at('b', -1, 'prep')},
      {task: 'text-line', args: ['b'], required: true},
      ...checked('b', 'prep'),
      ...n.flatMap(i => [
        {run: S, cell: results => CARET_BEFORE(results['b line'] ?? ''), label: `b#${i} the caret to the line's start (select_text)`, sample: at('b', i, 'prep')},
        {task: 'text-view', args: ['b', String(i)]},
        {run: S, cell: ALIGN_CLICK, label: LABELS.action('b', i, 'element'), sample: at('b', i, 'element')},
        {run: S, cell: CLICK_AT('textedit', B_POINT), label: LABELS.action('b', i, 'coordinate'), sample: at('b', i, 'coordinate', {fraction: [...B_POINT], covered: true})},
        {task: 'deliver', args: ['caret', 'b', String(i), 'coordinate']},
        {run: S, cell: ALIGNMENT, label: LABELS.alignment(i), sample: at('b', i, 'read')},
        {task: 'deliver', args: ['alignment', 'b', String(i), 'element']},
        ...checked('b', i)])],
    c: () => n.flatMap(i => { const d = cDrag(i); return [
      {run: S, cell: OBSERVED_DRAG('textedit', d.from, d.to), label: LABELS.action('c', i, 'drag'), sample: at('c', i, 'drag', d)},
      {task: 'deliver', args: ['selection', 'c', String(i), 'drag']}, ...checked('c', i)]; }),
    d: () => n.flatMap(i => { const p = dPoint(i); return [
      {run: S, cell: results => OBSERVED_CLICK_PT('textedit', p.xPt, p.y, results.arrangement?.backBounds?.width, {clickCount: 2}), label: LABELS.action('d', i, 'double'), sample: at('d', i, 'double', p)},
      {task: 'deliver', args: ['word', 'd', String(i), 'double']}, ...checked('d', i)]; }),
    e: () => [{run: S, cell: FINDER_TOP, label: 'e: Finder\'s list at its first rows', sample: at('e', -1, 'prep')}, ...n.flatMap(i => { const row = eRow(i); return [
      {run: S, cell: FINDER_ROW_CLICK(row), label: LABELS.action('e', i, 'row'), sample: at('e', i, 'row', {row})},
      {run: S, cell: FINDER_ROW_READ(row), label: LABELS.finderRead(i), sample: at('e', i, 'read')},
      {task: 'deliver', args: ['finder-row', 'e', String(i), 'row']}, ...checked('e', i)]; })],
    f: () => [
      {run: S, cell: CONTROL_FOUND('fixtureButton'), label: LABELS.found, sample: at('f', -1, 'observe'), required: true},
      {task: 'element-frame', args: ['f'], required: true},
      {run: S, cell: PRESSED, label: LABELS.pressed(-1), sample: at('f', -1, 'read')},
      ...n.flatMap(i => [
        {task: 'fixture-counters', args: ['f', String(i), 'before']},
        {run: S, cell: results => OBSERVED_CLICK_GLOBAL('electron', results['f button'] && middle(results['f button'].frame), results['f button']?.window), label: LABELS.action('f', i, 'click'), sample: at('f', i, 'click')},
        {task: 'fixture-counters', args: ['f', String(i), 'after']},
        {run: S, cell: PRESSED, label: LABELS.pressed(i), sample: at('f', i, 'read')},
        {task: 'deliver', args: ['pressed', 'f', String(i), 'click']},
        ...checked('f', i)])],
  }[kase];
  // f starts on a fresh fixture process, nothing having read its tree: brought down and up, placed again, Chrome in front.
  const fresh = kase === 'f' ? [
    {task: 'fixture-relaunch', required: true},
    {task: 'raise-place', args: ['electron'], required: true},
    {task: 'activate', args: [FRONT], required: true},
    {task: 'fixture-accessibility'},
  ] : [];
  return [
    {say: `#200 case ${kase} on the ${engine} engine: ${what}, ${samples} samples`},
    {series: [itemOf(kase, engine)], counts: {samples}},
    ...fresh,
    {task: 'arrangement', args: [kase, String(samples)], required: true},
    {task: 'order-watch-start', args: [kase, engine], required: true},
    {open: S, engine, scenes: [back]},
    ...(back === 'textedit' ? [{task: 'text-view', args: [kase, 'before']}] : []),
    ...body(),
    {wait: TAIL_MS},
    {run: S, cell: OBSERVE(back), label: LABELS.tail(kase), sample: at(kase, -1, 'tail')},
    {task: 'raise-check', args: [kase, 'end'], required: true},
    {close: S},
    {task: 'order-watch-stop', args: [kase]},
  ];
}

// ---- the live tasks ------------------------------------------------------------------------------------------------

export const orderWatchProbe = ({cache = PROBE_CACHE} = {}) => compiled(ORDER_WATCH_SCRIPT, cache);
export const elementFrameTool = ({cache = PROBE_CACHE} = {}) => compiled(ELEMENT_FRAME_SCRIPT, cache);
export const moveWindowTool = ({cache = PROBE_CACHE} = {}) => compiled(MOVE_WINDOW_SCRIPT, cache);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };

// The watcher started on the pair (window numbers), appending to `file`, once its start line is there. -> {child, pid,
// file, start}.
export async function startOrderWatch({file, front, back, bin = orderWatchProbe(), boundMs = 10_000}) {
  const fd = openSync(file, 'a', 0o600);
  let child;
  try { child = spawn(bin, [String(front), String(back), String(WATCH_INTERVAL_MS)], {stdio: ['ignore', fd, 'ignore']}); } finally { closeSync(fd); }
  for (const t0 = Date.now(); Date.now() - t0 < boundMs;) {
    const attempt = existsSync(file) ? orderAttempt(orderLines(readFileSync(file, 'utf8')), child.pid) : null;
    if (attempt) return {child, pid: child.pid, file, start: attempt.start};
    if (child.exitCode !== null) break;
    await sleep(50);
  }
  child.kill('SIGKILL');
  throw new Error(`the order watcher did not start within ${boundMs} ms`);
}

// The watcher stopped (SIGTERM, then SIGKILL after 2 s) and its run read back. -> its attempt.
export async function stopOrderWatch(watch) {
  if (watch.child.exitCode === null && watch.child.signalCode === null) {
    const exited = new Promise(resolve => watch.child.once('exit', resolve));
    watch.child.kill('SIGTERM');
    if (await Promise.race([exited.then(() => true), sleep(2000).then(() => false)]) === false) { watch.child.kill('SIGKILL'); await exited; }
  }
  return orderAttempt(orderLines(readFileSync(watch.file, 'utf8')), watch.pid);
}

// What the runner's finally calls: a watcher still running is stopped.
export async function stopRaiseWatch(ctx) {
  const watch = ctx.raise?.watch;
  if (!watch) return;
  ctx.raise.watch = null;
  await stopOrderWatch(watch);
}

// The tasks the steps above name, for ./runner.mjs liveIo. `io.scene(id)`: a scene's record; `run`: the scenes' run
// directory; `guard`: the target guard's readings (./target-guard.mjs: frontmost(), windows(pid)); `windowList()`:
// every on-screen window front to back; `probe(args)`: the approved bundle's probe, its last JSON line;
// `textView(answer)`: its text-view reading; `moveWindow(args)`: move-window.swift's answer; `elementFrame(args)`:
// element-frame.swift's; `scenes(args)`: the scenes CLI's answer (scripts/repl-parity/scenes-mac.mjs, on `run`).
export function raiseTasks({io, run, guard, out, windowList, probe, textView, moveWindow, elementFrame, scenes}) {
  const state = ctx => (ctx.raise ??= {watch: null, range: null});
  const runWindow = id => { const r = io.scene(id); return {id, pid: r.pid, number: r.window.number, bounds: guard.windows(r.pid).find(w => w.number === r.window.number && w.onScreen !== false)?.bounds ?? null}; };
  const readRange = id => {
    try { const read = textView(probe(['text-view', '--pid', String(io.scene(id).pid)])); return read.error ? {error: read.error} : {range: read.range ?? null}; } catch (error) {
      return {error: String(error.message).split('\n')[0].slice(0, 300)};
    }
  };
  // What the watcher has seen of the call that answered `answer`, from its post (else `since`) to now.
  const watchOf = (ctx, answer, since) => {
    const watch = state(ctx).watch;
    if (!watch || !answer) return null;
    const attempt = orderAttempt(orderLines(readFileSync(watch.file, 'utf8')), watch.pid);
    return callWatch({meta: answer.meta, attempt, from: answer.meta?.actionInterval?.startedAt ?? since});
  };
  // The action's own record beside its delivery: its route, the guard's report and the events' post.
  const fixtureRecord = () => {
    const dir = readState(run).scenes?.electron?.userDataDir, file = dir ? join(dir, FIXTURE_ACCESSIBILITY_FILE) : null;
    return file && existsSync(file) ? readFileSync(file, 'utf8') : '';
  };
  const actionOf = (label, answer) => (answer ? {label, route: answer.route ?? null, delivery: answer.meta?.delivery ?? null, actionInterval: answer.meta?.actionInterval ?? null} : null);
  return {
    // The harness windows moved where placementPlan puts them, each through Accessibility by its own process and bounds,
    // then read again: each must be within 2 pt of its target.
    'raise-place': async extraIds => {
      const back = runWindow('textedit'), front = runWindow(FRONT), extras = extraIds.map(runWindow);
      const gone = [back, front, ...extras].find(w => !w.bounds);
      if (gone) return {ok: false, problem: `the ${gone.id} scene's run window is not on screen`};
      const plan = placementPlan({back: back.bounds, front: front.bounds, extras: extras.map(w => w.bounds)});
      const targets = [[back, plan.back], [front, plan.front], ...extras.map((w, k) => [w, plan.extras[k]])];
      const moves = [];
      for (const [w, to] of targets) {
        const dx = to.x - w.bounds.x, dy = to.y - w.bounds.y;
        if (dx === 0 && dy === 0) { moves.push({id: w.id, moved: 'already there'}); continue; }
        const answer = moveWindow([String(w.pid), [w.bounds.x, w.bounds.y, w.bounds.width, w.bounds.height].join(','), String(dx), String(dy)]);
        moves.push({id: w.id, dx, dy, answer});
        if (answer?.trusted === false) return {ok: false, moves, problem: 'the terminal running the kit is not trusted for Accessibility, so it cannot move the harness windows: the owner gives it Accessibility in System Settings, then run again'};
      }
      const now = targets.map(([w, to]) => ({id: w.id, to, bounds: runWindow(w.id).bounds}));
      const off = now.filter(w => !w.bounds || Math.abs(w.bounds.x - w.to.x) > 2 || Math.abs(w.bounds.y - w.to.y) > 2);
      return {ok: off.length === 0, plan, moves, bounds: now, ...(off.length ? {problem: `${off.map(w => w.id).join(', ')} did not reach ${off.length > 1 ? 'their places' : 'its place'}`} : {})};
    },
    // The scene for a case (arrangementProblem); both windows' bounds kept as `arrangement` for the cells.
    arrangement: async ([kase, samples], ctx) => {
      const front = runWindow(FRONT), back = runWindow(CASES[kase].back), list = windowList(), frontmost = guard.frontmost();
      const problem = arrangementProblem({frontmost, list, front, back, points: plannedPoints(kase, Number(samples))});
      ctx.results.arrangement = {frontBounds: front.bounds, backBounds: back.bounds};
      return {ok: problem === null, frontmost: frontmost?.pid ?? null, front: {number: front.number, bounds: front.bounds}, back: {number: back.number, bounds: back.bounds}, ...(problem ? {problem} : {})};
    },
    // f: the fixture button's frame, kept as `f button` with the run window's bounds; whether Chrome covers its middle.
    'element-frame': async (_args, ctx) => {
      const w = runWindow('electron'), answer = elementFrame([String(w.pid), FIXTURE_BUTTON.role, FIXTURE_BUTTON.name]);
      const problem = buttonProblem(answer, w.bounds);
      if (problem) return {ok: false, answer, problem};
      ctx.results['f button'] = {frame: answer.frame, window: w.bounds};
      const front = runWindow(FRONT).bounds;
      return {ok: true, frame: answer.frame, window: w.bounds, coveredByChrome: Boolean(front && inside(middle(answer.frame), front))};
    },
    // f: the fixture brought down and up again by the scenes CLI (a harness app the kit owns), so the case starts on a
    // process whose accessibility tree nothing has enabled (freshFixtureProblem).
    'fixture-relaunch': async () => {
      let before = null;
      try { before = io.scene('electron'); } catch {}
      const down = scenes(['down', 'electron']);
      const was = before && {pid: before.pid, window: before.window?.number ?? null};
      if (down?.down !== true) return {ok: false, before: was, down, problem: `the fixture did not come down (${down?.reason ?? down?.error ?? 'no answer'})`};
      const up = scenes(['up', 'electron']);
      if (!up?.pid || !up?.window?.number) return {ok: false, before: was, down, up, problem: `the fixture did not come up (${up?.error ?? 'no record'})`};
      const text = fixtureRecord(), problem = freshFixtureProblem({before: before?.pid ?? null, after: up.pid, accessibilityText: text});
      return {ok: problem === null, before: was, pid: up.pid, window: up.window.number, accessibility: fixtureAccessibility(text), ...(problem ? {problem} : {})};
    },
    // f: the fixture's accessibility as its record says now, after the placement and before the session opens (recorded).
    'fixture-accessibility': async () => ({ok: true, accessibility: fixtureAccessibility(fixtureRecord())}),
    // f: the fixture's activation, focus and blur counters, read from its user-data directory (no engine call).
    'fixture-counters': async ([, i, when]) => {
      const dir = readState(run).scenes?.electron?.userDataDir, file = dir ? join(dir, FIXTURE_COUNTERS_FILE) : null;
      try { const {seq, at: written, counts} = JSON.parse(readFileSync(file, 'utf8')); return {ok: true, i: Number(i), when, counters: {seq, at: written, counts}}; } catch (error) {
        return {ok: false, i: Number(i), when, problem: `the fixture's counters could not be read (${String(error.message).split('\n')[0]})`};
      }
    },
    'order-watch-start': async ([kase, engine], ctx) => {
      const front = io.scene(FRONT), back = io.scene(CASES[kase].back), file = join(out, orderFileOf(kase, engine));
      const watch = await startOrderWatch({file, front: front.window.number, back: back.window.number});
      state(ctx).watch = watch;
      state(ctx).since = Date.now();
      const ok = watch.start.state === 'front-above';
      return {ok, pid: watch.pid, file: basename(file), state: watch.start.state, realtime: watch.start.realtime ?? null, ...(ok ? {} : {problem: `the watcher's first reading is ${watch.start.state}`})};
    },
    // Whether the scene still holds: the order now (a raise the guard undid is not a stop; the driven window still above
    // Chrome's is), both windows on screen, the watcher running.
    'raise-check': async ([kase, i], ctx) => {
      const s = state(ctx), watch = s.watch;
      if (!watch) return {ok: false, problem: 'no watcher is running'};
      const attempt = orderAttempt(orderLines(readFileSync(watch.file, 'utf8')), watch.pid), now = stateAt(attempt, Infinity);
      const sinceLast = raisesIn(attempt).filter(c => c.at >= (s.since ?? 0)).length;
      s.since = Date.now();
      const problem = now === 'back-above' ? `the ${CASES[kase].back} window stays above Chrome's`
        : now !== 'front-above' ? `a run window left the screen (${now})` : !alive(watch.pid) ? 'the watcher is no longer running' : null;
      return {ok: problem === null, sample: i, state: now, raisesSinceLastCheck: sinceLast, ...(problem ? {problem} : {})};
    },
    // TextEdit's selected range by the approved bundle's probe, kept as the next delivery's `before`.
    'text-view': async ([kase, label], ctx) => {
      const read = readRange(CASES[kase].back);
      state(ctx).range = read.range ?? null;
      return {ok: !read.error, label, ...read};
    },
    // b: the line the preparing click put the caret in, from the range and the run's document, kept as `b line`.
    'text-line': async (_args, ctx) => {
      const read = readRange('textedit'), line = read.range?.length === 0 ? lineAt(read.range.location) : null;
      state(ctx).range = read.range ?? null;
      if (line) ctx.results['b line'] = line.text;
      return {ok: Boolean(line), ...read, ...(line ? {line} : {problem: read.error ?? `the range ${rangeText(read.range)} names no line of the run's document`})};
    },
    // A sample's delivery, beside its action's route, `cua/delivery` and post time, and what the watcher saw of it:
    // TextEdit's range read now against the one before (caret, selection, word), or the cells' reads (alignment,
    // Finder's row, the fixture's count). `ok` is the verdict, so an undelivered sample counts as failed without stopping.
    deliver: async ([kind, kase, i, part], ctx) => {
      const n = Number(i), s = state(ctx), label = LABELS.action(kase, n, part), answer = ctx.results[label];
      const action = actionOf(label, answer), watch = watchOf(ctx, answer, s.since ?? 0);
      if (kind === 'alignment' || kind === 'finder-row' || kind === 'pressed') {
        const judged = kind === 'alignment' ? alignmentFlipped(answer, ctx.results[LABELS.alignment(n)])
          : kind === 'finder-row' ? finderRowAlone(ctx.results[LABELS.finderRead(n)])
            : pressedOnce(ctx.results[LABELS.pressed(n - 1)], ctx.results[LABELS.pressed(n)]);
        return {ok: judged.delivered, i: n, part, ...judged, action, watch};
      }
      const before = s.range, read = readRange(CASES[kase].back), after = read.range ?? null;
      s.range = after;
      const judged = kind === 'caret' ? caretMoved(before, after) : kind === 'selection' ? selectionMade(before, after) : wordSelected(before, after);
      return {ok: judged.delivered, i: n, part, before, after, ...judged, action, watch, ...(read.error ? {readError: read.error} : {})};
    },
    'order-watch-stop': async ([kase], ctx) => {
      const watch = state(ctx).watch;
      if (!watch) return {ok: false, problem: 'no watcher is running'};
      state(ctx).watch = null;
      const attempt = await stopOrderWatch(watch);
      return {ok: Boolean(attempt?.end), case: kase, raises: raisesIn(attempt).length, reads: attempt?.end?.samples ?? null, maxGapMs: attempt?.end?.maxGapMs ?? null, lateSamples: attempt?.end?.lateSamples ?? null};
    },
  };
}

// The Swift tools raiseTasks takes, on this Mac, each compiled once into the harness cache. -> args -> its JSON answer.
const tool = compile => ({cache = PROBE_CACHE} = {}) => args => {
  const text = execFileSync(compile({cache}), args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000});
  return JSON.parse(text.trim().split('\n').at(-1));
};
export const liveMoveWindow = tool(moveWindowTool);
export const liveElementFrame = tool(elementFrameTool);
