// Task 98: the settled engine's rows read from its own record (`drop_cursor.steps`, `.settle`, `.accept_unsettled`).
// usage: node settle.mjs <results.jsonl[.gz]> [--row <lane>/<cell>:<i>] [--false-oks] [--rows <lane>/<cell>]
// Without --row: per lane and cell, what answered, what the two rules say of the same read, and the sync waits.
// With --row: one drag's whole timeline on the server's clock, ms after the take: every motion, every cursor change,
// the two answers (in the server's order; an answer carries no time and is shown where it was read), the release.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const file = args[0];
const opt = (name) => { const k = args.indexOf(name); return k < 0 ? null : args[k + 1]; };
const raw = readFileSync(file);
const all = (file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
const rows = all.filter((r) => r.kind === 'drop-signal');
const ACCEPT_X = '1dc357097b1e7b9e';
const q = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const fmt = (xs) => (xs.length ? `n=${xs.length} med ${q(xs, 0.5)} p90 ${q(xs, 0.9)} max ${Math.max(...xs)}` : 'n=0');
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

const cursorOf = (r) => r.drop_cursor ?? r.handle?.drop_cursor ?? null;
const settleOf = (r) => cursorOf(r)?.settle ?? null;
const unsettledAccept = (r) => cursorOf(r)?.accept_unsettled ?? r.after_release?.release_over?.accept_unsettled ?? null;
const honest = (r) => (r.notice ? 'notice' : null);
const falseOk = (r) => r.ok === true && !r.notice && r.outcome?.started && r.outcome?.landed === false;

/** One drag's timeline from the engine's own steps, ms after the take on the server's clock. */
function timeline(r) {
  const c = cursorOf(r);
  if (!c?.steps) return null;
  const take = c.take_time;
  const images = new Map((c.history ?? []).map(([serial, , , image]) => [serial, image]));
  const accept = c.shown && c.accepted ? c.shown.image : null;
  let last = null;
  const out = [];
  for (const s of c.steps) {
    if (s[0] === 'm') { last = s[1]; out.push({ t: take == null ? null : s[1] - take, what: `motion to ${s[2] == null ? '(no place)' : `(${s[2]}, ${s[3]})`}` }); }
    else if (s[0] === 'c') { last = s[1]; out.push({ t: take == null ? null : s[1] - take, what: `cursor ${s[2]} image ${String(images.get(s[2]) ?? '?').slice(0, 4)}${accept && images.get(s[2]) === accept ? ' (the accept)' : ''}` }); }
    else out.push({ t: null, after: last == null || take == null ? null : last - take, what: `answer ${s[1]}` });
  }
  return { take, out };
}

const one = opt('--row');
if (one) {
  const lc = one.slice(0, one.lastIndexOf(':'));
  const i = one.slice(one.lastIndexOf(':') + 1);
  const [lane, cell] = lc.split('/');
  const r = rows.find((x) => x.lane === lane && x.cell === cell && (i.startsWith("b") ? x.block === Number(i.slice(1)) : x.i === Number(i)));
  if (!r) throw new Error(`no row ${one}`);
  const c = cursorOf(r);
  const tl = timeline(r);
  // the watch's lines after the release, on the wall clock (the engine's own read ends at the release)
  const releaseWall = r.wall?.release_ms ?? r.handle?.release_wall_ms;
  const takeLine = (r.watch ?? []).find((l) => l.kind === 'take' && l.owner !== 0);
  const off = Math.min(...(r.watch ?? []).filter((l) => typeof l.server_time === 'number').map((l) => l.wall_ms - l.server_time));
  console.log(`${r.lane} ${r.cell} #${r.i} ${r.cold ? 'cold' : 'warm'} load ${r.load}: ok=${r.ok} notice=${r.notice ? 'pending' : 'none'} landed=${r.outcome?.landed} confirmed_by=${r.handle?.confirmed_by ?? r.after_release?.confirmed_by}`);
  console.log(`  settle ${JSON.stringify(settleOf(r))}; 0.4.0's rule on this read: accept ${unsettledAccept(r)}; shown at the release: ${JSON.stringify(c?.shown)}; since_entry ${c?.release_over?.since_entry ?? r.after_release?.release_over?.since_entry}`);
  console.log(`  take at server time ${tl?.take}; release ${takeLine && releaseWall ? r1(releaseWall - off - takeLine.server_time) : '?'} ms after it (wall clock mapped to the server's)`);
  for (const s of tl?.out ?? []) console.log(`  ${s.t == null ? `   (after ${s.after})`.padStart(12) : String(s.t).padStart(12)}  ${s.what}`);
  for (const l of (r.watch ?? []).filter((l) => l.kind === 'cursor' && !l.named && l.wall_ms >= releaseWall)) console.log(`  ${String(l.server_time - takeLine.server_time).padStart(12)}  after the release (the harness's watch): cursor ${l.serial} image ${l.image.slice(0, 4)}${l.image === ACCEPT_X ? ' (the accept)' : ''}`);
  process.exit(0);
}

const listOf = opt('--rows');
const cells = new Map();
for (const r of rows) {
  const key = `${r.lane}/${r.cell}`;
  if (!cells.has(key)) cells.set(key, []);
  cells.get(key).push(r);
}
const meta = all.find((r) => r.kind === 'meta');
console.log(`run ${meta?.run} plan ${meta?.plan} load ${rows[0]?.load} engine ${meta?.cua_version}: ${rows.length} drags`);
for (const [key, list] of cells) {
  const cold = list.filter((r) => r.cold).length;
  const landed = list.filter((r) => r.outcome?.landed);
  const fo = list.filter(falseOk);
  const okQuiet = list.filter((r) => r.ok === true && !r.notice);
  const withSettle = list.filter((r) => settleOf(r)?.asked);
  const answered = (k) => withSettle.filter((r) => settleOf(r)?.[k]?.answered === true);
  const waits = (k) => answered(k).map((r) => r1(settleOf(r)[k].ms));
  const settled = withSettle.filter((r) => settleOf(r)?.settled === true);
  // what 0.4.0's rule answers on the same read: its accept, held to the window under the release
  const old = list.filter((r) => unsettledAccept(r) === true);
  const oldFalse = old.filter((r) => r.outcome?.landed === false);
  const turned = old.filter((r) => r.outcome?.landed && r.notice);
  console.log(`\n== ${key}: ${list.length} drags (${cold} cold); landed ${landed.length}; ok with nothing pending ${okQuiet.length}; false ok ${fo.length}${fo.length ? ` (${fo.slice(0, 6).map((r) => `#${r.i}/b${r.block}`).join(', ')})` : ''}; landed and unconfirmed ${landed.filter((r) => r.notice).length}`);
  if (withSettle.length) {
    console.log(`   settle asked ${withSettle.length}: answered before the rest ${answered('before_rest').length} (wait ms ${fmt(waits('before_rest'))}), after the last motion ${answered('after_motion').length} (wait ms ${fmt(waits('after_motion'))}); settled ${settled.length}`);
    console.log(`   0.4.0's rule on the same reads: accept ${old.length}, of them with no drop ${oldFalse.length}${oldFalse.length ? ` (${oldFalse.slice(0, 6).map((r) => `#${r.i}/b${r.block}`).join(', ')})` : ''}; true oks the settle turned unconfirmed ${turned.length}`);
  }
  console.log(`   answer ms: ${fmt(list.map((r) => r.ms))}`);
  if (listOf === key) {
    for (const r of list) console.log(`   #${r.i} b${r.block} ${r.cold ? 'cold' : 'warm'} ok=${r.ok} notice=${r.notice ? 'y' : 'n'} landed=${r.outcome?.landed} by=${r.handle?.confirmed_by ?? r.after_release?.confirmed_by} settle=${JSON.stringify(settleOf(r))} old=${unsettledAccept(r)} ms=${r.ms}`);
  }
}
