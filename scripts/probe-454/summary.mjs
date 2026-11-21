// #454's reader: per menu, route and mode, the rows, the engine's answer and route, the stale-point verdicts, where the
// engine stamped a coordinate click, whether the observation and the app's AX tree hold the item (its chain and actions),
// and where the action went; then one representative meta per menu and route, the refusal sentences, the item's AX chains
// and the setup failures.  node scripts/probe-454/summary.mjs <results.json>...
import {readFileSync} from 'node:fs';
const tally = xs => Object.entries(xs.reduce((m, x) => (m[x] = (m[x] ?? 0) + 1, m), {})).map(([k, n]) => `${k} ×${n}`).join('; ') || '-';
for (const file of process.argv.slice(2)) {
  const {config, results} = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`## engine ${config.engineRef}  (${config.chrome}; ${config.macOS}; image ${config.image}; kit ${config.commit}; ${results.length} rows, ${config.minutes} min${config.budgetStop ? ', budget stop' : ''})\n`);
  console.log('| menu | route | mode | rows | menu window | answer (route) | stalePoint | stamped | item in observation (actions) | where it went |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  const groups = new Map();
  for (const r of results) { const k = `${r.menu}|${r.route}|${r.mode}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  for (const [k, rs] of groups) {
    const [menu, route, mode] = k.split('|');
    const win = tally(rs.map(r => r.overlayAtObs?.popup ? `L${r.overlayAtObs.popup.layer} ${JSON.stringify(r.overlayAtObs.popup.bounds)}` : r.route === 'button' ? (r.after?.overlay ? `after: L${r.after.overlay.layer}` : 'after: none') : 'none'));
    const ans = tally(rs.filter(r => r.click || r.kitPost).map(r => r.kitPost ? `kit ${r.kitPost.stamp} posted ${r.kitPost.posted ?? 2}` : `${r.click.error ?? (r.click.posted ? 'posted' : 'not posted')} (${r.click.route ?? '-'}${r.click.meta?.activationJoin ? `/${r.click.meta.activationJoin}` : ''})`));
    const sp = tally(rs.filter(r => r.click).map(r => r.click.stalePoint ? `${r.click.stalePoint.verdict}/${r.click.stalePoint.reason}` : 'none'));
    const st = tally(rs.filter(r => r.stampedTo).map(r => r.stampedTo.replace(/:\d+$/, '')));
    const tree = tally(rs.filter(r => r.tree).map(r => r.tree.item ? `yes ${r.tree.item.role}${r.tree.item.subrole ? `/${r.tree.item.subrole}` : ''} [${(r.tree.item.actions ?? []).join(',')}]` : `no (${r.tree.menuItems} AXMenuItem nodes)`));
    const out = tally(rs.map(r => r.problem ? `problem:${r.problem}` : r.exception ? `exception:${r.exception.split('\n')[0].slice(0, 60)}` : r.landing ?? '?'));
    console.log(`| ${menu} | ${route} | ${mode} | ${rs.length} | ${win} | ${ans} | ${sp} | ${st} | ${tree} | ${out} |`);
  }
  console.log('\nthe item in the app\'s AX tree (menuinfo: chain from the item up, actions, pid vs app):');
  for (const menu of [...new Set(results.map(r => r.menu))]) {
    const rs = results.filter(r => r.menu === menu && r.menuAX);
    console.log(`  ${menu}: ${tally(rs.map(r => r.menuAX.item ? `${r.menuAX.item.chain.map(c => `${c[0]}${c[1] ? `/${c[1]}` : ''}`).join(' < ')} [${r.menuAX.item.actions.join(',')}]` : `not found (menus ${r.menuAX.menus.length})`))}`);
    console.log(`    menus: ${tally(rs.flatMap(r => r.menuAX.menus.map(m => `${m.role} ${JSON.stringify(m.frame)} under ${m.chain.slice(1).map(c => c[0]).join(' < ')}`)))}`);
    console.log(`    observation: ${tally(rs.map(r => `${r.tree.menuNodes} menu nodes, ${r.tree.inMenuWindow} nodes in the menu window; item above: ${r.tree.above.slice(0, 5).join(' < ') || '-'}`))}`);
    console.log(`    point at click: ${tally(results.filter(r => r.menu === menu && r.atClick && r.route !== 'outside').map(r => `holds=${r.atClick.holdsPoint} hit=${(r.atClick.hit ?? []).slice(0, 3).map(c => c[0]).join('<')} sys=${(r.atClick.systemHit ?? []).slice(0, 2).map(c => c[0]).join('<')}`))}`);
  }
  console.log('\nkeys: presses and highlights:');
  for (const r of results.filter(r => r.keys)) console.log(`  ${r.label}: k=${r.keys.k} highlights ${JSON.stringify(r.keys.highlights)} downs ${tally(r.keys.answers.map(a => a.error ?? `ok(${a.route})`))} return ${r.click?.error ?? `ok(${r.click?.route})`} -> ${r.landing}`);
  console.log('\nrepresentative replies (first row per menu and route, verbatim meta):');
  const seen = new Set();
  for (const r of results) {
    const k = `${r.menu}|${r.route}`;
    if (seen.has(k) || !(r.click || r.kitPost)) continue;
    seen.add(k);
    console.log(`  ${r.label}: ${r.kitPost ? `kitPost ${JSON.stringify(r.kitPost)}` : `error=${r.click.error} message=${JSON.stringify(r.click.message)} note=${JSON.stringify(r.click.note)} meta=${JSON.stringify(r.click.meta)}`}`);
  }
  console.log('\nrefusal sentences:');
  const sentences = results.filter(r => r.click?.message).reduce((m, r) => { const s = `${r.click.error}: ${r.click.message}`; (m[s] ??= []).push(`${r.menu}/${r.route}/${r.mode}`); return m; }, {});
  for (const [s, where] of Object.entries(sentences)) console.log(`  ${where.length}x [${tally(where)}] ${s}`);
  console.log('\nsetup steps that answered an error, problems, exceptions:');
  for (const r of results) for (const s of r.steps ?? []) if (s.answer?.error) console.log(`  ${r.label} ${s.step}: ${typeof s.answer.error === 'string' ? s.answer.error : JSON.stringify(s.answer.error)}`);
  for (const r of results.filter(r => r.problem || r.exception)) console.log(`  ${r.label}: ${r.problem ?? r.exception.split('\n')[0].slice(0, 200)}`);
  console.log('\nopener AXPress answers:', tally(results.flatMap(r => (r.steps ?? []).filter(s => s.step.startsWith('open:')).map(s => `${r.menu}=${s.answer?.result ?? s.answer?.error}`))));
  console.log('picks:', tally(results.filter(r => r.pick).map(r => `${r.menu}/${r.route}: ${r.pick.by}:${r.pick.role ?? ''}:${r.pick.expect ?? r.pick.title ?? r.pick.value ?? ''}`)));
  console.log('\n');
}
