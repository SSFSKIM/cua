// The goldens' audit, the step after a live re-recording (the own native engine spec, M1b: "the goldens' corrections
// expire here"; PROVENANCE.md): the pinned renderings re-rendered from the recorded Skyshots, then every golden judged
// against ./expected.json as the tests judge it (./goldens.mjs), reporting
//   - every difference no declaration covers;
//   - for each declaration, the goldens where it is needed (removing it adds a difference left undeclared), so one that
//     adds none is to be deleted, including one whose removal only takes differences away: it creates them (the
//     M1b hold's TextEdit windowUrl correction, which pinned M0's document path after the engine had been fixed);
//   - the declarations whose counts exceed what they absorb;
//   - what remains once every expiring declaration (faults engine, redaction, engine or renderer) is deleted: on a live
//     recording each such remainder is an engine defect to report, never a declaration to add.
// scripts/native-matrix/goldens.mjs check is its command; the sitting deletes the declarations from its output.
import fs from 'node:fs';
import {join} from 'node:path';
import {COMPARE, DIR, EXPECTED, GOLDENS, SCENES, allowsAddedLines, declared, renderDiff, renderFull} from './goldens.mjs';
import {SOURCE} from './source.mjs';

export const EXPIRING_FAULTS = Object.freeze(['engine', 'redaction', 'engine or renderer']);
const isExpiring = rule => EXPIRING_FAULTS.includes(rule.fault);
const undeclaredOf = differences => differences.filter(d => d.kind !== 'overdeclared');
// Whether `without` (a golden's differences once a declaration is removed) holds an undeclared difference `base` (with
// it) does not, counted as a multiset. A removal that only takes differences away is not a need.
export function addsUndeclared(base, without) {
  const left = new Map();
  for (const d of undeclaredOf(base)) { const key = JSON.stringify(d); left.set(key, (left.get(key) ?? 0) + 1); }
  return undeclaredOf(without).some(d => { const key = JSON.stringify(d), n = left.get(key) ?? 0; if (n) left.set(key, n - 1); return n === 0; });
}

// One golden judged under `rules`; the diff's index map is read under the same list's declarations of the first
// observation.
const judge = (scene, golden, rules, expected) => (golden === 'diff' ? COMPARE.diff(scene, rules, declared(scene, 'before', expected)) : COMPARE[golden](scene, rules));

// What a declaration declares, in one line.
export const describeRule = rule => [rule.scene, rule.kind, rule.correction ?? (rule.label ? `${rule.label}: ${rule.cua}` : null) ?? rule.head ?? rule.identifier ?? (rule.kind === 'header' || rule.kind === 'trailer' ? JSON.stringify(rule.cua) : '')]
  .filter(part => part !== '').join(' ');

// -> {source, goldens: [{scene, golden, undeclared, overdeclared, added, lines, overTenPercent}],
//     declarations: [{index, rule, expiring, neededIn: ['<scene>/<golden>']}], afterDeletion: [{scene, golden, differences}]}
export function audit({expected = EXPECTED, source = SOURCE} = {}) {
  const neededIn = new Map(expected.map(rule => [rule, []]));
  const kept = expected.filter(rule => !isExpiring(rule));
  const goldens = [], afterDeletion = [];
  for (const scene of SCENES) for (const golden of GOLDENS) {
    const rules = declared(scene, golden, expected);
    const result = judge(scene, golden, rules, expected);
    goldens.push({scene, golden, undeclared: undeclaredOf(result.differences), overdeclared: result.differences.filter(d => d.kind === 'overdeclared'),
      added: result.added, lines: result.lines, overTenPercent: result.added > result.lines * 0.1 && !allowsAddedLines(rules)});
    for (const rule of rules) {
      if (addsUndeclared(result.differences, judge(scene, golden, rules.filter(each => each !== rule), expected).differences)) neededIn.get(rule).push(`${scene}/${golden}`);
    }
    afterDeletion.push({scene, golden, differences: undeclaredOf(judge(scene, golden, declared(scene, golden, kept), kept).differences)});
  }
  return {source: source.kind, goldens, afterDeletion,
    declarations: expected.map((rule, index) => ({index, rule, expiring: isExpiring(rule), neededIn: neededIn.get(rule)}))};
}

// Re-renders each scene's pinned files (cua.txt, cua.diff.txt) from its recorded Skyshots; `write` rewrites the ones that
// changed, as UPDATE_GOLDENS=1 does. -> [{scene, file, changed}].
export function rerender({write = false, dir = DIR} = {}) {
  return SCENES.flatMap(scene => [['cua.txt', renderFull(scene)], ['cua.diff.txt', renderDiff(scene)]].map(([file, text]) => {
    const path = join(dir, scene, file);
    const changed = !fs.existsSync(path) || fs.readFileSync(path, 'utf8') !== text;
    if (changed && write) fs.writeFileSync(path, text);
    return {scene, file, changed};
  }));
}

const clip = text => { const one = String(text).replace(/\n/g, '⏎'); return one.length > 160 ? `${one.slice(0, 157)}...` : one; };
const describeDifference = d => {
  const fields = Object.entries(d).filter(([key]) => key !== 'kind').map(([key, value]) => `${key}: ${clip(typeof value === 'string' ? value : JSON.stringify(value))}`);
  return `${d.kind}  ${fields.join(' | ')}`;
};

// The report as text. On a live recording, an expiring declaration still needed is an ENGINE DEFECT; on M0's captures
// it still waits for the re-recording.
export function formatAudit(report) {
  const live = report.source === 'live';
  const out = [`Goldens audit (test/native-goldens, source ${report.source})`, ''];
  const list = (title, lines) => { out.push(title, ...(lines.length ? lines.map(line => `  ${line}`) : ['  (none)']), ''); };
  list('Differences no declaration covers (an engine defect to report, or a renderer fault to fix; never a declaration to add):',
    report.goldens.flatMap(g => g.undeclared.map(d => `${g.scene}/${g.golden}  ${describeDifference(d)}`)));
  list('Declarations:', report.declarations.map(({index, rule, expiring, neededIn}) => {
    const what = `[${index}] ${describeRule(rule)} (${rule.fault})`;
    if (!neededIn.length) return `delete: ${what}: removing it leaves no difference undeclared`;
    if (expiring) return `${live ? 'ENGINE DEFECT' : 'expires at the live re-recording'}: ${what}: still needed in ${neededIn.join(', ')}`;
    // A vendor defect (fault "vendor") stays as long as the pinned vendor has it: cua's output is the right one.
    return `keep${rule.fault === 'vendor' ? ' (vendor defect)' : ''}: ${what}: needed in ${neededIn.join(', ')}`;
  }));
  list('Declarations whose count exceeds what they absorb:', report.goldens.flatMap(g => g.overdeclared.map(d => `${g.scene}/${g.golden}  ${d.rule} ${d.head ?? ''} (${d.left} left)`)));
  list('Goldens adding more than 10% of their lines without a Decision Log entry:', report.goldens.filter(g => g.overTenPercent).map(g => `${g.scene}/${g.golden}  ${g.added} of ${g.lines}`));
  list('Left once every engine, redaction and engine-or-renderer declaration is deleted (each an engine defect to report):',
    report.afterDeletion.flatMap(g => g.differences.map(d => `${g.scene}/${g.golden}  ${describeDifference(d)}`)));
  return out.join('\n');
}

// Whether the report leaves anything to act on: an undeclared or over-declared difference, an unneeded declaration, a
// line count over the cap, or (on a live recording) an expiring declaration still needed.
export const auditClean = report => report.goldens.every(g => !g.undeclared.length && !g.overdeclared.length && !g.overTenPercent)
  && report.declarations.every(d => d.neededIn.length && !(report.source === 'live' && d.expiring));
