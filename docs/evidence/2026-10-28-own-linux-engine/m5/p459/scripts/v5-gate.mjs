#!/usr/bin/env node
// Task 126 (ruling 981.2): would the outlasted gate open on V5's stored Chrome drop samples, and what would option (c)
// cost there? Read-only, from a V5 run's results.jsonl (the cua lane's samples, each with its engine's --stats line).
// The gate as de3bc094 decides it: a take before the release, no keepalive, and the floor not spacing the path's last
// step. Offline, the last step's spacing is read from the release's time after the take: a floor that spaced the last
// step releases it at the floor's end (`dnd::RELEASE_AFTER_TAKE`, 350 ms after the take, rests skipped once floored),
// so a release more than 2 ms past it is a path that outlasted the floor.
// Option (c): with the gate open, a drop confirmed by Chrome's activation alone answers unconfirmed instead. Its cost is
// the landed drops it would notice.
//   node v5-gate.mjs <results.jsonl>...
import { readFileSync } from 'node:fs';

const FLOOR = 350;
const MARGIN = 2;
const per = new Map();
for (const file of process.argv.slice(2)) {
  for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line);
    if (r.kind !== 'sample' || r.engine !== 'cua' || !/^chrome_dnd/.test(r.op ?? '')) continue;
    const s = r.engine_stats ?? {};
    const taken = s.after_release?.released_with_take === true;
    const after = s.after_take?.release_after_take_ms;
    const open = taken && (s.hold?.keepalives ?? 0) === 0 && Number.isFinite(after) && after > FLOOR + MARGIN;
    const activation = /^Activation/.test(s.after_release?.confirmed_by ?? '');
    // the page's own drop counter, before and after the sample
    const landed = (r.drop_status?.after?.drops ?? 0) > (r.drop_status?.before?.drops ?? 0);
    const e = per.get(r.op) ?? { n: 0, taken: 0, open: 0, landed: 0, noticed: 0, afters: [] };
    e.n += 1;
    e.taken += taken ? 1 : 0;
    e.open += open ? 1 : 0;
    e.landed += landed ? 1 : 0;
    e.noticed += open && activation && landed ? 1 : 0;
    if (taken && Number.isFinite(after)) e.afters.push(after);
    per.set(r.op, e);
  }
}
console.log('| cell | samples | took before the release | gate open | landed | landed and noticed under (c) | release after the take, ms min / max |');
console.log('|---|---:|---:|---:|---:|---:|---|');
let tot = { n: 0, open: 0, landed: 0, noticed: 0 };
for (const [op, e] of [...per].sort()) {
  const a = e.afters;
  console.log(`| ${op} | ${e.n} | ${e.taken} | ${e.open} | ${e.landed} | ${e.noticed} | ${a.length ? `${Math.min(...a).toFixed(1)} / ${Math.max(...a).toFixed(1)}` : '–'} |`);
  tot = { n: tot.n + e.n, open: tot.open + e.open, landed: tot.landed + e.landed, noticed: tot.noticed + e.noticed };
}
console.log(`| all | ${tot.n} | | ${tot.open} | ${tot.landed} | ${tot.noticed} (${tot.landed ? ((100 * tot.noticed) / tot.landed).toFixed(1) : '–'}% of landed) | |`);
