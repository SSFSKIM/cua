// The sheet variant's and #212's typing into the untitled document (scripts/native-matrix/probe-plan.mjs SHEET_TYPE_CELL;
// pilot C-2, ruling 1196 B): the cell says what it read back, length and hash and how it differs, whether its front
// window was still the untitled document and whether any panel was up, with a reason, never the text itself; and the text
// it types is one TextEdit's autocorrection has nothing to rewrite.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCell} from '../../scripts/native-baseline/cells.mjs';
import {sha256Hex} from '../../scripts/native-matrix/matrix-text.mjs';
import {SHEET_TYPE_CELL, SHEET_TYPED} from '../../scripts/native-matrix/probe-plan.mjs';
import {planOf} from '../../scripts/native-matrix/run.mjs';
import {runWith} from './run-doubles.mjs';

const AsyncFunction = (async () => {}).constructor;
async function run(text, apps) {
  let out = '';
  globalThis.__apps = apps;
  try { await new AsyncFunction('cua', 'nodeRepl', text)({}, {write: s => { out += s; }}); } finally { delete globalThis.__apps; }
  return parseCell(out);
}
const untitled = value => `Window: "Untitled", App: TextEdit.\n0 standard window Untitled, Secondary Actions: Raise\n\t1 scroll area\n\t\t2 text entry area (settable) ID: First Text View${value ? `, Value: ${value}` : ''}\n\nThe focused UI element is 2 text entry area (settable) ID: First Text View${value ? `, Value: ${value}` : ''}`;
// TextEdit whose typing lands as `land(text)` (its autocorrection, say).
function textedit(land = text => text, {after = null} = {}) {
  const app = {ax: untitled(''), async getAXState() { return app.ax; },
    async typeText(text) { app.ax = after ?? untitled(land(text)); }};
  return app;
}
const typeInto = async app => {
  globalThis.__sheetDoc = 'Untitled';
  try { return await run(SHEET_TYPE_CELL, {textedit: app}); } finally { delete globalThis.__sheetDoc; }
};

test('the typed text is a capitalised, correctly spelled sentence: nothing for TextEdit\'s autocorrection to rewrite', () => {
  assert.match(SHEET_TYPED, /^[A-Z][a-z]*( [a-z]+)*\.$/);
  assert.ok(!/\bcua\b/i.test(SHEET_TYPED), 'no word outside the dictionary');
});

test('typed as sent: typed, with what it read', async () => {
  const r = await typeInto(textedit());
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.value, {typed: true, readBack: {length: SHEET_TYPED.length, hash: sha256Hex(SHEET_TYPED), expectedLength: SHEET_TYPED.length, foldEqual: true, prefix: true},
    front: {untitled: true, panel: false, saveSheet: false, focusedIsField: true}});
});

test('a read-back the app rewrote (its autocorrection capitalising the first word): not typed, the reason and the reading say how it differs', async () => {
  const r = await typeInto(textedit(text => text[0].toLowerCase() === text[0] ? text[0].toUpperCase() + text.slice(1) : text.toLowerCase()));
  assert.equal(r.value.typed, false);
  assert.match(r.value.reason, /the untitled document's text read back differently: same length, equal ignoring case/);
  assert.deepEqual([r.value.readBack.length, r.value.readBack.foldEqual], [SHEET_TYPED.length, true]);
  assert.equal(JSON.stringify(r.value).includes(SHEET_TYPED), false, 'never the text itself');
});

test('nothing typed, or a field gone: each its own reason', async () => {
  const empty = await typeInto(textedit(() => ''));
  assert.match(empty.value.reason, /read back empty/);
  const gone = await typeInto(textedit(undefined, {after: 'Window: "Untitled", App: TextEdit.\n0 standard window Untitled\n'}));
  assert.deepEqual([gone.value.typed, gone.value.readBack], [false, null]);
  assert.match(gone.value.reason, /the untitled document's text view is not in the text after typing/);
  // Typing that brought a panel up (the panel service's field took the keys) says so.
  const panel = await typeInto(textedit(undefined, {after: 'Window: "Open", App: TextEdit.\n0 standard window ID: open-panel\n\t1 button Cancel\n'}));
  assert.deepEqual([panel.value.typed, panel.value.front.panel, panel.value.front.untitled], [false, true, false]);
});

// ---- in the run: the row carries the cell's reading and the device's front ---------------------------------------------

const tagOf = code => /cua-matrix-cell: ([\w.]+)/.exec(code)?.[1] ?? null;
const REWRITTEN = {typed: false, reason: 'the untitled document\'s text read back differently: same length, equal ignoring case',
  readBack: {length: 32, hash: 'h', expectedLength: 32, foldEqual: true, prefix: false}, front: {untitled: true, panel: false, saveSheet: false, focusedIsField: true}};

test('#212\'s save sheet and the sheet variant: a typing that did not read back leaves its reason, the cell\'s reading and the device\'s front on the row, never "not sent"', async () => {
  for (const [kind, id] of [['intervention-save-sheet', 'textedit/intervention.saveSheet'], ['concurrent-use-sheet', 'textedit/concurrent.sheet@electron']]) {
    const {result} = await runWith({plan: planOf(kind), cellName: kind, cell: code => (tagOf(code) === 'sheet.type' ? REWRITTEN : tagOf(code) === 'sheet.cleanup' ? {closed: true, sceneInFront: true, front: 'scene'} : null)});
    const row = result.rows.find(r => r.id === id);
    assert.equal(row.invalid, `the untitled document's text was not typed (${REWRITTEN.reason})`, kind);
    assert.deepEqual(row.outcome.typing.readBack, REWRITTEN.readBack, kind);
    assert.deepEqual(row.outcome.typing.front, REWRITTEN.front, kind);
    // The device's own reading of the front at the failure: the front and key apps and the front window's owner.
    assert.deepEqual(Object.keys(row.outcome.typing.device).sort(), ['front', 'key', 'topWindow'], kind);
    assert.ok(typeof row.outcome.typing.device.front === 'string', kind);
  }
});
