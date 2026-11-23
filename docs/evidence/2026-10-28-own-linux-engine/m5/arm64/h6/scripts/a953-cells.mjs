#!/usr/bin/env node
// Task 122, ruling 953: a drop-signals run's cells, per cell, from its rows: landed / no drop; false oks (answered ok,
// no drop, nothing pending: no notice on the reply or the read, and the next request ran); the notices (reply and read,
// by kind); the `after_release` records (`confirmed_by`, `released_with_take`); and the time from the path's last step
// to the release (the release less the press on the wall clock, less the path's own time; and the keepalives sent at the
// path's end). Read-only.
//   node a953-cells.mjs <results.jsonl[.gz]>...
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const count = (xs) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map())].map(([k, n]) => `${k} ${n}`).join(', ') || '–';
const kind = (t) => (!t ? null : /late drag and drop/.test(t) ? 'late' : /unconfirmed drop/.test(t) ? 'unconfirmed' : /may have started a drag/.test(t) ? 'hold' : t.slice(0, 40));
const q = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? `${s[0].toFixed(1)} / ${s[Math.floor(s.length / 2)].toFixed(1)} / ${s.at(-1).toFixed(1)}` : '–';
};
for (const file of process.argv.slice(2)) {
  const raw = readFileSync(file);
  const rows = (file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean)
    .map((l) => JSON.parse(l)).filter((r) => r.kind === 'drop-signal');
  console.log(`# ${file}: ${rows.length} drags`);
  console.log('| lane | cell | drags | landed | no drop | false ok | reply notices | read notices | confirmed_by | released_with_take | last step to release, ms (min / median / max) | keepalives (min / median / max) |');
  console.log('|---|---|---:|---:|---:|---:|---|---|---|---|---|---|');
  const by = new Map();
  for (const r of rows) by.set(`${r.lane} | ${r.cell}`, [...(by.get(`${r.lane} | ${r.cell}`) ?? []), r]);
  const falseOks = [];
  for (const [key, l] of by) {
    const fo = l.filter((r) => r.ok === true && !r.reply_notice && !r.notice && r.next?.ok !== false && r.outcome?.landed !== true);
    falseOks.push(...fo);
    const gap = l.map((r) => (r.wall && r.hold?.path_ms != null ? r.wall.release_ms - r.wall.press_ms - r.hold.path_ms : NaN));
    console.log(`| ${key} | ${l.length} | ${l.filter((r) => r.outcome?.landed === true).length} | ${l.filter((r) => r.outcome?.landed !== true).length} | ${fo.length} | ${count(l.map((r) => kind(r.reply_notice)).filter(Boolean))} | ${count(l.map((r) => kind(r.notice)).filter(Boolean))} | ${count(l.map((r) => (r.after_release?.confirmed_by ?? 'none').replace(/\(\d+\)/, '')))} | ${count(l.map((r) => String(r.after_release?.released_with_take ?? '–')))} | ${q(gap)} | ${q(l.map((r) => r.hold?.keepalives))} |`);
  }
  for (const r of falseOks) console.log(`  FALSE OK: ${r.lane} ${r.cell} #${r.i} (block ${r.block}, ${r.cold ? 'cold' : 'warm'})`);
  console.log('');
}
