// #526: cua prints a value's line breaks escaped on the element's one line, the vendor raw. The scenes' cells that read a
// multi-line value back (#187's field check, #188's click prepare, TextEdit's document cells) run here for real, their
// own code, against a field holding a real multi-line value as each lane prints it, with the run's bind recording the
// lane (globalThis.__axRendering): each reads the same value on both lanes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MARKER} from '../../scripts/native-baseline/cells.mjs';
import {CHECK} from '../../scripts/cursor-sitting/item-187.mjs';
import {CLICK_PREPARE, CLICK_VALUE, CLICK_WORD} from '../../scripts/cursor-sitting/item-188.mjs';
import {caseCells} from '../../scripts/native-matrix/matrix-cells.mjs';
import {CASES} from '../../scripts/native-matrix/plan.mjs';
import {UNICODE_STRINGS} from '../../scripts/native-matrix/unicode-plan.mjs';
import {textEditDocument} from '../../scripts/repl-parity/scenes-mac.mjs';
import {escapeLineBreaks, NOTE} from '../../src/services/engine/render.mjs';

// A field app as the cells drive it: its value and selection, printed as `lane` prints a value.
function field({lane, title, line, value, after = ''}) {
  const state = {value, selected: null};
  const shown = v => (lane === 'cua' ? escapeLineBreaks(v) : v);
  return {
    getAXState: async () => `Window: "${title}", App: A.\n0 standard window ${title}\n\t1 ${line}, Value: ${shown(state.value)}${after}\n\n`
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

test('#187: the field check reads a multi-line string back exactly on both lanes', async () => {
  const lines = UNICODE_STRINGS.find(s => s.text.includes('\n'));
  for (const lane of LANES) {
    const chrome = field({lane, title: 'cua scene page', line: 'text entry area (settable) Scene notes', value: lines.text});
    const r = await run(CHECK('chrome', lines.text), {apps: {chrome}, lane});
    assert.deepEqual([r.ok, r.value.ok, r.value.outcome.exact], [true, true, true], lane);
  }
});

test('#188: the click prepare gives the field its multi-line value, reads it back and selects its word on both lanes', async () => {
  assert.ok(CLICK_VALUE.includes('\n'));
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
    const textedit = field({lane, title: 'cua-scene', line, value});
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
