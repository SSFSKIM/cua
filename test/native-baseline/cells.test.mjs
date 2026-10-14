// The native baseline's cells run here against a scripted TextEdit double (no runtime): the timing envelope, the
// front-window guards, the close-without-saving sequence and what a cell is allowed to return.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as cells from '../../scripts/native-baseline/cells.mjs';

const AsyncFunction = (async () => {}).constructor;
// A TextEdit double: a stack of documents, the front one last. super+w on an edited document raises the keep-or-delete
// sheet, which super+BackSpace answers with Delete; an unedited one closes at once.
function textEdit({failType = false} = {}) {
  const windows = [], keys = [];
  let count = 0, sheet = false;
  const front = () => windows.at(-1);
  return {
    windows, keys,
    async getAXState(options) {
      assert.deepEqual(options, {emit: false, disableDiffing: true});
      if (!windows.length) throw new Error('Computer Use server error: noWindowsAvailable');
      return `App=com.apple.TextEdit\nWindow: "${front().title}", App: TextEdit.\n\t0 standard window ${front().title}\n\t\t1 scroll area\n\t\t\t2 text area Value: ${front().text}, ID: First Text View${sheet ? '\n\t\t3 sheet\n\t\t\t4 button Delete' : ''}`;
    },
    async getScreenshot(options) {
      assert.deepEqual(options, {emit: false});
      const png = new Uint8Array(40); png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      new DataView(png.buffer).setUint32(16, 2560); new DataView(png.buffer).setUint32(20, 1440);
      return png;
    },
    async pressKey(key) {
      keys.push(key);
      if (key === 'super+n') windows.push({title: count++ ? `Untitled ${count}` : 'Untitled', text: '', edited: false});
      else if (key === 'super+w') { if (front().edited) sheet = true; else windows.pop(); }
      else if (key === 'super+BackSpace' && sheet) { sheet = false; windows.pop(); }
    },
    async typeText(text) { if (failType) throw new Error('typing failed'); front().text += text; front().edited = true; },
  };
}
async function runCell(code, {app, cua = {}}) {
  const written = [];
  Object.assign(globalThis, {app, cua, nodeRepl: {write: text => written.push(text)}});
  try { await new AsyncFunction(code)(); } finally { delete globalThis.cua; delete globalThis.nodeRepl; }
  assert.equal(written.length, 1);
  return cells.parseCell(written[0]);
}

test('the envelope reports the value and the in-cell time, or the error, on one marker line', async () => {
  const ok = await runCell(cells.NOOP, {app: null});
  assert.deepEqual({ok: ok.ok, value: ok.value}, {ok: true, value: {value: 2}});
  assert.ok(ok.inCellMs >= 0 && ok.inCellMs < 1000);
  const failed = await runCell(cells.GET_STATE, {app: null, cua: {getState: async () => ({apps: [], browsers: [], errors: ['Native apps: server error']})}});
  assert.equal(failed.ok, false);
  assert.match(failed.error, /getState inventory errors: Native apps: server error/);
  assert.equal(cells.parseCell('documentation\nwithout a marker'), null);
});

test('the observation cells return counts and a hash, never the text or the bytes', async () => {
  const app = textEdit();
  assert.deepEqual((await runCell(cells.NEW_DOCUMENT, {app})).value, {actions: 1, observations: 2});
  const ax = (await runCell(cells.AX_FULL, {app})).value;
  assert.deepEqual({elements: ax.elements, scratchInFront: ax.scratchInFront, lines: ax.lines}, {elements: 3, scratchInFront: true, lines: 5});
  assert.equal(typeof ax.chars, 'number');
  const shot = (await runCell(cells.SCREENSHOT, {app})).value;
  assert.deepEqual({bytes: shot.bytes, width: shot.width, height: shot.height, format: shot.format}, {bytes: 40, width: 2560, height: 1440, format: 'png'});
  assert.match(shot.sha256, /^[0-9a-f]{16}$/);
});

test('a task opens its own document, types and verifies the sentence, and deletes the document unsaved', async () => {
  const app = textEdit();
  await runCell(cells.NEW_DOCUMENT, {app});
  const act = await runCell(cells.TASK_ACT, {app});
  assert.deepEqual(act.value, {actions: 2, observations: 2});
  assert.equal(app.windows.at(-1).text, cells.SENTENCE);
  assert.deepEqual((await runCell(cells.TASK_VERIFY, {app})).value, {observations: 1, present: true});
  const close = await runCell(cells.TASK_CLOSE, {app});
  assert.deepEqual(close.value, {actions: 2, observations: 3, closed: true});
  assert.deepEqual(app.keys, ['super+n', 'super+n', 'super+w', 'super+BackSpace']);
  assert.deepEqual(app.windows.map(w => w.title), ['Untitled']);
  assert.deepEqual((await runCell(cells.CLOSE_SCRATCH, {app})).value, {closed: true, windowsLeft: false});
  assert.deepEqual((await runCell(cells.QUIT_TEXTEDIT, {app})).value, {quit: true});
  assert.equal(app.keys.at(-1), 'super+q');
});

test('a cell whose own document is not in front acts on nothing', async () => {
  const app = textEdit();
  await runCell(cells.NEW_DOCUMENT, {app});
  globalThis.__task = 'Some other window';
  const close = await runCell(cells.TASK_CLOSE, {app});
  assert.equal(close.ok, false);
  assert.match(close.error, /not in front; nothing was closed/);
  assert.deepEqual(app.keys, ['super+n']);
  app.windows.push({title: 'Owner document', text: '', edited: false});
  assert.equal((await runCell(cells.CLOSE_SCRATCH, {app})).ok, false);
  assert.equal((await runCell(cells.QUIT_TEXTEDIT, {app})).ok, false);
  assert.deepEqual(app.keys, ['super+n']);
});

test('a failed verification is an error, not a pass', async () => {
  const app = textEdit({failType: true});
  await runCell(cells.NEW_DOCUMENT, {app});
  assert.match((await runCell(cells.TASK_ACT, {app})).error, /typing failed/);
  const verify = await runCell(cells.TASK_VERIFY, {app});
  assert.equal(verify.ok, false);
  assert.match(verify.error, /typed sentence is not in the document/);
});
