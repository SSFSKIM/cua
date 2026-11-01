// table.mjs <results.jsonl>...: the short in-front drop's samples (and the covered_dedicated prelude's answers) of the
// task 22 step A runs, one line each, then a summary per series.
import { readFileSync } from 'node:fs';

const rows = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
const shorts = rows.filter((r) => r.kind === 'sample' && r.op === 'chrome_dnd_short_in_front_shared');
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : null;
};
const fmt = (v) => (v === null || v === undefined ? '-' : typeof v === 'number' ? Math.round(v * 10) / 10 : v);
const verbose = process.env.VERBOSE === '1';
const lines = [];
for (const r of shorts) {
  const log = r.drop_status?.after?.log;
  const line = {
    run: r.run,
    block: r.block,
    series: r.series,
    ok: r.ok,
    landed: r.effect === true,
    ms: r.ms,
    taken_by_answer: r.press?.taken,
    take_after_press: r.scratch?.take_after_press_ms,
    path_end: r.scratch?.path_end_after_press_ms,
    waited: r.dnd_wait?.waited_ms,
    wait_taken: r.dnd_wait?.taken,
    release_after_take: r.after_take?.release_after_take_ms,
    dragstart_h: log?.start?.h,
    cancel_t: log?.cancel?.t,
    warmed: r.warmed_first ? r.warmed_first.ms : undefined,
    error: r.error?.slice(0, 60),
  };
  lines.push(line);
  if (verbose) console.log(Object.entries(line).map(([k, v]) => `${k}=${fmt(v)}`).join(' '));
}
for (const series of ['cold', 'warm']) {
  const s = lines.filter((l) => l.series === series);
  if (!s.length) continue;
  const takes = s.map((l) => l.take_after_press).filter((v) => typeof v === 'number');
  const ms = s.map((l) => l.ms);
  const held = s.filter((l) => typeof l.waited === 'number');
  console.log(
    `${series}: n ${s.length}, landed ${s.filter((l) => l.landed).length}, ok ${s.filter((l) => l.ok).length}, take seen by answer ${s.filter((l) => l.taken_by_answer).length}; ` +
      `take after press (server ms) n ${takes.length} min ${pct(takes, 0)} p50 ${pct(takes, 50)} p90 ${pct(takes, 90)} max ${Math.max(...takes)}; ` +
      `held ${held.length} (taken in the wait ${held.filter((l) => l.wait_taken).length}, waited max ${fmt(Math.max(0, ...held.map((l) => l.waited)))} ms); ` +
      `answer ms p50 ${fmt(pct(ms, 50))} max ${fmt(Math.max(...ms))}; no take ${s.length - takes.length}`,
  );
  const late = s.filter((l) => typeof l.take_after_press === 'number' && typeof l.path_end === 'number' && l.take_after_press > l.path_end);
  console.log(`  takes after the path's end: ${late.length}: ${late.map((l) => `${l.block}:${l.take_after_press}${l.landed ? 'L' : 'M'}`).join(' ')}`);
  const missed = s.filter((l) => !l.landed);
  console.log(`  missed: ${missed.map((l) => `${l.block} take ${fmt(l.take_after_press)} path ${fmt(l.path_end)} ms ${fmt(l.ms)} dragstart_h ${fmt(l.dragstart_h)} ${l.error ?? ''}`).join(' | ')}`);
}
