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
  FINDER_CHROME, FINDER_DEFAULT_TOOLBAR, chromeShown, hideSteps, restoreSteps, preferenceWrites, parsePreference,
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

test('the chrome parts, their preference keys, the value Finder assumes when a key is unset, and the toggle keys', () => {
  assert.deepEqual(FINDER_CHROME.map(p => [p.id, p.key, p.shownWhenUnset, p.toggle]), [
    ['sidebar', 'ShowSidebar', true, 'ctrl+super+s'],
    ['statusBar', 'ShowStatusBar', false, 'super+slash'],
    ['pathBar', 'ShowPathbar', false, 'alt+super+p'],
  ]);
  assert.deepEqual(chromeShown({}), {sidebar: true, statusBar: false, pathBar: false});
  assert.deepEqual(chromeShown({ShowSidebar: false, ShowStatusBar: true, ShowPathbar: null}), {sidebar: false, statusBar: true, pathBar: false});
});

test('defaults read output: 1 and 0 are the Boolean, an unset key (no output) is null', () => {
  assert.equal(parsePreference('1\n'), true);
  assert.equal(parsePreference('0\n'), false);
  assert.equal(parsePreference(null), null);
  assert.equal(parsePreference(''), null);
  assert.throws(() => parsePreference('Nlsv\n'), /not a Boolean/);
});

test('hide steps toggle exactly the parts the preferences show, sidebar first', () => {
  assert.deepEqual(hideSteps({}), [{pressKey: 'ctrl+super+s', hides: 'sidebar'}]);
  assert.deepEqual(hideSteps({ShowSidebar: true, ShowStatusBar: true, ShowPathbar: true}),
    [{pressKey: 'ctrl+super+s', hides: 'sidebar'}, {pressKey: 'super+slash', hides: 'statusBar'}, {pressKey: 'alt+super+p', hides: 'pathBar'}]);
  assert.deepEqual(hideSteps({ShowSidebar: false, ShowStatusBar: false}), [], 'the owner\'s Finder already hides them: nothing is changed');
});

test('restore steps toggle back each part whose shown state differs from the saved one; writes restore the keys exactly', () => {
  const saved = {ShowSidebar: null, ShowStatusBar: true, ShowPathbar: null};
  const afterHide = {ShowSidebar: false, ShowStatusBar: false, ShowPathbar: null};
  assert.deepEqual(restoreSteps(afterHide, saved), [{pressKey: 'ctrl+super+s', restores: 'sidebar'}, {pressKey: 'super+slash', restores: 'statusBar'}]);
  assert.deepEqual(restoreSteps(saved, saved), []);
  assert.deepEqual(preferenceWrites(afterHide, saved), [{key: 'ShowSidebar', value: null}, {key: 'ShowStatusBar', value: true}]);
  // After the toggles went back, the sidebar key holds an explicit true where it was unset: shown alike, but the key
  // is put back as it was (deleted).
  assert.deepEqual(restoreSteps({ShowSidebar: true, ShowStatusBar: true, ShowPathbar: null}, saved), []);
  assert.deepEqual(preferenceWrites({ShowSidebar: true, ShowStatusBar: true, ShowPathbar: null}, saved), [{key: 'ShowSidebar', value: null}]);
  assert.deepEqual(preferenceWrites(saved, saved), []);
});

test('the saved preferences are the ones before the run\'s first toggle: a later save keeps them, a clear ends them', () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'cua-finder-prefs-'));
  try {
    const file = join(dir, 'nested', 'finder-preferences.json');
    assert.equal(readSavedPreferences(file), null);
    const first = saveOriginalPreferences(file, {ShowSidebar: null, ShowStatusBar: true, ShowPathbar: false}, {now: () => 'T1'});
    assert.deepEqual(first, {saved: {ShowSidebar: null, ShowStatusBar: true, ShowPathbar: false}, savedAt: 'T1', kept: false});
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    // A second save (a later up, after the run's toggles changed the preferences) keeps the original.
    const again = saveOriginalPreferences(file, {ShowSidebar: false, ShowStatusBar: false, ShowPathbar: false}, {now: () => 'T2'});
    assert.deepEqual(again, {saved: {ShowSidebar: null, ShowStatusBar: true, ShowPathbar: false}, savedAt: 'T1', kept: true});
    assert.deepEqual(readSavedPreferences(file), {saved: {ShowSidebar: null, ShowStatusBar: true, ShowPathbar: false}, savedAt: 'T1'});
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
