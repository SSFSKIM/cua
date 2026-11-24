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
    assert.deepEqual(out.answer, {found: true, via: 'cancelButton', pressed: 0, closed: true, pid: 300});
    assert.ok(Array.isArray(out.at));
    const stuck = device({closes: false});
    assert.equal((await main(['panel', 'cancel', '--run', dir, '--window', '994'], {io: stuck.io})).answer.closed, false);
    // A window already gone: nothing to press, and closed.
    const gone = {...io, screen: () => ({windows: [DOCUMENT]})};
    assert.deepEqual((await main(['panel', 'cancel', '--run', dir, '--window', '994'], {io: gone})).answer, {found: false, closed: true});
  });
});
