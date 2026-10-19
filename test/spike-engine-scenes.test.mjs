// The M0 spike's scenes (scripts/spike/engine/scenes.mjs; the own native engine spec, Verification system part 2 and
// part 5): four scene definitions with fixed states and ten finding-elements targets each, the pairings of the
// non-interference and concurrent-use cells, and the refusal preconditions, judged on injected process and window lists.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  SCENE_IDS, SCENES, PAIRS, BACKGROUND_PAIRINGS, CONCURRENT_USE, CONCURRENT_USE_SHEET, userWindowFor, refusals,
  ownedProcesses, documentWindows, refusingWindows, finderFolderFiles, textEditDocument, describeScenes, FINDER_TYPING_NAME, TEXTEDIT_STYLED_LINE, TEXTEDIT_MARKDOWN_CAP,
  upScene, downScene, preflight, readState, chromeArgs, chromePreferences, electronArgs, sceneCommand, exitCodeFor,
} from '../scripts/spike/engine/scenes.mjs';
import {parseAsns, parseAppInfo, stopRecorded} from '../scripts/spike/engine/scene-processes.mjs';
import {FIXTURE_BUNDLE_ID, FIXTURE_CONTROLS} from '../scripts/spike/engine/fixtures/electron-fixture.mjs';
import {PAGE_CONTROLS} from '../scripts/spike/engine/fixtures/scene-page.mjs';

const CFT = 'com.google.chrome.for.testing', TEXTEDIT = 'com.apple.TextEdit';

test('four scenes, one per family, each with its own bundle id and a process the run owns except Finder\'s', () => {
  assert.deepEqual(SCENE_IDS, ['textedit', 'finder', 'chrome', 'electron']);
  assert.deepEqual(SCENE_IDS.map(id => SCENES[id].bundleId), [TEXTEDIT, 'com.apple.finder', CFT, FIXTURE_BUNDLE_ID]);
  assert.equal(FIXTURE_BUNDLE_ID, 'io.github.ssfskim.cua.fixture.electron');
  assert.deepEqual(SCENE_IDS.map(id => SCENES[id].process), ['run', 'system', 'run', 'run']);
  for (const id of SCENE_IDS) assert.equal(SCENES[id].id, id);
  assert.equal(new Set(SCENE_IDS.map(id => SCENES[id].family)).size, 4);
});

test('every scene has exactly ten targets with distinct ids, each findable by a name or value with its match mode, a subrole or an orientation', () => {
  for (const id of SCENE_IDS) {
    const {targets} = SCENES[id];
    assert.equal(targets.length, 10, id);
    assert.equal(new Set(targets.map(t => t.id)).size, 10, `${id}: target ids are distinct`);
    for (const t of targets) {
      assert.match(t.role, /^AX[A-Z]/, `${id}.${t.id} role`);
      assert.ok(t.name || t.value || t.subrole || t.orientation, `${id}.${t.id} has something to be found by`);
      if (t.name || t.value) assert.ok(['exact', 'prefix'].includes(t.match), `${id}.${t.id} declares how its text is matched`);
      else assert.equal(t.match, undefined, `${id}.${t.id} has no text to match`);
      assert.ok(['run', 'fixture', 'app-ui', 'system-ui'].includes(t.source), `${id}.${t.id} source`);
    }
  }
});

test('the Chrome and Electron targets are every control the harness put into the page and the fixture', () => {
  assert.deepEqual(SCENES.chrome.targets.map(t => t.name).sort(), PAGE_CONTROLS.map(c => c.name).sort());
  assert.deepEqual(SCENES.electron.targets.map(t => t.name).sort(), FIXTURE_CONTROLS.map(c => c.name).sort());
  for (const id of ['chrome', 'electron']) assert.ok(SCENES[id].targets.every(t => t.source === 'fixture'), id);
});

test('the Finder targets name run-owned files from the 200 the scene writes, and the TextEdit document is run content', () => {
  const files = finderFolderFiles();
  assert.equal(files.length, 200);
  assert.equal(new Set(files).size, 200);
  assert.ok(files.every(name => !name.includes('.')), 'no extension, so the owner\'s show-extensions setting cannot change a name');
  const fileTargets = SCENES.finder.targets.filter(t => t.source === 'run' && t.role === 'AXRow');
  assert.ok(fileTargets.length >= 6);
  for (const t of fileTargets) assert.ok(files.includes(t.name), t.name);
  assert.ok(fileTargets.some(t => t.name === files.at(-1)), 'the last file, far below the first screen, is a target');
  const doc = textEditDocument();
  assert.match(doc.rtf, /^\{\\rtf1/);
  const document = SCENES.textedit.targets.find(t => t.id === 'document');
  assert.equal(document.value, doc.lines[0]);
  assert.equal(document.match, 'prefix');
  // The window title may or may not show `.rtf` (the owner's setting): a prefix. Finder's rows are whole names: exact.
  assert.deepEqual(SCENES.textedit.targets.find(t => t.id === 'window'), {id: 'window', role: 'AXWindow', name: 'cua-scene', match: 'prefix', source: 'run'});
  assert.ok(fileTargets.every(t => t.match === 'exact'));
  assert.ok(doc.lines.length >= 60, 'long enough to need the vertical scroll bar target');
  assert.ok(doc.rtf.includes(doc.lines.at(-1)));
  // One bold line for valueMarkdown to render, and the whole text under the engine's Markdown cap, so the fetch happens.
  assert.ok(doc.rtf.includes(`{\\b ${TEXTEDIT_STYLED_LINE}}`));
  assert.equal(SCENES.textedit.fixedState.styledLine, TEXTEDIT_STYLED_LINE);
  assert.ok(doc.lines.join('\n').length <= TEXTEDIT_MARKDOWN_CAP, `${doc.lines.join('\n').length} characters`);
});

test('each scene\'s typing lands on one of its targets; Finder types into its list (type-select), never the search field', () => {
  for (const id of SCENE_IDS) {
    assert.ok(SCENES[id].targets.some(t => t.id === SCENES[id].typing.target), id);
    assert.match(SCENES[id].typing.readBack, /\S/, id);
  }
  const finder = SCENES.finder.typing;
  assert.equal(finder.mode, 'type-select');
  assert.equal(finder.text, SCENES.finder.targets.find(t => t.id === finder.target).name);
  // A long typed name (the concurrent-use cell needs a long action), a file the scene writes, matched exactly.
  assert.equal(finder.text, FINDER_TYPING_NAME);
  assert.equal(finder.text.length, 240);
  assert.ok(Buffer.byteLength(finder.text) < 255 && /^[a-z0-9-]+$/.test(finder.text), 'ASCII, no extension, inside APFS\'s name limit');
  assert.ok(finderFolderFiles().includes(finder.text));
  assert.equal(SCENES.finder.targets.find(t => t.id === finder.target).match, 'exact');
  assert.equal(finder.expectedIntervalMs, 240);
  assert.match(finder.keystroke, /--at/);
  const files = finderFolderFiles();
  assert.deepEqual([...files].sort(), files, 'the long name still sorts in place, between 149 and 151');
  assert.equal(files.indexOf(finder.text), 149);
  assert.ok(!SCENES.finder.targets.some(t => t.subrole === 'AXSearchField' || /search/i.test(t.id)), 'no search field target');
  assert.equal(SCENES.finder.targets.filter(t => t.role === 'AXRow').length, 8);
});

test('pairings: the three named pairs in both directions, never a scene with itself, every scene driven in background', () => {
  assert.deepEqual(PAIRS, [['textedit', 'finder'], ['chrome', 'textedit'], ['electron', 'finder']]);
  assert.equal(BACKGROUND_PAIRINGS.length, 6);
  for (const {driven, user} of BACKGROUND_PAIRINGS) {
    assert.notEqual(driven, user);
    assert.ok(SCENE_IDS.includes(driven) && SCENE_IDS.includes(user));
  }
  assert.deepEqual(new Set(BACKGROUND_PAIRINGS.map(p => p.driven)), new Set(SCENE_IDS));
  // The first pair named for a driven scene is its user window; acceptance 3's cell is TextEdit driven under Finder.
  assert.deepEqual(SCENE_IDS.map(userWindowFor), ['finder', 'textedit', 'textedit', 'finder']);
  assert.throws(() => userWindowFor('safari'), /unknown scene/);
});

test('concurrent use: TextEdit is the user window for Finder and Chrome; the sheet variant drives TextEdit under the Electron field', () => {
  assert.equal(CONCURRENT_USE.user, 'textedit');
  assert.deepEqual(CONCURRENT_USE.driven, ['finder', 'chrome']);
  assert.equal(CONCURRENT_USE_SHEET.driven, 'textedit');
  assert.equal(CONCURRENT_USE_SHEET.user, 'electron');
  assert.equal(CONCURRENT_USE_SHEET.userTarget, SCENES.electron.typing.target);
  assert.equal(CONCURRENT_USE.userTarget, SCENES.textedit.typing.target);
  // Ordered steps: the user window in front, then a new document, dirtied, then super+w with the keystroke posted during it.
  assert.deepEqual(CONCURRENT_USE_SHEET.setup, [{activate: 'electron'}]);
  assert.deepEqual(CONCURRENT_USE_SHEET.steps.map(step => Object.keys(step)[0]), ['pressKey', 'typeText', 'pressKey']);
  assert.deepEqual([CONCURRENT_USE_SHEET.steps[0].pressKey, CONCURRENT_USE_SHEET.steps[2].pressKey], ['super+n', 'super+w']);
  assert.match(CONCURRENT_USE_SHEET.steps[1].typeText, /\S/);
  assert.deepEqual(CONCURRENT_USE_SHEET.steps.map(step => step.keystrokeDuring === true), [false, false, true]);
  for (const cell of [CONCURRENT_USE, CONCURRENT_USE_SHEET]) for (const d of [cell.driven].flat()) assert.notEqual(d, cell.user);
});

test('refusals: a foreign Chrome for Testing or fixture process, a TextEdit, or a Finder window that is not the run\'s', () => {
  const none = refusals({running: [], finderWindows: [], owned: {pids: new Set(), finderWindow: null}});
  assert.deepEqual(none, []);
  const foreign = refusals({running: [{pid: 10, bundleId: CFT}, {pid: 11, bundleId: FIXTURE_BUNDLE_ID}, {pid: 12, bundleId: TEXTEDIT}],
    finderWindows: [{number: 77}], owned: {pids: new Set(), finderWindow: null}});
  assert.deepEqual(foreign.map(r => r.code), ['foreign_scene_process', 'foreign_scene_process', 'textedit_running', 'finder_window']);
  assert.deepEqual(foreign.map(r => r.pids ?? r.windows), [[10], [11], [12], [77]]);
  for (const r of foreign) assert.match(r.message, /\S/);
  // The run's own processes and its own Finder window are not refusals.
  const owned = refusals({running: [{pid: 10, bundleId: CFT}, {pid: 11, bundleId: FIXTURE_BUNDLE_ID}, {pid: 12, bundleId: TEXTEDIT}],
    finderWindows: [{number: 77}], owned: {pids: new Set([10, 11, 12]), finderWindow: 77}});
  assert.deepEqual(owned, []);
  // A second Finder window beside the run's is refused; so is a second instance of a scene's id.
  const second = refusals({running: [{pid: 10, bundleId: CFT}, {pid: 13, bundleId: CFT}], finderWindows: [{number: 77}, {number: 78}],
    owned: {pids: new Set([10]), finderWindow: 77}});
  assert.deepEqual(second.map(r => [r.code, r.pids ?? r.windows]), [['foreign_scene_process', [13]], ['finder_window', [78]]]);
  // Other apps (the owner's Chrome, MAWS's dev Electron) are never a scene's concern.
  assert.deepEqual(refusals({running: [{pid: 20, bundleId: 'com.google.Chrome'}, {pid: 21, bundleId: 'com.github.Electron'}], finderWindows: [], owned: {pids: new Set(), finderWindow: null}}), []);
});

test('owned processes: a recorded pid counts only while it is the same launch', () => {
  const state = {scenes: {
    textedit: {pid: 12, at: 1000}, chrome: {pid: 10, at: 2000, page: {pid: 30, at: 2500}}, electron: {pid: 11, at: 3000},
    finder: {pid: 736, window: {number: 77}},
  }};
  const launches = {12: 1000, 10: 2000, 30: 2500, 11: 9999, 736: 1};
  const owned = ownedProcesses(state, {launchOf: pid => launches[pid] ?? null});
  assert.deepEqual([...owned.pids].sort((a, b) => a - b), [10, 12, 30]);   // 11 was reused; Finder's pid is never the run's
  assert.equal(owned.finderWindow, 77);
  assert.deepEqual(ownedProcesses({scenes: {}}, {launchOf: () => null}), {pids: new Set(), finderWindow: null});
});

test('document windows: Finder\'s menu-bar-sized phantom windows are not windows of the owner\'s', () => {
  const windows = [
    {number: 1, bounds: {x: 295, y: 149, width: 1067, height: 631}, onScreen: false},
    {number: 2, bounds: {x: 0, y: 0, width: 1512, height: 33}, onScreen: false},
    {number: 3, bounds: {x: 10, y: 10, width: 99, height: 400}, onScreen: true},
  ];
  assert.deepEqual(documentWindows(windows).map(w => w.number), [1]);
});

test('the Finder refusal counts only windows on screen: Finder\'s own off-screen document-sized window is a note, not a refusal', () => {
  const windows = [
    {number: 184776, bounds: {x: 606, y: 52, width: 1067, height: 631}, onScreen: false},
    {number: 5, bounds: {x: 100, y: 100, width: 800, height: 600}, onScreen: true},
    {number: 6, bounds: {x: 100, y: 100, width: 800, height: 600}},
  ];
  assert.deepEqual(refusingWindows(documentWindows(windows)).map(w => w.number), [5], 'only an explicit onScreen counts');
  const io = fakeDevice({windows: {736: [windows[0]]}});
  const offOnly = preflight({run: fs.mkdtempSync(join(tmpdir(), 'cua-scenes-pre-')), io});
  assert.deepEqual(offOnly.refusals, []);
  assert.deepEqual(offOnly.finderOffScreenWindows, [{number: 184776, bounds: windows[0].bounds}]);
  assert.match(offOnly.finderOffScreenNote, /do not refuse/);
  assert.equal(offOnly.note, undefined, 'the note is named for what it is about');
  assert.equal(offOnly.finderHidden, false);
  const withOwner = preflight({run: fs.mkdtempSync(join(tmpdir(), 'cua-scenes-pre-')), io: fakeDevice({windows: {736: [windows[0], windows[1]]}})});
  assert.deepEqual(withOwner.refusals.map(r => [r.code, r.windows]), [['finder_window', [5]]]);
});

test('describeScenes is plain data: the definitions, pairings and targets the driver reads, nothing of the device', () => {
  const described = JSON.parse(JSON.stringify(describeScenes()));
  assert.deepEqual(Object.keys(described.scenes), SCENE_IDS);
  assert.equal(described.pairings.length, 6);
  assert.equal(described.scenes.finder.fixedState.files, 200);
  assert.equal(described.scenes.chrome.app, null, 'the Chrome and Electron paths are the device\'s, given by up');
});

// ---- Device side, on injected reads: what is launched, recorded and stopped -------------------------------------------

// A device with the given running processes and windows; `open` starts a process of the launched app's bundle id.
function fakeDevice({running = [], windows = {}, finderPid = 736, finderHidden = false, finderOpens = [{onScreen: true}]} = {}) {
  const calls = [], launches = {}, created = [];
  let nextPid = 500, clock = 1_000_000, nextWindow = 900;
  const io = {
    calls, running, windows, created,
    runningApps: id => running.filter(p => p.bundleId === id),
    appWindows: pid => windows[pid] ?? [],
    appWindowState: pid => ({windows: windows[pid] ?? [], hidden: pid === finderPid ? finderHidden : false}),
    finderPid: () => finderPid,
    launchOf: pid => launches[pid] ?? null,
    now: () => clock,
    sleep: async ms => { clock += ms; },
    openApp: request => {
      calls.push(['open', request]);
      // Finder's open shows the windows `finderOpens` describes (one on-screen window by default), recorded in `created`.
      if (request.app.endsWith('Finder.app')) {
        for (const {onScreen} of finderOpens) { const w = {number: nextWindow++, bounds: {x: 0, y: 0, width: 800, height: 600}, onScreen}; created.push(w); (windows[finderPid] ??= []).push(w); }
        return;
      }
      const bundleId = request.app.includes('Electron') ? FIXTURE_BUNDLE_ID : request.app.includes('TextEdit') ? TEXTEDIT : CFT;
      const pid = nextPid++;
      launches[pid] = clock;
      running.push({pid, bundleId});
      windows[pid] = [{number: nextWindow++, bounds: {x: 140, y: 100, width: 720, height: 560}}];
    },
    awaitOwnLaunch: async ({bundleId, before}) => { const p = running.find(r => r.bundleId === bundleId && !before.includes(r.pid)); return {pid: p.pid, at: launches[p.pid]}; },
    stopRecorded: async record => { calls.push(['stop', record.pid]); return {stopped: [record.pid], remaining: []}; },
    spawnPage: async () => { const pid = nextPid++; launches[pid] = clock; return {pid, at: clock, url: 'http://127.0.0.1:4000/', port: 4000}; },
    placeChrome: async () => ({appPath: '/cache/chrome-mac-arm64/Google Chrome for Testing.app'}),
    buildElectron: () => ({appPath: '/cache/44.9.0-abc/cua Electron Fixture.app'}),
  };
  return io;
}
const withRun = async fn => { const run = fs.mkdtempSync(join(tmpdir(), 'spike-scenes-')); try { await fn(run); } finally { fs.rmSync(run, {recursive: true, force: true}); } };

test('lsappinfo output: ASNs from find, pid and bundle id from info (both formats)', () => {
  assert.deepEqual(parseAsns('ASN:0x0-0x2b02b-"Finder": ASN:0x0-0x1d01d-"Chrome":\n'), ['ASN:0x0-0x2b02b', 'ASN:0x0-0x1d01d']);
  assert.deepEqual(parseAsns(''), []);
  assert.deepEqual(parseAppInfo('"pid"=736\n"CFBundleIdentifier"="com.apple.finder"\n'), {pid: 736, bundleId: 'com.apple.finder'});
  assert.deepEqual(parseAppInfo('pid = 42 bundleID="com.apple.TextEdit"'), {pid: 42, bundleId: 'com.apple.TextEdit'});
  assert.equal(parseAppInfo('nothing'), null);
});

test('up refuses before launching anything while a refusal holds', async () => withRun(async run => {
  const io = fakeDevice({running: [{pid: 10, bundleId: CFT}]});
  await assert.rejects(upScene('electron', {run, io}), error => error.refusals?.[0]?.code === 'foreign_scene_process');
  assert.deepEqual(io.calls, []);
  assert.deepEqual(readState(run), {scenes: {}});
}));

test('up records the run\'s own launch with its window; a second up of the same scene is refused', async () => withRun(async run => {
  const io = fakeDevice();
  const record = await upScene('electron', {run, io});
  assert.equal(record.bundleId, FIXTURE_BUNDLE_ID);
  assert.equal(record.app, '/cache/44.9.0-abc/cua Electron Fixture.app');
  assert.ok(record.pid && record.at && record.window.number);
  const [, request] = io.calls[0];
  assert.equal(request.newInstance, true);
  assert.deepEqual(request.args, electronArgs({userDataDir: join(run, 'electron-user-data')}));
  assert.deepEqual(readState(run).scenes.electron, record);
  await assert.rejects(upScene('electron', {run, io}), /already up/);
  // The run's own process is not a refusal for the next scene.
  assert.deepEqual(preflight({run, io}).refusals, []);
}));

test('up of each scene: TextEdit on the run\'s document in English, Chrome on the page with its own profile, Finder on the run\'s folder', async () => withRun(async run => {
  const io = fakeDevice();
  const textedit = await upScene('textedit', {run, io});
  assert.equal(fs.readFileSync(textedit.document, 'utf8'), textEditDocument().rtf);
  assert.deepEqual(io.calls[0][1].files, [textedit.document]);
  assert.deepEqual(io.calls[0][1].args, ['-AppleLanguages', '(en)', '-ApplePersistenceIgnoreState', 'YES']);
  const chrome = await upScene('chrome', {run, io});
  assert.equal(chrome.page.url, 'http://127.0.0.1:4000/');
  assert.deepEqual(io.calls[1][1].args, chromeArgs({userDataDir: join(run, 'chrome-user-data'), url: chrome.page.url}));
  assert.ok(io.calls[1][1].args.includes('--use-mock-keychain'));
  assert.ok(!io.calls[1][1].args.some(a => /accessibility/i.test(a)), 'Chrome is never told to turn accessibility on');
  // The page is English and the Macs run in Korean: no translate bubble in the fixed state.
  const args = io.calls[1][1].args, lang = args.indexOf('-AppleLanguages');
  assert.deepEqual(args.slice(lang, lang + 2), ['-AppleLanguages', '(en-US)'], 'the per-process UI language, as TextEdit\'s');
  assert.ok(lang < args.indexOf(chrome.page.url), 'before the URL');
  assert.ok(!args.some(a => /^--(lang|accept-lang)=/.test(a)), 'no Chromium language switch: the profile is the bubble guard');
  assert.ok(args.some(a => /^--disable-features=.*\bTranslate\b/.test(a)));
  assert.deepEqual(JSON.parse(fs.readFileSync(join(run, 'chrome-user-data', 'Default', 'Preferences'), 'utf8')), chromePreferences());
  assert.equal(chromePreferences().translate.enabled, false);
  const finder = await upScene('finder', {run, io});
  assert.equal(finder.pid, 736);
  assert.deepEqual(fs.readdirSync(finder.folder).sort(), finderFolderFiles());
  assert.equal(io.calls[2][1].newInstance, undefined, 'Finder is never launched anew');
  assert.deepEqual(preflight({run, io}).refusals, [], 'the run\'s own TextEdit, Chrome and Finder window');
}));

test('up finder records the window the open created, never Finder\'s own off-screen window', async () => withRun(async run => {
  const offScreen = {number: 184776, bounds: {x: 606, y: 52, width: 1067, height: 631}, onScreen: false};
  const io = fakeDevice({windows: {736: [offScreen]}});
  const finder = await upScene('finder', {run, io});
  assert.equal(io.created.length, 1);
  assert.deepEqual(finder.window, {number: io.created[0].number, bounds: io.created[0].bounds}, 'the window the open created');
  assert.deepEqual(preflight({run, io}).refusals, []);
}));

test('up finder\'s before-set includes off-screen windows: one the open brings on screen is not the run\'s window', async () => withRun(async run => {
  const existing = {number: 184776, bounds: {x: 606, y: 52, width: 1067, height: 631}, onScreen: false};
  const io = fakeDevice({windows: {736: [existing]}});
  const open = io.openApp;
  io.openApp = request => { existing.onScreen = true; open(request); };   // the open also shows Finder's own window
  const finder = await upScene('finder', {run, io});
  assert.equal(io.created.length, 1);
  assert.equal(finder.window.number, io.created[0].number, 'the newly created window');
  assert.notEqual(finder.window.number, existing.number, 'not the flipped one');
}));

test('up finder accepts only an on-screen new window, and refuses to pick between several', async () => {
  await withRun(async run => {
    // The open's only new window is off screen: never the run's window; the wait runs out.
    const io = fakeDevice({finderOpens: [{onScreen: false}]});
    await assert.rejects(upScene('finder', {run, io}), /no new window/);
    assert.deepEqual(readState(run), {scenes: {}});
  });
  await withRun(async run => {
    // An off-screen window and an on-screen one appear: the on-screen one is the run's.
    const io = fakeDevice({finderOpens: [{onScreen: false}, {onScreen: true}]});
    const finder = await upScene('finder', {run, io});
    assert.equal(finder.window.number, io.created[1].number);
  });
  await withRun(async run => {
    // Two on-screen windows appear (someone opened one beside the run's): none is recorded.
    const io = fakeDevice({finderOpens: [{onScreen: true}, {onScreen: true}]});
    await assert.rejects(upScene('finder', {run, io}), /2 new windows/);
    assert.deepEqual(readState(run), {scenes: {}});
  });
});

test('a hidden Finder refuses: its windows read off screen until the run activates it', async () => {
  assert.deepEqual(refusals({running: [], finderWindows: [], finderHidden: true, owned: {pids: new Set(), finderWindow: null}}).map(r => [r.code, r.message]),
    [['finder_hidden', 'Finder is hidden; unhide it (click Finder in the Dock) and re-run']]);
  // Unreadable while Finder runs: refused too, since a hidden Finder's windows would read as off screen.
  assert.deepEqual(refusals({running: [], finderWindows: [], finderHidden: null, owned: {pids: new Set(), finderWindow: null}}).map(r => [r.code, r.message]),
    [['finder_hidden_unknown', 'could not read whether Finder is hidden; re-run, and if it persists check front-window.swift\'s NSRunningApplication read over this session']]);
  await withRun(async run => {
    const io = fakeDevice({finderHidden: null});
    assert.deepEqual(preflight({run, io}).refusals.map(r => r.code), ['finder_hidden_unknown']);
    await assert.rejects(upScene('finder', {run, io}), error => error.refusals?.[0]?.code === 'finder_hidden_unknown');
    assert.deepEqual(io.calls, [], 'nothing opened');
  });
  await withRun(async run => {
    // No Finder process at all: nothing to read, no hidden refusal (up finder then fails on its own).
    const io = fakeDevice({finderPid: null});
    assert.deepEqual(preflight({run, io}).refusals, []);
  });
  await withRun(async run => {
    const io = fakeDevice({finderHidden: true, windows: {736: [{number: 5, bounds: {x: 100, y: 100, width: 800, height: 600}, onScreen: false}]}});
    const checked = preflight({run, io});
    assert.deepEqual(checked.refusals.map(r => r.code), ['finder_hidden']);
    assert.equal(checked.finderHidden, true);
    await assert.rejects(upScene('finder', {run, io}), error => error.refusals?.[0]?.code === 'finder_hidden');
    assert.deepEqual(io.calls, [], 'nothing opened');
  });
});

test('down keeps the Finder scene while the run\'s window exists, even off screen (minimized or on another Space)', async () => withRun(async run => {
  const io = fakeDevice();
  const finder = await upScene('finder', {run, io});
  io.windows[736].find(w => w.number === finder.window.number).onScreen = false;
  const down = await downScene('finder', {run, io});
  assert.equal(down.down, false);
  assert.equal(down.windowOpen, true);
  assert.deepEqual(readState(run).scenes.finder, finder);
  assert.equal(exitCodeFor(down), 1);
}));

test('down stops only what the run recorded; Finder is never signalled and stays up while the run\'s window is open', async () => withRun(async run => {
  const io = fakeDevice();
  const chrome = await upScene('chrome', {run, io});
  const finder = await upScene('finder', {run, io});
  const down = await downScene('chrome', {run, io});
  assert.equal(down.down, true);
  assert.deepEqual(io.calls.filter(c => c[0] === 'stop').map(c => c[1]), [chrome.pid, chrome.page.pid]);
  const open = await downScene('finder', {run, io});
  assert.equal(open.down, false);
  assert.equal(open.windowOpen, true);
  assert.ok(readState(run).scenes.finder);
  io.windows[736] = io.windows[736].filter(w => w.number !== finder.window.number);   // the driver closed it through the engine
  assert.equal((await downScene('finder', {run, io})).down, true);
  assert.deepEqual(io.calls.filter(c => c[0] === 'stop').map(c => c[1]), [chrome.pid, chrome.page.pid], 'nothing of Finder\'s was stopped');
  assert.deepEqual(readState(run).scenes, {});
  assert.deepEqual(await downScene('electron', {run, io}), {scene: 'electron', down: true, wasUp: false});
}));

test('stopRecorded signals only a pid that is still the recorded launch', async () => {
  const quit = [];
  const q = async pids => { quit.push(...pids); return {quit: pids, remaining: []}; };
  assert.deepEqual(await stopRecorded({pid: 5, at: 1}, {sameLaunch: () => false, quit: q}), {stopped: [], remaining: [], skipped: 'gone or no longer the run\'s launch'});
  assert.deepEqual(await stopRecorded(null, {quit: q}), {stopped: [], remaining: [], skipped: 'not recorded'});
  assert.deepEqual(quit, []);
  assert.deepEqual(await stopRecorded({pid: 5, at: 1}, {sameLaunch: () => true, quit: q}), {stopped: [5], remaining: []});
});

test('the device command runs the CLI in the harness checkout with every argument quoted', () => {
  assert.equal(sceneCommand(['up', 'chrome', '--run', '/tmp/run dir'], {checkout: '/c'}), "cd /c && node scripts/spike/engine/scenes.mjs 'up' 'chrome' '--run' '/tmp/run dir'");
  assert.match(sceneCommand(['describe']), /^cd \$HOME\/Developer\/GitHub\/cua-parity && node scripts\/spike\/engine\/scenes\.mjs 'describe'$/);
});

test('a launch whose window never comes is stopped again and nothing is recorded', async () => withRun(async run => {
  const io = fakeDevice();
  const open = io.openApp;
  io.openApp = request => { open(request); for (const pid of Object.keys(io.windows)) if (pid !== '736') io.windows[pid] = []; };
  await assert.rejects(upScene('electron', {run, io}), /no new window/);
  assert.deepEqual(io.calls.filter(c => c[0] === 'stop').map(c => c[1]), [io.running[0].pid]);
  assert.deepEqual(readState(run), {scenes: {}});
}));

test('the CLI exits 1 on a refusal and when down leaves a scene up', () => {
  assert.equal(exitCodeFor({refusals: [{code: 'finder_window'}]}), 1);
  assert.equal(exitCodeFor({refusals: []}), 0);
  assert.equal(exitCodeFor({scene: 'finder', down: false, windowOpen: true}), 1);
  assert.equal(exitCodeFor({down: false, scenes: []}), 1);
  assert.equal(exitCodeFor({scene: 'chrome', down: true}), 0);
  assert.equal(exitCodeFor(undefined), 0);
});
