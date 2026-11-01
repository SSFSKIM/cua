// #187's re-slot kit (scripts/cursor-sitting/item-187.mjs): the plan (no engine.json switch, the confirming cell's two
// halves, chrome/composing@textedit in 2 blocks of 9, the controls, #259's cell), a row's record and its key-window
// readings, the per-line confirmation, the bar (each condition alone keeps it from landing), the order put back after a
// raise, the composition key never typed over a delayed one, the cell run end to end, value-freeness and the CLI's dry
// runs. Nothing is driven: the runner runs against fakes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main, read187} from '../../scripts/cursor-sitting.mjs';
import {BLOCK_ROWS, CELL_REPS, CELL_ROW, cellItem, cellVerdict, clipboardReaders, COMPOSE_LEAD_MS, COMPOSE_REPOST_LEAD_MS, COMPOSING_BLOCKS, CONTROLS, freshActivation, GROUPS, groupItem,
  item187Markdown, item187Tasks, ITEMS, judge187, judgedOk, keyHeld, LABELS, menuOpened, PARTS, perLineProblem, plan187, releaseOf, ROWS, rowRecord, TARGET, VENDOR_ROWS} from '../../scripts/cursor-sitting/item-187.mjs';
import {ITEMS_188, ITEMS_259} from '../../scripts/cursor-sitting/item-188.mjs';
import {describeStep, runSteps} from '../../scripts/cursor-sitting/runner.mjs';
import {sha256Hex} from '../../scripts/native-matrix/matrix-text.mjs';
import {EMPTY_HASH} from '../../scripts/native-matrix/probe-plan.mjs';
import {COMPOSITION, KOREAN_2SET, UNICODE_STRINGS} from '../../scripts/native-matrix/unicode-plan.mjs';
import {HANGUL_LAYOUT, SETTLE_READS} from '../../scripts/native-matrix/unicode-run.mjs';

const T0 = 1_790_000_000_000;
const PIDS = {chrome: 201, textedit: 202, electron: 203};
const ZERO = {windowFocus: 0, windowBlur: 0, textFocus: 0, textBlur: 0, mousedown: 0, click: 0};
const scratch = t => { const dir = mkdtempSync(join(tmpdir(), 'cua-187-')); t.after(() => rmSync(dir, {recursive: true, force: true})); return dir; };
const quietly = async run => { const write = process.stdout.write; let text = ''; process.stdout.write = chunk => { text += chunk; return true; }; try { return {code: await run(), text}; } finally { process.stdout.write = write; } };
// No string's text may appear in what the kit keeps (the latin string's words are common, so its full text is checked).
const leaks = text => UNICODE_STRINGS.filter(s => String(text).includes(s.text)).map(s => s.id);
const KEY = {trusted: true, ok: true, frontmost: true, found: true, focused: true, main: true, focusedWindow: 'run', mainWindow: 'run'};
const KEYLESS = {...KEY, focused: false, main: false, focusedWindow: 'none', mainWindow: 'none'};
const BACK = {...KEY, frontmost: false, focused: false, main: true, focusedWindow: 'run'};
// Every line of `text` confirmed by its own change, each later line opened by a settled Return.
const linesOf = text => text.split('\n').map((_, k) => ({line: k + 1, stage: 'effect', confirmed: true, effectWait: 'reading', baseline: {characters: 10 * k}, confirming: {characters: 10 * k + 2},
  ...(k > 0 ? {openingReturn: {settle: 'reading', settleMs: 15, toCommandVMs: 20}} : {})}));

// A row's readings, all as a delivering, undisturbed row reads them; `over` replaces any of them.
function input({group = 'chrome-composing', block = 0, i = 0, row = ROWS[1], item = ITEMS.composing, engine = 'cua', ...over} = {}) {
  const g = GROUPS[group], expectedLength = row.string.text.length, chrome = g.driven === 'chrome';
  return {
    spec: {key: `${item}#${block}.${i}`, item, group, block, i, string: row.string.id, method: row.method, expectedLength, lines: row.string.text.split('\n').length, regime: g.regime, engine},
    prepare: {ok: true, value: {ready: true}},
    act: {ok: true, value: {actMs: 190, threw: false, message: null}, route: 'paste',
      meta: {activationGuardMs: 41, activationClick: 'outsideFrame', activationClickKind: {kind: 'inertOutside', point: 'offset', when: 'early'}, entered: expectedLength, delivery: {restores: 0},
        paste: {stage: 'effect', confirmed: true, readWait: 'handedOver', readAfterPostMs: 12, effectWait: 'reading', restore: 'restored',
          focusEnforcement: {activated: true, point: 'outside', click: {kind: 'inertOutside', point: 'offset'}, activationToCommandVMs: 30, clickToCommandVMs: 20}, perLine: linesOf(row.string.text)}}},
    check: {ok: true, value: {ok: true, outcome: {exact: true, nfcEqual: true, length: expectedLength, expectedLength}}},
    page: chrome ? {mid: {seq: 4, length: 0, counts: {...ZERO}, focused: g.user ? false : true}, after: {seq: 5, length: expectedLength, counts: {...ZERO}, focused: g.user ? false : true}} : null,
    fixture: null,
    front: {mid: PIDS[g.user ?? g.driven], after: PIDS[g.user ?? g.driven], expected: PIDS[g.user ?? g.driven]},
    activations: [], raisedAt: [], stateAtStart: g.user ? 'front-above' : null, userKept: g.user ? true : null,
    clipboard: {mid: 'digest', after: 'digest'}, menu: chrome ? {read: {trusted: true, ok: true, selected: 0, openMenus: 0, focusedRole: 'AXTextArea'}, observed: 0} : null,
    keyWindow: g.user ? BACK : KEY, disturbed: false, ...over};
}
const record = options => rowRecord(input(options));
const taskRow = result => ({kind: 'task', task: '187-row', result});
const start = {kind: 'start'};
// The record with readings replaced (a row of the evidence, recomputed).
const reRecord = (r, over) => rowRecord(input({item: r.item, group: r.group, block: r.block, i: r.i, row: [...ROWS, CELL_ROW].find(x => x.method === r.method && x.string.id === r.string), ...over}));

// The order watcher's end record of a background item: whole, no raise.
const orderStop = (over = {}) => ({kind: 'task', task: '187-order-stop', result: {ok: true, maxGapMs: 12, raises: 0, rowRaises: {}, tailRaises: {}, setupRaises: 0, unattributed: [], ...over}});
// The last item: the owner's source selected again and read back.
const endItem = (result = {ok: true, which: 'owner', switched: true, requested: 'com.apple.keylayout.ABC', current: {id: 'com.apple.keylayout.ABC'}}) =>
  [start, {kind: 'task', task: 'activate', result: {ok: true}}, {kind: 'task', task: 'select-source', args: ['owner', 'textedit'], result}];
// One cell repetition's record, as '187-cell' writes it; `over` replaces any part.
const cellRecord = (half, rep, over = {}) => ({tag: `${ITEMS.cell(half, rep)}#0`, half, rep,
  press: {ok: true, pressed: true, plan: 'action', action: 'AXPress', reason: 'advertised', kind: {kind: 'inertOutside', point: 'offset', when: 'early'}},
  pressRead: {inFront: true, found: true, focused: true, empty: true}, keyBefore: {reading: {...BACK, focused: false}, pageFocused: false},
  keyAfter: {reading: KEY, pageFocused: true, settledMs: 120}, row: record({item: ITEMS.cell(half, rep), group: 'chrome-cell', row: CELL_ROW}), ...over});
const cellItemRows = (half, rep, over) => [start, {kind: 'task', task: '187-cell', result: cellRecord(half, rep, over)}];
const groupRows = (item, group, rows, tweak = r => r) => [start, ...rows.map(([block, i, row]) => taskRow(tweak(record({item, group, block, i, row})))), ...(GROUPS[group].user ? [orderStop()] : [])];
const putbackRow = (over = {}) => [start, {kind: 'task', task: '187-putback', result: {ok: true, saved: 'dd7a09235885', current: {build: 'dd7a09235885', approved: true}, ...over}}];

// The whole re-slot's evidence with every condition holding; the tweaks change rows of one group.
function evidence({tweakComposing = r => r, tweakControl = r => r, cell = () => ({}), end = true, putback = true} = {}) {
  const items = {};
  items[ITEMS.composing] = groupRows(ITEMS.composing, 'chrome-composing', COMPOSING_BLOCKS.flatMap((rows, block) => rows.map((row, i) => [block, i, row])), tweakComposing);
  for (const group of CONTROLS) items[ITEMS.control(group)] = groupRows(ITEMS.control(group), group, ROWS.map((row, i) => [0, i, row]), tweakControl);
  for (let rep = 0; rep < CELL_REPS; rep++) items[ITEMS.cell('after', rep)] = cellItemRows('after', rep, cell(rep));
  if (end) items[ITEMS.end] = endItem();
  if (putback) items[ITEMS.putback] = putbackRow();
  return items;
}
const firstOnly = (fn, over) => { let done = false; return r => (done ? r : (done = true, fn(r, over))); };

test('the rows: hold 3\'s nine strings typed and pasted; chrome/composing@textedit as 2 blocks of 9 runs each once; the cell pastes the one-line Latin string', () => {
  assert.equal(ROWS.length, 18);
  assert.equal(TARGET, 18);
  assert.deepEqual([...new Set(ROWS.map(r => r.method))], ['typeText', 'paste']);
  assert.equal(VENDOR_ROWS.length, 9);
  assert.equal(COMPOSING_BLOCKS.length, 2);
  assert.ok(COMPOSING_BLOCKS.every(b => b.length === BLOCK_ROWS && b.length === 9));
  assert.deepEqual(COMPOSING_BLOCKS.flat(), [...ROWS], 'every row once');
  assert.equal(CELL_ROW.method, 'paste');
  assert.ok(!CELL_ROW.string.text.includes('\n'));
  assert.equal(releaseOf('chrome-composing'), 'electron');
  assert.equal(releaseOf('textedit-composing'), 'chrome');
  assert.equal(releaseOf('chrome-korean'), null);
  assert.equal(releaseOf('chrome-cell'), null);
});

test('the re-slot\'s plan: the placement, the cell\'s AFTER half, the placement again, the 2 blocks, the controls once, #259\'s cell, the owner\'s source; no switch, no engine stop, no arm read', () => {
  const plan = plan187();
  assert.deepEqual(plan.map(p => p.item), [ITEMS.place, ...[0, 1, 2].map(rep => ITEMS.cell('after', rep)), ITEMS.placeAgain, ITEMS.composing, ...CONTROLS.map(ITEMS.control), ITEMS_259.click, ITEMS.end]);
  const steps = plan.flatMap(p => p.steps);
  assert.ok(!steps.some(s => ['engine-json-paste', 'engine-json-restore', 'engine-stop', '187-arm'].includes(s.task)), 'nothing writes engine.json, stops the engine or reads an arm');
  assert.deepEqual(plan[0].steps.filter(s => s.task).map(s => s.task), ['187-preflight', '187-place', 'activate']);
  assert.deepEqual(plan.find(p => p.item === ITEMS.placeAgain).steps.filter(s => s.task).map(s => s.task), ['187-place', 'activate']);
  assert.deepEqual(plan.at(-1).steps.filter(s => s.task).map(s => [s.task, ...(s.args ?? [])]), [['activate', 'textedit'], ['select-source', 'owner', 'textedit']]);
  const composing = plan.find(p => p.item === ITEMS.composing).steps;
  assert.equal(composing.filter(s => s.open).length, 2, 'a session per block, each on a fresh composition');
  assert.equal(composing.filter(s => s.task === '187-compose').length, 2);
  assert.equal(composing.filter(s => s.task === '187-row').length, 18);
  for (const group of CONTROLS) assert.equal(plan.find(p => p.item === ITEMS.control(group)).steps.filter(s => s.task === '187-row').length, 18);
  // Korean engaged only after the refocus, with ABC first, gated by the runner's select-source.
  const setup = composing.slice(composing.findIndex(s => s.open), composing.findIndex(s => s.task === '187-compose') + 1).filter(s => s.task).map(s => [s.task, ...(s.args ?? [])].join(' '));
  assert.deepEqual(setup.slice(0, 9), [`187-setup ${ITEMS.composing}#0 start`, `187-ready ${ITEMS.composing}#0 setup: the driven field emptied and focused`, 'activate textedit', 'select-source latin textedit',
    `select-source named textedit ${KOREAN_2SET}`, 'activate electron', 'activate textedit', `187-korean ${ITEMS.composing}#0 textedit`, `187-ready ${ITEMS.composing}#0 setup: the user window's field emptied and focused`]);
  // Every act under the key guard of the user window, after a release observation of the third scene, and every
  // background row followed by the order's restore.
  const acts = composing.filter(s => s.run && /act:/.test(s.label));
  assert.ok(acts.every(s => s.keys === 'textedit'));
  composing.forEach((s, k) => { if (s.task === '187-row') assert.equal(composing[k + 1].task, '187-order-restore'); });
  assert.ok(composing.some(s => s.run && /release: the electron scene/.test(s.label)));
  // Nothing the plan prints names a string's text.
  assert.deepEqual(leaks(plan.flatMap(p => p.steps.map(describeStep)).join('\n')), []);
});

test('the confirming cell: Chrome relaunched, TextEdit in front under ABC, the field clicked in the background, its hold ended, open -a, the key read, a paste whose prepare clicks nothing', () => {
  const steps = cellItem({half: 'after', rep: 0});
  const order = steps.map(s => s.task ?? (s.open ? 'open' : s.close ? 'close' : s.run ? s.label.replace(/^\S+ /, '') : null)).filter(Boolean);
  const at = name => order.findIndex(x => (typeof x === 'string' ? x.startsWith(name) : false));
  assert.ok(at('187-relaunch') < at('activate') && at('activate') < at('select-source') && at('select-source') < at('open'));
  assert.ok(at('press:') < at('press read') && at('press read') < at('release: the textedit') && at('release: the textedit') < at('187-open'));
  assert.ok(at('187-open') < at('187-mid') && at('187-mid') < at('187-row') && at('187-row') < at('187-cell'));
  assert.deepEqual(steps.filter(s => s.task === '187-key').map(s => s.args[2]), ['before', 'after']);
  assert.deepEqual(steps.find(s => s.task === 'select-source').args, ['latin', 'textedit']);
  assert.ok(steps.find(s => s.task === '187-relaunch').required && steps.find(s => s.task === '187-open').required);
  const prepare = steps.find(s => s.run && /prepare:/.test(s.label)), act = steps.find(s => s.run && /act:/.test(s.label)), press = steps.find(s => s.run && /press:/.test(s.label));
  assert.ok(!/__app\.(click|setValue|typeText|paste)/.test(prepare.cell), 'the paste row\'s prepare sends no input');
  assert.match(press.cell, /await __app\.click\(__index\)/);
  const afterClick = press.cell.slice(press.cell.indexOf('await __app.click(__index)') + 'await __app.click(__index)'.length);
  assert.ok(!/__app\.|observe\(/.test(afterClick), 'the click is the press cell\'s last call, so its meta is the click\'s');
  assert.equal(act.keys, 'chrome');
  assert.match(act.cell, /__app\.paste\(/);
  // The before part: the put-back read against the save, the three repetitions, the owner's source.
  const before = plan187({part: 'before', saved: '/saved'});
  assert.deepEqual(before.map(p => p.item), [ITEMS.putback, ...[0, 1, 2].map(rep => ITEMS.cell('before', rep)), ITEMS.end]);
  assert.deepEqual(before[0].steps.find(s => s.task === '187-putback').args, ['/saved']);
  assert.ok(!before[0].steps.find(s => s.task === '187-putback').required, 'the BEFORE half runs on whatever engine is installed, recorded');
});

test('the parts: each reruns alone between the placement and the owner\'s source; #188 and #259 under #188\'s own; the vendor\'s lanes', () => {
  assert.deepEqual(PARTS, ['reslot', 'before', 'cell', 'composing', 'controls', '259', '188', '188-vendor-click']);
  assert.deepEqual(plan187({part: 'cell'}).map(p => p.item), [ITEMS.place, ...[0, 1, 2].map(rep => ITEMS.cell('after', rep)), ITEMS.placeAgain, ITEMS.end]);
  assert.deepEqual(plan187({part: 'composing'}).map(p => p.item), [ITEMS.place, ITEMS.composing, ITEMS.end]);
  assert.deepEqual(plan187({part: 'controls'}).map(p => p.item), [ITEMS.place, ...CONTROLS.map(ITEMS.control), ITEMS.end]);
  assert.deepEqual(plan187({part: '259'}).map(p => p.item), [ITEMS_188.place, ITEMS_259.click, ITEMS_188.end]);
  assert.deepEqual(plan187({vendor: true}).map(p => p.item), [ITEMS.place, ITEMS.vendorKorean, ITEMS.vendor, ITEMS.end], 'the vendor\'s chrome/korean rows first');
  assert.equal(plan187({vendor: true})[1].steps.filter(s => s.task === '187-row').length, 9);
  assert.ok(!plan187().some(p => p.item.startsWith('188-')), '#188\'s items are out of the default');
  assert.throws(() => plan187({part: 'a'}), /--part takes reslot, before/);
});

test('a row is delivered only when the engine\'s read-back and the page\'s fresh beacon agree; the key-window state before the act is kept', () => {
  const good = record();
  assert.equal(good.delivered, true);
  assert.equal(good.invalid, null);
  assert.equal(good.ok, true);
  assert.deepEqual(good.keyWindow, BACK);
  assert.equal(good.pageFocused, false);
  assert.deepEqual(good.activationClickKind, {kind: 'inertOutside', point: 'offset', when: 'early'});
  assert.deepEqual(good.delivery, {restores: 0});
  const empty = record({page: {mid: {seq: 4, length: 0, counts: ZERO}, after: {seq: 5, length: 0, counts: ZERO}}});
  assert.equal(empty.delivered, false);
  assert.equal(empty.disagree, true);
  const expected = ROWS[1].string.text.length;
  const stale = record({page: {mid: {seq: 5, length: expected, counts: ZERO}, after: {seq: 5, length: expected, counts: ZERO}}});
  assert.equal(stale.page.beaconAfterAct, false);
  assert.equal(stale.delivered, false);
  const inexact = record({check: {ok: true, value: {ok: false, outcome: {exact: false, length: expected, expectedLength: expected}}}});
  assert.equal(inexact.delivered, false);
  assert.equal(record({group: 'electron-composing', item: ITEMS.control('electron-composing')}).delivered, true, 'no page: the read-back alone');
  assert.equal(record({group: 'electron-composing', item: ITEMS.control('electron-composing')}).pageFocused, null);
  assert.match(record({page: {mid: null, after: {seq: 5, length: expected, counts: ZERO}}}).invalid, /page counters before the act/);
});

test('a background act without a fresh activation is invalid; a frontmost one needs none', () => {
  assert.match(record({act: {...input().act, meta: {...input().act.meta, activationGuardMs: undefined}}}).invalid, /held activation/);
  assert.match(record({act: {...input().act, meta: {...input().act.meta, paste: {...input().act.meta.paste, focusEnforcement: {activated: false}}}}}).invalid, /held activation/);
  assert.equal(freshActivation({activationGuardMs: 40}), true);
  assert.equal(record({group: 'chrome-korean', item: ITEMS.control('chrome-korean'), act: {...input().act, meta: {entered: 3}}}).invalid, null);
  assert.equal(record({engine: 'vendor', item: ITEMS.vendor, act: {...input().act, meta: {}}}).invalid, null, 'the vendor\'s rows are not gated');
  assert.match(record({disturbed: true}).invalid, /disturbed/);
  assert.match(record({stateAtStart: 'back-above'}).invalid, /window order/);
  assert.match(record({front: {mid: 999, after: 999, expected: PIDS.textedit}}).invalid, /frontmost process/);
});

test('the key: the app frontmost with its run window AXFocused and AXMain, and on Chrome the page focused; an unread reading is no answer', () => {
  assert.equal(keyHeld(KEY, true), true);
  assert.equal(keyHeld(KEY), true, 'no page to read');
  assert.equal(keyHeld(KEYLESS, false), false);
  assert.equal(keyHeld(KEY, false), false, 'the window key but the page not focused');
  assert.equal(keyHeld(KEY, null), null, 'the page unread');
  assert.equal(keyHeld(KEYLESS, null), false, 'not key whatever the page says');
  assert.equal(keyHeld({...KEY, ok: false}, true), null);
  assert.equal(keyHeld({trusted: false}, true), null);
  assert.equal(keyHeld(null, true), null);
});

test('the per-line record: every line confirmed by its own change, each later line opened by a settled Return; the slot\'s false success fails it', () => {
  const lines = ROWS.find(r => r.string.id === 'lines' && r.method === 'paste');
  const ok = record({row: lines});
  assert.equal(ok.lines, 2);
  assert.equal(perLineProblem(ok), null);
  const withPerLine = perLine => record({row: lines, act: {...input({row: lines}).act, meta: {...input({row: lines}).act.meta, paste: {...input({row: lines}).act.meta.paste, perLine}}}});
  assert.match(perLineProblem(withPerLine(undefined)), /no per-line record/);
  assert.match(perLineProblem(withPerLine(linesOf('one'))), /1 per-line record\(s\) for 2 line\(s\)/);
  const [l1, l2] = linesOf('a\nb');
  assert.match(perLineProblem(withPerLine([l1, {...l2, confirmed: false, effectWait: 'timeout'}])), /line 2 was not confirmed by its own change/);
  assert.match(perLineProblem(withPerLine([l1, {...l2, effectWait: 'noChannel', confirmed: false}])), /line 2 was not confirmed/);
  // B#3.5 of the slot: line 2 confirmed by a reading taken against a baseline before its Return's own effect.
  const {openingReturn, ...unsettled} = l2;
  assert.match(perLineProblem(withPerLine([l1, unsettled])), /line 2's opening Return was not settled before its baseline/);
  assert.match(perLineProblem(withPerLine([l1, {...l2, openingReturn: {settle: 'timeout'}}])), /not settled/);
  assert.match(perLineProblem(withPerLine([l1, {...l2, confirming: l2.baseline}])), /confirming reading is its own baseline/);
  // Review P2: a reading-confirmed line must carry both readings; one absent or null is no own change.
  for (const missing of [{confirming: undefined}, {confirming: null}, {baseline: undefined}, {baseline: null}]) {
    assert.match(perLineProblem(withPerLine([l1, {...l2, ...missing}])), /line 2 was confirmed by a reading without both its baseline and its confirming reading/, JSON.stringify(missing));
    assert.match(perLineProblem(withPerLine([{...l1, ...missing}, l2])), /line 1 was confirmed by a reading without both/);
  }
  const bare = evidence({tweakComposing: r => (r.string === 'lines' && r.method === 'paste' ? reRecord(r, {act: {...input().act, meta: {...input().act.meta, paste: {...input().act.meta.paste, perLine: linesOf('a\nb').map((l, k) => (k ? {...l, confirming: null} : l))}}}}) : r)});
  assert.equal(judge187(bare).overall.verdict, 'DOES NOT LAND');
  assert.equal(perLineProblem(withPerLine([l1, {...l2, effectWait: 'notification', confirming: undefined}])), null, 'a trusted notification confirms');
  assert.match(perLineProblem(withPerLine([l2, l1])), /not lines 1\.\.2 in order/);
  assert.equal(openingReturn.settle, 'reading');
});

test('the bar: every condition holding, the re-slot lands, with the baseline cited', () => {
  const judged = judge187(evidence());
  assert.equal(judged.overall.verdict, 'LANDS', judged.overall.why.join('; '));
  assert.equal(judgedOk(judged), true);
  const md = item187Markdown(judged);
  assert.match(md, /## Overall: LANDS/);
  assert.match(md, /0 of 99 valid rows delivered, every one stopping at the read \(timeout\) stage/);
  assert.match(md, /AFTER: 3 of 3 repetitions key and delivered/);
  assert.match(md, /BEFORE: not recorded/);
  assert.deepEqual(leaks(md), []);
});

test('the bar\'s traps: each one alone is DOES NOT LAND, never a partial verdict', () => {
  const lines = (r, perLine) => reRecord(r, {act: {...input().act, meta: {...input().act.meta, paste: {...input().act.meta.paste, perLine}}}});
  const cases = [
    ['a composing row undelivered', {tweakComposing: firstOnly(reRecord, {page: {mid: {seq: 4, length: 0, counts: ZERO}, after: {seq: 5, length: 0, counts: ZERO}}})}, /chrome\/composing@textedit: 17 of 18 rows valid and delivered/],
    ['a composing row invalid', {tweakComposing: firstOnly(reRecord, {act: {...input().act, meta: {...input().act.meta, activationGuardMs: null}}})}, /17 of 18 rows valid and delivered \(18 recorded\); invalid: no fresh activation/],
    ['a composing row\'s lines unconfirmed', {tweakComposing: r => (r.string === 'lines' && r.method === 'typeText' ? lines(r, linesOf('a\nb').map((l, k) => (k ? {...l, openingReturn: undefined} : l))) : r)}, /whose lines were not each confirmed by their own change/],
    ['a control row undelivered', {tweakControl: firstOnly(reRecord, {check: {ok: true, value: {ok: false, outcome: {exact: false, length: 0, expectedLength: 3}}}})}, /the electron\/composing@textedit control: 17 of 18/],
    ['a raise in a row', {tweakComposing: firstOnly(reRecord, {raisedAt: [T0 + 5]})}, /1 raise\(s\): 1 in rows/],
    ['a raise in a cell row', {cell: rep => (rep === 0 ? {row: reRecord(record({item: ITEMS.cell('after', 0), group: 'chrome-cell', row: CELL_ROW}), {group: 'chrome-cell', item: ITEMS.cell('after', 0), raisedAt: [T0]})} : {})}, /1 raise\(s\): 1 in rows/],
    ['a page click', {tweakComposing: firstOnly(reRecord, {page: {mid: {seq: 4, length: 0, counts: ZERO}, after: {seq: 6, length: ROWS[0].string.text.length, counts: {...ZERO, mousedown: 1, click: 1}}}})}, /touched the person's side \(page click\)/],
    ['an open menu', {tweakComposing: firstOnly(reRecord, {menu: {read: {trusted: true, ok: true, selected: 1, openMenus: 0, focusedRole: null}, observed: 0}})}, /1 row\(s\) with a menu opened in Chrome/],
    ['an unread menu', {tweakComposing: firstOnly(reRecord, {menu: {read: {trusted: false}, observed: 0}})}, /menus could not be read after 1 row/],
    ['a front-app change', {tweakControl: firstOnly(reRecord, {activations: [{kind: 'activated', bundleId: 'com.google.chrome.for.testing', at: T0}]})}, /touched the person's side \(front app\)/],
    ['the composition disturbed', {tweakComposing: firstOnly(reRecord, {userKept: false})}, /touched the person's side \(composition\)/],
    ['a clipboard restore that did not hold', {tweakComposing: firstOnly(reRecord, {clipboard: {mid: 'a', after: 'b'}})}, /touched the person's side \(clipboard\)/],
    ['a cell repetition not key', {cell: rep => (rep === 1 ? {keyAfter: {reading: KEYLESS, pageFocused: false}} : {})}, /AFTER half: 2 of 3 repetitions key and delivered \(.*2: the key was not held after the activation/],
    ['a cell repetition whose page focus is unread', {cell: rep => (rep === 0 ? {keyAfter: {reading: KEY, pageFocused: null}} : {})}, /key-window state after the activation was not read whole/],
    ['a cell repetition not on the action plan', {cell: rep => (rep === 2 ? {press: {ok: true, pressed: true, plan: 'synthesized'}} : {})}, /the click's plan was synthesized, not the action plan/],
    // Review P2: a delivering cell paste that touches the person's side fails the bar like any composing or control row.
    ...[['its clipboard restore did not hold', {clipboard: {mid: 'a', after: 'b'}}, /the cell's AFTER half: 1 row\(s\) touched the person's side \(clipboard\)/],
      ['it changed the front app', {activations: [{kind: 'activated', bundleId: 'com.apple.TextEdit', at: T0}]}, /the cell's AFTER half: 1 row\(s\) touched the person's side \(front app\)/],
      ['it produced a page click', {page: {mid: {seq: 4, length: 0, counts: ZERO, focused: true}, after: {seq: 6, length: CELL_ROW.string.text.length, counts: {...ZERO, mousedown: 1}, focused: true}}}, /the cell's AFTER half: 1 row\(s\) touched the person's side \(page click\)/],
      ['it opened a menu', {menu: {read: {trusted: true, ok: true, selected: 0, openMenus: 1}, observed: 0}}, /1 row\(s\) with a menu opened in Chrome/]]
      .map(([what, over, why]) => [`a delivering cell paste where ${what}`, {cell: rep => (rep === 1 ? {row: reRecord(record({item: ITEMS.cell('after', 1), group: 'chrome-cell', row: CELL_ROW}), {group: 'chrome-cell', item: ITEMS.cell('after', 1), ...over})} : {})}, why]),
    ['a cell repetition that did not deliver', {cell: rep => (rep === 0 ? {row: reRecord(record({item: ITEMS.cell('after', 0), group: 'chrome-cell', row: CELL_ROW}), {group: 'chrome-cell', item: ITEMS.cell('after', 0), check: {ok: true, value: {ok: false, outcome: {exact: false, length: 0, expectedLength: 44}}}})} : {})}, /the paste did not deliver/],
    ['the put-back not read', {putback: false}, /the engine put-back was not read/],
    ['the source not restored', {end: false}, /owner's input source was not selected again/],
  ];
  for (const [what, options, why] of cases) {
    const judged = judge187(evidence(options));
    assert.equal(judged.overall.verdict, 'DOES NOT LAND', what);
    assert.match(judged.overall.why.join('; '), why, what);
    assert.equal(judgedOk(judged), false, what);
  }
  const missingRep = evidence();
  delete missingRep[ITEMS.cell('after', 2)];
  assert.match(judge187(missingRep).overall.why.join('; '), /2 of 3 repetitions key and delivered \(.*3: not recorded/);
  const short = evidence();
  short[ITEMS.control('chrome-korean')].splice(3, 1);
  assert.match(judge187(short).overall.why.join('; '), /chrome\/korean control: 17 of 18 rows valid and delivered \(17 recorded\)/);
  const stopped = evidence();
  stopped[ITEMS.control('textedit-composing')].push({kind: 'stopped', error: '187-korean refused'});
  assert.match(judge187(stopped).overall.why.join('; '), /textedit\/composing@electron control stopped: 187-korean refused/);
  const wrongEngine = evidence();
  wrongEngine[ITEMS.putback] = putbackRow({ok: false, current: {build: '6226f2698ab0', approved: true}, problem: 'the installed build is 6226f2698ab0, not the saved dd7a09235885'});
  assert.match(judge187(wrongEngine).overall.why.join('; '), /the engine was not put back: the installed build is 6226f2698ab0/);
  const failedSource = evidence();
  failedSource[ITEMS.end] = endItem({ok: false, which: 'owner', switched: true, requested: 'com.apple.keylayout.ABC', current: {id: KOREAN_2SET}, problem: 'read back 2-Set'});
  assert.match(item187Markdown(judge187(failedSource)), /owner's input source NOT restored/);
});

test('the bar\'s watchers: a gap past 50 ms, an unreconciled total, a tail raise or an unattributed raise each fail it; a raise inside the kit\'s own setup does not', () => {
  const replaceStop = (item, over) => { const e = evidence(); e[item].splice(-1, 1, orderStop(over)); return judge187(e); };
  assert.match(replaceStop(ITEMS.control('electron-composing'), {maxGapMs: 80}).overall.why.join('; '), /electron\/composing@textedit control: the order watcher's longest gap was 80 ms, past 50/);
  assert.match(replaceStop(ITEMS.composing, {raises: 2}).overall.why.join('; '), /saw 2 raise\(s\), but 0 are accounted for/);
  const key = `${ITEMS.composing}#1.8`;
  assert.match(replaceStop(ITEMS.composing, {raises: 1, tailRaises: {[key]: [T0 + 9]}}).overall.why.join('; '), /1 raise\(s\): 1 in rows \(a block's tail counted with its last row\), 0 outside/);
  assert.match(replaceStop(ITEMS.composing, {raises: 1, unattributed: [T0 + 3]}).overall.why.join('; '), /1 raise\(s\): 0 in rows .*1 outside every row and setup step/);
  assert.equal(replaceStop(ITEMS.control('textedit-composing'), {raises: 1, setupRaises: 1}).overall.verdict, 'LANDS', 'the refocus through the driven app is the kit\'s own setup');
  const none = evidence();
  none[ITEMS.control('textedit-composing')].pop();
  assert.match(judge187(none).overall.why.join('; '), /record is missing or has no end/);
  const reconciled = evidence(), rowKey = reconciled[ITEMS.composing].find(r => r.task === '187-row').result.key;
  reconciled[ITEMS.composing].splice(-1, 1, orderStop({raises: 1, rowRaises: {[rowKey]: [T0 + 7]}}));
  assert.match(judge187(reconciled).overall.why.join('; '), /1 raise\(s\): 1 in rows/, 'a raise the final record holds in a row\'s span is the row\'s');
});

test('the BEFORE half is recorded only: its prediction is reported, a delivery there says the mechanism is wrong, and neither moves the bar', () => {
  const items = evidence();
  const before = rep => cellItemRows('before', rep, {keyAfter: {reading: KEYLESS, pageFocused: false},
    row: reRecord(record({item: ITEMS.cell('before', rep), group: 'chrome-cell', row: CELL_ROW}), {group: 'chrome-cell', item: ITEMS.cell('before', rep),
      act: {ok: true, value: {actMs: 2100, threw: true, message: 'timed out'}, route: 'paste', meta: {paste: {stage: 'read', readWait: 'timeout', confirmed: null}}},
      check: {ok: true, value: {ok: false, outcome: {exact: false, length: 0, expectedLength: CELL_ROW.string.text.length}}}})});
  for (let rep = 0; rep < CELL_REPS; rep++) items[ITEMS.cell('before', rep)] = before(rep);
  const judged = judge187(items);
  assert.equal(judged.overall.verdict, 'LANDS');
  assert.deepEqual(judged.cells.before.map(c => [c.keyless, c.readTimeout, c.delivered]), Array(3).fill([true, true, false]));
  assert.match(item187Markdown(judged), /BEFORE \(recorded only\): 3 of 3 repetitions keyless with the read timing out, as predicted\./);
  items[ITEMS.cell('before', 1)] = cellItemRows('before', 1);
  const wrong = judge187(items);
  assert.equal(wrong.overall.verdict, 'LANDS', 'the BEFORE half never moves the bar');
  assert.match(item187Markdown(wrong), /1 BEFORE repetition\(s\) delivered: the mechanism is wrong/);
  assert.deepEqual(cellVerdict(null), {recorded: false, setUp: false, key: null, delivered: false, keyless: null, readTimeout: false, why: 'not recorded'});
});

// The Mac, faked: three scenes, a page that counts what the act enters (and whether the page has the focus), an order
// watcher whose record the fake's raises and activations write, a composition the probe's key starts, Chrome's relaunch
// and the person's activation. `raiseAt`: the row keys whose act raises Chrome. `lateRaiseAt`: rows whose act raises
// Chrome, the watcher writing it only after the row's own read; `activationsInWaitAt`: rows whose page beacon lags,
// Chrome and then TextEdit activated while the row waits for it. `tailRaise`: Chrome raised while the block closes its
// session; `menuWatch`: the notification watcher's fate (ok, ended, dead, unreadable) and `menuSnapshot` whether the
// snapshot reads succeed. `lostKeys`: composition keys lost; `delayedReads`: focus reads before the first key lands;
// `latinKey`: the key lands as the Latin letter; `keyless`: Chrome left without a key window by `open -a`.
function fakeMac(out, {raiseAt = [], lateRaiseAt = [], activationsInWaitAt = [], tailRaise = false, menuWatch = 'ok', menuSnapshot = true, lostKeys = 0, delayedReads = 0, latinKey = false, keyless = false} = {}) {
  let clock = T0, front = 'textedit', composed = false, typedLatin = false, keyedAt = null, fieldReads = 0;
  const pids = {...PIDS}, keystrokes = [], keyClock = [], sleeps = [];
  const bounds = {chrome: {x: 300, y: 80, width: 800, height: 600}, textedit: {x: 500, y: 100, width: 700, height: 500}, electron: {x: 900, y: 120, width: 500, height: 400}};
  const numbers = {chrome: 11, textedit: 12, electron: 13};
  const changes = [], calls = [], activationsLog = [];
  let attempts = 0, lagReads = 0, stalePage = null, pairDue = false;
  const chromeKey = () => front === 'chrome' && !keyless;
  let page = {seq: 0, length: 0, counts: {...ZERO}, focused: false};
  const beacon = over => { page = {...page, seq: page.seq + 1, focused: chromeKey(), ...over}; };
  const tick = () => (clock += 5);
  const order = state => changes.push({kind: 'order', at: tick(), prev: clock - 5, state});
  const stateNow = () => changes.at(-1)?.state ?? 'front-above';
  const scene = id => ({id, app: `/Apps/${id}.app`, pid: pids[id], at: 1, window: {number: numbers[id]}});
  const session = {
    run: async (code, {keys}) => {
      tick();
      if (code.includes('// cua-187: press read')) return {ok: true, value: {inFront: true, found: true, focused: true, empty: page.length === 0}, route: null, meta: {}, images: []};
      if (code.includes('// cua-187: press')) {
        calls.push(['press']);
        return {ok: true, value: {pressed: true, threw: false, errorName: null}, route: 3, images: [],
          meta: {activationGuardMs: 30, activationClickKind: {kind: 'inertOutside', point: 'offset', when: 'early'}, elementClick: {plan: 'action', action: 'AXPress', reason: 'advertised', hit: 'same'}}};
      }
      if (code.includes('// cua-187: prepare')) {
        calls.push(['prepare', code.includes('(no click)') ? 'no click' : 'emptied']);
        if (!code.includes('(no click)')) page = {...page, seq: page.seq + 1, length: 0};
        return {ok: true, value: {ready: true}, route: null, meta: {}, images: []};
      }
      if (code.includes('// cua-187: act')) {
        const text = JSON.parse(code.match(/__app\.(?:typeText|paste)\(("(?:[^"\\]|\\.)*")\)/)[1]);
        const key = calls.filter(c => c[0] === 'act').length;
        calls.push(['act', keys]);
        if (activationsInWaitAt.includes(key)) { stalePage = {...page}; lagReads = 2; pairDue = true; }
        const lands = !(GROUPS['chrome-cell'] && keys === 'chrome' && keyless);
        if (lands) beacon({length: text.length});
        if (raiseAt.includes(key)) order('back-above');
        if (lateRaiseAt.includes(key)) { order('back-above'); changes.at(-1).visibleAfter = attempts + 2; }
        return {ok: true, value: {actMs: lands ? 180 : 2100, threw: !lands, message: lands ? null : 'timed out'}, route: 'paste', images: [],
          meta: {activationGuardMs: 40, activationClick: 'outsideFrame', entered: lands ? text.length : 0,
            paste: lands ? {stage: 'effect', confirmed: true, focusEnforcement: {activated: true, point: 'outside'}, perLine: linesOf(text)} : {stage: 'read', readWait: 'timeout'}}};
      }
      if (code.includes('// cua-187: check')) {
        const expectedLength = Number(code.match(/expectedLength: (\d+)/)[1]), exact = page.length === expectedLength;
        return {ok: true, value: {ok: exact, outcome: {exact, nfcEqual: exact, length: page.length, expectedLength}}, route: null, meta: {}, images: []};
      }
      return {ok: true, value: {inFront: true}, route: null, meta: {}, images: []};
    },
    close: async () => { if (tailRaise) order('back-above'); return 0; }, endTask: async () => ({}),
  };
  const io = {
    scene, open: async () => session, wait: async () => {}, cue: async () => {}, waitGo: async () => {}, goFile: join(out, 'go'),
    tasks: {
      activate: async ([id]) => { calls.push(['activate', id]); front = id; if (id === 'textedit' && stateNow() === 'back-above') order('front-above'); beacon(); return {ok: true}; },
      'select-source': async args => { calls.push(['select-source', ...args]); return {ok: true, switched: true}; },
    },
  };
  const deps = {
    out, scene, state: () => ({scenes: {chrome: {page: {variant: 'counters'}}, textedit: {}, electron: {}}}), activate: id => io.tasks.activate([id]),
    frontmost: () => ({pid: pids[front], topWindow: {number: numbers[front]}}), windows: pid => { const id = Object.keys(pids).find(k => pids[k] === pid); return [{number: numbers[id], bounds: bounds[id], onScreen: true}]; },
    windowList: () => ['textedit', 'chrome', 'electron'].map(id => ({number: numbers[id], bounds: bounds[id]})),
    scenes: args => {
      calls.push(['scenes', ...args]);
      if (args[0] === 'down') return {scene: args[1], down: true};
      pids[args[1]] += 100;
      front = args[1];
      page = {seq: 0, length: 0, counts: {...ZERO}, focused: true};
      return {scene: args[1], pid: pids[args[1]], window: {number: numbers[args[1]]}};
    },
    openApp: app => { calls.push(['open', app]); front = Object.keys(pids).find(id => app === `/Apps/${id}.app`); beacon(); },
    axWindow: ([pid]) => { const id = Object.keys(pids).find(k => pids[k] === Number(pid)), isFront = id === front, key = isFront && (id !== 'chrome' || !keyless);
      return {trusted: true, ok: true, frontmost: isFront, found: true, focused: key, main: key || !isFront, focusedWindow: key ? 'run' : 'none', mainWindow: key || !isFront ? 'run' : 'none', windows: 1}; },
    probe: args => {
      if (args[0] === 'input-source') return {id: KOREAN_2SET, layout: HANGUL_LAYOUT, perContextInput: false};
      if (args[0] === 'keystroke') {
        keystrokes.push(args);
        keyClock.push(clock);
        if (keystrokes.length > lostKeys) { if (latinKey) typedLatin = true; else if (keyedAt === null) keyedAt = fieldReads; }
        return {exitStatus: 0, units: 1};
      }
      if (args[0] === 'focus') {
        fieldReads += 1;
        if (keyedAt !== null && fieldReads > keyedAt + delayedReads) composed = true;
        return {named: true, valueHash: composed ? sha256Hex(COMPOSITION.composed) : typedLatin ? sha256Hex(COMPOSITION.key) : EMPTY_HASH};
      }
      return null;
    },
    engineStatus: () => ({build: 'b1', approved: true, status: {}}), savedRecord: () => ({status: {build: 'b1'}}),
    consent: () => ({consent: true, owner: {id: 'com.apple.keylayout.ABC'}}), clipboard: () => 'digest', processNames: () => ['/usr/sbin/pboard', '/bin/zsh'],
    pageCounters: () => (lagReads > 0 ? (lagReads--, {...stalePage}) : {...page}), fixtureCounters: () => null,
    moveWindow: ([pid, , dx, dy]) => { const id = Object.keys(pids).find(k => pids[k] === Number(pid)); bounds[id] = {...bounds[id], x: bounds[id].x + Number(dx), y: bounds[id].y + Number(dy)}; calls.push(['move', id]); return {moved: true}; },
    order: {start: async ({file}) => ({pid: 77, file, start: {state: 'front-above'}}), stop: async () => ({start: {state: 'front-above'}, changes, end: {samples: 400, maxGapMs: 9}}),
      attempt: () => { attempts += 1; return {start: {state: 'front-above', at: T0}, changes: changes.filter(c => !(c.visibleAfter > attempts)), end: null}; }},
    activations: {start: () => ({}), lines: () => [...activationsLog], stop: () => []},
    menu: {read: () => ({trusted: true, ok: menuSnapshot, selected: 0, openMenus: 0, focusedRole: 'AXTextArea'}), start: async () => ({registered: true}),
      stop: async () => ({opened: 0, end: {at: clock}}), alive: () => menuWatch !== 'dead',
      lines: () => { if (menuWatch === 'unreadable') throw new Error('the log could not be read'); return menuWatch === 'ended' ? [{kind: 'end', at: T0, why: 'crashed'}] : []; }},
    write: () => {}, now: () => tick(),
    sleep: async ms => {
      sleeps.push(ms);
      clock += ms;
      if (pairDue) { pairDue = false; activationsLog.push({kind: 'activated', bundleId: 'com.google.chrome.for.testing', at: tick()}, {kind: 'activated', bundleId: 'com.apple.TextEdit', at: tick()}); }
    },
  };
  Object.assign(io.tasks, item187Tasks(deps));
  return {io, calls, keystrokes, keyClock, sleeps};
}
const block = (rows, n = 1) => groupItem({item: ITEMS.composing, group: 'chrome-composing', blocks: [{block: n, rows}]});
const rowsOfRun = out => read187(out)[ITEMS.composing];

test('a raise after a row: the kit puts the order back before the next row, the row keeps the raise\'s time, and the bar counts it', async t => {
  const out = scratch(t);
  const {io, calls} = fakeMac(out, {raiseAt: [1]});
  await runSteps(block(ROWS.slice(0, 3)), {item: ITEMS.composing, out, io, log: () => {}});
  const rows = rowsOfRun(out), records = rows.filter(r => r.task === '187-row').map(r => r.result);
  assert.deepEqual(records.map(r => r.raises), [0, 1, 0]);
  assert.equal(records[1].delivered, true, 'the raised row delivered; the raise alone fails it');
  assert.equal(records[2].invalid, null, 'the next row starts with the order put back');
  assert.ok(records.every(r => r.keyWindow?.ok === true && r.keyWindow.frontmost === false), 'every row read Chrome\'s key-window state in the background');
  assert.ok(records.every(r => r.pageFocused === false));
  const restores = rows.filter(r => r.task === '187-order-restore').map(r => r.result);
  assert.deepEqual(restores.map(r => r.restored), [false, true, false]);
  assert.deepEqual(restores[1].how, ['placement', 'activate textedit']);
  assert.ok(calls.filter(c => c[0] === 'act').every(c => c[1] === 'textedit'), 'every act went under the user window\'s key guard');
  const items = evidence();
  items[ITEMS.composing] = [start, ...rows.filter(r => ['187-row', '187-order-restore', '187-order-stop'].includes(r.task))];
  const judged = judge187(items);
  assert.equal(judged.overall.verdict, 'DOES NOT LAND');
  assert.match(judged.overall.why.join('; '), /1 raise\(s\): 1 in rows/);
  assert.match(item187Markdown(judged), /the kit put the window order back after 1 row/);
  const kept = readFileSync(join(out, `item-${ITEMS.composing}.jsonl`), 'utf8');
  assert.deepEqual(leaks(kept), []);
  assert.ok(!/"(value|text)":"[^"]/.test(JSON.stringify(records)), 'a record holds no text field');
});

test('a raise the watcher writes after the row\'s own read, an activation pair during the beacon\'s wait, and a raise in the block\'s tail are each the row\'s', async t => {
  const late = scratch(t);
  await runSteps(block(ROWS.slice(0, 3)), {item: ITEMS.composing, out: late, io: fakeMac(late, {lateRaiseAt: [1]}).io, log: () => {}});
  const restores = rowsOfRun(late).filter(r => r.task === '187-order-restore').map(r => r.result);
  assert.deepEqual(restores.map(r => r.restored), [false, true, false]);
  assert.equal(restores[1].lateRaisedAt.length, 1);
  const pair = scratch(t);
  await runSteps(block(ROWS.slice(0, 2)), {item: ITEMS.composing, out: pair, io: fakeMac(pair, {activationsInWaitAt: [0]}).io, log: () => {}});
  const records = rowsOfRun(pair).filter(r => r.task === '187-row').map(r => r.result);
  assert.deepEqual([records[0].activations.length, records[0].front.changed, records[1].front.changed], [2, true, false]);
  const tail = scratch(t);
  await runSteps(block(ROWS.slice(0, 2)), {item: ITEMS.composing, out: tail, io: fakeMac(tail, {tailRaise: true}).io, log: () => {}});
  const stop = rowsOfRun(tail).find(r => r.task === '187-order-stop').result, last = rowsOfRun(tail).filter(r => r.task === '187-row').at(-1).result;
  assert.equal(stop.tailRaises[last.key].length, 1, 'the tail raise goes to the block\'s last row');
});

test('the menu watch counts only while it stayed alive and its log was readable through the row', async t => {
  const openedOf = async options => {
    const out = scratch(t);
    await runSteps(block(ROWS.slice(0, 1)), {item: ITEMS.composing, out, io: fakeMac(out, {menuSnapshot: false, ...options}).io, log: () => {}});
    return rowsOfRun(out).find(r => r.task === '187-row').result.menu;
  };
  assert.equal((await openedOf({menuWatch: 'ok'})).opened, false);
  for (const fate of ['ended', 'dead', 'unreadable']) assert.equal((await openedOf({menuWatch: fate})).opened, null, `a watch that ${fate} is no evidence`);
  assert.equal((await openedOf({menuWatch: 'unreadable'})).observed, null, 'a log that cannot be read is unread, not zero events');
  const swift = readFileSync(new URL('../../scripts/cursor-sitting/menu-open.swift', import.meta.url), 'utf8');
  assert.match(swift, /"ok": ok/, 'the helper says whether every read succeeded');
});

test('the composition: a row that disturbs it makes the rest of its block invalid, unsent', async t => {
  const out = scratch(t);
  const {io, calls} = fakeMac(out);
  const tasks = io.tasks, probe = tasks['187-compose'];
  tasks['187-compose'] = async (args, ctx) => { const r = await probe(args, ctx); ctx.r187.compose[args[0]].jamo = 'f'.repeat(64); return r; };
  await runSteps(block(ROWS.slice(0, 3), 0), {item: ITEMS.composing, out, io, log: () => {}});
  const records = rowsOfRun(out).filter(r => r.task === '187-row').map(r => r.result);
  assert.equal(records[0].userKept, false);
  assert.deepEqual(records.slice(1).map(r => r.invalid), Array(2).fill('an earlier row of the block disturbed the user window\'s composition'));
  assert.equal(calls.filter(c => c[0] === 'act').length, 1, 'no act after the disturbance');
});

test('the composition key (review P2 on 15583c65): a delayed first key is waited out, never typed over; only a field still empty after the lead gets the key again, on a short lead', async t => {
  const compose = async options => {
    const out = scratch(t), mac = fakeMac(out, options);
    await runSteps(block(ROWS.slice(0, 1), 0), {item: ITEMS.composing, out, io: mac.io, log: () => {}}).catch(error => { if (!/187-compose refused/.test(error.message)) throw error; });
    return {result: rowsOfRun(out).find(r => r.task === '187-compose').result, keystrokes: mac.keystrokes, sleeps: mac.sleeps,
      leads: mac.keystrokes.map((k, n) => Number(k[k.indexOf('--at') + 1]) - mac.keyClock[n]), posted: mac.keyClock};
  };
  const first = await compose({});
  assert.deepEqual([first.result.ok, first.result.posts, first.result.waited], [true, 1, false]);
  assert.ok(Number(first.keystrokes[0][first.keystrokes[0].indexOf('--at') + 1]) > T0, 'the key is scheduled with --at');
  // The first key lands only after every settle read: the old repost would have typed a second ㄱ over it.
  const delayed = await compose({delayedReads: SETTLE_READS});
  assert.deepEqual([delayed.result.ok, delayed.result.posts, delayed.result.waited, delayed.keystrokes.length], [true, 1, true, 1]);
  assert.ok(delayed.sleeps.includes(COMPOSE_LEAD_MS), 'the lead is waited out before the field is read again');
  const lost = await compose({lostKeys: 1});
  assert.deepEqual([lost.result.ok, lost.result.posts, lost.result.waited, lost.keystrokes.length], [true, 2, true, 2]);
  assert.deepEqual(lost.leads, [COMPOSE_LEAD_MS, COMPOSE_REPOST_LEAD_MS], 'the first key on the matrix\'s lead, the repost on a short one');
  assert.equal(COMPOSE_REPOST_LEAD_MS, 200);
  // The fake's probe returns at once (the real one returns once its key is posted, its lead later): between the posts
  // the settle reads and then the lead again are waited out.
  assert.ok(lost.posted[1] - lost.posted[0] >= (SETTLE_READS - 1) * 250 + COMPOSE_LEAD_MS, 'the repost comes only after the settle reads and the lead again were waited out');
  const lostTwice = await compose({lostKeys: 2});
  assert.deepEqual([lostTwice.result.ok, lostTwice.result.posts, lostTwice.result.read], [false, 2, 'empty']);
  const latin = await compose({latinKey: true});
  assert.deepEqual([latin.result.ok, latin.result.posts, latin.result.read, latin.result.waited], [false, 1, 'latin', false], 'a field holding the Latin key is never typed over');
});

test('the confirming cell end to end: the relaunch, the press on the action plan, open -a, the key read with the page focused, and the paste; keyless, the paste times out', async t => {
  const run = async options => {
    const out = scratch(t), mac = fakeMac(out, options), item = ITEMS.cell(options.keyless ? 'before' : 'after', 0);
    await runSteps(cellItem({half: options.keyless ? 'before' : 'after', rep: 0}), {item, out, io: mac.io, log: () => {}});
    return {rows: read187(out)[item], calls: mac.calls};
  };
  const after = await run({});
  const cell = after.rows.find(r => r.task === '187-cell').result;
  assert.equal(cell.ok, true, JSON.stringify(cell.verdict));
  assert.deepEqual([cell.press.plan, cell.press.action, cell.press.reason, cell.press.kind.when], ['action', 'AXPress', 'advertised', 'early']);
  assert.deepEqual([cell.keyBefore.reading.frontmost, cell.keyAfter.reading.frontmost, cell.keyAfter.reading.focused, cell.keyAfter.reading.main, cell.keyAfter.pageFocused], [false, true, true, true, true]);
  assert.deepEqual([cell.verdict.setUp, cell.verdict.key, cell.verdict.delivered], [true, true, true]);
  assert.equal(cell.row.keyWindow.focused, true, 'the row read the key right before its act');
  const relaunch = after.rows.find(r => r.task === '187-relaunch').result;
  assert.deepEqual([relaunch.ok, relaunch.before, relaunch.pid], [true, PIDS.chrome, PIDS.chrome + 100]);
  assert.deepEqual(after.calls.filter(c => ['scenes', 'open'].includes(c[0])), [['scenes', 'down', 'chrome'], ['scenes', 'up', 'chrome', '--page', 'counters'], ['open', '/Apps/chrome.app']]);
  assert.deepEqual(after.calls.find(c => c[0] === 'prepare'), ['prepare', 'no click']);
  const order = after.calls.map(c => c[0]);
  assert.ok(order.indexOf('press') < order.indexOf('open') && order.indexOf('open') < order.indexOf('act'));
  const before = await run({keyless: true});
  const keyless = before.rows.find(r => r.task === '187-cell').result;
  assert.deepEqual([keyless.verdict.keyless, keyless.verdict.readTimeout, keyless.verdict.delivered], [true, true, false]);
  assert.equal(keyless.ok, true, 'the BEFORE half records; it never fails a run');
  assert.deepEqual(leaks(JSON.stringify(after.rows) + JSON.stringify(before.rows)), []);
});

test('the put-back reading: the build installed against the save\'s record, approved; recorded, never refusing', async t => {
  const out = scratch(t), {io} = fakeMac(out);
  assert.deepEqual(await io.tasks['187-putback'](['/saved'], {results: {}}), {ok: true, saved: 'b1', current: {build: 'b1', approved: true}, scenesUp: true, consent: true});
  const tasks = item187Tasks({state: () => ({scenes: {chrome: {}}}), consent: () => null, engineStatus: () => ({build: 'b2', approved: false}), savedRecord: () => ({status: {build: 'b1'}})});
  const other = await tasks['187-putback'](['/saved'], {results: {}});
  assert.equal(other.ok, false);
  assert.match(other.problem, /the installed build is b2, not the saved b1; the installed engine is not approved; the textedit scene is not up/);
});

test('value-free helpers: the clipboard readers by name only; an open menu by roles and counts', () => {
  assert.deepEqual(clipboardReaders(['/Applications/Maccy.app/Contents/MacOS/Maccy', '/usr/sbin/pboard', '/bin/zsh', 'cmux-paste-worker', '  ']), ['Maccy', 'cmux-paste-worker', 'pboard']);
  assert.equal(menuOpened({trusted: true, ok: true, selected: 0, openMenus: 0, focusedRole: 'AXTextArea'}), false);
  assert.equal(menuOpened({trusted: true, ok: true, selected: 0, openMenus: 1}), true);
  assert.equal(menuOpened({trusted: true, ok: true, selected: 0, openMenus: 0, focusedRole: 'AXMenuItem'}), true);
  assert.equal(menuOpened({trusted: false}), null);
  assert.equal(menuOpened({trusted: true, ok: false, selected: 0, openMenus: 0}), null);
  const r = record({act: {...input().act, value: {actMs: 1, threw: true, message: 'Timed out waiting for the application to read the clipboard'}}});
  assert.deepEqual(leaks(JSON.stringify(r)), []);
  assert.equal(LABELS.act(`${ITEMS.composing}#1.0`, 'paste', 'hangul'), `${ITEMS.composing}#1.0 act: paste.hangul`);
  const swift = readFileSync(new URL('../../scripts/cursor-sitting/ax-state.swift', import.meta.url), 'utf8');
  assert.match(swift, /kAXFocusedAttribute/);
  assert.match(swift, /kAXMainAttribute/);
  assert.match(swift, /kAXFrontmostAttribute/);
  assert.ok(!/kAXValueAttribute|kAXTitleAttribute|kAXSelectedTextAttribute\b/.test(swift), 'the reader reads no text');
});

test('the CLI: the dry runs print every step and touch nothing; judge writes item-187.md', async t => {
  const dir = scratch(t), out = join(dir, 'never-made');
  const count = options => plan187(options).reduce((n, p) => n + p.steps.length, 0);
  const {code, text} = await quietly(() => main(['paste-187', 'drive', '--out', out, '--dry-run', '--quiet']));
  assert.equal(code, 0);
  assert.match(text, new RegExp(`dry run: ${count()} steps, nothing sent`));
  assert.equal(existsSync(out), false, 'the dry run creates nothing');
  assert.deepEqual(leaks(text), []);
  const before = await quietly(() => main(['paste-187', 'drive', '--out', out, '--dry-run', '--quiet', '--part', 'before']));
  assert.match(before.text, new RegExp(`dry run: ${count({part: 'before'})} steps, nothing sent`));
  assert.match(before.text, /task 187-putback <saved>/);
  for (const part of ['cell', 'composing', 'controls', '259', '188', '188-vendor-click']) {
    const answer = await quietly(() => main(['paste-187', 'drive', '--out', out, '--dry-run', '--quiet', '--part', part]));
    assert.match(answer.text, new RegExp(`dry run: ${count({part})} steps, nothing sent`), part);
  }
  const vendor = await quietly(() => main(['paste-187', 'drive', '--out', out, '--dry-run', '--quiet', '--vendor']));
  assert.match(vendor.text, new RegExp(`dry run: ${count({vendor: true})} steps`));
  assert.equal(existsSync(out), false);
  await assert.rejects(main(['paste-187', 'drive', '--out', out, '--dry-run', '--part', 'a']), /--part takes reslot, before, cell, composing, controls, 259, 188, 188-vendor-click/);
  await assert.rejects(main(['paste-187', 'drive', '--out', dir, '--run', dir, '--part', 'before']), /--part before takes --saved/);
  const judged = await quietly(() => main(['paste-187', 'judge', '--out', dir]));
  assert.equal(judged.code, 1, 'nothing recorded: nothing lands');
  assert.match(readFileSync(join(dir, 'item-187.md'), 'utf8'), /## Overall: DOES NOT LAND/);
});
