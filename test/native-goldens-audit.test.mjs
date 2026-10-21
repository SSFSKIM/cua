// The goldens' audit (test/native-goldens/audit.mjs): the step after a live re-recording (the own native engine spec,
// M1b: "the goldens' corrections expire here"), which re-renders the pinned files and reports every difference no
// declaration covers, every declaration that changes nothing, and what remains once the expiring declarations
// (faults engine, redaction, engine or renderer) are deleted. Its mechanics are judged on declarations derived from the
// committed ones or made up here, so deleting declarations in a sitting changes none of these tests but the first, which
// is the goldens' own invariant.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EXPECTED, read} from './native-goldens/goldens.mjs';
import {EXPIRING_FAULTS, addsUndeclared, audit, formatAudit, rerender} from './native-goldens/audit.mjs';

test('on the committed goldens nothing is undeclared, nothing over-declared, and every declaration is needed', () => {
  const report = audit();
  assert.deepEqual(report.goldens.flatMap(g => g.undeclared), []);
  assert.deepEqual(report.goldens.flatMap(g => g.overdeclared), []);
  assert.deepEqual(report.declarations.filter(d => !d.neededIn.length).map(d => d.index), []);
  assert.equal(report.declarations.length, EXPECTED.length);
});

test('a dropped declaration shows as the difference it covered, in each golden it was needed in', t => {
  const needed = audit().declarations.find(d => d.neededIn.length);
  if (!needed) { t.skip('no committed declaration is needed'); return; }
  const report = audit({expected: EXPECTED.filter(rule => rule !== needed.rule)});
  const where = report.goldens.filter(g => g.undeclared.length).map(g => `${g.scene}/${g.golden}`);
  for (const at of needed.neededIn) assert.ok(where.includes(at), `${at} in ${where}`);
});

test('a declaration that changes nothing is reported unneeded and over-declared', () => {
  const bogus = {scene: 'electron', golden: 'full', kind: 'part', fault: 'engine', label: 'Help', cua: 'nothing like it', vendor: 'x', cause: 'test'};
  const report = audit({expected: [...EXPECTED, bogus]});
  const entry = report.declarations.at(-1);
  assert.deepEqual(entry.neededIn, []);
  assert.equal(entry.expiring, true);
  assert.deepEqual(report.goldens.find(g => g.scene === 'electron' && g.golden === 'full').overdeclared.map(d => d.rule), ['part']);
  assert.match(formatAudit(report), /delete: \[\d+\] electron part Help: nothing like it \(engine\)/);
});

test('on a live recording a still-needed expiring declaration is an engine defect, and what it absorbed is left after deletion', () => {
  assert.deepEqual([...EXPIRING_FAULTS].sort(), ['engine', 'engine or renderer', 'redaction']);
  // Every committed declaration made expiring: whatever any of them absorbs is left once they are deleted.
  const expiring = EXPECTED.map(rule => ({...rule, fault: 'engine'}));
  const live = audit({expected: expiring, source: {kind: 'live'}});
  const text = formatAudit(live);
  for (const d of live.declarations) {
    if (d.neededIn.length) assert.match(text, new RegExp(`ENGINE DEFECT: \\[${d.index}\\] `));
    else assert.match(text, new RegExp(`delete: \\[${d.index}\\] `));
  }
  const absorbing = new Set(live.declarations.flatMap(d => d.neededIn));
  for (const g of live.afterDeletion) assert.equal(g.differences.length > 0, absorbing.has(`${g.scene}/${g.golden}`), `${g.scene}/${g.golden}`);
  // The same declarations made non-expiring are kept and leave nothing after deletion.
  const kept = audit({expected: EXPECTED.map(rule => ({...rule, fault: 'scene state'})), source: {kind: 'live'}});
  assert.doesNotMatch(formatAudit(kept), /ENGINE DEFECT/);
  assert.deepEqual(kept.afterDeletion.flatMap(g => g.differences), []);
  // On M0's captures expiring declarations still wait for the re-recording.
  assert.doesNotMatch(formatAudit(audit({expected: expiring, source: {kind: 'm0'}})), /ENGINE DEFECT/);
});

test('re-rendering the committed goldens changes no pinned file', () => {
  const rendered = rerender({write: false});
  assert.equal(rendered.length, 8);
  assert.deepEqual(rendered.filter(r => r.changed), []);
});

test('a declaration is needed only when removing it adds an undeclared difference, never when removing it only removes one', () => {
  const a = {kind: 'text', vendor: 'x', cua: 'y'}, b = {kind: 'missing', head: 'h', line: 'l'};
  assert.equal(addsUndeclared([a], [a, b]), true, 'removing it uncovers b');
  assert.equal(addsUndeclared([a, b], [a]), false, 'removing it only takes b away: it created b');
  assert.equal(addsUndeclared([a], [a]), false);
  assert.equal(addsUndeclared([a, b], [b, {...a}]), false, 'the same multiset in another order');
  assert.equal(addsUndeclared([a], [a, {...a}]), true, 'one more of the same difference');
  // Over-declared counts are not undeclared differences.
  assert.equal(addsUndeclared([], [{kind: 'overdeclared', rule: 'part', head: null, left: 1}]), false);
});

test('a correction that creates a difference (an engine fix\'s value hard-coded after the fix) is reported delete, not ENGINE DEFECT', () => {
  // TextEdit's window URL pinned to a path no recording has: the correction itself makes cua's line differ.
  const wrong = {scene: 'textedit', kind: 'skyshot', correction: 'windowUrl', url: 'file:///nowhere/cua-scene.rtf', fault: 'engine', cause: 'test'};
  const report = audit({expected: [...EXPECTED, wrong], source: {kind: 'live'}});
  const entry = report.declarations.at(-1);
  assert.deepEqual(entry.neededIn, []);
  assert.ok(report.goldens.some(g => g.scene === 'textedit' && g.undeclared.length), 'it shows as an undeclared difference while declared');
  const text = formatAudit(report);
  assert.match(text, new RegExp(`delete: \\[${entry.index}\\] textedit skyshot windowUrl`));
  assert.doesNotMatch(text, new RegExp(`ENGINE DEFECT: \\[${entry.index}\\]`));
});

test('a vendor-defect declaration stays: never delete, never an engine defect, and nothing of it is left once the engine declarations go', t => {
  assert.equal(EXPIRING_FAULTS.includes('vendor'), false);
  const report = {source: 'live', goldens: [], afterDeletion: [], declarations: [{index: 0, expiring: false, neededIn: ['finder/full', 'finder/before'],
    rule: {scene: 'finder', kind: 'subsetCount', identifier: 'ListView', fault: 'vendor'}}]};
  assert.match(formatAudit(report), /keep \(vendor defect\): \[0\] finder subsetCount ListView \(vendor\): needed in finder\/full, finder\/before/);
  // On a live recording whose Finder list has more than 100 items, the declaration absorbs the vendor's capped count.
  if (!/ID: ListView \(showing [\d, -]+ of 100 items\)/.test(read('finder', 'vendor.txt'))) { t.skip('the committed recording has no capped Finder list'); return; }
  const rule = {scene: 'finder', golden: ['full', 'before'], kind: 'subsetCount', fault: 'vendor', identifier: 'ListView', cap: 100, count: 1, cause: 'test'};
  const live = audit({expected: [...EXPECTED.filter(each => each.kind !== 'subsetCount'), rule], source: {kind: 'live'}});
  const entry = live.declarations.at(-1);
  assert.deepEqual(entry.neededIn, ['finder/full', 'finder/before']);
  assert.deepEqual(live.goldens.filter(g => g.scene === 'finder' && g.golden !== 'diff').flatMap(g => g.undeclared), []);
  assert.deepEqual(live.afterDeletion.filter(g => g.scene === 'finder').flatMap(g => g.differences), []);
  assert.doesNotMatch(formatAudit(live), new RegExp(`(delete|ENGINE DEFECT): \\[${entry.index}\\]`));
});
