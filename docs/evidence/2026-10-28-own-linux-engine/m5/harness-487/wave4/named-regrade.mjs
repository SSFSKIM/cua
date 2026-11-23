// Task 142 fix wave 4: every t487-named run in the given results files, regraded by a judge (argv[2]): per run, its
// engine, its drops, and the named table's counts with the scene row's Electron window given.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const [judgePath, ...files] = process.argv.slice(2);
const J = await import(pathToFileURL(judgePath).href);
for (const f of files) {
  const b = readFileSync(f);
  const rows = (f.endsWith('.gz') ? gunzipSync(b) : b).toString('utf8').trim().split('\n').map((l) => JSON.parse(l));
  for (const meta of rows.filter((r) => r.kind === 'meta' && r.plan === 't487-named')) {
    const own = rows.filter((r) => r.run === meta.run);
    const scene = own.find((r) => r.kind === 'drop-signal-scene');
    const t = J.namedSourceTable(own, { electronWindow: scene?.window ?? null });
    const aims = own.filter((r) => r.kind === 'drop-signal').filter((r) => r.named?.aim?.park?.chain).length;
    console.log(JSON.stringify({ file: f.replace(/^.*own-linux-engine\//, ''), run: meta.run, engine: meta.cua_version, aim_records: aims, counts: t.counts }));
  }
}
