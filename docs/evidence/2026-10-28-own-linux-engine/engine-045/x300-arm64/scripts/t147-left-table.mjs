#!/usr/bin/env node
// Task 147 (ruling 1140): the per-row table of a development t14-floor `left` set run through task 132's harness
// (t132-alternate.mjs, `--engine-stats`), read-only. Each drop-signals row is classed by the harness's own judge run on
// that row alone (drop-signals-judge.mjs `chromeDropVerdict`, plan t14-floor; untaken when the source never took), and
// joined to the engine's `--stats` line by the drag's wall press time for its `release_sync` record. Times are ms
// after the press unless named otherwise. "Leave seen" is Chrome's no-drop cursor (bd1d) shown after its accept (1dc3)
// and at or before the release. Then the outcome against visits_dropped, and whether every false ok had a dropped visit.
// Development, not counted.
//   node t147-left-table.mjs <harness repo> <set dir> [--json]
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const [repo, dir, ...flags] = process.argv.slice(2);
const { chromeDropVerdict } = await import(pathToFileURL(join(repo, 'scripts/linux-engine-diff/drop-signals-judge.mjs')).href);
const read = (f) => { const raw = readFileSync(f); return (f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); };
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const out = [];
for (const lane of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
  for (const round of readdirSync(join(dir, lane)).sort()) {
    const run = join(dir, lane, round, 'run');
    const file = ['results.jsonl', 'results.jsonl.gz'].map((n) => join(run, n)).find(existsSync);
    if (!file) continue;
    const stats = new Map();
    const sdir = join(run, 'engine-stats');
    if (existsSync(sdir)) for (const s of readdirSync(sdir)) for (const o of read(join(sdir, s))) { const l = o.stats ?? o; if (l.command === 'drag' && l.wall) stats.set(l.wall.press_ms, l); }
    for (const r of read(file).filter((x) => x.kind === 'drop-signal' && (x.base ?? x.cell) === 'left')) {
      const st = r.wall ? stats.get(r.wall.press_ms) : undefined;
      const t = chromeDropVerdict([r], { plan: 't14-floor' }).counts;
      const took = r.hold?.taken === true;
      const outcome = !took ? 'untaken' : t.stale_drops ? 'stale' : t.false_ok ? 'false ok' : t.ambiguous ? 'ambiguous' : t.landed ? 'landed' : r.ok === true ? 'honest' : 'refused';
      const take = r.hold?.take_after_press_ms;
      const floorUntil = r.hold?.floor_until_ms;
      const lastStep = r.hold?.path_ms;
      const release = r.wall ? r.wall.release_ms - r.wall.press_ms : NaN;
      const cur = (r.signals?.cursors ?? []).filter((c) => !c.named);
      const acceptAt = cur.findIndex((c) => String(c.image).startsWith('1dc3'));
      const leave = acceptAt >= 0 && cur.slice(acceptAt + 1).some((c) => String(c.image).startsWith('bd1d') && c.t_ms <= release);
      const sync = st?.release_sync ?? null;
      out.push({ lane, round, i: r.i, cold: r.cold, outcome, notice: r.reply_notice ?? r.notice ?? null, take, floor_until: floorUntil, last_step_after_take: lastStep - take, last_step_vs_floor_until: lastStep - take - floorUntil,
        release, release_after_take: release - take, schedule: sync?.schedule ?? null, open: sync?.open ?? null, motions: sync?.motions ?? null, visits_dropped: sync?.visits_dropped ?? null, skipped: sync?.skipped ?? null,
        past_floor_ms: sync?.past_floor_ms ?? null, added_ms: sync?.added_ms ?? null, activation: r.signals?.activation_after_release_ms ?? null, leave_seen: leave, joined: Boolean(st) });
    }
  }
}
if (flags.includes('--json')) { for (const r of out) console.log(JSON.stringify(r)); process.exit(0); }
console.log(`# ${dir}: Chrome t14-floor left, development, not counted\n`);
console.log('Times in ms after the press unless named. "last step" is the path\'s last step (`hold.path_ms`); "vs floor_until" is that step after the take less `hold.floor_until_ms`.\n');
console.log('| lane | round | # | cold | outcome | take | floor_until_ms | last step after the take | last step vs floor_until | release | release after the take | schedule | motions | visits_dropped | skipped | past_floor_ms | activation after the release | leave seen before the release |');
console.log('|---|---|---:|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---|---:|---:|---|');
for (const r of out) console.log(`| ${r.lane} | ${r.round} | ${r.i} | ${r.cold ? 'cold' : 'warm'} | ${r.outcome}${r.outcome === 'honest' && r.notice ? (/unconfirmed drop/.test(r.notice) ? ' (unconfirmed)' : ' (other notice)') : ''} | ${f1(r.take)} | ${f1(r.floor_until)} | ${f1(r.last_step_after_take)} | ${f1(r.last_step_vs_floor_until)} | ${f1(r.release)} | ${f1(r.release_after_take)} | ${r.schedule ?? (r.joined ? 'none' : 'not joined')} | ${r.motions ?? '–'} | ${r.visits_dropped ?? '–'} | ${r.skipped ?? '–'} | ${f1(r.past_floor_ms ?? NaN)} | ${f1(r.activation ?? NaN)} | ${r.leave_seen ? 'yes' : 'no'} |`);
const classes = ['landed', 'stale', 'false ok', 'honest', 'untaken', 'ambiguous', 'refused'];
const vd = [0, 1, 2, null];
const name = (v) => (v == null ? 'no record' : String(v));
console.log(`\nRows ${out.length}; joined to a --stats line ${out.filter((r) => r.joined).length}.\n`);
console.log(`| outcome \\ visits_dropped | ${vd.map(name).join(' | ')} | all |`);
console.log(`|---|${vd.map(() => '---:').join('|')}|---:|`);
for (const c of classes) {
  const rs = out.filter((r) => r.outcome === c);
  if (!rs.length && !['landed', 'stale', 'false ok', 'honest', 'untaken'].includes(c)) continue;
  console.log(`| ${c} | ${vd.map((v) => rs.filter((r) => (r.visits_dropped ?? null) === v).length).join(' | ')} | ${rs.length} |`);
}
console.log(`| all | ${vd.map((v) => out.filter((r) => (r.visits_dropped ?? null) === v).length).join(' | ')} | ${out.length} |`);
const sched = {};
for (const r of out) { const k = `${r.outcome} / ${r.schedule ?? 'none'}`; sched[k] = (sched[k] ?? 0) + 1; }
console.log(`\nOutcome by schedule: ${Object.entries(sched).map(([k, v]) => `${k}: ${v}`).join('; ')}.`);
const fo = out.filter((r) => r.outcome === 'false ok' || r.outcome === 'stale');
console.log(`\nFalse oks and stale drops: ${fo.length}. ${fo.length ? (fo.every((r) => (r.visits_dropped ?? 0) > 0) ? 'Every one had a dropped visit.' : `Not every one had a dropped visit: ${fo.filter((r) => !((r.visits_dropped ?? 0) > 0)).map((r) => `${r.lane} ${r.round} #${r.i} (${r.outcome}, visits_dropped ${r.visits_dropped ?? 'no record'})`).join('; ')}.`) : 'None, so the question does not arise.'}`);
const noLeave = out.filter((r) => r.outcome !== 'untaken' && !r.leave_seen);
console.log(`Taken rows without the leave seen before the release: ${noLeave.length}${noLeave.length ? ` (${noLeave.map((r) => `${r.round} #${r.i} ${r.outcome}`).join('; ')})` : ''}.`);
