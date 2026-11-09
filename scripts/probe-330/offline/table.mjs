// #330's reader: each candidate rule's catches on the suggestion cells and its false refusals on the still sweep, the
// near-change scenes and the suggestion pages' uncovered and baseline clicks, from the engine's own `shadow330` meta
// (scripts/probe-330/shadow.patch) on every click.
//   node scripts/probe-330/offline/table.mjs <results.json>... [--dump]
import {readFileSync} from 'node:fs';

const files = process.argv.slice(2).filter(a => !a.startsWith('--'));
const DUMP = process.argv.includes('--dump');
const rows = files.flatMap(f => JSON.parse(readFileSync(f, 'utf8')).results);
const sh = r => r.click?.shadow ?? null;
const hits = r => sh(r)?.hits ?? [];
// The candidates, each a function of a row's shadow (null when the row has none).
// Every candidate applies only where the recorded node lies in a web area (the proposal's scope); outside one it is off.
const web = f => s => Boolean(s.inWebArea) && Boolean(f(s));
const dl = s => (s.hits ?? []).some(h => h.dL);
const C = {
  'a pruned': web(s => s.pruned?.a),
  'a changed': web(s => s.changed?.a),
  'a full': web(s => s.full?.a),
  'b changed (popup role)': web(s => s.changed?.b),
  'c expanded': web(s => s.c),
  'd hit chain': web(s => s.hits?.[0]?.d),
  'dL hit chain, listed': web(s => s.hits?.[0]?.dL),
  'dL any hit': web(dl),
  'dLAnc any hit': web(s => (s.hits ?? []).some(h => h.dLAnc)),
  'e created': web(s => s.e),
  'dL or a changed': web(s => dl(s) || s.changed?.a),
  'dL or a pruned': web(s => dl(s) || s.pruned?.a),
};
const browsers = [...new Set(rows.map(r => r.app))];
const COVERED = new Set(['button', 'checkbox', 'link']);
// Ground truth.
const wrong = r => r.part === 'suggest' && r.skind !== 'wiki' && r.click && !r.click.error && r.result && r.result.landing !== 'landed';
const goodSuggest = r => r.part === 'suggest' && r.click && !r.click.error && r.result?.landing === 'landed';
const keptStill = r => r.part === 'still' && r.click && !r.click.error && !r.problem && !r.exception;
const near = r => keptStill(r) && String(r.scene).startsWith('near:');
const sweep = r => keptStill(r) && !String(r.scene).startsWith('near:');
const fmt = (n, d) => (d ? `${n}/${d}` : '-');

console.log('## Ground truth on main + shadow (the engine\'s verdicts are main\'s)\n');
console.log('| app | suggest rows | wrong, success answered | landed | refused by main | still kept (sweep) | near kept | still refused by main |\n|---|---|---|---|---|---|---|---|');
for (const b of browsers) {
  const rs = rows.filter(r => r.app === b);
  const sg = rs.filter(r => r.part === 'suggest');
  console.log(`| ${b} | ${sg.length} | ${sg.filter(wrong).length} | ${sg.filter(goodSuggest).length} | ${sg.filter(r => r.click?.error).length} | ${rs.filter(sweep).length} | ${rs.filter(near).length} | ${rs.filter(r => r.part === 'still' && r.click?.error).length} |`);
}

console.log('\n## Candidates: catches (wrong clicks it would refuse) and false refusals (clicks that landed or were kept)\n');
console.log(`| candidate | ${browsers.map(b => `${b} catches | ${b} FR suggest pages | ${b} FR near | ${b} FR sweep`).join(' | ')} |`);
console.log(`|---|${browsers.map(() => '---|---|---|---').join('|')}|`);
for (const [name, f] of Object.entries(C)) {
  const cells = browsers.map(b => {
    const rs = rows.filter(r => r.app === b && sh(r));
    const n = pred => { const xs = rs.filter(pred); return fmt(xs.filter(r => f(sh(r))).length, xs.length); };
    return `${n(wrong)} | ${n(goodSuggest)} | ${n(near)} | ${n(sweep)}`;
  });
  console.log(`| ${name} | ${cells.join(' | ')} |`);
}

console.log('\n## Catches per dropdown kind (wrong clicks caught / wrong), and what main answered\n');
const kinds = [...new Set(rows.filter(r => r.part === 'suggest').map(r => r.skind))];
console.log(`| app | kind | wrong | main reasons | ${Object.keys(C).join(' | ')} |\n|---|---|---|---|${Object.keys(C).map(() => '---').join('|')}|`);
for (const b of browsers) for (const k of kinds) {
  const ws = rows.filter(r => r.app === b && r.skind === k && wrong(r) && sh(r));
  if (!ws.length) continue;
  const reasons = {}; for (const r of ws) { const x = r.click.stalePoint?.reason ?? '-'; reasons[x] = (reasons[x] ?? 0) + 1; }
  console.log(`| ${b} | ${k} | ${ws.length} | ${Object.entries(reasons).map(([x, n]) => `${x} ${n}`).join(', ')} | ${Object.values(C).map(f => ws.filter(r => f(sh(r))).length).join(' | ')} |`);
}

console.log('\n## Suggest outcomes per kind, sequence and target\n');
console.log('| app | kind | mode | seq | target | landing | main | a full | b full | c | d hits | e |\n|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows.filter(r => r.part === 'suggest')) {
  const s = sh(r);
  const sp = r.click?.stalePoint;
  console.log(`| ${r.app} | ${r.skind} | ${r.mode} | ${r.seq} | ${r.target} | ${r.problem ?? r.exception?.split('\n')[0]?.slice(0, 60) ?? r.result?.landing} | ${sp ? `${sp.verdict}/${sp.reason}` : '-'} | ${s ? +!!s.full?.a : '-'} | ${s ? +!!s.full?.b : '-'} | ${s ? +!!s.c : '-'} | ${s ? hits(r).map(h => +!!h.d).join('') : '-'} | ${s?.e == null ? '-' : +!!s.e} |`);
}

console.log('\n## Wikipedia\'s own suggestion list (Special:Search): each click aimed under it\n');
console.log(`| row | target | main | title after | ${Object.keys(C).join(' | ')} |\n|---|---|---|---|${Object.keys(C).map(() => '---').join('|')}|`);
for (const r of rows.filter(r => r.skind === 'wiki')) {
  const s = sh(r);
  console.log(`| ${r.label} | ${r.targetNode ? `${r.targetNode.role} ${r.targetNode.title ?? r.targetNode.description ?? ''}` : r.problem ?? r.exception?.slice(0, 60)} | ${r.click?.stalePoint ? `${r.click.stalePoint.verdict}/${r.click.stalePoint.reason}` : '-'} | ${r.result?.titleAfter ?? '-'} | ${s ? Object.values(C).map(f => +!!f(s)).join(' | ') : '-'} |`);
}
console.log('\n## Every false refusal (a candidate firing on a landed or kept click), by candidate\n');
for (const [name, f] of Object.entries(C)) {
  const fr = rows.filter(r => (goodSuggest(r) || keptStill(r)) && sh(r) && f(sh(r)));
  if (!fr.length) continue;
  console.log(`- **${name}** (${fr.length}): ${fr.slice(0, 30).map(r => `${r.label}${r.part === 'still' ? `[${r.landed ?? '?'}]` : ''} fresh=${JSON.stringify(sh(r).full?.freshRoles ?? [])}`).join('; ')}`);
}

// Cost.
const q = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] * 100) / 100; };
console.log('\n## Cost of the readings (ms, p50 / p95 / max; reads)\n');
console.log('| app | n | pruned ms | pruned reads p95 | full ms | full reads p95 | full cut | stalePoint.ms |\n|---|---|---|---|---|---|---|---|');
for (const b of browsers) {
  const ss = rows.filter(r => r.app === b && sh(r)?.pruned).map(sh);
  const sp = rows.filter(r => r.app === b && r.click?.stalePoint).map(r => r.click.stalePoint.ms);
  const t = xs => `${q(xs, 0.5)} / ${q(xs, 0.95)} / ${q(xs, 1)}`;
  console.log(`| ${b} | ${ss.length} | ${t(ss.map(s => s.pruned.ms))} | ${q(ss.map(s => s.pruned.reads), 0.95)} | ${t(ss.map(s => s.full.ms))} | ${q(ss.map(s => s.full.reads), 0.95)} | ${ss.filter(s => s.full.cut).length} | ${t(sp)} |`);
}

if (DUMP) {
  console.log('\n## The tree at click time (suggest, shared, covered targets)\n');
  for (const r of rows.filter(r => r.part === 'suggest' && sh(r) && (COVERED.has(r.target) || r.seq === 'suggestReobs'))) {
    const s = sh(r);
    console.log(`### ${r.label}: ${r.result?.landing} main=${r.click?.stalePoint?.reason} hit=${r.click?.stalePoint?.hitRole} nodeFrameDist=${s.nodeFrameDist}`);
    s.hits.forEach((h, i) => console.log(`  hit${i}: d=${h.d} ${JSON.stringify(h.chain)}`));
    console.log(`  full: fresh=${JSON.stringify(s.full.freshRoles)} stab=${JSON.stringify(s.full.stab.map(x => `${x[0]}${x[1] ? '/' + x[1] : ''}:${x[2]}${x[6] ? ':NODE' : ''}${x[4] ? ':anc' : ''}${x[5] ? ':under' : ''}`))}`);
    console.log(`  pruned: fresh=${JSON.stringify(s.pruned.freshRoles)} reads=${s.pruned.reads}`);
    console.log(`  focus: ${JSON.stringify(s.focus)} c=${s.c}`);
    console.log(`  e=${s.e} notes=${JSON.stringify(s.notes?.counts)} created=${JSON.stringify((s.notes?.elements ?? []).filter(x => x[2]).slice(0, 6))}`);
    console.log(`  sideTool hit=${JSON.stringify((r.signals?.hit?.chain ?? []).slice(0, 5).map(c => c[0]))} sys=${JSON.stringify((r.signals?.systemHit?.chain ?? []).slice(0, 5).map(c => c[0]))} aboveAtPoint=${JSON.stringify((r.signals?.aboveAtPoint ?? []).map(w => `${w.owner}:${w.layer}`))}`);
    if (r.reobs) console.log(`  reobs: suggestionSeen=${r.reobs.suggestionSeen} listed=${JSON.stringify(r.reobs.listed)} added=${JSON.stringify(r.reobs.added.slice(0, 12))} shot=${r.reobs.screenshot}`);
  }
}
