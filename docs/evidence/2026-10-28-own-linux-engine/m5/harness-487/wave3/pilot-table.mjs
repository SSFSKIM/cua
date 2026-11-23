// Task 142 fix wave 3: the named pilot's drops, one line each (ruling 1143 (c)): the press's root point, the window
// chain under it (the parked pointer's reading, named against the scene's and the named window's ids), the plain
// source's root rectangle, the proofs (`namedSourceUnproven`), and what the page and the engine recorded.
// usage: node pilot-table.mjs <judge.mjs> <results.jsonl>...
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [judgePath, ...files] = process.argv.slice(2);
const J = await import(pathToFileURL(judgePath).href);
for (const f of files) {
  const rows = readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const meta = rows.find((r) => r.kind === 'meta');
  const scene = rows.find((r) => r.kind === 'drop-signal-scene');
  const name = (id) => (id === scene.window ? 'electron' : id === scene.named?.id ? 'gtk4' : `0x${id.toString(16)}`);
  console.log(`## ${meta.cua_version}: electron window ${scene.window}, named GTK 4 ${scene.named?.id} client (${scene.named?.x}, ${scene.named?.y}) ${scene.named?.width}x${scene.named?.height}, frame ${JSON.stringify(scene.named?.frame)}`);
  console.log('| # | press (root) | parked at | chain under it | plain source (root) | inside | route | pacing | ok | press seq | started | taken | settle_count | rest_ms | unproven |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows.filter((x) => x.kind === 'drop-signal')) {
    const a = r.named?.aim ?? {};
    const s = r.drop_cursor?.settle;
    const c = r.settle_count;
    console.log(`| ${r.i} | (${a.root?.x}, ${a.root?.y}) | ${a.park?.at ? `(${a.park.at.x}, ${a.park.at.y})` : '–'}${a.park?.ok ? '' : ' refused'} | ${(a.park?.chain ?? []).map(name).join(' > ') || 'root'} | ${a.source ? `${a.source.x},${a.source.y} ${a.source.w}x${a.source.h}` : '–'} | ${a.inside} | ${r.route} | ${r.drag_pacing?.family} rest ${r.drag_pacing?.rest_ms} | ${r.ok} | ${r.before?.press?.seq}→${r.after?.press?.seq} | ${r.outcome?.started} | ${r.hold?.taken} | ${c ? `${c.before}→${c.after} (${c.entered}; ${c.before_from}/${c.after_from})` : 'null'} | ${s ? s.rest_ms ?? 'absent' : '–'} | ${J.namedSourceUnproven(r, { electronWindow: scene.window }).join(', ') || 'none: exercised'} |`);
  }
  const t = J.namedSourceTable(rows, { electronWindow: scene.window });
  console.log(JSON.stringify(t.counts));
}
