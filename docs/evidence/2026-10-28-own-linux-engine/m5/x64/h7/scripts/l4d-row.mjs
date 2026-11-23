#!/usr/bin/env node
// Task 129: one L4d drag's record in full (read-only), its large fields trimmed: the answer, the notices, the hold, the
// after-release record, the signals (cursors listed), the outcome, the page's counters before and after, the dragend,
// and the next request; then the same fields' distribution over its cell's other rows for comparison.
// usage: node l4d-row.mjs <checkout> <results.jsonl> <part (0-based)> <cell> <i>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [root, f, part, cell, i] = process.argv.slice(2);
const j = await import(pathToFileURL(join(root, 'scripts/linux-engine-diff/drop-signals-judge.mjs')).href);
const rows = readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind === 'drop-signal' && r.part === Number(part) && r.cell === cell);
const r = rows.find((x) => x.i === Number(i));
const trim = (v, n = 600) => { const s = JSON.stringify(v); return s && s.length > n ? `${s.slice(0, n)}…(${s.length})` : s; };
for (const k of ['lane', 'cell', 'i', 'block', 'cold', 'end', 'end_park', 'ok', 'ms', 'route', 'reply_notice', 'notice', 'escaped', 'outcome', 'after_release', 'after_take', 'wall', 'press', 'xdnd_aware', 'next']) console.log(`${k}: ${trim(r[k], 900)}`);
console.log(`hold: ${trim(r.hold, 1500)}`);
console.log(`signals: ${trim({ ...r.signals, cursors: undefined }, 900)}`);
console.log(`cursors: ${trim(r.signals?.cursors, 1500)}`);
console.log(`before.dnd: ${trim(r.before?.dnd, 900)}`);
console.log(`after.dnd: ${trim(r.after?.dnd, 900)}`);
console.log(`dnd: ${trim(r.dnd, 1500)}`);
console.log(`ownDragend: ${j.ownDragend(r)}; stampedDragend: ${j.stampedDragend(r)}; pendingOf: ${JSON.stringify(j.pendingOf(r))}; landingOf: ${j.landingOf(r)}; pathEndOf: ${j.pathEndOf(r)}`);
console.log(`watch: ${trim(r.watch, 1200)}`);
console.log(`crossings: ${trim(r.crossings, 600)}`);
console.log(`probe: ${trim(r.probe, 600)}`);
// the cell's other rows, for comparison
const others = rows.filter((x) => x !== r);
const tally = (fn) => { const m = new Map(); for (const x of others) { const k = String(fn(x)); m.set(k, (m.get(k) ?? 0) + 1); } return JSON.stringify(Object.fromEntries(m)); };
console.log(`\nthe cell's other ${others.length} rows:`);
console.log(`  after_release.confirmed_by: ${tally((x) => String(x.after_release?.confirmed_by).replace(/\(\d+\)/, '(<w>)'))}`);
console.log(`  after_release.confirming: ${tally((x) => x.after_release?.confirming)}; released_with_take: ${tally((x) => x.after_release?.released_with_take)}`);
console.log(`  activation_after_release_ms null: ${others.filter((x) => x.signals?.activation_after_release_ms == null).length}`);
console.log(`  accept_shown: ${tally((x) => x.signals?.accept_shown)}; outcome.started: ${tally((x) => x.outcome?.started)}; ownDragend: ${tally((x) => j.ownDragend(x))}`);
console.log(`  hold.adaptive.way: ${tally((x) => x.hold?.adaptive?.way ?? null)}; hold.held: ${tally((x) => x.hold?.held)}; keepalives>0: ${others.filter((x) => (x.hold?.keepalives ?? 0) > 0).length}`);
console.log(`  block: ${tally((x) => x.block)}; cold: ${tally((x) => x.cold)}`);
