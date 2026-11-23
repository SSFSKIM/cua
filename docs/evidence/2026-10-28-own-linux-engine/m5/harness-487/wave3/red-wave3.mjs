// Task 142 fix wave 3: each of the six findings as a constructed row (or fixture), judged by 4e0ba0a9's judge
// (argv[2], whose t17-fix3 check takes `cuaVersion`) and by the working copy (argv[3], which takes `meta`).
import { pathToFileURL } from 'node:url';
import { dropRow } from '/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/harness-487/test/linux-engine-diff/drop-rows.mjs';

const [oldJ, newJ] = await Promise.all(process.argv.slice(2, 4).map((p) => import(pathToFileURL(p).href)));
const V043 = 'cua-engine 0.4.3 (ba5b043834ce)';
const V044 = 'cua-engine 0.4.4 (23f342178d94)';
const settle = (rest = 30) => ({ second_rest: 'needless', settled: true, rest_ms: rest });
const read = (x = {}) => ({ steps: [], accepted: true, error: null, ...x });
const row = (i, { lane = 'cua', cell = 'plain', count = { before: 3, after: 4, entered: 1, before_from: 7, after_from: 9 }, cursor = read({ settle: settle() }), handle } = {}) => ({ ...dropRow({ family: 'electron', lane, cell, i }), settle_count: count, drop_cursor: cursor, ...(handle ? { handle } : lane === 'cua:handle' ? { handle: { pressed: true, hold: { taken: true }, drop_cursor: cursor } } : {}) });
const strip = (c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'settle'));
const judge = (J, rows, meta) => {
  const cells = new Map();
  for (const r of rows) cells.set(`${r.lane}|${r.cell}`, { lane: r.lane, cell: r.cell, n: (cells.get(`${r.lane}|${r.cell}`)?.n ?? 0) + 1 });
  const v = J.electronDropVerdict(rows, { specs: [...cells.values()], plan: 't17-fix3', cuaVersion: meta.cua_version, meta });
  return v.failed.filter((f) => /#487/.test(f)).length;
};
const pinned = (version, candidate) => ({ kind: 'meta', gate: 'pinned', cua_version: version, candidate: { version: candidate, sha256: 'f'.repeat(64), attestation: { attestations: [{ subjects: [{ name: `cua-engine-${candidate.split(' ')[1]}-linux-x64`, sha256: 'f'.repeat(64) }] }] } } });
const dev = { kind: 'meta', gate: false, cua_version: V044 };

const cells14 = [['cua', 'plain', 100], ['cua', 'left', 30], ['cua', 'inzone-out', 30], ...['root', 'xterm', 'other', 'slow'].map((c) => ['cua:desktop', c, 30]), ['cua:handle', 'plain', 100], ['cua:handle', 'left', 30], ['cua:handle', 'inzone-out', 30], ...['root', 'xterm', 'other', 'slow'].map((c) => ['cua:handle', c, 30])];
const cases = {
  'P1 2, a lost stats line {4,4,0}, landed, no settle record': [[row(0), row(1, { count: { before: 4, after: 4, entered: 0 }, cursor: read() })], dev],
  'P2 3, cua_version 0.4.3 on a run whose candidate is 0.4.4, rests missing': [[row(0, { cursor: read({ settle: { settled: true } }) })], pinned(V043, V044)],
  'P2 4, {before 0, after 1, entered 0}, no record': [[row(0), row(1, { count: { before: 0, after: 1, entered: 0, before_from: 'fresh', after_from: 2 }, cursor: read() })], dev],
  "P2 5, a plain drag's settle moved into handle.drop_cursor": [[row(0), row(1, { cursor: read(), handle: { drop_cursor: read({ settle: settle() }) } })], dev],
  'P2 6, 560 drops reading zero, no records': [cells14.flatMap(([lane, cell, n]) => Array.from({ length: n }, (_, i) => row(i, { lane, cell, count: { before: 0, after: 0, entered: 0, before_from: 'fresh', after_from: 1 }, cursor: read() }))), pinned(V044, V044)],
};
for (const [name, [rows, meta]] of Object.entries(cases)) console.log(`${name}: #487 fails at 4e0ba0a9 ${judge(oldJ, rows, meta)}, now ${judge(newJ, rows, meta)}`);

// P1 1, the harness: the named path from xdotool's origin (4e0ba0a9's clientOrigin) against xwininfo's (now), the
// engine adding the real origin (961, 262); and the judge's exercised proof for a drop with no aim record
const real = { x: 961, y: 262 };
const press = (origin) => ({ x: real.x + (530 - origin.x), y: real.y + (128 - origin.y) });
console.log(`P1 1, the press for (530, 128): from xdotool's (962, 284) at ${JSON.stringify(press({ x: 962, y: 284 }))}, from xwininfo's (961, 262) at ${JSON.stringify(press(real))}`);
const namedRow = { ...dropRow({ family: 'electron', lane: 'cua:named-gtk4', i: 0 }), route: 'foreground', drag_pacing: { family: 'GTK 4', rest_ms: 0 }, drop_cursor: read({ settle: settle() }), settle_count: { before: 0, after: 1, entered: 1, before_from: 'fresh', after_from: 1 } };
console.log(`P1 1, a named drop with no aim record: unproven at 4e0ba0a9 ${JSON.stringify(oldJ.namedSourceUnproven(namedRow))}, now ${JSON.stringify(newJ.namedSourceUnproven(namedRow))}`);
