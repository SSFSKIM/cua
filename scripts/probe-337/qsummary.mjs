// The qualification's reader: per overlay, mode and side, the overlay's windows, whether the point lay in it, the engine's
// answer, the stale-point verdicts and where the click went; then every distinct refusal sentence and the setup steps
// that failed.  node scripts/probe-337/qsummary.mjs <results.json>...
import {readFileSync} from 'node:fs';
const tally = xs => Object.entries(xs.reduce((m, x) => (m[x] = (m[x] ?? 0) + 1, m), {})).map(([k, n]) => `${k} ×${n}`).join('; ');
for (const file of process.argv.slice(2)) {
  const {config, results} = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`## heads ${(config.heads ?? [config.head]).join(', ')} ${config.engineRefs ?? config.engineRef}  (${config.chrome}; ${config.macOS}; image ${config.image}; ${results.length} rows, ${config.minutes} min${config.budgetStop ? ', budget stop' : ''})\n`);
  console.log('| overlay | mode | side | head | rows | overlay window (n L layer owner bounds) | point in overlay / holdsPoint | answer | stalePoint | where it went |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  const groups = new Map();
  for (const r of results) { const k = `${r.overlay}|${r.mode}|${r.side}|${r.head ?? config.head ?? 'main'}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  for (const [k, rs] of groups) {
    const [overlay, mode, side, head] = k.split('|');
    const win = tally(rs.map(r => r.overlayAtObs?.popup ? `${r.overlayAtObs.popup.n} L${r.overlayAtObs.popup.layer} ${r.overlayAtObs.popup.owner} ${JSON.stringify(r.overlayAtObs.popup.bounds)}` : 'none'));
    const pt = tally(rs.filter(r => r.point).map(r => `${r.point.inOverlay}/${r.atClick?.holdsPoint}`));
    const ans = tally(rs.filter(r => r.click).map(r => r.click.error ?? (r.click.posted ? 'posted' : 'not posted')));
    const sp = tally(rs.filter(r => r.click).map(r => r.click.stalePoint ? `${r.click.stalePoint.verdict}/${r.click.stalePoint.reason}` : 'none'));
    const out = tally(rs.map(r => r.problem ? `problem:${r.problem}` : r.exception ? `exception:${r.exception.split('\n')[0].slice(0, 60)}` : r.landing ?? '?'));
    console.log(`| ${overlay} | ${mode} | ${side} | ${head} | ${rs.length} | ${win} | ${pt} | ${ans} | ${sp} | ${out} |`);
  }
  console.log('\nrefusal sentences:');
  const sentences = results.filter(r => r.click?.message).reduce((m, r) => { const s = `${r.click.error}: ${r.click.message}`; (m[s] ??= []).push(`${r.head ?? 'main'}:${r.overlay}/${r.side}`); return m; }, {});
  for (const [s, where] of Object.entries(sentences)) console.log(`  ${where.length}x [${tally(where)}] ${s}`);
  console.log('\nsetup steps that answered an error:');
  for (const r of results) for (const s of r.steps ?? []) if (s.answer?.error) console.log(`  ${r.label} ${s.step}: ${typeof s.answer.error === 'string' ? s.answer.error : JSON.stringify(s.answer.error)} ${(s.answer.message ?? '').slice(0, 120)}`);
  console.log('\nopener actions:', tally(results.flatMap(r => (r.steps ?? []).filter(s => s.step.startsWith('open:')).map(s => `${r.overlay}:${s.step}=${s.answer?.result ?? s.answer?.error}`))));
  console.log('\nexceptions:');
  for (const r of results.filter(r => r.exception)) console.log(`  ${r.label}: ${r.exception.split('\n')[0].slice(0, 200)}`);
  console.log('\npicks:', tally(results.filter(r => r.pick).map(r => `${r.overlay}/${r.side}: ${r.pick.by}:${r.pick.role ?? ''}:${(r.pick.label ?? r.pick.phrase ?? '').slice(0, 24)}`)));
  console.log('\n');
}
