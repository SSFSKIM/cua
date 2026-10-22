// The probe cells' rules (scripts/native-matrix/probe-plan.mjs; the spec's Verification system part 5): where a probe's
// post must fall for a sample to say anything (inside the action's interval, or before a receipt within the debounce),
// how the next attempt's call is placed from the last one's times, and what a probe's answer says about its post.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseCell} from '../../scripts/native-baseline/cells.mjs';
import {TEXT_FIELDS} from '../../scripts/native-matrix/plan.mjs';
import {EMPTY_HASH, emptyField, emptyFieldCell, fieldCheck, fieldCheckCell, intervalOf, nextPreMs, postValidity, probeProblem, receiptValidity, PROBE_LEAD_MS} from '../../scripts/native-matrix/probe-plan.mjs';
import {advanceNumbering, render} from '../../src/services/engine/render.mjs';

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
    assert.deepEqual(result?.value, {ready: true}, JSON.stringify(start));
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

test('Chrome and Electron prepare and read back exactly as before', () => {
  const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 16);
  assert.equal(TEXT_FIELDS.chrome, 'indexOfTarget(ax, "Scene notes")');
  assert.equal(TEXT_FIELDS.electron, 'indexOfTarget(ax, "Fixture text")');
  // The bodies' sources as of 38ecfa07, before the TextEdit locator changed.
  assert.deepEqual(['chrome', 'electron'].map(s => [sha(emptyField(s)), sha(fieldCheck(s, 'x')), sha(fieldCheck(s, null))]), [
    ['7ca74a0117f13c23', '41639a7e0fddf612', '5cf0e282ecc58ddc'],
    ['d1a0d9c29f49d7c6', '3495030f8aa3813c', 'bb2fde8b360fdc61'],
  ]);
});
