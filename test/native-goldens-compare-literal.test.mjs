// The goldens' comparison (test/native-goldens/compare.mjs) is literal and fail-closed: the renderer prints free text
// raw, so no line after the header is certainly an element line rather than a value's, and no index is renumbered away.
// Equal numbering compares exactly; a shifted numbering shows as differences; nothing of a text is dropped or matched
// away (the trailer whole, selected text whole, a full tree read as a diff reported).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compare} from './native-goldens/compare.mjs';
import {COMPARE, GOLDENS, SCENES, declared} from './native-goldens/goldens.mjs';

const kinds = result => result.differences.map(d => d.kind);
const DIFF = 'The following is a diff from the previous accessibility tree for Window: "w" with ~ and + representing changed and added elements, respectively. Removed elements are summarized by ID range.';
const full = trailer => `Window: "w", App: A.\n0 standard window w\n\t1 button Same\n\t2 button Same\n${trailer ? `\n${trailer}` : ''}`;

test('the recorded goldens and their action diffs compare with no unexpected difference under the literal rule', () => {
  for (const scene of SCENES) for (const golden of GOLDENS) {
    assert.deepEqual(COMPARE[golden](scene, declared(scene, golden)).differences, [], `${scene}/${golden}`);
  }
});

test('the trailer is compared whole: selected text, the focused element by its index and its line', () => {
  const selected = text => full(`Selected text: \`\`\`\n${text}\n\`\`\`\n\nNote: the note.`);
  assert.deepEqual(kinds(compare(selected('abc'), selected('abc'))), []);
  assert.deepEqual(kinds(compare(selected('abc'), selected('def'))), ['trailer']);
  const focused = line => full(`The focused UI element is ${line}`);
  assert.deepEqual(kinds(compare(focused('1 button Same'), focused('1 button Same'))), []);
  assert.deepEqual(kinds(compare(focused('1 button Same'), focused('2 button Same'))), ['trailer'], 'another element, equal descriptions');
  assert.deepEqual(kinds(compare(focused('1 button Same'), focused('1 button WRONG'))), ['trailer']);
  // A multi-line value in the trailer is compared to its last line.
  assert.deepEqual(kinds(compare(focused('1 text area, Value: a\nLine 01'), focused('1 text area, Value: a\nLine 02'))), ['trailer']);
});

test('a diff: its lines, its trailer and its removed IDs by their indexes', () => {
  const diff = (trailer, removed = '3') => `${DIFF}\nRemoved element IDs: ${removed}\n~\t5 text Changed\n${trailer}`;
  assert.deepEqual(kinds(compare(diff('The focused UI element is 1 button Same'), diff('The focused UI element is 1 button Same'), {kind: 'diff'})), []);
  assert.deepEqual(kinds(compare(diff('The focused UI element is 1 button Same'), diff('The focused UI element is 11 button Same'), {kind: 'diff'})), ['trailer']);
  assert.deepEqual(kinds(compare(diff('The focused UI element is 1 button Same'), diff('The focused UI element is 1 button Same', '4'), {kind: 'diff'})), ['removed']);
  assert.deepEqual(kinds(compare(diff('x'), diff('x').replace('\t5 ', '\t6 '), {kind: 'diff'})).sort(), ['added', 'missing']);
});

test('lines before the first element line that are none of the text\'s kind are reported, never dropped', () => {
  const tree = value => `Window: "w", App: A.\n0 standard window w\n\t1 slider Value: ${value}\n`;
  assert.deepEqual(kinds(compare(tree(1), tree(2), {kind: 'diff'})), ['unparsed']);
  assert.deepEqual(kinds(compare(tree(1), tree(2))), ['text'], 'read as the full tree it is, the value differs');
});

test('a full tree numbered with gaps (a default-mode fallback keeps the lineage\'s surviving indexes): exact when both lanes number alike, every shifted line shown when not', () => {
  const tree = (...indexes) => `Window: "w", App: A.\n${indexes[0]} standard window w\n\t${indexes[1]} button One\n\t${indexes[2]} button Two, Value: 2\n\t\t${indexes[3]} text Three\n`;
  assert.deepEqual(kinds(compare(tree(0, 1, 3, 7), tree(0, 1, 3, 7))), []);
  assert.deepEqual(kinds(compare(tree(0, 1, 3, 7), tree(0, 1, 3, 7).replace('Value: 2', 'Value: 3'))), ['text']);
  assert.deepEqual(kinds(compare(tree(0, 1, 3, 7), tree(0, 1, 4, 9))).sort(), ['added', 'added', 'missing', 'missing']);
});

test('a numeric line inside a value is never renumbered away', () => {
  const doc = (first, second, after = 3) => `Window: "w", App: A.\n0 standard window w\n\t1 text area, Value: doc\n${first}\n${second}\n\t${after} button After\n`;
  assert.deepEqual(kinds(compare(doc('200 apples', '999 oranges'), doc('200 apples', '999 oranges'))), []);
  assert.notDeepEqual(kinds(compare(doc('200 apples', '999 oranges'), doc('300 apples', '999 oranges'))), []);
  // Tabbed, right after the value's first line.
  const tabbed = n => `Window: "w", App: A.\n0 standard window w\n\t1 text area, Value: doc\n\t${n} apples\n\t3 button After\n`;
  assert.notDeepEqual(kinds(compare(tabbed(200), tabbed(201))), []);
});
