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
  for (const ax of [vendor.textedit, cuaText.textedit]) {
    const area = text.indexOfPart(ax, 'ID', 'First Text View');
    assert.equal(area, 2);
    const value = text.valueOfIndex(ax, area);
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
  for (const name of ['elementLines', 'lineOfIndex', 'parentIndexOf', 'indexOfPart', 'valueOfIndex', 'focusedIndexOf', 'selectedTextOf', 'selectedIndexesOf',
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
