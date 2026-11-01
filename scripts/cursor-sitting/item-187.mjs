// #187's attended live slot on the MacBook: does a paste into Chrome for Testing's page, behind a Hangul composition in
// the person's front window, deliver, and does the vendor-style activation before ⌘V (3b: the engine.json switch
// `pasteFocusEnforcement`, slot only) make it deliver without touching anything the person sees? (SSFSKIM/cua#187; the
// ledger's SLOT PLAN RULINGS and 3b RULING; the plan in ~/.local/share/187/slot-plan-draft.md.) Hold 3's rows on the mini
// (scripts/native-matrix/unicode-run.mjs: behindUser, koreanIn, composingRows) ported to the cursor-sitting kit, run from
// the MacBook's console on the harness scenes only:
// - The scene: Chrome for Testing on the counters page (`scenes-mac.mjs up chrome --page counters`: the shared page's
//   DOM plus a script that beacons window and textarea focus/blur, document-level mousedown and click, and the
//   textarea's LENGTH, never its value) at the screen's left, and TextEdit's run window placed over its right half
//   (move-window.swift, harness windows only), so a raise of Chrome would show.
// - Korean engaged as hold 3 did, but through the kit's consent-gated switch (./input-source.mjs): ABC selected with the
//   user window on top (ending any composition left), then 2-Set Korean (`select-source named …2SetKorean`, refused
//   unless the scene's run window is on top of the frontmost app), the user window refocused through another scene, and
//   only a reading after that refocus of source 2-Set AND layout 2SetHangul counts (MAWS B2). The per-context preference
//   is never written. The owner's source comes back with `source restore` and, on a failed item, restoreAfterFailure.
// - The composition: the user window's field emptied, read empty by the bundle's focus probe, the probe's ANSI `r`
//   posted into it (composed as ㄱ), read back as the jamo's hash; every row after it must leave that hash (userKept),
//   and a row that does not makes the rest of its block invalid.
// - Each row: the driven field emptied (prepare); one observation of a third scene, which ends route 3's held
//   activation so the act gets a fresh one; the readings before the act (front app, clipboard type-list digest, page
//   counters, fixture counters); one typeText or paste of a fixed string under the key guard (the user window on top);
//   the field read back by hash in the cell; then the readings after (page beacon, front app, activations, window order,
//   userKept, clipboard digest, Chrome's menus). Only lengths, hashes, counts and the engine's value-free meta are kept.
// - Delivered only when the engine's read-back is exact AND the page's own beacon, sent after the act, reports the
//   expected length. A background row whose act carries no `activationGuardMs` acted under a held activation: invalid,
//   never counted.
// The parts (the ledger's rulings 3, 4 and 6):
//   A    chrome/composing@textedit, 18 rows × 2, each repetition on a fresh composition, the engine as built (no switch);
//        then the controls once: electron/composing@textedit, textedit/composing@electron, chrome/korean (Chrome
//        frontmost). If every A row delivers, the slot ends after the controls (end-early).
//   B    chrome/composing@textedit as ABAB: 4 pairs of 9-row blocks, arm A (switch off) then arm B (switch on), engine.json
//        written and the engine stopped before each block; each arm sees every one of the 18 rows twice; then the three
//        controls once under arm B. The arm must be confirmed by the engine: `cua engine status --json`
//        `.status.pasteFocusEnforcement`, or the paste's own `cua/paste` meta (`focusEnforcement.arm`).
// The paste route has no after-action watch, so a raise of Chrome's window (B's lifted click, say) would stay and spoil
// every later row (userKept and the source gate need TextEdit on top). After every background row the kit reads the
// order watcher: Chrome's window left above the user's (or raised during the row) is put back by the kit's own placement
// and the user window's app brought to the front (harness windows only), before the next row; the row keeps the raise's
// times, so it is a failure under B, and the judge counts the restores.
//   vendor  9 paste rows on the vendor's engine, recorded only, run only once B has failed to deliver.
//   188     before A, under ABC: #188's four repaired Electron rows and its cell 3 (./item-188.mjs), on cua's engine and
//           the vendor's; counted for #188 only, reported in their own sections, never part of this slot's verdict.
//           `--part 188-vendor-click` runs only cell 3 on the vendor's engine, likewise apart.
// Arm B lands only if every B row delivers exactly, with no page mousedown or click, no menu opened, no raise, no front
// app change, the composition kept, every clipboard restore intact, the arm confirmed, and no control regressing under B
// against a complete, valid A baseline (each control whole under both arms: every row valid, its order watcher whole, its
// B rows' arm confirmed; anything less is incomplete). The slot succeeds when B lands, or when the end-early rule ends it
// with Part A's controls complete, and in either case only once 187-end has selected the owner's source again and read
// it back. Every evidence gap (no counter read before the act, a menu snapshot whose reads did not all succeed and no
// verified notification watch) makes the row incomplete, never clean.
// Arm A is diagnostic: which stage of the paste fails (`cua/paste`'s stage, read and effect waits).
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
import {EMPTY_HASH, emptyField, fieldCheck} from '../native-matrix/probe-plan.mjs';
import {COMPOSITION, KOREAN_2SET, UNICODE_STRINGS} from '../native-matrix/unicode-plan.mjs';
import {HANGUL_LAYOUT, REFOCUS_THROUGH, SETTLE_READ_MS, SETTLE_READS} from '../native-matrix/unicode-run.mjs';
import {readPageCounters, readState} from '../repl-parity/scenes-mac.mjs';
import {OBSERVE} from './cells.mjs';
import {runWindowBounds} from './focus.mjs';
import {clickItem188, ENGINES_188, ITEMS_188, judge188, markdown188, rowsItem188} from './item-188.mjs';
import {arrangementProblem, orderAttempt, orderLines, placementPlan, raisesIn, spread, startOrderWatch, stateAt, stopOrderWatch, WATCH_GAP_MS} from './raise.mjs';
import {PROBE_CACHE, SCENE_MARKER} from './target-guard.mjs';

const j = JSON.stringify;
export const S = 's';
export const SWITCH = 'pasteFocusEnforcement';
// The composition key's schedule after the probe's launch (the native matrix's --lead), and its posts at most.
export const COMPOSE_LEAD_MS = 1500, COMPOSE_POSTS = 2;
export const ARMS = Object.freeze(['A', 'B']);
export const METHODS = Object.freeze(['typeText', 'paste']);
// Hold 3's nine strings, each typed and pasted: 18 rows a pass.
export const ROWS = Object.freeze(UNICODE_STRINGS.flatMap(string => METHODS.map(method => Object.freeze({string, method}))));
export const VENDOR_ROWS = Object.freeze(ROWS.filter(r => r.method === 'paste'));
export const A1_REPS = 2, B_PAIRS = 4, B_BLOCK_ROWS = ROWS.length / 2;
export const A1_TARGET = A1_REPS * ROWS.length, B_TARGET = B_PAIRS * B_BLOCK_ROWS;
// How long the row waits, after its read-back, for the page's beacon of the act.
export const PAGE_SETTLE_MS = 1000, PAGE_POLL_MS = 50;
// After the kit puts the order back, how long the watcher is given to see it.
export const ORDER_SETTLE_MS = 200;

// Each row group: the driven field's scene, the user window's (none: the driven scene frontmost), hold 3's condition.
export const GROUPS = Object.freeze({
  'chrome-composing': Object.freeze({driven: 'chrome', user: 'textedit', condition: 'composing', regime: 'background'}),
  'electron-composing': Object.freeze({driven: 'electron', user: 'textedit', condition: 'composing', regime: 'background'}),
  'textedit-composing': Object.freeze({driven: 'textedit', user: 'electron', condition: 'composing', regime: 'background'}),
  'chrome-korean': Object.freeze({driven: 'chrome', user: null, condition: 'korean', regime: 'frontmost'}),
});
export const CONTROLS = Object.freeze(['electron-composing', 'textedit-composing', 'chrome-korean']);
const SCENES = Object.freeze(['chrome', 'textedit', 'electron']);
// The scene observed before each background act: neither the driven nor the user's, so the request ends the driven
// app's held activation without reading the composing window.
export const releaseOf = group => (GROUPS[group].user ? SCENES.find(s => s !== GROUPS[group].driven && s !== GROUPS[group].user) : null);
export const groupName = group => { const g = GROUPS[group]; return `${g.driven}/${g.condition}${g.user ? `@${g.user}` : ''}`; };
export const rowId = (group, method, stringId) => `${groupName(group)}/${method}.${stringId}`;
export const ITEMS = Object.freeze({place: '187-place', a1: '187-A1', b: '187-B', vendor: '187-vendor', vendorKorean: '187-vendor-chrome-korean', end: '187-end', control: (group, arm) => `187-${group}-${arm}`});
const involvesElectron = g => g.driven === 'electron' || g.user === 'electron';

// Part B's blocks: pairs of an arm-A and an arm-B block on the same nine rows, the 18 rows' halves in turn, the later
// pairs in reverse order, so each arm sees every row twice. -> [{block, pair, arm, rows}].
export function bSchedule() {
  const halves = [ROWS.slice(0, B_BLOCK_ROWS), ROWS.slice(B_BLOCK_ROWS)];
  return Array.from({length: B_PAIRS}, (_, pair) => {
    const rows = pair < 2 ? halves[pair % 2] : [...halves[pair % 2]].reverse();
    return ARMS.map((arm, k) => ({block: 2 * pair + k, pair, arm, rows}));
  }).flat();
}

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

// ---- the steps -----------------------------------------------------------------------------------------------------

export const keyOf = (item, block, i) => `${item}#${block}.${i}`;
const tagOf = (item, block) => `${item}#${block}`;
const disturbedOf = tag => `187 disturbed ${tag}`;
export const LABELS = Object.freeze({
  prepare: key => `${key} prepare: the driven field emptied and focused`,
  release: (key, scene) => `${key} release: the ${scene} scene observed, ending a held activation`,
  act: (key, method, stringId) => `${key} act: ${method}.${stringId}`,
  check: key => `${key} check: the driven field read back by hash`,
  setupDriven: tag => `${tag} setup: the driven field emptied and focused`,
  setupUser: tag => `${tag} setup: the user window's field emptied and focused`,
});

function rowSteps({item, group, block, i, arm, row}) {
  const g = GROUPS[group], key = keyOf(item, block, i), tag = tagOf(item, block), release = releaseOf(group);
  const actLabel = LABELS.act(key, row.method, row.string.id);
  const live = results => !results[disturbedOf(tag)];
  const prepared = results => live(results) && results[LABELS.prepare(key)]?.value?.ready === true;
  return [
    {task: '187-before', args: [key]},
    {run: S, cell: PREPARE(g.driven), label: LABELS.prepare(key), when: live},
    ...(release ? [{run: S, cell: OBSERVE(release), label: LABELS.release(key, release), when: prepared}] : []),
    {task: '187-mid', args: [key, group], when: prepared},
    {run: S, cell: ACT(g.driven, row.method, row.string.text), label: actLabel, keys: g.user ?? g.driven, when: prepared},
    {run: S, cell: CHECK(g.driven, row.string.text), label: LABELS.check(key), when: results => Boolean(results[actLabel])},
    {task: '187-row', args: [key, group, arm, String(block), String(i), row.method, row.string.id]},
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

// One block: the switch written and the engine stopped (when the block switches), a session, the arm read back, the
// setup, the rows, and the switch put back with the engine stopped again.
function blockSteps({item, group, block, arm, rows, switchTo = null, engine = 'cua'}) {
  const g = GROUPS[group], tag = tagOf(item, block), chrome = g.driven === 'chrome';
  return [
    {say: `${tag}: ${groupName(group)}, ${engine === 'vendor' ? 'the vendor\'s engine (recorded only)' : `arm ${arm}${switchTo ? ` (engine.json ${SWITCH} ${switchTo === 'on'})` : ''}`}, ${rows.length} rows`},
    ...(switchTo ? [{task: 'engine-json-paste', args: [switchTo], required: true}, {task: 'engine-stop'}] : []),
    {open: S, engine, scenes: sessionScenes(group)},
    ...(engine === 'cua' ? [{task: '187-arm', args: [tag, arm]}] : []),
    {task: '187-setup', args: [tag, 'start']},
    ...setupSteps({item, block, group}),
    {task: '187-setup', args: [tag, 'end']},
    ...(chrome ? [{task: '187-menu-start', args: [item]}] : []),
    ...rows.flatMap((row, i) => rowSteps({item, group, block, i, arm, row})),
    ...(chrome ? [{task: '187-menu-stop', args: [item]}] : []),
    {close: S},
    ...(switchTo ? [{task: 'engine-json-restore'}, {task: 'engine-stop'}] : []),
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

const placeSteps = () => [
  {say: '#187: the slot\'s preconditions, then the harness windows placed (Chrome for Testing at the left, TextEdit over its right half), TextEdit in front'},
  {task: '187-preflight', required: true},
  {task: '187-place', required: true},
  {task: 'activate', args: ['textedit'], required: true},
];
const endSteps = () => [
  {say: '#187: the owner\'s input source selected again, TextEdit\'s run window on top'},
  {task: 'activate', args: ['textedit'], required: true},
  {task: 'select-source', args: ['owner', 'textedit'], required: true},
];

// The drive's items in order, each {item, stage, steps}: `part` all (#188's items, then A, then B unless end-early), a,
// b, 188 (#188's alone) or 188-vendor-click (only cell 3 on the vendor's engine, #188's alone); `vendor` the vendor lane alone. #188's items (./item-188.mjs: its four rows and cell 3, cua's
// engine then the vendor's) run right after the placement, before any block engages Korean, and count only for #188.
export function plan187({part = 'all', vendor = false} = {}) {
  const place = {item: ITEMS.place, stage: 'place', steps: placeSteps()}, end = {item: ITEMS.end, stage: 'end', steps: endSteps()};
  const items188 = ENGINES_188.flatMap(engine => [{item: ITEMS_188.rows(engine), stage: '188', steps: rowsItem188(engine)}, {item: ITEMS_188.click(engine), stage: '188', steps: clickItem188(engine)}]);
  // The vendor's chrome/korean rows first (Chrome frontmost, no composition: whether Chrome reads the vendor's ⌘V under
  // 2-Set at all), then its chrome/composing@textedit rows.
  if (vendor) {
    const lane = (item, group) => ({item, stage: 'vendor', steps: groupItem({item, group, engine: 'vendor', blocks: [{block: 0, arm: 'vendor', rows: VENDOR_ROWS}]})});
    return [place, lane(ITEMS.vendorKorean, 'chrome-korean'), lane(ITEMS.vendor, 'chrome-composing'), end];
  }
  const control = (group, arm) => ({item: ITEMS.control(group, arm), stage: arm === 'A' ? 'a' : 'b',
    steps: groupItem({item: ITEMS.control(group, arm), group, blocks: [{block: 0, arm, rows: ROWS, ...(arm === 'B' ? {switchTo: 'on'} : {})}]})});
  const a = [{item: ITEMS.a1, stage: 'a', steps: groupItem({item: ITEMS.a1, group: 'chrome-composing', blocks: Array.from({length: A1_REPS}, (_, block) => ({block, arm: 'A', rows: ROWS}))})},
    ...CONTROLS.map(group => control(group, 'A'))];
  const b = [{item: ITEMS.b, stage: 'b', steps: groupItem({item: ITEMS.b, group: 'chrome-composing', blocks: bSchedule().map(s => ({...s, switchTo: s.arm === 'B' ? 'on' : 'off'}))})},
    ...CONTROLS.map(group => control(group, 'B'))];
  // Alone, #188's run places and restores under items of its own: #187's judge reads 187-end's latest attempt.
  // `188-vendor-click`: the same, with only cell 3 on the vendor's engine (the cell a rerun of that one cell needs).
  if (part === '188' || part === '188-vendor-click') {
    const only = part === '188' ? items188 : [{item: ITEMS_188.click('vendor'), stage: '188', steps: clickItem188('vendor')}];
    return [{item: ITEMS_188.place, stage: 'place', steps: placeSteps()}, ...only, {item: ITEMS_188.end, stage: 'end', steps: endSteps()}];
  }
  // `b-controls`: Part B's three controls alone (after a B whose ABAB stopped before them).
  if (part === 'b-controls') return [place, ...b.slice(1), end];
  return [place, ...(part === 'all' ? items188 : []), ...(part === 'b' ? [] : a), ...(part === 'a' ? [] : b), end];
}

// ---- a row's record --------------------------------------------------------------------------------------------------

// The arm a value names: true or 'B' is B; false or 'A' is A; anything else, null.
export const armValue = v => (v === true || v === 'B' ? 'B' : v === false || v === 'A' ? 'A' : null);
// The arm the engine reports: in a paste's meta (`cua/paste.focusEnforcement.arm`, native/engine Paste.swift
// PasteFocusEnforcement), and in `cua engine status --json` (`.status.pasteFocusEnforcement`, as read at launch).
export const metaArm = paste => armValue(paste?.focusEnforcement?.arm);
export const statusArm = status => armValue(status?.status?.[SWITCH]);
// Whether the act had an activation of its own: route 3's guard ran (`activationGuardMs`), and the paste's activation
// was not another holder's (`focusEnforcement.activated` false says it shared one, or the app believed it had focus).
export const freshActivation = meta => Number.isFinite(meta?.activationGuardMs) && meta?.paste?.focusEnforcement?.activated !== false;
const deltas = (before, after) => (before && after ? Object.fromEntries(Object.keys(after).map(k => [k, after[k] - (before[k] ?? 0)])) : null);

// The page's reading of a row: its beacon after the act (a later sequence than the one before) with the expected
// length agrees; a stale beacon never does. `mid`, `after`: the counters records ({seq, length, counts}).
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

// One row's record from its readings, value-free: lengths, hashes compared in the cell, counts and the engine's meta.
// `spec`: {key, item, group, arm, block, i, string (its id), method, expectedLength, regime, engine}; the answers are
// the runner's (./session.mjs readReply); `page`: {mid, after}; `fixture`: {mid, after} counts; `front`: {mid, after,
// expected} pids; `activations`: the bundle watcher's events in the act's span; `raisedAt`: when the order watcher saw
// each raise from the act on, and `stateAtStart` its order when the act began; `userKept`: the composition's hash after
// the row (null without a user window); `clipboard`: {mid, after} type-list digests; `menu`: {read, observed};
// `armStatus`: the block's engine status reading. -> the record; `ok` is delivered and valid.
export function rowRecord({spec, prepare = null, act = null, check = null, page = null, fixture = null, front = null, activations = [], raisedAt = [], stateAtStart = null,
  userKept = null, clipboard = null, menu = null, armStatus = null, disturbed = false}) {
  const meta = act?.meta ?? {}, paste = meta.paste ?? null, background = spec.regime === 'background';
  const outcome = check?.ok ? check.value?.outcome : null;
  const readBack = outcome ? {exact: outcome.exact === true, length: outcome.length ?? null} : null;
  const pageReading = page ? pageAgreement(page, spec.expectedLength) : null;
  const delivered = readBack?.exact === true && (pageReading === null || pageReading.agree);
  const invalid = disturbed ? 'an earlier row of the block disturbed the user window\'s composition'
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
  const armMeta = metaArm(paste), other = spec.arm === 'A' ? 'B' : 'A';
  const armConfirmed = ARMS.includes(spec.arm) ? (armStatus === spec.arm || armMeta === spec.arm) && armStatus !== other && armMeta !== other : null;
  return {ok: invalid === null && delivered, key: spec.key, item: spec.item, group: spec.group, id: rowId(spec.group, spec.method, spec.string), arm: spec.arm, block: spec.block,
    i: spec.i, string: spec.string, method: spec.method, expectedLength: spec.expectedLength, regime: spec.regime, engine: spec.engine,
    route: act?.route ?? null, activationClick: meta.activationClick ?? null, activationGuardMs: meta.activationGuardMs ?? null, entered: meta.entered ?? null,
    actMs: act?.value?.actMs ?? null, threw: act?.value?.threw ?? null, error: act?.value?.message ?? null, paste,
    readBack, page: pageReading, fixtureDeltas: fixture ? deltas(fixture.mid, fixture.after) : null, delivered,
    disagree: readBack !== null && pageReading !== null && readBack.exact !== pageReading.agree, invalid,
    front: front && {...front, changed: front.after !== front.expected || activations.length > 0},
    activations: activations.map(a => ({bundleId: a.bundleId ?? null, at: a.at ?? null})), raises: raisedAt.length, raisedAt, stateAtStart, userKept,
    clipboardRestored: clipboard ? clipboard.mid !== null && clipboard.mid === clipboard.after : null,
    menu: menu && {snapshot: menu.read?.ok === true && menu.read?.trusted === true, selected: menu.read?.selected ?? null, openMenus: menu.read?.openMenus ?? null,
      focusedRole: menu.read?.focusedRole ?? null, observed: menu.observed ?? null, watchVerified: menu.watchVerified === true, opened},
    armStatus, armMeta, armConfirmed};
}

// The end-early rule (ruling 6): every row of Part A's chrome/composing pass, both repetitions, valid and delivered.
export function endEarly(rows) {
  const delivered = rows.filter(r => r.invalid === null && r.delivered).length;
  const applies = rows.length === A1_TARGET && delivered === A1_TARGET;
  return {applies, delivered, rows: rows.length, target: A1_TARGET,
    why: applies ? `every one of Part A's ${A1_TARGET} rows delivered` : `${delivered} of Part A's ${A1_TARGET} rows delivered${rows.length !== A1_TARGET ? ` (${rows.length} recorded)` : ''}`};
}

// ---- the judge -------------------------------------------------------------------------------------------------------

const lastAttempt = rows => rows.slice(Math.max(0, rows.map(r => r.kind).lastIndexOf('start')));
const tally = values => values.reduce((m, v) => ({...m, [v ?? 'none']: (m[v ?? 'none'] ?? 0) + 1}), {});
const sumOf = list => list.reduce((m, d) => { for (const [k, v] of Object.entries(d ?? {})) m[k] = (m[k] ?? 0) + v; return m; }, {});
const stageOf = r => `${r.paste?.stage ?? 'no stage'}: read ${r.paste?.readWait ?? '–'}, effect ${r.paste?.effectWait ?? '–'}${r.paste?.confirmed === false ? ', unconfirmed' : ''}`;
const clicksOf = r => (r.page?.deltas?.mousedown ?? 0) + (r.page?.deltas?.click ?? 0);
// What a row did to the person's side: the flags B must not raise.
export const interferenceOf = r => [r.raises > 0 && 'raise', r.front?.changed && 'front app', r.userKept === false && 'composition', clicksOf(r) > 0 && 'page click',
  r.menu?.opened === true && 'menu', r.clipboardRestored === false && 'clipboard'].filter(Boolean);

// A group's numbers. -> the counts the report prints.
export function summarize(rows) {
  const valid = rows.filter(r => r.invalid === null), delivered = valid.filter(r => r.delivered);
  return {n: rows.length, valid: valid.length, delivered: delivered.length, exact: valid.filter(r => r.readBack?.exact).length,
    pageAgree: valid.filter(r => r.page?.agree).length, disagree: valid.filter(r => r.disagree).length,
    invalid: tally(rows.filter(r => r.invalid).map(r => r.invalid)), stages: tally(valid.filter(r => !r.delivered).map(stageOf)),
    readAfterPostMs: spread(valid.map(r => r.paste?.readAfterPostMs)), actMs: spread(valid.map(r => r.actMs)), actMsDelivered: spread(delivered.map(r => r.actMs)),
    page: sumOf(rows.map(r => r.page?.deltas)), fixture: sumOf(rows.map(r => r.fixtureDeltas)),
    raises: rows.reduce((n, r) => n + (r.raises ?? 0), 0), frontChanges: rows.filter(r => r.front?.changed).length,
    activations: rows.reduce((n, r) => n + (r.activations?.length ?? 0), 0),
    userKept: rows.filter(r => r.userKept === true).length, userLost: rows.filter(r => r.userKept === false).length,
    clipboardChanged: rows.filter(r => r.clipboardRestored === false).length, menuOpened: rows.filter(r => r.menu?.opened === true).length,
    menuUnread: rows.filter(r => r.menu && r.menu.opened === null).length, armUnconfirmed: rows.filter(r => r.armConfirmed === false).length,
    routes: tally(valid.map(r => r.route)), activationClicks: tally(valid.map(r => r.activationClick)),
    keyFocus: tally(valid.map(r => (r.paste?.keyFocusAtPaste == null ? null : r.paste.keyFocusAtPaste.holds ? 'holds' : 'does not hold'))),
    points: tally(valid.map(r => r.paste?.focusEnforcement?.point ?? null)), liftedClicks: valid.filter(r => r.paste?.focusEnforcement?.liftedClick === true).length,
    activationToCommandVMs: spread(valid.map(r => r.paste?.focusEnforcement?.activationToCommandVMs)), clickToCommandVMs: spread(valid.map(r => r.paste?.focusEnforcement?.clickToCommandVMs))};
}

// Why a background item's order-watcher record does not cover it, or null: an end record, no gap past WATCH_GAP_MS.
const watcherProblem = watcher => (!watcher?.ok ? 'the order watcher\'s record is missing or has no end'
  : !(watcher.maxGapMs <= WATCH_GAP_MS) ? `the order watcher's longest gap was ${watcher.maxGapMs} ms, past ${WATCH_GAP_MS}` : null);

// Why a control item does not give complete, valid coverage under `arm`: run, not stopped, every row recorded and valid,
// its order watcher whole (a composing control), and under B every row's arm confirmed by the engine. `c`: {group, arm,
// recorded, stopped, rows, watcher}. -> [why].
export function controlCoverage(c) {
  const label = `the ${groupName(c.group)} control under arm ${c.arm}`;
  if (!c.recorded) return [`the ${groupName(c.group)} control was not run under arm ${c.arm}`];
  const problems = [];
  if (c.stopped) problems.push(`${label} stopped: ${c.stopped}`);
  if (c.rows.length < ROWS.length) problems.push(`${label} has ${c.rows.length} of ${ROWS.length} rows`);
  const invalid = c.rows.filter(r => r.invalid !== null).length;
  if (invalid) problems.push(`${label} has ${invalid} invalid row(s)`);
  if (GROUPS[c.group].user) {
    const w = watcherProblem(c.watcher) ?? reconciliationProblem(c.watcher);
    if (w) problems.push(`${label}: ${w}`);
    if (c.watcher?.unattributed?.length) problems.push(`${label}: ${c.watcher.unattributed.length} raise(s) outside every row and every setup step`);
  }
  const unconfirmed = c.arm === 'B' ? c.rows.filter(r => r.armConfirmed !== true).length : 0;
  if (unconfirmed) problems.push(`${label}: arm B is not confirmed by the engine on ${unconfirmed} row(s)`);
  return problems;
}

// Whether arm B lands (the 3b ruling). `bRows`, `aRows`: 187-B's rows by arm; `controls`: [{group, a, b}], each side a
// control item's coverage input (controlCoverage); `watcher`: 187-B's order-watch-stop result; `stopped`: why an item
// stopped. -> {verdict, why, fail, short, ...}.
function judgeB({ran, bRows, aRows, controls, watcher, stopped, early}) {
  if (!ran) return {verdict: early?.applies ? 'NOT RUN (end-early: Part A delivered every row)' : 'NOT RUN', why: early?.applies ? [early.why] : [], fail: [], short: [], regressions: [], raised: []};
  const fail = [], short = [];
  const valid = bRows.filter(r => r.invalid === null), undelivered = valid.filter(r => !r.delivered);
  const count = (n, what) => { if (n) fail.push(`${n} ${what}`); };
  if (undelivered.length) fail.push(`${undelivered.length} of ${valid.length} valid B row(s) not delivered exactly (${undelivered.filter(r => r.disagree).length} with the engine's read-back and the page's beacon disagreeing)`);
  count(bRows.reduce((n, r) => n + clicksOf(r), 0), 'page mousedown/click event(s) under arm B');
  count(bRows.filter(r => r.menu?.opened === true).length, 'B row(s) with a menu opened in Chrome');
  const raised = bRows.filter(r => r.raises > 0);
  if (raised.length) fail.push(`${raised.length} B row(s) raised Chrome's window above TextEdit's (${raised.map(r => `${r.key} at ${r.raisedAt.join(', ')}`).join('; ')}); the kit put the order back after each`);
  count(bRows.filter(r => r.front?.changed).length, 'B row(s) that changed the front app');
  count(bRows.filter(r => r.userKept === false).length, 'B row(s) that disturbed the composition');
  count(bRows.filter(r => r.clipboardRestored === false).length, 'B row(s) whose clipboard restore did not hold');
  count(bRows.filter(r => r.armConfirmed !== true).length, 'B row(s) whose arm the engine did not confirm (engine status .status.pasteFocusEnforcement or the cua/paste meta\'s arm)');
  // A regression is judged only against a complete, valid A baseline, row by matching row, and only on B rows that are
  // valid with the engine confirming arm B; anything less leaves the comparison incomplete, never passed.
  const regressions = [];
  for (const c of controls) {
    const baseline = controlCoverage(c.a);
    if (baseline.length) short.push(`no complete A baseline for the ${groupName(c.group)} control: ${baseline.join('; ')}`);
    short.push(...controlCoverage(c.b));
    for (const r of c.b.rows) {
      const before = c.a.rows.find(x => x.id === r.id);
      if (r.invalid !== null || r.armConfirmed !== true || !before || before.invalid !== null) continue;
      const lost = before.delivered && !r.delivered;
      const added = interferenceOf(r).filter(f => !interferenceOf(before).includes(f));
      if (lost || added.length) regressions.push({id: r.id, lost, added});
    }
  }
  if (regressions.length) fail.push(`${regressions.length} control row(s) regressed under arm B`);
  if (bRows.length < B_TARGET) short.push(`${bRows.length} of ${B_TARGET} B rows recorded`);
  if (aRows.length < B_TARGET) short.push(`${aRows.length} of ${B_TARGET} paired A rows recorded`);
  const invalid = bRows.filter(r => r.invalid !== null);
  if (invalid.length) short.push(`${invalid.length} B row(s) invalid: ${Object.entries(tally(invalid.map(r => r.invalid))).map(([w, n]) => `${w} × ${n}`).join('; ')}`);
  const unread = bRows.filter(r => r.menu && r.menu.opened === null).length;
  if (unread) short.push(`Chrome's menus could not be read after ${unread} B row(s)`);
  const w = watcherProblem(watcher) ?? reconciliationProblem(watcher);
  if (w) short.push(`Part B: ${w}`);
  if (watcher?.unattributed?.length) fail.push(`${watcher.unattributed.length} raise(s) of Chrome's window outside every row and every setup step (at ${watcher.unattributed.join(', ')})`);
  if (stopped.length) short.push(...stopped);
  const verdict = fail.length ? 'DOES NOT LAND' : short.length ? 'INCOMPLETE' : 'LANDS';
  return {verdict, why: fail.length ? fail : short, fail, short, regressions, raised: raised.map(r => ({key: r.key, raisedAt: r.raisedAt}))};
}

// Every item's judgement from the evidence (`items`: {item: its jsonl rows}). -> {groups, endEarly, b, addedMs, vendor}.
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
  const add = (name, group, arm, target, filter = () => true) => {
    const rows = records(name).filter(filter);
    if (items[name]) {
      groups.push({item: name, group, arm, target, stopped: stoppedOf(name), watcher: taskResult(name, '187-order-stop'),
        sources: rowsOf(name).filter(r => r.task === '187-korean').map(r => r.result?.reading ?? null),
        readers: taskResult(name, '187-processes')?.readers ?? null, arms: rowsOf(name).filter(r => r.task === '187-arm').map(r => r.result?.reading ?? null),
        ...summarize(rows)});
    }
    return rows;
  };
  const a1 = add(ITEMS.a1, 'chrome-composing', 'A', A1_TARGET);
  const controlsA = Object.fromEntries(CONTROLS.map(g => [g, add(ITEMS.control(g, 'A'), g, 'A', ROWS.length)]));
  const aRows = add(ITEMS.b, 'chrome-composing', 'A', B_TARGET, r => r.arm === 'A');
  const bRows = add(ITEMS.b, 'chrome-composing', 'B', B_TARGET, r => r.arm === 'B');
  const controlsB = Object.fromEntries(CONTROLS.map(g => [g, add(ITEMS.control(g, 'B'), g, 'B', ROWS.length)]));
  const vendor = add(ITEMS.vendor, 'chrome-composing', 'vendor', VENDOR_ROWS.length);
  const vendorKorean = add(ITEMS.vendorKorean, 'chrome-korean', 'vendor', VENDOR_ROWS.length);
  const early = items[ITEMS.a1] ? endEarly(a1) : null;
  const stopped = [ITEMS.b, ...CONTROLS.map(g => ITEMS.control(g, 'B'))].map(n => stoppedOf(n) && `${n} stopped: ${stoppedOf(n)}`).filter(Boolean);
  // The restores the kit made after a row, each with the arm of the row it followed.
  for (const g of groups) {
    const arms = new Map(records(g.item).map(r => [r.key, r.arm]));
    g.restores = rowsOf(g.item).filter(r => r.kind === 'task' && r.task === '187-order-restore' && r.result?.restored && arms.get(r.result.key) === g.arm)
      .map(r => ({key: r.result.key, raisedAt: r.result.raisedAt ?? [], ok: r.result.ok}));
  }
  const side = (g, arm, rows) => ({group: g, arm, rows, recorded: Boolean(items[ITEMS.control(g, arm)]), stopped: stoppedOf(ITEMS.control(g, arm)),
    watcher: taskResult(ITEMS.control(g, arm), '187-order-stop')});
  const b = judgeB({ran: Boolean(items[ITEMS.b]), bRows, aRows, early, stopped, watcher: taskResult(ITEMS.b, '187-order-stop'),
    controls: CONTROLS.map(g => ({group: g, a: side(g, 'A', controlsA[g]), b: side(g, 'B', controlsB[g])}))});
  const aControls = CONTROLS.flatMap(g => controlCoverage(side(g, 'A', controlsA[g])));
  const restore = restoreOf(rowsOf(ITEMS.end), {recorded: Boolean(items[ITEMS.end]), stopped: stoppedOf(ITEMS.end)});
  const overall = overallOf({ranB: Boolean(items[ITEMS.b]), b, early, aControls, restore});
  const median = rows => spread(rows.filter(r => r.invalid === null).map(r => r.actMs)).median ?? null;
  const addedMs = {A: median(aRows), B: median(bRows), difference: median(aRows) !== null && median(bRows) !== null ? median(bRows) - median(aRows) : null};
  // #188's rows and cell 3, judged apart (./item-188.mjs): reported, never part of `overall`.
  return {groups, endEarly: early, aStages: tally(a1.filter(r => r.invalid === null && !r.delivered).map(stageOf)), b, addedMs, aControls, restore, overall,
    vendor: items[ITEMS.vendor] ? summarize(vendor) : null, vendorKorean: items[ITEMS.vendorKorean] ? summarize(vendorKorean) : null, item188: judge188(items)};
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

// The slot's outcome: arm B landing, or the end-early rule with Part A's controls complete, and the owner's source
// restored. -> {ok, verdict, why}.
function overallOf({ranB, b, early, aControls, restore}) {
  let verdict, why;
  if (ranB) [verdict, why] = [b.verdict, [...b.why]];
  else if (early?.applies) [verdict, why] = aControls.length ? ['INCOMPLETE', [...aControls]] : ['ENDED EARLY', [early.why]];
  else [verdict, why] = ['NOT RUN', [early ? `${early.why}: Part B has not run` : 'Part A was not recorded']];
  const reached = verdict === 'LANDS' || verdict === 'ENDED EARLY';
  if (!restore.ok) why.push(restore.why);
  return {ok: reached && restore.ok, verdict: reached && !restore.ok ? 'NOT OK' : verdict, why};
}

// Whether the vendor lane may run (ruling 4): only once B has run and some valid B row did not deliver.
export function vendorAllowed(judged) {
  if (judged.b.verdict.startsWith('NOT RUN')) return {allowed: false, why: `arm B was not run (${judged.b.verdict})`};
  const b = judged.groups.find(g => g.item === ITEMS.b && g.arm === 'B');
  const undelivered = b ? b.valid - b.delivered : 0;
  return undelivered > 0 ? {allowed: true, why: `${undelivered} valid B row(s) did not deliver`} : {allowed: false, why: `every valid B row delivered (${judged.b.verdict})`};
}
// The judge's exit status: 0 when arm B lands, or the end-early rule ended the slot with Part A's controls complete, and
// the owner's source was restored.
export const judgedOk = judged => judged.overall.ok;

const listed = m => Object.entries(m ?? {}).map(([k, n]) => `${k} × ${n}`).join(', ') || '–';
const ms = x => (Number.isFinite(x) ? x.toFixed(1) : '–');
const spreadText = s => (s?.n ? `${ms(s.median)} (${ms(s.min)}–${ms(s.max)}, n ${s.n})` : '–');
// The judgement as Markdown.
export function item187Markdown(judged) {
  const lines = ['# #187: paste behind a composition, and the activation before ⌘V (scripts/cursor-sitting/item-187.mjs)', '',
    'A row is delivered only when the engine\'s read-back is exact and the page\'s own beacon, sent after the act, reports the expected length. A background row whose act carried no `activationGuardMs` acted under a held activation and is invalid. Page counts are the counters page\'s deltas over the act (window and textarea focus/blur, document-level mousedown and click); raises are the 5 ms order watcher\'s; the clipboard is the type-list digest before and after. Arm B lands only if every B row delivers, with no page mousedown or click, no menu opened, no raise, no front app change, the composition kept, every clipboard restore intact, the arm confirmed by the engine, and no control regressing under B. Arm A is diagnostic; the vendor\'s rows are recorded only.', '',
    `## Overall: ${judged.overall.verdict}`, '', ...(judged.overall.why.length ? judged.overall.why.map(w => `- ${w}`) : ['- every condition held']), '',
    `The owner's input source: ${judged.restore.ok ? `restored (${judged.restore.current}, read back)` : `NOT restored (${judged.restore.why})`}.`, '',
    `## Arm B: ${judged.b.verdict}`, '', ...(judged.b.why.length ? judged.b.why.map(w => `- ${w}`) : ['- every condition held']), ''];
  if (judged.aControls.length) lines.push(`Part A's controls are incomplete: ${judged.aControls.join('; ')}.`, '');
  if (judged.endEarly) lines.push(`Part A (end-early rule): ${judged.endEarly.why}${judged.endEarly.applies ? '; the slot ends after the controls' : '; Part B runs'}.`, '');
  if (Object.keys(judged.aStages).length) lines.push(`Part A's undelivered rows by paste stage: ${listed(judged.aStages)}.`, '');
  if (judged.addedMs.A !== null || judged.addedMs.B !== null) lines.push(`Per-paste act time in Part B, median over valid rows: arm A ${ms(judged.addedMs.A)} ms, arm B ${ms(judged.addedMs.B)} ms; added by B ${ms(judged.addedMs.difference)} ms.`, '');
  if (judged.b.raised?.length) lines.push(`Chrome's window was raised above TextEdit's after ${judged.b.raised.length} B row(s); the kit put the order back before the next row each time.`, '');
  for (const r of judged.b.regressions ?? []) lines.push(`- control regression: ${r.id}${r.lost ? ' delivered under A, not under B' : ''}${r.added.length ? ` (new under B: ${r.added.join(', ')})` : ''}`);
  lines.push('', '| item | rows | arm | recorded / target | valid | delivered | read-back exact | page agrees | disagree | page counts (sum) | raises | front changes | userKept / lost | clipboard changed | menu opened | arm unconfirmed |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const g of judged.groups) {
    lines.push(`| ${g.item} | ${groupName(g.group)} | ${g.arm} | ${g.n} / ${g.target} | ${g.valid} | **${g.delivered}** | ${g.exact} | ${g.pageAgree} | ${g.disagree} | ${listed(g.page)} | ${g.raises} | ${g.frontChanges} | ${g.userKept} / ${g.userLost} | ${g.clipboardChanged} | ${g.menuOpened}${g.menuUnread ? ` (${g.menuUnread} unread)` : ''} | ${g.armUnconfirmed} |`);
  }
  lines.push('', '| item | arm | act ms, valid rows | act ms, delivered | read after ⌘V, ms | activation → ⌘V, ms | click → ⌘V, ms | activation point | lifted clicks | routes | activation clicks | key focus at ⌘V |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const g of judged.groups) lines.push(`| ${g.item} | ${g.arm} | ${spreadText(g.actMs)} | ${spreadText(g.actMsDelivered)} | ${spreadText(g.readAfterPostMs)} | ${spreadText(g.activationToCommandVMs)} | ${spreadText(g.clickToCommandVMs)} | ${listed(g.points)} | ${g.liftedClicks} | ${listed(g.routes)} | ${listed(g.activationClicks)} | ${listed(g.keyFocus)} |`);
  for (const g of judged.groups) {
    const notes = [
      ...(Object.keys(g.stages).length ? [`undelivered by paste stage: ${listed(g.stages)}`] : []),
      ...Object.entries(g.invalid).map(([why, n]) => `invalid × ${n}: ${why}`),
      ...(Object.keys(g.fixture).length ? [`the Electron fixture's counters over the acts (sum): ${listed(g.fixture)}`] : []),
      ...(g.sources.length ? [`input source readings after each refocus: ${g.sources.map(s => (s ? `${s.id} / ${s.layout}${s.perContextInput != null ? `, per-context ${s.perContextInput}` : ''}` : 'unread')).join('; ')}`] : []),
      ...(g.arms.length ? [`engine status arm per block: ${g.arms.map(a => a ?? 'unreported').join(', ')}`] : []),
      ...(g.readers ? [`processes that could read the clipboard: ${g.readers.length ? g.readers.join(', ') : 'none matched'}`] : []),
      ...(g.restores?.length ? [`the kit put the window order back after ${g.restores.length} row(s): ${g.restores.map(r => `${r.key} (raised at ${r.raisedAt.join(', ') || 'before the row'}${r.ok ? '' : ', NOT restored'})`).join('; ')}`] : []),
      ...(g.watcher ? [`order watcher: ${g.watcher.raises ?? '?'} raise(s) over the item (setup included), longest gap ${g.watcher.maxGapMs ?? '?'} ms`] : []),
      ...(g.stopped ? [`stopped: ${g.stopped}`] : []),
    ];
    if (notes.length) lines.push('', `## ${g.item} (${groupName(g.group)}, arm ${g.arm})`, '', ...notes.map(n => `- ${n}`));
  }
  if (judged.vendorKorean) lines.push('', `The vendor's chrome/korean lane (recorded only, Chrome frontmost): ${judged.vendorKorean.delivered} of ${judged.vendorKorean.n} paste rows delivered.`);
  if (judged.vendor) lines.push('', `The vendor's lane (recorded only): ${judged.vendor.delivered} of ${judged.vendor.n} paste rows delivered.`);
  lines.push('', ...markdown188(judged.item188));
  return `${lines.join('\n')}\n`;
}

// ---- the live tasks --------------------------------------------------------------------------------------------------

// The processes whose names say they could read the clipboard (clipboard managers, paste workers), recorded per item
// (ruling 8): names only.
export const CLIPBOARD_READER = /clip|paste|board|copy|maccy|flycut|alfred|raycast|launchbar|keyboard.?maestro/i;
export const clipboardReaders = names => [...new Set(names.map(n => basename(String(n).trim())).filter(n => n && CLIPBOARD_READER.test(n)))].sort();

// The tasks the steps above name, for ./runner.mjs liveIo, over `d` (liveDeps187's shape; the tests' fakes).
export function item187Tasks(d) {
  const st = ctx => (ctx.r187 ??= {rows: {}, compose: {}, arms: {}, order: null, activations: null, menu: null, stops: new Map(), windows: []});
  const runWindow = id => { const r = d.scene(id); return {id, pid: r.pid, number: r.window.number, bounds: runWindowBounds(d.windows(r.pid), r.window.number)}; };
  const attempt = fn => { try { return fn(); } catch { return null; } };
  // Chrome's run window at the screen's left and TextEdit's over its right half (raise.mjs placementPlan with the roles
  // swapped), moved through Accessibility and read again: each within 2 pt.
  const place = () => {
    const back = runWindow('chrome'), front = runWindow('textedit');
    const gone = [back, front].find(w => !w.bounds);
    if (gone) return {ok: false, problem: `the ${gone.id} scene's run window is not on screen`};
    const plan = placementPlan({back: back.bounds, front: front.bounds}), targets = [[back, plan.back], [front, plan.front]], moves = [];
    for (const [w, to] of targets) {
      const dx = to.x - w.bounds.x, dy = to.y - w.bounds.y;
      if (!dx && !dy) { moves.push({id: w.id, moved: 'already there'}); continue; }
      const answer = d.moveWindow([String(w.pid), [w.bounds.x, w.bounds.y, w.bounds.width, w.bounds.height].join(','), String(dx), String(dy)]);
      moves.push({id: w.id, dx, dy, answer});
      if (answer?.trusted === false) return {ok: false, moves, problem: 'the terminal running the kit is not trusted for Accessibility, so it cannot move the harness windows'};
    }
    const now = targets.map(([w, to]) => ({id: w.id, to, bounds: runWindow(w.id).bounds}));
    const off = now.filter(w => !w.bounds || Math.abs(w.bounds.x - w.to.x) > 2 || Math.abs(w.bounds.y - w.to.y) > 2);
    return {ok: off.length === 0, plan, moves, bounds: now, ...(off.length ? {problem: `${off.map(w => w.id).join(', ')} did not reach ${off.length > 1 ? 'their places' : 'its place'}`} : {})};
  };
  return {
    // The slot's preconditions: the owner's yes to the source switch, every scene up and Chrome on the counters page,
    // engine.json without the switch; the engine's status recorded.
    '187-preflight': async () => {
      const problems = [], consent = d.consent(), state = d.state();
      if (consent?.consent !== true) problems.push('the owner\'s yes to the input-source switch is not recorded (cursor-sitting.mjs source consent yes --out <out>)');
      for (const id of SCENES) if (!state.scenes?.[id]) problems.push(`the ${id} scene is not up`);
      if (state.scenes?.chrome && state.scenes.chrome.page?.variant !== 'counters') problems.push('Chrome is not on the counters page (down chrome, then up chrome --page counters)');
      const settings = d.engineJson();
      if (settings && SWITCH in settings) problems.push(`engine.json already has ${SWITCH} (an earlier run left it): put engine.json back by hand first`);
      const status = attempt(d.engineStatus);
      return {ok: problems.length === 0, consent: consent ? {consent: consent.consent, owner: consent.owner?.id ?? null} : null, chromePage: state.scenes?.chrome?.page?.variant ?? null,
        engine: {build: status?.build ?? null, approved: status?.approved ?? null, [SWITCH]: status?.status?.[SWITCH] ?? null}, ...(problems.length ? {problem: problems.join('; ')} : {})};
    },
    '187-place': async () => place(),
    // The kit's own setup of a block (Korean engaged, the composition), marked so a raise inside it is told apart from a
    // row's: the final record's reconciliation explains it as setup.
    '187-setup': async ([tag, edge], ctx) => {
      const s = st(ctx), at = d.now();
      if (edge === 'start') s.windows.push({kind: 'setup', tag, from: at, to: Infinity});
      else { const w = s.windows.findLast(x => x.kind === 'setup' && x.tag === tag); if (w) w.to = at; }
      return {ok: true, tag, edge, at};
    },
    // After a background row: Chrome's window raised during the row, or still above the user's, is put back before the
    // next row (the paste route has no after-action watch): the kit's placement, the user window's app activated, the
    // order read again; failing that, once more through the release scene (activated, then the user's). Harness windows
    // only. Nothing to do: {restored: false}. A scene that cannot be put back stops the item (the step is required).
    // The watcher is read again here, after the row's last reading: a raise it shows only now (written late, or caused
    // during the row's readings) is the row's too (`lateRaisedAt`, which the judge adds to the row), and the row's span
    // for the final record's reconciliation ends here.
    '187-order-restore': async ([key, group], ctx) => {
      const s = st(ctx), g = GROUPS[group], row = s.rows[key];
      if (!s.order || !row) return {ok: true, key, restored: false};
      const from = row.mid?.at ?? row.start, run = d.order.attempt(s.order);
      const seen = raisesIn(run).filter(c => c.at >= from).map(c => c.at), stateBefore = stateAt(run, Infinity);
      row.closedAt = d.now();
      const lateRaisedAt = seen.filter(at => !(row.raised?.raisedAt ?? []).includes(at));
      const raised = {raisedAt: seen, stateNow: stateBefore};
      if (seen.length === 0 && stateBefore !== 'back-above') return {ok: true, key, restored: false};
      const window = {kind: 'restore', tag: key, from: d.now(), to: Infinity};
      s.windows.push(window);
      const stateNow = async () => { await d.sleep(ORDER_SETTLE_MS); return stateAt(d.order.attempt(s.order), Infinity); };
      const placed = place(), how = ['placement', `activate ${g.user}`];
      await d.activate(g.user);
      let state = await stateNow();
      if (state !== 'front-above') {
        how.push(`activate ${releaseOf(group)}`, `activate ${g.user}`);
        await d.activate(releaseOf(group));
        await d.activate(g.user);
        state = await stateNow();
      }
      const ok = state === 'front-above';
      window.to = d.now();
      return {ok, key, restored: true, raisedAt: raised.raisedAt, lateRaisedAt, stateBefore: raised.stateNow, state, how, placed: placed.ok,
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
    '187-activations-start': async ([item], ctx) => {
      const s = st(ctx), watch = d.activations.start();
      s.activations = watch;
      s.stops.set('activations', () => d.activations.stop(watch));
      return {ok: true, item};
    },
    '187-activations-stop': async ([item], ctx) => {
      const s = st(ctx), watch = s.activations;
      if (!watch) return {ok: false, item, problem: 'no activation watcher is running'};
      s.activations = null;
      s.stops.delete('activations');
      const lines = d.activations.stop(watch);
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
    // The arm the engine reports for the block, read once its session has started it.
    '187-arm': async ([tag, arm], ctx) => {
      const status = attempt(d.engineStatus), reading = statusArm(status);
      st(ctx).arms[tag] = reading;
      return {ok: reading === arm, tag, expected: arm, reading, value: status?.status?.[SWITCH] ?? null, build: status?.build ?? null};
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
      const window = [w.pid, w.bounds.x, w.bounds.y, w.bounds.width, w.bounds.height].join(','), jamo = sha256Hex(COMPOSITION.composed);
      const empty = attempt(() => d.probe(['focus', '--window', window]));
      if (empty?.named !== true || empty.valueHash !== EMPTY_HASH) return {ok: false, tag, problem: 'the focus probe did not read the user window\'s field focused and empty'};
      // The key is scheduled COMPOSE_LEAD_MS after the probe's launch, as the native matrix's composing rows post it: an
      // unscheduled post right at the probe's launch was lost live (the field read empty after it, 2 of 4 setups). A key
      // lost that way leaves the field empty, so it is posted once more; any other reading is never typed over.
      const post = () => attempt(() => d.probe(['keystroke', '--ansi-keys', '--at', String(d.now() + COMPOSE_LEAD_MS), '--user-pid', String(w.pid),
        '--user-bounds', [w.bounds.x, w.bounds.y, w.bounds.width, w.bounds.height].join(','), COMPOSITION.key]));
      let composed = false, reads = 0, last = null, posts = 0;
      while (posts < COMPOSE_POSTS && !composed && (posts === 0 || last?.valueHash === EMPTY_HASH)) {
        const posted = post();
        posts++;
        if (probeStatus(posted) !== 0) return {ok: false, tag, posts, problem: `the probe's key was not posted (status ${probeStatus(posted)})`};
        for (let r = 0; r < SETTLE_READS && !composed; r++, reads++) {
          if (r) await d.sleep(SETTLE_READ_MS);
          last = attempt(() => d.probe(['focus', '--window', window]));
          composed = last?.valueHash === jamo;
        }
      }
      if (composed) st(ctx).compose[tag] = {window, jamo};
      // What the field read instead, by class only: empty (the key was lost), the Latin key, or something else.
      const read = composed ? 'jamo' : last?.valueHash === EMPTY_HASH ? 'empty' : last?.valueHash === sha256Hex(COMPOSITION.key) ? 'latin' : last?.named === true ? 'other' : 'unread';
      return {ok: composed, tag, reads, posts, read, ...(composed ? {} : {problem: `the user window's field did not read the composed jamo after the probe's key (it read ${read})`})};
    },
    '187-before': async ([key], ctx) => { st(ctx).rows[key] = {start: d.now()}; return {ok: true, key}; },
    // The readings right before the act; the act's span starts after them.
    '187-mid': async ([key, group], ctx) => {
      const g = GROUPS[group], row = (st(ctx).rows[key] ??= {});
      const mid = {front: d.frontmost()?.pid ?? null, clipboard: attempt(d.clipboard), page: g.driven === 'chrome' ? attempt(d.pageCounters) : null,
        fixture: involvesElectron(g) ? attempt(d.fixtureCounters) : null};
      row.mid = {...mid, at: d.now()};
      return {ok: true, key, front: mid.front, pageSeq: mid.page?.seq ?? null};
    },
    // The row's record (rowRecord), from the cells' answers and the readings after the act.
    // Every reading after the act comes first; the observation interval, for activations and raises, ends after them.
    '187-row': async ([key, group, arm, block, i, method, stringId], ctx) => {
      const g = GROUPS[group], s = st(ctx), row = (s.rows[key] ??= {}), tag = key.slice(0, key.lastIndexOf('.')), item = tag.slice(0, tag.lastIndexOf('#'));
      const r = ROWS.find(x => x.method === method && x.string.id === stringId);
      const spec = {key, item, group, arm, block: Number(block), i: Number(i), string: stringId, method, expectedLength: r.string.text.length, regime: g.regime, engine: arm === 'vendor' ? 'vendor' : 'cua'};
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
      const record = rowRecord({spec, prepare: ctx.results[LABELS.prepare(key)] ?? null, act, check: ctx.results[LABELS.check(key)] ?? null, page, fixture, front,
        activations, raisedAt, stateAtStart, userKept, clipboard, menu, armStatus: s.arms[tag] ?? null, disturbed: Boolean(ctx.results[disturbedOf(tag)])});
      if (record.userKept === false) ctx.results[disturbedOf(tag)] = true;
      return record;
    },
  };
}

// Every raise of the item's final watcher record, accounted for: inside a row's span (from its act to the restore's read)
// it is that row's; inside one of the kit's own setup or restore steps (`windows`) it is explained as setup; otherwise,
// after a row, it is the most recent row's (the block's tail: a delayed raise while the block closes its watchers,
// session and engine); before any row, it is unattributed. -> {rowRaises, tailRaises, setupRaises, unattributed}.
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

// What the runner's finally calls: every watcher an item started and did not stop.
export async function stop187(ctx) {
  const stops = ctx.r187?.stops;
  if (!stops) return;
  for (const [name, stop] of [...stops]) { stops.delete(name); try { await stop(); } catch {} }
}

// ---- the live deps ---------------------------------------------------------------------------------------------------

export const MENU_SCRIPT = fileURLToPath(new URL('./menu-open.swift', import.meta.url));
export const menuTool = ({cache = PROBE_CACHE} = {}) => compiled(MENU_SCRIPT, cache);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fileLines = file => (existsSync(file) ? orderLines(readFileSync(file, 'utf8')) : []);
// A resident watcher's run in its file (appended to by every attempt): the lines after the start line its pid wrote.
const runOf = (file, pid) => { const lines = fileLines(file), k = lines.findIndex(l => l.kind === 'start' && l.pid === pid); return k < 0 ? [] : lines.slice(k + 1); };

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
// checkout's CLI answering JSON; `settingsFile`: engine.json; `probe(args)`: the approved bundle's probe; `bundle`: its path.
export function liveDeps187({io, run, out, guard, cli, settingsFile, probe, bundle, windowList, moveWindow, consent}) {
  return {
    out, scene: io.scene, state: () => readState(run), activate: scene => io.tasks.activate([scene]), frontmost: guard.frontmost, windows: guard.windows, windowList, probe, moveWindow, consent,
    engineStatus: () => cli(['engine', 'status', '--json']),
    engineJson: () => (existsSync(settingsFile) ? JSON.parse(readFileSync(settingsFile, 'utf8')) : null),
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
      read: pid => JSON.parse(execFileSync(menuTool(), ['read', String(pid)], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000}).trim().split('\n').at(-1)),
      start: startMenuWatch, stop: stopMenuWatch, alive: handle => handle.child.exitCode === null && handle.child.signalCode === null,
      lines: handle => { if (!existsSync(handle.file)) throw new Error('the menu watcher\'s log is gone'); return runOf(handle.file, handle.pid); },
    },
    write: (name, text) => writeFileSync(join(out, name), text, {mode: 0o600}),
    now: Date.now, sleep,
  };
}
