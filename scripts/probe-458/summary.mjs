// #458's reader: per pop-up, route and mode, the rows, the answer (the engine's error or ok with its route and element
// plan; the kit's AX result or post), whether a menu opened (its window at 300 ms and 1.8 s, AXExpanded, the AX menus),
// the frontmost app before and after, the focus, the page's events; for the element routes the re-observation's menu
// items and the item click's answer and effect. Then one verbatim meta per cell, the sentences and the problems.
//   node scripts/probe-458/summary.mjs <results.json>...
import {readFileSync} from 'node:fs';
const tally = xs => Object.entries(xs.reduce((m, x) => (m[x] = (m[x] ?? 0) + 1, m), {})).map(([k, n]) => `${k} ×${n}`).join('; ') || '-';
const plan = m => m?.elementClick ? `${m.elementClick.plan?.action ?? JSON.stringify(m.elementClick.plan)}${m.elementClick.reason ? `:${m.elementClick.reason}` : ''}` : null;
for (const file of process.argv.slice(2)) {
  const {config, results} = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`## engine ${config.engineRef}  (${config.chrome}; ${config.macOS}; image ${config.image}; kit ${config.commit}; ${results.length} rows, ${config.minutes} min${config.budgetStop ? ', budget stop' : ''})\n`);
  console.log('| pop-up | route | mode | rows | answer (route/plan/activation) | opened | AXExpanded | front before->after | focus after | page | re-observation | item click |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
  const groups = new Map();
  for (const r of results) { const k = `${r.menu}|${r.route}|${r.mode}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  for (const [k, rs] of groups) {
    const [menu, route, mode] = k.split('|');
    const ok = rs.filter(r => !r.problem && !r.exception);
    const ans = tally(ok.map(r => r.click ? `${r.click.error ?? 'ok'} (${r.click.route ?? '-'}${plan(r.click.meta) ? `/${plan(r.click.meta)}` : ''}${r.click.meta?.activationJoin ? `/${r.click.meta.activationJoin}` : ''})`
      : r.kitAct ? `ax ${r.kitAct.result} ${r.kitAct.ms >= 900 ? '(≥0.9 s)' : ''}` : r.kitPost ? `kit ${r.kitPost.stamp}` : '-'));
    const op = tally(ok.map(r => r.opened));
    const ex = tally(ok.map(r => `${r.before?.expanded}->${r.after?.expanded}`));
    const fr = tally(ok.map(r => `${r.before?.front}->${r.after?.front}`).map(s => s.replace(/com\.(apple|google)\./g, '')));
    const fo = tally(ok.map(r => `${r.after?.focused ?? '-'}${r.after?.focusedIsOpener ? '(button)' : ''}${r.focusAfterWrite ? ` [write ${r.focusAfterWrite.result}, button focused ${r.focusAfterWrite.openerFocused}]` : ''}`));
    const pg = menu === 'select' ? tally(ok.map(r => [...(r.after?.page ?? []), ...(r.after?.changes ?? [])].join(',') || 'none')) : '-';
    const re = tally(ok.filter(r => r.reobs).map(r => `${r.reobs.menuItems} items${r.reobs.menuItems ? ` (${r.reobs.tokens} tokens)` : ''}`));
    const it = tally(ok.filter(r => r.item || r.itemClick).map(r => `${r.itemClick?.error ?? 'ok'}${r.itemClick?.meta?.menuItemClick ? ` [${['effect', 'value', 'refused'].map(k => r.itemClick.meta.menuItemClick[k]).filter(Boolean).join('/')}]` : ''} -> ${r.item?.landing}`));
    const bad = rs.length - ok.length ? ` (${rs.length - ok.length} setup)` : '';
    console.log(`| ${menu} | ${route} | ${mode} | ${rs.length}${bad} | ${ans} | ${op} | ${ex} | ${fr} | ${fo} | ${pg} | ${re} | ${it} |`);
  }
  console.log('\nwhat opened (new windows of the app after 1.8 s, the AX menus):');
  for (const [k, rs] of groups) {
    const w = tally(rs.filter(r => r.after).map(r => `${(r.after.newWindows ?? []).map(x => `L${x.layer} ${JSON.stringify(x.bounds)}`).join(' ') || 'none'} | ax ${(r.after.axMenus ?? []).map(m => `${m.role}(${m.count}) under ${m.under}`).join(' ') || 'none'} | button menus ${JSON.stringify(r.after.openerMenus ?? null)}`));
    console.log(`  ${k}: ${w}`);
  }
  console.log('\nnode actions of the button in the observation:', tally(results.filter(r => r.node).map(r => `${r.menu}: ${r.node.role} [${(r.node.actions ?? []).join(',')}]`)));
  console.log('kit opener actions:', tally(results.filter(r => r.opener).map(r => `${r.menu}: [${(r.opener.actions ?? []).join(',')}]`)));
  console.log('\nrepresentative replies (first row per cell, verbatim meta):');
  const seen = new Set();
  for (const r of results) {
    const k = `${r.menu}|${r.route}|${r.mode}`;
    if (seen.has(k) || !(r.click || r.kitAct || r.kitPost)) continue;
    seen.add(k);
    if (r.click) console.log(`  ${r.label}: error=${r.click.error} message=${JSON.stringify(r.click.message)} meta=${JSON.stringify(r.click.meta)}`);
    else console.log(`  ${r.label}: ${JSON.stringify(r.kitAct ?? r.kitPost)}`);
    if (r.itemClick) console.log(`    item click: error=${r.itemClick.error} message=${JSON.stringify(r.itemClick.message)} meta=${JSON.stringify(r.itemClick.meta)}`);
  }
  console.log('\nsentences:');
  const sentences = results.flatMap(r => [r.click, r.itemClick].filter(c => c?.message).map(c => [`${c.error}: ${c.message}`, `${r.menu}/${r.route}/${r.mode}`]))
    .reduce((m, [s, w]) => ((m[s] ??= []).push(w), m), {});
  for (const [s, where] of Object.entries(sentences)) console.log(`  ${where.length}x [${tally(where)}] ${s}`);
  console.log('\nproblems, exceptions:');
  for (const r of results.filter(r => r.problem || r.exception)) console.log(`  ${r.label}: ${r.problem ?? r.exception.split('\n')[0].slice(0, 200)}`);
  console.log('\n');
}
