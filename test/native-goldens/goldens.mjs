// The goldens' files and their renderings, shared by test/services-engine-render-goldens.test.mjs and
// test/services-engine-diff-goldens.test.mjs (PROVENANCE.md says where the files come from).
import fs from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {advanceNumbering, render} from '../../src/services/engine/render.mjs';
import {diff} from '../../src/services/engine/diff.mjs';
import {correct} from './compare.mjs';

export const DIR = dirname(fileURLToPath(import.meta.url));
export const SCENES = ['textedit', 'finder', 'chrome', 'electron'];
// Finder's captures were redacted (its sidebar lists the owner's places), so it is compared by structure.
export const STRUCTURAL = new Set(['finder']);

export const read = (scene, name) => fs.readFileSync(join(DIR, scene, name), 'utf8');
export const shot = (scene, name) => JSON.parse(read(scene, name));
export const EXPECTED = JSON.parse(fs.readFileSync(join(DIR, 'expected.json'), 'utf8'));

// The declared differences of one golden ('full' or 'diff').
export const declared = (scene, golden) => EXPECTED.filter(rule => (rule.scene === scene || rule.scene === '*') && (!rule.golden || rule.golden === golden));

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

// The pinned rendering: compared byte for byte, rewritten with UPDATE_GOLDENS=1.
export function pinned(scene, name, text) {
  const file = join(DIR, scene, name);
  if (process.env.UPDATE_GOLDENS === '1') fs.writeFileSync(file, text);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}
