// Render real Skyshots and run the fixture's actual cells; no engine, GUI or account store.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import * as fixture from '../scripts/accept/textedit.mjs';
import {advanceNumbering, render} from '../src/services/engine/render.mjs';

const shot = JSON.parse(readFileSync(new URL('./native-goldens/textedit/skyshot.json', import.meta.url), 'utf8'));
const docName = shot.window.title;
const marker = 'CUAMARKER0123456789AB'; // 21 characters; literals only, never generated secrets in test evidence.
const value = 'CUAUI0123456789ABCDEF0123456789ABCDEF'; // 37 characters.
const hash = text => createHash('sha256').update(text, 'utf8').digest('hex');
function state(value, markdown = null) {
  const copy = structuredClone(shot);
  Object.assign(copy.nodes.find(node => node.identifier === 'First Text View'), {value, valueMarkdown: markdown});
  return render(copy, advanceNumbering(null, copy));
}
function run(cell, ax, {initial = ax} = {}) {
  const output = [];
  let typed = false;
  const context = vm.createContext({crypto: {createHash}, app: {getAXState: () => typed ? ax : initial, typeText() { typed = true; }, pressKey() {}, getScreenshot: () => [0xff, 0xd8, 1]},
    nodeRepl: {write: text => output.push(JSON.parse(text))}});
  vm.runInContext(cell.replaceAll("await import('node:crypto')", 'crypto').replaceAll('await ', ''), context);
  return output.at(-1);
}

test('plain rendered readback proves exact equality; a successful action alone cannot', () => {
  const result = run(fixture.readbackCell(docName, marker), state(marker + value));
  assert.deepEqual(fixture.assessReadback(result, marker + value), {exact: true, representation: 'plain', chars: 58, expectedChars: 58});
  const wrong = run(fixture.readbackCell(docName, marker), state(marker + value.slice(0, -1) + 'X'));
  assert.equal(fixture.assessReadback(wrong, marker + value).exact, false, 'same length is not exact delivery');
  assert.equal(fixture.assessReadback({done: true}, marker + value).exact, false);
});

test('the real renderer reproduces 60 versus 58 from monospace Markdown; it must not pass delivery', () => {
  const expected = marker + value;
  const result = run(fixture.readbackCell(docName, marker), state(expected, '`' + expected + '`'));
  assert.equal(result.chars, 60);
  assert.equal(result.startsWithMarker, false);
  assert.deepEqual(fixture.assessReadback(result, expected), {exact: false, representation: 'monospace-markdown', chars: 60, expectedChars: 58});
  assert.equal(JSON.stringify(result).includes(value), false, 'only hash and counts leave the cell');
  assert.notEqual(result.hash, hash(expected));
});

test('marker cell retains mismatch operands without reporting text or normalizing decoration', () => {
  const result = run(fixture.markerCell(docName, marker), state(marker, '*' + marker + '*'), {initial: state('CUAFIXTURE')});
  assert.equal(result.valueIsMarker, false);
  assert.deepEqual(fixture.assessReadback(result, marker), {exact: false, representation: 'italic-markdown', chars: 23, expectedChars: 21});
  assert.equal(JSON.stringify(result).includes(marker), false);
  const plain = run(fixture.markerCell(docName, marker), state(marker), {initial: state('CUAFIXTURE')});
  assert.equal(plain.valueIsMarker, true);
  assert.equal(fixture.assessReadback(plain, marker).exact, true);
});

test('marker cell replaces the placeholder and refuses all keys in a foreign window', () => {
  for (const [own, initial] of [[true, 'CUAFIXTURE'], [false, 'CUAFIXTURE'], [true, 'other text'], [true, '`CUAFIXTURE`']]) {
    const allowed = own && initial === 'CUAFIXTURE';
    let text = initial, selected = false;
    const calls = [], output = [];
    const context = vm.createContext({crypto: {createHash}, app: {
      getAXState: () => own ? state(text) : 'Window: "foreign.rtf"',
      pressKey(key) { calls.push(key); selected = key === 'super+a'; },
      typeText(value) { calls.push('typeText'); text = selected ? value : text + value; },
      getScreenshot: () => [0xff, 0xd8, 1],
    }, nodeRepl: {write: value => output.push(JSON.parse(value))}});
    vm.runInContext(fixture.markerCell(docName, marker).replaceAll("await import('node:crypto')", 'crypto').replaceAll('await ', ''), context);
    assert.deepEqual(calls, allowed ? ['super+a', 'typeText'] : []);
    assert.equal(text, allowed ? marker : initial);
    if (allowed) assert.equal(fixture.assessReadback(output.at(-1), marker).exact, true);
    else if (!own) assert.equal(output.at(-1).identityLost, true);
    else assert.equal(output.at(-1).initialValueMismatch, true);
  }
});

test('missing Value and foreign identity cannot be mistaken for an exact empty readback', () => {
  for (const result of [run(fixture.readbackCell(docName, marker), state('')), {own: false, hash: hash(''), chars: 0, valueFound: true}]) {
    assert.equal(fixture.assessReadback(result, '').exact, false);
  }
});

test('the owned RTF seeds a distinct placeholder with proportional undecorated style', {skip: process.platform !== 'darwin'}, t => {
  const home = mkdtempSync(join(tmpdir(), 'cua-textedit-document-'));
  t.after(() => rmSync(home, {recursive: true, force: true}));
  const doc = fixture.createFixtureDocument(home);
  assert.equal(doc.name.endsWith('.rtf'), true);
  assert.equal(doc.path.startsWith(doc.dir + '/'), true);
  const source = readFileSync(doc.path);
  // textutil parses RTF offscreen; it neither opens TextEdit nor touches preferences or TCC.
  const text = execFileSync('/usr/bin/textutil', ['-convert', 'txt', '-stdout', '-stdin', '-format', 'rtf'], {input: source, encoding: 'utf8'});
  assert.equal(text, 'CUAFIXTURE');
  assert.equal(fixture.assessReadback(run(fixture.markerCell(docName, marker), state(text)), marker).exact, false,
    'a no-op typing action leaving the placeholder must fail');
  const html = execFileSync('/usr/bin/textutil', ['-convert', 'html', '-stdout', '-stdin', '-format', 'rtf'], {input: source, encoding: 'utf8'});
  assert.match(html, /Helvetica/);
  assert.doesNotMatch(html, /font-weight: bold|font-style: italic|font-family:.*(?:Menlo|Monaco|Courier)/);
});
