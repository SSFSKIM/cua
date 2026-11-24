// The hosted venue (ruling 1169; scripts/hosted-sittings/venue.mjs): where each scene window stands on a GitHub-hosted
// runner, chosen once in setup from the alert windows read fresh after the mode switch, TextEdit's own preferences that
// size its windows and place its Open panel, the record that declares every frame differing from the mini's, and the
// check that both sides of a pair stood on one frame.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import test from 'node:test';
import {
  HOSTED_SIZES, MINI_FRAMES, PANEL_FRAME_KEY, PANEL_SIZE_KEY, PERSISTENCE_KEY, TEXTEDIT_DOCUMENT_VIEW, TEXTEDIT_DOMAIN, TEXTEDIT_WIDTH_IN_CHARS, clearTextEditSavedState, frameAsymmetry, hostedFrames, panelFrameSplits, readBackRows,
  renderReadBack, renderVenue, savedFrameString, sceneFrames, textEditContainerDomain, textEditDocumentPlan, textEditSavedStates, textEditWrites, UNTITLED_AT_LAUNCH_KEY, venueRecord, writeTextEditDefaults,
} from '../../scripts/hosted-sittings/venue.mjs';
import {SCENES, textEditDocument} from '../../scripts/repl-parity/scenes-mac.mjs';
import {FINDER_FRAME} from '../../scripts/repl-parity/scenes-mac-finder.mjs';
import {chromeDragFromField, ELECTRON_FIELD_LAYOUT, NOT_APPLICABLE} from '../../scripts/native-matrix/plan.mjs';
import {POINTERDOWN} from '../../scripts/native-matrix/fixtures/scene-page.mjs';

const rect = (x, y, width, height) => ({x, y, width, height});
const DISPLAY = rect(0, 0, 1920, 1080);
// Pilot A's re-run (run 45252131587): the two capture alerts re-centred by the switch to 1920x1080.
const ALERTS = [{number: 31, layer: 8, bounds: rect(830, 188, 260, 348)}, {number: 59, layer: 8, bounds: rect(893, 244, 260, 364)}];
const HOSTED = {RUNNER_ENVIRONMENT: 'github-hosted'};
const HOME = '/Users/runner';
const sha256 = text => createHash('sha256').update(text).digest('hex');
const lstatOrNull = path => { try { return lstatSync(path); } catch { return null; } };

test('the mini\'s frames are the scenes\' own; the hosted sizes are the ruling\'s: Chrome 800x760, the fixture unchanged, Finder 800x520', () => {
  assert.deepEqual(MINI_FRAMES, {chrome: SCENES.chrome.placement, electron: SCENES.electron.placement, finder: FINDER_FRAME});
  assert.deepEqual(HOSTED_SIZES.chrome, {width: 800, height: 760});
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
  assert.deepEqual(frames, {chrome: rect(22, 60, 800, 760), electron: rect(102, 100, 720, 560), finder: rect(22, 80, 800, 520), openPanel: rect(80, 80, 720, 440)});
  assert.deepEqual(scenes.chrome, {base: rect(80, 60, 800, 760), frame: rect(22, 60, 800, 760), moved: true});
  assert.deepEqual(scenes.openPanel, {base: rect(80, 80, 720, 440), frame: rect(80, 80, 720, 440), moved: false});
  for (const frame of Object.values(frames)) assert.ok(frame.x + frame.width <= 830 - 8, `${JSON.stringify(frame)} stays left of the alerts`);
  // No alert: every frame is its base, unmoved.
  assert.deepEqual(hostedFrames([], [DISPLAY]).frames.chrome, rect(80, 60, 800, 760));
  // Unread (null alerts): the bases, unplaced, with the reason; the guard then refuses what overlaps.
  const unread = hostedFrames(null, null);
  assert.deepEqual(unread.frames.chrome, rect(80, 60, 800, 760));
  assert.match(unread.scenes.chrome.reason, /the window list was unread/);
  // No clear frame on the display: the base is kept, the reason recorded.
  const tight = hostedFrames([{number: 1, bounds: rect(0, 0, 1920, 1080)}], [DISPLAY]);
  assert.deepEqual(tight.frames.finder, rect(80, 80, 800, 520));
  assert.match(tight.scenes.finder.reason, /no 800x520 frame on the display clears the alert windows/);
});

// Pilot B (run 45274556933): the parity TextEdit scene, its RTF opened as a file, stood at 213,78 627x877 on both sides
// (Letter paper's 612 points and a 15-point scroller: WidthInChars sizes new documents only), its right edge 840 over
// alert 31. The venue declares the document's own view size instead. Its window is the view, TextEdit's padding (5 a
// side) and the scroller; its origin is AppKit's cascade: 213 (pilot B) and 242 (pilot A's new document) read so far,
// one cascade step of 30 more allowed. The sum must stay inside the strip's 822.
test('TextEdit\'s scene document view: the window it makes stays inside the strip from any cascade origin read so far, one step more', () => {
  assert.deepEqual(TEXTEDIT_DOCUMENT_VIEW, {width: 480, height: 792});
  const furthest = Math.max(213, 242) + 30, chrome = 627 - 612 + 2 * 5;
  assert.ok(furthest + TEXTEDIT_DOCUMENT_VIEW.width + chrome <= 830 - 8, `${furthest + TEXTEDIT_DOCUMENT_VIEW.width + chrome}`);
  // The height is the paper's, as TextEdit took it unasked (877 = 792 and its bars), so the rows shown stay.
  assert.equal(TEXTEDIT_DOCUMENT_VIEW.height, 792);
  const plan = textEditDocumentPlan();
  assert.deepEqual(plan.view, TEXTEDIT_DOCUMENT_VIEW);
  assert.equal(plan.controlWords, '\\vieww9600\\viewh15840');
  for (const layout of ['default', 'wide-page']) {
    assert.deepEqual(plan.sha256[layout], {mini: sha256(textEditDocument({layout}).rtf), hosted: sha256(textEditDocument({layout, view: TEXTEDIT_DOCUMENT_VIEW}).rtf)}, layout);
    assert.notEqual(plan.sha256[layout].mini, plan.sha256[layout].hosted);
  }
  // The goldens' provenance names both files' hashes, so the recording's document and the hosted one are told apart.
  const provenance = readFileSync(new URL('../native-goldens/PROVENANCE.md', import.meta.url), 'utf8');
  for (const [layout, {mini, hosted}] of Object.entries(plan.sha256)) assert.ok(provenance.includes(mini) && provenance.includes(hosted), `PROVENANCE.md names ${layout}'s hashes`);
});

test('TextEdit\'s preferences: its own domain only, its width in characters, the Open panel\'s saved frame in AppKit\'s coordinates and its size', () => {
  assert.equal(TEXTEDIT_DOMAIN, 'com.apple.TextEdit');
  // AppKit's saved-frame string: the frame with its origin at the main display's bottom left, then the screen's visible
  // frame (the display less the 25-point menu bar).
  assert.equal(savedFrameString(rect(80, 80, 720, 440), DISPLAY), '80 560 720 440 0 0 1920 1055 ');
  const writes = textEditWrites(rect(80, 80, 720, 440), DISPLAY);
  assert.deepEqual(writes, [
    {key: 'WidthInChars', type: 'int', value: String(TEXTEDIT_WIDTH_IN_CHARS)},
    {key: UNTITLED_AT_LAUNCH_KEY, type: 'bool', value: 'NO', readsAs: '0'},
    {key: PERSISTENCE_KEY, type: 'bool', value: 'YES', readsAs: '1'},
    {key: PANEL_FRAME_KEY, type: 'string', value: '80 560 720 440 0 0 1920 1055 '},
    {key: PANEL_SIZE_KEY, type: 'string', value: '{720, 440}'},
  ]);
  assert.equal(PERSISTENCE_KEY, 'ApplePersistenceIgnoreState');
  assert.equal(PANEL_FRAME_KEY, 'NSWindow Frame NSNavPanelAutosaveName');
  assert.equal(PANEL_SIZE_KEY, 'NSNavPanelExpandedSizeForOpenMode');
  // An argument the scenes launch with overrides the domain for that launch, so one naming a key written here must carry
  // the value written (the parity scenes' -NSRequiresOpenUntitledWindowAtLaunch NO and -ApplePersistenceIgnoreState YES).
  const args = SCENES.textedit.launchArgs;
  for (const {key, value} of writes) {
    const at = args.indexOf(`-${key}`);
    if (at >= 0) assert.equal(args[at + 1], value, key);
  }
  assert.ok(args.includes(`-${UNTITLED_AT_LAUNCH_KEY}`) && args.includes(`-${PERSISTENCE_KEY}`));
});

test('the writes refuse off a GitHub-hosted runner before touching anything, and each is read back', () => {
  const calls = [];
  const exec = (command, args) => { calls.push([command, ...args]); return {status: 0, stdout: '', stderr: ''}; };
  const writes = textEditWrites(rect(80, 80, 720, 440), DISPLAY);
  // Ruling 1181: the venue's TextEdit preferences stay unrestored only because this refusal is the one way to write them,
  // for every key the venue sets.
  assert.deepEqual(writes.map(w => w.key), ['WidthInChars', UNTITLED_AT_LAUNCH_KEY, PERSISTENCE_KEY, 'NSWindow Frame NSNavPanelAutosaveName', 'NSNavPanelExpandedSizeForOpenMode']);
  for (const [env, platform] of [[{}, 'darwin'], [{RUNNER_ENVIRONMENT: 'self-hosted'}, 'darwin'], [HOSTED, 'linux']]) {
    for (const write of writes) assert.throws(() => writeTextEditDefaults([write], {env, platform, exec}), /refused/, write.key);
    assert.throws(() => writeTextEditDefaults(writes, {env, platform, exec}), /refused/);
  }
  assert.deepEqual(calls, [], 'the owner\'s defaults are never written');
  // TextEdit is sandboxed: it reads its container's plist, which a write to the plain domain need not reach (pilot A's
  // re-run, run 45277221729: WidthInChars 60 read back from the domain, and TextEdit's new document took 75). Each key is
  // written to the domain, read back from both, and written through the container's path when the container does not
  // hold it; only the container's read-back says the key is in force.
  const container = textEditContainerDomain(HOME);
  assert.equal(container, `${HOME}/Library/Containers/com.apple.TextEdit/Data/Library/Preferences/com.apple.TextEdit`);
  const fakeDefaults = ({mirror}) => {
    const stores = new Map([[TEXTEDIT_DOMAIN, new Map()], [container, new Map()]]);
    return (command, args) => {
      calls.push([command, ...args]);
      const [verb, domain, key, , value] = args;
      assert.ok(stores.has(domain), `TextEdit's own domain or its container only: ${domain}`);
      if (verb === 'write') {
        const stored = args[3] === '-bool' ? (/^(YES|true|1)$/i.test(value) ? '1' : '0') : value;
        for (const d of domain === TEXTEDIT_DOMAIN && mirror ? [TEXTEDIT_DOMAIN, container] : [domain]) stores.get(d).set(key, stored);
        return {status: 0, stdout: '', stderr: ''};
      }
      const store = stores.get(domain);
      return store.has(key) ? {status: 0, stdout: `${store.get(key).trimEnd()}\n`, stderr: ''} : {status: 1, stdout: '', stderr: 'does not exist'};
    };
  };
  calls.length = 0;
  const done = writeTextEditDefaults(writes, {env: HOSTED, platform: 'darwin', home: HOME, exec: fakeDefaults({mirror: false})});
  assert.equal(done.ok, true);
  assert.equal(done.container, container);
  assert.deepEqual(done.writes.map(w => [w.key, w.matched]), writes.map(w => [w.key, true]));
  assert.deepEqual(calls.slice(0, 5), [['/usr/bin/defaults', 'write', TEXTEDIT_DOMAIN, 'WidthInChars', '-int', '60'], ['/usr/bin/defaults', 'read', TEXTEDIT_DOMAIN, 'WidthInChars'],
    ['/usr/bin/defaults', 'read', container, 'WidthInChars'], ['/usr/bin/defaults', 'write', container, 'WidthInChars', '-int', '60'], ['/usr/bin/defaults', 'read', container, 'WidthInChars']]);
  assert.deepEqual(done.writes[0], {key: 'WidthInChars', value: '60', written: true, readBack: '60', container: {readBack: '60', readBackBefore: null, written: true}, matched: true});
  // Where the domain's write reaches the container, nothing is written through; the record says so.
  calls.length = 0;
  const mirrored = writeTextEditDefaults(writes, {env: HOSTED, platform: 'darwin', home: HOME, exec: fakeDefaults({mirror: true})});
  assert.equal(mirrored.ok, true);
  assert.deepEqual(mirrored.writes[0].container, {readBack: '60'});
  assert.ok(!calls.some(c => c[1] === 'write' && c[2] === container));
  // A read-back that is not the value written is not in force: the step fails rather than declare it.
  const stuck = writeTextEditDefaults(writes, {env: HOSTED, platform: 'darwin', home: HOME, exec: (command, args) => (args[0] === 'read' ? {status: 0, stdout: '75\n'} : {status: 0, stdout: ''})});
  assert.equal(stuck.ok, false);
  assert.deepEqual([stuck.writes[0].readBack, stuck.writes[0].container.readBack], ['75', '75']);
  // The domain read back as written but the container not: not in force.
  const domainOnly = writeTextEditDefaults(writes.slice(0, 1), {env: HOSTED, platform: 'darwin', home: HOME, exec: (command, args) => (args[0] === 'read' ? {status: 0, stdout: args[1] === TEXTEDIT_DOMAIN ? '60\n' : '75\n'} : {status: 0, stdout: ''})});
  assert.deepEqual([domainOnly.writes[0].readBack, domainOnly.writes[0].container.readBack, domainOnly.ok], ['60', '75', false]);
  // A bool reads back as 0 or 1, never as the word written: NO is in force only when it reads 0.
  const bool = writes.filter(w => w.key === UNTITLED_AT_LAUNCH_KEY);
  for (const [printed, matched] of [['0', true], ['1', false], ['NO', false]]) {
    const [done] = writeTextEditDefaults(bool, {env: HOSTED, platform: 'darwin', home: HOME, exec: (command, args) => (args[0] === 'read' ? {status: 0, stdout: `${printed}\n`} : {status: 0, stdout: ''})}).writes;
    assert.deepEqual([done.readsAs, done.matched], ['0', matched], printed);
  }
});

// Pilot A's re-run (run 45277221729): vv-1's TextEdit launch window stood at 241,87 586x488, the frame every vv run reads,
// with NSRequiresOpenUntitledWindowAtLaunch NO in force: the warm-ups end TextEdit by pid, so its saved application
// state outlives it and the next launch restores that window. Setup removes the state outside the container and records
// what it removed; only on a hosted runner. Nothing under ~/Library/Containers is touched by a file call (App Data
// protection's dialog): the container's restoration rests on ApplePersistenceIgnoreState, through defaults.
test('TextEdit\'s saved application state removed on a hosted runner only, each path recorded: existed, removed, or why not', () => {
  assert.deepEqual(textEditSavedStates(HOME), [`${HOME}/Library/Saved Application State/com.apple.TextEdit.savedState`]);
  const touched = [], fake = {lstat: path => { touched.push(path); return {isDirectory: () => true, isSymbolicLink: () => false}; }, unlink: path => touched.push(path), removeTree: path => touched.push(path)};
  for (const [env, platform] of [[{}, 'darwin'], [HOSTED, 'linux']]) {
    assert.throws(() => clearTextEditSavedState(HOME, {env, platform, fs: fake}), /refused/);
  }
  assert.deepEqual(touched, [], 'nothing read or removed off a runner');
  const [plain] = textEditSavedStates(HOME);
  assert.deepEqual(clearTextEditSavedState(HOME, {env: HOSTED, platform: 'darwin', fs: fake}), [{path: plain, existed: true, removed: true}]);
  assert.ok(touched.every(path => !path.includes('/Library/Containers/')), 'no file call under the containers');
  // Only ENOENT is absence; any other error is recorded as one, and a refused removal keeps its error.
  const failing = code => ({...fake, lstat: path => (path === plain ? (() => { throw Object.assign(new Error(`${code}: no`), {code}); })() : fake.lstat(path))});
  assert.deepEqual(clearTextEditSavedState(HOME, {env: HOSTED, platform: 'darwin', fs: failing('ENOENT')}), [{path: plain, existed: false, removed: false}]);
  assert.deepEqual(clearTextEditSavedState(HOME, {env: HOSTED, platform: 'darwin', fs: failing('EACCES')}), [{path: plain, existed: null, removed: false, error: 'EACCES: no'}]);
  const denied = clearTextEditSavedState(HOME, {env: HOSTED, platform: 'darwin', fs: {...fake, removeTree: () => { throw new Error('EPERM: operation not permitted'); }}});
  assert.deepEqual(denied.map(d => [d.existed, d.removed, d.error]), [[true, false, 'EPERM: operation not permitted']]);
});

// No link is followed (the review): a link at the state's path could lead into the container. On a real file system
// under a scratch home: a link into a fake container's saved state is unlinked and its target kept; a dangling link is
// unlinked; a folder that is itself a link is not followed; a real folder is removed.
test('the saved-state cleanup never follows a link: the link removed, never its target; a linked folder left alone', () => {
  const home = mkdtempSync(join(tmpdir(), 'venue-home-'));
  try {
    const states = join(home, 'Library', 'Saved Application State'), [plain] = textEditSavedStates(home);
    const target = join(home, 'Library', 'Containers', 'com.apple.TextEdit', 'Data', 'Library', 'Saved Application State', 'com.apple.TextEdit.savedState');
    mkdirSync(target, {recursive: true});
    writeFileSync(join(target, 'windows.plist'), 'x');
    mkdirSync(states, {recursive: true});
    const run = () => clearTextEditSavedState(home, {env: HOSTED, platform: 'darwin'});
    symlinkSync(target, plain);
    assert.deepEqual(run(), [{path: plain, existed: true, removed: true, link: true}]);
    assert.ok(existsSync(join(target, 'windows.plist')), 'the container\'s state is untouched');
    assert.equal(existsSync(plain) || lstatOrNull(plain) !== null, false);
    symlinkSync(join(home, 'nowhere'), plain);
    assert.deepEqual(run(), [{path: plain, existed: true, removed: true, link: true}]);
    assert.equal(lstatOrNull(plain), null, 'the dangling link itself is gone');
    mkdirSync(plain);
    writeFileSync(join(plain, 'windows.plist'), 'x');
    assert.deepEqual(run(), [{path: plain, existed: true, removed: true}]);
    assert.equal(existsSync(plain), false);
    rmSync(states, {recursive: true});
    symlinkSync(dirname(target), states);
    assert.deepEqual(run(), [{path: plain, existed: null, removed: false, error: 'its folder is a link: not followed'}]);
    assert.ok(existsSync(join(target, 'windows.plist')));
    rmSync(states);
    assert.deepEqual(run(), [{path: plain, existed: false, removed: false}]);
  } finally {
    rmSync(home, {recursive: true, force: true});
  }
});

test('the venue record declares each frame that differs from the mini\'s: the frame, the alerts read fresh as the reason, the cells grounded on it', () => {
  const placed = hostedFrames(ALERTS, [DISPLAY]);
  const venue = venueRecord({alerts: ALERTS, displays: [DISPLAY], placed, textEdit: {domain: TEXTEDIT_DOMAIN, writes: [], ok: true}});
  assert.deepEqual(venue.frames, placed.frames);
  assert.deepEqual(venue.alerts, ALERTS.map(({number, bounds}) => ({number, bounds})));
  assert.deepEqual(venue.display, DISPLAY);
  assert.deepEqual(venue.differences.map(d => d.scene), ['chrome', 'electron', 'finder', 'textedit', 'textedit document', 'openPanel']);
  const chrome = venue.differences.find(d => d.scene === 'chrome');
  assert.deepEqual([chrome.mini, chrome.hosted], [MINI_FRAMES.chrome, rect(22, 60, 800, 760)]);
  assert.match(chrome.reason, /alert 31 \(830,188 260x348\), alert 59 \(893,244 260x364\)/);
  assert.match(chrome.reason, /800x760 on a hosted runner \(ruling 1169\)/);
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
  assert.deepEqual([textedit.mini, textedit.hosted], [{WidthInChars: 75, [UNTITLED_AT_LAUNCH_KEY]: 'YES (AppKit\'s default)', [PERSISTENCE_KEY]: 'NO (AppKit\'s default: windows restored)'},
    {WidthInChars: TEXTEDIT_WIDTH_IN_CHARS, [UNTITLED_AT_LAUNCH_KEY]: 'NO', [PERSISTENCE_KEY]: 'YES', 'saved application state': 'to be removed after the warm-ups, outside the container (venue.textEdit.savedState says what was)'}]);
  assert.match(textedit.reason, /pilot A's re-run, run 45277221729/);
  assert.match(textedit.reason, /read back from TextEdit's container/);
  assert.match(textedit.reason, /242,107 603x505/);
  assert.match(textedit.reason, /241,87 586x488 on the runner's first TextEdit launch and 213,78 387x505 on the next/);
  assert.ok(textedit.cells.includes('textedit/frontmost/drag.select'));
  // The scene document: its view size and both files' hashes, declared, the same plan every side's up reads.
  assert.deepEqual(venue.textEditDocument, textEditDocumentPlan());
  const document = venue.differences.find(d => d.scene === 'textedit document');
  const {sha256: hashes} = textEditDocumentPlan();
  assert.equal(document.mini['view size'], 'none: TextEdit takes the paper\'s width');
  assert.deepEqual([document.mini['sha256 default'], document.mini['sha256 wide-page']], [hashes.default.mini, hashes['wide-page'].mini]);
  assert.equal(document.hosted['view size'], '480x792 (\\vieww9600\\viewh15840)');
  assert.deepEqual([document.hosted['sha256 default'], document.hosted['sha256 wide-page']], [hashes.default.hosted, hashes['wide-page'].hosted]);
  assert.match(document.reason, /213,78 627x877 on both sides \(pilot B, run 45274556933\)/);
  assert.match(document.grounding, /text and attribute runs are the mini's/);
  assert.ok(document.cells.includes('textedit/frontmost/drag.select') && document.cells.some(c => /^native-mac textedit/.test(c)));
  assert.ok(document.cells.some(c => c.startsWith('hscroll/textedit-wide-page/right')), 'the wide page\'s horizontal scroll rests on it too');
  const panel = venue.differences.find(d => d.scene === 'openPanel');
  assert.deepEqual(panel.hosted, rect(80, 80, 720, 440));
  assert.match(panel.mini, /centred/);
  // A frame equal to the mini's is no difference: nothing declared for it.
  const same = venueRecord({alerts: [], displays: [DISPLAY], placed: {frames: {...placed.frames, electron: MINI_FRAMES.electron}, scenes: placed.scenes}, textEdit: null});
  assert.ok(!same.differences.some(d => d.scene === 'electron'));
});

test('the venue renders for sitting.md: each difference with its frame, reason and cells; none off a hosted runner', () => {
  const placed = hostedFrames(ALERTS, [DISPLAY]);
  const [plain] = textEditSavedStates(HOME), other = `${HOME}/Library/Saved Application State/other.savedState`;
  const textEdit = {domain: TEXTEDIT_DOMAIN, container: textEditContainerDomain(HOME), ok: true,
    writes: [{key: 'WidthInChars', value: '60', written: true, readBack: '60', container: {readBack: '60', readBackBefore: '75', written: true}, matched: true},
      {key: PERSISTENCE_KEY, value: 'YES', readsAs: '1', written: true, readBack: '1', container: {readBack: '1'}, matched: true}],
    savedState: [{path: plain, existed: true, removed: true}, {path: other, existed: false, removed: false}]};
  const md = renderVenue(venueRecord({alerts: ALERTS, displays: [DISPLAY], placed, textEdit}));
  assert.match(md, /TextEdit's preferences \(com\.apple\.TextEdit, read back from its container's plist\): WidthInChars read back \(written through the container: the domain's write did not reach it\), ApplePersistenceIgnoreState read back\./);
  assert.match(md, new RegExp(`TextEdit's saved application state: removed ${plain.replace(/[.]/g, '\\.')}; none at ${other.replace(/[.]/g, '\\.')}\\.`));
  const notHeld = renderVenue(venueRecord({alerts: ALERTS, displays: [DISPLAY], placed, textEdit: {...textEdit, ok: false,
    writes: [{key: 'WidthInChars', value: '60', written: true, readBack: '60', container: {readBack: '75', readBackBefore: '75', written: false}, matched: false}],
    savedState: [{path: plain, existed: true, removed: false, error: 'EPERM'}]}}));
  assert.match(notHeld, /WidthInChars NOT read back from the container \(75; the domain read 60\)/);
  assert.match(notHeld, /NOT removed .*com\.apple\.TextEdit\.savedState \(EPERM\)/);
  assert.match(md, /^## The venue \(ruling 1169\)/);
  assert.match(md, /\| chrome \| 80,60 1000x760 \| 22,60 800x760 \|/);
  assert.match(md, /chrome\/frontmost\/drag\.select/);
  const {sha256: hashes} = textEditDocumentPlan();
  assert.match(md, new RegExp(`^\\| textedit document \\| view size none: TextEdit takes the paper's width, sha256 default ${hashes.default.mini}, sha256 wide-page ${hashes['wide-page'].mini} \\| view size 480x792 \\(\\\\vieww9600\\\\viewh15840\\), sha256 default ${hashes.default.hosted}, sha256 wide-page ${hashes['wide-page'].hosted} \\|`, 'm'));
  assert.match(renderVenue(null), /no venue recorded/);
});

// A side's frames: the venue it launched on and every window it read back, keyed alike on both sides of a pair.
const matrix = (chrome, finder = rect(22, 80, 800, 520)) => ({complete: true, meta: {venue: {frames: {chrome: rect(22, 60, 800, 760)}},
  placement: {alerts: [], scenes: {chrome: {from: chrome, moved: false}, finder: {from: rect(0, 0, 800, 520), to: finder, moved: true, readBack: finder, matched: true}}, panel: [{beforeRow: 3, number: 9, from: rect(80, 80, 720, 440), moved: false}]}}});
const parity = textedit => ({complete: true, venue: {frames: {}}, scenes: {textedit: {placement: {alerts: [], windows: [{scene: 'textedit', number: 4, from: textedit, moved: false}]}}}});
const baseline = (...frames) => ({complete: true, placement: [{at: 'setup.newDocument', alerts: [], windows: frames.map((from, i) => ({scene: 'textedit', number: 10 + i, from, moved: false}))}]});

test('a side\'s frames from each record shape: the matrix\'s, native-mac\'s and the baseline\'s', () => {
  assert.deepEqual(sceneFrames(matrix(rect(22, 60, 800, 760))), {'venue:chrome': rect(22, 60, 800, 760), chrome: rect(22, 60, 800, 760), finder: rect(22, 80, 800, 520), 'openPanel#1': rect(80, 80, 720, 440)});
  assert.deepEqual(sceneFrames(parity(rect(256, 87, 503, 488))), {'textedit/textedit#1': rect(256, 87, 503, 488)});
  assert.deepEqual(sceneFrames(baseline(rect(256, 87, 503, 488), rect(257, 107, 520, 505))),
    {'setup.newDocument/textedit#1': rect(256, 87, 503, 488), 'setup.newDocument/textedit#2': rect(257, 107, 520, 505)});
  assert.deepEqual(sceneFrames({complete: true}), {});
});

// A window stands where it was last read: its read-back when a move read one back, else where it was read before. Pilot
// B's records (run 45274556933) kept TextEdit's window as moved with no read-back, and the sitting's read-back table then
// said no TextEdit window was read back, though the window stood at 213,78 627x877 on both sides.
test('a side\'s frames keep every window read, where it was last read: a move with no read-back stands where it was read', () => {
  const pilotB = {complete: false, scenes: {textedit: {placement: {alerts: [], windows: [{scene: 'textedit', number: 66, from: rect(213, 78, 627, 877), to: rect(195, 78, 627, 877), moved: true, readBack: null, matched: false}]}}}};
  assert.deepEqual(sceneFrames(pilotB), {'textedit/textedit#1': rect(213, 78, 627, 877)});
  const notMoved = {complete: true, placement: {alerts: [], scenes: {textedit: {from: rect(213, 78, 627, 877), moved: false, reason: 'the frame probe moves Finder windows only'}}}};
  assert.deepEqual(sceneFrames(notMoved), {textedit: rect(213, 78, 627, 877)});
  // A Finder move the probe left part done: where it read back.
  const partly = {complete: true, placement: {alerts: [], scenes: {finder: {from: rect(700, 150, 800, 520), to: rect(22, 80, 800, 520), moved: true, readBack: rect(22, 150, 800, 520), matched: false}}}};
  assert.deepEqual(sceneFrames(partly), {finder: rect(22, 150, 800, 520)});
});

test('symmetry: a pair whose sides stood on different frames names the scene and both frames; one frame, or a side not read, is none', () => {
  assert.equal(frameAsymmetry(matrix(rect(22, 60, 800, 760)), matrix(rect(22, 60, 800, 760))), null);
  assert.match(frameAsymmetry(matrix(rect(30, 60, 800, 760)), matrix(rect(22, 60, 800, 760))), /chrome: 30,60 800x760 on this side, 22,60 800x760 on its pair/);
  assert.match(frameAsymmetry(baseline(rect(256, 87, 503, 488)), baseline(rect(241, 87, 586, 488))), /setup\.newDocument\/textedit#1/);
  // A window one side did not read (its run stopped before it) is no difference: nothing to compare.
  assert.equal(frameAsymmetry(baseline(rect(256, 87, 503, 488)), baseline()), null);
  assert.equal(frameAsymmetry(matrix(rect(22, 60, 800, 760)), null), null);
});

// Recorded checks (1) and (2): where TextEdit's windows and the Open panel actually stood in each run, against what the
// venue planned (TextEdit: its width in characters, its right edge left of the alerts; the panel: its saved frame), and
// whether an alert overlapped them, so sitting.md shows it without opening a meta.json.
test('the read-back of TextEdit and the Open panel per step: planned against actual, and whether an alert overlapped', () => {
  const venue = venueRecord({alerts: ALERTS, displays: [DISPLAY], placed: hostedFrames(ALERTS, [DISPLAY]), textEdit: null});
  const scratch = {placement: {alerts: [], windows: [{scene: 'textedit', number: 3, from: rect(256, 87, 503, 488), moved: false}]}, venue};
  const rows = readBackRows([
    {step: 'vc-1', record: baseline(rect(241, 87, 520, 488), rect(700, 107, 764, 505))},
    {step: 'matrix-cua-1', record: matrix(rect(22, 60, 800, 760))},
    {step: 'textedit up', record: scratch},
    {step: 'cc-1', record: null},
    {step: 'native-mac vendor', record: parity(rect(213, 78, 505, 877))},
    {step: 'matrix-vendor-1', record: {complete: true, meta: {placement: {alerts: [], scenes: {textedit: {from: rect(213, 78, 505, 877), moved: false}}}}}},
  ], venue);
  assert.deepEqual(rows, [
    {step: 'vc-1', window: 'setup.newDocument/textedit#1', planned: 'WidthInChars 60, left of x 830', actual: rect(241, 87, 520, 488), overlap: false},
    {step: 'vc-1', window: 'setup.newDocument/textedit#2', planned: 'WidthInChars 60, left of x 830', actual: rect(700, 107, 764, 505), overlap: true},
    {step: 'matrix-cua-1', window: 'openPanel#1', planned: rect(80, 80, 720, 440), actual: rect(80, 80, 720, 440), overlap: false},
    {step: 'textedit up', window: 'textedit#1', planned: 'WidthInChars 60, left of x 830', actual: rect(256, 87, 503, 488), overlap: false},
    // The scene document, opened from the run's RTF: its view size, not WidthInChars, sizes its window.
    {step: 'native-mac vendor', window: 'textedit/textedit#1', planned: 'view 480x792, left of x 830', actual: rect(213, 78, 505, 877), overlap: false},
    {step: 'matrix-vendor-1', window: 'textedit', planned: 'view 480x792, left of x 830', actual: rect(213, 78, 505, 877), overlap: false},
  ]);
  const md = renderReadBack(rows);
  assert.match(md, /^\| vc-1 \| setup\.newDocument\/textedit#2 \| WidthInChars 60, left of x 830 \| 700,107 764x505 \| yes \|$/m);
  assert.match(md, /^\| matrix-cua-1 \| openPanel#1 \| 80,80 720x440 \| 80,80 720x440 \| no \|$/m);
  assert.match(renderReadBack([]), /No TextEdit window or Open panel was read back/);
});

// Ruling 1199: a panel the matrix resized to fit the strip (the system's 880x448 to the venue's frame), not only moved,
// says so where sitting.md shows its placement, with whether its read-back took the size.
test('the read-back of a panel the run resized: the row carries the resize and the table says it was resized, from and to', () => {
  const venue = venueRecord({alerts: ALERTS, displays: [DISPLAY], placed: hostedFrames(ALERTS, [DISPLAY]), textEdit: null});
  const centred = rect(520, 162, 880, 448), placed = rect(80, 80, 720, 440);
  const resizedPanel = (readBack, extra = {}) => ({complete: true, meta: {placement: {alerts: [], scenes: {}, panel: [
    {beforeRow: 3, target: 'openPanel', number: 994, from: centred, to: placed, readBack, matched: true, moved: true, inStrip: true, resized: {from: centred, to: placed}, ...extra}]}}});
  const rows = readBackRows([{step: 'matrix-cua-1', record: resizedPanel(placed)}, {step: 'matrix-vendor-1', record: resizedPanel(rect(80, 80, 880, 448))}], venue);
  assert.deepEqual(rows[0], {step: 'matrix-cua-1', window: 'openPanel#1', planned: placed, actual: placed, overlap: false, resized: {from: centred, to: placed}});
  const md = renderReadBack(rows);
  assert.match(md, /^\| matrix-cua-1 \| openPanel#1 \| 80,80 720x440 \| 80,80 720x440, resized from 880x448 to 720x440 \| no \|$/m);
  assert.match(md, /^\| matrix-vendor-1 \| openPanel#1 \| 80,80 720x440 \| 80,80 880x448, resized from 880x448 to 720x440, the size not read back \| yes \|$/m);
  // A panel only moved, or not placed at all, says nothing of a resize.
  assert.doesNotMatch(renderReadBack(readBackRows([{step: 'matrix-cua-1', record: matrix(rect(22, 60, 800, 760))}], venue)), /^\|.*resized/m);
});

// Ruling 1203: the panel moved at its own size, its right edge at the strip's: the row plans the frame the run asked, not
// the venue's saved frame; a panel the system clamped says the fallback took it.
test('the read-back of a panel placed at a negative x plans the frame asked; a clamped one names the fallback', () => {
  const venue = venueRecord({alerts: ALERTS, displays: [DISPLAY], placed: hostedFrames(ALERTS, [DISPLAY]), textEdit: null});
  const centred = rect(520, 162, 880, 448), asked = rect(-58, 80, 880, 448);
  const placed = (readBack, extra = {}) => ({complete: true, meta: {placement: {alerts: [], scenes: {}, panel: [
    {beforeRow: 3, target: 'openPanel', opening: 'openPanel/frontmost/getAXState.panel', number: 994, from: centred, to: asked, readBack, matched: true, moved: true, ...extra}]}}});
  const rows = readBackRows([{step: 'matrix-cua-1', record: placed(asked, {inStrip: true})}, {step: 'matrix-vendor-1', record: placed(rect(0, 80, 880, 448), {inStrip: false, fallback: 'clamped'})}], venue);
  assert.deepEqual(rows[0], {step: 'matrix-cua-1', window: 'panel:openPanel/frontmost/getAXState.panel', planned: asked, actual: asked, overlap: false});
  const md = renderReadBack(rows);
  assert.match(md, /^\| matrix-cua-1 \| panel:openPanel\/frontmost\/getAXState\.panel \| -58,80 880x448 \| -58,80 880x448 \| no \|$/m);
  assert.match(md, /^\| matrix-vendor-1 \| panel:openPanel\/frontmost\/getAXState\.panel \| -58,80 880x448 \| 0,80 880x448, x clamped: ruling 1203's fallback \(its pointer cells left to the owner's sitting\) \| yes \|$/m);
});

// Ruling 1168's pointerdown pair ("Pointer target" and "Pointer downs", fixtures/scene-page.mjs POINTERDOWN_INLINE) sits
// inline after Apply. The page has no stylesheet, so the user agent lays it out from the content area's top left, the
// same in any window wide enough for its lines; the mini's golden tree (Chrome at 1000x760 with an infobar under its
// toolbar, so its content area starts lowest) gives Apply's frame. The pair's width is bounded from above (each
// character at most 9 pt, the button's padding and border 16 pt, two separating spaces 5 pt each), so its line neither
// wraps nor leaves the hosted 800x760 window, scrollbar taken off. The window keeps the mini's height, so the whole page
// (down to its Section heading) still fits, which NOT_APPLICABLE's chrome.scroll states. The drag's points come from the
// notes field's frame as read (ruling 1226): on this tree's field (an infobar puts it at y 224-355, where the old fixed
// y 192 lay above it) both lie inside it. The prepare's harness clicks, at run time, prove each end lands in the field.
test('the pointerdown pair and the whole page lie inside the hosted Chrome frame, by the mini\'s measured layout; the drag\'s points inside the field', () => {
  const nodes = JSON.parse(readFileSync(new URL('../native-goldens/chrome/skyshot.json', import.meta.url), 'utf8')).nodes;
  const win = nodes.find(n => n.role === 'AXWindow').frame;
  const inWindow = node => ({x: node.frame.x - win.x, y: node.frame.y - win.y, width: node.frame.width, height: node.frame.height});
  const apply = inWindow(nodes.find(n => n.role === 'AXButton' && n.title === 'Apply'));
  const charsAtMost = 9, buttonChrome = 16, space = 5, scrollbar = 15;
  const pairRight = apply.x + apply.width + space + (POINTERDOWN.button.length * charsAtMost + buttonChrome) + space + POINTERDOWN.text(999).length * charsAtMost;
  const hosted = HOSTED_SIZES.chrome;
  assert.deepEqual([hosted.width, hosted.height], [800, 760]);
  assert.ok(pairRight <= hosted.width - scrollbar, `the pair's line ends by ${pairRight} pt`);
  assert.ok(apply.y + apply.height <= hosted.height, `Apply's line ends ${apply.y + apply.height} pt down`);
  const section = inWindow(nodes.find(n => n.role === 'AXHeading' && n.title === 'Section'));
  assert.ok(section.y + section.height <= hosted.height, `the page ends ${section.y + section.height} pt down: it fits, nothing to scroll`);
  assert.equal(NOT_APPLICABLE.chrome.scroll, 'the scene page fits its window: nothing to scroll');
  const notes = inWindow(nodes.find(n => n.role === 'AXTextArea' && n.title === 'Scene notes'));
  assert.deepEqual([notes.y, notes.y + notes.height], [224, 355]);
  const layout = chromeDragFromField({window: hosted, field: notes});
  assert.deepEqual(layout.window, [800, 760]);
  for (const [x, y] of [layout.from, layout.to]) {
    assert.ok(x > notes.x && x < notes.x + notes.width && x < hosted.width, `x ${x} within the field's width`);
    assert.ok(y > notes.y && y < notes.y + notes.height, `y ${y} within the field's height`);
  }
});

// Review finding 4: the lanes' panel placements are paired by the opening they were made for (the case or pairing,
// ../../scripts/native-matrix/panels.mjs), never by their place in the list: one lane's skipped opening appends nothing,
// so by position its Save sheet would meet the other's Open panel. A panel difference is no run-wide frame split: it is
// that opening's alone (panelFrameSplits), and records from before openings were named are not compared.
test('panel placements pair by opening: a skipped opening shifts nothing, a difference is that opening\'s alone, never the run\'s', () => {
  const open = (opening, frame, target = 'openPanel') => ({beforeRow: 1, target, opening, number: 994, from: frame, moved: false, inStrip: true});
  const record = panel => ({complete: true, meta: {placement: {alerts: [], scenes: {}, panel}}});
  const OPEN = 'openPanel/frontmost/getAXState.panel', SAVE = 'savePanel/frontmost/pressKey.escape';
  const vendor = record([open(SAVE, rect(240, 100, 480, 200), 'savePanel'), open(OPEN, rect(80, 80, 720, 440))]);
  const cua = record([open(OPEN, rect(80, 80, 720, 440))]);
  assert.deepEqual(sceneFrames(cua), {[`panel:${OPEN}`]: rect(80, 80, 720, 440)});
  assert.equal(frameAsymmetry(cua, vendor), null, 'the skipped Save sheet compares with nothing');
  assert.deepEqual([...panelFrameSplits(cua, vendor)], []);
  const moved = record([open(OPEN, rect(22, 80, 720, 440))]);
  assert.equal(frameAsymmetry(moved, vendor), null, 'a panel difference is not the run\'s');
  assert.deepEqual([...panelFrameSplits(moved, vendor)], [[OPEN, `panel:${OPEN}: 22,80 720x440 on this side, 80,80 720x440 on its pair`]]);
  // One opening with two placements (two windows read for it): which stood where is not known, so it is not compared.
  const twice = record([open(OPEN, rect(22, 80, 720, 440)), open(OPEN, rect(300, 300, 500, 300))]);
  assert.deepEqual(sceneFrames(twice), {});
  assert.deepEqual([...panelFrameSplits(twice, vendor)], []);
  // A record from before openings were named: not paired at all.
  const legacy = record([{beforeRow: 1, number: 994, from: rect(22, 80, 720, 440), moved: false}]);
  assert.deepEqual([...panelFrameSplits(legacy, vendor)], []);
  assert.equal(frameAsymmetry(legacy, record([{beforeRow: 1, number: 994, from: rect(80, 80, 720, 440), moved: false}])), null);
});
