// The matrix's reading of an observation's text (scripts/native-matrix/matrix-text.mjs): what its cells find and read
// back in the vendor's grammar, checked on the goldens both engines recorded on the mini (test/native-goldens/), so the
// readings are the ones the hold will meet, in English (TextEdit runs in English) and Korean (the rest).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as text from '../../scripts/native-matrix/matrix-text.mjs';

const golden = (scene, file) => readFileSync(fileURLToPath(new URL(`../native-goldens/${scene}/${file}`, import.meta.url)), 'utf8');
const vendor = Object.fromEntries(['textedit', 'finder', 'chrome', 'electron'].map(s => [s, golden(s, 'vendor.txt')]));
const cuaText = Object.fromEntries(['textedit', 'finder', 'chrome', 'electron'].map(s => [s, golden(s, 'cua.txt')]));

test('element lines carry index, depth and content; the trailer is not an element', () => {
  const lines = text.elementLines(vendor.electron);
  assert.deepEqual(lines[0], {index: 0, depth: 0, content: '표준 윈도우 cua Electron fixture, Secondary Actions: Raise'});
  assert.deepEqual(lines.find(l => l.index === 13), {index: 13, depth: 5, content: '버튼 Fixture button'});
  assert.equal(lines.filter(l => l.index === 5).length, 1, 'the focused-element trailer repeats index 5 and is not counted');
  assert.equal(text.lineOfIndex(vendor.electron, 13), '버튼 Fixture button');
  assert.equal(text.parentIndexOf(vendor.electron, 13), 4);
  assert.equal(text.parentIndexOf(vendor.electron, 0), null);
});

test('an element is found by a labelled part, and its value read across the lines a multi-line value spans', () => {
  for (const [ax, rendering] of [[vendor.textedit, 'vendor'], [cuaText.textedit, 'cua']]) {
    const area = text.indexOfPart(ax, 'ID', 'First Text View');
    assert.equal(area, 2);
    const value = text.valueOfIndex(ax, area, {rendering});
    assert.ok(value.startsWith('cua scene document\n**Bold scene line**\nLine 01'), value.slice(0, 60));
    assert.ok(value.endsWith('Line 60'));
    assert.equal(text.indexOfPart(ax, 'Description', 'align center'), 40);
    assert.equal(text.valueOfIndex(ax, 40), '0');
  }
  // A title alone carries no value; the checkbox's value is labelled.
  assert.equal(text.valueOfIndex(vendor.chrome, text.indexOfTarget(vendor.chrome, 'Scene notes')), null);
  assert.equal(text.valueOfIndex(vendor.chrome, text.indexOfTarget(vendor.chrome, 'Scene option')), '0');
  assert.equal(text.indexOfPart(vendor.textedit, 'ID', 'First'), null, 'a part matches whole');
});

test('an element by its identifier: labelled beside other parts, bare when it is the line\'s only part', () => {
  for (const ax of [vendor.textedit, cuaText.textedit]) assert.equal(text.indexOfId(ax, 'First Text View'), 2);
  const emptied = vendor.textedit.replace(/^(\t\t2 text entry area \(settable\)) ID: First Text View, Value: [\s\S]*?(?=\n\t*\d+ )/m, '$1 First Text View');
  assert.match(emptied, /^\t\t2 text entry area \(settable\) First Text View$/m);
  assert.equal(text.indexOfPart(emptied, 'ID', 'First Text View'), null, 'the labelled part is gone');
  assert.equal(text.indexOfId(emptied, 'First Text View'), 2);
  assert.equal(text.indexOfId(emptied, 'First Text'), null, 'a prefix of the identifier is not it');
});

test('the trailer: the focused element, selected text and selected elements', () => {
  assert.equal(text.focusedIndexOf(vendor.electron), 5);
  assert.equal(text.focusedIndexOf(vendor.finder), 4);
  assert.equal(text.selectedTextOf(vendor.textedit), null);
  const selected = 'Window: "x", App: y.\n0 standard window x\n\t1 text entry area (settable) Value: Line 10\n\nSelected text: ```\nLine 10\n```\n\nnote';
  assert.equal(text.selectedTextOf(selected), 'Line 10');
  const rows = 'Window: "x", App: y.\n0 row (selected)\n1 row (selected)\n\nSelected:\n\t0 row (selected)\n\t1 row (selected)\n\nnote';
  assert.deepEqual(text.selectedIndexesOf(rows), [0, 1]);
  assert.deepEqual(text.selectedIndexesOf(vendor.finder), []);
});

// #188: the renderer prints the focused element only when nothing is selected, so a trailer without the field's focus
// line says "unfocused" only when no selection masks it.
test('the focus reading tells a field shown focused, a trailer a selection masks, and a field shown unfocused', () => {
  assert.equal(text.focusReading(vendor.electron, 5), 'focused');
  assert.equal(text.focusReading(vendor.electron, 13), 'unfocused', 'the trailer names another element');
  const masked = 'Window: "x", App: y.\n0 standard window x\n\t1 text entry area (settable) Value: Line 10\n\nSelected text: ```\nLine 10\n```\n\nnote';
  assert.equal(text.focusReading(masked, 1), 'masked');
  const rows = 'Window: "x", App: y.\n0 row (selected)\n\nSelected:\n\t0 row (selected)\n\nnote';
  assert.equal(text.focusReading(rows, 0), 'masked', 'selected elements mask it too');
  assert.equal(text.focusReading('Window: "x", App: y.\n0 standard window x', 0), 'unfocused', 'no trailer at all');
  const run = new Function(`${text.EMBEDDED}\nreturn focusReading;`)();
  assert.equal(run(masked, 1), 'masked', 'embedded in a cell');
});

test('Finder: a file\'s row by its name, the list\'s visible range, the scroll area above it', () => {
  for (const ax of [vendor.finder, cuaText.finder]) {
    assert.equal(text.rowIndexOfName(ax, 'scene-file-001'), 5);
    assert.equal(text.rowIndexOfName(ax, 'scene-file-003'), 25);
    assert.equal(text.rowIndexOfName(ax, 'scene-file-150'), null, 'not in the visible subset');
    const list = text.indexOfPart(ax, 'ID', 'ListView');
    assert.equal(list, 4);
    assert.equal(text.showingOf(ax, list).from, 0);
    assert.equal(text.parentIndexOf(ax, list), 3);
  }
  assert.equal(text.showingOf(vendor.finder, 4).of, 100, 'the vendor\'s capped count');
  assert.equal(text.showingOf(cuaText.finder, 4).of, 205, 'cua keeps the true count (the M1b closing wave, 1c)');
});

test('TextEdit: the enabled scroll bar beside the text area reads its number', () => {
  for (const ax of [vendor.textedit, cuaText.textedit]) assert.equal(text.scrollBarValueBeside(ax, 2), 0.02);
});

test('the finding scorer\'s names: a target by name (exact or prefix), by role word for an unnamed control', () => {
  assert.equal(text.findTarget(vendor.electron, {name: 'Fixture button', match: 'exact'}), 13);
  assert.equal(text.findTarget(vendor.textedit, {name: 'cua-scene', match: 'prefix', role: 'AXWindow'}), 0);
  assert.equal(text.findTarget(vendor.textedit, {value: 'cua scene document', match: 'prefix', role: 'AXTextArea'}), 2);
  assert.equal(text.findTarget(vendor.textedit, {name: 'Styles', match: 'exact'}), null, 'a name the vendor does not expose is a miss');
  assert.equal(text.findTarget(vendor.textedit, {subrole: 'AXCloseButton'}), 45);
  assert.equal(text.findTarget(vendor.chrome, {subrole: 'AXMinimizeButton'}), 49);
  assert.equal(text.findTarget(vendor.finder, {subrole: 'AXCloseButton'}), 235);
  assert.equal(text.findTarget(vendor.textedit, {orientation: 'AXVerticalOrientation', role: 'AXScrollBar'}), null, 'two scroll bars, no orientation in the text: a miss');
  assert.equal(text.findTarget(vendor.finder, {name: 'scene-file-002', match: 'exact'}), 18);
});

test('the titled share and the ID count are read alike on both engines\' text', () => {
  for (const scene of ['textedit', 'finder', 'chrome', 'electron']) {
    const v = text.namedLines(vendor[scene]), c = text.namedLines(cuaText[scene]);
    assert.ok(v.lines > 0 && v.named <= v.lines, scene);
    assert.equal(v.unclassified, 0, `${scene}: ${JSON.stringify(v.unclassifiedSamples)}`);
    assert.deepEqual(c, v, `${scene}: the goldens add no line, so the measure is equal`);
  }
  const e = text.namedLines(vendor.electron);
  // Electron: every line but the two containers without a title, the menu bar, close and minimize buttons is named.
  assert.equal(e.lines, 25);
  assert.equal(text.idCount(vendor.finder), 2);
  assert.equal(text.idCount(vendor.textedit), 1);
  assert.equal(text.idCount(vendor.electron), 0);
});

test('every helper is self-contained, so a cell embeds it by its source', () => {
  const source = text.EMBEDDED;
  for (const name of ['elementLines', 'lineOfIndex', 'parentIndexOf', 'indexOfPart', 'indexOfId', 'valueOfIndex', 'focusedIndexOf', 'selectedTextOf', 'selectedIndexesOf',
    'rowIndexOfName', 'showingOf', 'scrollBarValueBeside', 'findTarget', 'namedLines', 'idCount', 'indexOfTarget', 'windowTitleOf'])
    assert.match(source, new RegExp(`function ${name}\\b|const ${name} =`), name);
  const run = new Function(`${source}\nreturn {focusedIndexOf, rowIndexOfName};`)();
  assert.equal(run.focusedIndexOf(vendor.electron), 5);
  assert.equal(run.rowIndexOfName(vendor.finder, 'scene-file-003'), 25);
});

test('sha256Hex is SHA-256 of the UTF-8, as the focus probe hashes a value, and runs embedded in a cell', async () => {
  const {createHash} = await import('node:crypto');
  const strings = ['', 'qz', 'The quick brown fox jumps over the lazy dog.', '한글 테스트 😀', 'ㄱㄴㄷ', 'é', '日本語', '줄1\n줄2', 'x'.repeat(1000), '😀'.repeat(70)];
  for (const s of strings) assert.equal(text.sha256Hex(s), createHash('sha256').update(s, 'utf8').digest('hex'), JSON.stringify(s.slice(0, 20)));
  // A lone surrogate is UTF-8 encoded as U+FFFD, as TextEncoder and Swift's String do.
  assert.equal(text.sha256Hex('\ud83d'), createHash('sha256').update('�', 'utf8').digest('hex'));
  const embedded = new Function(`${text.EMBEDDED}\nreturn sha256Hex;`)();
  assert.equal(embedded('한글'), text.sha256Hex('한글'));
});

test('a field\'s selection evidence is lengths and SHA-256 hashes only, with what changed since the prepare\'s reading', async () => {
  const {createHash} = await import('node:crypto');
  const sha = s => createHash('sha256').update(s, 'utf8').digest('hex');
  // The Electron golden's text field (index 5) given a value, and a selection in the renderer's trailer.
  const tree = vendor.electron.split('\n\nThe focused UI element')[0];
  const field = (value, selected = null) => `${tree.replace(/^(\t+5 [^\n]*)$/m, `$1, Value: ${value}`)}${selected === null ? '' : `\n\nSelected text: \`\`\`\n${selected}\n\`\`\``}`;
  const before = text.fieldReading(field('alpha **bold** two', 'two'), 5);
  assert.deepEqual(before, {value: 'alpha bold two', selected: 'two'}, 'the reading is plain, as the checks compare');
  // Nothing happened: the same selection and value.
  assert.deepEqual(text.selectionEvidence(field('alpha **bold** two', 'two'), 5, before),
    {selectedLength: 3, selectedHash: sha('two'), valueLength: 14, valueHash: sha('alpha bold two'), valueChanged: false, selectionChanged: false});
  // A partial selection, an insertion, no selection at all.
  assert.deepEqual(text.selectionEvidence(field('alpha bold two', 'alpha bold'), 5, before), {selectedLength: 10, selectedHash: sha('alpha bold'), valueLength: 14,
    valueHash: sha('alpha bold two'), valueChanged: false, selectionChanged: true});
  const inserted = text.selectionEvidence(field('alpha bold twoa'), 5, before);
  assert.deepEqual(inserted, {selectedLength: null, selectedHash: null, valueLength: 15, valueHash: sha('alpha bold twoa'), valueChanged: true, selectionChanged: true});
  // Without the prepare's reading nothing is said about change; no raw text ever.
  const unknown = text.selectionEvidence(field('alpha bold two', 'two'), 5);
  assert.deepEqual([unknown.valueChanged, unknown.selectionChanged], [null, null]);
  assert.doesNotMatch(JSON.stringify([inserted, unknown]), /alpha|two/);
  // Embedded in a cell, as the checks run it.
  const embedded = new Function(`${text.EMBEDDED}\nreturn {fieldReading, selectionEvidence};`)();
  assert.deepEqual(embedded.selectionEvidence(field('alpha bold twoa'), 5, before), inserted);
});

test('#526: a value cua prints with its line breaks escaped reads back with its breaks, whole', () => {
  // Ruling 1175: cua's renderer prints a value's breaks as `\n` and `\r` (any other break as `\uXXXX`) on the element's
  // one line, where the vendor prints them raw. A value with a break is a long part, so it runs to the line's end.
  const ax = 'Window: "x", App: y.\n0 standard window x\n\t1 text entry area (settable) ID: Notes, Value: one two\\nthree\\r\\nfour\\u2028five\n\t2 button OK\n';
  assert.equal(text.valueOfIndex(ax, 1, {rendering: 'cua'}), 'one two\nthree\r\nfour\u2028five');
  assert.deepEqual(text.elementLines(ax).map(l => l.index), [0, 1, 2]);
  assert.equal(text.indexOfId(ax, 'Notes'), 1);
  globalThis.__axRendering = 'cua';   // as the run's bind records it on cua's lane
  try { assert.deepEqual(text.fieldReading(ax, 1), {value: 'one two\nthree\r\nfour\u2028five', selected: null}); } finally { delete globalThis.__axRendering; }
  // A one-line value with no break keeps being read up to its first `, `.
  assert.equal(text.valueOfIndex('Window: "x", App: y.\n0 standard window x\n\t1 slider (settable, float) Help: h, Value: 3, Secondary Actions: Decrement\n', 1), '3');
});

test('#526 review 4: a multi-line value is read only as the line\'s last part; with anything after it, it is ambiguous', () => {
  const ax = line => `Window: "x", App: y.\n0 standard window x\n\t1 ${line}\n\t2 button OK\n`;
  // The last part: read whole, its breaks kept (CR and LS too).
  assert.equal(text.valueOfIndex(ax('text entry area (settable) ID: Notes, Value: one\ntwo'), 1, {rendering: 'vendor'}), 'one\ntwo');
  assert.equal(text.valueOfIndex(ax('text entry area (settable) Value: a\\rb\\u2028c'), 1, {rendering: 'cua'}), 'a\rb\u2028c');
  assert.equal(text.valueOfIndex(ax('text entry area (settable) Value: a\u2028b'), 1, {rendering: 'vendor'}), 'a\u2028b');
  // The reviewer's cases: a labelled part after it, a label that cannot follow Value (`, Rows:` inside the value), and a
  // short value followed by a bare multi-line title (the selectable row `Shared` + `Docs\nShared`): none is certain.
  for (const [rendering, line] of [['cua', 'text entry area (settable) Value: 3, Details: a\\nb'], ['vendor', 'text entry area (settable) Value: one\ntwo, Placeholder: p'],
    ['vendor', 'text entry area (settable) Value: first\nsecond, Rows: unassigned'], ['cua', 'text entry area (settable) Value: first\\nsecond, Rows: unassigned'],
    ['cua', 'row (selectable) Description: folder, Value: Shared, Docs\\nShared'], ['vendor', 'row (selectable) Description: folder, Value: Shared, Docs\nShared'],
    ['vendor', 'text entry area (settable) Value: a\rb, Details: d']]) {
    assert.deepEqual(text.valueOfIndex(ax(line), 1, {rendering}), {ambiguous: true}, `${rendering}: ${JSON.stringify(line)}`);
  }
  assert.deepEqual(text.fieldReading(ax('text entry area (settable) Value: 3, Details: a\nb'), 1), {value: null, ambiguous: true, selected: null});
  assert.equal('valueMatches' in text, false, 'no helper a cell does not use');
});

test('#526 review 4: an ambiguous value is never equal or unchanged: selectionEvidence, the cells\' plain and a watch\'s key', async () => {
  const ax = value => `Window: "x", App: y.\n0 standard window x\n\t1 text entry area (settable) Value: ${value}, Details: d\n`;
  // A real edit made while the value reads ambiguously, before and after: its change is undetermined, not false.
  const before = text.fieldReading(ax('one\\ntwo'), 1, {rendering: 'cua'});
  globalThis.__axRendering = 'cua';
  try {
    const evidence = text.selectionEvidence(ax('one\\nTWO'), 1, text.fieldReading(ax('one\\ntwo'), 1));
    assert.equal(evidence.valueChanged, null);
    assert.equal(evidence.valueAmbiguous, true);
    assert.equal(text.selectionEvidence(ax('one\\ntwo'), 1, before).valueChanged, null, 'even reading the same text');
  } finally { delete globalThis.__axRendering; }
  // A watch over such a value has no key, so a refusal's "unchanged" cannot hold.
  assert.equal(text.readingKey(['x', {ambiguous: true}]), null);
  assert.equal(text.readingKey(['x', '1']), JSON.stringify(['x', '1']));
  // The cells' plain refuses an ambiguous reading, so TextEdit's click check (plain(after) === __m.before) fails
  // visibly rather than comparing "[object Object]" with itself.
  const {prelude} = await import('../../scripts/native-matrix/matrix-cells.mjs');
  const source = prelude(null);
  const plain = new Function(`${/class AmbiguousReadback [^\n]*/.exec(source)[0]}\n${/const plain = [^\n]*/.exec(source)[0]}\nreturn plain;`)();
  assert.throws(() => plain({ambiguous: true}), error => error.name === 'AmbiguousReadback' && /^ambiguousReadback: .*cannot be read/.test(error.message));
  assert.equal(plain('**a**'), 'a');
});

test('#526 review 5: only cua\'s rendering is decoded; the vendor\'s backslashes stay, and cua\'s can be read as printed', () => {
  const ax = line => `Window: "x", App: y.\n0 standard window x\n\t1 text field (settable) ${line}\n`;
  for (const rendering of ['vendor', undefined]) assert.equal(text.valueOfIndex(ax('Value: C:\\new\\rate\nnext'), 1, {rendering}), 'C:\\new\\rate\nnext');
  assert.equal(text.valueOfIndex(ax('Value: C:\\new'), 1), 'C:\\new', 'no lane recorded: as printed');
  // On cua's lane a literal backslash-n and a break print alike (#555): read as printed, compare at the rendered form.
  const printed = text.valueOfIndex(ax('Value: x\\ny'), 1, {rendering: 'cua', decoded: false});
  assert.equal(printed, 'x\\ny');
  assert.equal(text.renderedAs('x\ny', 'cua'), printed);
  assert.equal(text.renderedAs('x\ny', 'vendor'), 'x\ny');
});

test('#552 (ruling 1177): the selected text is read inside a fence of any length from three', () => {
  const ax = fence => `Window: "x", App: y.\n0 standard window x\n\t1 text entry area (settable) v\n\nSelected text: ${fence}\na\n\`\`\`\n[99] b\n${fence}\n\nnote`;
  assert.equal(text.selectedTextOf(ax('````')), 'a\n```\n[99] b');
  assert.equal(text.selectedTextOf('Window: "x", App: y.\n0 w\n\nSelected text: ```\nplain\n```\n\nnote'), 'plain');
  assert.equal(text.focusReading(ax('`````'), 1), 'masked');
});

test('#526: a value without a line break reads as before #526, ending at its first ", ", on either lane', () => {
  const ax = line => `Window: "x", App: y.\n0 standard window x\n\t1 ${line}\n\t2 button OK\n`;
  for (const rendering of ['vendor', 'cua', undefined]) {
    assert.equal(text.valueOfIndex(ax('text field (settable) Value: x, Placeholder: p'), 1, {rendering}), 'x');
    assert.equal(text.valueOfIndex(ax('color well Description: text color, Help: Click to choose the text color, Value: rgb 0 0 0 1, Secondary Actions: Show color panel'), 1, {rendering}), 'rgb 0 0 0 1');
    assert.equal(text.valueOfIndex(ax('text field (settable) Value: second, Rows: unassigned'), 1, {rendering}), 'second');
    assert.equal(text.valueOfIndex(ax('text field (settable) Value: one, two'), 1, {rendering}), 'one');
    assert.equal(text.valueOfIndex(ax('text field (settable) Value: 3, Details: d'), 1, {rendering}), '3');
  }
  assert.deepEqual(text.fieldReading(ax('text field (settable) Value: 3, Details: d'), 1), {value: '3', selected: null});
});
