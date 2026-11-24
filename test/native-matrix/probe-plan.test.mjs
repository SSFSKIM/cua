// The probe cells' rules (scripts/native-matrix/probe-plan.mjs; the spec's Verification system part 5): where a probe's
// post must fall for a sample to say anything (inside the action's interval, or before a receipt within the debounce),
// how the next attempt's call is placed from the last one's times, and what a probe's answer says about its post.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, readdirSync, realpathSync, rmdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCell} from '../../scripts/native-baseline/cells.mjs';
import {TEXT_FIELDS} from '../../scripts/native-matrix/plan.mjs';
import {EMPTY_HASH, emptyField, emptyFieldCell, fieldCheck, fieldCheckCell, intervalOf, nextPreMs, postValidity, probeProblem, receiptValidity, PROBE_LEAD_MS,
  SAVE_PANEL_CONTROLS, SAVE_SHEET_CANCEL_CELL, SAVE_SHEET_DESTINATION_CELL, controlIndexOf, savePanelReading, savePanelStructure, saveSheetDestinationCell, WITNESS_FILES, WITNESS_PREPARE_CELL, witnessCheckCell,
  KEYSTROKE_GATE_CLOSED, keystrokeGate} from '../../scripts/native-matrix/probe-plan.mjs';
import {rowIndexOfName, valueOfIndex, indexOfId} from '../../scripts/native-matrix/matrix-text.mjs';
import {advanceNumbering, NOTE, render} from '../../src/services/engine/render.mjs';
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

// Ruling 1204: "field emptied" only on a read-back that shows the field empty; an emptying that did not take is its own
// fact, never named emptied (pilot C-3: a setValue("") that returned and left the field's value).
test('an emptying the read-back shows did not take is recorded as attempted, with what the field still read; never as emptied', async () => {
  const {state, app} = textEditDouble({value: 'abc', focused: true});
  app.setValue = async index => { state.sets.push(index); };
  const result = await runPrepared('textedit', app);
  assert.deepEqual(result?.value, {ready: false, reason: 'the field could not be emptied', prepared: ['emptying attempted, the field still read 3 characters']});
  assert.deepEqual(state.sets, [2]);
});

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
  // Against an expected string, the read-back's hash is kept beside the verdict (ruling 1144: a shared failure is the
  // same read-back on both engines).
  const expected = [];
  globalThis.__apps = {textedit: textEditDouble({value: '', focused: true}).app};
  try { await new (Object.getPrototypeOf(async () => {}).constructor)('nodeRepl', fieldCheckCell('textedit', 'x'))({write: t => expected.push(t)}); }
  finally { delete globalThis.__apps; }
  assert.deepEqual(parseCell(expected.join('\n'))?.value, {ok: false, outcome: {exact: false, nfcEqual: false, length: 0, expectedLength: 1, hash: EMPTY_HASH}});
});

test('Chrome and Electron prepare and read back as before, the preparation changed only by #188', () => {
  const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 16);
  assert.equal(TEXT_FIELDS.chrome, 'indexOfTarget(ax, "Scene notes")');
  assert.equal(TEXT_FIELDS.electron, 'indexOfTarget(ax, "Fixture text")');
  // The bodies' sources as of 38ecfa07, before the TextEdit locator changed; the preparation's since #188, which names
  // the emptying in its result (since ruling 1204 only on a read-back that shows it, else the attempt) and reports a
  // trailer a selection masks as its own reason (the same calls, in the same order); the read-back against an expected
  // string's since ruling 1144, which keeps its hash in the outcome.
  assert.deepEqual(['chrome', 'electron'].map(s => [sha(emptyField(s)), sha(fieldCheck(s, 'x')), sha(fieldCheck(s, null))]), [
    ['735cf29f53d52925', 'ba26236b926131f5', '5cf0e282ecc58ddc'],
    ['70db33972a1a1611', 'f40c0db49b99d2af', 'bb2fde8b360fdc61'],
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
      } else if (key === 'Escape') {
        if (state.dialog) { state.dialog = false; state.focus = 'name'; }
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
// The success exit as every other (C-6): ready, the initial location, the Go To dialog's close record (nothing to close)
// and the last observation, the Save sheet's own with the dialog gone.
const assertReady = (value, goToField = {focusVia: 'focus', prefilled: {present: false, length: 0}}) => {
  const {lastObservation, ...rest} = value ?? {};
  assert.deepEqual(rest, {ready: true, initialWhere: 'Documents', goTo: {closed: true, sheetUp: true, escapes: 0, closeClicked: false}, goToField});
  assert.ok(lastObservation.count > 0 && lastObservation.lines.some(l => l.id === 'saveAsNameTextField'), JSON.stringify(lastObservation));
  assert.ok(!lastObservation.lines.some(l => /go-to-field|PathTextField/.test(`${l.id} ${l.head}`)), 'the dialog gone');
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
  assertReady(result?.value);
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
    // Ruling 1219 (s1): the Go To dialog closed inside the cell on its way out, the Save sheet still up.
    assert.equal(state.dialog, false, `${label}: the Go To dialog closed in the cell`);
    assert.deepEqual(result.value.goTo, {closed: true, sheetUp: true, escapes: state.keys.filter(k => k === 'Escape').length, closeClicked: false}, label);
  }
  // The dialog's Return that leaves the folder only as a listing entry: the panel's location is what is read.
  const {state, app} = savePanelDouble({navigates: false});
  const {result, made} = await runDestination(app, saveSheetDestinationCell(CONTROLS));
  assert.deepEqual([result?.value?.ready, state.location, state.rows.includes(basename(made))], [false, 'Documents', true]);
  assert.match(result.value.reason, /panel's selected location is not the run's folder/);
});

test('#212\'s destination cell with its controls unread is observation only: it opens the Go To dialog, records the panel\'s structure, and types nothing', async () => {
  const {state, app} = savePanelDouble();
  const {result, made} = await runDestination(app, saveSheetDestinationCell({panel: null, goTo: null, goToField: null, location: null}));
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

// ---- Acceptance 3's keystroke witness, against the Finder and TextEdit goldens ---------------------------------------

const witnessGolden = scene => readFileSync(fileURLToPath(new URL(`../native-goldens/${scene}/vendor.txt`, import.meta.url)), 'utf8');
// Finder's list with the named rows alone selected, its trailer as src/services/engine/render.mjs writes one.
const finderSelecting = (...names) => {
  const finder = witnessGolden('finder');
  if (!names.length) return finder;
  const tree = finder.split(/\n\n(?:The focused UI element is |Selected text: |Selected:\n)/)[0];
  return `${tree}\n\nSelected:\n${names.map(n => `\t${rowIndexOfName(finder, n)} row (selected)`).join('\n')}\n\n${NOTE}`;
};
// TextEdit's document as the golden holds it, or with `document` its value; `__m.before` its value before the click, as the
// click case's prepare keeps it.
const runWitness = async (code, {finder, document}) => {
  const doc = witnessGolden('textedit'), original = String(valueOfIndex(doc, indexOfId(doc, 'First Text View')));
  globalThis.__apps = {finder: {getAXState: async () => finder}, textedit: {getAXState: async () => (document === undefined ? doc : doc.replace(original, document))}};
  globalThis.__m = {before: original.replace(/\*\*/g, '')};
  const output = [];
  try { await new (Object.getPrototypeOf(async () => {}).constructor)('nodeRepl', code)({write: t => output.push(t)}); }
  finally { delete globalThis.__apps; delete globalThis.__m; }
  return parseCell(output.join('\n'))?.value;
};

test('the keystroke witness types a file the selection must move to, and reads Finder\'s selection and TextEdit\'s document back as booleans', async () => {
  assert.deepEqual(await runWitness(WITNESS_PREPARE_CELL, {finder: finderSelecting()}), {target: WITNESS_FILES[0]});
  assert.deepEqual(await runWitness(WITNESS_PREPARE_CELL, {finder: finderSelecting(WITNESS_FILES[0])}), {target: WITNESS_FILES[1]}, 'already selected: the other file');
  const check = witnessCheckCell(WITNESS_FILES[0]);
  assert.deepEqual(await runWitness(check, {finder: finderSelecting(WITNESS_FILES[0])}), {finderSelected: true, documentUnchanged: true});
  assert.deepEqual(await runWitness(check, {finder: finderSelecting()}), {finderSelected: false, documentUnchanged: true}, 'the keys did not reach Finder');
  assert.deepEqual(await runWitness(check, {finder: finderSelecting(WITNESS_FILES[0], WITNESS_FILES[1])}), {finderSelected: false, documentUnchanged: true}, 'the file alone');
  assert.deepEqual(await runWitness(check, {finder: finderSelecting(WITNESS_FILES[0]), document: 'cua scene document scene-file-007'}), {finderSelected: true, documentUnchanged: false},
    'the keys reached the document');
});

test('a keystroke probe\'s gate, as KeystrokeProbe.swift answers it: at its first gate or between its keys; anything else is no gate', () => {
  const swift = readFileSync(fileURLToPath(new URL('../../native/engine/Sources/Engine/KeystrokeProbe.swift', import.meta.url)), 'utf8');
  assert.ok(swift.includes(`["error": "${KEYSTROKE_GATE_CLOSED}"]`), 'the first gate\'s answer, word for word');
  assert.match(swift, /"aborted": true/);
  assert.equal(keystrokeGate({error: KEYSTROKE_GATE_CLOSED}).at, 'first');
  assert.equal(keystrokeGate({postedAt: 1, aborted: true, units: 3}).at, 'during');
  for (const answer of [{postedAt: 1, units: 3}, {error: 'a key event could not be created'}, null, undefined]) assert.equal(keystrokeGate(answer), null, JSON.stringify(answer));
});

// TextEdit's Save sheet as C-5 observed it on both lanes (save-sheet/{cua,vendor}/run-1 rows[0].outcome.observed): the
// observation's root is the sheet itself; with the Go To dialog up the observation shows the dialog alone (GoToWindow,
// its PathTextField focused), the Save sheet absent from it. `closes`: whether Escape closes the dialog; `closeButton`:
// whether a click on its CloseButton does. Escape with no dialog up cancels the Save sheet.
const realSavePanel = ({closes = true, navigates = true, closeButton = true, remembered = null, menu = false, replaces = true} = {}) => {
  const state = {dialog: false, sheet: true, name: 'Untitled', path: '', location: 'Documents', keys: [], typed: [], clicks: [], saved: false, selected: false};
  const nodes = () => (state.dialog ? [
    axNode('g', 0, 'AXSheet', {roleDescription: 'sheet', identifier: 'GoToWindow', description: 'Go to Folder'}),
    axNode('gt', 1, 'AXStaticText', {roleDescription: 'text', value: 'Go to Folder'}),
    axNode('gc', 1, 'AXButton', {roleDescription: 'button', identifier: 'CloseButton', flags: {focusable: true}}),
    axNode('gf', 1, 'AXTextField', {roleDescription: 'text field', identifier: 'PathTextField', value: state.path || null, flags: {settable: true, focusable: true}}),
  ] : !state.sheet ? [axNode('d', 0, 'AXTextArea', {roleDescription: 'text entry area', value: 'typed'})] : [
    axNode('p', 0, 'AXSheet', {roleDescription: 'sheet', identifier: 'save-panel'}),
    axNode('wp', 1, 'AXPopUpButton', {roleDescription: 'pop up button', title: 'Where:', identifier: 'where popup', value: state.location}),
    axNode('n', 1, 'AXTextField', {roleDescription: 'text field', identifier: 'saveAsNameTextField', value: state.name, flags: {settable: true}}),
    axNode('cancel', 1, 'AXButton', {roleDescription: 'button', title: 'Cancel', identifier: 'CancelButton'}),
    axNode('save', 1, 'AXButton', {roleDescription: 'button', title: 'Save', identifier: 'OKButton'}),
  ]);
  // C-7's observation also carried TextEdit's menu bar, a root of its own beside the dialog.
  const menuBar = menu ? [axNode('mb', 0, 'AXMenuBar', {roleDescription: 'menu bar'}),
    ...['TextEdit', 'File', 'Edit', 'Format', 'View', 'Window', 'Help'].map((title, i) => axNode(`mi${i}`, 1, 'AXMenuBarItem', {roleDescription: 'menu bar item', title}))] : [];
  const observe = () => {
    const s = axSkyshot(nodes(), {focused: state.dialog ? 'gf' : 'n', menuBar, ...(state.dialog && state.selected && state.path ? {selectedText: state.path} : {})});
    return render(s, advanceNumbering(null, s));
  };
  const app = {
    getAXState: async () => observe(),
    pressKey: async key => {
      state.keys.push(key);
      if (key === 'super+shift+g') { state.dialog = true; if (remembered) { state.path = remembered; state.selected = true; } }
      else if (key === 'Escape') { if (state.dialog) { if (closes) state.dialog = false; } else state.sheet = false; }
      else if (key === 'Return') { if (state.dialog) { if (navigates) state.location = basename(state.path); state.dialog = false; } else state.saved = true; }
    },
    // Typing replaces a selection, as a text field does (`replaces` false: appended after it, which must fail closed).
    typeText: async text => { state.typed.push(text); if (state.dialog) { state.path = state.selected && !replaces ? state.path + text : text; state.selected = false; } else state.name = text; },
    click: async index => { state.clicks.push(index); if (state.dialog && closeButton && index === controlIndexOf(observe(), {id: 'CloseButton', role: 'button'})) state.dialog = false; },
  };
  return {state, app, observe};
};
const C5_CONTROLS = Object.freeze({panel: {id: 'save-panel', role: 'sheet'}, goTo: {id: 'GoToWindow', role: 'sheet'},
  goToField: {id: 'PathTextField', role: 'text field'}, location: {id: 'where popup', role: 'pop up button'}});

test('#212\'s destination on the Save sheet as C-5 saw it: the Go To dialog shown apart, its path field the only Return\'s, the location read back', async () => {
  const {state, app} = realSavePanel();
  const {result, made} = await runDestination(app, saveSheetDestinationCell(C5_CONTROLS));
  assertReady(result?.value);
  assert.deepEqual(state.keys, ['super+shift+g', 'Return'], 'the one Return, into the Go To field');
  assert.deepEqual([state.location, state.saved, state.name, state.typed], [basename(made), false, 'Untitled', [made]]);
});

// C-7 (ruling 1226): cua's row failed "field not focused within 3 s". The vendor's lane, run first, typed its folder into
// Go To, which macOS remembers: cua's dialog opened with that path in the field, selected, and the trailer showed the
// selection in place of the focused element, so no line read focused. Under a selection the field counts as focused
// only when the Go To dialog is a root of the observation, its path field its only text field; typing then replaces
// the selection, and the exact-path check before the Return is unchanged. Whether it opened pre-filled is recorded by
// its length alone, never its text.
const C7_REMEMBERED = '/private/var/folders/zz/T/cua-212-save-vendor';
test('#212\'s Go To field under the selection of a remembered path (C-7) reads focused through the selection, and the destination reaches ready', async () => {
  const {state, app, observe} = realSavePanel({remembered: C7_REMEMBERED, menu: true});
  state.dialog = true; state.path = C7_REMEMBERED; state.selected = true;
  const ax = observe();
  // C-7's cua observation: GoToWindow, CloseButton, PathTextField and the menu bar, the trailer a selection, no line focused.
  const structure = savePanelStructure(ax);
  assert.equal(structure.trailer, 'selectedText');
  // (C-7 kept the structure, not the text: the dialog's root and its path field by their IDs, the CloseButton beside it.)
  assert.deepEqual(structure.lines.filter(l => l.id).map(l => [l.id, l.head, l.parent]), [['GoToWindow', 'sheet', null], ['PathTextField', 'text field', 0]]);
  assert.ok(structure.lines.some(l => l.parent === 0 && /CloseButton/.test(`${l.id} ${l.head}`)));
  assert.ok(structure.lines.some(l => l.head === 'menu bar' && l.parent === null) && !structure.lines.some(l => l.focused));
  const reading = savePanelReading(ax, C5_CONTROLS);
  assert.deepEqual([reading.fieldFocused, reading.focusVia], [true, 'selection']);
  state.dialog = false; state.selected = false; state.path = '';
  const {result, made} = await runDestination(app, saveSheetDestinationCell(C5_CONTROLS));
  assertReady(result?.value, {focusVia: 'selection', prefilled: {present: true, length: C7_REMEMBERED.length}});
  assert.ok(!JSON.stringify(result.value).includes(C7_REMEMBERED), 'the remembered path never leaves the cell');
  assert.deepEqual([state.keys, state.typed, state.location, state.saved], [['super+shift+g', 'Return'], [made], basename(made), false]);
  // Typing that does not replace the selection leaves the field holding more than the path: no Return, as before.
  const appended = realSavePanel({remembered: C7_REMEMBERED, replaces: false});
  const kept = await runDestination(appended.app, saveSheetDestinationCell(C5_CONTROLS));
  assert.equal(kept.result.value.reason, 'the path was not in the Go To dialog\'s focused field alone');
  assert.ok(!appended.state.keys.includes('Return'));
});

test('#212\'s Go To field under a selection is not focused unless the dialog is a root and the path field its only text field', () => {
  const {state, observe} = realSavePanel();
  // The Save sheet itself (another root) with a selection: its name field is never read as the Go To field.
  state.dialog = false;
  const sheetAx = observe().replace(/\n\nThe focused UI element is [\s\S]*$/, '\n\nSelected text: ```\nUntitled\n```\n');
  assert.deepEqual([savePanelReading(sheetAx, C5_CONTROLS).fieldFocused, savePanelReading(sheetAx, C5_CONTROLS).focusVia], [false, null]);
  // The Go To dialog inside the save panel (not a root): a selection says nothing of its field's focus.
  const nested = savePanelDouble();
  nested.state.dialog = true; nested.state.focus = 'name';
  const nestedAx = nested.observe().replace(/\n\nThe focused UI element is [\s\S]*$/, '\n\nSelected text: ```\nx\n```\n');
  const inside = savePanelReading(nestedAx, CONTROLS);
  assert.ok(inside.field !== null, 'the field identified');
  assert.deepEqual([inside.fieldFocused, inside.focusVia], [false, null]);
  // The dialog a root but holding a second text field: which one the selection is in is unknown.
  const two = realSavePanel({remembered: C7_REMEMBERED});
  two.state.dialog = true; two.state.path = C7_REMEMBERED; two.state.selected = true;
  const twoAx = two.observe().replace(/(\n\t+\d+ text field[^\n]*ID: PathTextField[^\n]*)/, '$1\n\t99 text field Other');
  assert.deepEqual([savePanelReading(twoAx, C5_CONTROLS).fieldFocused, savePanelReading(twoAx, C5_CONTROLS).focusVia], [false, null]);
});

// Ruling 1219 (s1) and ruling 1220's first condition: every exit after super+shift+g closes the Go To dialog inside the
// cell (Escape while it is up, the Save sheet left up), and one that would not close is said on the result.
test('#212\'s destination cell closes the Go To dialog on every exit after super+shift+g, and says when it would not', async () => {
  const noFolder = {...C5_CONTROLS, location: {id: 'where popup', role: 'pop up button'}};
  const {state, app} = realSavePanel({navigates: false});
  const {result} = await runDestination(app, saveSheetDestinationCell(noFolder));
  assert.match(result.value.reason, /panel's selected location is not the run's folder/);
  assert.deepEqual([state.dialog, state.saved], [false, false]);
  // The dialog's field never identified (its role word not the one read): out at once, the dialog closed with Escape.
  const unread = realSavePanel();
  const missed = await runDestination(unread.app, saveSheetDestinationCell({...C5_CONTROLS, goToField: {id: 'PathTextField', role: 'search field'}}));
  assert.match(missed.result.value.reason, /Go To dialog and its focused path field were not identified/);
  assert.deepEqual([unread.state.dialog, unread.state.keys, missed.result.value.goTo], [false, ['super+shift+g', 'Escape'], {closed: true, sheetUp: true, escapes: 1, closeClicked: false}]);
  // Ruling 1221 (F1): Escape that does not close it, three presses, then the dialog's CloseButton, in the same cell.
  const unescaped = realSavePanel({closes: false});
  const clicked = await runDestination(unescaped.app, saveSheetDestinationCell({...C5_CONTROLS, goToField: {id: 'PathTextField', role: 'search field'}}));
  assert.deepEqual(clicked.result.value.goTo, {closed: true, sheetUp: true, escapes: 3, closeClicked: true});
  assert.deepEqual([unescaped.state.dialog, unescaped.state.sheet, unescaped.state.clicks.length], [false, true, 1]);
  // Neither closes it (fix wave I7): the Save sheet's own cancel is not reachable while the dialog holds the focus (a
  // sheet on the Save sheet takes its keys and clicks, and the observation shows the dialog alone), so it is said, not
  // tried; whether the Save sheet is still up is unknown (null) while only the dialog is seen. Never a Return.
  const stuck = realSavePanel({closes: false, closeButton: false});
  const left = await runDestination(stuck.app, saveSheetDestinationCell({...C5_CONTROLS, goToField: {id: 'PathTextField', role: 'search field'}}));
  assert.deepEqual(left.result.value.goTo, {closed: false, sheetUp: null, escapes: 3, closeClicked: true, sheetCancel: 'unreachable'});
  assert.deepEqual(stuck.state.keys.filter(k => k === 'Escape').length, 3, 'the dialog\'s three, no more');
  assert.ok(!stuck.state.keys.includes('Return'));
  // The observation-only form (controls unread) closes it too.
  const seen = realSavePanel();
  const observed = await runDestination(seen.app, saveSheetDestinationCell({panel: null, goTo: null, goToField: null, location: null}));
  assert.match(observed.result.value.reason, /observation only/);
  assert.deepEqual([seen.state.dialog, observed.result.value.goTo], [false, {closed: true, sheetUp: true, escapes: 1, closeClicked: false}]);
});

// C-6: cua's row failed "the Go To dialog and its focused path field were not identified" with nothing kept to say which
// control did not match. That exit names the part of the reading that failed and keeps the observation it failed on,
// taken before the dialog is closed; every other exit keeps its last observation too, one before super+shift+g included.
test('#212\'s destination cell says which part of the Go To reading failed, and every exit keeps its last observation', async () => {
  const parts = [
    {label: 'no dialog, a list row instead', run: () => savePanelDouble({goTo: 'list'}), controls: CONTROLS, part: 'goTo not found'},
    {label: 'an identifier two fields carry', run: () => savePanelDouble({duplicateField: true}), controls: CONTROLS, part: 'field not found', shows: 'fixture-go-to-field'},
    {label: 'the field\'s role word not the one read', run: () => realSavePanel(), controls: {...C5_CONTROLS, goToField: {id: 'PathTextField', role: 'search field'}}, part: 'field not found', shows: 'PathTextField'},
    {label: 'the dialog up, the focus left on the name field', run: () => savePanelDouble({goTo: 'unfocused'}), controls: CONTROLS, part: 'field not focused within 3 s', shows: 'fixture-go-to-field'},
  ];
  for (const {label, run, controls, part, shows} of parts) {
    const {app} = run();
    const {result} = await runDestination(app, saveSheetDestinationCell(controls));
    assert.equal(result.value.identification, part, label);
    assert.equal(result.value.reason, `the Go To dialog and its focused path field were not identified (${part})`, label);
    assert.ok(result.value.lastObservation.count > 0, label);
    if (shows) assert.ok(result.value.lastObservation.lines.some(l => l.id === shows || l.head.endsWith(` ${shows}`)), `${label}: the observation the reading failed on, the dialog up`);
  }
  // A failure after the dialog closed keeps the observation it was judged on.
  const {app} = realSavePanel({navigates: false});
  const {result} = await runDestination(app, saveSheetDestinationCell(C5_CONTROLS));
  assert.match(result.value.reason, /panel's selected location is not the run's folder/);
  assert.equal(result.value.identification, undefined);
  assert.ok(result.value.lastObservation.lines.some(l => l.id === 'where popup'));
  // Before super+shift+g: the Save sheet not up. No key is sent; the close record says there was nothing to close.
  const gone = realSavePanel();
  gone.state.sheet = false;
  const early = await runDestination(gone.app, saveSheetDestinationCell(C5_CONTROLS));
  assert.equal(early.result.value.reason, 'the Save sheet was not up');
  assert.deepEqual([gone.state.keys, early.result.value.goTo], [[], {closed: true, sheetUp: false, escapes: 0, closeClicked: false}]);
  assert.ok(early.result.value.lastObservation.count > 0);
});

// The cancel's temp-folder result (C-6): the run's folder's entries as the cancel found them, then removed only empty, so
// an exit that never reached the act's check still says whether anything landed in it.
test('#212\'s cancel says what the run\'s folder held before removing it empty', async () => {
  for (const files of [[], ['cua-212-intended.rtf']]) {
    const dir = mkdtempSync(join(realpathSync(tmpdir()), 'cua-212-cancel-'));
    for (const f of files) writeFileSync(join(dir, f), '');
    const {state, app} = realSavePanel();
    globalThis.__apps = {textedit: app};
    globalThis.__saveDir = dir;
    const output = [];
    try { await new (Object.getPrototypeOf(async () => {}).constructor)('nodeRepl', SAVE_SHEET_CANCEL_CELL)({write: t => output.push(t)}); }
    finally { delete globalThis.__apps; delete globalThis.__saveDir; rmSync(dir, {recursive: true, force: true}); }
    assert.deepEqual(parseCell(output.join('\n'))?.value, {cancelled: true, destinationRemoved: files.length === 0, destinationFiles: files});
    assert.equal(state.sheet, false);
  }
});

// Fix wave I4: a throw after super+shift+g (typeText answering typeUnconfirmed, a key or an observation throwing) ends
// through the same close as every other exit: the dialog closed in the cell, the throw said on the result, no Return.
test('#212\'s destination cell closes the Go To dialog when a step after super+shift+g throws, and says the throw', async () => {
  const thrown = realSavePanel();
  thrown.app.typeText = async text => { thrown.state.typed.push(text); const error = new Error('the typed text did not read back'); error.name = 'typeUnconfirmed'; throw error; };
  const {result} = await runDestination(thrown.app, saveSheetDestinationCell(C5_CONTROLS));
  assert.equal(result.value.ready, false);
  assert.equal(result.value.reason, 'the cell threw after super+shift+g: typeUnconfirmed');
  assert.deepEqual(result.value.threw, {name: 'typeUnconfirmed', message: 'the typed text did not read back'});
  assert.deepEqual(result.value.goTo, {closed: true, sheetUp: true, escapes: 1, closeClicked: false});
  assert.deepEqual([thrown.state.dialog, thrown.state.saved], [false, false]);
  assert.ok(!thrown.state.keys.includes('Return'));
  // The observation-only form too.
  const seen = realSavePanel();
  const press = seen.app.pressKey;
  seen.app.pressKey = async key => { await press(key); if (key === 'super+shift+g') throw new Error('the key was not confirmed'); };
  const observed = await runDestination(seen.app, saveSheetDestinationCell({panel: null, goTo: null, goToField: null, location: null}));
  assert.equal(observed.result.value.reason, 'the cell threw after super+shift+g: Error');
  assert.deepEqual([seen.state.dialog, observed.result.value.goTo.closed], [false, true]);
});

// Ruling 1220 (s4): the controls as C-5 read them, identical on both lanes, are the shipped ones, so C-6 runs #212's
// destination path; on the Save sheet as C-5 saw it the shipped cell sets the run's folder with the Go To field's Return
// alone.
test('#212\'s shipped controls are C-5\'s reading, and the shipped cell sets the destination on the Save sheet as C-5 saw it', async () => {
  assert.deepEqual(SAVE_PANEL_CONTROLS, C5_CONTROLS);
  const {state, app} = realSavePanel();
  const {result, made} = await runDestination(app, SAVE_SHEET_DESTINATION_CELL);
  assertReady(result?.value);
  assert.deepEqual([state.keys, state.saved, state.location], [['super+shift+g', 'Return'], false, basename(made)]);
});
