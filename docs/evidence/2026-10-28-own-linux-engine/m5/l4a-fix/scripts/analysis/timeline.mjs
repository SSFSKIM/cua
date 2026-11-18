// Task 98 (L4a's false ok): each cua:handle drag's timeline from the stored rows of a drop-signals run.
// usage: node timeline.mjs <results.jsonl[.gz]> [--cell left] [--lane cua:handle] [--rows] [--row <cell>:<i>]
// Times are ms after the take on the X server's clock where the watch gives one (cursor changes, the take); the release
// has only a wall time (the engine's release_wall_ms), mapped to the server's clock by the drag's smallest
// wall-minus-server offset among its watch lines (the watch reads an event at or after the server made it).
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const file = args[0];
const opt = (name, d = null) => { const k = args.indexOf(name); return k < 0 ? d : args[k + 1]; };
const flag = (name) => args.includes(name);
const wantCell = opt('--cell');
const wantLane = opt('--lane', 'cua:handle');
const one = opt('--row');
const raw = readFileSync(file);
const text = (file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8');
const rows = text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((r) => r && r.kind === 'drop-signal' && r.lane === wantLane && (!wantCell || r.cell === wantCell));

const ACCEPT = '1dc357097b1e7b9e';
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

export function timeline(row) {
  const lines = row.watch ?? [];
  const take = lines.find((l) => l.kind === 'take' && l.owner !== 0);
  if (!take) return { taken: false };
  const offs = lines.filter((l) => typeof l.server_time === 'number').map((l) => l.wall_ms - l.server_time);
  const off = Math.min(...offs);
  const serverOf = (wall) => wall - off;
  const t = (server) => server - take.server_time;
  const releaseWall = row.wall?.release_ms ?? row.handle?.release_wall_ms;
  const release = r1(t(serverOf(releaseWall)));
  const cursors = lines.filter((l) => l.kind === 'cursor' && !l.named).map((l) => ({ serial: l.serial, accept: l.image === ACCEPT, image: l.image.slice(0, 4), t: t(l.server_time), wall_after_release: r1(l.wall_ms - releaseWall) }));
  const before = cursors.filter((c) => c.wall_after_release < 0);
  const after = cursors.filter((c) => c.wall_after_release >= 0);
  const shownAtRelease = before.at(-1) ?? null;
  const firstAccept = before.find((c) => c.accept) ?? null;
  // the accept shown and withdrawn before the release: the last accept put up, and the next change after it
  let lastAcceptIdx = -1;
  before.forEach((c, k) => { if (c.accept) lastAcceptIdx = k; });
  const withdrawn = lastAcceptIdx >= 0 && lastAcceptIdx < before.length - 1 ? before[lastAcceptIdx + 1] : null;
  return {
    taken: true,
    press_to_take_wall: r1(take.wall_ms - row.wall.press_ms),
    take_server: take.server_time,
    release,
    cursors,
    accept_at: firstAccept?.t ?? null,
    last_accept_at: lastAcceptIdx >= 0 ? before[lastAcceptIdx].t : null,
    withdrawn_at: withdrawn?.t ?? null,
    margin: withdrawn ? r1(release - withdrawn.t) : null,
    accept_at_release: shownAtRelease?.accept === true,
    accept_age_at_release: shownAtRelease?.accept ? r1(release - shownAtRelease.t) : null,
    first_after_release: after[0] ? { accept: after[0].accept, image: after[0].image, wall_after_release: after[0].wall_after_release } : null,
  };
}

const q = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const summary = (xs) => (xs.length ? `n=${xs.length} min=${q(xs, 0)} p10=${q(xs, 0.1)} med=${q(xs, 0.5)} p90=${q(xs, 0.9)} max=${Math.max(...xs)}` : 'n=0');

if (one) {
  const [cell, i] = one.split(':');
  const row = rows.find((r) => r.cell === cell && r.i === Number(i));
  const tl = timeline(row);
  console.log(JSON.stringify({ lane: row.lane, cell: row.cell, i: row.i, cold: row.cold, ok: row.ok, landed: row.outcome?.landed, notice: row.notice ? 'pending' : null, confirmed_by: row.handle?.confirmed_by, ms: row.ms, engine: { motions: row.drop_cursor?.motions, last_motions: row.drop_cursor?.last_motions, since_entry: row.drop_cursor?.release_over?.since_entry, shown: row.drop_cursor?.shown?.serial, history: row.drop_cursor?.history?.map(([serial, time, named]) => [serial, time - tl.take_server, named]) }, ...tl }, null, 1));
  process.exit(0);
}

const byCell = new Map();
for (const row of rows) {
  if (!byCell.has(row.cell)) byCell.set(row.cell, []);
  byCell.get(row.cell).push({ row, tl: timeline(row) });
}
for (const [cell, list] of byCell) {
  const taken = list.filter((x) => x.tl.taken);
  const atRelease = taken.filter((x) => x.tl.accept_at_release);
  const withdrawn = taken.filter((x) => x.tl.withdrawn_at != null && !x.tl.accept_at_release);
  const never = taken.filter((x) => x.tl.accept_at == null);
  const falseOk = list.filter((x) => x.row.ok && !x.row.notice && x.row.outcome?.landed === false && x.row.outcome?.started);
  console.log(`\n== ${cell}: ${list.length} drags, ${list.filter((x) => x.row.cold).length} cold; taken ${taken.length}; landed ${list.filter((x) => x.row.outcome?.landed).length}; ok with nothing pending and no drop ${falseOk.length}`);
  console.log(`   accept shown at the release ${atRelease.length} (cold ${atRelease.filter((x) => x.row.cold).length}); withdrawn before it ${withdrawn.length}; never shown ${never.length}`);
  console.log(`   take to release, ms: ${summary(taken.map((x) => x.tl.release))}`);
  console.log(`   take to first accept, ms: ${summary(taken.filter((x) => x.tl.accept_at != null).map((x) => x.tl.accept_at))}`);
  console.log(`   withdrawal to release (margin), ms: ${summary(withdrawn.map((x) => x.tl.margin))}`);
  console.log(`   accept's age at the release, ms: ${summary(atRelease.map((x) => x.tl.accept_age_at_release))}`);
  if (flag('--rows')) {
    for (const { row, tl } of list) {
      const cs = (tl.cursors ?? []).map((c) => `${c.accept ? 'A' : c.image}@${c.t}${c.wall_after_release >= 0 ? '*' : ''}`).join(' ');
      console.log(`   ${String(row.i).padStart(3)} ${row.cold ? 'cold' : 'warm'} ok=${row.ok} notice=${row.notice ? 'y' : 'n'} landed=${row.outcome?.landed} ${row.handle?.confirmed_by ?? ''} | press>take ${tl.press_to_take_wall} | release@${tl.release} | ${cs}`);
    }
  }
}
