// #187's isolating slot on the MacBook: is the inert click outside the frame what makes Chrome's background paste
// deliver? (~/.local/share/187/next-slot-plan.md B, C1 and C5, with its RULINGS of 2026-11-05; SSFSKIM/cua#187.) The
// halves differ by that click alone: AFTER is the merged shipping build, BEFORE the control build of the same source with
// the click cut at compile time (./control-build.mjs: CUA_CONTROL_NO_INERT_CLICK, `skipped controlBuild`, the ping's
// `variant: control-no-inert-click`). Both are built and approved before the slot and saved with ./engine-copy.mjs under
// one directory (`--halves`: engine-after/, engine-control/); the owner's own engine is saved first, beside them
// (engine-owner/). Both halves come from one preparation: control-build's record (control.json) names the shipping
// build and the control build of one source tree, checked again at the drive's start (./control-build.mjs checkPair)
// and recorded in the out directory with the owner's end choice (187-iso-start). Each half's save, each running build
// and every attested result must be that pair's.
//
// The drive (`isolate-187 drive`): the placement; six blocks in the order A B B A A B (ORDER), so drift over the slot
// falls on both halves alike; then the AFTER-only block; the tail; the owner's source again. A block is its swap, 2
// repetitions of the background-paste cell and 3 chrome/composing@textedit rows, so 6 repetitions and 9 rows a half:
// - The swap (its own item): the half's save restored (./engine-copy.mjs restoreEngine, the current engine moved aside
//   under `--halves`/aside/), `engine approve` with no terminal, so any grant or capture prompt fails it and stops the
//   drive (the plan's "stop on any prompt"), then one observation of the TextEdit scene in a fresh session whose result's
//   `cua/nativeEngine` must be the saved build with the half's variant (absent on AFTER). A swap that does not attest
//   stops the drive: no item runs on an engine it cannot name.
// - The cell (./item-187.mjs cellItem, as on 11-05, each repetition its own item): Chrome for Testing relaunched clean
//   and placed, TextEdit in front under ABC, one background paste of the Latin string into the textarea, `open -a`, the
//   key read, one frontmost paste. A person-touched repetition is replaced once, right after it, in its block.
// - Composing (./item-187.mjs groupItem): a third of hold 3's nine paste rows behind a fresh Hangul composition in
//   TextEdit (THIRDS: each half pastes every string once), the harness windows placed first.
// - The AFTER-only block: a swap to AFTER, then #188's `--part 188` as it is (its own placement and source restore;
//   its verdict is #188's), then C2's and C3's repetitions (./item-187-join.mjs: the keys-then-click row and its dialog
//   variant, each its own verdict); then the tail, C4 (b) and (c) (ruling 4: after every verdict item, a minute or less
//   each, measured with no verdict, left out with `--no-tail`).
// - The cleanup (187-iso-cleanup, cleanupSteps), on every exit of the drive (completed, partial, stopped or thrown): the
//   owner's recorded end choice applied (`--end`: restore-owner, the default, puts engine-owner back; keep-merged leaves
//   engine-after), by the same swap, then attested: the restored engine's ping must name that save's build with no
//   variant. A cleanup that does not attest is the verdict file's first line, and the drive exits 1: the control build
//   may still be installed.
// Every row and repetition keeps the act's `cua/nativeEngine`, so each is attested on its own, not by the block alone.
//
// The verdict (judgeIsolate; pre-registered, written to item-187-isolate.md, the plan's C1 with ruling 2's composing):
// - A repetition is counted only when its premise holds: recorded and not the person's; both pastes' results attest
//   the half (the half's saved build, its variant); the background paste's activation click planned outside the frame
//   (`activationClick` outsideFrame); AFTER's `activationClickKind` inertOutside early, BEFORE's skipped controlBuild;
//   both pastes valid (./item-187.mjs rowRecord). A composing row is counted on the same premise, row by row. What is
//   not counted is reported with its reason.
// - Each part (the cell, composing), by the design session's RULINGS 2 (1ea561bc:400), checked in this order:
//   - DOES NOT LAND, at any count (decisive): any counted AFTER read-stage timeout (#187's own failure on the fixed
//     build, ruling 2); BEFORE delivering in AGAINST or more counted (ruling 3); BEFORE failing at a stage other than
//     read, by its stage meta, in AGAINST or more; AFTER missing its delivery in AGAINST or more.
//   - INCONCLUSIVE when nothing decisive happened and a half has fewer than MIN_COUNTED counted (ruling 3).
//   - LANDS on absolute counts (ruling 1): at least BAR[part].at counted AFTER entries delivering (the cell: both
//     pastes; composing: delivered exact) and at least as many counted BEFORE entries failing as predicted (the cell: the
//     background paste timing out at stage read, by its stage meta alone, readTimedOut, and the frontmost paste not
//     delivered; composing: timing out at read). A premise failure lowers the counted number, so it can only make
//     LANDS harder; the one miss allowed of a full half covers any failure but an AFTER read timeout.
//   - INCONCLUSIVE otherwise.
//   A failure with no stage meta (the legacy -10005, stage unknown) is a miss, never a read timeout and never a failure
//   at another stage.
// - Overall: DOES NOT LAND when either part does; LANDS only when both do; INCONCLUSIVE otherwise.
// - Reported, never judged: the key readings per half before and after `open -a` (frontmost, AXMain, AXFocusedWindow,
//   hasFocus, the run window's AXFocused), the activation joins, what the rows did to the person's side, each swap's
//   attestation, #188's rows (judged as #188's, a row whose action's result does not attest AFTER made invalid first),
//   C2's and C3's verdicts (their own, ./item-187-join.mjs), C4's measures, the owner's source and the cleanup. Every
//   counted stage-less failure is named under the verdict (unexpected on an attested half; 1ea561bc:402).
// - Never trusted from the records: a stored `ok`. A swap counts only when the judge finds it restored its half's save of
//   the recorded pair and its recorded observation attests that half (attestProblem, again); a repetition or row counts
//   only in a block whose swap counts.
// The judge is pure over records, and its pieces (repPremise, cellOutcome, rowOutcome, partVerdict) take records alone,
// so a replay on other records runs the same predicates.
import {join} from 'node:path';
import {OBSERVE} from './cells.mjs';
import {CONTROL_VARIANT} from './control-build.mjs';
import {cellItem, endSteps, groupItem, interferenceOf, lastAttempt, placeSteps, plan187, readTimedOut, restoreOf, S, settleReplacements, VENDOR_ROWS} from './item-187.mjs';
import {ALL_ITEMS_188, ITEMS_188, judge188, LABELS_188, markdown188} from './item-188.mjs';
import {dialogPlan, inframePlan, joinMarkdown, judgeJoin, judgeTail, menuPlan, raisePlan, tailMarkdown} from './item-187-join.mjs';

export const HALVES = Object.freeze(['after', 'before']);
export const HALF_NAMES = Object.freeze({after: 'AFTER (the merged shipping build)', before: 'BEFORE (the control build, no inert click)', owner: 'the owner\'s own engine'});
// The variant each half's ping names: none on the shipping build, none on the owner's.
export const VARIANTS = Object.freeze({after: null, before: CONTROL_VARIANT, owner: null});
// Each half's save under `--halves` (and the owner's, for the cleanup), and the click its background paste must record.
export const SAVED = Object.freeze({after: 'engine-after', before: 'engine-control', owner: 'engine-owner'});
// The owner's end choice (ruling 6; 1ea561bc:403): the engine every exit of the drive leaves installed, by its save.
// restore-owner until the owner has chosen otherwise.
export const END_CHOICES = Object.freeze({'restore-owner': 'owner', 'keep-merged': 'after'});
export const DEFAULT_END = 'restore-owner';
export const CLICK_KIND = Object.freeze({after: {kind: 'inertOutside', when: 'early'}, before: {kind: 'skipped', skippedReason: 'controlBuild'}});
// A B B A A B, and the AFTER-only block after them.
export const ORDER = Object.freeze(['after', 'before', 'before', 'after', 'after', 'before']);
export const CELL_REPS_PER_BLOCK = 2, COMPOSING_ROWS_PER_BLOCK = 3;
export const BLOCKS = Object.freeze(ORDER.map((half, k) => Object.freeze({n: k + 1, half, index: ORDER.slice(0, k).filter(h => h === half).length})));
export const AFTER_BLOCK = BLOCKS.length + 1;
export const BLOCK_NUMBERS = Object.freeze([...BLOCKS.map(b => b.n), AFTER_BLOCK]);
export const CELL_PER_HALF = CELL_REPS_PER_BLOCK * ORDER.filter(h => h === 'after').length;
// Hold 3's nine strings pasted, a third a block: each half pastes every one once.
export const THIRDS = Object.freeze([0, 1, 2].map(k => Object.freeze(VENDOR_ROWS.slice(k * COMPOSING_ROWS_PER_BLOCK, (k + 1) * COMPOSING_ROWS_PER_BLOCK))));
export const COMPOSING_PER_HALF = THIRDS.flat().length;
// The bar's numbers (the plan's C1, ruling 2): `at` of `of` counted in a half, so `of - at` misses allowed.
export const BAR = Object.freeze({cell: Object.freeze({of: CELL_PER_HALF, at: 5}), composing: Object.freeze({of: COMPOSING_PER_HALF, at: 8})});
export const MIN_COUNTED = 4, AGAINST = 2;
export const VERDICT_FILE = 'item-187-isolate.md';

export const ITEMS = Object.freeze({start: '187-iso-start', place: '187-iso-place', swap: n => `187-iso-swap-${n}`, cell: (half, rep) => `187-iso-cell-${half}-${rep}`,
  composing: (half, k) => `187-iso-composing-${half}-${k}`, end: '187-iso-end', cleanup: '187-iso-cleanup'});
const CELL_ITEM = /^187-iso-cell-(after|before)-(\d+)$/, COMPOSING_ITEM = /^187-iso-composing-(after|before)-(\d+)$/;
export const LABELS = Object.freeze({attest: tag => `${tag} attest: the textedit scene observed, its result read for the engine that answered`});

// The AFTER-only block's items after its swap, in order, each {id, what, items: () => [plan entries]}: #188's `--part
// 188` (C5), then C2 (the keys-then-click row) and C3 (the popup dialog), ./item-187-join.mjs, each with its own verdict.
export const AFTER_ONLY = Object.freeze([
  Object.freeze({id: '188', what: '#188\'s 4 rows and cell 3, as `--part 188` defines them (counted for #188)', items: () => plan187({part: '188'})}),
  Object.freeze({id: 'C2', what: 'the keys-then-click raise row on background Chrome, 3 repetitions (its own verdict)', items: raisePlan}),
  Object.freeze({id: 'C3', what: 'the dialog variant, a popup closed by its own button, 3 repetitions (its own verdict)', items: dialogPlan}),
]);
// The tail, after every verdict item (ruling 4): C4 (b) and (c), #279's cases, measured with no verdict, a minute or less
// each, left out with `--no-tail`.
export const TAIL = Object.freeze([
  Object.freeze({id: 'C4b', what: '#279\'s menu span: a menu recorded on Chrome, then a coordinate click into its page, 3 repetitions (measured)', items: menuPlan}),
  Object.freeze({id: 'C4c', what: '#279\'s in-frame case: TextEdit behind the run\'s Finder window, ⌘↑, then a coordinate click into its text, 3 repetitions (measured)', items: inframePlan}),
]);
// The stages whose stop lets the drive go on: each later item sets up its own scene. A swap, the placement or the end
// stopping stops it.
export const GOES_ON_ISO = Object.freeze(['cell', 'composing', '188', 'raise', 'dialog', 'tail']);

// ---- the plan ------------------------------------------------------------------------------------------------------

// A swap: the half's save restored and approved (187-iso-swap), then the running engine's ping read off one result.
const swapSteps = (item, half, say) => {
  const tag = `${item}#0`;
  return [
    {say},
    {series: [item], counts: {rows: 0}},
    {task: '187-iso-swap', args: [tag, half], required: true},
    {open: S, engine: 'cua', scenes: ['textedit']},
    {run: S, cell: OBSERVE('textedit'), label: LABELS.attest(tag), required: true},
    {close: S},
    {task: '187-iso-attest', args: [tag, half], required: true},
  ];
};
export const swapItem = ({n, half}) => swapSteps(ITEMS.swap(n), half,
  `#187 ${ITEMS.swap(n)}: block ${n}, ${HALF_NAMES[half]}: ${SAVED[half]} restored, approved with no terminal (any prompt stops the drive), the running engine attested`);
// The drive's first item: the preparation's pair and the owner's end choice, checked before it and recorded.
export const startSteps = () => [
  {say: '#187: the isolating slot\'s preparation (the shipping and control builds of one source tree) and the owner\'s end choice, recorded'},
  {task: '187-iso-start', required: true},
];
// The cleanup, run on every exit of the drive (not a plan item): the owner's end choice applied by a swap and attested.
export function cleanupSteps(end = DEFAULT_END) {
  const target = END_CHOICES[end];
  if (!target) throw new Error(`--end takes ${Object.keys(END_CHOICES).join(' or ')}`);
  return swapSteps(ITEMS.cleanup, target, `#187 ${ITEMS.cleanup}: the owner's end choice (${end}): ${SAVED[target]} restored, approved with no terminal, the running engine attested`);
}

// A block's composing rows: the harness windows placed (the cell relaunched Chrome), then the block's third behind a
// fresh composition.
export function composingItem({half, index}) {
  const item = ITEMS.composing(half, index), steps = groupItem({item, group: 'chrome-composing', blocks: [{block: 0, rows: THIRDS[index]}]});
  return [...steps.slice(0, 2), {task: '187-place', required: true}, {task: 'activate', args: ['textedit'], required: true}, ...steps.slice(2)];
}

// The drive's items in order, each {item, stage, block, steps} (a cell repetition's also {half, rep} and, unless it is a
// replacement itself, `replace(attempt)`: the next repetition number of its half). `blocks`: the block numbers to run
// (1..6 the A B B A A B blocks, AFTER_BLOCK the AFTER-only block and the tail); `tail` false leaves the tail out (the
// slot running long, ruling 4); the placement and the end always run.
export function isolatePlan({blocks = BLOCK_NUMBERS, tail = true} = {}) {
  const bad = blocks.filter(n => !BLOCK_NUMBERS.includes(n));
  if (bad.length || !blocks.length) throw new Error(`--blocks takes block numbers of ${BLOCK_NUMBERS[0]}..${AFTER_BLOCK} (${bad.join(', ') || 'none given'})`);
  const next = {};
  const repEntry = (half, rep, block, parent = null) => {
    const item = ITEMS.cell(half, rep), steps = cellItem({half, rep, item});
    const entry = {item, stage: 'cell', block, half, rep, steps: parent ? [{task: '187-replaces', args: [parent.item, String(parent.attempt)]}, ...steps] : steps};
    if (parent) return {...entry, replacement: parent};
    return {...entry, replace: attempt => repEntry(half, next[half] = (next[half] ?? CELL_PER_HALF - 1) + 1, block, {item, attempt})};
  };
  const block = ({n, half, index}) => [
    {item: ITEMS.swap(n), stage: 'swap', block: n, half, steps: swapItem({n, half})},
    ...Array.from({length: CELL_REPS_PER_BLOCK}, (_, j) => repEntry(half, index * CELL_REPS_PER_BLOCK + j, n)),
    {item: ITEMS.composing(half, index), stage: 'composing', block: n, half, steps: composingItem({half, index})},
  ];
  // A repetition's replacement (C2's, C3's) stays in the block.
  const tagged = (entries, stage) => entries.map(e => ({...e, block: AFTER_BLOCK, stage: stage ?? e.stage, ...(e.replace ? {replace: attempt => ({...e.replace(attempt), block: AFTER_BLOCK})} : {})}));
  const afterOnly = blocks.includes(AFTER_BLOCK) ? [{item: ITEMS.swap(AFTER_BLOCK), stage: 'swap', block: AFTER_BLOCK, half: 'after', steps: swapItem({n: AFTER_BLOCK, half: 'after'})},
    ...AFTER_ONLY.flatMap(s => tagged(s.items())), ...(tail ? TAIL.flatMap(s => tagged(s.items(), 'tail')) : [])] : [];
  return [{item: ITEMS.start, stage: 'start', block: 0, steps: startSteps()}, {item: ITEMS.place, stage: 'place', block: 0, steps: placeSteps()},
    ...BLOCKS.filter(b => blocks.includes(b.n)).flatMap(block), ...afterOnly,
    {item: ITEMS.end, stage: 'end', block: null, steps: endSteps()}];
}

// What the drive's start records, checked before anything runs: `record` the preparation's control.json, `check` its
// checkPair answer (one source tree, this checkout's), `saved` the builds the saves name ({after, before, owner}), `end`
// the owner's choice. Each half's save must be the pair's build, and restore-owner needs the owner's save.
// -> {ok, pair, end, ownerBuild, saves, problem?}.
export function startOf({record = null, check, saved = {}, end = DEFAULT_END}) {
  const problems = [];
  if (!END_CHOICES[end]) problems.push(`--end takes ${Object.keys(END_CHOICES).join(' or ')}, not ${end}`);
  if (!check?.ok) problems.push(`the preparation's pair does not hold (${check?.problem ?? 'no record'})`);
  else {
    if (saved.after !== check.shippingBuild) problems.push(`${SAVED.after} holds ${short(saved.after)}, not the preparation's shipping build ${short(check.shippingBuild)}`);
    if (saved.before !== check.controlBuild) problems.push(`${SAVED.before} holds ${short(saved.before)}, not the preparation's control build ${short(check.controlBuild)}`);
  }
  if (END_CHOICES[end] === 'owner' && !saved.owner) problems.push(`${SAVED.owner} holds no save, and the end choice restore-owner needs it`);
  return {ok: problems.length === 0, pair: {shippingBuild: check?.shippingBuild ?? null, controlBuild: check?.controlBuild ?? null, source: check?.source ?? record?.source ?? null, preparedAt: check?.preparedAt ?? null},
    end, ownerBuild: saved.owner ?? null, saves: saved, ...(problems.length ? {problem: problems.join('; ')} : {})};
}

// The drive, then the cleanup on every exit, whatever the drive did: `drive()` (-> {stopped}), `cleanup(steps)` running
// cleanupSteps(end). A throw from either is kept, never lost. -> {stopped, error, cleanupError}.
export async function driveThenCleanup({drive, cleanup, end = DEFAULT_END}) {
  let stopped = null, error = null, cleanupError = null;
  try { ({stopped = null} = (await drive()) ?? {}); } catch (e) { error = e; }
  try { await cleanup(cleanupSteps(end)); } catch (e) { cleanupError = e; }
  return {stopped, error, cleanupError};
}

// `--blocks`: "1-7", "3", "2,5", "4-7". -> the block numbers, in order.
export function parseBlocks(text) {
  if (text === undefined || text === null) return [...BLOCK_NUMBERS];
  const numbers = String(text).split(',').flatMap(part => {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`--blocks takes numbers and ranges of ${BLOCK_NUMBERS[0]}..${AFTER_BLOCK} (1-7, 3, 2,5), not "${text}"`);
    const [from, to] = [Number(m[1]), Number(m[2] ?? m[1])];
    return Array.from({length: Math.max(0, to - from + 1)}, (_, k) => from + k);
  });
  return [...new Set(numbers)].sort((a, b) => a - b);
}

// What the dry run prints: the steps of each block, the tail apart. -> [{block, label, steps}] (the tail's block 'tail').
export function stepCounts(plan) {
  const names = new Set(plan.map(e => e.item));
  const ids = sections => sections.filter(s => s.items().some(e => names.has(e.item))).map(s => s.id).join(', ');
  const label = n => (n === 0 ? 'the start (the pair, the placement)' : n === null ? 'the end (the owner\'s source)' : n === 'tail' ? `the tail (${ids(TAIL)})`
    : n === AFTER_BLOCK ? `block ${n}, AFTER only (${ids(AFTER_ONLY) || 'its swap'})` : `block ${n}, ${BLOCKS[n - 1].half.toUpperCase()}`);
  const out = [];
  for (const e of plan) {
    const block = e.stage === 'tail' ? 'tail' : e.block, last = out.at(-1);
    if (last && last.block === block) last.steps += e.steps.length; else out.push({block, label: label(block), steps: e.steps.length});
  }
  return out;
}

// ---- the live tasks ------------------------------------------------------------------------------------------------

// Why a result's `cua/nativeEngine` does not attest a half ({build, variant}), or null.
const short = build => (typeof build === 'string' ? build.slice(0, 12) : 'none');
export function attestProblem(native, {build, variant}) {
  if (!build) return 'the half\'s saved build is not known (no swap to it was recorded)';
  if (!native || typeof native !== 'object') return 'the result carried no cua/nativeEngine';
  if (native.engine !== 'cua') return `the result's engine was ${native.engine ?? 'unnamed'}, not cua`;
  if (native.build !== build) return `the result's build was ${short(native.build)}, not the half's saved ${short(build)}`;
  if ((native.variant ?? null) !== variant) return `the result's variant was ${native.variant ?? 'absent'}, not ${variant ?? 'absent'}`;
  return null;
}

// The swap's tasks over `d`: {halves (the directory of the saves), start (what 187-iso-start records: {ok, pair:
// {shippingBuild, controlBuild, ...}, end, ownerBuild, problem?}), restore({from, aside}) (restoreEngine's answer),
// approve() (`cua engine approve --json` with no terminal), savedRecord(dir) (its saved.json), now}.
export const pairBuilds = start => (start?.ok === true && start.pair?.shippingBuild && start.pair?.controlBuild ? {after: start.pair.shippingBuild, before: start.pair.controlBuild} : null);
export function isolateTasks(d) {
  const st = ctx => (ctx.iso ??= {});
  const pair = pairBuilds(d.start);
  return {
    // The preparation's pair and the owner's end choice, as the drive checked them before anything ran.
    '187-iso-start': async () => ({ok: d.start?.ok === true, ...(d.start ?? {problem: 'no preparation was read'})}),
    // The half's save put in place and approved; any prompt (a grant missing, a capture confirmation) fails it.
    '187-iso-swap': async ([tag, half], ctx) => {
      const from = join(d.halves, SAVED[half]), base = {tag, half, from};
      let build = null;
      try { build = d.savedRecord(from)?.status?.build ?? null; } catch (error) { return {ok: false, ...base, problem: `${from}/saved.json could not be read (${error.message})`}; }
      if (!build) return {ok: false, ...base, problem: `${from}/saved.json names no build`};
      // A half's save must be the preparation's own build; the owner's must be the one the start recorded.
      const want = half === 'owner' ? d.start?.ownerBuild ?? null : pair?.[half] ?? null;
      if (!want) return {ok: false, ...base, saved: build, problem: half === 'owner' ? 'the start recorded no owner build' : 'no preparation pair was recorded'};
      if (build !== want) return {ok: false, ...base, saved: build, problem: `${from}'s build ${short(build)} is not ${half === 'owner' ? 'the owner save the start recorded' : 'this preparation\'s'} ${short(want)}`};
      const aside = join(d.halves, 'aside', `${tag.replace(/#.*$/, '')}-${d.now()}`);
      let restored;
      try { restored = await d.restore({from, aside}); } catch (error) { return {ok: false, ...base, saved: build, aside, problem: `the restore refused: ${error.message}`}; }
      if (restored?.ok !== true) return {ok: false, ...base, saved: build, aside, restored, problem: `the restore did not end on the saved build, approved: ${restored?.next ?? JSON.stringify(restored?.status ?? null)}`};
      const approved = await d.approve();
      const prompted = approved?.captureConfirmation != null && approved.captureConfirmation !== 'none';
      const problem = approved?.ok !== true || approved.approved !== true ? `the approve did not pass with no terminal (${approved?.reason ?? approved?.error?.message ?? approved?.detail ?? 'no answer'}): a prompt or a grant needs the owner`
        : prompted ? `the approve saw a capture confirmation (${approved.captureConfirmation}): a prompt needs the owner`
          : approved.build !== build ? `the approved build is ${short(approved.build)}, not the saved ${short(build)}` : null;
      if (problem === null) st(ctx).swap = {half, build, variant: VARIANTS[half]};
      return {ok: problem === null, ...base, saved: build, aside, restored: {status: restored.status ?? null},
        approved: {approved: approved?.approved ?? null, build: approved?.build ?? null, captureConfirmation: approved?.captureConfirmation ?? null, grants: approved?.grants ?? null},
        ...(problem ? {problem} : {})};
    },
    // The running engine's ping, off the observation's result: the saved build, the half's variant.
    '187-iso-attest': async ([tag, half], ctx) => {
      const swap = st(ctx).swap, observed = ctx.results[LABELS.attest(tag)]?.nativeEngine ?? null;
      const expected = swap?.half === half ? {build: swap.build, variant: VARIANTS[half]} : {build: null, variant: VARIANTS[half]};
      const problem = attestProblem(observed, expected);
      return {ok: problem === null, tag, half, expected, observed, ...(problem ? {problem} : {})};
    },
  };
}

// ---- the judge -----------------------------------------------------------------------------------------------------

const clickKindProblem = (k, half) => {
  const want = CLICK_KIND[half];
  if (!k) return 'no activationClickKind recorded';
  return Object.entries(want).every(([key, v]) => k[key] === v) ? null : `activationClickKind ${[k.kind, k.point ?? k.skippedReason, k.when].filter(Boolean).join(' ')}, not ${Object.values(want).join(' ')}`;
};
const pasteName = which => `the ${which} paste`;
// Why a paste's record does not meet the premise for `half` (built `build`), or null: valid, attested, its activation
// click planned outside the frame and of the half's kind (`clickOf`: false for the frontmost paste, whose activation is
// the person's `open -a`).
function pastePremise(r, {half, build}, which, {click = true} = {}) {
  if (!r) return ['premise not met', `${pasteName(which)} was not recorded`];
  if (r.invalid) return ['invalid', `${pasteName(which)} was invalid (${r.invalid})`];
  const attest = attestProblem(r.nativeEngine, {build, variant: VARIANTS[half]});
  if (attest) return ['not attested', `${pasteName(which)}: ${attest}`];
  if (!click) return null;
  if (r.activationClick !== 'outsideFrame') return ['premise not met', `${pasteName(which)}'s activation click was ${r.activationClick ?? 'unrecorded'}, not planned outside the frame`];
  const kind = clickKindProblem(r.activationClickKind, half);
  return kind ? ['premise not met', `${pasteName(which)}'s ${kind}`] : null;
}

// One repetition's status from its '187-cell' record. -> [status, why]: counted, or why not.
export function repPremise(record, {half, build}) {
  if (record.personTouched) return ['person-touched', 'touched by the person'];
  return pastePremise(record.background, {half, build}, 'background') ?? pastePremise(record.row, {half, build}, 'frontmost', {click: false}) ?? ['counted', null];
}
// One composing row's status. -> [status, why].
export const rowPremise = (r, {half, build}) => pastePremise(r, {half, build}, 'composing') ?? ['counted', null];

// What a counted entry shows for the bar: AFTER's `met` its delivery, BEFORE's `met` the predicted failure;
// `delivers` (a BEFORE delivering); `otherStage` (failing at a stage its stage meta names, not a read timeout);
// `stageUnknown` (failing with no stage meta: the legacy -10005, a miss and nothing more); `readTimeout`.
const failure = (r, read) => ({otherStage: r.delivered !== true && !read && r.paste?.stage != null, stageUnknown: r.delivered !== true && r.paste?.stage == null});
export function cellOutcome(record, half) {
  const bg = record.background, fg = record.row, bgRead = readTimedOut(bg);
  return {met: half === 'after' ? bg.delivered === true && fg.delivered === true : bgRead && fg.delivered !== true,
    delivers: bg.delivered === true, ...failure(bg, bgRead), readTimeout: bgRead || readTimedOut(fg)};
}
export function rowOutcome(r, half) {
  const read = readTimedOut(r);
  return {met: half === 'after' ? r.delivered === true : read, delivers: r.delivered === true, ...failure(r, read), readTimeout: read};
}

// A part's verdict from its entries per half ({counted, met, delivers, otherStage, stageUnknown, readTimeout}), by
// RULINGS 2: what is decisive first, at any count; then too few counted; then the absolute bar. -> {verdict, counts, why}.
export function partVerdict({after, before}, {at}) {
  const A = after.filter(e => e.counted), B = before.filter(e => e.counted), n = (list, key) => list.filter(e => e[key]).length;
  const counts = {after: {counted: A.length, met: n(A, 'met'), readTimeouts: n(A, 'readTimeout')},
    before: {counted: B.length, met: n(B, 'met'), delivers: n(B, 'delivers'), otherStage: n(B, 'otherStage'), stageUnknown: n(B, 'stageUnknown')}};
  const afterMiss = A.length - counts.after.met;
  const against = [counts.after.readTimeouts > 0 && `${counts.after.readTimeouts} read-stage timeout(s) on AFTER, counted`,
    counts.before.delivers >= AGAINST && `BEFORE delivered in ${counts.before.delivers} counted`,
    counts.before.otherStage >= AGAINST && `BEFORE failed at a stage other than read in ${counts.before.otherStage} counted`,
    afterMiss >= AGAINST && `AFTER missed its delivery in ${afterMiss} of ${A.length} counted`].filter(Boolean);
  if (against.length) return {verdict: 'DOES NOT LAND', counts, why: against};
  if (A.length < MIN_COUNTED || B.length < MIN_COUNTED) return {verdict: 'INCONCLUSIVE', counts, why: [`fewer than ${MIN_COUNTED} counted in a half (AFTER ${A.length}, BEFORE ${B.length}), and nothing decisive`]};
  const unmet = [counts.after.met < at && `AFTER met its delivery in ${counts.after.met} counted, under ${at}`,
    counts.before.met < at && `BEFORE failed as predicted in ${counts.before.met} counted, under ${at}${counts.before.stageUnknown ? ` (${counts.before.stageUnknown} with no stage meta, stage unknown)` : ''}`].filter(Boolean);
  return unmet.length ? {verdict: 'INCONCLUSIVE', counts, why: unmet} : {verdict: 'LANDS', counts, why: []};
}

// The overall verdict: DOES NOT LAND when a part does, LANDS when both do, INCONCLUSIVE otherwise.
export const combineVerdict = (cell, composing) => ([cell, composing].some(p => p.verdict === 'DOES NOT LAND') ? 'DOES NOT LAND'
  : cell.verdict === 'LANDS' && composing.verdict === 'LANDS' ? 'LANDS' : 'INCONCLUSIVE');

// Why a recorded swap does not count, or null, checked again from its records (never their stored `ok`): it restored
// the half's save of the expected build, and its recorded observation attests that half.
export function swapProblem({half, swap, attest}, build) {
  if (!build) return half === 'owner' ? 'the owner\'s build was not recorded at the start' : 'no preparation pair was recorded at the start';
  if (!swap) return 'its swap was not recorded';
  if (swap.ok !== true || swap.problem) return `its swap failed (${swap.problem ?? 'no answer'})`;
  if (swap.half !== half) return `its swap restored the ${swap.half ?? 'unnamed'} half, not ${half}`;
  if (swap.saved !== build) return `its swap restored ${short(swap.saved)}, not ${short(build)}`;
  if (!attest) return 'its attestation was not recorded';
  if (attest.half !== half) return `its attestation names the ${attest.half ?? 'unnamed'} half, not ${half}`;
  return attestProblem(attest.observed, {build, variant: VARIANTS[half]});
}
// Each half's build: the pair's, once a swap to it counts. -> {build, problem}.
const halfBuild = (swaps, build) => (!build ? {build: null, problem: 'no preparation pair was recorded at the start'}
  : swaps.some(s => s.valid) ? {build, problem: null} : {build: null, problem: 'no swap to it attested'});

// Every judgement from the evidence (`items`: {item: its jsonl rows}). -> {swaps, builds, cell, composing, verdict, ...}.
export function judgeIsolate(items) {
  const rowsOf = name => (items[name] ? lastAttempt(items[name]) : []);
  const task = (name, t) => rowsOf(name).findLast(r => r.kind === 'task' && r.task === t)?.result ?? null;
  const stoppedOf = name => rowsOf(name).findLast(r => r.kind === 'stopped') ?? null;
  const start = task(ITEMS.start, '187-iso-start'), pair = pairBuilds(start);
  const swaps = [...BLOCKS, {n: AFTER_BLOCK, half: 'after'}].map(({n, half}) => {
    const item = ITEMS.swap(n), s = {n, half, item, recorded: Boolean(items[item]), swap: task(item, '187-iso-swap'), attest: task(item, '187-iso-attest'), stopped: stoppedOf(item)?.error ?? null};
    const problem = s.recorded ? swapProblem(s, pair?.[half] ?? null) : 'not recorded';
    return {...s, valid: problem === null, problem};
  });
  const builds = Object.fromEntries(HALVES.map(half => [half, halfBuild(swaps.filter(s => s.half === half), pair?.[half] ?? null)]));
  // A repetition or row counts only in a block whose swap counts.
  const blockProblem = n => { const s = swaps.find(x => x.n === n); return !s ? 'its block is unknown' : s.valid ? null : `its block ${n}'s swap does not count (${s.problem})`; };
  const blockOfRep = (half, rep) => BLOCKS.filter(b => b.half === half)[Math.floor(rep / CELL_REPS_PER_BLOCK)]?.n ?? null;
  // The cell's repetitions per half: the planned ones (a missing one reads not recorded) and any replacement.
  const reps = half => {
    const planned = Array.from({length: CELL_PER_HALF}, (_, rep) => ITEMS.cell(half, rep));
    const found = Object.keys(items).filter(name => name.match(CELL_ITEM)?.[1] === half);
    const list = [...new Set([...planned, ...found])].map(name => ({name, rep: Number(name.match(CELL_ITEM)[2])})).sort((a, b) => a.rep - b.rep).map(({name, rep}) => {
      const record = task(name, '187-cell'), stop = stoppedOf(name), replaces = task(name, '187-replaces');
      // A replacement runs in its parent's block.
      const parentRep = Number(replaces?.parent?.match(CELL_ITEM)?.[2]), block = rep < CELL_PER_HALF ? blockOfRep(half, rep) : Number.isInteger(parentRep) ? blockOfRep(half, parentRep) : null;
      const inBlock = record ? blockProblem(block) : null;
      const premise = record ? repPremise(record, {half, build: builds[half].build}) : null;
      const [status, why] = record ? (premise[0] !== 'person-touched' && inBlock ? ['not attested', inBlock] : premise)
        : stop ? [stop.personTouched ? 'person-touched' : 'stopped', stop.error] : ['not recorded', null];
      return {item: name, half, rep, block, attemptAt: rowsOf(name)[0]?.at ?? null, replaces, record, status, why};
    });
    return settleReplacements(list, CELL_PER_HALF).map(c => ({...c, counted: c.status === 'counted', ...(c.status === 'counted' ? cellOutcome(c.record, half) : {})}));
  };
  const rowsIn = half => Object.keys(items).filter(name => name.match(COMPOSING_ITEM)?.[1] === half).sort().flatMap(name =>
    rowsOf(name).filter(r => r.kind === 'task' && r.task === '187-row' && r.result).map(r => {
      const inBlock = blockProblem(BLOCKS.filter(b => b.half === half)[Number(name.match(COMPOSING_ITEM)[2])]?.n ?? null);
      const [status, why] = inBlock ? ['not attested', inBlock] : rowPremise(r.result, {half, build: builds[half].build});
      return {item: name, record: r.result, status, why, counted: status === 'counted', ...(status === 'counted' ? rowOutcome(r.result, half) : {})};
    }));
  const cells = Object.fromEntries(HALVES.map(half => [half, reps(half)]));
  const composingRows = Object.fromEntries(HALVES.map(half => [half, rowsIn(half)]));
  const composingStops = Object.keys(items).filter(name => COMPOSING_ITEM.test(name)).map(name => [name, stoppedOf(name)?.error ?? null]).filter(([, e]) => e);
  const cell = partVerdict(cells, BAR.cell), composing = partVerdict(composingRows, BAR.composing);
  const verdict = combineVerdict(cell, composing);
  // The AFTER-only block's items attest the AFTER build only when block 7's own swap counts.
  const after = {build: swaps.find(s => s.n === AFTER_BLOCK)?.valid ? pair.after : null, variant: VARIANTS.after};
  // #188 on the AFTER-only block: each row made invalid when its action's result does not attest AFTER, then judged as #188's.
  const {items: items188, attest: attest188} = attested188(items, after);
  // C2 and C3 (their own verdicts, the AFTER build attested) and C4 (measured): never C1's verdict.
  const attestAfter = native => attestProblem(native, after);
  return {swaps, builds, cells, composingRows, composingStops, cell, composing, verdict, ok: verdict === 'LANDS',
    raise: judgeJoin('raise', items, {attest: attestAfter}), dialog: judgeJoin('dialog', items, {attest: attestAfter}), tail: judgeTail(items),
    mechanism: mechanismIso(cells), person: personSide({cells, composingRows}),
    item188: {...judge188(items188), ran: ALL_ITEMS_188.some(n => items[n]), attest: attest188},
    stageUnknown: stageUnknownOf(cells, composingRows), start, cleanup: cleanupOf(items, start, pair),
    restore: restoreOf(rowsOf(ITEMS.end), {recorded: Boolean(items[ITEMS.end]), stopped: stoppedOf(ITEMS.end)?.error ?? null})};
}

// #188's cua items with every row and cell-3 part whose action's result does not attest `after` made invalid, so
// judge188 never counts it. A row ties to its action by label (LABELS_188.act, LABELS_188.click). -> {items, attest}.
export function attested188(items, after) {
  const out = {...items}, attest = [];
  for (const name of ENGINE_ITEMS_188.filter(n => items[n])) {
    const rows = items[name];
    let actions = 0, unattested = 0, first = null;
    out[name] = rows.map((r, k) => {
      if (r.kind !== 'task' || !r.result || !['188-row', '188-click-record'].includes(r.task)) return r;
      const label = r.task === '188-row' ? LABELS_188.act(r.result.key, r.result.id) : LABELS_188.click(r.result.item, r.result.part);
      const cell = rows.slice(0, k).findLast(c => c.kind === 'cell' && c.label === label);
      if (!cell) return r;
      actions += 1;
      const problem = attestProblem(cell.nativeEngine ?? null, after);
      if (!problem) return r;
      unattested += 1;
      first ??= problem;
      const invalid = `not attested on AFTER: ${problem}`;
      return {...r, result: {...r.result, invalid, ...(r.task === '188-row' ? {valid: false, delivered: false} : {outcome: null})}};
    });
    attest.push({item: name, actions, unattested, first});
  }
  return {items: out, attest};
}

// Every counted stage-less failure (no stage meta, the legacy -10005's shape): a miss by the bar, but unexpected on an
// attested half, so the verdict file names each (1ea561bc:402). -> [{half, where, which}].
function stageUnknownOf(cells, composingRows) {
  const stageless = r => r && r.delivered !== true && r.paste?.stage == null;
  return HALVES.flatMap(half => [
    ...cells[half].filter(c => c.counted).flatMap(c => [['background', c.record.background], ['frontmost', c.record.row]].filter(([, r]) => stageless(r))
      .map(([which]) => ({half, where: `repetition ${c.rep + 1} (${c.item})`, which: `the ${which} paste`}))),
    ...composingRows[half].filter(e => e.counted && stageless(e.record)).map(e => ({half, where: `${e.record.id} (${e.item})`, which: 'the composing paste'})),
  ]);
}

// The cleanup from its records, checked again: its swap to the end choice's save and its attestation. -> {recorded, ok,
// end, target, problem}.
export function cleanupOf(items, start, pair) {
  const rows = items[ITEMS.cleanup] ? lastAttempt(items[ITEMS.cleanup]) : [];
  const end = start?.end ?? null, target = END_CHOICES[end] ?? null;
  const t = name => rows.findLast(r => r.kind === 'task' && r.task === name)?.result ?? null;
  if (!items[ITEMS.cleanup]) return {recorded: false, ok: false, end, target, problem: 'the cleanup was not recorded'};
  if (!target) return {recorded: true, ok: false, end, target, problem: `the start recorded no end choice (${end ?? 'none'})`};
  const build = target === 'owner' ? start?.ownerBuild ?? null : pair?.after ?? null;
  const problem = swapProblem({half: target, swap: t('187-iso-swap'), attest: t('187-iso-attest')}, build);
  return {recorded: true, ok: problem === null, end, target, build, problem};
}
const ENGINE_ITEMS_188 = Object.freeze([ITEMS_188.rows('cua'), ITEMS_188.click('cua')]);

const yes = v => (v === true ? 'yes' : v === false ? 'no' : '–');
const tally = values => values.reduce((m, v) => ({...m, [v ?? 'none']: (m[v ?? 'none'] ?? 0) + 1}), {});
const listed = m => Object.entries(m ?? {}).map(([k, n]) => `${k} × ${n}`).join(', ') || '–';
// A key-window reading as the plan names its parts: frontmost, AXMain, AXFocusedWindow, hasFocus, the window's AXFocused.
const keyTuple = k => (k?.reading ? `frontmost ${yes(k.reading.frontmost)}, AXMain ${yes(k.reading.main)}, AXFocusedWindow ${k.reading.focusedWindow ?? '–'}, hasFocus ${yes(k.pageFocused)}, AXFocused ${yes(k.reading.focused)}${k.reading.ok ? '' : ' (not whole)'}` : 'unread');
const kindText = k => (k ? [k.kind, k.point ?? k.skippedReason, k.when].filter(Boolean).join(' ') : '–');
// The mechanism, reported: the counted repetitions' key readings before and after `open -a`, and the background
// pastes' activation joins and click kinds, per half.
function mechanismIso(cells) {
  const counted = half => cells[half].filter(c => c.counted);
  return Object.fromEntries(HALVES.map(half => [half, {before: tally(counted(half).map(c => keyTuple(c.record.keyBefore))), after: tally(counted(half).map(c => keyTuple(c.record.keyAfter))),
    joins: tally(counted(half).map(c => c.record.background?.activationJoin ?? null)), kinds: tally(cells[half].filter(c => c.record).map(c => kindText(c.record.background?.activationClickKind)))}]));
}
// What the counted rows did to the person's side (./item-187.mjs interferenceOf), per half: reported, never the verdict.
function personSide({cells, composingRows}) {
  return Object.fromEntries(HALVES.map(half => {
    const rows = [...cells[half].filter(c => c.counted).flatMap(c => [c.record.background, c.record.row]), ...composingRows[half].filter(r => r.counted).map(r => r.record)];
    return [half, {rows: rows.length, flags: tally(rows.flatMap(interferenceOf))}];
  }));
}

// ---- the verdict file ----------------------------------------------------------------------------------------------

const stageText = r => (r?.paste ? `${r.paste.stage ?? '–'} / ${r.paste.readWait ?? '–'}` : r ? 'no stage meta' : '–');
const pasteState = r => (!r ? '–' : r.invalid ? 'invalid' : r.delivered ? 'delivered' : 'not delivered');
const statusText = e => `${e.status}${e.status === 'counted' ? '' : e.why ? ` (${e.why})` : ''}`;
const nativeText = n => (n ? `${short(n.build)}${n.variant ? ` ${n.variant}` : ''}` : '–');
// The bar as the kit pre-registers it, in words.
export function barText() {
  return [`**The bar, pre-registered** (the plan's C1, its ruling 2 and the RULINGS 2 on the judge's readings, 1ea561bc:400, written into the kit before the slot). AFTER is the merged shipping build, BEFORE the control build of the same source with only the inert click cut (CUA_CONTROL_NO_INERT_CLICK). The blocks run A B B A A B, each a swap, ${CELL_REPS_PER_BLOCK} background-paste repetitions and ${COMPOSING_ROWS_PER_BLOCK} chrome/composing@textedit paste rows: ${BAR.cell.of} repetitions and ${BAR.composing.of} rows a half.`, '',
    `- **The halves** are one preparation's pair: the shipping build and the control build of one source tree, recorded at the drive's start (187-iso-start). A swap counts only when the judge finds, from its records, that it restored its half's save of that pair and that its observation's \`cua/nativeEngine\` attests the half; a repetition or row counts only in a block whose swap counts.`,
    `- **Counted** only when the premise holds: recorded and not the person's; both pastes' results attesting the half (\`cua/nativeEngine\`: the pair's build for the half, variant ${CONTROL_VARIANT} on BEFORE and none on AFTER); the background paste's activation click planned outside the frame; its \`activationClickKind\` inertOutside early on AFTER, skipped controlBuild on BEFORE; both pastes valid. A composing row on the same premise, row by row. What is not counted is reported with its reason.`,
    `- **DOES NOT LAND** for a part, at any count: any counted AFTER read-stage timeout; BEFORE delivering in ${AGAINST} or more counted; BEFORE failing at a stage other than read (by its stage meta) in ${AGAINST} or more; AFTER missing its delivery in ${AGAINST} or more.`,
    `- **INCONCLUSIVE** for a part when nothing decisive happened and a half has fewer than ${MIN_COUNTED} counted.`,
    `- **LANDS**, on absolute counts: the cell when at least ${BAR.cell.at} counted AFTER repetitions deliver both pastes and at least ${BAR.cell.at} counted BEFORE repetitions time out at stage read (the background paste's stage meta alone) with the frontmost paste not delivered; composing when at least ${BAR.composing.at} counted AFTER rows deliver exact and at least ${BAR.composing.at} counted BEFORE rows time out at read. A premise failure lowers the counted number, so it only makes LANDS harder; the one miss a full half allows covers any failure but an AFTER read timeout. Otherwise INCONCLUSIVE.`,
    '- A failure with no stage meta (the legacy -10005, stage unknown) is a miss: never a read timeout, never a failure at another stage. On an attested half it is unexpected, so each counted one is named under the verdict.',
    '- **Overall**: DOES NOT LAND when either part does; LANDS only when both do; INCONCLUSIVE otherwise.',
    '- Reported, never judged: the key readings, the activation joins, the person\'s side, the swaps\' attestations, #188 (its own verdict) and the owner\'s source.'].join('\n');
}

// The line a failed cleanup puts first, in the verdict file and the drive's output.
export const cleanupAlarm = c => `**!!! THE ENGINE WAS NOT PUT BACK (the owner's end choice ${c?.end ?? 'unrecorded'}): ${c?.problem ?? 'the cleanup did not run'}. The control build may still be installed: see the runbook's "If the cleanup fails".**`;
export function isolateMarkdown(j, {commit = null} = {}) {
  const lines = [...(j.cleanup?.ok === false ? [cleanupAlarm(j.cleanup), ''] : []),
    `# #187: the isolating slot, the inert click as the cause (scripts/cursor-sitting/item-187-isolate.mjs${commit ? `, the kit at ${commit}` : ''})`, '', barText(), '',
    `## Verdict: ${j.verdict}`, '',
    `- the background-paste cell: **${j.cell.verdict}**${j.cell.why.length ? ` (${j.cell.why.join('; ')})` : ''}`,
    `- chrome/composing@textedit: **${j.composing.verdict}**${j.composing.why.length ? ` (${j.composing.why.join('; ')})` : ''}`,
    ...j.stageUnknown.map(u => `- **Stage unknown, unexpected on an attested half**: ${u.half.toUpperCase()} ${u.where}, ${u.which} failed with no stage meta (a miss by the bar)`), '',
    '## The halves: the preparation\'s pair, each block\'s swap and its attestation', '',
    `The pair recorded at the start: ${j.start?.ok ? `shipping ${short(j.start.pair.shippingBuild)}, control ${short(j.start.pair.controlBuild)}, from ${j.start.pair.source ?? 'its source'}` : `NONE (${j.start?.problem ?? 'the start was not recorded'})`}. The owner's end choice: ${j.start?.end ?? 'not recorded'}.`, '',
    `AFTER's build ${short(j.builds.after.build)}${j.builds.after.problem ? ` (${j.builds.after.problem})` : ''}; BEFORE's ${short(j.builds.before.build)}${j.builds.before.problem ? ` (${j.builds.before.problem})` : ''}.`, '',
    '| block | half | swap | approve | the ping (build, variant) | counts (checked again from the records) |', '|---|---|---|---|---|---|'];
  for (const s of j.swaps) {
    if (!s.recorded) { lines.push(`| ${s.n} | ${s.half} | not recorded | – | – | – |`); continue; }
    lines.push(`| ${s.n} | ${s.half} | ${s.swap ? s.swap.ok ? `restored ${short(s.swap.saved)}` : `FAILED: ${s.swap.problem}` : s.stopped ? `stopped: ${s.stopped}` : '–'} | ${s.swap?.approved ? `${yes(s.swap.approved.approved)}, capture confirmation ${s.swap.approved.captureConfirmation ?? '–'}` : '–'} | ${nativeText(s.attest?.observed)} | ${s.valid ? 'yes' : `NO: ${s.problem}`} |`);
  }
  const counts = (part, p) => `AFTER ${p.counts.after.met} of ${p.counts.after.counted} counted met (${p.counts.after.readTimeouts} read timeout(s)); BEFORE ${p.counts.before.met} of ${p.counts.before.counted} counted failed as predicted (${p.counts.before.delivers} delivered, ${p.counts.before.otherStage} at another stage, ${p.counts.before.stageUnknown} stage unknown). The bar: at least ${BAR[part].at} counted each way.`;
  lines.push('', '## The background-paste cell', '', 'Per repetition, as on 11-05: Chrome for Testing relaunched clean and placed, TextEdit in front under ABC, one background paste of the Latin string, `open -a`, the key read, one frontmost paste.', '',
    '| half | rep | block | status | background: click / kind / join | the ping | background paste | stage / read | frontmost paste | stage / read |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const half of HALVES) for (const c of j.cells[half]) {
    const r = c.record;
    lines.push(`| ${half} | ${c.rep + 1} | ${c.block ?? '–'} | ${statusText(c)} | ${r ? `${r.background?.activationClick ?? '–'} / ${kindText(r.background?.activationClickKind)} / ${r.background?.activationJoin ?? '–'}` : '–'} | ${nativeText(r?.background?.nativeEngine)} | ${pasteState(r?.background)} | ${stageText(r?.background)} | ${pasteState(r?.row)} | ${stageText(r?.row)} |`);
  }
  lines.push('', counts('cell', j.cell), '', '## chrome/composing@textedit', '', 'Hold 3\'s nine paste rows, a third a block, behind a fresh Hangul composition in TextEdit\'s run window.', '',
    '| half | item | row | status | click / kind | the ping | delivered | stage / read |', '|---|---|---|---|---|---|---|---|');
  for (const half of HALVES) for (const e of j.composingRows[half]) {
    const r = e.record;
    lines.push(`| ${half} | ${e.item} | ${r.id} | ${statusText(e)} | ${r.activationClick ?? '–'} / ${kindText(r.activationClickKind)} | ${nativeText(r.nativeEngine)} | ${pasteState(r)} | ${stageText(r)} |`);
  }
  lines.push('', counts('composing', j.composing), ...(j.composingStops.length ? ['', `Stopped: ${j.composingStops.map(([n, e]) => `${n} (${e})`).join('; ')}.`] : []));
  lines.push('', '## The mechanism (reported, never the verdict)', '', 'The counted repetitions\' key readings of Chrome\'s run window and page, before and after `open -a`, and the background pastes\' activation joins and click kinds.', '',
    '| half | before `open -a` | after `open -a` | activation joins | click kinds (every recorded) |', '|---|---|---|---|---|',
    ...HALVES.map(half => `| ${half} | ${listed(j.mechanism[half].before)} | ${listed(j.mechanism[half].after)} | ${listed(j.mechanism[half].joins)} | ${listed(j.mechanism[half].kinds)} |`),
    '', '## The person\'s side (reported, never the verdict)', '', ...HALVES.map(half => `- ${half}: ${j.person[half].rows} counted row(s); ${listed(j.person[half].flags)}`));
  lines.push('', `## The AFTER-only block (block ${AFTER_BLOCK}) and the tail`, '', ...[...AFTER_ONLY, ...TAIL].map(s => `- ${s.id}: ${s.what}`), '',
    `- C2, the keys-then-click row: **${j.raise.verdict}**`, `- C3, the dialog variant: **${j.dialog.verdict}**`, '- C4 (b) and (c): measured, no verdict', '',
    'C2\'s and C3\'s verdicts are their own, never the isolating verdict above.', '',
    ...(j.item188.attest.length ? [`#188's cua items on the AFTER build: ${j.item188.attest.map(a => `${a.item} ${a.actions - a.unattested} of ${a.actions} action(s) attested${a.first ? `; the rest made invalid before #188's judge (${a.first})` : ''}`).join('; ')}.`, ''] : []),
    ...markdown188(j.item188), ...joinMarkdown(j.raise), ...joinMarkdown(j.dialog), ...tailMarkdown(j.tail));
  lines.push(`The owner's input source at the end: ${j.restore.ok ? `restored (${j.restore.current}, read back)` : `NOT restored (${j.restore.why})`}.`, '',
    `The cleanup (the owner's end choice, ${j.cleanup?.end ?? 'not recorded'}): ${j.cleanup?.ok ? `${SAVED[j.cleanup.target]} restored and attested (${short(j.cleanup.build)}, no variant)` : `NOT DONE (${j.cleanup?.problem ?? 'not recorded'})`}.`);
  return `${lines.join('\n')}\n`;
}
