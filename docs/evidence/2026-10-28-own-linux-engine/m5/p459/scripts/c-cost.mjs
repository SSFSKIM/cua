#!/usr/bin/env node
// Task 126 (ruling 981.2-3): option (c)'s cost on drop-signals rows. With the gate open, a Chrome drop confirmed by its
// activation alone answers unconfirmed instead. Per cell this counts: drags, gate open, landed where the path ended
// (legitimate), legitimate landed drops (c) would notice, false oks left, and stale drops (which (c) notices too). The
// gate is read from the row's engine --stats when the lane ran the step (`release_sync`: fired or skipped). Otherwise,
// for 0.4.2, it is decided offline as the gate decides: a take before the release, no keepalive, and the release more
// than 2 ms past the floor's 350 ms after the take, since a floor that spaced the last step releases it at the floor's end.
//   node c-cost.mjs <results.jsonl[.gz] | p459 set dir>...
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const OUTSIDE = new Set(['left', 'long-left', 'inzone-out']);
const read = (f) => { const raw = readFileSync(f); return (f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); };
function files(arg) {
  if (!statSync(arg).isDirectory()) return [{ lane: 'run', file: arg, stats: null }];
  const out = [];
  for (const lane of readdirSync(arg)) {
    const ld = join(arg, lane);
    if (!statSync(ld).isDirectory()) continue;
    for (const round of readdirSync(ld)) {
      const run = join(ld, round, 'run');
      const file = ['results.jsonl', 'results.jsonl.gz'].map((n) => join(run, n)).find(existsSync);
      if (!file) continue;
      const stats = new Map();
      const sdir = join(run, 'engine-stats');
      if (existsSync(sdir)) for (const s of readdirSync(sdir)) for (const o of read(join(sdir, s))) { const l = o.stats ?? o; if (l.command === 'drag' && l.wall) stats.set(l.wall.press_ms, l); }
      out.push({ lane, file, stats });
    }
  }
  return out;
}
const per = new Map();
for (const arg of process.argv.slice(2)) for (const { lane, file, stats } of files(arg)) for (const r of read(file).filter((x) => x.kind === 'drop-signal')) {
  const st = stats && r.wall ? stats.get(r.wall.press_ms) : undefined;
  const sync = st?.release_sync;
  const taken = r.after_release?.released_with_take === true;
  const open = sync ? Number.isFinite(sync.added_ms) : taken && (r.hold?.keepalives ?? 0) === 0 && (r.after_take?.release_after_take_ms ?? 0) > 352;
  const activation = /^Activation/.test(r.after_release?.confirmed_by ?? '');
  const landed = Boolean(r.outcome?.landed);
  const legit = landed && !OUTSIDE.has(r.base);
  const stale = landed && OUTSIDE.has(r.base);
  const falseOk = !landed && r.ok && !r.reply_notice && !r.notice && r.next?.ok !== false;
  const key = `${lane} ${r.base}`;
  const e = per.get(key) ?? { n: 0, open: 0, legit: 0, noticed: 0, falseOk: 0, falseOkLeft: 0, stale: 0, gate: sync ? 'engine' : 'offline' };
  e.n += 1;
  e.open += open ? 1 : 0;
  e.legit += legit ? 1 : 0;
  e.noticed += open && activation && legit ? 1 : 0;
  e.falseOk += falseOk ? 1 : 0;
  // (c) turns an activation-confirmed drop with the gate open into the unconfirmed notice: such a false ok is honest
  e.falseOkLeft += falseOk && !(open && activation) ? 1 : 0;
  e.stale += stale ? 1 : 0;
  per.set(key, e);
}
console.log('| lane cell | drags | gate open (how read) | landed where the path ended | of them noticed under (c) | false oks | false oks left under (c) | stale-position drops (noticed under (c) when the gate is open) |');
console.log('|---|---:|---|---:|---|---:|---:|---:|');
for (const [k, e] of [...per].sort()) console.log(`| ${k} | ${e.n} | ${e.open} (${e.gate}) | ${e.legit} | ${e.noticed} (${e.legit ? ((100 * e.noticed) / e.legit).toFixed(1) : '–'}%) | ${e.falseOk} | ${e.falseOkLeft} | ${e.stale} |`);
