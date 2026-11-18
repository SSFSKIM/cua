// Task 101: the 0.4.1 candidate's development measurement, read from a drop-signals run's rows. Per lane and cell: the
// drags, landed, false oks (ok, nothing pending, no drop), the plain cell's non-landings with their answers, the
// settle's entries, its second rest (taken, skipped as not fitting, needless) each with what it answered and whether it
// landed, the notices by reason, and the two syncs' waits (median, p95, max), each and summed.
// usage: node t101.mjs <label>=<results.jsonl[.gz]>...
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const q = (xs, p) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 10) / 10;
};
const stat = (xs) => (xs.length ? `${q(xs, 0.5)} / ${q(xs, 0.95)} / ${Math.round(Math.max(...xs) * 10) / 10}` : '–');
const read = (file) => {
  const raw = readFileSync(file);
  return (file.endsWith('.gz') ? gunzipSync(raw) : raw)
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    });
};
const cursorOf = (r) => r.drop_cursor ?? r.handle?.drop_cursor ?? null;
const settleOf = (r) => cursorOf(r)?.settle ?? null;
const landedOf = (r) => r.outcome?.landed === true;
const answerOf = (r) => {
  if (r.ok !== true) return 'error';
  if (r.notice == null) return 'ok';
  if (/did not answer in time/.test(r.notice)) return 'unconfirmed (unanswered)';
  if (/an unconfirmed drop/.test(r.notice)) return 'unconfirmed';
  return 'other notice';
};
const tally = (list, f) => {
  const m = new Map();
  for (const r of list) m.set(f(r), (m.get(f(r)) ?? 0) + 1);
  return [...m].sort().map(([k, v]) => `${k} ${v}`).join(', ') || '–';
};

for (const input of process.argv.slice(2)) {
  const [label, file] = input.split('=');
  const rows = read(file).filter((r) => r.kind === 'drop-signal');
  const all = { drags: rows.length, false_ok: 0, entered: 0, taken: 0, skipped: 0, needless: 0, unsettled: 0 };
  console.log(`\n## ${label} (load ${rows[0]?.load}; ${rows.length} drags)\n`);
  console.log('| lane cell | drags | landed | false ok | not landed (answers) | settle entered | unsettled | second rest: taken / skipped / needless | sync waits summed, ms (p50 / p95 / max) | before rest | after motion | answers |');
  console.log('|---|---:|---:|---:|---|---:|---:|---|---|---|---|---|');
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.lane} ${r.cell}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const rests = [];
  for (const [key, list] of [...groups].sort()) {
    const settled = list.filter(settleOf);
    const by = (k) => settled.filter((r) => settleOf(r).second_rest === k);
    const falseOk = list.filter((r) => r.ok === true && r.notice == null && !landedOf(r));
    const missed = list.filter((r) => !landedOf(r));
    const ms = (r, k) => settleOf(r)[k]?.ms ?? 150;
    const unsettled = settled.filter((r) => settleOf(r).settled === false).length;
    all.false_ok += falseOk.length;
    all.entered += settled.length;
    all.taken += by('taken').length;
    all.skipped += by('skipped').length;
    all.needless += by('needless').length;
    all.unsettled += unsettled;
    console.log(
      `| ${key} | ${list.length} | ${list.filter(landedOf).length} | ${falseOk.length} | ${missed.length} (${tally(missed, answerOf)}) | ${settled.length} | ${unsettled} | ${by('taken').length} / ${by('skipped').length} / ${by('needless').length} | ${stat(settled.map((r) => ms(r, 'before_rest') + ms(r, 'after_motion')))} | ${stat(settled.map((r) => ms(r, 'before_rest')))} | ${stat(settled.map((r) => ms(r, 'after_motion')))} | ${tally(list, answerOf)} |`,
    );
    for (const kind of ['taken', 'skipped']) {
      for (const r of by(kind)) rests.push({ key, kind, i: r.i, before: ms(r, 'before_rest'), answer: answerOf(r), landed: landedOf(r), settled: settleOf(r).settled });
    }
  }
  console.log(`\nIn all: ${JSON.stringify(all)}`);
  console.log('\nSecond rests, by cell: what each answered and whether it landed\n');
  console.log('| lane cell | second rest | drags | answers | landed | not landed |');
  console.log('|---|---|---:|---|---:|---:|');
  const keyed = new Map();
  for (const r of rests) {
    const k = `${r.key}|${r.kind}`;
    if (!keyed.has(k)) keyed.set(k, []);
    keyed.get(k).push(r);
  }
  for (const [k, list] of [...keyed].sort()) {
    const [key, kind] = k.split('|');
    console.log(`| ${key} | ${kind} | ${list.length} | ${tally(list, (r) => r.answer)} | ${list.filter((r) => r.landed).length} | ${list.filter((r) => !r.landed).length} |`);
  }
  if (!rests.length) console.log('| – | none taken or skipped | 0 | – | – | – |');
}
