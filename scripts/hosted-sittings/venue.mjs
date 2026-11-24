// The hosted venue (ruling 1169; #117 M5): where the scene windows stand on a GitHub-hosted runner. Setup switches the
// display to 1920x1080 (./display-mode.mjs), and replayd's two capture alerts re-centre with it, to about x 830-1153,
// y 188-608 (pilot A's re-run, run 45252131587), which leaves the strip x 0-822 clear. The approved engine's frame probe
// moves Finder windows only (native/engine/Sources/Engine/WindowFrameProbe.swift), so every other window is placed
// without an Accessibility write:
//   chrome      Chrome for Testing launched at the venue's frame (--window-position, --window-size), 800x760 here
//   electron    the fixture launched at the venue's frame (its BrowserWindow's bounds, --cua-fixture-bounds), 720x560
//   finder      the existing probe pins its window at the venue's frame (setup step `finderFrame`), 800x520
//   textedit    TextEdit sizes its own windows: a new document from its preferences, WidthInChars, written to
//               com.apple.TextEdit on the throwaway runner before any judged launch and read back from its sandbox
//               container's plist, the file TextEdit reads (writeTextEditDefaults), its saved application state removed
//               and window restoration off (ApplePersistenceIgnoreState), so no launch restores a warm-up's window; the parity
//               scenes' document, an RTF opened as a file, from the view size the file carries (TEXTEDIT_DOCUMENT_VIEW,
//               `\vieww`/`\viewh`, written by the device's `up`). Nothing in its preferences places a window (its binary
//               names no frame autosave and its DocumentWindow nib carries none), so its origin stays AppKit's cascade,
//               and each run reads the frame back. NSRequiresOpenUntitledWindowAtLaunch NO beside it
//               (the parity scenes' launch argument, ../repl-parity/scenes-mac.mjs) skips the untitled document AppKit
//               opens at launch, whose frame differed between a runner's first TextEdit launch and the next (pilot A,
//               run 45272465181), so the documents the runs make are TextEdit's only windows
//   openPanel   the Open panel's frame autosave (AppKit's `NSWindow Frame NSNavPanelAutosaveName` in the host app's
//               domain, which this Mac's TextEdit and Preview domains both hold) and its size
//               (NSNavPanelExpandedSizeForOpenMode), written beside WidthInChars; whether the out-of-process panel
//               honours them is read back at every opening (the matrix's meta.placement.panel, A's meta.placement)
// Each frame is the hosted size at the mini's origin, moved clear of the alert windows read fresh after the switch by
// the shared clearFrame (./alert-guard.mjs), once, in setup, so both sides of every pair launch at one frame. A window
// that still lands under an alert is the guard's to refuse (NO VERDICT alert); nothing is re-placed mid-run.
//
// The venue record (setup.json `venue`, the runner record's, each lane's meta.venue) declares every frame that differs
// from the mini's: the frame, the reason (the alert windows read fresh), and the cells whose layout rests on it
// (../native-matrix/plan.mjs framedCells, and native-mac's scene trees). frameAsymmetry is the hosted record check's
// symmetry rule: a pair whose sides stood on different frames is NO VERDICT, naming them (./checks.mjs `record`).
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstatSync, rmSync, unlinkSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {FINDER_FRAME} from '../repl-parity/scenes-mac-finder.mjs';
import {SCENES, TEXTEDIT_LAYOUTS, textEditDocument, textEditViewWords} from '../repl-parity/scenes-mac.mjs';
import {framedCells} from '../native-matrix/plan.mjs';
import {MENU_BAR, clearFrame, overlaps} from './alert-guard.mjs';
import {assertGithubHosted} from './runner.mjs';

// The scenes' own frames, as the mini launches and pins them.
export const MINI_FRAMES = Object.freeze({chrome: SCENES.chrome.placement, electron: SCENES.electron.placement, finder: FINDER_FRAME});
// The hosted sizes (ruling 1169): Chrome 800x760 (the mini's height kept, so the scene page still fits its window and
// NOT_APPLICABLE's "nothing to scroll" holds), the fixture's own 720x560 (so ELECTRON_FIELD_LAYOUT holds as it is),
// Finder about 800x520 (its height kept, so its list shows the rows it shows on the mini), the Open panel 720x440.
export const HOSTED_SIZES = Object.freeze({chrome: {width: 800, height: 760}, electron: {width: 720, height: 560}, finder: {width: 800, height: 520}, openPanel: {width: 720, height: 440}});
// Where each frame starts before clearFrame: the mini's origin; the panel, which the mini leaves to AppKit (centred on
// the screen, where the alerts are), at Finder's.
const ORIGINS = Object.freeze({...MINI_FRAMES, openPanel: FINDER_FRAME});

const rectText = r => `${r.x},${r.y} ${r.width}x${r.height}`;
const alertsText = alerts => alerts.map(a => `alert ${a.number ?? '?'} (${rectText(a.bounds ?? a)})`).join(', ');

// Each scene's hosted frame from the alert windows read fresh after the mode switch (`alerts`: [{number, bounds}] or
// rectangles; null when the window list was unread) and the displays. -> {frames: {scene: frame}, scenes: {scene: {base,
// frame, moved, reason?}}}. A frame no move clears, or an unread screen, keeps its base, with the reason.
export function hostedFrames(alerts, displays) {
  const scenes = {}, frames = {};
  for (const [scene, size] of Object.entries(HOSTED_SIZES)) {
    const base = {x: ORIGINS[scene].x, y: ORIGINS[scene].y, ...size};
    const placed = alerts === null || alerts === undefined ? {frame: null, moved: false, reason: 'the window list was unread after the mode switch: the hosted size at the mini\'s origin, unplaced; the guard refuses what an alert overlaps'}
      : clearFrame(base, alerts, displays ?? []);
    scenes[scene] = {base, frame: placed.frame ?? base, moved: placed.moved, ...(placed.reason ? {reason: placed.reason} : {})};
    frames[scene] = scenes[scene].frame;
  }
  return {frames, scenes};
}

// ---- TextEdit's preferences -------------------------------------------------------------------------------------------

export const TEXTEDIT_DOMAIN = 'com.apple.TextEdit';
// TextEdit opens a window WidthInChars characters wide (75 by default). Pilot A's re-run read its first window at
// 241,87 586x488 and its new document at 242,107 603x505 at 1920x1080 (pilot B's scene window was 627 wide at
// 1024x768): the new document's right edge, 845, met alert 31. 60 characters scale the widest of those to at most 0.8 of
// it plus the fixed part (the scroller and padding), about 500 points, so a window cascaded 20 points right of 242 ends
// near 770, under the strip's 822. The height is left to TextEdit: the strip is clear top to bottom.
export const TEXTEDIT_WIDTH_IN_CHARS = 60;
export const TEXTEDIT_DEFAULT_WIDTH_IN_CHARS = 75;
export const PANEL_FRAME_KEY = 'NSWindow Frame NSNavPanelAutosaveName';
export const PANEL_SIZE_KEY = 'NSNavPanelExpandedSizeForOpenMode';
// AppKit's saved-frame string (-[NSWindow stringWithSavedFrame]): the window's frame in AppKit's coordinates (origin at
// the main display's bottom left), then the frame of the screen it was saved on, its visible part: here the display less
// the menu bar. Only the vertical part of that screen frame can differ from what AppKit reads (a Dock it subtracts), and
// the strip is clear top to bottom, so only x must hold, and both widths are the display's.
export const savedFrameString = (frame, display) =>
  `${frame.x} ${display.height - frame.y - frame.height} ${frame.width} ${frame.height} ${display.x} ${display.y} ${display.width} ${display.height - MENU_BAR} `;
// The writes to TextEdit's own domain: its width in characters, no untitled document at launch, no window restored at
// launch, the Open panel's saved frame and its size. -> [{key, type, value, readsAs?}].
export const UNTITLED_AT_LAUNCH_KEY = 'NSRequiresOpenUntitledWindowAtLaunch';
// AppKit's user default that turns window restoration off (the parity scenes' launch argument too): pilot A's re-run
// (run 45277221729) read vv-1's launch window at 241,87 586x488, the frame every vv run reads, with
// NSRequiresOpenUntitledWindowAtLaunch NO in force, so the window was restored, not opened.
export const PERSISTENCE_KEY = 'ApplePersistenceIgnoreState';
export const textEditWrites = (panel, display) => [
  {key: 'WidthInChars', type: 'int', value: String(TEXTEDIT_WIDTH_IN_CHARS)},
  // A bool reads back as 0 or 1.
  {key: UNTITLED_AT_LAUNCH_KEY, type: 'bool', value: 'NO', readsAs: '0'},
  {key: PERSISTENCE_KEY, type: 'bool', value: 'YES', readsAs: '1'},
  {key: PANEL_FRAME_KEY, type: 'string', value: savedFrameString(panel, display)},
  {key: PANEL_SIZE_KEY, type: 'string', value: `{${panel.width}, ${panel.height}}`},
];
// TextEdit is sandboxed: it reads its preferences from its container's plist, which `defaults write com.apple.TextEdit`
// from outside the sandbox need not reach (pilot A's re-run, run 45277221729: WidthInChars 60 read back from the domain
// while TextEdit's new document took the default 75). The container's plist, as `defaults` names a domain by its path.
// `/usr/bin/defaults` is the one route into the container: it asks cfprefsd, which does the file's I/O, while a harness
// process that opened, stat'ed or removed anything under ~/Library/Containers itself could raise macOS's App Data
// protection dialog (kTCCServiceSystemPolicyAppDataDetailed, seen live on the mini:
// docs/evidence/2026-10-17-own-sandbox/m0/mini-vendor-computer-superseded/README.md), one more window over the scenes
// that nobody may answer. The next hosted run's screen at the end (its alert count, any window beyond them) is what
// shows no prompt came of the reads and writes.
const TEXTEDIT_CONTAINER = join('Library', 'Containers', TEXTEDIT_DOMAIN, 'Data', 'Library');
export const textEditContainerDomain = home => join(home, TEXTEDIT_CONTAINER, 'Preferences', TEXTEDIT_DOMAIN);
const readDefault = (exec, domain, key) => {
  const read = exec('/usr/bin/defaults', ['read', domain, key]);
  return read?.status === 0 ? String(read.stdout ?? '').trim() : null;
};
const writeDefault = (exec, domain, {key, type, value}) => exec('/usr/bin/defaults', ['write', domain, key, `-${type}`, value])?.status === 0;
// The writes made, only on a GitHub-hosted runner and only in TextEdit's domain (the owner's preferences are never
// written): each written to the domain and read back from it (`readBack`) and from the container's plist; one the
// container does not hold as written is written through the container's path and read back again (`container`:
// {readBack, readBackBefore?, written?}, the last two only when it was written through). exec(command, args) -> {status,
// stdout}. -> {domain, container, writes: [{key, value, readsAs?, written, readBack, container, matched}], ok}: a write
// is matched only when the container, the file TextEdit reads, holds it, and ok only when every one is (a venue declared
// but not in force would be a false record).
export function writeTextEditDefaults(writes, {env = process.env, platform = process.platform, home = env.HOME, exec = (command, args) => spawnSync(command, args, {encoding: 'utf8'})} = {}) {
  assertGithubHosted(env, platform, 'TextEdit\'s preferences');
  const container = textEditContainerDomain(home);
  const done = writes.map(write => {
    const {key, value} = write, readsAs = write.readsAs ?? value.trim();
    const written = writeDefault(exec, TEXTEDIT_DOMAIN, write), readBack = readDefault(exec, TEXTEDIT_DOMAIN, key);
    const before = readDefault(exec, container, key);
    const through = before === readsAs ? null : writeDefault(exec, container, write);
    const held = through === null ? {readBack: before} : {readBack: readDefault(exec, container, key), readBackBefore: before, written: through};
    return {key, value, ...(readsAs !== value.trim() ? {readsAs} : {}), written, readBack, container: held, matched: held.readBack === readsAs};
  });
  return {domain: TEXTEDIT_DOMAIN, container, writes: done, ok: done.every(w => w.matched)};
}
// TextEdit's saved application state outside its container: the warm-ups end TextEdit by pid, so its state outlives it,
// and the next launch would restore the window it saved (pilot A's re-run). The container's own saved state is never
// touched (no file call under ~/Library/Containers: see above); restoration off there rests on ApplePersistenceIgnoreState
// YES, read back from the container domain. -> [path].
export const textEditSavedStates = home => [join(home, 'Library', 'Saved Application State', `${TEXTEDIT_DOMAIN}.savedState`)];
// Each removed, only on a GitHub-hosted runner, after the warm-ups' TextEdit ended and before any run launches one. No
// link is followed, since one could lead into the container: the folder holding the state must be a folder of its own
// (lstat; a link there is recorded, nothing removed), and the state itself is lstat'ed: a link is unlinked, never its
// target; a folder or file removed (rmSync, which unlinks the links inside rather than following them). Only ENOENT is
// absence; any other error is recorded as one. -> [{path, existed (null when unknown), removed, link?, error?}]. A
// removal refused is recorded, not thrown: the persistence key read back from the container keeps restoration off on
// its own. fs: {lstat, unlink, removeTree}, node:fs's by default.
const errorText = error => String(error?.message ?? error).split('\n')[0];
const SAVED_STATE_FS = {lstat: lstatSync, unlink: unlinkSync, removeTree: path => rmSync(path, {recursive: true})};
export function clearTextEditSavedState(home, {env = process.env, platform = process.platform, fs = SAVED_STATE_FS} = {}) {
  assertGithubHosted(env, platform, 'TextEdit\'s saved application state');
  const look = path => { try { return {stat: fs.lstat(path)}; } catch (error) { return error?.code === 'ENOENT' ? {stat: null} : {error: errorText(error)}; } };
  return textEditSavedStates(home).map(path => {
    const folder = look(dirname(path));
    if (folder.error) return {path, existed: null, removed: false, error: `its folder could not be read: ${folder.error}`};
    if (folder.stat === null) return {path, existed: false, removed: false};
    if (!folder.stat.isDirectory()) return {path, existed: null, removed: false, error: `its folder is ${folder.stat.isSymbolicLink() ? 'a link' : 'not a folder'}: not followed`};
    const state = look(path);
    if (state.error) return {path, existed: null, removed: false, error: state.error};
    if (state.stat === null) return {path, existed: false, removed: false};
    const link = state.stat.isSymbolicLink();
    try { (link ? fs.unlink : fs.removeTree)(path); return {path, existed: true, removed: true, ...(link ? {link} : {})}; }
    catch (error) { return {path, existed: true, removed: false, ...(link ? {link} : {}), error: errorText(error)}; }
  });
}

// ---- TextEdit's scene document ----------------------------------------------------------------------------------------

// The parity scenes open the run's RTF as a file (../repl-parity/scenes-mac.mjs textEditDocument; sittings B and C), and
// an opened RTF with no view size takes its paper's width: pilot B's (run 45274556933) stood at 213,78 627x877 on both
// sides, Letter's 612 points and a 15-point scroller, its right edge 840 over alert 31 (830,188). WidthInChars sizes new
// documents only. So on a hosted runner the document carries TextEdit's own saved view size (`\vieww`, `\viewh`), which
// AppKit's RTF reader returns as NSViewSizeDocumentAttribute and TextEdit sizes the window from: the view, its text
// padding (5 a side) and the scroller. 480 points wide: a window cascaded from the furthest origin read so far (242,
// pilot A's new document; pilot B's was 213) one step of 30 further right ends at 242 + 30 + 480 + 25 = 777, left of the
// strip's 822. The height is Letter's 792, which the 877-point window TextEdit opened unasked suggests it took (792 and
// its bars), so the rows shown stay; the read-back says. The same plan reaches every side through the runner record.
export const TEXTEDIT_DOCUMENT_VIEW = Object.freeze({width: 480, height: 792});
const sha256 = text => createHash('sha256').update(text).digest('hex');
// What the venue declares of the document: the view, its control words, and each layout's file as the mini writes it
// (no view) and as a hosted runner does, by sha256. -> {document, view, controlWords, sha256: {layout: {mini, hosted}}}.
export function textEditDocumentPlan(view = TEXTEDIT_DOCUMENT_VIEW) {
  const sha = layout => ({mini: sha256(textEditDocument({layout}).rtf), hosted: sha256(textEditDocument({layout, view}).rtf)});
  return {document: textEditDocument().name, view: {...view}, controlWords: textEditViewWords(view), sha256: Object.fromEntries(Object.keys(TEXTEDIT_LAYOUTS).map(layout => [layout, sha(layout)]))};
}

// ---- The record --------------------------------------------------------------------------------------------------------

// Each scene's difference from the mini, why, and what rests on it. `framedCells` (the matrix's plan) gives the cells
// whose points, fractions or visible rows stand on the window; native-mac's scene trees follow the window too.
const NATIVE_MAC = {
  chrome: 'native-mac chrome (its tree: the page in the window, both lanes alike)',
  electron: 'native-mac electron (its tree)',
  finder: 'native-mac finder (its tree: the rows its height shows; the diff pairs equal frames only)',
  textedit: 'native-mac textedit (its tree)',
};
const GROUNDING = {
  chrome: 'window points re-grounded on the hosted size: the page has no stylesheet, so the notes field stands at the same window points; the drag\'s layout takes the venue\'s 800x760 (../native-matrix/plan.mjs groundCase)',
  electron: 'window points on the fixture\'s size, unchanged at 720x560: its layout (ELECTRON_FIELD_LAYOUT, #259\'s point) holds as it is; only the origin moved',
  finder: 'element-addressed rows; the height is the mini\'s, so the same rows are visible',
  textedit: 'fractions of the document window (its drag) and its own rows: valid at any width the text view fills, the prepare\'s clicks proving each end',
  textEditDocument: 'the window\'s size only: the file is the mini\'s with the view size inserted, so its text and attribute runs are the mini\'s (textutil\'s text and HTML of both files are equal, test/repl-parity/scenes-mac.test.mjs); the cells\' fractions and rows hold as for TextEdit\'s preferences; the wide page stays wider than the window (its 200% zoom)',
  openPanel: 'element-addressed (its Cancel, its search field, the Save sheet\'s name field, A\'s New Document): the frame decides only whether the guard refuses them; on a hosted runner the matrix moves each opening into the strip by Accessibility (ruling 1195), and a read-back outside it is NO VERDICT venue',
};
const PANEL_CELLS = ['openPanel/frontmost/getAXState.panel', 'openPanel/frontmost/typeText.search', 'openPanel/frontmost/pressKey.escape', 'openPanel/frontmost/click.cancel',
  'openPanel/background/getAXState.panel@finder', 'openPanel/background/click.cancel@finder', 'savePanel/frontmost/pressKey.escape', 'savePanel/frontmost/typeText.name',
  'native-baseline setup.newDocument (the panel at TextEdit\'s launch, where one shows: the mini\'s)'];
const cellsOf = scene => [...framedCells(scene).map(c => c.id), NATIVE_MAC[scene]];
const WIDE_PAGE_CELL = 'hscroll/textedit-wide-page/right (the wide-page layout: its page wider than the window)';

// The venue block: the alert windows read fresh after the switch, the display, the frames the scenes launch at, TextEdit's
// preferences as written and read back, its scene document's view (textEditDocumentPlan), and each difference from the
// mini's. `placed`: hostedFrames'. -> venue.
export function venueRecord({alerts, displays, placed, textEdit}) {
  const display = (displays ?? []).find(d => d.x === 0 && d.y === 0) ?? displays?.[0] ?? null;
  const fresh = alerts === null || alerts === undefined ? null : alerts.map(a => ({number: a.number ?? null, bounds: a.bounds ?? a}));
  const why = scene => {
    const frame = placed.frames[scene], mini = MINI_FRAMES[scene] ?? null;
    const geometry = fresh === null ? 'the alert windows were unread after the mode switch' : fresh.length ? `the capture alerts read fresh after the mode switch: ${alertsText(fresh)}` : 'no alert window after the mode switch';
    const under = mini && fresh?.some(a => overlaps(a.bounds, mini)) ? `; the mini's ${rectText(mini)} would overlap them` : '';
    const size = scene === 'chrome' ? '; Chrome is 800x760 on a hosted runner (ruling 1169)' : scene === 'openPanel' ? '; the mini leaves the panel centred, where the alerts are' : '';
    const moved = placed.scenes[scene]?.reason ? `; ${placed.scenes[scene].reason}` : '';
    return `${geometry}${under}${size}; the frame ${rectText(frame)}${moved}`;
  };
  const differences = [];
  for (const scene of ['chrome', 'electron', 'finder']) {
    const hosted = placed.frames[scene], mini = MINI_FRAMES[scene];
    if (['x', 'y', 'width', 'height'].every(k => hosted[k] === mini[k])) continue;
    differences.push({scene, mini, hosted, reason: why(scene), grounding: GROUNDING[scene], cells: cellsOf(scene)});
  }
  differences.push({scene: 'textedit', mini: {WidthInChars: TEXTEDIT_DEFAULT_WIDTH_IN_CHARS, [UNTITLED_AT_LAUNCH_KEY]: 'YES (AppKit\'s default)', [PERSISTENCE_KEY]: 'NO (AppKit\'s default: windows restored)'},
    hosted: {WidthInChars: TEXTEDIT_WIDTH_IN_CHARS, [UNTITLED_AT_LAUNCH_KEY]: 'NO', [PERSISTENCE_KEY]: 'YES', 'saved application state': 'to be removed after the warm-ups, outside the container (venue.textEdit.savedState says what was)'},
    reason: `${fresh === null ? 'the alert windows were unread after the mode switch' : `the capture alerts read fresh after the mode switch: ${alertsText(fresh)}`}; at 1920x1080 TextEdit's default width put its new document at 242,107 603x505 (pilot A, run 45252131587), over alert 31; its origin is AppKit's cascade, read back by each run; the untitled document AppKit opens at launch stood at 241,87 586x488 on the runner's first TextEdit launch and 213,78 387x505 on the next (pilot A, run 45272465181), so none is opened (the design session); vv-1's launch window again stood at 241,87 586x488 with that key in force and its new document took 603x505, the default width, though the domain read WidthInChars 60 back (pilot A's re-run, run 45277221729): a window the warm-ups' saved state restored, and a domain write the sandboxed TextEdit does not read, so restoration is turned off, removing the saved state outside the container is attempted (venue.textEdit.savedState records the outcome) and every key is read back from TextEdit's container`,
    grounding: GROUNDING.textedit, cells: cellsOf('textedit')});
  const document = textEditDocumentPlan(), hashes = side => Object.fromEntries(Object.entries(document.sha256).map(([layout, h]) => [`sha256 ${layout}`, h[side]]));
  differences.push({scene: 'textedit document', mini: {'view size': 'none: TextEdit takes the paper\'s width', ...hashes('mini')},
    hosted: {'view size': `${document.view.width}x${document.view.height} (${document.controlWords})`, ...hashes('hosted')},
    reason: `the scene's ${document.document}, opened as a file with no view size, stood at 213,78 627x877 on both sides (pilot B, run 45274556933): the paper's width, which WidthInChars does not change, its right edge 840 over alert 31; a view ${document.view.width} wide ends left of the strip's 822 from the cascade origins read so far, one step more; its origin is AppKit's cascade, read back by each run`,
    grounding: GROUNDING.textEditDocument, cells: [...cellsOf('textedit'), WIDE_PAGE_CELL]});
  differences.push({scene: 'openPanel', mini: 'AppKit\'s: centred on the screen', hosted: placed.frames.openPanel, reason: why('openPanel'), grounding: GROUNDING.openPanel, cells: PANEL_CELLS});
  return {alerts: fresh, display, frames: placed.frames, textEdit: textEdit ?? null, textEditDocument: document, differences};
}

const frameCell = f => (f && typeof f === 'object' && 'x' in f ? rectText(f) : f && typeof f === 'object' ? Object.entries(f).map(([k, v]) => `${k} ${v}`).join(', ') : String(f ?? ''));
const escape = text => String(text).replace(/\|/g, '\\|');
// One preference as setup wrote it (writeTextEditDefaults): held by TextEdit's container or not, and whether it had to be
// written through it. A record from before the container was read keeps its one read-back.
const textEditWriteText = w => {
  if (!w.container) return `${w.key} ${w.matched ? 'read back' : `NOT read back (${w.readBack ?? 'unread'})`}`;
  if (!w.matched) return `${w.key} NOT read back from the container (${w.container.readBack ?? 'unread'}; the domain read ${w.readBack ?? 'unread'})`;
  return `${w.key} read back${w.container.written !== undefined ? ' (written through the container: the domain\'s write did not reach it)' : ''}`;
};
const savedStateText = s => (s.removed ? `removed ${s.link ? 'the link ' : ''}${s.path}` : s.existed === false ? `none at ${s.path}` : `NOT removed ${s.path} (${s.error ?? 'unknown'})`);
// The input sources setup enabled (ruling 1189, ./input-sources.mjs): each as TIS's enabled list and the preference's
// value read it back, and the sources the runs could not select. -> lines.
const listedText = s => (!s.tis ? 'unread' : !s.tis.installed ? 'not installed' : !s.tis.listed ? 'not in TIS\'s enabled list'
  : `in TIS's enabled list, ${s.tis.enabled ? 'enabled' : 'NOT enabled'}${s.selects ? `, ${s.tis.selectCapable ? 'selectable' : 'NOT selectable'}` : ' (the input method its mode needs)'}`);
function renderInputSources(sources) {
  if (!sources) return ['Input sources: none enabled (no `input sources` step recorded): the image\'s own.', ''];
  const each = sources.sources.map(s => `| ${s.id} | ${s.enable ? (s.enable.already ? 'already enabled' : `status ${s.enable.status ?? 'none'}${s.enable.reason ? ` (${s.enable.reason})` : ''}`) : 'not attempted'} | ${escape(listedText(s))} | ${s.preference === null ? 'unread' : s.preference ? 'listed' : 'not listed'} | ${s.held ? 'yes' : '**no**'} |`);
  return [`Input sources (ruling 1189): enabled through ${sources.via}, read back from TIS's enabled list after ${sources.reads} read${sources.reads === 1 ? '' : 's'}; the preference's value (com.apple.HIToolbox AppleEnabledInputSources) recorded beside it; restored: ${sources.restored}. `
    + (sources.missing.length ? `**Not enabled: ${sources.missing.join(', ')}**: every input row selecting ${sources.missing.length === 1 ? 'it' : 'them'} is NO VERDICT \`venue\`.` : 'Every source the runs select held.')
    + (sources.error ? ` The helper failed: ${sources.error}.` : ''), '',
    '| source | enable | TIS\'s enabled list | the preference | held |', '|---|---|---|---|---|', ...each, ''];
}

// sitting.md's section: the venue's differences, one row each, with the cells resting on them. -> markdown.
export function renderVenue(venue) {
  const head = ['## The venue (ruling 1169)', ''];
  if (!venue) return [...head, 'no venue recorded: the scenes ran on their own frames (no hosted setup on this machine).', ''].join('\n');
  const writes = venue.textEdit?.writes?.length ? `TextEdit's preferences (${venue.textEdit.domain}, read back from its container's plist): ${venue.textEdit.writes.map(textEditWriteText).join(', ')}.` : 'TextEdit\'s preferences: none recorded.';
  const states = venue.textEdit?.savedState ? ` TextEdit's saved application state: ${venue.textEdit.savedState.map(savedStateText).join('; ')}.` : '';
  return [...head, `The alert windows after the mode switch: ${venue.alerts === null ? 'unread' : venue.alerts.length ? alertsText(venue.alerts) : 'none'}. ${writes}${states}`, '',
    ...renderInputSources(venue.inputSources), 
    '| scene | the mini | hosted | why | grounding | cells resting on it |', '|---|---|---|---|---|---|',
    ...venue.differences.map(d => `| ${d.scene} | ${escape(frameCell(d.mini))} | ${escape(frameCell(d.hosted))} | ${escape(d.reason)} | ${escape(d.grounding)} | ${escape(d.cells.join(', '))} |`), ''].join('\n');
}

// ---- Symmetry ----------------------------------------------------------------------------------------------------------

// The frames one side stood on, keyed alike on both sides of a pair: the venue it launched at (`venue:<scene>`) and every
// window it read back, as each producer records its placement: the matrix's meta.placement ({scenes: {id: entry}, panel:
// [entry]}), native-mac's meta.scenes[id].placement ({windows}) and the baseline's meta.placement ([{at, windows}]). The
// scratch document's record (`textedit up`, {placement: {windows}}) is read as one step. An entry's frame is where the
// window was last read: its read-back when a move read one back, else where it was read before (a window not moved,
// one the probe was not asked to move, one whose move read nothing back, pilot B's), so no window read is dropped.
// -> {key: frame}.
const standing = entry => entry?.readBack ?? entry?.from ?? null;
const numbered = (prefix, windows, out) => {
  const seen = {};
  for (const w of windows ?? []) {
    seen[w.scene] = (seen[w.scene] ?? 0) + 1;
    const frame = standing(w);
    if (frame) out[`${prefix}${w.scene}#${seen[w.scene]}`] = frame;
  }
};
export function sceneFrames(record) {
  const meta = record?.meta ?? record ?? {}, out = {};
  for (const [scene, frame] of Object.entries(meta.venue?.frames ?? {})) out[`venue:${scene}`] = frame;
  const placement = meta.placement;
  if (Array.isArray(placement)) for (const step of placement) numbered(`${step.at}/`, step.windows, out);
  else if (placement?.scenes) {
    for (const [scene, entry] of Object.entries(placement.scenes)) { const frame = standing(entry); if (frame) out[scene] = frame; }
    (placement.panel ?? []).forEach((entry, i) => { const frame = standing(entry); if (frame) out[`openPanel#${i + 1}`] = frame; });
  } else if (Array.isArray(placement?.windows)) numbered('', placement.windows, out);
  for (const [id, scene] of Object.entries(meta.scenes ?? {})) numbered(`${id}/`, scene?.placement?.windows, out);
  return out;
}
// Recorded checks (1) and (2) of ruling 1169: where each step's TextEdit windows and Open panels stood (sceneFrames),
// against what the venue planned (TextEdit: the scene document's view size for the parity scenes' document, the matrix's
// `textedit` and native-mac's `textedit/...`, its width in characters for a new or scratch document, and its right edge
// left of the alerts, its origin being AppKit's; the panel: its saved frame) and whether an alert the venue read
// overlapped them. `records`: [{step, record}]. -> [{step, window, planned, actual, overlap}].
export function readBackRows(records, venue) {
  const alerts = (venue?.alerts ?? []).map(a => a.bounds ?? a);
  const width = venue?.differences?.find(d => d.scene === 'textedit')?.hosted?.WidthInChars ?? TEXTEDIT_WIDTH_IN_CHARS;
  const view = venue?.textEditDocument?.view ?? null;
  const edge = alerts.length ? `left of x ${Math.min(...alerts.map(a => a.x))}` : 'no alert to keep left of';
  const sceneDocument = window => view !== null && (window === 'textedit' || window.startsWith('textedit/'));
  const out = [];
  for (const {step, record} of records) {
    const resizes = panelResizes(record);
    for (const [window, actual] of Object.entries(sceneFrames(record))) {
      const kind = /(?:^|\/)(textedit|openPanel)(?:#\d+)?$/.exec(window)?.[1];
      if (!kind) continue;
      const planned = kind === 'openPanel' ? venue?.frames?.openPanel ?? null : sceneDocument(window) ? `view ${view.width}x${view.height}, ${edge}` : `WidthInChars ${width}, ${edge}`;
      out.push({step, window, planned, actual, overlap: alerts.some(a => overlaps(a, actual)), ...(resizes[window] ? {resized: resizes[window]} : {})});
    }
  }
  return out;
}
// The matrix's panels resized as well as moved (ruling 1199; ../native-matrix/panels.mjs), by sceneFrames' keys.
// -> {key: {from, to}}.
function panelResizes(record) {
  const panel = (record?.meta ?? record ?? {}).placement?.panel;
  const out = {};
  if (Array.isArray(panel)) panel.forEach((entry, i) => { if (entry?.resized && standing(entry)) out[`openPanel#${i + 1}`] = entry.resized; });
  return out;
}
export function renderReadBack(rows) {
  const head = ['## TextEdit and the Open panel, read back (ruling 1169)', ''];
  if (!rows.length) return [...head, 'No TextEdit window or Open panel was read back in this sitting\'s records.', ''].join('\n');
  const text = v => (v === null ? 'unplanned' : typeof v === 'string' ? v : rectText(v));
  const size = r => `${r.width}x${r.height}`;
  // A panel the run resized to fit the strip says so beside where it stood, and whether its read-back has that size.
  const actual = r => `${rectText(r.actual)}${r.resized ? `, resized from ${size(r.resized.from)} to ${size(r.resized.to)}${size(r.actual) === size(r.resized.to) ? '' : ', the size not read back'}` : ''}`;
  return [...head, 'Where each step\'s TextEdit windows and Open panels stood, against what the venue planned, and whether an alert the venue read overlapped them (the alert guard then refused the cells there). A panel the run resized as well as moved (ruling 1199) says so.', '',
    '| step | window | planned | actual | overlaps an alert |', '|---|---|---|---|---|',
    ...rows.map(r => `| ${r.step} | ${r.window} | ${text(r.planned)} | ${actual(r)} | ${r.overlap ? 'yes' : 'no'} |`), ''].join('\n');
}
const sameFrame = (a, b) => ['x', 'y', 'width', 'height'].every(k => a?.[k] === b?.[k]);
// Why a pair's sides were not measured on one frame: each key both read whose frames differ. -> the reason, or null.
export function frameAsymmetry(record, pair) {
  if (!record || !pair) return null;
  const mine = sceneFrames(record), theirs = sceneFrames(pair);
  const differ = Object.keys(mine).filter(key => key in theirs && !sameFrame(mine[key], theirs[key]));
  return differ.length ? differ.map(key => `${key}: ${rectText(mine[key])} on this side, ${rectText(theirs[key])} on its pair`).join('; ') : null;
}
