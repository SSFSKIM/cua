// #187's isolating slot (scripts/cursor-sitting/item-187-isolate.mjs) and its control build
// (scripts/cursor-sitting/control-build.mjs): the plan (A B B A A B, each block a swap, 2 cell repetitions and 3 composing
// rows; the AFTER-only block with #188's part; the seams), the swap's restore, headless approve and attestation, the
// premise per repetition and per row, every branch of the verdict for the cell and for composing, the verdict file, the
// control copy (the define on the Engine target alone, its own build id) and the CLI's dry runs. Nothing is driven.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main} from '../../scripts/cursor-sitting.mjs';
import {CONTROL_DEFINE, CONTROL_RECORD, CONTROL_VARIANT, controlPackage, prepareControlSource} from '../../scripts/cursor-sitting/control-build.mjs';
import {AFTER_BLOCK, AFTER_ONLY, attestProblem, BAR, BLOCKS, CELL_PER_HALF, combineVerdict, COMPOSING_PER_HALF, GOES_ON_ISO, isolateMarkdown, isolatePlan, isolateTasks, ITEMS, judgeIsolate,
  LABELS, MIN_COUNTED, ORDER, parseBlocks, partVerdict, repPremise, rowPremise, stepCounts, TAIL, THIRDS, VERDICT_FILE} from '../../scripts/cursor-sitting/item-187-isolate.mjs';
import {CELL_ROW, ITEMS as ITEMS_187, plan187, rowRecord, VENDOR_ROWS} from '../../scripts/cursor-sitting/item-187.mjs';
import {ITEMS_188} from '../../scripts/cursor-sitting/item-188.mjs';
import {describeStep} from '../../scripts/cursor-sitting/runner.mjs';
import {ENGINE_SOURCE, engineBuild} from '../../src/runtime/engine-bundle.mjs';

const scratch = t => { const dir = mkdtempSync(join(tmpdir(), 'cua-187i-')); t.after(() => rmSync(dir, {recursive: true, force: true})); return dir; };
const quietly = async run => { const write = process.stdout.write; let text = ''; process.stdout.write = chunk => { text += chunk; return true; }; try { return {code: await run(), text}; } finally { process.stdout.write = write; } };
const BUILD = {after: 'a'.repeat(64), before: 'c'.repeat(64)};
const NATIVE = {after: {engine: 'cua', version: '0.1.0', build: BUILD.after}, before: {engine: 'cua', version: '0.1.0', build: BUILD.before, variant: CONTROL_VARIANT}};
const KIND = {after: {kind: 'inertOutside', point: 'offset', when: 'early'}, before: {kind: 'skipped', skippedReason: 'controlBuild'}};
const PIDS = {chrome: 201, textedit: 202};
const ZERO = {windowFocus: 0, windowBlur: 0, textFocus: 0, textBlur: 0, mousedown: 0, click: 0};
const start = {kind: 'start'};

// One paste row's record as rowRecord makes it: on `half`'s engine, delivered or timing out at the read (`outcome`:
// delivered | read | effect), `over` replacing any reading.
function pasteRow({half, group, item, key, row = CELL_ROW, outcome = half === 'after' ? 'delivered' : 'read', prior = 0, native = NATIVE[half], kind = KIND[half], click = 'outsideFrame', ...over}) {
  const background = group !== 'chrome-cell', delivered = outcome === 'delivered', expectedLength = prior + row.string.text.length;
  const paste = delivered ? {stage: 'effect', confirmed: true, readWait: 'handedOver', effectWait: 'reading', focusEnforcement: {activated: true}, perLine: [{line: 1, confirmed: true, effectWait: 'reading', baseline: {c: 0}, confirming: {c: 1}}]}
    : outcome === 'read' ? {stage: 'read', readWait: 'timeout', confirmed: null} : {stage: 'effect', readWait: 'handedOver', effectWait: 'timeout', confirmed: false};
  return rowRecord({
    spec: {key, item, group, block: 0, i: 0, string: row.string.id, method: row.method, expectedLength, lines: 1, regime: background ? 'background' : 'frontmost', engine: 'cua'},
    prepare: {ok: true, value: {ready: true}},
    act: {ok: true, value: {actMs: delivered ? 180 : 2100, threw: !delivered, message: delivered ? null : 'timed out'}, route: 'paste', nativeEngine: native,
      meta: {activationGuardMs: 40, activationClick: click, activationClickKind: kind, activationJoin: 'fresh', paste}},
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
const swapRows = (n, half, {build = BUILD[half], attested = true} = {}) => [start, {kind: 'task', task: '187-iso-swap', result: {ok: true, half, saved: build, approved: {approved: true, captureConfirmation: 'none'}}},
  {kind: 'task', task: '187-iso-attest', result: {ok: attested, half, expected: {build, variant: NATIVE[half].variant ?? null}, observed: NATIVE[half], ...(attested ? {} : {problem: 'no'})}}];
const composingRow = (half, index, k, over = {}) => pasteRow({half, group: 'chrome-composing', item: ITEMS.composing(half, index), key: `${ITEMS.composing(half, index)}#0.${k}`, row: THIRDS[index][k], ...over});

// The whole slot's evidence, every premise holding and every half as predicted; `cell(half, rep)` and `row(half, index, k)`
// give a repetition's or a row's options.
function evidence({cell = () => ({}), row = () => ({}), swaps = true, end = true} = {}) {
  const items = {};
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
  assert.equal(items[0], ITEMS.place);
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
  assert.deepEqual(only.map(p => p.item), [ITEMS.place, ITEMS.swap(3), ITEMS.cell('before', 2), ITEMS.cell('before', 3), ITEMS.composing('before', 1), ITEMS.end]);
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
  const tasks = (over = {}) => isolateTasks({halves: '/halves', now: () => 99, savedRecord: dir => ({status: {build: dir.endsWith('engine-control') ? BUILD.before : BUILD.after}}),
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

test('the cell\'s verdict: LANDS as predicted and with one miss a half; DOES NOT LAND each way; INCONCLUSIVE below 4 counted and short of the bar', () => {
  const verdictOf = options => judgeIsolate(evidence(options)).cell;
  assert.equal(verdictOf({}).verdict, 'LANDS');
  assert.deepEqual(verdictOf({}).counts, {after: {counted: 6, met: 6, readTimeouts: 0}, before: {counted: 6, met: 6, delivers: 0, otherStage: 0}});
  // 5 of 6: one miss allowed on each half.
  assert.equal(verdictOf({cell: (h, rep) => (h === 'after' && rep === 2 ? {fg: {outcome: 'effect'}} : h === 'before' && rep === 4 ? {bg: {outcome: 'effect'}} : {})}).verdict, 'LANDS');
  const dnl = [
    ['BEFORE delivers the background paste in 2', {cell: (h, rep) => (on('before', [1, 4])(h, rep) ? {bg: {outcome: 'delivered'}} : {})}, /BEFORE delivered in 2 counted/],
    ['BEFORE fails at a stage other than read in 2', {cell: (h, rep) => (on('before', [0, 5])(h, rep) ? {bg: {outcome: 'effect'}} : {})}, /BEFORE failed at a stage other than read in 2 counted/],
    ['AFTER fails the delivery bar', {cell: (h, rep) => (on('after', [0, 3])(h, rep) ? {fg: {outcome: 'effect'}} : {})}, /AFTER missed its delivery in 2 of 6 counted/],
    ['AFTER\'s background paste times out twice', {cell: (h, rep) => (on('after', [1, 2])(h, rep) ? {bg: {outcome: 'read'}} : {})}, /AFTER missed its delivery in 2 of 6/],
  ];
  for (const [what, options, why] of dnl) {
    const v = verdictOf(options);
    assert.equal(v.verdict, 'DOES NOT LAND', what);
    assert.match(v.why.join('; '), why, what);
  }
  const inconclusive = [
    ['3 counted on AFTER (premise failures)', {cell: (h, rep) => (on('after', [0, 1, 2])(h, rep) ? {bg: {click: 'posted'}} : {})}, /fewer than 4 counted in a half \(AFTER 3, BEFORE 6\)/],
    ['3 counted on BEFORE (not attested)', {cell: (h, rep) => (on('before', [3, 4, 5])(h, rep) ? {bg: {native: NATIVE.after}} : {})}, /fewer than 4 counted in a half \(AFTER 6, BEFORE 3\)/],
    ['repetitions not recorded', {cell: (h, rep) => (on('after', [2, 3, 4])(h, rep) ? null : {})}, /AFTER 3, BEFORE 6/],
    ['one read-stage timeout on AFTER', {cell: (h, rep) => (on('after', [4])(h, rep) ? {fg: {outcome: 'read'}} : {})}, /1 read-stage timeout\(s\) on AFTER/],
    ['BEFORE short of the bar, neither way twice', {cell: (h, rep) => (on('before', [0])(h, rep) ? {bg: {outcome: 'delivered'}} : on('before', [1])(h, rep) ? {bg: {outcome: 'effect'}} : {})}, /BEFORE failed as predicted in 4 of 6 counted \(at most 1 miss\)/],
    ['BEFORE\'s frontmost paste delivered twice after a read timeout', {cell: (h, rep) => (on('before', [2, 3])(h, rep) ? {fg: {outcome: 'delivered'}} : {})}, /BEFORE failed as predicted in 4 of 6/],
  ];
  for (const [what, options, why] of inconclusive) {
    const v = verdictOf(options);
    assert.equal(v.verdict, 'INCONCLUSIVE', what);
    assert.match(v.why.join('; '), why, what);
  }
  // Below 4 counted is INCONCLUSIVE even with BEFORE delivering: too few to judge either way.
  assert.equal(verdictOf({cell: (h, rep) => (on('before', [0, 1, 2])(h, rep) ? {bg: {kind: KIND.after}} : on('before', [3, 4])(h, rep) ? {bg: {outcome: 'delivered'}} : {})}).verdict, 'INCONCLUSIVE');
  // At 4 counted, one miss still lands.
  assert.equal(verdictOf({cell: (h, rep) => (on('after', [0, 1])(h, rep) ? {bg: {click: 'posted'}} : on('after', [2])(h, rep) ? {fg: {outcome: 'effect'}} : {})}).verdict, 'LANDS');
});

test('composing\'s verdict (ruling 2): 8 of 9 a half; the same DOES NOT LAND and INCONCLUSIVE rules; LANDS needs both parts', () => {
  const judged = options => judgeIsolate(evidence(options));
  assert.equal(judged({}).composing.verdict, 'LANDS');
  assert.equal(judged({}).verdict, 'LANDS');
  assert.equal(judged({row: (h, i, k) => (h === 'after' && i === 1 && k === 2 ? {outcome: 'effect'} : h === 'before' && i === 0 && k === 0 ? {outcome: 'effect'} : {})}).composing.verdict, 'LANDS', 'one miss each');
  const cases = [
    ['BEFORE delivers in 2', {row: (h, i) => (h === 'before' && i === 2 ? {outcome: 'delivered'} : {})}, 'DOES NOT LAND', /BEFORE delivered in 3 counted/],
    ['BEFORE fails at another stage in 2', {row: (h, i, k) => (h === 'before' && k === 1 && i < 2 ? {outcome: 'effect'} : {})}, 'DOES NOT LAND', /stage other than read in 2/],
    ['AFTER misses 2', {row: (h, i, k) => (h === 'after' && k === 0 && i < 2 ? {outcome: 'read'} : {})}, 'DOES NOT LAND', /AFTER missed its delivery in 2 of 9/],
    ['3 counted on BEFORE', {row: (h, i) => (h === 'before' && i > 0 ? {kind: KIND.after} : {})}, 'INCONCLUSIVE', /fewer than 4 counted in a half \(AFTER 9, BEFORE 3\)/],
    ['one AFTER read timeout', {row: (h, i, k) => (h === 'after' && i === 2 && k === 2 ? {outcome: 'read'} : {})}, 'INCONCLUSIVE', /1 read-stage timeout/],
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
  const e = (n, over = {}) => Array.from({length: n}, () => ({counted: true, met: true, delivers: false, otherStage: false, readTimeout: false, ...over}));
  assert.equal(partVerdict({after: e(6), before: e(6)}, BAR.cell).verdict, 'LANDS');
  assert.equal(partVerdict({after: e(MIN_COUNTED - 1), before: e(6)}, BAR.cell).verdict, 'INCONCLUSIVE');
  assert.equal(partVerdict({after: e(6), before: [...e(4), ...e(2, {met: false, delivers: true})]}, BAR.cell).verdict, 'DOES NOT LAND');
  assert.equal(partVerdict({after: [...e(5), ...e(1, {counted: false, met: false})], before: e(6)}, BAR.cell).verdict, 'LANDS', 'an uncounted entry counts for nothing');
});

test('the halves: each half attested by its swaps\' one build; swaps that restored two builds, or none attested, count nothing for the half', () => {
  const two = evidence();
  two[ITEMS.swap(4)] = swapRows(4, 'after', {build: 'b'.repeat(64)});
  const j = judgeIsolate(two);
  assert.equal(j.builds.after.build, null);
  assert.match(j.builds.after.problem, /its swaps restored 2 builds/);
  assert.equal(j.cell.verdict, 'INCONCLUSIVE');
  assert.ok(j.cells.after.every(c => c.status === 'not attested'));
  const none = judgeIsolate(evidence({swaps: false}));
  assert.match(none.builds.before.problem, /no swap to it attested/);
  assert.equal(none.verdict, 'INCONCLUSIVE');
  // A replacement counts in place of the person-touched repetition it replaced.
  const items = evidence({cell: (h, rep) => (h === 'after' && rep === 1 ? {personTouched: {apps: ['com.apple.ActivityMonitor'], frontPids: []}} : {})});
  items[ITEMS.cell('after', 1)][0] = {...start, at: 5000};
  items[ITEMS.cell('after', 6)] = [{...start, at: 6000}, {kind: 'task', task: '187-replaces', result: {ok: true, parent: ITEMS.cell('after', 1), attempt: 5000}}, {kind: 'task', task: '187-cell', result: cellRecord('after', 6)}];
  const r = judgeIsolate(items);
  assert.deepEqual(r.cells.after.map(c => c.status), ['counted', 'person-touched', 'counted', 'counted', 'counted', 'counted', 'counted']);
  assert.equal(r.cell.counts.after.counted, 6);
  items[ITEMS.cell('after', 6)][1].result.attempt = 1;
  assert.equal(judgeIsolate(items).cells.after.at(-1).status, 'stale replacement');
});

test('the verdict file: the pre-registered bar, the verdict and each part, the swaps, every repetition and row, the mechanism, #188 and the source', () => {
  const md = isolateMarkdown(judgeIsolate(evidence()), {commit: '0123456789ab'});
  assert.match(md, /^# #187: the isolating slot, the inert click as the cause \(scripts\/cursor-sitting\/item-187-isolate\.mjs, the kit at 0123456789ab\)/);
  assert.match(md, /\*\*The bar, pre-registered\*\*/);
  assert.match(md, /at least 5 of 6 \(at most 1 miss among the counted\)/);
  assert.match(md, /at least 8 of 9 \(at most 1 miss\)/);
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
  with188[ITEMS_188.rows('cua')] = [start, {kind: 'cell', nativeEngine: NATIVE.after}, {kind: 'cell', nativeEngine: NATIVE.before}];
  const j188 = judgeIsolate(with188);
  assert.deepEqual(j188.item188.attest, [{item: ITEMS_188.rows('cua'), cells: 2, unattested: 1, first: 'the result\'s build was cccccccccccc, not the half\'s saved aaaaaaaaaaaa'}]);
  assert.match(isolateMarkdown(j188), /188-rows-cua 1 of 2 cell\(s\) attested \(the result's build was cccccccccccc/);
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
});

test('the CLI: the dry run prints each block\'s steps and touches nothing; a re-slot\'s directory is refused; judge writes the verdict file; control-build --dry-run', async t => {
  const dir = scratch(t), out = join(dir, 'never-made');
  const {code, text} = await quietly(() => main(['isolate-187', 'drive', '--out', out, '--dry-run', '--quiet']));
  assert.equal(code, 0);
  const total = isolatePlan().reduce((n, p) => n + p.steps.length, 0);
  assert.match(text, new RegExp(`dry run: ${total} steps, nothing sent`));
  for (const c of stepCounts(isolatePlan())) assert.ok(text.includes(`dry run: ${c.label}: ${c.steps} steps`), c.label);
  assert.equal(existsSync(out), false, 'the dry run creates nothing');
  const some = await quietly(() => main(['isolate-187', 'drive', '--out', out, '--dry-run', '--quiet', '--blocks', '7']));
  assert.match(some.text, new RegExp(`dry run: ${isolatePlan({blocks: [7]}).reduce((n, p) => n + p.steps.length, 0)} steps`));
  writeFileSync(join(dir, 'item-187.md'), '# a re-slot\'s report\n');
  await assert.rejects(main(['isolate-187', 'drive', '--out', dir, '--dry-run']), /holds a re-slot's report/);
  rmSync(join(dir, 'item-187.md'));
  await assert.rejects(main(['isolate-187', 'drive', '--out', dir, '--run', dir, '--home', dir, '--halves', dir]), /engine-after holds no save/);
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
