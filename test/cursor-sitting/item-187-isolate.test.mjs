// #187's isolating slot (scripts/cursor-sitting/item-187-isolate.mjs) and its control build
// (scripts/cursor-sitting/control-build.mjs): the plan (A B B A A B, each block a swap, 2 cell repetitions and 3 composing
// rows; the AFTER-only block with #188's part; the seams), the swap's restore, headless approve and attestation, the
// premise per repetition and per row, every branch of the verdict for the cell and for composing, the verdict file, the
// control copy (the define on the Engine target alone, its own build id) and the CLI's dry runs. Nothing is driven.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {main, read187} from '../../scripts/cursor-sitting.mjs';
import {CONTROL_DEFINE, CONTROL_RECORD, CONTROL_VARIANT, checkPair, controlPackage, prepareControlSource} from '../../scripts/cursor-sitting/control-build.mjs';
import {abortableIo, AFTER_BLOCK, AFTER_ONLY, attested188, isolateExit, putBackReading, signalGuard, attestProblem, cleanupAlarm, cleanupSteps, driveThenCleanup, startOf, BAR, BLOCKS, CELL_PER_HALF, combineVerdict, COMPOSING_PER_HALF, GOES_ON_ISO, isolateMarkdown, isolatePlan, isolateTasks, ITEMS, judgeIsolate,
  LABELS, MIN_COUNTED, ORDER, parseBlocks, partVerdict, repPremise, rowPremise, SAVED, stepCounts, TAIL, THIRDS, VERDICT_FILE} from '../../scripts/cursor-sitting/item-187-isolate.mjs';
import {CELL_ROW, driveItems, ITEMS as ITEMS_187, plan187, rowRecord, VENDOR_ROWS} from '../../scripts/cursor-sitting/item-187.mjs';
import {ITEMS_188, LABELS_188} from '../../scripts/cursor-sitting/item-188.mjs';
import {describeStep, runSteps} from '../../scripts/cursor-sitting/runner.mjs';
import {ENGINE_SOURCE, engineBuild} from '../../src/runtime/engine-bundle.mjs';

const scratch = t => { const dir = mkdtempSync(join(tmpdir(), 'cua-187i-')); t.after(() => rmSync(dir, {recursive: true, force: true})); return dir; };
const quietly = async run => { const write = process.stdout.write; let text = ''; process.stdout.write = chunk => { text += chunk; return true; }; try { return {code: await run(), text}; } finally { process.stdout.write = write; } };
const BUILD = {after: 'a'.repeat(64), before: 'c'.repeat(64)};
const NATIVE = {after: {engine: 'cua', version: '0.1.0', build: BUILD.after}, before: {engine: 'cua', version: '0.1.0', build: BUILD.before, variant: CONTROL_VARIANT}};
const KIND = {after: {kind: 'inertOutside', point: 'offset', when: 'early'}, before: {kind: 'skipped', skippedReason: 'controlBuild'}};
const PIDS = {chrome: 201, textedit: 202};
const ZERO = {windowFocus: 0, windowBlur: 0, textFocus: 0, textBlur: 0, mousedown: 0, click: 0};
const start = {kind: 'start'};
// The saved dd7a's error, which names no stage.
const LEGACY = 'Computer Use server error -10005: Timed out waiting for the application to read the clipboard';

// One paste row's record as rowRecord makes it: on `half`'s engine, delivered or timing out at the read (`outcome`:
// delivered | read | effect), `over` replacing any reading.
function pasteRow({half, group, item, key, row = CELL_ROW, outcome = half === 'after' ? 'delivered' : 'read', prior = 0, native = NATIVE[half], kind = KIND[half], click = 'outsideFrame', ...over}) {
  const background = group !== 'chrome-cell', delivered = outcome === 'delivered', expectedLength = prior + row.string.text.length;
  const paste = delivered ? {stage: 'effect', confirmed: true, readWait: 'handedOver', effectWait: 'reading', focusEnforcement: {activated: true}, perLine: [{line: 1, confirmed: true, effectWait: 'reading', baseline: {c: 0}, confirming: {c: 1}}]}
    : outcome === 'read' ? {stage: 'read', readWait: 'timeout', confirmed: null} : outcome === 'legacy' ? null : {stage: 'effect', readWait: 'handedOver', effectWait: 'timeout', confirmed: false};
  return rowRecord({
    spec: {key, item, group, block: 0, i: 0, string: row.string.id, method: row.method, expectedLength, lines: 1, regime: background ? 'background' : 'frontmost', engine: 'cua'},
    prepare: {ok: true, value: {ready: true}},
    act: {ok: true, value: {actMs: delivered ? 180 : 2100, threw: !delivered, message: delivered ? null : outcome === 'legacy' ? LEGACY : 'timed out'}, route: 'paste', nativeEngine: native,
      meta: {activationGuardMs: 40, activationClick: click, activationClickKind: kind, activationJoin: 'fresh', ...(paste ? {paste} : {})}},
    check: {ok: true, value: {ok: delivered, outcome: {exact: delivered, length: delivered ? expectedLength : prior, expectedLength}}},
    page: {mid: {seq: 4, length: prior, counts: {...ZERO}, focused: !background}, after: {seq: 5, length: delivered ? expectedLength : prior, counts: {...ZERO}, focused: !background}},
    front: background ? {mid: PIDS.textedit, after: PIDS.textedit, expected: PIDS.textedit} : {mid: PIDS.chrome, after: PIDS.chrome, expected: PIDS.chrome},
    stateAtStart: background ? 'front-above' : null, userKept: group === 'chrome-composing' ? true : null, clipboard: {mid: 'd', after: 'd'},
    menu: {read: {trusted: true, ok: true, selected: 0, openMenus: 0, focusedRole: 'AXTextArea'}, observed: 0}, ...over});
}
const KEY = {trusted: true, ok: true, frontmost: true, found: true, focused: false, main: true, focusedWindow: 'run', mainWindow: 'run'};
// One background-paste repetition's '187-cell' record, as predicted on its half; `bg` and `fg` replace the pastes' options.
function cellRecord(half, rep, {bg = {}, fg = {}, ...over} = {}) {
  const item = ITEMS.cell(half, rep), background = pasteRow({half, group: 'chrome-cell-background', item, key: `${item}#0.0`, ...bg});
  const prior = background.delivered ? CELL_ROW.string.text.length : 0;
  return {tag: `${item}#0`, half, rep, route: 'paste', personTouched: null, keyBefore: {reading: {...KEY, frontmost: false}, pageFocused: false}, keyAfter: {reading: KEY, pageFocused: true},
    background, row: pasteRow({half, group: 'chrome-cell', item, key: `${item}#1.0`, prior, ...fg}), ...over};
}
const swapRows = (n, half, {build = BUILD[half], attested = true, observed = NATIVE[half]} = {}) => [start, {kind: 'task', task: '187-iso-swap', result: {ok: true, half, saved: build, approved: {approved: true, captureConfirmation: 'none'}}},
  {kind: 'task', task: '187-iso-attest', result: {ok: attested, half, expected: {build, variant: NATIVE[half].variant ?? null}, observed, ...(attested ? {} : {problem: 'no'})}}];
// The drive's start: the preparation's pair and the owner's end choice.
const OWNER = 'f'.repeat(64), OWNER_NATIVE = {engine: 'cua', version: '0.1.0', build: OWNER};
const START = {ok: true, pair: {shippingBuild: BUILD.after, controlBuild: BUILD.before, source: '/src'}, end: 'restore-owner', ownerBuild: OWNER};
// The cleanup's records: the owner's save restored and its ping attested.
const cleanupRows = ({observed = OWNER_NATIVE, saved = OWNER, ok = true} = {}) => [start, {kind: 'task', task: '187-iso-swap', result: {ok, half: 'owner', saved, ...(ok ? {} : {problem: 'the restore refused'})}},
  ...(ok ? [{kind: 'task', task: '187-iso-attest', result: {ok: true, half: 'owner', observed}}] : [])];
const composingRow = (half, index, k, over = {}) => pasteRow({half, group: 'chrome-composing', item: ITEMS.composing(half, index), key: `${ITEMS.composing(half, index)}#0.${k}`, row: THIRDS[index][k], ...over});

// The whole slot's evidence, every premise holding and every half as predicted; `cell(half, rep)` and `row(half, index, k)`
// give a repetition's or a row's options.
function evidence({cell = () => ({}), row = () => ({}), swaps = true, end = true, begin = START, cleanup = true} = {}) {
  const items = {};
  if (begin) items[ITEMS.start] = [start, {kind: 'task', task: '187-iso-start', result: begin}];
  if (cleanup) items[ITEMS.cleanup] = cleanupRows();
  if (swaps) for (const b of [...BLOCKS, {n: AFTER_BLOCK, half: 'after'}]) items[ITEMS.swap(b.n)] = swapRows(b.n, b.half);
  for (const half of ['after', 'before']) {
    for (let rep = 0; rep < CELL_PER_HALF; rep++) { const o = cell(half, rep); if (o !== null) items[ITEMS.cell(half, rep)] = [start, {kind: 'task', task: '187-cell', result: cellRecord(half, rep, o)}]; }
    for (let index = 0; index < 3; index++) items[ITEMS.composing(half, index)] = [start, ...THIRDS[index].map((_, k) => ({kind: 'task', task: '187-row', result: composingRow(half, index, k, row(half, index, k))}))];
  }
  if (end) items[ITEMS.end] = [start, {kind: 'task', task: 'select-source', result: {ok: true, switched: true, requested: 'com.apple.keylayout.ABC', current: {id: 'com.apple.keylayout.ABC'}}}];
  return items;
}
const on = (half, reps) => (h, rep) => (h === half && reps.includes(rep));

test('the plan: the placement, six blocks A B B A A B (a swap, 2 cell repetitions, 3 composing rows), the AFTER-only block with #188\'s part, the end', () => {
  assert.deepEqual(ORDER, ['after', 'before', 'before', 'after', 'after', 'before']);
  assert.equal(CELL_PER_HALF, 6);
  assert.equal(COMPOSING_PER_HALF, 9);
  assert.deepEqual(THIRDS.flat(), [...VENDOR_ROWS], 'each half pastes every string once');
  const plan = isolatePlan();
  const items = plan.map(p => p.item);
  assert.deepEqual(items.slice(0, 2), [ITEMS.start, ITEMS.place], 'the pair and the end choice recorded first');
  assert.ok(plan[0].steps.find(s => s.task === '187-iso-start').required);
  assert.equal(items.at(-1), ITEMS.end);
  for (const b of BLOCKS) {
    const block = plan.filter(p => p.block === b.n);
    assert.deepEqual(block.map(p => p.item), [ITEMS.swap(b.n), ITEMS.cell(b.half, 2 * b.index), ITEMS.cell(b.half, 2 * b.index + 1), ITEMS.composing(b.half, b.index)], `block ${b.n}`);
    assert.deepEqual(block.map(p => p.stage), ['swap', 'cell', 'cell', 'composing']);
    assert.ok(block.every(p => p.half === b.half));
  }
  for (const half of ['after', 'before']) {
    assert.deepEqual(plan.filter(p => p.stage === 'cell' && p.half === half).map(p => p.rep), [0, 1, 2, 3, 4, 5]);
    const rows = plan.filter(p => p.stage === 'composing' && p.half === half).flatMap(p => p.steps.filter(s => s.task === '187-row'));
    assert.equal(rows.length, 9);
  }
  // The AFTER-only block: a swap to AFTER, then #188's part exactly as `--part 188` plans it, then C2's and C3's
  // repetitions; the tail (C4) after them, before the end.
  const afterOnly = plan.filter(p => p.block === AFTER_BLOCK);
  assert.deepEqual(afterOnly[0], {...afterOnly[0], item: ITEMS.swap(AFTER_BLOCK), half: 'after', stage: 'swap'});
  const part188 = afterOnly.filter(p => p.stage === '188' || p.stage === 'place' || p.stage === 'end');
  assert.deepEqual(part188.map(p => p.item), plan187({part: '188'}).map(p => p.item));
  assert.deepEqual(part188.map(p => p.steps.map(describeStep)), plan187({part: '188'}).map(p => p.steps.map(describeStep)));
  assert.ok(afterOnly.some(p => p.item === ITEMS_188.rows('cua')));
  assert.deepEqual(afterOnly.slice(1 + part188.length).map(p => p.stage), ['raise', 'raise', 'raise', 'dialog', 'dialog', 'dialog', 'tail', 'tail']);
  assert.deepEqual(plan.slice(-3).map(p => p.stage), ['tail', 'tail', 'end'], 'the tail runs after every verdict item, right before the end');
  assert.deepEqual(AFTER_ONLY.map(s => s.id), ['188', 'C2', 'C3']);
  assert.deepEqual(TAIL.map(s => s.id), ['C4b', 'C4c']);
  assert.deepEqual(GOES_ON_ISO, ['cell', 'composing', '188', 'raise', 'dialog', 'tail'], 'a swap, the placement or the end stopping stops the drive');
  // Nothing of the 11-05 re-slot's items, so its judge never reads this slot's.
  assert.ok(!items.some(i => /^187-(cell|press|chrome|place|end|premise|putback)/.test(i)));
});

test('a swap: the restore and the headless approve required, then one observation in a fresh session and the attestation required', () => {
  const steps = isolatePlan().find(p => p.item === ITEMS.swap(2)).steps;
  const tasks = steps.filter(s => s.task);
  assert.deepEqual(tasks.map(s => [s.task, ...s.args]), [['187-iso-swap', `${ITEMS.swap(2)}#0`, 'before'], ['187-iso-attest', `${ITEMS.swap(2)}#0`, 'before']]);
  assert.ok(tasks.every(s => s.required));
  const order = steps.map(s => s.task ?? (s.open ? 'open' : s.close ? 'close' : s.run ? 'run' : null)).filter(Boolean);
  assert.deepEqual(order, ['187-iso-swap', 'open', 'run', 'close', '187-iso-attest']);
  const run = steps.find(s => s.run);
  assert.equal(run.label, LABELS.attest(`${ITEMS.swap(2)}#0`));
  assert.ok(run.required);
  assert.ok(!/__app\.(click|paste|typeText|pressKey|setValue)/.test(run.cell), 'the attestation only observes');
});

test('the cell and composing items: the kit\'s own cell under the slot\'s names, composing placed first behind a fresh composition', () => {
  const plan = isolatePlan(), cell = plan.find(p => p.item === ITEMS.cell('before', 3));
  assert.deepEqual(cell.steps.find(s => s.task === '187-cell').args, [`${ITEMS.cell('before', 3)}#0`, 'before', '3', 'paste']);
  assert.ok(cell.steps.some(s => s.task === '187-relaunch' && s.args[0] === ITEMS.cell('before', 3)));
  const composing = plan.find(p => p.item === ITEMS.composing('after', 1)).steps, tasks = composing.filter(s => s.task).map(s => s.task);
  assert.ok(tasks.indexOf('187-place') < tasks.indexOf('187-arrange') && tasks.indexOf('187-arrange') < tasks.indexOf('187-compose'));
  assert.equal(composing.filter(s => s.open).length, 1, 'one fresh composition a block');
  assert.equal(composing.filter(s => s.run && / act: paste\./.test(s.label)).length, 3);
  assert.deepEqual(composing.filter(s => s.run && / act: /.test(s.label)).map(s => s.label.split('act: ')[1]), THIRDS[1].map(r => `paste.${r.string.id}`));
  // A person-touched repetition's replacement: the next number of its half, in its block.
  const r = cell.replace(7000);
  assert.deepEqual([r.item, r.block, r.half], [ITEMS.cell('before', 6), 4 - 1, 'before']);
  assert.deepEqual(r.steps[0], {task: '187-replaces', args: [ITEMS.cell('before', 3), '7000']});
  assert.equal(plan.find(p => p.item === ITEMS.cell('before', 5)).replace(1).item, ITEMS.cell('before', 7));
});

test('--blocks: some blocks only, the placement and the end always; the step counts per block', () => {
  assert.deepEqual(parseBlocks(undefined), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(parseBlocks('4-7'), [4, 5, 6, 7]);
  assert.deepEqual(parseBlocks('2,5'), [2, 5]);
  assert.deepEqual(parseBlocks('3'), [3]);
  assert.throws(() => parseBlocks('a'), /--blocks takes numbers and ranges/);
  assert.throws(() => isolatePlan({blocks: [8]}), /--blocks takes block numbers of 1\.\.7/);
  const only = isolatePlan({blocks: [3]});
  assert.deepEqual(only.map(p => p.item), [ITEMS.start, ITEMS.place, ITEMS.swap(3), ITEMS.cell('before', 2), ITEMS.cell('before', 3), ITEMS.composing('before', 1), ITEMS.end]);
  const counts = stepCounts(isolatePlan());
  assert.deepEqual(counts.map(c => c.block), [0, 1, 2, 3, 4, 5, 6, 7, 'tail', null]);
  assert.equal(counts.reduce((n, c) => n + c.steps, 0), isolatePlan().reduce((n, p) => n + p.steps.length, 0));
  assert.match(counts[7].label, /block 7, AFTER only \(188, C2, C3\)/);
  assert.equal(counts[8].label, 'the tail (C4b, C4c)');
  // --no-tail: the tail left out, every verdict item kept.
  const noTail = stepCounts(isolatePlan({tail: false}));
  assert.deepEqual(noTail.map(c => c.block), [0, 1, 2, 3, 4, 5, 6, 7, null]);
  assert.ok(!isolatePlan({tail: false}).some(p => p.stage === 'tail'));
  assert.equal(noTail[7].steps, counts[7].steps);
});

test('the attestation: the saved build and the half\'s variant, from the result\'s cua/nativeEngine', () => {
  assert.equal(attestProblem(NATIVE.after, {build: BUILD.after, variant: null}), null);
  assert.equal(attestProblem(NATIVE.before, {build: BUILD.before, variant: CONTROL_VARIANT}), null);
  assert.match(attestProblem(NATIVE.before, {build: BUILD.after, variant: null}), /build was cccccccccccc, not the half's saved aaaaaaaaaaaa/);
  assert.match(attestProblem({...NATIVE.after, build: BUILD.before}, {build: BUILD.before, variant: CONTROL_VARIANT}), /variant was absent, not control-no-inert-click/);
  assert.match(attestProblem({...NATIVE.after, variant: CONTROL_VARIANT}, {build: BUILD.after, variant: null}), /variant was control-no-inert-click, not absent/);
  assert.match(attestProblem(null, {build: BUILD.after, variant: null}), /no cua\/nativeEngine/);
  assert.match(attestProblem({...NATIVE.after, engine: 'vendor'}, {build: BUILD.after, variant: null}), /engine was vendor/);
  assert.match(attestProblem(NATIVE.after, {build: null, variant: null}), /saved build is not known/);
});

test('the swap\'s tasks: restored and approved with no prompt, else refused with why; the attestation reads the observation\'s ping', async () => {
  const calls = [];
  const tasks = (over = {}) => isolateTasks({halves: '/halves', now: () => 99, start: START, savedRecord: dir => ({status: {build: dir.endsWith('engine-control') ? BUILD.before : BUILD.after}}),
    restore: async args => { calls.push(['restore', args]); return {ok: true, status: {build: BUILD.before, approved: true, matches: true}}; },
    approve: async () => { calls.push(['approve']); return {ok: true, approved: true, build: BUILD.before, captureConfirmation: 'none', grants: {accessibility: true}}; }, ...over});
  const ctx = {results: {}};
  const swapped = await tasks()['187-iso-swap'](['187-iso-swap-2#0', 'before'], ctx);
  assert.equal(swapped.ok, true, swapped.problem);
  assert.deepEqual(calls, [['restore', {from: '/halves/engine-control', aside: '/halves/aside/187-iso-swap-2-99'}], ['approve']]);
  ctx.results[LABELS.attest('187-iso-swap-2#0')] = {ok: true, nativeEngine: NATIVE.before};
  assert.equal((await tasks()['187-iso-attest'](['187-iso-swap-2#0', 'before'], ctx)).ok, true);
  ctx.results[LABELS.attest('187-iso-swap-2#0')] = {ok: true, nativeEngine: NATIVE.after};
  const wrong = await tasks()['187-iso-attest'](['187-iso-swap-2#0', 'before'], ctx);
  assert.equal(wrong.ok, false);
  assert.match(wrong.problem, /build was aaaaaaaaaaaa/);
  assert.match((await tasks()['187-iso-attest'](['187-iso-swap-3#0', 'before'], {results: {}})).problem, /saved build is not known/, 'no swap in this item: nothing attests');
  const refuse = async (over, why) => { const r = await tasks(over)['187-iso-swap'](['187-iso-swap-2#0', 'before'], {results: {}}); assert.equal(r.ok, false, why.source); assert.match(r.problem, why); };
  await refuse({approve: async () => ({ok: false, error: {code: 'engine_capture_confirmation', message: 'a screen capture confirmation may be waiting'}})}, /approve did not pass with no terminal \(a screen capture confirmation may be waiting\): a prompt or a grant needs the owner/);
  await refuse({approve: async () => ({ok: false, approved: false, reason: 'the relaunched engine did not report captured: true'})}, /did not report captured/);
  await refuse({approve: async () => ({ok: true, approved: true, build: BUILD.before, captureConfirmation: 'answered'})}, /capture confirmation \(answered\): a prompt needs the owner/);
  await refuse({approve: async () => ({ok: true, approved: true, build: BUILD.after, captureConfirmation: 'none'})}, /approved build is aaaaaaaaaaaa, not the saved cccccccccccc/);
  await refuse({restore: async () => { throw new Error('the saved copy no longer matches its record; nothing was changed'); }}, /restore refused: the saved copy no longer matches/);
  await refuse({restore: async () => ({ok: false, status: {build: BUILD.before, approved: false}, next: 'run cua engine approve with the owner'})}, /restore did not end on the saved build, approved: run cua engine approve/);
  await refuse({savedRecord: () => { throw new Error('ENOENT'); }}, /saved\.json could not be read \(ENOENT\)/);
  await refuse({savedRecord: () => ({status: {}})}, /names no build/);
  // The save must be the preparation's own: an older or newer control fails before anything is restored.
  calls.length = 0;
  await refuse({savedRecord: () => ({status: {build: 'd'.repeat(64)}})}, /engine-control's build dddddddddddd is not this preparation's cccccccccccc/);
  await refuse({start: {...START, ok: false}}, /no preparation pair was recorded/);
  assert.deepEqual(calls, [], 'nothing restored');
  // The owner's save, for the cleanup: the build the start recorded, no variant.
  const owner = tasks({savedRecord: dir => ({status: {build: dir.endsWith('engine-owner') ? OWNER : BUILD.after}}), approve: async () => ({ok: true, approved: true, build: OWNER, captureConfirmation: 'none'})});
  const octx = {results: {}};
  assert.equal((await owner['187-iso-swap'](['187-iso-cleanup#0', 'owner'], octx)).ok, true);
  octx.results[LABELS.attest('187-iso-cleanup#0')] = {nativeEngine: OWNER_NATIVE};
  assert.equal((await owner['187-iso-attest'](['187-iso-cleanup#0', 'owner'], octx)).ok, true);
  octx.results[LABELS.attest('187-iso-cleanup#0')] = {nativeEngine: {...OWNER_NATIVE, variant: CONTROL_VARIANT}};
  assert.match((await owner['187-iso-attest'](['187-iso-cleanup#0', 'owner'], octx)).problem, /variant was control-no-inert-click, not absent/);
  assert.match((await tasks({start: {...START, ownerBuild: 'e'.repeat(64)}, savedRecord: () => ({status: {build: OWNER}})})['187-iso-swap'](['187-iso-cleanup#0', 'owner'], {results: {}})).problem, /not the owner save the start recorded/);
});

test('the premise per repetition: attested, the click planned outside the frame and of the half\'s kind, both pastes valid, not the person\'s', () => {
  const at = (half, record) => repPremise(record, {half, build: BUILD[half]});
  assert.deepEqual(at('after', cellRecord('after', 0)), ['counted', null]);
  assert.deepEqual(at('before', cellRecord('before', 0)), ['counted', null]);
  const cases = [
    ['after', {personTouched: {apps: ['x'], frontPids: []}}, 'person-touched', /touched by the person/],
    ['after', {bg: {native: NATIVE.before}}, 'not attested', /the background paste: the result's build was cccccccccccc/],
    ['before', {bg: {native: {...NATIVE.before, variant: undefined}}}, 'not attested', /variant was absent, not control-no-inert-click/],
    ['before', {fg: {native: null}}, 'not attested', /the frontmost paste: the result carried no cua\/nativeEngine/],
    ['after', {bg: {click: 'posted'}}, 'premise not met', /activation click was posted, not planned outside the frame/],
    ['after', {bg: {kind: KIND.before}}, 'premise not met', /activationClickKind skipped controlBuild, not inertOutside early/],
    ['before', {bg: {kind: KIND.after}}, 'premise not met', /activationClickKind inertOutside offset early, not skipped controlBuild/],
    ['after', {bg: {kind: {...KIND.after, when: 'release'}}}, 'premise not met', /not inertOutside early/],
    ['before', {bg: {kind: null}}, 'premise not met', /no activationClickKind recorded/],
    ['after', {bg: {stateAtStart: 'back-above'}}, 'invalid', /the background paste was invalid \(the window order at the act was back-above/],
  ];
  for (const [half, over, status, why] of cases) {
    const [s, w] = at(half, cellRecord(half, 0, over));
    assert.equal(s, status, String(why));
    assert.match(w, why);
  }
  assert.deepEqual(at('after', {...cellRecord('after', 0), background: null}), ['premise not met', 'the background paste was not recorded']);
  // A composing row: the same premise, row by row.
  assert.deepEqual(rowPremise(composingRow('before', 0, 0), {half: 'before', build: BUILD.before}), ['counted', null]);
  assert.equal(rowPremise(composingRow('before', 0, 0, {kind: KIND.after}), {half: 'before', build: BUILD.before})[0], 'premise not met');
  assert.equal(rowPremise(composingRow('after', 0, 0, {userKept: false, disturbed: true}), {half: 'after', build: BUILD.after})[0], 'invalid');
});

test('the cell\'s verdict (RULINGS 2): LANDS on absolute counts; DOES NOT LAND each way at any count; INCONCLUSIVE below 4 counted only when nothing decisive happened', () => {
  const verdictOf = options => judgeIsolate(evidence(options)).cell;
  assert.equal(verdictOf({}).verdict, 'LANDS');
  assert.deepEqual(verdictOf({}).counts, {after: {counted: 6, met: 6, readTimeouts: 0}, before: {counted: 6, met: 6, delivers: 0, otherStage: 0, stageUnknown: 0}});
  // 5 of 6 each way: the one miss covers any failure but an AFTER read timeout.
  assert.equal(verdictOf({cell: (h, rep) => (h === 'after' && rep === 2 ? {fg: {outcome: 'effect'}} : h === 'before' && rep === 4 ? {bg: {outcome: 'effect'}} : {})}).verdict, 'LANDS');
  // Ruling 1: absolute counts. Exactly 5 counted each way, all as predicted, lands; a premise failure only lowers the count.
  assert.equal(verdictOf({cell: (h, rep) => (on('after', [0])(h, rep) || on('before', [5])(h, rep) ? {bg: {click: 'posted'}} : {})}).verdict, 'LANDS');
  const dnl = [
    ['ruling 2: one counted AFTER read-stage timeout (the frontmost paste)', {cell: (h, rep) => (on('after', [4])(h, rep) ? {fg: {outcome: 'read'}} : {})}, /1 read-stage timeout\(s\) on AFTER, counted/],
    ['ruling 2: one counted AFTER read-stage timeout (the background paste)', {cell: (h, rep) => (on('after', [1])(h, rep) ? {bg: {outcome: 'read'}} : {})}, /1 read-stage timeout/],
    ['ruling 2 at a low count: an AFTER read timeout with 3 counted', {cell: (h, rep) => (on('after', [0, 1, 2])(h, rep) ? {bg: {click: 'posted'}} : on('after', [3])(h, rep) ? {fg: {outcome: 'read'}} : {})}, /1 read-stage timeout/],
    ['BEFORE delivers the background paste in 2', {cell: (h, rep) => (on('before', [1, 4])(h, rep) ? {bg: {outcome: 'delivered'}} : {})}, /BEFORE delivered in 2 counted/],
    ['ruling 3 at a low count: BEFORE delivers in 2 of 2 counted', {cell: (h, rep) => (on('before', [0, 1, 2, 3])(h, rep) ? {bg: {kind: KIND.after}} : on('before', [4, 5])(h, rep) ? {bg: {outcome: 'delivered'}} : {})}, /BEFORE delivered in 2 counted/],
    ['BEFORE fails at a stage other than read in 2', {cell: (h, rep) => (on('before', [0, 5])(h, rep) ? {bg: {outcome: 'effect'}} : {})}, /BEFORE failed at a stage other than read in 2 counted/],
    ['AFTER fails the delivery bar', {cell: (h, rep) => (on('after', [0, 3])(h, rep) ? {fg: {outcome: 'effect'}} : {})}, /AFTER missed its delivery in 2 of 6 counted/],
  ];
  for (const [what, options, why] of dnl) {
    const v = verdictOf(options);
    assert.equal(v.verdict, 'DOES NOT LAND', what);
    assert.match(v.why.join('; '), why, what);
  }
  const inconclusive = [
    ['3 counted on AFTER (premise failures), nothing decisive', {cell: (h, rep) => (on('after', [0, 1, 2])(h, rep) ? {bg: {click: 'posted'}} : {})}, /fewer than 4 counted in a half \(AFTER 3, BEFORE 6\), and nothing decisive/],
    ['3 counted on BEFORE (not attested)', {cell: (h, rep) => (on('before', [3, 4, 5])(h, rep) ? {bg: {native: NATIVE.after}} : {})}, /AFTER 6, BEFORE 3/],
    ['repetitions not recorded', {cell: (h, rep) => (on('after', [2, 3, 4])(h, rep) ? null : {})}, /AFTER 3, BEFORE 6/],
    ['ruling 1: 4 counted on AFTER, all delivered: under 5', {cell: (h, rep) => (on('after', [0, 1])(h, rep) ? {bg: {click: 'posted'}} : {})}, /AFTER met its delivery in 4 counted, under 5/],
    ['ruling 1: 5 counted on AFTER with one miss', {cell: (h, rep) => (on('after', [0])(h, rep) ? {bg: {click: 'posted'}} : on('after', [3])(h, rep) ? {fg: {outcome: 'effect'}} : {})}, /AFTER met its delivery in 4 counted, under 5/],
    ['BEFORE one delivery and one other stage: neither twice', {cell: (h, rep) => (on('before', [0])(h, rep) ? {bg: {outcome: 'delivered'}} : on('before', [1])(h, rep) ? {bg: {outcome: 'effect'}} : {})}, /BEFORE failed as predicted in 4 counted, under 5/],
    ['BEFORE\'s frontmost paste delivered twice after a read timeout', {cell: (h, rep) => (on('before', [2, 3])(h, rep) ? {fg: {outcome: 'delivered'}} : {})}, /BEFORE failed as predicted in 4 counted/],
    ['BEFORE with no stage meta in 2: stage unknown, a miss, never decisive', {cell: (h, rep) => (on('before', [2, 3])(h, rep) ? {bg: {outcome: 'legacy'}, fg: {outcome: 'legacy'}} : {})}, /under 5 \(2 with no stage meta, stage unknown\)/],
  ];
  for (const [what, options, why] of inconclusive) {
    const v = verdictOf(options);
    assert.equal(v.verdict, 'INCONCLUSIVE', what);
    assert.match(v.why.join('; '), why, what);
  }
  assert.deepEqual(verdictOf({cell: (h, rep) => (on('before', [2, 3])(h, rep) ? {bg: {outcome: 'legacy'}} : {})}).counts.before, {counted: 6, met: 4, delivers: 0, otherStage: 0, stageUnknown: 2});
});

test('composing\'s verdict (RULINGS 2): at least 8 counted each way; the same decisive and low-count rules; LANDS needs both parts', () => {
  const judged = options => judgeIsolate(evidence(options));
  assert.equal(judged({}).composing.verdict, 'LANDS');
  assert.equal(judged({}).verdict, 'LANDS');
  assert.equal(judged({row: (h, i, k) => (h === 'after' && i === 1 && k === 2 ? {outcome: 'effect'} : h === 'before' && i === 0 && k === 0 ? {outcome: 'effect'} : {})}).composing.verdict, 'LANDS', 'one miss each, not a read timeout');
  assert.equal(judged({row: (h, i, k) => (h === 'after' && i === 0 && k === 0 ? {click: 'posted'} : {})}).composing.verdict, 'LANDS', '8 counted, all delivered');
  const cases = [
    ['BEFORE delivers in 3', {row: (h, i) => (h === 'before' && i === 2 ? {outcome: 'delivered'} : {})}, 'DOES NOT LAND', /BEFORE delivered in 3 counted/],
    ['ruling 3 at a low count: BEFORE 2 counted, both delivered', {row: (h, i, k) => (h === 'before' ? (i === 0 && k < 2 ? {outcome: 'delivered'} : {kind: KIND.after}) : {})}, 'DOES NOT LAND', /BEFORE delivered in 2 counted/],
    ['BEFORE fails at another stage in 2', {row: (h, i, k) => (h === 'before' && k === 1 && i < 2 ? {outcome: 'effect'} : {})}, 'DOES NOT LAND', /stage other than read in 2/],
    ['ruling 2: one AFTER read timeout', {row: (h, i, k) => (h === 'after' && i === 2 && k === 2 ? {outcome: 'read'} : {})}, 'DOES NOT LAND', /1 read-stage timeout\(s\) on AFTER, counted/],
    ['ruling 2 at a low count: AFTER 3 counted, one read timeout', {row: (h, i, k) => (h === 'after' ? (i === 0 && k === 0 ? {outcome: 'read'} : i > 0 ? {kind: KIND.before} : {}) : {})}, 'DOES NOT LAND', /1 read-stage timeout/],
    ['AFTER misses 2 at another stage', {row: (h, i, k) => (h === 'after' && k === 0 && i < 2 ? {outcome: 'effect'} : {})}, 'DOES NOT LAND', /AFTER missed its delivery in 2 of 9/],
    ['3 counted on BEFORE, nothing decisive', {row: (h, i) => (h === 'before' && i > 0 ? {kind: KIND.after} : {})}, 'INCONCLUSIVE', /fewer than 4 counted in a half \(AFTER 9, BEFORE 3\), and nothing decisive/],
    ['ruling 1: BEFORE 7 counted, all as predicted: under 8', {row: (h, i, k) => (h === 'before' && i === 0 && k < 2 ? {native: NATIVE.after} : {})}, 'INCONCLUSIVE', /BEFORE failed as predicted in 7 counted, under 8/],
    ['ruling 1: AFTER 8 counted with one miss', {row: (h, i, k) => (h === 'after' && i === 0 ? (k === 0 ? {click: 'posted'} : k === 1 ? {outcome: 'effect'} : {}) : {})}, 'INCONCLUSIVE', /AFTER met its delivery in 7 counted, under 8/],
  ];
  for (const [what, options, verdict, why] of cases) {
    const j = judged(options);
    assert.equal(j.composing.verdict, verdict, what);
    assert.match(j.composing.why.join('; '), why, what);
    assert.equal(j.cell.verdict, 'LANDS', `${what}: the cell alone lands`);
    assert.equal(j.verdict, verdict, `${what}: the overall verdict follows composing`);
    assert.equal(j.ok, false);
  }
  // A composing row whose result names the other half is not counted.
  assert.equal(judged({row: (h, i, k) => (h === 'after' && k === 0 ? {native: NATIVE.before} : {})}).composingRows.after.filter(r => r.status === 'not attested').length, 3);
});

test('the overall verdict: DOES NOT LAND when either part does, LANDS when both do, INCONCLUSIVE otherwise', () => {
  const v = verdict => ({verdict});
  assert.equal(combineVerdict(v('LANDS'), v('LANDS')), 'LANDS');
  assert.equal(combineVerdict(v('LANDS'), v('DOES NOT LAND')), 'DOES NOT LAND');
  assert.equal(combineVerdict(v('INCONCLUSIVE'), v('DOES NOT LAND')), 'DOES NOT LAND');
  assert.equal(combineVerdict(v('DOES NOT LAND'), v('INCONCLUSIVE')), 'DOES NOT LAND');
  assert.equal(combineVerdict(v('LANDS'), v('INCONCLUSIVE')), 'INCONCLUSIVE');
  assert.equal(combineVerdict(v('INCONCLUSIVE'), v('LANDS')), 'INCONCLUSIVE');
  // partVerdict straight over entries, as a replay calls it.
  const e = (n, over = {}) => Array.from({length: n}, () => ({counted: true, met: true, delivers: false, otherStage: false, stageUnknown: false, readTimeout: false, ...over}));
  assert.equal(partVerdict({after: e(6), before: e(6)}, BAR.cell).verdict, 'LANDS');
  assert.equal(partVerdict({after: e(5), before: e(5)}, BAR.cell).verdict, 'LANDS', 'absolute: 5 counted each way, all met');
  assert.equal(partVerdict({after: e(MIN_COUNTED - 1), before: e(6)}, BAR.cell).verdict, 'INCONCLUSIVE');
  assert.equal(partVerdict({after: e(MIN_COUNTED), before: e(6)}, BAR.cell).verdict, 'INCONCLUSIVE', 'absolute: 4 met is under 5');
  assert.equal(partVerdict({after: e(6), before: [...e(4), ...e(2, {met: false, delivers: true})]}, BAR.cell).verdict, 'DOES NOT LAND');
  assert.equal(partVerdict({after: e(1), before: e(2, {met: false, delivers: true})}, BAR.cell).verdict, 'DOES NOT LAND', 'ruling 3: decisive at any count');
  assert.equal(partVerdict({after: e(1, {met: false, readTimeout: true}), before: e(1)}, BAR.cell).verdict, 'DOES NOT LAND', 'ruling 2: decisive at any count');
  assert.equal(partVerdict({after: [...e(5), ...e(1, {counted: false, met: false})], before: e(6)}, BAR.cell).verdict, 'LANDS', 'an uncounted entry counts for nothing');
});

test('the halves (one preparation\'s pair): every swap checked again from its records, never its stored ok; a repetition or row counts only in a block whose swap counts', () => {
  // A swap that restored another build: its block counts nothing, the rest stands.
  const other = evidence();
  other[ITEMS.swap(4)] = swapRows(4, 'after', {build: 'b'.repeat(64)});
  const j = judgeIsolate(other);
  assert.match(j.swaps.find(s => s.n === 4).problem, /its swap restored bbbbbbbbbbbb, not aaaaaaaaaaaa/);
  assert.deepEqual(j.cells.after.map(c => c.status), ['counted', 'counted', 'not attested', 'not attested', 'counted', 'counted']);
  assert.match(j.cells.after[2].why, /its block 4's swap does not count/);
  assert.equal(j.composingRows.after.filter(r => r.status === 'not attested').length, 3, 'block 4\'s composing rows too');
  assert.equal(j.cell.verdict, 'INCONCLUSIVE', '4 counted on AFTER: under 5');
  // The mismatched pair: the start's preparation names an older shipping build than the saves restored.
  const older = judgeIsolate(evidence({begin: {...START, pair: {...START.pair, shippingBuild: 'b'.repeat(64)}}}));
  assert.ok(older.swaps.filter(s => s.half === 'after').every(s => /its swap restored aaaaaaaaaaaa, not bbbbbbbbbbbb/.test(s.problem)));
  assert.equal(older.builds.after.build, null);
  assert.equal(older.verdict, 'INCONCLUSIVE');
  // No pair recorded (or one the drive's check refused): nothing counts.
  for (const begin of [null, {...START, ok: false, problem: 'refused'}]) {
    const none = judgeIsolate(evidence({begin}));
    assert.match(none.builds.before.problem, /no preparation pair was recorded/);
    assert.ok([...none.cells.after, ...none.cells.before].every(c => !c.counted));
    assert.equal(none.verdict, 'INCONCLUSIVE');
  }
  // The flipped identities: every swap's recorded observation names the other half while its stored ok says true.
  const flipped = evidence();
  for (const b of [...BLOCKS, {n: AFTER_BLOCK, half: 'after'}]) flipped[ITEMS.swap(b.n)] = swapRows(b.n, b.half, {observed: NATIVE[b.half === 'after' ? 'before' : 'after']});
  const f = judgeIsolate(flipped);
  assert.ok(f.swaps.every(s => !s.valid && /the result's build was/.test(s.problem)), 'the stored ok is never trusted');
  assert.equal(f.verdict, 'INCONCLUSIVE');
  assert.equal(f.raise.verdict, 'INCOMPLETE', 'and nothing of block 7 attests AFTER');
  // A swap whose record failed, or whose attestation names the other half, does not count.
  const failed = evidence();
  failed[ITEMS.swap(2)][1] = {kind: 'task', task: '187-iso-swap', result: {ok: false, half: 'before', saved: BUILD.before, problem: 'the approve did not pass'}};
  assert.match(judgeIsolate(failed).swaps.find(s => s.n === 2).problem, /its swap failed \(the approve did not pass\)/);
  const halved = evidence();
  halved[ITEMS.swap(2)][2] = {kind: 'task', task: '187-iso-attest', result: {ok: true, half: 'after', observed: NATIVE.before}};
  assert.match(judgeIsolate(halved).swaps.find(s => s.n === 2).problem, /its attestation names the after half, not before/);
  // A replacement counts in place of the person-touched repetition it replaced, in its parent's block.
  const items = evidence({cell: (h, rep) => (h === 'after' && rep === 1 ? {personTouched: {apps: ['com.apple.ActivityMonitor'], frontPids: []}} : {})});
  items[ITEMS.cell('after', 1)][0] = {...start, at: 5000};
  items[ITEMS.cell('after', 6)] = [{...start, at: 6000}, {kind: 'task', task: '187-replaces', result: {ok: true, parent: ITEMS.cell('after', 1), attempt: 5000}}, {kind: 'task', task: '187-cell', result: cellRecord('after', 6)}];
  const r = judgeIsolate(items);
  assert.deepEqual(r.cells.after.map(c => c.status), ['counted', 'person-touched', 'counted', 'counted', 'counted', 'counted', 'counted']);
  assert.equal(r.cells.after.at(-1).block, 1);
  assert.equal(r.cell.counts.after.counted, 6);
  items[ITEMS.swap(1)] = swapRows(1, 'after', {observed: NATIVE.before});
  assert.equal(judgeIsolate(items).cells.after.at(-1).status, 'not attested', 'its parent\'s block\'s swap does not count');
  items[ITEMS.swap(1)] = swapRows(1, 'after');
  items[ITEMS.cell('after', 6)][1].result.attempt = 1;
  assert.equal(judgeIsolate(items).cells.after.at(-1).status, 'stale replacement');
});

test('the verdict file: the pre-registered bar, the verdict and each part, the swaps, every repetition and row, the mechanism, #188 and the source', () => {
  const md = isolateMarkdown(judgeIsolate(evidence()), {commit: '0123456789ab'});
  assert.match(md, /^# #187: the isolating slot, the inert click as the cause \(scripts\/cursor-sitting\/item-187-isolate\.mjs, the kit at 0123456789ab\)/);
  assert.match(md, /\*\*The bar, pre-registered\*\*/);
  assert.match(md, /RULINGS 2 on the judge's readings, 1ea561bc:400/);
  assert.match(md, /\*\*DOES NOT LAND\*\* for a part, at any count: any counted AFTER read-stage timeout; BEFORE delivering in 2 or more counted/);
  assert.match(md, /\*\*INCONCLUSIVE\*\* for a part when nothing decisive happened and a half has fewer than 4 counted/);
  assert.match(md, /the cell when at least 5 counted AFTER repetitions deliver both pastes and at least 5 counted BEFORE repetitions time out at stage read/);
  assert.match(md, /composing when at least 8 counted AFTER rows deliver exact and at least 8 counted BEFORE rows time out at read/);
  assert.match(md, /## Verdict: LANDS\n/);
  assert.match(md, /- the background-paste cell: \*\*LANDS\*\*/);
  assert.match(md, /- chrome\/composing@textedit: \*\*LANDS\*\*/);
  assert.match(md, /\| 2 \| before \| restored cccccccccccc \|/);
  assert.match(md, /\| before \| 1 \| 2 \| counted \| outsideFrame \/ skipped controlBuild \/ fresh \| cccccccccccc control-no-inert-click \| not delivered \| read \/ timeout \| not delivered \|/);
  assert.match(md, /\| after \| 1 \| 1 \| counted \| outsideFrame \/ inertOutside offset early \/ fresh \| aaaaaaaaaaaa \| delivered \|/);
  assert.equal((md.match(/\| (after|before) \| 187-iso-composing-/g) ?? []).length, 18);
  assert.match(md, /## The mechanism \(reported, never the verdict\)/);
  assert.match(md, /frontmost yes, AXMain yes, AXFocusedWindow run, hasFocus yes, AXFocused no × 6/);
  assert.match(md, /## The AFTER-only block \(block 7\)/);
  assert.match(md, /## #188 rows \(counted for #188, never for #187\): NOT RUN/);
  assert.match(md, /owner's input source at the end: restored \(com\.apple\.keylayout\.ABC, read back\)/);
  assert.match(isolateMarkdown(judgeIsolate(evidence({end: false}))), /NOT restored/);
  // #188's cua cells read for the AFTER build: one answered by the control build is named.
  const with188 = evidence();
  const row188 = (key, id) => ({kind: 'task', task: '188-row', result: {key, id, item: ITEMS_188.rows('cua'), invalid: null, valid: true, delivered: true}});
  with188[ITEMS_188.rows('cua')] = [start, {kind: 'cell', label: LABELS_188.act('r.0', 'a'), nativeEngine: NATIVE.after}, row188('r.0', 'a'),
    {kind: 'cell', label: LABELS_188.act('r.1', 'b'), nativeEngine: NATIVE.before}, row188('r.1', 'b')];
  const j188 = judgeIsolate(with188);
  assert.deepEqual(j188.item188.attest, [{item: ITEMS_188.rows('cua'), actions: 2, unattested: 1, first: 'the result\'s build was cccccccccccc, not the half\'s saved aaaaaaaaaaaa'}]);
  assert.match(isolateMarkdown(j188), /188-rows-cua 1 of 2 action\(s\) attested; the rest made invalid before #188's judge \(the result's build was cccccccccccc/);
  assert.equal(j188.verdict, 'LANDS', '#188 never moves #187\'s verdict');
  assert.match(isolateMarkdown(judgeIsolate(evidence({cell: (h, rep) => (on('before', [1, 4])(h, rep) ? {bg: {outcome: 'delivered'}} : {})}))), /## Verdict: DOES NOT LAND\n/);
  assert.ok(!md.includes(CELL_ROW.string.text), 'no string\'s text');
});

test('the control copy: native/engine whole, the define on the Engine target alone, only Package.swift differing, its own build id', t => {
  const shipping = readFileSync(join(ENGINE_SOURCE, 'Package.swift'), 'utf8');
  assert.ok(!shipping.includes(CONTROL_DEFINE), 'the shipping Package.swift never defines it');
  const control = controlPackage(shipping);
  assert.equal(control.split('\n').length, shipping.split('\n').length + 1);
  const engineTarget = control.slice(control.indexOf('.executableTarget('), control.indexOf('.target(name: "EngineTestGate"'));
  assert.match(engineTarget, /name: "Engine",\n\s+path: "Sources\/Engine",\n\s+swiftSettings: \[\.define\("CUA_CONTROL_NO_INERT_CLICK"\)\],\n\s+linkerSettings:/);
  assert.equal(control.split(CONTROL_DEFINE).length, 2, 'defined once');
  assert.throws(() => controlPackage(control), /already names CUA_CONTROL_NO_INERT_CLICK/);
  assert.throws(() => controlPackage(shipping.replace('linkerSettings', 'swiftSettings: [], linkerSettings')), /declares swiftSettings/);
  assert.throws(() => controlPackage(shipping.replace('name: "Engine"', 'name: "Other"')), /0 times, not once/);
  const dir = join(scratch(t), 'control');
  const prepared = prepareControlSource({scratch: dir});
  assert.equal(prepared.shippingBuild, engineBuild());
  assert.notEqual(prepared.controlBuild, prepared.shippingBuild);
  assert.equal(readFileSync(join(prepared.copy, 'Package.swift'), 'utf8'), control);
  assert.ok(!existsSync(join(prepared.copy, '.build')), 'no build products copied');
  assert.ok(existsSync(join(prepared.copy, 'Sources', 'Engine', 'Routes.swift')) && existsSync(join(prepared.copy, 'Tests')));
  const record = JSON.parse(readFileSync(join(dir, CONTROL_RECORD), 'utf8'));
  assert.deepEqual([record.define, record.variant, record.controlBuild], [CONTROL_DEFINE, CONTROL_VARIANT, prepared.controlBuild]);
  assert.equal(readFileSync(join(ENGINE_SOURCE, 'Package.swift'), 'utf8'), shipping, 'the shipping Package.swift untouched');
  assert.throws(() => prepareControlSource({scratch: dir}), /already exists/);
  // The preparation's pair: this checkout's tree and that tree with the define, computed again.
  assert.equal(checkPair(record).ok, true);
  assert.match(checkPair({...record, shippingBuild: 'b'.repeat(64)}).problem, /shipping build bbbbbbbbbbbb is not this checkout's .* \(another source tree\)/);
  assert.match(checkPair({...record, controlBuild: prepared.shippingBuild}).problem, /control build .* is not this tree with the define/);
  assert.match(checkPair({...record, controlBuild: undefined}).problem, /names no control build/);
});

test('the CLI: the dry run prints each block\'s steps and touches nothing; a re-slot\'s directory is refused; judge writes the verdict file; control-build --dry-run', async t => {
  const dir = scratch(t), out = join(dir, 'never-made');
  const {code, text} = await quietly(() => main(['isolate-187', 'drive', '--out', out, '--dry-run', '--quiet']));
  assert.equal(code, 0);
  const total = isolatePlan().reduce((n, p) => n + p.steps.length, 0) + cleanupSteps().length;
  assert.match(text, new RegExp(`dry run: ${total} steps, nothing sent`));
  assert.ok(text.includes(`dry run: the cleanup on every exit (restore-owner): ${cleanupSteps().length} steps`));
  for (const c of stepCounts(isolatePlan())) assert.ok(text.includes(`dry run: ${c.label}: ${c.steps} steps`), c.label);
  assert.equal(existsSync(out), false, 'the dry run creates nothing');
  const some = await quietly(() => main(['isolate-187', 'drive', '--out', out, '--dry-run', '--quiet', '--blocks', '7']));
  assert.match(some.text, new RegExp(`dry run: ${isolatePlan({blocks: [7]}).reduce((n, p) => n + p.steps.length, 0) + cleanupSteps().length} steps`));
  writeFileSync(join(dir, 'item-187.md'), '# a re-slot\'s report\n');
  await assert.rejects(main(['isolate-187', 'drive', '--out', dir, '--dry-run']), /holds a re-slot's report/);
  rmSync(join(dir, 'item-187.md'));
  await assert.rejects(main(['isolate-187', 'drive', '--out', dir, '--run', dir, '--home', dir, '--halves', dir]), /the slot's preparation does not hold, so nothing was run: the preparation's pair does not hold \(.*control-src\/control\.json could not be read\)/);
  await assert.rejects(main(['isolate-187', 'drive', '--out', dir, '--dry-run', '--end', 'keep']), /--end takes restore-owner or keep-merged/);
  for (const [name, rows] of Object.entries(evidence())) writeFileSync(join(dir, `item-${name}.jsonl`), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  const judged = await quietly(() => main(['isolate-187', 'judge', '--out', dir]));
  assert.equal(judged.code, 0);
  assert.match(readFileSync(join(dir, VERDICT_FILE), 'utf8'), /## Verdict: LANDS/);
  assert.equal(existsSync(join(dir, 'item-187.md')), false, 'the re-slot\'s report is never written');
  const control = await quietly(() => main(['control-build', '--home', dir, '--scratch', join(dir, 'control'), '--dry-run']));
  assert.equal(control.code, 0);
  assert.match(control.text, /"controlBuild": "[0-9a-f]{64}"/);
  assert.match(control.text, /nothing was built/);
  // The 11-05 re-slot stays runnable.
  assert.equal(plan187().at(-1).item, ITEMS_187.end);
});

// The slot on a fake engine: which save is installed, the drive's items run as a stub that swaps the engine at each
// swap item (and stops at `stopAt`, or throws), and the cleanup run for real through the runner over the kit's tasks.
async function fakeSlot(t, {plan, stopAt = null, throws = false, end = 'restore-owner', restoreFails = false}) {
  const out = scratch(t), world = {installed: 'owner', restores: []}, builds = {after: BUILD.after, before: BUILD.before, owner: OWNER};
  const halfOf = dir => Object.entries(SAVED).find(([, d]) => dir.endsWith(d))[0];
  const tasks = isolateTasks({halves: '/halves', now: () => 1, start: {...START, end}, savedRecord: dir => ({status: {build: builds[halfOf(dir)]}}),
    restore: async ({from}) => { if (restoreFails) throw new Error('the engine did not stop'); world.installed = halfOf(from); world.restores.push(world.installed); return {ok: true, status: {}}; },
    approve: async () => ({ok: true, approved: true, build: builds[world.installed], captureConfirmation: 'none'})});
  const ping = () => ({engine: 'cua', version: '0.1.0', build: builds[world.installed], ...(world.installed === 'before' ? {variant: CONTROL_VARIANT} : {})});
  const io = {scene: id => ({id, app: `/Apps/${id}.app`, pid: 202, at: 1, window: {number: 12}}), tasks,
    open: async () => ({run: async () => ({ok: true, value: {inFront: true}, route: null, meta: {}, images: [], nativeEngine: ping()}), close: async () => 0})};
  const ran = [];
  const outcome = await driveThenCleanup({end,
    drive: () => driveItems(plan, {evidenceOf: () => ({rows: [], activations: []}),
      runItem: async entry => { ran.push(entry.item); if (entry.stage === 'swap') world.installed = entry.half; if (throws && entry.stage === 'swap' && entry.half === 'before') throw new Error('boom'); return entry.item === stopAt ? new Error('the attestation refused') : null; }}),
    cleanup: steps => runSteps(steps, {item: ITEMS.cleanup, out, io, log: () => {}})});
  const items = {...evidence({cleanup: false, begin: {...START, end}}), ...read187(out)};
  return {world, outcome, ran, judged: judgeIsolate(items)};
}

test('the cleanup (the wave\'s P1, 1ea561bc:403): on every exit the owner\'s end choice is applied and attested; a failed one is the report\'s first line', async t => {
  // A stop in a BEFORE block: the swaps after it never run, the control would stay installed; the cleanup puts the owner's back.
  const stop = await fakeSlot(t, {plan: isolatePlan(), stopAt: ITEMS.swap(3)});
  assert.equal(stop.outcome.stopped, `${ITEMS.swap(3)}: the attestation refused`);
  assert.ok(!stop.ran.includes(ITEMS.swap(4)), 'the drive stopped at block 3');
  assert.deepEqual([stop.world.installed, stop.world.restores], ['owner', ['owner']]);
  assert.deepEqual([stop.judged.cleanup.ok, stop.judged.cleanup.target, stop.judged.cleanup.build], [true, 'owner', OWNER]);
  assert.match(isolateMarkdown(stop.judged), /The cleanup \(the owner's end choice, restore-owner\): engine-owner restored and attested \(ffffffffffff, no variant\)/);
  // A partial run ending on BEFORE.
  const partial = await fakeSlot(t, {plan: isolatePlan({blocks: [2, 3]})});
  assert.equal(partial.outcome.stopped, null);
  assert.equal(partial.world.installed, 'owner');
  assert.equal(partial.judged.cleanup.ok, true);
  // The owner chose to keep the merged build: the cleanup leaves AFTER, attested with no variant.
  const kept = await fakeSlot(t, {plan: isolatePlan({blocks: [6]}), end: 'keep-merged'});
  assert.deepEqual([kept.world.installed, kept.judged.cleanup.ok, kept.judged.cleanup.target, kept.judged.cleanup.build], ['after', true, 'after', BUILD.after]);
  // A drive that throws: the cleanup still runs, and the error is kept.
  const thrown = await fakeSlot(t, {plan: isolatePlan(), throws: true});
  assert.equal(thrown.outcome.error.message, 'boom');
  assert.equal(thrown.world.installed, 'owner');
  // The cleanup itself failing: kept, the control still installed, and said first.
  const failed = await fakeSlot(t, {plan: isolatePlan({blocks: [2]}), restoreFails: true});
  assert.match(failed.outcome.cleanupError.message, /187-iso-swap refused: the restore refused: the engine did not stop/);
  assert.equal(failed.world.installed, 'before');
  assert.equal(failed.judged.cleanup.ok, false);
  const md = isolateMarkdown(failed.judged);
  assert.match(md.split('\n')[0], /^\*\*!!! THE ENGINE WAS NOT PUT BACK \(the owner's end choice restore-owner\): its swap failed \(the restore refused: the engine did not stop\)\. The control build may still be installed/);
  assert.equal(md.split('\n')[0], cleanupAlarm(failed.judged.cleanup));
  // The judge checks the cleanup again from its records: one attested with the control's variant, or none, is not done.
  assert.match(judgeIsolate(evidence({cleanup: false})).cleanup.problem, /the cleanup was not recorded/);
  const controlLeft = evidence();
  controlLeft[ITEMS.cleanup] = cleanupRows({observed: {...OWNER_NATIVE, variant: CONTROL_VARIANT}});
  assert.match(judgeIsolate(controlLeft).cleanup.problem, /variant was control-no-inert-click, not absent/);
  assert.match(isolateMarkdown(judgeIsolate(controlLeft)), /^\*\*!!! THE ENGINE WAS NOT PUT BACK/);
  assert.throws(() => cleanupSteps('keep'), /--end takes restore-owner or keep-merged/);
});

test('the drive\'s start (the wave\'s P1): the saves must be one preparation\'s pair, and restore-owner needs the owner\'s save', () => {
  const check = {ok: true, shippingBuild: BUILD.after, controlBuild: BUILD.before, source: '/src'};
  const saved = {after: BUILD.after, before: BUILD.before, owner: OWNER};
  const good = startOf({check, saved});
  assert.deepEqual([good.ok, good.end, good.ownerBuild, good.pair.shippingBuild, good.pair.controlBuild], [true, 'restore-owner', OWNER, BUILD.after, BUILD.before]);
  // An older shipping save paired with a newer control.
  assert.match(startOf({check, saved: {...saved, after: 'b'.repeat(64)}}).problem, /engine-after holds bbbbbbbbbbbb, not the preparation's shipping build aaaaaaaaaaaa/);
  assert.match(startOf({check, saved: {...saved, before: 'd'.repeat(64)}}).problem, /engine-control holds dddddddddddd, not the preparation's control build cccccccccccc/);
  assert.match(startOf({check: {ok: false, problem: 'another source tree'}, saved}).problem, /the preparation's pair does not hold \(another source tree\)/);
  assert.match(startOf({check, saved: {...saved, owner: null}}).problem, /engine-owner holds no save, and the end choice restore-owner needs it/);
  assert.equal(startOf({check, saved: {...saved, owner: null}, end: 'keep-merged'}).ok, true);
  assert.match(startOf({check, saved, end: 'keep'}).problem, /--end takes restore-owner or keep-merged/);
});

test('a stage-less failure on an attested half is named under the verdict (1ea561bc:402)', () => {
  const j = judgeIsolate(evidence({cell: (h, rep) => (on('before', [2])(h, rep) ? {bg: {outcome: 'legacy'}, fg: {outcome: 'legacy'}} : {}), row: (h, i, k) => (h === 'after' && i === 1 && k === 0 ? {outcome: 'legacy'} : {})}));
  assert.deepEqual(j.stageUnknown, [
    {half: 'after', where: `chrome/composing@textedit/paste.${THIRDS[1][0].string.id} (${ITEMS.composing('after', 1)})`, which: 'the composing paste'},
    {half: 'before', where: `repetition 3 (${ITEMS.cell('before', 2)})`, which: 'the background paste'},
    {half: 'before', where: `repetition 3 (${ITEMS.cell('before', 2)})`, which: 'the frontmost paste'}]);
  const md = isolateMarkdown(j), verdict = md.slice(md.indexOf('## Verdict'), md.indexOf('## The halves'));
  assert.match(verdict, /- \*\*Stage unknown, unexpected on an attested half\*\*: BEFORE repetition 3 \(187-iso-cell-before-2\), the background paste failed with no stage meta \(a miss by the bar\)/);
  assert.match(verdict, /- \*\*Stage unknown, unexpected on an attested half\*\*: AFTER chrome\/composing@textedit\/paste\.mixed \(187-iso-composing-after-1\), the composing paste failed/);
  assert.doesNotMatch(isolateMarkdown(judgeIsolate(evidence())), /Stage unknown, unexpected/);
  // An uncounted one (its premise not met) is not named: only an attested half's.
  assert.deepEqual(judgeIsolate(evidence({cell: (h, rep) => (on('before', [2])(h, rep) ? {bg: {outcome: 'legacy', native: NATIVE.after}} : {})})).stageUnknown, []);
});

test('#188 on AFTER (the wave\'s P2): a row or cell-3 part whose action\'s result does not attest AFTER is made invalid before #188\'s judge', () => {
  const items = evidence(), name = ITEMS_188.rows('cua'), click = ITEMS_188.click('cua');
  const row = (key, id) => ({kind: 'task', task: '188-row', result: {key, id, item: name, regime: 'frontmost', invalid: null, valid: true, delivered: true}});
  items[name] = [start, {kind: 'cell', label: LABELS_188.act('r.0', 'a'), nativeEngine: NATIVE.after}, row('r.0', 'a'), {kind: 'cell', label: LABELS_188.act('r.1', 'b'), nativeEngine: NATIVE.before}, row('r.1', 'b')];
  items[click] = [start, {kind: 'cell', label: LABELS_188.click(click, 'i'), nativeEngine: null}, {kind: 'task', task: '188-click-record', result: {item: click, part: 'i', invalid: null, outcome: 'kept'}}];
  const {items: out, attest} = attested188(items, {build: BUILD.after, variant: null});
  assert.deepEqual(attest.map(a => [a.item, a.actions, a.unattested]), [[name, 2, 1], [click, 1, 1]]);
  assert.equal(out[name][2].result.invalid, null);
  assert.match(out[name][4].result.invalid, /^not attested on AFTER: the result's build was cccccccccccc/);
  assert.deepEqual([out[name][4].result.valid, out[name][4].result.delivered], [false, false]);
  assert.match(out[click][2].result.invalid, /no cua\/nativeEngine/);
  assert.equal(out[click][2].result.outcome, null);
  assert.equal(items[name][4].result.invalid, null, 'the evidence itself is left as recorded');
  // Through the judge: block 7's swap must count, or nothing of #188 attests.
  const j = judgeIsolate(items);
  assert.equal(j.item188.attest[0].unattested, 1);
  items[ITEMS.swap(AFTER_BLOCK)] = swapRows(AFTER_BLOCK, 'after', {observed: NATIVE.before});
  assert.equal(judgeIsolate(items).item188.attest[0].unattested, 2, 'block 7\'s swap does not count: no action attests AFTER');
});

// The child (fixtures/isolate-signal-child.mjs) sent `signal` once it waits in its BEFORE repetition, and `second` again
// once its cleanup's restore has started. -> {code, report, stderr}.
function signalled(t, signal, {second = null} = {}) {
  const out = scratch(t), child = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/isolate-signal-child.mjs', import.meta.url)), out, second ? '600' : '100'], {stdio: ['ignore', 'pipe', 'pipe']});
  let stdout = '', stderr = '';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`the child never finished: ${stdout} ${stderr}`)); }, 20_000);
    child.stdout.on('data', chunk => {
      const before = stdout;
      stdout += chunk;
      if (!before.includes('IN-BEFORE') && stdout.includes('IN-BEFORE')) child.kill(signal);
      if (second && !before.includes('CLEANING') && stdout.includes('CLEANING')) child.kill(second);
    });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('exit', code => { clearTimeout(timer); resolve({code, stderr, report: JSON.parse(stdout.trim().split('\n').at(-1))}); });
  });
}

test('a signal mid-BEFORE (the re-review\'s P1): SIGTERM or SIGINT stops the drive\'s further steps, the cleanup puts the owner\'s engine back and attests it, and the process exits non-zero', async t => {
  for (const [signal, code] of [['SIGTERM', 143], ['SIGINT', 130]]) {
    const {code: exit, report, stderr} = await signalled(t, signal);
    assert.equal(exit, code, `${signal}: 128 + its number`);
    assert.deepEqual([report.signal, report.installed, report.restores, report.ranAfterSignal, report.cleanupError], [signal, 'owner', ['owner'], [], null], signal);
    assert.match(report.stopped, new RegExp(`stopped by ${signal}`));
    assert.match(stderr, new RegExp(`!!! ${signal}: the drive stops after its current step, then the cleanup puts the owner's end choice back`));
  }
  // A second signal while the cleanup restores: ignored, said so, and the restore completes.
  const twice = await signalled(t, 'SIGTERM', {second: 'SIGTERM'});
  assert.equal(twice.code, 143);
  assert.deepEqual([twice.report.installed, twice.report.cleanupError], ['owner', null]);
  assert.match(twice.stderr, /!!! SIGTERM again: ignored while the cleanup restores the engine; only SIGKILL stops it now/);
});

test('the signal guard and the abortable io: the first signal is kept, later ones only said; after it every task and cell throws', async () => {
  const proc = new EventEmitter(), said = [];
  const guard = signalGuard({proc, log: text => said.push(text)});
  assert.equal(guard.signal(), null);
  const ran = [], io = {tasks: {t: async () => { ran.push('t'); return {ok: true}; }}, open: async () => ({run: async () => ({ok: true}), close: async () => 0})};
  const stoppable = abortableIo(io, guard.signal);
  await stoppable.tasks.t([]);
  proc.emit('SIGHUP');
  assert.deepEqual([guard.signal(), guard.exitCode()], ['SIGHUP', 129]);
  await assert.rejects(stoppable.tasks.t([]), /stopped by SIGHUP/);
  await assert.rejects(stoppable.open({}), /stopped by SIGHUP/);
  assert.deepEqual(ran, ['t']);
  await io.tasks.t([]);
  assert.deepEqual(ran, ['t', 't'], 'the cleanup\'s io is not stopped');
  guard.cleaning();
  proc.emit('SIGINT');
  assert.equal(guard.signal(), 'SIGHUP', 'the first signal is the one kept');
  assert.match(said.at(-1), /SIGINT again: ignored while the cleanup restores the engine/);
  guard.dispose();
  assert.equal(proc.listenerCount('SIGTERM'), 0);
  // driveItems' abort: once it answers, only the end items run.
  const items = [];
  let aborted = null;
  await driveItems(isolatePlan({blocks: [2]}), {abort: () => aborted, evidenceOf: () => ({rows: [], activations: []}),
    runItem: async entry => { items.push(entry.item); if (entry.stage === 'swap') aborted = 'SIGTERM'; return null; }});
  assert.deepEqual(items, [ITEMS.start, ITEMS.place, ITEMS.swap(2), ITEMS.end]);
});

test('#188 (the re-review\'s P2): a row with no action result in its own attempt is unattested and invalid', () => {
  const name = ITEMS_188.rows('cua'), after = {build: BUILD.after, variant: null};
  const row = (key, id) => ({kind: 'task', task: '188-row', result: {key, id, item: name, regime: 'frontmost', invalid: null, valid: true, delivered: true}});
  // The action was attested in an earlier attempt; the latest attempt's row has none of its own.
  const items = {[name]: [start, {kind: 'cell', label: LABELS_188.act('r.0', 'a'), nativeEngine: NATIVE.after}, row('r.0', 'a'), start, row('r.0', 'a'), row('r.1', 'b')]};
  const {items: out, attest} = attested188(items, after);
  assert.equal(out[name][2].result.invalid, null, 'the earlier attempt\'s row has its action');
  assert.match(out[name][4].result.invalid, /^not attested on AFTER: no action result recorded in its attempt/);
  assert.match(out[name][5].result.invalid, /no action result recorded in its attempt/);
  assert.deepEqual([out[name][5].result.valid, out[name][5].result.delivered], [false, false]);
  assert.deepEqual(attest[0], {item: name, actions: 3, unattested: 2, first: 'no action result recorded in its attempt'});
  // A row already invalid keeps its own reason beside the attestation's.
  const already = attested188({[name]: [start, {...row('r.2', 'c'), result: {...row('r.2', 'c').result, invalid: 'the act cell failed', valid: false}}]}, after);
  assert.equal(already.items[name][1].result.invalid, 'the act cell failed; not attested on AFTER: no action result recorded in its attempt');
});

test('the judge\'s exit (the re-review\'s P2) and the put-back reading (1ea561bc:404)', async t => {
  assert.equal(isolateExit(judgeIsolate(evidence())), 0);
  assert.equal(isolateExit(judgeIsolate(evidence({cleanup: false}))), 1, 'LANDS with no attested cleanup is not a pass');
  const dir = scratch(t);
  for (const [name, rows] of Object.entries(evidence({cleanup: false}))) writeFileSync(join(dir, `item-${name}.jsonl`), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  // The CLI in a child process: patching this process's stdout would swallow the test reporter's pending output.
  const cli = args => spawnSync(process.execPath, [fileURLToPath(new URL('../../scripts/cursor-sitting.mjs', import.meta.url)), ...args], {encoding: 'utf8'});
  const judged = cli(['isolate-187', 'judge', '--out', dir]);
  assert.equal(judged.status, 1);
  assert.match(judged.stdout, /^\*\*!!! THE ENGINE WAS NOT PUT BACK/);
  assert.match(judged.stdout, /## Verdict: LANDS/);
  // The put-back read from the engine's own ping: the end choice's build and no variant, else stop.
  const ping = result => ({ok: true, result: {serverApiVersion: 'cua-engine-1', engineVersion: '0.1.0', ...result}});
  assert.deepEqual(putBackReading(ping({build: OWNER}), {build: OWNER}), {ok: true, stop: false, identity: {engineVersion: '0.1.0', build: OWNER, variant: null}, problem: null});
  const control = putBackReading(ping({build: BUILD.before, variant: CONTROL_VARIANT}), {build: OWNER});
  assert.deepEqual([control.ok, control.stop], [false, true]);
  assert.match(control.problem, /^THE CONTROL BUILD IS INSTALLED \(variant control-no-inert-click\): stop and do the by-hand restore/);
  assert.match(putBackReading(ping({build: BUILD.after}), {build: OWNER}).problem, /running build is aaaaaaaaaaaa, not the end choice's ffffffffffff/);
  assert.match(putBackReading({ok: false, unreachable: 'ENOENT'}, {build: OWNER}).problem, /no engine answered its ping \(ENOENT\)/);
  // The verb: refuses without the end choice's save, and with no engine answering reads it as a stop.
  const missing = cli(['isolate-187', 'engine-identity', '--home', dir, '--halves', dir]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /engine-owner holds no save to read the put-back against/);
  mkdirSync(join(dir, 'engine-owner'));
  writeFileSync(join(dir, 'engine-owner', 'saved.json'), JSON.stringify({status: {build: OWNER}}));
  const none = cli(['isolate-187', 'engine-identity', '--home', dir, '--halves', dir]);
  assert.equal(none.status, 1);
  assert.match(none.stdout, /!!! no engine answered its ping/);
});
