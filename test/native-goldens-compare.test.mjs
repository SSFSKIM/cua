// The goldens' comparison (test/native-goldens/compare.mjs) for the one vendor defect it declares: the vendor's subset
// count (`(showing <ranges> of <N> items)`) counts the children of a hierarchy its prefetch capped at 100, so where an
// element has more, the vendor's N is 100 and cua's is the true count. The `subsetCount` declaration lets exactly that
// differ: the same line otherwise, the same visible ranges, the vendor's N equal to min(cua's N, cap) and cua's N above
// the cap. Anything else stays an undeclared difference, and an unused declaration is over-declared.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compare, parse} from './native-goldens/compare.mjs';
import {NOTE, escapeLineBreaks} from '../src/services/engine/render.mjs';

const RULE = {scene: 'finder', golden: ['full', 'before'], kind: 'subsetCount', fault: 'vendor', identifier: 'ListView', cap: 100, count: 1, cause: 'test'};
const text = (line, header = 'Window: "cua-scene-finder", App: Finder.') => `${header}\n0 standard window cua-scene-finder\n\t1 ${line}\n`;
const list = (ranges, n, {id = 'ListView', description = '목록 보기'} = {}) => `윤곽체 Description: ${description}, ID: ${id} (showing ${ranges} of ${n} items)`;
const judge = (vendor, cua, rules = [RULE]) => compare(text(vendor), text(cua), {declared: rules}).differences.map(d => d.kind);

test('the live case: the vendor\'s 100 against cua\'s 205, ranges 0-21 on both, is declared', () => {
  assert.deepEqual(judge(list('0-21', 100), list('0-21', 205)), []);
  assert.deepEqual(judge(list('0-21', 100), list('0-21', 205), []), ['text'], 'undeclared without it');
  assert.deepEqual(judge(list('0-9, 40-49', 100), list('0-9, 40-49', 1000)), [], 'several ranges, the same on both');
  assert.deepEqual(judge('윤곽체 ID: ListView (showing 0-21 of 100 items)', '윤곽체 ID: ListView (showing 0-21 of 205 items)'), [], 'the ID the only part');
});

test('anything but the capped count stays a difference, and the declaration then absorbs nothing', () => {
  for (const [vendor, cua, why] of [
    [list('0-20', 100), list('0-21', 205), 'another visible range'],
    [list('0-21', 99), list('0-21', 205), 'a vendor N that is not min(N, 100)'],
    [list('0-21', 205), list('0-21', 300), 'a vendor N above the cap'],
    [list('0-21', 90), list('0-21', 95), 'cua\'s N not above the cap'],
    [list('0-21', 100, {description: '다른 보기'}), list('0-21', 205), 'another part of the line'],
    [list('0-21', 100, {id: 'OtherView'}), list('0-21', 205, {id: 'OtherView'}), 'another element than the declared one'],
    [list('0-21', 100, {id: 'ListView Other'}), list('0-21', 205, {id: 'ListView Other'}), 'an identifier the declared one only begins'],
    [list('0-21', 100, {id: 'ListView, Other'}), list('0-21', 205, {id: 'ListView, Other'}), 'the declared identifier not right before the count'],
    // The count compared is the one the renderer appends at the line's end: the same text earlier in the line (here in
    // the Description) is part of the line, which must otherwise be equal.
    [list('0-21', 100, {description: '(showing 0-21 of 100 items)'}), list('0-21', 100, {description: '(showing 0-21 of 205 items)'}), 'a count-shaped text inside the line'],
    [`${list('0-21', 100)} x`, `${list('0-21', 205)} x`, 'a count that does not end the line'],
  ]) assert.deepEqual(judge(vendor, cua), ['text', 'overdeclared'], why);
  // Equal lines need nothing: the declaration is then over-declared.
  assert.deepEqual(judge(list('0-21', 100), list('0-21', 100)), ['overdeclared']);
});

test('its count is exact: two such lines need a count of 2', () => {
  const two = (n, m) => `Window: "w", App: Finder.\n0 standard window w\n\t1 ${list('0-21', n)}\n\t2 ${list('0-21', m)}\n`;
  assert.deepEqual(compare(two(100, 100), two(205, 205), {declared: [RULE]}).differences.map(d => d.kind), ['text']);
  assert.deepEqual(compare(two(100, 100), two(205, 205), {declared: [{...RULE, count: 2}]}).differences, []);
});

// #526 (ruling 1175): cua prints an attribute's line breaks escaped on the element's one line, where the vendor prints
// them raw. The `lineBreaks` departure lets exactly that differ, on matched element lines and the focused trailer: the
// vendor's text with its breaks escaped as cua's renderer escapes them is cua's. It is a rule, not an instance: it has
// no count and is never over-declared.
const BREAKS = {scene: '*', kind: 'lineBreaks', fault: 'departure', decisionLog: '- Decision (2026-10-18, verification call at authoring)', cause: 'test'};
const multi = value => `Window: "w", App: A.\n0 standard window w\n\t1 text entry area (settable) Value: ${value}\n\t2 button OK\n\nThe focused UI element is 1 text entry area (settable) Value: ${value}`;

test('#526: a lineBreaks departure absorbs the vendor\'s raw breaks against cua\'s escaped ones, and nothing else', () => {
  const vendor = multi('a\nb\r\nc'), cua = multi('a\\nb\\r\\nc');
  assert.deepEqual(compare(vendor, cua, {declared: [BREAKS]}).differences, []);
  assert.deepEqual(compare(vendor, cua).differences.map(d => d.kind), ['text', 'trailer'], 'undeclared without it');
  assert.deepEqual(compare(vendor, multi('a\\nb\\r\\nd'), {declared: [BREAKS]}).differences.map(d => d.kind), ['text', 'trailer'], 'another text');
  assert.deepEqual(compare(vendor, multi('a b c'), {declared: [BREAKS]}).differences.map(d => d.kind), ['text', 'trailer'], 'breaks joined away');
  // A golden with no break: nothing to absorb, and not over-declared.
  assert.deepEqual(compare(cua, cua, {declared: [BREAKS]}).differences, []);
  assert.deepEqual(compare(multi('a\nb'), multi('a\\nb'), {declared: [{...BREAKS, scene: 'textedit'}, BREAKS]}).differences, []);
});

// The review of da6576e2..8ecf39a79 (#526): the departure keeps the parse's item boundaries, keys the vendor's items by
// their escaped text, covers the header and every trailer, and holds only on exact equality.
const tree = (lines, {header = 'Window: "w", App: A.', trailer = ''} = {}) => `${header}\n0 standard window w\n${lines.map(line => `\t${line}`).join('\n')}\n${trailer}`;
const kinds = (vendor, cua, options = {}) => compare(vendor, cua, {declared: [BREAKS], ...options}).differences.map(d => `${d.kind}${d.index ? ` ${d.index}` : ''}`);

test('#526 review 1: a numbered line holding a CR, LS or PS opens its own item, so a missing element is still reported', () => {
  for (const nl of ['\r', '\u2028', '\u2029']) {
    const two = tree(['1 button A', `2 button B${nl}C`]);
    assert.deepEqual(kinds(two, tree(['1 button A'])), ['missing 2'], JSON.stringify(nl));
    assert.deepEqual(kinds(two, tree(['1 button A', `2 button B${escapeLineBreaks(nl)}C`])), [], 'the same element, its break escaped');
    assert.equal(parse(two, {kind: 'full'}).items.length, 3);
  }
});

test('#526 review 2: a vendor item is keyed by its escaped text, so a two-line title or bare value is one matched line', () => {
  assert.deepEqual(kinds(tree(['1 button A\nB', '2 text one\ntwo']), tree(['1 button A\\nB', '2 text one\\ntwo'])), []);
  assert.deepEqual(kinds(tree(['1 button A\nB']), tree(['1 button A\\nC'])), ['missing 1', 'added 1'], 'another title stays a difference');
  assert.deepEqual(kinds(tree(['1 button A\nB']), tree(['1 button A\\nB']), {declared: []}), ['missing 1', 'added 1'], 'undeclared without it');
});

test('#526 review 3: the header and the Selected trailer take the departure too, their boundaries kept', () => {
  const header = title => `Window: "${title}", App: A.`;
  for (const nl of ['\n', '\r', '\u2028']) {
    assert.deepEqual(kinds(tree(['1 button A'], {header: header(`a${nl}b`)}), tree(['1 button A'], {header: header(`a${escapeLineBreaks(nl)}b`)})), [], JSON.stringify(nl));
  }
  assert.deepEqual(kinds(tree(['1 button A'], {header: header('a\nb')}), tree(['1 button A'], {header: header('a\\nc')})), ['header', 'unparsed']);
  const selected = elements => `\nSelected:\n${elements.map(e => `\t${e}`).join('\n')}\n\n${NOTE}`;
  const vendor = tree(['1 text one\ntwo', '2 button OK'], {trailer: selected(['1 text one\ntwo', '2 button OK'])});
  assert.deepEqual(kinds(vendor, tree(['1 text one\\ntwo', '2 button OK'], {trailer: selected(['1 text one\\ntwo', '2 button OK'])})), []);
  // A boundary is not a break: the second element folded into the first's text is a difference.
  assert.deepEqual(kinds(vendor, tree(['1 text one\\ntwo', '2 button OK'], {trailer: selected(['1 text one\\ntwo\\n\t2 button OK'])})), ['trailer']);
});

test('#526 review 6: redacted, the departure holds only on exact equality, never by length', () => {
  const opts = {structural: true};
  assert.deepEqual(kinds(tree(['1 text a\nb']), tree(['1 text xyz!']), opts), ['text']);
  assert.deepEqual(kinds(tree(['1 text a\nb']), tree(['1 text a\\nb']), opts), []);
  const focused = line => `\nThe focused UI element is ${line}`;
  assert.deepEqual(kinds(tree(['1 text ⟨3⟩'], {trailer: focused('1 text a\nb')}), tree(['1 text ⟨3⟩'], {trailer: focused('1 text xyz!')}), opts), ['trailer']);
  assert.deepEqual(kinds(tree(['1 text ⟨3⟩'], {trailer: focused('1 text a\nb')}), tree(['1 text ⟨3⟩'], {trailer: focused('1 text a\\nb')}), opts), []);
});

test('#552 (ruling 1177): the selected-text fence may be longer on cua\'s side; the departure takes the vendor\'s three as cua\'s', () => {
  const fenced = (text, fence) => `\nSelected text: ${fence}\n${text}\n${fence}\n\n${NOTE}`;
  const field = ['1 text entry area (settable) v'];
  const vendor = tree(field, {trailer: fenced('a ``` b', '```')}), cua = tree(field, {trailer: fenced('a ``` b', '````')});
  assert.deepEqual(kinds(vendor, cua), []);
  assert.deepEqual(kinds(vendor, cua, {declared: []}), ['trailer'], 'undeclared without it');
  assert.deepEqual(kinds(vendor, tree(field, {trailer: fenced('a ``` c', '````')})), ['trailer'], 'another text');
  assert.equal(parse(cua, {kind: 'full'}).trailer.kind, 'selectedText');
  assert.deepEqual(kinds(tree(field, {trailer: fenced('plain', '```')}), tree(field, {trailer: fenced('plain', '```')}), {declared: []}), []);
});

// The re-review of 8ecf39a79..276ff60bf (#526, round 2).
test('#526 round 2, item 2: a header is never folded across a line the parse consumed (a diff\'s removed IDs)', () => {
  const legend = 'with ~ and + representing changed and added elements, respectively. Removed elements are summarized by ID range.';
  const head = title => `The following is a diff from the previous accessibility tree for Window: "${title}" ${legend}`;
  const vendor = `${head('x\nRemoved element IDs: 5\ny')}\n~\t1 button A\n`;
  const cua = `${head('x\\ny')}\nRemoved element IDs: 5\n~\t1 button A\n`;
  const found = compare(vendor, cua, {kind: 'diff', declared: [BREAKS]}).differences.map(d => d.kind);
  assert.ok(found.includes('header') && found.includes('unparsed'), JSON.stringify(found));
  // Right after the header, the same title folds back.
  assert.deepEqual(compare(`${head('x\ny')}\n~\t1 button A\n`, `${head('x\\ny')}\n~\t1 button A\n`, {kind: 'diff', declared: [BREAKS]}).differences, []);
});

test('#526 round 2, item 3: where the vendor\'s text needs an escape or a longer fence, cua printing the raw form is a difference', () => {
  const focused = line => `\nThe focused UI element is ${line}`;
  const fenced = text => `\nSelected text: \`\`\`\n${text}\n\`\`\`\n\n${NOTE}`;
  for (const [what, text] of [
    ['a raw LF in the focused trailer', tree(['1 button A'], {trailer: focused('1 button A\nB')})],
    ['three backticks inside a three-backtick fence', tree(['1 text entry area (settable) v'], {trailer: fenced('a\n```\n[99] button Delete')})],
    ['a raw CR in an element line', tree(['1 button A\rB'])],
    ['a raw LF in an element line', tree(['1 button A\nB'])],
    ['a raw CR in the header', tree(['1 button A'], {header: 'Window: "a\rb", App: A.'})],
  ]) {
    assert.notDeepEqual(kinds(text, text), [], what);
    assert.notDeepEqual(kinds(text, text, {structural: true}), [], `${what}, redacted`);
  }
  // Text that needs nothing still compares as it is.
  const plain = tree(['1 button A'], {trailer: focused('1 button A')});
  assert.deepEqual(kinds(plain, plain), []);
});

test('#526 (ruling 1183, P2-6): a focused trailer whose value ends in a break keeps that break, so only cua\'s escaped form of it compares clean', () => {
  const focused = value => `\nThe focused UI element is 1 text entry area (settable) Value: ${value}`;
  const vendor = tree(['1 text entry area (settable) Value: abc\n'], {trailer: focused('abc\n')});
  assert.equal(parse(vendor, {kind: 'full'}).trailer.text, 'The focused UI element is 1 text entry area (settable) Value: abc\n');
  assert.deepEqual(kinds(vendor, tree(['1 text entry area (settable) Value: abc\\n'], {trailer: focused('abc\\n')})), []);
  assert.deepEqual(kinds(vendor, tree(['1 text entry area (settable) Value: abc\\n'], {trailer: focused('abc')})), ['trailer'], 'cua missing the final break');
  // A tree with no trailer keeps its final LF as the terminator, not as a line of the last element.
  assert.equal(parse('Window: "w", App: A.\n0 standard window w\n\t1 button A\n', {kind: 'full'}).items.at(-1).rest, 'button A');
});
