// #458's restore reader: per pop-up, mode and route, the rows; the person's F1 back on top at the end; the windows whose
// order moved between before the open and the end (beyond none expected); the menu at the end; the pick taken; the
// frontmost app and the app's AXFrontmost; the person's focused window kept; the restore's ms, AXRaise count and
// whether it found the app's window in front; how long the app's window covered F1 (the watch) and until when. Then the
// rows where anything else moved, the restore's failures, and the mid-route reads (raise-open, person-click, timeout).
//   node scripts/probe-458/rsummary.mjs <results.json>...
import {readFileSync} from 'node:fs';
const files = process.argv.slice(2);
const results = files.flatMap(f => JSON.parse(readFileSync(f, 'utf8')).results);
const config = JSON.parse(readFileSync(files[0], 'utf8')).config;
const tally = xs => Object.entries(xs.reduce((m, x) => (m[x] = (m[x] ?? 0) + 1, m), {})).map(([k, n]) => `${k} ${n}`).join('; ') || '-';
const pct = (xs, p) => { const s = xs.filter(x => typeof x === 'number').sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]) : '-'; };
console.log(`## engine ${config.engineRef} (${config.chrome}; ${config.macOS}; image ${config.image}; kit ${config.commit}; ${results.length} rows, ${config.minutes} min${config.budgetStop ? ', budget stop' : ''})\n`);
console.log('| pop-up | mode | route | rows | F1 on top at end | whole order as before | other windows moved | menu at end | picked | front / app AXFrontmost | person focus kept | restore ms p50/max (raises; found in front) | F1 covered ms p50/max |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const keys = [...new Set(results.map(r => `${r.menu}|${r.mode}|${r.route}`))];
for (const k of keys) {
  const [menu, mode, route] = k.split('|');
  const rs = results.filter(r => `${r.menu}|${r.mode}|${r.route}` === k);
  const ok = rs.filter(r => r.final);
  const rest = ok.flatMap(r => r.steps.filter(s => s.step.startsWith('restore')));
  const others = r => (r.moved ?? []).filter(m => !m.endsWith(`:${r.target}`) && !m.endsWith(`:${r.f1}`));
  const cells = [
    tally(ok.map(r => r.personOnTop ? 'yes' : `no (${r.final.order[0]})`)),
    tally(ok.map(r => (r.moved ?? []).length ? 'no' : 'yes')),
    tally(ok.map(r => others(r).length ? `moved ${others(r).join(',')}` : 'none')),
    tally(ok.map(r => r.final.menuUp ? 'up' : 'closed')),
    route.startsWith('pick') ? tally(ok.map(r => r.picked === r.pick?.expect ? 'taken' : `not (${r.picked})`)) : tally(ok.map(r => r.picked ? `changed ${r.picked}` : 'unchanged')),
    tally(ok.map(r => `${r.final.front?.replace(/^com\.\w+\./, '')}/${r.final.appFrontmost}`)),
    tally(ok.map(r => JSON.stringify(r.final.personFocusedWindow) === JSON.stringify(r.before.personFocusedWindow) ? 'yes' : `no ${JSON.stringify(r.final.personFocusedWindow)}`)),
    rest.length ? `${pct(rest.map(s => s.ms), 0.5)}/${pct(rest.map(s => s.ms), 1)} (${tally(rest.map(s => s.error ?? `${s.raises.length} raise${s.raises.length === 1 ? '' : 's'}${s.raises.some(x => x !== 0) ? ` err ${s.raises.filter(x => x !== 0).join(',')}` : ''}; ${s.firstAbove ? 'in front' : 'not in front'}${s.lastAbove ? ', still in front' : ''}`))})` : '-',
    `${pct(ok.map(r => r.watch?.aboveMs), 0.5)}/${pct(ok.map(r => r.watch?.aboveMs), 1)}${ok.some(r => r.watch?.aboveAtEnd) ? ` (still covering at the watch's end ${ok.filter(r => r.watch?.aboveAtEnd).length})` : ''}`,
  ];
  const bad = rs.length - ok.length ? ` (${rs.length - ok.length} setup)` : '';
  console.log(`| ${menu} | ${mode} | ${route} | ${rs.length}${bad} | ${cells.join(' | ')} |`);
}
console.log('\nmid-route reads (menu, F1 on top, front, app AXFrontmost):');
for (const k of keys) {
  const rs = results.filter(r => `${r.menu}|${r.mode}|${r.route}` === k && r.mid);
  if (rs.length) console.log(`  ${k} ${rs[0].mid.label}: ${tally(rs.map(r => `menu ${r.mid.menuUp ? 'up' : 'closed'}, top ${r.mid.order[0] === `Finder:${r.f1}` ? 'F1' : r.mid.order[0]}, front ${r.mid.front?.replace(/^com\.\w+\./, '')}, app ${r.mid.appFrontmost}`))}`);
}
console.log('\nopened (after the element click): ', tally(results.filter(r => r.opened).map(r => `${r.menu}/${r.mode}: menu ${r.opened.menuUp ? 'up' : 'none'}, top ${r.opened.order[0] === `Finder:${r.f1}` ? 'F1' : r.opened.order[0]?.split(':')[0]}, front ${r.opened.front?.replace(/^com\.\w+\./, '')}`)));
console.log('layout at the start: ', tally(results.filter(r => r.before).map(r => `${r.menu}: ${r.before.order.map(x => x.split(':')[0]).join(' > ')}${r.layoutOk ? '' : ' (F1 not on top)'}`)));
console.log('\nrows where another window moved:');
for (const r of results.filter(r => r.final && (r.moved ?? []).some(m => !m.endsWith(`:${r.target}`) && !m.endsWith(`:${r.f1}`))))
  console.log(`  ${r.label}: moved ${r.moved.join(',')}; before ${r.before.order.join(' > ')}; end ${r.final.order.join(' > ')}`);
console.log('\nrestore steps that failed or left the window in front:');
for (const r of results) for (const s of r.steps.filter(s => s.step.startsWith('restore') && (s.error || s.lastAbove || s.raises?.some(x => x !== 0)))) console.log(`  ${r.label} ${s.step}: ${JSON.stringify(s)}`);
console.log('\nother steps answered:', tally(results.flatMap(r => r.steps.filter(s => !s.step.startsWith('restore')).map(s => `${r.menu} ${s.step}: ${s.error ?? (s.menu != null ? `AXCancel menu ${s.menu}${s.item != null ? ` item ${s.item}` : ''}` : 'ok')}${s.meta?.menuItemClick ? ` [${s.meta.menuItemClick.effect}]` : ''}`))));
console.log('open answers:', tally(results.filter(r => r.open).map(r => `${r.menu}/${r.mode}: ${r.open.error ?? 'ok'} route ${r.open.route}`)));
console.log('\nproblems, exceptions:');
for (const r of results.filter(r => r.problem || r.exception)) console.log(`  ${r.label}: ${r.problem ?? r.exception.split('\n')[0].slice(0, 200)}`);
