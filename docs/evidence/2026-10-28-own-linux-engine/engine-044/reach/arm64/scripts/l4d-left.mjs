#!/usr/bin/env node
// Task 147: L4d's Chrome rows of one cell, one line each, read-only: the answer, the landing, the page's dragend effect,
// Chrome's activation after the release, the take, the path and release after the take, the derived gate (993's rule),
// the last step to the release, and Chrome's cursor images in order (the accept 1dc3, the no-drop bd1d, the end b46b)
// with the last one before the release.
//   node l4d-left.mjs <results.jsonl[.gz]> <cell>
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const [f, cell] = process.argv.slice(2);
const raw = readFileSync(f);
const rows = (f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind === 'drop-signal' && r.family === 'chrome' && r.cell === cell);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const img = { bd1d: 'nodrop', '1dc3': 'accept', b46b: 'end' };
console.log('| # | cold | ok | notice | landed | dragend effect | activation after the release (ms) | take (ms) | path after the take (ms) | release after the take (ms) | gate (993) | last step to release (ms) | cursors (image@ms) | last cursor before the release |');
console.log('|---:|---|---|---|---|---:|---:|---:|---:|---:|---|---:|---|---|');
for (const r of rows) {
  const rel = r.wall.release_ms - r.wall.press_ms;
  const pat = r.hold.path_ms - r.hold.take_after_press_ms;
  const open = r.hold.taken && (r.hold.keepalives ?? 0) === 0 && pat > 350;
  const cur = (r.signals?.cursors ?? []).filter((c) => !c.named);
  const before = cur.filter((c) => c.t_ms <= rel).at(-1);
  const name = (c) => img[String(c.image).slice(0, 4)] ?? String(c.image).slice(0, 4);
  const notice = r.reply_notice ?? r.notice;
  console.log(`| ${r.i} | ${r.cold ? 'cold' : 'warm'} | ${r.ok} | ${notice ? (/unconfirmed drop/.test(notice) ? 'unconfirmed' : 'other') : '–'} | ${r.outcome?.landed} | ${r.after?.last?.seq !== r.before?.last?.seq ? r.after?.last?.effect : '–'} | ${f1(r.signals?.activation_after_release_ms ?? NaN)} | ${f1(r.hold.take_after_press_ms)} | ${f1(pat)} | ${f1(r.after_take?.release_after_take_ms ?? NaN)} | ${open ? 'open' : 'shut'} | ${f1(rel - r.hold.path_ms)} | ${cur.map((c) => `${name(c)}@${f1(c.t_ms)}`).join(' ')} | ${before ? name(before) : '–'} |`);
}
