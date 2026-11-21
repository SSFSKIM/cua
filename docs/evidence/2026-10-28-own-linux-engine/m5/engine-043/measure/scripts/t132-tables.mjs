#!/usr/bin/env node
// Task 132: the tables of one alternating set, read-only, judged by H7.1's own judge. Every drop-signals row of every
// lane's runs, per engine lane, through drop-signals-judge.mjs `chromeDropVerdict` (ruling 957's stale-position judge
// with 961's 3 px margin) as the plan named on the command line judges them; each row is classed by the same judge run
// on that row alone, so a false ok or a stale drop here is exactly the judge's. Joined to the engine's `--stats` line
// (run/engine-stats/, by the drag's wall press time) for the step's record (`release_sync`: the gate, the schedule, the
// motions, the visits dropped, the added time). Chrome's activation after the release and the cursor image before the
// drag-end cursor are task 130's act.py reading, here per lane and cell. Development runs, never counted.
//   node t132-tables.mjs <harness repo> <set dir> <judge plan> [--rows]
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const [repo, dir, plan, ...flags] = process.argv.slice(2);
const { chromeDropVerdict, landingOf } = await import(pathToFileURL(join(repo, 'scripts/linux-engine-diff/drop-signals-judge.mjs')).href);
const judgePlan = plan === 'none' ? null : plan;
const read = (f) => { const raw = readFileSync(f); return (f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); };
const q = (xs, p) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : NaN; };
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const tri = (xs) => (xs.length ? `${f1(q(xs, 0.5))} / ${f1(q(xs, 0.95))} / ${f1(Math.max(...xs))}` : '–');
const lanes = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const one = (r) => chromeDropVerdict([r], { plan: judgePlan }).counts;
const all = [];
const verdicts = [];
for (const lane of lanes) {
  const rows = [];
  for (const round of readdirSync(join(dir, lane)).sort()) {
    const run = join(dir, lane, round, 'run');
    const file = ['results.jsonl', 'results.jsonl.gz'].map((n) => join(run, n)).find(existsSync);
    if (!file) continue;
    const stats = new Map();
    const sdir = join(run, 'engine-stats');
    if (existsSync(sdir)) for (const s of readdirSync(sdir)) for (const o of read(join(sdir, s))) { const l = o.stats ?? o; if (l.command === 'drag' && l.wall) stats.set(l.wall.press_ms, l); if (l.command === 'drag_handle' && l.handle?.release_wall_ms) stats.set(`h${l.handle.release_wall_ms}`, l); }
    for (const r of read(file).filter((x) => x.kind === 'drop-signal')) {
      rows.push(r);
      const st = r.wall ? (stats.get(r.wall.press_ms) ?? stats.get(`h${r.wall.release_ms}`)) : undefined;
      const t = one(r);
      const cls = t.stale_drops ? 'STALE' : t.false_ok ? 'FALSE OK' : t.ambiguous ? 'ambiguous' : t.landed ? 'landed' : r.ok === true ? 'honest' : 'refused';
      const sync = st?.release_sync ?? null;
      const cur = (r.signals?.cursors ?? []).filter((x) => !x.named);
      const endAt = cur.findIndex((x) => String(x.image).startsWith('b46b') && x.t_ms > 150);
      const prev = endAt > 0 ? String(cur[endAt - 1].image).slice(0, 4) : 'none';
      all.push({ lane, round, i: r.i, cold: r.cold, cell: r.base ?? r.cell, cls, landing: landingOf(r), took: r.outcome?.started, notice: ((t) => (t == null ? null : /went on past the engine's settle time/.test(t) ? 'outlasted' : /unconfirmed drop/.test(t) ? 'unconfirmed' : r.reply_notice ? 'hold' : 'other'))(r.reply_notice ?? r.notice ?? null),
        activation: r.signals?.activation_after_release_ms ?? null, cursor_end: { bd1d: 'nodrop', '1dc3': 'accept' }[prev] ?? 'other', confirmed_by: r.after_release?.confirmed_by ?? null,
        gap: r.wall && r.hold ? r.wall.release_ms - r.wall.press_ms - r.hold.path_ms : NaN, after_take_ms: r.after_take?.release_after_take_ms ?? null, keepalives: r.hold?.keepalives ?? null, sync, joined: Boolean(st), ms: r.ms,
        // a handle end's tail (ruling 1026, f15e1f09 on): `--stats` `handle.release_sync`
        handle_tail: r.handle?.release_sync ?? st?.handle?.release_sync ?? null });
    }
  }
  const v = chromeDropVerdict(rows, { plan: judgePlan });
  verdicts.push({ lane, v });
}
const cells = [...new Set(all.map((r) => r.cell))];
console.log(`# ${dir} (judged as ${plan})\n`);
console.log('| lane | cell | drags | joined to stats | landed | stale-position drop | false ok | ambiguous | honest (unconfirmed / outlasted (c) / hold / other) | refused | never took | Chrome activated after the release | ended on the no-drop image / accept / other | gate open / shut | schedule after_path / in_floor | visits dropped (1 / 2 = skipped) | step added ms p50 / p95 / max | in-floor past the floor ms p50 / max |');
console.log('|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---|---|---|---|---|---|');
for (const cell of cells) for (const lane of lanes) {
  const rs = all.filter((r) => r.lane === lane && r.cell === cell);
  if (!rs.length) continue;
  const n = (c) => rs.filter((r) => r.cls === c).length;
  const hon = rs.filter((r) => r.cls === 'honest');
  const s = rs.filter((r) => r.sync);
  const open = s.filter((r) => r.sync.open === true);
  const inFloor = s.filter((r) => r.sync.in_floor === true || r.sync.schedule === 'in_floor');
  const after = s.filter((r) => r.sync.schedule === 'after_path');
  const vd = (k) => s.filter((r) => r.sync.visits_dropped === k).length;
  const added = s.map((r) => r.sync.added_ms).filter(Number.isFinite);
  const past = inFloor.map((r) => r.sync.past_floor_ms).filter(Number.isFinite);
  const ce = (k) => rs.filter((r) => r.cursor_end === k).length;
  console.log(`| ${lane} | ${cell} | ${rs.length} | ${rs.filter((r) => r.joined).length} | ${n('landed')} | ${n('STALE')} | ${n('FALSE OK')} | ${n('ambiguous')} | ${hon.length} (${hon.filter((r) => r.notice === 'unconfirmed').length} / ${hon.filter((r) => r.notice === 'outlasted').length} / ${hon.filter((r) => r.notice === 'hold').length} / ${hon.filter((r) => r.notice === 'other' || !r.notice).length}) | ${n('refused')} | ${rs.filter((r) => r.took === false).length} | ${rs.filter((r) => r.activation != null).length} | ${ce('nodrop')} / ${ce('accept')} / ${ce('other')} | ${s.length ? `${open.length} / ${s.length - open.length}` : '–'} | ${s.length ? `${after.length} / ${inFloor.length}` : '–'} | ${s.length ? `${vd(1)} / ${vd(2)}` : '–'} | ${tri(added)} | ${past.length ? `${f1(q(past, 0.5))} / ${f1(Math.max(...past))}` : '–'} |`);
}
const tails = all.filter((r) => r.handle_tail);
if (tails.length) {
  console.log('\nThe handle end\'s tail (`--stats` `handle.release_sync`, ruling 1026):\n');
  console.log('| lane | cell | handle drags with a record | tail ran | not run, and why | motions (count: drags) | one-point handles | take_after_the_sample (true / recorded) | stopped_for_motion (true / recorded) | added ms p50 / p95 / max |');
  console.log('|---|---|---:|---:|---|---|---:|---|---|---|');
  for (const cell of cells) for (const lane of lanes) {
    const rs = tails.filter((r) => r.lane === lane && r.cell === cell);
    if (!rs.length) continue;
    const ran = rs.filter((r) => r.handle_tail.ran === true);
    const why = {};
    for (const r of rs.filter((x) => x.handle_tail.ran !== true)) why[r.handle_tail.why_not ?? 'none given'] = (why[r.handle_tail.why_not ?? 'none given'] ?? 0) + 1;
    const motions = {};
    for (const r of ran) motions[r.handle_tail.motions] = (motions[r.handle_tail.motions] ?? 0) + 1;
    console.log(`| ${lane} | ${cell} | ${rs.length} | ${ran.length} | ${Object.entries(why).map(([k, v]) => `${v}: ${k}`).join('; ') || '–'} | ${Object.entries(motions).map(([k, v]) => `${k}: ${v}`).join(', ') || '–'} | ${ran.filter((r) => r.handle_tail.one_point).length} | ${rs.filter((r) => r.handle_tail.take_after_the_sample === true).length} / ${rs.filter((r) => 'take_after_the_sample' in r.handle_tail).length} | ${rs.filter((r) => r.handle_tail.stopped_for_motion === true).length} / ${rs.filter((r) => 'stopped_for_motion' in r.handle_tail).length} | ${tri(ran.map((r) => r.handle_tail.added_ms).filter(Number.isFinite))} |`);
  }
}
console.log('\nThe judge per lane (H7.1 `chromeDropVerdict`, the lane\'s rows of every round together):\n');
// the plan's cell counts are this set's own (rounds x caps), so the judge's count checks against a plan manifest are left out
for (const { lane, v } of verdicts) { const failed = v.failed.filter((m) => !/drags the plan does not name|of the plan's \d+ drags ran/.test(m)); console.log(`- ${lane}: ${failed.length ? `**fails:** ${failed.join('; ')}` : 'no fail'}${v.findings?.length ? `; findings: ${v.findings.join('; ')}` : ''}`); }
const residue = all.filter((r) => r.cls === 'FALSE OK' || r.cls === 'STALE');
console.log(`\nThe residue: every false ok and stale-position drop (${residue.length}).\n`);
if (residue.length) {
  console.log('| lane | round | # | cold | cell | class | activation after the release (ms) | cursor before the end | confirmed_by | after take to release (ms) | keepalives | last step to release (ms) | gate | schedule, motions, visits dropped, added ms |');
  console.log('|---|---|---:|---|---|---|---:|---|---|---:|---:|---:|---|---|');
  for (const r of residue) console.log(`| ${r.lane} | ${r.round} | ${r.i} | ${r.cold ? 'cold' : 'warm'} | ${r.cell} | ${r.cls} | ${f1(r.activation ?? NaN)} | ${r.cursor_end} | ${(r.confirmed_by ?? 'none').replace(/\(\d+\)/, '')} | ${f1(r.after_take_ms ?? NaN)} | ${r.keepalives ?? '–'} | ${f1(r.gap)} | ${r.sync ? (r.sync.open ? 'open' : `shut (spaced ${r.sync.last_step_spaced})`) : '–'} | ${r.sync ? `${r.sync.schedule ?? '–'}, ${r.sync.motions ?? 0}, ${r.sync.visits_dropped ?? 0}, ${f1(r.sync.added_ms)}` : '–'} |`);
}
// the coordinator's ruling 1023: every in-floor row where the tail dropped a visit, one by one
const dropped = all.filter((r) => r.sync?.schedule === 'in_floor' && (r.sync.visits_dropped ?? 0) > 0);
console.log(`\nIn-floor rows with a visit dropped (ruling 1023): ${dropped.length}.\n`);
if (dropped.length) {
  console.log('| lane | round | # | cold | cell | class | visits_dropped | skipped | activation after the release (ms) | past_floor_ms |');
  console.log('|---|---|---:|---|---|---|---:|---|---:|---:|');
  for (const r of dropped) console.log(`| ${r.lane} | ${r.round} | ${r.i} | ${r.cold ? 'cold' : 'warm'} | ${r.cell} | ${r.cls}${r.cls === 'honest' && r.notice ? ` ${r.notice}` : ''} | ${r.sync.visits_dropped} | ${r.sync.skipped} | ${r.activation == null ? 'none' : f1(r.activation)} | ${f1(r.sync.past_floor_ms ?? NaN)} |`);
}
if (flags.includes('--rows')) for (const r of all) console.log(JSON.stringify(r));
