// The own native engine spike's stand-in renderer (scripts/spike/engine/render.mjs; docs/doperpowers/specs/
// 2026-10-18-own-native-engine-design.md, M0 "Spike" and Design "The service", Renderer): a Skyshot tree to the vendor's
// text grammar as F §2.4–2.6 read it. Synthetic trees only; no window of any app is observed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {render, elementLine, NOTE} from '../scripts/spike/engine/render.mjs';

const node = (index, depth, fields = {}) => ({
  index, depth, pid: 4242, role: 'AXButton', subrole: null, roleDescription: 'button', title: null, description: null,
  value: null, valueMarkdown: null, identifier: null, flags: {enabled: true, focused: false, selected: false, settable: false},
  actions: [], frame: null, children: 0, ...fields,
});

const skyshot = (nodes, extra = {}) => ({
  app: {bundleIdentifier: 'io.example.fixture', displayName: 'Fixture', appPath: '/tmp/Fixture.app', pid: 4242},
  window: {title: 'Sample', frame: {x: 0, y: 0, width: 400, height: 300}, pid: 4242},
  lineage: 'lineage-1', revision: 1, nodes, truncated: null, screenshot: null, focused: null, selectedText: null, ...extra,
});

test('the header has no App= line; one line per element, tabs per depth, the index first', () => {
  const text = render(skyshot([
    node(0, 0, {role: 'AXWindow', roleDescription: 'standard window', title: 'Sample', actions: ['AXRaise']}),
    node(1, 1, {title: 'OK'}),
    node(2, 2, {role: 'AXStaticText', roleDescription: 'text', value: 'Hello'}),
  ]));
  assert.equal(text, [
    'Window: "Sample", App: Fixture.',
    '0 standard window Sample, Secondary Actions: Raise',
    '\t1 button OK',
    '\t\t2 text Hello',
    '',
  ].join('\n'));
});

test('a missing window title or app name reads Unknown, as the vendor defaults them', () => {
  const text = render(skyshot([], {window: {title: null, frame: null, pid: 1}, app: {bundleIdentifier: null, displayName: null, appPath: '/x', pid: 1}}));
  assert.equal(text.split('\n')[0], 'Window: "Unknown", App: Unknown.');
});

test('the role word: localized description, with the vendor\'s overrides and fallbacks', () => {
  const word = fields => elementLine({...node(7, 0, fields), title: 'T'});
  assert.equal(word({role: 'AXRow', roleDescription: 'table row'}), '7 row T');
  assert.equal(word({role: 'AXGroup', roleDescription: 'group'}), '7 container T');
  assert.equal(word({role: 'AXMenuItem', roleDescription: 'menu item'}), '7 T', 'nothing for menu items');
  assert.equal(word({role: 'AXMenuBarItem', roleDescription: 'menu bar item'}), '7 T', 'nothing for menu-bar items');
  assert.equal(word({role: 'AXRadioGroup', roleDescription: 'radio group'}), '7 T', 'nothing for radio groups');
  assert.equal(word({role: 'AXMenu', roleDescription: ''}), '7 menu T');
  assert.equal(word({role: 'AXMenuBar', roleDescription: ''}), '7 menu bar T');
  assert.equal(word({role: 'AXSomethingNew', roleDescription: ''}), '7 unknown T');
  assert.equal(word({role: 'AXUnknown', roleDescription: '', description: null}), '7 element T');
  assert.equal(word({role: 'AXTextArea', roleDescription: '텍스트 엔트리 영역'}), '7 텍스트 엔트리 영역 T', 'the description as localized');
});

test('flags in the vendor\'s order: selectable, selected, disabled, expanded or collapsed, settable with its type', () => {
  const flags = (fields, flagSet) => elementLine({...node(1, 0, fields), flags: {enabled: true, focused: false, selected: false, settable: false, ...flagSet}});
  assert.equal(flags({}, {selectable: true}), '1 button (selectable)');
  assert.equal(flags({}, {selectable: true, selected: true}), '1 button (selected)', 'selectable only while not selected');
  assert.equal(flags({}, {enabled: false}), '1 button (disabled)');
  assert.equal(flags({role: 'AXGroup', roleDescription: 'group'}, {enabled: false}), '1 container', 'never disabled for a group');
  assert.equal(flags({role: 'AXStaticText', roleDescription: 'text'}, {enabled: false}), '1 text', 'never disabled for static text');
  assert.equal(flags({role: 'AXOutline', roleDescription: 'outline'}, {expanded: true}), '1 outline (expanded)');
  assert.equal(flags({role: 'AXOutline', roleDescription: 'outline'}, {expanded: false}), '1 outline (collapsed)');
  assert.equal(flags({role: 'AXTextField', roleDescription: 'text field', value: 'x'}, {settable: true}), '1 text field (settable) x');
  assert.equal(flags({role: 'AXSlider', roleDescription: 'slider', value: 3}, {settable: true}), '1 slider (settable, integer) 3');
  assert.equal(flags({role: 'AXSlider', roleDescription: 'slider', value: 0.5}, {settable: true}), '1 slider (settable, float) 0.5');
  assert.equal(flags({role: 'AXCheckBox', roleDescription: 'checkbox', value: true}, {settable: true}), '1 checkbox (settable, boolean) true');
  assert.equal(flags({role: 'AXTextField', roleDescription: 'text field'}, {selected: true, enabled: false, settable: true}),
    '1 text field (selected, disabled, settable)');
});

test('parts in the vendor\'s order: title bare, then labelled parts; a lone part prints without its label', () => {
  const line = fields => elementLine(node(3, 0, fields));
  assert.equal(line({title: 'Save', description: 'Saves the file', help: 'Click to save', identifier: 'saveButton'}),
    '3 button Save, Description: Saves the file, Help: Click to save, ID: saveButton');
  assert.equal(line({description: 'Only this'}), '3 button Only this', 'one part: its value alone');
  assert.equal(line({actions: ['AXRaise']}), '3 button Secondary Actions: Raise', 'Secondary Actions keeps its label alone');
  assert.equal(line({role: 'AXTextField', roleDescription: 'text field', value: 'v', placeholder: 'Name', identifier: 'nameField'}),
    '3 text field Value: v, Placeholder: Name, ID: nameField');
  assert.equal(line({url: 'https://www.example.com/a?b=1', title: 'Link'}), '3 button Link, URL: example.com/a?b=1', 'scheme and www. dropped');
  assert.equal(line({value: 'v', valueDescription: 'described'}), '3 button Value: v, Details: described');
});

test('an identifier starting with _ or NS is dropped entirely', () => {
  assert.equal(elementLine(node(1, 0, {title: 'A', identifier: '_NS:12'})), '1 button A');
  assert.equal(elementLine(node(1, 0, {title: 'A', identifier: 'NSWindowCloseButton'})), '1 button A');
  assert.equal(elementLine(node(1, 0, {title: 'A', identifier: 'Keep'})), '1 button A, ID: Keep');
});

test('a part repeating an earlier part\'s value is skipped; long parts move after the short ones', () => {
  assert.equal(elementLine(node(1, 0, {title: 'Same', description: 'Same', identifier: 'id1'})), '1 button Same, ID: id1');
  const long = 'x'.repeat(120);
  assert.equal(elementLine(node(1, 0, {role: 'AXTextArea', roleDescription: 'text entry area', value: long, title: 'Doc', identifier: 'body'})),
    `1 text entry area Doc, ID: body, Value: ${long}`);
  assert.equal(elementLine(node(1, 0, {role: 'AXTextArea', roleDescription: 'text entry area', value: 'a\nb', identifier: 'body'})),
    '1 text entry area ID: body, Value: a\nb', 'a value with a newline is long');
});

test('the Markdown rendering of a value is preferred to the plain value', () => {
  assert.equal(elementLine(node(1, 0, {role: 'AXTextArea', roleDescription: 'text entry area', value: 'bold', valueMarkdown: '**bold**', identifier: 'b'})),
    '1 text entry area Value: **bold**, ID: b');
});

test('secondary actions: press, pick, show-menu and scroll-to-visible are not secondary; names lose AX, custom names keep theirs', () => {
  const line = actions => elementLine(node(1, 0, {title: 'A', actions}));
  assert.equal(line(['AXPress', 'AXPick', 'AXShowMenu', 'AXScrollToVisible']), '1 button A');
  assert.equal(line(['AXPress', 'AXIncrement', 'AXShowDefaultUI']), '1 button A, Secondary Actions: Increment, Show Default UI');
  assert.equal(line(['Name:Copy Link\nTarget:0x0\nSelector:(null)', 'AXRaise']), '1 button A, Secondary Actions: Copy Link, Raise');
});

test('the trailer: selected text wins over the focused element', () => {
  const nodes = [node(0, 0, {role: 'AXWindow', roleDescription: 'standard window', title: 'Sample'}), node(1, 1, {role: 'AXTextArea', roleDescription: 'text entry area', value: 'abc'})];
  const focused = render(skyshot(nodes, {focused: 1}));
  assert.ok(focused.endsWith('\t1 text entry area abc\n\nThe focused UI element is 1 text entry area abc'), focused);
  const selected = render(skyshot(nodes, {focused: 1, selectedText: 'bc'}));
  assert.ok(selected.endsWith(`\t1 text entry area abc\n\nSelected text: \`\`\`\nbc\n\`\`\`\n\n${NOTE}`), selected);
  assert.ok(!selected.includes('The focused UI element'), 'the focused line is omitted under a selection');
  assert.ok(!render(skyshot(nodes, {focused: 99})).includes('The focused UI element'), 'a focused index with no line names nothing');
});

test('truncation markers follow the element lines', () => {
  const text = render(skyshot([node(0, 0, {title: 'Only'})], {truncated: {depth: 40, count: 12}}));
  assert.equal(text, [
    'Window: "Sample", App: Fixture.',
    '0 button Only',
    '[truncated: elements deeper than 40 levels omitted]',
    '[truncated: 12 elements omitted]',
    '',
  ].join('\n'));
});
