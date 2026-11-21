#!/usr/bin/env node
// Task 122, ruling 957: the interleaved t14-long's long-left rows per engine, across its rounds: false oks (answered ok,
// no drop, nothing pending), drops at a stale position (landed although the path ended left of the zone: every landing
// in long-left), honest notices, and Chrome's activation within 10 ms of the release, warm against cold; then each
// round's counts, so the alternation is visible. Read-only.
//   node a957-summary.mjs <run dir (a957-run.mjs's out)>
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const dir = process.argv[2];
const read = (f) => { const raw = readFileSync(f); return (f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); };
const cls = (r) => (r.outcome?.landed ? 'stale drop' : r.ok && !r.reply_notice && !r.notice && r.next?.ok !== false ? 'false ok' : 'honest');
const act10 = (r) => r.signals?.activation_after_release_ms != null && r.signals.activation_after_release_ms <= 10;
const per = new Map();
const rounds = [];
for (const engine of readdirSync(dir).filter((d) => /^e0/.test(d)).sort()) {
  for (const r of readdirSync(join(dir, engine)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))) {
    const f = ['run/results.jsonl', 'run/results.jsonl.gz'].map((p) => join(dir, engine, r, p)).find(existsSync);
    if (!f) { rounds.push({ engine, round: r, missing: true }); continue; }
    const rows = read(f).filter((x) => x.kind === 'drop-signal' && x.cell === 'long-left');
    per.set(engine, [...(per.get(engine) ?? []), ...rows]);
    rounds.push({ engine, round: r, n: rows.length, fo: rows.filter((x) => cls(x) === 'false ok').length, stale: rows.filter((x) => cls(x) === 'stale drop').length, act: rows.filter(act10).length });
  }
}
console.log('| engine | drags | false ok | stale-position drops | honest notices | activation within 10 ms: warm / cold (of warm / cold drags) | false ok with activation | stale drop with activation | honest with activation | last step to release, ms (median / max) | keepalives max |');
console.log('|---|---:|---:|---:|---:|---|---:|---:|---:|---|---:|');
for (const [engine, l] of per) {
  const n = (p) => l.filter(p).length;
  const warm = l.filter((r) => !r.cold);
  const cold = l.filter((r) => r.cold);
  const gaps = l.map((r) => r.wall.release_ms - r.wall.press_ms - r.hold.path_ms).sort((a, b) => a - b);
  console.log(`| ${engine} | ${l.length} | ${n((r) => cls(r) === 'false ok')} | ${n((r) => cls(r) === 'stale drop')} | ${n((r) => cls(r) === 'honest')} | ${warm.filter(act10).length} / ${cold.filter(act10).length} (of ${warm.length} / ${cold.length}) | ${n((r) => cls(r) === 'false ok' && act10(r))} | ${n((r) => cls(r) === 'stale drop' && act10(r))} | ${n((r) => cls(r) === 'honest' && act10(r))} | ${gaps[Math.floor(gaps.length / 2)].toFixed(1)} / ${gaps.at(-1).toFixed(1)} | ${Math.max(...l.map((r) => r.hold.keepalives ?? 0))} |`);
}
console.log('\n| round | engine | drags | false ok | stale drops | activation within 10 ms |');
console.log('|---|---|---:|---:|---:|---:|');
for (const r of rounds.sort((a, b) => Number(a.round.slice(1)) - Number(b.round.slice(1)) || a.engine.localeCompare(b.engine))) console.log(r.missing ? `| ${r.round} | ${r.engine} | missing | | | |` : `| ${r.round} | ${r.engine} | ${r.n} | ${r.fo} | ${r.stale} | ${r.act} |`);
