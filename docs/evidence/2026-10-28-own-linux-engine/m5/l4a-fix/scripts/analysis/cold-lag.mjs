// Task 98: how far Electron's drag loop ran behind the pointer in a handle's cold and warm drags, from stored rows.
// For each run and cell of the cua:handle lane: the first status after the take (the loop's first answer to a motion),
// the accept, and where each fell against the release, split cold and warm.
// usage: node cold-lag.mjs <label>=<results.jsonl[.gz]>...
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const ACCEPT = '1dc357097b1e7b9e';
const q = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const fmt = (xs) => (xs.length ? `n=${xs.length} min ${q(xs, 0)} med ${q(xs, 0.5)} max ${Math.max(...xs)}` : 'n=0');
const r1 = (v) => Math.round(v * 10) / 10;

function read(file) {
  const raw = readFileSync(file);
  return (file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}

function one(row) {
  const lines = row.watch ?? [];
  const take = lines.find((l) => l.kind === 'take' && l.owner !== 0);
  const releaseWall = row.wall?.release_ms ?? row.handle?.release_wall_ms;
  if (!take || !releaseWall) return null;
  const off = Math.min(...lines.filter((l) => typeof l.server_time === 'number').map((l) => l.wall_ms - l.server_time));
  const release = releaseWall - off - take.server_time;
  const cursors = lines.filter((l) => l.kind === 'cursor' && !l.named).map((l) => ({ t: l.server_time - take.server_time, accept: l.image === ACCEPT, serial: l.serial, after: l.wall_ms >= releaseWall }));
  // the loop's own cursor comes at the take (within 1 ms of it, twice); the first status is the next change
  const status = cursors.filter((c) => c.t >= 1 && !(c.t <= 1 && !c.accept));
  const first = cursors.find((c) => c.t > 1) ?? null;
  const accept = cursors.find((c) => c.accept) ?? null;
  const before = cursors.filter((c) => !c.after);
  const shown = before.at(-1) ?? null;
  let lastAccept = -1;
  before.forEach((c, k) => { if (c.accept) lastAccept = k; });
  const withdrawn = lastAccept >= 0 && lastAccept < before.length - 1 ? before[lastAccept + 1] : null;
  return {
    release: r1(release),
    first_status: first ? first.t : null,
    accept: accept ? accept.t : null,
    accept_after_release: accept ? accept.after : null,
    accept_at_release: shown?.accept === true,
    margin: withdrawn && !shown?.accept ? r1(release - withdrawn.t) : null,
    statuses: status.length,
  };
}

for (const arg of process.argv.slice(2)) {
  const [label, file] = arg.split('=');
  const rows = read(file).filter((r) => r.kind === 'drop-signal' && r.lane === 'cua:handle');
  console.log(`\n# ${label} (${rows[0]?.load ?? '?'}; ${rows.length} handle drags)`);
  for (const cell of ['plain', 'left', 'inzone-out']) {
    for (const cold of [true, false]) {
      const list = rows.filter((r) => r.cell === cell && r.cold === cold).map((row) => ({ row, t: one(row) })).filter((x) => x.t);
      if (!list.length) continue;
      const falseOk = list.filter((x) => x.row.ok && !x.row.notice && x.row.outcome?.landed === false);
      const landed = list.filter((x) => x.row.outcome?.landed);
      const unconfirmedLanded = landed.filter((x) => x.row.notice);
      console.log(`${cell.padEnd(10)} ${cold ? 'cold' : 'warm'} ${String(list.length).padStart(3)} | first status after take: ${fmt(list.filter((x) => x.t.first_status != null).map((x) => x.t.first_status))} | accept: ${fmt(list.filter((x) => x.t.accept != null).map((x) => x.t.accept))} | release: ${fmt(list.map((x) => x.t.release))}`);
      console.log(`${''.padEnd(19)} | accept put up after the release ${list.filter((x) => x.t.accept_after_release).length}; shown at the release ${list.filter((x) => x.t.accept_at_release).length}; withdrawn before it, margin ms: ${fmt(list.filter((x) => x.t.margin != null).map((x) => x.t.margin))} | landed ${landed.length}, of them unconfirmed ${unconfirmedLanded.length}; ok with no drop and nothing pending ${falseOk.length}`);
    }
  }
}
