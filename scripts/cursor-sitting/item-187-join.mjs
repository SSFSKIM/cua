// The isolating slot's hold-join rows (~/.local/share/187/next-slot-plan.md C2, C3 and C4 (b), (c), with its RULINGS of
// 2026-11-05; the spec's Decision Log, #261's hold join, items 1, 4, 5 and 8): what #261's re-arming does live, on the
// AFTER build only, in block 7 after #188's part (./item-187-isolate.mjs AFTER_ONLY), then #279's two cases in the tail
// (TAIL). Every row is a ⌘ key or a menu record that takes a held activation, then a coordinate click inside it.
//
// - C2, the keys-then-click raise row (JOIN_REPS repetitions, each its own item): Chrome for Testing relaunched clean on
//   the counters page and placed, TextEdit in front over its right half under ABC, the 5 ms order watcher and the
//   activation watcher on; ⌘L into Chrome's run window (a no-click holder: its early inert click spends the arm), then,
//   inside the hold, a coordinate click into the page's textarea (its middle, read through Accessibility), a tail of
//   TAIL_MS for the after-action watch, and one observation of Chrome, whose reply carries the connection's
//   after-action repairs. Premise: the click's `activationJoin` rearmed (the joiner ended the spent hold and ran its
//   own). Pre-registered, every one in every counted repetition: the order watcher never saw Chrome's window above
//   TextEdit's (noRaise); TextEdit's process frontmost at every reading and no app activated over the row
//   (frontmostTextEdit); no repair, neither the delivery guard's nor the after-action watch's (noRepairs); the page saw
//   the click, by its own counters: a click and a textarea focus after the click (pageSaw); no order sample out of place
//   after the display hold, by ./raise.mjs callWatch: no late, outlived, flashed or unguarded raise (noFlash).
// - C3, the dialog variant (JOIN_REPS repetitions, each its own item): Chrome relaunched on the popup page
//   (`scenes-mac.mjs up chrome --page popup`: the counters page, launched with --disable-popup-blocking, whose script
//   opens a 360 × 240 popup window when the kit posts to the page's own server; no person and no engine action opens
//   it), the activation watcher on before it opens, TextEdit activated again in front; a session whose Chrome is that
//   popup window (the runner's `windows`: the target guard checks it as Chrome's front window); ⌘A into the popup,
//   then inside the hold a coordinate click on its close button, which closes the click's own window; TAIL_MS; one
//   observation of the electron scene, a request aimed at another app, which ends the hold (FocusHold.swift) and so
//   posts its subtype 2 stamped with the closed popup's window number; then Chrome read again every RELEASE_POLL_MS up to
//   RELEASE_SETTLE_MS. Premise: the popup opened, the click's join rearmed (the swap the Decision Log's item 8 reads),
//   the popup gone after the click. Pre-registered, after the release, every one in every counted repetition: Chrome's
//   main window's document.hasFocus() false with a window blur beaconed after the release (unread, not failed, when the
//   page did not hold the focus as the hold ended: its blur could not show); Chrome's AXFrontmost false; TextEdit
//   frontmost.
// - Each verdict, C2's and C3's apart: FAIL when a counted repetition fails a condition; PASS when JOIN_REPS are
//   counted and every condition of every one holds; INCOMPLETE otherwise (fewer counted, a reading missing). Not
//   counted, and said why: person-touched (replaced once, as the cell's repetitions are), not attested (the AFTER build,
//   ./item-187-isolate.mjs attestProblem), invalid (an act that did not go out), premise not met.
// - C4, measured with no verdict, TAIL_REPS repetitions inside one item and one session each (a minute or less):
//   (b) the menu span: Chrome placed as for C2, the engine's menu record of Chrome's last menu-bar item (Help), whether
//   a menu shows open (menu-open.swift), then a coordinate click into the page's textarea with no observation between
//   (so the recorded menu is not observed again), TAIL_MS, an observation of the electron scene; (c) in frame: TextEdit
//   at the left behind the run's Finder window, ⌘↑ (a key equivalent that selects and changes nothing), then a
//   coordinate click into its text, TAIL_MS, the electron observation. For each repetition: whether the click ordered
//   the window (the order watcher), the guard's repairs and their time, whether a sample was out of place after the
//   display hold, and the click's `activationJoin`.
// Only counts, times, pids, bundle ids, window numbers and the engine's value-free meta are kept; the page sends its
// counters, never its text.
import {cell} from '../native-baseline/cells.mjs';
import {POPUP_BUTTON} from '../native-matrix/fixtures/scene-page.mjs';
import {prelude} from '../native-matrix/matrix-cells.mjs';
import {documentWindows} from '../repl-parity/scenes-mac.mjs';
import {OBSERVE} from './cells.mjs';
import {runWindowBounds} from './focus.mjs';
import {GROUPS, keyWindowOf, lastAttempt, menuOpened, ORDER_SETTLE_MS, personTouchedOf, S, settleReplacements} from './item-187.mjs';
import {afterActionRepairsIn, callWatch, middle, raisesIn, stateAt, TAIL_MS, WATCH_GAP_MS} from './raise.mjs';
import {SCENE_MARKER} from './target-guard.mjs';

const j = JSON.stringify;
export const JOIN_REPS = 3, TAIL_REPS = 3;
// The key each row sends: C2's ⌘L (Chrome's location bar: no click of its own), C3's ⌘A into the popup, C4 (c)'s ⌘↑
// (the caret to the document's start: no selection, so TextEdit raises no affordance window of its own).
export const KEYS = Object.freeze({raise: 'super+l', dialog: 'super+a', inframe: 'super+Up'});
// The popup's open: the server asked every POPUP_POLL_MS until a waiting page takes it, then Chrome's windows read until
// one other on-screen document window has stayed POPUP_STABLE_POLLS polls; each within POPUP_BOUND_MS. Its close: gone
// within POPUP_GONE_MS of the click.
export const POPUP_BOUND_MS = 5000, POPUP_POLL_MS = 100, POPUP_STABLE_POLLS = 2, POPUP_GONE_MS = 2000;
// After C3's release, how long Chrome is read again for the three conditions, and how often.
export const RELEASE_SETTLE_MS = 2000, RELEASE_POLL_MS = 100;
// C4 (c)'s click, fractions of TextEdit's run window: in its text, clear of Finder's window over its right half.
export const INFRAME_POINT = Object.freeze([0.25, 0.5]);
export const ITEMS_JOIN = Object.freeze({raise: n => `187-iso-raise-${n}`, dialog: n => `187-iso-dialog-${n}`, menu: '187-iso-menu', inframe: '187-iso-inframe'});
const REP_ITEM = /^187-iso-(raise|dialog)-(\d+)$/;
const CHROME_GROUP = 'chrome-cell-background', INFRAME_GROUP = 'textedit-behind-finder';
export const LABELS_JOIN = Object.freeze({
  keys: tag => `${tag} keys: the key equivalent`,
  menu: tag => `${tag} menu: the menu bar's last item recorded`,
  click: tag => `${tag} click: the coordinate click inside the hold`,
  after: tag => `${tag} after: one observation, the after-action repairs read`,
  release: tag => `${tag} release: the electron scene observed, ending the hold`,
  // Not steps' labels: where the tasks leave what later steps and the record read.
  read: (tag, when) => `${tag} read ${when}`,
  frame: key => `${key} frame`,
  popup: tag => `${tag} popup`,
  gone: tag => `${tag} popup gone`,
  menuRead: tag => `${tag} menu read`,
});
const L = LABELS_JOIN;
const tagOf = (item, k = 0) => `${item}#${k}`;

// ---- the cells -----------------------------------------------------------------------------------------------------

const head = scene => `${SCENE_MARKER(scene)}\n${prelude(scene)}`;
// One facade call, its throw caught so the cell keeps the call's meta.
const caught = call => `let threw = false, message = null;
try { await ${call}; } catch (e) { threw = true; message = String(e?.message ?? e).slice(0, 300); }`;
// The key equivalent, the cell's one call. -> {sent, threw, message}.
export const KEY_CELL = (scene, key) => cell(`${head(scene)}
// cua-187: the key equivalent
${caught(`__app.pressKey(${j(key)})`)}
return {sent: true, threw, message};`);
// A coordinate click at the global point `global` inside the window at `window` (both top-left points), scaled into the
// bound screenshot's pixels, the cell's last call; with `observe`, an observation first (the look an agent takes).
// -> {sent, point, threw, message} or {sent: false, reason}.
export const CLICK_CELL = (scene, global, window, {observe = true} = {}) => cell(`${head(scene)}
// cua-187: the coordinate click
const s = globalThis.__size?.[${j(scene)}], g = ${j(global ?? null)}, w = ${j(window ?? null)};
if (!s) return {sent: false, reason: "the ${scene} scene's screenshot size is not known: nothing sent"};
if (!g || !(w?.width > 0)) return {sent: false, reason: "the point or the window's bounds were not read: nothing sent"};
${observe ? 'await observe();\n' : ''}const scale = s.width / w.width, point = [Math.round((g.x - w.x) * scale), Math.round((g.y - w.y) * scale)];
${caught('__app.click(point)')}
return {sent: true, point, threw, message};`);
// The index of the menu bar's last top-level item in an observation's text (Help, in every language), or null.
export function lastMenuBarIndex(ax) {
  const lines = String(ax).split('\n').map(line => /^[~+-]?(\t*)(\d+) (.*)$/.exec(line)).map(m => (m ? {depth: m[1].length, index: Number(m[2]), content: m[3]} : null));
  const bar = lines.findIndex(l => l && /^menu bar(?:,|$)/.test(l.content));
  if (bar < 0) return null;
  let last = null;
  for (let i = bar + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.depth <= lines[bar].depth) break;
    if (line.depth === lines[bar].depth + 1) last = line.index;
  }
  return last;
}
// The engine's menu record (a click on a menu-bar item: its held activation and recorded menu, MenuSpan.swift) of the
// menu bar's last item. -> {sent, threw, message} or {sent: false, reason}.
export const MENU_CELL = scene => cell(`${head(scene)}
// cua-187: the menu record
const lastMenuBarIndex = ${lastMenuBarIndex.toString()};
const ax = await observe();
const index = lastMenuBarIndex(ax);
if (index === null) return {sent: false, reason: "the menu bar is not in the text: nothing sent"};
${caught('__app.click(index)')}
return {sent: true, threw, message};`);
// The click cell at the point a task kept under `key`.
const clickAt = (scene, key, options) => results => CLICK_CELL(scene, results[L.frame(key)]?.point, results[L.frame(key)]?.window, options);

// ---- the steps -----------------------------------------------------------------------------------------------------

// Whether a cell's call went out: answered, sent, not thrown.
const acted = label => results => { const a = results[label]; return a?.ok === true && a.value?.sent === true && a.value?.threw !== true; };
const chromeSetup = (item, page = null) => [
  {task: '187-relaunch', args: [item, 'chrome', ...(page ? [page] : [])], required: true},
  {task: '187-place', required: true},
  {task: 'activate', args: ['textedit'], required: true},
  {task: 'select-source', args: ['latin', 'textedit'], required: true},
];
const watched = (item, group) => [{task: '187-arrange', args: [group], required: true}, {task: '187-order-start', args: [item, group], required: true}];
// The session closed, the watchers' records kept (the order watcher's after the rows' records read it), TextEdit back in
// front. `reps`: [{tag, rep}].
const closing = (item, kind, reps) => [
  {close: S},
  {task: '187-activations-stop', args: [item]},
  ...reps.map(({tag, rep}) => ({task: '187-join-record', args: [tag, kind, String(rep)]})),
  {task: '187-order-stop', args: [item]},
  {task: 'activate', args: ['textedit']},
];

// C2's repetition `n`.
function raiseSteps(item, n) {
  const tag = tagOf(item), keyed = acted(L.keys(tag)), clicked = acted(L.click(tag));
  return [
    {say: `#187 ${item}: C2, the keys-then-click row, repetition ${n + 1}: Chrome relaunched clean and placed, TextEdit in front; ⌘L into Chrome's run window, then inside its hold a coordinate click into the page's textarea (its join must read rearmed); nobody touches the Mac until the item ends`},
    {series: [item], counts: {rows: 1}},
    ...chromeSetup(item),
    ...watched(item, CHROME_GROUP),
    {task: '187-activations-start', args: [item], required: true},
    {open: S, engine: 'cua', scenes: ['chrome', 'textedit']},
    {task: '187-join-frame', args: [tag, 'chrome', 'AXTextArea', 'Scene notes'], required: true},
    {task: '187-join-read', args: [tag, 'before', 'chrome']},
    {run: S, cell: KEY_CELL('chrome', KEYS.raise), label: L.keys(tag), keys: 'textedit'},
    {task: '187-join-read', args: [tag, 'keys', 'chrome'], when: keyed},
    {run: S, cell: clickAt('chrome', tag), label: L.click(tag), when: keyed},
    {wait: TAIL_MS, when: clicked},
    {run: S, cell: OBSERVE('chrome'), label: L.after(tag), when: clicked},
    {task: '187-join-read', args: [tag, 'after', 'chrome'], when: clicked},
    ...closing(item, 'raise', [{tag, rep: n}]),
  ];
}

// C3's repetition `n`.
function dialogSteps(item, n) {
  const tag = tagOf(item), keyed = acted(L.keys(tag)), clicked = acted(L.click(tag)), released = results => results[L.release(tag)]?.ok === true;
  return [
    {say: `#187 ${item}: C3, the dialog variant, repetition ${n + 1}: Chrome relaunched on the popup page, its popup opened by the page, TextEdit in front; ⌘A into the popup, then inside its hold a click on the popup's close button, the hold ended by an observation elsewhere, Chrome read after the release; nobody touches the Mac until the item ends`},
    {series: [item], counts: {rows: 1}},
    ...chromeSetup(item, 'popup'),
    // The watcher before the popup opens: an activation of Chrome that the opening causes must be read as the scene's.
    {task: '187-activations-start', args: [item], required: true},
    {task: '187-popup-open', args: [tag], required: true},
    {task: 'activate', args: ['textedit'], required: true},
    ...watched(item, CHROME_GROUP),
    {open: S, engine: 'cua', scenes: ['chrome', 'textedit', 'electron'], windows: {chrome: results => results[L.popup(tag)]?.number ?? null}},
    {task: '187-join-frame', args: [tag, 'chrome', 'AXButton', POPUP_BUTTON, 'popup'], required: true},
    {task: '187-join-read', args: [tag, 'before', 'chrome']},
    {run: S, cell: KEY_CELL('chrome', KEYS.dialog), label: L.keys(tag), keys: 'textedit'},
    {task: '187-join-read', args: [tag, 'keys', 'chrome'], when: keyed},
    {run: S, cell: clickAt('chrome', tag), label: L.click(tag), when: keyed},
    {task: '187-popup-gone', args: [tag], when: clicked},
    {wait: TAIL_MS, when: clicked},
    {task: '187-join-read', args: [tag, 'held', 'chrome'], when: clicked},
    {run: S, cell: OBSERVE('electron'), label: L.release(tag), when: clicked},
    {task: '187-join-read', args: [tag, 'released', 'chrome', 'release'], when: released},
    ...closing(item, 'dialog', [{tag, rep: n}]),
  ];
}

// C2's or C3's repetitions, each its own item: the planned JOIN_REPS, each with `replace(attempt)`, its replacement for a
// person-touched attempt (the next number), whose first step names the attempt it replaces. -> [{item, stage, rep, steps}].
function repEntries(kind, steps) {
  let next = JOIN_REPS - 1;
  const entry = (n, parent = null) => {
    const item = ITEMS_JOIN[kind](n), base = {item, stage: kind, rep: n, steps: parent ? [{task: '187-replaces', args: [parent.item, String(parent.attempt)]}, ...steps(item, n)] : steps(item, n)};
    return parent ? {...base, replacement: parent} : {...base, replace: attempt => entry(next += 1, {item, attempt})};
  };
  return Array.from({length: JOIN_REPS}, (_, n) => entry(n));
}
export const raisePlan = () => repEntries('raise', raiseSteps);
export const dialogPlan = () => repEntries('dialog', dialogSteps);

// C4 (b), one item: the menu record, the menu read, the click with no observation between, the tail, the release.
export function menuPlan() {
  const item = ITEMS_JOIN.menu, reps = Array.from({length: TAIL_REPS}, (_, k) => ({tag: tagOf(item, k), rep: k}));
  return [{item, stage: 'tail', steps: [
    {say: `#187 ${item}: C4 (b), #279's menu span, measured with no verdict: ${TAIL_REPS} times Chrome's last menu recorded by the engine, then a coordinate click into the page's textarea; nobody touches the Mac until the item ends`},
    {series: [item], counts: {rows: TAIL_REPS}},
    ...chromeSetup(item),
    ...watched(item, CHROME_GROUP),
    {task: '187-activations-start', args: [item], required: true},
    {open: S, engine: 'cua', scenes: ['chrome', 'textedit', 'electron']},
    {task: '187-join-frame', args: [item, 'chrome', 'AXTextArea', 'Scene notes'], required: true},
    ...reps.flatMap(({tag}) => {
      const recorded = acted(L.menu(tag)), clicked = acted(L.click(tag));
      return [
        {task: '187-join-read', args: [tag, 'before', 'chrome']},
        {run: S, cell: MENU_CELL('chrome'), label: L.menu(tag)},
        {task: '187-join-menu', args: [tag], when: recorded},
        {run: S, cell: clickAt('chrome', item, {observe: false}), label: L.click(tag), when: recorded},
        {wait: TAIL_MS, when: clicked},
        {run: S, cell: OBSERVE('electron'), label: L.after(tag), when: clicked},
        {task: '187-join-read', args: [tag, 'after', 'chrome']},
        {task: '187-join-tidy', args: [tag, CHROME_GROUP]},
      ];
    }),
    ...closing(item, 'menu', reps),
  ]}];
}

// C4 (c), one item: TextEdit behind the run's Finder window, ⌘↑, the click into its text, the tail, the release.
export function inframePlan() {
  const item = ITEMS_JOIN.inframe, reps = Array.from({length: TAIL_REPS}, (_, k) => ({tag: tagOf(item, k), rep: k}));
  return [{item, stage: 'tail', steps: [
    {say: `#187 ${item}: C4 (c), #279's in-frame case, measured with no verdict: ${TAIL_REPS} times ⌘↑ into TextEdit behind the run's Finder window, then a coordinate click into its text; nobody touches the Mac until the item ends`},
    {series: [item], counts: {rows: TAIL_REPS}},
    {task: '187-place', args: ['textedit', 'finder'], required: true},
    {task: 'activate', args: ['finder'], required: true},
    ...watched(item, INFRAME_GROUP),
    // Finder is this item's scene too: its activations and its frontmost process are the run's.
    {task: '187-activations-start', args: [item, 'finder'], required: true},
    // Finder is the user window only, never observed through the engine (#188's rows likewise).
    {open: S, engine: 'cua', scenes: ['textedit', 'finder', 'electron'], bind: ['textedit', 'electron']},
    {task: '187-join-point', args: [item, 'textedit', ...INFRAME_POINT.map(String)], required: true},
    ...reps.flatMap(({tag}) => {
      const keyed = acted(L.keys(tag)), clicked = acted(L.click(tag));
      return [
        {task: '187-join-read', args: [tag, 'before', 'textedit']},
        {run: S, cell: KEY_CELL('textedit', KEYS.inframe), label: L.keys(tag), keys: 'finder'},
        {run: S, cell: clickAt('textedit', item), label: L.click(tag), when: keyed},
        {wait: TAIL_MS, when: clicked},
        {run: S, cell: OBSERVE('electron'), label: L.after(tag), when: clicked},
        {task: '187-join-read', args: [tag, 'after', 'textedit']},
        {task: '187-join-tidy', args: [tag, INFRAME_GROUP]},
      ];
    }),
    ...closing(item, 'inframe', reps),
  ]}];
}

// ---- a repetition's record -----------------------------------------------------------------------------------------

const DELIVERY_KEYS = Object.freeze(['restores', 'raiseLeft', 'repairedAfterRelease', 'capped', 'holdStartedAt', 'releasedAt', 'postedAt', 'restoreLatencyMs',
  'repairAfterReleaseLatencyMs', 'frontmostRestored', 'otherAppFront']);
// A cell's answer as the record keeps it: whether its call went out, the engine that answered, and the call's value-free
// meta (its join, its activation's click, the delivery guard's report, the connection's after-action repairs).
export function callOf(a) {
  if (!a) return null;
  const m = a.meta ?? {}, v = a.value ?? {};
  return {ok: a.ok === true, sent: v.sent === true, threw: v.threw === true, error: (a.ok ? (v.threw ? v.message : v.sent === false ? v.reason : null) : a.error) ?? null,
    route: a.route ?? null, nativeEngine: a.nativeEngine ?? null, join: m.activationJoin ?? null, clickKind: m.activationClickKind ?? null,
    activationClick: m.activationClick ?? null, guardMs: m.activationGuardMs ?? null,
    delivery: m.delivery ? Object.fromEntries(DELIVERY_KEYS.filter(k => m.delivery[k] !== undefined).map(k => [k, m.delivery[k]])) : null,
    afterActionRepairs: m.afterActionRepairs ?? null, point: Array.isArray(v.point) ? v.point : null};
}
const wentOut = c => c?.ok === true && c.sent === true && c.threw !== true;

// What the order watcher's run shows of a repetition, from its first reading (`from`) to its last (`until`): every
// raise (the driven window above the user's), and the click's by callWatch (late, outlived, flash, unguarded, undecided,
// and the post's times to the first raise and to the hold's release). -> the watch, or null without a run.
export function watchOf(run, meta, from, until, repaired) {
  if (!run) return null;
  const lo = Number.isFinite(from) ? from : -Infinity, hi = Number.isFinite(until) ? until : Infinity;
  const raises = raisesIn(run).filter(c => c.at >= lo && c.at <= hi), w = callWatch({meta: meta ?? {}, attempt: run, from: lo, until: hi, repaired});
  return {raises: raises.length, raisedAt: raises.map(c => c.at), stateAtStart: stateAt(run, lo), guarded: w.guarded, late: w.late, outlived: w.outlived, flash: w.flash,
    unguarded: w.unguarded, undecided: w.undecided, postToRaiseMs: w.postToRaiseMs, postToReleaseMs: w.postToReleaseMs};
}

// One repetition's record (the task's, from the answers and readings the steps kept). `kind`: raise | dialog | menu |
// inframe; `holder`: the key equivalent's or the menu record's answer; `click`; `later`: the observation after the
// click (C3's release); `reads`: {before, keys, held, released, after} ({at, front, page, key}); `run`: the order
// watcher's run; `activations`: the activation watcher's lines over the item; `scenePids`, `own`: what the touch rule
// counts as the run's (personTouchedOf); `popup`, `gone`: C3's popup; `menu`: C4 (b)'s menu reading. -> the record.
export function joinRecord({kind, tag, rep = 0, holder = null, click = null, later = null, reads = {}, run = null, activations = [], scenePids = [], own = [], texteditPid = null,
  popup = null, gone = null, menu = null}) {
  const clickCall = callOf(click), repairs = afterActionRepairsIn([click, later].filter(Boolean).map(a => ({kind: 'cell', meta: a.meta ?? {}})));
  const postedAt = clickCall?.delivery?.postedAt;
  return {kind, tag, item: tag.slice(0, tag.lastIndexOf('#')), rep, texteditPid,
    personTouched: personTouchedOf({activations, fronts: Object.values(reads).map(r => r?.front ?? null), scenePids, own}),
    holder: callOf(holder), click: clickCall, later: callOf(later),
    repairs: {total: repairs.total, click: Number.isFinite(postedAt) ? repairs.actions.get(postedAt) ?? null : null},
    watch: watchOf(run, click?.meta, reads.before?.at, reads.after?.at ?? reads.released?.at, repairs.actions),
    reads, activations: activations.filter(l => l?.kind === 'activated').map(l => ({bundleId: l.bundleId ?? null, at: l.at ?? null})),
    ...(kind === 'dialog' ? {popup: popup && {number: popup.number ?? null, bounds: popup.bounds ?? null, ms: popup.ms ?? null, chromeFront: popup.chromeFront ?? null}, gone} : {}),
    ...(kind === 'menu' ? {menu} : {})};
}

// ---- the tasks -----------------------------------------------------------------------------------------------------

// C3's three conditions after the release, from the reading after it (`released`), the one as the hold ended (`held`)
// and TextEdit's pid: each true, false or null (unread). The page's needs the page to have held the focus as the hold
// ended, else its blur could not show (null).
export function releaseConditions(released, held, texteditPid) {
  const page = released?.page, before = held?.page;
  const pageRead = page?.counts && before?.counts && typeof page.focused === 'boolean' && before.focused === true;
  return {
    pageReleased: pageRead ? page.focused === false && page.counts.windowBlur > before.counts.windowBlur : null,
    appNotFrontmost: released?.key?.trusted === true && released.key.ok === true && typeof released.key.frontmost === 'boolean' ? released.key.frontmost === false : null,
    texteditFront: Number.isSafeInteger(released?.front) && Number.isSafeInteger(texteditPid) ? released.front === texteditPid : null,
  };
}

const inside = (p, b) => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
// The tasks the steps above name, for ./runner.mjs liveIo, over `d` (./item-187.mjs liveDeps187's shape: scene, state,
// windows, frontmost, pageCounters, axWindow, elementFrame, openPopup, menu, order, activate, now, sleep). The order and
// activation watchers are ./item-187.mjs's (its tasks keep them in `ctx.r187`).
export function joinTasks(d) {
  const attempt = fn => { try { return fn(); } catch { return null; } };
  const boundsArg = b => [b.x, b.y, b.width, b.height].join(',');
  const windowsOf = pid => attempt(() => d.windows(pid)) ?? [];
  const keyOf = id => {
    const r = d.scene(id), b = runWindowBounds(windowsOf(r.pid), r.window.number);
    return b ? keyWindowOf(attempt(() => d.axWindow([String(r.pid), boundsArg(b)]))) : null;
  };
  const pageOf = () => { const p = attempt(d.pageCounters); return p ? {seq: p.seq ?? null, counts: p.counts ?? null, focused: typeof p.focused === 'boolean' ? p.focused : null} : null; };
  const read = driven => ({at: d.now(), front: attempt(d.frontmost)?.pid ?? null, page: driven === 'chrome' ? pageOf() : null, key: keyOf(driven)});
  const others = (r, number) => documentWindows(windowsOf(r.pid)).filter(w => w.onScreen !== false && w.number !== number);
  return {
    // The readings at a point of the row: the time, the frontmost process, the page's counters (Chrome) and the driven
    // app's key-window state on its run window. `mode` release (C3): read again until the three conditions hold or
    // RELEASE_SETTLE_MS pass.
    '187-join-read': async ([tag, when, driven = 'chrome', mode = null], ctx) => {
      const t0 = d.now();
      let now = read(driven), polls = 1;
      if (mode === 'release') {
        const held = ctx.results[L.read(tag, 'held')] ?? null, texteditPid = attempt(() => d.scene('textedit').pid);
        const done = r => Object.values(releaseConditions(r, held, texteditPid)).every(v => v === true);
        while (!done(now) && d.now() - t0 < RELEASE_SETTLE_MS) { await d.sleep(RELEASE_POLL_MS); now = read(driven); polls++; }
        now = {...now, settledMs: d.now() - t0, polls};
      }
      ctx.results[L.read(tag, when)] = now;
      return {ok: true, tag, when, ...now};
    },
    // The middle of a control's frame through Accessibility (element-frame.swift), inside its window (the run window,
    // or C3's popup), kept for the click.
    '187-join-frame': async ([key, scene, role, name, which = 'run'], ctx) => {
      const r = d.scene(scene), number = which === 'popup' ? ctx.results[L.popup(key)]?.number ?? null : r.window.number;
      const window = number === null ? null : runWindowBounds(windowsOf(r.pid), number), answer = attempt(() => d.elementFrame([String(r.pid), role, name]));
      const problem = answer?.trusted === false ? 'the terminal running the kit is not trusted for Accessibility, so it cannot read the control\'s frame'
        : !answer?.found ? `the ${role} ${name} was not found: ${answer?.error ?? 'no answer'}` : !window ? `the ${scene} scene's ${which} window is not on screen`
          : !inside(middle(answer.frame), window) ? `the ${role}'s middle is not inside the ${which} window` : null;
      if (!problem) ctx.results[L.frame(key)] = {point: middle(answer.frame), window};
      return {ok: problem === null, key, scene, role, which, frame: answer?.frame ?? null, window, ...(problem ? {problem} : {})};
    },
    // A point at fractions of a scene's run window, kept for the click (C4 (c): TextEdit's text).
    '187-join-point': async ([key, scene, fx, fy], ctx) => {
      const r = d.scene(scene), b = runWindowBounds(windowsOf(r.pid), r.window.number);
      if (!b) return {ok: false, key, scene, problem: `the ${scene} scene's run window is not on screen`};
      ctx.results[L.frame(key)] = {point: {x: b.x + Number(fx) * b.width, y: b.y + Number(fy) * b.height}, window: b};
      return {ok: true, key, scene, point: ctx.results[L.frame(key)].point, window: b};
    },
    // C3: the popup opened by the page, asked through its own server (a post the server hands to the page's waiting
    // request, retried until the page is waiting), then Chrome's one other on-screen document window, stable over
    // POPUP_STABLE_POLLS polls, kept with whether Chrome came to the front with it.
    '187-popup-open': async ([tag], ctx) => {
      const r = d.scene('chrome'), page = d.state().scenes?.chrome?.page ?? null, t0 = d.now();
      if (page?.variant !== 'popup' || !page.url) return {ok: false, tag, problem: 'Chrome is not on the popup page (187-relaunch <item> chrome popup)'};
      let status = null, asks = 0;
      while (d.now() - t0 < POPUP_BOUND_MS) {
        try { status = await d.openPopup(page.url); } catch { status = null; }
        asks++;
        if (status === 200) break;
        await d.sleep(POPUP_POLL_MS);
      }
      if (status !== 200) return {ok: false, tag, asks, status, problem: `no page took the popup's open within ${POPUP_BOUND_MS} ms (the server answered ${status ?? 'nothing'})`};
      const t1 = d.now();
      let popup = null, stable = 0, polls = 0, shown = [];
      while (stable < POPUP_STABLE_POLLS && (polls === 0 || d.now() - t1 < POPUP_BOUND_MS)) {
        if (polls) await d.sleep(POPUP_POLL_MS);
        polls++;
        shown = others(r, r.window.number);
        const w = shown.length === 1 ? shown[0] : null;
        stable = w && popup && w.number === popup.number ? stable + 1 : w ? 1 : 0;
        popup = w;
      }
      const ok = stable >= POPUP_STABLE_POLLS, chromeFront = attempt(d.frontmost)?.pid === r.pid;
      if (ok) ctx.results[L.popup(tag)] = {number: popup.number, bounds: popup.bounds, ms: d.now() - t0, chromeFront};
      return {ok, tag, asks, polls, ms: d.now() - t0, popup: ok ? {number: popup.number, bounds: popup.bounds} : null, chromeFront, windows: shown.map(w => w.number),
        ...(ok ? {} : {problem: `Chrome showed ${shown.length} other on-screen window(s), not its one popup, stable over ${POPUP_STABLE_POLLS} polls within ${POPUP_BOUND_MS} ms`})};
    },
    // C3: the popup's window gone after the click, read every POPUP_POLL_MS up to POPUP_GONE_MS.
    '187-popup-gone': async ([tag], ctx) => {
      const r = d.scene('chrome'), number = ctx.results[L.popup(tag)]?.number ?? null, t0 = d.now();
      const there = () => windowsOf(r.pid).some(w => w.number === number && w.onScreen !== false);
      let still = there();
      while (still && d.now() - t0 < POPUP_GONE_MS) { await d.sleep(POPUP_POLL_MS); still = there(); }
      const gone = number !== null && !still;
      ctx.results[L.gone(tag)] = {gone, ms: d.now() - t0};
      return {ok: gone, tag, number, gone, ms: d.now() - t0, ...(gone ? {} : {problem: `the popup's window ${number ?? '(unknown)'} was still on screen ${POPUP_GONE_MS} ms after the click`})};
    },
    // C4 (b): whether a menu shows open on Chrome after the record (menu-open.swift read: roles and counts only).
    '187-join-menu': async ([tag], ctx) => {
      const answer = attempt(() => d.menu.read(d.scene('chrome').pid));
      const kept = {snapshot: answer?.trusted === true && answer.ok === true, selected: answer?.selected ?? null, openMenus: answer?.openMenus ?? null,
        focusedRole: answer?.focusedRole ?? null, opened: menuOpened(answer)};
      ctx.results[L.menuRead(tag)] = kept;
      return {ok: kept.snapshot, tag, ...kept};
    },
    // Between C4's repetitions: the driven window left above the user's is put back by activating the user's app, so
    // the next repetition starts as the first did. Harness windows only.
    '187-join-tidy': async ([tag, group], ctx) => {
      const watch = ctx.r187?.order, g = GROUPS[group];
      if (!watch) return {ok: true, tag, restored: false};
      const before = stateAt(attempt(() => d.order.attempt(watch)), Infinity);
      if (before !== 'back-above') return {ok: true, tag, restored: false, state: before};
      await d.activate(g.user);
      await d.sleep(ORDER_SETTLE_MS);
      const state = stateAt(attempt(() => d.order.attempt(watch)), Infinity);
      return {ok: state === 'front-above', tag, restored: true, before, state, ...(state === 'front-above' ? {} : {problem: `the ${g.user} window could not be put back above the ${g.driven} window (${state})`})};
    },
    // The repetition's record (joinRecord), read while the order watcher still runs and after the activation watcher
    // stopped.
    '187-join-record': async ([tag, kind, rep], ctx) => {
      const s = ctx.r187 ?? {}, r = ctx.results;
      const reads = Object.fromEntries(['before', 'keys', 'held', 'released', 'after'].map(w => [w, r[L.read(tag, w)] ?? null]).filter(([, v]) => v));
      const scenePids = ['chrome', 'textedit', 'electron', ...(s.ownScenes ?? [])].map(id => attempt(() => d.scene(id).pid)).filter(Number.isSafeInteger);
      return joinRecord({kind, tag, rep: Number(rep), holder: r[kind === 'menu' ? L.menu(tag) : L.keys(tag)] ?? null, click: r[L.click(tag)] ?? null,
        later: r[kind === 'dialog' ? L.release(tag) : L.after(tag)] ?? null, reads, run: s.order ? attempt(() => d.order.attempt(s.order)) : null,
        activations: s.itemActivations ?? [], scenePids, own: s.own ?? [], texteditPid: attempt(() => d.scene('textedit').pid),
        popup: r[L.popup(tag)] ?? null, gone: r[L.gone(tag)] ?? null, menu: r[L.menuRead(tag)] ?? null});
    },
  };
}

// ---- the judge -----------------------------------------------------------------------------------------------------

// Whether an item's order watcher's record (its 187-order-stop) covers it: an end, no gap past WATCH_GAP_MS; null unread.
export const watcherWhole = stop => (!stop ? null : stop.ok === true && Number.isFinite(stop.maxGapMs) && stop.maxGapMs <= WATCH_GAP_MS);

// C2's five conditions on a counted repetition, each true, false or null (unread). `watcher`: the item's 187-order-stop.
export function raiseConditions(r, watcher) {
  const whole = watcherWhole(watcher), w = r.watch, reads = r.reads ?? {};
  const from = reads.before?.at, until = reads.after?.at;
  const fronts = ['before', 'keys', 'after'].map(k => reads[k]?.front ?? null);
  const activated = Number.isFinite(from) && Number.isFinite(until) ? (r.activations ?? []).filter(l => l.at >= from && l.at <= until) : [];
  const delta = name => (reads.keys?.page?.counts && reads.after?.page?.counts ? reads.after.page.counts[name] - reads.keys.page.counts[name] : null);
  const dv = r.click?.delivery;
  return {
    noRaise: !w || whole !== true ? null : w.raises === 0,
    frontmostTextEdit: fronts.some(p => p !== null && p !== r.texteditPid) || activated.length ? false : fronts.includes(null) || !Number.isFinite(until) ? null : true,
    noRepairs: !dv || !Number.isInteger(dv.restores) || r.later?.ok !== true ? null : dv.restores === 0 && dv.repairedAfterRelease !== true && !(r.repairs?.click?.repairs > 0),
    pageSaw: delta('click') === null ? null : delta('click') >= 1 && delta('textFocus') >= 1,
    noFlash: !w || whole !== true ? null : w.late + w.outlived + w.flash + w.unguarded > 0 ? false : w.undecided ? null : true,
  };
}
// C3's three, on the readings after the release.
export const dialogConditions = r => releaseConditions(r.reads?.released, r.reads?.held, r.texteditPid);
export const CONDITIONS = Object.freeze({raise: raiseConditions, dialog: dialogConditions});
export const CONDITION_TEXT = Object.freeze({
  noRaise: 'the order watcher never saw Chrome\'s window above TextEdit\'s', frontmostTextEdit: 'TextEdit frontmost throughout, no app activated',
  noRepairs: 'the guard made no repairs (the delivery guard\'s restores 0, no after-action repair)', pageSaw: 'the page saw the click (a click and the textarea\'s focus, by its own counters)',
  noFlash: 'no order sample out of place after the display hold', pageReleased: 'the main window\'s document.hasFocus() false, its blur seen after the release',
  appNotFrontmost: 'Chrome\'s AXFrontmost false', texteditFront: 'TextEdit still frontmost'});

// Why a recorded repetition is not counted, or counted. `attest(native)`: why a result's cua/nativeEngine does not
// attest the AFTER build, or null. -> [status, why].
export function joinStatus(kind, r, {attest}) {
  if (r.personTouched) return ['person-touched', 'touched by the person'];
  const what = {holder: 'the key equivalent', click: 'the click', later: kind === 'dialog' ? 'the release observation' : 'the observation after the click'};
  for (const which of ['holder', 'click']) {
    if (!wentOut(r[which])) return ['invalid', `${what[which]} did not go out (${r[which]?.error ?? 'not sent'})`];
    const problem = attest(r[which].nativeEngine ?? null);
    if (problem) return ['not attested', `${what[which]}: ${problem}`];
  }
  if (r.later?.ok !== true) return ['invalid', `${what.later} failed (${r.later?.error ?? 'not sent'})`];
  if (kind === 'dialog' && !Number.isSafeInteger(r.popup?.number)) return ['premise not met', 'the popup did not open'];
  if (r.click.join !== 'rearmed') return ['premise not met', `the click's activationJoin was ${r.click.join ?? 'unrecorded'}, not rearmed`];
  if (kind === 'dialog' && r.gone?.gone !== true) return ['premise not met', 'the popup\'s window was still on screen after the click'];
  return ['counted', null];
}

// A part's verdict over its repetitions ({counted, conditions}). -> {verdict: PASS | FAIL | INCOMPLETE, why}.
export function joinVerdict(reps, need = JOIN_REPS) {
  const counted = reps.filter(c => c.counted), named = (c, v) => Object.entries(c.conditions).filter(([, x]) => x === v).map(([k]) => k);
  const failed = counted.filter(c => named(c, false).length);
  if (failed.length) return {verdict: 'FAIL', why: failed.map(c => `${c.item}: not ${named(c, false).join(', not ')}`)};
  const unread = counted.filter(c => named(c, null).length);
  if (counted.length >= need && !unread.length) return {verdict: 'PASS', why: []};
  return {verdict: 'INCOMPLETE', why: [counted.length < need && `${counted.length} of ${need} repetitions counted`, ...unread.map(c => `${c.item}: ${named(c, null).join(', ')} unread`)].filter(Boolean)};
}

const rowsOf = (items, name) => (items[name] ? lastAttempt(items[name]) : []);
const taskOf = (items, name, t) => rowsOf(items, name).findLast(r => r.kind === 'task' && r.task === t)?.result ?? null;
const stopOf = (items, name) => rowsOf(items, name).findLast(r => r.kind === 'stopped') ?? null;
// C2 (`raise`) or C3 (`dialog`) from the evidence: the planned repetitions (a missing one reads not recorded) and any
// replacement, each judged on its last attempt. -> {kind, reps, verdict, why}.
export function judgeJoin(kind, items, {attest}) {
  const planned = Array.from({length: JOIN_REPS}, (_, n) => ITEMS_JOIN[kind](n));
  const found = Object.keys(items).filter(name => name.match(REP_ITEM)?.[1] === kind);
  const list = [...new Set([...planned, ...found])].map(name => ({name, rep: Number(name.match(REP_ITEM)[2])})).sort((a, b) => a.rep - b.rep).map(({name, rep}) => {
    const record = taskOf(items, name, '187-join-record'), stop = stopOf(items, name), watcher = taskOf(items, name, '187-order-stop');
    const [status, why] = record ? joinStatus(kind, record, {attest}) : stop ? [stop.personTouched ? 'person-touched' : 'stopped', stop.error] : ['not recorded', null];
    return {item: name, rep, attemptAt: rowsOf(items, name)[0]?.at ?? null, replaces: taskOf(items, name, '187-replaces'), record, watcher, status, why,
      conditions: status === 'counted' ? CONDITIONS[kind](record, watcher) : null};
  });
  const reps = settleReplacements(list, JOIN_REPS).map(c => ({...c, counted: c.status === 'counted'}));
  return {kind, reps, ...joinVerdict(reps)};
}

// C4's measures of one repetition (no verdict): whether the click ordered the window, the guard's repairs and their
// times, whether a sample was out of place after the display hold, and the joins.
export function tailMeasure(r, watcher) {
  const whole = watcherWhole(watcher), w = r.watch, dv = r.click?.delivery ?? null;
  return {rep: r.rep, sent: wentOut(r.click), join: r.click?.join ?? null, holderJoin: r.holder?.join ?? null, holderClick: r.holder?.clickKind ?? null,
    ordered: w && whole === true ? w.raises > 0 : null, raises: w?.raises ?? null, restores: dv?.restores ?? null, repairedAfterRelease: dv?.repairedAfterRelease ?? null,
    restoreLatencyMs: dv?.restoreLatencyMs ?? null, postToReleaseMs: w?.postToReleaseMs ?? null, postToRaiseMs: w?.postToRaiseMs ?? null,
    afterAction: r.repairs?.click ?? null, outOfPlace: w && whole === true ? w.late + w.outlived + w.flash > 0 : null, unguarded: w?.unguarded ?? null,
    undecided: w?.undecided ?? null, menuShown: r.menu ? r.menu.opened : undefined, personTouched: r.personTouched ?? null};
}
// C4 (b) and (c) from the evidence. -> [{kind, item, ran, stopped, whole, reps}].
export function judgeTail(items) {
  return ['menu', 'inframe'].map(kind => {
    const item = ITEMS_JOIN[kind], watcher = taskOf(items, item, '187-order-stop');
    const records = rowsOf(items, item).filter(r => r.kind === 'task' && r.task === '187-join-record' && r.result).map(r => r.result);
    return {kind, item, ran: Boolean(items[item]), stopped: stopOf(items, item)?.error ?? null, whole: watcherWhole(watcher), reps: records.map(r => tailMeasure(r, watcher))};
  });
}

// ---- the verdict file's sections -----------------------------------------------------------------------------------

const yes = v => (v === true ? 'yes' : v === false ? 'no' : '–');
const num = v => (Number.isFinite(v) ? String(Math.round(v * 10) / 10) : '–');
const kindText = k => (k ? [k.kind, k.point ?? k.skippedReason, k.when].filter(Boolean).join(' ') : '–');
const statusText = c => `${c.status}${c.status === 'counted' ? '' : c.why ? ` (${c.why})` : ''}`;
export const JOIN_TITLES = Object.freeze({raise: 'C2: the keys-then-click raise row on background Chrome', dialog: 'C3: the dialog variant, a popup closed by its own button'});
const BARS = Object.freeze({
  raise: `**Pre-registered** (the plan's C2): TextEdit in front; ⌘L into Chrome's run window (a no-click holder, whose early inert click spends the arm), then inside the hold a coordinate click into the page's textarea, on the AFTER build. Premise: the click's \`activationJoin\` rearmed; a repetition whose premise fails is reported, not counted. PASS needs ${JOIN_REPS} counted repetitions, every condition holding in each; FAIL when a counted one fails any; INCOMPLETE otherwise.`,
  dialog: `**Pre-registered** (the plan's C3): TextEdit in front, Chrome's popup window opened by its page (no person, no engine action); ⌘A into the popup, then inside the hold a coordinate click on its close button, so the click's own window closes; the hold ended by an observation of another scene, its subtype 2 stamped with the closed window's number. Premise: the popup opened, the click's \`activationJoin\` rearmed, the popup gone after the click. After the release, every condition in each of ${JOIN_REPS} counted repetitions: PASS; any failing: FAIL, the live counterpart of 11-05's static reading ("the app still believes it is active"), which reopens the Decision Log's item 8; INCOMPLETE otherwise. The page's condition reads unread, not failed, when the page did not hold the focus as the hold ended.`,
});
export function joinMarkdown(part) {
  const names = Object.keys(CONDITIONS[part.kind]({reads: {}, watch: null}, null));
  const lines = [`## ${JOIN_TITLES[part.kind]}: ${part.verdict}`, '', BARS[part.kind], '', ...names.map(n => `- ${n}: ${CONDITION_TEXT[n]}`), '',
    ...(part.why.length ? [`Why: ${part.why.join('; ')}.`, ''] : []),
    `| rep | item | status | key: join / click kind | click: join / click kind | ${names.join(' | ')} | raises | restores | after-action repairs |`, `|---|---|---|---|---|${names.map(() => '---|').join('')}---|---|---|`];
  for (const c of part.reps) {
    const r = c.record;
    lines.push(`| ${c.rep + 1} | ${c.item} | ${statusText(c)} | ${r?.holder ? `${r.holder.join ?? '–'} / ${kindText(r.holder.clickKind)}` : '–'} | ${r?.click ? `${r.click.join ?? '–'} / ${kindText(r.click.clickKind)}` : '–'} | ${names.map(n => yes(c.conditions?.[n])).join(' | ')} | ${r?.watch?.raises ?? '–'} | ${r?.click?.delivery?.restores ?? '–'} | ${r?.repairs?.click?.repairs ?? 0} |`);
  }
  if (part.kind === 'dialog') {
    lines.push('', 'The popup and the release, per repetition: the popup\'s window, whether Chrome came to the front as it opened, whether the click closed it; the page, AXFrontmost and the front process after the release, with how long the readings took to settle.', '',
      '| rep | popup window | Chrome front at the open | gone after the click (ms) | hasFocus as the hold ended | hasFocus after | blurs after the release | AXFrontmost after | front after = TextEdit | settled (ms) |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const c of part.reps.filter(x => x.record)) {
      const r = c.record, held = r.reads?.held?.page, after = r.reads?.released;
      lines.push(`| ${c.rep + 1} | ${r.popup?.number ?? '–'} | ${yes(r.popup?.chromeFront)} | ${r.gone ? `${yes(r.gone.gone)} (${num(r.gone.ms)})` : '–'} | ${yes(held?.focused)} | ${yes(after?.page?.focused)} | ${after?.page?.counts && held?.counts ? after.page.counts.windowBlur - held.counts.windowBlur : '–'} | ${yes(after?.key?.frontmost)} | ${yes(Number.isSafeInteger(after?.front) ? after.front === r.texteditPid : null)} | ${num(after?.settledMs)} |`);
    }
  }
  return [...lines, ''];
}
export const TAIL_TITLES = Object.freeze({menu: 'C4 (b): the menu span (a menu recorded on Chrome, then a coordinate click into its page)', inframe: 'C4 (c): in frame (TextEdit behind the run\'s Finder window, ⌘↑, then a coordinate click into its text)'});
export function tailMarkdown(tail) {
  const lines = ['## C4: #279\'s cases (measured, no verdict)', '',
    `#279 asks for numbers to rule on; nothing here is judged. ${TAIL_REPS} repetitions a case in one item and one session, in the tail after every verdict item (\`--no-tail\` leaves them out). Ordered: the order watcher saw the driven window above the user's during the repetition; out of place: a raise seen past the delivery guard's display hold (late, outlived or flashed, ./raise.mjs callWatch); the repairs are the delivery guard's restores and the after-action watch's, with their times.`, ''];
  for (const t of tail) {
    lines.push(`### ${TAIL_TITLES[t.kind]}`, '');
    if (!t.ran) { lines.push('NOT RUN (the tail was left out, or the drive stopped before it)', ''); continue; }
    if (t.stopped) lines.push(`Stopped: ${t.stopped}.`, '');
    if (t.whole !== true) lines.push(`The order watcher's record ${t.whole === false ? 'has a gap or no end' : 'was not read'}: ordered and out of place read unread.`, '');
    lines.push(`| rep | click sent | ${t.kind === 'menu' ? 'menu shown open | menu record: join / click kind' : 'key: join / click kind'} | click's join | ordered (raises) | restores (latency ms) | repaired after release | after-action repairs (latency ms) | post → hold released (ms) | out of place after the hold | unguarded | undecided |`,
      `|---|---|---|${t.kind === 'menu' ? '---|' : ''}---|---|---|---|---|---|---|---|---|`);
    for (const m of t.reps) {
      lines.push(`| ${m.rep + 1} | ${yes(m.sent)} | ${t.kind === 'menu' ? `${yes(m.menuShown)} | ` : ''}${m.holderJoin ?? '–'} / ${kindText(m.holderClick)} | ${m.join ?? '–'} | ${yes(m.ordered)} (${m.raises ?? '–'}) | ${m.restores ?? '–'} (${num(m.restoreLatencyMs)}) | ${yes(m.repairedAfterRelease)} | ${m.afterAction ? `${m.afterAction.repairs} (${num(m.afterAction.latencyMs)})` : '0'} | ${num(m.postToReleaseMs)} | ${yes(m.outOfPlace)} | ${m.unguarded ?? '–'} | ${m.undecided ?? '–'} |`);
    }
    lines.push('');
  }
  return lines;
}
