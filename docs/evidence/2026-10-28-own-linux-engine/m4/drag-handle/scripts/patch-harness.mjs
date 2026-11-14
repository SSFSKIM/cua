#!/usr/bin/env node
// Task 73's probe only: patches an exported copy of the harness (never the repository's) so the drag experiment's
// held-move cells cover text selection and range drags in Chrome and Electron, alternate their paths by run, and run
// every handle through disturb.mjs (T73_DISTURB_MODULE), which disturbs it in the lanes T73_DISTURB_LANES names and logs
// each step, its answer and what it left pending (disturb.mjs's header). The first executor's patch (task 73's
// proposal, at 328a3bb5) with Electron's cells and the window passed on.
// usage: node patch-harness.mjs <harness copy>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const file = join(process.argv[2], 'scripts/linux-engine-diff/drag.mjs');
let src = readFileSync(file, 'utf8');
const swap = (from, to) => {
  if (!src.includes(from)) throw new Error(`patch anchor missing: ${from.slice(0, 80)}`);
  src = src.replace(from, to);
};
swap("({ 'handle-canvas': 'canvas', 'handle-dnd': 'dnd', 'select-unprimed': 'select' })", "({ 'handle-canvas': 'canvas', 'handle-dnd': 'dnd', 'handle-select': 'select', 'handle-range': 'range', 'select-unprimed': 'select' })");
swap("  chrome: ['handle-canvas', 'handle-dnd'],\n  electron: ['handle-canvas', 'handle-dnd'],", "  chrome: ['handle-canvas', 'handle-dnd', 'handle-select', 'handle-range'],\n  electron: ['handle-canvas', 'handle-dnd', 'handle-select', 'handle-range'],");
swap('export function handleSteps(at, kind, window, { control = false } = {}) {\n  const points = runPath(at, baseKind(kind), 0)', 'export function handleSteps(at, kind, window, { control = false, i = 0 } = {}) {\n  const points = runPath(at, baseKind(kind), i)');
swap('handleSteps(at, kind, scene.window, { control: spec.handleControl })', 'handleSteps(at, kind, scene.window, { control: spec.handleControl, i })');
swap('if (handle) sent = await witness.span(tag, () => handleDrag(engine, path));', 'if (handle) sent = await witness.span(tag, () => handleDrag(engine, path, { lane: spec.label, kind, i, window: scene.id }));');
swap('export async function handleDrag(engine, steps, { gapMs = HANDLE_GAP_MS } = {}) {', `const T73 = await import(process.env.T73_DISTURB_MODULE);
export async function handleDrag(engine, steps, { gapMs = HANDLE_GAP_MS, lane = null, kind = null, i = null, window = null } = {}) {
  if (lane !== null && steps[0]?.action === 'start') return T73.disturbedHandle(engine, steps, { gapMs, lane, kind, i, sleep, window });`);
// cua's lanes with `--stats`, so each handle's record (its try, its hold watch, its release's wall time) is logged
swap('  const engine = new Engine(spec).start();\n', "  const engine = new Engine({ ...spec, stats: spec.label.startsWith('cua') }).start();\n");
writeFileSync(file, src);
console.log(`patched ${file}`);
