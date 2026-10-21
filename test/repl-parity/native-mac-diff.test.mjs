// The native-mac suite's diff (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system part
// 3 and part 7's settle cell; Acceptance 6): the two lanes' accessibility texts on the scenes compared modulo index
// renumbering by the renderer goldens' comparator, every difference either declared in
// scripts/repl-parity/expected/native-mac.json or counted in the `summary` line. The lanes here are the goldens' own
// recordings (one sitting on the mini), so the declared file is checked against real vendor and cua texts.
import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkPair, diffNativeMac, isSettled, loadNativeMacRun, summaryLine, validateDeclarations, EXPECTED_FILE} from '../../scripts/repl-parity/native-mac-diff.mjs';
import {laneTexts, settledAfter, writeRun} from './native-mac-fixtures.mjs';

const scratches = [];
after(() => { for (const dir of scratches) fs.rmSync(dir, {recursive: true, force: true}); });
const scratch = () => { const dir = fs.mkdtempSync(join(tmpdir(), 'cua-native-mac-diff-')); scratches.push(dir); return dir; };
const EXPECTED = JSON.parse(fs.readFileSync(EXPECTED_FILE, 'utf8'));
const declarations = validateDeclarations(EXPECTED);
const pair = ({vendor = {}, cua = {}} = {}) => {
  const root = scratch();
  return [loadNativeMacRun(writeRun(join(root, 'vendor'), {engine: 'vendor', ...vendor})), loadNativeMacRun(writeRun(join(root, 'cua'), {engine: 'cua', ...cua}))];
};

test('the goldens\' two lanes differ only as native-mac.json declares: summary 0 unexpected differences', () => {
  const report = diffNativeMac(...pair(), {declarations});
  assert.deepEqual(report.differences, []);
  assert.equal(report.ok, true);
  assert.equal(report.summary, '0 unexpected differences');
  assert.equal(summaryLine(report), 'summary: 0 unexpected differences');
  // The declared list names what was applied where: Finder's capped count on its two trees, TextEdit's diff scene state.
  assert.deepEqual(report.declared.map(d => `${d.scene}/${d.golden}/${d.kind}`).sort(),
    ['finder/before/subsetCount', 'finder/full/subsetCount', 'textedit/diff/header', 'textedit/diff/missing', 'textedit/diff/missing'].sort());
  for (const scene of ['textedit', 'finder', 'chrome', 'electron']) assert.deepEqual(report.scenes[scene].settle, {vendor: true, cua: true});
  // The JSON's last key is the summary, so the report ends with it.
  assert.equal(Object.keys(report).at(-1), 'summary');
});

test('every declaration in native-mac.json is needed: without it the goldens\' lanes differ', () => {
  for (const rule of declarations) {
    const report = diffNativeMac(...pair(), {declarations: declarations.filter(each => each !== rule)});
    assert.notEqual(report.differences.length, 0, `${rule.scene} ${rule.kind} is declared but changes nothing`);
  }
});

// Indexes are renumbered where cua's tree has a line the vendor's lacks: every later element line, the focused-element
// trailer and a diff's `Removed element IDs:` range follow the matched lines, not the numbers.
// A line inserted after the element `index`: at a fresh index (as a lineage's numbering gives an element that is new to
// it), or `shift`ing every later index by one (as a fresh numbering does).
const insertAfter = (text, index, line, {shift = false} = {}) => {
  const lines = text.split('\n'), at = lines.findIndex(l => new RegExp(`^\\t*${index} `).test(l));
  const shifted = !shift ? lines : lines.map((l, i) => (i <= at ? l : l.replace(/^(\t*)(\d+) /, (_, tabs, n) => `${tabs}${Number(n) + 1} `)
    .replace(/^(The focused UI element is )(\d+) /, (_, head, n) => `${head}${Number(n) + 1} `)));
  shifted.splice(at + 1, 0, line);
  return shifted.join('\n');
};

test('a declared added line: at a fresh index the only difference; shifting the later indexes, every shifted line in plain view', () => {
  const added = {scene: 'electron', golden: 'full', kind: 'added', fault: 'departure', head: 'button Extra control | ', decisionLog: '- Decision (2026-10-18, verification call at authoring)', cause: 'test'};
  const withAdded = validateDeclarations({declarations: [...EXPECTED.declarations, added]});
  const fresh = laneTexts('cua');
  fresh.electron.full = insertAfter(fresh.electron.full, 3, '\t\t\t900 button Extra control');
  const undeclared = diffNativeMac(...pair({cua: {texts: fresh}}), {declarations});
  assert.deepEqual(undeclared.differences.map(d => [d.scene, d.golden, d.kind]), [['electron', 'full', 'added']]);
  assert.equal(undeclared.summary, '1 unexpected differences');
  assert.deepEqual(diffNativeMac(...pair({cua: {texts: fresh}}), {declarations: withAdded}).differences, []);
  // The same line in a fresh numbering shifts every later index: no index is renumbered away (a value's line could be
  // one), so each shifted line, and the trailer naming one, is a difference.
  const shifted = laneTexts('cua');
  shifted.electron.full = insertAfter(shifted.electron.full, 3, '\t\t\t4 button Extra control', {shift: true});
  const report = diffNativeMac(...pair({cua: {texts: shifted}}), {declarations: withAdded});
  assert.ok(report.differences.length > 2, report.summary);
  assert.ok(report.differences.every(d => d.scene === 'electron' && d.golden === 'full'));
  assert.ok(report.differences.some(d => d.kind === 'trailer'));
});

test('the 10% rule: a golden adding more than a tenth of its lines needs a declaration citing a Decision Log entry', () => {
  const texts = laneTexts('cua');
  const extra = Array.from({length: 4}, (_, n) => `\t\t\t${900 + n} button Extra ${n}`);
  for (const line of [...extra].reverse()) texts.electron.full = insertAfter(texts.electron.full, 3, line);
  const added = extra.map((_, n) => ({scene: 'electron', golden: 'full', kind: 'added', fault: 'departure', head: `button Extra ${n} | `, decisionLog: '- Decision (2026-10-18, verification call at authoring)', cause: 'test'}));
  const over = diffNativeMac(...pair({cua: {texts}}), {declarations: validateDeclarations({declarations: [...EXPECTED.declarations, ...added]})});
  assert.deepEqual(over.differences.map(d => [d.scene, d.golden, d.kind]), [['electron', 'full', 'addedOverTenPercent']]);
  const allowed = {scene: 'electron', golden: 'full', kind: 'addedOverTenPercent', fault: 'departure', decisionLog: '- Decision (2026-10-18, verification call at authoring)', cause: 'test'};
  assert.deepEqual(diffNativeMac(...pair({cua: {texts}}), {declarations: validateDeclarations({declarations: [...EXPECTED.declarations, ...added, allowed]})}).differences, []);
});

test('the settle cell is scored on both engines: a lane whose observation moved two seconds after its action is a difference until declared', () => {
  const moved = laneTexts('cua');
  moved.chrome.later = moved.chrome.diff;
  assert.equal(isSettled(moved.chrome.diff, moved.chrome.later), false);
  assert.equal(isSettled(laneTexts('cua').chrome.diff, laneTexts('cua').chrome.later), true);
  const report = diffNativeMac(...pair({cua: {texts: moved}}), {declarations});
  assert.deepEqual(report.scenes.chrome.settle, {vendor: true, cua: false});
  assert.deepEqual(report.differences.map(d => [d.scene, d.golden, d.kind, d.lane]), [['chrome', 'settle', 'settle', 'cua']]);
  // The vendor's unsettled scene is scored too: a difference in cua's favour is declared, never absorbed.
  const vendorMoved = laneTexts('vendor');
  vendorMoved.electron.later = vendorMoved.electron.diff;
  const vendorReport = diffNativeMac(...pair({vendor: {texts: vendorMoved}}), {declarations});
  assert.deepEqual(vendorReport.differences.map(d => [d.scene, d.kind, d.lane]), [['electron', 'settle', 'vendor']]);
  const declared = {scene: 'electron', golden: 'settle', kind: 'settle', lane: 'vendor', fault: 'vendor', cause: 'test'};
  assert.deepEqual(diffNativeMac(...pair({vendor: {texts: vendorMoved}}), {declarations: validateDeclarations({declarations: [...EXPECTED.declarations, declared]})}).differences, []);
  // A settle declaration nothing needed is itself a difference.
  const unneeded = diffNativeMac(...pair(), {declarations: validateDeclarations({declarations: [...EXPECTED.declarations, declared]})});
  assert.deepEqual(unneeded.differences.map(d => [d.scene, d.kind, d.rule]), [['electron', 'overdeclared', 'settle']]);
});

test('settled is the same observation, its trailer included: a focus or selection that moved in the two seconds is not settled', () => {
  const lane = laneTexts('cua');
  const {diff, later} = lane.chrome;
  assert.match(later, /^There has been no change[^\n]*\nThe focused UI element is 25 /);
  assert.equal(isSettled(diff, later), true);
  // The tree did not change, the focus did: the renderer's no-change sentence carries the new trailer.
  const focusMoved = later.replace('The focused UI element is 25 체크박스 Scene option, Value: 1', 'The focused UI element is 22 텍스트 엔트리 영역 (settable) Scene notes');
  assert.notEqual(focusMoved, later);
  assert.equal(isSettled(diff, focusMoved), false);
  assert.equal(isSettled(diff, later.replace(/\nThe focused UI element is[^]*$/, '')), false, 'a trailer gone');
  assert.equal(isSettled(diff, later.replace('Window: "cua scene page"', 'Window: "another"')), false, 'another window');
  const selected = text => `${later.split('\n')[0]}\nSelected text: \`\`\`\n${text}\n\`\`\`\n\nNote: the note.`;
  assert.equal(isSettled(selected('abc'), selected('abc')), true);
  assert.equal(isSettled(selected('abc'), selected('abd')), false, 'the selection moved');
  const report = diffNativeMac(...pair({cua: {texts: {...lane, chrome: {...lane.chrome, later: focusMoved}}}}), {declarations});
  assert.deepEqual(report.differences.map(d => [d.scene, d.golden, d.kind, d.lane]), [['chrome', 'settle', 'settle', 'cua']]);
});

test('the observation right after the action is compared in the form it came in: a full tree (the diff over budget) line by line', () => {
  // Both lanes answered the full tree (the renderer's fallback): compared as trees, modulo renumbering.
  const asFull = engine => { const lane = laneTexts(engine); const diff = lane.chrome.before; return {...lane, chrome: {...lane.chrome, diff, later: settledAfter(diff, lane.chrome.full)}}; };
  const vendor = asFull('vendor'), cua = asFull('cua');
  assert.deepEqual(diffNativeMac(...pair({vendor: {texts: vendor}, cua: {texts: cua}}), {declarations}).differences, []);
  // A value that differs in the two full trees is a difference, never dropped.
  const changed = {...cua, chrome: {...cua.chrome, diff: cua.chrome.diff.replace('Scene option, Value: 0', 'Scene option, Value: 1')}};
  assert.notEqual(changed.chrome.diff, cua.chrome.diff);
  changed.chrome.later = settledAfter(changed.chrome.diff, cua.chrome.full);
  const report = diffNativeMac(...pair({vendor: {texts: vendor}, cua: {texts: changed}}), {declarations});
  assert.deepEqual(report.differences.map(d => [d.scene, d.golden, d.kind]), [['chrome', 'diff', 'text']]);
  // One lane's full tree against the other's diff is a difference of form, not compared line by line.
  const mixed = diffNativeMac(...pair({cua: {texts: cua}}), {declarations});
  assert.deepEqual(mixed.differences.map(d => [d.scene, d.golden, d.kind, d.vendor, d.cua]), [['chrome', 'diff', 'form', 'diff', 'full']]);
});

test('numeric lines inside a multi-line value are compared with their numbers, never renumbered away', () => {
  // TextEdit's document is the text entry area's value, its lines raw continuation lines (textedit/vendor.txt).
  const document = (texts, first, second) => { texts.textedit.full = texts.textedit.full.replace('\nLine 01\nLine 02\n', `\n${first}\n${second}\n`); return texts; };
  assert.match(laneTexts('vendor').textedit.full, /\nLine 01\nLine 02\n/);
  const judge = (vendor, cua, options = {declarations}) => diffNativeMac(...pair({vendor: {texts: vendor}, cua: {texts: cua}}), options);
  // The tree's indexes unchanged, one number in the value changed.
  const changed = judge(document(laneTexts('vendor'), '200 apples', '999 oranges'), document(laneTexts('cua'), '300 apples', '999 oranges'));
  assert.notEqual(changed.summary, '0 unexpected differences');
  assert.ok(changed.differences.every(d => d.scene === 'textedit' && d.golden === 'full'));
  assert.equal(judge(document(laneTexts('vendor'), '200 apples', '999 oranges'), document(laneTexts('cua'), '200 apples', '999 oranges')).summary, '0 unexpected differences');
  // The digits as printed: a leading zero, or a number beyond the safe integers, is another text.
  for (const [vendorLine, cuaLine] of [['200 apples', '0200 apples'], ['9007199254740992 apples', '9007199254740993 apples']]) {
    const report = judge(document(laneTexts('vendor'), vendorLine, '999 oranges'), document(laneTexts('cua'), cuaLine, '999 oranges'));
    assert.notEqual(report.summary, '0 unexpected differences', `${vendorLine} against ${cuaLine}`);
  }
  // A declared added control shifting the later indexes by one, the value's number one more on cua's side: never equal.
  const added = {scene: 'textedit', golden: 'full', kind: 'added', fault: 'departure', head: 'button Extra control | ', decisionLog: '- Decision (2026-10-18, verification call at authoring)', cause: 'test'};
  const cua = laneTexts('cua');
  cua.textedit.full = insertAfter(cua.textedit.full, 1, '\t\t2 button Extra control', {shift: true});
  document(cua, '201 apples', '999 oranges');
  const shifted = judge(document(laneTexts('vendor'), '200 apples', '999 oranges'), cua, {declarations: validateDeclarations({declarations: [...EXPECTED.declarations, added]})});
  assert.ok(shifted.differences.some(d => JSON.stringify(d).includes('apples')), JSON.stringify(shifted.differences.map(d => d.kind)));
});

test('a cell one lane did not answer is a difference, and the goldens it feeds are not compared', () => {
  const texts = laneTexts('cua');
  delete texts.finder.before; delete texts.finder.diff; delete texts.finder.later;
  const report = diffNativeMac(...pair({cua: {texts}}), {declarations});
  assert.deepEqual(report.differences.map(d => [d.scene, d.golden, d.kind]), [['finder', 'before', 'cell'], ['finder', 'diff', 'cell'], ['finder', 'settle', 'cell']]);
  assert.equal(report.differences[0].cua.error, 'the engine refused the click');
});

test('checkPair: one sitting, one checkout, one approved engine, the vendor-engine run first; a same-engine pair takes no declarations', () => {
  const root = scratch();
  const run = (name, engine, meta) => loadNativeMacRun(writeRun(join(root, name), {engine, meta}));
  const vendor = run('v', 'vendor'), cua = run('c', 'cua');
  assert.doesNotThrow(() => checkPair(vendor, cua, {declarations}));
  assert.throws(() => checkPair(cua, vendor, {declarations}), /vendor-engine run first/);
  assert.throws(() => checkPair(vendor, run('v2', 'vendor'), {declarations}), /same-engine/);
  assert.doesNotThrow(() => checkPair(vendor, run('v3', 'vendor'), {declarations: []}));
  assert.throws(() => checkPair(vendor, run('c2', 'cua', {complete: false}), {declarations}), /incomplete/);
  assert.throws(() => checkPair(vendor, run('c3', 'cua', {approved: {build: 'e'.repeat(64), engineVersion: '0.1.0'}}), {declarations}), /approved engine/);
  assert.throws(() => checkPair(vendor, run('c4', 'cua', {commit: 'f'.repeat(40)}), {declarations}), /commit/);
  assert.throws(() => checkPair(vendor, run('c5', 'cua', {harness: {commit: 'f'.repeat(40), dirty: false}}), {declarations}), /cells/);
  assert.throws(() => checkPair(vendor, run('c6', 'cua', {suite: 'native'}), {declarations}), /native-mac/);
});

test('loadNativeMacRun refuses a text that is not the one its row hashed', () => {
  const dir = writeRun(join(scratch(), 'cua'), {engine: 'cua'});
  fs.appendFileSync(join(dir, 'texts', 'textedit', 'full.txt'), 'x');
  assert.throws(() => loadNativeMacRun(dir).text('textedit', 'full'), /not the text its row hashed/);
});

test('validateDeclarations: the vendor-defects style, each kind with what it needs, a departure citing the Decision Log', () => {
  const base = {scene: 'textedit', golden: 'full', fault: 'vendor', cause: 'why'};
  const bad = [
    [{...base, kind: 'skyshot', correction: 'windowUrl'}, /kind/],
    [{...base, kind: 'added'}, /head/],
    [{...base, kind: 'added', head: ' | '}, /role and title/],
    [{...base, kind: 'missing', head: 'x | ', fault: 'engine'}, /fault/],
    [{...base, kind: 'missing', head: 'x | ', cause: ''}, /cause/],
    [{...base, kind: 'missing', head: 'x | ', scene: 'safari'}, /scene/],
    [{...base, kind: 'missing', head: 'x | ', golden: 'later'}, /golden/],
    [{...base, kind: 'settle', lane: 'cua'}, /settle/],
    [{...base, golden: 'settle', kind: 'settle', lane: 'both'}, /lane/],
    [{...base, kind: 'missing', head: 'x | ', fault: 'departure'}, /Decision Log/],
    [{...base, kind: 'missing', head: 'x | ', fault: 'departure', decisionLog: '- Decision (no such entry'}, /Decision Log/],
    [{...base, kind: 'missing', head: 'x | ', count: 0}, /count/],
    [{...base, kind: 'subsetCount', identifier: 'ListView'}, /cap/],
  ];
  for (const [rule, message] of bad) assert.throws(() => validateDeclarations({declarations: [rule]}), message, JSON.stringify(rule));
  assert.throws(() => validateDeclarations([]), /declarations/);
  assert.equal(validateDeclarations({declarations: [{...base, kind: 'missing', head: 'x | ', fault: 'departure', decisionLog: '- Decision (2026-10-18, verification call at authoring)'}]}).length, 1);
});

test('the CLI: diff of two native-mac runs prints the JSON report and then the summary line, exit 1 on an unexpected difference', () => {
  const root = scratch(), script = fileURLToPath(new URL('../../scripts/repl-parity.mjs', import.meta.url));
  const vendor = writeRun(join(root, 'vendor'), {engine: 'vendor'}), cua = writeRun(join(root, 'cua'), {engine: 'cua'});
  const out = execFileSync(process.execPath, [script, 'diff', vendor, cua, '--expected', EXPECTED_FILE], {encoding: 'utf8'});
  const lines = out.trim().split('\n');
  assert.equal(lines.at(-1), 'summary: 0 unexpected differences');
  assert.equal(JSON.parse(lines.slice(0, -1).join('\n')).ok, true);
  const texts = laneTexts('cua');
  texts.textedit.full = texts.textedit.full.replace('Line 07', 'Line 7');
  const changed = writeRun(join(root, 'cua2'), {engine: 'cua', texts});
  let failure;
  try { execFileSync(process.execPath, [script, 'diff', vendor, changed, '--expected', EXPECTED_FILE], {encoding: 'utf8'}); } catch (error) { failure = error; }
  assert.equal(failure?.status, 1);
  assert.equal(failure.stdout.trim().split('\n').at(-1), 'summary: 1 unexpected differences');
});
