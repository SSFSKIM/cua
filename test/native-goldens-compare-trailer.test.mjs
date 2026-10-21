// The goldens' comparison (test/native-goldens/compare.mjs) of what follows the tree: the trailer names the same
// elements on both sides (followed through the matched lines, and in a diff through the two `before` texts'), selected
// text is the same text, and nothing of a text is dropped unread (a full tree read as a diff is reported, never empty).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compare} from './native-goldens/compare.mjs';

const kinds = result => result.differences.map(d => d.kind);
const DIFF = 'The following is a diff from the previous accessibility tree for Window: "w" with ~ and + representing changed and added elements, respectively. Removed elements are summarized by ID range.';
const full = trailer => `Window: "w", App: A.\n0 standard window w\n\t1 button Same\n\t2 button Same\n${trailer ? `\n${trailer}` : ''}`;

test('selected text is compared whole', () => {
  const selected = text => full(`Selected text: \`\`\`\n${text}\n\`\`\`\n\nNote: the note.`);
  assert.deepEqual(kinds(compare(selected('abc'), selected('abc'))), []);
  assert.deepEqual(kinds(compare(selected('abc'), selected('def'))), ['trailer']);
});

test('a full tree\'s focused element is followed through the matched lines', () => {
  assert.deepEqual(kinds(compare(full('The focused UI element is 1 button Same'), full('The focused UI element is 1 button Same'))), []);
  assert.deepEqual(kinds(compare(full('The focused UI element is 1 button Same'), full('The focused UI element is 2 button Same'))), ['trailer']);
  // The index followed, the rest of the trailer's line is compared too.
  assert.deepEqual(kinds(compare(full('The focused UI element is 1 button Same'), full('The focused UI element is 1 button WRONG'))), ['trailer']);
});

test('a diff\'s focused element, printed in neither diff, is followed through the before texts\' matched lines', () => {
  const diff = trailer => `${DIFF}\n~\t3 text Changed\n${trailer}`;
  const indexMap = new Map([[1, 11], [2, 12], [3, 13]]);
  const judge = (vendor, cua) => kinds(compare(diff(vendor), diff(cua).replace('\t3 ', '\t13 '), {kind: 'diff', indexMap}));
  assert.deepEqual(judge('The focused UI element is 1 button Same', 'The focused UI element is 11 button Same'), []);
  assert.deepEqual(judge('The focused UI element is 1 button Same', 'The focused UI element is 12 button Same'), ['trailer'], 'equal descriptions, another element');
  assert.deepEqual(judge('The focused UI element is 1 button Same', 'The focused UI element is 11 button WRONG'), ['trailer'], 'the same element, another line');
  // An element neither text names is compared by its line, and cua's may not be one a matched line names.
  assert.deepEqual(judge('The focused UI element is 9 button Other', 'The focused UI element is 19 button Other'), []);
  assert.deepEqual(judge('The focused UI element is 9 button Same', 'The focused UI element is 12 button Same'), ['trailer']);
});

test('lines before the first element line that are none of the text\'s kind are reported, never dropped', () => {
  const tree = value => `Window: "w", App: A.\n0 standard window w\n\t1 slider Value: ${value}\n`;
  assert.deepEqual(kinds(compare(tree(1), tree(2), {kind: 'diff'})), ['unparsed']);
  assert.deepEqual(kinds(compare(tree(1), tree(2))), ['text'], 'read as the full tree it is, the value differs');
});

test('a full tree numbered with gaps (a default-mode fallback keeps the lineage\'s surviving indexes) is parsed line by line', () => {
  const tree = (...indexes) => `Window: "w", App: A.\n${indexes[0]} standard window w\n\t${indexes[1]} button One\n\t${indexes[2]} button Two, Value: 2\n\t\t${indexes[3]} text Three\n`;
  assert.deepEqual(kinds(compare(tree(0, 1, 3, 7), tree(0, 1, 4, 9))), []);
  assert.deepEqual(kinds(compare(tree(0, 1, 3, 7), tree(0, 1, 4, 9).replace('Value: 2', 'Value: 3'))), ['text']);
  // An index once seen, or a line deeper than one below the last element's, continues the last element's value.
  const value = 'Window: "w", App: A.\n0 standard window w\n\t1 text area, Value: first\n1 apple\n\t\t\t5 deep\n\t2 button After\n';
  assert.deepEqual(compare(value, value).differences, []);
  assert.deepEqual(compare(value, value).lines, 3);
});
