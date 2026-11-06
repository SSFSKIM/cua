// #301's A/B tables from a run's downloaded artifacts (directories holding results.json from scripts/probe-299/ab.mjs).
//   node scripts/probe-299/abreport.mjs <run-dir>
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const dir = process.argv[2];
const rows = [];
const heads = new Set();
for (const d of readdirSync(dir)) {
  const f = join(dir, d, 'results.json');
  if (!existsSync(f)) continue;
  const {config, results} = JSON.parse(readFileSync(f, 'utf8'));
  heads.add(`main ${config.mainCommit?.slice(0, 8)} / branch ${config.branchCommit?.slice(0, 8)} / kit ${config.probeCommit?.slice(0, 8)}`);
  if (config.exception) console.log(`${d}: EXCEPTION ${config.exception.split('\n')[0]}`);
  for (const r of results) rows.push({...r, app: config.group.startsWith('chrome') ? 'Chrome' : config.group === 'safari' ? 'Safari' : 'native', rep: config.rep});
}
console.log(`heads: ${[...heads].join('; ')}\n`);
const both = v => v[0] === v[1] || v[1] === undefined ? `${v[0]}` : `${v[0]} / ${v[1]}`;
const groups = new Map();
for (const r of rows) { const k = `${r.app}|${r.target}|${r.pos}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
const order = [...groups.keys()].sort((a, b) => {
  const [x, y] = [groups.get(a)[0], groups.get(b)[0]];
  return x.app.localeCompare(y.app) || x.target.localeCompare(y.target) || x.posIndex - y.posIndex;
});
const g = o => o?.guard ? `${o.guard.checked}/${o.guard.containerOnly}/${o.guard.unrecorded}` : '-';
const tr = o => o?.truncated ? (o.truncated.above != null ? `${o.truncated.count}: ${o.truncated.above}↑ ${o.truncated.below}↓ ${o.truncated.elsewhere}·` : `${o.truncated.count}`) : '-';
const sd = o => o?.seed ? `${Math.round(o.seed.ms)}${o.seed.capped ? ' CAPPED' : ''} (${o.seed.points}/${o.seed.hits}/${o.seed.chains}/${o.seed.seeds})` : '-';
const stab = r => r.samePosition ? `same m ${r.samePosition.main?.changedToken}/${r.samePosition.main?.matched}, b ${r.samePosition.branch?.changedToken}/${r.samePosition.branch?.matched}`
  : r.adjacent ? `+1 screen (dy ${r.adjacent.dy}) m ${r.adjacent.main?.changedToken}/${r.adjacent.main?.matched}, b ${r.adjacent.branch?.changedToken}/${r.adjacent.branch?.matched}` : '-';
console.log('| app | target | pos | guard main (checked/container-only/unrecorded %) | guard branch | walk ms main | walk ms branch | seed ms (points/hits/chains/seeds) | record-only nodes | truncated main | truncated branch (count: above↑ below↓ elsewhere·) | tokens changed/matched | no cut: equal |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const k of order) {
  const rs = groups.get(k).sort((a, b) => a.rep - b.rep);
  const r0 = rs[0];
  if (rs.every(r => r.exception || r.mainError)) { console.log(`| ${r0.app} | ${r0.target} | ${r0.pos} | PROBLEM ${(r0.mainError?.name ?? r0.exception ?? '').split('\n')[0].slice(0, 100)} |`); continue; }
  const f = fn => both(rs.map(r => { try { return fn(r); } catch { return '?'; } }));
  console.log(`| ${r0.app} | ${r0.target} | ${r0.pos} | ${f(r => g(r.main))} | ${f(r => g(r.branch))} | ${f(r => Math.round(r.main?.walkMs ?? NaN))} | ${f(r => Math.round(r.branch?.walkMs ?? NaN))} | ${f(r => sd(r.branch))} | ${f(r => r.branch?.recordOnlyNodes ?? '-')} | ${f(r => tr(r.main))} | ${f(r => tr(r.branch))} | ${f(stab)} | ${f(r => r.noCut ? `${r.noCut.equal ? 'yes' : `NO at ${r.noCut.firstDiff}`} (${r.noCut.mainNodes}/${r.noCut.branchNodes})` : '-')} |`);
}
// Aggregates.
const q = (xs, p) => xs.length ? +xs.sort((a, b) => a - b)[Math.min(xs.length - 1, Math.round((xs.length - 1) * p))].toFixed(1) : null;
const seeded = rows.filter(r => r.branch?.seed);
console.log(`\nseeding (Chromium rows the budget cut): n=${seeded.length}, seedMs p50 ${q(seeded.map(r => r.branch.seed.ms), 0.5)} p95 ${q(seeded.map(r => r.branch.seed.ms), 0.95)} max ${q(seeded.map(r => r.branch.seed.ms), 1)}, capped ${seeded.filter(r => r.branch.seed.capped).length}/${seeded.length}; rows with chains>0 ${seeded.filter(r => r.branch.seed.chains > 0).length}, promoted>0 ${seeded.filter(r => r.branch.seed.promoted > 0).length}`);
const emuOff = rows.filter(r => r.main?.guard && r.main?.guardEmulated && r.main.guard.checked !== r.main.guardEmulated.checked);
console.log(`main's own record vs #299's emulation: ${rows.filter(r => r.main?.guard).length - emuOff.length} rows equal, ${emuOff.length} differ ${emuOff.map(r => r.label).join(', ')}`);
const fail = rows.filter(r => (r.branch?.fired ?? []).some(x => x.startsWith('failures')) && !(r.main?.fired ?? []).some(x => x.startsWith('failures')));
console.log(`rows with read failures on the branch only: ${fail.length} (${[...new Set(fail.map(r => `${r.app}/${r.target}`))].join(', ')})`);
// Wide lists: the bisection against every child's frame.
console.log('\n| app | target | pos | rep | children | visible subset | in window (brute) | bisected | missing | extra | ordered pairs | bisect reads | brute ms | branch recordOnly | guard branch |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) for (const w of r.wide?.wide ?? []) {
  console.log(`| ${r.app} | ${r.target} | ${r.pos} | ${r.rep} | ${w.children} | ${w.visibleChildren}/${w.visibleRows} | ${w.brute} (${w.bruteFirst}–${w.bruteLast}${w.bruteContiguous ? '' : ', gaps'}) | ${w.bisected} | ${w.missing} | ${w.extra} | ${w.orderedPairs}/${w.pairs} | ${w.bisectReads} | ${Math.round(w.bruteMs)} | ${r.branch?.recordOnlyNodes ?? '-'} | ${g(r.branch)} |`);
}
