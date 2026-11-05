// #187's re-slot on the MacBook: does the shipping build's paste into Chrome for Testing's page deliver behind a Hangul
// composition in the person's front window, with nothing the person sees touched? (SSFSKIM/cua#187; the slot of
// 2026-11-01 and its report, ~/.local/share/187/slot-report.md; the ledger's RECIPE RULING: the inert click outside the
// frame wherever an activation skipped its activation-point click, no engine.json switch.) Hold 3's rows on the mini
// (scripts/native-matrix/unicode-run.mjs: behindUser, koreanIn, composingRows) ported to the cursor-sitting kit, run from
// the MacBook's console on the harness scenes only:
// - The scene: Chrome for Testing on the counters page (`scenes-mac.mjs up chrome --page counters`: the shared page's
//   DOM plus a script that beacons window and textarea focus/blur, document-level mousedown and click, the textarea's
//   LENGTH, never its value, and the document's hasFocus()) at the screen's left, and TextEdit's run window placed over
//   its right half (move-window.swift, harness windows only), so a raise of Chrome would show.
// - Korean engaged as hold 3 did, but through the kit's consent-gated switch (./input-source.mjs): ABC selected with the
//   user window on top (ending any composition left), then 2-Set Korean (`select-source named …2SetKorean`, refused
//   unless the scene's run window is on top of the frontmost app), the user window refocused through another scene, and
//   only a reading after that refocus of source 2-Set AND layout 2SetHangul counts (MAWS B2). The per-context preference
//   is never written. The owner's source comes back with `source restore` and, on a failed item, restoreAfterFailure.
// - The composition: the user window's field emptied, read empty by the bundle's focus probe, the probe's ANSI `r`
//   posted into it (composed as ㄱ), read back as the jamo's hash; every row after it must leave that hash (userKept),
//   and a row that does not makes the rest of its block invalid. A key read empty is posted again only once the lead has
//   been waited out and the field still reads empty (never over a delayed first key).
// - Each row: the driven field emptied (prepare); one observation of a third scene, which ends route 3's held
//   activation so the act gets a fresh one; the readings before the act (front app, clipboard type-list digest, page
//   counters, fixture counters, and the driven app's key-window state: its primary window's AXFocused and AXMain, the
//   app's AXFrontmost, and on Chrome the page's hasFocus()); one typeText or paste of a fixed string under the key guard
//   (the user window on top); the field read back by hash in the cell; then the readings after (page beacon, front app,
//   activations, window order, userKept, clipboard digest, Chrome's menus). Only lengths, hashes, counts, booleans and
//   the engine's value-free meta (`cua/paste` with its `perLine`, `activationClickKind`, `delivery`,
//   `afterActionRepairs`) are kept.
// - Delivered only when the engine's read-back is exact AND the page's own beacon, sent after the act, reports the
//   expected length. A background row whose act carries no `activationGuardMs` acted under a held activation: invalid,
//   never counted.
// The paste route now goes out through route 3's delivery guard and after-action watch; the kit still reads the order
// watcher after every background row, and a Chrome window left above the user's is put back by the kit's own placement
// (harness windows only) before the next row, the row keeping the raise's times.
//
// The re-slot (`plan187()`, the default): the placement; the confirming cell's AFTER half on both routes; the placement
// again (the cell relaunched Chrome); chrome/composing@textedit as 2 blocks of 9 on the shipping build; the three
// controls once each (electron/composing@textedit, textedit/composing@electron, chrome/korean with Chrome frontmost);
// #259's diagnostic cell (./item-188.mjs, recorded only); the owner's source again. `--part premise` runs in the slot's
// preflight, before the owner's steps, on whatever engine is installed (its build recorded): Chrome for Testing relaunched
// on the counters page PREMISE_SAMPLES times, each observed once by a fresh session, and how long its textarea takes to
// advertise AXPress after that first observation. `--part before` runs the cell's BEFORE half on both routes once the
// owner's engine is put back (the scenes still up): the put-back read against the save, the repetitions on whatever
// engine is installed, and the owner's source again.
//
// The confirming cell (the slot report's §2, the ruling's CELL), re-ranked after the slot of 2026-11-05 (its runs.md):
// - The background paste, the bar's route (#187's direct test: its title is Chrome's background paste timing out on the
//   clipboard read), CELL_REPS repetitions a half, each its own item: Chrome for Testing relaunched clean by the scenes
//   tool (its harness Chrome, never the owner's) and placed at the left, TextEdit over its right half and in front under
//   ABC; one background paste of the one-line Latin string into the page's textarea under TextEdit's key guard and the
//   order watcher (latin on purpose: no composition, so the cell isolates the activation's arm; the composing part covers
//   the titled rows); Chrome activated as the person would (`open -a` on the harness Chrome's app bundle path); the
//   key-window state read (the run window's AXFocused and AXMain, the app's AXFrontmost, the page's hasFocus()); then
//   one frontmost paste. Neither paste's prepare clicks; the frontmost one accepts the field empty or holding the
//   background paste's string (a delivered one leaves it; emptying it would take an engine action on Chrome between the
//   activations compared), and its read-back expects the concatenation. The premise, read from the background paste's own record: its
//   activation click skipped (`activationClick` outsideFrame), so nothing but the shipping build's inert click (or, on
//   the saved engine, nothing) consumes the arm; an activation point inside the frame posts a click of its own, which
//   consumes the arm on either engine (the slot's rep 2), and that repetition is premise not met, never counted.
//   Prediction: AFTER both pastes delivered and the key held; BEFORE the background paste timing out at the read stage
//   and Chrome keyless after `open -a`. A BEFORE that delivers means the cell does not discriminate: NO VERDICT.
// - The AXPress element click, reported for the mechanism and never the bar, PRESS_REPS a half: only when every sample
//   of the premise part saw AXPress within AXPRESS_BOUND_MS (187-press-gate). Its repetition waits up to as long for
//   AXPress after the session's first observation (#244: Chromium reaches complete accessibility mode about 2 s after
//   the engine's enablement write; in the slot the click came 0.3 s after it, found neither AXPress nor AXPick and took
//   the synthesized plan, whose own left down consumed the arm on both engines); without it the repetition is
//   PRECONDITION UNMET and posts nothing, and a click whose recorded plan is not action/AXPress is premise not met.
//   The kit's earlier claim that Chromium advertises AXPress on the textarea was never verified on Chrome.
// A repetition the person touches (an app neither a scene's nor the engine's activated or frontmost during it) is
// invalid and replaced once (the replacement counting only for the attempt it names); so is every row the person touches invalid, and more than TOUCHED_STOP such items in one
// slot stop the drive (driveItems), 187-end still selecting the owner's source. Before the drive the operator sends the
// owner one hands-off notice (how long hands-off lasts, when the verdict comes; the runbook's step); from then until
// the put-back nobody messages the owner except to stop.
//
// The judge's bar (judge187): anything less is DOES NOT LAND, never a partial verdict:
// - chrome/composing@textedit 18/18 valid and delivered, each row's `cua/paste.perLine` holding every line confirmed by
//   its own change (each line confirmed by a reading or a trusted notification, every line after the first opened by a
//   Return whose settle saw its effect before that line's baseline, and a reading-confirmed line's confirming reading not
//   its baseline);
// - each of the three controls 18/18 valid and delivered;
// - the background-paste cell, in the same slot: AFTER on CELL_REPS counted repetitions, both pastes delivered and the
//   key held after `open -a`; BEFORE on the saved engine on CELL_REPS counted repetitions, the background paste timing
//   out at the read stage, the key not held after `open -a` and the frontmost paste not delivered. A counted BEFORE
//   repetition that delivers is NO VERDICT (#187 stays Refs) when nothing else fails; LANDS names the route it rests on;
// - every background item's order watcher (the cell's AFTER repetitions' too) whole, its longest gap within
//   WATCH_GAP_MS, its raises reconciled;
// - no raise (a row's, a block tail's or an unattributed one) and no menu opened in Chrome (every menu reading whole);
// - no row touching the person's side otherwise (the front app, the composition, the clipboard, a page click);
// - the put-back verified: 187-end's last attempt selected the owner's source and read it back, and the before part's
//   put-back reading found the saved engine's build installed and approved.
// The slot's arm A baseline (0 of 99 valid rows delivered, every one at the read stage) is cited, never re-run.
// Kept as parts, out of the default: #188's items (./item-188.mjs, `--part 188`, `--part 188-vendor-click`) and the
// vendor's lanes (`--vendor`: its chrome/korean rows, then its chrome/composing@textedit rows, recorded only).
import {execFileSync, spawn} from 'node:child_process';
import {closeSync, existsSync, openSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cell} from '../native-baseline/cells.mjs';
import {FIXTURE_COUNTERS_FILE} from '../native-matrix/fixtures/electron-fixture.mjs';
import {clipboardDigest, probeStatus, startWatch, stopWatch} from '../native-matrix/live-device.mjs';
import {compiled} from '../native-matrix/matrix-device.mjs';
import {prelude} from '../native-matrix/matrix-cells.mjs';
import {sha256Hex} from '../native-matrix/matrix-text.mjs';
import {TEXT_FIELDS} from '../native-matrix/plan.mjs';
import {EMPTY_HASH, emptyField, fieldCheck} from '../native-matrix/probe-plan.mjs';
import {COMPOSITION, KOREAN_2SET, UNICODE_STRINGS} from '../native-matrix/unicode-plan.mjs';
import {HANGUL_LAYOUT, REFOCUS_THROUGH, SETTLE_READ_MS, SETTLE_READS} from '../native-matrix/unicode-run.mjs';
import {documentWindows, readPageCounters, readState, SCENES as HARNESS_SCENES} from '../repl-parity/scenes-mac.mjs';
import {BUNDLE_ID as ENGINE_BUNDLE_ID} from '../../src/runtime/engine-bundle.mjs';
import {OBSERVE} from './cells.mjs';
import {runWindowBounds} from './focus.mjs';
import {clickItem188, clickItem259, ENGINES_188, ITEMS_188, ITEMS_259, judge188, judge259, markdown188, markdown259, rowsItem188} from './item-188.mjs';
import {arrangementProblem, orderAttempt, orderLines, placementPlan, raisesIn, spread, startOrderWatch, stateAt, stopOrderWatch, WATCH_GAP_MS} from './raise.mjs';
import {PROBE_CACHE, SCENE_MARKER} from './target-guard.mjs';

const j = JSON.stringify;
export const S = 's';
// The composition key's schedule after the probe's launch (the native matrix's --lead), the short lead of a repost made
// once the first key was waited out, and the posts at most.
export const COMPOSE_LEAD_MS = 1500, COMPOSE_REPOST_LEAD_MS = 200, COMPOSE_POSTS = 2;
export const METHODS = Object.freeze(['typeText', 'paste']);
// Hold 3's nine strings, each typed and pasted: 18 rows a pass.
export const ROWS = Object.freeze(UNICODE_STRINGS.flatMap(string => METHODS.map(method => Object.freeze({string, method}))));
export const VENDOR_ROWS = Object.freeze(ROWS.filter(r => r.method === 'paste'));
// chrome/composing@textedit as 2 blocks of 9 (each on a fresh composition): every row once.
export const BLOCK_ROWS = ROWS.length / 2;
export const COMPOSING_BLOCKS = Object.freeze([ROWS.slice(0, BLOCK_ROWS), ROWS.slice(BLOCK_ROWS)]);
export const TARGET = ROWS.length;
// How long the row waits, after its read-back, for the page's beacon of the act.
export const PAGE_SETTLE_MS = 1000, PAGE_POLL_MS = 50;
// After the kit puts the order back, how long the watcher is given to see it.
export const ORDER_SETTLE_MS = 200;
// The confirming cell: its halves; its two routes, the background paste (the bar's, CELL_REPS repetitions a half) and
// the AXPress element click (reported only, PRESS_REPS a half); its one paste string (the Latin one: one line, no
// composition, on purpose, so the cell isolates the activation's arm); how long `open -a` is given to bring Chrome to the
// front, and how long the key-window state is given to settle after it.
export const HALVES = Object.freeze(['after', 'before']);
export const ROUTES = Object.freeze(['paste', 'press']);
export const ROUTE_NAMES = Object.freeze({paste: 'the background paste', press: 'the AXPress element click'});
export const CELL_REPS = 3, PRESS_REPS = 1;
export const CELL_ROW = Object.freeze({string: UNICODE_STRINGS.find(s => s.id === 'latin'), method: 'paste'});
export const FRONT_BOUND_MS = 3000, KEY_SETTLE_MS = 1000, KEY_POLL_MS = 100;
// The AXPress premise (#244: Chromium reaches complete accessibility mode about 2 s after the engine's enablement write,
// and a textarea read before it advertises neither AXPress nor AXPick): how long after the session's first observation
// the textarea is given to advertise AXPress, polled; the premise part's samples, and how long each is watched, so a
// time past the bound is still measured.
export const AXPRESS_BOUND_MS = 5000, AXPRESS_POLL_MS = 100, PREMISE_SAMPLES = 3, PREMISE_MEASURE_MS = 10_000;
// The relaunch's wait (the slot's rep 1: the session was refused because Chrome's front window was not the run window):
// the run window the app's one on-screen document window and its front one, on RELAUNCH_STABLE_POLLS polls in a row.
export const RELAUNCH_WINDOW_BOUND_MS = 10_000, RELAUNCH_POLL_MS = 200, RELAUNCH_STABLE_POLLS = 3;
// The placement's settle (the slot read Chrome mid-move under load): after the moves, the bounds read again every
// PLACE_SETTLE_MS for up to PLACE_READ_BOUND_MS, and the windows not in place moved again, PLACE_ATTEMPTS times at most.
export const PLACE_SETTLE_MS = 200, PLACE_READ_BOUND_MS = 1500, PLACE_ATTEMPTS = 3;
// Person-touched items (an app neither a scene's nor the engine's activated, or frontmost): each one invalid, a cell
// repetition replaced once, and more than TOUCHED_STOP in one slot (one out directory) stops the drive.
export const TOUCHED_STOP = 3;
const SCENES_187 = Object.freeze(['chrome', 'textedit', 'electron']);
export const OWN_BUNDLES = Object.freeze([...SCENES_187.map(id => HARNESS_SCENES[id].bundleId), ENGINE_BUNDLE_ID]);
// The slot of 2026-11-01's arm A (the engine as then built, 6226f2698ab0): cited by the report, never re-run.
export const BASELINE = Object.freeze({engine: '6226f2698ab0', rows: 99, delivered: 0, stage: 'read (timeout)', items: '187-A1 (36, twice) and 187-B\'s arm A blocks (27)',
  evidence: 'docs/evidence/2026-10-30-macos-agent-cursor/item-187/item-187.md'});

// Each row group: the driven field's scene, the user window's (none: the driven scene frontmost), hold 3's condition.
// The confirming cell's two pastes, under ABC and with a prepare that clicks nothing (`clickless`): `chrome-cell-background`,
// the background paste with TextEdit in front (in a fresh session, so no release observation: `release` false), and
// `chrome-cell`, the frontmost paste after the person's activation.
export const GROUPS = Object.freeze({
  'chrome-composing': Object.freeze({driven: 'chrome', user: 'textedit', condition: 'composing', regime: 'background'}),
  'electron-composing': Object.freeze({driven: 'electron', user: 'textedit', condition: 'composing', regime: 'background'}),
  'textedit-composing': Object.freeze({driven: 'textedit', user: 'electron', condition: 'composing', regime: 'background'}),
  'chrome-korean': Object.freeze({driven: 'chrome', user: null, condition: 'korean', regime: 'frontmost'}),
  'chrome-cell-background': Object.freeze({driven: 'chrome', user: 'textedit', condition: 'latin', regime: 'background', clickless: true, release: false}),
  'chrome-cell': Object.freeze({driven: 'chrome', user: null, condition: 'activated', regime: 'frontmost', clickless: true}),
});
export const CONTROLS = Object.freeze(['electron-composing', 'textedit-composing', 'chrome-korean']);
const SCENES = SCENES_187;
// The scene observed before each background act: neither the driven nor the user's, so the request ends the driven
// app's held activation without reading the composing window.
export const releaseOf = group => (GROUPS[group].user && GROUPS[group].release !== false ? SCENES.find(s => s !== GROUPS[group].driven && s !== GROUPS[group].user) : null);
export const groupName = group => { const g = GROUPS[group]; return `${g.driven}/${g.condition}${g.user ? `@${g.user}` : ''}`; };
export const rowId = (group, method, stringId) => `${groupName(group)}/${method}.${stringId}`;
export const ITEMS = Object.freeze({place: '187-place', placeAgain: '187-place-again', composing: '187-chrome-composing', control: group => `187-${group}`,
  cell: (half, rep) => `187-cell-${half}-${rep}`, press: (half, rep) => `187-press-${half}-${rep}`, premise: '187-premise', putback: '187-putback',
  vendor: '187-vendor', vendorKorean: '187-vendor-chrome-korean', end: '187-end'});
// A route's repetition items: the background paste's `187-cell-<half>-<n>`, the AXPress click's `187-press-<half>-<n>`
// (n past the planned ones: a replacement).
export const repItem = (route, half, rep) => (route === 'paste' ? ITEMS.cell(half, rep) : ITEMS.press(half, rep));
const REP_ITEM = /^187-(cell|press)-(after|before)-(\d+)$/;
const involvesElectron = g => g.driven === 'electron' || g.user === 'electron';

// ---- the cells -----------------------------------------------------------------------------------------------------

const head = scene => `${SCENE_MARKER(scene)}\n${prelude(scene)}`;
// The scene's typing field emptied and focused (hold 3's prepare). -> {ready} or {ready: false, reason}.
export const PREPARE = scene => cell(`${head(scene)}\n// cua-187: prepare\n${emptyField(scene)}`);
// The field read back by hash against `text`; the value stays in the cell. -> {ok, outcome: {exact, nfcEqual, length, expectedLength}}.
export const CHECK = (scene, text) => cell(`${head(scene)}\n// cua-187: check\n${fieldCheck(scene, text)}`);
// One facade call, timed; a throw is caught so the row keeps its meta, and its sentence never carries the text.
export const ACT = (scene, method, text) => cell(`${head(scene)}
// cua-187: act
const __t0 = performance.now(); let threw = false, message = null;
try { await __app.${method}(${j(text)}); } catch (e) { threw = true; message = String(e?.message ?? e).split(${j(text)}).join("[the text]").slice(0, 300); }
return {actMs: performance.now() - __t0, threw, message};`);
// The cell's click: the driven field found and clicked by its index, the click the cell's last call so the cell's meta
// is the click's (its `elementClick` plan, its activation's click). -> {pressed, threw, errorName} or {pressed: false, reason}.
export const PRESS = scene => cell(`${head(scene)}
// cua-187: press
const ax = await observe();
if (!inFront(ax)) return {pressed: false, reason: "the scene window is not the app's front window"};
const __index = (ax => ${TEXT_FIELDS[scene]})(ax);
if (__index === null) return {pressed: false, reason: "the field is not in the text"};
let threw = false, errorName = null;
try { await __app.click(__index); } catch (e) { threw = true; errorName = String(e?.errorName ?? e?.name ?? "").slice(0, 80) || null; }
return {pressed: !threw, threw, errorName};`);
// The field after the click: focused by the observation's trailer, and empty. -> {inFront, found, focused, empty}.
export const PRESS_READ = scene => cell(`${head(scene)}
// cua-187: press read
const ax = await observe();
const __index = (ax => ${TEXT_FIELDS[scene]})(ax);
return {inFront: inFront(ax), found: __index !== null, focused: __index !== null && focusedIndexOf(ax) === __index, empty: __index !== null && plain(valueOfIndex(ax, __index) ?? "") === ""};`);
// The cell's paste rows' prepare: nothing clicked or written, so no mouse-down and no engine activation reaches the
// window before the paste; the field must be empty or, when the row names one (`prior`), hold exactly that known prior
// content (the background paste's string, which a delivered background paste leaves in the textarea: emptying it would
// take an engine action on Chrome between the activations the cell compares). Compared by hash in the cell; only which
// one it held (`prior`: empty or background) and its focus are kept. -> {ready, prior, focused} or {ready: false, reason}.
export const CELL_PREPARE = (scene, prior = null) => cell(`${head(scene)}
// cua-187: prepare (no click)
const ax = await observe();
if (!inFront(ax)) return {ready: false, reason: "the scene window is not the app's front window"};
const __index = (ax => ${TEXT_FIELDS[scene]})(ax);
if (__index === null) return {ready: false, reason: "the field is not in the text"};
const __value = plain(valueOfIndex(ax, __index) ?? "");
${prior === null ? '' : `const __priorLength = ${prior.length};
if (__value !== "" && sha256Hex(__value) === ${j(sha256Hex(prior))}) return {ready: true, prior: "background", focused: focusedIndexOf(ax) === __index};
`}if (__value !== "") return {ready: false, reason: ${j(prior === null ? 'the field is not empty' : 'the field holds neither nothing nor the background paste\'s string')}};
return {ready: true, prior: "empty", focused: focusedIndexOf(ax) === __index};`);

// ---- the steps -----------------------------------------------------------------------------------------------------

export const keyOf = (item, block, i) => `${item}#${block}.${i}`;
const tagOf = (item, block) => `${item}#${block}`;
const disturbedOf = tag => `187 disturbed ${tag}`;
export const LABELS = Object.freeze({
  prepare: key => `${key} prepare: the driven field emptied and focused`,
  cellPrepare: key => `${key} prepare: the field checked empty, nothing clicked`,
  release: (key, scene) => `${key} release: the ${scene} scene observed, ending a held activation`,
  act: (key, method, stringId) => `${key} act: ${method}.${stringId}`,
  check: key => `${key} check: the driven field read back by hash`,
  setupDriven: tag => `${tag} setup: the driven field emptied and focused`,
  setupUser: tag => `${tag} setup: the user window's field emptied and focused`,
  press: tag => `${tag} press: the field clicked by its index in the background`,
  pressRead: tag => `${tag} press read: the field focused and empty`,
  pressRelease: tag => `${tag} release: the textedit scene observed, ending the click's held activation`,
  // Not a step's label: where '187-axpress' leaves its reading for the steps' `when`.
  axpress: tag => `${tag} axpress`,
});

// The cell's paste rows prepare with CELL_PREPARE (nothing clicked) under their own label; the record reads either.
const prepareLabel = (group, key) => (GROUPS[group].clickless ? LABELS.cellPrepare(key) : LABELS.prepare(key));
// `prior`: a clickless row's known prior content (CELL_PREPARE), read back before the row's own string when the prepare
// found it.
export const priorText = (results, label, prior) => (prior !== null && results[label]?.value?.prior === 'background' ? prior : '');
function rowSteps({item, group, block, i, row, engine = 'cua', prior = null}) {
  const g = GROUPS[group], key = keyOf(item, block, i), tag = tagOf(item, block), release = releaseOf(group);
  const actLabel = LABELS.act(key, row.method, row.string.id), label = prepareLabel(group, key);
  const live = results => !results[disturbedOf(tag)];
  const prepared = results => live(results) && results[label]?.value?.ready === true;
  return [
    {task: '187-before', args: [key]},
    {run: S, cell: g.clickless ? CELL_PREPARE(g.driven, prior) : PREPARE(g.driven), label, when: live},
    ...(release ? [{run: S, cell: OBSERVE(release), label: LABELS.release(key, release), when: prepared}] : []),
    {task: '187-mid', args: [key, group], when: prepared},
    {run: S, cell: ACT(g.driven, row.method, row.string.text), label: actLabel, keys: g.user ?? g.driven, when: prepared},
    {run: S, cell: prior === null ? CHECK(g.driven, row.string.text) : results => CHECK(g.driven, priorText(results, label, prior) + row.string.text), label: LABELS.check(key), when: results => Boolean(results[actLabel])},
    {task: '187-row', args: [key, group, engine, String(block), String(i), row.method, row.string.id]},
    ...(g.user ? [{task: '187-order-restore', args: [key, group], required: true}] : []),
  ];
}

// Korean engaged in the user window (or, Chrome frontmost, in Chrome) and, behind a user window, the composition.
function setupSteps({item, block, group}) {
  const g = GROUPS[group], tag = tagOf(item, block);
  if (!g.user) {
    return [
      {task: 'activate', args: [g.driven], required: true},
      {task: 'select-source', args: ['named', g.driven, KOREAN_2SET], required: true},
      {task: 'activate', args: [REFOCUS_THROUGH[g.driven]], required: true},
      {task: 'activate', args: [g.driven], required: true},
      {task: '187-korean', args: [tag, g.driven], required: true},
    ];
  }
  return [
    {run: S, cell: PREPARE(g.driven), label: LABELS.setupDriven(tag), required: true},
    {task: '187-ready', args: [LABELS.setupDriven(tag)], required: true},
    {task: 'activate', args: [g.user], required: true},
    {task: 'select-source', args: ['latin', g.user], required: true},
    {task: 'select-source', args: ['named', g.user, KOREAN_2SET], required: true},
    {task: 'activate', args: [REFOCUS_THROUGH[g.user]], required: true},
    {task: 'activate', args: [g.user], required: true},
    {task: '187-korean', args: [tag, g.user], required: true},
    {run: S, cell: PREPARE(g.user), label: LABELS.setupUser(tag), required: true},
    {task: '187-ready', args: [LABELS.setupUser(tag)], required: true},
    {task: '187-compose', args: [tag, g.user], required: true},
  ];
}

const sessionScenes = group => { const g = GROUPS[group]; return [g.driven, ...(g.user ? [g.user, releaseOf(group)] : [])]; };

// One block: a session, the setup, the rows (Chrome's menus watched over them).
function blockSteps({item, group, block, rows, engine = 'cua'}) {
  const g = GROUPS[group], tag = tagOf(item, block), chrome = g.driven === 'chrome';
  return [
    {say: `${tag}: ${groupName(group)}, ${engine === 'vendor' ? 'the vendor\'s engine (recorded only)' : 'the engine as installed'}, ${rows.length} rows`},
    {open: S, engine, scenes: sessionScenes(group)},
    {task: '187-setup', args: [tag, 'start']},
    ...setupSteps({item, block, group}),
    {task: '187-setup', args: [tag, 'end']},
    ...(chrome ? [{task: '187-menu-start', args: [item]}] : []),
    ...rows.flatMap((row, i) => rowSteps({item, group, block, i, row, engine})),
    ...(chrome ? [{task: '187-menu-stop', args: [item]}] : []),
    {close: S},
  ];
}

// One item: its blocks between the watchers (the window order for a background group, the bundle's activations always).
export function groupItem({item, group, blocks, engine = 'cua'}) {
  const g = GROUPS[group], background = g.regime === 'background', total = blocks.reduce((n, b) => n + b.rows.length, 0);
  return [
    {say: `#187 ${item}: ${groupName(group)}, ${total} rows in ${blocks.length} block(s); nobody touches the Mac until the item ends`},
    {series: [item], counts: {rows: total}},
    {task: '187-processes', args: [item]},
    ...(background ? [{task: 'activate', args: [g.user], required: true}, {task: '187-arrange', args: [group], required: true},
      {task: '187-order-start', args: [item, group], required: true}] : []),
    {task: '187-activations-start', args: [item], required: true},
    ...blocks.flatMap(b => blockSteps({item, group, engine, ...b})),
    {task: '187-activations-stop', args: [item]},
    ...(background ? [{task: '187-order-stop', args: [item]}] : []),
  ];
}

// The background-paste repetition (the bar's route): its own item, so a stop leaves the other repetitions to run.
export function cellItem({half, rep}) {
  const item = ITEMS.cell(half, rep), tag = tagOf(item, 0), bg = keyOf(item, 0, 0);
  const sent = results => Boolean(results[LABELS.act(bg, CELL_ROW.method, CELL_ROW.string.id)]);
  const gate = s => (s.task === '187-before' ? s : {...s, when: s.when ? r => sent(r) && s.when(r) : sent});
  return [
    {say: `#187 ${item}: the background-paste cell's ${half.toUpperCase()} half, repetition ${rep + 1}: Chrome relaunched clean and placed, one background paste of the Latin string (latin on purpose: the cell isolates the activation's arm) with TextEdit in front, Chrome activated by open -a, the key read, one frontmost paste`},
    {series: [item], counts: {rows: 2}},
    {task: '187-relaunch', args: [item, 'chrome'], required: true},
    {task: '187-place', required: true},
    {task: 'activate', args: ['textedit'], required: true},
    {task: 'select-source', args: ['latin', 'textedit'], required: true},
    {task: '187-arrange', args: ['chrome-cell-background'], required: true},
    {task: '187-order-start', args: [item, 'chrome-cell-background'], required: true},
    {task: '187-activations-start', args: [item], required: true},
    {open: S, engine: 'cua', scenes: ['chrome', 'textedit']},
    {task: '187-menu-start', args: [item]},
    ...rowSteps({item, group: 'chrome-cell-background', block: 0, i: 0, row: CELL_ROW}),
    // The watcher ends with the background paste: `open -a` brings Chrome above TextEdit by the person's own act.
    {task: '187-order-stop', args: [item]},
    {task: '187-key', args: [tag, 'chrome', 'before'], when: sent},
    {task: '187-open', args: [tag, 'chrome'], required: true, when: sent},
    {task: '187-key', args: [tag, 'chrome', 'after'], when: sent},
    // The frontmost paste goes in after what the background paste left (nothing on the saved engine, its string on the
    // shipping build), read back as the concatenation.
    ...rowSteps({item, group: 'chrome-cell', block: 1, i: 0, row: CELL_ROW, prior: CELL_ROW.string.text}).map(gate),
    {task: '187-menu-stop', args: [item]},
    {close: S},
    {task: '187-activations-stop', args: [item]},
    // TextEdit back in front, so a failed repetition's restore can select the owner's source onto the run's own window.
    {task: 'activate', args: ['textedit']},
    {task: '187-cell', args: [tag, half, String(rep), 'paste']},
  ];
}

// The AXPress repetition (reported only): only when the premise part saw AXPress within the bound (187-press-gate),
// and on the action plan only when the textarea advertises AXPress in this repetition too (187-axpress, after the
// session's first observation); else the repetition is PRECONDITION UNMET and posts nothing. Its own item.
export function pressItem({half, rep}) {
  const item = ITEMS.press(half, rep), tag = tagOf(item, 0);
  const advertised = results => results[LABELS.axpress(tag)]?.advertised === true;
  const pressed = results => advertised(results) && results[LABELS.press(tag)]?.ok === true && results[LABELS.press(tag)].value?.pressed === true;
  return [
    {say: `#187 ${item}: the AXPress route's ${half.toUpperCase()} half (reported, never the bar), repetition ${rep + 1}: Chrome relaunched clean, AXPress awaited on its textarea, the field clicked on the action plan in the background, Chrome activated by open -a, the key read, one frontmost paste`},
    {series: [item], counts: {rows: 1}},
    {task: '187-press-gate', required: true},
    {task: '187-relaunch', args: [item, 'chrome'], required: true},
    {task: 'activate', args: ['textedit'], required: true},
    {task: 'select-source', args: ['latin', 'textedit'], required: true},
    {task: '187-activations-start', args: [item], required: true},
    {open: S, engine: 'cua', scenes: ['chrome', 'textedit']},
    {task: '187-axpress', args: [tag, 'chrome', 'gate']},
    {task: '187-menu-start', args: [item]},
    {run: S, cell: PRESS('chrome'), label: LABELS.press(tag), when: advertised},
    {run: S, cell: PRESS_READ('chrome'), label: LABELS.pressRead(tag), when: pressed},
    {run: S, cell: OBSERVE('textedit'), label: LABELS.pressRelease(tag), when: pressed},
    {task: '187-key', args: [tag, 'chrome', 'before'], when: pressed},
    {task: '187-open', args: [tag, 'chrome'], required: true, when: pressed},
    {task: '187-key', args: [tag, 'chrome', 'after'], when: pressed},
    ...rowSteps({item, group: 'chrome-cell', block: 0, i: 0, row: CELL_ROW}).map(s => (s.task === '187-before' ? s : {...s, when: s.when ? r => pressed(r) && s.when(r) : pressed})),
    {task: '187-menu-stop', args: [item]},
    {close: S},
    {task: '187-activations-stop', args: [item]},
    {task: 'activate', args: ['textedit']},
    {task: '187-cell', args: [tag, half, String(rep), 'press']},
  ];
}

// The premise part (the slot's preflight, before the owner's steps, on whatever engine is installed): the build read,
// then PREMISE_SAMPLES times Chrome for Testing relaunched on the counters page, a session whose bind is its first
// observation of Chrome, and how long the textarea takes to advertise AXPress after it; Chrome down at the end.
const premiseSteps = () => [
  {say: `#187's premise part, on the engine installed now: ${PREMISE_SAMPLES} times Chrome for Testing relaunched on the counters page and observed once, then how long its textarea takes to advertise AXPress (watched ${PREMISE_MEASURE_MS} ms; the AXPress route runs only when every sample saw it within ${AXPRESS_BOUND_MS} ms)`},
  {task: '187-premise-engine'},
  ...Array.from({length: PREMISE_SAMPLES}, (_, k) => [
    {task: '187-relaunch', args: [ITEMS.premise, 'chrome'], required: true},
    {open: S, engine: 'cua', scenes: ['chrome']},
    {task: '187-axpress', args: [`${ITEMS.premise}#${k}`, 'chrome', 'measure']},
    {close: S},
  ]).flat(),
  {task: '187-down', args: ['chrome']},
];

const placeSteps = () => [
  {say: '#187: the slot\'s preconditions, then the harness windows placed (Chrome for Testing at the left, TextEdit over its right half), TextEdit in front'},
  {task: '187-preflight', required: true},
  {task: '187-place', required: true},
  {task: 'activate', args: ['textedit'], required: true},
];
const placeAgainSteps = () => [
  {say: '#187: the harness windows placed again after the cell\'s relaunches of Chrome, TextEdit in front'},
  {task: '187-place', required: true},
  {task: 'activate', args: ['textedit'], required: true},
];
const endSteps = () => [
  {say: '#187: the owner\'s input source selected again, TextEdit\'s run window on top'},
  {task: 'activate', args: ['textedit'], required: true},
  {task: 'select-source', args: ['owner', 'textedit'], required: true},
];
const putbackSteps = saved => [
  {say: '#187: the cell\'s BEFORE half, on the engine put back: the put-back read against the save, the scenes still up'},
  {task: '187-putback', args: [saved]},
];

export const PARTS = Object.freeze(['reslot', 'premise', 'before', 'cell', 'composing', 'controls', '259', '188', '188-vendor-click']);
// The drive's items in order, each {item, stage, steps}; a cell repetition's also {route, half, rep} and, unless it is a
// replacement itself, `replace()`: its replacement (the next repetition number of its route and half), which the drive
// runs right after a person-touched one (driveItems). `part`: reslot (the default: the placement, the cell's AFTER half
// on both routes, the placement again, chrome/composing@textedit in 2 blocks of 9, the three controls, #259's cell, the
// owner's source), premise (the preflight's AXPress timing alone, no placement, no source), before (the cell's BEFORE
// half on both routes on the engine put back; `saved`: the save's directory, read for the build), cell, composing or
// controls (that part alone, between the placement and the owner's source), 259 (#259's cell alone), 188 (#188's items
// alone) or 188-vendor-click (only #188's cell 3 on the vendor's engine); `vendor` the vendor's lanes alone. #188's and
// #259's standalone runs place and restore under #188's own items: #187's judge reads 187-end's last attempt.
export function plan187({part = 'reslot', vendor = false, saved = '<saved>'} = {}) {
  const place = {item: ITEMS.place, stage: 'place', steps: placeSteps()}, end = {item: ITEMS.end, stage: 'end', steps: endSteps()};
  if (vendor) {
    // The vendor's chrome/korean rows first (Chrome frontmost, no composition), then its chrome/composing@textedit rows.
    const lane = (item, group) => ({item, stage: 'vendor', steps: groupItem({item, group, engine: 'vendor', blocks: [{block: 0, rows: VENDOR_ROWS}]})});
    return [place, lane(ITEMS.vendorKorean, 'chrome-korean'), lane(ITEMS.vendor, 'chrome-composing'), end];
  }
  if (!PARTS.includes(part)) throw new Error(`--part takes ${PARTS.join(', ')}`);
  const next = {};
  // A replacement's first step names the attempt it replaces (its parent's item and that attempt's start time), so the
  // judge counts it only for that attempt's person-touched repetition, never for a later re-run of the half.
  const repEntry = (route, half, rep, parent = null) => {
    const steps = (route === 'paste' ? cellItem : pressItem)({half, rep});
    const entry = {item: repItem(route, half, rep), stage: route === 'paste' ? 'cell' : 'press', route, half, rep,
      steps: parent ? [{task: '187-replaces', args: [parent.item, String(parent.attempt)]}, ...steps] : steps};
    if (parent) return {...entry, replacement: parent};
    const key = `${route}-${half}`;
    return {...entry, replace: attempt => repEntry(route, half, next[key] = (next[key] ?? (route === 'paste' ? CELL_REPS : PRESS_REPS) - 1) + 1, {item: entry.item, attempt})};
  };
  const cell = half => [...Array.from({length: CELL_REPS}, (_, rep) => repEntry('paste', half, rep)), ...Array.from({length: PRESS_REPS}, (_, rep) => repEntry('press', half, rep))];
  const placeAgain = {item: ITEMS.placeAgain, stage: 'place', steps: placeAgainSteps()};
  const composing = {item: ITEMS.composing, stage: 'composing', steps: groupItem({item: ITEMS.composing, group: 'chrome-composing', blocks: COMPOSING_BLOCKS.map((rows, block) => ({block, rows}))})};
  const controls = CONTROLS.map(group => ({item: ITEMS.control(group), stage: 'controls', steps: groupItem({item: ITEMS.control(group), group, blocks: [{block: 0, rows: ROWS}]})}));
  const cell259 = {item: ITEMS_259.click, stage: '259', steps: clickItem259()};
  const alone = items => [{item: ITEMS_188.place, stage: 'place', steps: placeSteps()}, ...items, {item: ITEMS_188.end, stage: 'end', steps: endSteps()}];
  switch (part) {
    case 'premise': return [{item: ITEMS.premise, stage: 'premise', steps: premiseSteps()}];
    case 'before': return [{item: ITEMS.putback, stage: 'putback', steps: putbackSteps(saved)}, ...cell('before'), end];
    case 'cell': return [place, ...cell('after'), placeAgain, end];
    case 'composing': return [place, composing, end];
    case 'controls': return [place, ...controls, end];
    case '259': return alone([cell259]);
    case '188': return alone(ENGINES_188.flatMap(engine => [{item: ITEMS_188.rows(engine), stage: '188', steps: rowsItem188(engine)}, {item: ITEMS_188.click(engine), stage: '188', steps: clickItem188(engine)}]));
    case '188-vendor-click': return alone([{item: ITEMS_188.click('vendor'), stage: '188', steps: clickItem188('vendor')}]);
    default: return [place, ...cell('after'), placeAgain, composing, ...controls, cell259, end];
  }
}

// ---- a row's record --------------------------------------------------------------------------------------------------

// Whether the act had an activation of its own: route 3's guard ran (`activationGuardMs`), and the paste's activation
// was not another holder's (`focusEnforcement.activated` false says it shared one, or the app believed it had focus).
export const freshActivation = meta => Number.isFinite(meta?.activationGuardMs) && meta?.paste?.focusEnforcement?.activated !== false;
const deltas = (before, after) => (before && after ? Object.fromEntries(Object.keys(after).map(k => [k, after[k] - (before[k] ?? 0)])) : null);

// The page's reading of a row: its beacon after the act (a later sequence than the one before) with the expected
// length agrees; a stale beacon never does. `mid`, `after`: the counters records ({seq, length, counts, focused}).
export function pageAgreement({mid = null, after = null}, expectedLength) {
  const beaconAfterAct = Boolean(after && (!mid || after.seq > mid.seq));
  return {length: after?.length ?? null, seq: after?.seq ?? null, beaconAfterAct, agree: beaconAfterAct && after.length === expectedLength, deltas: deltas(mid?.counts, after?.counts)};
}

// Whether Chrome showed an open menu (menu-open.swift's read): a menu bar item selected, a menu among the app's children,
// or the focus in a menu; null unless the helper says every read of the snapshot succeeded (`ok`).
export function menuOpened(read) {
  if (read?.trusted !== true || read.ok !== true) return null;
  return read.selected > 0 || read.openMenus > 0 || ['AXMenu', 'AXMenuItem'].includes(read.focusedRole);
}

// ax-state.swift's window reading, kept value-free: booleans, the app's focused and main windows as run/other/none.
export const keyWindowOf = r => (r ? {trusted: r.trusted === true, ok: r.ok === true, frontmost: r.frontmost ?? null, found: r.found ?? null, focused: r.focused ?? null, main: r.main ?? null,
  focusedWindow: r.focusedWindow ?? null, mainWindow: r.mainWindow ?? null} : null);
// Whether a key-window reading shows the app frontmost with its run window key and main (and, on Chrome, the page
// focused): true, false, or null when the reading is not whole.
export function keyHeld(reading, pageFocused) {
  if (!reading?.trusted || !reading.ok || typeof reading.focused !== 'boolean' || typeof reading.main !== 'boolean' || typeof reading.frontmost !== 'boolean') return null;
  const window = reading.frontmost && reading.focused && reading.main;
  if (pageFocused === undefined) return window;
  return typeof pageFocused === 'boolean' ? window && pageFocused : window ? null : false;
}

// One row's record from its readings, value-free: lengths, hashes compared in the cell, counts and the engine's meta.
// `spec`: {key, item, group, block, i, string (its id), method, expectedLength, lines, regime, engine}; the answers are
// the runner's (./session.mjs readReply); `page`: {mid, after}; `fixture`: {mid, after} counts; `front`: {mid, after,
// expected} pids; `activations`: the bundle watcher's events in the act's span; `raisedAt`: when the order watcher saw
// each raise from the act on, and `stateAtStart` its order when the act began; `userKept`: the composition's hash after
// the row (null without a user window); `clipboard`: {mid, after} type-list digests; `menu`: {read, observed};
// `keyWindow`: the driven app's key-window reading before the act (ax-state.swift window); `personTouched`: what of the
// person the row saw (personTouchedOf), which makes it invalid. -> the record; `ok` is delivered and valid.
export function rowRecord({spec, prepare = null, act = null, check = null, page = null, fixture = null, front = null, activations = [], raisedAt = [], stateAtStart = null,
  userKept = null, clipboard = null, menu = null, keyWindow = null, disturbed = false, personTouched = null}) {
  const meta = act?.meta ?? {}, paste = meta.paste ?? null, background = spec.regime === 'background';
  const outcome = check?.ok ? check.value?.outcome : null;
  const readBack = outcome ? {exact: outcome.exact === true, length: outcome.length ?? null} : null;
  const pageReading = page ? pageAgreement(page, spec.expectedLength) : null;
  const delivered = readBack?.exact === true && (pageReading === null || pageReading.agree);
  const invalid = personTouched ? `person-touched: ${touchText(personTouched)}`
    : disturbed ? 'an earlier row of the block disturbed the user window\'s composition'
    : !prepare ? 'the driven field was not prepared (no answer)'
      : !prepare.ok ? `the prepare cell failed: ${prepare.error}`
        : prepare.value?.ready !== true ? `not prepared: ${prepare.value?.reason ?? 'no reason'}`
          : !act ? 'the act was not sent'
            : !act.ok ? `the act cell failed: ${act.error}`
              : !check?.ok ? `the read-back failed: ${check?.error ?? 'no answer'}`
                : check.value?.invalid ? `the read-back: ${check.value.invalid}`
                  : page && !page.mid ? 'no page counters before the act: the row\'s counter evidence is incomplete'
                  : background && spec.engine === 'cua' && !freshActivation(meta) ? 'no fresh activation (no activationGuardMs, or focusEnforcement.activated false): the act ran under a held activation'
                    : background && stateAtStart !== null && stateAtStart !== 'front-above' ? `the window order at the act was ${stateAtStart}, not the user window above the driven one`
                      : front && front.mid !== front.expected ? `the frontmost process before the act was ${front.mid ?? 'unreadable'}, not ${front.expected}`
                        : null;
  // No menu opened needs a whole snapshot, or a notification watch the helper verified it registered; else unread.
  const opened = menu ? (menu.observed > 0 ? true : menuOpened(menu.read) ?? (menu.watchVerified === true && menu.observed === 0 ? false : null)) : null;
  const kw = keyWindowOf(keyWindow), pageFocused = page?.mid ? (typeof page.mid.focused === 'boolean' ? page.mid.focused : null) : null;
  return {ok: invalid === null && delivered, key: spec.key, item: spec.item, group: spec.group, id: rowId(spec.group, spec.method, spec.string), block: spec.block,
    i: spec.i, string: spec.string, method: spec.method, expectedLength: spec.expectedLength, prior: spec.prior ?? null, lines: spec.lines ?? 1, regime: spec.regime, engine: spec.engine,
    route: act?.route ?? null, activationClick: meta.activationClick ?? null, activationClickKind: meta.activationClickKind ?? null, activationGuardMs: meta.activationGuardMs ?? null,
    entered: meta.entered ?? null, delivery: meta.delivery ?? null, afterActionRepairs: meta.afterActionRepairs ?? null,
    actMs: act?.value?.actMs ?? null, threw: act?.value?.threw ?? null, error: act?.value?.message ?? null, paste,
    readBack, page: pageReading, fixtureDeltas: fixture ? deltas(fixture.mid, fixture.after) : null, delivered,
    disagree: readBack !== null && pageReading !== null && readBack.exact !== pageReading.agree, invalid,
    front: front && {...front, changed: front.after !== front.expected || activations.length > 0},
    activations: activations.map(a => ({bundleId: a.bundleId ?? null, at: a.at ?? null})), raises: raisedAt.length, raisedAt, stateAtStart, userKept,
    clipboardRestored: clipboard ? clipboard.mid !== null && clipboard.mid === clipboard.after : null,
    menu: menu && {snapshot: menu.read?.ok === true && menu.read?.trusted === true, selected: menu.read?.selected ?? null, openMenus: menu.read?.openMenus ?? null,
      focusedRole: menu.read?.focusedRole ?? null, observed: menu.observed ?? null, watchVerified: menu.watchVerified === true, opened},
    keyWindow: kw, pageFocused, personTouched};
}

// What of the person an item, row or repetition saw: an app activated that is neither a scene's nor the engine's (the
// activation watcher's lines; one without a bundle id counts), or a frontmost process that is no scene's (`fronts`:
// pids, against `scenePids`; the guard's frontmost reading already passes over the engine's own). -> {apps, frontPids}
// or null.
export function personTouchedOf({activations = [], fronts = [], scenePids = []}) {
  const apps = [...new Set(activations.filter(l => l?.kind === 'activated' && !OWN_BUNDLES.includes(l.bundleId)).map(l => l.bundleId ?? 'unknown'))];
  const frontPids = [...new Set(fronts.filter(pid => Number.isSafeInteger(pid) && !scenePids.includes(pid)))];
  return apps.length || frontPids.length ? {apps, frontPids} : null;
}
const touchText = t => [t.apps?.length && `${t.apps.join(', ')} activated`, t.frontPids?.length && `process ${t.frontPids.join(', ')} frontmost`].filter(Boolean).join('; ') || 'by the person';

// The person-touched items an item's evidence holds (its jsonl rows, whose last attempt counts, and its activation
// watcher's lines, read only when that attempt started the watcher): every row and the repetition recorded as touched,
// or, when none was, one for a foreign activation the watcher saw (the item stopped before recording it, or the person
// came between rows). `rep`: the item is a cell repetition the person touched. -> {count, rep, foreign}.
export function touchedOfItem(rows, activationLines = []) {
  return attemptTouches(lastAttempt(rows ?? []), activationLines);
}
// One attempt's touches: its rows and repetition recorded as touched, else the drive's mark on its stop, else (the latest
// attempt only, whose watcher's file it is) a foreign activation the watcher saw.
function attemptTouches(attempt, activationLines) {
  const rowsTouched = attempt.filter(r => r.kind === 'task' && r.task === '187-row' && r.result?.personTouched).length;
  const cell = attempt.findLast(r => r.kind === 'task' && r.task === '187-cell')?.result ?? null;
  const marked = attempt.findLast(r => r.kind === 'stopped')?.personTouched ?? null;
  const watched = activationLines && attempt.some(r => r.kind === 'task' && r.task === '187-activations-start');
  const foreign = marked && typeof marked === 'object' ? marked : watched ? personTouchedOf({activations: activationLines}) : null;
  const recorded = rowsTouched + (cell?.personTouched ? 1 : 0);
  return {count: recorded || (marked || foreign ? 1 : 0), rep: cell ? Boolean(cell.personTouched) : Boolean(marked || foreign), foreign};
}
// The slot's touches so far in an item's evidence: every attempt's (touchedOfItem's per attempt), so re-running a part
// never resets the stop rule. The watcher's file is the latest attempt's alone.
export function slotTouches(rows, activationLines = []) {
  const starts = (rows ?? []).flatMap((r, k) => (r.kind === 'start' ? [k] : []));
  if (!starts.length) return 0;
  return starts.reduce((n, from, k) => n + attemptTouches(rows.slice(from, starts[k + 1]), k === starts.length - 1 ? activationLines : null).count, 0);
}

// The drive's loop (the CLI's `paste-187 drive`): each item of `plan` run in order by `runItem(entry)` (-> null, or the
// error it stopped with), its evidence read back by `evidenceOf(item)` (-> {rows, activations}) and its person-touched
// items counted (touchedOfItem) onto `seed`, the slot's count so far. A person-touched cell repetition is followed by its
// replacement, once (`entry.replace`). More than TOUCHED_STOP stops the drive: only the 'end' items still run (187-end,
// the owner's source). An item that stops stops the items after it but the end, unless its stage goes on (a cell
// repetition, #259's cell, a #188 item: each later item sets up its own scene) or the person touched it. `mark(item,
// error, touched)` records a stop. -> {stopped, touched, ran}.
export const GOES_ON = Object.freeze(['cell', 'press', '259', '188']);
export async function driveItems(plan, {runItem, evidenceOf, mark = () => {}, seed = 0, print = () => {}}) {
  const queue = [...plan], ran = [];
  let stopped = null, touched = seed;
  while (queue.length) {
    const entry = queue.shift();
    if (stopped && entry.stage !== 'end') continue;
    const error = await runItem(entry);
    const evidence = entry.stage === 'premise' ? null : evidenceOf(entry.item);
    const t = evidence ? touchedOfItem(evidence.rows, evidence.activations) : {count: 0, rep: false, foreign: null};
    touched += t.count;
    if (error) mark(entry.item, error, t);
    ran.push({item: entry.item, touched: t.count, error: error?.message ?? null});
    if (t.count) print(`${entry.item}: ${t.count} person-touched (the slot's count ${touched}); recorded invalid`);
    if (touched > TOUCHED_STOP) {
      if (!stopped) { stopped = `${touched} person-touched items in the slot, more than ${TOUCHED_STOP}`; print(`stopped: ${stopped}; only the owner's source is put back`); }
      continue;
    }
    if (t.rep && entry.replace) { const replacement = entry.replace(lastAttempt(evidence.rows)[0]?.at ?? null); queue.unshift(replacement); print(`${entry.item} was touched by the person: ${replacement.item} replaces it`); }
    if (!error || stopped) continue;
    if (GOES_ON.includes(entry.stage) || t.count) { print(`${entry.item} stopped: ${error.message}; the drive goes on`); continue; }
    stopped = `${entry.item}: ${error.message}`;
    print(`stopped at ${stopped}; the items after it were not run`);
  }
  return {stopped, touched, ran};
}

// The outcomes that say a line's effect was seen: a trusted notification, or the reading's change.
const SEEN = Object.freeze(['notification', 'reading']);
const sameReading = (a, b) => j(a ?? null) === j(b ?? null);
// Why a row's `cua/paste.perLine` does not show every one of its `lines` confirmed by its own change, or null: a record
// per line, each confirmed by a reading or a trusted notification; every line after the first opened by a Return
// whose settle saw its effect (so its baseline was taken after that Return's own change, Paste.swift beginLine); a
// reading-confirmed line's confirming reading differing from its own baseline.
export function perLineProblem(record) {
  const list = record?.paste?.perLine;
  if (!Array.isArray(list)) return 'no per-line record (cua/paste.perLine)';
  if (list.length !== record.lines) return `${list.length} per-line record(s) for ${record.lines} line(s)`;
  for (const [k, l] of list.entries()) {
    const n = l?.line ?? k + 1;
    if (l?.line !== k + 1) return `the per-line records are not lines 1..${record.lines} in order`;
    if (l.confirmed !== true || !SEEN.includes(l.effectWait)) return `line ${n} was not confirmed by its own change (confirmed ${l.confirmed ?? 'unread'}, effect ${l.effectWait ?? 'unread'})`;
    if (k > 0 && !SEEN.includes(l.openingReturn?.settle)) return `line ${n}'s opening Return was not settled before its baseline (settle ${l.openingReturn?.settle ?? 'unread'})`;
    if (l.effectWait === 'reading' && (l.baseline == null || l.confirming == null)) return `line ${n} was confirmed by a reading without both its baseline and its confirming reading`;
    if (l.effectWait === 'reading' && sameReading(l.baseline, l.confirming)) return `line ${n}'s confirming reading is its own baseline`;
  }
  return null;
}

// ---- the judge -------------------------------------------------------------------------------------------------------

const lastAttempt = rows => rows.slice(Math.max(0, rows.map(r => r.kind).lastIndexOf('start')));
const tally = values => values.reduce((m, v) => ({...m, [v ?? 'none']: (m[v ?? 'none'] ?? 0) + 1}), {});
const sumOf = list => list.reduce((m, d) => { for (const [k, v] of Object.entries(d ?? {})) m[k] = (m[k] ?? 0) + v; return m; }, {});
const stageOf = r => `${r.paste?.stage ?? 'no stage'}: read ${r.paste?.readWait ?? '–'}, effect ${r.paste?.effectWait ?? '–'}${r.paste?.confirmed === false ? ', unconfirmed' : ''}`;
const clicksOf = r => (r.page?.deltas?.mousedown ?? 0) + (r.page?.deltas?.click ?? 0);
// What a row did to the person's side (a front change in a person-touched row is the person's own, not the row's).
export const interferenceOf = r => [r.raises > 0 && 'raise', r.front?.changed && !r.personTouched && 'front app', r.userKept === false && 'composition', clicksOf(r) > 0 && 'page click',
  r.menu?.opened === true && 'menu', r.clipboardRestored === false && 'clipboard'].filter(Boolean);
// The click an act's activation posted, as one label: its kind, where, and when (the engine's activationClickKind, or
// the paste's own focusEnforcement.click).
const clickKindOf = r => { const k = r.activationClickKind ?? r.paste?.focusEnforcement?.click ?? null; return k ? [k.kind, k.point ?? k.skippedReason, k.when].filter(Boolean).join(' ') : null; };
const keyLabel = r => { const held = keyHeld(r.keyWindow, r.group && GROUPS[r.group]?.driven === 'chrome' ? r.pageFocused : undefined); return held === null ? 'unread' : held ? 'key' : r.keyWindow?.frontmost ? 'front, not key' : 'not key'; };

// A group's numbers. -> the counts the report prints.
export function summarize(rows) {
  const valid = rows.filter(r => r.invalid === null), delivered = valid.filter(r => r.delivered);
  return {n: rows.length, valid: valid.length, delivered: delivered.length, exact: valid.filter(r => r.readBack?.exact).length,
    pageAgree: valid.filter(r => r.page?.agree).length, disagree: valid.filter(r => r.disagree).length, perLineOk: rows.filter(r => perLineProblem(r) === null).length,
    invalid: tally(rows.filter(r => r.invalid).map(r => r.invalid)), stages: tally(valid.filter(r => !r.delivered).map(stageOf)),
    readAfterPostMs: spread(valid.map(r => r.paste?.readAfterPostMs)), actMs: spread(valid.map(r => r.actMs)), actMsDelivered: spread(delivered.map(r => r.actMs)),
    page: sumOf(rows.map(r => r.page?.deltas)), fixture: sumOf(rows.map(r => r.fixtureDeltas)),
    raises: rows.reduce((n, r) => n + (r.raises ?? 0), 0), frontChanges: rows.filter(r => r.front?.changed).length,
    activations: rows.reduce((n, r) => n + (r.activations?.length ?? 0), 0), pageClicks: rows.reduce((n, r) => n + clicksOf(r), 0),
    userKept: rows.filter(r => r.userKept === true).length, userLost: rows.filter(r => r.userKept === false).length,
    clipboardChanged: rows.filter(r => r.clipboardRestored === false).length, menuOpened: rows.filter(r => r.menu?.opened === true).length,
    menuUnread: rows.filter(r => r.menu && r.menu.opened === null).length,
    routes: tally(valid.map(r => r.route)), clickKinds: tally(valid.map(clickKindOf)), keyAtAct: tally(rows.map(keyLabel)),
    keyFocus: tally(valid.map(r => (r.paste?.keyFocusAtPaste == null ? null : r.paste.keyFocusAtPaste.holds ? 'holds' : 'does not hold'))),
    deliveryRestores: valid.reduce((n, r) => n + (Number.isFinite(r.delivery?.restores) ? r.delivery.restores : 0), 0),
    activationToCommandVMs: spread(valid.map(r => r.paste?.focusEnforcement?.activationToCommandVMs)), clickToCommandVMs: spread(valid.map(r => r.paste?.focusEnforcement?.clickToCommandVMs))};
}

// Why a background item's order-watcher record does not cover it, or null: an end record, no gap past WATCH_GAP_MS.
const watcherProblem = watcher => (!watcher?.ok ? 'the order watcher\'s record is missing or has no end'
  : !(watcher.maxGapMs <= WATCH_GAP_MS) ? `the order watcher's longest gap was ${watcher.maxGapMs} ms, past ${WATCH_GAP_MS}` : null);

// Every raise of the item's final watcher record, accounted for: inside a row's span (from its act to the restore's read)
// it is that row's; inside one of the kit's own setup or restore steps (`windows`) it is explained as setup; otherwise,
// after a row, it is the most recent row's (the block's tail: a delayed raise while the block closes its watchers and
// session); before any row, it is unattributed. -> {rowRaises, tailRaises, setupRaises, unattributed}.
export function reconcileRaises(times, rows, windows) {
  const spans = Object.entries(rows).map(([key, row]) => ({key, from: row.mid?.at ?? row.start, to: row.closedAt ?? row.end ?? Infinity}))
    .filter(r => Number.isFinite(r.from)).sort((x, y) => x.from - y.from);
  const rowRaises = {}, tailRaises = {}, unattributed = [];
  let setupRaises = 0;
  const push = (m, key, at) => { (m[key] ??= []).push(at); };
  for (const at of times) {
    const row = spans.find(r => at >= r.from && at <= r.to);
    if (row) { push(rowRaises, row.key, at); continue; }
    if (windows.some(w => at >= w.from && at <= w.to)) { setupRaises += 1; continue; }
    const before = spans.filter(r => r.to < at).at(-1);
    if (before) push(tailRaises, before.key, at); else unattributed.push(at);
  }
  return {rowRaises, tailRaises, setupRaises, unattributed};
}

// Why a watcher's raise total is not attributed plus setup-explained raises, or null (an unattributed raise is its own
// failure, judged apart).
export function reconciliationProblem(watcher) {
  if (!watcher?.ok) return null;
  if (!Number.isInteger(watcher.setupRaises) || !Array.isArray(watcher.unattributed)) return 'the order watcher\'s raises were not reconciled with the rows';
  const counted = [watcher.rowRaises, watcher.tailRaises].reduce((n, m) => n + Object.values(m ?? {}).reduce((k, t) => k + t.length, 0), 0) + watcher.setupRaises + watcher.unattributed.length;
  return counted === watcher.raises ? null : `the order watcher saw ${watcher.raises} raise(s), but ${counted} are accounted for`;
}

// One repetition's judgement from its '187-cell' record, on its route. Its status first: person-touched (invalid,
// replaced once), PRECONDITION UNMET (the AXPress route: the textarea advertised no AXPress within AXPRESS_BOUND_MS), premise
// not met (the AXPress route: the click's plan was not action/AXPress; the background paste: its activation click was not
// skipped, `activationClick` other than outsideFrame, so its own click consumed the arm as in the slot's rep 2), else
// counted. A counted repetition then passes (AFTER: on the background paste, it delivered; the key held after open -a; the
// frontmost paste delivered), fails as predicted (BEFORE: on the background paste, it timed out at the read stage; the
// key not held after open -a; the frontmost paste not delivered, and on the AXPress route its read timing out), or
// delivers a paste (BEFORE: the cell does not discriminate). Neither of the first two counts for or against anything.
const repStatus = (c, bg) => {
  if (c.personTouched) return ['person-touched', `touched by the person (${touchText(c.personTouched)})`];
  if (c.route === 'press') {
    if (c.premise?.advertised !== true) return ['precondition unmet', `AXPress was not advertised on the textarea within ${AXPRESS_BOUND_MS} ms of the session's first observation (${c.premise?.actions ? `it advertised ${c.premise.actions.join(', ') || 'nothing'}` : 'unread'})`];
    if (!(c.press?.plan === 'action' && c.press?.action === 'AXPress')) return ['premise not met', `the click's plan was ${c.press?.plan ?? 'unread'}${c.press?.action ? `/${c.press.action}` : ''}${c.press?.reason ? ` (${c.press.reason})` : ''}, not action/AXPress`];
    return ['counted', null];
  }
  if (!bg) return ['premise not met', 'the background paste was not recorded'];
  if (bg.activationClick !== 'outsideFrame') return ['premise not met', `the background paste's activation click was ${bg.activationClick ?? 'unrecorded'}, not skipped (outsideFrame): a click of its own consumed the arm`];
  return ['counted', null];
};
export function cellVerdict(c) {
  if (!c) return {recorded: false, route: null, status: 'not recorded', counted: false, pass: false, predicted: false, delivers: false, key: null, keyless: null, why: 'not recorded'};
  const route = c.route ?? 'press', bg = route === 'paste' ? c.background ?? null : null, fg = c.row ?? null;
  const key = keyHeld(c.keyAfter?.reading, c.keyAfter?.pageFocused ?? null);
  const keyless = c.keyAfter?.reading?.trusted && c.keyAfter.reading.ok ? c.keyAfter.reading.focused === false || c.keyAfter.reading.main === false : null;
  const valid = r => r?.invalid === null, timedOut = r => r?.paste?.stage === 'read' && r.paste.readWait === 'timeout';
  const fgDelivered = valid(fg) && fg.delivered === true, bgDelivered = valid(bg) && bg.delivered === true;
  const [status, premise] = repStatus({...c, route}, bg), counted = status === 'counted';
  const pass = counted && key === true && fgDelivered && (route !== 'paste' || bgDelivered);
  const delivers = counted && (fgDelivered || bgDelivered);
  const predicted = counted && keyless === true && valid(fg) && !fg.delivered && (route === 'paste' ? valid(bg) && !bg.delivered && timedOut(bg) : timedOut(fg));
  const pasteText = (r, which) => (!r ? `the ${which} paste was not recorded` : r.invalid ? `the ${which} paste was invalid (${r.invalid})` : null);
  const why = !counted ? [premise] : [
    route === 'paste' && (pasteText(bg, 'background') ?? (!bg.delivered && 'the background paste did not deliver')),
    key === null && 'the key-window state after the activation was not read whole', key === false && 'the key was not held after the activation',
    pasteText(fg, 'frontmost') ?? (!fg.delivered && 'the frontmost paste did not deliver')].filter(Boolean);
  const beforeWhy = !counted ? [premise] : [
    route === 'paste' && (pasteText(bg, 'background') ?? (bg.delivered ? 'the background paste delivered' : !timedOut(bg) && `the background paste stopped at ${bg.paste?.stage ?? 'no stage'} (read ${bg.paste?.readWait ?? '–'}), not a read timeout`)),
    keyless === null ? 'the key-window state after the activation was not read whole' : keyless === false && 'the key was held after the activation',
    pasteText(fg, 'frontmost') ?? (fg.delivered ? 'the frontmost paste delivered' : route === 'press' && !timedOut(fg) && 'the frontmost paste\'s read did not time out')].filter(Boolean);
  return {recorded: true, route, status, counted, pass, predicted, delivers, key, keyless, bgDelivered, delivered: fgDelivered, bgReadTimeout: timedOut(bg), readTimeout: timedOut(fg),
    why: why.join('; ') || null, beforeWhy: beforeWhy.join('; ') || null};
}

// The put-back (the before part's 187-putback and 187-end's last attempt): the owner's source read back and the saved
// engine's build installed and approved. -> {ok, source, engine, why}.
function putbackOf({restore, putback, ran}) {
  const why = [];
  if (!restore.ok) why.push(restore.why);
  if (!ran) why.push('the engine put-back was not read (the before part, with --saved, has not run)');
  else if (putback?.ok !== true) why.push(`the engine was not put back: ${putback?.problem ?? 'no reading'}`);
  return {ok: why.length === 0, source: restore, engine: putback ?? null, why};
}

// Every item's judgement from the evidence (`items`: {item: its jsonl rows}). -> {groups, cells, bar, putback, ...}.
export function judge187(items) {
  const rowsOf = name => (items[name] ? lastAttempt(items[name]) : []);
  const taskResult = (name, task) => rowsOf(name).findLast(r => r.kind === 'task' && r.task === task)?.result ?? null;
  // Each row's raises: what its own read saw, what the between-row restore's fresh read saw after it, and what the final
  // watcher record holds inside the row's span (`rowRaises`), reconciled into one set per row.
  const records = name => {
    const late = new Map();
    const add = (key, times) => { for (const at of times ?? []) late.set(key, new Set([...(late.get(key) ?? []), at])); };
    for (const r of rowsOf(name)) if (r.kind === 'task' && r.task === '187-order-restore') add(r.result?.key, r.result?.lateRaisedAt);
    const stop = taskResult(name, '187-order-stop');
    for (const m of [stop?.rowRaises, stop?.tailRaises]) for (const [key, times] of Object.entries(m ?? {})) add(key, times);
    return rowsOf(name).filter(r => r.kind === 'task' && r.task === '187-row' && r.result).map(r => {
      const extra = [...(late.get(r.result.key) ?? [])].filter(at => !(r.result.raisedAt ?? []).includes(at));
      if (!extra.length) return r.result;
      const raisedAt = [...(r.result.raisedAt ?? []), ...extra].sort((x, y) => x - y);
      return {...r.result, raisedAt, raises: raisedAt.length, reconciled: extra.length};
    });
  };
  const stoppedOf = name => rowsOf(name).findLast(r => r.kind === 'stopped')?.error ?? null;
  const groups = [];
  const add = (name, group, target, role) => {
    const rows = records(name);
    if (items[name]) {
      const g = {item: name, group, target, role, stopped: stoppedOf(name), watcher: taskResult(name, '187-order-stop'),
        sources: rowsOf(name).filter(r => r.task === '187-korean').map(r => r.result?.reading ?? null),
        readers: taskResult(name, '187-processes')?.readers ?? null, rows, ...summarize(rows)};
      g.restores = rowsOf(name).filter(r => r.kind === 'task' && r.task === '187-order-restore' && r.result?.restored).map(r => ({key: r.result.key, raisedAt: r.result.raisedAt ?? [], ok: r.result.ok}));
      groups.push(g);
    }
    return rows;
  };
  add(ITEMS.composing, 'chrome-composing', TARGET, 'bar');
  for (const g of CONTROLS) add(ITEMS.control(g), g, TARGET, 'bar');
  add(ITEMS.vendorKorean, 'chrome-korean', VENDOR_ROWS.length, 'recorded');
  add(ITEMS.vendor, 'chrome-composing', VENDOR_ROWS.length, 'recorded');
  // The cell's repetitions per route and half: the planned ones (a missing one reads not recorded) and any replacement,
  // each judged on its last attempt; one whose AXPress gate was closed did not run, one stopped by the person's touch
  // is person-touched (the drive's mark).
  const reps = (route, half) => {
    const planned = Array.from({length: route === 'paste' ? CELL_REPS : PRESS_REPS}, (_, rep) => repItem(route, half, rep));
    const found = Object.keys(items).filter(name => { const m = name.match(REP_ITEM); return m && (m[1] === 'cell' ? 'paste' : 'press') === route && m[2] === half; });
    const list = [...new Set([...planned, ...found])].map(name => [name, Number(name.match(REP_ITEM)[3])]).sort((a, b) => a[1] - b[1]).map(([name, rep]) => {
      const stop = rowsOf(name).findLast(r => r.kind === 'stopped') ?? null, gate = taskResult(name, '187-press-gate');
      // The background paste's row with its raises reconciled as a composing row's are (the restore's late read, the
      // final watcher record), and that watcher kept for the bar.
      const kept = taskResult(name, '187-cell'), bgRow = route === 'paste' && kept ? records(name).find(r => r.key === keyOf(name, 0, 0)) ?? kept.background : null;
      const record = bgRow ? {...kept, background: bgRow} : kept, watcher = route === 'paste' ? taskResult(name, '187-order-stop') : null, v = cellVerdict(record);
      const [status, why] = record ? [v.status, v.why] : gate?.ok === false ? ['not run', gate.problem ?? 'the AXPress gate was closed']
        : stop ? [stop.personTouched ? 'person-touched' : 'stopped', stop.error] : ['not recorded', null];
      return {item: name, route, half, rep, attemptAt: rowsOf(name)[0]?.at ?? null, replaces: taskResult(name, '187-replaces'), stopped: stop?.error ?? null, record, watcher, ...v, status, why};
    });
    // A replacement counts only in place of the attempt it was run for: that attempt still the parent's last, and
    // person-touched; one per parent attempt. Any other (a stale one from before the half was re-run) counts for nothing.
    const used = new Set();
    return list.map(c => {
      if (c.rep < planned.length || c.status === 'not recorded') return c;
      const parent = list.find(p => p.item === c.replaces?.parent), key = `${c.replaces?.parent}@${c.replaces?.attempt}`;
      const live = parent && c.replaces.attempt != null && parent.attemptAt === c.replaces.attempt && parent.status === 'person-touched' && !used.has(key);
      if (live) { used.add(key); return c; }
      return {...c, status: 'stale replacement', counted: false, pass: false, predicted: false, delivers: false,
        why: !c.replaces ? 'it names no attempt it replaces' : !parent ? `it replaces ${c.replaces.parent}, not a repetition of this half`
          : parent.attemptAt !== c.replaces.attempt ? `it replaced an earlier attempt of ${parent.item}, which has run again since`
            : parent.status !== 'person-touched' ? `${parent.item}'s attempt was ${parent.status}, not person-touched` : `${parent.item}'s attempt is already replaced`};
    });
  };
  const cells = Object.fromEntries(ROUTES.map(route => [route, Object.fromEntries(HALVES.map(half => [half, reps(route, half)]))]));
  const samples = rowsOf(ITEMS.premise).filter(r => r.kind === 'task' && r.task === '187-axpress').map(r => r.result);
  const premise = items[ITEMS.premise] ? {engine: taskResult(ITEMS.premise, '187-premise-engine'), samples, opens: premiseOpens(samples), stopped: stoppedOf(ITEMS.premise)} : null;
  const restore = restoreOf(rowsOf(ITEMS.end), {recorded: Boolean(items[ITEMS.end]), stopped: stoppedOf(ITEMS.end)});
  const putback = putbackOf({restore, putback: taskResult(ITEMS.putback, '187-putback'), ran: Boolean(items[ITEMS.putback])});
  // The background paste's AFTER rows count for the person's side with every other bar row (a person-touched
  // repetition's are the person's); the BEFORE half's rows are the saved engine's, and the AXPress route never gates.
  const cellRows = cells.paste.after.filter(c => c.record && c.status !== 'person-touched').flatMap(c => [c.record.background, c.record.row]).filter(Boolean);
  const bar = barOf({groupOf: name => groups.find(g => g.item === name) ?? null, cells, putback, cellRows});
  // #188's rows and cell 3, and #259's cell, judged apart (./item-188.mjs): reported, never part of the bar.
  return {groups, cells, premise, press: pressStatement(cells.press, premise), bar, putback, restore, overall: {ok: bar.ok, verdict: bar.verdict, why: bar.why, on: bar.on},
    vendor: items[ITEMS.vendor] ? summarize(records(ITEMS.vendor)) : null, vendorKorean: items[ITEMS.vendorKorean] ? summarize(records(ITEMS.vendorKorean)) : null,
    item188: judge188(items), item259: judge259(items)};
}

// Whether the premise part opens the AXPress route: its latest attempt holds all PREMISE_SAMPLES samples, each read whole
// (`ok`) and each seeing AXPress within AXPRESS_BOUND_MS of the session's first observation of a freshly relaunched Chrome.
const sampleSaw = s => s?.ok === true && s.advertised === true;
export const premiseOpens = samples => samples.length === PREMISE_SAMPLES && samples.every(sampleSaw);
const premiseText = samples => `the premise part saw AXPress within ${AXPRESS_BOUND_MS} ms in ${samples.filter(sampleSaw).length} of ${PREMISE_SAMPLES} sample(s)${samples.length === PREMISE_SAMPLES ? '' : ` (${samples.length} recorded)`}`;

// The AXPress route's statement for the report (never the bar): what its counted repetitions showed on each half, or
// why it did not run. -> {ran, unproven, lines}.
export function pressStatement(press, premise) {
  const all = [...press.after, ...press.before], ran = all.some(c => c.recorded || (c.stopped && c.status !== 'not run'));
  const after = press.after.filter(c => c.counted), before = press.before.filter(c => c.counted);
  const gate = premise ? premiseText(premise.samples) : 'the premise part has not run';
  const lines = [];
  if (!ran) lines.push(`The AXPress route did not run (${gate}).`);
  else {
    lines.push(`AFTER: ${after.filter(c => c.pass).length} of ${after.length} counted repetition(s) key and delivered.`);
    const delivering = before.filter(c => c.delivers);
    lines.push(`BEFORE: ${before.filter(c => c.predicted).length} of ${before.length} counted repetition(s) keyless with the read timing out, as predicted.${delivering.length ? ` ${delivering.length} delivered: on this route the activation followed by the person's activation does not leave Chrome keyless on the saved engine.` : ''}`);
    const other = all.filter(c => !c.counted && c.status !== 'not recorded');
    if (other.length) lines.push(`Not counted: ${other.map(c => `${c.item} ${c.status}${c.why ? ` (${c.why})` : ''}`).join('; ')}.`);
  }
  const unproven = after.length === 0;
  if (unproven) lines.push('**AXPress on Chrome is unproven**: no repetition clicked the textarea on the action plan.');
  return {ran, unproven, lines};
}

// The bar (the header's): every condition, each failing one named. -> {ok, verdict: LANDS | DOES NOT LAND | NO VERDICT,
// why, on: the route the cell's landing rests on}. NO VERDICT only when the one thing between the slot and LANDS is a
// BEFORE that delivers (the cell does not discriminate); any other failing condition is DOES NOT LAND.
function barOf({groupOf, cells, putback, cellRows}) {
  const why = [];
  // The person's side per row: the front app, the composition, the clipboard, a page click (raises and menus are
  // counted over every bar row below).
  const touched = (rows, label) => {
    for (const [flag, n] of Object.entries(tally(rows.flatMap(r => interferenceOf(r).filter(f => !['raise', 'menu'].includes(f)))))) why.push(`${label}: ${n} row(s) touched the person's side (${flag})`);
  };
  const whole = (name, label, {perLine = false} = {}) => {
    const g = groupOf(name);
    if (!g) return void why.push(`${label}: not recorded`);
    if (g.stopped) why.push(`${label} stopped: ${g.stopped}`);
    const good = g.rows.filter(r => r.invalid === null && r.delivered);
    if (g.n !== TARGET || good.length !== TARGET) why.push(`${label}: ${good.length} of ${TARGET} rows valid and delivered (${g.n} recorded)${Object.keys(g.invalid).length ? `; invalid: ${Object.entries(g.invalid).map(([w, n]) => `${w} × ${n}`).join('; ')}` : ''}`);
    if (perLine) {
      const bad = g.rows.map(r => [r.key, perLineProblem(r)]).filter(([, p]) => p);
      if (bad.length) why.push(`${label}: ${bad.length} row(s) whose lines were not each confirmed by their own change (${bad.slice(0, 3).map(([k, p]) => `${k}: ${p}`).join('; ')}${bad.length > 3 ? '; …' : ''})`);
    }
    touched(g.rows, label);
    if (GROUPS[g.group].user) {
      const w = watcherProblem(g.watcher) ?? reconciliationProblem(g.watcher);
      if (w) why.push(`${label}: ${w}`);
    }
  };
  whole(ITEMS.composing, 'chrome/composing@textedit', {perLine: true});
  for (const c of CONTROLS) whole(ITEMS.control(c), `the ${groupName(c)} control`);
  // The background-paste cell: AFTER passes on CELL_REPS counted repetitions, and BEFORE fails as predicted on as many.
  const P = cells.paste, cell = 'the background-paste cell';
  const repList = (cs, fail) => cs.map(c => `${c.item.replace(/^187-cell-/, '')}: ${c.status === 'counted' ? fail(c) ?? 'as required' : `${c.status}${c.why ? ` (${c.why})` : ''}`}`).join('; ');
  const afterCounted = P.after.filter(c => c.counted), afterPass = afterCounted.filter(c => c.pass);
  if (afterCounted.length < CELL_REPS || afterPass.length !== afterCounted.length)
    why.push(`${cell}'s AFTER half: ${afterPass.length} of ${CELL_REPS} counted repetitions with the background paste delivered, the key held after open -a and the frontmost paste delivered (${afterCounted.length} counted; ${repList(P.after, c => (c.pass ? null : c.why))})`);
  touched(cellRows, `${cell}'s AFTER half`);
  // Each AFTER repetition's background paste ran under the order watcher: whole, within the gap, its raises reconciled.
  const cellWatched = P.after.filter(c => c.record && c.status !== 'person-touched');
  for (const c of cellWatched) {
    const w = watcherProblem(c.watcher) ?? reconciliationProblem(c.watcher);
    if (w) why.push(`${cell}'s ${c.item.replace(/^187-cell-/, '')}: ${w}`);
  }
  let noVerdict = null;
  const beforeCounted = P.before.filter(c => c.counted), delivering = beforeCounted.filter(c => c.delivers);
  if (!P.before.some(c => c.recorded || c.stopped)) why.push(`${cell}'s BEFORE half on the saved engine was not recorded (\`--part before --saved\`, once the owner's engine is put back)`);
  else if (delivering.length) noVerdict = `NO VERDICT: ${delivering.length} counted BEFORE repetition(s) on the saved engine delivered a paste, so the cell does not discriminate (${repList(P.before, c => (c.delivers ? c.beforeWhy : null))}); #187 stays Refs`;
  else if (beforeCounted.length < CELL_REPS || beforeCounted.some(c => !c.predicted))
    why.push(`${cell}'s BEFORE half: ${beforeCounted.filter(c => c.predicted).length} of ${CELL_REPS} counted repetitions failing as predicted (the background paste timing out at the read stage, the key not held after open -a, the frontmost paste not delivered) (${beforeCounted.length} counted; ${repList(P.before, c => (c.predicted ? null : c.beforeWhy))})`);
  // Raises and menus over every bar item and the cell's rows.
  const barGroups = [ITEMS.composing, ...CONTROLS.map(ITEMS.control)].map(groupOf).filter(Boolean);
  const rows = [...barGroups.flatMap(g => g.rows), ...cellRows];
  // A row's raises already hold the final record's reconciliation (its span's and its block tail's, `records`).
  const raises = rows.reduce((n, r) => n + (r.raises ?? 0), 0), unattributed = [...barGroups, ...cellWatched].reduce((n, g) => n + (g.watcher?.unattributed?.length ?? 0), 0);
  if (raises || unattributed) why.push(`${raises + unattributed} raise(s): ${raises} in rows (a block's tail counted with its last row), ${unattributed} outside every row and setup step`);
  const chromeRows = rows.filter(r => GROUPS[r.group]?.driven === 'chrome');
  const opened = chromeRows.filter(r => r.menu?.opened === true).length, unread = chromeRows.filter(r => !r.menu || r.menu.opened === null).length;
  if (opened) why.push(`${opened} row(s) with a menu opened in Chrome`);
  if (unread) why.push(`Chrome's menus could not be read after ${unread} row(s)`);
  why.push(...putback.why);
  const verdict = why.length ? 'DOES NOT LAND' : noVerdict ? 'NO VERDICT' : 'LANDS';
  return {ok: verdict === 'LANDS', verdict, why: noVerdict ? [...why, noVerdict] : why, on: verdict === 'LANDS' ? ROUTE_NAMES.paste : null};
}

// The owner's source at the end (187-end's select-source): restored only when it was switched and read back as the one
// requested. -> {ok, requested, current, why}.
export function restoreOf(rows, {recorded, stopped}) {
  const result = rows.findLast(r => r.kind === 'task' && r.task === 'select-source')?.result ?? null;
  const base = {requested: result?.requested ?? null, current: result?.current?.id ?? null};
  if (!recorded) return {ok: false, ...base, why: 'the owner\'s input source was not selected again (187-end not recorded)'};
  if (stopped && !result) return {ok: false, ...base, why: `the owner's input source was not selected again (187-end stopped: ${stopped})`};
  if (!result) return {ok: false, ...base, why: 'the owner\'s input source was not selected again (187-end has no selection)'};
  const ok = result.ok === true && result.switched === true && typeof result.requested === 'string' && result.current?.id === result.requested;
  return {ok, ...base, why: ok ? null : `the owner's input source was not restored: ${result.problem ?? (result.switched !== true ? result.reason ?? 'nothing was switched' : `read back ${result.current?.id ?? 'nothing'}, not ${result.requested}`)}`};
}

// The judge's exit status: 0 only when the bar holds.
export const judgedOk = judged => judged.overall.ok;

const listed = m => Object.entries(m ?? {}).map(([k, n]) => `${k} × ${n}`).join(', ') || '–';
const ms = x => (Number.isFinite(x) ? x.toFixed(1) : '–');
const spreadText = s => (s?.n ? `${ms(s.median)} (${ms(s.min)}–${ms(s.max)}, n ${s.n})` : '–');
const yes = v => (v === true ? 'yes' : v === false ? 'no' : '–');
const keyText = (reading, pageFocused) => (reading ? `frontmost ${yes(reading.frontmost)}, AXFocused ${yes(reading.focused)}, AXMain ${yes(reading.main)}, focused window ${reading.focusedWindow ?? '–'}${pageFocused !== undefined ? `, hasFocus ${yes(pageFocused)}` : ''}${reading.ok ? '' : ' (not whole)'}` : 'unread');
// The judgement as Markdown.
export function item187Markdown(judged) {
  const lines = ['# #187: the re-slot, paste behind a composition on the shipping build (scripts/cursor-sitting/item-187.mjs)', '',
    'A row is delivered only when the engine\'s read-back is exact and the page\'s own beacon, sent after the act, reports the expected length. A background row whose act carried no `activationGuardMs` acted under a held activation and is invalid. Page counts are the counters page\'s deltas over the act (window and textarea focus/blur, document-level mousedown and click); raises are the 5 ms order watcher\'s; the clipboard is the type-list digest before and after; the key at the act is the driven app\'s primary window AXFocused and AXMain, the app\'s AXFrontmost, and on Chrome the page\'s hasFocus(), read right before it.', '',
    `**The bar**: chrome/composing@textedit 18/18 with every line confirmed by its own change (\`cua/paste.perLine\`); the three controls 18/18; the background-paste cell, latin on purpose, on ${CELL_REPS} counted repetitions a half: AFTER (the shipping build) both pastes delivered and the key held after \`open -a\`, and BEFORE (the saved engine, in the same slot) the background paste timing out at the read stage with Chrome keyless after \`open -a\` (a BEFORE that delivers: NO VERDICT, the cell does not discriminate); every watcher whole with its longest gap within ${WATCH_GAP_MS} ms; no raise and no menu opened; nothing else on the person's side touched; the put-back verified (the owner's source read back, the saved engine installed and approved). A person-touched row or repetition is invalid. The AXPress route is reported, never the bar. Anything less is DOES NOT LAND.`, '',
    `## Overall: ${judged.overall.verdict}${judged.overall.on ? `, on ${judged.overall.on}` : ''}`, '', ...(judged.overall.why.length ? judged.overall.why.map(w => `- ${w}`) : ['- every condition held']), '',
    `The baseline, cited and not re-run: on ${BASELINE.engine} as built (the slot of 2026-11-01's arm A, ${BASELINE.items}), ${BASELINE.delivered} of ${BASELINE.rows} valid rows delivered, every one stopping at the ${BASELINE.stage} stage (${BASELINE.evidence}).`, '',
    `The put-back: the owner's input source ${judged.restore.ok ? `restored (${judged.restore.current}, read back)` : `NOT restored (${judged.restore.why})`}; the engine ${judged.putback.engine ? judged.putback.engine.ok ? `put back (build ${judged.putback.engine.current?.build}, approved, the save's)` : `NOT put back (${judged.putback.engine.problem})` : 'put-back not read'}.`, ''];
  const pasteState = r => (!r ? '–' : r.invalid ? `invalid: ${r.invalid}` : r.delivered ? 'delivered' : 'not delivered');
  const stageText = r => (r?.paste ? `${r.paste.stage ?? '–'} / ${r.paste.readWait ?? '–'}` : '–');
  const kindText = k => (k ? [k.kind, k.point ?? k.skippedReason, k.when].filter(Boolean).join(' ') : '–');
  const keyCells = r => `${keyText(r.keyBefore?.reading, r.keyBefore?.pageFocused ?? null)} | ${keyText(r.keyAfter?.reading, r.keyAfter?.pageFocused ?? null)}${r.keyAfter?.settledMs != null ? ` (${r.keyAfter.settledMs} ms)` : ''}`;
  const status = c => `${c.status}${c.status === 'counted' ? '' : c.why ? ` (${c.why})` : ''}`;
  lines.push(`## The confirming cell: ${ROUTE_NAMES.paste} (the bar's route)`, '',
    'Per repetition: Chrome for Testing relaunched clean and placed at the left, TextEdit over its right half and in front under ABC; one background paste of the one-line Latin string into the page\'s textarea, its prepare clicking nothing. **The cell is latin on purpose**: no composition, so it isolates the activation\'s arm; the composing part covers the titled rows. Then Chrome activated by `open -a`, the key-window state read, and one frontmost paste whose prepare clicks nothing. The premise: the background paste\'s activation click skipped (`activationClick` outsideFrame), so only the shipping build\'s inert click, or nothing on the saved engine, can consume the arm; a repetition whose activation point lies inside the frame posts a click of its own, which consumes the arm on either engine, and is premise not met, never counted. Predicted: AFTER (the shipping build) both pastes delivered and the key held; BEFORE (the saved engine) the background paste timing out at the read stage and Chrome keyless after `open -a`. A BEFORE repetition that delivers means the cell does not discriminate: NO VERDICT.', '',
    '| half | rep | status | background: activation click / click kind | background paste | its stage / read | key before open -a | key after open -a | frontmost paste | its stage / read |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const half of HALVES) for (const c of judged.cells.paste[half]) {
    const r = c.record;
    if (!r) { lines.push(`| ${half} | ${c.rep + 1} | ${status(c)} | – | – | – | – | – | – | – |`); continue; }
    lines.push(`| ${half} | ${c.rep + 1} | ${status(c)} | ${r.background?.activationClick ?? '–'} / ${kindText(r.background?.activationClickKind)} | ${pasteState(r.background)} | ${stageText(r.background)} | ${keyCells(r)} | ${pasteState(r.row)} | ${stageText(r.row)} |`);
  }
  const counted = half => judged.cells.paste[half].filter(c => c.counted);
  lines.push('', `AFTER: ${counted('after').filter(c => c.pass).length} of ${counted('after').length} counted repetitions with both pastes delivered and the key held (${CELL_REPS} needed).`);
  if (judged.cells.paste.before.some(c => c.recorded || c.stopped)) {
    const before = counted('before'), delivering = before.filter(c => c.delivers);
    lines.push(`BEFORE: ${before.filter(c => c.predicted).length} of ${before.length} counted repetitions failing as predicted (${CELL_REPS} needed).${delivering.length ? ` **${delivering.length} BEFORE repetition(s) delivered: the cell does not discriminate, NO VERDICT, and #187 stays Refs.**` : ''}`);
  } else lines.push('BEFORE: not recorded (`--part before`, once the owner\'s engine is put back).');
  lines.push('', '## The AXPress element click (reported for the mechanism, never the bar)', '',
    `It runs only when the premise part saw the textarea advertise AXPress within ${AXPRESS_BOUND_MS} ms of every sample's first observation, and each repetition waits up to as long for it again; without it the repetition is PRECONDITION UNMET and posts nothing, and a click whose plan is not action/AXPress is premise not met. The kit's earlier claim that Chromium advertises AXPress on the textarea was never verified on Chrome: the slot of 2026-11-05 clicked it on the synthesized plan (\`noAction\`), 0.3 s after the session's first observation of a fresh Chrome.`, '');
  if (judged.premise) {
    const p = judged.premise;
    lines.push(`The premise part (engine ${p.engine?.build ?? 'unread'}${p.engine?.approved === true ? ', approved' : ''}): AXPress appeared after ${p.samples.map(s => (s?.appearedMs != null ? `${s.appearedMs} ms` : `none within ${s?.boundMs ?? PREMISE_MEASURE_MS} ms`)).join(', ') || 'no sample'}; the route ${p.opens ? 'runs' : 'does not run'}.${p.stopped ? ` Stopped: ${p.stopped}.` : ''}`, '');
  } else lines.push('The premise part: not recorded (`--part premise`, in the preflight).', '');
  lines.push('| half | rep | status | AXPress after | click plan (action, reason) | activation click | key before open -a | key after open -a | paste | stage / read |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const half of HALVES) for (const c of judged.cells.press[half]) {
    const r = c.record;
    if (!r) { lines.push(`| ${half} | ${c.rep + 1} | ${status(c)} | – | – | – | – | – | – | – |`); continue; }
    lines.push(`| ${half} | ${c.rep + 1} | ${status(c)} | ${r.premise?.appearedMs != null ? `${r.premise.appearedMs} ms` : '–'} | ${r.press?.plan ?? '–'}${r.press?.action ? ` (${r.press.action}, ${r.press.reason ?? '–'})` : ''} | ${kindText(r.press?.kind)} | ${keyCells(r)} | ${pasteState(r.row)} | ${stageText(r.row)} |`);
  }
  lines.push('', ...judged.press.lines);
  lines.push('', '| item | rows | recorded / target | valid | delivered | read-back exact | page agrees | disagree | lines confirmed (rows) | page counts (sum) | raises | front changes | userKept / lost | clipboard changed | menu opened |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const g of judged.groups) {
    lines.push(`| ${g.item} | ${groupName(g.group)} | ${g.n} / ${g.target} | ${g.valid} | **${g.delivered}** | ${g.exact} | ${g.pageAgree} | ${g.disagree} | ${g.perLineOk} | ${listed(g.page)} | ${g.raises} | ${g.frontChanges} | ${g.userKept} / ${g.userLost} | ${g.clipboardChanged} | ${g.menuOpened}${g.menuUnread ? ` (${g.menuUnread} unread)` : ''} |`);
  }
  lines.push('', '| item | act ms, valid rows | act ms, delivered | read after ⌘V, ms | activation → ⌘V, ms | click → ⌘V, ms | activation clicks | routes | key at the act | key focus at ⌘V | delivery guard restores |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const g of judged.groups) lines.push(`| ${g.item} | ${spreadText(g.actMs)} | ${spreadText(g.actMsDelivered)} | ${spreadText(g.readAfterPostMs)} | ${spreadText(g.activationToCommandVMs)} | ${spreadText(g.clickToCommandVMs)} | ${listed(g.clickKinds)} | ${listed(g.routes)} | ${listed(g.keyAtAct)} | ${listed(g.keyFocus)} | ${g.deliveryRestores} |`);
  for (const g of judged.groups) {
    const perLine = g.rows.map(r => [r.key, perLineProblem(r)]).filter(([, p]) => p);
    const notes = [
      ...(Object.keys(g.stages).length ? [`undelivered by paste stage: ${listed(g.stages)}`] : []),
      ...Object.entries(g.invalid).map(([why, n]) => `invalid × ${n}: ${why}`),
      ...(g.group === 'chrome-composing' && perLine.length ? [`lines not each confirmed by their own change: ${perLine.map(([k, p]) => `${k} (${p})`).join('; ')}`] : []),
      ...(Object.keys(g.fixture).length ? [`the Electron fixture's counters over the acts (sum): ${listed(g.fixture)}`] : []),
      ...(g.sources.length ? [`input source readings after each refocus: ${g.sources.map(s => (s ? `${s.id} / ${s.layout}${s.perContextInput != null ? `, per-context ${s.perContextInput}` : ''}` : 'unread')).join('; ')}`] : []),
      ...(g.readers ? [`processes that could read the clipboard: ${g.readers.length ? g.readers.join(', ') : 'none matched'}`] : []),
      ...(g.restores?.length ? [`the kit put the window order back after ${g.restores.length} row(s): ${g.restores.map(r => `${r.key} (raised at ${r.raisedAt.join(', ') || 'before the row'}${r.ok ? '' : ', NOT restored'})`).join('; ')}`] : []),
      ...(g.watcher ? [`order watcher: ${g.watcher.raises ?? '?'} raise(s) over the item (${g.watcher.setupRaises ?? '?'} in the kit's own setup), longest gap ${g.watcher.maxGapMs ?? '?'} ms`] : []),
      ...(g.stopped ? [`stopped: ${g.stopped}`] : []),
    ];
    if (notes.length) lines.push('', `## ${g.item} (${groupName(g.group)}${g.role === 'recorded' ? ', recorded only' : ''})`, '', ...notes.map(n => `- ${n}`));
  }
  if (judged.vendorKorean) lines.push('', `The vendor's chrome/korean lane (recorded only, Chrome frontmost): ${judged.vendorKorean.delivered} of ${judged.vendorKorean.n} paste rows delivered.`);
  if (judged.vendor) lines.push('', `The vendor's lane (recorded only): ${judged.vendor.delivered} of ${judged.vendor.n} paste rows delivered.`);
  lines.push('', ...markdown259(judged.item259), ...markdown188(judged.item188));
  return `${lines.join('\n')}\n`;
}

// ---- the live tasks --------------------------------------------------------------------------------------------------

// The processes whose names say they could read the clipboard (clipboard managers, paste workers), recorded per item
// (ruling 8): names only.
export const CLIPBOARD_READER = /clip|paste|board|copy|maccy|flycut|alfred|raycast|launchbar|keyboard.?maestro/i;
export const clipboardReaders = names => [...new Set(names.map(n => basename(String(n).trim())).filter(n => n && CLIPBOARD_READER.test(n)))].sort();

// The tasks the steps above name, for ./runner.mjs liveIo, over `d` (liveDeps187's shape; the tests' fakes).
export function item187Tasks(d) {
  const st = ctx => (ctx.r187 ??= {rows: {}, compose: {}, keys: {}, order: null, activations: null, itemActivations: [], menu: null, stops: new Map(), windows: []});
  const runWindow = id => { const r = d.scene(id); return {id, pid: r.pid, number: r.window.number, bounds: runWindowBounds(d.windows(r.pid), r.window.number)}; };
  const attempt = fn => { try { return fn(); } catch { return null; } };
  const boundsArg = b => [b.x, b.y, b.width, b.height].join(',');
  // The scene's key-window state (ax-state.swift window, on its run window where it is now), value-free.
  const keyWindow = id => { const w = runWindow(id); return w.bounds ? keyWindowOf(attempt(() => d.axWindow([String(w.pid), boundsArg(w.bounds)]))) : null; };
  // The scenes' processes now, for what of the person a reading saw (personTouchedOf).
  const scenePids = () => SCENES.map(id => attempt(() => d.scene(id).pid)).filter(Number.isSafeInteger);
  // Chrome's run window at the screen's left and TextEdit's over its right half (raise.mjs placementPlan with the roles
  // swapped), moved through Accessibility; then the bounds read again after a settle until both are within 2 pt or
  // PLACE_READ_BOUND_MS pass, and a window still away from its place (mid-move under load, as in the slot) moved again
  // from where it is now, PLACE_ATTEMPTS times at most, before the placement refuses.
  const place = async () => {
    const back = runWindow('chrome'), front = runWindow('textedit');
    const gone = [back, front].find(w => !w.bounds);
    if (gone) return {ok: false, problem: `the ${gone.id} scene's run window is not on screen`};
    const plan = placementPlan({back: back.bounds, front: front.bounds}), targets = [['chrome', plan.back], ['textedit', plan.front]], moves = [];
    const away = (b, to) => !b || Math.abs(b.x - to.x) > 2 || Math.abs(b.y - to.y) > 2;
    let now = [], off = [], attempts = 0;
    while (attempts < PLACE_ATTEMPTS) {
      attempts++;
      for (const [id, to] of targets) {
        const w = runWindow(id);
        if (!w.bounds) continue;
        if (!away(w.bounds, to)) { if (attempts === 1) moves.push({id, moved: 'already there'}); continue; }
        const dx = to.x - w.bounds.x, dy = to.y - w.bounds.y, answer = d.moveWindow([String(w.pid), boundsArg(w.bounds), String(dx), String(dy)]);
        moves.push({id, attempt: attempts, dx, dy, answer});
        if (answer?.trusted === false) return {ok: false, moves, problem: 'the terminal running the kit is not trusted for Accessibility, so it cannot move the harness windows'};
      }
      for (const t0 = d.now(); ;) {
        await d.sleep(PLACE_SETTLE_MS);
        now = targets.map(([id, to]) => ({id, to, bounds: runWindow(id).bounds}));
        off = now.filter(w => away(w.bounds, w.to));
        if (!off.length || d.now() - t0 >= PLACE_READ_BOUND_MS) break;
      }
      if (!off.length) break;
    }
    return {ok: off.length === 0, plan, moves, attempts, bounds: now,
      ...(off.length ? {problem: `${off.map(w => `${w.id} at ${w.bounds ? `(${w.bounds.x}, ${w.bounds.y})` : 'no bounds'} against (${w.to.x}, ${w.to.y})`).join(', ')}: not in place after ${attempts} attempt(s)`} : {})};
  };
  return {
    // The slot's preconditions: the owner's yes to the source switch, every scene up and Chrome on the counters page;
    // the engine's status recorded.
    '187-preflight': async () => {
      const problems = [], consent = d.consent(), state = d.state();
      if (consent?.consent !== true) problems.push('the owner\'s yes to the input-source switch is not recorded (cursor-sitting.mjs source consent yes --out <out>)');
      for (const id of SCENES) if (!state.scenes?.[id]) problems.push(`the ${id} scene is not up`);
      if (state.scenes?.chrome && state.scenes.chrome.page?.variant !== 'counters') problems.push('Chrome is not on the counters page (down chrome, then up chrome --page counters)');
      const status = attempt(d.engineStatus);
      return {ok: problems.length === 0, consent: consent ? {consent: consent.consent, owner: consent.owner?.id ?? null} : null, chromePage: state.scenes?.chrome?.page?.variant ?? null,
        engine: {build: status?.build ?? null, approved: status?.approved ?? null}, ...(problems.length ? {problem: problems.join('; ')} : {})};
    },
    // The before part's put-back: the engine installed now against the save's record (its build, approved), the cell's
    // scenes up, the owner's yes recorded. Recorded, never refusing: the BEFORE half runs on whatever is installed.
    '187-putback': async ([saved]) => {
      const record = attempt(() => d.savedRecord(saved)), status = attempt(d.engineStatus), state = d.state(), consent = d.consent();
      const savedBuild = record?.status?.build ?? null, current = {build: status?.build ?? null, approved: status?.approved ?? null};
      const problems = [];
      if (!savedBuild) problems.push(`the save's record (${saved}/saved.json) names no build`);
      else if (current.build !== savedBuild) problems.push(`the installed build is ${current.build ?? 'unread'}, not the saved ${savedBuild}`);
      if (current.approved !== true) problems.push('the installed engine is not approved');
      const scenes = ['chrome', 'textedit'].filter(id => !state.scenes?.[id]);
      return {ok: problems.length === 0, saved: savedBuild, current, scenesUp: scenes.length === 0, consent: consent?.consent === true,
        ...(problems.length || scenes.length ? {problem: [...problems, ...scenes.map(id => `the ${id} scene is not up`)].join('; ')} : {})};
    },
    // The premise part's engine: whatever is installed, its build recorded.
    '187-premise-engine': async () => { const status = attempt(d.engineStatus); return {ok: Boolean(status?.build), build: status?.build ?? null, approved: status?.approved ?? null}; },
    // The AXPress route's gate: the premise part's samples (its last attempt in the out directory), every one of which
    // must have seen AXPress within AXPRESS_BOUND_MS. A closed gate stops the repetition before anything runs.
    '187-press-gate': async () => {
      const samples = lastAttempt(attempt(d.premiseRows) ?? []).filter(r => r.kind === 'task' && r.task === '187-axpress').map(r => r.result), open = premiseOpens(samples);
      return {ok: open, samples: samples.map(s => s?.appearedMs ?? null),
        ...(open ? {} : {problem: samples.length ? premiseText(samples) : 'the premise part has not run (--part premise, in the preflight)'})};
    },
    // How long after the session's first observation of a freshly relaunched Chrome (the open step's bind, right before
    // this) its textarea advertises AXPress, read outside the engine (ax-state.swift actions: names only), every
    // AXPRESS_POLL_MS up to AXPRESS_BOUND_MS (`gate`, a repetition's) or PREMISE_MEASURE_MS (`measure`, the premise part's).
    // Kept for the steps' `when` under LABELS.axpress(tag). `advertised`: within AXPRESS_BOUND_MS.
    '187-axpress': async ([tag, scene, mode = 'gate'], ctx) => {
      const bound = mode === 'measure' ? PREMISE_MEASURE_MS : AXPRESS_BOUND_MS, t0 = d.now();
      const read = () => { const w = attempt(() => runWindow(scene)); return w?.bounds ? attempt(() => d.axActions([String(w.pid), boundsArg(w.bounds), 'AXTextArea'])) : null; };
      const has = r => Array.isArray(r?.actions) && r.actions.includes('AXPress');
      let reading = read(), polls = 1;
      while (!has(reading) && d.now() - t0 < bound) { await d.sleep(AXPRESS_POLL_MS); reading = read(); polls++; }
      const appearedMs = has(reading) ? d.now() - t0 : null, advertised = appearedMs !== null && appearedMs <= AXPRESS_BOUND_MS;
      const result = {ok: mode === 'measure' ? reading?.trusted === true : advertised, tag, mode, advertised, appearedMs, boundMs: bound, polls,
        actions: Array.isArray(reading?.actions) ? reading.actions : null, textareas: reading?.count ?? null, trusted: reading?.trusted ?? null, readOk: reading?.ok ?? null};
      ctx.results[LABELS.axpress(tag)] = result;
      return result;
    },
    // A replacement's link to the attempt it replaces (plan187's repEntry), for the judge.
    '187-replaces': async ([parent, attempt]) => ({ok: true, parent, attempt: Number.isFinite(Number(attempt)) && attempt !== 'null' ? Number(attempt) : null}),
    '187-down': async ([scene]) => { const down = d.scenes(['down', scene]); return {ok: down?.down === true, scene, ...(down?.down === true ? {} : {problem: down?.reason ?? down?.error ?? 'no answer'})}; },
    '187-place': async () => place(),
    // The cell's Chrome relaunched by the scenes tool (its harness Chrome: down, then up on the counters page), so no
    // activation's state is left over: a new process, on the counters page; then, before any session may bind it, its
    // run window its one on-screen document window and so its front one, on RELAUNCH_STABLE_POLLS polls in a row within
    // RELAUNCH_WINDOW_BOUND_MS (in the slot's rep 1 another window of the new Chrome was in front, and the session's open
    // was refused).
    '187-relaunch': async ([item, scene]) => {
      let before = null;
      try { before = d.scene(scene); } catch {}
      const down = d.scenes(['down', scene]);
      if (down?.down !== true) return {ok: false, item, before: before?.pid ?? null, problem: `the ${scene} scene did not come down (${down?.reason ?? down?.error ?? 'no answer'})`};
      const up = d.scenes(['up', scene, '--page', 'counters']);
      const fresh = Boolean(up?.pid && up?.window?.number && up.pid !== before?.pid), counters = d.state().scenes?.[scene]?.page?.variant === 'counters';
      const base = {item, before: before?.pid ?? null, pid: up?.pid ?? null, window: up?.window?.number ?? null};
      if (!fresh || !counters) return {ok: false, ...base, problem: !fresh ? `the ${scene} scene did not come up as a new process (${up?.error ?? 'no record'})` : `the ${scene} scene is not on the counters page`};
      const t0 = d.now();
      let stable = 0, polls = 0, windows = [];
      while (stable < RELAUNCH_STABLE_POLLS && (polls === 0 || d.now() - t0 < RELAUNCH_WINDOW_BOUND_MS)) {
        if (polls) await d.sleep(RELAUNCH_POLL_MS);
        windows = documentWindows(attempt(() => d.windows(up.pid)) ?? []).filter(w => w.onScreen !== false).map(w => w.number);
        polls++;
        stable = windows.length === 1 && windows[0] === up.window.number ? stable + 1 : 0;
      }
      const settled = stable >= RELAUNCH_STABLE_POLLS;
      return {ok: settled, ...base, windowMs: d.now() - t0, polls, windows,
        ...(settled ? {} : {problem: `the ${scene} scene's run window ${up.window.number} was not its one on-screen window, in front, on ${RELAUNCH_STABLE_POLLS} polls in a row within ${RELAUNCH_WINDOW_BOUND_MS} ms (its windows: ${windows.join(', ') || 'none'})`})};
    },
    // The person's activation: `open -a` on the harness app's own bundle path, then the scene's process frontmost
    // within FRONT_BOUND_MS (another process frontmost, a second instance say, stops the repetition).
    '187-open': async ([tag, scene]) => {
      const record = d.scene(scene), t0 = d.now();
      const opened = attempt(() => { d.openApp(record.app); return true; }) === true;
      let front = d.frontmost()?.pid ?? null;
      while (opened && front !== record.pid && d.now() - t0 < FRONT_BOUND_MS) { await d.sleep(50); front = d.frontmost()?.pid ?? null; }
      const ok = opened && front === record.pid;
      return {ok, tag, scene, frontmost: front, ms: d.now() - t0, ...(ok ? {} : {problem: opened ? `the ${scene} scene's process (${record.pid}) was not frontmost ${FRONT_BOUND_MS} ms after open -a (process ${front ?? 'none'} was)` : 'open -a failed'})};
    },
    // The key-window state of `scene`, kept for the cell: before the activation one reading; after it, read again until
    // it holds the key (on Chrome with the page focused, by a beacon after the activation) or KEY_SETTLE_MS pass.
    '187-key': async ([tag, scene, when], ctx) => {
      const chrome = scene === 'chrome', t0 = d.now(), seq0 = chrome ? attempt(d.pageCounters)?.seq ?? null : null;
      const read = () => { const reading = keyWindow(scene), page = chrome ? attempt(d.pageCounters) : null; return {reading, page, pageFocused: chrome ? (typeof page?.focused === 'boolean' ? page.focused : null) : undefined}; };
      let now = read();
      if (when === 'after') while (keyHeld(now.reading, now.pageFocused) !== true && d.now() - t0 < KEY_SETTLE_MS) { await d.sleep(KEY_POLL_MS); now = read(); }
      const kept = {reading: now.reading, ...(chrome ? {pageFocused: now.pageFocused, pageSeq: now.page?.seq ?? null, beaconSince: seq0 !== null && (now.page?.seq ?? -1) > seq0} : {}),
        held: keyHeld(now.reading, now.pageFocused), settledMs: when === 'after' ? d.now() - t0 : null};
      ((st(ctx).keys[tag] ??= {})[when] = kept);
      return {ok: kept.reading?.ok === true, tag, scene, when, ...kept};
    },
    // The kit's own setup of a block (Korean engaged, the composition), marked so a raise inside it is told apart from a
    // row's: the final record's reconciliation explains it as setup.
    '187-setup': async ([tag, edge], ctx) => {
      const s = st(ctx), at = d.now();
      if (edge === 'start') s.windows.push({kind: 'setup', tag, from: at, to: Infinity});
      else { const w = s.windows.findLast(x => x.kind === 'setup' && x.tag === tag); if (w) w.to = at; }
      return {ok: true, tag, edge, at};
    },
    // After a background row: Chrome's window raised during the row, or still above the user's, is put back before the
    // next row: the kit's placement, the user window's app activated, the order read again; failing that, once more
    // through the release scene (activated, then the user's). Harness windows only. Nothing to do: {restored: false}. A
    // scene that cannot be put back stops the item (the step is required). The watcher is read again here, after the
    // row's last reading: a raise it shows only now (written late, or caused during the row's readings) is the row's too
    // (`lateRaisedAt`, which the judge adds to the row), and the row's span for the final record's reconciliation ends here.
    '187-order-restore': async ([key, group], ctx) => {
      const s = st(ctx), g = GROUPS[group], row = s.rows[key];
      if (!s.order || !row) return {ok: true, key, restored: false};
      const from = row.mid?.at ?? row.start, run = d.order.attempt(s.order);
      const seen = raisesIn(run).filter(c => c.at >= from).map(c => c.at), stateBefore = stateAt(run, Infinity);
      row.closedAt = d.now();
      const lateRaisedAt = seen.filter(at => !(row.raised?.raisedAt ?? []).includes(at));
      if (seen.length === 0 && stateBefore !== 'back-above') return {ok: true, key, restored: false};
      const window = {kind: 'restore', tag: key, from: d.now(), to: Infinity};
      s.windows.push(window);
      const stateNow = async () => { await d.sleep(ORDER_SETTLE_MS); return stateAt(d.order.attempt(s.order), Infinity); };
      const placed = await place(), how = ['placement', `activate ${g.user}`];
      await d.activate(g.user);
      let state = await stateNow();
      if (state !== 'front-above' && releaseOf(group)) {
        how.push(`activate ${releaseOf(group)}`, `activate ${g.user}`);
        await d.activate(releaseOf(group));
        await d.activate(g.user);
        state = await stateNow();
      }
      const ok = state === 'front-above';
      window.to = d.now();
      return {ok, key, restored: true, raisedAt: seen, lateRaisedAt, stateBefore, state, how, placed: placed.ok,
        ...(ok ? {} : {problem: `the ${g.user} window could not be put back above the ${g.driven} window (${state})`})};
    },
    '187-processes': async ([item]) => { const names = attempt(d.processNames); return {ok: names !== null, item, total: names?.length ?? null, readers: names ? clipboardReaders(names) : null}; },
    // The user's process frontmost and its run window above the driven one.
    '187-arrange': async ([group]) => {
      const g = GROUPS[group], front = runWindow(g.user), back = runWindow(g.driven);
      const problem = arrangementProblem({frontmost: d.frontmost(), list: d.windowList(), front, back});
      return {ok: problem === null, front: {id: front.id, number: front.number}, back: {id: back.id, number: back.number}, ...(problem ? {problem} : {})};
    },
    '187-order-start': async ([item, group], ctx) => {
      const g = GROUPS[group], watch = await d.order.start({file: join(d.out, `item-${item}-order.jsonl`), front: d.scene(g.user).window.number, back: d.scene(g.driven).window.number});
      const s = st(ctx);
      s.order = watch;
      s.stops.set('order', () => d.order.stop(watch));
      return {ok: watch.start.state === 'front-above', pid: watch.pid, state: watch.start.state, ...(watch.start.state === 'front-above' ? {} : {problem: `the watcher's first reading is ${watch.start.state}`})};
    },
    '187-order-stop': async ([item], ctx) => {
      const s = st(ctx), watch = s.order;
      if (!watch) return {ok: false, item, problem: 'no watcher is running'};
      s.order = null;
      s.stops.delete('order');
      const run = await d.order.stop(watch), raises = raisesIn(run);
      const {rowRaises, tailRaises, setupRaises, unattributed} = reconcileRaises(raises.map(c => c.at), s.rows, s.windows);
      return {ok: Boolean(run?.end), item, raises: raises.length, rowRaises, tailRaises, setupRaises, unattributed,
        reads: run?.end?.samples ?? null, maxGapMs: run?.end?.maxGapMs ?? null, lateSamples: run?.end?.lateSamples ?? null};
    },
    // The bundle's activation watcher over an item, its lines written to item-<item>-activations.ndjson when it stops,
    // and also when the item stops first (the runner's finally, stop187), so the drive can tell a person's touch on an
    // item that never recorded it (touchedOfItem). The file starts empty, so an earlier attempt's lines never count.
    '187-activations-start': async ([item], ctx) => {
      const s = st(ctx), watch = d.activations.start(), file = `item-${item}-activations.ndjson`;
      const save = lines => d.write(file, lines.map(l => JSON.stringify(l)).join('\n') + (lines.length ? '\n' : ''));
      save([]);
      s.activations = watch;
      s.stops.set('activations', () => save(d.activations.stop(watch)));
      return {ok: true, item};
    },
    '187-activations-stop': async ([item], ctx) => {
      const s = st(ctx), watch = s.activations;
      if (!watch) return {ok: false, item, problem: 'no activation watcher is running'};
      s.activations = null;
      s.stops.delete('activations');
      const lines = d.activations.stop(watch);
      s.itemActivations = lines;
      d.write(`item-${item}-activations.ndjson`, lines.map(l => JSON.stringify(l)).join('\n') + (lines.length ? '\n' : ''));
      return {ok: true, item, lines: lines.length, activated: lines.filter(l => l.kind === 'activated').length};
    },
    // Chrome's menus watched for an AXMenuOpened notification over a block (menu-open.swift watch).
    '187-menu-start': async ([item], ctx) => {
      const s = st(ctx), handle = await d.menu.start({file: join(d.out, `item-${item}-menu.ndjson`), pid: d.scene('chrome').pid});
      s.menu = handle;
      s.stops.set('menu', () => d.menu.stop(handle));
      return {ok: true, item};
    },
    '187-menu-stop': async ([item], ctx) => {
      const s = st(ctx), handle = s.menu;
      if (!handle) return {ok: false, item, problem: 'no menu watcher is running'};
      s.menu = null;
      s.stops.delete('menu');
      const run = await d.menu.stop(handle);
      return {ok: Boolean(run?.end), item, opened: run?.opened ?? null, registered: handle.registered === true};
    },
    '187-ready': async ([label], ctx) => { const v = ctx.results[label]?.value; return {ok: v?.ready === true, label, ...(v?.ready === true ? {} : {problem: v?.reason ?? 'no answer'})}; },
    // The source after the refocus (koreanIn): 2-Set as the source and 2SetHangul as its layout, read by the bundle.
    '187-korean': async ([tag, scene]) => {
      const answer = attempt(() => d.probe(['input-source', 'current']));
      const reading = answer && {id: answer.id ?? null, name: answer.name ?? null, layout: answer.layout ?? null, keyboardLayout: answer.keyboardLayout ?? null, perContextInput: answer.perContextInput ?? null};
      const ok = reading?.id === KOREAN_2SET && reading.layout === HANGUL_LAYOUT;
      return {ok, tag, scene, reading, ...(ok ? {} : {problem: `the Korean source did not engage in ${scene} after its refocus: the source read ${reading?.id ?? 'nothing'}, the layout ${reading?.layout ?? 'nothing'}`})};
    },
    // The composition: the user's field read empty and focused, the probe's ANSI r posted into it, read back as ㄱ.
    '187-compose': async ([tag, user], ctx) => {
      const w = runWindow(user);
      if (!w.bounds) return {ok: false, tag, problem: `the ${user} scene's run window is not on screen`};
      const window = [w.pid, boundsArg(w.bounds)].join(','), jamo = sha256Hex(COMPOSITION.composed);
      const field = () => attempt(() => d.probe(['focus', '--window', window]));
      const empty = field();
      if (empty?.named !== true || empty.valueHash !== EMPTY_HASH) return {ok: false, tag, problem: 'the focus probe did not read the user window\'s field focused and empty'};
      // The key is scheduled COMPOSE_LEAD_MS after the probe's launch, as the native matrix's composing rows post it: an
      // unscheduled post right at the probe's launch was lost live (the field read empty after it, 2 of 4 setups).
      const post = lead => attempt(() => d.probe(['keystroke', '--ansi-keys', '--at', String(d.now() + lead), '--user-pid', String(w.pid), '--user-bounds', boundsArg(w.bounds), COMPOSITION.key]));
      let composed = false, reads = 0, last = null, posts = 0, waited = false;
      const settle = async () => {
        for (let r = 0; r < SETTLE_READS && !composed; r++, reads++) {
          if (r) await d.sleep(SETTLE_READ_MS);
          last = field();
          composed = last?.valueHash === jamo;
        }
      };
      const send = lead => { const posted = post(lead); posts++; return probeStatus(posted) === 0 ? null : `the probe's key was not posted (status ${probeStatus(posted)})`; };
      let problem = send(COMPOSE_LEAD_MS);
      if (problem) return {ok: false, tag, posts, problem};
      await settle();
      // A field still empty may hold a delayed key, not a lost one: the lead waited out and the field read once more, and
      // only a field still empty then gets the key again, on a short lead; any other reading is never typed over.
      if (!composed && last?.valueHash === EMPTY_HASH && posts < COMPOSE_POSTS) {
        waited = true;
        await d.sleep(COMPOSE_LEAD_MS);
        last = field();
        reads++;
        composed = last?.valueHash === jamo;
        if (!composed && last?.valueHash === EMPTY_HASH) {
          problem = send(COMPOSE_REPOST_LEAD_MS);
          if (problem) return {ok: false, tag, posts, reads, waited, problem};
          await settle();
        }
      }
      if (composed) st(ctx).compose[tag] = {window, jamo};
      // What the field read instead, by class only: empty (the key was lost), the Latin key, or something else.
      const read = composed ? 'jamo' : last?.valueHash === EMPTY_HASH ? 'empty' : last?.valueHash === sha256Hex(COMPOSITION.key) ? 'latin' : last?.named === true ? 'other' : 'unread';
      return {ok: composed, tag, reads, posts, waited, read, ...(composed ? {} : {problem: `the user window's field did not read the composed jamo after the probe's key (it read ${read})`})};
    },
    '187-before': async ([key], ctx) => { st(ctx).rows[key] = {start: d.now()}; return {ok: true, key}; },
    // The readings right before the act; the act's span starts after them.
    '187-mid': async ([key, group], ctx) => {
      const g = GROUPS[group], row = (st(ctx).rows[key] ??= {});
      const mid = {front: d.frontmost()?.pid ?? null, clipboard: attempt(d.clipboard), page: g.driven === 'chrome' ? attempt(d.pageCounters) : null,
        fixture: involvesElectron(g) ? attempt(d.fixtureCounters) : null, keyWindow: keyWindow(g.driven)};
      row.mid = {...mid, at: d.now()};
      return {ok: true, key, front: mid.front, pageSeq: mid.page?.seq ?? null, keyWindow: mid.keyWindow, pageFocused: mid.page?.focused ?? null};
    },
    // The row's record (rowRecord), from the cells' answers and the readings after the act.
    // Every reading after the act comes first; the observation interval, for activations and raises, ends after them.
    '187-row': async ([key, group, engine, block, i, method, stringId], ctx) => {
      const g = GROUPS[group], s = st(ctx), row = (s.rows[key] ??= {}), tag = key.slice(0, key.lastIndexOf('.')), item = tag.slice(0, tag.lastIndexOf('#'));
      const r = [...ROWS, CELL_ROW].find(x => x.method === method && x.string.id === stringId);
      // A clickless row whose prepare found the background paste's string expects it before its own (CELL_PREPARE).
      const prior = priorText(ctx.results, prepareLabel(group, key), CELL_ROW.string.text);
      const spec = {key, item, group, block: Number(block), i: Number(i), string: stringId, method, expectedLength: prior.length + r.string.text.length, lines: r.string.text.split('\n').length,
        regime: g.regime, engine, ...(prior ? {prior: 'background'} : {})};
      const act = ctx.results[LABELS.act(key, method, stringId)] ?? null, from = row.mid?.at ?? null;
      let page = null;
      if (g.driven === 'chrome' && row.mid) {
        const fresh = p => p && (!row.mid.page || p.seq > row.mid.page.seq) && p.length === spec.expectedLength;
        let after = attempt(d.pageCounters);
        for (const t0 = d.now(); !fresh(after) && d.now() - t0 < PAGE_SETTLE_MS;) { await d.sleep(PAGE_POLL_MS); after = attempt(d.pageCounters); }
        page = {mid: row.mid.page, after};
      }
      const compose = s.compose[tag];
      const userKept = g.user && compose && act ? (f => f?.named === true && f.valueHash === compose.jamo)(attempt(() => d.probe(['focus', '--window', compose.window]))) : null;
      const menuRead = g.driven === 'chrome' && row.mid ? attempt(() => d.menu.read(d.scene('chrome').pid)) : null;
      const fixture = involvesElectron(g) && row.mid ? {mid: row.mid.fixture, after: attempt(d.fixtureCounters)} : null;
      const clipboard = row.mid ? {mid: row.mid.clipboard, after: attempt(d.clipboard)} : null;
      const front = row.mid ? {mid: row.mid.front, after: d.frontmost()?.pid ?? null, expected: d.scene(g.user ?? g.driven).pid} : null;
      const end = d.now();
      row.end = end;
      const inSpan = l => from !== null && l.at >= from && l.at <= end;
      const activations = s.activations ? (attempt(() => d.activations.lines(s.activations)) ?? []).filter(l => l.kind === 'activated' && inSpan(l)) : [];
      // A raise is the row's from its act's start to this reading, so one the act causes late is still its own; the
      // restore after the row reads the watcher again.
      let raisedAt = [], stateAtStart = null;
      if (s.order && from !== null) {
        const run = d.order.attempt(s.order);
        raisedAt = raisesIn(run).filter(c => c.at >= from).map(c => c.at);
        stateAtStart = stateAt(run, from);
        row.raised = {raisedAt, stateNow: stateAt(run, Infinity)};
      }
      // The notification watch counts only while it stayed alive and its log read whole through the row: registered at
      // its start, no end record, its process running, the log readable now. A log that cannot be read is unread
      // (`observed` null), never zero events.
      const log = s.menu ? attempt(() => d.menu.lines(s.menu)) : null;
      const watchVerified = Boolean(s.menu?.registered === true && log && !log.some(l => l.kind === 'end') && attempt(() => d.menu.alive(s.menu)) === true);
      const menu = g.driven === 'chrome' && row.mid ? {read: menuRead, watchVerified, observed: log ? log.filter(l => l.kind === 'menu-opened' && inSpan(l)).length : null} : null;
      const personTouched = row.mid ? personTouchedOf({activations, fronts: [front.mid, front.after], scenePids: scenePids()}) : null;
      const record = rowRecord({spec, prepare: ctx.results[prepareLabel(group, key)] ?? null, act, check: ctx.results[LABELS.check(key)] ?? null, page, fixture, front,
        activations, raisedAt, stateAtStart, userKept, clipboard, menu, keyWindow: row.mid?.keyWindow ?? null, disturbed: Boolean(ctx.results[disturbedOf(tag)]), personTouched});
      if (record.userKept === false) ctx.results[disturbedOf(tag)] = true;
      row.record = record;
      return record;
    },
    // One repetition's record on its route: the key before and after the person's activation; on the background paste
    // its two paste rows' records (the background one's activation click is the premise); on the AXPress route the
    // textarea's AXPress reading, the click (its plan and its activation's click, from the cell's meta), the field after
    // it and the frontmost paste's record; and what of the person the repetition saw (its activation watcher's lines over
    // the whole repetition, and the front app now).
    '187-cell': async ([tag, half, rep, route = 'press'], ctx) => {
      const s = st(ctx), item = tag.slice(0, tag.lastIndexOf('#')), rowOf = block => s.rows[keyOf(item, block, 0)]?.record ?? null;
      const personTouched = personTouchedOf({activations: s.itemActivations ?? [], fronts: [d.frontmost()?.pid ?? null], scenePids: scenePids()});
      const common = {tag, half, rep: Number(rep), route, keyBefore: s.keys[tag]?.before ?? null, keyAfter: s.keys[tag]?.after ?? null, personTouched};
      let record;
      if (route === 'paste') record = {...common, background: rowOf(0), row: rowOf(1)};
      else {
        const press = ctx.results[LABELS.press(tag)] ?? null, read = ctx.results[LABELS.pressRead(tag)] ?? null, ec = press?.meta?.elementClick ?? null, ax = ctx.results[LABELS.axpress(tag)] ?? null;
        record = {...common, premise: ax && {advertised: ax.advertised, appearedMs: ax.appearedMs, actions: ax.actions, textareas: ax.textareas},
          press: press && {ok: press.ok === true, pressed: press.value?.pressed ?? null, notPressed: press.value?.reason ?? null, threw: press.value?.threw ?? null, errorName: press.value?.errorName ?? null,
            route: press.route ?? null, plan: ec?.plan ?? null, action: ec?.action ?? null, reason: ec?.reason ?? null, hit: ec?.hit ?? null,
            kind: press.meta?.activationClickKind ?? null, activationClick: press.meta?.activationClick ?? null, activationGuardMs: press.meta?.activationGuardMs ?? null},
          pressRead: read?.ok ? {inFront: read.value?.inFront ?? null, found: read.value?.found ?? null, focused: read.value?.focused ?? null, empty: read.value?.empty ?? null} : null,
          row: rowOf(0)};
      }
      const verdict = cellVerdict(record);
      return {ok: verdict.counted && (half === 'after' ? verdict.pass : verdict.predicted), ...record, verdict};
    },
  };
}

// What the runner's finally calls: every watcher an item started and did not stop.
export async function stop187(ctx) {
  const stops = ctx.r187?.stops;
  if (!stops) return;
  for (const [name, stop] of [...stops]) { stops.delete(name); try { await stop(); } catch {} }
}

// ---- the live deps ---------------------------------------------------------------------------------------------------

export const MENU_SCRIPT = fileURLToPath(new URL('./menu-open.swift', import.meta.url));
export const menuTool = ({cache = PROBE_CACHE} = {}) => compiled(MENU_SCRIPT, cache);
export const AX_STATE_SCRIPT = fileURLToPath(new URL('./ax-state.swift', import.meta.url));
export const axStateTool = ({cache = PROBE_CACHE} = {}) => compiled(AX_STATE_SCRIPT, cache);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fileLines = file => (existsSync(file) ? orderLines(readFileSync(file, 'utf8')) : []);
// A resident watcher's run in its file (appended to by every attempt): the lines after the start line its pid wrote.
const runOf = (file, pid) => { const lines = fileLines(file), k = lines.findIndex(l => l.kind === 'start' && l.pid === pid); return k < 0 ? [] : lines.slice(k + 1); };
const lastJson = text => JSON.parse(text.trim().split('\n').at(-1));

// The menu watcher started on Chrome's process, appending to `file`, once its start line is there.
async function startMenuWatch({file, pid, bin = menuTool(), boundMs = 10_000}) {
  const fd = openSync(file, 'a', 0o600);
  let child;
  try { child = spawn(bin, ['watch', String(pid)], {stdio: ['ignore', fd, 'ignore']}); } finally { closeSync(fd); }
  for (const t0 = Date.now(); Date.now() - t0 < boundMs; await sleep(50)) {
    const begun = fileLines(file).find(l => l.kind === 'start' && l.pid === child.pid);
    if (begun) return {child, pid: child.pid, file, registered: begun.registered === true};
    if (child.exitCode !== null) break;
  }
  child.kill('SIGKILL');
  throw new Error(`the menu watcher did not start within ${boundMs} ms (is the terminal trusted for Accessibility?)`);
}
async function stopMenuWatch(handle) {
  if (handle.child.exitCode === null && handle.child.signalCode === null) {
    const exited = new Promise(resolve => handle.child.once('exit', resolve));
    handle.child.kill('SIGTERM');
    if (await Promise.race([exited.then(() => true), sleep(2000).then(() => false)]) === false) { handle.child.kill('SIGKILL'); await exited; }
  }
  const lines = runOf(handle.file, handle.pid);
  return {opened: lines.filter(l => l.kind === 'menu-opened').length, end: lines.find(l => l.kind === 'end') ?? null};
}

// The Mac's deps for item187Tasks. `io`: the runner's (scene); `guard`: the target guard's readings; `cli(args)`: this
// checkout's CLI answering JSON; `probe(args)`: the approved bundle's probe; `bundle`: its path; `scenes(args)`: the
// scenes CLI on the run (its last JSON line).
export function liveDeps187({io, run, out, guard, cli, probe, bundle, windowList, moveWindow, consent, scenes}) {
  return {
    out, scene: io.scene, state: () => readState(run), activate: scene => io.tasks.activate([scene]), frontmost: guard.frontmost, windows: guard.windows, windowList, probe, moveWindow, consent, scenes,
    engineStatus: () => cli(['engine', 'status', '--json']),
    savedRecord: dir => JSON.parse(readFileSync(join(dir, 'saved.json'), 'utf8')),
    openApp: app => execFileSync('/usr/bin/open', ['-a', app], {stdio: 'ignore', timeout: 15_000}),
    axWindow: args => lastJson(execFileSync(axStateTool(), ['window', ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000})),
    axText: args => lastJson(execFileSync(axStateTool(), ['text', ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000})),
    axActions: args => lastJson(execFileSync(axStateTool(), ['actions', ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000})),
    // The premise part's record in the out directory (the AXPress route's gate).
    premiseRows: () => fileLines(join(out, `item-${ITEMS.premise}.jsonl`)),
    clipboard: () => clipboardDigest(),
    processNames: () => execFileSync('/bin/ps', ['-axo', 'comm='], {encoding: 'utf8', timeout: 15_000}).split('\n').filter(Boolean),
    pageCounters: () => readPageCounters(run),
    fixtureCounters: () => {
      const dir = readState(run).scenes?.electron?.userDataDir;
      return dir ? JSON.parse(readFileSync(join(dir, FIXTURE_COUNTERS_FILE), 'utf8')).counts ?? null : null;
    },
    order: {start: startOrderWatch, stop: stopOrderWatch, attempt: watch => orderAttempt(fileLines(watch.file), watch.pid)},
    activations: {start: () => startWatch(bundle, run), lines: watch => fileLines(join(watch.dir, 'out.json')), stop: watch => stopWatch(watch),
      alive: watch => { try { process.kill(watch.pid, 0); return true; } catch { return false; } }},
    menu: {
      read: pid => lastJson(execFileSync(menuTool(), ['read', String(pid)], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000})),
      start: startMenuWatch, stop: stopMenuWatch, alive: handle => handle.child.exitCode === null && handle.child.signalCode === null,
      lines: handle => { if (!existsSync(handle.file)) throw new Error('the menu watcher\'s log is gone'); return runOf(handle.file, handle.pid); },
    },
    write: (name, text) => writeFileSync(join(out, name), text, {mode: 0o600}),
    now: Date.now, sleep,
  };
}
