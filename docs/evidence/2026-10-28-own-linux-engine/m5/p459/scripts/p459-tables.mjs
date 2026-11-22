#!/usr/bin/env node
// Task 126 (#459's prototype): the tables of one p459 set, read-only. Every drop-signals row of every lane's runs,
// joined to its engine's `--stats` line (run/engine-stats/, by the drag's wall press time), classed as task 122's
// a953-rows.mjs classes them, with ruling 957's judge fix: on a cell whose path ends outside the zone (`left`,
// `long-left`, `inzone-out`) a drop that landed is a stale-position drop, not a landed one.
//   node p459-tables.mjs <set dir> [--rows]
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const [dir, ...flags] = process.argv.slice(2);
const OUTSIDE = new Set(['left', 'long-left', 'inzone-out']);
const read = (f) => { const raw = readFileSync(f); return (f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); };
const q = (xs, p) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : NaN; };
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const lanes = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const all = [];
for (const lane of lanes) {
  for (const round of readdirSync(join(dir, lane)).sort()) {
    const run = join(dir, lane, round, 'run');
    const file = ['results.jsonl', 'results.jsonl.gz'].map((n) => join(run, n)).find(existsSync);
    if (!file) continue;
    const stats = new Map();
    const sdir = join(run, 'engine-stats');
    if (existsSync(sdir)) for (const s of readdirSync(sdir)) for (const line of read(join(sdir, s)).map((o) => o.stats ?? o)) if (line.command === 'drag' && line.wall) stats.set(line.wall.press_ms, line);
    for (const r of read(file).filter((r) => r.kind === 'drop-signal')) {
      const st = r.wall ? stats.get(r.wall.press_ms) : undefined;
      const wrong = OUTSIDE.has(r.base) && r.outcome?.landed;
      const cls = wrong ? 'stale' : r.outcome?.landed ? 'landed' : r.ok && !r.reply_notice && !r.notice && r.next?.ok !== false ? 'FALSE OK' : r.ok ? 'honest' : 'refused';
      const sync = st?.release_sync ?? null;
      const gap = r.wall && r.hold ? r.wall.release_ms - r.wall.press_ms - r.hold.path_ms : NaN;
      all.push({ lane, round, i: r.i, cold: r.cold, cell: r.base, cls, took: r.outcome?.started, notice: r.reply_notice ? 'hold' : r.notice ? (/unconfirmed drop/.test(r.notice) ? 'unconfirmed' : 'other') : null,
        activation: r.signals?.activation_after_release_ms ?? null, confirmed_by: r.after_release?.confirmed_by ?? null, gap, sync, joined: Boolean(st),
        answer_to_release: sync?.answered_wall_ms && r.wall ? r.wall.release_ms - sync.answered_wall_ms : NaN, path_ms: r.hold?.path_ms, ms: r.ms, press_to_release: r.wall ? r.wall.release_ms - r.wall.press_ms : NaN, end: r.end });
    }
  }
}
const cells = [...new Set(all.map((r) => r.cell))];
console.log(`# ${dir}\n`);
console.log('| lane | cell | drags | joined to stats | landed (right place) | stale-position drop | false ok | honest notices (unconfirmed / hold / other) | refused | never took | gate fired / skipped | bound expired | step added ms p50 / p95 / max | path end to release ms p50 / max | press to release ms p50 / p95 / max |');
console.log('|---|---|---:|---:|---:|---:|---:|---|---:|---:|---|---:|---|---|---|');
for (const cell of cells) for (const lane of lanes) {
  const rs = all.filter((r) => r.lane === lane && r.cell === cell);
  if (!rs.length) continue;
  const n = (c) => rs.filter((r) => r.cls === c).length;
  const hon = rs.filter((r) => r.cls === 'honest');
  const added = rs.map((r) => r.sync?.added_ms).filter(Number.isFinite);
  const gaps = rs.map((r) => r.gap);
  const ms = rs.map((r) => r.ms);
  const fired = rs.filter((r) => r.sync && Number.isFinite(r.sync.added_ms));
  const skipped = rs.filter((r) => r.sync?.skipped_for);
  const pr = rs.map((r) => r.press_to_release);
  console.log(`| ${lane} | ${cell} | ${rs.length} | ${rs.filter((r) => r.joined).length} | ${n('landed')} | ${n('stale')} | ${n('FALSE OK')} | ${hon.length} (${hon.filter((r) => r.notice === 'unconfirmed').length} / ${hon.filter((r) => r.notice === 'hold').length} / ${hon.filter((r) => r.notice === 'other' || !r.notice).length}) | ${n('refused')} | ${rs.filter((r) => r.took === false).length} | ${fired.length} / ${skipped.length} | ${fired.length ? `${fired.filter((r) => r.sync.expired).length}/${fired.length}` : '–'} | ${added.length ? `${f1(q(added, 0.5))} / ${f1(q(added, 0.95))} / ${f1(Math.max(...added))}` : '–'} | ${f1(q(gaps, 0.5))} / ${f1(Math.max(...gaps.filter(Number.isFinite)))} | ${f1(q(pr, 0.5))} / ${f1(q(pr, 0.95))} / ${f1(Math.max(...pr.filter(Number.isFinite)))} |`);
}
const residue = all.filter((r) => r.cls === 'FALSE OK' || r.cls === 'stale');
console.log('\nThe residue: every false ok and stale-position drop, with the time from the second ping\'s answer to the release (ruling 958.1).\n');
console.log('| lane | round | # | cold | cell | class | activation after the release (ms) | confirmed_by | path end to release (ms) | step: motions, pings (ms), expired | second answer to the release (ms) |');
console.log('|---|---|---:|---|---|---|---:|---|---:|---|---:|');
for (const r of residue) console.log(`| ${r.lane} | ${r.round} | ${r.i} | ${r.cold ? 'cold' : 'warm'} | ${r.cell} | ${r.cls} | ${f1(r.activation ?? NaN)} | ${(r.confirmed_by ?? 'none').replace(/\(\d+\)/, '')} | ${f1(r.gap)} | ${r.sync?.skipped_for ? `skipped (keepalives ${r.sync.skipped_for.keepalives}, spaced ${r.sync.skipped_for.spaced_steps})` : r.sync ? `${r.sync.motions}, [${(r.sync.pings_ms ?? []).map(f1).join(", ")}], ${r.sync.expired}` : "–"} | ${f1(r.answer_to_release)} |`);
const expired = all.filter((r) => r.sync?.expired);
if (expired.length) {
  console.log('\nExpired bounds (the ping form):\n');
  for (const r of expired) console.log(`- ${r.lane} ${r.round} #${r.i} ${r.cell} ${r.cls}: pings [${r.sync.pings_ms.map(f1).join(', ')}]${r.sync.error ? `, ${r.sync.error}` : ''}`);
}
if (flags.includes('--rows')) for (const r of all) console.log(JSON.stringify(r));
