// The qualification's comparison over several runs' results: per cell, mode and side, each head's outcomes side by side
// (rows whose overlay window was on screen at alpha 0 left out: the screenshot showed no overlay there), the refusal
// sentences per head, and per lane (the app) and head the p50/p95 of stalePoint.ms and stalePoint.hitMs.
//   node scripts/probe-337/compare.mjs --heads main,fix2 <results.json>...
import {readFileSync} from 'node:fs';
const i = process.argv.indexOf('--heads');
const HEADS = process.argv[i + 1].split(',');
const files = process.argv.slice(2).filter((f, k, a) => f !== '--heads' && a[k - 1] !== '--heads');
const rows = files.flatMap(f => JSON.parse(readFileSync(f, 'utf8')).results).filter(r => HEADS.includes(r.head) && r.overlayAtObs?.popup?.alpha !== 0);
const tally = xs => Object.entries(xs.reduce((m, x) => (m[x] = (m[x] ?? 0) + 1, m), {})).map(([k, n]) => `${k} ${n}`).join('; ') || '-';
const outcome = r => r.problem ? 'n/a' : r.exception ? 'exception' : `${r.landing}${r.click?.stalePoint?.by ? ` (by ${r.click.stalePoint.by})` : ''}`;
const cells = [...new Set(rows.map(r => `${r.overlay}|${r.mode}|${r.side}`))];
console.log(`| cell | mode | side | ${HEADS.join(' | ')} |`);
console.log(`|---|---|---|${HEADS.map(() => '---').join('|')}|`);
for (const c of cells) {
  const rs = rows.filter(r => `${r.overlay}|${r.mode}|${r.side}` === c);
  console.log(`| ${c.split('|').join(' | ')} | ${HEADS.map(h => tally(rs.filter(r => r.head === h).map(outcome))).join(' | ')} |`);
}
console.log('\nsentences:');
for (const h of HEADS) {
  const by = rows.filter(r => r.head === h && r.click?.message).reduce((m, r) => { (m[`${r.click.error}: ${r.click.message}`] ??= []).push(r.overlay); return m; }, {});
  for (const [s, o] of Object.entries(by)) console.log(`  ${h} ${o.length}x [${tally(o)}] ${s}`);
}
const q = (xs, p) => { if (!xs.length) return '-'; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)].toFixed(2); };
console.log('\n| lane | head | clicks | stalePoint.ms p50 | p95 | hitMs p50 | p95 | hitMs present |');
console.log('|---|---|---|---|---|---|---|---|');
for (const lane of ['chrome', 'textedit']) for (const h of HEADS) {
  const sp = rows.filter(r => r.app === lane && r.head === h && r.click?.stalePoint).map(r => r.click.stalePoint);
  const ms = sp.map(s => s.ms).filter(Number.isFinite), hit = sp.map(s => s.hitMs).filter(Number.isFinite);
  console.log(`| ${lane} | ${h} | ${sp.length} | ${q(ms, 0.5)} | ${q(ms, 0.95)} | ${q(hit, 0.5)} | ${q(hit, 0.95)} | ${hit.length}/${sp.length} |`);
}
