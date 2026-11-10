#!/usr/bin/env node
// Acceptance 3's speed rule on the dnd experiment's runs (dnd.mjs rows `dnd-run`): the short drop and the 40 px
// selection, each lane's runs after its first (a fresh engine's), a run usable when it answered ok and, for a drop,
// landed (a selection's effect is not read by the dnd experiment, so every answered run is usable); then the harness's
// own series judge (drag-judge.mjs `dragSpeed`: 20 usable a side, the vendor bar only from a build with 20 usable).
// usage: node speed.mjs <harness dir> <run dir>...
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { basename, join } from 'node:path';

const [harness, ...dirs] = process.argv.slice(2);
const { dragSpeed } = await import(join(harness, 'scripts/linux-engine-diff/drag-judge.mjs'));
const { median } = await import(join(harness, 'scripts/linux-engine-diff/stats.mjs'));
const rowsOf = (dir) => {
  const plain = join(dir, 'run/results.jsonl');
  const text = existsSync(plain) ? readFileSync(plain, 'utf8') : gunzipSync(readFileSync(`${plain}.gz`)).toString('utf8');
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
};
const r1 = (v) => (Number.isFinite(v) ? (Math.round(v * 10) / 10).toFixed(1) : '–');
for (const dir of dirs) {
  const rows = rowsOf(dir).filter((r) => r.kind === 'dnd-run');
  const meta = rowsOf(dir).find((r) => r.kind === 'meta') ?? {};
  const selection = String(meta.args ?? '').includes('dnd-select') || basename(dir).includes('select');
  const runs = rows.map((r) => ({ engine: r.engine, ms: r.ms, ok: r.ok, took: selection ? r.ok : r.dropped, first_request: r.i === 0 }));
  const speed = dragSpeed(runs, { candidate: 'cua', vendors: ['pinned', 'newest'] });
  console.log(`## ${basename(dir)}${selection ? ' (40 px selection)' : ' (short drop)'}`);
  console.log('| lane | runs | usable | took | median ms |');
  console.log('|---|---:|---:|---:|---:|');
  for (const lane of ['pinned', 'newest', 'cua']) {
    const mine = runs.filter((r) => r.engine === lane);
    const usable = speed.samples[lane]?.usable ?? [];
    console.log(`| ${lane} | ${mine.length} | ${usable.length} | ${mine.filter((r) => r.took).length} | ${r1(median(usable))} |`);
  }
  const { verdict, against, bar, candidate, interval, bound, label, reasons } = speed;
  console.log(`\nverdict: ${JSON.stringify({ verdict, against, bar, candidate, interval, bound, label, reasons })}\n`);
}
