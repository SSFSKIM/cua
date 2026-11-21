#!/usr/bin/env node
// Task 122, ruling 981: t14-long-vendor's long-left rows per lane (pinned, newest, cua): drops at a stale position
// (landed although the path ended left of the zone: every landing in long-left, 60 px clear of its border), no drop
// with the lane's answer, and Chrome's activation after the release, cold against warm; for cua, false oks (ok, no
// drop, nothing pending) and honest unconfirmed notices. A vendor lane has no drop confirmation, so its ok claims no
// drop; its follow-up `preflight` is cua's request, which the vendor rejects. Read-only.
//   node a981-summary.mjs <results.jsonl[.gz]>
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const f = process.argv[2];
const raw = readFileSync(f);
const rows = (f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind === 'drop-signal' && r.cell === 'long-left');
const vendor = (r) => r.lane !== 'cua';
const answer = (r) => (!r.ok ? 'error' : r.reply_notice ? 'ok, a notice on the reply' : r.notice ? (/unconfirmed drop/.test(r.notice) ? 'ok, the unconfirmed-drop notice on the read' : 'ok, another notice on the read') : vendor(r) ? 'ok, the read clean' : r.next?.ok === false ? 'ok, the next request refused' : 'ok, nothing pending');
console.log('| lane | drags (cold / warm) | landed: stale-position drops | no drop | the answers on no drop | false ok (cua) | honest unconfirmed (cua) | page started a drag | activation after the release, warm / cold |');
console.log('|---|---|---:|---:|---|---:|---:|---:|---|');
for (const lane of ['pinned', 'newest', 'cua']) {
  const l = rows.filter((r) => r.lane === lane);
  if (!l.length) continue;
  const nd = l.filter((r) => r.outcome?.landed !== true);
  const answers = [...nd.reduce((m, r) => m.set(answer(r), (m.get(answer(r)) ?? 0) + 1), new Map())].map(([k, n]) => `${k} ${n}`).join('; ');
  const act = (xs) => xs.filter((r) => r.signals?.activation_after_release_ms != null).length;
  console.log(`| ${lane} | ${l.length} (${l.filter((r) => r.cold).length} / ${l.filter((r) => !r.cold).length}) | ${l.length - nd.length} | ${nd.length} | ${answers} | ${lane === 'cua' ? nd.filter((r) => answer(r) === 'ok, nothing pending').length : '–'} | ${lane === 'cua' ? nd.filter((r) => answer(r) === 'ok, the unconfirmed-drop notice on the read').length : '–'} | ${l.filter((r) => r.outcome?.started === true).length} | ${act(l.filter((r) => !r.cold))} / ${act(l.filter((r) => r.cold))} |`);
}
// the one-sided 95% upper bound of a proportion k/n (Clopper–Pearson): the p at which P(X <= k) = 0.05
const lnC = (n, i) => { let s = 0; for (let j = 1; j <= i; j++) s += Math.log((n - i + j) / j); return s; };
const cdf = (k, n, p) => { let s = 0; for (let i = 0; i <= k; i++) s += Math.exp(lnC(n, i) + i * Math.log(p) + (n - i) * Math.log1p(-p)); return s; };
const upper = (k, n) => { if (k >= n) return 1; let lo = k / n, hi = 1; for (let t = 0; t < 60; t++) { const m = (lo + hi) / 2; if (cdf(k, n, m) > 0.05) lo = m; else hi = m; } return hi; };
const pct = (k, n) => `${k}/${n} (≤ ${(100 * upper(k, n)).toFixed(1)}%)`;
console.log('\n| lane | stale-position drops | landed | no drop |');
console.log('|---|---|---|---|');
for (const lane of ['pinned', 'newest', 'cua']) {
  const l = rows.filter((r) => r.lane === lane);
  if (!l.length) continue;
  const landed = l.filter((r) => r.outcome?.landed === true).length;
  console.log(`| ${lane} | ${pct(landed, l.length)} | ${pct(landed, l.length)} | ${pct(l.length - landed, l.length)} |`);
}
console.log('(every landing in long-left is a stale-position drop: the path ends 60 px left of the zone; the bound is the one-sided 95% Clopper-Pearson upper bound)');
for (const r of rows.filter((x) => x.outcome?.landed === true)) console.log(`  stale drop: ${r.lane} #${r.i} (block ${r.block}, ${r.cold ? 'cold' : 'warm'}), answer: ${answer(r)}, activation ${r.signals?.activation_after_release_ms ?? '–'} ms, end ${r.end.x},${r.end.y}`);
