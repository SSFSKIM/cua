#!/usr/bin/env node
// Task 122, ruling 954.3: the engine's identification of a Chrome drag's source, counted from the rows that carry it
// (`hold.adaptive.source`, on a cua lane's sample or drop-signal row), freeze cells left out. Per step dir, load, and
// scene/op or cell: identified, unidentified, and each unidentified row's cause as the engine gave it (`by` and the
// hold's `why`). Rows with no identification record are counted apart (a hold record without `adaptive`, or no hold
// record: counted runs keep no engine stats, ruling 834). Read-only.
//   node ident-count.mjs <step dir>...
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { gunzipSync } from 'node:zlib';

for (const dir of process.argv.slice(2)) {
  const file = ['run/results.jsonl', 'run/results.jsonl.gz'].map((p) => join(dir, p)).find(existsSync);
  if (!file) { console.log(`${basename(dir)}: no results`); continue; }
  const raw = readFileSync(file);
  const rows = (file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const drags = rows.filter((r) => (r.kind === 'sample' || r.kind === 'drop-signal') && !/^freeze-/.test(r.cell ?? '')
    && /chrome/i.test(`${r.family ?? ''} ${r.scene ?? ''}`) && /^cua/.test(r.lane ?? r.engine ?? r.candidate ?? ''));
  const by = new Map();
  let none = 0;
  const causes = new Map();
  for (const r of drags) {
    const src = r.hold?.adaptive?.source ?? r.engine_stats?.hold?.adaptive?.source;
    if (!src) { none += 1; continue; }
    const key = `${r.load ?? 'idle'} | ${r.scene ? `${r.scene} ${r.op}` : `${r.lane} ${r.cell}`}`;
    const c = by.get(key) ?? { identified: 0, unidentified: 0 };
    if (src.identified) c.identified += 1;
    else {
      c.unidentified += 1;
      const why = `${src.by ?? '–'}; ${r.hold?.adaptive?.why ?? r.engine_stats?.hold?.adaptive?.why ?? '–'}`;
      causes.set(why, (causes.get(why) ?? 0) + 1);
    }
    by.set(key, c);
  }
  const tot = [...by.values()].reduce((a, c) => ({ identified: a.identified + c.identified, unidentified: a.unidentified + c.unidentified }), { identified: 0, unidentified: 0 });
  console.log(`## ${basename(dir)}: ${drags.length} Chrome cua drag rows (no freeze); with an identification record ${tot.identified + tot.unidentified}: identified ${tot.identified}, unidentified ${tot.unidentified}; no record ${none}`);
  for (const [k, c] of by) console.log(`| ${k} | ${c.identified} | ${c.unidentified} |`);
  for (const [w, n] of causes) console.log(`  unidentified ×${n}: ${w}`);
}
