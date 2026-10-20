// The goldens' audit (test/native-goldens/audit.mjs): the step after a live re-recording (the own native engine spec,
// M1b: "the goldens' corrections expire here"), which re-renders the pinned files and reports every difference no
// declaration covers, every declaration that changes nothing, and what remains once the expiring declarations
// (faults engine, redaction, engine or renderer) are deleted. Judged here on the committed goldens.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EXPECTED} from './native-goldens/goldens.mjs';
import {EXPIRING_FAULTS, audit, formatAudit, rerender} from './native-goldens/audit.mjs';

const partOf = (scene, cua) => EXPECTED.find(rule => rule.scene === scene && rule.kind === 'part' && rule.cua === cua);

test('on the committed goldens nothing is undeclared, nothing over-declared, and every declaration is needed', () => {
  const report = audit();
  assert.deepEqual(report.goldens.flatMap(g => g.undeclared), []);
  assert.deepEqual(report.goldens.flatMap(g => g.overdeclared), []);
  assert.deepEqual(report.declarations.filter(d => !d.neededIn.length).map(d => d.index), []);
  assert.equal(report.declarations.length, EXPECTED.length);
});

test('a dropped declaration shows as the difference it covered, in each golden it applies to', () => {
  const dropped = partOf('textedit', 'Zoom Window');
  const report = audit({expected: EXPECTED.filter(rule => rule !== dropped)});
  const where = report.goldens.filter(g => g.undeclared.length).map(g => `${g.scene}/${g.golden}`);
  assert.deepEqual(where, ['textedit/full', 'textedit/before']);
  assert.equal(report.goldens.find(g => g.scene === 'textedit' && g.golden === 'full').undeclared[0].kind, 'text');
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

test('after the expiring declarations are deleted, what they absorbed remains and the scene-state ones still hold', () => {
  // Read as a live recording would be: there a still-needed expiring declaration is an engine defect.
  const report = audit({source: {kind: 'live'}});
  assert.deepEqual([...EXPIRING_FAULTS].sort(), ['engine', 'engine or renderer', 'redaction']);
  const remaining = report.afterDeletion.flatMap(g => g.differences.map(d => ({...d, at: `${g.scene}/${g.golden}`})));
  assert.ok(remaining.length > 0);
  // TextEdit's diff carries only scene-state declarations, which are not deleted.
  assert.deepEqual(report.afterDeletion.find(g => g.scene === 'textedit' && g.golden === 'diff').differences, []);
  // Every still-needed expiring declaration is an engine defect in the report, never a declaration to keep.
  const text = formatAudit(report);
  for (const d of report.declarations.filter(d => d.expiring)) assert.match(text, new RegExp(`ENGINE DEFECT: \\[${d.index}\\] `));
  assert.doesNotMatch(text, /ENGINE DEFECT: \[\d+\] textedit (header|missing)/);
  // On M0's captures the same declarations still wait for the re-recording.
  assert.doesNotMatch(formatAudit(audit()), /ENGINE DEFECT/);
});

test('re-rendering the committed goldens changes no pinned file', () => {
  const rendered = rerender({write: false});
  assert.equal(rendered.length, 8);
  assert.deepEqual(rendered.filter(r => r.changed), []);
});
