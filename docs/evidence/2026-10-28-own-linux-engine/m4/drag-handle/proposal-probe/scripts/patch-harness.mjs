#!/usr/bin/env node
// Task 73's probe only: patches an exported copy of the harness (never the repository's) so the drag experiment's held-move
// cells cover text selection and range drags, alternate their paths by run, and disturb a drag_handle between its start
// and its first move in the lanes named by T73_DISTURB_LANES:
//   T73_DISTURB=none | gap (T73_GAP_MS after the start) | popup (another client's 5x5 override-redirect window under the
//   pointer for 5 ms, after the start) | grab (another client's active pointer grab held over the start, released
//   after it) | nudge (an XTEST nudge 1 px and back, after the start: the handle's own device)
// Each handle's steps and the disturbance are logged with wall times to T73_LOG.
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
swap("  chrome: ['handle-canvas', 'handle-dnd'],\n  electron", "  chrome: ['handle-canvas', 'handle-dnd', 'handle-select', 'handle-range'],\n  electron");
swap('export function handleSteps(at, kind, window, { control = false } = {}) {\n  const points = runPath(at, baseKind(kind), 0)', 'export function handleSteps(at, kind, window, { control = false, i = 0 } = {}) {\n  const points = runPath(at, baseKind(kind), i)');
swap('handleSteps(at, kind, scene.window, { control: spec.handleControl })', 'handleSteps(at, kind, scene.window, { control: spec.handleControl, i })');
swap('if (handle) sent = await witness.span(tag, () => handleDrag(engine, path));', 'if (handle) sent = await witness.span(tag, () => handleDrag(engine, path, { lane: spec.label, kind, i }));');
swap('export async function handleDrag(engine, steps, { gapMs = HANDLE_GAP_MS } = {}) {', `const T73 = await import(process.env.T73_DISTURB_MODULE);
export async function handleDrag(engine, steps, { gapMs = HANDLE_GAP_MS, lane = null, kind = null, i = null } = {}) {
  if (lane !== null && steps[0]?.action === 'start') return T73.disturbedHandle(engine, steps, { gapMs, lane, kind, i, sleep });`);
writeFileSync(file, src);
console.log(`patched ${file}`);
