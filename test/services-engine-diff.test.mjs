// cua's engine service, the diff (src/services/engine/diff.mjs; docs/doperpowers/specs/2026-10-18-own-native-engine-design.md,
// "The service", Diff; sky-behaviour.md §9): the vendor's one live header with the removed-ID-ranges legend, `~`/`+`
// marks before the tabs, inserted subtrees in full, the `Removed element IDs:` line first, the no-change sentence, the
// full tree when the diff would be longer than the tree, and the full tree across lineages.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diff} from '../src/services/engine/diff.mjs';
import {advanceNumbering, render, NOTE} from '../src/services/engine/render.mjs';
import {node, skyshot} from './native-goldens/builder.mjs';

const HEADER = 'The following is a diff from the previous accessibility tree for Window: "W" with ~ and + representing changed and added elements, respectively. Removed elements are summarized by ID range.';

// An observation as the service keeps it: the Skyshot and its numbering, advanced from the previous one.
function observe(shot, previous = null) {
  return {skyshot: shot, numbering: advanceNumbering(previous?.numbering ?? null, shot)};
}

const field = (token, depth, value, flags = {}) => node(token, depth, 'AXTextField', {roleDescription: 'text field', value, valueType: 'string', flags: {settable: true, focusable: true, ...flags}});
const button = (token, depth, title) => node(token, depth, 'AXButton', {roleDescription: 'button', title, actions: ['AXPress']});
const win = (token = 'w') => node(token, 0, 'AXWindow', {roleDescription: 'standard window', title: 'W', actions: ['AXRaise']});

test('an unchanged tree answers the no-change sentence, then the trailer', () => {
  const shot = skyshot([win(), field('f', 1, 'a', {focused: true})], {focused: 'f'});
  const first = observe(shot);
  const second = observe(skyshot(shot.nodes, {focused: 'f', revision: 2}), first);
  assert.equal(diff(first, second), 'There has been no change in the accessibility tree for Window: "W".\nThe focused UI element is 1 text field (settable) a');
});

test('a changed line is marked ~ before its tabs, with the new line', () => {
  const first = observe(skyshot([win(), node('g', 1, 'AXGroup', {title: 'G'}), field('f', 2, 'a')]));
  const second = observe(skyshot([win(), node('g', 1, 'AXGroup', {title: 'G'}), field('f', 2, 'b')], {revision: 2}), first);
  assert.equal(diff(first, second), `${HEADER}\n~\t\t2 text field (settable) b`);
});

test('removed elements are summarized by ID range on the first line; new elements take indexes never issued', () => {
  const before = [win(), button('a', 1, 'A'), button('b', 1, 'B'), button('c', 1, 'C'), button('d', 1, 'D'), button('e', 1, 'E')];
  const first = observe(skyshot(before));
  const after = [win(), button('a', 1, 'A'), button('d', 1, 'D'), button('x', 1, 'X')];
  const second = observe(skyshot(after, {revision: 2}), first);
  assert.equal(diff(first, second), `${HEADER}\nRemoved element IDs: 2-3, 5\n+\t6 button X`);
});

test('an inserted subtree is printed in full, each line marked +', () => {
  const first = observe(skyshot([win(), button('a', 1, 'A')]));
  const after = [win(), button('a', 1, 'A'), node('g', 1, 'AXGroup', {title: 'Panel'}), button('b', 2, 'B'), button('c', 2, 'C')];
  const second = observe(skyshot(after, {revision: 2}), first);
  assert.equal(diff(first, second), `${HEADER}\n+\t2 container Panel\n+\t\t3 button B\n+\t\t4 button C`);
});

test('an element that moved under another parent keeps its index: added there, never listed as removed', () => {
  const first = observe(skyshot([win(), node('g', 1, 'AXGroup', {title: 'G'}), button('a', 2, 'A'), node('h', 1, 'AXGroup', {title: 'H'})]));
  const second = observe(skyshot([win(), node('g', 1, 'AXGroup', {title: 'G'}), node('h', 1, 'AXGroup', {title: 'H'}), button('a', 2, 'A')], {revision: 2}), first);
  assert.equal(diff(first, second), `${HEADER}\n+\t\t2 button A`);
});

test('a diff may be as long as the full tree (ratio 1.0); with removals to summarize as well, the full tree', () => {
  const first = observe(skyshot([win(), field('f', 1, 'a'), button('p', 1, 'P')]));
  const renamed = node('w', 0, 'AXWindow', {roleDescription: 'standard window', title: 'W again', actions: ['AXRaise']});
  const second = observe(skyshot([renamed, field('f', 1, 'b'), button('p', 1, 'P again')], {revision: 2}), first);
  assert.equal(diff(first, second), `${HEADER}\n~0 standard window W again, Secondary Actions: Raise\n~\t1 text field (settable) b\n~\t2 button P again`);
  // Every line changed and an element removed: no line is left for the summary.
  const third = observe(skyshot([win(), field('f', 1, 'c')], {revision: 3}), second);
  assert.equal(diff(second, third), render(third.skyshot, third.numbering));
});

test('removals alone fit unless no line is left for the summary', () => {
  const first = observe(skyshot([win(), button('a', 1, 'A'), button('b', 1, 'B')]));
  const second = observe(skyshot([win(), button('a', 1, 'A')], {revision: 2}), first);
  assert.equal(diff(first, second), `${HEADER}\nRemoved element IDs: 2`);
  // A one-element tree whose only change uses its one line leaves none for the summary: the full tree.
  const third = observe(skyshot([node('w2', 0, 'AXWindow', {roleDescription: 'standard window', title: 'W2', actions: ['AXRaise']})], {revision: 3}), second);
  assert.equal(diff(second, third), render(third.skyshot, third.numbering));
});

test('a new lineage, or no previous observation, answers the full tree', () => {
  const shot = skyshot([win(), button('a', 1, 'A')]);
  const first = observe(shot);
  assert.equal(diff(null, first), render(shot, first.numbering));
  const fresh = observe(skyshot(shot.nodes, {lineage: 'L2'}), first);
  assert.equal(diff(first, fresh), render(fresh.skyshot, fresh.numbering));
});

test('a selection trailer follows the diff lines', () => {
  const rows = selected => [win(), node('o', 1, 'AXOutline', {roleDescription: 'outline', flags: {focusable: true}}),
    node('r', 2, 'AXRow', {subrole: 'AXOutlineRow', flags: {selectable: true, selected}}), field('n', 3, 'name')];
  const first = observe(skyshot(rows(false)));
  const second = observe(skyshot(rows(true), {revision: 2, selectedElements: ['r']}), first);
  assert.equal(diff(first, second), `${HEADER}\n~\t\t2 row (selected)\nSelected:\n\t2 row (selected)\n\n${NOTE}`);
});
