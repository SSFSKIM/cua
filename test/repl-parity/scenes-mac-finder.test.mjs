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
  FINDER_CHROME, FINDER_DEFAULT_TOOLBAR, FINDER_KEYS, chromeShown, hideSteps, restoreSteps, preferenceWrites, parsePreference,
  finderWindowProblems, readSavedPreferences, saveOriginalPreferences, clearSavedPreferences,
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

test('the chrome parts, their preference keys, what Finder shows while a key is unset on each macOS, and the toggle keys', () => {
  // macOS 27 shows the status bar while ShowStatusBar is unset (the mini's goldens sitting, 2026-10-21); macOS 26 hides it.
  assert.deepEqual(FINDER_CHROME.map(p => [p.id, p.key, p.shownWhenUnset, p.toggle]), [
    ['sidebar', 'ShowSidebar', {26: true, 27: true}, 'ctrl+super+s'],
    ['statusBar', 'ShowStatusBar', {26: false, 27: true}, 'super+slash'],
    ['pathBar', 'ShowPathbar', {26: false, 27: false}, 'alt+super+p'],
  ]);
  assert.deepEqual(chromeShown({}, 26), {sidebar: true, statusBar: false, pathBar: false});
  assert.deepEqual(chromeShown({}, 27), {sidebar: true, statusBar: true, pathBar: false});
  // A set key is the owner's choice on every macOS.
  for (const major of [26, 27]) assert.deepEqual(chromeShown({ShowSidebar: false, ShowStatusBar: false, ShowPathbar: null}, major), {sidebar: false, statusBar: false, pathBar: false});
  assert.deepEqual(chromeShown({ShowSidebar: false, ShowStatusBar: true, ShowPathbar: null}, 26), {sidebar: false, statusBar: true, pathBar: false});
});

test('a macOS whose unset defaults are not known, or no version at all, is refused rather than guessed', () => {
  for (const major of [25, 28, 15, undefined, null, NaN, '27', 27.5]) {
    assert.throws(() => chromeShown({}, major), /macOS/, String(major));
    assert.throws(() => hideSteps({ShowSidebar: false, ShowStatusBar: false, ShowPathbar: false}, major), /macOS/, `${major}: even when every key is set`);
    assert.throws(() => restoreSteps({}, {}, major), /macOS/, String(major));
  }
  // The key writes need no default: they put each key back exactly, so a restore never depends on the version.
  assert.deepEqual(preferenceWrites({ShowSidebar: false}, {ShowSidebar: null}), [{key: 'ShowSidebar', value: null}]);
});

test('defaults read output: 1 and 0 are the Boolean, an unset key (no output) is null', () => {
  assert.equal(parsePreference('1\n'), true);
  assert.equal(parsePreference('0\n'), false);
  assert.equal(parsePreference(null), null);
  assert.equal(parsePreference(''), null);
  assert.throws(() => parsePreference('Nlsv\n'), /not a Boolean/);
});

test('hide steps toggle exactly the parts the preferences show on the running macOS, sidebar first', () => {
  assert.deepEqual(hideSteps({}, 26), [{pressKey: 'ctrl+super+s', hides: 'sidebar'}]);
  assert.deepEqual(hideSteps({}, 27), [{pressKey: 'ctrl+super+s', hides: 'sidebar'}, {pressKey: 'super+slash', hides: 'statusBar'}]);
  for (const major of [26, 27]) {
    assert.deepEqual(hideSteps({ShowSidebar: true, ShowStatusBar: true, ShowPathbar: true}, major),
      [{pressKey: 'ctrl+super+s', hides: 'sidebar'}, {pressKey: 'super+slash', hides: 'statusBar'}, {pressKey: 'alt+super+p', hides: 'pathBar'}]);
    assert.deepEqual(hideSteps({ShowSidebar: false, ShowStatusBar: false}, major), [], 'the owner\'s Finder already hides them: nothing is changed');
  }
  // The mini's pre-state: the sidebar set, the status bar and path bar unset. macOS 27 shows the status bar, so ⌘/ is
  // sent there; on macOS 26 it is not.
  const mini = {ShowSidebar: true, ShowStatusBar: null, ShowPathbar: null};
  assert.deepEqual(hideSteps(mini, 26).map(s => s.hides), ['sidebar']);
  assert.deepEqual(hideSteps(mini, 27).map(s => s.hides), ['sidebar', 'statusBar']);
});

test('restore steps toggle back each part whose shown state differs from the saved one; writes restore the keys exactly', () => {
  const saved = {ShowSidebar: null, ShowStatusBar: true, ShowPathbar: null};
  const afterHide = {ShowSidebar: false, ShowStatusBar: false, ShowPathbar: null};
  for (const major of [26, 27]) {
    assert.deepEqual(restoreSteps(afterHide, saved, major), [{pressKey: 'ctrl+super+s', restores: 'sidebar'}, {pressKey: 'super+slash', restores: 'statusBar'}]);
    assert.deepEqual(restoreSteps(saved, saved, major), []);
    // After the toggles went back, the sidebar key holds an explicit true where it was unset: shown alike, but the key
    // is put back as it was (deleted).
    assert.deepEqual(restoreSteps({ShowSidebar: true, ShowStatusBar: true, ShowPathbar: null}, saved, major), []);
  }
  assert.deepEqual(preferenceWrites(afterHide, saved), [{key: 'ShowSidebar', value: null}, {key: 'ShowStatusBar', value: true}]);
  assert.deepEqual(preferenceWrites({ShowSidebar: true, ShowStatusBar: true, ShowPathbar: null}, saved), [{key: 'ShowSidebar', value: null}]);
  assert.deepEqual(preferenceWrites(saved, saved), []);
  // Both sides read with the running macOS's default: an unset status bar is shown on 27, so a status bar the setup hid
  // (an explicit false) is toggled back there, and on 26 it is not (unset and false both read hidden).
  const unsetStatus = {ShowSidebar: true, ShowStatusBar: null, ShowPathbar: null};
  const hidden = {ShowSidebar: false, ShowStatusBar: false, ShowPathbar: null};
  assert.deepEqual(restoreSteps(hidden, unsetStatus, 27).map(s => s.restores), ['sidebar', 'statusBar']);
  assert.deepEqual(restoreSteps(hidden, unsetStatus, 26).map(s => s.restores), ['sidebar']);
});

// Finder as the toggles drive it: a toggle flips the part's shown state in the window and writes the shown state it
// leaves as an explicit Boolean (an unset key becomes set). -> the preferences after the steps.
const toggled = (preferences, steps, major) => steps.reduce((prefs, step) => {
  const part = FINDER_CHROME.find(p => p.toggle === step.pressKey);
  return {...prefs, [part.key]: !chromeShown(prefs, major)[part.id]};
}, {...preferences});
const written = (preferences, writes) => writes.reduce((prefs, {key, value}) => ({...prefs, [key]: value}), {...preferences});

test('setup then restore on macOS 26 and 27, from every pre-state: each key ends as saved, an unset key unset, and the window as the owner had it', () => {
  const values = [null, true, false];
  const preStates = values.flatMap(a => values.flatMap(b => values.map(c => ({ShowSidebar: a, ShowStatusBar: b, ShowPathbar: c}))));
  for (const major of [26, 27]) for (const saved of preStates) {
    const label = `macOS ${major}, ${JSON.stringify(saved)}`;
    const setup = hideSteps(saved, major);
    const afterSetup = toggled(saved, setup, major);
    assert.deepEqual(chromeShown(afterSetup, major), {sidebar: false, statusBar: false, pathBar: false}, `${label}: the setup hides all three`);
    const back = restoreSteps(afterSetup, saved, major);
    assert.deepEqual(back.map(s => s.restores), setup.map(s => s.hides), `${label}: the restore toggles back exactly what the setup hid`);
    const afterToggles = toggled(afterSetup, back, major);
    assert.deepEqual(chromeShown(afterToggles, major), chromeShown(saved, major), `${label}: the window shows what it showed before`);
    const end = written(afterToggles, preferenceWrites(afterToggles, saved));
    assert.deepEqual(end, saved, `${label}: every key is its saved value`);
    for (const key of FINDER_KEYS) if (saved[key] === null) assert.equal(end[key], null, `${label}: ${key} unset again, never a Boolean`);
  }
});

test('the saved preferences are the ones before the run\'s first toggle: a later save keeps them, a clear ends them', () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'cua-finder-prefs-'));
  try {
    const file = join(dir, 'nested', 'finder-preferences.json');
    assert.equal(readSavedPreferences(file), null);
    const first = saveOriginalPreferences(file, {ShowSidebar: null, ShowStatusBar: true, ShowPathbar: false}, {now: () => 'T1', macosMajor: 27});
    assert.deepEqual(first, {saved: {ShowSidebar: null, ShowStatusBar: true, ShowPathbar: false}, savedAt: 'T1', macosMajor: 27, kept: false});
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    // A second save (a later up, after the run's toggles changed the preferences) keeps the original.
    const again = saveOriginalPreferences(file, {ShowSidebar: false, ShowStatusBar: false, ShowPathbar: false}, {now: () => 'T2', macosMajor: 26});
    assert.deepEqual(again, {saved: {ShowSidebar: null, ShowStatusBar: true, ShowPathbar: false}, savedAt: 'T1', macosMajor: 27, kept: true});
    assert.deepEqual(readSavedPreferences(file), {saved: {ShowSidebar: null, ShowStatusBar: true, ShowPathbar: false}, savedAt: 'T1', macosMajor: 27});
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
