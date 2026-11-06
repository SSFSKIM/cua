#!/usr/bin/env node
// analyze-order.mjs --json lines (stdin) grouped by target frame, in the order the frames were first activated: the
// presses, those that went to another window, the largest raise after the activation. With a frame id as argument,
// that frame's presses that went elsewhere, each with its point, the top window replayed and read after, and times.
import { readFileSync } from 'node:fs';

const acts = readFileSync(0, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const only = process.argv[2] ? Number(process.argv[2]) : null;
if (only) {
  acts.forEach((a, i) => {
    if (a.frame === only && a.press && !a.press.on_target) {
      console.log(i, a.press.x, a.press.y, a.press.top_replayed, a.press.top_after, (a.raised_ms - a.activate_ms).toFixed(1), (a.press.t_ms - a.activate_ms).toFixed(1));
    }
  });
} else {
  const g = new Map();
  for (const a of acts) {
    if (!a.press) continue;
    const s = g.get(a.frame) ?? { first: a.activate_ms, presses: 0, elsewhere: 0, largest_raise_ms: 0 };
    s.presses++;
    if (!a.press.on_target) s.elsewhere++;
    if (a.raised_ms !== null) s.largest_raise_ms = Math.max(s.largest_raise_ms, +(a.raised_ms - a.activate_ms).toFixed(1));
    g.set(a.frame, s);
  }
  for (const [frame, s] of [...g].sort((a, b) => a[1].first - b[1].first)) console.log(frame, JSON.stringify(s));
}
