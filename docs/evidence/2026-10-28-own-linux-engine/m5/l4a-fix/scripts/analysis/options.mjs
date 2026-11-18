// Task 98: the fix options replayed over stored rows, each drag judged again by a rule it was not run under.
// Only rows answered by linux-engine-v0.4.0's rule are read: the pinned engine's own rows, or the prototype's
// unsettled lanes (`--drop-no-settle`). A replay changes no timing, so it says what a rule would have answered on the
// drags as they happened; a rule that waits (the settle, a floor) cannot be replayed and is measured live.
//   A   the loop's own word: the accept at the release counts only if the drag loop's cursor did not change again
//       between the release and the loop's end (from the harness's watch, which reads on past the release);
//   A'  the cursor the loop showed last, at its end, whatever the release read (the same watch);
//   C   the brief's direction: the accept counts only if it was put up after the pointer last changed place (from the
//       engine's own steps, in the server's order; the prototype's rows only).
// usage: node options.mjs <label>=<results.jsonl[.gz]>... [--lanes cua:handle,cua:handle-unsettled]
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const ACCEPT_X = '1dc357097b1e7b9e';
const argv = process.argv.slice(2);
const k = argv.indexOf('--lanes');
const lanes = k >= 0 ? argv[k + 1].split(',') : null;
const inputs = argv.filter((a, i) => a.includes('=') && (k < 0 || (i !== k && i !== k + 1)));
const read = (file) => {
  const raw = readFileSync(file);
  return (file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
};
const cursorOf = (r) => r.drop_cursor ?? r.handle?.drop_cursor ?? null;
/** What 0.4.0's rule answered: ok with nothing pending. On a settled lane, what it would have: the unsettled accept. */
const shippedOk = (r) => (cursorOf(r)?.settle?.asked ? (cursorOf(r)?.accept_unsettled ?? r.after_release?.release_over?.accept_unsettled) === true : r.ok === true && !r.notice);

function loopEnd(r) {
  const lines = r.watch ?? [];
  const rel = r.wall?.release_ms ?? r.handle?.release_wall_ms;
  const take = lines.find((l) => l.kind === 'take' && l.owner !== 0);
  if (!take || !rel) return null;
  const cur = lines.filter((l) => l.kind === 'cursor' && !l.named);
  const before = cur.filter((l) => l.wall_ms < rel);
  const end = lines.find((l) => l.kind === 'take' && l.owner === 0 && l.wall_ms >= rel);
  const post = cur.filter((l) => l.wall_ms >= rel && (!end || l.wall_ms <= end.wall_ms));
  const loops = new Set(before.filter((l) => l.server_time >= take.server_time - 2).map((l) => l.serial));
  // the loop's own changes after the release: every one but the last, which gives the pointer back to the window; a
  // lone change is the loop's own when its cursor is one the loop had shown before
  const own = post.length > 1 ? post.slice(0, -1) : post.filter((l) => loops.has(l.serial));
  const last = own.at(-1) ?? before.at(-1) ?? null;
  return { unchanged: own.length === 0, last_accept: last?.image === ACCEPT_X };
}

function afterArrival(r) {
  const c = cursorOf(r);
  if (!c?.steps || !c.shown) return null;
  let arrival = -1;
  let prev = null;
  let set = -1;
  c.steps.forEach((s, i) => {
    if (s[0] === 'm') {
      const place = `${s[2]},${s[3]}`;
      if (place !== prev) arrival = i;
      prev = place;
    } else if (s[0] === 'c' && s[2] === c.shown.serial) set = i;
  });
  return set > arrival;
}

for (const input of inputs) {
  const [label, file] = input.split('=');
  const rows = read(file).filter((r) => r.kind === 'drop-signal' && (!lanes || lanes.includes(r.lane)) && r.outcome?.started);
  console.log(`\n# ${label} (load ${rows[0]?.load}; ${rows.length} drags whose drag and drop began)`);
  console.log('| lane cell | drags | cold | landed | 0.4.0: ok | of them no drop | A: ok | no drop | A\': ok | no drop | C: ok | no drop | true oks kept: A / A\' / C |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|');
  const cells = new Map();
  for (const r of rows) {
    const key = `${r.lane} ${r.cell}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(r);
  }
  for (const [key, list] of cells) {
    const judged = list.map((r) => {
      const ok = shippedOk(r);
      const end = loopEnd(r);
      const c = afterArrival(r);
      const landed = r.outcome?.landed === true;
      return { r, ok, landed, a: ok && end?.unchanged === true, a2: end?.last_accept === true && (cursorOf(r)?.release_over?.xdnd_aware ?? r.after_release?.release_over?.xdnd_aware ?? !['root', 'xterm', 'other', 'slow', 'moved'].includes(r.base ?? r.cell)), c: c == null ? null : ok && c };
    });
    const n = (f) => judged.filter(f).length;
    const hasC = judged.some((j) => j.c != null);
    const ids = (f) => { const l = judged.filter(f); return l.length ? ` (${l.slice(0, 5).map((j) => `#${j.r.i}`).join(' ')})` : ''; };
    console.log(`| ${key} | ${list.length} | ${n((j) => j.r.cold)} | ${n((j) => j.landed)} | ${n((j) => j.ok)} | ${n((j) => j.ok && !j.landed)}${ids((j) => j.ok && !j.landed)} | ${n((j) => j.a)} | ${n((j) => j.a && !j.landed)}${ids((j) => j.a && !j.landed)} | ${n((j) => j.a2)} | ${n((j) => j.a2 && !j.landed)}${ids((j) => j.a2 && !j.landed)} | ${hasC ? n((j) => j.c) : '-'} | ${hasC ? `${n((j) => j.c && !j.landed)}${ids((j) => j.c && !j.landed)}` : '-'} | ${n((j) => j.ok && j.landed && j.a)}/${n((j) => j.ok && j.landed)} / ${n((j) => j.landed && j.a2)}/${n((j) => j.landed)} / ${hasC ? `${n((j) => j.ok && j.landed && j.c)}/${n((j) => j.ok && j.landed)}` : '-'} |`);
  }
}
