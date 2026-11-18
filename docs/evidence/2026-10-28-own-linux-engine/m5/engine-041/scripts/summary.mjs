// Task 101: a run's headline numbers from its rows (results.jsonl.gz): settled drags, the two syncs' waits summed
// (median, p95, max; an unanswered sync counts its 150 ms bound), the first syncs of the drags that took or skipped a
// second rest, the plain cells' non-landings, the landed drops answered unconfirmed, the per-drag
// settle_failed_activation_confirmed marks, the left cells' oks with no zone drop (ruling 830's class), and the
// settle record's fields. usage: node summary.mjs <evidence dir>...
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

for (const dir of process.argv.slice(2)) {
  const rows = gunzipSync(readFileSync(`${dir}/results.jsonl.gz`))
    .toString()
    .split('\n')
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    })
    .filter((r) => r.kind === 'drop-signal');
  const c = (r) => r.drop_cursor ?? r.handle?.drop_cursor;
  const all = rows.map(c).filter((x) => x?.settle);
  const w = all.map((x) => (x.settle.before_rest.ms ?? 150) + (x.settle.after_motion.ms ?? 150)).sort((a, b) => a - b);
  const q = (p) => w[Math.min(w.length - 1, Math.floor(p * w.length))].toFixed(1);
  const firsts = rows
    .filter((r) => ['taken', 'skipped'].includes(c(r)?.settle?.second_rest))
    .map((r) => (c(r).settle.before_rest.ms ?? 150).toFixed(1));
  const out = {
    settled: all.length,
    waits: `${q(0.5)} / ${q(0.95)} / ${w.at(-1).toFixed(1)}`,
    second_rest_first_syncs: firsts.join(', '),
    plain_not_landed: rows.filter((r) => r.cell === 'plain' && !r.outcome?.landed).length,
    landed_unconfirmed: rows.filter((r) => r.outcome?.landed && r.notice).length,
    settle_failed_activation_confirmed: rows.filter((r) => c(r)?.settle?.settle_failed_activation_confirmed === true || r.handle?.settle_failed_activation_confirmed === true).length,
    left_ok_no_zone_drop: rows.filter((r) => r.cell === 'left' && r.ok && !r.notice && !r.outcome?.landed).length,
    settle_fields: Object.keys(all[0]?.settle ?? {}),
  };
  console.log(dir, JSON.stringify(out));
}
