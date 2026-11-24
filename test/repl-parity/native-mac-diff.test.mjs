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
import {APPROVED, ATTESTED, laneTexts, lanesMeta, settledAfter, writeRun} from './native-mac-fixtures.mjs';
import {NOTE} from '../../src/services/engine/render.mjs';

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
  // The declared list names what was applied where: Finder's capped count on its two trees, TextEdit's diff scene state,
  // and the lineBreaks departure where it made TextEdit's document lines equal (the text area and the focused trailer).
  assert.deepEqual(report.declared.map(d => `${d.scene}/${d.golden}/${d.kind}${d.kind === 'lineBreaks' ? `×${d.count}` : ''}`).sort(),
    ['finder/before/subsetCount', 'finder/full/subsetCount', 'textedit/diff/header', 'textedit/diff/missing', 'textedit/diff/missing',
      'textedit/full/lineBreaks×2', 'textedit/before/lineBreaks×2', 'textedit/diff/lineBreaks×1'].sort());
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
  // TextEdit's document is the text entry area's value: in the vendor's text its lines are raw continuation lines
  // (textedit/vendor.txt), in cua's they are escaped on the element's one line (#526, ruling 1175).
  const document = (texts, first, second) => {
    const full = texts.textedit.full;
    texts.textedit.full = full.includes('\nLine 01\nLine 02\n') ? full.replace('\nLine 01\nLine 02\n', `\n${first}\n${second}\n`)
      : full.replace('\\nLine 01\\nLine 02\\n', `\\n${first}\\n${second}\\n`);
    return texts;
  };
  assert.match(laneTexts('vendor').textedit.full, /\nLine 01\nLine 02\n/);
  assert.match(laneTexts('cua').textedit.full, /\\nLine 01\\nLine 02\\n/);
  const judge = (vendor, cua, options = {declarations}) => diffNativeMac(...pair({vendor: {texts: vendor}, cua: {texts: cua}}), options);
  // The tree's indexes unchanged, one number in the value changed.
  const changed = judge(document(laneTexts('vendor'), '200 apples', '999 oranges'), document(laneTexts('cua'), '300 apples', '999 oranges'));
  assert.notEqual(changed.summary, '0 unexpected differences');
  assert.ok(changed.differences.every(d => d.scene === 'textedit' && d.golden === 'full'));
  assert.equal(judge(document(laneTexts('vendor'), 'apples 200', 'oranges 999'), document(laneTexts('cua'), 'apples 200', 'oranges 999')).summary, '0 unexpected differences');
  // The same value whose lines start with a number: in the vendor's text those raw lines read as element lines that
  // cua's escaped one lacks, so the comparison shows them (fail-closed), never hides them.
  const same = judge(document(laneTexts('vendor'), '200 apples', '999 oranges'), document(laneTexts('cua'), '200 apples', '999 oranges'));
  assert.deepEqual(same.differences.map(d => `${d.kind} ${d.index ?? ''}`.trim()), ['missing 200', 'missing 999', 'text']);
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

test('a lane read without the Electron fixture\'s page is a difference: the side reads\' page check never hides it', () => {
  // Hold 2b's cua lane: the window's second container empty, the page's thirteen lines absent.
  const empty = fs.readFileSync(new URL('../../docs/doperpowers/research/2026-10-18-own-native-engine/m2b/hold2b/native-mac/cua/texts/electron/full.txt', import.meta.url), 'utf8');
  const texts = laneTexts('cua');
  texts.electron.full = empty;
  const report = diffNativeMac(...pair({cua: {texts}}), {declarations});
  const electron = report.differences.filter(d => d.scene === 'electron' && d.golden === 'full');
  assert.ok(electron.some(d => d.kind === 'missing'), 'the page\'s lines are missing on the cua lane');
  assert.equal(report.ok, false);
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
  // Ruling 1149: a run calling itself complete is still refused unless its attestations prove its engine: the cua lane
  // answered by the vendor's (state 1), none kept, results left unattested, another build.
  const proof = (name, engineAttestation) => run(name, 'cua', {engineAttestation});
  assert.throws(() => checkPair(vendor, proof('u1', {attested: [ATTESTED.vendor], unattested: 0}), {declarations}), /u1's lane is unproven: the cua side attested the vendor engine.*\(state 1\)/);
  assert.throws(() => checkPair(vendor, proof('u2', {attested: [ATTESTED.cua, ATTESTED.vendor], unattested: 0}), {declarations}), /unproven: .*state 1/);
  assert.throws(() => checkPair(vendor, proof('u3', undefined), {declarations}), /u3's lane is unproven: it keeps no engine attestation/);
  assert.throws(() => checkPair(vendor, proof('u4', {attested: [ATTESTED.cua], unattested: 1}), {declarations}), /unproven: 1 js result\(s\) carry no cua\/nativeEngine attestation/);
  assert.throws(() => checkPair(vendor, proof('u5', {attested: [{...ATTESTED.cua, build: 'e'.repeat(64)}], unattested: 0}), {declarations}), /unproven: the result attested .*build e{64}/);
  assert.throws(() => checkPair(run('u6', 'vendor', {engineAttestation: {attested: [ATTESTED.cua], unattested: 0}}), cua, {declarations}), /u6's lane is unproven: the result attested engine cua/);
  assert.throws(() => checkPair(run('u7', 'vendor', {engineAttestation: {attested: [{...ATTESTED.vendor, build: '26.1.0'}], unattested: 0}}), cua, {declarations}), /u7's lane is unproven/);
  // An identity the run does not name proves nothing, even when the attestation leaves it out too.
  const bare = {engine: 'cua', version: APPROVED.engineVersion};
  assert.throws(() => checkPair(vendor, run('u8', 'cua', {checkoutBuild: undefined, engineAttestation: {attested: [bare], unattested: 0}}), {declarations}), /u8's lane is unproven: it names no checkout build/);
  assert.throws(() => checkPair(vendor, run('u9', 'cua', {approved: {...APPROVED, engineVersion: ''}, engineAttestation: {attested: [{...ATTESTED.cua, version: ''}], unattested: 0}}), {declarations}), /u9's lane is unproven: it names no approved engine version/);
  assert.throws(() => checkPair(run('u10', 'vendor', {runtimeRelease: undefined, engineAttestation: {attested: [{engine: 'vendor'}], unattested: 0}}), cua, {declarations}), /u10's lane is unproven: it names no runtime release/);
  assert.throws(() => checkPair(vendor, run('c3', 'cua', {approved: {build: 'e'.repeat(64), engineVersion: '0.1.0'}}), {declarations}), /approved engine/);
  assert.throws(() => checkPair(vendor, run('c4', 'cua', {commit: 'f'.repeat(40)}), {declarations}), /commit/);
  assert.throws(() => checkPair(vendor, run('c5', 'cua', {harness: {commit: 'f'.repeat(40), dirty: false}}), {declarations}), /cells/);
  assert.throws(() => checkPair(vendor, run('c6', 'cua', {suite: 'native'}), {declarations}), /native-mac/);
  // Two holds with the same software, or a run naming none, are not one sitting.
  assert.throws(() => checkPair(vendor, run('c7', 'cua', {sitting: 'hold-2c'}), {declarations}), /two holds \(hold-2b, hold-2c\)/);
  assert.throws(() => checkPair(vendor, run('c8', 'cua', {sitting: undefined}), {declarations}), /names no hold/);
  assert.throws(() => checkPair(run('v4', 'vendor', {sitting: ''}), run('c9', 'cua', {sitting: ''}), {declarations}), /names no hold/);
});

test('checkPair on a hosted runner: both lanes are one job\'s run, each attested by its device (T10b′ part 2)', () => {
  const root = scratch();
  const run = (name, engine, meta) => loadNativeMacRun(writeRun(join(root, name), {engine, meta}));
  const runner = id => ({hosted: true, runner: {kind: 'github-hosted', image: {name: 'macos26', version: '20261117.0516.1'}, run: {id, attempt: '1'}, vm: {id: 'vm-1', platformUuid: 'P', bootedAt: 'B'},
    install: {home: '/h', release: 'r'}, engine: {bundle: '/b/cua Engine.app', build: 'b', engineVersion: '0.2.0'}}});
  assert.doesNotThrow(() => checkPair(run('v', 'vendor', runner('7')), run('c', 'cua', runner('7')), {declarations}));
  assert.throws(() => checkPair(run('v2', 'vendor', runner('7')), run('c2', 'cua', runner('8')), {declarations}), /two hosted runs \(macos26 20261117\.0516\.1, run 7 attempt 1, VM vm-1; .*run 8 attempt 1, VM vm-1\): one sitting is one job's run/);
  const otherVm = {hosted: true, runner: {...runner('7').runner, vm: {id: 'vm-2', platformUuid: 'Q', bootedAt: 'B'}}};
  assert.throws(() => checkPair(run('v5', 'vendor', runner('7')), run('c5', 'cua', otherVm), {declarations}), /run 7 attempt 1, VM vm-1; .*run 7 attempt 1, VM vm-2\): one sitting is one job's run/,
    'one attempt\'s sittings are several VMs: two never pair');
  assert.throws(() => checkPair(run('v3', 'vendor', runner('7')), run('c3', 'cua', {hosted: true}), {declarations}), /records no hosted runner/);
  assert.throws(() => checkPair(run('v4', 'vendor', runner('7')), run('c4', 'cua'), {declarations}), /records no hosted runner/);
});

test('checkPair: a list-bearing scene read in two window frames is no pair; within 1 pt it is, and other scenes\' frames do not decide', () => {
  // Hold 2b's Finder list showed rows 0-19 on the cua lane against 0-18 on the vendor's, with neither frame recorded:
  // a list's visible rows follow its window's height, so two frames make an invalid pair, not a difference.
  const root = scratch();
  const lane = (name, engine, frames = {}) => {
    const base = lanesMeta(engine).scenes;
    const scenes = Object.fromEntries(Object.entries(base).map(([scene, account]) => [scene, frames[scene] === undefined ? account : {...account, frame: frames[scene]}]));
    return loadNativeMacRun(writeRun(join(root, name), {engine, meta: {scenes}}));
  };
  const finder = {x: 100, y: 80, width: 920, height: 640};
  const vendor = lane('v', 'vendor');
  assert.deepEqual(vendor.meta.scenes.finder.frame, finder, 'the fixtures\' lanes share one Finder frame');
  assert.doesNotThrow(() => checkPair(vendor, lane('c', 'cua'), {declarations}));
  assert.doesNotThrow(() => checkPair(vendor, lane('c1', 'cua', {finder: {...finder, height: finder.height + 1}}), {declarations}));
  assert.throws(() => checkPair(vendor, lane('c2', 'cua', {finder: {...finder, height: finder.height + 24}}), {declarations}),
    /finder was read in two window frames \(vendor .*height 640.*, cua .*height 664.*\)/);
  assert.throws(() => checkPair(vendor, lane('c3', 'cua', {finder: {...finder, x: finder.x + 2}}), {declarations}), /two window frames/);
  assert.throws(() => checkPair(vendor, lane('c4', 'cua', {finder: null}), {declarations}), /finder's window frame is not recorded on the cua lane/);
  assert.doesNotThrow(() => checkPair(vendor, lane('c5', 'cua', {textedit: {x: 0, y: 0, width: 300, height: 300}}), {declarations}));
  // A determinism pair is held to the same geometry.
  assert.throws(() => checkPair(vendor, lane('v2', 'vendor', {finder: {...finder, width: finder.width - 30}}), {declarations: []}), /two window frames/);
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

test('#526: validateDeclarations takes a lineBreaks departure for every scene, with no count', () => {
  const rule = {scene: '*', kind: 'lineBreaks', fault: 'departure', decisionLog: '- Decision (2026-10-18, verification call at authoring)', cause: 'why'};
  assert.equal(validateDeclarations({declarations: [rule]}).length, 1);
  assert.throws(() => validateDeclarations({declarations: [{...rule, fault: 'vendor'}]}), /lineBreaks/);
  assert.throws(() => validateDeclarations({declarations: [{...rule, count: 2}]}), /lineBreaks/);
  assert.throws(() => validateDeclarations({declarations: [{...rule, scene: 'textedit'}]}), /lineBreaks/);
});

test('#552 (ruling 1177): cua\'s longer selected-text fence is read as the trailer, settled alike, and declared against the vendor\'s three', () => {
  const lane = laneTexts('cua'), {later} = lane.chrome;
  const selected = (text, fence) => `${later.split('\n')[0]}\nSelected text: ${fence}\n${text}\n${fence}\n\n${NOTE}`;
  assert.equal(isSettled(selected('a ``` b', '````'), selected('a ``` b', '````')), true);
  assert.equal(isSettled(selected('a ``` b', '````'), selected('a ``` c', '````')), false, 'the selection moved');
  // The vendor's diff golden and cua's carrying the same selection: only the fence differs, under the departure.
  const vendorLane = laneTexts('vendor');
  const withSelection = (texts, fence) => ({...texts, chrome: {...texts.chrome, diff: `${texts.chrome.diff.split('\nThe focused UI element is')[0]}\nSelected text: ${fence}\na \`\`\` b\n${fence}\n\n${NOTE}`}});
  const report = diffNativeMac(...pair({vendor: {texts: withSelection(vendorLane, '```')}, cua: {texts: withSelection(lane, '````')}}), {declarations});
  assert.deepEqual(report.differences.filter(d => d.scene === 'chrome' && d.golden === 'diff'), []);
  const undeclared = diffNativeMac(...pair({vendor: {texts: withSelection(vendorLane, '```')}, cua: {texts: withSelection(lane, '````')}}), {declarations: declarations.filter(rule => rule.kind !== 'lineBreaks')});
  assert.deepEqual(undeclared.differences.filter(d => d.scene === 'chrome' && d.golden === 'diff').map(d => d.kind), ['trailer']);
});
