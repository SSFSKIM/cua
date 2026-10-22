// The macOS scenes (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system part 2 "Scenes"
// and part 5; Interfaces, NativeMacScenes), promoted in M1b from the M0 spike's scripts/spike/engine/scenes.mjs (kept as
// M0's record): four harness-owned windows, one per app family, each in a process addressed by a path that names exactly
// one process on either engine.
//
//   textedit  AppKit text. TextEdit (/System/Applications/TextEdit.app), launched by the run on a run-owned rich-text
//             document, in English (-AppleLanguages) so its controls' names are the ones the targets name, and with
//             state restoration ignored so the document is its only window.
//   finder    AppKit lists. Finder's process is the system's and is never the run's; only its window on a run-owned
//             folder of 200 files is. Its fixed state is list view with no row selected and with the sidebar, the status
//             bar and the path bar hidden (./scenes-mac-finder.mjs), so the window carries nothing the run does not own
//             and its golden is compared as full text. The driver sets it (`setup`) through the engine with the run's
//             window in front, since nothing outside an engine may script Finder without an Automation prompt, and
//             restores what the hiding changed (`teardown`, then `down finder`).
//   chrome    Chrome for Testing at the pinned version (scripts/native-matrix/fixtures/chrome-for-testing.json), placed in
//             the harness cache, with a fresh --user-data-dir per launch under the run directory (removed by down, so a
//             restart is a first run like the first launch) and the loopback scene page
//             (scripts/native-matrix/fixtures/scene-page.mjs) served by a detached process of the run. `up` returns once
//             the page has reported its load to that server (a beacon after `load`; no DevTools port is opened), and
//             its fixed state is the page with its tree filled (chromePageProblems), which the driver reads until it
//             holds (scripts/native-matrix/goldens-device.mjs settledState).
//   electron  The Electron fixture app (scripts/native-matrix/fixtures/electron-fixture.mjs) with its own bundle id and a
//             scratch user-data directory under the run directory.
//
// Refusals (`refusals`): the harness does not start, and no scene comes up, while a process runs Chrome for Testing's or
// the fixture's bundle id that the run did not start, while TextEdit runs and is not the run's (its windows may be the
// owner's), or while Finder has a window that is not the run's. Only the run's own processes are ever stopped: a pid
// recorded at the run's own launch, signalled only while it is still that launch; Finder is never signalled.
//
// What a driver (the goldens recorder, the matrix) does with a scene, in order: `preflight`; `up <scene>`, whose record
// carries the scene's `setup` steps; the setup steps (`activate` through `activate <scene>`, each `pressKey` through the
// engine and the key guard with the step's `guard`, scripts/accept/key-guard.mjs; Finder's `visibleState` and `chrome`
// steps observe the run's window through the engine and toggle by what it shows, scripts/native-matrix/goldens-device.mjs); `fixedStateProblems` on the engine's
// Skyshot of the scene window before anything of it is recorded; the cells; `teardown-steps <scene>` and those steps;
// `down <scene>`, which stops the run's process or, for Finder, checks the run's window is gone and writes back any
// preference the hiding still leaves changed (`restore-finder` does that alone, for a run that died).
//
// Pairings for the non-interference cells: the user window of a cell is the scene window of another family (TextEdit ↔
// Finder, Chrome ↔ TextEdit, Electron ↔ Finder), taken in both directions so every scene is driven in the background
// regime. Concurrent use has TextEdit as the user window with Finder and Chrome driven; its sheet variant drives TextEdit
// (super+w on a dirty untitled document) under the Electron fixture's text field.
//
// Targets: per scene, ten finding-elements targets fixed from the fixtures' ground truth before either engine's text is
// seen: every control the harness put into the page and the fixture, and for TextEdit and Finder the run's own content
// (document, folder, file names) plus window controls found by subrole and the format bar's controls by the English names
// AppKit's NSTextRulerAccessory nib carries. Each names its AX role and what finds it (a name or value with its `match`
// mode, a subrole or an orientation); `source` says where the name comes from. Each scene's `typing` says where text
// typed into it lands and how that is read back, its `window` the title prefix its window's header carries, and its
// `action` the element the action-sequence golden clicks (./scenes-mac-text.mjs's actionIndex resolves it on an
// observation's text).
//
// Device-side CLI, run from the harness checkout on the Mac that shows the scenes (over ssh); one JSON line on stdout,
// exit 1 on an error or refusal:
//   node scripts/repl-parity/scenes-mac.mjs describe                        the definitions (no device access)
//   node scripts/repl-parity/scenes-mac.mjs preflight --run <dir>           the refusal check (exit 1 when any holds)
//   node scripts/repl-parity/scenes-mac.mjs place-chrome [--cache <root>]   place the pinned Chrome for Testing
//   node scripts/repl-parity/scenes-mac.mjs build-electron [--cache <root>] build the Electron fixture app
//   node scripts/repl-parity/scenes-mac.mjs up <scene> --run <dir> [--chrome-app <app>] [--electron-app <app>]
//   node scripts/repl-parity/scenes-mac.mjs activate <scene> --run <dir>    the run's process to the front (exit 1 if not)
//   node scripts/repl-parity/scenes-mac.mjs teardown-steps <scene> --run <dir>
//   node scripts/repl-parity/scenes-mac.mjs down <scene|all> --run <dir>   (exit 1 when something stays up or changed)
//   node scripts/repl-parity/scenes-mac.mjs restore-finder                  Finder's saved preferences written back
//   node scripts/repl-parity/scenes-mac.mjs front                           FrontWindowProbe's reading
//   node scripts/repl-parity/scenes-mac.mjs frontmost                       the frontmost app's {pid, bundleId} (lsappinfo)
//   node scripts/repl-parity/scenes-mac.mjs reactivate --bundle-id <id> --pid <n>   that app back in front (reactivateApp)
// `<dir>` is the run directory (absolute; created 0700); the run's scene state is `<dir>/scenes.json`.
import * as fs from 'node:fs';
import {basename, join, isAbsolute} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PAGE_CONTROLS, PAGE_INITIAL, PAGE_TITLE, startScenePage} from '../native-matrix/fixtures/scene-page.mjs';
import {FIXTURE_BUNDLE_ID, FIXTURE_CONTROLS, FIXTURE_INITIAL, buildElectronFixture} from '../native-matrix/fixtures/electron-fixture.mjs';
import {CHROME_FOR_TESTING_BUNDLE_ID, placeChromeForTesting} from '../native-matrix/fixtures/chrome-for-testing.mjs';
import {
  activateApp, activateProcess, appWindows, appWindowState, awaitOwnLaunch, frontmostProcess, frontWindow, windowOrder, openApp, readFinderPreferences, runningApps,
  showFolder, stopRecorded, writeFinderPreference,
} from './scenes-mac-device.mjs';
import {
  CLOSE_WINDOW_KEY, DESELECT_ALL_KEY, FINDER_FRAME, FINDER_PARTS, LIST_VIEW_KEY, SAVED_PREFERENCES, clearSavedPreferences, finderWindowProblems, preferenceWrites,
  readSavedPreferences, saveOriginalPreferences, savedRecordDistrust,
} from './scenes-mac-finder.mjs';
import {windowTitleOf} from './scenes-mac-text.mjs';
import {isSameLaunch, launchOf} from '../accept/fixture-app.mjs';
import {quote} from '../browser-parity/topology.mjs';
import {PARITY_CHECKOUT} from '../native-baseline/remote.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
export const TEXTEDIT_BUNDLE_ID = 'com.apple.TextEdit';
export const FINDER_BUNDLE_ID = 'com.apple.finder';

// TextEdit's run-owned document: a title line, one bold line (so the text area's attributed value has styling for the
// engine's valueMarkdown to render), and enough short lines to need the vertical scroll bar. The whole plain text stays
// under the engine's valueMarkdown cap (native/engine Walk.swift markdownMaxLength, 2,000 characters): the engine
// fetches the Markdown only for a value at most that long, so the document's observations carry it.
const TEXTEDIT_DOCUMENT = 'cua-scene.rtf';
export const TEXTEDIT_STYLED_LINE = 'Bold scene line';
export const TEXTEDIT_MARKDOWN_CAP = 2000;
const TEXTEDIT_LINES = ['cua scene document', TEXTEDIT_STYLED_LINE, ...Array.from({length: 60}, (_, i) => `Line ${String(i + 1).padStart(2, '0')}`)];
const rtfLine = line => (line === TEXTEDIT_STYLED_LINE ? `{\\b ${line}}` : line);
// The layouts the document can open in: TextEdit's default (wrapped to the window), or `wide-page` (M2b.1b's horizontal
// scroll cell): page layout (`\\viewkind1`, TextEdit's Wrap to Page) zoomed to 200% (`\\viewscale200`), so the page
// is wider than the scene window and its scroll area has horizontally scrollable content. The zoom is what does it:
// TextEdit ignores the paper width (`\\paperw28800`, 1440 points in twips) for the page view and lays the page out on
// its own paper size, which fits the window, its horizontal bar disabled (hold 1, 2026-10-21).
export const TEXTEDIT_LAYOUTS = Object.freeze({default: '', 'wide-page': '\\paperw28800\\paperh15840\\viewkind1\\viewscale200'});
export const textEditDocument = ({layout = 'default'} = {}) => {
  if (!Object.hasOwn(TEXTEDIT_LAYOUTS, layout)) throw new Error(`unknown TextEdit layout ${layout}; one of ${Object.keys(TEXTEDIT_LAYOUTS).join(', ')}`);
  return {name: TEXTEDIT_DOCUMENT, lines: [...TEXTEDIT_LINES],
    rtf: `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fswiss Helvetica;}}${TEXTEDIT_LAYOUTS[layout]}\\f0\\fs28 ${TEXTEDIT_LINES.map(rtfLine).join('\\par\n')}}\n`};
};

// Finder's run-owned folder: 200 files named without an extension, so the owner's show-extensions setting cannot change
// what a row is called.
const FINDER_FOLDER = 'cua-scene-finder';
// File 150 is the typing target and carries a long fixed name (240 ASCII characters, well inside APFS's 255-byte limit,
// still sorting between 149 and 151), so typing it is a long action: concurrent use needs the probe's post to fall
// inside the action's interval.
export const FINDER_TYPING_NAME = (() => {
  const head = 'scene-file-150-', filler = 'the-quick-brown-fox-jumps-over-the-lazy-dog-';
  return (head + filler.repeat(6)).slice(0, 240).replace(/-$/, 'x');
})();
const finderName = n => (n === 150 ? FINDER_TYPING_NAME : `scene-file-${String(n).padStart(3, '0')}`);
// Every file's modification and access time, set at up: a fixed date long past, so Finder's Date Modified column (whose
// cell is also the action's target) prints the same absolute date in every recording, never "Today" and the minute
// the run wrote the file.
export const FINDER_FILES_MODIFIED = '2026-01-15T12:00:00.000Z';
export const finderFolderFiles = () => Array.from({length: 200}, (_, i) => finderName(i + 1));

// A target is found by its `name` or `value` (compared as `match` says: `exact`, or `prefix` where the run cannot fix the
// whole text), or, unnamed, by its `subrole` or `orientation`.
const control = source => ({id, role, name}) => ({id, role, name, match: 'exact', source});
const windowButtons = [
  {id: 'close', role: 'AXButton', subrole: 'AXCloseButton', source: 'system-ui'},
  {id: 'minimize', role: 'AXButton', subrole: 'AXMinimizeButton', source: 'system-ui'},
  {id: 'fullScreen', role: 'AXButton', subrole: 'AXFullScreenButton', source: 'system-ui'},
];
const OPEN = 'open -g -a <app> through LaunchServices (-n for a new instance); pid recorded with its launch time';
const STOP = 'SIGTERM to the recorded pid while it is still that launch, then up to 5 s for it to exit';

export const SCENES = Object.freeze({
  textedit: {
    id: 'textedit', family: 'AppKit text', bundleId: TEXTEDIT_BUNDLE_ID, app: '/System/Applications/TextEdit.app', process: 'run',
    fixedState: {document: TEXTEDIT_DOCUMENT, format: 'rtf', lines: TEXTEDIT_LINES.length, firstLine: TEXTEDIT_LINES[0], styledLine: TEXTEDIT_STYLED_LINE, uiLanguage: 'en', windows: 1},
    // The title, with or without the `.rtf` the owner's show-extensions setting decides: a prefix.
    window: {title: 'cua-scene'},
    action: {click: TEXTEDIT_LINES[0]},
    placement: 'as TextEdit places a document window; recorded at up',
    launchArgs: ['-AppleLanguages', '(en)', '-ApplePersistenceIgnoreState', 'YES'],
    start: `${OPEN}, the run's document as the file`, stop: `${STOP}; the driver quits it through the engine first where it can (super+q, as the baseline does)`,
    typing: {target: 'document', mode: 'text', readBack: 'the document\'s AXValue contains the text sent'},
    targets: [
      {id: 'document', role: 'AXTextArea', value: TEXTEDIT_LINES[0], match: 'prefix', source: 'run'},
      // The title, with or without the `.rtf` the owner's show-extensions setting decides: a prefix.
      {id: 'window', role: 'AXWindow', name: 'cua-scene', match: 'prefix', source: 'run'},
      {id: 'styles', role: 'AXPopUpButton', name: 'Styles', match: 'exact', source: 'app-ui'},
      {id: 'alignment', role: 'AXRadioGroup', name: 'Alignment', match: 'exact', source: 'app-ui'},
      {id: 'spacing', role: 'AXPopUpButton', name: 'Spacing', match: 'exact', source: 'app-ui'},
      {id: 'lists', role: 'AXPopUpButton', name: 'Lists', match: 'exact', source: 'app-ui'},
      ...windowButtons,
      {id: 'scrollBar', role: 'AXScrollBar', orientation: 'AXVerticalOrientation', source: 'system-ui'},
    ],
  },
  finder: {
    id: 'finder', family: 'AppKit lists', bundleId: FINDER_BUNDLE_ID, app: '/System/Library/CoreServices/Finder.app', process: 'system',
    fixedState: {folder: FINDER_FOLDER, files: 200, modified: FINDER_FILES_MODIFIED, view: 'list', selection: null, chrome: {sidebar: false, statusBar: false, pathBar: false}, windows: 1},
    window: {title: FINDER_FOLDER},
    // A cell of row 005 other than its name: a click on a selected row's name starts a rename.
    action: {click: {rowCellOf: finderName(5)}},
    placement: 'as Finder places a folder window; recorded at up',
    start: 'open -g -a Finder <the run\'s folder>; the new window\'s number recorded', stop: 'never signalled; the driver toggles back what setup hid and closes the run\'s window through the engine (teardown-steps), and down checks it is gone and writes back any Finder preference still changed',
    // Type-select on the run's list, not the toolbar search field: a search would fill the run's window with the
    // owner's file names (a Spotlight query), and the field may be collapsed to a button. Typing a row's name selects it.
    // At the keyed route's ~1 ms per character the typed name spans about 240 ms: too short to aim a manual keystroke
    // at, so the matrix schedules the probe's post for Finder with `keystroke --at` inside the expected interval.
    typing: {target: 'file150', mode: 'type-select', text: FINDER_TYPING_NAME, readBack: 'the selected AXRow\'s name equals the text sent',
      expectedIntervalMs: FINDER_TYPING_NAME.length, keystroke: 'probe keystroke --at, scheduled inside the expected interval'},
    targets: [
      ...[1, 2, 50, 100, 125, 150, 199, 200].map(n => ({id: `file${String(n).padStart(3, '0')}`, role: 'AXRow', name: finderName(n), match: 'exact', source: 'run'})),
      {id: 'window', role: 'AXWindow', name: FINDER_FOLDER, match: 'exact', source: 'run'},
      windowButtons[0],
    ],
  },
  chrome: {
    id: 'chrome', family: 'Chromium web content', bundleId: CHROME_FOR_TESTING_BUNDLE_ID, app: null, process: 'run',
    fixedState: {title: PAGE_TITLE, page: PAGE_INITIAL, windows: 1},
    window: {title: PAGE_TITLE},
    action: {click: 'Scene option'},
    placement: {x: 80, y: 60, width: 1000, height: 760},
    start: `${OPEN}; the page served first by a detached process of the run`, stop: `${STOP}; the page server likewise`,
    typing: {target: 'notes', mode: 'text', readBack: 'the textarea\'s AXValue contains the text sent'},
    targets: PAGE_CONTROLS.map(control('fixture')),
  },
  electron: {
    id: 'electron', family: 'Electron', bundleId: FIXTURE_BUNDLE_ID, app: null, process: 'run',
    fixedState: {title: 'cua Electron fixture', fixture: FIXTURE_INITIAL, windows: 1},
    window: {title: 'cua Electron fixture'},
    action: {click: 'Fixture button'},
    placement: {x: 140, y: 100, width: 720, height: 560},
    start: OPEN, stop: STOP,
    typing: {target: 'text', mode: 'text', readBack: 'the text field\'s AXValue contains the text sent'},
    targets: FIXTURE_CONTROLS.map(control('fixture')),
  },
});
export const SCENE_IDS = Object.keys(SCENES);
// The scenes whose tree follows their window's frame: Finder's list exposes only the rows its window's height shows
// (hold 2b: rows 0-19 on one lane, 0-18 on the other). Setup pins its outer frame after the chrome toggles; each run still records the frame it read
// and the native-mac diff pairs two lanes only when it is one frame (native-mac-diff.mjs checkPair). The Electron
// fixture's six-row list always fits, and its window, like Chrome's, is placed by the run.
export const LIST_BEARING_SCENES = Object.freeze(['finder']);
const sceneOf = id => { if (!Object.hasOwn(SCENES, id)) throw new Error(`unknown scene ${id}; one of ${SCENE_IDS.join(', ')}`); return SCENES[id]; };

// The three pairs part 2 names, each taken in both directions; a driven scene's user window is the first pair naming it.
export const PAIRS = Object.freeze([['textedit', 'finder'], ['chrome', 'textedit'], ['electron', 'finder']]);
export const BACKGROUND_PAIRINGS = Object.freeze(PAIRS.flatMap(([a, b]) => [{driven: a, user: b}, {driven: b, user: a}]));
export const userWindowFor = driven => { sceneOf(driven); return BACKGROUND_PAIRINGS.find(p => p.driven === driven).user; };
// Concurrent use: a long typeText into each driven scene's typing target while a keystroke lands in TextEdit's document.
export const CONCURRENT_USE = Object.freeze({user: 'textedit', userTarget: SCENES.textedit.typing.target, driven: ['finder', 'chrome']});
// Its sheet variant: TextEdit opens the keep-or-delete sheet on super+w over a dirty untitled document (the run's saved
// document autosaves and closes without one), while the keystroke lands in the Electron fixture's text field. The
// driver runs `setup` then `steps` in order, every step on the driven TextEdit; the keystroke is posted during the last.
export const CONCURRENT_USE_SHEET = Object.freeze({user: 'electron', userTarget: SCENES.electron.typing.target, driven: 'textedit',
  document: 'untitled',
  setup: [{activate: 'electron'}],
  steps: [{pressKey: 'super+n'}, {typeText: 'cua sheet variant'}, {pressKey: 'super+w', expect: 'sheet', keystrokeDuring: true}]});

// The windows that are a person's: layer 0 (front-window.swift already filters) and at least 100 points each way, which
// leaves out the menu-bar-sized, never-on-screen windows Finder keeps.
export const documentWindows = windows => windows.filter(w => w.bounds.width >= 100 && w.bounds.height >= 100);
// The document windows the Finder refusal counts: only those on screen. Finder itself holds an off-screen layer-0
// window of document size, which a relaunch recreates with a new window number (observed 2026-10-19; the spec's
// Decision Log), and an off-screen window is never the focused or main window the engine observes, so it is reported
// as a note and does not refuse. A hidden Finder (Cmd-H) is the exception: every one of its windows reads off screen
// and comes back the moment the run activates Finder, so a hidden Finder refuses on its own (`finder_hidden`).
export const refusingWindows = windows => windows.filter(w => w.onScreen === true);

// The run's own processes and Finder window from its state: a recorded pid counts only while it is the same launch.
export function ownedProcesses(state, {launchOf: launch = launchOf} = {}) {
  const pids = new Set();
  for (const [id, record] of Object.entries(state.scenes ?? {})) {
    if (id === 'finder') continue;
    for (const r of [record, record.page]) if (r?.pid && isSameLaunch(r, {launchOf: launch})) pids.add(r.pid);
  }
  return {pids, finderWindow: state.scenes?.finder?.window?.number ?? null};
}

// The refusal preconditions. `running`: the processes of Chrome for Testing's, the fixture's and TextEdit's bundle ids;
// `finderWindows`: Finder's on-screen document windows; `finderHidden`: whether Finder is hidden (null: Finder runs but
// the reading failed, which refuses too, since a hidden Finder's windows would pass as off screen); `owned`:
// ownedProcesses(). -> [{code, message, pids? | windows?}].
export function refusals({running, finderWindows, finderHidden = false, owned}) {
  const out = [];
  for (const bundleId of [CHROME_FOR_TESTING_BUNDLE_ID, FIXTURE_BUNDLE_ID]) {
    const pids = running.filter(p => p.bundleId === bundleId && !owned.pids.has(p.pid)).map(p => p.pid);
    if (pids.length) out.push({code: 'foreign_scene_process', pids, message: `a process the run did not start runs ${bundleId}; quit it and re-run`});
  }
  const textEdit = running.filter(p => p.bundleId === TEXTEDIT_BUNDLE_ID && !owned.pids.has(p.pid)).map(p => p.pid);
  if (textEdit.length) out.push({code: 'textedit_running', pids: textEdit, message: 'TextEdit is running and is not the run\'s: its windows may be the owner\'s; quit it and re-run'});
  const windows = finderWindows.filter(w => w.number !== owned.finderWindow).map(w => w.number);
  if (windows.length) out.push({code: 'finder_window', windows, message: 'Finder has a window that is not the run\'s; close it and re-run'});
  if (finderHidden === true) out.push({code: 'finder_hidden', message: 'Finder is hidden; unhide it (click Finder in the Dock) and re-run'});
  if (finderHidden === null) out.push({code: 'finder_hidden_unknown', message: 'could not read whether Finder is hidden; re-run, and if it persists check front-window.swift\'s NSRunningApplication read over this session'});
  return out;
}

// Plain data for the driver: the definitions, pairings and targets.
export const describeScenes = () => ({scenes: SCENES, pairs: PAIRS, pairings: BACKGROUND_PAIRINGS, concurrentUse: CONCURRENT_USE, concurrentUseSheet: CONCURRENT_USE_SHEET});

// ---- On an observation's text: the scene window --------------------------------------------------------------------

// Whether an observation's text is of the scene's window: its header's title begins with the scene's `window.title`.
// The action's element is resolved by ./scenes-mac-text.mjs's actionIndex.
export const isSceneWindow = (text, id) => windowTitleOf(text)?.startsWith(sceneOf(id).window.title) ?? false;

// ---- The driver's steps around a scene ----------------------------------------------------------------------------------

// The key guard's target for a key into a scene: its process by pid, and for Finder (the system's process, which also
// holds the owner's windows) the run's window on top.
export const guardOf = (id, record) => ({pid: record.pid, bundleId: sceneOf(id).bundleId, ...(id === 'finder' ? {window: record.window.number} : {})});

// The steps that take a scene from up to its fixed state, in order: `{activate: <scene>}` (the `activate` command) and
// `{pressKey, guard}` (through the engine, sent only while the key guard finds `guard` in front). Finder: in front, list
// view, nothing selected, then `{visibleState: 'record'}` (the window's chrome as the owner sees it, observed before any
// toggle and saved beside the keys) and one `{chrome: <part>, shown: false}` per part (its toggle sent only while the
// window still shows it, at most twice; scenes-mac-finder.mjs toggleUntil). The preference keys do not say what the
// window draws, so they choose nothing here. Finally UserProbe pins the outer frame after the toggles that resize
// Finder, with checked CG read-back. The other scenes come up in their fixed state. -> [step].
export function setupSteps(id, record) {
  if (sceneOf(id).id !== 'finder') return [];
  const guard = guardOf(id, record);
  return [{activate: 'finder'}, {pressKey: LIST_VIEW_KEY, guard}, {pressKey: DESELECT_ALL_KEY, guard}, {visibleState: 'record', guard},
    ...FINDER_PARTS.map(part => ({chrome: part, shown: false, guard})), {finderFrame: FINDER_FRAME}];
}
// The steps before `down`: Finder in front, each part toggled by observation until the window shows the saved
// `visible` chrome, `{visibleState: 'restored'}` (marked in the saved record), then the run's window closed. Without a
// saved visible state (a run that died before its setup observed) nothing was toggled and nothing is. The other scenes
// need none: down stops the run's process. -> [step].
export function teardownSteps(id, record, {visible = null} = {}) {
  if (sceneOf(id).id !== 'finder') return [];
  const guard = guardOf(id, record);
  const chrome = visible ? [...FINDER_PARTS.map(part => ({chrome: part, shown: visible[part] === true, guard})), {visibleState: 'restored'}] : [];
  return [{activate: 'finder'}, ...chrome, {pressKey: CLOSE_WINDOW_KEY, closes: 'window', guard}];
}

// The page's controls whose value Chromium exposes only once its accessibility tree has filled: the heading's level, the
// checkbox's and the radio buttons' states. The M1b.5 sitting kept a fixed state taken before they had filled (each
// carried an empty value; seconds later they read `Value: 1`, `0`, `1`, `0`), so every restart, observed later, differed
// from it in exactly those lines. Neither engine waits for a web area's contents (Enablement waits for the web area
// itself, as the vendor does), so the scene defines its fixed state as the filled page and the driver reads until it is.
const PAGE_VALUED = PAGE_CONTROLS.filter(c => ['AXHeading', 'AXCheckBox', 'AXRadioButton'].includes(c.role));
const subtreeEnd = (nodes, i) => { let j = i + 1; while (j < nodes.length && nodes[j].depth > nodes[i].depth) j++; return j; };
// What keeps a Skyshot of the Chrome scene from showing the filled page. -> [] or [{code: 'page_filling', controls, message}].
export function chromePageProblems(shot) {
  const nodes = Array.isArray(shot?.nodes) ? shot.nodes : [];
  const area = nodes.findIndex(n => n.role === 'AXWebArea' && n.title === PAGE_TITLE);
  const inside = area < 0 ? [] : nodes.slice(area + 1, subtreeEnd(nodes, area));
  const filled = control => inside.some(n => n.role === control.role && n.title === control.name && n.value !== '' && n.value !== null && n.value !== undefined);
  const missing = area < 0 ? PAGE_VALUED.map(c => c.id) : PAGE_VALUED.filter(c => !filled(c)).map(c => c.id);
  if (!missing.length) return [];
  return [{code: 'page_filling', controls: missing, message: area < 0 ? 'the scene page\'s web area is not in the window yet; observe again'
    : 'the scene page\'s controls do not carry their values yet (Chromium is still filling its tree); observe again'}];
}

// What keeps a Skyshot of the Electron scene from showing the fixture's page: its web area (titled as the window) and,
// inside it, every control the fixture puts on screen, by role and name (Chromium names a control by its title, its
// description or, for text, its value). Hold 2b's cua lane read the window with its second container empty, and the side
// reads had accepted that state, since the fixture's process is wholly the run's. The check is the side reads' (the
// state the lane's texts are kept against); a lane's own read without the page is still a difference in the diff.
// -> [] or [{code: 'page_filling', controls, message}].
const nameOf = node => [node.title, node.description, node.value];
export function electronPageProblems(shot) {
  const nodes = Array.isArray(shot?.nodes) ? shot.nodes : [];
  const area = nodes.findIndex(n => n.role === 'AXWebArea' && n.title === SCENES.electron.fixedState.title);
  const inside = area < 0 ? [] : nodes.slice(area + 1, subtreeEnd(nodes, area));
  const missing = FIXTURE_CONTROLS.filter(c => !inside.some(n => n.role === c.role && nameOf(n).includes(c.name))).map(c => c.id);
  if (!missing.length) return [];
  return [{code: 'page_filling', controls: missing, message: area < 0 ? 'the Electron fixture\'s web area is not in the window yet; observe again'
    : 'the Electron fixture\'s page does not hold all its controls yet; observe again'}];
}

// What the run owns in its Finder window, from the scene's record.
export const finderOwned = record => ({folder: basename(record.folder), folderPath: record.folder, files: finderFolderFiles()});
// What keeps an engine's Skyshot of the scene window from being the scene's fixed state, checked before anything of it
// is recorded: Finder's window by ./scenes-mac-finder.mjs; Chrome's page filled (chromePageProblems); Electron's page
// there (electronPageProblems); TextEdit's process is wholly the run's. -> [{code, message}].
export function fixedStateProblems(id, skyshot, record) {
  const scene = sceneOf(id).id;
  if (scene === 'finder') return finderWindowProblems(skyshot, finderOwned(record));
  if (scene === 'chrome') return chromePageProblems(skyshot);
  if (scene === 'electron') return electronPageProblems(skyshot);
  return [];
}

// ---- Device side ----------------------------------------------------------------------------------------------------

const STATE = 'scenes.json';
export const readState = run => { try { return JSON.parse(fs.readFileSync(join(run, STATE), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return {scenes: {}}; throw error; } };
export function writeState(run, state) {
  const temporary = join(run, `.${STATE}.${process.pid}`);
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n', {mode: 0o600});
  fs.renameSync(temporary, join(run, STATE));
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const defaultIo = () => ({
  runningApps, appWindows, appWindowState, openApp, activateApp, showFolder, activateProcess, awaitOwnLaunch, stopRecorded, launchOf, now: Date.now, sleep,
  frontmostProcess: () => frontmostProcess(), frontWindow: () => frontWindow(), windowOrder: () => windowOrder(),
  finderPid: () => runningApps(FINDER_BUNDLE_ID)[0]?.pid ?? null,
  finderPreferences: () => readFinderPreferences(), writeFinderPreference: (key, value) => writeFinderPreference(key, value), savedPreferencesFile: SAVED_PREFERENCES,
  placeChrome: () => placeChromeForTesting(), buildElectron: () => buildElectronFixture(), spawnPage, pageLoaded: run => readPageLoaded(run),
});

// What the refusal check reads on the device.
export function preflight({run, io = defaultIo()}) {
  const running = [CHROME_FOR_TESTING_BUNDLE_ID, FIXTURE_BUNDLE_ID, TEXTEDIT_BUNDLE_ID].flatMap(id => io.runningApps(id));
  const finder = io.finderPid();
  const {windows, hidden} = finder ? io.appWindowState(finder) : {windows: [], hidden: false};
  const documents = documentWindows(windows);
  const finderWindows = refusingWindows(documents);
  const offScreen = documents.filter(w => !finderWindows.includes(w)).map(w => ({number: w.number, bounds: w.bounds}));
  const owned = ownedProcesses(readState(run), {launchOf: io.launchOf});
  return {refusals: refusals({running, finderWindows, finderHidden: hidden, owned}), finderPid: finder, finderHidden: hidden,
    finderWindows: finderWindows.map(w => w.number),
    ...(offScreen.length ? {finderOffScreenWindows: offScreen, finderOffScreenNote: 'Finder windows not on screen do not refuse: never the focused or main window'} : {})};
}
class Refused extends Error { constructor(list) { super(list.map(r => r.message).join('; ')); this.refusals = list; } }

// A new document window of `pid` (one not in `before`), polled for up to `boundMs`. With `onScreenOnly` (Finder) only
// an on-screen window counts and more than one is an error: the run's window must be the one its open showed, never
// one of Finder's own off-screen windows nor a window someone opened beside it. -> {number, bounds}.
async function awaitWindow(pid, {before = [], io, boundMs = 20_000, onScreenOnly = false}) {
  for (const t0 = io.now(); ;) {
    const fresh = documentWindows(io.appWindows(pid)).filter(w => !before.includes(w.number) && (!onScreenOnly || w.onScreen === true));
    if (onScreenOnly && fresh.length > 1) throw new Error(`${fresh.length} new windows of process ${pid} appeared (${fresh.map(w => w.number).join(', ')}); none is recorded as the run's`);
    if (fresh.length) return {number: fresh[0].number, bounds: fresh[0].bounds};
    if (io.now() - t0 >= boundMs) throw new Error(`no new window of process ${pid} within ${boundMs} ms`);
    await io.sleep(250);
  }
}
// Starts `app` as a new process of `bundleId` (none of which may run). -> {pid, at}, retained before waiting for a window.
async function startOwn({app, bundleId, files, args, io}) {
  const before = io.runningApps(bundleId).map(p => p.pid), startedAt = io.now();
  io.openApp({app, files, args, newInstance: true});
  return io.awaitOwnLaunch({bundleId, before, startedAt});
}
// Launches `app` and waits for its window; a launch whose window never comes is stopped again, since it is the run's.
// -> {pid, at, window}.
async function launchOwn({io, ...options}) {
  const launch = await startOwn({...options, io});
  try { return {...launch, window: await awaitWindow(launch.pid, {io})}; }
  catch (error) { await io.stopRecorded(launch); throw error; }
}
// How long `up chrome` waits, once Chrome's window is there, for the page to report its load (scene-page.mjs's beacon):
// a loopback page loads in well under a second, so the bound only catches a page that never loads (a blocked script, a
// crashed renderer, a tab that is not the page).
export const PAGE_LOAD_MS = 15_000;
async function awaitPageLoad(run, page, {io, boundMs = PAGE_LOAD_MS, pollMs = 100}) {
  for (const t0 = io.now(); ;) {
    const loaded = io.pageLoaded(run);
    // Only this launch's server's report: spawnPage removed any earlier one, and the port names the server.
    if (loaded?.port === page.port) return loaded;
    if (io.now() - t0 >= boundMs) throw new Error(`the scene page did not report its load within ${boundMs} ms (no beacon from ${page.url}); Chrome and the page are stopped`);
    await io.sleep(pollMs);
  }
}
const placementArgs = ({x, y, width, height}) => [`--window-position=${x},${y}`, `--window-size=${width},${height}`];
// Chrome for Testing's switches: its own profile, no first-run, sync, default-browser or keychain prompt, no network
// beyond the loopback page (no component updates, no media-router discovery, which would ask for Local Network access),
// no translation (the page also declares itself untranslatable, scene-page.mjs, and the profile turns the offer off,
// chromePreferences), and no argument but the URL that is not a switch: Chrome opens every non-switch argument as a
// tab (chromeArgsProblems).
export const CHROME_DISABLED_FEATURES = Object.freeze(['MediaRouter', 'DialMediaRouteProvider', 'Translate', 'TranslateUI', 'OptimizationHints']);
export const chromeArgs = ({userDataDir, url, placement = SCENES.chrome.placement}) => [
  `--user-data-dir=${userDataDir}`, '--no-first-run', '--no-default-browser-check', '--use-mock-keychain', '--password-store=basic',
  '--disable-sync', '--disable-background-networking', '--disable-component-update', '--disable-default-apps',
  `--disable-features=${CHROME_DISABLED_FEATURES.join(',')}`, ...placementArgs(placement), '--new-window', url];
// The arguments of a Chrome launch that are not switches, other than the page's URL at the end. Chrome opens each as a
// tab: the first sitting's `-AppleLanguages (en-US)` pair (the per-process UI language, 5bb0d13f) left `(en-US)` as
// such an argument, the diagnosis of U3 read from the code and the records: a tab of that name opened beside the scene
// page, the window's title became another tab's, and every guarded Chrome cell refused on both lanes alike ("the scene
// window was not the app's front window"), while the MacBook's earlier Chrome trees, which passed, predate the pair.
// The second sitting's check.sceneWindow row (the title and the tabs) confirms or refutes it. -> [argument].
export const chromeArgsProblems = args => args.slice(0, -1).filter(a => !a.startsWith('--'));
// The scene page is English and the sitting's Macs run in Korean, so Chrome for Testing would offer to translate it (a
// bubble in the fixed state, seen in the MacBook window although Translate was disabled as a feature). The guards are
// the page's notranslate declaration, the profile's translate preference off with English accepted, and the disabled
// features. Chrome's own UI follows the system's language (Korean on the sitting's Macs): --lang does not set it on
// macOS, and the per-process AppleLanguages pair cannot be passed without the stray tab above. The scene's targets are
// the page's controls, whose names are the page's own, so no check depends on Chrome's UI language.
export const chromePreferences = () => ({translate: {enabled: false}, intl: {accept_languages: 'en-US,en'}});
// Every launch of the scene, a restart included, gets a new profile under the run directory holding only
// chromePreferences, so each is Chrome's first run. A restart on the first launch's profile came up as a later run of
// it: the omnibox's placeholder turned from "Search Google or type a URL" to "Ask Google or type a URL" (the mini's
// goldens recording, 2026-10-20), so the fixed state never matched again. The likely cause, read from Chromium's source
// and not observed: the AI-mode eligibility a run fetches is stored in the profile and read at the next start
// (components/omnibox/browser/aim_eligibility_service.cc). Down removes the profile once Chrome has exited.
// -> the profile's path.
function freshChromeProfile(run) {
  const userDataDir = fs.mkdtempSync(join(run, 'chrome-user-data-'));
  fs.mkdirSync(join(userDataDir, 'Default'), {mode: 0o700});
  fs.writeFileSync(join(userDataDir, 'Default', 'Preferences'), JSON.stringify(chromePreferences()), {mode: 0o600});
  return userDataDir;
}
export const electronArgs = ({userDataDir, placement = SCENES.electron.placement}) => [
  `--cua-fixture-user-data=${userDataDir}`, `--cua-fixture-bounds=${[placement.x, placement.y, placement.width, placement.height].join(',')}`];

// Brings one scene up. -> the scene's record: {scene, app, bundleId, pid, at?, window, setup, ...}, where `setup` lists
// the driver's steps to the fixed state (setupSteps). Finder's also carries the chrome `preferences` read before its
// window opened, and `savedPreferences` says when the owner's values were saved and whether that record was `kept`
// from earlier (this run's earlier up, or a run that died before restoring them).
export async function upScene(id, {run, chromeApp, electronApp, layout, io = defaultIo()}) {
  const scene = sceneOf(id), state = readState(run);
  if (state.scenes[id]) throw new Error(`scene ${id} is already up in this run; bring it down first`);
  if (layout !== undefined && id !== 'textedit') throw new Error('--layout applies to the textedit scene only');
  const checked = preflight({run, io});
  if (checked.refusals.length) throw new Refused(checked.refusals);
  let record;
  if (id === 'textedit') {
    const doc = textEditDocument({layout}), dir = join(run, 'textedit'), file = join(dir, doc.name);
    fs.mkdirSync(dir, {recursive: true, mode: 0o700});
    fs.writeFileSync(file, doc.rtf, {mode: 0o600});
    record = {app: scene.app, document: file, ...(layout && layout !== 'default' ? {layout} : {}), ...await launchOwn({app: scene.app, bundleId: scene.bundleId, files: [file], args: scene.launchArgs, io})};
  } else if (id === 'finder') {
    const folder = join(run, 'finder', FINDER_FOLDER), pid = checked.finderPid;
    if (!pid) throw new Error('Finder is not running');
    fs.mkdirSync(folder, {recursive: true, mode: 0o700});
    const modified = new Date(FINDER_FILES_MODIFIED);
    for (const name of finderFolderFiles()) {
      fs.writeFileSync(join(folder, name), `${name}\n`, {mode: 0o600});
      fs.utimesSync(join(folder, name), modified, modified);
    }
    // Read before the window opens: the owner's values, to be written back at down. A kept record that cannot say what
    // the owner's windows showed refuses here: restoring from it would leave the run's toggles in Finder's windows, and
    // this run's setup would take its hidden window for the owner's.
    const preferences = io.finderPreferences(), existing = readSavedPreferences(io.savedPreferencesFile);
    const distrust = existing && savedRecordDistrust(existing, preferences);
    if (distrust) throw new Error(`Finder's saved preferences (${io.savedPreferencesFile}) cannot be restored from: ${distrust}. Run \`node scripts/repl-parity/scenes-mac.mjs restore-finder\` to write the keys back, set the sidebar, status bar and path bar in Finder's View menu as you had them, then bring the scene up again`);
    // Every window Finder has right before the open, on screen or not, is not the run's.
    const before = documentWindows(io.appWindows(pid)).map(w => w.number);
    io.openApp({app: scene.app, files: [folder]});
    const window = await awaitWindow(pid, {before, io, onScreenOnly: true});
    // Saved once the run owns its window (no toggle can follow a failed up), from the reading taken before the open.
    const {savedAt, kept} = saveOriginalPreferences(io.savedPreferencesFile, preferences);
    record = {app: scene.app, folder, pid, window, preferences, savedPreferences: {savedAt, kept}};
  } else if (id === 'chrome') {
    const app = chromeApp ?? (await io.placeChrome()).appPath, userDataDir = freshChromeProfile(run);
    record = {scene: id, bundleId: scene.bundleId, app, userDataDir};
    try {
      record.page = await io.spawnPage(run);
      // An open can start Chrome without yielding an unambiguous launch identity.
      record.launchAttempted = true;
      Object.assign(record, await startOwn({app, bundleId: scene.bundleId, args: chromeArgs({userDataDir, url: record.page.url}), io}));
      record.window = await awaitWindow(record.pid, {io});
      // Up returns once the page has loaded, not when the window appears: the window comes before the page's document.
      record.page.loadedAt = (await awaitPageLoad(run, record.page, {io})).at;
    } catch (error) {
      // Use down's cleanup even before up completed: remove the profile only after both processes stop, or keep their
      // launch identities and the profile in state so a later down can finish (including when stopping itself throws).
      writeState(run, {...state, scenes: {...state.scenes, [id]: record}});
      await downScene(id, {run, io});
      throw error;
    }
  } else {
    const app = electronApp ?? io.buildElectron().appPath, userDataDir = join(run, 'electron-user-data');
    fs.mkdirSync(userDataDir, {recursive: true, mode: 0o700});
    record = {app, userDataDir, ...await launchOwn({app, bundleId: scene.bundleId, args: electronArgs({userDataDir}), io})};
  }
  record = {scene: id, bundleId: scene.bundleId, ...record};
  record.setup = setupSteps(id, record);
  writeState(run, {...state, scenes: {...state.scenes, [id]: record}});
  return record;
}

const recordOf = (id, run) => {
  const record = readState(run).scenes[sceneOf(id).id];
  if (!record) throw new Error(`scene ${id} is not up in this run`);
  return record;
};

// Brings an up scene's process to the front (`open -a`, which activates the running instance) and polls for up to
// `boundMs` until the frontmost process is the run's, by pid, and for Finder until the run's window (by its number) is
// its top window. When Finder is in front with another of its own windows above the run's, the run's folder is opened
// again (`open -a Finder <folder>`), once: Finder brings the window already showing that folder to the front and
// touches no other. Only while the run's window is on screen, since otherwise the open would make a new window.
// -> {scene, ok, frontmost, topWindow?, raised?, runWindow?, reason?, windowOrder?, framePin?}; ok false names what was in front instead and,
// for Finder, where the run's window stood (`runWindow`: its place among Finder's on-screen windows, front first, and
// its bounds; null when it is not among them), nothing guessed.
export async function activateScene(id, {run, io = defaultIo(), boundMs = 5000, pollMs = 250}) {
  const record = recordOf(id, run), finder = sceneOf(id).id === 'finder';
  io.activateApp(record.app);
  let frontmost = null, topWindow = null, order = [], placed = false, raised = false;
  const finish = out => {
    const windowOrder = windowOrderEvidence(order, record);
    const result = {...out, windowOrder, ...(record.framePin ? {framePin: record.framePin} : {})};
    // Also keep device-side evidence when an enclosing setup/teardown throws and its caller retains only a sentence.
    fs.appendFileSync(join(run, 'activation-guards.jsonl'), JSON.stringify({at: io.now(), ...result}) + '\n', {mode: 0o600});
    return result;
  };
  for (const t0 = io.now(); ;) {
    frontmost = io.frontmostProcess();
    if (finder) order = io.windowOrder();
    if (frontmost?.pid === record.pid) {
      if (!finder) return {scene: id, ok: true, frontmost};
      // One CGWindowList snapshot supplies both the top and the run's position. Separate front/per-app reads can
      // disagree; a missing top reading used to be reported as a foreign window without any evidence of one.
      topWindow = order[0] ?? null;
      if (topWindow?.ownerPid === record.pid && topWindow.number === record.window.number)
        return finish({scene: id, ok: true, frontmost, topWindow: {ownerPid: topWindow.ownerPid, number: topWindow.number, bounds: topWindow.bounds}, ...(raised ? {raised} : {})});
      const place = runWindowPlace(order, record);
      if (!placed) { placed = true; if (place?.order > 0) { io.showFolder(record.app, record.folder); raised = true; } }
    }
    if (io.now() - t0 >= boundMs) break;
    await io.sleep(pollMs);
  }
  if (!finder) order = io.windowOrder();
  if (frontmost?.pid !== record.pid) return finish({scene: id, ok: false, frontmost: frontmost ? {bundleId: frontmost.bundleId ?? null} : null, reason: `the run's process ${record.pid} is not frontmost within ${boundMs} ms`});
  const place = runWindowPlace(order, record);
  const targetIndex = order.findIndex(w => w.ownerPid === record.pid && w.number === record.window.number);
  const foreign = targetIndex < 0 ? null : order.slice(0, targetIndex).find(w => w.ownerPid !== record.pid);
  const blocker = foreign ? windowOwner(foreign) : null;
  const reason = place === null ? "the run's window is not in the on-screen layer-0 snapshot (closed, minimized, another Space, or unreadable)"
    : blocker ? `another process's window is on top: ${blocker.name}${blocker.pid === undefined ? '' : ` (pid ${blocker.pid})`}`
    : `${place.order} other Finder window${place.order === 1 ? ' is' : 's are'} above the run's window`;
  return finish({scene: id, ok: false, frontmost, ...(blocker ? {blocker} : {}), ...(raised ? {raised} : {}), runWindow: place,
    reason: `the run's Finder is frontmost but its top window is not the run's window: ${reason}`});
}
// The run's place among Finder's windows within that SAME on-screen ordering, never a second reading.
const runWindowPlace = (windows, record) => {
  const shown = windows.filter(w => w.ownerPid === record.pid), order = shown.findIndex(w => w.number === record.window.number);
  return order < 0 ? null : {order, bounds: shown[order].bounds};
};
const privateWindowOwner = window => /claude|chrome/i.test(`${window.ownerName ?? ''} ${window.ownerBundleId ?? ''}`);
const windowOwner = window => {
  const name = window.ownerName ?? 'unknown process';
  return privateWindowOwner(window) ? {name} : {pid: window.ownerPid, name};
};
// Prefix through the run's window. If absent, preserve the observed list and explicitly say the target was absent;
// never call those windows "above" an unobserved target. Claude/Chrome carry a name and absolutely nothing else.
const windowOrderEvidence = (windows, record) => {
  const index = windows.findIndex(w => w.ownerPid === record.pid && w.number === record.window.number);
  return {runWindowFound: index >= 0, windows: (index < 0 ? windows : windows.slice(0, index + 1)).map(w =>
    privateWindowOwner(w) ? {ownerName: w.ownerName ?? 'unknown process'}
      : {ownerPid: w.ownerPid, ownerName: w.ownerName ?? 'unknown process', layer: w.layer ?? 0, number: w.number, bounds: w.bounds})};
};

// Puts the app the owner had in front before a driver's run back in front at its end (every scene activates its own
// app, so the run otherwise leaves a scene app or Finder where the owner had, say, Terminal): only while that app still
// runs as the same process, and never a scene app, whose windows may be the run's or which the run has stopped.
// `front` is the frontmost reading taken before the run ({pid, bundleId} or null). -> {reactivated, inFront?, required?,
// reason?}: `required: false` when there is nothing to put back (nothing recorded, a scene app, the process gone), so
// a put-back that did not hold is anything else (activated but not in front, an activation refused while it runs).
export const SCENE_BUNDLE_IDS = Object.freeze(SCENE_IDS.map(id => SCENES[id].bundleId));
const REACTIVATE_WAIT_MS = 2000;
export async function reactivateApp(front, {io = defaultIo()} = {}) {
  if (!front?.bundleId) return {reactivated: false, required: false, reason: 'nothing was recorded in front'};
  if (SCENE_BUNDLE_IDS.includes(front.bundleId)) return {reactivated: false, required: false, reason: 'the app in front was a scene app; it is not brought back'};
  const runs = () => io.runningApps(front.bundleId).some(p => p.pid === front.pid);
  if (!runs()) return {reactivated: false, required: false, reason: 'the app is no longer running as the process that was in front'};
  // By pid, so another instance of the app is never the one activated and an exit after the check above launches
  // nothing (the activator refuses); then a bounded wait, since the activation completes asynchronously.
  const out = io.activateProcess({bundleId: front.bundleId, pid: front.pid});
  if (!out.activated) return {reactivated: false, ...(runs() ? {} : {required: false}), reason: out.reason};
  for (const t0 = io.now(); ;) {
    if (io.frontmostProcess()?.pid === front.pid) return {reactivated: true, inFront: true};
    if (io.now() - t0 >= REACTIVATE_WAIT_MS) return {reactivated: true, inFront: false};
    await io.sleep(100);
  }
}

// The driver's steps before `down` (teardownSteps), from the run's record and, for Finder, the owner's saved visible
// chrome. -> [step].
export function teardownFor(id, {run, io = defaultIo()}) {
  const record = recordOf(id, run);
  if (sceneOf(id).id !== 'finder') return teardownSteps(id, record);
  return teardownSteps(id, record, {visible: readSavedPreferences(io.savedPreferencesFile)?.visible ?? null});
}

// Writes back each Finder chrome key that still differs from the owner's saved value and reads them again. The keys
// alone cannot bring back what Finder's windows draw (Finder reads them only at launch), so where a visible state was
// saved, the record ends only once a teardown has also marked it restored in a window; otherwise the record is kept,
// so the next run's teardown restores it, and the output says so (`visibleRestored: false`, `visibleNote`).
// -> {preferences: {restored, wrote, remaining, savedAt, visibleRestored?, visibleNote?}} (`saved: false` instead of
// `savedAt` when nothing was saved), so the output says which run's record it restored.
export async function restoreFinder({io = defaultIo()} = {}) {
  const record = readSavedPreferences(io.savedPreferencesFile);
  if (!record) return {preferences: {restored: true, wrote: [], remaining: [], saved: false}};
  const current = io.finderPreferences(), distrust = savedRecordDistrust(record, current);
  const writes = preferenceWrites(current, record.saved);
  for (const {key, value} of writes) io.writeFinderPreference(key, value);
  const remaining = preferenceWrites(io.finderPreferences(), record.saved).map(w => w.key);
  // An untrusted record (savedRecordDistrust) has no visible state a teardown could restore: it ends once its keys are
  // back, and the owner is told to check the View menu. A trusted one with an unrestored visible state is kept.
  const visibleRestored = distrust ? false : record.visible ? Boolean(record.visibleRestoredAt) : null;
  if (!remaining.length && (distrust || visibleRestored !== false)) clearSavedPreferences(io.savedPreferencesFile);
  const visibleNote = distrust
    ? `Finder's windows may still draw a run's hidden chrome: the saved record ${distrust.replace(/^it /, '')}; set the sidebar, status bar and path bar in Finder's View menu as you had them (Finder reads the keys only at launch)`
    : 'Finder\'s windows may still draw the run\'s hidden chrome: no window was toggled back here, and Finder reads the keys only at launch; the record is kept, so the next Finder scene\'s teardown restores it (or set the parts back in Finder\'s View menu)';
  return {preferences: {restored: !remaining.length, wrote: writes.map(w => w.key), remaining, savedAt: record.savedAt,
    ...(visibleRestored === null ? {} : {visibleRestored}),
    ...(visibleRestored === false ? {visibleNote} : {})}};
}

// Brings one scene down: stops only what the run recorded at its launch. Finder: writes back what the hiding still
// leaves changed in Finder's preferences (restoreFinder; also with no record, for a run that died after saving), and is
// down once the run's window is gone. The keys are written back with the window still open too (a teardown that could
// not reach the window must not leave them hidden; Finder reads them only at launch, so the open window is unchanged),
// and the saved record stays until a teardown has brought the window's chrome back. -> {scene, down: boolean, ...}; a
// scene still up (a process that would not exit, Finder's window still open or a preference not restored) stays in the
// state so a later down can finish it.
export async function downScene(id, {run, io = defaultIo()}) {
  sceneOf(id);
  const state = readState(run), record = state.scenes[id];
  if (!record) {
    if (id !== 'finder') return {scene: id, down: true, wasUp: false};
    const {preferences} = await restoreFinder({io});
    return {scene: id, down: preferences.restored, wasUp: false, ...(preferences.saved === false ? {} : {preferences}),
      ...(preferences.restored ? {} : {reason: unrestored(preferences)})};
  }
  let result;
  if (id === 'finder') {
    const open = documentWindows(io.appWindows(record.pid)).some(w => w.number === record.window.number);
    const {preferences} = await restoreFinder({io});
    const kept = preferences.saved === false ? {} : {preferences};
    if (open) result = {down: false, windowOpen: true, ...kept, reason: `the run's Finder window is still open; send the teardown steps (teardown-steps finder), then run down again${preferences.restored ? '' : `. ${unrestored(preferences)}`}`};
    else result = {down: preferences.restored, ...kept, ...(preferences.restored ? {} : {reason: unrestored(preferences)})};
  } else {
    // Without a captured identity no browser is safe to signal; only absence can release an attempted launch's profile.
    const stopped = id === 'chrome' && record.launchAttempted && !record.pid
      ? {stopped: [], remaining: io.runningApps(CHROME_FOR_TESTING_BUNDLE_ID).map(p => p.pid), skipped: 'browser launch was not identified; none is safe to signal'}
      : await io.stopRecorded(record);
    const page = record.page ? await io.stopRecorded(record.page) : null;
    result = {down: !stopped.remaining.length && !page?.remaining.length, stopped, ...(page ? {page} : {})};
    // Chrome's profile is the launch's alone (freshChromeProfile): removed once Chrome has exited, never under it.
    if (id === 'chrome' && result.down) fs.rmSync(record.userDataDir, {recursive: true, force: true, maxRetries: 3});
  }
  if (result.down) { const {[id]: _, ...rest} = state.scenes; writeState(run, {...state, scenes: rest}); }
  return {scene: id, ...result};
}

const unrestored = ({remaining}) => `Finder's ${remaining.join(', ')} did not take the owner's saved value back; run restore-finder again, and if it persists set it in Finder's View menu`;

// The page server, detached from the command that starts it so it outlives the ssh session; it writes {url, port} into
// the run directory once it listens, {port, at} once the page's load beacon arrives (PAGE_LOADED, read by
// readPageLoaded), and stops on SIGTERM.
const PAGE_LOADED = 'chrome-page-loaded.json';
export const readPageLoaded = run => { try { return JSON.parse(fs.readFileSync(join(run, PAGE_LOADED), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
export async function spawnPage(run, {boundMs = 10_000} = {}) {
  const ready = join(run, 'chrome-page.json');
  fs.rmSync(ready, {force: true});
  fs.rmSync(join(run, PAGE_LOADED), {force: true});
  const child = spawn(process.execPath, [SCRIPT, 'serve-page', '--run', run], {detached: true, stdio: 'ignore'});
  child.unref();
  for (const t0 = Date.now(); Date.now() - t0 < boundMs; await sleep(100)) {
    let page;
    try { page = JSON.parse(fs.readFileSync(ready, 'utf8')); } catch { continue; }
    return {pid: child.pid, at: launchOf(child.pid), url: page.url, port: page.port};
  }
  try { process.kill(child.pid, 'SIGTERM'); } catch {}
  throw new Error(`the scene page did not start within ${boundMs} ms`);
}
const writeAtomically = (file, value) => {
  const temporary = `${file}.${process.pid}`;
  fs.writeFileSync(temporary, JSON.stringify(value) + '\n', {mode: 0o600});
  fs.renameSync(temporary, file);
};
async function servePage(run) {
  let port = null;
  const page = await startScenePage({onReady: () => writeAtomically(join(run, PAGE_LOADED), {port, at: Date.now()})});
  port = page.port;
  writeAtomically(join(run, 'chrome-page.json'), {url: page.url, port: page.port});
  process.once('SIGTERM', () => page.close().then(() => process.exit(0)));
}

// The shell command that runs this CLI in the device's harness checkout (for topology.mjs's remoteCommand).
export const sceneCommand = (args, {checkout = PARITY_CHECKOUT} = {}) => `cd ${checkout} && node scripts/repl-parity/scenes-mac.mjs ${args.map(quote).join(' ')}`;

// A command's exit status: 1 when a refusal holds, a scene stays up after down, an activation fails or Finder's
// preferences stay changed, else 0.
export const exitCodeFor = out => (out?.refusals?.length || out?.down === false || out?.ok === false || out?.preferences?.restored === false ? 1 : 0);

// ---- CLI --------------------------------------------------------------------------------------------------------------

function parse(argv) {
  const [command, ...rest] = argv, flags = {}, positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) { flags[rest[i].slice(2)] = rest[i + 1]; i++; } else positional.push(rest[i]);
  }
  return {command, positional, flags};
}
const runDir = flags => {
  const run = flags.run;
  if (!run || !isAbsolute(run)) throw new Error('--run <absolute directory> is required');
  fs.mkdirSync(run, {recursive: true, mode: 0o700});
  return fs.realpathSync(run);
};

export async function main(argv) {
  const {command, positional: [target], flags} = parse(argv);
  switch (command) {
    case 'describe': return describeScenes();
    case 'preflight': return preflight({run: runDir(flags)});
    case 'place-chrome': return placeChromeForTesting(flags.cache ? {cacheRoot: flags.cache} : {});
    case 'build-electron': return buildElectronFixture(flags.cache ? {cacheRoot: flags.cache} : {});
    case 'front': return frontWindow();
    case 'frontmost': return frontmostProcess();
    case 'reactivate': return reactivateApp({bundleId: flags['bundle-id'], pid: Number(flags.pid)});
    case 'up': return upScene(target, {run: runDir(flags), chromeApp: flags['chrome-app'], electronApp: flags['electron-app'], layout: flags.layout});
    case 'activate': return activateScene(target, {run: runDir(flags)});
    case 'teardown-steps': return {scene: target, steps: teardownFor(target, {run: runDir(flags)})};
    case 'restore-finder': return restoreFinder();
    case 'down': {
      const run = runDir(flags);
      if (target !== 'all') return downScene(target, {run});
      const results = [];
      for (const id of [...SCENE_IDS].reverse()) results.push(await downScene(id, {run}));
      return {down: results.every(r => r.down), scenes: results};
    }
    case 'serve-page': await servePage(runDir(flags)); return undefined;
    default: throw new Error('usage: scenes-mac.mjs describe | preflight | place-chrome | build-electron | front | up <scene> | activate <scene> | teardown-steps <scene> | down <scene|all> (--run <dir>) | restore-finder');
  }
}

if (process.argv[1] && SCRIPT === fs.realpathSync(process.argv[1])) {
  main(process.argv.slice(2)).then(
    out => { if (out !== undefined) process.stdout.write(JSON.stringify(out) + '\n'); process.exitCode = exitCodeFor(out); },
    error => { process.stdout.write(JSON.stringify({error: error.message, ...(error.refusals ? {refusals: error.refusals} : {})}) + '\n'); process.exitCode = 1; });
}
