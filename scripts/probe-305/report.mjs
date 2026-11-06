// #305's tables from downloaded artifacts (directories holding results.json from scripts/probe-305/live.mjs).
//   node scripts/probe-305/report.mjs <run-dir>...
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const spots = new Map(), classes = new Map();
for (const dir of process.argv.slice(2)) for (const d of readdirSync(dir)) {
  const f = join(dir, d, 'results.json');
  if (!existsSync(f)) continue;
  const {config, results} = JSON.parse(readFileSync(f, 'utf8'));
  for (const s of results) {
    const t = spots.get(s.spot) ?? {flagged: [0, 0, 0, 0], control: [0, 0, 0, 0], reasons: {}, errors: {}, reps: new Set(), emulated: []};
    t.reps.add(`${dir.split('-').pop()}/rep${config.rep}`);
    if (s.emulated) t.emulated.push(JSON.stringify(s.emulated));
    for (const c of s.clicks ?? []) {
      const k = t[c.kind];
      k[0] += 1;
      if (c.refused) k[1] += 1; else if (c.result?.ok) k[2] += 1; else { k[3] += 1; t.errors[c.result?.error ?? c.exception?.split('\n')[0] ?? '?'] = (t.errors[c.result?.error ?? '?'] ?? 0) + 1; }
      if (c.stalePoint) { const r = `${c.kind}:${c.stalePoint.verdict}/${c.stalePoint.reason}`; t.reasons[r] = (t.reasons[r] ?? 0) + 1; }
      if (c.refused) {
        const key = `${s.spot}: recorded ${c.stalePoint?.recordedRole} / hit ${c.stalePoint?.hitRole}`;
        const m = (c.mech?.candidates ?? []).map(x => `${x.hitInsideByAXParent ? 'hit inside node' : x.candidateInsideHitByAXParent ? 'node inside hit' : 'neither'}; chains meet at ${x.meet ? `${x.meet.at?.role} (hit +${x.meet.hitLevel}, node +${x.meet.candidateLevel})` : 'nothing'}`);
        const e = classes.get(key) ?? {n: 0, mech: new Map(), example: null};
        e.n += 1;
        for (const x of m) e.mech.set(x, (e.mech.get(x) ?? 0) + 1);
        e.example ??= {posted: c.posted, node: c.expected?.node, hit: c.mech?.hit, hitParents: c.mech?.hitParents?.slice(0, 4), candidate: c.mech?.candidates?.[0]?.candidate, candidateParents: c.mech?.candidates?.[0]?.candidateParents?.slice(0, 3), expected: c.expected?.v};
        classes.set(key, e);
      }
    }
    spots.set(s.spot, t);
  }
}
console.log('| spot | runs | flagged: clicked / refused / kept / other error | controls: clicked / refused / kept / other error | stalePoint reasons | other errors |');
console.log('|---|---|---|---|---|---|');
for (const [name, t] of spots) console.log(`| ${name} | ${[...t.reps].join(', ')} | ${t.flagged.join(' / ')} | ${t.control.join(' / ')} | ${Object.entries(t.reasons).map(([k, v]) => `${k} ×${v}`).join(', ')} | ${Object.entries(t.errors).map(([k, v]) => `${k} ×${v}`).join(', ') || '-'} |`);
console.log('\nrefusal classes:');
for (const [k, e] of classes) {
  console.log(`- ${k}: ${e.n} refused; candidates for the recorded node (role and frame) by mechanism: ${[...e.mech].map(([m, n]) => `${m} ×${n}`).join('; ')}`);
  console.log(`  example: ${JSON.stringify(e.example).slice(0, 1400)}`);
}
