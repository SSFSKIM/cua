// #454's per-row effect reader for the coordinate clicks: per menu and mode, the answer, the menuItemClick meta's value,
// whether the item was taken (the page's change, the pop-up's value, the cell's own effect) and whether the menu stayed
// up; then every distinct sentence.  node scripts/probe-454/effects.mjs <results.json>...
import {readFileSync} from 'node:fs';
const results = process.argv.slice(2).flatMap(f => JSON.parse(readFileSync(f, 'utf8')).results);
const tally = xs => Object.entries(xs.reduce((m, x) => (m[x] = (m[x] ?? 0) + 1, m), {})).map(([k, n]) => `${k} ${n}`).join('; ') || '-';
const want = r => r.pick?.expect;
const taken = r => r.after?.effect === true || (r.after?.changes ?? []).some(c => c === `change:sel=${want(r)}`) || (r.after?.opener?.value === want(r) && r.openerBefore?.value !== want(r));
const rows = results.filter(r => r.route === 'coord' && r.click);
for (const menu of [...new Set(rows.map(r => r.menu))]) {
  const rs = rows.filter(r => r.menu === menu);
  console.log(`${menu}: ${tally(rs.map(r => `${r.click.error ?? 'ok'}${r.click.meta?.menuItemClick ? ` [${['effect', 'value', 'refused'].map(k => r.click.meta.menuItemClick[k]).filter(Boolean).join('/')}]` : ''} taken=${taken(r)} menuUp=${r.after?.menuUp}`))}`);
}
console.log('\nsentences:');
const s = rows.filter(r => r.click.message).reduce((m, r) => { const k = `${r.click.error}: ${r.click.message}`; (m[k] ??= []).push(r.menu); return m; }, {});
for (const [k, v] of Object.entries(s)) console.log(`  [${tally(v)}] ${k}`);
