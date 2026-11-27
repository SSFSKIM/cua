// The caret cells of #258 and #259 (T8e of the M5 wave-1 record; the M4/M5 pre-flight's §6): two frontmost Electron
// cases judged by where the field's caret or selection is after a click, read on the device outside either engine
// (scripts/native-matrix/caret.mjs, matrix-device.mjs `text-range`), and judged beside the vendor's reading of the same
// run (cell-verdict.mjs 'reading'): the plan and its cells, the device's reading, the run's rows against its doubles, and
// the judge.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseCell} from '../../scripts/native-baseline/cells.mjs';
import {caretOutcome, caretPrepared, fieldRange, lineColumn} from '../../scripts/native-matrix/caret.mjs';
import {sampleCause} from '../../scripts/native-matrix/front-key.mjs';
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {judgeCell} from '../../scripts/native-matrix/cell-verdict.mjs';
import {departureProblems} from '../../scripts/native-matrix/departures.mjs';
import {caseCells} from '../../scripts/native-matrix/matrix-cells.mjs';
import {manifestOf} from '../../scripts/native-matrix/manifest.mjs';
import {CARET, CARET_ROWS, CASES, casesOf, ELECTRON_FIELD_ROWS, electronPointFromField, FIELD_LINES, groundCase, isCaretRow} from '../../scripts/native-matrix/plan.mjs';
import {FULL_PLAN, planOf} from '../../scripts/native-matrix/run.mjs';
import {runWith} from './run-doubles.mjs';

const SELECTION = 'electron/frontmost/click.selection', POINT = 'electron/frontmost/click.point';
const VALUE = FIELD_LINES.join('\n');
const caseOf = kase => CASES.electron.find(c => c.method === 'click' && c.case === kase);

// ---- the plan ---------------------------------------------------------------------------------------------------------

test('the two caret cases are the Electron fixture\'s, frontmost only, in every full run\'s manifest with their timings', () => {
  assert.deepEqual(CARET_ROWS, [SELECTION, POINT]);
  assert.ok(isCaretRow(SELECTION) && isCaretRow(POINT) && !isCaretRow('electron/frontmost/click.button'));
  const front = casesOf('electron', 'frontmost').map(c => `${c.method}.${c.case}`), back = casesOf('electron', 'background').map(c => `${c.method}.${c.case}`);
  assert.ok(front.includes('click.selection') && front.includes('click.point'));
  assert.ok(!back.includes('click.selection') && !back.includes('click.point'), 'a background click into a web page is another question (no pointer reaches it)');
  assert.ok(back.includes('click.button'), 'the other cases keep both regimes');
  const ids = manifestOf({run: 1, samples: 1}, FULL_PLAN).map(r => `${r.section} ${r.id}`);
  for (const id of [SELECTION, POINT]) assert.ok(ids.includes(`method ${id}`), id);
  assert.ok(ids.includes('speed electron/method.click.selection') && ids.includes('speed electron/method.click.point'));
  assert.ok(!ids.some(id => /click\.(selection|point)@/.test(id)), 'no background row');
  // The narrowed method cell on the Electron fixture runs them too (the MacBook lane's fallback).
  const narrowed = manifestOf({run: 1, samples: 1}, planOf('method', {scene: 'electron'})).map(r => r.id);
  assert.ok(narrowed.includes(SELECTION) && narrowed.includes(POINT));
});

// Ruling 1228 (C2): #259's click landed on line 3 column 5 on both engines in every run since C-6, never the aimed line
// 2. The field shows 6 rows of an 8-line value, so the caret the prepare left at the value's end scrolled it to its last
// lines, and a fixed window point aimed at the unscrolled third line. The caret is now left at the value's start (the
// field scrolled to its top) and the point is grounded on the field's own frame as read (field-frame), as Chrome's drag.
test('the prepared states the device must read: the word selected for #258, the caret at the value\'s start for #259', () => {
  assert.deepEqual(CARET.selection.before, {location: VALUE.indexOf('charlie'), length: 'charlie'.length});
  assert.deepEqual(CARET.point.before, {location: 0, length: 0});
  assert.equal(CARET.point.line, 2);
  assert.equal(CARET.point.at, undefined, 'no fixed point: the field\'s frame grounds it');
  const html = fs.readFileSync(new URL('../../scripts/native-matrix/fixtures/electron/index.html', import.meta.url), 'utf8');
  assert.equal(Number(/<textarea id="text"[^>]* rows="(\d+)"/.exec(html)?.[1]), ELECTRON_FIELD_ROWS);
  assert.ok(FIELD_LINES.length > ELECTRON_FIELD_ROWS, 'the value outgrows the field: where the caret is decides what shows');
});

// The fixture's field as the plan's cell tests model it (./plan.test.mjs electronField, reduced): a value, the focus and a
// selection; `press` keeps the selection on a click, as cua's AXPress on Chromium's textarea did (#258).
const AsyncFunction = (async () => {}).constructor;
async function runCell(text, apps) {
  let out = '';
  globalThis.__apps = apps;
  try { await new AsyncFunction('cua', 'nodeRepl', text)({}, {write: s => { out += s; }}); } finally { delete globalThis.__apps; }
  return parseCell(out);
}
const GOLDEN = fs.readFileSync(new URL('../native-goldens/electron/vendor.txt', import.meta.url), 'utf8').split('\n\nThe focused UI element')[0].split('\n');
function field({value = '', press = false, shot = [720, 560]} = {}) {
  const state = {value, selected: null, clicks: []};
  const render = () => `${GOLDEN.map(line => (/^\t+5 /.test(line) ? `${line}${state.value ? `, Value: ${state.value}` : ''}` : line)).join('\n')}\n\n${
    state.selected ? `Selected text: \`\`\`\n${state.selected}\n\`\`\`` : `The focused UI element is ${GOLDEN.find(l => /^\t+5 /.test(l)).trim()}`}`;
  const png = (w, h) => { const b = new Uint8Array(24); b.set([0x89, 0x50, 0x4e, 0x47]); new DataView(b.buffer).setUint32(16, w); new DataView(b.buffer).setUint32(20, h); return b; };
  const app = {
    async getAXState() { return render(); },
    async getScreenshot() { return png(...shot); },
    async click(target) { state.clicks.push(target); if (!press) state.selected = null; },
    async setValue(index, v) { if (index === 5) { state.value = v; state.selected = null; } },
    async selectText(index, word, options) { if (index === 5 && state.value.includes(word)) { state.selected = options?.selectionType ? null : word; if (options?.selectionType) state.cursor = {word, selectionType: options.selectionType}; } },
  };
  return {app, state};
}
async function runCase(kase, f, reading = null) {
  const cells = caseCells('electron', groundCase(caseOf(kase), reading));
  const apps = {electron: f.app};
  const out = {prepare: await runCell(cells.prepare, apps), act: await runCell(cells.act, apps), check: await runCell(cells.check, apps)};
  delete globalThis.__m;
  return out;
}

test('#258\'s cell: the field given its value with the word selected, one element click by index, the value read back', async () => {
  const f = field();
  const {prepare, act, check} = await runCase('selection', f);
  assert.equal(prepare.value.ready, true, JSON.stringify(prepare));
  assert.equal(act.value.threw, false);
  assert.deepEqual(f.state.clicks, [5], 'the act is one element click on the field');
  assert.deepEqual(check.value, {ok: true, outcome: {valueKept: true}});
  assert.doesNotMatch(JSON.stringify([prepare, act, check]), /alpha|charlie|Fixture/, 'no text leaves the cells');
});

test('#259\'s cell: the caret at the value\'s start, one coordinate click at the third line\'s point, grounded on the field\'s frame, in the screenshot\'s pixels', async () => {
  // The field's frame as read: 16,60 420x102 in the 720x560 window (rows of 16 pt inside 3 pt of border and padding).
  const reading = {window: {width: 720, height: 560}, field: {x: 16, y: 60, width: 420, height: 102}};
  assert.deepEqual(electronPointFromField(reading), {window: [720, 560], at: [60, 103]});
  const lineOf = y => Math.floor((y - 60 - 3) / 16);
  assert.equal(lineOf(electronPointFromField(reading).at[1]), CARET.point.line);
  // The plan's own case, no frame read: never prepared, nothing clicked.
  const unread = field({value: VALUE});
  assert.deepEqual([(await runCase('point', unread)).prepare.value.ready, unread.state.clicks], [false, []]);
  for (const [shot, point] of [[[720, 560], [60, 103]], [[1440, 1120], [120, 206]]]) {
    const f = field({value: VALUE, shot});
    const {prepare, check} = await runCase('point', f, reading);
    assert.deepEqual(f.state.cursor, {word: 'alpha', selectionType: 'cursor_before'}, 'the caret at the value\'s start');
    assert.equal(prepare.value.ready, true, JSON.stringify(prepare));
    assert.deepEqual(f.state.clicks.at(-1), point, `scale ${shot[0] / 720}`);
    assert.equal(check.value.ok, true);
  }
  // A screenshot of another shape is not the fixture's window: nothing is sent.
  const odd = field({value: VALUE, shot: [800, 800]});
  const {prepare} = await runCase('point', odd, reading);
  assert.deepEqual([prepare.value.ready, prepare.value.reason], [false, 'the screenshot is not the fixture window\'s shape']);
  assert.deepEqual(odd.state.clicks, []);
});

// ---- the reading and its outcome ------------------------------------------------------------------------------------

test('the device\'s reading of the field: its range and whether the field has the focus, nothing else; an unread probe says so', () => {
  const answer = {pid: 9, windows: [{minimized: false, textArea: null}, {minimized: false, textArea: {selectedRange: {location: 20, length: 7}, scrollBars: {vertical: 0}}}],
    focused: {role: 'AXTextArea', textAreaOfWindow: 1}};
  assert.deepEqual(fieldRange(answer), {range: {location: 20, length: 7}, focused: true});
  assert.deepEqual(fieldRange({...answer, focused: {role: 'AXButton', textAreaOfWindow: null}}), {range: {location: 20, length: 7}, focused: false});
  assert.deepEqual(fieldRange({error: 'this bundle has no Accessibility grant'}), {error: 'this bundle has no Accessibility grant'});
  assert.match(fieldRange({windows: [{textArea: null}]}).error, /no text area/);
  assert.deepEqual(fieldRange({windows: [{textArea: {selectedRange: null}}], focused: {}}), {range: null, focused: false});
  assert.match(fieldRange(null).error, /no answer/);
});

test('line and column of an offset in the field\'s value (0-based); none outside it', () => {
  assert.deepEqual(lineColumn(FIELD_LINES, 0), {line: 0, column: 0});
  assert.deepEqual(lineColumn(FIELD_LINES, 25), {line: 2, column: 5});
  assert.deepEqual(lineColumn(FIELD_LINES, 9), {line: 0, column: 9}, 'the end of a line is on it');
  assert.deepEqual(lineColumn(FIELD_LINES, 10), {line: 1, column: 0});
  assert.deepEqual(lineColumn(FIELD_LINES, VALUE.length), {line: 7, column: FIELD_LINES[7].length});
  assert.equal(lineColumn(FIELD_LINES, VALUE.length + 1), null);
});

test('before the click the device must read what the prepare made, or the row says nothing', () => {
  assert.equal(caretPrepared(CARET.selection, {range: {location: 20, length: 7}, focused: true}), null);
  assert.match(caretPrepared(CARET.selection, {range: {location: 20, length: 0}, focused: true}), /read 20\+0 where the prepare made 20\+7/);
  assert.match(caretPrepared(CARET.point, {error: 'no answer'}), /could not be read before the click \(no answer\)/);
  assert.match(caretPrepared(CARET.point, {range: null, focused: true}), /could not be read before the click/);
  assert.equal(caretPrepared(CARET.point, {range: {location: 0, length: 0}, focused: false}), null, 'the focus is recorded, not required');
});

test('#258: a click that collapses the selection to a caret passes; one that keeps it fails; the reading is the outcome', () => {
  const at = location => ({range: {location, length: 0}, focused: true});
  assert.deepEqual(caretOutcome(CARET.selection, at(44)), {ok: true, outcome: {range: {location: 44, length: 0}, collapsed: true, kept: false, line: 3, column: 10}});
  assert.deepEqual(caretOutcome(CARET.selection, {range: {location: 20, length: 7}, focused: true}),
    {ok: false, outcome: {range: {location: 20, length: 7}, collapsed: false, kept: true, line: 2, column: 0}});
  assert.equal(caretOutcome(CARET.selection, {range: {location: 21, length: 3}, focused: true}).outcome.kept, false, 'another selection is not the one kept');
  assert.match(caretOutcome(CARET.selection, {error: 'the windows could not be read'}).invalid, /could not be read after the click \(the windows could not be read\)/);
  assert.match(caretOutcome(CARET.selection, {range: {location: 999, length: 0}, focused: true}).invalid, /outside the field's value/);
});

test('#259: the caret on the aimed line passes, whatever its column; a line low fails; a selection is no caret', () => {
  const at = (location, length = 0) => caretOutcome(CARET.point, {range: {location, length}, focused: true});
  assert.deepEqual(at(25), {ok: true, outcome: {range: {location: 25, length: 0}, collapsed: true, line: 2, column: 5, onTarget: true}});
  assert.equal(at(20).ok, true);
  assert.equal(at(33).ok, true, 'the line\'s end');
  assert.deepEqual(at(39).outcome, {range: {location: 39, length: 0}, collapsed: true, line: 3, column: 5, onTarget: false}, 'the 2026-11-01 miss');
  assert.equal(at(39).ok, false);
  assert.equal(at(0).ok, false, 'the caret left where the prepare put it');
  assert.equal(at(22, 3).ok, false);
});

// ---- the device command ---------------------------------------------------------------------------------------------

test('text-range: the run\'s scene read by the approved bundle\'s text-view probe, value-free, inside a device-clock window', async () => {
  const {main} = await import('../../scripts/native-matrix/matrix-device.mjs');
  const {writeState} = await import('../../scripts/repl-parity/scenes-mac.mjs');
  const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'matrix-caret-')));
  try {
    writeState(dir, {scenes: {electron: {pid: 12}}});
    const asked = [];
    const probe = args => { asked.push(args); return {pid: 12, windows: [{minimized: false, textArea: {selectedRange: {location: 3, length: 0}, scrollBars: {}}}], focused: {role: 'AXTextArea', textAreaOfWindow: 0}}; };
    const out = await main(['text-range', '--scene', 'electron', '--run', dir], {io: {probe}});
    assert.deepEqual(out.answer, {range: {location: 3, length: 0}, focused: true});
    assert.ok(out.at[0] <= out.at[1]);
    assert.deepEqual(asked, [['text-view', '--pid', '12']]);
    const failed = await main(['text-range', '--scene', 'electron', '--run', dir], {io: {probe: () => { throw new Error('the probe did not exit'); }}});
    assert.deepEqual(failed.answer, {error: 'the probe did not exit'});
    await assert.rejects(main(['text-range', '--scene', 'chrome', '--run', dir], {io: {probe}}), /--scene names no scene of the run that is up/);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

// ---- the run ----------------------------------------------------------------------------------------------------------

// The device's text-range answers steered by `answers` (a list, one per read, in order); the cells' default answers
// otherwise (a ready prepare, a check that passes).
// `asked` keeps every text-range command's arguments.
const ranged = (answers, asked = []) => ({matrix: (base, a) => {
  if (a[0] !== 'text-range') return base(a);
  asked.push(a);
  return {answer: answers.shift() ?? {error: 'no more answers'}, at: [1, 2]};
}});
const caretRows = result => Object.fromEntries(result.rows.filter(r => r.section === 'method' && isCaretRow(r.id)).map(r => [r.case, r]));
const reading = (location, length = 0) => ({range: {location, length}, focused: true});
const PLACED = {screenshotPoint: {x: 120, y: 168}, windowPoint: {x: 60, y: 84}, postedLocation: {x: 200, y: 184}};

test('a caret row: the device reads the range before and after the click, and the outcome carries the reading', async () => {
  const asked = [];
  const {result} = await runWith({plan: planOf('method', {scene: 'electron'}),
    ops: ranged([reading(20, 7), reading(44), reading(44), reading(0), reading(25), reading(25)], asked),
    cell: code => (code.includes(caseOf('point').act) ? {actMs: 1, at: [5, 6], threw: false, _meta: {'cua/inputRoute': 3, 'cua/coordinateClick': PLACED}}
      : code.includes(caseOf('selection').check) || code.includes(caseOf('point').check) ? {ok: true, outcome: {valueKept: true}} : null)});
  assert.deepEqual(validateCellResult(result), []);
  const rows = caretRows(result);
  assert.deepEqual(rows.selection.outcome, {valueKept: true, range: {location: 44, length: 0}, collapsed: true, kept: false, line: 3, column: 10});
  assert.equal(rows.selection.ok, true);
  assert.deepEqual(rows.selection.caret, {before: reading(20, 7), after: reading(44)});
  assert.deepEqual([rows.point.ok, rows.point.outcome.onTarget, rows.point.outcome.line], [true, true, 2]);
  // #259's coordinate click keeps its placement record (cua's engine reports it), for a difference to be diagnosed.
  assert.deepEqual([rows.point.inputRoute, rows.point.engineMeta.act.coordinateClick], [3, PLACED]);
  assert.deepEqual(asked.map(a => a.slice(0, 3)), Array(6).fill(['text-range', '--scene', 'electron']), 'one read before each click, and after it until two agree');
  // Only the frontmost regime runs them.
  assert.ok(!result.rows.some(r => /click\.(selection|point)@/.test(r.id)));
});

test('a caret row: a kept selection fails its own check; a range the prepare did not make, or one unread after, says nothing', async () => {
  const run = answers => runWith({plan: planOf('method', {scene: 'electron'}), ops: ranged(answers),
    cell: code => (code.includes(caseOf('selection').check) || code.includes(caseOf('point').check) ? {ok: true, outcome: {valueKept: true}} : null)});
  const kept = caretRows((await run([reading(20, 7), reading(20, 7), reading(20, 7), reading(0), reading(39), reading(39)])).result);
  assert.deepEqual([kept.selection.ok, kept.selection.invalid, kept.selection.outcome.kept], [false, undefined, true]);
  assert.deepEqual([kept.point.ok, kept.point.outcome.line], [false, 3]);
  const bad = caretRows((await run([reading(0, 0), {error: 'no text area'}])).result);
  assert.match(bad.selection.invalid, /^not prepared: the field's range read 0\+0 where the prepare made 20\+7/);
  assert.deepEqual([bad.selection.inCellMs, bad.selection.frontKey], [undefined, undefined], 'nothing was sent');
  assert.match(bad.point.invalid, /^not prepared: the field's range could not be read before the click \(no text area\)/);
  const after = caretRows((await run([reading(20, 7), {error: 'the probe did not exit'}, {error: 'the probe did not exit'}, reading(0), reading(25), reading(25)])).result);
  assert.match(after.selection.invalid, /could not be read after the click \(the probe did not exit\)/);
  assert.ok(after.selection.frontKey?.after, 'the act was sent: the row carries its readings');
});

test('the caret after the click is read until two reads agree, up to three 150 ms apart; one that never settles is unproven, never worse', async () => {
  const slept = [];
  const run = answers => runWith({plan: planOf('method', {scene: 'electron'}), ops: ranged(answers), slept,
    cell: code => (code.includes(caseOf('selection').check) || code.includes(caseOf('point').check) ? {ok: true, outcome: {valueKept: true}} : null)});
  // The selection's caret moves once after the click (Chromium's selection follows the DOM), then holds.
  const settled = caretRows((await run([reading(20, 7), reading(30), reading(44), reading(44), reading(0), reading(25), reading(25)])).result);
  assert.deepEqual([settled.selection.ok, settled.selection.caret.after], [true, reading(44)]);
  assert.ok(slept.filter(ms => ms === 150).length >= 3);
  const moving = caretRows((await run([reading(20, 7), reading(30), reading(40), reading(44), reading(0), reading(25), reading(25)])).result);
  assert.match(moving.selection.invalid, /the caret did not settle after the click/);
  assert.equal(moving.selection.ok, false);
  assert.equal(sampleCause(moving.selection).category, 'invalid', 'no verdict, never a difference');
});

// ---- the judge --------------------------------------------------------------------------------------------------------

const row = (engine, sample, ok, outcome) => ({section: 'method', id: SELECTION, engine, sample, ok, regime: 'frontmost', method: 'click', case: 'selection', outcome});
const caret = location => ({valueKept: true, range: {location, length: 0}, collapsed: true, kept: false, ...{line: 3, column: location - 34}});
const keptSel = {valueKept: true, range: {location: 20, length: 7}, collapsed: false, kept: true, line: 2, column: 0};

test('judged by its reading: two passes are equal only with the same reading; otherwise as a frontmost row against the vendor', () => {
  const judge = (vendor, cua) => judgeCell('reading', vendor, cua).verdict;
  assert.equal(judge([row('vendor', 1, true, caret(44))], [row('cua', 1, true, caret(44))]), 'equal');
  assert.equal(judge([row('vendor', 1, true, caret(44))], [row('cua', 1, true, caret(41))]), 'worse', 'the caret elsewhere on the line: typing lands elsewhere');
  assert.equal(judge([row('vendor', 1, true, caret(44))], [row('cua', 1, false, keptSel)]), 'worse', '#258 as registered');
  assert.equal(judge([row('vendor', 1, false, keptSel)], [row('cua', 1, false, keptSel)]), 'equal', 'the vendor keeping it too: equal to the vendor\'s');
  assert.equal(judge([row('vendor', 1, false, keptSel)], [row('cua', 1, true, caret(44))]), 'better');
  // A missing reading on either side is no verdict (ruling 1141), never a difference.
  assert.equal(judge([row('vendor', 1, true, {})], [row('cua', 1, true, {})]), 'no-verdict', 'no reading recorded is no proof either way');
  assert.equal(judge([row('vendor', 1, true, {})], [row('cua', 1, true, caret(44))]), 'no-verdict');
  assert.equal(judge([row('vendor', 1, true, caret(44))], [row('cua', 1, false, {valueKept: true})]), 'no-verdict');
  assert.deepEqual(judgeCell('reading', [row('vendor', 1, true, {})], [row('cua', 1, true, {})]).account.cua.noVerdict, {unread: 1});
  assert.equal(judge([], [row('cua', 1, true, caret(44))]), 'no-verdict', 'no vendor sample, no verdict (ruling 1116)');
  assert.equal(judge([row('vendor', 1, true, caret(44))], [{...row('cua', 1, true, caret(44)), invalid: 'x'}]), 'no-verdict');
  // The reference mode is unchanged: two passes are equal whatever they recorded.
  assert.equal(judgeCell('reference', [row('vendor', 1, true, caret(44))], [row('cua', 1, true, caret(41))]).verdict, 'equal');
});

test('neither caret row can be declared (the pre-flight\'s §6: a difference from the vendor is fixed, never declared)', () => {
  const entry = id => ({section: 'method', id, vendor: {answer: 'ok'}, cua: {answer: 'unconfirmed', errorName: 'clickUnconfirmed', sentence: 'The click could not be confirmed'},
    decision: 'Decision Log, 2026-11-23, a made-up entry'});
  for (const id of [SELECTION, POINT]) assert.ok(departureProblems([entry(id)]).some(p => /cannot be declared/.test(p)), id);
  assert.ok(!departureProblems([entry('electron/frontmost/click.button')]).some(p => /cannot be declared/.test(p)));
});
