#!/usr/bin/env node
// Task 68: where the drag loop's own cursor falls against the take on the server's clock, and the first status's, per
// sitting, over every drag that took by its release (the accept rule counts changes strictly after the take). Also the
// accept rule replayed on the passive lanes (the harness's own reading of the watch, accept_shown).
// usage: cursor-order.mjs <run dir>...
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const tally = {};
for (const dir of process.argv.slice(2)) {
  const name = dir.split('/').at(-1);
  for (const line of readFileSync(join(dir, 'run/results.jsonl'), 'utf8').trim().split('\n')) {
    const r = JSON.parse(line);
    if (r.kind !== 'drop-signal' || r.cover || !r.watch) continue;
    const take = r.watch.find((l) => l.kind === 'take' && l.owner && (l.owner & ~0x1fffff) >>> 0 === (r.watch.find((x) => x.kind === 'take' && x.owner)?.owner & ~0x1fffff) >>> 0);
    if (!take || r.signals?.late_take) continue;
    const unnamed = r.watch.filter((l) => l.kind === 'cursor' && !l.named && l.wall_ms >= take.wall_ms - 50);
    // the loop's cursor: the first unnamed change within 50 ms before the take or after it; the first status: the next
    const [loop, status] = unnamed;
    const k = (c) => (c ? String(((c.server_time - take.server_time) | 0)) : 'none');
    const t = (tally[name] ??= { loop: {}, status: {} });
    t.loop[k(loop)] = (t.loop[k(loop)] ?? 0) + 1;
    t.status[k(status)] = (t.status[k(status)] ?? 0) + 1;
  }
}
for (const [name, t] of Object.entries(tally)) {
  const show = (o) => Object.entries(o).sort((a, b) => Number(a[0]) - Number(b[0])).map(([d, n]) => `${d}: ${n}`).join(', ');
  console.log(`${name}\n  loop cursor (server ms after the take): ${show(t.loop)}\n  first status: ${show(t.status)}`);
}
