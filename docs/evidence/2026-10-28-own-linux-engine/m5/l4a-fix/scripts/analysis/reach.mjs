// Task 98: the size of the reruns under the pre-flight's section 8.2, from the gate's own step list (steps.mjs):
// each list's steps, their planned minutes, and which run on :0.
// usage: node reach.mjs <checkout>
import { join } from 'node:path';

const { STEPS } = await import(join(process.argv[2], 'scripts/linux-engine-gate/steps.mjs'));
const byName = new Map(STEPS.map((s) => [s.name, s]));
const lists = {
  // the new code runs: a Chromium-family source's cursor watch starts, and its drops settle
  'A: the new code runs (an Electron source)': ['H1', 'H2', 'L4a', 'D2', 'L2b', 'L1', 'S1', 'L3b'],
  'the cross-check (Chrome\'s drag cells)': ['D1'],
  // the changed functions are entered and no new branch is taken: every other step that sends a drag or a drag_handle
  'B: a changed function is entered, no new branch taken': STEPS.map((s) => s.name).filter((n) => !['H1', 'H2', 'L4a', 'D2', 'L2b', 'L1', 'S1', 'L3b', 'V1', 'FB', 'F1a', 'F1b', 'F2', 'F3a', 'F3b', 'F4', 'L5', 'P1', 'P2', 'P3'].includes(n)),
  'C: no drag and no handle at all': ['V1', 'FB', 'F1a', 'F1b', 'F2', 'F3a', 'F3b', 'F4', 'L5', 'P1', 'P2', 'P3'],
};
for (const [label, names] of Object.entries(lists)) {
  const steps = names.map((n) => byName.get(n) ?? (() => { throw new Error(`no step ${n}`); })());
  const sum = (list) => list.reduce((n, s) => n + s.minutes, 0);
  const zero = steps.filter((s) => s.display === ':0');
  console.log(`${label}: ${steps.length} steps, ${sum(steps)} min (${(sum(steps) / 60).toFixed(1)} h) an architecture; on :0: ${zero.length ? `${zero.map((s) => s.name).join(', ')} (${sum(zero)} min)` : 'none'}`);
  console.log(`  ${steps.map((s) => `${s.name} ${s.minutes}${s.display === ':0' ? ' (:0)' : ''}${s.load !== 'idle' ? ` [${s.load}]` : ''}`).join(', ')}`);
}
console.log(`the whole gate: ${STEPS.length} steps, ${STEPS.reduce((n, s) => n + s.minutes, 0)} min`);
