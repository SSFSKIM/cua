// The native-mac suite's diff (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system part
// 3, part 7's settle cell; Acceptance 6): `repl-parity.mjs diff <vendor-run> <cua-run> --expected <declared>` over two
// runs of the suite (./native-mac.mjs), one per engine, from one sitting.
//
// The accessibility texts are compared exactly as the renderer's goldens are (test/native-goldens/compare.mjs, the same
// comparator, not a second one): element lines matched in order by index, role, flags, title and labels, each matched
// pair then compared whole, the trailer and a diff's `Removed element IDs:` as text. Indexes are compared, never
// renumbered away: the renderer prints free text raw, so no line is certainly an element line rather than a value's
// (the comparator's own account); a numbering one lane shifted shows as differences, in plain view. Per scene three
// comparisons, the goldens' three: `full` (the fixed state), `before` (the action's first observation) and `diff` (the
// observation right after the action). A golden adding more than a tenth of its lines needs a
// declaration citing a Decision Log entry (part 3's 10% rule), as the goldens' test applies it to the two trees.
//
// The observation right after the action is compared in the form it came in: a default-mode observation is a diff, the
// no-change answer, or the full tree (the renderer's fallback when the changes do not fit the diff's budget or the
// lineage is new, src/services/engine/diff.mjs), the last compared as a tree. Two lanes answering in two forms (a full
// tree against a diff) are a difference of form.
//
// The settle cell ("the observation right after an action equals the observation two seconds later", part 7) is scored
// on both engines: a lane settled when its default-mode observation two seconds after the one right after the action is
// the no-change answer for the same window with the same trailer (the renderer appends the current selection or focus
// to the no-change sentence, so an unchanged tree with a moved focus is not settled). A lane that did not settle is a
// difference, on either engine, until it is declared.
//
// Every difference is declared in the expected file with its cause, as scripts/repl-parity/vendor-defects.mjs declares
// the vendor's (`fault: "vendor"`), or counted: the report's `summary` is "N unexpected differences". A declaration
// nothing needed is itself a difference (`overdeclared`), so the file cannot drift into absorbing what no longer happens.
import * as fs from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compare, parse} from '../../test/native-goldens/compare.mjs';
import {allowsAddedLines} from '../../test/native-goldens/goldens.mjs';
import {SCENE_IDS} from './scenes-mac.mjs';

export const EXPECTED_FILE = fileURLToPath(new URL('./expected/native-mac.json', import.meta.url));
export const GOLDENS = Object.freeze(['full', 'before', 'diff', 'settle']);
// The text each compared golden is, as [the row's cell, the text's kind].
const TEXT_OF = Object.freeze({full: ['fixed', 'full'], before: ['action', 'before'], diff: ['action', 'diff']});
// Where a declared difference comes from: the pinned vendor's own defect (cua's output is the right one), a state the
// two lanes' actions left differently, or cua's departure from the vendor that a Decision Log entry records. An engine
// or renderer fault of cua's is a defect to fix, never a declaration.
export const FAULTS = Object.freeze(['vendor', 'scene state', 'departure']);
const LINE_KINDS = ['missing', 'added', 'part', 'header', 'trailer', 'subsetCount', 'addedOverTenPercent'];
const NEEDS = {
  missing: rule => typeof rule.head === 'string' && rule.head !== '' || 'a missing line names its matching `head`',
  added: rule => (typeof rule.head !== 'string' || rule.head === '' ? 'an added line names its matching `head`'
    : rule.head.replace(/^[~+]/, '').split(' | ')[0].trim() !== '' || 'an added line names the element by its role and title (its `head`)'),
  part: rule => typeof rule.label === 'string' && typeof rule.cua === 'string' && (typeof rule.vendor === 'string' || rule.vendor === null) || 'a part names its `label`, `cua` and `vendor` (null when the vendor lacks it)',
  header: rule => typeof rule.vendor === 'string' && typeof rule.cua === 'string' || 'a header names both sides\' exact text',
  trailer: rule => (typeof rule.vendor === 'string' || rule.vendor === null) && (typeof rule.cua === 'string' || rule.cua === null) || 'a trailer names both sides\' exact text',
  subsetCount: rule => typeof rule.identifier === 'string' && Number.isInteger(rule.cap) && rule.cap > 0 || 'a subsetCount names the element\'s `identifier` and the vendor\'s `cap`',
  addedOverTenPercent: rule => citesDecisionLog(rule.decisionLog) || 'addedOverTenPercent cites a Decision Log entry by its dated opening',
  settle: rule => ['vendor', 'cua'].includes(rule.lane) || 'a settle declaration names the `lane` that did not settle, vendor or cua',
};
// The spec's Decision Log entry a declaration cites, by its dated opening (`- Decision (<YYYY-MM-DD>…`), as the goldens'
// 10% rule reads it (test/native-goldens/goldens.mjs).
const citesDecisionLog = cited => allowsAddedLines([{kind: 'addedOverTenPercent', decisionLog: cited}]);

const goldensOf = rule => [rule.golden ?? GOLDENS.filter(g => g !== 'settle')].flat();
// The expected file ({about, declarations}) -> its declarations, each checked; throws naming the first that is not one.
export function validateDeclarations(file) {
  const declarations = file?.declarations;
  if (!Array.isArray(declarations)) throw new Error('the expected file holds {declarations: [...]}');
  for (const rule of declarations) {
    const fail = why => { throw new Error(`invalid native-mac declaration ${JSON.stringify(rule)}: ${why}`); };
    if (rule?.scene !== '*' && !SCENE_IDS.includes(rule?.scene)) fail(`its scene is one of ${SCENE_IDS.join(', ')} or *`);
    const goldens = goldensOf(rule);
    if (!goldens.length || goldens.some(g => !GOLDENS.includes(g))) fail(`its golden is one or more of ${GOLDENS.join(', ')}`);
    if (![...LINE_KINDS, 'settle'].includes(rule.kind)) fail(`its kind is one of ${[...LINE_KINDS, 'settle'].join(', ')}`);
    if ((rule.kind === 'settle') !== goldens.every(g => g === 'settle') || (rule.kind !== 'settle' && goldens.includes('settle'))) fail('a settle declaration, and only one, names the settle golden');
    const need = NEEDS[rule.kind](rule);
    if (need !== true) fail(need);
    if (!FAULTS.includes(rule.fault)) fail(`its fault is one of ${FAULTS.join(', ')}`);
    if (rule.fault === 'departure' && !citesDecisionLog(rule.decisionLog)) fail('a departure cites the Decision Log entry that records it, by its dated opening');
    if (typeof rule.cause !== 'string' || !rule.cause.trim()) fail('it names its cause');
    if (rule.count !== undefined && !(Number.isInteger(rule.count) && rule.count > 0)) fail('its count is a positive integer');
  }
  return declarations;
}

// A run directory of the suite -> {dir, meta, rows, row(scene, cell), text(scene, kind)}; a text is read only as the file
// its row hashed.
export function loadNativeMacRun(dir) {
  const meta = JSON.parse(fs.readFileSync(join(dir, 'meta.json'), 'utf8'));
  const rows = fs.readFileSync(join(dir, 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const row = (scene, cell) => rows.find(r => r.scene === scene && r.cell === cell) ?? null;
  const text = (scene, kind) => {
    const entry = row(scene, kind === 'full' ? 'fixed' : 'action');
    const file = entry?.ok ? entry.texts?.[kind] : null;
    if (!file) return null;
    if (typeof file.file !== 'string' || file.file.split('/').includes('..')) throw new Error(`${dir}: ${scene} ${kind} names no file of the run`);
    const value = fs.readFileSync(join(dir, file.file), 'utf8');
    if (createHash('sha256').update(value).digest('hex') !== file.sha256) throw new Error(`${dir}: ${file.file} is not the text its row hashed`);
    return value;
  };
  return {dir, meta, rows, row, text};
}

// Whether two runs may be compared: both complete runs of this suite on macOS, from one sitting (one device, the harness
// checkout at one commit, one approved engine, one vendor runtime) with the same cells (one controller commit). With
// declarations, the vendor-engine run first and the cua-engine run second; two runs of one engine (determinism) take none.
export function checkPair(vendor, cua, {declarations = []} = {}) {
  for (const run of [vendor, cua]) {
    if (run.meta.suite !== 'native-mac') throw new Error(`${run.dir} is not a native-mac run`);
    if (run.meta.complete !== true) throw new Error(`${run.dir} is an incomplete run${run.meta.error ? ` (${run.meta.error})` : ''}: rerun it`);
    if (run.meta.platform !== 'darwin') throw new Error(`${run.dir} is not a macOS run`);
  }
  const [a, b] = [vendor.meta, cua.meta];
  if (a.engine === b.engine) { if (declarations.length) throw new Error('two runs of the same engine are a determinism check: same-engine runs take no expected differences'); }
  else if (a.engine !== 'vendor' || b.engine !== 'cua') throw new Error('diff takes the vendor-engine run first and the cua-engine run second');
  if (a.device !== b.device) throw new Error(`the runs are on two devices (${a.device}, ${b.device})`);
  if (a.commit !== b.commit) throw new Error(`the runs' harness checkouts are at two commits (${a.commit}, ${b.commit}): one sitting is one commit`);
  if (a.approved?.build !== b.approved?.build || !a.approved?.build) throw new Error('the runs served two approved engines (or none): one sitting is one approved engine');
  if (a.runtimeRelease !== b.runtimeRelease) throw new Error(`the runs served two vendor runtimes (${a.runtimeRelease}, ${b.runtimeRelease})`);
  if (a.harness?.commit !== b.harness?.commit) throw new Error('the runs\' cells came from two controller commits: the same scripted cells run on both engines');
}

// An observation's form by its first line (the renderer's src/services/engine/diff.mjs and render.mjs; the vendor's
// sentences, R/sky-behaviour.md §9): 'full', 'diff', 'noChange', or null.
const FORMS = [['noChange', /^There has been no change in the accessibility tree for Window: "/],
  ['diff', /^The following is a diff from the previous accessibility tree for Window: "/], ['full', /^Window: "/]];
export const formOf = text => (typeof text === 'string' ? FORMS.find(([, pattern]) => pattern.test(text))?.[0] ?? null : null);
const parsed = text => parse(text, {kind: formOf(text) === 'full' ? 'full' : 'diff'});
const windowOf = text => /Window: "([^"]*)"/.exec(text.split('\n')[0])?.[1] ?? null;
// Settled: the observation two seconds after `after` (the one right after the action) is the no-change answer for the
// same window, with the same trailer, so nothing of the observation moved: neither the tree, nor the selection or focus.
export function isSettled(after, later) {
  if (formOf(after) === null || formOf(later) !== 'noChange' || windowOf(after) !== windowOf(later)) return false;
  return (parsed(after).trailer?.text ?? null) === (parsed(later).trailer?.text ?? null);
}

const statusOf = row => (row ? {ok: row.ok === true, ...(row.ok ? {} : {error: row.error ?? null})} : {ok: false, error: 'no row'});

// -> the report: per scene each comparison's differences, added and line counts and both lanes' settle scores; the
// declarations applied, per scene and golden; every unexpected difference with its scene and golden; ok; and, last, the
// summary "N unexpected differences".
export function diffNativeMac(vendor, cua, {declarations = []} = {}) {
  const scenes = {}, differences = [], declared = [];
  const applies = (scene, golden) => declarations.filter(rule => (rule.scene === scene || rule.scene === '*') && goldensOf(rule).includes(golden));
  for (const scene of SCENE_IDS) {
    const out = scenes[scene] = {};
    for (const golden of ['full', 'before', 'diff']) {
      const [cell, kind] = TEXT_OF[golden];
      const v = vendor.text(scene, kind), c = cua.text(scene, kind);
      if (v === null || c === null) {
        const difference = {scene, golden, kind: 'cell', cell, vendor: statusOf(vendor.row(scene, cell)), cua: statusOf(cua.row(scene, cell))};
        out[golden] = {compared: false, differences: [difference]};
        differences.push(difference);
        continue;
      }
      const rules = applies(scene, golden).filter(rule => rule.kind !== 'settle');
      // The fixed state and the action's first observation are full trees; the one right after the action is compared
      // in the form both lanes gave it, a diff (or the no-change answer) as one, a full tree as one.
      const forms = [formOf(v), formOf(c)], diffLike = form => form === 'diff' || form === 'noChange';
      const as = golden !== 'diff' ? (forms.every(form => form === 'full') ? 'full' : null)
        : forms.every(diffLike) ? 'diff' : forms.every(form => form === 'full') ? 'full' : null;
      if (as === null) {
        const difference = {scene, golden, kind: 'form', vendor: forms[0], cua: forms[1]};
        out[golden] = {compared: false, differences: [difference]};
        differences.push(difference);
        continue;
      }
      const result = compare(v, c, {kind: as, declared: rules});
      const found = result.differences.map(d => ({scene, golden, ...d}));
      if (as === 'full' && result.added > result.lines * 0.1 && !allowsAddedLines(rules)) found.push({scene, golden, kind: 'addedOverTenPercent', added: result.added, lines: result.lines});
      out[golden] = {compared: true, added: result.added, lines: result.lines, differences: found};
      differences.push(...found);
      declared.push(...rules.map(rule => ({scene, golden, kind: rule.kind, fault: rule.fault, cause: rule.cause, ...(rule.count ? {count: rule.count} : {})})));
    }
    // The settle cell, on both engines.
    const settleRules = applies(scene, 'settle').map(rule => ({...rule, left: rule.count ?? 1}));
    out.settle = {};
    for (const [lane, run] of [['vendor', vendor], ['cua', cua]]) {
      const row = run.row(scene, 'settle');
      if (!row?.ok) {
        const difference = {scene, golden: 'settle', kind: 'cell', cell: 'settle', lane, status: statusOf(row)};
        differences.push(difference);
        out.settle[lane] = null;
        continue;
      }
      const settled = isSettled(run.text(scene, 'diff'), run.text(scene, 'later'));
      out.settle[lane] = settled;
      if (settled) continue;
      const rule = settleRules.find(each => each.lane === lane && each.left > 0);
      if (rule) { rule.left--; declared.push({scene, golden: 'settle', kind: 'settle', lane, fault: rule.fault, cause: rule.cause}); }
      else differences.push({scene, golden: 'settle', kind: 'settle', lane, message: `the ${lane} engine's observation two seconds after the action was not the one right after it`});
    }
    for (const rule of settleRules) if (rule.left > 0 && out.settle[rule.lane] !== null) differences.push({scene, golden: 'settle', kind: 'overdeclared', rule: 'settle', lane: rule.lane, left: rule.left});
  }
  return {suite: 'native-mac', vendor: describe(vendor), cua: describe(cua), scenes, declared, differences, ok: differences.length === 0,
    summary: `${differences.length} unexpected differences`};
}
const describe = run => ({dir: run.dir, host: run.meta.host, engine: run.meta.engine, commit: run.meta.commit, approvedBuild: run.meta.approved?.build ?? null, runtimeRelease: run.meta.runtimeRelease});

export const summaryLine = report => `summary: ${report.summary}`;

// The CLI's diff: both runs loaded and checked as one pair, the expected file's declarations applied. -> the report.
export function nativeMacDiff(vendorDir, cuaDir, {expected} = {}) {
  const declarations = expected ? validateDeclarations(JSON.parse(fs.readFileSync(expected, 'utf8'))) : [];
  const vendor = loadNativeMacRun(vendorDir), cua = loadNativeMacRun(cuaDir);
  checkPair(vendor, cua, {declarations});
  return diffNativeMac(vendor, cua, {declarations});
}
