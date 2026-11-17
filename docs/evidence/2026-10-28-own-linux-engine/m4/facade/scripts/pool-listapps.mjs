#!/usr/bin/env node
// warm.listApps pooled across the counted sitting and its top-up (#171 M4 T18, the design session's ruling): each
// side's successful wall times from both sittings' runs, judged by the committed rule exactly as
// scripts/native-baseline/compare.mjs linuxEngineSpeed calls it (bbaff26d): linux-engine-diff/stats.mjs judgeSeriesSpeed
// over events.mjs medianDifferenceInterval, vendors ['vendor'], candidate 'cua', cap MIN_NOISE_SAMPLES. compare itself
// takes three runs a side, so the pooled series is judged here; each sitting alone is also judged, and the in-cell and
// outside-the-cell medians are given beside it.
// usage: node pool-listapps.mjs <harness checkout> <counted baseline dir> <top-up baseline dir> [op]
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const [harness, counted, topup, op = 'warm.listApps'] = process.argv.slice(2);
const {MIN_NOISE_SAMPLES, judgeSeriesSpeed} = await import(join(harness, 'scripts/linux-engine-diff/stats.mjs'));
const {medianDifferenceInterval} = await import(join(harness, 'scripts/linux-engine-diff/events.mjs'));
const rows = (dir, lane) => readdirSync(join(dir, lane)).filter(n => /^run-\d+$/.test(n)).sort()
  .flatMap(run => readFileSync(join(dir, lane, run, 'results.jsonl'), 'utf8').trim().split('\n').map(JSON.parse))
  .filter(r => r.op === op && r.ok === true && typeof r.wallMs === 'number');
const median = v => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r2 = v => Math.round(v * 100) / 100;
function judge(label, vendor, cua) {
  const s = judgeSeriesSpeed({vendor: {usable: vendor.map(r => r.wallMs), sampled: vendor.length}, cua: {usable: cua.map(r => r.wallMs), sampled: cua.length}},
    {vendors: ['vendor'], candidate: 'cua', interval: medianDifferenceInterval, cap: MIN_NOISE_SAMPLES});
  const side = rs => ({n: rs.length, wall: r2(median(rs.map(r => r.wallMs))), inCell: r2(median(rs.map(r => r.inCellMs))), outside: r2(median(rs.map(r => r.wallMs - r.inCellMs)))});
  return {label, op, vendor: side(vendor), cua: side(cua), verdict: s.verdict, label_: s.label ?? (s.interval && s.interval[0] > 0 ? 'loss' : 'undetermined'), interval: s.interval, bound: s.bound};
}
const sets = {counted: [rows(counted, 'cv'), rows(counted, 'cc')], topup: [rows(topup, 'cv'), rows(topup, 'cc')]};
const out = [judge('counted sitting', ...sets.counted), judge('top-up sitting', ...sets.topup),
  judge('pooled', [...sets.counted[0], ...sets.topup[0]], [...sets.counted[1], ...sets.topup[1]])];
console.log(JSON.stringify(out, null, 1));
