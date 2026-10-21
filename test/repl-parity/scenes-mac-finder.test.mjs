// Finder's fixed state for the macOS scenes (scripts/repl-parity/scenes-mac-finder.mjs; the own native engine spec, M1b:
// "Finder's golden is compared as full text"): the window chrome that can carry what the run does not own (the sidebar,
// the status bar, the path bar) is hidden by toggles chosen from Finder's preferences, restored from the preferences
// saved before the first toggle, and the fixed state is checked on the engine's Skyshot before anything is recorded.
// The Skyshot fixtures are M0's real Finder capture (test/native-goldens/finder/skyshot.json, sidebar and status bar
// showing, owner strings already replaced by their length) and the same capture with those two parts taken out.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  FINDER_CHROME, FINDER_DEFAULT_TOOLBAR, preferenceWrites, parsePreference, recordVisibleState, recordToggleSent, markVisibleRestored, FINDER_RECORD_SCHEMA, savedRecordDistrust,
  finderWindowProblems, readSavedPreferences, saveOriginalPreferences, clearSavedPreferences, finderChromeShown, toggleUntil,
} from '../../scripts/repl-parity/scenes-mac-finder.mjs';

const capture = () => JSON.parse(fs.readFileSync(new URL('../native-goldens/finder/skyshot.json', import.meta.url), 'utf8'));
const FOLDER = 'cua-scene-finder';
const FILES = Array.from({length: 200}, (_, i) => `scene-file-${String(i + 1).padStart(3, '0')}`);
const owned = {folder: FOLDER, folderPath: `/run/finder/${FOLDER}`, files: FILES};

// The capture with a node's whole subtree removed (preorder: the node, then every following deeper node).
function without(shot, ...tokens) {
  const drop = new Set();
  shot.nodes.forEach((node, i) => {
    if (!tokens.includes(node.token)) return;
    drop.add(i);
    for (let j = i + 1; j < shot.nodes.length && shot.nodes[j].depth > node.depth; j++) drop.add(j);
  });
  return {...shot, nodes: shot.nodes.filter((_, i) => !drop.has(i))};
}
// The fixed state: no sidebar (its scroll area t2 and the splitter t86) and no status bar (t276).
const fixedState = () => without(capture(), 't2', 't86', 't276');

test('the chrome parts, their preference keys and their toggle keys; no table of what an unset key shows', () => {
  assert.deepEqual(FINDER_CHROME.map(p => [p.id, p.key, p.toggle]), [
    ['sidebar', 'ShowSidebar', 'ctrl+super+s'],
    ['statusBar', 'ShowStatusBar', 'super+slash'],
    ['pathBar', 'ShowPathbar', 'alt+super+p'],
  ]);
  assert.ok(FINDER_CHROME.every(p => !('shownWhenUnset' in p)), 'the window, observed, says what it shows');
});
test('defaults read output: 1 and 0 are the Boolean, an unset key (no output) is null', () => {
  assert.equal(parsePreference('1\n'), true);
  assert.equal(parsePreference('0\n'), false);
  assert.equal(parsePreference(null), null);
  assert.equal(parsePreference(''), null);
  assert.throws(() => parsePreference('Nlsv\n'), /not a Boolean/);
});

test('the saved preferences are the ones before the run\'s first toggle: a later save keeps them, a clear ends them', () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'cua-finder-prefs-'));
  try {
    const file = join(dir, 'nested', 'finder-preferences.json');
    assert.equal(readSavedPreferences(file), null);
    const first = saveOriginalPreferences(file, {ShowSidebar: null, ShowStatusBar: true, ShowPathbar: false}, {now: () => 'T1'});
    assert.deepEqual(first, {saved: {ShowSidebar: null, ShowStatusBar: true, ShowPathbar: false}, savedAt: 'T1', schema: FINDER_RECORD_SCHEMA, kept: false});
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    // A second save (a later up, after the run's toggles changed the preferences) keeps the original.
    const again = saveOriginalPreferences(file, {ShowSidebar: false, ShowStatusBar: false, ShowPathbar: false}, {now: () => 'T2'});
    assert.deepEqual(again, {saved: {ShowSidebar: null, ShowStatusBar: true, ShowPathbar: false}, savedAt: 'T1', schema: FINDER_RECORD_SCHEMA, kept: true});
    assert.deepEqual(readSavedPreferences(file), {saved: {ShowSidebar: null, ShowStatusBar: true, ShowPathbar: false}, savedAt: 'T1', schema: FINDER_RECORD_SCHEMA});
    clearSavedPreferences(file);
    assert.equal(readSavedPreferences(file), null);
    clearSavedPreferences(file);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('the fixed state passes: list view, no sidebar, no status bar, the default toolbar, every text outside the list the run\'s', () => {
  assert.deepEqual(finderWindowProblems(fixedState(), owned), []);
});

test('M0\'s capture fails it: the sidebar is a second outline, and the sidebar\'s and status bar\'s texts are not the run\'s', () => {
  const problems = finderWindowProblems(capture(), owned);
  assert.deepEqual(problems.map(p => p.code), ['sidebar_shown', 'unowned_text']);
  assert.deepEqual(problems[0].tokens, ['t3']);
  const unowned = problems[1].nodes;
  assert.ok(unowned.some(n => n.token === 't277' && n.role === 'AXStaticText' && n.field === 'value'), 'the status bar');
  assert.ok(unowned.every(n => Number(n.token.slice(1)) < 88 || ['t276', 't277'].includes(n.token)), 'only the sidebar and the status bar, nothing of the run\'s list or of the toolbar');
  // A problem names tokens, roles and fields, never the text it found.
  assert.doesNotMatch(JSON.stringify(problems), /⟨/);
  for (const p of problems) assert.match(p.message, /\S/);
});

test('without the list of the run\'s files the state is not the fixed one (another view, another folder)', () => {
  const shot = fixedState();
  const noFiles = {...shot, nodes: shot.nodes.map(n => (n.value?.startsWith?.('scene-file-') ? {...n, value: 'other'} : n))};
  assert.deepEqual(finderWindowProblems(noFiles, owned).map(p => p.code), ['not_list_view', 'unowned_text']);
  assert.deepEqual(finderWindowProblems(without(shot, 't89'), owned).map(p => p.code), ['not_list_view']);
});

test('a text outside the list that the run does not own fails, in any content field, the window title and the selection included', () => {
  const shot = fixedState();
  const at = token => shot.nodes.findIndex(n => n.token === token);
  for (const [field, value] of [['title', 'Owner Folder'], ['value', 'Owner text'], ['placeholder', 'x'], ['valueDescription', 'y'], ['url', 'file:///Users/owner/Documents/']]) {
    const nodes = shot.nodes.map((n, i) => (i === at('t300') ? {...n, [field]: value} : n));
    const problems = finderWindowProblems({...shot, nodes}, owned);
    assert.deepEqual(problems.map(p => p.code), ['unowned_text'], field);
    assert.deepEqual(problems[0].nodes, [{token: 't300', role: 'AXStaticText', field}], field);
  }
  // Finder's own vocabulary is not content: descriptions, help, role descriptions and identifiers are left alone.
  const vocabulary = shot.nodes.map((n, i) => (i === at('t290') ? {...n, description: 'Share', help: 'Share the selection', identifier: '_NS:12'} : n));
  assert.deepEqual(finderWindowProblems({...shot, nodes: vocabulary}, owned), []);
  // The run's folder's own URL is the run's.
  for (const url of [pathToFileURL(owned.folderPath).href, `${pathToFileURL(owned.folderPath).href}/`]) {
    const nodes = shot.nodes.map((n, i) => (i === 0 ? {...n, url} : n));
    assert.deepEqual(finderWindowProblems({...shot, nodes}, owned), [], url);
  }
  assert.deepEqual(finderWindowProblems({...shot, window: {...shot.window, title: 'Recents'}}, owned).map(p => [p.code, p.nodes]), [['unowned_text', [{token: null, role: 'window', field: 'title'}]]]);
  assert.deepEqual(finderWindowProblems({...shot, selectedText: 'scene-file-003'}, owned), []);
  assert.deepEqual(finderWindowProblems({...shot, selectedText: 'something else'}, owned).map(p => p.nodes), [[{token: null, role: 'selection', field: 'selectedText'}]]);
});

test('Finder\'s own search field may carry its placeholder (a wider window expands it into a field); a placeholder outside the toolbar may not', () => {
  const shot = fixedState();
  const search = shot.nodes.findIndex(n => n.subrole === 'AXSearchField');
  const expanded = shot.nodes.map((n, i) => (i === search ? {...n, role: 'AXTextField', subrole: 'AXSearchField', placeholder: 'Search', value: ''} : n));
  assert.deepEqual(finderWindowProblems({...shot, nodes: expanded}, owned), []);
  const outside = shot.nodes.map((n, i) => (n.token === 't300' ? {...n, placeholder: 'Owner hint'} : n));
  assert.deepEqual(finderWindowProblems({...shot, nodes: outside}, owned).map(p => p.nodes), [[{token: 't300', role: 'AXStaticText', field: 'placeholder'}]]);
  // A title or value inside the toolbar is still checked: an item showing a name that is not the run's refuses.
  const titled = shot.nodes.map((n, i) => (i === search ? {...n, value: 'owner query'} : n));
  assert.deepEqual(finderWindowProblems({...shot, nodes: titled}, owned).map(p => p.code), ['unowned_text']);
});

test('the toolbar must be Finder\'s default set: an item the owner added could carry a name of theirs in its description', () => {
  assert.deepEqual(FINDER_DEFAULT_TOOLBAR, [['AXGroup', null], ['AXGroup', null], ['AXMenuButton', null], ['AXButton', null], ['AXButton', null], ['AXMenuButton', null], ['AXGroup', null]]);
  const shot = fixedState();
  const toolbar = shot.nodes.findIndex(n => n.role === 'AXToolbar');
  const added = {...shot.nodes[toolbar + 1], token: 'tX', role: 'AXButton', subrole: null, description: 'Owner Project', depth: shot.nodes[toolbar].depth + 1};
  const nodes = [...shot.nodes.slice(0, toolbar + 1), added, ...shot.nodes.slice(toolbar + 1)];
  const problems = finderWindowProblems({...shot, nodes}, owned);
  assert.deepEqual(problems.map(p => p.code), ['toolbar_items']);
  assert.equal(problems[0].got.length, 8);
  assert.deepEqual(problems[0].expected, FINDER_DEFAULT_TOOLBAR);
  assert.doesNotMatch(JSON.stringify(problems), /Owner Project/);
  // No toolbar at all is the same problem (the toolbar is part of the fixed state).
  assert.deepEqual(finderWindowProblems(without(shot, shot.nodes[toolbar].token), owned).map(p => p.code), ['toolbar_items']);
});

test('a Skyshot that is not one is refused, not passed', () => {
  assert.deepEqual(finderWindowProblems(null, owned).map(p => p.code), ['no_observation']);
  assert.deepEqual(finderWindowProblems({nodes: 'x'}, owned).map(p => p.code), ['no_observation']);
});

// ---- What the window shows, by structure, and the toggles driven by it -------------------------------------------------

// The mini's Finder window on macOS 27 (the closing hold, roles and identifiers only): the status bar is AXUnknown
// `statusBar` holding AXStaticText `statusBarText`, after the list's scroll area in the inner split group; the path bar,
// when shown, is an AXList right after it, holding the path's components as AXStaticText. M0's capture redacted the two
// identifiers to their lengths (9 and 13), which they are restored to here; the path bar was never captured and is
// synthesized in that position.
const identified = shot => {
  for (const [token, id] of [['t276', 'statusBar'], ['t277', 'statusBarText']]) {
    const node = shot.nodes.find(n => n.token === token);
    if (node) { assert.equal(node.identifier, `⟨${id.length}⟩`); node.identifier = id; }
  }
  return shot;
};
function withPathBar(shot) {
  const status = shot.nodes.findIndex(n => n.token === 't277');
  const list = shot.nodes.findIndex(n => n.token === 't88');
  const at = status >= 0 ? status + 1 : (() => { let j = list + 1; while (j < shot.nodes.length && shot.nodes[j].depth > shot.nodes[list].depth) j++; return j; })();
  const depth = shot.nodes[list].depth, base = {...shot.nodes[list], identifier: null, title: null, value: null, valueDescription: null};
  const bar = [{...base, token: 'tP', role: 'AXList', description: '⟨4⟩', depth, children: 2},
    ...['⟨6⟩', '⟨16⟩'].map((value, i) => ({...base, token: `tP${i}`, role: 'AXStaticText', value, depth: depth + 1, children: 0}))];
  return {...shot, nodes: [...shot.nodes.slice(0, at), ...bar, ...shot.nodes.slice(at)]};
}

test('the chrome parts shown, read from the window\'s structure: an outline besides the list, the statusBar view, an AXList outside the list', () => {
  const m0 = () => identified(capture());
  assert.deepEqual(finderChromeShown(m0(), owned), {sidebar: true, statusBar: true, pathBar: false}, 'M0\'s capture: sidebar and status bar');
  assert.deepEqual(finderChromeShown(fixedState(), owned), {sidebar: false, statusBar: false, pathBar: false});
  assert.deepEqual(finderChromeShown(without(m0(), 't2', 't86'), owned), {sidebar: false, statusBar: true, pathBar: false});
  assert.deepEqual(finderChromeShown(withPathBar(m0()), owned), {sidebar: true, statusBar: true, pathBar: true}, 'the path bar beside the status bar');
  assert.deepEqual(finderChromeShown(withPathBar(fixedState()), owned), {sidebar: false, statusBar: false, pathBar: true});
  // The status text alone (its view's node gone) still reads as the status bar; text never decides.
  assert.equal(finderChromeShown({...m0(), nodes: m0().nodes.filter(n => n.token !== 't276')}, owned).statusBar, true);
  const other = {...m0(), nodes: m0().nodes.map(n => (n.token === 't277' ? {...n, value: 'anything'} : n))};
  assert.equal(finderChromeShown(other, owned).statusBar, true);
  // Without the run's list the window's structure is not known: nothing is guessed.
  assert.equal(finderChromeShown(without(fixedState(), 't89'), owned), null);
  assert.equal(finderChromeShown(null, owned), null);
});

// Finder's chrome as the live hold on macOS 27 found it: each part has Finder's toggle state and what the window
// draws. A toggle flips the state, writes it to the key as a Boolean and makes the window draw the state. On 27 an unset
// ShowStatusBar is drawn while the state starts hidden, so the first ⌘/ is a no-op on screen.
function finderModel({drawn, state, keys = {}}) {
  const model = {drawn: {...drawn}, state: {...state}, keys: {...keys}, sent: []};
  model.toggle = part => {
    model.sent.push(part);
    model.state[part] = !model.state[part];
    model.drawn[part] = model.state[part];
    model.keys[FINDER_CHROME.find(p => p.id === part).key] = model.state[part];
  };
  return model;
}
const DRIVE = {observe: model => async () => ({...model.drawn}), toggle: model => async part => model.toggle(part)};

test('toggleUntil: macOS 27\'s unset status bar takes two toggles (unset, then 1 with the bar still drawn, then 0 and hidden)', async () => {
  const model = finderModel({drawn: {statusBar: true}, state: {statusBar: false}});
  const out = await toggleUntil({part: 'statusBar', shown: false, observe: DRIVE.observe(model), toggle: DRIVE.toggle(model)});
  assert.deepEqual(out, {part: 'statusBar', shown: false, toggles: 2});
  assert.deepEqual(model.keys, {ShowStatusBar: false});
  assert.equal(model.drawn.statusBar, false);
  // Back to the owner's visible state: one toggle, the bar drawn again (the key then holds 1 until it is written back).
  const back = await toggleUntil({part: 'statusBar', shown: true, observe: DRIVE.observe(model), toggle: DRIVE.toggle(model)});
  assert.deepEqual(back, {part: 'statusBar', shown: true, toggles: 1});
  assert.equal(model.drawn.statusBar, true);
});

test('toggleUntil: where the state and the window agree (macOS 26) one toggle per part; none when the window already matches', async () => {
  const model = finderModel({drawn: {sidebar: true}, state: {sidebar: true}});
  assert.deepEqual(await toggleUntil({part: 'sidebar', shown: false, observe: DRIVE.observe(model), toggle: DRIVE.toggle(model)}), {part: 'sidebar', shown: false, toggles: 1});
  assert.deepEqual(await toggleUntil({part: 'sidebar', shown: false, observe: DRIVE.observe(model), toggle: DRIVE.toggle(model)}), {part: 'sidebar', shown: false, toggles: 0});
  assert.deepEqual(model.sent, ['sidebar']);
});

test('toggleUntil: a part that still does not match after two toggles is refused, with no third sent; an unknown window is refused at once', async () => {
  const stuck = {drawn: {pathBar: true}};
  const sent = [];
  await assert.rejects(toggleUntil({part: 'pathBar', shown: false, observe: async () => ({...stuck.drawn}), toggle: async part => { sent.push(part); }}),
    /pathBar.*still shown after 2 toggles/);
  assert.deepEqual(sent, ['pathBar', 'pathBar']);
  const none = [];
  await assert.rejects(toggleUntil({part: 'sidebar', shown: false, observe: async () => null, toggle: async part => { none.push(part); }}), /could not be read/);
  assert.deepEqual(none, []);
  // Each toggle is reported as it is sent, so a run that dies mid-way has recorded it.
  const reported = [];
  const model = finderModel({drawn: {statusBar: true}, state: {statusBar: false}});
  await toggleUntil({part: 'statusBar', shown: false, observe: DRIVE.observe(model), toggle: DRIVE.toggle(model), sent: part => reported.push(part)});
  assert.deepEqual(reported, ['statusBar', 'statusBar']);
});

test('toggleUntil: from every combination of Finder\'s toggle state and what the window draws, a part is hidden and then brought back to what it drew', async () => {
  for (const part of FINDER_CHROME.map(p => p.id)) for (const state of [true, false]) for (const drawn of [true, false]) {
    const model = finderModel({drawn: {[part]: drawn}, state: {[part]: state}});
    const hidden = await toggleUntil({part, shown: false, observe: DRIVE.observe(model), toggle: DRIVE.toggle(model)});
    assert.equal(model.drawn[part], false, `${part} state ${state} drawn ${drawn}`);
    assert.ok(hidden.toggles <= 2);
    const back = await toggleUntil({part, shown: drawn, observe: DRIVE.observe(model), toggle: DRIVE.toggle(model)});
    assert.equal(model.drawn[part], drawn, `${part}: drawn as the owner saw it`);
    assert.ok(back.toggles <= 2);
  }
});

test('the saved record also keeps the owner\'s visible chrome, first recorded wins, and which toggles were sent; a toggle unmarks a restore', () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'cua-finder-visible-'));
  try {
    const file = join(dir, 'finder-preferences.json');
    assert.throws(() => recordVisibleState(file, {sidebar: true, statusBar: true, pathBar: false}), /no saved Finder preferences/, 'only beside the keys');
    saveOriginalPreferences(file, {ShowSidebar: true, ShowStatusBar: null, ShowPathbar: null}, {now: () => 'T1'});
    assert.deepEqual(recordVisibleState(file, {sidebar: true, statusBar: true, pathBar: false}), {visible: {sidebar: true, statusBar: true, pathBar: false}, kept: false});
    // A later run's first window (after a dead run's toggles) is not the owner's: the first record is kept.
    assert.deepEqual(recordVisibleState(file, {sidebar: false, statusBar: false, pathBar: false}), {visible: {sidebar: true, statusBar: true, pathBar: false}, kept: true});
    recordToggleSent(file, 'statusBar');
    recordToggleSent(file, 'statusBar');
    recordToggleSent(file, 'sidebar');
    assert.deepEqual(readSavedPreferences(file).toggles, {statusBar: 2, sidebar: 1});
    markVisibleRestored(file, {now: () => 'T2'});
    assert.equal(readSavedPreferences(file).visibleRestoredAt, 'T2');
    recordToggleSent(file, 'pathBar');
    assert.equal('visibleRestoredAt' in readSavedPreferences(file), false, 'a toggle after the restore makes it unrestored again');
    assert.deepEqual(readSavedPreferences(file).saved, {ShowSidebar: true, ShowStatusBar: null, ShowPathbar: null}, 'the keys untouched');
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('a saved record is trusted only with this harness\'s schema, and without a visible state only while no toggle could have happened', () => {
  const keys = {ShowSidebar: true, ShowStatusBar: null, ShowPathbar: null};
  assert.equal(savedRecordDistrust({saved: keys, savedAt: 'T', schema: FINDER_RECORD_SCHEMA}, keys), null, 'saved, setup not yet observed');
  assert.equal(savedRecordDistrust({saved: keys, savedAt: 'T', schema: FINDER_RECORD_SCHEMA, visible: {sidebar: true, statusBar: true, pathBar: false}}, {...keys, ShowSidebar: false}), null);
  // An older harness's record: no schema, so no visible state it could have recorded.
  assert.match(savedRecordDistrust({saved: keys, savedAt: 'T'}, keys), /older harness/);
  // No visible state, but the keys moved: a toggle may have happened before anything was recorded.
  assert.match(savedRecordDistrust({saved: keys, savedAt: 'T', schema: FINDER_RECORD_SCHEMA}, {...keys, ShowSidebar: false}), /toggle/);
});
