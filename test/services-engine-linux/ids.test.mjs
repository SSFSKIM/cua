// The vendor's element numbering as cua's Linux service keeps it (src/services/engine/linux/ids.mjs; R/A §1.4): one
// increasing counter per client shared by every window, a per-window map from native id to decimal id rebuilt on a
// full observation and copied on a query, and the translation back with its refresh sentence.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ElementIds} from '../../src/services/engine/linux/ids.mjs';

const node = (id, children = []) => ({id, role: 'panel', children});
const ids = tree => [tree.id, ...tree.children.flatMap(ids)];
const natives = tree => [tree.native_id, ...tree.children.flatMap(natives)];

test('a full observation numbers every node in preorder from one counter shared by all windows, keeping the native id', () => {
  const numbering = new ElementIds();
  const first = node('a', [node('b', [node('c')]), node('d')]);
  numbering.assign(first, {id: 7}, false);
  assert.deepEqual(ids(first), ['0', '1', '2', '3']);
  assert.deepEqual(natives(first), ['a', 'b', 'c', 'd']);
  const other = node('a', [node('x')]);
  numbering.assign(other, {id: 8}, false);
  assert.deepEqual(ids(other), ['4', '5'], 'another window continues the counter, even for the same native id');
});

test('a later full observation keeps the numbers of nodes still present and forgets the rest; a node that comes back is numbered anew', () => {
  const numbering = new ElementIds();
  numbering.assign(node('a', [node('b'), node('c')]), {id: 7}, false);
  const second = node('a', [node('c'), node('e')]);
  numbering.assign(second, {id: 7}, false);
  assert.deepEqual(ids(second), ['0', '2', '3']);
  const third = node('a', [node('b')]);
  numbering.assign(third, {id: 7}, false);
  assert.deepEqual(ids(third), ['0', '4'], 'b fell out of the map, so it gets a new number');
});

test('a query observation copies the map, so nodes outside the filtered result keep their numbers', () => {
  const numbering = new ElementIds();
  numbering.assign(node('a', [node('b'), node('c')]), {id: 7}, false);
  numbering.assign(node('a', [node('c')]), {id: 7}, true);
  assert.deepEqual(numbering.resolve({window: {id: 7}, element_id: '1'}), {window: {id: 7}, element_id: 'b'});
  const after = node('a', [node('b')]);
  numbering.assign(after, {id: 7}, false);
  assert.deepEqual(ids(after), ['0', '1']);
});

test('resolve translates a decimal id through the window\'s map, passes anything else through, and refuses an unknown number', () => {
  const numbering = new ElementIds();
  numbering.assign(node('a', [node('b')]), {id: 7}, false);
  const request = {window: {id: 7}, element_id: '1', x: 3};
  assert.deepEqual(numbering.resolve(request), {window: {id: 7}, element_id: 'b', x: 3});
  assert.equal(request.element_id, '1', 'the caller\'s request is not changed');
  for (const passed of [{window: {id: 7}}, {window: {id: 7}, element_id: 'b'}, {window: {id: 7}, element_id: ':1.5/org/a11y/atspi/accessible/9'}, {element_id: null}])
    assert.equal(numbering.resolve(passed), passed);
  const unknown = message => ({message});
  assert.throws(() => numbering.resolve({window: {id: 7}, element_id: '9'}), unknown('Unknown element ID 9 for this window; refresh get_window_state()'));
  assert.throws(() => numbering.resolve({window: {id: 8}, element_id: '0'}), unknown('Unknown element ID 0 for this window; refresh get_window_state()'));
  assert.throws(() => numbering.resolve({element_id: '0'}), unknown('Unknown element ID 0 for this window; refresh get_window_state()'));
  assert.throws(() => numbering.resolve({window: {id: 7}, element_id: 1}), unknown('Unknown element ID 1 for this window; refresh get_window_state()'),
    'a number matches the digits but no string id, as in the vendor');
});
