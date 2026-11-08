// #316's still-page gate reader (ruling 4701abd8): the still clicks of every results.json given, per head, app and
// scene, and the frames page per cell. Counts: clicks made; the engine's refusals by name (the A/B's score); the
// emulated W and G (nearest web area, and the ancestor reading) that would refuse; frames cells whose target the page
// saw the click on.
//   node scripts/probe-316/offline/still.mjs <results.json>... [--detail]
import {readFileSync} from 'node:fs';

const DETAIL = process.argv.includes('--detail');
const rows = process.argv.slice(2).filter(a => !a.startsWith('--')).flatMap(f => JSON.parse(readFileSync(f, 'utf8')).results).filter(r => r.part === 'still');
const clicked = r => Boolean(r.click);
const refusal = r => r.click?.error ?? null;
function line(rs) {
  const c = rs.filter(clicked);
  const names = {};
  for (const r of c) if (refusal(r)) names[refusal(r)] = (names[refusal(r)] ?? 0) + 1;
  return {clicks: c.length, notPlaced: rs.filter(r => r.problem).length, errors: rs.filter(r => r.exception).length,
    refused: c.filter(refusal).length, names, W: c.filter(r => r.W).length, G: c.filter(r => r.G).length, Ganc: c.filter(r => r.Ganc).length,
    landed: c.filter(r => r.landed === true).length, expect: c.filter(r => r.landed !== undefined).length};
}
const fmt = l => `${l.clicks} | ${l.refused}${l.refused ? ` ${JSON.stringify(l.names)}` : ''} | ${l.W} | ${l.G} | ${l.Ganc} | ${l.expect ? `${l.landed}/${l.expect}` : '-'} | ${l.notPlaced} | ${l.errors}`;
console.log('| head | app | scene | clicks | engine refusals | W (emulated) | G nearest (emulated) | G ancestor (emulated) | target got the click | not placed | errors |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
const keys = [...new Set(rows.map(r => `${r.head}|${r.app}|${r.scene}`))].sort();
for (const k of keys) { const [h, a, s] = k.split('|'); console.log(`| ${h} | ${a} | ${s} | ${fmt(line(rows.filter(r => `${r.head}|${r.app}|${r.scene}` === k)))} |`); }
console.log('\nFrames page, per cell (all browsers pooled per head; centre and edge):');
console.log('| head | browser | frame | kind | clicks | engine refusals | W | G nearest | G ancestor | target got the click | not placed |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
const fk = [...new Set(rows.filter(r => r.scene === 'frames').map(r => `${r.head}|${r.app}|${r.frame}`))];
for (const k of fk) {
  const [h, a, f] = k.split('|');
  const rs = rows.filter(r => r.scene === 'frames' && `${r.head}|${r.app}|${r.frame}` === k);
  const l = line(rs);
  console.log(`| ${h} | ${a} | ${f} | ${rs[0].frameKind} | ${l.clicks} | ${l.refused}${l.refused ? ` ${JSON.stringify(l.names)}` : ''} | ${l.W} | ${l.G} | ${l.Ganc} | ${l.expect ? `${l.landed}/${l.expect}` : '-'} | ${l.notPlaced} |`);
}
const flagged = rows.filter(r => refusal(r) || r.W || r.G || r.Ganc || r.problem || r.exception || (r.landed === false));
if (flagged.length) console.log('\nEvery click refused, flagged, not placed, or whose target saw nothing:');
for (const r of flagged) {
  const sp = r.click?.stalePoint, h = r.signals?.hit;
  console.log(`${r.head} ${r.label}: ${r.problem ?? r.exception?.split('\n')[0] ?? `${refusal(r) ?? 'ok'} ${sp ? `${sp.verdict}/${sp.reason} ${sp.recordedRole}->${sp.hitRole}` : ''} W=${r.W} G=${r.G} Ganc=${r.Ganc} landed=${r.landed} hitAreas=${h?.webAreas} same=${h?.sameWebAreaAsShot} inChain=${h?.shotAreaInChain} hit=${JSON.stringify(h?.chain?.slice(0, 3)?.map(c => c[0]))} ev=${JSON.stringify(r.events?.slice(0, 3))}`}`);
  if (DETAIL && r.seen) console.log(`   seen: ${JSON.stringify(r.seen)}`);
}
