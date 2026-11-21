// #458's compact reader: per pop-up and route, one column per mode: the answer, whether a menu opened (still up at
// 1.8 s, or seen by the watch and gone), and the person's state (the frontmost app; whether the app's window rose above
// the Finder window in the window order, the engine's own overlay window left out), after the action and after Escape;
// the element routes' re-observation and item click.  node scripts/probe-458/pivot.mjs <results.json>...
import {readFileSync} from 'node:fs';
const results = process.argv.slice(2).flatMap(f => JSON.parse(readFileSync(f, 'utf8')).results);
const tally = xs => Object.entries(xs.reduce((m, x) => (m[x] = (m[x] ?? 0) + 1, m), {})).map(([k, n]) => `${k} ${n}`).join('; ') || '-';
const MODES = ['shared-behind', 'shared-front', 'dedicated-behind'];
const above = order => { const o = (order ?? []).filter(x => x !== 'cua-engine'); return o[0] === 'Finder' ? 'Finder' : 'app'; };
const answer = r => r.click ? (r.click.error ?? `ok/${r.click.route}`) : r.kitAct ? `ax ${r.kitAct.result}` : r.kitPost ? 'posted' : '-';
function cell(rs) {
  if (!rs.length) return '';
  const ok = rs.filter(r => !r.problem && !r.exception);
  const parts = [tally(ok.map(r => `${answer(r)} ${r.opened}`))];
  if (!ok[0]?.front) {
    const person = tally(ok.map(r => `${r.after.front === r.before.front ? 'front kept' : `front->${r.after.front.replace(/^com\.\w+\./, '')}`}, top ${above(r.after.order)}${r.afterClose ? `, Esc: top ${above(r.afterClose.order)}${r.afterClose.front !== r.before.front ? ` front->${r.afterClose.front.replace(/^com\.\w+\./, '')}` : ''}` : ''}`));
    parts.push(`[${person}]`);
  }
  const reobs = ok.filter(r => r.reobs);
  if (reobs.length) parts.push(`reobs ${tally(reobs.map(r => `${r.reobs.menuItems} items`))}`);
  const items = ok.filter(r => r.item);
  if (items.length) parts.push(`item ${tally(items.map(r => `${r.itemClick.error ?? 'ok'} ${r.item.landing}${r.front ? '' : `, top ${above(r.item.order)}`}`))}`);
  if (rs.length - ok.length) parts.push(`setup ${rs.length - ok.length}`);
  return parts.join(' ');
}
const menus = [...new Set(results.map(r => r.menu))];
const routes = [...new Set(results.map(r => r.route))];
console.log(`| pop-up | route | ${MODES.join(' | ')} |\n|---|---|${MODES.map(() => '---').join('|')}|`);
for (const m of menus) for (const route of routes) {
  const rs = results.filter(r => r.menu === m && r.route === route);
  if (!rs.length) continue;
  console.log(`| ${m} | ${route} | ${MODES.map(mode => cell(rs.filter(r => r.mode === mode))).join(' | ')} |`);
}
console.log('\nwatch, route 3 coordinate click behind: when the menu showed (ms after the click began) and when it went:');
for (const m of menus) for (const mode of ['shared-behind', 'dedicated-behind']) {
  const rs = results.filter(r => r.menu === m && r.route === 'button' && r.mode === mode && r.watch);
  console.log(`  ${m} ${mode}: ${tally(rs.map(r => { const s = r.watch.samples, at = r.watch.actAt; const on = s.findIndex(x => x[1] > 0); if (on < 0) return 'never'; const off = s.findIndex((x, i) => i > on && x[1] === 0); const t = v => Math.round((v - at) / 10) * 10; return off < 0 ? `${t(s[on][0])}..up` : `${t(s[on][0])}..${t(s[off][0])}`; }))}; screenHoldMs ${tally(rs.map(r => r.click?.meta?.delivery ? Math.round(r.click.meta.delivery.screenHoldMs / 10) * 10 : '-'))}`);
}
