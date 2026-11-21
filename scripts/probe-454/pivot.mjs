// #454's compact reader: where each route went per menu, one column per mode; then the engine's answers per menu and
// route, the menu windows, the observation's item, the closed-button rows and the problems.
//   node scripts/probe-454/pivot.mjs <results.json>
import {readFileSync} from 'node:fs';
const {results} = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const tally = xs => Object.entries(xs.reduce((m, x) => (m[x] = (m[x] ?? 0) + 1, m), {})).map(([k, n]) => `${k} ${n}`).join('; ') || '-';
const modes = ['shared-behind', 'shared-front', 'dedicated-behind'];
const menus = [...new Set(results.map(r => r.menu))];
const out = r => r.problem ? `problem:${r.problem}` : r.exception ? 'exception' : r.landing;
console.log(`| menu | route | ${modes.join(' | ')} |\n|---|---|${modes.map(() => '---').join('|')}|`);
for (const menu of menus) for (const route of [...new Set(results.map(r => r.route))]) {
  console.log(`| ${menu} | ${route} | ${modes.map(m => tally(results.filter(r => r.menu === menu && r.route === route && r.mode === m).map(out))).join(' | ')} |`);
}
console.log('\nengine answers per menu and route:');
for (const menu of menus) for (const route of ['coord', 'element', 'keys', 'outside', 'button']) {
  const rs = results.filter(r => r.menu === menu && r.route === route && r.click);
  console.log(`  ${menu} ${route}: ${tally(rs.map(r => [r.click.error ?? 'ok', `route=${r.click.route}`, r.click.stalePoint ? `${r.click.stalePoint.verdict}/${r.click.stalePoint.reason}` : '',
    r.click.meta?.elementClick ? `ec=${r.click.meta.elementClick.reason}/${r.click.meta.elementClick.action}` : '', r.stampedTo ? `stamp=${r.stampedTo.split(':')[0]}` : ''].filter(Boolean).join(' ')))}`);
}
console.log('\nmenu windows:', tally(results.filter(r => r.overlayAtObs?.popup).map(r => `${r.menu} L${r.overlayAtObs.popup.layer} ${JSON.stringify(r.overlayAtObs.popup.bounds)} ${r.overlayAtObs.popup.owner}`)));
console.log('observation item:', tally(results.filter(r => r.tree).map(r => `${r.menu} ${r.tree.item ? `${r.tree.item.role} [${r.tree.item.actions.join(',')}] depth ${r.tree.item.depth}` : 'none'}`)));
console.log('closed button:', tally(results.filter(r => r.route === 'button').map(r => `${r.menu}/${r.mode}: ${r.landing}${r.click?.meta?.elementClick ? ` ec=${r.click.meta.elementClick.reason}` : ''}${r.click?.meta?.activationClickKind ? ` act=${r.click.meta.activationClickKind.kind}` : ''}`)));
console.log('problems:', tally(results.filter(r => r.problem || r.exception).map(r => `${r.label.replace(/-\d+$/, '')}: ${r.problem ?? r.exception.split('\n')[0]}`)));
console.log('rows', results.length);
