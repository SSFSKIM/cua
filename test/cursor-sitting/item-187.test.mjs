// #187's re-slot kit (scripts/cursor-sitting/item-187.mjs): the plan (no engine.json switch, the confirming cell's two
// routes and two halves, the premise part, chrome/composing@textedit in 2 blocks of 9, the controls, #259's cell), a
// row's record and its key-window readings, the per-line confirmation, the bar (each condition alone keeps it from
// landing; the BEFORE half part of it, NO VERDICT when it delivers), the order put back after a raise, the composition
// key never typed over a delayed one, both cell routes run end to end with their premises, the relaunch's and the
// placement's waits, the person's touch and the drive's replacement and stop, value-freeness and the CLI's dry runs.
// Nothing is driven: the runner runs against fakes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main, read187} from '../../scripts/cursor-sitting.mjs';
import {ADDENDUM_FILE, AXPRESS_BOUND_MS, BLOCK_ROWS, CELL_REPS, CELL_ROW, cellItem, cellVerdict, clipboardReaders, COMPOSE_LEAD_MS, COMPOSE_REPOST_LEAD_MS, COMPOSING_BLOCKS, CONTROLS, driveItems, freshActivation, GROUPS, groupItem,
  item187Markdown, item187Tasks, ITEMS, judge187, judgedOk, keyHeld, LABELS, menuOpened, PARTS, perLineProblem, personTouchedOf, plan187, PREMISE_SAMPLES, PRESS_REPS, pressItem, READ_TIMEOUT, readTimedOut, legacyTimeout, releaseOf,
  premiseOpens, RELAUNCH_STABLE_POLLS, ROWS, rowRecord, slotTouches, TARGET, TOUCHED_STOP, touchedOfItem, VENDOR_ROWS} from '../../scripts/cursor-sitting/item-187.mjs';
import {ITEMS_188, ITEMS_259} from '../../scripts/cursor-sitting/item-188.mjs';
import {cellOutcome, ITEMS as ISO, repPremise} from '../../scripts/cursor-sitting/item-187-isolate.mjs';
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
// What the engine records for a method: typeText a record per line, paste one record for its whole text (one ⌘V).
const perLineFor = (method, text) => (method === 'paste' ? linesOf(text).slice(0, 1) : linesOf(text));

// A row's readings, all as a delivering, undisturbed row reads them; `over` replaces any of them.
function input({group = 'chrome-composing', block = 0, i = 0, row = ROWS[1], item = ITEMS.composing, engine = 'cua', ...over} = {}) {
  const g = GROUPS[group], expectedLength = row.string.text.length, chrome = g.driven === 'chrome';
  return {
    spec: {key: `${item}#${block}.${i}`, item, group, block, i, string: row.string.id, method: row.method, expectedLength, lines: row.string.text.split('\n').length, regime: g.regime, engine},
    prepare: {ok: true, value: {ready: true}},
    act: {ok: true, value: {actMs: 190, threw: false, message: null}, route: 'paste',
      meta: {activationGuardMs: 41, activationClick: 'outsideFrame', activationClickKind: {kind: 'inertOutside', point: 'offset', when: 'early'}, entered: expectedLength, delivery: {restores: 0},
        paste: {stage: 'effect', confirmed: true, readWait: 'handedOver', readAfterPostMs: 12, effectWait: 'reading', restore: 'restored',
          focusEnforcement: {activated: true, point: 'outside', click: {kind: 'inertOutside', point: 'offset'}, activationToCommandVMs: 30, clickToCommandVMs: 20}, perLine: perLineFor(row.method, row.string.text)}}},
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
// The saved engine's paste into a keyless Chrome: the read timing out, nothing entered.
const TIMED_OUT = {act: {ok: true, value: {actMs: 2100, threw: true, message: 'timed out'}, route: 'paste', meta: {activationGuardMs: 40, activationClick: 'outsideFrame', paste: {stage: 'read', readWait: 'timeout', confirmed: null}}},
  check: {ok: true, value: {ok: false, outcome: {exact: false, length: 0, expectedLength: CELL_ROW.string.text.length}}}};
const cellRow = (half, rep, group, over = {}) => record({item: ITEMS.cell(half, rep), group, block: group === 'chrome-cell' ? 1 : 0, row: CELL_ROW, ...over});
// One background-paste repetition's record, as '187-cell' writes it, as predicted: on AFTER both pastes delivered and
// the key held; on BEFORE the background paste timing out at the read stage and Chrome keyless. `over` replaces any part.
const cellRecord = (half, rep, over = {}) => ({tag: `${ITEMS.cell(half, rep)}#0`, half, rep, route: 'paste', personTouched: null,
  keyBefore: {reading: {...BACK, focused: false}, pageFocused: false},
  ...(half === 'after'
    ? {background: cellRow(half, rep, 'chrome-cell-background'), keyAfter: {reading: KEY, pageFocused: true, settledMs: 120}, row: cellRow(half, rep, 'chrome-cell')}
    : {background: cellRow(half, rep, 'chrome-cell-background', TIMED_OUT), keyAfter: {reading: KEYLESS, pageFocused: false, settledMs: 1000}, row: cellRow(half, rep, 'chrome-cell', TIMED_OUT)}),
  ...over});
// A replacement repetition's rows: its link to the attempt it replaces, then its record.
const replacementRows = (half, rep, parent, attempt, over) => [{...start, at: attempt + 1000}, {kind: 'task', task: '187-replaces', result: {ok: true, parent, attempt}}, ...cellItemRows(half, rep, over).slice(1)];
const cellItemRows = (half, rep, over, stop = orderStop()) => [start, {kind: 'task', task: '187-cell', result: cellRecord(half, rep, over)}, ...(stop ? [stop] : [])];
// One AXPress repetition's record: AXPress advertised, the click on the action plan; AFTER key and delivered, BEFORE
// keyless with the read timing out.
const pressRecord = (half, rep, over = {}) => ({tag: `${ITEMS.press(half, rep)}#0`, half, rep, route: 'press', personTouched: null,
  premise: {advertised: true, appearedMs: 2100, actions: ['AXPress', 'AXShowMenu'], textareas: 1},
  press: {ok: true, pressed: true, plan: 'action', action: 'AXPress', reason: 'advertised', kind: {kind: 'inertOutside', point: 'offset', when: 'early'}},
  pressRead: {inFront: true, found: true, focused: true, empty: true}, keyBefore: {reading: {...BACK, focused: false}, pageFocused: false},
  ...(half === 'after' ? {keyAfter: {reading: KEY, pageFocused: true, settledMs: 120}, row: record({item: ITEMS.press(half, rep), group: 'chrome-cell', row: CELL_ROW})}
    : {keyAfter: {reading: KEYLESS, pageFocused: false}, row: record({item: ITEMS.press(half, rep), group: 'chrome-cell', row: CELL_ROW, ...TIMED_OUT})}),
  ...over});
const groupRows = (item, group, rows, tweak = r => r) => [start, ...rows.map(([block, i, row]) => taskRow(tweak(record({item, group, block, i, row})))), ...(GROUPS[group].user ? [orderStop()] : [])];
const putbackRow = (over = {}) => [start, {kind: 'task', task: '187-putback', result: {ok: true, saved: 'dd7a09235885', current: {build: 'dd7a09235885', approved: true}, ...over}}];

// The whole re-slot's evidence with every condition holding, the BEFORE half failing as predicted; the tweaks change
// rows of one group, `cell(rep)` and `before(rep)` a repetition's record.
function evidence({tweakComposing = r => r, tweakControl = r => r, cell = () => ({}), before = () => ({}), withBefore = true, end = true, putback = true} = {}) {
  const items = {};
  items[ITEMS.composing] = groupRows(ITEMS.composing, 'chrome-composing', COMPOSING_BLOCKS.flatMap((rows, block) => rows.map((row, i) => [block, i, row])), tweakComposing);
  for (const group of CONTROLS) items[ITEMS.control(group)] = groupRows(ITEMS.control(group), group, ROWS.map((row, i) => [0, i, row]), tweakControl);
  for (let rep = 0; rep < CELL_REPS; rep++) items[ITEMS.cell('after', rep)] = cellItemRows('after', rep, cell(rep));
  if (withBefore) for (let rep = 0; rep < CELL_REPS; rep++) items[ITEMS.cell('before', rep)] = cellItemRows('before', rep, before(rep));
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

test('the re-slot\'s plan: the placement, the cell\'s AFTER half on both routes, the placement again, the 2 blocks, the controls once, #259\'s cell, the owner\'s source; no switch, no engine stop, no arm read', () => {
  const plan = plan187();
  assert.deepEqual(plan.map(p => p.item), [ITEMS.place, ...[0, 1, 2].map(rep => ITEMS.cell('after', rep)), ITEMS.press('after', 0), ITEMS.placeAgain, ITEMS.composing, ...CONTROLS.map(ITEMS.control), ITEMS_259.click, ITEMS.end]);
  assert.equal(PRESS_REPS, 1);
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

const orderOf = steps => steps.map(s => s.task ?? (s.open ? 'open' : s.close ? 'close' : s.run ? s.label.replace(/^\S+ /, '') : null)).filter(Boolean);
const atIn = order => name => order.findIndex(x => (typeof x === 'string' ? x.startsWith(name) : false));

test('the background-paste cell: Chrome relaunched and placed, TextEdit in front under ABC, one background paste under the order watcher, open -a, the key read, a frontmost paste; no prepare clicks', () => {
  const steps = cellItem({half: 'after', rep: 0}), order = orderOf(steps), at = atIn(order);
  assert.ok(at('187-relaunch') < at('187-place') && at('187-place') < at('activate') && at('activate') < at('select-source') && at('select-source') < at('187-arrange'));
  assert.ok(at('187-arrange') < at('187-order-start') && at('187-order-start') < at('open'));
  const acts = steps.filter(s => s.run && /act:/.test(s.label)), prepares = steps.filter(s => s.run && /prepare:/.test(s.label));
  assert.deepEqual(acts.map(s => s.keys), ['textedit', 'chrome'], 'the background paste under TextEdit\'s key guard, the frontmost one under Chrome\'s');
  assert.ok(acts.every(s => /__app\.paste\(/.test(s.cell)));
  assert.equal(prepares.length, 2);
  assert.ok(prepares.every(s => !/__app\.(click|setValue|typeText|paste)/.test(s.cell)), 'neither paste\'s prepare sends input: no mouse down reaches Chrome before ⌘V');
  // No release observation in the fresh session, the watcher stopped before open -a (the person's own raise of Chrome).
  assert.ok(!steps.some(s => s.run && /release:/.test(s.label)));
  const bgRow = order.indexOf('187-row'), fgRow = order.lastIndexOf('187-row');
  assert.ok(bgRow < at('187-order-stop') && at('187-order-stop') < at('187-open') && at('187-open') < fgRow && fgRow < at('187-cell'));
  assert.deepEqual(steps.filter(s => s.task === '187-key').map(s => s.args[2]), ['before', 'after']);
  assert.deepEqual(steps.find(s => s.task === '187-cell').args, [`${ITEMS.cell('after', 0)}#0`, 'after', '0', 'paste']);
  assert.ok(['187-relaunch', '187-place', '187-arrange', '187-order-start', '187-open'].every(t => steps.find(s => s.task === t).required));
  assert.deepEqual(steps.find(s => s.task === '187-arrange').args, ['chrome-cell-background']);
  assert.equal(GROUPS['chrome-cell-background'].condition, 'latin', 'latin on purpose: no composition, the arm isolated');
  assert.equal(releaseOf('chrome-cell-background'), null);
  // The before part: the put-back read against the save, both routes' repetitions, the owner's source.
  const before = plan187({part: 'before', saved: '/saved'});
  assert.deepEqual(before.map(p => p.item), [ITEMS.putback, ...[0, 1, 2].map(rep => ITEMS.cell('before', rep)), ITEMS.press('before', 0), ITEMS.end]);
  assert.deepEqual(before[0].steps.find(s => s.task === '187-putback').args, ['/saved']);
  assert.ok(!before[0].steps.find(s => s.task === '187-putback').required, 'the BEFORE half runs on whatever engine is installed, recorded');
});

test('the AXPress cell: gated on the premise part, AXPress awaited after the session\'s first observation, the click only once it is advertised, its own last call', () => {
  const steps = pressItem({half: 'before', rep: 0}), order = orderOf(steps), at = atIn(order);
  assert.equal(order[0], '187-press-gate');
  assert.ok(steps.find(s => s.task === '187-press-gate').required, 'a closed gate stops the repetition before anything runs');
  assert.ok(at('187-relaunch') < at('open') && at('open') < at('187-axpress') && at('187-axpress') < at('press:'));
  assert.deepEqual(steps.find(s => s.task === '187-axpress').args, [`${ITEMS.press('before', 0)}#0`, 'chrome', 'gate']);
  const press = steps.find(s => s.run && /press:/.test(s.label)), tag = `${ITEMS.press('before', 0)}#0`;
  assert.equal(press.when({}), false, 'no AXPress reading: nothing is clicked');
  assert.equal(press.when({[LABELS.axpress(tag)]: {advertised: false}}), false, 'AXPress not advertised: PRECONDITION UNMET, never the pointer route');
  assert.equal(press.when({[LABELS.axpress(tag)]: {advertised: true}}), true);
  assert.match(press.cell, /await __app\.click\(__index\)/);
  const afterClick = press.cell.slice(press.cell.indexOf('await __app.click(__index)') + 'await __app.click(__index)'.length);
  assert.ok(!/__app\.|observe\(/.test(afterClick), 'the click is the press cell\'s last call, so its meta is the click\'s');
  assert.ok(at('press read') < at('release: the textedit') && at('release: the textedit') < at('187-open') && at('187-open') < at('187-cell'));
  assert.deepEqual(steps.find(s => s.task === '187-cell').args.slice(1), ['before', '0', 'press']);
});

test('the premise part: in the preflight, the build read, three fresh launches each observed once and timed to AXPress, Chrome down at the end; no placement, no source', () => {
  const plan = plan187({part: 'premise'});
  assert.deepEqual(plan.map(p => p.item), [ITEMS.premise]);
  const order = orderOf(plan[0].steps);
  assert.equal(order[0], '187-premise-engine');
  assert.equal(order.filter(x => x === '187-relaunch').length, PREMISE_SAMPLES);
  assert.equal(order.filter(x => x === 'open').length, PREMISE_SAMPLES);
  assert.deepEqual(plan[0].steps.filter(s => s.task === '187-axpress').map(s => s.args[2]), Array(PREMISE_SAMPLES).fill('measure'));
  assert.ok(plan[0].steps.filter(s => s.open).every(s => s.scenes.length === 1 && s.scenes[0] === 'chrome'));
  assert.equal(order.at(-1), '187-down');
  assert.ok(!order.some(x => ['187-place', '187-preflight', 'select-source'].includes(x)));
});

test('the parts: each reruns alone between the placement and the owner\'s source; #188 and #259 under #188\'s own; the vendor\'s lanes', () => {
  assert.deepEqual(PARTS, ['reslot', 'premise', 'before', 'cell', 'composing', 'controls', '259', '188', '188-vendor-click']);
  assert.deepEqual(plan187({part: 'cell'}).map(p => p.item), [ITEMS.place, ...[0, 1, 2].map(rep => ITEMS.cell('after', rep)), ITEMS.press('after', 0), ITEMS.placeAgain, ITEMS.end]);
  assert.deepEqual(plan187({part: 'composing'}).map(p => p.item), [ITEMS.place, ITEMS.composing, ITEMS.end]);
  assert.deepEqual(plan187({part: 'controls'}).map(p => p.item), [ITEMS.place, ...CONTROLS.map(ITEMS.control), ITEMS.end]);
  assert.deepEqual(plan187({part: '259'}).map(p => p.item), [ITEMS_188.place, ITEMS_259.click, ITEMS_188.end]);
  assert.deepEqual(plan187({vendor: true}).map(p => p.item), [ITEMS.place, ITEMS.vendorKorean, ITEMS.vendor, ITEMS.end], 'the vendor\'s chrome/korean rows first');
  assert.equal(plan187({vendor: true})[1].steps.filter(s => s.task === '187-row').length, 9);
  assert.ok(!plan187().some(p => p.item.startsWith('188-')), '#188\'s items are out of the default');
  assert.throws(() => plan187({part: 'a'}), /--part takes reslot, premise, before/);
  // A repetition's replacement: the next number on its route and half, itself never replaced.
  const plan = plan187(), first = plan.find(p => p.item === ITEMS.cell('after', 0)), press = plan.find(p => p.item === ITEMS.press('after', 0));
  const r1 = first.replace(), r2 = plan.find(p => p.item === ITEMS.cell('after', 2)).replace(), rp = press.replace();
  assert.deepEqual([r1.item, r2.item, rp.item], [ITEMS.cell('after', 3), ITEMS.cell('after', 4), ITEMS.press('after', 1)]);
  assert.ok(r1.replacement && !r1.replace);
  assert.deepEqual(r1.steps.find(s => s.task === '187-cell').args.slice(1), ['after', '3', 'paste']);
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

test('the per-line record of a paste (e): exactly one record, the whole text as one act, confirmed by its own change; two or none fail', () => {
  const lines = ROWS.find(r => r.string.id === 'lines' && r.method === 'paste');
  const withPerLine = perLine => record({row: lines, act: {...input({row: lines}).act, meta: {...input({row: lines}).act.meta, paste: {...input({row: lines}).act.meta.paste, perLine}}}});
  const one = withPerLine(linesOf(lines.string.text).slice(0, 1));
  assert.equal(one.lines, 2, 'the text has two lines');
  assert.equal(perLineProblem(one), null, 'one ⌘V, one record');
  assert.match(perLineProblem(withPerLine(linesOf(lines.string.text))), /2 per-line record\(s\) for one paste \(one act, one record\)/);
  assert.match(perLineProblem(withPerLine([])), /0 per-line record\(s\) for one paste/);
  assert.match(perLineProblem(withPerLine([{...linesOf('x')[0], confirmed: false, effectWait: 'timeout'}])), /line 1 was not confirmed by its own change/);
  // The composing bar: a paste.lines row with its one record lands; with a record per line it does not.
  assert.equal(judge187(evidence()).overall.verdict, 'LANDS');
  const asBefore = evidence({tweakComposing: r => (r.string === 'lines' && r.method === 'paste' ? reRecord(r, {act: {...input().act, meta: {...input().act.meta, paste: {...input().act.meta.paste, perLine: linesOf('a\nb')}}}}) : r)});
  assert.match(judge187(asBefore).overall.why.join('; '), /whose lines were not each confirmed .*#1\.6: 2 per-line record\(s\) for one paste/);
});

test('the per-line record of typeText: every line confirmed by its own change, each later line opened by a settled Return; the slot\'s false success fails it', () => {
  const lines = ROWS.find(r => r.string.id === 'lines' && r.method === 'typeText');
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
  const bare = evidence({tweakComposing: r => (r.string === 'lines' && r.method === 'typeText' ? reRecord(r, {act: {...input().act, meta: {...input().act.meta, paste: {...input().act.meta.paste, perLine: linesOf('a\nb').map((l, k) => (k ? {...l, confirming: null} : l))}}}}) : r)});
  assert.equal(judge187(bare).overall.verdict, 'DOES NOT LAND');
  assert.equal(perLineProblem(withPerLine([l1, {...l2, effectWait: 'notification', confirming: undefined}])), null, 'a trusted notification confirms');
  assert.match(perLineProblem(withPerLine([l2, l1])), /not lines 1\.\.2 in order/);
  assert.equal(openingReturn.settle, 'reading');
});

test('the bar: every condition holding, the re-slot lands on the background paste, with the baseline cited and AXPress reported unproven', () => {
  const judged = judge187(evidence());
  assert.equal(judged.overall.verdict, 'LANDS', judged.overall.why.join('; '));
  assert.equal(judgedOk(judged), true);
  assert.equal(judged.overall.on, 'the background paste');
  const md = item187Markdown(judged);
  assert.match(md, /## Overall: LANDS, on the background paste/);
  assert.match(md, /0 of 99 valid rows delivered, every one stopping at the read \(timeout\) stage/);
  assert.match(md, /AFTER: 3 of 3 counted repetitions with both pastes delivered/);
  assert.match(md, /BEFORE: 3 of 3 counted repetitions failing as predicted/);
  assert.match(md, /The cell is latin on purpose/);
  assert.match(md, /The AXPress route did not run \(the premise part has not run\)/);
  assert.match(md, /\*\*AXPress on Chrome is unproven\*\*/);
  assert.match(md, /never verified on Chrome/, 'the report corrects the kit\'s earlier claim');
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
    ['a cell repetition whose background paste posted its own activation click (premise not met, never counted)', {cell: rep => (rep === 2 ? {background: cellRow('after', 2, 'chrome-cell-background', {act: {...input().act, meta: {...input().act.meta, activationClick: 'posted'}}})} : {})},
      /AFTER half: 2 of 3 counted repetitions .*\(2 counted; .*after-2: premise not met \(the background paste's activation click was posted, not skipped/],
    ['a cell repetition whose background paste did not deliver', {cell: rep => (rep === 0 ? {background: cellRow('after', 0, 'chrome-cell-background', TIMED_OUT)} : {})}, /after-0: the background paste did not deliver/],
    ['a person-touched cell repetition with no replacement', {cell: rep => (rep === 1 ? {personTouched: {apps: ['com.apple.ActivityMonitor'], frontPids: []}} : {})}, /AFTER half: 2 of 3 counted .*after-1: person-touched \(touched by the person \(com\.apple\.ActivityMonitor activated\)\)/],
    // Review P2: a delivering cell paste that touches the person's side fails the bar like any composing or control row.
    ...[['its clipboard restore did not hold', {clipboard: {mid: 'a', after: 'b'}}, /the background-paste cell's AFTER half: 1 row\(s\) touched the person's side \(clipboard\)/],
      ['it changed the front app', {activations: [{kind: 'activated', bundleId: 'com.apple.TextEdit', at: T0}]}, /the background-paste cell's AFTER half: 1 row\(s\) touched the person's side \(front app\)/],
      ['it produced a page click', {page: {mid: {seq: 4, length: 0, counts: ZERO, focused: true}, after: {seq: 6, length: CELL_ROW.string.text.length, counts: {...ZERO, mousedown: 1}, focused: true}}}, /the background-paste cell's AFTER half: 1 row\(s\) touched the person's side \(page click\)/],
      ['it opened a menu', {menu: {read: {trusted: true, ok: true, selected: 0, openMenus: 1}, observed: 0}}, /1 row\(s\) with a menu opened in Chrome/]]
      .map(([what, over, why]) => [`a delivering frontmost cell paste where ${what}`, {cell: rep => (rep === 1 ? {row: cellRow('after', 1, 'chrome-cell', over)} : {})}, why]),
    ['a background cell paste that clicked the page', {cell: rep => (rep === 0 ? {background: cellRow('after', 0, 'chrome-cell-background', {page: {mid: {seq: 4, length: 0, counts: ZERO, focused: false}, after: {seq: 6, length: CELL_ROW.string.text.length, counts: {...ZERO, mousedown: 1}, focused: false}}})} : {})},
      /the background-paste cell's AFTER half: 1 row\(s\) touched the person's side \(page click\)/],
    ['a background cell paste that raised Chrome', {cell: rep => (rep === 2 ? {background: cellRow('after', 2, 'chrome-cell-background', {raisedAt: [T0 + 3]})} : {})}, /1 raise\(s\): 1 in rows/],
    ['a cell repetition whose frontmost paste did not deliver', {cell: rep => (rep === 0 ? {row: cellRow('after', 0, 'chrome-cell', {check: {ok: true, value: {ok: false, outcome: {exact: false, length: 0, expectedLength: 44}}}})} : {})}, /the frontmost paste did not deliver/],
    ['the BEFORE half not recorded', {withBefore: false}, /background-paste cell's BEFORE half on the saved engine was not recorded/],
    ['a BEFORE repetition whose background paste failed otherwise than a read timeout', {before: rep => (rep === 1 ? {background: cellRow('before', 1, 'chrome-cell-background', {...TIMED_OUT, act: {...TIMED_OUT.act, meta: {...TIMED_OUT.act.meta, paste: {stage: 'effect', readWait: 'handedOver'}}}})} : {})},
      /before-1: the background paste stopped at effect \(read handedOver\), not a read timeout/],
    ['a BEFORE repetition short', {before: rep => (rep === 2 ? {background: cellRow('before', 2, 'chrome-cell-background', {...TIMED_OUT, act: {...TIMED_OUT.act, meta: {...TIMED_OUT.act.meta, activationClick: 'posted'}}})} : {})},
      /BEFORE half: 2 of 3 counted repetitions failing as predicted .*\(2 counted; .*before-2: premise not met/],
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
  assert.match(judge187(missingRep).overall.why.join('; '), /2 of 3 counted repetitions .*after-2: not recorded/);
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
  // The background-paste cell's watcher counts like a block's: its gap, and a raise only its final record holds.
  const gap = evidence();
  gap[ITEMS.cell('after', 1)] = cellItemRows('after', 1, {}, orderStop({maxGapMs: 70}));
  assert.match(judge187(gap).overall.why.join('; '), /background-paste cell's after-1: the order watcher's longest gap was 70 ms, past 50/);
  const unwatched = evidence();
  unwatched[ITEMS.cell('after', 0)] = cellItemRows('after', 0, {}, null);
  assert.match(judge187(unwatched).overall.why.join('; '), /after-0: the order watcher's record is missing/);
  const late = evidence(), bg = cellRecord('after', 2).background;
  late[ITEMS.cell('after', 2)] = [start, {kind: 'task', task: '187-row', result: bg}, {kind: 'task', task: '187-cell', result: cellRecord('after', 2)}, orderStop({raises: 1, tailRaises: {[bg.key]: [T0 + 11]}})];
  assert.match(judge187(late).overall.why.join('; '), /1 raise\(s\): 1 in rows/, 'a late raise the cell\'s final watcher record holds is its background paste\'s');
});

test('the BEFORE half gates the bar: a BEFORE that delivers is NO VERDICT (the cell does not discriminate), unless another condition already fails', () => {
  const judged = judge187(evidence());
  assert.deepEqual(judged.cells.paste.before.map(c => [c.status, c.keyless, c.bgReadTimeout, c.delivered, c.predicted]), Array(3).fill(['counted', true, true, false, true]));
  // The saved engine delivering the frontmost paste after open -a: the arm was not what kept Chrome keyless.
  const delivering = judge187(evidence({before: rep => (rep === 1 ? cellRecord('after', 1, {half: 'before'}) : {})}));
  assert.equal(delivering.overall.verdict, 'NO VERDICT');
  assert.equal(judgedOk(delivering), false);
  assert.match(delivering.overall.why.join('; '), /NO VERDICT: 1 counted BEFORE repetition\(s\) on the saved engine delivered a paste, so the cell does not discriminate .*#187 stays Refs/);
  assert.match(item187Markdown(delivering), /## Overall: NO VERDICT\n/);
  assert.match(item187Markdown(delivering), /1 BEFORE repetition\(s\) delivered: the cell does not discriminate, NO VERDICT, and #187 stays Refs/);
  // The background paste alone delivering on the saved engine is enough.
  const bgOnly = judge187(evidence({before: rep => (rep === 0 ? {background: cellRow('before', 0, 'chrome-cell-background')} : {})}));
  assert.equal(bgOnly.overall.verdict, 'NO VERDICT');
  const alsoFailing = judge187(evidence({before: rep => (rep === 1 ? cellRecord('after', 1, {half: 'before'}) : {}), tweakComposing: firstOnly(reRecord, {userKept: false})}));
  assert.equal(alsoFailing.overall.verdict, 'DOES NOT LAND', 'a failing condition is a verdict of its own');
  assert.match(alsoFailing.overall.why.join('; '), /NO VERDICT: 1 counted BEFORE/);
  // A premise-not-met BEFORE repetition that delivered counts for nothing, not for NO VERDICT.
  const uncounted = judge187(evidence({before: rep => (rep === 2 ? cellRecord('after', 2, {half: 'before', background: cellRow('before', 2, 'chrome-cell-background', {act: {...input().act, meta: {...input().act.meta, activationClick: 'posted'}}})}) : {})}));
  assert.equal(uncounted.overall.verdict, 'DOES NOT LAND');
  assert.match(uncounted.overall.why.join('; '), /BEFORE half: 2 of 3 counted/);
  assert.deepEqual(cellVerdict(null), {recorded: false, route: null, status: 'not recorded', counted: false, pass: false, predicted: false, delivers: false, key: null, keyless: null, why: 'not recorded'});
});

test('a person-touched repetition is invalid and its replacement counts in its place; a stopped one the drive marked touched reads so', () => {
  const TOUCH = {personTouched: {apps: ['com.apple.ActivityMonitor'], frontPids: []}};
  const items = evidence({cell: rep => (rep === 0 ? TOUCH : {})});
  items[ITEMS.cell('after', 0)][0] = {...start, at: T0};
  items[ITEMS.cell('after', 3)] = replacementRows('after', 3, ITEMS.cell('after', 0), T0);
  const judged = judge187(items);
  assert.equal(judged.overall.verdict, 'LANDS', judged.overall.why.join('; '));
  assert.deepEqual(judged.cells.paste.after.map(c => [c.item, c.status]), [[ITEMS.cell('after', 0), 'person-touched'], ...[1, 2, 3].map(rep => [ITEMS.cell('after', rep), 'counted'])]);
  // The touched repetition's rows are the person's: its raise does not fail the bar.
  const raised = evidence({cell: rep => (rep === 0 ? {...TOUCH, background: cellRow('after', 0, 'chrome-cell-background', {raisedAt: [T0]})} : {})});
  raised[ITEMS.cell('after', 0)][0] = {...start, at: T0};
  raised[ITEMS.cell('after', 3)] = replacementRows('after', 3, ITEMS.cell('after', 0), T0);
  assert.equal(judge187(raised).overall.verdict, 'LANDS');
  // A re-run of the half: the old replacement never fills in for the new attempt's premise-not-met or stopped one.
  const rerun = evidence({cell: rep => (rep === 0 ? {background: cellRow('after', 0, 'chrome-cell-background', {act: {...input().act, meta: {...input().act.meta, activationClick: 'posted'}}})} : {})});
  rerun[ITEMS.cell('after', 0)] = [{...start, at: T0}, {kind: 'task', task: '187-cell', result: cellRecord('after', 0, TOUCH)}, orderStop(), {...start, at: T0 + 60_000}, ...rerun[ITEMS.cell('after', 0)].slice(1)];
  rerun[ITEMS.cell('after', 3)] = replacementRows('after', 3, ITEMS.cell('after', 0), T0);
  const rj = judge187(rerun);
  assert.equal(rj.overall.verdict, 'DOES NOT LAND');
  assert.equal(rj.cells.paste.after.at(-1).status, 'stale replacement');
  assert.match(rj.overall.why.join('; '), /AFTER half: 2 of 3 counted .*after-0: premise not met.*after-3: stale replacement \(it replaced an earlier attempt of 187-cell-after-0, which has run again since\)/);
  const rerunBefore = evidence();
  rerunBefore[ITEMS.cell('before', 0)] = [{...start, at: T0}, {kind: 'task', task: '187-cell', result: cellRecord('before', 0, TOUCH)}, {...start, at: T0 + 60_000}, {kind: 'stopped', error: '187-relaunch refused'}];
  rerunBefore[ITEMS.cell('before', 3)] = replacementRows('before', 3, ITEMS.cell('before', 0), T0);
  const bj = judge187(rerunBefore);
  assert.equal(bj.overall.verdict, 'DOES NOT LAND');
  assert.deepEqual(bj.cells.paste.before.map(c => c.status), ['stopped', 'counted', 'counted', 'stale replacement']);
  // A replacement that names no attempt, or one for a repetition that was not touched, counts for nothing either.
  const unlinked = evidence({cell: rep => (rep === 0 ? TOUCH : {})});
  unlinked[ITEMS.cell('after', 3)] = cellItemRows('after', 3);
  assert.match(judge187(unlinked).overall.why.join('; '), /after-3: stale replacement \(it names no attempt it replaces\)/);
  const untouched = evidence();
  untouched[ITEMS.cell('after', 1)][0] = {...start, at: T0};
  untouched[ITEMS.cell('after', 3)] = replacementRows('after', 3, ITEMS.cell('after', 1), T0);
  assert.equal(judge187(untouched).cells.paste.after.at(-1).status, 'stale replacement');
  const stopped = evidence();
  stopped[ITEMS.cell('before', 1)] = [start, {kind: 'stopped', error: 's: refused, nothing sent: keys for chrome need its run window on top', personTouched: {apps: ['com.cmuxterm.app'], frontPids: []}}];
  const sj = judge187(stopped);
  assert.equal(sj.cells.paste.before[1].status, 'person-touched');
  assert.match(sj.overall.why.join('; '), /BEFORE half: 2 of 3 counted .*before-1: person-touched/);
});

test('the AXPress route is reported, never the bar: not run behind a closed gate, PRECONDITION UNMET without AXPress, premise not met off the action plan, and its own BEFORE', () => {
  const premise = appeared => [start, {kind: 'task', task: '187-premise-engine', result: {ok: true, build: 'dd7a09235885', approved: true}},
    ...appeared.map((ms, k) => ({kind: 'task', task: '187-axpress', result: {ok: true, tag: `${ITEMS.premise}#${k}`, advertised: ms !== null && ms <= AXPRESS_BOUND_MS, appearedMs: ms, boundMs: 10000}}))];
  const closed = evidence();
  closed[ITEMS.premise] = premise([2100, null, 6200]);
  closed[ITEMS.press('after', 0)] = [start, {kind: 'task', task: '187-press-gate', result: {ok: false, problem: 'the premise part saw AXPress within 5000 ms in 1 of 3 sample(s)'}}, {kind: 'stopped', error: '187-press-gate refused'}];
  const cj = judge187(closed), md = item187Markdown(cj);
  assert.equal(cj.overall.verdict, 'LANDS', 'a closed gate never moves the bar');
  assert.equal(cj.cells.press.after[0].status, 'not run');
  assert.equal(cj.premise.opens, false);
  assert.match(md, /The premise part \(engine dd7a09235885, approved\): AXPress appeared after 2100 ms, none within 10000 ms, 6200 ms; the route does not run\./);
  assert.match(md, /The AXPress route did not run \(the premise part saw AXPress within 5000 ms in 1 of 3 sample\(s\)\)/);
  assert.match(md, /\*\*AXPress on Chrome is unproven\*\*/);
  const ran = evidence();
  ran[ITEMS.premise] = premise([1900, 2100, 2300]);
  ran[ITEMS.press('after', 0)] = [start, {kind: 'task', task: '187-cell', result: pressRecord('after', 0)}];
  ran[ITEMS.press('before', 0)] = [start, {kind: 'task', task: '187-cell', result: pressRecord('before', 0)}];
  const rj = judge187(ran);
  assert.equal(rj.overall.verdict, 'LANDS');
  assert.match(item187Markdown(rj), /AFTER: 1 of 1 counted repetition\(s\) key and delivered\./);
  assert.match(item187Markdown(rj), /BEFORE: 1 of 1 counted repetition\(s\) with the paste's read timing out, as predicted\./);
  const unmet = evidence();
  unmet[ITEMS.premise] = premise([1900, 2100, 2300]);
  unmet[ITEMS.press('after', 0)] = [start, {kind: 'task', task: '187-cell', result: pressRecord('after', 0, {premise: {advertised: false, appearedMs: null, actions: ['AXShowMenu']}})}];
  unmet[ITEMS.press('before', 0)] = [start, {kind: 'task', task: '187-cell', result: pressRecord('before', 0, {press: {ok: true, pressed: true, plan: 'synthesized', reason: 'noAction'}})}];
  const uj = judge187(unmet), rmd = item187Markdown(uj);
  assert.equal(uj.overall.verdict, 'LANDS');
  assert.deepEqual([uj.cells.press.after[0].status, uj.cells.press.before[0].status], ['precondition unmet', 'premise not met']);
  assert.match(rmd, /\*\*AXPress on Chrome is unproven\*\*/);
  assert.match(rmd, /precondition unmet \(AXPress was not advertised on the textarea within 5000 ms of the session's first observation \(it advertised AXShowMenu\)\)/);
  assert.match(rmd, /premise not met \(the click's plan was synthesized \(noAction\), not action\/AXPress\)/);
  assert.doesNotMatch(item187Markdown(rj), /AXPress on Chrome is unproven/);
  // A failing AXPress repetition, even a BEFORE that delivers, never moves the bar.
  ran[ITEMS.press('before', 0)] = [start, {kind: 'task', task: '187-cell', result: pressRecord('after', 0, {half: 'before'})}];
  ran[ITEMS.press('after', 0)] = [start, {kind: 'task', task: '187-cell', result: pressRecord('after', 0, {keyAfter: {reading: KEYLESS, pageFocused: false}})}];
  const fj = judge187(ran);
  assert.equal(fj.overall.verdict, 'LANDS');
  assert.match(item187Markdown(fj), /1 delivered: on this route the activation followed by the person's activation does not stop the paste on the saved engine/);
});

// The Mac, faked: three scenes, a page that counts what the act enters (and whether the page has the focus), an order
// watcher whose record the fake's raises and activations write, a composition the probe's key starts, Chrome's relaunch
// and the person's activation. `raiseAt`: the row keys whose act raises Chrome. `lateRaiseAt`: rows whose act raises
// Chrome, the watcher writing it only after the row's own read; `activationsInWaitAt`: rows whose page beacon lags,
// Chrome and then TextEdit activated while the row waits for it. `tailRaise`: Chrome raised while the block closes its
// session; `menuWatch`: the notification watcher's fate (ok, ended, dead, unreadable) and `menuSnapshot` whether the
// snapshot reads succeed. `lostKeys`: composition keys lost; `delayedReads`: focus reads before the first key lands;
// `latinKey`: the key lands as the Latin letter; `keyless`: Chrome left without a key window by `open -a`; `armSet`:
// the saved engine's arm left set (every paste into Chrome times out at the read, and Chrome stays keyless);
// `activationInside`: the paste's activation point inside the frame (its own click posted); `axpressReads`: the
// textarea's action reads before AXPress shows (Infinity: never); `premise`: the premise part's record (open, closed,
// none); `strayWindowReads`: window reads of the relaunched Chrome with another window in front (Infinity: always);
// `shortMoves`: moves of Chrome's window that land halfway; `foreignAt`: acts during which the person activates Activity
// Monitor; `foreignInSetup`: the person activates it once, at the item's first activation (outside every row);
// `native`: the engine every act's result names (`cua/nativeEngine`), `clickKind` the act's activationClickKind.
function fakeMac(out, {raiseAt = [], lateRaiseAt = [], activationsInWaitAt = [], tailRaise = false, menuWatch = 'ok', menuSnapshot = true, lostKeys = 0, delayedReads = 0, latinKey = false, keyless: keylessOpen = false,
  armSet = false, activationInside = false, axpressReads = 0, premise = 'open', strayWindowReads = 0, shortMoves = 0, foreignAt = [], foreignInSetup = false, native = null, clickKind = null} = {}) {
  const keyless = keylessOpen || armSet;
  let actionReads = 0, strays = strayWindowReads, shorts = shortMoves;
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
        if (!code.includes('(no click)')) { page = {...page, seq: page.seq + 1, length: 0}; return {ok: true, value: {ready: true}, route: null, meta: {}, images: []}; }
        // The clickless prepare as the kit's cell reads the field: empty, or (when it names one) holding the known prior.
        const prior = Number(code.match(/__priorLength = (\d+)/)?.[1] ?? NaN);
        const value = page.length === 0 ? {ready: true, prior: 'empty', focused: true} : page.length === prior ? {ready: true, prior: 'background', focused: true} : {ready: false, reason: 'the field is not empty'};
        return {ok: true, value, route: null, meta: {}, images: []};
      }
      if (code.includes('// cua-187: act')) {
        const text = JSON.parse(code.match(/__app\.(?:typeText|paste)\(("(?:[^"\\]|\\.)*")\)/)[1]);
        const key = calls.filter(c => c[0] === 'act').length;
        calls.push(['act', keys]);
        if (activationsInWaitAt.includes(key)) { stalePage = {...page}; lagReads = 2; pairDue = true; }
        const chromeAct = code.includes('cursor-sitting:scene chrome'), lands = !(chromeAct && (armSet || (keyless && keys === 'chrome')));
        if (foreignAt.includes(key)) activationsLog.push({kind: 'activated', bundleId: 'com.apple.ActivityMonitor', pid: 900, at: tick()});
        if (lands) beacon({length: page.length + text.length});  // a paste goes in at the caret, after what the field holds
        if (raiseAt.includes(key)) order('back-above');
        if (lateRaiseAt.includes(key)) { order('back-above'); changes.at(-1).visibleAfter = attempts + 2; }
        return {ok: true, value: {actMs: lands ? 180 : 2100, threw: !lands, message: lands ? null : 'timed out'}, route: 'paste', images: [], nativeEngine: native,
          meta: {activationGuardMs: 40, activationClick: activationInside ? 'posted' : 'outsideFrame', entered: lands ? text.length : 0, ...(clickKind ? {activationClickKind: clickKind, activationJoin: 'fresh'} : {}),
            paste: lands ? {stage: 'effect', confirmed: true, focusEnforcement: {activated: true, point: 'outside'}, perLine: perLineFor(code.includes('__app.paste(') ? 'paste' : 'typeText', text)} : {stage: 'read', readWait: 'timeout'}}};
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
      activate: async ([id]) => { if (foreignInSetup && !calls.some(c => c[0] === 'activate')) activationsLog.push({kind: 'activated', bundleId: 'com.apple.ActivityMonitor', pid: 900, at: tick()}); calls.push(['activate', id]); front = id; if (id === 'textedit' && stateNow() === 'back-above') order('front-above'); beacon(); return {ok: true}; },
      'select-source': async args => { calls.push(['select-source', ...args]); return {ok: true, switched: true}; },
    },
  };
  const deps = {
    out, scene, state: () => ({scenes: {chrome: {page: {variant: 'counters'}}, textedit: {}, electron: {}}}), activate: id => io.tasks.activate([id]),
    frontmost: () => ({pid: pids[front], topWindow: {number: numbers[front]}}), windows: pid => {
      const id = Object.keys(pids).find(k => pids[k] === pid), own = {number: numbers[id], bounds: bounds[id], onScreen: true};
      if (id === 'chrome' && strays > 0) { strays -= 1; return [{number: 99, bounds: {x: 0, y: 0, width: 600, height: 400}, onScreen: true}, own]; }
      return [own];
    },
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
    moveWindow: ([pid, , dx, dy]) => {
      const id = Object.keys(pids).find(k => pids[k] === Number(pid)), part = id === 'chrome' && shorts > 0 ? (shorts -= 1, 0.5) : 1;
      bounds[id] = {...bounds[id], x: bounds[id].x + Math.round(Number(dx) * part), y: bounds[id].y + Math.round(Number(dy) * part)};
      calls.push(['move', id]);
      return {moved: true};
    },
    axActions: () => { actionReads += 1; calls.push(['actions']); return {trusted: true, ok: true, found: true, count: 1, walked: 40, actions: actionReads > axpressReads ? ['AXPress', 'AXShowMenu'] : ['AXShowMenu']}; },
    premiseRows: () => (premise === 'none' ? [] : [start, ...[1900, premise === 'open' ? 2200 : null, 2400].map((ms, k) => ({kind: 'task', task: '187-axpress', result: {ok: true, tag: `${ITEMS.premise}#${k}`, advertised: ms !== null, appearedMs: ms}}))]),
    order: {start: async ({file}) => ({pid: 77, file, start: {state: 'front-above'}}), stop: async () => ({start: {state: 'front-above'}, changes, end: {samples: 400, maxGapMs: 9}}),
      attempt: () => { attempts += 1; return {start: {state: 'front-above', at: T0}, changes: changes.filter(c => !(c.visibleAfter > attempts)), end: null}; }},
    activations: {start: () => ({}), lines: () => [...activationsLog], stop: () => [...activationsLog]},
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

// One repetition run on the fake Mac (`name`: the item's, the isolating slot's own). -> {rows, calls, result (its
// '187-cell' record), error}.
const runRep = async (t, {route = 'paste', half = 'after', rep = 0, name = null, ...options} = {}) => {
  const out = scratch(t), mac = fakeMac(out, options), item = name ?? (route === 'paste' ? ITEMS.cell(half, rep) : ITEMS.press(half, rep));
  let error = null;
  await runSteps(route === 'paste' ? cellItem({half, rep, item}) : pressItem({half, rep}), {item, out, io: mac.io, log: () => {}}).catch(e => { error = e; });
  const rows = read187(out)[item];
  return {rows, calls: mac.calls, result: rows.find(r => r.task === '187-cell')?.result ?? null, error, sleeps: mac.sleeps};
};

test('the background-paste cell end to end: relaunched, placed, the background paste under the order watcher, open -a, the key, the frontmost paste; on the saved engine both fail as predicted', async t => {
  const after = await runRep(t);
  assert.equal(after.error, null);
  const cell = after.result;
  assert.equal(cell.ok, true, JSON.stringify(cell.verdict));
  assert.deepEqual([cell.route, cell.verdict.status, cell.verdict.pass], ['paste', 'counted', true]);
  assert.deepEqual([cell.background.activationClick, cell.background.delivered, cell.background.regime, cell.background.stateAtStart], ['outsideFrame', true, 'background', 'front-above']);
  assert.equal(cell.background.front.expected, PIDS.textedit, 'TextEdit in front for the background paste');
  assert.deepEqual([cell.keyBefore.reading.frontmost, cell.keyAfter.reading.frontmost, cell.keyAfter.reading.focused, cell.keyAfter.pageFocused], [false, true, true, true]);
  assert.equal(cell.row.delivered, true);
  // The background string stays in the field: the frontmost paste's prepare (clicking nothing) accepts it as the known
  // prior content, and its read-back expects the concatenation.
  assert.deepEqual([cell.row.prior, cell.row.expectedLength, cell.row.readBack.length], ['background', 2 * CELL_ROW.string.text.length, 2 * CELL_ROW.string.text.length]);
  const fgCheck = cellItem({half: 'after', rep: 0}).filter(s => s.run && /check:/.test(s.label)).at(-1), fgPrepare = cellItem({half: 'after', rep: 0}).filter(s => s.run && /prepare:/.test(s.label)).at(-1);
  assert.equal(typeof fgCheck.cell, 'function');
  assert.match(fgCheck.cell({[fgPrepare.label]: {value: {ready: true, prior: 'background'}}}), new RegExp(`expectedLength: ${2 * CELL_ROW.string.text.length}`));
  assert.match(fgCheck.cell({[fgPrepare.label]: {value: {ready: true, prior: 'empty'}}}), new RegExp(`expectedLength: ${CELL_ROW.string.text.length}\\b`));
  assert.ok(!fgPrepare.cell.includes(CELL_ROW.string.text), 'the prior is compared by hash, its text not in the cell');
  const order = after.calls.map(c => c[0]), acts = after.calls.filter(c => c[0] === 'act');
  assert.deepEqual(acts, [['act', 'textedit'], ['act', 'chrome']]);
  assert.ok(order.indexOf('move') < order.indexOf('act') && order.lastIndexOf('act') > order.indexOf('open'));
  assert.ok(order.indexOf('open') > order.indexOf('act'), 'open -a after the background paste');
  assert.deepEqual(after.calls.filter(c => c[0] === 'prepare').map(c => c[1]), ['no click', 'no click']);
  assert.ok(!order.includes('press'), 'the paste route clicks nothing');
  const items = evidence();
  items[ITEMS.cell('after', 0)] = after.rows;
  assert.equal(judge187(items).overall.verdict, 'LANDS', 'the repetition as the kit records it meets the bar, its watcher whole');
  const before = await runRep(t, {half: 'before', armSet: true});
  assert.deepEqual([before.result.verdict.status, before.result.verdict.predicted, before.result.verdict.bgReadTimeout, before.result.verdict.keyless, before.result.verdict.delivers], ['counted', true, true, true, false]);
  assert.equal(before.result.ok, true);
  // The activation point inside the frame: the paste's own click consumed the arm, the repetition never counted.
  const inside = await runRep(t, {activationInside: true});
  assert.equal(inside.result.verdict.status, 'premise not met');
  assert.equal(inside.result.ok, false);
  assert.deepEqual(leaks(JSON.stringify(after.rows) + JSON.stringify(before.rows)), []);
});

test('the isolating slot\'s cell end to end: each paste\'s record keeps the engine that answered and its click, so the premise attests the half', async t => {
  const BUILD = {after: 'a'.repeat(64), before: 'c'.repeat(64)};
  const NATIVE = {after: {engine: 'cua', version: '0.1.0', build: BUILD.after}, before: {engine: 'cua', version: '0.1.0', build: BUILD.before, variant: 'control-no-inert-click'}};
  const KIND = {after: {kind: 'inertOutside', point: 'offset', when: 'early'}, before: {kind: 'skipped', skippedReason: 'controlBuild'}};
  for (const half of ['after', 'before']) {
    const name = ISO.cell(half, 0), run = await runRep(t, {half, name, native: NATIVE[half], clickKind: KIND[half], armSet: half === 'before'});
    assert.equal(run.error, null);
    assert.ok(run.rows.some(r => r.task === '187-relaunch' && r.args[0] === name), 'the slot\'s own item name');
    const cell = run.result;
    assert.deepEqual([cell.background.nativeEngine, cell.row.nativeEngine, cell.background.activationClickKind, cell.background.activationJoin], [NATIVE[half], NATIVE[half], KIND[half], 'fresh']);
    assert.deepEqual(repPremise(cell, {half, build: BUILD[half]}), ['counted', null], half);
    assert.equal(cellOutcome(cell, half).met, true, `${half} as predicted`);
    const other = half === 'after' ? 'before' : 'after';
    assert.equal(repPremise(cell, {half: other, build: BUILD[other]})[0], 'not attested', 'a result never attests the other half');
  }
  const unnamed = await runRep(t, {name: ISO.cell('after', 1), clickKind: KIND.after});
  assert.match(repPremise(unnamed.result, {half: 'after', build: BUILD.after})[1], /carried no cua\/nativeEngine/);
});

test('the AXPress cell end to end: the click only once AXPress shows; without it PRECONDITION UNMET and nothing clicked or pasted; a closed gate runs nothing', async t => {
  const late = await runRep(t, {route: 'press', axpressReads: 20});
  const ax = late.rows.find(r => r.task === '187-axpress').result;
  assert.deepEqual([ax.advertised, ax.polls, ax.actions.includes('AXPress')], [true, 21, true]);
  assert.ok(ax.appearedMs >= 20 * 100 && ax.appearedMs <= AXPRESS_BOUND_MS, 'how long it took is recorded');
  assert.equal(late.result.ok, true, JSON.stringify(late.result.verdict));
  assert.deepEqual([late.result.premise.advertised, late.result.press.plan, late.result.verdict.status], [true, 'action', 'counted']);
  const never = await runRep(t, {route: 'press', axpressReads: Infinity});
  assert.equal(never.error, null, 'an unmet precondition is recorded, never a stop');
  assert.equal(never.result.verdict.status, 'precondition unmet');
  assert.ok(!never.calls.some(c => ['press', 'act', 'open'].includes(c[0])), 'nothing falls through to the pointer route, nothing is pasted');
  const waited = never.rows.find(r => r.task === '187-axpress').result;
  assert.ok(waited.appearedMs === null && waited.advertised === false && waited.polls > 10 && waited.boundMs === AXPRESS_BOUND_MS, 'waited out the bound, polled');
  const closed = await runRep(t, {route: 'press', premise: 'closed'});
  assert.match(closed.error?.message ?? '', /187-press-gate refused: the premise part saw AXPress within 5000 ms in 2 of 3 sample\(s\)/);
  assert.ok(!closed.calls.some(c => c[0] === 'scenes'), 'a closed gate relaunches nothing');
  const none = await runRep(t, {route: 'press', premise: 'none'});
  assert.match(none.error?.message ?? '', /the premise part has not run/);
});

test('the relaunch waits for its run window alone in front, stably; the placement settles and retries a window caught mid-move', async t => {
  const stray = await runRep(t, {strayWindowReads: 4});
  const waited = stray.rows.find(r => r.task === '187-relaunch').result;
  assert.equal(waited.ok, true);
  assert.equal(waited.polls, 4 + RELAUNCH_STABLE_POLLS, 'the stray window\'s reads, then the stable ones');
  assert.ok(stray.result, 'the repetition ran once the window settled');
  const always = await runRep(t, {strayWindowReads: Infinity});
  assert.match(always.error?.message ?? '', /187-relaunch refused: the chrome scene's run window 11 was not its one on-screen window, in front, .*\(its windows: 99, 11\)/);
  assert.ok(!always.calls.some(c => c[0] === 'act'));
  const short = await runRep(t, {shortMoves: 1});
  const placed = short.rows.find(r => r.task === '187-place').result;
  assert.deepEqual([placed.ok, placed.attempts], [true, 2]);
  assert.equal(placed.moves.filter(m => m.id === 'chrome' && m.dx !== undefined).length, 2, 'Chrome moved again from where it was caught');
  const stuck = await runRep(t, {shortMoves: Infinity});
  assert.match(stuck.error?.message ?? '', /187-place refused: chrome at \(\d+, \d+\) against \(24, \d+\): not in place after 3 attempt\(s\)/);
});

test('the person: a row the person touched is invalid and the block goes on; the item\'s touches are counted; a repetition the person touched says so', async t => {
  const out = scratch(t), mac = fakeMac(out, {foreignAt: [1]});
  await runSteps(block(ROWS.slice(0, 3)), {item: ITEMS.composing, out, io: mac.io, log: () => {}});
  const rows = rowsOfRun(out), records = rows.filter(r => r.task === '187-row').map(r => r.result);
  assert.deepEqual(records.map(r => r.invalid?.startsWith('person-touched') ?? false), [false, true, false]);
  assert.match(records[1].invalid, /person-touched: com\.apple\.ActivityMonitor activated/);
  assert.equal(records[2].delivered && records[2].invalid === null, true, 'the next row runs and counts');
  assert.deepEqual(interferenceRowsOf(records[1]), [], 'the person\'s own front change is not the row\'s');
  assert.deepEqual(touchedOfItem(rows, []), {count: 1, rep: true, foreign: {apps: ['com.apple.ActivityMonitor'], frontPids: []}}, 'one touch: the row, the watcher summary naming the same app');
  const rep = await runRep(t, {foreignAt: [0]});
  assert.ok(rep.result.personTouched);
  assert.equal(rep.result.verdict.status, 'person-touched');
  assert.equal(touchedOfItem(rep.rows, []).rep, true);
  assert.deepEqual(personTouchedOf({activations: [{kind: 'activated', bundleId: 'com.google.chrome.for.testing'}, {kind: 'activated', bundleId: 'io.github.ssfskim.cua.engine'}, {kind: 'deactivated', bundleId: 'x'}]}), null, 'the scenes and the engine are not the person');
  assert.deepEqual(personTouchedOf({fronts: [PIDS.chrome, 95245], scenePids: Object.values(PIDS)}), {apps: [], frontPids: [95245]});
  assert.deepEqual(personTouchedOf({activations: [{kind: 'activated'}]}), {apps: ['unknown'], frontPids: []});
  // A stopped repetition that never wrote its record: its watcher's lines tell, but only from an attempt that started it.
  const stopped = [start, {kind: 'task', task: '187-activations-start', result: {ok: true}}];
  assert.deepEqual(touchedOfItem(stopped, [{kind: 'activated', bundleId: 'com.cmuxterm.app'}]), {count: 1, rep: true, foreign: {apps: ['com.cmuxterm.app'], frontPids: []}});
  assert.equal(touchedOfItem([start], [{kind: 'activated', bundleId: 'com.cmuxterm.app'}]).count, 0, 'a stale file from an earlier attempt never counts');
});
const interferenceRowsOf = r => [r.front?.changed && !r.personTouched && 'front app'].filter(Boolean);

test('the drive: a person-touched repetition is replaced once, more than three touches stop it but the owner\'s source, and other stops follow the stages', async () => {
  const drive = async (touches, {errors = {}, seed = 0} = {}) => {
    const ran = [], marks = [], entries = [];
    const result = await driveItems(plan187({part: 'cell'}), {seed,
      runItem: async entry => { ran.push(entry.item); entries.push(entry); return errors[entry.item] ? new Error(errors[entry.item]) : null; },
      evidenceOf: item => ({rows: touches.includes(item) ? [{...start, at: 7000 + Number(item.match(/\d+$/)?.[0] ?? 0)}, {kind: 'task', task: '187-cell', result: {personTouched: {apps: ['com.apple.ActivityMonitor'], frontPids: []}}}] : [start], activations: []}),
      mark: (item, error, touched) => marks.push([item, error.message, touched.count])});
    return {...result, ran, marks, entries};
  };
  const once = await drive([ITEMS.cell('after', 0), ITEMS.cell('after', 3)]);
  assert.deepEqual(once.ran, [ITEMS.place, ITEMS.cell('after', 0), ITEMS.cell('after', 3), ITEMS.cell('after', 1), ITEMS.cell('after', 2), ITEMS.press('after', 0), ITEMS.placeAgain, ITEMS.end],
    'the replacement right after; a touched replacement is not replaced again');
  assert.deepEqual([once.stopped, once.touched], [null, 2]);
  const replacement = once.entries.find(e => e.item === ITEMS.cell('after', 3));
  assert.deepEqual(replacement.steps[0], {task: '187-replaces', args: [ITEMS.cell('after', 0), '7000']}, 'the replacement names the attempt it replaces');
  const many = await drive([ITEMS.cell('after', 0), ITEMS.cell('after', 3), ITEMS.cell('after', 1), ITEMS.cell('after', 4)]);
  assert.equal(many.touched, TOUCHED_STOP + 1);
  assert.match(many.stopped, /4 person-touched items in the slot, more than 3/);
  assert.deepEqual(many.ran.slice(-2), [ITEMS.cell('after', 4), ITEMS.end], 'only the owner\'s source after the fourth touch');
  const seeded = await drive([ITEMS.cell('after', 1)], {seed: 3});
  assert.match(seeded.stopped, /4 person-touched/);
  assert.ok(!seeded.ran.includes(ITEMS.cell('after', 4)), 'no replacement once the drive stops');
  const failed = await drive([], {errors: {[ITEMS.cell('after', 1)]: 'open refused', [ITEMS.place]: 'not placed'}});
  assert.equal(failed.stopped, `${ITEMS.place}: not placed`);
  assert.deepEqual(failed.ran, [ITEMS.place, ITEMS.end]);
  const repStop = await drive([], {errors: {[ITEMS.cell('after', 1)]: 'open refused'}});
  assert.equal(repStop.stopped, null, 'a repetition that stops lets the drive go on');
  assert.deepEqual(repStop.marks, [[ITEMS.cell('after', 1), 'open refused', 0]]);
  const touchedStop = await drive([ITEMS.placeAgain], {errors: {[ITEMS.placeAgain]: 'key guard'}});
  assert.equal(touchedStop.stopped, null, 'an item the person touched goes on');
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
  for (const part of ['premise', 'cell', 'composing', 'controls', '259', '188', '188-vendor-click']) {
    const answer = await quietly(() => main(['paste-187', 'drive', '--out', out, '--dry-run', '--quiet', '--part', part]));
    assert.match(answer.text, new RegExp(`dry run: ${count({part})} steps, nothing sent`), part);
  }
  const vendor = await quietly(() => main(['paste-187', 'drive', '--out', out, '--dry-run', '--quiet', '--vendor']));
  assert.match(vendor.text, new RegExp(`dry run: ${count({vendor: true})} steps`));
  assert.equal(existsSync(out), false);
  await assert.rejects(main(['paste-187', 'drive', '--out', out, '--dry-run', '--part', 'a']), /--part takes reslot, premise, before, cell, composing, controls, 259, 188, 188-vendor-click/);
  await assert.rejects(main(['paste-187', 'drive', '--out', dir, '--run', dir, '--part', 'before']), /--part before takes --saved/);
  const judged = await quietly(() => main(['paste-187', 'judge', '--out', dir]));
  assert.equal(judged.code, 1, 'nothing recorded: nothing lands');
  assert.match(readFileSync(join(dir, 'item-187.md'), 'utf8'), /## Overall: DOES NOT LAND/);
});

test('the slot\'s touch count keeps every attempt of every item, so re-running a part never resets the stop rule', () => {
  const touchedRow = {kind: 'task', task: '187-row', result: {personTouched: {apps: ['com.apple.ActivityMonitor'], frontPids: []}}};
  const touchedCell = {kind: 'task', task: '187-cell', result: {personTouched: {apps: ['com.cmuxterm.app'], frontPids: []}}};
  // An attempt with a touched row, one stopped by a touch the drive marked, then a clean latest attempt.
  const rows = [start, touchedRow, touchedRow, start, {kind: 'task', task: '187-activations-start'}, {kind: 'stopped', error: 'key guard', personTouched: {apps: ['com.cmuxterm.app'], frontPids: []}}, start];
  assert.equal(slotTouches(rows, [{kind: 'activated', bundleId: 'com.cmuxterm.app'}]), 3, 'the latest attempt never started its watcher: its file is not read');
  assert.equal(touchedOfItem(rows, []).count, 0, 'the latest attempt alone is clean');
  assert.equal(slotTouches([start, touchedCell, start, touchedCell]), 2);
  assert.equal(slotTouches([start, {kind: 'task', task: '187-activations-start'}], [{kind: 'activated', bundleId: 'com.cmuxterm.app'}]), 1, 'the latest attempt\'s own watcher counts');
  assert.equal(slotTouches([], []), 0);
  // A mark the drive wrote after a recorded touch does not count it twice.
  assert.equal(slotTouches([start, touchedCell, {kind: 'stopped', error: 'x', personTouched: true}]), 1);
});

test('the premise gate opens only on all three samples of the latest attempt, each read whole and each seeing AXPress in time', async () => {
  const sample = (over = {}) => ({ok: true, advertised: true, appearedMs: 2000, ...over});
  assert.equal(premiseOpens([sample(), sample(), sample()]), true);
  assert.equal(premiseOpens([sample(), sample()]), false, 'a premise part that stopped after two samples');
  assert.equal(premiseOpens([sample()]), false);
  assert.equal(premiseOpens([sample(), sample({ok: false}), sample()]), false, 'a sample read untrusted');
  assert.equal(premiseOpens([sample(), sample({advertised: false, appearedMs: 6200}), sample()]), false);
  assert.equal(PREMISE_SAMPLES, 3);
  const gate = rows => item187Tasks({premiseRows: () => rows})['187-press-gate']([], {results: {}});
  const axpress = result => ({kind: 'task', task: '187-axpress', result});
  assert.equal((await gate([start, axpress(sample()), axpress(sample()), axpress(sample())])).ok, true);
  // An earlier full attempt does not open the gate for a latest attempt that stopped short.
  const short = await gate([start, axpress(sample()), axpress(sample()), axpress(sample()), start, axpress(sample())]);
  assert.equal(short.ok, false);
  assert.match(short.problem, /in 1 of 3 sample\(s\) \(1 recorded\)/);
});

test('a stale replacement\'s rows are obsolete: its old raise, menu or watcher failure never fails a current run that passes', () => {
  const TOUCH = {personTouched: {apps: ['com.apple.ActivityMonitor'], frontPids: []}};
  const items = evidence();
  // AFTER rep 0 touched in an earlier attempt and replaced then; the half run again since, rep 0 now passing.
  items[ITEMS.cell('after', 0)] = [{...start, at: T0}, {kind: 'task', task: '187-cell', result: cellRecord('after', 0, TOUCH)}, orderStop(), {...start, at: T0 + 60_000}, ...items[ITEMS.cell('after', 0)].slice(1)];
  const old = {...TOUCH, background: cellRow('after', 3, 'chrome-cell-background', {raisedAt: [T0 + 2]}), row: cellRow('after', 3, 'chrome-cell', {menu: {read: {trusted: true, ok: true, selected: 0, openMenus: 1}, observed: 0}})};
  items[ITEMS.cell('after', 3)] = [...replacementRows('after', 3, ITEMS.cell('after', 0), T0, old).slice(0, -1), orderStop({maxGapMs: 90, raises: 2})];
  const judged = judge187(items);
  assert.equal(judged.cells.paste.after.at(-1).status, 'stale replacement');
  assert.equal(judged.overall.verdict, 'LANDS', judged.overall.why.join('; '));
  // An untouched stale replacement's rows are obsolete too.
  const untouched = evidence();
  untouched[ITEMS.cell('after', 3)] = [...replacementRows('after', 3, ITEMS.cell('after', 0), T0, {background: cellRow('after', 3, 'chrome-cell-background', {raisedAt: [T0 + 2]})}).slice(0, -1), orderStop({maxGapMs: 90})];
  assert.equal(judge187(untouched).overall.verdict, 'LANDS', judge187(untouched).overall.why.join('; '));
  // A live replacement (its parent's attempt still the latest and touched) is judged like any repetition: its raise counts.
  const liveRaise = evidence({cell: rep => (rep === 0 ? TOUCH : {})});
  liveRaise[ITEMS.cell('after', 0)][0] = {...start, at: T0};
  liveRaise[ITEMS.cell('after', 3)] = replacementRows('after', 3, ITEMS.cell('after', 0), T0, {background: cellRow('after', 3, 'chrome-cell-background', {raisedAt: [T0 + 2]})});
  assert.equal(judge187(liveRaise).cells.paste.after.at(-1).status, 'counted');
  assert.match(judge187(liveRaise).overall.why.join('; '), /1 raise\(s\): 1 in rows/, 'a live replacement\'s raise still fails the bar');
});

test('a touch only the watcher saw, in a group that completed, survives the part being run again', async t => {
  const out = scratch(t);
  await runSteps(block(ROWS.slice(0, 2)), {item: ITEMS.composing, out, io: fakeMac(out, {foreignInSetup: true}).io, log: () => {}});
  const first = read187(out)[ITEMS.composing];
  assert.ok(first.filter(r => r.task === '187-row').every(r => !r.result.personTouched), 'no row saw it: it came outside every row');
  assert.deepEqual(first.find(r => r.task === '187-activations-stop').result.personTouched, {apps: ['com.apple.ActivityMonitor'], frontPids: []}, 'the attempt\'s own record keeps it');
  assert.equal(touchedOfItem(first, []).count, 1, 'counted from the record, not the watcher\'s file');
  // The part run again, clean: the watcher's file is replaced, the earlier attempt's touch still counts for the slot.
  await runSteps(block(ROWS.slice(0, 2)), {item: ITEMS.composing, out, io: fakeMac(out).io, log: () => {}});
  const rows = read187(out)[ITEMS.composing];
  assert.equal(touchedOfItem(rows, []).count, 0);
  assert.equal(slotTouches(rows, []), 1);
});

// The saved engine's paste as the second re-slot recorded it: thrown with no stage meta, the legacy -10005 sentence,
// which that lineage threw for a read timeout and an effect timeout alike.
const DD7A_ERROR = 'Computer Use server error -10005: Timed out waiting for the application to read the clipboard';
const DD7A_TIMED_OUT = {act: {ok: true, value: {actMs: 2118, threw: true, message: DD7A_ERROR}, route: 'paste', meta: {activationGuardMs: 40, activationClick: 'outsideFrame'}},
  check: {ok: true, value: {ok: false, outcome: {exact: false, length: 0, expectedLength: CELL_ROW.string.text.length}}}};
// Chrome as both builds read it after open -a in that slot: frontmost, the run window main and the app's focused window,
// its own AXFocused no, the page focused.
const SLOT_KEY = {reading: {...KEY, focused: false}, pageFocused: true, settledMs: 1123};

test('(a) corrected: a read timeout comes from the stage meta alone; the saved engine\'s legacy -10005 is a read-or-effect timeout, stage unknown, and fails the BEFORE prediction', () => {
  const r = over => cellRow('before', 0, 'chrome-cell-background', over);
  const dd7a = r(DD7A_TIMED_OUT);
  assert.equal(dd7a.paste, null, 'no stage meta');
  assert.equal(readTimedOut(dd7a), false, 'the legacy sentence names no stage');
  assert.equal(legacyTimeout(dd7a), true);
  const withError = message => r({act: {...DD7A_TIMED_OUT.act, value: {...DD7A_TIMED_OUT.act.value, message}}});
  assert.equal(legacyTimeout(withError(DD7A_ERROR.replace('-10005', '-10004'))), false, 'another code');
  assert.equal(legacyTimeout(withError(DD7A_ERROR.replace('-10005', '-100051'))), false);
  assert.equal(legacyTimeout(withError('Computer Use server error -10005: The application did not respond')), false, 'that code with another message');
  assert.equal(legacyTimeout(withError('Timed out waiting for the application to read the clipboard')), false, 'the message without the code');
  assert.equal(legacyTimeout(r({act: {...DD7A_TIMED_OUT.act, value: {actMs: 10, threw: false, message: DD7A_ERROR}}})), false, 'a paste that did not throw');
  const staged = (stage, readWait) => r({act: {...DD7A_TIMED_OUT.act, meta: {...DD7A_TIMED_OUT.act.meta, paste: {stage, readWait}}}});
  assert.deepEqual([readTimedOut(staged('read', 'timeout')), legacyTimeout(staged('read', 'timeout'))], [true, false], 'a stage meta decides');
  assert.deepEqual([readTimedOut(staged('effect', 'handedOver')), legacyTimeout(staged('effect', 'handedOver'))], [false, false]);
  assert.equal(READ_TIMEOUT.code, '-10005');
  // The BEFORE half as the slot recorded it: neither paste delivered, the stage unknown, so not as predicted: DOES NOT LAND.
  const before = () => ({background: cellRow('before', 0, 'chrome-cell-background', DD7A_TIMED_OUT), row: cellRow('before', 0, 'chrome-cell', DD7A_TIMED_OUT), keyAfter: SLOT_KEY});
  const judged = judge187(evidence({before, cell: () => ({keyAfter: SLOT_KEY})}));
  assert.deepEqual(judged.cells.paste.before.map(c => [c.bgReadTimeout, c.bgLegacyTimeout, c.deliversNeither, c.predicted]), Array(3).fill([false, true, true, false]));
  assert.equal(judged.overall.verdict, 'DOES NOT LAND');
  assert.match(judged.overall.why.join('; '), /BEFORE half: 0 of 3 counted repetitions failing as predicted .*legacy -10005 read-or-effect sentence and no stage meta \(stage unknown\), not shown to be a read timeout/);
  assert.deepEqual(judged.overall.shown, {after: {both: 3, of: 3}, before: {neither: 3, of: 3}}, 'what delivery alone shows');
  assert.match(item187Markdown(judged), /By delivery alone, stage aside: AFTER 3 of 3 counted repetitions with both pastes delivered, BEFORE 3 of 3 with neither delivered\. 3 BEFORE background paste\(s\) timed out with the legacy -10005/);
  // The same rows with a stage meta that says read timeout would fail as predicted: the predicate can come out either way.
  const readStage = {...DD7A_TIMED_OUT, act: {...DD7A_TIMED_OUT.act, meta: {...DD7A_TIMED_OUT.act.meta, paste: {stage: 'read', readWait: 'timeout'}}}};
  const staged187 = judge187(evidence({before: () => ({...before(), background: cellRow('before', 0, 'chrome-cell-background', readStage)}), cell: () => ({keyAfter: SLOT_KEY})}));
  assert.equal(staged187.overall.verdict, 'LANDS', staged187.overall.why.join('; '));
  const other = judge187(evidence({before: () => ({...before(), background: cellRow('before', 0, 'chrome-cell-background', {...DD7A_TIMED_OUT, act: {...DD7A_TIMED_OUT.act, value: {...DD7A_TIMED_OUT.act.value, message: 'Computer Use server error -10004: refused'}}})})}));
  assert.match(other.overall.why.join('; '), /BEFORE half: 0 of 3 counted repetitions failing as predicted .*stopped at no stage \(read –\), not a read timeout/);
});

test('(b)(c) the cell passes on delivery with the run window\'s AXFocused no, the key readings leave the bar for the mechanism, and a BEFORE that delivers still fails it', () => {
  assert.equal(keyHeld({...KEY, focused: false}, true), true, 'AXFocused is no part of the key');
  assert.equal(keyHeld({...KEY, focused: null}, true), true);
  assert.equal(keyHeld({...KEY, main: false}, true), false);
  const slot = evidence({cell: () => ({keyAfter: SLOT_KEY}), before: () => ({keyAfter: SLOT_KEY})});
  const judged = judge187(slot);
  assert.equal(judged.overall.verdict, 'LANDS', judged.overall.why.join('; '));
  assert.ok(judged.cells.paste.after.every(c => c.pass) && judged.cells.paste.before.every(c => c.predicted));
  // Key readings unread or even keyless on AFTER no longer move the bar: delivery does.
  assert.equal(judge187(evidence({cell: rep => (rep === 1 ? {keyAfter: {reading: KEYLESS, pageFocused: false}} : {})})).overall.verdict, 'LANDS');
  assert.equal(judge187(evidence({before: () => ({keyAfter: {reading: KEY, pageFocused: true}})})).overall.verdict, 'LANDS');
  // The mechanism: the same readings on both builds refute the prediction, stated as tested and NOT supported.
  assert.equal(judged.mechanism.identical, true);
  assert.equal(judged.mechanism.supported, false);
  assert.match(judged.mechanism.statement, /"Chrome frontmost with no key window" \(the saved engine, after `open -a`\) was tested and is NOT supported: the key readings after `open -a` were identical on both builds/);
  const md = item187Markdown(judged);
  assert.match(md, /## The mechanism: the key-window readings \(reported, never the bar\)/);
  assert.match(md, /\| after \| .* \| frontmost yes, AXMain yes, AXFocusedWindow run, hasFocus yes × 3 \|/);
  assert.match(md, /\| before \| .* \| frontmost yes, AXMain yes, AXFocusedWindow run, hasFocus yes × 3 \|/);
  // Readings that do show it on the saved engine, against a key window on the shipping build, support it.
  const shown = judge187(evidence({cell: () => ({keyAfter: SLOT_KEY}), before: () => ({keyAfter: {reading: {...KEY, focused: false, focusedWindow: 'none'}, pageFocused: false}})}));
  assert.deepEqual([shown.mechanism.supported, shown.overall.verdict], [true, 'LANDS']);
  const unlike = judge187(evidence({cell: () => ({keyAfter: SLOT_KEY}), before: rep => (rep === 0 ? {keyAfter: {reading: {...KEY, focusedWindow: 'none'}, pageFocused: false}} : {keyAfter: SLOT_KEY})}));
  assert.match(unlike.mechanism.statement, /NOT supported: the counted readings do not show/);
  // A BEFORE repetition that delivers still fails the cell: NO VERDICT, the discrimination being delivery.
  const delivering = judge187(evidence({cell: () => ({keyAfter: SLOT_KEY}), before: rep => (rep === 0 ? cellRecord('after', 0, {half: 'before', keyAfter: SLOT_KEY}) : {keyAfter: SLOT_KEY})}));
  assert.equal(delivering.overall.verdict, 'NO VERDICT');
  const bgDelivering = judge187(evidence({before: rep => (rep === 2 ? {background: cellRow('before', 2, 'chrome-cell-background')} : {})}));
  assert.equal(bgDelivering.overall.verdict, 'NO VERDICT');
  // The AXFocused count, both builds: the composing and korean rows, the cell's rows and readings.
  assert.equal(judged.axFocused.saved.of, 3 * 4, 'per BEFORE repetition: its two rows, the readings before and after open -a');
  assert.equal(judged.axFocused.saved.no, 3 * 3, 'the fixture\'s frontmost rows read AXFocused yes before their act: counted as read, not as no');
  assert.ok(judged.axFocused.shipping.of > 3 * 4 && judged.axFocused.all.of === judged.axFocused.shipping.of + judged.axFocused.saved.of);
  assert.match(md, new RegExp(`AXFocused read no on ${judged.axFocused.all.no} of ${judged.axFocused.all.of} Chrome key-window readings, both builds`));
});

test('the addendum: `judge --addendum` writes item-187-rejudge.md beside the slot\'s report and never touches item-187.md', async t => {
  const dir = scratch(t), items = evidence({cell: () => ({keyAfter: SLOT_KEY}), before: () => ({keyAfter: SLOT_KEY})});
  const {writeFileSync} = await import('node:fs');
  for (const [name, rows] of Object.entries(items)) writeFileSync(join(dir, `item-${name}.jsonl`), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  const report = '# the slot\'s report, as its judge computed it\n';
  writeFileSync(join(dir, 'item-187.md'), report);
  const answer = await quietly(() => main(['paste-187', 'judge', '--out', dir, '--addendum']));
  assert.equal(answer.code, 0);
  assert.equal(readFileSync(join(dir, 'item-187.md'), 'utf8'), report, 'item-187.md stays exactly as computed');
  const addendum = readFileSync(join(dir, ADDENDUM_FILE), 'utf8');
  assert.equal(ADDENDUM_FILE, 'item-187-rejudge.md');
  assert.match(addendum, /^# #187: the re-judgment addendum/);
  assert.match(addendum, /\(the kit at [0-9a-f]{12}\)/, 'the kit\'s commit that judged it');
  assert.match(addendum, /\*\*\(a\) The read stage, corrected\.\*\* .*-10005 with "Timed out waiting for the application to read the clipboard".*independent adversarial review of a950e5a1\.\.b04ca136 found that wrong.*read-or-effect timeout \(legacy, stage unknown\)\. This file replaces b04ca136's\./);
  assert.match(addendum, /\*\*\(b\) The key\.\*\* .*never observed true, reading no on \d+ of \d+ Chrome key-window readings, both builds/);
  assert.match(addendum, /\*\*\(c\) The bar, a post-hoc acceptance change\.\*\*/);
  assert.match(addendum, /\(c\) is outcome-dependent: the "Chrome frontmost with no key window" prediction was tested, and the readings refute it; it is recorded as wrong, not restated, and its leaving the bar is a post-hoc acceptance change/);
  assert.doesNotMatch(addendum, /no run could meet: the saved engine/);
  // This synthetic slot's BEFORE carries the read-stage meta, so it lands; the real slot's legacy rows do not (test (a)).
  assert.match(addendum, /## Re-judged: LANDS, on the background paste/);
  assert.match(addendum, /\*\*What the cell does show, by delivery alone:\*\* AFTER 3 of 3 counted repetitions with both pastes delivered; BEFORE 3 of 3 with neither delivered\. What it does not show: the BEFORE stage/);
  assert.match(addendum, /\n---\n\n# #187: the re-slot/, 'the full re-judged report follows');
  assert.deepEqual(leaks(addendum), []);
  // Without --addendum the judge still writes item-187.md, as a drive's end does.
  await quietly(() => main(['paste-187', 'judge', '--out', dir]));
  assert.notEqual(readFileSync(join(dir, 'item-187.md'), 'utf8'), report);
});
