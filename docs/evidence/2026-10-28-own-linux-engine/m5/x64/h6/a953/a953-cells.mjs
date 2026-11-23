#!/usr/bin/env node
// Task 123, ruling 953: the twin's rows per cell, beside the judge's own verdict row:
//   - landed or no drop;
//   - answered ok with no drop and nothing pending (a false ok only where the path ends in the zone; the judge's own
//     count, in its verdict row, is the authority);
//   - notices: the answer's, the read's after it, and whether the next request was refused;
//   - `after_release` `confirmed_by` and `released_with_take`;
//   - the last step's distance to the release: the wall press-to-release less `hold.path_ms`, which is the press to
//     the path's end.
// It also counts the drops at a stale position apart (the controller's word): rows that landed although the cell's
// path ends outside the zone. In `left`, `long-left` and `inzone-out` the path ends outside the zone by construction
// (drop-signals.mjs PLANS), and the judge counts those rows as landed.
// Read-only. usage: node a953-cells.mjs <results.jsonl[.gz]>
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const f = process.argv[2];
const raw = readFileSync(f);
const rows = (f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const ENDS_OUTSIDE = new Set(['left', 'long-left', 'inzone-out']);
const q = (v, p) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null; };
const r1 = (n) => (n === null ? null : Math.round(n * 10) / 10);
const cells = new Map();
for (const r of rows.filter((x) => x.kind === 'drop-signal')) {
  const k = `${r.lane} ${r.cell}`;
  const e = cells.get(k) ?? { drags: 0, landed: 0, no_drop: 0, ok_nothing_pending_no_drop: [], notices: new Map(), confirmed_by: new Map(), released_with_take: 0, gaps: [], stale: [] };
  e.drags++;
  const landed = r.outcome?.landed === true;
  if (landed) e.landed++; else e.no_drop++;
  const pending = r.next?.late_dnd || r.notice || r.reply_notice;
  if (r.ok === true && !landed && !pending && r.outcome?.started) e.ok_nothing_pending_no_drop.push(r.i);
  const n = `answer: ${r.reply_notice ? r.reply_notice.slice(0, 60) : 'none'}; read: ${r.notice ? r.notice.slice(0, 60) : 'none'}; next refused: ${r.next?.ok === false}`;
  e.notices.set(n, (e.notices.get(n) ?? 0) + 1);
  const cb = String(r.after_release?.confirmed_by ?? 'none').replace(/\(\d+\)/, '(<window>)');
  e.confirmed_by.set(cb, (e.confirmed_by.get(cb) ?? 0) + 1);
  if (r.after_release?.released_with_take) e.released_with_take++;
  if (r.wall && r.hold?.path_ms != null) e.gaps.push(r.wall.release_ms - r.wall.press_ms - r.hold.path_ms);
  if (landed && ENDS_OUTSIDE.has(r.cell)) e.stale.push(r.i);
  cells.set(k, e);
}
for (const [k, e] of cells) {
  console.log(JSON.stringify({
    cell: k, drags: e.drags, landed: e.landed, no_drop: e.no_drop, ok_nothing_pending_no_drop: e.ok_nothing_pending_no_drop.length, ok_nothing_pending_no_drop_rows: e.ok_nothing_pending_no_drop,
    stale_position_drops: e.stale.length, stale_rows: e.stale,
    notices: Object.fromEntries(e.notices), confirmed_by: Object.fromEntries(e.confirmed_by), released_with_take: e.released_with_take,
    last_step_to_release_ms: { min: r1(e.gaps.length ? Math.min(...e.gaps) : null), median: r1(q(e.gaps, 0.5)), p95: r1(q(e.gaps, 0.95)), max: r1(e.gaps.length ? Math.max(...e.gaps) : null) },
  }));
}
const v = rows.find((x) => x.kind === 'chrome-drop-verdict');
if (v) console.log(JSON.stringify({ verdict: { pass: v.pass, failed: v.failed, findings: v.findings, counts: v.counts } }));
