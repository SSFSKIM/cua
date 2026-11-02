// analyze.mjs <run-dir> [--json]: the cold short drops of a run-cold.sh run, each drag joined to the X request record
// (press, every motion, release, by the engine's client) and the page's pointer log. Per drag: the mode (L landed,
// A no dragstart, B dragstart and no drop), and in ms after the press, on the X server's clock: the first motion past
// Blink's 4 px threshold, the take of XdndSelection, the release; on the page's clock, the handler times of the first
// move past the threshold, dragstart and the mouseup. Then per lane the distributions.
import { readFileSync } from 'node:fs';

const [dir, ...flags] = process.argv.slice(2);
const lines = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
// the dnd experiment's rows, or the differential run's short drop in front (OP), shaped alike: the take from the record
const OP = process.env.OP ?? 'chrome_dnd_short_in_front_shared';
const rows = lines(`${dir}/diff/results.jsonl`)
  .filter((r) => r.kind === 'dnd-run' || (r.kind === 'sample' && r.op === OP))
  .map((r) => (r.kind === 'dnd-run' ? r : { ...r, engine: `${r.engine}:${r.series}`, dropped: r.effect === true, page_counts: r.drop_status, page_log: r.drop_status?.after?.log ?? null, stats_after_take: r.after_take }));
const req = lines(`${dir}/reqwatch.jsonl`).filter((r) => r.kind);
const isButton = (x, ev) => (x.kind === 'send_event' || x.kind === 'fake_input') && x.event === ev && x.detail === 1;
const presses = req.filter((x) => isButton(x, 'button_press'));
const THRESHOLD = 4;

export function analyzeRow(r) {
  const pc = r.page_counts ?? {};
  const b = pc.before ?? {};
  const a = pc.after ?? {};
  const mode = r.dropped ? 'L' : a.starts === b.starts && a.downs === b.downs + 1 ? 'A' : a.starts === b.starts + 1 ? 'B' : '?';
  // the press the page saw: its wall clock (`at`, epoch ms modulo 1e9) against the record's
  const at = a.at;
  let press = null;
  for (const p of presses) if (Math.abs((p.wall_ms % 1e9) - at) < 1500 && (!press || Math.abs((p.wall_ms % 1e9) - at) < Math.abs((press.wall_ms % 1e9) - at))) press = p;
  const tw = r.stats_extra?.take_wait;
  const out = { engine: r.engine, i: r.i, ms: r.ms, mode, ok: r.ok, variant_stats: r.stats_after_take ?? null, cand: tw ? { atomic_until: tw.atomic_until, stray_before_take: tw.stray?.before_take ?? null, stray: tw.stray?.events?.length ?? null, take_wait: tw.take_wait, taken: tw.taken } : null };
  const log = r.page_log;
  if (log) {
    const past = log.past === null ? null : log.moves[log.past];
    out.page = {
      moves: log.moves.length,
      past_h: past?.h ?? null,
      past_t: past?.t ?? null,
      first_move_h: log.moves[0]?.h ?? null,
      coalesced_first: log.moves[0]?.coalesced ?? null,
      start_h: log.start?.h ?? null,
      up_h: log.up?.h ?? null,
      end_h: log.end?.h ?? null,
      buttons: [...new Set(log.moves.map((m) => m.buttons))],
    };
  }
  if (!press) return { ...out, press: null };
  const release = req.find((x) => isButton(x, 'button_release') && x.client === press.client && x.server_time >= press.server_time);
  const motions = req.filter((x) => x.kind === 'motion' && x.client === press.client && x.server_time >= press.server_time && (!release || x.server_time <= release.server_time) && req.indexOf(x) > req.indexOf(press));
  const crossing = motions.find((m) => Math.abs(m.x - press.x) >= THRESHOLD || Math.abs(m.y - press.y) >= THRESHOLD);
  const recordTake = req.find((x) => x.kind === 'set_selection_owner' && x.selection === 466 && x.owner !== 0 && x.client !== press.client && x.server_time >= press.server_time && x.server_time <= (release?.server_time ?? Infinity) + 300);
  const take = (r.xdnd_owners ?? []).find((o) => o.owner !== 0) ?? (recordTake ? { timestamp: recordTake.server_time } : undefined);
  const t0 = press.server_time;
  out.x = {
    via: press.kind,
    motions: motions.length,
    states: [...new Set(motions.map((m) => m.state))],
    cross: crossing ? crossing.server_time - t0 : null,
    take: take ? take.timestamp - t0 : null,
    release: release ? release.server_time - t0 : null,
    steps_before_take: take ? motions.filter((m) => m.server_time <= take.timestamp).length : null,
    steps_after_take: take ? motions.filter((m) => m.server_time > take.timestamp).length : null,
    // a real pointer motion (XTEST) by another client around the press: the stray nudge
    stray: (() => {
      const m = req.find((x) => x.kind === 'motion' && x.via === 'fake_input' && x.client !== press.client && x.server_time >= t0 - 100 && x.server_time <= (release?.server_time ?? t0 + 500));
      return m ? m.server_time - t0 : null;
    })(),
  };
  return out;
}

const q = (xs, p) => {
  const s = xs.filter((x) => typeof x === 'number').sort((m, n) => m - n);
  if (!s.length) return null;
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
};
const dist = (xs) => {
  const s = xs.filter((x) => typeof x === 'number');
  return s.length ? `n ${s.length} min ${q(s, 0)} p50 ${q(s, 0.5)} p90 ${q(s, 0.9)} p95 ${q(s, 0.95)} p99 ${q(s, 0.99)} max ${q(s, 1)}` : 'none';
};

const all = rows.map(analyzeRow);
if (flags.includes('--json')) for (const d of all) console.log(JSON.stringify(d));
for (const lane of [...new Set(all.map((d) => d.engine))]) {
  const ds = all.filter((d) => d.engine === lane);
  const modes = Object.fromEntries(['L', 'A', 'B', '?'].map((m) => [m, ds.filter((d) => d.mode === m).length]));
  console.log(`\n## ${lane}: ${ds.length} drags, modes ${JSON.stringify(modes)}, unmatched presses ${ds.filter((d) => !d.x).length}`);
  console.log(`  ms (answer)          ${dist(ds.map((d) => d.ms))}`);
  console.log(`  press→cross (X)      ${dist(ds.map((d) => d.x?.cross))}`);
  console.log(`  press→take (X)       ${dist(ds.map((d) => d.x?.take))}`);
  console.log(`  press→release (X)    ${dist(ds.map((d) => d.x?.release))}`);
  console.log(`  steps before take    ${dist(ds.map((d) => d.x?.steps_before_take))}`);
  console.log(`  take→release (X)     ${dist(ds.map((d) => (d.x?.take != null && d.x?.release != null ? d.x.release - d.x.take : null)))}`);
  console.log(`  page: past move h    ${dist(ds.map((d) => d.page?.past_h))}`);
  console.log(`  page: dragstart h    ${dist(ds.map((d) => d.page?.start_h))}`);
  console.log(`  page: coalesced 1st  ${dist(ds.map((d) => d.page?.coalesced_first))}`);
  if (ds.some((d) => d.cand)) console.log(`  candidate: stray seen ${ds.filter((d) => d.cand?.stray > 0).length}, stray before take ${ds.filter((d) => d.cand?.stray_before_take > 0).length}, A with stray seen ${ds.filter((d) => d.mode === 'A' && d.cand?.stray > 0).length}, atomic ${ds.filter((d) => d.cand?.atomic_until != null).length}`);
  for (const d of ds.filter((x) => x.mode !== 'L')) console.log(`  miss ${d.mode} i${d.i} ${JSON.stringify({ ms: d.ms, x: d.x, page: d.page })}`);
}
