// Task 127 (read-only): #459's shape in the a953 development runs' rows (arm64 at twice the load, H6, pinned 0.4.2):
// per cell, the drags, the releases after a take, those that outlasted the floor with no keepalive, and the landings.
// usage: node scan-a953.mjs <results.jsonl.gz>...
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

for (const f of process.argv.slice(2)) {
  const rows = gunzipSync(readFileSync(f)).toString('utf8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((r) => r && r.kind === 'drop-signal');
  const cells = {};
  for (const r of rows) {
    const c = (cells[`${r.lane} ${r.cell}`] ??= { n: 0, take: 0, outlasted: 0, landed: 0 });
    c.n++;
    if (r.after_release?.released_with_take) c.take++;
    if (r.hold?.keepalives === 0 && r.after_take?.release_after_take_ms >= 350) c.outlasted++;
    if (r.outcome?.landed) c.landed++;
  }
  console.log(f.split('/').slice(-3).join('/'), JSON.stringify(cells));
}
