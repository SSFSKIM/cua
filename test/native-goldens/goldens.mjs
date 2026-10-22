// The goldens' files and their renderings, shared by test/services-engine-render-goldens.test.mjs and
// test/services-engine-diff-goldens.test.mjs (PROVENANCE.md says where the files come from).
import fs from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {advanceNumbering, render} from '../../src/services/engine/render.mjs';
import {diff} from '../../src/services/engine/diff.mjs';
import {compare, correct} from './compare.mjs';
import {STRUCTURAL} from './source.mjs';

export const DIR = dirname(fileURLToPath(import.meta.url));
export const SCENES = ['textedit', 'finder', 'chrome', 'electron'];
// The scenes whose captures were redacted (M0's Finder: its sidebar listed the owner's places) are compared by structure
// (./source.json); a live recording's Finder carries nothing the run does not own and is compared as full text.
export {STRUCTURAL};

export const read = (scene, name) => fs.readFileSync(join(DIR, scene, name), 'utf8');
export const shot = (scene, name) => JSON.parse(read(scene, name));
export const EXPECTED = JSON.parse(fs.readFileSync(join(DIR, 'expected.json'), 'utf8')).declarations;

// The declared differences of one golden: 'full' (the scene's state), 'before' (the action's first observation) or
// 'diff' (the action's diff). A declaration without `golden` applies to all three.
export const GOLDENS = ['full', 'before', 'diff'];
export const declared = (scene, golden, expected = EXPECTED) => expected.filter(rule => (rule.scene === scene || rule.scene === '*') && (!rule.golden || [rule.golden].flat().includes(golden)));

export function renderFull(scene, rules = []) {
  const skyshot = correct(shot(scene, 'skyshot.json'), rules);
  return render(skyshot, advanceNumbering(null, skyshot));
}

// The action pair: the observation before the click, then the default-mode observation after it in the same lineage.
export function renderDiff(scene, rules = []) {
  const before = correct(shot(scene, 'action.before.skyshot.json'), rules);
  const after = correct(shot(scene, 'action.after.skyshot.json'), rules);
  const first = {skyshot: before, numbering: advanceNumbering(null, before)};
  return diff(first, {skyshot: after, numbering: advanceNumbering(first.numbering, after)});
}

// The comparisons against the vendor (./compare.mjs), each under the declarations it is given: the scene's state, the
// action's first observation, and the action's diff.
export function compareFull(scene, rules) {
  return compare(read(scene, 'vendor.txt'), renderFull(scene, rules), {structural: STRUCTURAL.has(scene), declared: rules});
}

export function compareBefore(scene, rules) {
  const before = correct(shot(scene, 'action.before.skyshot.json'), rules);
  return compare(read(scene, 'action.vendor.before.txt'), render(before, advanceNumbering(null, before)), {structural: STRUCTURAL.has(scene), declared: rules});
}

export function compareDiff(scene, rules) {
  return compare(read(scene, 'action.vendor.diff.txt'), renderDiff(scene, rules), {kind: 'diff', structural: STRUCTURAL.has(scene), declared: rules});
}

export const COMPARE = {full: compareFull, before: compareBefore, diff: compareDiff};

// Part 3: a golden may add more than 10% of its lines only under a Decision Log entry, which the declaration cites by
// the entry's dated opening, `- Decision (<YYYY-MM-DD>…`, as it begins a line of the spec's Decision Log.
const SPEC = fs.readFileSync(join(DIR, '../../docs/doperpowers/specs/2026-10-18-own-native-engine-design.md'), 'utf8');
const DECISION_LOG = SPEC.slice(SPEC.indexOf('## Decision Log')).split('\n');
const citesEntry = cited => typeof cited === 'string' && /^- Decision \(\d{4}-\d{2}-\d{2}\b/.test(cited) && DECISION_LOG.some(line => line.startsWith(cited));
export const allowsAddedLines = rules => rules.some(rule => rule.kind === 'addedOverTenPercent' && citesEntry(rule.decisionLog));

// The pinned rendering: compared byte for byte, rewritten with UPDATE_GOLDENS=1.
export function pinned(scene, name, text) {
  const file = join(DIR, scene, name);
  if (process.env.UPDATE_GOLDENS === '1') fs.writeFileSync(file, text);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}
