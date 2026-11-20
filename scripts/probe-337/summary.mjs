// #337's reader: per cell and sequence, the clicks' outcomes (refused with which name, or where they went), the stale-
// point guard's verdicts, whether the point lay in the popup, the popup's window facts, and every distinct refusal
// sentence.  node scripts/probe-337/summary.mjs <results.json>
import {readFileSync} from 'node:fs';
const {config, results} = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(`engine ${config.engineRef}  ${config.chrome}  ${config.macOS}  image ${config.image}  rows ${results.length}  ${config.minutes} min${config.budgetStop ? '  (budget stop)' : ''}`);
const tally = xs => Object.entries(xs.reduce((m, x) => (m[x] = (m[x] ?? 0) + 1, m), {})).map(([k, n]) => `${k} ${n}`).join('; ');
const groups = new Map();
for (const r of results) { const k = `${r.cell} ${r.seq}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
console.log('\n| cell | seq | rows | outcome | stalePoint | point in popup | popup at obs (n layer bounds) | pick | front at obs -> after |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const [k, rs] of groups) {
  const [cell, seq] = k.split(' ');
  const out = tally(rs.map(r => r.problem ? `problem:${r.problem}` : r.exception ? 'exception' : r.landing ?? '?'));
  const sp = tally(rs.filter(r => r.click).map(r => r.click.stalePoint ? `${r.click.stalePoint.verdict}/${r.click.stalePoint.reason}` : 'none'));
  const inPop = tally(rs.filter(r => r.point).map(r => String(r.point.inPopup)));
  const pops = tally(rs.map(r => r.popupAtObs?.popup ? `${r.popupAtObs.popup.n} L${r.popupAtObs.popup.layer} ${JSON.stringify(r.popupAtObs.popup.bounds)}` : 'none'));
  const pick = tally(rs.filter(r => r.pick).map(r => `${r.pick.by}${r.pick.role ? ':' + r.pick.role : ''}`));
  const fr = tally(rs.filter(r => r.after).map(r => `${r.frontAtObs}->${r.after.front}`));
  console.log(`| ${cell} | ${seq} | ${rs.length} | ${out} | ${sp} | ${inPop} | ${pops} | ${pick} | ${fr} |`);
}
const count = (xs, key) => xs.reduce((a, x) => { const k = key(x); a[k] = (a[k] ?? 0) + 1; return a; }, {});
console.log('\nrefusal sentences:');
for (const [m, n] of Object.entries(count(results.filter(r => r.click?.message), r => `${r.click.error}: ${r.click.message}`))) console.log(`  ${n}x ${m}`);
console.log('\nstep refusals:');
for (const r of results) for (const s of r.steps ?? []) if (s.answer?.error) console.log(`  ${r.label} ${s.step}: ${s.answer.error}: ${(s.answer.message ?? '').slice(0, 200)}`);
console.log('\nposted clicks (cell/seq: route, activationClick, delivery):');
for (const [m, n] of Object.entries(count(results.filter(r => r.click && !r.click.error), r => `${r.cell}/${r.seq}: ${r.click.route} ${r.click.meta?.activationClick ?? '-'} ${JSON.stringify(r.click.meta?.delivery ?? null)}`))) console.log(`  ${n}x ${m}`);
const one = results.find(r => r.popupAtObs?.popup && r.target === 'popup');
if (one) console.log('\nfirst popup reading:', JSON.stringify({label: one.label, window: one.window, popup: one.popupAtObs.popup, appWindows: one.popupAtObs.appWindows,
  axPopup: one.popupAtObs.axPopup, rows: (one.popupAtObs.axRows ?? []).slice(0, 12), scan: one.popupAtObs.scan, pick: one.pick, nodesInPopup: one.nodesInPopup,
  signalsHit: one.signals?.hit, sameAppAbove: one.signals?.sameAppAbove}, null, 1));
