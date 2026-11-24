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
import {sceneKeyWindow} from '../../scripts/native-matrix/matrix-device.mjs';

const tagOf = code => /cua-matrix-cell: ([\w.]+)/.exec(code)?.[1] ?? null;
const UNTITLED = 500, UNC = 'com.apple.UserNotificationCenter';
const keyScene = a => (a[0] === 'read' && a.includes('--key-window') ? a[a.indexOf('--key-window') + 1] : null);
// The own window as the window list's newcomer alone (this double's reader names no focused window).
const byNewcomer = owner => ({owner, scene: 'textedit', number: UNTITLED, from: 'newcomer', focused: null, newcomer: UNTITLED, focusedReason: 'Accessibility\'s focused window was unread'});
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
    assert.deepEqual(result.meta.ownWindows, [byNewcomer('textedit/concurrent.sheet@electron')]);
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
    assert.deepEqual(result.meta.ownWindows, [byNewcomer('textedit/intervention.saveSheet')], engine);
    assert.equal(te.state().untitled, false, 'the untitled document closed');
  }
});

test('without its number the run\'s own document refuses, as C-3 showed: the typing and the cleanup unsent, the reset blocked', async () => {
  // The same TextEdit with the window list not told apart (no new window seen): nothing recorded, the guard reads as before.
  const te = textEdit();
  const blind = {matrix: (base, a) => (isGuardRead(a) ? base(a) : te.ops.matrix(base, a))};
  const {result} = await runWith({plan: planOf('concurrent-use-sheet'), cellName: 'concurrent-use-sheet', cell: te.cell, ops: blind});
  assert.deepEqual(result.meta.ownWindows, [{owner: 'textedit/concurrent.sheet@electron', scene: 'textedit', focused: null, newcomer: null,
    reason: 'Accessibility\'s focused window was unread; no new window in the window list'}]);
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
  assert.deepEqual(result.meta.ownWindows, [byNewcomer('savePanel/frontmost')]);
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

// ---- pilot C-4 ------------------------------------------------------------------------------------------------------
// Run 45355335937: the sheet variant (⌘N to TextEdit in the background, Electron in front) and #212's Save sheet both
// passed the guard for their untitled document's every key up to the sheet (super+n, the typing, super+w or super+s:
// three readings each, as in C-3), then were refused at the first cell with the sheet up, then its cleanup, then the
// held fixture's reset ("not the scene window 586"), and the vendor matrix stopped at row 353. The document was the
// right window (it held the focus for the typing); with the sheet up TextEdit's AXFocusedWindow is the sheet, an AXSheet
// of the document, which ax-state now names `sheet`. Modelled at the device with the real reading (sceneKeyWindow,
// ownKeyWindow, keyWindowCause): TextEdit's scene document (428) stays its frontmost list window, the untitled document
// (586) behind it, the sheet (590) listed above both while up; Accessibility lists the two documents, never the sheet,
// and names the app's focused window: the scene document, the untitled one once ⌘N landed, the sheet while it is up.
const rect = (x, y, width, height) => ({x, y, width, height});
const wire = b => [b.x, b.y, b.width, b.height].join(',');
// `sheetOn`: the window the sheet opens on ('document', or 'scene': the scene's own document); `stray`: a sheet up on
// the scene document from the start, which no case of the run opened. `sheetListed`: Accessibility lists the sheet among
// the app's windows too, so a reading at the sheet's bounds matches the sheet itself, and the reader names the focused
// sheet 'other' (ax-state now: a focused AXSheet is classified before the direct-equality path) or, as it did before the
// fix, 'run'.
function c4TextEdit(calls, {frontmost = false, aux = false, holdAfter = null, sheetOn = 'document', stray = false, sheetListed = null} = {}) {
  const DOC = {ownerPid: 600, layer: 0, number: 428, bounds: rect(213, 78, 507, 877)};
  const DOCUMENT = {ownerPid: 600, layer: 0, number: 586, bounds: rect(240, 100, 500, 400)};
  const SHEET = {ownerPid: 600, layer: 0, number: 590, bounds: rect(250, 122, 460, 300)};
  // `aux`: a second window that ⌘N's document brings with it (a window the list shows that Accessibility does not).
  const AUX = {ownerPid: 600, layer: 0, number: 777, bounds: rect(260, 140, 40, 20)};
  let holding = false;
  const world = () => {
    let untitled = false, sheet = stray;
    for (const t of calls.map(c => tagOf(c.code)).filter(Boolean)) {
      if (t === 'sheet.new') untitled = true;
      if (t === 'sheet.open' || t === 'savesheet.open') sheet = true;
      if (t === 'savesheet.cancel') sheet = false;
      if (t === 'sheet.cleanup') { sheet = false; untitled = false; }
    }
    return {untitled, sheet};
  };
  const windows = () => { const {untitled, sheet} = world(); return [...(sheet ? [SHEET] : []), DOC, ...(untitled ? [DOCUMENT, ...(aux ? [AUX] : [])] : [])]; };
  const focusedEl = () => { const {untitled, sheet} = world(); return sheet ? SHEET : untitled ? DOCUMENT : DOC; };
  const readings = [];
  const io = {state: () => ({scenes: {textedit: {pid: 600, window: {number: 428}}}}), windows, axState: (pid, bounds, sheetAt) => {
    const {untitled, sheet} = world(), listed = [...(sheet && sheetListed ? [SHEET] : []), DOC, ...(untitled ? [DOCUMENT] : [])], at = listed.find(w => wire(w.bounds) === bounds) ?? null, f = focusedEl();
    const parent = stray || sheetOn === 'scene' ? DOC : DOCUMENT;
    const focusedWindow = !at ? 'other' : f === SHEET ? (at === parent ? 'sheet' : at === SHEET ? sheetListed : 'other') : at === f ? 'run' : 'other';
    const main = untitled ? DOCUMENT : DOC;
    return {trusted: true, ok: Boolean(at), found: Boolean(at), failed: [], frontmost, focusedWindow, mainWindow: at === main ? 'run' : 'other',
      focusedWindowElement: {role: f === SHEET ? 'AXSheet' : 'AXWindow', subrole: f === SHEET ? null : 'AXStandardWindow', frame: f.bounds, ...(f === SHEET ? {parentFrame: parent.bounds} : {})},
      ...(sheetAt === undefined ? {} : {sheet: at === parent && sheet && sheetAt === wire(SHEET.bounds)})};
  }};
  const matrix = (base, a) => {
    if (a[0] === 'step' && a[1] === 'activate' && a[2] === 'textedit') holding = false;
    if (holdAfter && calls.some(c => tagOf(c.code) === holdAfter)) { holding = true; holdAfter = null; }
    const out = base(a);
    const shown = isGuardRead(a) ? {alertBounds: {...out.alertBounds, windows: [...out.alertBounds.windows.filter(w => w.scene !== 'textedit'),
      ...windows().map(w => ({scene: 'textedit', number: w.number, recorded: w === DOC, bounds: w.bounds}))]}} : {};
    if (keyScene(a) !== 'textedit') return {...out, ...shown};
    const own = a.includes('--key-window-number') ? a[a.indexOf('--key-window-number') + 1] : null;
    const ownKey = sceneKeyWindow('textedit', io, own);
    readings.push({own, focusedWindow: ownKey.focusedWindow, tags: calls.map(c => tagOf(c.code)).filter(Boolean).length});
    return {...out, ...shown, ...(holding ? {frontKey: {...out.frontKey, key: UNC}} : {}), ownKey};
  };
  return {ops: {matrix}, readings, world, DOCUMENT, SHEET};
}
const acted = c => {
  const at = Number(/const __at = (\d+)/.exec(c)?.[1]);
  return {actMs: 120, callAt: at, endAt: at + 200, late: 0, threw: false, errorName: null, message: null,
    _meta: {'cua/inputRoute': "2'", 'cua/actionInterval': {startedAt: at + 50, endedAt: at + 150}}};
};
// The follow-up click refused by the engine, so the sheet stays up for the cleanup and the reset (C-4's order).
const refusedFollow = c => {
  const followAt = Number(/__followAt = (\d+)/.exec(c)?.[1]);
  return {opened: true, clicked: true, clickAt: followAt, endAt: followAt + 50, threw: true, errorName: 'Error', message: 'Computer Use server error -10016: refused',
    _meta: {'cua/receivedAt': followAt + 10, 'cua/inputRoute': "2'"}};
};
const c4Cells = c => (tagOf(c) === 'sheet.open' ? acted(c) : tagOf(c) === 'sheet.follow' ? refusedFollow(c) : tagOf(c) === 'sheet.check' ? {closed: false, sceneInFront: false} : null);

test('C-4\'s sequence: ⌘N to TextEdit in the background with Electron in front, the sheet cell with the sheet focused, its cleanup and the held fixture\'s reset all go through', async () => {
  for (const engine of ['vendor', 'cua']) {
    const calls = [];
    const te = c4TextEdit(calls, {holdAfter: 'sheet.check'});
    const {result} = await runWith({engine, plan: planOf('concurrent-use-sheet'), cellName: 'concurrent-use-sheet', calls, cell: c4Cells, ops: te.ops});
    assert.equal(result.complete, true, `${engine}: ${result.problems.join('; ')}`);
    assert.deepEqual((result.meta.alertGuards ?? []).filter(g => g.cause === 'keyWindow'), [], engine);
    const tags = calls.map(c => tagOf(c.code)).filter(t => /^sheet\./.test(t ?? ''));
    assert.ok(tags.includes('sheet.follow'), `${engine}: the follow-up click was sent with the sheet up`);
    // The cleanup the capture alert held left the fixture; its reset, with the sheet still up, closed it.
    assert.deepEqual(result.meta.fixturesHeld?.map(f => [f.row, f.reset]), [['textedit/concurrent.sheet@electron', true]], engine);
    assert.equal(te.world().untitled, false, `${engine}: the untitled document closed`);
    // The own window taken from Accessibility's focused window, the newcomer agreeing.
    assert.deepEqual(result.meta.ownWindows, [{owner: 'textedit/concurrent.sheet@electron', scene: 'textedit', number: 586, from: 'focused', focused: 586, newcomer: 586}], engine);
    // Every reading with the sheet up was the sheet's, for the run's own document, and each is kept with the window AX held.
    assert.ok(te.readings.some(r => r.own === '586' && r.focusedWindow === 'sheet'), engine);
    const sheets = Object.values(result.meta.keyWindowSheets ?? {});
    assert.ok(sheets.length >= 2, `${engine}: ${JSON.stringify(result.meta.keyWindowSheets)}`);
    for (const s of sheets) assert.deepEqual(s.focused, {number: 590, frame: te.SHEET.bounds, role: 'AXSheet', subrole: null, parent: 586, of: 'own'});
    // The row that used the exemption records the sheet it held, its parent the run's own document (ruling 1214).
    const row = result.rows.find(r => r.id === 'textedit/concurrent.sheet@electron');
    assert.deepEqual(row.keyWindowSheet?.focused, {number: 590, frame: te.SHEET.bounds, role: 'AXSheet', subrole: null, parent: 586, of: 'own'}, `${engine}: ${JSON.stringify(row.keyWindowSheet)}`);
    assert.ok(row.keyWindowSheet.count >= 1, 'the cells sent under it');
  }
});

test('C-4 before the fix: a reading that names the sheet another window refuses the sheet cell, and the refusal names the window AX held focused', async () => {
  const {keyWindowCause} = await import('../../scripts/hosted-sittings/alert-guard.mjs');
  const calls = [];
  const te = c4TextEdit(calls);
  // The reader as it was: the sheet focused is just another window.
  const old = {matrix: (base, a) => { const out = te.ops.matrix(base, a); return out.ownKey?.focusedWindow === 'sheet' ? {...out, ownKey: {...out.ownKey, focusedWindow: 'other'}} : out; }};
  const {result} = await runWith({plan: planOf('concurrent-use-sheet'), cellName: 'concurrent-use-sheet', calls, cell: c4Cells, ops: old});
  const refused = result.meta.alertGuards.find(g => g.cause === 'keyWindow');
  assert.match(refused.detail, /^the textedit app's key window is another of its windows, not the scene window 586 \(Accessibility's focused window: window 590 at 250,122 460x300, AXSheet, a sheet of window 586, the run's own\)$/);
  assert.deepEqual(refused.focused, {number: 590, frame: te.SHEET.bounds, role: 'AXSheet', subrole: null, parent: 586, of: 'own'});
  const row = result.rows.find(r => r.id === 'textedit/concurrent.sheet@electron');
  assert.deepEqual(row.alertGuard.focused, refused.focused);
  assert.equal(typeof keyWindowCause, 'function');
});

test('#212\'s Save sheet as C-4 ran it: TextEdit in front, the destination keys and the cancel with the Save sheet focused go through', async () => {
  for (const engine of ['vendor', 'cua']) {
    const calls = [];
    const te = c4TextEdit(calls, {frontmost: true});
    const save = c => (tagOf(c) === 'savesheet.act' ? {...acted(c), threw: true, message: 'x'} : tagOf(c) === 'savesheet.check' ? {sheetOpen: true, nameWritten: true, destinationFiles: []} : null);
    const {result} = await runWith({engine, plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', calls, cell: save, ops: te.ops});
    assert.equal(result.complete, true, `${engine}: ${result.problems.join('; ')}`);
    assert.deepEqual((result.meta.alertGuards ?? []).filter(g => g.cause === 'keyWindow'), [], engine);
    const tags = calls.map(c => tagOf(c.code));
    for (const t of ['savesheet.destination', 'savesheet.cancel', 'sheet.cleanup']) assert.ok(tags.includes(t), `${engine}: ${t} sent`);
    assert.equal(te.world().untitled, false);
  }
});

test('the own window is Accessibility\'s focused window when it is a new one: the newcomer a cross-check, both recorded', async () => {
  // ⌘N brought a second window the list shows: the newcomer cannot tell them apart; the focused window can.
  const calls = [];
  const te = c4TextEdit(calls, {aux: true});
  const {result} = await runWith({plan: planOf('concurrent-use-sheet'), cellName: 'concurrent-use-sheet', calls, cell: c4Cells, ops: te.ops});
  assert.deepEqual(result.meta.ownWindows, [{owner: 'textedit/concurrent.sheet@electron', scene: 'textedit', number: 586, from: 'focused', focused: 586, newcomer: null, newcomerReason: '2 new windows'}]);
});

// Review finding 2: the focused window is taken only when it is joined to one window, new since the opening, and the
// newcomer's when there is one; the old focus, or focus unread or none, leaves the one newcomer to stand; evidence that
// conflicts records the disagreement and takes no own window, so the guard reads as before and no sheet is exempt.
test('the own window\'s cross-check: the old focus or unread focus leaves the newcomer; conflicting evidence takes none', async () => {
  const {ownWindowOpened} = await import('../../scripts/native-matrix/steps.mjs');
  const doc = {scene: 'textedit', number: 428, recorded: true, bounds: rect(213, 78, 507, 877)};
  const fresh = {scene: 'textedit', number: 586, recorded: false, bounds: rect(240, 100, 500, 400)};
  const other = {scene: 'textedit', number: 600, recorded: false, bounds: rect(300, 300, 400, 300)};
  const answer = (focused, windows = [doc, fresh]) => ({alertBounds: {alerts: [], windows}, ownKey: {trusted: true, ok: true, focused}});
  const win = (number, extra = {}) => ({number, frame: null, role: 'AXWindow', subrole: null, parent: null, ...extra});
  const cases = [
    [answer(win(428)), {number: 586, from: 'newcomer', focused: null, newcomer: 586, focusedReason: 'Accessibility\'s focused window, 428, is no new window'}],
    [answer(undefined), {number: 586, from: 'newcomer', focused: null, newcomer: 586, focusedReason: 'Accessibility\'s focused window was unread'}],
    [answer('unread'), {number: 586, from: 'newcomer', focused: null, newcomer: 586, focusedReason: 'Accessibility\'s focused window was unread'}],
    [answer(null), {number: 586, from: 'newcomer', focused: null, newcomer: 586, focusedReason: 'Accessibility named no focused window'}],
    [answer(win(586)), {number: 586, from: 'focused', focused: 586, newcomer: 586}],
    // Two new windows: the focused one among them is taken, the newcomer unknown.
    [answer(win(586), [doc, fresh, other]), {number: 586, from: 'focused', focused: 586, newcomer: null, newcomerReason: '2 new windows'}],
    [answer(win(null)), {focused: null, newcomer: 586, disagreement: 'Accessibility\'s focused window is not in the window list'}],
    [answer(win(null, {ambiguous: 2})), {focused: null, newcomer: 586, disagreement: 'Accessibility\'s focused window is at the frame of 2 windows'}],
    [answer(win(700)), {focused: 700, newcomer: 586, disagreement: 'Accessibility\'s focused window, 700, is not among the windows new since the opening'}],
  ];
  for (const [read, want] of cases) {
    const ctx = {caseOwner: 'o', meta: {}, run: '/r', watcher: null, ops: {matrix: () => read}, records: {}};
    ownWindowOpened(ctx, 'textedit', new Set([428]), {opensSheet: true});
    const entry = want.disagreement ? {...want, reason: `${want.disagreement}: no own window taken`} : want;
    assert.deepEqual(ctx.meta.ownWindows, [{owner: 'o', scene: 'textedit', ...entry}], JSON.stringify(read.ownKey.focused));
    assert.equal(ctx.ownWindow?.number ?? null, want.disagreement ? null : 586);
  }
  // Focused new but not the one newcomer: a disagreement.
  const split = {alertBounds: {alerts: [], windows: [doc, other]}, ownKey: {trusted: true, ok: true, focused: win(586)}};
  const ctx = {caseOwner: 'o', meta: {}, run: '/r', watcher: null, ops: {matrix: () => split}, records: {}};
  ownWindowOpened(ctx, 'textedit', new Set([428]), {opensSheet: true});
  assert.deepEqual([ctx.ownWindow, ctx.meta.ownWindows[0].disagreement], [null, 'Accessibility\'s focused window, 586, is not among the windows new since the opening']);
});

test('the device names the focused window as the scene\'s, the run\'s own or neither', async () => {
  const {sceneKeyWindow} = await import('../../scripts/native-matrix/matrix-device.mjs');
  const doc = {ownerPid: 300, number: 428, layer: 0, bounds: rect(213, 78, 507, 877)};
  const own = {ownerPid: 300, number: UNTITLED, layer: 0, bounds: rect(240, 100, 500, 400)};
  const stray = {ownerPid: 300, number: 501, layer: 0, bounds: rect(600, 100, 300, 300)};
  const sheet = {ownerPid: 300, number: 590, layer: 0, bounds: rect(250, 122, 480, 300)};
  const at = (focusedWindow, w, role = 'AXWindow', parentFrame = undefined) => ({state: () => ({scenes: {textedit: {pid: 300, window: {number: 428}}}}), windows: () => [sheet, doc, own, stray],
    axState: () => ({trusted: true, ok: true, found: true, failed: [], frontmost: true, focusedWindow, mainWindow: 'run', focusedWindowElement: {role, subrole: null, frame: w.bounds, ...(parentFrame ? {parentFrame} : {})}})});
  const of = (io, ownNumber) => sceneKeyWindow('textedit', io, ownNumber).focused?.of;
  assert.equal(of(at('run', own), String(UNTITLED)), 'own');
  assert.equal(of(at('other', doc), String(UNTITLED)), 'scene');
  assert.equal(of(at('other', stray), String(UNTITLED)), 'neither');
  assert.equal(of(at('sheet', sheet, 'AXSheet'), String(UNTITLED)), 'own', 'a sheet of the run\'s own window is the own window\'s');
  // A sheet whose parent was not resolved is nobody's: never the scene's for want of an own window (review, minor 4).
  assert.equal(of(at('other', sheet, 'AXSheet')), 'neither');
  assert.equal(of(at('run', doc)), 'scene');
  // A sheet belongs to the window it is a sheet of: on the scene document while the own one is read, the scene's.
  assert.equal(of(at('other', sheet, 'AXSheet', doc.bounds), String(UNTITLED)), 'scene');
});

// Ruling 1214: the sheet exemption holds only for a case that opens a sheet itself, in its own cells, cleanup and reset,
// with the sheet's parent the run's own window. A sheet anywhere else is refused, recorded with its role and parent.
test('ruling 1214: a sheet on the scene\'s own document, in the sheet variant, is refused and named with its parent', async () => {
  const calls = [];
  const te = c4TextEdit(calls, {sheetOn: 'scene'});
  const {result} = await runWith({plan: planOf('concurrent-use-sheet'), cellName: 'concurrent-use-sheet', calls, cell: c4Cells, ops: te.ops});
  const refused = result.meta.alertGuards.find(g => g.cause === 'keyWindow');
  assert.ok(refused, JSON.stringify(result.meta.alertGuards));
  assert.deepEqual([refused.focused.role, refused.focused.parent, refused.focused.of], ['AXSheet', 428, 'scene']);
  assert.match(refused.detail, /a sheet of window 428, the scene's\)$/);
  assert.equal(result.meta.keyWindowSheets, undefined, 'no exemption taken');
});

test('ruling 1214: a sheet up in a case that opens none is refused, even on the scene\'s own window', async () => {
  const calls = [];
  const te = c4TextEdit(calls, {frontmost: true, stray: true});
  const plan = {...planOf('concurrent-use-sheet'), sheet: false, intervention: ['fires'], id: 'test'};
  const {result} = await runWith({plan, cellName: 'concurrent-use-sheet', calls, cell: c4Cells, ops: te.ops});
  const fires = result.rows.find(r => r.id === 'textedit/intervention.fires');
  assert.equal(fires.alertGuard?.cause, 'keyWindow', JSON.stringify(fires));
  assert.match(fires.alertGuard.detail, /^the textedit app's key window is a sheet on the scene window 428, outside a case that opened it on the run's own window/);
  assert.deepEqual([fires.alertGuard.focused.role, fires.alertGuard.focused.parent], ['AXSheet', 428]);
  assert.equal(result.meta.keyWindowSheets, undefined);
});

// Fix wave (review of ruling 1214's exemption): Accessibility may list a focused sheet among the app's windows, so the
// reading at the frontmost window's bounds (the sheet's own, for a scene whose window is its frontmost) matches the sheet
// itself. Before the fix the reader named it the window read ('run') and the guard let the cell through with no
// exemption at all; now a focused AXSheet is a sheet wherever the reader placed it, refused outside ruling 1214's case.
test('ruling 1214: a sheet Accessibility lists directly, up in a case that opens none, is refused whatever the reader named it', async () => {
  for (const sheetListed of ['run', 'other']) {
    const calls = [];
    const te = c4TextEdit(calls, {frontmost: true, stray: true, sheetListed});
    const plan = {...planOf('concurrent-use-sheet'), sheet: false, intervention: ['fires'], id: 'test'};
    const {result} = await runWith({plan, cellName: 'concurrent-use-sheet', calls, cell: c4Cells, ops: te.ops});
    const fires = result.rows.find(r => r.id === 'textedit/intervention.fires');
    assert.equal(fires.alertGuard?.cause, 'keyWindow', `${sheetListed}: ${JSON.stringify(fires)}`);
    assert.match(fires.alertGuard.detail, /^the textedit app's key window is (a sheet Accessibility lists as a window of its own \(the scene window 590\)|another of its windows, not the scene window 590)/, sheetListed);
    assert.deepEqual([fires.alertGuard.focused.role, fires.alertGuard.focused.parent, fires.alertGuard.focused.of], ['AXSheet', 428, 'scene'], sheetListed);
    assert.equal(result.meta.keyWindowSheets, undefined, sheetListed);
  }
});
test('ruling 1214: with Accessibility listing the sheet directly, C-4\'s sheet variant still holds under its exemption', async () => {
  for (const sheetListed of ['run', 'other']) {
    const calls = [];
    const te = c4TextEdit(calls, {holdAfter: 'sheet.check', sheetListed});
    const {result} = await runWith({plan: planOf('concurrent-use-sheet'), cellName: 'concurrent-use-sheet', calls, cell: c4Cells, ops: te.ops});
    assert.equal(result.complete, true, `${sheetListed}: ${result.problems.join('; ')}`);
    assert.deepEqual((result.meta.alertGuards ?? []).filter(g => g.cause === 'keyWindow'), [], sheetListed);
    for (const s of Object.values(result.meta.keyWindowSheets ?? {})) assert.equal(s.focused.parent, 586, sheetListed);
    assert.ok(Object.keys(result.meta.keyWindowSheets ?? {}).length >= 2, sheetListed);
  }
});
