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
});

test('a diff\'s focused element, printed in neither diff, is followed through the before texts\' matched lines', () => {
  const diff = trailer => `${DIFF}\n~\t3 text Changed\n${trailer}`;
  const indexMap = new Map([[1, 11], [2, 12], [3, 13]]);
  const judge = (vendor, cua) => kinds(compare(diff(vendor), diff(cua).replace('\t3 ', '\t13 '), {kind: 'diff', indexMap}));
  assert.deepEqual(judge('The focused UI element is 1 button Same', 'The focused UI element is 11 button Same'), []);
  assert.deepEqual(judge('The focused UI element is 1 button Same', 'The focused UI element is 12 button Same'), ['trailer'], 'equal descriptions, another element');
  // An element neither text names is compared by its line, and cua's may not be one a matched line names.
  assert.deepEqual(judge('The focused UI element is 9 button Other', 'The focused UI element is 19 button Other'), []);
  assert.deepEqual(judge('The focused UI element is 9 button Same', 'The focused UI element is 12 button Same'), ['trailer']);
});

test('lines before the first element line that are none of the text\'s kind are reported, never dropped', () => {
  const tree = value => `Window: "w", App: A.\n0 standard window w\n\t1 slider Value: ${value}\n`;
  assert.deepEqual(kinds(compare(tree(1), tree(2), {kind: 'diff'})), ['unparsed']);
  assert.deepEqual(kinds(compare(tree(1), tree(2))), ['text'], 'read as the full tree it is, the value differs');
});
