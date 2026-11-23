// The goldens' comparison (test/native-goldens/compare.mjs) for the one vendor defect it declares: the vendor's subset
// count (`(showing <ranges> of <N> items)`) counts the children of a hierarchy its prefetch capped at 100, so where an
// element has more, the vendor's N is 100 and cua's is the true count. The `subsetCount` declaration lets exactly that
// differ: the same line otherwise, the same visible ranges, the vendor's N equal to min(cua's N, cap) and cua's N above
// the cap. Anything else stays an undeclared difference, and an unused declaration is over-declared.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compare} from './native-goldens/compare.mjs';

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
