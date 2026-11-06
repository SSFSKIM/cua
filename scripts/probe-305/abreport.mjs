// #305's A/B tables from downloaded artifacts: scripts/probe-305/ab.mjs's results (spots, sweep, popover) and
// scripts/probe-296/ab.mjs's (the stale suite), per head.
//   node scripts/probe-305/abreport.mjs <run-dir>
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const dir = process.argv[2];
const heads = new Set();
const rows = [], cells = [];
for (const d of readdirSync(dir)) {
  const f = join(dir, d, 'results.json');
  if (!existsSync(f)) continue;
  const j = JSON.parse(readFileSync(f, 'utf8'));
  const rep = j.config.rep;
  heads.add(`main ${(j.config.mainCommit ?? '').slice(0, 8)} / branch ${(j.config.branchCommit ?? '').slice(0, 8)}`);
  if (j.config.exception) console.log(`${d}: EXCEPTION ${j.config.exception.split('\n')[0]}`);
  for (const r of j.results ?? []) rows.push({...r, rep, group: j.config.group});
  for (const c of j.cells ?? []) cells.push({...c, rep, group: j.config.group});
}
console.log(`heads: ${[...heads].join('; ')}\n`);
const reason = c => c.refused ? `REFUSED:${c.stalePoint?.reason ?? '?'}` : c.result?.ok ? (c.stalePoint ? c.stalePoint.reason : 'kept:no stalePoint') : `error:${c.result?.error ?? c.exception?.split('\n')[0]?.slice(0, 40) ?? c.skipped ?? '?'}`;
const tally = cs => { const t = {}; for (const c of cs) { const k = c.skipped ? `skipped:${c.skipped}` : reason(c); t[k] = (t[k] ?? 0) + 1; } return t; };
const fmt = t => Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v}`).join(', ') || '-';

for (const part of ['spots', 'sweep']) {
  console.log(`\n### ${part}\n`);
  const keys = [...new Set(rows.filter(r => r.part === part).map(r => r.spot))];
  const where = part === 'sweep' ? ['centre', 'edge'] : ['flagged', 'control'];
  console.log(`| ${part === 'sweep' ? 'app' : 'spot'} | head | ${where.map(w => `${w}: clicked / refused / kept (reasons)`).join(' | ')} |`);
  console.log(`|---|---|${where.map(() => '---').join('|')}|`);
  for (const k of keys) for (const eng of ['main', 'branch']) {
    const cs = rows.filter(r => r.part === part && r.spot === k && r.engine === eng).flatMap(r => r.clicks.map(c => ({...c, rep: r.rep})));
    const cols = where.map(w => {
      const sel = cs.filter(c => (part === 'sweep' ? c.where : c.kind) === w && !c.skipped);
      return `${sel.length} / ${sel.filter(c => c.refused).length} / ${sel.filter(c => c.result?.ok).length} (${fmt(tally(sel))})`;
    });
    const skipped = cs.filter(c => c.skipped).length;
    console.log(`| ${k} | ${eng} | ${cols.join(' | ')}${skipped ? ` skipped ${skipped}` : ''} |`);
  }
}
console.log('\n### popover (the stated limit)\n');
for (const r of rows.filter(r => r.part === 'popover')) for (const c of r.clicks) console.log(`- ${r.spot} ${r.engine} rep${r.rep}: ${reason(c)} (hit ${c.stalePoint?.hitRole ?? '-'}, recorded ${c.stalePoint?.recordedRole ?? '-'}), landed on ${JSON.stringify(c.landedOn)}; recorded ${JSON.stringify(r.recorded)}`);
for (const r of rows.filter(r => r.part === 'popover' && r.exception)) console.log(`- ${r.spot} ${r.engine} rep${r.rep}: EXCEPTION ${r.exception.split('\n')[0]}`);

console.log('\n### refusals on the branch (spots and sweep), with the mechanism\n');
for (const r of rows.filter(r => r.engine === 'branch' && r.part !== 'popover')) for (const c of r.clicks.filter(c => c.refused)) {
  const m = (c.mech?.candidates ?? []).map(x => `${x.hitInsideByAXParent ? 'hit inside node' : x.candidateInsideHitByAXParent ? 'node inside hit' : 'neither'} (meet ${x.meet?.at?.role ?? '-'} +${x.meet?.hitLevel}/+${x.meet?.candidateLevel})`).join('; ');
  console.log(`- ${r.spot} rep${r.rep} ${c.where ?? c.kind}${c.edge ? `(${c.edge})` : ''} ${c.role ?? ''} "${c.title ?? ''}": ${c.stalePoint?.reason} rec=${c.stalePoint?.recordedRole} hit=${c.stalePoint?.hitRole}; hit ${JSON.stringify(c.mech?.hit ?? null).slice(0, 200)}; ${m}`);
}

// recordedHit: its time, how it matched (the fix build's probeRecordedHitBy), and whether the hit was unclipped in the record.
const rh = rows.filter(r => r.engine === 'branch').flatMap(r => r.clicks.map(c => ({...c, spot: r.spot}))).filter(c => c.stalePoint?.reason === 'recordedHit');
const q = (xs, p) => xs.length ? +[...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.round((xs.length - 1) * p))].toFixed(2) : null;
const by = {}; for (const c of rh) by[c.stalePoint.probeRecordedHitBy ?? 'unknown'] = (by[c.stalePoint.probeRecordedHitBy ?? 'unknown'] ?? 0) + 1;
const clip = {}; for (const c of rh) { const e = c.hitRecord?.[0]; const k = !e ? 'hit not in record by role+frame' : `${e.clipped ? 'clipped' : 'unclipped'}${e.pointInShown ? '' : ', point outside shown+2'}`; clip[`${c.spot}: ${k}`] = (clip[`${c.spot}: ${k}`] ?? 0) + 1; }
console.log(`\n### recordedHit (branch): ${rh.length} clicks; stalePoint.ms p50 ${q(rh.map(c => c.stalePoint.ms), 0.5)} p95 ${q(rh.map(c => c.stalePoint.ms), 0.95)} max ${q(rh.map(c => c.stalePoint.ms), 1)}; matched by ${fmt(by)}`);
for (const [k, v] of Object.entries(clip)) console.log(`- ${k} ×${v}`);

console.log('\n### #296 stale suite\n');
console.log('| cell | expect | main (rep1, rep2) | branch (rep1, rep2) | branch meets expect |');
console.log('|---|---|---|---|---|');
const base = c => c.label.replace(/\/(branch|main)$/, '');
const ans = c => c ? (c.exception || c.problem ? `PROBLEM ${(c.problem ?? c.exception).split('\n')[0].slice(0, 40)}` : `${c.stalePoint ? `${c.stalePoint.verdict}/${c.stalePoint.reason}` : 'no stalePoint'}${c.errorName && c.errorName !== 'screenChangedSinceScreenshot' ? ` + ${c.errorName}` : ''}${c.effect?.hit?.length ? ` →${c.effect.hit.join(',')}` : ''}`) : '-';
const meets = (c, expect) => {
  // A refusal another way (nothing pressed: backgroundClickRefused and the like) counts as refused, said so.
  if (expect?.startsWith('refused') && c?.errorName && c.errorName !== 'screenChangedSinceScreenshot' && !c.effect?.hit?.length) return `refused by ${c.errorName}`;
  if (!c?.stalePoint || !expect) return c?.spec?.expect === 'skipped' ? !c?.stalePoint : '?';
  const [v, why] = expect.split('/');
  return c.stalePoint.verdict === v && (!why || c.stalePoint.reason === why);
};
for (const b of [...new Set(cells.map(base))]) {
  const of = eng => [1, 2].map(rep => cells.find(c => base(c) === b && c.label.endsWith(`/${eng}`) && Number(c.rep) === rep));
  const [m, br] = [of('main'), of('branch')];
  const expect = (br[0] ?? m[0])?.spec?.expect;
  console.log(`| ${b} | ${expect ?? '-'} | ${m.map(ans).join(', ')} | ${br.map(ans).join(', ')} | ${br.map(c => c ? meets(c, expect) : '-').join(', ')} |`);
}
