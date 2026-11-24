// The run's own windows and the key-window guard (pilot C-3, ruling 1203; scripts/native-matrix/steps.mjs
// ownKeyWindowNumber): the sheet variant's ⌘N to a TextEdit in the background makes the untitled document TextEdit's key
// window without making it its frontmost window in the window list, so the guard, reading for the frontmost one, refused
// the variant's typing, its cleanup and the held fixture's reset ("the textedit app's key window is another of its
// windows, not the scene window 428"), and the vendor matrix stopped. The document's number, read when it opens, is the
// window the guard reads for in that case's cells, its cleanup and its reset; no other case's.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planOf} from '../../scripts/native-matrix/run.mjs';
import {runWith} from './run-doubles.mjs';

const tagOf = code => /cua-matrix-cell: ([\w.]+)/.exec(code)?.[1] ?? null;
const UNTITLED = 500, UNC = 'com.apple.UserNotificationCenter';
const keyScene = a => (a[0] === 'read' && a.includes('--key-window') ? a[a.indexOf('--key-window') + 1] : null);
const isGuardRead = a => a[0] === 'read' && a.includes('--with') && a[a.indexOf('--with') + 1].split(',').includes('alert-bounds');
// TextEdit as C-3 showed it: once ⌘N made the untitled document (window 500), its key window is that document, while the
// window list's frontmost TextEdit window stays the scene's. `holdCleanup`: the capture alert holds the key at the
// variant's cleanups from its typing until TextEdit is activated for the reset, so its fixture waits for the reset. `leaveOpen`: the cleanup reports
// the scene back in front while the document stays (a document somehow left open).
function textEdit({holdCleanup = false, leaveOpen = false} = {}) {
  let untitled = false, typed = false, holding = false;
  const numbers = [];
  const cell = code => {
    const tag = tagOf(code);
    if (tag === 'sheet.new') { untitled = true; return {opened: true}; }
    if (tag === 'sheet.type') { typed = true; if (holdCleanup) holding = true; return {typed: false, reason: 'the untitled document\'s text read back differently: same length, equal ignoring case', readBack: null, front: null}; }
    if (tag === 'sheet.cleanup') { if (!leaveOpen) untitled = false; return {closed: true, sceneInFront: true, front: 'scene'}; }
    return null;
  };
  const matrix = (base, a) => {
    if (a[0] === 'step' && a[1] === 'activate' && a[2] === 'textedit') holding = false;
    const out = base(a);
    if (isGuardRead(a) && untitled) return {...out, alertBounds: {...out.alertBounds, windows: [...out.alertBounds.windows, {scene: 'textedit', number: UNTITLED, recorded: false, bounds: {x: 240, y: 100, width: 500, height: 400}}]}};
    if (keyScene(a) !== 'textedit') return out;
    const number = a.includes('--key-window-number') ? Number(a[a.indexOf('--key-window-number') + 1]) : null;
    numbers.push(number);
    const focusedWindow = untitled ? (number === UNTITLED ? 'run' : 'other') : 'run';
    const held = holding ? {frontKey: {...out.frontKey, key: UNC}} : {};
    return {...out, ...held, ownKey: {...out.ownKey, number: number ?? 428, focusedWindow, mainWindow: focusedWindow, frontmost: false}};
  };
  return {cell, ops: {matrix}, numbers, state: () => ({untitled, typed})};
}

test('C-3\'s sequence: the sheet variant\'s typing, its cleanup and the held fixture\'s reset all read for the run\'s own document and go through', async () => {
  for (const engine of ['vendor', 'cua']) {
    const te = textEdit({holdCleanup: true});
    const {result} = await runWith({engine, plan: planOf('concurrent-use-sheet'), cellName: 'concurrent-use-sheet', cell: te.cell, ops: te.ops});
    assert.equal(result.complete, true, `${engine}: ${result.problems.join('; ')}`);
    assert.ok(!(result.meta.alertGuards ?? []).some(g => g.cause === 'keyWindow'), `${engine}: ${JSON.stringify(result.meta.alertGuards)}`);
    assert.equal(te.state().typed, true, 'the typing was sent');
    // The cleanup the alert held left the fixture, and its reset closed the document.
    assert.deepEqual(result.meta.fixturesHeld?.map(f => [f.row, f.reset]), [['textedit/concurrent.sheet@electron', true]], engine);
    assert.equal(te.state().untitled, false, 'the untitled document closed');
    assert.deepEqual(result.meta.ownWindows, [{owner: 'textedit/concurrent.sheet@electron', scene: 'textedit', number: UNTITLED}]);
    assert.ok(te.numbers.includes(UNTITLED), 'the guard read for the document');
  }
});

// C-3's save-sheet diagnostic stopped alike: its untitled document's cleanup held by the capture alert, the reset was
// refused ("not the scene window 456"). The same document, the same reading.
test('the Save sheet intervention\'s untitled document: its cleanup and the held fixture\'s reset read for it and go through', async () => {
  for (const engine of ['vendor', 'cua']) {
    const te = textEdit({holdCleanup: true});
    const {result} = await runWith({engine, plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', cell: te.cell, ops: te.ops});
    assert.equal(result.complete, true, `${engine}: ${result.problems.join('; ')}`);
    assert.ok(!(result.meta.alertGuards ?? []).some(g => g.cause === 'keyWindow'), `${engine}: ${JSON.stringify(result.meta.alertGuards)}`);
    assert.deepEqual(result.meta.fixturesHeld?.map(f => [f.row, f.reset]), [['textedit/intervention.saveSheet', true]], engine);
    assert.deepEqual(result.meta.ownWindows, [{owner: 'textedit/intervention.saveSheet', scene: 'textedit', number: UNTITLED}], engine);
    assert.equal(te.state().untitled, false, 'the untitled document closed');
  }
});

test('without its number the run\'s own document refuses, as C-3 showed: the typing and the cleanup unsent, the reset blocked', async () => {
  // The same TextEdit with the window list not told apart (no new window seen): nothing recorded, the guard reads as before.
  const te = textEdit();
  const blind = {matrix: (base, a) => (isGuardRead(a) ? base(a) : te.ops.matrix(base, a))};
  const {result} = await runWith({plan: planOf('concurrent-use-sheet'), cellName: 'concurrent-use-sheet', cell: te.cell, ops: blind});
  assert.deepEqual(result.meta.ownWindows, [{owner: 'textedit/concurrent.sheet@electron', scene: 'textedit', reason: 'no new window'}]);
  assert.ok(result.meta.alertGuards.some(g => g.cause === 'keyWindow' && /key window is another of its windows, not the scene window 428/.test(g.detail)));
  assert.equal(result.complete, false);
});

test('a document left open is no other case\'s key window: a later case\'s cell is still refused', async () => {
  const te = textEdit({leaveOpen: true});
  const plan = {...planOf('concurrent-use-sheet'), intervention: ['fires'], id: 'test'};
  const {result} = await runWith({plan, cellName: 'concurrent-use-sheet', cell: te.cell, ops: te.ops});
  const sheet = result.rows.find(r => r.id === 'textedit/concurrent.sheet@electron');
  assert.notEqual(sheet.alertGuard?.cause, 'keyWindow', JSON.stringify(sheet));
  const fires = result.rows.find(r => r.id === 'textedit/intervention.fires');
  assert.equal(fires.alertGuard?.cause, 'keyWindow', JSON.stringify(fires));
  assert.match(fires.alertGuard.detail, /key window is another of its windows, not the scene window 428/);
});

test('the Save sheet target\'s untitled document is its own key window for its cases and its close, then counts for nothing', async () => {
  const te = textEdit();
  let sheet = false;
  const cell = code => {
    if (tagOf(code) === 'savesheet.open') { sheet = true; return {opened: true}; }
    if (code.includes('pressKey("Escape")')) { sheet = false; return code.includes('__m.threw') ? null : {closed: true}; }
    return te.cell(code);
  };
  const plan = {id: 'test', frontmost: ['savePanel'], speed: false, finding: false, background: [], launch: []};
  const {result} = await runWith({plan, cell, ops: te.ops});
  assert.equal(result.complete, true, result.problems.join('; '));
  assert.ok(!(result.meta.alertGuards ?? []).some(g => g.cause === 'keyWindow'), JSON.stringify(result.meta.alertGuards));
  assert.deepEqual(result.meta.ownWindows, [{owner: 'savePanel/frontmost', scene: 'textedit', number: UNTITLED}]);
  assert.equal(te.state().untitled, false);
});

test('the device reads for the run\'s own window by its number when asked, else for the scene app\'s frontmost window', async () => {
  const {sceneKeyWindow} = await import('../../scripts/native-matrix/matrix-device.mjs');
  const doc = {ownerPid: 300, number: 428, layer: 0, bounds: {x: 213, y: 78, width: 507, height: 877}};
  const untitled = {ownerPid: 300, number: UNTITLED, layer: 0, bounds: {x: 240, y: 100, width: 500, height: 400}};
  // AX: the untitled document is TextEdit's focused and main window, the app in the background.
  const io = {state: () => ({scenes: {textedit: {pid: 300, window: {number: 428}}}}), windows: () => [doc, untitled],
    axState: (pid, bounds) => {
      const mine = bounds === '240,100,500,400';
      return {trusted: true, ok: true, found: true, failed: [], frontmost: false, focusedWindow: mine ? 'run' : 'other', mainWindow: mine ? 'run' : 'other'};
    }};
  const asScene = sceneKeyWindow('textedit', io);
  assert.deepEqual([asScene.number, asScene.focusedWindow, asScene.own], [428, 'other', undefined]);
  const own = sceneKeyWindow('textedit', io, String(UNTITLED));
  assert.deepEqual([own.number, own.focusedWindow, own.ok, own.own], [UNTITLED, 'run', true, true]);
});

// Review finding 1: the run's own window gone (its cleanup closed it, an attempt retried) is no reading of its own: the
// device reads for the scene's window as it would with no own window, so another window holding the key still refuses.
test('an own window no longer on screen is read as the scene\'s window: another window key still refuses', async () => {
  const {sceneKeyWindow} = await import('../../scripts/native-matrix/matrix-device.mjs');
  const {keyWindowCause} = await import('../../scripts/hosted-sittings/alert-guard.mjs');
  const doc = {ownerPid: 300, number: 428, layer: 0, bounds: {x: 213, y: 78, width: 507, height: 877}};
  const other = {ownerPid: 300, number: 501, layer: 0, bounds: {x: 240, y: 100, width: 500, height: 400}};
  // Window 500 (the run's own) is closed; TextEdit's key window is another one, 501, while the list's front is 428.
  const io = {state: () => ({scenes: {textedit: {pid: 300, window: {number: 428}}}}), windows: () => [doc, other],
    axState: () => ({trusted: true, ok: true, found: true, failed: [], frontmost: false, focusedWindow: 'other', mainWindow: 'other'})};
  const gone = sceneKeyWindow('textedit', io, String(UNTITLED));
  assert.deepEqual([gone.number, gone.ok, gone.focusedWindow, gone.own, gone.ownGone], [428, true, 'other', undefined, UNTITLED]);
  assert.equal(keyWindowCause(gone)?.category, 'keyWindow');
});
