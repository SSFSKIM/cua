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
    await assert.rejects(main(['panel', 'element', '--run', dir, '--window', '994', '--element', 'cancel'], {io}), /focused, search or name/);
    const off = {env: {}, platform: 'darwin', panelAx: () => assert.fail('the helper is not asked'), screen: () => assert.fail('nothing read')};
    assert.deepEqual((await main(['panel', 'element', '--run', dir, '--window', '994', '--element', 'focused'], {io: off})).answer, {frame: null, refused: MOVE_REFUSED_OFF_HOSTED});
  });
});

// Review finding 2 (ruling 1203): the move writes the panel's position and nothing else; no AXSize write exists for any
// read of its size to enable.
// The review of 5da67ce0a: `empty` writes only when exactly one of the app's top-level windows lies at the bounds, the
// count on its answer; the other commands keep their first-match lookup. The review of the 1248 round: the window
// written and the windows counted come from one frame scan, so geometry moving between two scans cannot make the
// window written another than the one counted unique; the other commands make no second scan.
// Ruling 1278 (b): `caret` and `strip`, TextEdit's document kept around the warm-up's typing, write into a window's
// contents too, so they find their one window as `empty` does.
test('the AX helper\'s field writes (empty, caret, strip) write only with exactly one window at the bounds, its target and its count from one scan, and say how many they found', () => {
  const source = fs.readFileSync(new URL('../../scripts/native-matrix/panel-ax.swift', import.meta.url), 'utf8');
  const verb = source.slice(source.indexOf('if fieldVerbs[args[1]] != nil {'), source.indexOf('if args[1] == "element" {'));
  const scans = [...source.matchAll(/windows\.(first|filter)\(where: atBounds\)|windows\.filter\(atBounds\)/g)].map(m => m[0]);
  assert.deepEqual(scans, ['windows.filter(atBounds)', 'windows.first(where: atBounds)'], 'one scan per verb: the field verbs\' list, or the others\' first match');
  assert.match(source, /let fieldVerbs = \["empty": 6, "caret": 6, "strip": 6\]/);
  assert.match(source, /let emptyMatches: \[AXUIElement\]\? = fieldVerbs\[args\[1\]\] != nil \? windows\.filter\(atBounds\) : nil/);
  assert.match(source, /let topLevel: AXUIElement\? = emptyMatches\.map \{ \$0\.first \} \?\? windows\.first\(where: atBounds\)/);
  assert.doesNotMatch(source, /near\(\$0, bounds\)[^\n]*\.count/, 'no count from a scan of its own');
  assert.match(verb, /let windowMatches = emptyMatches\?\.count \?\? 0/);
  assert.match(verb, /answer\["windowMatches"\] = windowMatches/);
  assert.match(verb, /if windowMatches == 1, let topLevel \{/, 'the walk, and so the write, only under exactly one window');
  assert.match(verb, /let field: AXUIElement\? = windowMatches == 1 && matches\.count == 1 \? matches\.first : nil/, 'every field verb writes only its one field');
});

test('the AX helper\'s move writes AXPosition alone: no write of AXSize anywhere in it; its field writes write only "" or a selection', () => {
  const source = fs.readFileSync(new URL('../../scripts/native-matrix/panel-ax.swift', import.meta.url), 'utf8');
  const writes = [...source.matchAll(/AXUIElementSetAttributeValue\(\s*\w+\s*,\s*(\w+)[^,]*,\s*([^)]+)\)/g)].map(m => [m[1], m[2].trim()]);
  // The others: `empty`'s (ruling 1229(b)), a text field's AXValue, and `strip`'s (ruling 1278 (b)), its selected text,
  // each only ever ""; and the selection `caret` and `strip` make.
  assert.deepEqual([...new Set(writes.map(w => w[0]))], ['kAXPositionAttribute', 'kAXSelectedTextRangeAttribute', 'kAXSelectedTextAttribute', 'kAXValueAttribute']);
  assert.deepEqual(writes.filter(w => ['kAXValueAttribute', 'kAXSelectedTextAttribute'].includes(w[0])).map(w => w[1]), ['"" as CFString', '"" as CFString']);
});

// Pilot C-4: the focused element's reading names it (role, subrole, AXIdentifier), whether or not it lies in the panel.
test('panel element focused: the focused element\'s role, subrole and identifier ride on the answer', async () => {
  await withRun(async dir => {
    const field = rect(560, 96, 220, 22);
    const io = {...HOSTED, screen: () => ({windows: [DOCUMENT, panelOf(rect(0, 80, 880, 448))], displays: [rect(0, 0, 1920, 1080)]}),
      panelAx: () => ({trusted: true, found: true, windows: 2, kind: 'window', element: 'focused', inWindow: true, frame: field, walked: 9,
        focusedElement: {role: 'AXTextField', subrole: null, identifier: 'saveAsNameTextField'}})};
    const out = await main(['panel', 'element', '--run', dir, '--window', '994', '--element', 'focused'], {io});
    assert.deepEqual(out.answer, {found: true, frame: field, inWindow: true, pid: 300, focusedElement: {role: 'AXTextField', subrole: null, identifier: 'saveAsNameTextField'}});
  });
});

// Ruling 1214, item 2: the field's own reading (`search`, or the Save sheet's `name`) with the element hit at its centre.
test('panel element search|name: the field\'s frame and the element at its centre', async () => {
  await withRun(async dir => {
    const field = rect(560, 96, 220, 22), hit = {role: 'AXTextField', subrole: null, identifier: 'saveAsNameTextField', isField: true};
    const asked = [];
    const io = {...HOSTED, screen: () => ({windows: [DOCUMENT, panelOf(rect(0, 80, 880, 448))], displays: [rect(0, 0, 1920, 1080)]}),
      panelAx: args => { asked.push(args); return {trusted: true, found: true, windows: 2, kind: 'window', element: args[3], inWindow: null, frame: field, walked: 9, ...(args[4] === 'hit' ? {hit} : {})}; }};
    const out = await main(['panel', 'element', '--run', dir, '--window', '994', '--element', 'name', '--with', 'hit'], {io});
    assert.deepEqual(out.answer, {found: true, frame: field, inWindow: null, pid: 300, hit});
    assert.deepEqual(asked, [['element', '300', '0,80,880,448', 'name', 'hit']]);
    // The system-wide hit-test is asked for only with `--with hit` (the post-refusal diagnostic), never by the guard's
    // plain read; `hit` is the one reading `--with` names here.
    await main(['panel', 'element', '--run', dir, '--window', '994', '--element', 'search'], {io});
    assert.deepEqual(asked.at(-1), ['element', '300', '0,80,880,448', 'search']);
    await assert.rejects(main(['panel', 'element', '--run', dir, '--window', '994', '--element', 'search', '--with', 'front-key'], {io}), /--with hit/);
    await assert.rejects(main(['panel', 'element', '--run', dir, '--window', '994', '--element', 'focused', '--with', 'hit'], {io}), /--with hit/);
  });
});

// ---- field-empty (ruling 1229(b)): the composing groups' emptying, the same harness write on both lanes ------------

// The user windows' fields, as the engine's emptyField finds them (./plan.mjs TEXT_FIELDS): TextEdit's document text view
// by its AXIdentifier, the Electron fixture's textarea by its aria-label.
const ELECTRON = {pid: 400, window: {number: 20}};
const FIXTURE = {ownerPid: 400, ownerName: 'cua matrix fixture', ownerBundleId: 'com.example.fixture', layer: 0, number: 20, bounds: rect(900, 78, 600, 500)};
const withScenes = async body => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'field-empty-'));
  try { writeState(dir, {scenes: {textedit: TEXTEDIT, electron: ELECTRON}}); return await body(dir); } finally { fs.rmSync(dir, {recursive: true, force: true}); }
};
const emptier = (answer = {}) => {
  const asked = [];
  const io = {...HOSTED, windows: () => [DOCUMENT, FIXTURE],
    panelAx: args => { asked.push(args); return {trusted: true, found: true, windows: 1, kind: 'window', windowMatches: 1, count: 1, walked: 12, settable: true, write: 0, readBack: 0, reads: 1, ...answer}; }};
  return {io, asked};
};

test('field-empty: the user window\'s field, found as emptyField finds it, emptied by the harness\'s AX helper and read back empty', async () => {
  await withScenes(async dir => {
    const {io, asked} = emptier();
    const out = await main(['field-empty', '--run', dir, '--scene', 'textedit'], {io});
    assert.deepEqual(asked, [['empty', '300', '213,78,507,877', 'AXTextArea', 'First Text View']]);
    assert.deepEqual(out.answer, {emptied: true, count: 1, settable: true, write: 0, readBack: 0, reads: 1});
    assert.ok(Array.isArray(out.at) && out.at.length === 2);
    await main(['field-empty', '--run', dir, '--scene', 'electron'], {io});
    assert.deepEqual(asked.at(-1), ['empty', '400', '900,78,600,500', 'AXTextArea', 'Fixture text']);
  });
});

test('field-empty: a write the field refuses, a read-back not empty, or a field that cannot be told is not emptied, with why', async () => {
  await withScenes(async dir => {
    const answerOf = async (answer, scene = 'electron') => (await main(['field-empty', '--run', dir, '--scene', scene], {io: emptier(answer).io})).answer;
    assert.deepEqual(await answerOf({settable: false, write: -25205, readBack: 3, reads: 4}),
      {emptied: false, count: 1, settable: false, write: -25205, readBack: 3, reads: 4, why: 'not-empty', reason: 'the field\'s value read back 3 characters after the write (AXError -25205)'});
    assert.deepEqual((await answerOf({write: 0, readBack: null})).reason, 'the field\'s value read back nothing after the write (AXError 0)');
    assert.deepEqual(await answerOf({count: 2, settable: null, write: null, readBack: null, reads: 0}),
      {emptied: false, count: 2, settable: null, write: null, readBack: null, reads: 0, why: 'fields-ambiguous', reason: 'Accessibility lists 2 matching fields in the window: which one is the field cannot be told'});
    assert.equal((await answerOf({count: 0, settable: null, write: null, readBack: null, reads: 0})).reason, 'Accessibility lists no matching field in the window');
    assert.deepEqual(await answerOf({found: false, kind: null, count: 0, write: null, readBack: null}), {emptied: false, why: 'no-window', reason: 'Accessibility lists no window at the scene window\'s bounds'});
    assert.deepEqual(await answerOf({trusted: false}), {emptied: false, why: 'untrusted', reason: 'the helper is not trusted for Accessibility'});
    // The review of 5da67ce0a: two of the app's windows within the bounds' tolerance, so which is the scene's cannot be told.
    assert.deepEqual(await answerOf({windowMatches: 2, count: null, settable: null, write: null, readBack: null, reads: 0}),
      {emptied: false, windowMatches: 2, why: 'windows-ambiguous', reason: 'Accessibility lists 2 of the app\'s windows at the scene window\'s bounds: which one is the scene\'s cannot be told'});
    // A scene that is not up, or a window not on screen: nothing asked of the helper.
    const none = {...HOSTED, windows: () => [DOCUMENT], panelAx: () => assert.fail('the helper is not asked')};
    assert.deepEqual((await main(['field-empty', '--run', dir, '--scene', 'electron'], {io: none})).answer, {emptied: false, why: 'window-off-screen', reason: 'window 20 is not on screen'});
    await withRun(async only => assert.deepEqual((await main(['field-empty', '--run', only, '--scene', 'electron'], {io: none})).answer, {emptied: false, why: 'scene-not-up', reason: 'the scene is not up in this run'}));
    await assert.rejects(main(['field-empty', '--run', dir, '--scene', 'finder'], {io: none}), /field-empty names a user window's scene/);
  });
});

test('field-empty off a GitHub-hosted runner: refused before anything is read or asked of the helper', async () => {
  await withScenes(async dir => {
    const off = {env: {}, platform: 'darwin', panelAx: () => assert.fail('the helper is not asked'), windows: () => assert.fail('nothing read')};
    assert.deepEqual((await main(['field-empty', '--run', dir, '--scene', 'textedit'], {io: off})).answer, {emptied: false, why: 'off-hosted', refused: MOVE_REFUSED_OFF_HOSTED});
  });
});

// ---- the warm-up's neutral path (ruling 1278 (b)): Chrome's field emptied as the others are, TextEdit's document kept --

// Chrome's typing field, the page's textarea by its aria-label, as emptyField finds it (./plan.mjs TEXT_FIELDS).
const CHROME = {pid: 500, window: {number: 30}};
const PAGE = {ownerPid: 500, ownerName: 'Google Chrome for Testing', ownerBundleId: 'com.google.chrome.for.testing', layer: 0, number: 30, bounds: rect(80, 60, 1000, 760)};
const withWebScenes = async body => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'field-warm-'));
  try { writeState(dir, {scenes: {textedit: TEXTEDIT, chrome: CHROME}}); return await body(dir); } finally { fs.rmSync(dir, {recursive: true, force: true}); }
};
const DIGEST = 'a'.repeat(64);

test('field-empty names Chrome\'s field too: the page\'s textarea by its aria-label, the same write and read-back', async () => {
  await withWebScenes(async dir => {
    const asked = [];
    const io = {...HOSTED, windows: () => [DOCUMENT, PAGE],
      panelAx: args => { asked.push(args); return {trusted: true, found: true, windows: 1, kind: 'window', windowMatches: 1, count: 1, walked: 40, settable: true, write: 0, readBack: 0, reads: 1}; }};
    const out = await main(['field-empty', '--run', dir, '--scene', 'chrome'], {io});
    assert.deepEqual(asked, [['empty', '500', '80,60,1000,760', 'AXTextArea', 'Scene notes']]);
    assert.deepEqual(out.answer, {emptied: true, count: 1, settable: true, write: 0, readBack: 0, reads: 1});
  });
});

test('field-caret: the caret put at the field\'s start by the AX helper; the field\'s length and digest kept in the run directory, never in the answer', async () => {
  await withWebScenes(async dir => {
    const asked = [];
    const helper = answer => ({...HOSTED, windows: () => [DOCUMENT, PAGE],
      panelAx: (args, options) => { asked.push([args, options ?? null]); return {trusted: true, found: true, windows: 1, kind: 'window', windowMatches: 1, count: 1, walked: 12, write: 0, caret: {location: 0, length: 0}, length: 512, digest: DIGEST, ...answer}; }});
    const out = await main(['field-caret', '--run', dir, '--scene', 'textedit'], {io: helper()});
    assert.deepEqual(asked, [[['caret', '300', '213,78,507,877', 'AXTextArea', 'First Text View'], null]]);
    assert.deepEqual(out.answer, {placed: true, count: 1, write: 0, caret: {location: 0, length: 0}, length: 512});
    assert.ok(!JSON.stringify(out).includes(DIGEST), 'the digest stays on the device');
    assert.deepEqual(JSON.parse(fs.readFileSync(join(dir, 'field-textedit.kept'), 'utf8')), {length: 512, digest: DIGEST});
    assert.equal(fs.statSync(join(dir, 'field-textedit.kept')).mode & 0o777, 0o600);
    const answerOf = async answer => (await main(['field-caret', '--run', dir, '--scene', 'textedit'], {io: helper(answer)})).answer;
    assert.deepEqual(await answerOf({write: -25200, caret: {location: 40, length: 0}}),
      {placed: false, count: 1, write: -25200, caret: {location: 40, length: 0}, length: 512, why: 'caret-elsewhere', reason: 'the caret read back at 40 (length 0) after the write (AXError -25200), not at the field\'s start'});
    assert.equal((await answerOf({length: null, digest: null})).why, 'value-unread');
    assert.equal((await answerOf({digest: 'not a digest'})).why, 'value-unread');
    assert.equal((await answerOf({count: 2, write: null, caret: null, length: null, digest: null})).why, 'fields-ambiguous');
    assert.ok(!fs.existsSync(join(dir, 'field-textedit.kept')), 'a caret not placed keeps nothing for a strip to trust');
  });
});

test('field-strip: the kept length and digest handed to the AX helper on its stdin, never its command line; what was typed before the field\'s own text removed and read back', async () => {
  await withWebScenes(async dir => {
    const asked = [];
    const helper = answer => ({...HOSTED, windows: () => [DOCUMENT, PAGE],
      panelAx: (args, options) => {
        asked.push([args, options ?? null]);
        if (args[0] === 'caret') return {trusted: true, found: true, windows: 1, kind: 'window', windowMatches: 1, count: 1, walked: 12, write: 0, caret: {location: 0, length: 0}, length: 512, digest: DIGEST};
        return {trusted: true, found: true, windows: 1, kind: 'window', windowMatches: 1, count: 1, walked: 12, removed: 7, select: 0, selected: true, write: 0, readBack: 512, reads: 1, restored: true, ...answer};
      }});
    // Nothing kept yet: nothing is asked of the helper.
    assert.deepEqual((await main(['field-strip', '--run', dir, '--scene', 'textedit'], {io: helper()})).answer, {restored: false, why: 'not-kept', reason: 'no field-caret answer is kept for the scene: nothing was removed'});
    assert.deepEqual(asked, []);
    await main(['field-caret', '--run', dir, '--scene', 'textedit'], {io: helper()});
    const out = await main(['field-strip', '--run', dir, '--scene', 'textedit'], {io: helper()});
    assert.deepEqual(asked.at(-1), [['strip', '300', '213,78,507,877', 'AXTextArea', 'First Text View'], {input: `512\n${DIGEST}\n`}]);
    assert.ok(asked.every(([args]) => !args.includes(DIGEST)), 'the digest never on a command line');
    assert.deepEqual(out.answer, {restored: true, count: 1, removed: 7, select: 0, selected: true, write: 0, readBack: 512, reads: 1});
    assert.ok(!JSON.stringify(out).includes(DIGEST));
    const answerOf = async answer => (await main(['field-strip', '--run', dir, '--scene', 'textedit'], {io: helper(answer)})).answer;
    assert.deepEqual(await answerOf({removed: 0, select: null, selected: null, write: null, readBack: 512, reads: 0, restored: true}),
      {restored: true, count: 1, removed: 0, select: null, selected: null, write: null, readBack: 512, reads: 0});
    const refused = {removed: null, select: null, selected: null, write: null, readBack: null, reads: 0, restored: false};
    assert.deepEqual([(await answerOf({...refused, refused: 'other'})).why, (await answerOf({...refused, refused: 'shorter'})).why, (await answerOf({...refused, refused: 'unread'})).why],
      ['not-own-text', 'shorter', 'value-unread']);
    // The selection not read back as the intended range: nothing deleted.
    const unconfirmed = await answerOf({removed: null, select: 0, selected: false, write: null, readBack: null, reads: 0, restored: false, refused: 'select'});
    assert.deepEqual([unconfirmed.why, unconfirmed.reason], ['selection-unconfirmed', 'the selection did not read back as the typed range: nothing was removed']);
    assert.equal((await answerOf({restored: false, readBack: 509, reads: 4, write: -25205})).why, 'read-back');
    const off = {env: {}, platform: 'darwin', panelAx: () => assert.fail('the helper is not asked'), windows: () => assert.fail('nothing read')};
    assert.deepEqual((await main(['field-strip', '--run', dir, '--scene', 'textedit'], {io: off})).answer, {restored: false, why: 'off-hosted', refused: MOVE_REFUSED_OFF_HOSTED});
    assert.deepEqual((await main(['field-caret', '--run', dir, '--scene', 'textedit'], {io: off})).answer, {placed: false, why: 'off-hosted', refused: MOVE_REFUSED_OFF_HOSTED});
  });
});

// The review of the warm-up (finding 1): the strip deletes only once the typed range is set and read back as set.
test('the AX helper\'s strip reads its length and digest from stdin and deletes only after the selection read back as the typed range', () => {
  const source = fs.readFileSync(new URL('../../scripts/native-matrix/panel-ax.swift', import.meta.url), 'utf8');
  const strip = source.slice(source.indexOf('if args[1] == "strip" {'), source.indexOf('answer["settable"] = NSNull()'));
  assert.match(source, /let fieldVerbs = \["empty": 6, "caret": 6, "strip": 6\]/, 'no length or digest among its arguments');
  assert.match(source, /let stripInput: \(length: Int, digest: String\)\? = args\[1\] != "strip" \? nil : \{\n\s+guard let length = readLine\(\)[^\n]*let digest = readLine\(\)/);
  assert.match(strip, /let \(length, own\) = stripInput!/);
  const select = strip.indexOf('writeRange(field, 0, extra)'), confirm = strip.indexOf('selectedRange(field)'), remove = strip.indexOf('kAXSelectedTextAttribute');
  assert.ok(select > 0 && confirm > select && remove > confirm, 'set, read back, then delete');
  assert.match(strip, /answer\["refused"\] = "select"/);
});
