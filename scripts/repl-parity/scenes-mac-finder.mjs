// Finder's fixed state for the macOS scenes (./scenes-mac.mjs; the own native engine spec, M1b: "Finder's golden is
// compared as full text"). The run's Finder window is the run's, but three parts of a Finder window show what the run
// does not own: the sidebar (the owner's favourites, devices, iCloud and tags), the path bar (the folders above the
// run's, the account's name among them) and the status bar (the disk's free space, which also moves between two
// recordings). The fixed state hides all three, so the window carries only the run's folder, its files and Finder's own
// vocabulary (role descriptions, button descriptions and help, identifiers, action names), and its golden can be
// compared as full text with nothing redacted.
//
// Hiding is a toggle in the window (View → Hide Sidebar ⌃⌘S, Hide Status Bar ⌘/, Hide Path Bar ⌥⌘P), sent by the driver
// through the engine with the run's window in front, because nothing outside an engine may script Finder without an
// Automation prompt. Which toggles to send is read off the window, never off the preference keys: the keys cannot
// predict what Finder draws (the closing hold on macOS 27: with ShowStatusBar unset a new window draws the status bar
// while Finder's toggle state starts hidden, so the first ⌘/ wrote 1 with the bar unchanged and the second wrote 0 and
// hid it), and Finder reads its chrome keys only at launch, so an external `defaults` write never reaches the running
// Finder (writing ShowStatusBar false before the window opened did not hide the bar); only the toggles change what its
// windows draw. So the driver observes the run's window and toggles each part until it is hidden (toggleUntil, at most
// twice), and before the first toggle it records what the window showed, the owner's visible chrome. That record and
// the keys as they were are saved in one harness-wide file (SAVED_PREFERENCES) that a later up keeps, so a run that
// dies before restoring is still restored from the owner's state by the next. Restoring is the parts toggled back, by
// observation, until the window shows the saved visible state, then the keys written back exactly where they differ
// (an unset key deleted); a toggle cannot do the second, since Finder writes the state it leaves as a Boolean.
//
// The fixed state is checked on the engine's Skyshot of the run's window before anything of it is recorded
// (finderWindowProblems): a toggle the preferences mispredicted, or a Finder that shows something new, refuses the
// recording rather than letting an owner string reach a golden. A problem names tokens, roles and fields, never text.
import * as fs from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const FINDER_DOMAIN = 'com.apple.finder';
// The parts the fixed state hides: the preference key the part's toggle writes, and the menu's key.
export const FINDER_CHROME = Object.freeze([
  {id: 'sidebar', key: 'ShowSidebar', toggle: 'ctrl+super+s'},
  {id: 'statusBar', key: 'ShowStatusBar', toggle: 'super+slash'},
  {id: 'pathBar', key: 'ShowPathbar', toggle: 'alt+super+p'},
].map(Object.freeze));
export const FINDER_PARTS = FINDER_CHROME.map(part => part.id);
export const FINDER_KEYS = FINDER_CHROME.map(part => part.key);
// The rest of the fixed state's keys: list view (the run's folder keeps it in its own .DS_Store), no row selected
// (Edit → Deselect All, so a window kept from an earlier action starts as a fresh one), and the window's close.
export const LIST_VIEW_KEY = 'super+2';
export const DESELECT_ALL_KEY = 'alt+super+a';
export const CLOSE_WINDOW_KEY = 'super+w';
// The harness-wide record of the owner's values, beside the harness's other caches.
export const SAVED_PREFERENCES = join(homedir(), 'Library/Caches/cua-harness/finder-preferences.json');

// `defaults read com.apple.finder <key>` prints 1 or 0 for a Boolean; an unset key prints nothing (exit 1, read as
// null by the device side). -> true | false | null; throws on anything else, so an unexpected type is never toggled.
export function parsePreference(text) {
  const value = String(text ?? '').trim();
  if (value === '') return null;
  if (value === '1' || value === '0') return value === '1';
  throw new Error('a Finder chrome preference is not a Boolean; the scene does not change it');
}

// The keys to write back so each holds exactly its saved value (null: delete the key). -> [{key, value}].
export const preferenceWrites = (current, saved) => FINDER_KEYS.filter(key => (current?.[key] ?? null) !== (saved?.[key] ?? null)).map(key => ({key, value: saved?.[key] ?? null}));

// ---- What the window shows, read off its structure ----------------------------------------------------------------

// The mini's Finder window on macOS 27 (the closing hold, roles and identifiers only): AXWindow → AXSplitGroup; the
// sidebar is an AXScrollArea holding an outline before an AXSplitter; then an inner AXSplitGroup holding the list's
// AXScrollArea (→ AXOutline `ListView`, the run's list), the status bar (AXUnknown `statusBar` → AXStaticText
// `statusBarText`) and, when shown, the path bar right after it (an AXList with a description → the path's components
// as AXStaticText). The `_NS:` identifiers are nib-generated and are not used.
const STATUS_BAR_IDS = new Set(['statusBar', 'statusBarText']);

// Which chrome parts the run's window shows, by structure, never by text: the sidebar as an outline besides the run's
// list (finderWindowProblems' sidebar_shown), the status bar by its identifiers, the path bar as any AXList outside the
// run's list and the toolbar (conservative: an AXList the path bar is not still reads as shown, and a part that will
// not hide refuses the scene rather than letting text through). -> {sidebar, statusBar, pathBar}, or null when the
// run's list is not in the window (another view, another folder, no observation): nothing is guessed then.
export function finderChromeShown(shot, {files}) {
  if (!shot || !Array.isArray(shot.nodes)) return null;
  const {nodes} = shot, fileNames = new Set(files);
  const outlines = nodes.flatMap((node, i) => (node.role === 'AXOutline' ? [i] : []));
  const list = outlines.find(i => nodes.slice(i + 1, subtreeEnd(nodes, i)).some(node => fileNames.has(node.value)));
  if (list === undefined) return null;
  const listEnd = subtreeEnd(nodes, list), toolbar = nodes.findIndex(node => node.role === 'AXToolbar');
  const toolbarEnd = toolbar < 0 ? -1 : subtreeEnd(nodes, toolbar);
  const outside = i => !(i >= list && i < listEnd) && !(i >= toolbar && i < toolbarEnd);
  return {
    sidebar: outlines.some(i => i !== list),
    statusBar: nodes.some((node, i) => outside(i) && STATUS_BAR_IDS.has(node.identifier)),
    pathBar: nodes.some((node, i) => outside(i) && node.role === 'AXList'),
  };
}

// The most toggles one part gets to reach the wanted state: Finder's toggle state and what its window draws can
// disagree (macOS 27 draws an unset status bar while its toggle state starts hidden, so the first ⌘/ changes nothing on
// screen), and two presses cover either case; a part that still differs is refused, never toggled further.
export const MAX_TOGGLES = 2;

// Toggles `part` until the window shows it as `shown`, observing before each toggle. `observe()` -> finderChromeShown's
// answer; `toggle(part)` sends the part's key; `sent(part)` is told after each toggle, so a run that dies has recorded
// what it sent. -> {part, shown, toggles}; throws when the window cannot be read or the part still differs after
// MAX_TOGGLES.
export async function toggleUntil({part, shown, observe, toggle, sent = () => {}, max = MAX_TOGGLES}) {
  for (let toggles = 0; ; toggles++) {
    const now = await observe();
    if (!now) throw new Error(`Finder's ${part} could not be read: the run's list is not in its window`);
    if (now[part] === shown) return {part, shown, toggles};
    if (toggles === max) throw new Error(`Finder's ${part} is still ${shown ? 'hidden' : 'shown'} after ${max} toggles; nothing more is sent`);
    await toggle(part);
    sent(part);
  }
}

// ---- The saved preferences ----------------------------------------------------------------------------------------------

export function readSavedPreferences(file = SAVED_PREFERENCES) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
// The record: {saved: the keys, savedAt, visible?: the owner's visible chrome ({sidebar, statusBar, pathBar}, observed
// before the first toggle), toggles?: {part: count} sent (information), visibleRestoredAt?: when a teardown brought
// the window back to `visible` (unset again by any later toggle)}.
function writeRecord(file, record) {
  fs.mkdirSync(dirname(file), {recursive: true, mode: 0o700});
  const temporary = `${file}.${process.pid}`;
  fs.writeFileSync(temporary, JSON.stringify(record, null, 2) + '\n', {mode: 0o600});
  fs.renameSync(temporary, file);
}
const existingRecord = file => {
  const record = readSavedPreferences(file);
  if (!record) throw new Error('no saved Finder preferences: the chrome is recorded only beside the owner\'s keys (up finder saves them)');
  return record;
};
// Saves `preferences` as the owner's unless a record exists already, whose values are then kept (they predate this
// run's toggles, or an earlier run's that never restored). -> {saved, savedAt, kept}.
export function saveOriginalPreferences(file, preferences, {now = () => new Date().toISOString()} = {}) {
  const existing = readSavedPreferences(file);
  if (existing) return {...existing, kept: true};
  const record = {saved: Object.fromEntries(FINDER_KEYS.map(key => [key, preferences?.[key] ?? null])), savedAt: now()};
  writeRecord(file, record);
  return {...record, kept: false};
}
// Records the owner's visible chrome unless the record has one: an earlier run's that died is the owner's, while this
// run's window may already show that run's toggles. -> {visible, kept}.
export function recordVisibleState(file, visible) {
  const record = existingRecord(file);
  if (record.visible) return {visible: record.visible, kept: true};
  writeRecord(file, {...record, visible: Object.fromEntries(FINDER_PARTS.map(part => [part, visible[part] === true]))});
  return {visible: readSavedPreferences(file).visible, kept: false};
}
// Drops the restored mark, durably, before a toggle's key is sent: a run that dies between the key and its count must
// not leave a record that reads as restored while Finder draws the part toggled.
export function unmarkVisibleRestored(file) {
  const {visibleRestoredAt, ...record} = existingRecord(file);
  if (visibleRestoredAt !== undefined) writeRecord(file, record);
}
// Counts one toggle of `part` sent, and drops any restored mark: the window has moved since.
export function recordToggleSent(file, part) {
  const {visibleRestoredAt, ...record} = existingRecord(file);
  void visibleRestoredAt;
  writeRecord(file, {...record, toggles: {...record.toggles, [part]: (record.toggles?.[part] ?? 0) + 1}});
}
// Marks the visible chrome brought back to the saved state.
export function markVisibleRestored(file, {now = () => new Date().toISOString()} = {}) {
  writeRecord(file, {...existingRecord(file), visibleRestoredAt: now()});
}
export const clearSavedPreferences = (file = SAVED_PREFERENCES) => fs.rmSync(file, {force: true});

// ---- The fixed state, checked on a Skyshot ------------------------------------------------------------------------------

// Finder's default toolbar on macOS 27 (the mini's M0 capture), its items by role and subrole: back and forward, the
// view switcher, Group, Share, Tags, Action, Search. An item the owner added (a folder or app dragged into the toolbar)
// would show their name, possibly only as a description, which is otherwise Finder's own vocabulary.
export const FINDER_DEFAULT_TOOLBAR = Object.freeze([
  ['AXGroup', null], ['AXGroup', null], ['AXMenuButton', null], ['AXButton', null], ['AXButton', null], ['AXMenuButton', null], ['AXGroup', null],
].map(Object.freeze));
// The fields that carry an element's content; description, help, role description, identifier and the actions carry
// Finder's vocabulary and are left alone.
const CONTENT_FIELDS = ['title', 'value', 'valueDescription', 'placeholder', 'url'];

// The end (exclusive) of the subtree at preorder position `i`.
const subtreeEnd = (nodes, i) => { let j = i + 1; while (j < nodes.length && nodes[j].depth > nodes[i].depth) j++; return j; };

// What keeps a Skyshot of the run's Finder window from being its fixed state, given what the run owns (`folder`, its
// `folderPath` and the `files` in it). -> [{code, message, ...}]; empty when it is the fixed state.
//   not_list_view  no outline holds the run's files: another view, or another folder
//   sidebar_shown  an outline besides the run's list (the sidebar's source list)
//   unowned_text   outside the run's list, a content field that is neither empty nor the run's (the status bar, the path
//                  bar, the sidebar's places, a title that is not the folder's, a selection that is not a run file);
//                  a placeholder inside the toolbar is Finder's own (its search field's)
//   toolbar_items  the toolbar's items are not Finder's default set
export function finderWindowProblems(shot, {folder, folderPath, files}) {
  if (!shot || !Array.isArray(shot.nodes)) return [{code: 'no_observation', message: 'no Skyshot of the run\'s Finder window to check'}];
  const {nodes} = shot, problems = [];
  const fileNames = new Set(files);
  const folderUrl = pathToFileURL(folderPath).href.replace(/\/$/, '');
  const ownedText = value => value === folder || fileNames.has(value) || value === folderUrl || value === `${folderUrl}/`;
  const unowned = value => typeof value === 'string' && value !== '' && !ownedText(value);

  const outlines = nodes.flatMap((node, i) => (node.role === 'AXOutline' ? [i] : []));
  const list = outlines.find(i => nodes.slice(i + 1, subtreeEnd(nodes, i)).some(node => fileNames.has(node.value)));
  if (list === undefined) problems.push({code: 'not_list_view', message: 'no outline in the window holds the run\'s files: the window is not the run\'s folder in list view'});
  else {
    const others = outlines.filter(i => i !== list);
    if (others.length) problems.push({code: 'sidebar_shown', tokens: others.map(i => nodes[i].token), message: 'the window shows an outline besides the run\'s list (the sidebar); hide it (View → Hide Sidebar) and observe again'});
  }

  const inList = list === undefined ? () => false : (end => i => i > list && i < end)(subtreeEnd(nodes, list));
  const found = [];
  if (unowned(shot.window?.title)) found.push({token: null, role: 'window', field: 'title'});
  if (unowned(shot.selectedText)) found.push({token: null, role: 'selection', field: 'selectedText'});
  // Inside the toolbar, whose items are pinned to Finder's default set below, a placeholder is Finder's own (the search
  // field shows one once a wider window expands it into a field); every other content field is still checked there.
  const toolbar = nodes.findIndex(node => node.role === 'AXToolbar');
  const inToolbar = toolbar < 0 ? () => false : (end => i => i > toolbar && i < end)(subtreeEnd(nodes, toolbar));
  nodes.forEach((node, i) => {
    if (inList(i)) return;
    for (const field of CONTENT_FIELDS) {
      if (field === 'placeholder' && inToolbar(i)) continue;
      if (unowned(node[field])) found.push({token: node.token, role: node.role, field});
    }
  });
  if (found.length) problems.push({code: 'unowned_text', nodes: found, message: 'the window carries text the run does not own outside its list (the status bar, the path bar, the sidebar, or a title): hide them and observe again; nothing of this observation may be recorded'});

  const items = toolbar < 0 ? [] : nodes.slice(toolbar + 1, subtreeEnd(nodes, toolbar)).filter(node => node.depth === nodes[toolbar].depth + 1).map(node => [node.role, node.subrole ?? null]);
  if (JSON.stringify(items) !== JSON.stringify(FINDER_DEFAULT_TOOLBAR))
    problems.push({code: 'toolbar_items', expected: FINDER_DEFAULT_TOOLBAR, got: items, message: 'the window\'s toolbar is not Finder\'s default set; an added item may carry a name that is not the run\'s (View → Customize Toolbar, then drag the default set back)'});
  return problems;
}
