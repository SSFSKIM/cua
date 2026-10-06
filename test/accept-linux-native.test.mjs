// The Linux native fixture (scripts/accept/linux-native.mjs) types its marker key by key, because the helper's
// typeText and paste crash GTK3 text views (F2): each character becomes one X keysym for pressKey.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {keysymsFor} from '../scripts/accept/linux-native-lib.mjs';

test('a marker becomes one X keysym per character: letters and digits as themselves, the separators by name', () => {
  assert.deepEqual(keysymsFor('cua-F2 7'), ['c', 'u', 'a', 'minus', 'F', '2', 'space', '7']);
  assert.deepEqual(keysymsFor(''), []);
});

test('a character with no keysym here is refused before anything is typed', () => {
  assert.throws(() => keysymsFor('a{b'), /no X keysym for "\{"/);
  assert.throws(() => keysymsFor('é'), /no X keysym for "é"/);
});
