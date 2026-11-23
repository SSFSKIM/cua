// The hosted venue (ruling 1169; scripts/hosted-sittings/venue.mjs): where each scene window stands on a GitHub-hosted
// runner, chosen once in setup from the alert windows read fresh after the mode switch, TextEdit's own preferences that
// size its windows and place its Open panel, the record that declares every frame differing from the mini's, and the
// check that both sides of a pair stood on one frame.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {
  HOSTED_SIZES, MINI_FRAMES, PANEL_FRAME_KEY, PANEL_SIZE_KEY, TEXTEDIT_DOMAIN, TEXTEDIT_WIDTH_IN_CHARS, frameAsymmetry, hostedFrames, renderVenue, savedFrameString, sceneFrames,
  textEditWrites, venueRecord, writeTextEditDefaults,
} from '../../scripts/hosted-sittings/venue.mjs';
import {SCENES} from '../../scripts/repl-parity/scenes-mac.mjs';
import {FINDER_FRAME} from '../../scripts/repl-parity/scenes-mac-finder.mjs';
import {ELECTRON_FIELD_LAYOUT} from '../../scripts/native-matrix/plan.mjs';
import {POINTERDOWN} from '../../scripts/native-matrix/fixtures/scene-page.mjs';

const rect = (x, y, width, height) => ({x, y, width, height});
const DISPLAY = rect(0, 0, 1920, 1080);
// Pilot A's re-run (run 45252131587): the two capture alerts re-centred by the switch to 1920x1080.
const ALERTS = [{number: 31, layer: 8, bounds: rect(830, 188, 260, 348)}, {number: 59, layer: 8, bounds: rect(893, 244, 260, 364)}];
const HOSTED = {RUNNER_ENVIRONMENT: 'github-hosted'};

test('the mini\'s frames are the scenes\' own; the hosted sizes are the ruling\'s: Chrome 800x600, the fixture unchanged, Finder 800x520', () => {
  assert.deepEqual(MINI_FRAMES, {chrome: SCENES.chrome.placement, electron: SCENES.electron.placement, finder: FINDER_FRAME});
  assert.deepEqual(HOSTED_SIZES.chrome, {width: 800, height: 600});
  assert.deepEqual(HOSTED_SIZES.finder, {width: 800, height: 520});
  // The Electron fixture keeps its size, so ELECTRON_FIELD_LAYOUT (and #259's point) stays grounded as it is: a change
  // here would need it re-grounded on the new size first.
  assert.deepEqual(HOSTED_SIZES.electron, {width: SCENES.electron.placement.width, height: SCENES.electron.placement.height});
  assert.deepEqual([HOSTED_SIZES.electron.width, HOSTED_SIZES.electron.height], ELECTRON_FIELD_LAYOUT.window);
  // Finder keeps its height, so its list shows the rows it shows on the mini (hold 2b).
  assert.equal(HOSTED_SIZES.finder.height, FINDER_FRAME.height);
});

test('the hosted frames: each the hosted size at the mini\'s origin, moved clear of the fresh alerts by the shared clearFrame; all in the left strip', () => {
  const {frames, scenes} = hostedFrames(ALERTS, [DISPLAY]);
  assert.deepEqual(frames, {chrome: rect(22, 60, 800, 600), electron: rect(102, 100, 720, 560), finder: rect(22, 80, 800, 520), openPanel: rect(80, 80, 720, 440)});
  assert.deepEqual(scenes.chrome, {base: rect(80, 60, 800, 600), frame: rect(22, 60, 800, 600), moved: true});
  assert.deepEqual(scenes.openPanel, {base: rect(80, 80, 720, 440), frame: rect(80, 80, 720, 440), moved: false});
  for (const frame of Object.values(frames)) assert.ok(frame.x + frame.width <= 830 - 8, `${JSON.stringify(frame)} stays left of the alerts`);
  // No alert: every frame is its base, unmoved.
  assert.deepEqual(hostedFrames([], [DISPLAY]).frames.chrome, rect(80, 60, 800, 600));
  // Unread (null alerts): the bases, unplaced, with the reason; the guard then refuses what overlaps.
  const unread = hostedFrames(null, null);
  assert.deepEqual(unread.frames.chrome, rect(80, 60, 800, 600));
  assert.match(unread.scenes.chrome.reason, /the window list was unread/);
  // No clear frame on the display: the base is kept, the reason recorded.
  const tight = hostedFrames([{number: 1, bounds: rect(0, 0, 1920, 1080)}], [DISPLAY]);
  assert.deepEqual(tight.frames.finder, rect(80, 80, 800, 520));
  assert.match(tight.scenes.finder.reason, /no 800x520 frame on the display clears the alert windows/);
});

test('TextEdit\'s preferences: its own domain only, its width in characters, the Open panel\'s saved frame in AppKit\'s coordinates and its size', () => {
  assert.equal(TEXTEDIT_DOMAIN, 'com.apple.TextEdit');
  // AppKit's saved-frame string: the frame with its origin at the main display's bottom left, then the screen's visible
  // frame (the display less the 25-point menu bar).
  assert.equal(savedFrameString(rect(80, 80, 720, 440), DISPLAY), '80 560 720 440 0 0 1920 1055 ');
  const writes = textEditWrites(rect(80, 80, 720, 440), DISPLAY);
  assert.deepEqual(writes, [
    {key: 'WidthInChars', type: 'int', value: String(TEXTEDIT_WIDTH_IN_CHARS)},
    {key: PANEL_FRAME_KEY, type: 'string', value: '80 560 720 440 0 0 1920 1055 '},
    {key: PANEL_SIZE_KEY, type: 'string', value: '{720, 440}'},
  ]);
  assert.equal(PANEL_FRAME_KEY, 'NSWindow Frame NSNavPanelAutosaveName');
  assert.equal(PANEL_SIZE_KEY, 'NSNavPanelExpandedSizeForOpenMode');
  // The scenes' launch arguments name none of these keys: an argument would override the domain for that launch, and
  // -ApplePersistenceIgnoreState touches window restoration only, never a preference.
  const named = SCENES.textedit.launchArgs.filter(a => a.startsWith('-')).map(a => a.slice(1));
  for (const {key} of writes) assert.ok(!named.includes(key), key);
  // The width keeps TextEdit's right edge under about 800 at the origins pilot A read (241 and 242, a new document 20
  // points further down): 60 of the default 75 characters scale the widest window read (627 points) to at most 0.8 of
  // it plus the fixed part.
  assert.ok(242 + 20 + Math.ceil(627 * TEXTEDIT_WIDTH_IN_CHARS / 75) <= 800);
});

test('the writes refuse off a GitHub-hosted runner before touching anything, and each is read back', () => {
  const calls = [];
  const exec = (command, args) => { calls.push([command, ...args]); return {status: 0, stdout: '', stderr: ''}; };
  const writes = textEditWrites(rect(80, 80, 720, 440), DISPLAY);
  for (const [env, platform] of [[{}, 'darwin'], [{RUNNER_ENVIRONMENT: 'self-hosted'}, 'darwin'], [HOSTED, 'linux']]) {
    assert.throws(() => writeTextEditDefaults(writes, {env, platform, exec}), /refused/);
  }
  assert.deepEqual(calls, [], 'the owner\'s defaults are never written');
  const store = new Map();
  const live = (command, args) => {
    calls.push([command, ...args]);
    const [verb, domain, key, , value] = args;
    assert.equal(domain, TEXTEDIT_DOMAIN, 'TextEdit\'s own domain only');
    if (verb === 'write') { store.set(key, value); return {status: 0, stdout: '', stderr: ''}; }
    return store.has(key) ? {status: 0, stdout: `${store.get(key).trimEnd()}\n`, stderr: ''} : {status: 1, stdout: '', stderr: 'does not exist'};
  };
  const done = writeTextEditDefaults(writes, {env: HOSTED, platform: 'darwin', exec: live});
  assert.equal(done.ok, true);
  assert.deepEqual(done.writes.map(w => [w.key, w.matched]), writes.map(w => [w.key, true]));
  assert.deepEqual(calls.slice(0, 2), [['defaults', 'write', TEXTEDIT_DOMAIN, 'WidthInChars', '-int', '60'], ['defaults', 'read', TEXTEDIT_DOMAIN, 'WidthInChars']]);
  // A read-back that is not the value written is not in force: the step fails rather than declare it.
  const stuck = writeTextEditDefaults(writes, {env: HOSTED, platform: 'darwin', exec: (command, args) => (args[0] === 'read' ? {status: 0, stdout: '75\n'} : {status: 0, stdout: ''})});
  assert.equal(stuck.ok, false);
  assert.equal(stuck.writes[0].readBack, '75');
});

test('the venue record declares each frame that differs from the mini\'s: the frame, the alerts read fresh as the reason, the cells grounded on it', () => {
  const placed = hostedFrames(ALERTS, [DISPLAY]);
  const venue = venueRecord({alerts: ALERTS, displays: [DISPLAY], placed, textEdit: {domain: TEXTEDIT_DOMAIN, writes: [], ok: true}});
  assert.deepEqual(venue.frames, placed.frames);
  assert.deepEqual(venue.alerts, ALERTS.map(({number, bounds}) => ({number, bounds})));
  assert.deepEqual(venue.display, DISPLAY);
  assert.deepEqual(venue.differences.map(d => d.scene), ['chrome', 'electron', 'finder', 'textedit', 'openPanel']);
  const chrome = venue.differences.find(d => d.scene === 'chrome');
  assert.deepEqual([chrome.mini, chrome.hosted], [MINI_FRAMES.chrome, rect(22, 60, 800, 600)]);
  assert.match(chrome.reason, /alert 31 \(830,188 260x348\), alert 59 \(893,244 260x364\)/);
  assert.match(chrome.reason, /800x600 on a hosted runner \(ruling 1169\)/);
  // The cells whose points stand on the frame, derived from the matrix's plan, and the native-mac scene's tree.
  assert.ok(chrome.cells.includes('chrome/frontmost/drag.select'));
  assert.ok(chrome.cells.includes('chrome/background/drag.select@textedit'));
  assert.ok(chrome.cells.some(c => /^native-mac chrome/.test(c)));
  const electron = venue.differences.find(d => d.scene === 'electron');
  assert.ok(electron.cells.includes('electron/frontmost/click.point') && electron.cells.includes('electron/frontmost/drag.select'));
  assert.match(electron.grounding, /unchanged at 720x560/);
  const finder = venue.differences.find(d => d.scene === 'finder');
  assert.ok(finder.cells.includes('finder/frontmost/click.row') && finder.cells.includes('finder/frontmost/scroll.down'));
  const textedit = venue.differences.find(d => d.scene === 'textedit');
  assert.deepEqual([textedit.mini, textedit.hosted], [{WidthInChars: 75}, {WidthInChars: TEXTEDIT_WIDTH_IN_CHARS}]);
  assert.match(textedit.reason, /242,107 603x505/);
  assert.ok(textedit.cells.includes('textedit/frontmost/drag.select'));
  const panel = venue.differences.find(d => d.scene === 'openPanel');
  assert.deepEqual(panel.hosted, rect(80, 80, 720, 440));
  assert.match(panel.mini, /centred/);
  // A frame equal to the mini's is no difference: nothing declared for it.
  const same = venueRecord({alerts: [], displays: [DISPLAY], placed: {frames: {...placed.frames, electron: MINI_FRAMES.electron}, scenes: placed.scenes}, textEdit: null});
  assert.ok(!same.differences.some(d => d.scene === 'electron'));
});

test('the venue renders for sitting.md: each difference with its frame, reason and cells; none off a hosted runner', () => {
  const placed = hostedFrames(ALERTS, [DISPLAY]);
  const md = renderVenue(venueRecord({alerts: ALERTS, displays: [DISPLAY], placed, textEdit: {domain: TEXTEDIT_DOMAIN, writes: [], ok: true}}));
  assert.match(md, /^## The venue \(ruling 1169\)/);
  assert.match(md, /\| chrome \| 80,60 1000x760 \| 22,60 800x600 \|/);
  assert.match(md, /chrome\/frontmost\/drag\.select/);
  assert.match(renderVenue(null), /no venue recorded/);
});

// A side's frames: the venue it launched on and every window it read back, keyed alike on both sides of a pair.
const matrix = (chrome, finder = rect(22, 80, 800, 520)) => ({complete: true, meta: {venue: {frames: {chrome: rect(22, 60, 800, 600)}},
  placement: {alerts: [], scenes: {chrome: {from: chrome, moved: false}, finder: {from: rect(0, 0, 800, 520), to: finder, moved: true, readBack: finder, matched: true}}, panel: [{beforeRow: 3, number: 9, from: rect(80, 80, 720, 440), moved: false}]}}});
const parity = textedit => ({complete: true, venue: {frames: {}}, scenes: {textedit: {placement: {alerts: [], windows: [{scene: 'textedit', number: 4, from: textedit, moved: false}]}}}});
const baseline = (...frames) => ({complete: true, placement: [{at: 'setup.newDocument', alerts: [], windows: frames.map((from, i) => ({scene: 'textedit', number: 10 + i, from, moved: false}))}]});

test('a side\'s frames from each record shape: the matrix\'s, native-mac\'s and the baseline\'s', () => {
  assert.deepEqual(sceneFrames(matrix(rect(22, 60, 800, 600))), {'venue:chrome': rect(22, 60, 800, 600), chrome: rect(22, 60, 800, 600), finder: rect(22, 80, 800, 520), 'openPanel#1': rect(80, 80, 720, 440)});
  assert.deepEqual(sceneFrames(parity(rect(256, 87, 503, 488))), {'textedit/textedit#1': rect(256, 87, 503, 488)});
  assert.deepEqual(sceneFrames(baseline(rect(256, 87, 503, 488), rect(257, 107, 520, 505))),
    {'setup.newDocument/textedit#1': rect(256, 87, 503, 488), 'setup.newDocument/textedit#2': rect(257, 107, 520, 505)});
  assert.deepEqual(sceneFrames({complete: true}), {});
});

test('symmetry: a pair whose sides stood on different frames names the scene and both frames; one frame, or a side not read, is none', () => {
  assert.equal(frameAsymmetry(matrix(rect(22, 60, 800, 600)), matrix(rect(22, 60, 800, 600))), null);
  assert.match(frameAsymmetry(matrix(rect(30, 60, 800, 600)), matrix(rect(22, 60, 800, 600))), /chrome: 30,60 800x600 on this side, 22,60 800x600 on its pair/);
  assert.match(frameAsymmetry(baseline(rect(256, 87, 503, 488)), baseline(rect(241, 87, 586, 488))), /setup\.newDocument\/textedit#1/);
  // A window one side did not read (its run stopped before it) is no difference: nothing to compare.
  assert.equal(frameAsymmetry(baseline(rect(256, 87, 503, 488)), baseline()), null);
  assert.equal(frameAsymmetry(matrix(rect(22, 60, 800, 600)), null), null);
});

// Ruling 1168's pointerdown pair ("Pointer target" and "Pointer downs", fixtures/scene-page.mjs POINTERDOWN_INLINE) sits
// inline after Apply. The page has no stylesheet, so the user agent lays it out from the content area's top left, the
// same in any window wide enough for its lines; the mini's golden tree (Chrome at 1000x760 with an infobar under its
// toolbar, so its content area starts lowest) gives Apply's frame. The pair's width is bounded from above (each
// character at most 9 pt, the button's padding and border 16 pt, two separating spaces 5 pt each), so its line neither
// wraps nor leaves the hosted 800x600 window, scrollbar taken off.
test('the pointerdown pair inline after Apply lies inside the hosted Chrome frame, by the mini\'s measured layout', () => {
  const nodes = JSON.parse(readFileSync(new URL('../native-goldens/chrome/skyshot.json', import.meta.url), 'utf8')).nodes;
  const win = nodes.find(n => n.role === 'AXWindow').frame, apply = nodes.find(n => n.role === 'AXButton' && n.title === 'Apply').frame;
  const inWindow = {x: apply.x - win.x, y: apply.y - win.y, width: apply.width, height: apply.height};
  const charsAtMost = 9, buttonChrome = 16, space = 5, scrollbar = 15;
  const pairRight = inWindow.x + inWindow.width + space + (POINTERDOWN.button.length * charsAtMost + buttonChrome) + space + POINTERDOWN.text(999).length * charsAtMost;
  const hosted = HOSTED_SIZES.chrome;
  assert.deepEqual([hosted.width, hosted.height], [800, 600]);
  assert.ok(pairRight <= hosted.width - scrollbar, `the pair's line ends by ${pairRight} pt`);
  assert.ok(inWindow.y + inWindow.height <= hosted.height, `Apply's line ends ${inWindow.y + inWindow.height} pt down`);
});
