// The native baseline's cells run here against a scripted TextEdit double (no runtime): the timing envelope, the
// front-window guards, the close-without-saving sequence and what a cell is allowed to return.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as cells from '../../scripts/native-baseline/cells.mjs';

const AsyncFunction = (async () => {}).constructor;
// A TextEdit double shaped as measured on the mini: launched with no document it shows the Open panel (served out of
// process: keys sent to TextEdit do not reach it; its New Document button does); super+w on an edited document brings
// up the keep-or-delete sheet as the front window (window element ID save-panel, its question naming the document, a
// Delete button with ID DontSaveButton), after `sheetDelayMs`; `foreign` puts some other window in front instead. An
// unedited document closes at once, and closing the last one brings the panel back.
function textEdit({failType = false, sheetDelayMs = 0, foreign = false} = {}) {
  const windows = [], keys = [], clicks = [];
  let count = 0, sheet = null, panel = true, quit = false, other = false;
  const front = () => windows.at(-1);
  const newDocument = () => { panel = false; windows.push({title: count++ ? `Untitled ${count}` : 'Untitled', text: '', edited: false}); };
  return {
    windows, keys, clicks, get quit() { return quit; },
    async getAXState(options) {
      assert.deepEqual(options, {emit: false, disableDiffing: true});
      if (panel) return 'App=com.apple.TextEdit\nWindow: "Open", App: TextEdit.\n0 standard window Open, ID: open-panel, Secondary Actions: Raise\n\t1 row Description: a document of the owner\n\t74 button New Document, ID: NewDocumentButton\n\t76 button Cancel, ID: CancelButton';
      if (!windows.length) throw new Error('Computer Use server error: noWindowsAvailable');
      if (other) return 'App=com.apple.TextEdit\nWindow: "Alert", App: TextEdit.\n0 dialog Alert\n\t1 button OK, ID: OKButton';
      if (sheet !== null && performance.now() >= sheet) return `App=com.apple.TextEdit\nWindow: "Save", App: TextEdit.\n0 sheet Description: save, ID: save-panel, Secondary Actions: Raise\n\t6 text Do you want to keep this new document ("${front().title}")?\n\t7 text field (settable) Value: ${front().title}, ID: saveAsNameTextField\n\t12 button Delete, ID: DontSaveButton\n\t13 button Cancel, ID: CancelButton\n\t14 button Save, ID: OKButton`;
      return `App=com.apple.TextEdit\nWindow: "${front().title}", App: TextEdit.\n0 standard window ${front().title}\n\t1 scroll area\n\t\t2 text area Value: ${front().text}, ID: First Text View`;
    },
    async getScreenshot(options) {
      assert.deepEqual(options, {emit: false});
      const png = new Uint8Array(40); png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      new DataView(png.buffer).setUint32(16, 2560); new DataView(png.buffer).setUint32(20, 1440);
      return png;
    },
    async click(index) {
      clicks.push(index);
      if (panel && index === 74) newDocument();
      else if (sheet !== null && performance.now() >= sheet && index === 12) { sheet = null; windows.pop(); }
    },
    async pressKey(key) {
      keys.push(key);
      if (panel) return;
      if (key === 'super+n') newDocument();
      else if (key === 'super+w' && sheet === null) {
        if (!front().edited) { windows.pop(); panel = !windows.length; } else if (foreign) other = true; else sheet = performance.now() + sheetDelayMs;
      } else if (key === 'super+q' && !windows.some(w => w.edited)) quit = true;
    },
    async typeText(text) { if (failType) throw new Error('typing failed'); if (panel) return; front().text += text; front().edited = true; },
  };
}
async function runCell(code, {app, cua = {}}) {
  const written = [];
  Object.assign(globalThis, {app, cua, nodeRepl: {write: text => written.push(text)}});
  try { await new AsyncFunction(code)(); } finally { delete globalThis.cua; delete globalThis.nodeRepl; }
  assert.equal(written.length, 1);
  return cells.parseCell(written[0]);
}
// A short deadline, so the failure paths do not wait the production ten seconds.
globalThis.__baselineTransitionMs = 300;

test('the envelope reports the value and the in-cell time, or the error, on one marker line', async () => {
  const ok = await runCell(cells.NOOP, {app: null});
  assert.deepEqual({ok: ok.ok, value: ok.value}, {ok: true, value: {computed: true}});
  assert.ok(ok.inCellMs >= 0 && ok.inCellMs < 1000);
  const failed = await runCell(cells.GET_STATE, {app: null, cua: {getState: async () => ({apps: [], browsers: [], errors: ['Native apps: server error']})}});
  assert.equal(failed.ok, false);
  assert.match(failed.error, /getState inventory errors: Native apps: server error/);
  assert.equal(cells.parseCell('documentation\nwithout a marker'), null);
});

test('the observation cells return counts and a hash, never the text or the bytes', async () => {
  const app = textEdit();
  assert.deepEqual((await runCell(cells.NEW_DOCUMENT, {app})).value, {actions: 1, observations: 2, via: 'panel'});
  assert.deepEqual(app.clicks, [74]);
  assert.deepEqual((await runCell(cells.SCRATCH_GUARD, {app})).value, {scratchInFront: true});
  const ax = (await runCell(cells.AX_FULL, {app})).value;
  assert.deepEqual({lines: ax.lines, elements: ax.elements}, {lines: 5, elements: 3});
  assert.equal(typeof ax.chars, 'number');
  const shot = (await runCell(cells.SCREENSHOT, {app})).value;
  assert.deepEqual({bytes: shot.bytes, width: shot.width, height: shot.height, format: shot.format}, {bytes: 40, width: 2560, height: 1440, format: 'png'});
  assert.match(shot.sha256, /^[0-9a-f]{16}$/);
});

test('an observation of another window is an invalid sample, and the guard says so', async () => {
  const app = textEdit();
  await runCell(cells.NEW_DOCUMENT, {app});
  app.windows.push({title: 'Owner document', text: 'private', edited: false});
  const ax = await runCell(cells.AX_FULL, {app});
  assert.deepEqual({ok: ax.ok, value: ax.value}, {ok: true, value: {invalid: 'the scratch document was not in front'}});
  assert.deepEqual((await runCell(cells.SCRATCH_GUARD, {app})).value, {scratchInFront: false});
});

test('a task opens its own document, types and verifies the sentence, deletes it on its own sheet, and TextEdit quits from the scratch document', async () => {
  const app = textEdit({sheetDelayMs: 40});
  await runCell(cells.NEW_DOCUMENT, {app});
  assert.deepEqual((await runCell(cells.TASK_ACT, {app})).value, {actions: 2, observations: 2});
  assert.equal(app.windows.at(-1).text, cells.SENTENCE);
  assert.deepEqual((await runCell(cells.TASK_VERIFY, {app})).value, {observations: 1, present: true});
  // The sheet comes up 40 ms after super+w: the cell waits for it by time, however many observations that takes.
  const close = (await runCell(cells.TASK_CLOSE, {app})).value;
  assert.deepEqual({actions: close.actions, sheet: close.sheet, closed: close.closed}, {actions: 2, sheet: true, closed: true});
  assert.ok(close.observations >= 3);
  assert.deepEqual(app.windows.map(w => w.title), ['Untitled']);
  assert.deepEqual(app.keys, ['super+n', 'super+w']);
  assert.deepEqual(app.clicks, [74, 12]);
  assert.deepEqual((await runCell(cells.QUIT_TEXTEDIT, {app})).value, {quit: true});
  assert.equal(app.quit, true);
});

test('after super+w, a window that is not the task document\'s keep-or-delete sheet gets no input', async () => {
  const app = textEdit({foreign: true});
  await runCell(cells.NEW_DOCUMENT, {app});
  await runCell(cells.TASK_ACT, {app});
  const close = await runCell(cells.TASK_CLOSE, {app});
  assert.equal(close.ok, false);
  assert.match(close.error, /neither the task document's keep-or-delete sheet nor the scratch document; no further input was sent/);
  assert.deepEqual(app.keys, ['super+n', 'super+w']);
  assert.deepEqual(app.clicks, [74]);
});

test('a cell whose window is not in front acts on nothing', async () => {
  const app = textEdit();
  await runCell(cells.NEW_DOCUMENT, {app});
  app.windows.push({title: 'Owner document', text: '', edited: false});
  assert.match((await runCell(cells.TASK_ACT, {app})).error, /nothing was done/);
  assert.match((await runCell(cells.QUIT_TEXTEDIT, {app})).error, /not quitting TextEdit/);
  globalThis.__task = 'Some other window';
  assert.match((await runCell(cells.TASK_CLOSE, {app})).error, /not in front; nothing was closed/);
  assert.deepEqual(app.keys, []);
  assert.equal(app.windows.length, 2);
});

test('a failed verification is an error, not a pass', async () => {
  const app = textEdit({failType: true});
  await runCell(cells.NEW_DOCUMENT, {app});
  assert.match((await runCell(cells.TASK_ACT, {app})).error, /typing failed/);
  const verify = await runCell(cells.TASK_VERIFY, {app});
  assert.equal(verify.ok, false);
  assert.match(verify.error, /typed sentence is not in the document/);
});
