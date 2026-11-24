// #526: cua prints a value's line breaks escaped on the element's one line, the vendor raw. The scenes' cells that read a
// multi-line value back (#187's field check, #188's click prepare, TextEdit's document cells) run here for real, their
// own code, against a field holding a real multi-line value as each lane prints it, with the run's bind recording the
// lane (globalThis.__axRendering): each reads the same value on both lanes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MARKER} from '../../scripts/native-baseline/cells.mjs';
import {CLICK_CONTROL} from '../../scripts/cursor-sitting/cells.mjs';
import {CHECK} from '../../scripts/cursor-sitting/item-187.mjs';
import {CLICK_PREPARE, CLICK_VALUE, CLICK_WORD} from '../../scripts/cursor-sitting/item-188.mjs';
import {caseCells} from '../../scripts/native-matrix/matrix-cells.mjs';
import {CASES} from '../../scripts/native-matrix/plan.mjs';
import {UNICODE_STRINGS} from '../../scripts/native-matrix/unicode-plan.mjs';
import {textEditDocument} from '../../scripts/repl-parity/scenes-mac.mjs';
import {escapeLineBreaks, NOTE} from '../../src/services/engine/render.mjs';

// A field app as the cells drive it: its value and selection, printed as `lane` prints a value.
function field({lane, title, line, value, after = '', app = 'A'}) {
  const state = {value, selected: null};
  const shown = v => (lane === 'cua' ? escapeLineBreaks(v) : v);
  return {
    getAXState: async () => `Window: "${title}", App: ${app}.\n0 standard window ${title}\n\t1 ${line}, Value: ${shown(state.value)}${after}\n\n`
      + (state.selected ? `Selected text: \`\`\`\n${state.selected}\n\`\`\`\n\n${NOTE}` : `The focused UI element is 1 ${line}`),
    setValue: async (index, v) => { state.value = v; }, selectText: async (index, word) => { state.selected = word; },
    click: async () => {}, getScreenshot: async () => null, state,
  };
}
// A cell's own code run for real, as the REPL runs it. -> its result.
async function run(code, {apps, lane, m}) {
  const writes = [], saved = {apps: globalThis.__apps, lane: globalThis.__axRendering, repl: globalThis.nodeRepl, m: globalThis.__m};
  Object.assign(globalThis, {__apps: apps, __axRendering: lane, nodeRepl: {write: text => { writes.push(String(text)); }}}, m === undefined ? {} : {__m: m});
  try { await new (async () => {}).constructor(code)(); } finally {
    // The case's state (`__m`) stays the REPL's across a case's cells.
    Object.assign(globalThis, {__apps: saved.apps, __axRendering: saved.lane, nodeRepl: saved.repl}, m === undefined ? {} : {__m: saved.m});
  }
  return JSON.parse(writes.flatMap(w => w.split('\n')).find(l => l.startsWith(MARKER)).slice(MARKER.length));
}
const LANES = ['vendor', 'cua'];

// Ruling 1185: on cua's lane a final Value part at a real part boundary is decoded in any app, so the live paths that
// write multi-line values (#187's two-line Unicode case, #188's eight lines) read them back on both lanes.
test('#187: the field check reads the two-line Unicode case back exactly on both lanes', async () => {
  const lines = UNICODE_STRINGS.find(s => s.text.includes('\n'));
  for (const lane of LANES) {
    const chrome = field({lane, title: 'cua scene page', line: 'text entry area (settable) Scene notes', value: lines.text});
    const r = await run(CHECK('chrome', lines.text), {apps: {chrome}, lane});
    assert.deepEqual([r.ok, r.value.ok, r.value.outcome.exact], [true, true, true], lane);
  }
});

test('#188: the click prepare writes its eight lines, reads them back and selects its word on both lanes', async () => {
  assert.equal(CLICK_VALUE.split('\n').length, 8);
  for (const lane of LANES) {
    const electron = field({lane, title: 'cua Electron fixture', line: 'text entry area (settable) Fixture text', value: ''});
    const r = await run(CLICK_PREPARE.i, {apps: {electron}, lane});
    assert.deepEqual([r.ok, r.value], [true, {ready: true}], `${lane}: ${JSON.stringify(r)}`);
    assert.equal(electron.state.selected, CLICK_WORD);
  }
});

test('TextEdit: the document cells read the multi-line document on both lanes (its first line, a write of it whole)', async () => {
  const DOC = textEditDocument().lines, value = DOC.join('\n');
  const line = 'text entry area (settable) ID: First Text View';
  const set = caseCells('textedit', CASES.textedit.find(c => c.method === 'setValue' && c.case === 'document'));
  const tree = caseCells('textedit', CASES.textedit.find(c => c.method === 'getAXState'));
  for (const lane of LANES) {
    const textedit = field({lane, title: 'cua-scene', line, value, app: 'TextEdit'});
    const seen = await run(tree.prepare, {apps: {textedit}, lane});
    assert.equal(seen.value.ready, true);
    await run(tree.act, {apps: {textedit}, lane});
    const read = await run(tree.check, {apps: {textedit}, lane});
    assert.deepEqual([read.ok, read.value?.ok], [true, true], `${lane}: the document's first line: ${JSON.stringify(read)}`);
    const prepared = await run(set.prepare, {apps: {textedit}, lane});
    assert.equal(prepared.value.ready, true, `${lane}: ${JSON.stringify(prepared)}`);
    await run(set.act, {apps: {textedit}, lane});
    const written = await run(set.check, {apps: {textedit}, lane});
    assert.deepEqual([written.ok, written.value.ok], [true, true], `${lane}: the document written whole reads back equal`);
    delete globalThis.__m;
  }
});

// Ruling 1182 (a): the reader errs only toward a false FAIL. A multi-line value with another part after it on its line
// reads as main reads it, so a check comparing it fails; it never passes.
test('#526 ruling 1182: a multi-line value followed by another part fails the field check on both lanes, never passes', async () => {
  const lines = UNICODE_STRINGS.find(s => s.text.includes('\n'));
  for (const lane of LANES) {
    const chrome = field({lane, title: 'cua scene page', line: 'text entry area (settable) Scene notes', value: lines.text, after: ', Details: d'});
    const r = await run(CHECK('chrome', lines.text), {apps: {chrome}, lane});
    assert.deepEqual([r.ok, r.value.ok, r.value.outcome.exact], [true, false, false], lane);
  }
});

// Ruling 1183, one rule: match only at a real part start, decode only a real final Value part, and on cua's lane a
// Value part holding an escape the reader did not decode fails an exact check, never a prefix. Through the real cells.
const scenePage = lines => ({getAXState: async () => `Window: "cua scene page", App: Chrome.\n0 standard window cua scene page\n${lines.map(l => `\t${l}`).join('\n')}\n`,
  click: async index => { scenePage.clicked = index; }, setValue: async () => {}});
test('#526 ruling 1183: #187\'s field check never passes on a prefix or on another part\'s continuation (cua\'s lane)', async () => {
  // P1-2: the field holds "ok, extra" then a break then "next"; a check expecting "ok" fails.
  const ok = field({lane: 'cua', title: 'cua scene page', line: 'text entry area (settable) Scene notes', value: 'ok, extra\nnext'});
  const prefix = await run(CHECK('chrome', 'ok'), {apps: {chrome: ok}, lane: 'cua'});
  assert.deepEqual([prefix.ok, prefix.value.ok, prefix.value.outcome.exact], [true, false, false]);
  // P2-4: an empty field (no Value part) whose Help continues with "Expected Value: one" and a break: raw, fails.
  const help = scenePage([`1 text entry area (settable) Scene notes, Help: Type here${escapeLineBreaks('\nExpected Value: one\ntwo')}`]);
  const continued = await run(CHECK('chrome', 'one\ntwo'), {apps: {chrome: help}, lane: 'cua'});
  assert.deepEqual([continued.ok, continued.value.ok, continued.value.outcome.exact], [true, false, false]);
});

test('#526 ruling 1183: a target is matched only at a real part start of an element\'s first line (cua\'s lane), through the control click', async () => {
  // P2-3: an earlier button whose two-line title's second line ends with the target does not win over the real control.
  const page = scenePage([`1 button old${escapeLineBreaks('\nUse Scene option')}`, '2 checkbox Scene option, Value: 0']);
  const clicked = [];
  page.click = async index => { clicked.push(index); };
  const r = await run(CLICK_CONTROL('sceneOption'), {apps: {chrome: page}, lane: 'cua'});
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(clicked, [2]);
  // A "Value:" inside a later line of another part's text is not a Value part: not found.
  const {indexOfTarget} = await import('../../scripts/repl-parity/scenes-mac-text.mjs');
  const helpText = `Window: "d", App: TextEdit.\n0 standard window d\n\t1 text entry area (settable) Help: see${escapeLineBreaks('\nValue: cua scene document\nmore')}\n`;
  assert.equal(indexOfTarget(helpText, 'cua scene document', 'cua'), null);
});

// Ruling 1184, through the real cells on cua's lane.
test('#526 rulings 1184/1185: a real Value after another multi-line part reads raw: the empty check fails and emptying is not skipped', async () => {
  // The reviewer's P1: Help and Value both multi-line, Help first, on a focused non-empty field.
  const line = `1 text entry area (settable) Scene notes, Help: a${escapeLineBreaks('\nb')}, Value: c${escapeLineBreaks('\nd')}`;
  const empty = await run(CHECK('chrome', ''), {apps: {chrome: scenePage([line])}, lane: 'cua'});
  assert.deepEqual([empty.ok, empty.value.ok, empty.value.outcome.exact], [true, false, false]);
  const set = [];
  const page = scenePage([line]);
  page.setValue = async (index, v) => { set.push([index, v]); };
  const {emptyFieldCell} = await import('../../scripts/native-matrix/probe-plan.mjs');
  const prepared = await run(emptyFieldCell('chrome'), {apps: {chrome: page}, lane: 'cua'});
  assert.equal(prepared.value.ready, false, JSON.stringify(prepared));
  assert.deepEqual(set, [[1, '']], 'emptying the field is tried');
  // "Help: a\nb, Value: x": a check expecting "x" fails.
  const after = await run(CHECK('chrome', 'x'), {apps: {chrome: scenePage([`1 text entry area (settable) Scene notes, Help: a${escapeLineBreaks('\nb')}, Value: x`])}, lane: 'cua'});
  assert.deepEqual([after.value.ok, after.value.outcome.exact], [false, false]);
});

test('#526 rulings 1184/1185: "Value:" inside another part\'s first line is not the Value part, for the check and the target', async () => {
  const line = `1 text entry area (settable) Scene notes, Help: Expected Value: one${escapeLineBreaks('\ntwo')}`;
  const r = await run(CHECK('chrome', 'one\ntwo'), {apps: {chrome: scenePage([line])}, lane: 'cua'});
  assert.deepEqual([r.value.ok, r.value.outcome.exact], [false, false]);
  const {indexOfTarget} = await import('../../scripts/repl-parity/scenes-mac-text.mjs');
  assert.equal(indexOfTarget(`Window: "cua scene page", App: Chrome.\n0 standard window cua scene page\n\t${line}\n`, 'one', 'cua'), null);
});

test('#526 ruling 1185: TextEdit\'s document decodes only as its line\'s last part; otherwise it reads raw and a check fails', async () => {
  const DOC = textEditDocument().lines, value = DOC.join('\n');
  const line = 'text entry area (settable) ID: First Text View';
  const set = caseCells('textedit', CASES.textedit.find(c => c.method === 'setValue' && c.case === 'document'));
  const textedit = field({lane: 'cua', title: 'cua-scene', line, value, app: 'TextEdit', after: ', Details: d'});
  assert.equal((await run(set.prepare, {apps: {textedit}, lane: 'cua'})).value.ready, true);
  await run(set.act, {apps: {textedit}, lane: 'cua'});
  const written = await run(set.check, {apps: {textedit}, lane: 'cua'});
  assert.deepEqual([written.ok, written.value.ok], [true, false], 'raw: the write cannot read back equal');
  delete globalThis.__m;
  // The same document as another app's field, the line's last part, decodes too (any app, ruling 1185).
  const {valueOfIndex} = await import('../../scripts/native-matrix/matrix-text.mjs');
  const other = `Window: "cua-scene", App: Notes.\n0 standard window cua-scene\n\t1 ${line}, Value: ${escapeLineBreaks(value)}\n`;
  assert.equal(valueOfIndex(other, 1, 'cua'), value);
});

test('#526 ruling 1185 (P2-b): a target\'s Value part is anchored from the element\'s start; a ") " inside Help text is no flags group', async () => {
  const page = scenePage([`1 button Exit, Help: Read (example) Value: Scene option${escapeLineBreaks('\nmore')}`, '2 checkbox Scene option, Value: 0']);
  const clicked = [];
  page.click = async index => { clicked.push(index); };
  const r = await run(CLICK_CONTROL('sceneOption'), {apps: {chrome: page}, lane: 'cua'});
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(clicked, [2]);
});

test('#526 ruling 1185 (P2-a): TextEdit\'s tree cell and the intervention\'s landing need a real reading, never a substring of raw text', async () => {
  const tree = caseCells('textedit', CASES.textedit.find(c => c.method === 'getAXState'));
  const help = `text entry area (settable) ID: First Text View, Help: see${escapeLineBreaks('\ncua scene document\nmore')}`;
  const textedit = {getAXState: async () => `Window: "cua-scene", App: TextEdit.\n0 standard window cua-scene\n\t1 ${help}\n`};
  for (const code of [tree.prepare, tree.act]) await run(code, {apps: {textedit}, lane: 'cua'});
  const read = await run(tree.check, {apps: {textedit}, lane: 'cua'});
  delete globalThis.__m;
  assert.deepEqual([read.ok, read.value.ok, read.value.outcome.document], [true, false, false]);
  const {endsWithCell} = await import('../../scripts/native-matrix/probe-plan.mjs');
  const landing = {getAXState: async () => `Window: "cua-scene", App: TextEdit.\n0 standard window cua-scene\n\t1 text entry area (settable) ID: First Text View, Value: a${escapeLineBreaks('\nb')}, Help: x\n`};
  assert.equal((await run(endsWithCell('textedit', 'x'), {apps: {textedit: landing}, lane: 'cua'})).value.landed, false);
  const landed = {getAXState: async () => `Window: "cua-scene", App: TextEdit.\n0 standard window cua-scene\n\t1 text entry area (settable) ID: First Text View, Value: a${escapeLineBreaks('\nbx')}\n`};
  assert.equal((await run(endsWithCell('textedit', 'x'), {apps: {textedit: landed}, lane: 'cua'})).value.landed, true);
});
