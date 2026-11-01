// The gedit text scene kept in the condition every lane's sample needs (#171, task 24, the design session's ruling after
// m3-gate-verdict): the pinned build's failed `type_text_selection` deletes the selected first word and pastes nothing,
// so its window emptied after 9 samples and every later selection was refused (mechanism A); a selection a lane's own
// `clipboard_read` left made GTK 3 refuse the next one (mechanism B). The fix:
// - before each sample's preparation the oracle checks the scene's first word and puts it back through EditableText
//   when it is missing, the same for every lane, recorded on the sample and counted per lane; a restore needed before a
//   candidate's (cua's) sample stops the run as a failure and is never absorbed;
// - the caret is put at the end before every selection, which clears a selection left behind;
// - the backstop: a refusal the restore cannot prevent restores the lane's scene (a fresh window, warmed again for a
//   warm sample) before the one resample, recorded on the failure's row.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ORACLE, PrepareStepError, judgePrepareFaults, judgeTextRestores, sampleUnderRule } from '../../scripts/linux-engine-diff/prepare.mjs';
import { prepareFaultsMarkdown, renderSummary } from '../../scripts/linux-engine-diff/report.mjs';
import { restoreLaneScene } from '../../scripts/linux-engine-diff/run.mjs';
import { runOutcome, verdictLine } from '../../scripts/linux-engine-diff/stats.mjs';
import { CandidateTextLost, TEXT_OPS, handleOfFirstWord, sceneTextBefore, selectFirstWord } from '../../scripts/linux-engine-diff/text.mjs';

const GEDIT_TEXT = 'cua171 differential scene\nline two of the scratch file\n';
const chars = (s) => [...s];

/**
 * A gedit buffer as GTK 3's text view answers AT-SPI (gtk/a11y/gtktextviewaccessible.c, 3.24.41): `AddSelection` is
 * refused while a selection exists and otherwise selects the range, an empty one included (and answers true);
 * `SetCaretOffset` places the cursor, which clears the selection; `InsertText` inserts. gedit's implicit trailing
 * newline keeps the file's last `\n` out of the buffer: 54 characters.
 */
class GtkBuffer {
  constructor(text = GEDIT_TEXT.replace(/\n$/, '')) {
    this.chars = chars(text);
    this.caret = this.chars.length;
    this.sel = null;
    this.calls = [];
  }
  get text() {
    return this.chars.join('');
  }
  addSelection(start, end) {
    this.calls.push('AddSelection');
    if (this.sel) return false;
    const n = this.chars.length;
    const [s, e] = [Math.min(start, n), Math.min(end, n)];
    this.sel = s === e ? null : [s, e];
    this.caret = s;
    return true;
  }
  setCaret(offset) {
    this.calls.push('SetCaretOffset');
    this.caret = Math.min(offset, this.chars.length);
    this.sel = null;
    return true;
  }
  insertText(position, text) {
    this.calls.push('InsertText');
    this.chars.splice(position, 0, ...chars(text));
    return true;
  }
  /** The pinned build's x64 `type_text` over a selection: the range deleted, then a paste that never inserts. */
  deleteSelectionAndFailPaste() {
    if (!this.sel) return;
    const [s, e] = this.sel;
    this.chars.splice(s, e - s);
    this.caret = s;
    this.sel = null;
  }
}

const oracleOf = (buffer) => ({
  select: (id, start, end) => buffer.addSelection(start, end),
  text: () => buffer.text,
  setCaret: (id, offset) => buffer.setCaret(offset),
  count: () => buffer.chars.length,
  insertText: (id, position, text) => buffer.insertText(position, text),
});

const ctxOf = (buffer, { label = 'pinned', i = 1 } = {}) => ({
  scene: { id: 7, field: 'f', label: `cua171-diff-run-gedit-text_${label}`, content: GEDIT_TEXT },
  desktop: { oracle: oracleOf(buffer) },
  engine: { label },
  i,
});

// ---------------------------------------------------------------------------------------------------------------
// mechanism A: a lane that deletes its selection and pastes nothing

test('without the restore, a lane whose failed paste deletes its selection empties its window at the 10th sample', () => {
  // m3-gate-verdict: block 0's 6 samples and block 1's first 3 deleted 54 characters; warm/3 was refused
  const buffer = new GtkBuffer();
  let refusedAt = null;
  for (let n = 1; n <= 12 && refusedAt === null; n++) {
    try {
      selectFirstWord(ctxOf(buffer));
      buffer.deleteSelectionAndFailPaste();
    } catch (error) {
      assert.ok(error instanceof PrepareStepError && error.step === ORACLE);
      assert.match(error.message, /refused the selection/);
      refusedAt = n;
    }
  }
  assert.equal(refusedAt, 10);
  assert.equal(buffer.text, '');
});

test('with the restore, every preparation selects the first word, and each restore is recorded', () => {
  const buffer = new GtkBuffer();
  const restores = [];
  for (let n = 1; n <= 40; n++) {
    const ctx = ctxOf(buffer);
    const restored = sceneTextBefore(ctx, { candidate: false });
    if (restored) restores.push(restored);
    selectFirstWord(ctx);
    assert.equal(ctx.selected, 'cua171', `sample ${n}`);
    buffer.deleteSelectionAndFailPaste();
  }
  // the first sample found the scene as it opened; each later one finds the word its predecessor deleted
  assert.equal(restores.length, 39);
  assert.deepEqual(restores[0], { inserted: 'cua171', found: ' diffe' });
  assert.match(buffer.text, /^ differential scene\nline two of the scratch file$/);
});

test('the restore puts the first word back into an emptied window too', () => {
  const buffer = new GtkBuffer('');
  const ctx = ctxOf(buffer);
  assert.deepEqual(sceneTextBefore(ctx, { candidate: false }), { inserted: 'cua171', found: '' });
  assert.equal(buffer.text, 'cua171');
  selectFirstWord(ctx);
  assert.equal(ctx.selected, 'cua171');
});

test('a window that keeps its first word needs no restore and sends nothing', () => {
  // a lane whose paste lands replaces the word with TEXT, which starts with it again
  const buffer = new GtkBuffer(`cua171 안녕 é 🙂\nline2 differential scene`);
  assert.equal(sceneTextBefore(ctxOf(buffer, { label: 'newest' }), { candidate: false }), null);
  assert.deepEqual(buffer.calls, []);
});

test('the restore is the same for every vendor lane', () => {
  for (const label of ['pinned', 'newest']) {
    const buffer = new GtkBuffer('');
    assert.deepEqual(sceneTextBefore(ctxOf(buffer, { label }), { candidate: false }), { inserted: 'cua171', found: '' }, label);
  }
});

test("a restore needed before a candidate's sample stops the run, and the window is left as the candidate left it", () => {
  const buffer = new GtkBuffer(' differential scene');
  assert.throws(
    () => sceneTextBefore(ctxOf(buffer, { label: 'cua' }), { candidate: true }),
    (error) => {
      assert.ok(error instanceof CandidateTextLost);
      assert.ok(!(error instanceof PrepareStepError), 'never a harness fault the rule could resample');
      assert.match(error.message, /cua171-diff-run-gedit-text_cua lost its first word/);
      assert.deepEqual(error.record, { expected: 'cua171', found: ' diffe' });
      return true;
    },
  );
  assert.equal(buffer.text, ' differential scene', 'never absorbed: nothing put back');
  assert.ok(!buffer.calls.includes('InsertText'));
});

test('a window that refuses the restore fails the preparation at the oracle step', () => {
  const buffer = new GtkBuffer('');
  const ctx = ctxOf(buffer);
  ctx.desktop.oracle.insertText = () => false;
  assert.throws(
    () => sceneTextBefore(ctx, { candidate: false }),
    (error) => error instanceof PrepareStepError && error.step === ORACLE && /refused to take back its first word/.test(error.message),
  );
});

test('the operations that select the first word ask for it; a cold release, which selects nothing, does not', () => {
  for (const op of ['type_text_selection', 'clipboard_read', 'clipboard_write']) {
    assert.equal(TEXT_OPS[op].needsFirstWord({ i: 0 }), true, op);
    assert.equal(TEXT_OPS[op].needsFirstWord({ i: 3 }), true, op);
  }
  assert.equal(TEXT_OPS.clipboard_release.needsFirstWord({ i: 0 }), false);
  assert.equal(TEXT_OPS.clipboard_release.needsFirstWord({ i: 1 }), true);
  for (const op of ['type_text', 'type_text_dedicated', 'type_characters']) assert.equal(TEXT_OPS[op].needsFirstWord, undefined, op);
});

// ---------------------------------------------------------------------------------------------------------------
// the restores counted per lane, in the verdict line and the summary

const sample = (engine, extra = {}) => ({ kind: 'sample', engine, scene: 'gedit', op: 'type_text_selection', block: 0, series: 'warm', i: 1, ...extra });
const RESTORED = { inserted: 'cua171', found: '' };

test('the restores are counted per lane, every lane listed, failed preparations included', () => {
  const rows = [
    sample('pinned', { text_restored: RESTORED }),
    sample('pinned', { text_restored: RESTORED, op: 'clipboard_read' }),
    { kind: 'prepare-failure', engine: 'pinned', scene: 'gedit', op: 'clipboard_write', block: 1, series: 'cold', i: 0, step: ORACLE, outcome: 'resampled', text_restored: RESTORED },
    sample('newest'),
    sample('cua'),
  ];
  const restores = judgeTextRestores(rows, ['pinned', 'newest', 'cua']);
  assert.deepEqual(restores.lanes, { pinned: 3, newest: 0, cua: 0 });
  assert.deepEqual(
    restores.samples.map((s) => `${s.engine} ${s.op} ${s.block}/${s.i}`),
    ['pinned type_text_selection 0/1', 'pinned clipboard_read 0/1', 'pinned clipboard_write 1/0'],
  );
});

test("the bus pass's restores count too, and a candidate's lost word counts as the restore it needed and never got", () => {
  const rows = [
    { kind: 'text-bus', engine: 'pinned', scene: 'gedit', op: 'clipboard_read', block: 'bus', i: 0, ok: true, text_restored: RESTORED },
    { kind: 'text-lost', engine: 'cua', scene: 'gedit', op: 'clipboard_write', block: 1, series: 'cold', i: 0, expected: 'cua171', found: ' diffe' },
  ];
  const restores = judgeTextRestores(rows, ['pinned', 'newest', 'cua']);
  assert.deepEqual(restores.lanes, { pinned: 1, newest: 0, cua: 1 });
  assert.deepEqual(restores.samples[1], { engine: 'cua', scene: 'gedit', op: 'clipboard_write', block: 1, series: 'cold', i: 0, found: ' diffe', lost: true });
  const md = renderSummary([{ run: 'r', kind: 'text-restores', ...restores }]);
  assert.match(md, /- gedit clipboard_write cua 1\/0 \(cold\): found ' diffe', \*\*never put back: a sample of its lane left the text wrong, and the run stopped\*\*/);
});

test("the verdict line counts the restores per lane, the newest lane's zero included", () => {
  const outcome = runOutcome([{ kind: 'verdict', scene: 'gedit', op: 'tree', candidate: 'cua', pass: true }], { valid: true, restores: { pinned: 39, newest: 0, cua: 0 } });
  assert.equal(outcome.code, 0, 'a vendor lane’s restores fail nothing');
  assert.equal(verdictLine(outcome), 'every verdict PASS; text restores (the first word put back before a sample): pinned 39, newest 0, cua 0');
});

test("a candidate's lost text stops the run as a failure, its reason in the verdict line", () => {
  const stop = "gedit clipboard_write cua 1/0: cua171-diff-run-gedit-text_cua lost its first word (found ' diffe'): a cua sample left the text wrong";
  const outcome = runOutcome([], { valid: true, restores: { pinned: 4, newest: 0, cua: 1 }, stop });
  assert.equal(outcome.pass, false);
  assert.equal(outcome.code, 1);
  assert.equal(verdictLine(outcome), `FAIL: ${stop}; text restores (the first word put back before a sample): pinned 4, newest 0, cua 1`);
});

test('the summary lists the restores per lane and each restored sample', () => {
  const run = 't24';
  const rows = [
    { run, kind: 'meta', commit: 'c', cua_version: 'v', occlusion: 'covered', blocks: 1, samples_tree: 7, samples_input: 5, engines: [] },
    { run, ...sample('pinned', { text_restored: RESTORED }) },
    { run, kind: 'text-restores', ...judgeTextRestores([sample('pinned', { text_restored: RESTORED })], ['pinned', 'newest', 'cua']) },
    { run, kind: 'end', valid: true, pass: true, failed: [], parity: [], refused: [], restores: { pinned: 1, newest: 0, cua: 0 }, finished: 'now' },
  ];
  const md = renderSummary(rows);
  assert.match(md, /Text restores \(the oracle put the scene's first word back before a sample's preparation\): pinned 1, newest 0, cua 0:/);
  assert.match(md, /- gedit type_text_selection pinned 0\/1 \(warm\): found '', put back 'cua171'/);
  assert.match(md, /every verdict PASS; text restores \(the first word put back before a sample\): pinned 1, newest 0, cua 0, finished now/);
});

// ---------------------------------------------------------------------------------------------------------------
// mechanism B: a selection left behind

test("a selection the lane's own Copy left behind is cleared by the caret before the next selection", async () => {
  // m3-gate-final topup-0-0: cua's clipboard_read left the first word selected and nothing took PRIMARY before its
  // clipboard_write's handle; GTK 3 refused the second AddSelection twice
  const buffer = new GtkBuffer();
  const ctx = ctxOf(buffer, { label: 'cua' });
  ctx.engine.request = async () => ({ response: { ok: true, output: 'handle-1' } });
  selectFirstWord(ctx);
  assert.deepEqual(buffer.sel, [0, 6], 'the Copy’s selection is left in place');
  const next = ctxOf(buffer, { label: 'cua' });
  next.engine.request = async () => ({ response: { ok: true, output: 'handle-2' } });
  assert.equal(await handleOfFirstWord(next), 'handle-2');
  assert.deepEqual(next.prepareAttempts, [], 'no refusal');
  assert.deepEqual(buffer.calls.slice(-2), ['SetCaretOffset', 'AddSelection']);
});

test('every lane puts the caret at the end before it selects', () => {
  for (const label of ['pinned', 'newest', 'cua']) {
    const buffer = new GtkBuffer();
    buffer.sel = [3, 9];
    const ctx = ctxOf(buffer, { label });
    selectFirstWord(ctx);
    assert.equal(ctx.selected, 'cua171', label);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// the backstop: the lane's scene restored before the one resample

/** A sample taken on the lane's current buffer as run.mjs takes it: the text restore, then the preparation's selection. */
function takeOn(lane, { label = 'pinned', i = 1 } = {}) {
  return async () => {
    const ctx = ctxOf(lane.buffer, { label, i });
    try {
      ctx.textRestored = sceneTextBefore(ctx, { candidate: label === 'cua' });
      selectFirstWord(ctx);
    } catch (error) {
      if (!(error instanceof PrepareStepError)) throw error;
      return { row: { kind: 'prepare-failure', engine: label, scene: 'gedit', op: 'clipboard_read', block: 0, series: i === 0 ? 'cold' : 'warm', i, step: error.step, error: error.message, attempts: [] }, response: null, fault: ORACLE };
    }
    lane.buffer.deleteSelectionAndFailPaste();
    return { row: { kind: 'sample', engine: label, ok: false, ...(ctx.textRestored ? { text_restored: ctx.textRestored } : {}) }, response: { ok: false }, fault: null };
  };
}

test('the text restore prevents the refusals, so the backstop is never reached under a deleting lane', async () => {
  const lane = { buffer: new GtkBuffer() };
  let restoredScenes = 0;
  for (let n = 0; n < 40; n++) {
    const out = await sampleUnderRule({ cold: false, take: takeOn(lane), renew: async () => true, restoreScene: async () => (restoredScenes++, { fresh: true }), emit: () => assert.fail('no failure to record') });
    assert.equal(out.counted.row.kind, 'sample');
  }
  assert.equal(restoredScenes, 0);
});

test('a refusal the text restore cannot prevent restores the scene before the one resample, recorded on its row', async () => {
  // a window that refuses every selection whatever its text: only a fresh window helps
  const lane = { buffer: new GtkBuffer() };
  lane.buffer.addSelection = () => false;
  const emitted = [];
  const order = [];
  const restoreScene = async ({ cold }) => {
    order.push(`restore ${cold ? 'cold' : 'warm'}`);
    lane.buffer = new GtkBuffer();
    return { fresh: true, warmed: !cold };
  };
  const take = takeOn(lane, { i: 2 });
  const out = await sampleUnderRule({ cold: false, take: async () => (order.push('take'), take()), renew: async () => assert.fail('a warm sample keeps its engine'), restoreScene, emit: (r) => emitted.push(r) });
  assert.deepEqual(order, ['take', 'restore warm', 'take']);
  assert.equal(out.counted.row.kind, 'sample');
  assert.equal(out.counted.row.resampled, true);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].outcome, 'resampled');
  assert.deepEqual(emitted[0].scene_restore, { fresh: true, warmed: true });
});

test("a cold sample's backstop restores the scene, then starts a fresh engine", async () => {
  const order = [];
  const results = [ORACLE, 'ok'];
  const take = async () => {
    order.push('take');
    return results.shift() === ORACLE ? { row: { kind: 'prepare-failure', i: 0, step: ORACLE }, fault: ORACLE } : { row: { kind: 'sample', i: 0 }, fault: null };
  };
  const emitted = [];
  const out = await sampleUnderRule({ cold: true, take, renew: async () => (order.push('renew'), true), restoreScene: async () => (order.push('restore'), { fresh: true, warmed: false }), emit: (r) => emitted.push(r) });
  assert.deepEqual(order, ['take', 'restore', 'renew', 'take']);
  assert.equal(out.counted.row.resampled, true);
  assert.deepEqual(emitted[0].scene_restore, { fresh: true, warmed: false });
});

test('a scene that cannot be restored leaves the sample invalid, never resampled in another condition', async () => {
  const emitted = [];
  let takes = 0;
  const take = async () => (takes++, { row: { kind: 'prepare-failure', i: 1, step: ORACLE }, fault: ORACLE });
  const out = await sampleUnderRule({ cold: false, take, renew: async () => true, restoreScene: async () => false, emit: (r) => emitted.push(r) });
  assert.equal(takes, 1);
  assert.equal(out.counted, null);
  assert.equal(emitted[0].outcome, 'invalid');
  assert.match(emitted[0].why, /could not be restored/);
});

test("the engine's own failure restores no scene: it is never resampled", async () => {
  const take = async () => ({ row: { kind: 'sample', ok: false, prepare_step: 'engine' }, fault: null });
  const out = await sampleUnderRule({ cold: false, take, renew: async () => true, restoreScene: async () => assert.fail('no restore'), emit: () => assert.fail('nothing to record') });
  assert.equal(out.counted.row.prepare_step, 'engine');
});

// ---------------------------------------------------------------------------------------------------------------
// the backstop's scene restore in run.mjs: a fresh window for the lane, the cover back, a warm engine warmed again

function fakeDesktop({ lingers = 0 } = {}) {
  const log = [];
  let next = 100;
  let closed = null;
  let left = lingers;
  const desktop = {
    log,
    async close(scenes) {
      closed = scenes[0].id;
      log.push(`close ${scenes.map((s) => s.id).join(',')}`);
    },
    // the closed window still listed `lingers` times after its close
    async listWindows() {
      if (closed !== null && left > 0) {
        left--;
        log.push('listed old');
        return [{ id: closed }];
      }
      return [];
    },
    async openGedit(role, content) {
      const id = next++;
      log.push(`open ${role}`);
      return { kind: 'gedit', role, label: `cua171-diff-run-gedit-${role}`, content, id };
    },
    async geditText() {
      return GEDIT_TEXT.replace(/\n$/, '');
    },
    async state(scene) {
      return { ax_tree: { role: 'frame', children: [{ id: `field-${scene.id}`, role: 'text', states: ['editable'] }] } };
    },
    focusFront() {
      log.push('focus front');
    },
    raise(scene) {
      log.push(`raise ${scene.id}`);
    },
  };
  return desktop;
}

test("the backstop's restore replaces the lane's window, gives the cover back and warms a warm engine on it", async () => {
  const desktop = fakeDesktop();
  const old = { kind: 'gedit', role: 'text_pinned', id: 42, field: 'field-42' };
  const windows = { gedit: { text: { pinned: old } } };
  const requests = [];
  const engine = { request: async (command, input) => (requests.push([command, input]), { response: { ok: true } }) };
  const record = await restoreLaneScene({ desktop, windows, sceneName: 'gedit', label: 'pinned', engine, warm: true, occlusion: 'covered', witnessed: (fn) => fn() });
  assert.deepEqual(desktop.log, ['close 42', 'open text_pinned', 'focus front']);
  assert.equal(windows.gedit.text.pinned.id, 100);
  assert.equal(windows.gedit.text.pinned.field, 'field-100');
  assert.deepEqual(requests, [['get_window_state', { window: { id: 100 }, include_screenshot: false }]]);
  assert.equal(record.old_id, 42);
  assert.equal(record.new_id, 100);
  assert.equal(record.warmed, 'get_window_state');
  assert.equal(typeof record.ms, 'number');
});

test("a cold sample's restored window is not warmed: its fresh engine's first request stays the sample's", async () => {
  const desktop = fakeDesktop();
  const windows = { gedit: { text: { cua: { kind: 'gedit', role: 'text_cua', id: 9 } } } };
  const engine = { request: async () => assert.fail('no warming request') };
  const record = await restoreLaneScene({ desktop, windows, sceneName: 'gedit', label: 'cua', engine, warm: false, occlusion: 'visible', witnessed: (fn) => fn() });
  assert.deepEqual(desktop.log, ['close 9', 'open text_cua', 'raise 100']);
  assert.equal(record.warmed, null);
});

test('the old window is gone before its successor is looked for, which is found by the same file name', async () => {
  const desktop = fakeDesktop({ lingers: 2 });
  const windows = { gedit: { text: { pinned: { kind: 'gedit', role: 'text_pinned', id: 42 } } } };
  await restoreLaneScene({ desktop, windows, sceneName: 'gedit', label: 'pinned', engine: null, warm: false, occlusion: 'covered', witnessed: (fn) => fn() });
  assert.deepEqual(desktop.log, ['close 42', 'listed old', 'listed old', 'open text_pinned', 'focus front']);
});

test("the summary names the backstop's restore on the failure it preceded, and the caps count it as before", () => {
  const failure = { kind: 'prepare-failure', engine: 'pinned', scene: 'gedit', op: 'clipboard_read', block: 1, series: 'warm', i: 3, step: ORACLE, error: 'cua171-diff-run-gedit-text_pinned refused the selection', attempts: [], outcome: 'resampled', scene_restore: { old_id: 42, new_id: 42, old_pid: 10, new_pid: 11, warmed: 'get_window_state', ms: 2800 } };
  const rows = [...Array.from({ length: 99 }, () => sample('pinned', { op: 'clipboard_read' })), failure];
  const faults = judgePrepareFaults(rows);
  assert.deepEqual(faults.cases.map((c) => [c.resampled, c.invalid, c.over]), [[1, 0, false]], 'a restored resample is still a resample');
  const md = prepareFaultsMarkdown([...rows, { kind: 'prepare-faults', ...faults }]).join('\n');
  assert.match(md, /- gedit clipboard_read pinned 1\/3 \(warm\): resampled; failed at the oracle step: cua171-diff-run-gedit-text_pinned refused the selection; its scene restored before the resample \(gedit 10 replaced by 11, window 42 by 42, warmed with get_window_state\)/);
});
