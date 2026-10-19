// cua's engine service, the renderer and its numbering (src/services/engine/render.mjs;
// docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, "The service", Renderer, and the M1a pre-flight entry,
// item 3; the rules are sky-behaviour.md §5–§8). The scenes' recorded captures are test/services-engine-render-goldens.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advanceNumbering, indexState, render, formatNumber, shortenUrl, NOTE} from '../src/services/engine/render.mjs';
import {node, skyshot} from './native-goldens/builder.mjs';

const win = (children = []) => [node('w', 0, 'AXWindow', {roleDescription: 'standard window', title: 'W', actions: ['AXRaise']}), ...children];
const button = (token, depth, title, fields = {}) => node(token, depth, 'AXButton', {roleDescription: 'button', title, actions: ['AXPress'], ...fields});
const text = (token, depth, value, fields = {}) => node(token, depth, 'AXStaticText', {roleDescription: 'text', value, valueType: 'string', ...fields});
const group = (token, depth, fields = {}) => node(token, depth, 'AXGroup', {roleDescription: 'group', ...fields});

// The element lines of a rendering (header and trailer dropped).
function lines(shot) {
  const out = render(shot, advanceNumbering(null, shot)).split('\n');
  return out.slice(1, out.indexOf(''));
}

// ---- Numbering ----

test('a fresh lineage numbers the rendered elements 0, 1, … in preorder', () => {
  const shot = skyshot(win([button('a', 1, 'A'), group('g', 1, {title: 'G'}), button('b', 2, 'B')]));
  const numbering = advanceNumbering(null, shot);
  assert.deepEqual([...numbering.indexes], [['w', 0], ['a', 1], ['g', 2], ['b', 3]]);
  assert.equal(numbering.next, 4);
  assert.equal(numbering.lineage, 'L1');
  assert.ok(Object.isFrozen(numbering));
});

test('a kept token keeps its index, a new one takes the next never issued, a vanished one retires for good', () => {
  const first = advanceNumbering(null, skyshot(win([button('a', 1, 'A'), button('b', 1, 'B')])));
  const second = advanceNumbering(first, skyshot(win([button('x', 1, 'X'), button('b', 1, 'B')]), {revision: 2}));
  assert.deepEqual([...second.indexes], [['w', 0], ['x', 3], ['b', 2]]);
  // `a` returning is a new element to the model: its old index 1 is never issued again.
  const third = advanceNumbering(second, skyshot(win([button('a', 1, 'A'), button('b', 1, 'B')]), {revision: 3}));
  assert.deepEqual([...third.indexes], [['w', 0], ['a', 4], ['b', 2]]);
  assert.deepEqual(indexState(third, 4), {state: 'live', token: 'a'});
  assert.deepEqual(indexState(third, 1), {state: 'retired'});
  assert.deepEqual(indexState(third, 3), {state: 'retired'});
  assert.deepEqual(indexState(third, 5), {state: 'invalid'});
  assert.deepEqual(indexState(third, -1), {state: 'invalid'});
  assert.deepEqual(indexState(third, 1.5), {state: 'invalid'});
});

test('another lineage (disableDiff, a new connection) starts again from 0', () => {
  const first = advanceNumbering(null, skyshot(win([button('a', 1, 'A'), button('b', 1, 'B')])));
  const fresh = advanceNumbering(first, skyshot(win([button('b', 1, 'B')]), {lineage: 'L2'}));
  assert.deepEqual([...fresh.indexes], [['w', 0], ['b', 1]]);
  assert.equal(fresh.next, 2);
});

test('pruned elements take no index; a trailer element outside the tree takes one after it', () => {
  const shot = skyshot(win([group('empty', 1), button('a', 1, 'A'), node('hidden', 1, 'AXGroup', {flags: {focused: true}})]), {focused: 'hidden'});
  const numbering = advanceNumbering(null, shot);
  assert.deepEqual([...numbering.indexes], [['w', 0], ['a', 1], ['hidden', 2]]);
  // The focused group says nothing, so the tree drops it; the trailer prints it from its own attributes.
  assert.match(render(shot, numbering), /\nThe focused UI element is 2 container$/);
});

test('rendering with a numbering that lacks a token is a programming error', () => {
  const shot = skyshot(win([button('a', 1, 'A')]));
  assert.throws(() => render(shot, advanceNumbering(null, skyshot(win()))), /no index for token a/);
});

// ---- The text ----

test('the header, one line per element with tabs per depth, and a final newline without a trailer', () => {
  const shot = skyshot(win([button('a', 1, 'A'), group('g', 1, {title: 'G'}), button('b', 2, 'B')]));
  assert.equal(render(shot, advanceNumbering(null, shot)),
    'Window: "W", App: Example.\n0 standard window W, Secondary Actions: Raise\n\t1 button A\n\t2 container G\n\t\t3 button B\n');
});

test('the title and app name default to Unknown', () => {
  const shot = skyshot(win(), {window: null, app: null});
  assert.match(render(shot, advanceNumbering(null, shot)), /^Window: "Unknown", App: Unknown\.\n/);
});

test('flags print in the vendor\'s order', () => {
  const flags = {selectable: true, enabled: false, disclosable: true, expanded: true, settable: true, focusable: true};
  // A settable child keeps flattening (1) away from the selectable element.
  const shot = skyshot(win([node('r', 1, 'AXCheckBox', {roleDescription: 'checkbox', value: 1, valueType: 'number', domClassList: ['is-sender'], flags}),
    node('v', 2, 'AXTextField', {roleDescription: 'text field', value: 'x', valueType: 'string', flags: {settable: true, focusable: true}})]));
  assert.equal(lines(shot)[1], '\t1 checkbox (selectable, disabled, expanded, settable, integer, sent by me) Value: 1, Secondary Actions: Collapse');
  const selected = skyshot(win([node('r', 1, 'AXRow', {roleDescription: 'table row', value: 'x', valueType: 'string', flags: {selectable: true, selected: true, focusable: true}})]));
  assert.equal(lines(selected)[1], '\t1 row (selected) x');
});

test('disabled is never printed for a group or static text', () => {
  const shot = skyshot(win([group('g', 1, {title: 'G', flags: {enabled: false}}), text('t', 1, 'T', {flags: {enabled: false}}), button('b', 1, 'B', {flags: {enabled: false}})]));
  assert.deepEqual(lines(shot).slice(1), ['\t1 container G', '\t2 text T', '\t3 button (disabled) B']);
});

test('settable names the value\'s type, plainly for a string', () => {
  const field = (token, value, valueType, more = {}) => node(token, 1, 'AXSlider', {roleDescription: 'slider', value, valueType, flags: {settable: true, focusable: true}, ...more});
  const shot = skyshot(win([field('s', 'x', 'string'), field('i', 3, 'number'), field('f', 0.5, 'number'), field('b', true, 'boolean'), field('n', 0, 'float')]));
  assert.deepEqual(lines(shot).slice(1), ['\t1 slider (settable) x', '\t2 slider (settable, integer) 3', '\t3 slider (settable, float) 0.5', '\t4 slider (settable, boolean) on', '\t5 slider (settable, float) 0']);
});

test('numbers print as NSNumber describes them (%.16g); Booleans as on and off', () => {
  assert.equal(formatNumber(0.18518517911434174), '0.1851851791143417');
  assert.equal(formatNumber(80 / 9), '8.888888888888889');
  assert.equal(formatNumber(1.2698412698412698), '1.26984126984127');
  assert.equal(formatNumber(0.02), '0.02');
  assert.equal(formatNumber(14), '14');
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(1e-5), '1e-05');
  assert.equal(formatNumber(1.5e300), '1.5e+300');
  const shot = skyshot(win([node('c', 1, 'AXCheckBox', {roleDescription: 'checkbox', title: 'C', value: false, valueType: 'boolean', actions: ['AXPress']})]));
  assert.equal(lines(shot)[1], '\t1 checkbox C, Value: off');
});

test('the parts: title bare, then labels in order; a repeated value skipped; long parts last; a lone part bare', () => {
  // The index ranges are the CFRange's half-open bounds: [1, 3] spans rows 1 and 2; [2, 2] is empty.
  const full = {
    title: 'T', description: 'T', rowIndexRange: [1, 3], columnIndexRange: [2, 2], url: 'https://www.example.com/a', help: 'H', value: 'V',
    valueType: 'string', valueDescription: 'D', placeholder: 'P', identifier: 'ident', actions: ['AXPress', 'AXIncrement', 'AXShowMenu', 'AXScrollToVisible', 'Name:Copy link\nTarget:0x1\nSelector:(null)'],
  };
  const long = 'x'.repeat(100);
  const shot = skyshot(win([
    node('a', 1, 'AXCell', {roleDescription: 'cell', ...full}),
    node('b', 1, 'AXCell', {roleDescription: 'cell', title: 'T', description: long, help: 'line 1\nline 2', value: 'V', valueType: 'string'}),
    node('c', 1, 'AXCell', {roleDescription: 'cell', description: 'only'}),
    node('d', 1, 'AXCell', {roleDescription: 'cell', actions: ['AXRaise']}),
    node('e', 1, 'AXCell', {roleDescription: 'cell', identifier: '_NS:12', title: 'X'}),
    node('f', 1, 'AXCell', {roleDescription: 'cell', identifier: 'NSWindow', title: 'Y'}),
  ]));
  assert.equal(render(shot, advanceNumbering(null, shot)), ['Window: "W", App: Example.', '0 standard window W, Secondary Actions: Raise',
    '\t1 cell T, Rows: 1-2, URL: example.com/a, Help: H, Value: V, Details: D, Placeholder: P, ID: ident, Secondary Actions: Increment, Copy link',
    `\t2 cell T, Value: V, Description: ${long}, Help: line 1\nline 2`,
    '\t3 cell only',
    '\t4 cell Secondary Actions: Raise',
    '\t5 cell X',
    '\t6 cell Y', ''].join('\n'));
});

test('Rows and Columns print the closed range, and only when it spans more than one', () => {
  const cell = (token, rowIndexRange, columnIndexRange) => node(token, 1, 'AXCell', {roleDescription: 'cell', title: token, rowIndexRange, columnIndexRange});
  const shot = skyshot(win([cell('a', [4, 5], [0, 1]), cell('b', [4, 7], [2, 4]), cell('c', [3, 3], [1, 2])]));
  assert.deepEqual(lines(shot).slice(1), ['\t1 cell a', '\t2 cell b, Rows: 4-6, Columns: 2-3', '\t3 cell c']);
});

test('a text area prints its Markdown value; other roles their plain value', () => {
  const shot = skyshot(win([
    node('t', 1, 'AXTextArea', {roleDescription: 'text entry area', value: 'a b', valueMarkdown: 'a **b**', valueType: 'string', flags: {settable: true, focusable: true}}),
    node('f', 1, 'AXTextField', {roleDescription: 'text field', value: 'c d', valueMarkdown: 'c **d**', valueType: 'string', flags: {settable: true, focusable: true}}),
  ]));
  assert.deepEqual(lines(shot).slice(1), ['\t1 text entry area (settable) a **b**', '\t2 text field (settable) c d']);
});

test('role words: row for rows, container for groups, nothing for menu items, the description otherwise', () => {
  const shot = skyshot(win([
    node('r', 1, 'AXRow', {roleDescription: 'outline row', subrole: 'AXOutlineRow', title: 'R', flags: {focusable: true}}),
    group('g', 1, {roleDescription: 'main', title: 'G'}),
    node('m', 1, 'AXMenuItem', {roleDescription: 'menu item', title: 'Open', actions: ['AXPress', 'AXCancel']}),
    node('k', 1, 'AXCheckBox', {roleDescription: '체크박스', title: 'K', actions: ['AXPress']}),
    node('u', 1, 'AXSomething', {roleDescription: null, title: 'U', actions: ['AXPress']}),
  ]));
  assert.deepEqual(lines(shot).slice(1), ['\t1 row R', '\t2 container G', '\t3 Open', '\t4 체크박스 K', '\t5 unknown U']);
});

test('an element whose line is empty is not printed; its children take its place', () => {
  const shot = skyshot(win([node('rg', 1, 'AXRadioGroup', {roleDescription: 'radio group'}),
    node('r1', 2, 'AXRadioButton', {roleDescription: 'radio button', title: 'One', value: 1, valueType: 'number', actions: ['AXPress']}),
    node('r2', 2, 'AXRadioButton', {roleDescription: 'radio button', title: 'Two', value: 0, valueType: 'number', actions: ['AXPress']})]));
  assert.deepEqual(lines(shot).slice(1), ['\t1 radio button One, Value: 1', '\t2 radio button Two, Value: 0']);
});

test('actions: the vendor\'s words for the actions it names, a custom action\'s name, AX names split; some hidden', () => {
  const shot = skyshot(win([
    node('s', 1, 'AXScrollArea', {roleDescription: 'scroll area', actions: ['AXScrollLeftByPage', 'AXScrollUpByPage', 'AXZoomWindow', 'AXShowDefaultUI', 'AXShowAlternateUI']}),
    node('m', 1, 'AXMenuItem', {roleDescription: 'menu item', title: 'Open', actions: ['AXPress', 'AXCancel', 'AXConfirm']}),
  ]));
  assert.deepEqual(lines(shot).slice(1), ['\t1 scroll area Secondary Actions: Scroll Left, Scroll Up, Zoom Window', '\t2 Open, Secondary Actions: Confirm']);
});

test('an action prints the vendor\'s table word, else its custom name, else the description the Skyshot carries', () => {
  const shot = skyshot(win([node('s', 1, 'AXScrollArea', {roleDescription: 'scroll area',
    actions: ['AXScrollLeftByPage', 'AXZoomWindow', 'AXShowDefaultUI', 'AXShowAlternateUI', 'AXPress', 'AXRemoveComment', 'AXOpen', 'Name: Share\nTarget:0x0'],
    actionDescriptions: [null, '윈도우 확대/축소', null, null, null, 'Add comment', 'AXOpen', null]})]));
  assert.equal(lines(shot)[1], '\t1 scroll area Secondary Actions: Scroll Left, 윈도우 확대/축소, AXOpen, Share');
  const contrary = skyshot(win([node('s', 1, 'AXScrollArea', {roleDescription: 'scroll area', actions: ['AXScrollLeftByPage', 'AXRaise'],
    actionDescriptions: ['왼쪽으로 스크롤', '앞으로 가져오기']})]));
  assert.equal(lines(contrary)[1], '\t1 scroll area Secondary Actions: Scroll Left, Raise', 'the table comes before any description');
});

test('a custom action\'s Name: is scanned as the vendor\'s NSScanner does: leading whitespace skipped, up to the newline', () => {
  const shot = skyshot(win([node('s', 1, 'AXScrollArea', {roleDescription: 'scroll area', actions: ['Name:\n Tags\nTarget:0x0', 'Name: Add tag\nTarget:0x0']})]));
  assert.equal(lines(shot)[1], '\t1 scroll area Secondary Actions: Tags, Add tag');
});

test('the value type the engine names: float, integer, boolean, date and unknown print; a string prints plain settable', () => {
  const typed = (valueType, value) => node('v', 1, 'AXValueIndicator', {roleDescription: 'value indicator', title: 'V', value, valueType, flags: {settable: true}});
  const shot = skyshot(win([typed('float', 0), typed('integer', 3), typed('date', null), typed('unknown', null), typed('string', 's')].map((each, i) => ({...each, token: `v${i}`}))));
  assert.deepEqual(lines(shot).slice(1), ['\t1 value indicator (settable, float) V, Value: 0', '\t2 value indicator (settable, integer) V, Value: 3',
    '\t3 value indicator (settable, date) V', '\t4 value indicator (settable, unknown) V', '\t5 value indicator (settable) V, Value: s']);
});

test('a window with no title prints Unknown, as the vendor\'s llmDescription defaults it', () => {
  const shot = skyshot(win(), {window: {title: null, frame: null, pid: 1}});
  assert.ok(render(shot, advanceNumbering(null, shot)).startsWith('Window: "Unknown", App: Example.\n'));
});

test('the width rule\'s partial children: (showing <ranges> of <count> items)', () => {
  const shot = skyshot(win([node('o', 1, 'AXOutline', {roleDescription: 'outline', title: 'O', flags: {focusable: true},
    shown: {count: 18, of: 205, subset: 'visible', ranges: [[0, 9], [12, 20]]}})]));
  assert.equal(lines(shot)[1], '\t1 outline O (showing 0-9, 12-20 of 205 items)');
  const omitted = skyshot(win([node('o', 1, 'AXOutline', {roleDescription: 'outline', title: 'O', flags: {focusable: true}, shown: {count: 0, of: 600, subset: 'omitted'}})]));
  assert.equal(lines(omitted)[1], '\t1 outline O');
});

test('the menu bar: the engine\'s AXMenuBar node after the window\'s tree with the items the engine emitted under it, with no actions', () => {
  const item = (token, title, fields = {}) => node(token, 1, 'AXMenuBarItem', {roleDescription: 'menu bar item', title, actions: ['AXCancel', 'AXPress', 'AXPick', 'AXRaise'],
    actionDescriptions: ['cancel', 'press', 'pick', 'raise'], ...fields});
  const bar = node('mb', 0, 'AXMenuBar', {roleDescription: null});
  const items = [item('m1', 'Example'), item('m3', 'File', {flags: {enabled: false}})];
  const shot = skyshot(win([button('a', 1, 'A')]), {menuBar: [bar, ...items]});
  const numbering = advanceNumbering(null, shot);
  assert.deepEqual(lines(shot), ['0 standard window W, Secondary Actions: Raise', '\t1 button A', '2 menu bar', '\t3 Example', '\t4 (disabled) File']);
  assert.deepEqual(indexState(numbering, 2), {state: 'live', token: 'mb'}, 'the bar is the engine\'s element, resolvable like any other');
  const described = skyshot(win(), {menuBar: [node('mb', 0, 'AXMenuBar', {roleDescription: '메뉴 막대'}), ...items]});
  assert.equal(lines(described)[1], '1 메뉴 막대', 'a role description the bar carries is its role word');
  const recorded = skyshot(win(), {menuBar: items.map(each => ({...each, depth: 0, actions: ['AXCancel', 'AXPress', 'AXPick'], actionDescriptions: undefined}))});
  assert.deepEqual(lines(recorded).slice(1, 3), ['1 Example', '2 (disabled) File'], 'items without their bar (M0\'s recordings) print as top-level elements');
});

test('the trailer: selected text, else selected elements (one tab), else the focused element', () => {
  const nodes = win([node('f', 1, 'AXTextField', {roleDescription: 'text field', value: 'v', valueType: 'string', flags: {settable: true, focusable: true, focused: true}}),
    node('r', 1, 'AXRow', {flags: {selectable: true, selected: true}, title: 'R'})]);
  const full = fields => { const shot = skyshot(nodes, fields); return render(shot, advanceNumbering(null, shot)); };
  const body = 'Window: "W", App: Example.\n0 standard window W, Secondary Actions: Raise\n\t1 text field (settable) v\n\t2 row (selected) R\n';
  assert.equal(full({focused: 'f'}), `${body}\nThe focused UI element is 1 text field (settable) v`);
  assert.equal(full({focused: 'f', selectedElements: ['r']}), `${body}\nSelected:\n\t2 row (selected) R\n\n${NOTE}`);
  assert.equal(full({focused: 'f', selectedElements: ['r'], selectedText: 'abc'}), `${body}\nSelected text: \`\`\`\nabc\n\`\`\`\n\n${NOTE}`);
});

test('cua\'s truncation markers follow the tree', () => {
  const shot = skyshot(win([button('a', 1, 'A')]), {truncated: {depth: 200, count: 12}});
  assert.equal(render(shot, advanceNumbering(null, shot)),
    'Window: "W", App: Example.\n0 standard window W, Secondary Actions: Raise\n\t1 button A\n[truncated: elements deeper than 200 levels omitted]\n[truncated: 12 elements omitted]\n');
});

// ---- The transformations (sky-behaviour.md §5) ----

test('(0) a child serving as title for one sibling names it and goes', () => {
  const shot = skyshot(win([group('g', 1, {title: 'Form'}), text('label', 2, 'Name', {servesAsTitleFor: ['field']}),
    node('field', 2, 'AXTextField', {roleDescription: 'text field', value: '', valueType: 'string', flags: {settable: true, focusable: true}})]));
  assert.deepEqual(lines(shot).slice(1), ['\t1 container Form', '\t\t2 text field (settable) Name']);
});

test('(1) a selectable element with nothing selectable or settable under it takes its subtree\'s text, keeping toggles', () => {
  const shot = skyshot(win([node('o', 1, 'AXOutline', {roleDescription: 'outline', flags: {focusable: true}}),
    node('r', 2, 'AXRow', {subrole: 'AXOutlineRow', flags: {selectable: true}}), node('c', 3, 'AXCell', {roleDescription: 'cell'}),
    text('t', 4, 'Desktop'), node('k', 3, 'AXCheckBox', {roleDescription: 'checkbox', value: true, valueType: 'boolean', actions: ['AXPress']})]));
  assert.deepEqual(lines(shot).slice(1), ['\t1 outline', '\t\t2 row (selectable) Desktop', '\t\t\t3 checkbox on']);
});

test('(2) a subtree with nothing to say or do is pruned; (3) so is an empty disabled element', () => {
  const shot = skyshot(win([group('g', 1, {title: 'G'}), node('s', 2, 'AXSplitter', {roleDescription: 'splitter'}), group('inner', 3),
    node('d', 2, 'AXDisclosureTriangle', {roleDescription: 'disclosure triangle', flags: {enabled: false}, actions: ['AXPress']}), button('b', 2, 'B')]));
  assert.deepEqual(lines(shot).slice(1), ['\t1 container G', '\t\t2 button B']);
});

test('(4) a plain group is replaced by its only child, repeatedly, and an empty one goes', () => {
  const shot = skyshot(win([group('g1', 1), group('g2', 2), group('g3', 3), button('b', 4, 'B'), group('empty', 1, {flags: {focusable: true}})]));
  assert.deepEqual(lines(shot).slice(1), ['\t1 button B']);
});

test('(5) a child with its parent\'s role and line is replaced by its children, one level only', () => {
  const shot = skyshot(win([group('top', 1), group('same', 2), group('same2', 3), button('a', 4, 'A'), button('a2', 4, 'A2'), button('b', 3, 'B'), group('other', 2, {title: 'Other'}), button('c', 3, 'C')]));
  assert.deepEqual(lines(shot).slice(1), ['\t1 container', '\t\t2 container', '\t\t\t3 button A', '\t\t\t4 button A2', '\t\t5 button B', '\t\t6 container Other', '\t\t\t7 button C']);
});

test('(6) under an element nothing can be done with, text it already says is dissolved', () => {
  const shot = skyshot(win([node('h', 1, 'AXHeading', {roleDescription: 'heading', description: 'Section title', value: 'Section title'}),
    text('t', 2, 'Section title'), text('u', 2, 'Other')]));
  assert.deepEqual(lines(shot).slice(1), ['\t1 heading Section title', '\t\t2 text Other']);
});

test('(7) a link with a URL becomes a link text whose value is the shortened URL', () => {
  const shot = skyshot(win([node('l', 1, 'AXLink', {roleDescription: '링크', title: 'Docs', description: 'Docs', url: 'https://www.example.com/docs#top', actions: ['AXPress']}), text('lt', 2, 'Docs')]));
  assert.deepEqual(lines(shot).slice(1), ['\t1 link Docs, Value: example.com/docs#top']);
});

test('(8) runs of text under an element that is not interactive merge into the first, links as Markdown', () => {
  const shot = skyshot(win([group('p', 1, {title: 'Para'}), text('a', 2, 'Read'), node('l', 2, 'AXLink', {title: 'the [docs]', url: 'https://example.com/d', actions: ['AXPress']}), text('b', 2, 'now'), button('x', 2, 'X'), text('c', 2, 'alone')]));
  assert.deepEqual(lines(shot).slice(1), ['\t1 container Para', '\t\t2 text Read [the \\[docs\\]](example.com/d) now', '\t\t3 button X', '\t\t4 text alone']);
});

test('Calendar: an Event\'s single static text is cleared', () => {
  const event = [group('g', 1, {title: 'Day'}), node('e', 2, 'AXStaticText', {roleDescription: 'Event', value: 'Lunch', valueType: 'string', flags: {focusable: true}}), text('d', 3, 'Lunch at noon', {flags: {focusable: true}})];
  const calendar = skyshot(win(event), {app: {bundleIdentifier: 'com.apple.iCal', displayName: 'Calendar'}});
  assert.deepEqual(lines(calendar).slice(1), ['\t1 container Day', '\t\t2 Event Lunch']);
  assert.equal(lines(skyshot(win(event))).length, 4);
});

// ---- URLs (sky-behaviour.md §7) ----

test('a URL loses its http(s) scheme, leading // and www.; webdoc: and data: are not printed', () => {
  assert.equal(shortenUrl('https://www.example.com/a?b#c'), 'example.com/a?b#c');
  assert.equal(shortenUrl('file:///tmp/x'), 'file:///tmp/x');
  assert.equal(shortenUrl('data:image/png;base64,AAAA'), null);
  assert.equal(shortenUrl('webdoc://x'), null);
  assert.equal(shortenUrl('https://example.com/abcdef', {includeFragment: true, includeQuery: true, limit: 10}), 'example.c…');
});

test('over the tree\'s 4,000 URL characters, fragments go, then queries, then each URL is cut', () => {
  // Under a focusable list, so the links stay apart (8).
  const links = (count, url) => [node('list', 1, 'AXList', {roleDescription: 'list', flags: {focusable: true}}),
    ...Array.from({length: count}, (_, i) => node(`l${i}`, 2, 'AXLink', {title: `L${i}`, url: url(i), actions: ['AXPress']}))];
  const withFragments = skyshot(win(links(40, i => `https://example.com/page/${i}?q=${'q'.repeat(40)}#${'f'.repeat(60)}`)));
  assert.equal(lines(withFragments)[2], `\t\t2 link L0, Value: example.com/page/0?q=${'q'.repeat(40)}`);
  const long = skyshot(win(links(40, i => `https://example.com/${i}/${'p'.repeat(200)}`)));
  // 40 URLs at the limit of 100 are exactly 4,000 characters: the first limit that fits.
  assert.equal(lines(long)[2], `\t\t2 link L0, Value: ${`example.com/0/${'p'.repeat(200)}`.slice(0, 99)}…`);
});
