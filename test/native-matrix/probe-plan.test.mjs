// The probe cells' rules (scripts/native-matrix/probe-plan.mjs; the spec's Verification system part 5): where a probe's
// post must fall for a sample to say anything (inside the action's interval, or before a receipt within the debounce),
// how the next attempt's call is placed from the last one's times, and what a probe's answer says about its post.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync, rmdirSync} from 'node:fs';
import {basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCell} from '../../scripts/native-baseline/cells.mjs';
import {TEXT_FIELDS} from '../../scripts/native-matrix/plan.mjs';
import {EMPTY_HASH, emptyField, emptyFieldCell, fieldCheck, fieldCheckCell, intervalOf, nextPreMs, postValidity, probeProblem, receiptValidity, PROBE_LEAD_MS,
  SAVE_PANEL_CONTROLS, SAVE_SHEET_DESTINATION_CELL, controlIndexOf, savePanelReading, saveSheetDestinationCell} from '../../scripts/native-matrix/probe-plan.mjs';
import {advanceNumbering, render} from '../../src/services/engine/render.mjs';
import {node as axNode, skyshot as axSkyshot} from '../native-goldens/builder.mjs';

const act = (engine, meta = {}, value = {callAt: 1_000, endAt: 3_000}) => ({engine: {actionInterval: null, receivedAt: null, ...meta}, value});

test('the interval: cua\'s from the engine (cua/actionInterval), the vendor\'s from the cell around the call; none when nothing was posted', () => {
  assert.deepEqual(intervalOf('cua', act('cua', {actionInterval: {startedAt: 1_100, endedAt: 2_900}})), {from: 1_100, to: 2_900, source: 'engine'});
  assert.equal(intervalOf('cua', act('cua', {actionInterval: {startedAt: null, endedAt: null}})), null, 'a refusal before any post has no interval');
  assert.equal(intervalOf('cua', act('cua')), null);
  assert.deepEqual(intervalOf('vendor', act('vendor')), {from: 1_000, to: 3_000, source: 'cell'});
  assert.equal(intervalOf('vendor', act('vendor', {}, {})), null);
});

test('a post outside the interval, or no interval, makes the sample invalid, never a verdict', () => {
  const interval = {from: 1_000, to: 2_000, source: 'engine'};
  assert.equal(postValidity(1_000, interval), null);
  assert.equal(postValidity(2_000, interval), null);
  assert.match(postValidity(999, interval), /1 ms before the action's interval/);
  assert.match(postValidity(2_250, interval), /250 ms after the action's interval/);
  assert.match(postValidity(1_500, null), /no interval/);
  assert.match(postValidity(null, interval), /no post time/);
});

test('the pre-action refusal\'s receipt: after the post and within the debounce (cua\'s cua/receivedAt; the vendor\'s cell call time)', () => {
  assert.equal(receiptValidity({engine: 'cua', postedAt: 10_000, receivedAt: 10_150}), null);
  assert.equal(receiptValidity({engine: 'cua', postedAt: 10_000, receivedAt: 15_000}), null);
  assert.match(receiptValidity({engine: 'cua', postedAt: 10_000, receivedAt: 15_001}), /5001 ms after the post: past the 5000 ms debounce/);
  assert.match(receiptValidity({engine: 'cua', postedAt: 10_000, receivedAt: 9_990}), /before the post/);
  assert.match(receiptValidity({engine: 'cua', postedAt: 10_000, receivedAt: null}), /no cua\/receivedAt/);
  assert.equal(receiptValidity({engine: 'vendor', postedAt: 10_000, callAt: 10_200}), null);
  assert.match(receiptValidity({engine: 'vendor', postedAt: 10_000, callAt: 9_000}), /before the post/);
});

test('the next attempt\'s call lead: the post aimed at the middle of the interval the last attempt measured', () => {
  // The call left at 1_000 and the engine posted from 1_080 to 1_320 (Finder's 240 ms); the probe, scheduled at 1_400,
  // posted 3 ms late: aiming at 1_200, 200 ms after the call, means calling 200 - 3 ms before the scheduled time.
  assert.equal(nextPreMs({callAt: 1_000, interval: {from: 1_080, to: 1_320}, postedAt: 1_403, scheduled: 1_400}), 197);
  assert.equal(nextPreMs({callAt: 1_000, interval: {from: 900, to: 950}, postedAt: 1_400, scheduled: 1_400}), 0, 'never a call after the post\'s time');
  assert.equal(nextPreMs({callAt: 1_000, interval: {from: 1_000, to: 99_000}, postedAt: 1_400, scheduled: 1_400}), PROBE_LEAD_MS - 1_000, 'within the lead');
  assert.equal(nextPreMs({callAt: 1_000, interval: null, postedAt: 1_400, scheduled: 1_400, preMs: 300}), 300, 'nothing measured: the last lead kept');
});

test('a probe that did not post is named from its answer', () => {
  assert.equal(probeProblem({postedAt: 5, units: 2, chars: 2}), null);
  assert.match(probeProblem({postedAt: 5, units: 2, aborted: true}), /front window was not the named one/);
  assert.match(probeProblem({error: 'the front window is not the named one; nothing was sent'}), /did not post: the front window is not the named one/);
  assert.match(probeProblem(undefined), /no answer/);
  assert.equal(probeProblem({selected: true, selectedAt: 7}), null, 'a switch posts nothing and is timed by selectedAt');
  assert.match(probeProblem({selected: false, selectedAt: 7}), /not selected/);
});

// ---- the typing field's preparation (emptyField, shared by the probe cells and the Unicode matrix) -------------------

// A scene app double observed through cua's own renderer: TextEdit's golden Skyshot with its text view's value and
// focus as the double holds them, so the text the cell reads is the grammar the hold meets.
const textEditDouble = ({value, focused}) => {
  const skyshot = JSON.parse(readFileSync(fileURLToPath(new URL('../native-goldens/textedit/skyshot.json', import.meta.url)), 'utf8'));
  const area = skyshot.nodes.find(n => n.identifier === 'First Text View');
  const state = {value, focused, sets: []};
  const observe = () => {
    const s = structuredClone(skyshot), a = s.nodes.find(n => n.token === area.token);
    a.value = state.value; delete a.valueMarkdown; a.numberOfCharacters = state.value.length; a.flags.focused = state.focused;
    s.focused = state.focused ? area.token : null; s.selectedText = null;
    return render(s, advanceNumbering(null, s));
  };
  return {state, app: {getAXState: async () => observe(), setValue: async (index, v) => { state.sets.push(index); state.value = v; }, click: async () => { state.focused = true; }}};
};
const runPrepared = async (scene, app) => {
  globalThis.__apps = {[scene]: app};
  const output = [];
  try { await new (Object.getPrototypeOf(async () => {}).constructor)('nodeRepl', emptyFieldCell(scene))({write: t => output.push(t)}); }
  finally { delete globalThis.__apps; }
  return parseCell(output.join('\n'));
};

test('TextEdit: the text view stays findable once emptied (its identifier then prints as the line\'s lone, unlabelled part)', async () => {
  const empty = textEditDouble({value: '', focused: true}).app;
  assert.match(await empty.getAXState(), /^\t\t2 text entry area \(settable\) First Text View$/m, 'the renderer\'s lone-part rule');
  for (const start of [{value: 'cua scene document\nLine 01', focused: false}, {value: '', focused: false}, {value: '', focused: true}]) {
    const {state, app} = textEditDouble(start);
    const result = await runPrepared('textedit', app);
    assert.deepEqual(result?.value, start.value === '' ? {ready: true} : {ready: true, prepared: ['field emptied']}, JSON.stringify(start));
    assert.equal(state.value, '');
    assert.equal(state.focused, true);
    assert.deepEqual(state.sets, start.value === '' ? [] : [2]);
  }
  // The read-back finds it empty as well: the hash of '' and length 0, not "the field is not in the text".
  const {app} = textEditDouble({value: '', focused: true});
  globalThis.__apps = {textedit: app};
  const output = [];
  try { await new (Object.getPrototypeOf(async () => {}).constructor)('nodeRepl', fieldCheckCell('textedit', null))({write: t => output.push(t)}); }
  finally { delete globalThis.__apps; }
  assert.deepEqual(parseCell(output.join('\n'))?.value, {hash: EMPTY_HASH, length: 0});
});

test('Chrome and Electron prepare and read back as before, the preparation changed only by #188', () => {
  const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 16);
  assert.equal(TEXT_FIELDS.chrome, 'indexOfTarget(ax, "Scene notes")');
  assert.equal(TEXT_FIELDS.electron, 'indexOfTarget(ax, "Fixture text")');
  // The bodies' sources as of 38ecfa07, before the TextEdit locator changed; the preparation's since #188, which names
  // the emptying in its result and reports a trailer a selection masks as its own reason (the same calls, in the same
  // order).
  assert.deepEqual(['chrome', 'electron'].map(s => [sha(emptyField(s)), sha(fieldCheck(s, 'x')), sha(fieldCheck(s, null))]), [
    ['e8b238e9385f95ec', '41639a7e0fddf612', '5cf0e282ecc58ddc'],
    ['3c254c5f5131ca19', '3495030f8aa3813c', 'bb2fde8b360fdc61'],
  ]);
});

// ---- #212's save sheet: the destination cell against AX fixtures ----------------------------------------------------

// The controls as a pilot's reading would name them (the shipped SAVE_PANEL_CONTROLS are unread: observation only).
const CONTROLS = Object.freeze({panel: {id: 'fixture-save-panel', role: 'sheet'}, goTo: {id: 'fixture-go-to', role: 'sheet'},
  goToField: {id: 'fixture-go-to-field', role: 'text field'}, location: {id: 'fixture-location', role: 'pop up button'}});
// TextEdit's Save sheet as a double observed through cua's renderer: the name field, the location pop-up, a search
// field, the file list, the buttons, and the Go To dialog when it is up. `goTo` says what super+shift+g does: 'opens'
// (the dialog, its field focused), 'unfocused' (the dialog, the focus left on the name field) or 'list' (no dialog:
// a list row appears, the reviewer's counter-case); `typing` where typed text goes: 'focused' or 'search' (the
// reviewer's: into the search field, the name field still focused); `navigates` whether the dialog's Return moves the
// location (else the folder shows only as a list row). A Return anywhere but the Go To field saves the document.
const savePanelDouble = ({goTo = 'opens', typing = 'focused', navigates = true, duplicateField = false} = {}) => {
  const state = {dialog: false, focus: 'name', name: 'Untitled', search: '', path: '', location: 'Documents', rows: ['Notes.rtf'], keys: [], typed: [], saved: false};
  const nodes = () => [
    axNode('w', 0, 'AXWindow', {roleDescription: 'standard window', title: 'Untitled'}),
    axNode('p', 1, 'AXSheet', {roleDescription: 'sheet', identifier: 'fixture-save-panel'}),
    axNode('n', 2, 'AXTextField', {roleDescription: 'text field', identifier: 'saveAsNameTextField', value: state.name, flags: {settable: true, focused: state.focus === 'name'}}),
    axNode('l', 2, 'AXPopUpButton', {roleDescription: 'pop up button', identifier: 'fixture-location', value: state.location}),
    axNode('s', 2, 'AXTextField', {roleDescription: 'search field', identifier: 'fixture-search', placeholder: 'Search', value: state.search || null, flags: {settable: true}}),
    axNode('list', 2, 'AXList', {roleDescription: 'list'}),
    ...state.rows.map((title, i) => axNode(`r${i}`, 3, 'AXRow', {title})),
    axNode('save', 2, 'AXButton', {roleDescription: 'button', title: 'Save'}),
    axNode('cancel', 2, 'AXButton', {roleDescription: 'button', title: 'Cancel'}),
    ...(state.dialog ? [axNode('g', 2, 'AXSheet', {roleDescription: 'sheet', identifier: 'fixture-go-to'}),
      axNode('gf', 3, 'AXTextField', {roleDescription: 'text field', identifier: 'fixture-go-to-field', placeholder: 'Path', value: state.path || null, flags: {settable: true, focused: state.focus === 'goTo'}}),
      ...(duplicateField ? [axNode('gf2', 3, 'AXTextField', {roleDescription: 'text field', identifier: 'fixture-go-to-field', placeholder: 'Path'})] : [])] : []),
  ];
  const observe = () => {
    const s = axSkyshot(nodes(), {focused: state.focus === 'goTo' ? 'gf' : 'n'});
    return render(s, advanceNumbering(null, s));
  };
  const app = {
    getAXState: async () => observe(),
    pressKey: async key => {
      state.keys.push(key);
      if (key === 'super+shift+g') {
        if (goTo === 'list') state.rows.push('Recents');
        else { state.dialog = true; state.focus = goTo === 'opens' ? 'goTo' : 'name'; }
      } else if (key === 'Return') {
        if (state.focus === 'goTo') {
          if (navigates) state.location = basename(state.path); else state.rows.push(basename(state.path));
          state.dialog = false; state.focus = 'name';
        } else { state.saved = true; state.rows.push(basename(state.search || state.name)); }
      }
    },
    typeText: async text => {
      state.typed.push(text);
      if (typing === 'search') { state.search = text; state.rows.push(basename(text)); }
      else if (state.focus === 'goTo') state.path = text;
      else state.name = text;
    },
  };
  return {state, app, observe};
};
const runDestination = async (app, code) => {
  globalThis.__apps = {textedit: app};
  const output = [];
  try { await new (Object.getPrototypeOf(async () => {}).constructor)('nodeRepl', code)({write: t => output.push(t)}); }
  finally { delete globalThis.__apps; }
  const made = globalThis.__saveDir;
  delete globalThis.__saveDir; delete globalThis.__saveNameIndex;
  if (typeof made === 'string') rmdirSync(made);
  return {result: parseCell(output.join('\n')), made};
};

test('#212\'s save panel: each control is the one element with its identifier and role word, placed inside its parent; the location named by the pop-up, not a row', () => {
  const {state, observe} = savePanelDouble();
  state.dialog = true; state.focus = 'goTo'; state.path = '/tmp/x/cua-212-save-a';
  const ax = observe();
  const reading = savePanelReading(ax, CONTROLS);
  assert.deepEqual({fieldFocused: reading.fieldFocused, fieldValue: reading.fieldValue, locationName: reading.locationName}, {fieldFocused: true, fieldValue: '/tmp/x/cua-212-save-a', locationName: 'Documents'});
  assert.ok([reading.panel, reading.goTo, reading.field, reading.location].every(Number.isInteger), JSON.stringify(reading));
  assert.equal(controlIndexOf(ax, {id: 'fixture-go-to-field', role: 'search field'}), null, 'the role word must match');
  assert.equal(controlIndexOf(ax, {id: 'fixture-search', role: 'search field'}) !== null, true);
  assert.equal(controlIndexOf(ax, null), null);
  const twice = savePanelDouble({duplicateField: true});
  twice.state.dialog = true; twice.state.focus = 'goTo';
  assert.equal(savePanelReading(twice.observe(), CONTROLS).field, null, 'an identifier two elements carry identifies neither');
});

test('#212\'s destination cell: the Go To dialog and its focused field identified before typing and again before Return; the panel\'s location then names the run\'s folder', async () => {
  const {state, app} = savePanelDouble();
  const {result, made} = await runDestination(app, saveSheetDestinationCell(CONTROLS));
  assert.deepEqual(result?.value, {ready: true});
  assert.match(basename(made), /^cua-212-save-/);
  assert.deepEqual(state.keys, ['super+shift+g', 'Return']);
  assert.deepEqual(state.typed, [made]);
  assert.deepEqual([state.location, state.saved, state.name], [basename(made), false, 'Untitled']);
});

test('#212\'s destination cell fails closed, with no Return, when the Go To dialog or its focused field is not positively identified (the reviewer\'s counter-case among them)', async () => {
  const cases = [
    {label: 'the reviewer\'s: no dialog, a list row appears, the path typed into the search field, the name field focused', double: {goTo: 'list', typing: 'search'},
      reason: /Go To dialog and its focused path field were not identified/, typed: 0},
    {label: 'the dialog up, the focus left on the name field', double: {goTo: 'unfocused'}, reason: /Go To dialog and its focused path field were not identified/, typed: 0},
    {label: 'the dialog\'s field focused, but the typing landed elsewhere', double: {typing: 'search'}, reason: /path was not in the Go To dialog's focused field/, typed: 1},
    {label: 'an identifier two fields carry', double: {duplicateField: true}, reason: /Go To dialog and its focused path field were not identified/, typed: 0},
  ];
  for (const {label, double, reason, typed} of cases) {
    const {state, app} = savePanelDouble(double);
    const {result} = await runDestination(app, saveSheetDestinationCell(CONTROLS));
    assert.equal(result?.value?.ready, false, label);
    assert.match(result.value.reason, reason, label);
    assert.ok(!state.keys.includes('Return'), `${label}: no Return`);
    assert.equal(state.saved, false, label);
    assert.equal(state.typed.length, typed, label);
  }
  // The dialog's Return that leaves the folder only as a listing entry: the panel's location is what is read.
  const {state, app} = savePanelDouble({navigates: false});
  const {result, made} = await runDestination(app, saveSheetDestinationCell(CONTROLS));
  assert.deepEqual([result?.value?.ready, state.location, state.rows.includes(basename(made))], [false, 'Documents', true]);
  assert.match(result.value.reason, /panel's selected location is not the run's folder/);
});

test('#212\'s destination cell as shipped is observation only: the controls are unread, so it opens the Go To dialog, records the panel\'s structure, and types nothing', async () => {
  assert.deepEqual(SAVE_PANEL_CONTROLS, {panel: null, goTo: null, goToField: null, location: null});
  const {state, app} = savePanelDouble();
  const {result, made} = await runDestination(app, SAVE_SHEET_DESTINATION_CELL);
  assert.equal(made, undefined, 'no folder made');
  assert.equal(result?.value?.ready, false);
  assert.match(result.value.reason, /observation only/);
  assert.deepEqual([state.keys, state.typed, state.saved], [['super+shift+g'], [], false]);
  const {before, after} = result.value.observed;
  assert.equal(before.trailer, 'focused');
  assert.deepEqual(after.lines.filter(l => l.id).map(l => l.id), ['saveAsNameTextField', 'fixture-location', 'fixture-search', 'fixture-go-to-field']);
  const dialog = after.lines.find(l => l.head === 'sheet fixture-go-to'), field = after.lines.find(l => l.id === 'fixture-go-to-field');
  assert.deepEqual([field.focused, field.parent, field.head, dialog.parent], [true, dialog.index, 'text field', after.lines.find(l => l.head === 'sheet fixture-save-panel').index]);
  assert.ok(!JSON.stringify(result.value.observed).includes('Documents'), 'no value leaves the cell');
});
