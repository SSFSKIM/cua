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
// Automation prompt. A toggle writes Finder's preference for new windows (ShowSidebar) or for every window
// (ShowStatusBar, ShowPathbar), so which toggles to send is read from those keys and, for a key the owner never set, from
// what Finder shows while it is unset on the running macOS (FINDER_CHROME's shownWhenUnset), and the keys as they were
// before the run's first toggle are saved in one harness-wide file (SAVED_PREFERENCES) that a later up keeps, so a run that dies
// before restoring is still restored from the owner's values by the next. Restoring is first the toggles back in the
// run's window (Finder's own state then matches) and then the keys written back exactly where they still differ.
//
// The fixed state is checked on the engine's Skyshot of the run's window before anything of it is recorded
// (finderWindowProblems): a toggle the preferences mispredicted, or a Finder that shows something new, refuses the
// recording rather than letting an owner string reach a golden. A problem names tokens, roles and fields, never text.
import * as fs from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const FINDER_DOMAIN = 'com.apple.finder';
// The parts the fixed state hides: the preference key, whether a window shows the part while the key is unset, per macOS
// major version, and the menu's key. The default moved: macOS 27 shows the status bar with ShowStatusBar unset (the
// mini's goldens sitting, 2026-10-21, and M0's capture of the same Finder, test/native-goldens/finder/skyshot.json),
// where macOS 26 hides it. The others are not observed with the key unset on 27 (the mini sets ShowSidebar; its path bar
// was unset and hidden in both captures) and keep Finder's long-standing defaults. A macOS without a row is refused, not
// guessed (unsetShown): a wrong guess either leaves a part showing the owner's text, which the fixed-state check then
// refuses, or toggles a hidden part on and back off with the restore misreading it.
export const FINDER_CHROME = Object.freeze([
  {id: 'sidebar', key: 'ShowSidebar', shownWhenUnset: {26: true, 27: true}, toggle: 'ctrl+super+s'},
  {id: 'statusBar', key: 'ShowStatusBar', shownWhenUnset: {26: false, 27: true}, toggle: 'super+slash'},
  {id: 'pathBar', key: 'ShowPathbar', shownWhenUnset: {26: false, 27: false}, toggle: 'alt+super+p'},
].map(part => Object.freeze({...part, shownWhenUnset: Object.freeze(part.shownWhenUnset)})));
export const FINDER_MACOS_MAJORS = Object.freeze(Object.keys(FINDER_CHROME[0].shownWhenUnset).map(Number));
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

// Whether a window shows `part` while its key is unset on macOS `major` (an integer, scenes-mac-device.mjs
// readMacosMajor); throws for a version the table has no row for, and for no version at all, even when every key is set,
// so a caller that lost the version is caught at once rather than on the first owner with an unset key.
function unsetShown(part, major) {
  if (!Number.isInteger(major) || !Object.hasOwn(part.shownWhenUnset, major))
    throw new Error(`Finder's chrome with its keys unset is known on macOS ${FINDER_MACOS_MAJORS.join(' and ')}, not on macOS ${major}: open a Finder window with ShowSidebar, ShowStatusBar and ShowPathbar unset, note which parts it shows, and add the row to FINDER_CHROME`);
  return part.shownWhenUnset[major];
}
const isShown = (preferences, part, major) => { const unset = unsetShown(part, major); return preferences?.[part.key] ?? unset; };
// Which parts a new run window shows under these preferences on macOS `major`. -> {sidebar, statusBar, pathBar}.
export const chromeShown = (preferences, major) => Object.fromEntries(FINDER_CHROME.map(part => [part.id, isShown(preferences, part, major)]));
// The toggles that hide what the preferences show on macOS `major`. -> [{pressKey, hides}].
export const hideSteps = (preferences, major) => FINDER_CHROME.filter(part => isShown(preferences, part, major)).map(part => ({pressKey: part.toggle, hides: part.id}));
// The toggles that bring each part back to the shown state the saved preferences give. Both sides are read with the
// running macOS's default: the toggles act on this Finder, whose window shows an unset key as this macOS does, and the
// key writes then put each key back exactly (an unset one deleted), whatever macOS the record was saved on.
// -> [{pressKey, restores}].
export const restoreSteps = (current, saved, major) => FINDER_CHROME.filter(part => isShown(current, part, major) !== isShown(saved, part, major)).map(part => ({pressKey: part.toggle, restores: part.id}));
// The keys to write back so each holds exactly its saved value (null: delete the key). -> [{key, value}].
export const preferenceWrites = (current, saved) => FINDER_KEYS.filter(key => (current?.[key] ?? null) !== (saved?.[key] ?? null)).map(key => ({key, value: saved?.[key] ?? null}));

// ---- The saved preferences ----------------------------------------------------------------------------------------------

export function readSavedPreferences(file = SAVED_PREFERENCES) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
// Saves `preferences` as the owner's unless a record exists already, whose values are then kept (they predate this
// run's toggles, or an earlier run's that never restored). `macosMajor` is the macOS they were read on, kept for the
// record: a restore reads the running macOS instead (restoreSteps), so a record without it (written before it was
// recorded) restores the same way. -> {saved, savedAt, macosMajor?, kept}.
export function saveOriginalPreferences(file, preferences, {now = () => new Date().toISOString(), macosMajor} = {}) {
  const existing = readSavedPreferences(file);
  if (existing) return {...existing, kept: true};
  const record = {saved: Object.fromEntries(FINDER_KEYS.map(key => [key, preferences?.[key] ?? null])), savedAt: now(), ...(macosMajor === undefined ? {} : {macosMajor})};
  fs.mkdirSync(dirname(file), {recursive: true, mode: 0o700});
  const temporary = `${file}.${process.pid}`;
  fs.writeFileSync(temporary, JSON.stringify(record, null, 2) + '\n', {mode: 0o600});
  fs.renameSync(temporary, file);
  return {...record, kept: false};
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
