// The panels' device commands (rulings 1195, 1196; scripts/native-matrix/matrix-device.mjs `place` for a panel and
// `panel cancel`, through the harness's own scripts/native-matrix/panel-ax.swift, never the engine under test): a
// panel's window is found on screen by number, as the Open and Save panel service's own or as a window of the run's
// TextEdit that is not its recorded document (macOS 27 lists the panel under TextEdit's pid: pilot C-2's "textedit window
// 994"), and each write is hosted only.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {main} from '../../scripts/native-matrix/matrix-device.mjs';
import {writeState} from '../../scripts/repl-parity/scenes-mac.mjs';
import {MOVE_REFUSED_OFF_HOSTED} from '../../scripts/hosted-sittings/runner.mjs';
import {PANEL_SERVICE} from '../../scripts/native-matrix/alert-guard.mjs';

const rect = (x, y, width, height) => ({x, y, width, height});
const HOSTED = {env: {RUNNER_ENVIRONMENT: 'github-hosted'}, platform: 'darwin'};
// TextEdit's scene: pid 300, its recorded document window 10.
const TEXTEDIT = {pid: 300, window: {number: 10}};
const DOCUMENT = {ownerPid: 300, ownerName: 'TextEdit', ownerBundleId: 'com.apple.TextEdit', layer: 0, number: 10, bounds: rect(213, 78, 507, 877)};
const CENTRED = rect(520, 162, 880, 448), STRIP = rect(80, 80, 720, 440);
const panelOf = (bounds, extra = {}) => ({ownerPid: 300, ownerName: 'TextEdit', ownerBundleId: 'com.apple.TextEdit', layer: 0, number: 994, bounds, ...extra});
const withRun = async body => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'panel-device-'));
  try { writeState(dir, {scenes: {textedit: TEXTEDIT}}); return await body(dir); } finally { fs.rmSync(dir, {recursive: true, force: true}); }
};
// The window list: the panel where the AX helper last put it.
function device({at = CENTRED, owner = {}, moveTo = STRIP, closes = true} = {}) {
  const asked = [];
  let bounds = at, open = true;
  const io = {...HOSTED,
    screen: () => ({windows: [DOCUMENT, ...(open ? [panelOf(bounds, owner)] : [])], displays: [rect(0, 0, 1920, 1080)]}),
    panelAx: args => {
      asked.push(args);
      if (args[0] === 'move') { bounds = moveTo; return {trusted: true, found: true, windows: 2, size: 0, position: 0, readBack: moveTo}; }
      if (closes) open = false;
      return {trusted: true, found: true, windows: 2, via: 'cancelButton', pressed: 0, walked: 0};
    },
    probe: () => assert.fail('the engine\'s frame probe is never asked for a panel'), sleep: async () => {}};
  return {io, asked};
}

test('place for a panel: TextEdit\'s own panel window moved by the harness\'s AX helper, the frame read back from the window list', async () => {
  await withRun(async dir => {
    for (const scene of ['openPanel', 'savePanel']) {
      const {io, asked} = device();
      const out = await main(['place', '--run', dir, '--scene', scene, '--window', '994', '--frame', '80,80,720,440'], {io});
      assert.deepEqual(asked, [['move', '300', '520,162,880,448', '80,80,720,440']], scene);
      assert.deepEqual(out.answer, {requested: STRIP, readBack: STRIP, matched: true, exitStatus: null, pid: 300, ax: {trusted: true, found: true, size: 0, position: 0, readBack: STRIP}}, scene);
    }
  });
});

test('place for a panel: the service\'s own window is one too; the recorded document, an unknown number or another app\'s window is refused', async () => {
  await withRun(async dir => {
    const service = device({owner: {ownerPid: 12, ownerName: 'Open and Save Panel Service', ownerBundleId: PANEL_SERVICE}});
    const out = await main(['place', '--run', dir, '--scene', 'openPanel', '--window', '994', '--frame', '80,80,720,440'], {io: service.io});
    assert.deepEqual([out.answer.pid, service.asked[0][1]], [12, '12']);
    const {io} = device();
    await assert.rejects(main(['place', '--run', dir, '--scene', 'openPanel', '--window', '10', '--frame', '80,80,720,440'], {io}), /no panel window/);
    await assert.rejects(main(['place', '--run', dir, '--scene', 'openPanel', '--window', '995', '--frame', '80,80,720,440'], {io}), /no panel window/);
    const other = device({owner: {ownerPid: 9, ownerName: 'Owner', ownerBundleId: 'com.example.owner'}});
    await assert.rejects(main(['place', '--run', dir, '--scene', 'openPanel', '--window', '994', '--frame', '80,80,720,440'], {io: other.io}), /no panel window/);
  });
});

test('place for a panel: a move that does not take reads back where the window stands, unmatched', async () => {
  await withRun(async dir => {
    const {io} = device({moveTo: CENTRED});
    const out = await main(['place', '--run', dir, '--scene', 'openPanel', '--window', '994', '--frame', '80,80,720,440'], {io});
    assert.deepEqual([out.answer.readBack, out.answer.matched], [CENTRED, false]);
  });
});

test('off a GitHub-hosted runner no panel is moved or cancelled: refused before anything is read or asked of the helper', async () => {
  await withRun(async dir => {
    for (const off of [{env: {}, platform: 'darwin'}, {env: HOSTED.env, platform: 'linux'}]) {
      const io = {...off, panelAx: () => assert.fail('the helper is not asked'), screen: () => assert.fail('nothing read'), state: () => assert.fail('nothing read')};
      const placed = await main(['place', '--run', dir, '--scene', 'openPanel', '--window', '994', '--frame', '80,80,720,440'], {io});
      assert.deepEqual(placed.answer, {requested: STRIP, readBack: null, matched: false, exitStatus: null, refused: MOVE_REFUSED_OFF_HOSTED});
      const cancelled = await main(['panel', 'cancel', '--run', dir, '--window', '994'], {io});
      assert.deepEqual(cancelled.answer, {closed: false, refused: MOVE_REFUSED_OFF_HOSTED});
    }
  });
});

test('panel cancel: the known panel cancelled by AX on the device and awaited gone from the window list; one that stays reads closed false', async () => {
  await withRun(async dir => {
    const {io, asked} = device();
    const out = await main(['panel', 'cancel', '--run', dir, '--window', '994'], {io});
    assert.deepEqual(asked, [['cancel', '300', '520,162,880,448']]);
    assert.deepEqual(out.answer, {found: true, via: 'cancelButton', pressed: 0, closed: true, state: 'closed', pid: 300});
    assert.ok(Array.isArray(out.at));
    const stuck = device({closes: false});
    assert.equal((await main(['panel', 'cancel', '--run', dir, '--window', '994'], {io: stuck.io})).answer.closed, false);
    // A window already gone: nothing to press, and closed.
    const gone = {...io, screen: () => ({windows: [DOCUMENT]})};
    assert.deepEqual((await main(['panel', 'cancel', '--run', dir, '--window', '994'], {io: gone})).answer, {found: false, closed: true, state: 'closed'});
  });
});

// Review finding 3: the close is grounded in the device's own reading of the window list, which tells closed, still
// open and unread apart; an unread list is never a panel gone.
test('panel state: read-only, anywhere: open, closed, or unread when the window list was not read', async () => {
  await withRun(async dir => {
    for (const where of [HOSTED, {env: {}, platform: 'darwin'}]) {
      const {io, asked} = device();
      const state = async over => (await main(['panel', 'state', '--run', dir, '--window', '994'], {io: {...io, ...where, ...over}})).answer;
      assert.deepEqual(await state({}), {state: 'open'});
      assert.deepEqual(await state({screen: () => ({windows: [DOCUMENT]})}), {state: 'closed'});
      assert.deepEqual(await state({screen: () => ({windows: null})}), {state: 'unread'});
      assert.deepEqual(await state({screen: () => { throw new Error('no list'); }}), {state: 'unread'});
      assert.deepEqual(asked, [], 'nothing asked of the helper');
    }
  });
});

test('panel cancel says which: closed, still open, or unread after the press (never closed on a list it could not read)', async () => {
  await withRun(async dir => {
    const {io} = device();
    assert.equal((await main(['panel', 'cancel', '--run', dir, '--window', '994'], {io})).answer.state, 'closed');
    const stuck = device({closes: false});
    assert.deepEqual(Object.entries((await main(['panel', 'cancel', '--run', dir, '--window', '994'], {io: stuck.io})).answer).filter(([k]) => ['closed', 'state'].includes(k)), [['closed', false], ['state', 'open']]);
    // The list unread after the press: unread, not closed.
    let reads = 0;
    const blind = device();
    const unread = {...blind.io, screen: () => (reads++ === 0 ? blind.io.screen() : {windows: null})};
    const out = (await main(['panel', 'cancel', '--run', dir, '--window', '994'], {io: unread})).answer;
    assert.deepEqual([out.closed, out.state], [false, 'unread']);
  });
});

// Review finding 1: a Save sheet is its own window in the window list but an AXSheet child of its document in AX. The
// helper resolves it under its parent and, since a sheet takes no size or position of its own, moves the parent so the
// sheet lands at the frame's origin; the sheet's frame is read back from the window list, and the answer says so.
test('place for a Save sheet the helper resolved as an AXSheet: the parent moved, the sheet read back, the answer naming the sheet', async () => {
  await withRun(async dir => {
    const sheet = rect(400, 120, 480, 220), landed = rect(80, 80, 480, 220);
    const {io, asked} = device({at: sheet, moveTo: landed});
    const helper = io.panelAx;
    io.panelAx = args => ({...helper(args), kind: 'sheet', parentPosition: 0, size: null, position: null});
    const out = await main(['place', '--run', dir, '--scene', 'savePanel', '--window', '994', '--frame', '80,80,720,440'], {io});
    assert.deepEqual(asked, [['move', '300', '400,120,480,220', '80,80,720,440']]);
    assert.deepEqual([out.answer.readBack, out.answer.ax.kind, out.answer.ax.parentPosition], [landed, 'sheet', 0]);
  });
});

// Ruling 1203's fallback: the frame of the element a key case's input lands on, read by the AX helper with no write.
test('panel element: the focused element\'s or the search field\'s frame read by the helper; refused off a hosted runner', async () => {
  await withRun(async dir => {
    const asked = [];
    const field = rect(560, 96, 220, 22);
    const io = {...HOSTED, screen: () => ({windows: [DOCUMENT, panelOf(rect(0, 80, 880, 448))], displays: [rect(0, 0, 1920, 1080)]}),
      panelAx: args => { asked.push(args); return {trusted: true, found: true, windows: 2, kind: 'window', element: args[3], inWindow: args[3] === 'focused' ? true : null, frame: field, walked: 9}; }};
    for (const element of ['focused', 'search']) {
      const out = await main(['panel', 'element', '--run', dir, '--window', '994', '--element', element], {io});
      assert.deepEqual(out.answer, {found: true, frame: field, inWindow: element === 'focused' ? true : null, pid: 300}, element);
    }
    assert.deepEqual(asked, [['element', '300', '0,80,880,448', 'focused'], ['element', '300', '0,80,880,448', 'search']]);
    await assert.rejects(main(['panel', 'element', '--run', dir, '--window', '994', '--element', 'cancel'], {io}), /focused or search/);
    const off = {env: {}, platform: 'darwin', panelAx: () => assert.fail('the helper is not asked'), screen: () => assert.fail('nothing read')};
    assert.deepEqual((await main(['panel', 'element', '--run', dir, '--window', '994', '--element', 'focused'], {io: off})).answer, {frame: null, refused: MOVE_REFUSED_OFF_HOSTED});
  });
});

// Review finding 2 (ruling 1203): the move writes the panel's position and nothing else; no AXSize write exists for any
// read of its size to enable.
test('the AX helper\'s move writes AXPosition alone: no write of AXSize anywhere in it', () => {
  const source = fs.readFileSync(new URL('../../scripts/native-matrix/panel-ax.swift', import.meta.url), 'utf8');
  const writes = [...source.matchAll(/AXUIElementSetAttributeValue\(\s*\w+\s*,\s*(\w+)/g)].map(m => m[1]);
  assert.deepEqual([...new Set(writes)], ['kAXPositionAttribute']);
});
