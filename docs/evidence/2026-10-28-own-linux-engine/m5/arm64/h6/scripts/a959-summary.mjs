#!/usr/bin/env node
// Task 122, ruling 959: the device cell chrome_dnd_long_left_in_front_shared's samples per engine, from a verdict run's
// rows (every set given): drops at a stale position (the page's drop counter rose although the path ends outside the
// zone), no drop with what the engine answered (an error; ok with the unconfirmed-drop notice on the read, refused
// next; ok with nothing pending, the next request run: a false ok), the reply's own notice, cold against warm. The
// device cells are cua-only (device.mjs `cuaOnly`), so only cua's lane has samples. Read-only.
//   node a959-summary.mjs <results.jsonl[.gz]>...
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const OP = 'chrome_dnd_long_left_in_front_shared';
const all = [];
for (const f of process.argv.slice(2)) {
  const raw = readFileSync(f);
  all.push(...(f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind === 'sample' && r.op === OP));
}
const dropped = (r) => r.dropped === true || r.drop_seen === true;
// the check after the read is cua's `preflight` request, which the vendor builds reject as an unknown request: on a
// vendor lane that is no refusal, and its answer is the drag's ok with a clean read
const noPreflight = (r) => /unknown variant `preflight`/.test(r.next_error ?? '');
const answer = (r) => (!r.ok ? 'error' : r.reply_notice ? 'ok with a notice on the reply' : r.state_notice ? (/unconfirmed drop/.test(r.state_notice) ? 'ok; the read: unconfirmed drop' : 'ok; the read: another notice') : r.next_ok === false && noPreflight(r) ? 'ok, the read clean (no preflight on the vendor)' : r.next_ok === false ? 'ok; next refused' : 'ok, nothing pending');
const by = new Map();
for (const r of all) by.set(r.engine, [...(by.get(r.engine) ?? []), r]);
console.log('| engine | samples (cold / warm) | stale-position drops | no drop | no drop: answers | false ok | honest unconfirmed | page started a drag |');
console.log('|---|---|---:|---:|---|---:|---:|---:|');
for (const [engine, l] of by) {
  const nd = l.filter((r) => !dropped(r));
  const answers = [...nd.reduce((m, r) => m.set(answer(r), (m.get(answer(r)) ?? 0) + 1), new Map())].map(([k, n]) => `${k} ${n}`).join('; ');
  console.log(`| ${engine} | ${l.length} (${l.filter((r) => r.series === 'cold').length} / ${l.filter((r) => r.series !== 'cold').length}) | ${l.filter(dropped).length} | ${nd.length} | ${answers || '–'} | ${nd.filter((r) => answer(r) === 'ok, nothing pending').length} | ${nd.filter((r) => answer(r) === 'ok; the read: unconfirmed drop').length} | ${l.filter((r) => r.started === true).length} |`);
  for (const r of l.filter(dropped)) console.log(`  stale drop: ${r.run} block ${r.block} ${r.series} #${r.i}: ${answer(r)}, take ${r.hold?.take_after_press_ms?.toFixed(1)} ms, path ${r.hold?.path_ms?.toFixed(1)} ms`);
}
