#!/usr/bin/env node
// Task 121: a drop-signals run's freeze cells, per cell: what each drag's answer was against what happened.
//   node bands.mjs <results.jsonl>...
import { readFileSync } from 'node:fs';

const HOLD_NOTICE = 'the page may have started a drag that did not complete';
for (const file of process.argv.slice(2)) {
  const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind === 'drop-signal');
  console.log(`# ${file} (${rows.length} drags, load ${[...new Set(rows.map((r) => r.load))].join(',')})`);
  console.log('| cell | n | identified | way fixed/extended/noticed | took | landed | late takes | late reported | noticed, no drop | page started, no take | plain ok, page started, nothing landed | thaw - release ms (min/median/max) |');
  console.log('|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---|');
  const by = new Map();
  for (const r of rows) by.set(r.cell, [...(by.get(r.cell) ?? []), r]);
  for (const [cell, l] of [...by].sort((a, b) => Number(a[0].split('-')[1]) - Number(b[0].split('-')[1]))) {
    const n = (p) => l.filter(p).length;
    const way = (w) => n((r) => r.hold?.adaptive?.way === w);
    const took = (r) => r.signals?.take_after_press_ms != null || r.hold?.taken === true;
    const late = (r) => r.signals?.late_take === true;
    const reported = (r) => late(r) && /late drag and drop/.test(r.notice ?? '') && r.next?.ok === false && r.next?.late_dnd?.escaped === true;
    const noticed = (r) => r.hold?.adaptive?.way === 'noticed' || r.reply_notice === HOLD_NOTICE;
    // the thaw against the release, both on this host's wall clock: the send is the release less the answer's time
    // after the send is not recorded, so the press stands in: the freeze counts from the send, a few ms before it
    const rel = l.filter((r) => r.wall && r.freeze).map((r) => r.freeze.continued_ms - (r.wall.release_ms - r.wall.press_ms)).sort((a, b) => a - b);
    const q = rel.length ? `${rel[0].toFixed(1)} / ${rel[Math.floor(rel.length / 2)].toFixed(1)} / ${rel.at(-1).toFixed(1)}` : '–';
    console.log(`| ${cell} | ${l.length} | ${n((r) => r.hold?.adaptive?.source?.identified === true)} | ${way('fixed')}/${way('extended')}/${way('noticed')} | ${n(took)} | ${n((r) => r.outcome?.landed === true)} | ${n(late)} | ${n(reported)} | ${n((r) => noticed(r) && r.outcome?.landed !== true && !late(r))} | ${n((r) => r.outcome?.started === true && !took(r))} | ${n((r) => r.ok === true && !noticed(r) && !r.notice && r.outcome?.started === true && r.outcome?.landed !== true)} | ${q} |`);
  }
  console.log('');
}
