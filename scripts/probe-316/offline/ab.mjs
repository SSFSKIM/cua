// #316's A/B reader: main against the build (fix/316-overlay-guard), the engine's real answers. Every results.json given
// (the sequence groups and the still sweep), each file's head from its config.
//   node scripts/probe-316/offline/ab.mjs <results.json>...
import {readFileSync} from 'node:fs';

const rows = process.argv.slice(2).flatMap(f => { const d = JSON.parse(readFileSync(f, 'utf8')); return d.results.map(r => ({...r, head: r.head ?? d.config.head})); });
const heads = [...new Set(rows.map(r => r.head))];
const reasonOf = r => !r.click?.error ? null : /screenChanged/.test(r.click.error) ? (r.click.stalePoint?.reason ?? 'screenChanged') : r.click.error;
function outcome(r) {
  if (r.problem || r.exception || !r.click) return 'unclear';
  if (r.click.error) return `refused:${reasonOf(r)}`;
  if (r.part === 'still') return 'kept';
  const l = r.result?.landing;
  return l === 'landed' ? 'landed' : l === 'unknown' || !l ? 'unclear' : 'wrong';
}
const tally = rs => { const t = {}; for (const r of rs) { const o = outcome(r); t[o] = (t[o] ?? 0) + 1; } return t; };
const show = t => Object.entries(t).sort().map(([k, v]) => `${k} ${v}`).join(', ') || '-';

console.log('## Sequences (the kit\'s runs 1 and 2): per app and sequence, each head\'s outcomes\n');
console.log(`| app | sequence | ${heads.join(' | ')} |\n|---|---|${heads.map(() => '---').join('|')}|`);
const seqRows = rows.filter(r => r.part !== 'still');
for (const k of [...new Set(seqRows.map(r => `${r.app}|${r.seq}`))].sort()) {
  const [a, s] = k.split('|');
  console.log(`| ${a} | ${s} | ${heads.map(h => show(tally(seqRows.filter(r => r.head === h && r.app === a && r.seq === s)))).join(' | ')} |`);
}
console.log('\n## Still pages (the gate: 0 refusals): per app and scene\n');
console.log(`| app | scene | ${heads.join(' | ')} |\n|---|---|${heads.map(() => '---').join('|')}|`);
const still = rows.filter(r => r.part === 'still');
for (const k of [...new Set(still.map(r => `${r.app}|${r.scene}`))].sort()) {
  const [a, s] = k.split('|');
  console.log(`| ${a} | ${s} | ${heads.map(h => show(tally(still.filter(r => r.head === h && r.app === a && r.scene === s)))).join(' | ')} |`);
}
console.log('\n## Still pages: frames and toolbar per cell\n');
console.log(`| app | cell | ${heads.join(' | ')} |\n|---|---|${heads.map(() => '---').join('|')}|`);
for (const k of [...new Set(still.filter(r => r.scene === 'frames' || r.scene === 'toolbar').map(r => `${r.app}|${r.scene === 'frames' ? `${r.frame} (${r.frameKind})` : r.cell}`))].sort()) {
  const [a, c] = k.split('|');
  const match = r => r.app === a && (r.scene === 'frames' ? `${r.frame} (${r.frameKind})` : r.cell) === c;
  console.log(`| ${a} | ${c} | ${heads.map(h => show(tally(still.filter(r => r.head === h && match(r))))).join(' | ')} |`);
}
const refusedStill = still.filter(r => r.click?.error);
if (refusedStill.length) {
  console.log('\nEvery still click refused:');
  for (const r of refusedStill) console.log(`${r.head} ${r.label}: ${reasonOf(r)} ${JSON.stringify(r.click.stalePoint)} msg=${(r.click.message ?? '').slice(0, 160)}`);
}

// Cost.
const q = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] * 1000) / 1000; };
console.log('\n## Cost (every click and drag with a stalePoint record)\n');
console.log('| head | n | ms p50 | ms p95 | ms max | windowsMs p50 | p95 | max | webAreaReads distribution |\n|---|---|---|---|---|---|---|---|---|');
for (const h of heads) {
  const sp = rows.filter(r => r.head === h && r.click?.stalePoint).map(r => r.click.stalePoint);
  const ms = sp.map(s => s.ms).filter(x => typeof x === 'number'), wms = sp.map(s => s.windowsMs).filter(x => typeof x === 'number');
  const reads = {}; for (const s of sp) if (s.webAreaReads != null) reads[s.webAreaReads] = (reads[s.webAreaReads] ?? 0) + 1;
  console.log(`| ${h} | ${sp.length} | ${q(ms, 0.5)} | ${q(ms, 0.95)} | ${q(ms, 1)} | ${q(wms, 0.5) ?? '-'} | ${q(wms, 0.95) ?? '-'} | ${q(wms, 1) ?? '-'} | ${JSON.stringify(reads)} |`);
}
