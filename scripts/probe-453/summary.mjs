// #453's reader: per cell (overlay, mode, delivery), where the click went and what else moved; then the identity
// evidence, the overlay's life between the observation and the click, the timing cells, and the AX surfaces.
//   node scripts/probe-453/summary.mjs <results.json>...
import {readFileSync} from 'node:fs';
const tally = xs => Object.entries(xs.reduce((m, x) => (m[x] = (m[x] ?? 0) + 1, m), {})).map(([k, n]) => `${k} ×${n}`).join('; ') || '-';
const q = (xs, p) => { const s = xs.filter(x => typeof x === 'number').sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : '-'; };
const frameKey = f => (Array.isArray(f) ? f.slice(0, 4).map(Math.round).join(',') : String(f));
for (const file of process.argv.slice(2)) {
  const {config, results} = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`## engine ${config.engineRef}  (${config.chrome}; ${config.macOS}; image ${config.image}; kit ${config.commit}; ${results.length} rows, ${config.minutes} min${config.budgetStop ? ', budget stop' : ''}; history seeded ${config.seeded})\n`);
  const groups = new Map();
  for (const r of results) { if (!groups.has(r.cell)) groups.set(r.cell, []); groups.get(r.cell).push(r); }
  console.log('### Deliveries\n');
  console.log('| cell | rows | measured | where it went | row taken = row clicked | reached the window beneath | frontmost changed | observed window over the cover | person\'s key/main window changed | kit answer |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const [cell, rs] of groups) {
    if (rs[0].delivery === 'idle' || rs[0].delivery === 'type') continue;
    const m = rs.filter(r => r.landing);
    const person = m.filter(r => { const ps = r.watch?.person ?? []; return ps.some(x => frameKey(x[1]) !== frameKey(ps[0][1]) || frameKey(x[2]) !== frameKey(ps[0][2])); }).length;
    const answer = tally(m.map(r => r.click?.error ? `error:${r.click.error}` : r.click?.result != null ? `AXError ${r.click.result}${r.click.listed === false ? ' (not listed)' : ''} on ${r.click.pressed?.role}` : r.click?.posted != null ? `posted ${r.click.posted}${r.click.activated ? '+act' : ''}` : 'ok'));
    console.log(`| ${cell} | ${rs.length} | ${m.length} | ${tally(m.map(r => r.landing))} | ${tally(m.filter(r => r.takenRow != null).map(r => String(r.takenRow)))} | ${m.filter(r => r.reachedBeneath).length}/${m.length} | ${m.filter(r => r.frontChanged).length}/${m.length} (${tally(m.map(r => `${r.frontAtObs}->${r.after?.front}`))}) | ${m.filter(r => r.watch?.aboveMs > 0).length}/${m.length} | ${person}/${m.length} | ${answer} |`);
  }
  console.log('\nproblems:', tally(results.filter(r => r.problem || r.exception).map(r => `${r.cell}: ${r.problem ?? r.exception.split('\n')[0].slice(0, 80)}`)));
  console.log('\n### Identity (just before the click, the hit at the point against the row picked at the observation)\n');
  console.log('| overlay | mode | rows | hit role | hit\'s window = overlay | row text same | row frame same | overlay window number same | pick | observation tree: nodes in the overlay / a row\'s text in it |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  const byOM = new Map();
  for (const r of results.filter(r => r.identity)) { const k = `${r.overlay}|${r.mode}`; if (!byOM.has(k)) byOM.set(k, []); byOM.get(k).push(r); }
  for (const [k, rs] of byOM) {
    const [o, mode] = k.split('|');
    const winIs = rs.filter(r => r.identity.hitWindow && r.overlayAtObs?.popup && frameKey(r.identity.hitWindow) === frameKey(r.overlayAtObs.popup.bounds)).length;
    console.log(`| ${o} | ${mode} | ${rs.length} | ${tally(rs.map(r => r.identity.hitRole))} | ${winIs}/${rs.length} | ${tally(rs.map(r => String(r.identity.sameText)))} | ${tally(rs.map(r => String(r.identity.sameFrame)))} | ${tally(rs.map(r => String(r.identity.sameWindow)))} | ${tally(rs.map(r => `${r.pick?.by}:${r.pick?.role}#${r.pick?.index ?? ''}/${r.pick?.count ?? ''}`))} | ${tally(rs.map(r => `${r.observation?.nodesInOverlay}/${r.observation?.rowTextInTree}`))} |`);
  }
  console.log('\n### The overlay between the observation and the click (delivery rows) and in the timing cells\n');
  console.log('| overlay | mode | kind | rows | delay ms p50 | gone before the end | window changes (n, bounds, alpha) p50/max | row layouts p50/max | AX read ms avg p50 / max | windows seen |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  const byL = new Map();
  for (const r of results.filter(r => r.life && !r.life.error)) { const k = `${r.overlay}|${r.mode}|${r.delivery === 'idle' || r.delivery === 'type' ? r.delivery : 'before click'}`; if (!byL.has(k)) byL.set(k, []); byL.get(k).push(r); }
  for (const [k, rs] of byL) {
    const [o, mode, kind] = k.split('|');
    const wch = rs.map(r => (r.life.events ?? []).filter(e => e[1] === 'w').length - 1);
    console.log(`| ${o} | ${mode} | ${kind} | ${rs.length} | ${q(rs.map(r => r.delayMs ?? r.life.ms), 0.5)} | ${rs.filter(r => r.life.goneAt != null).length} | ${q(wch, 0.5)}/${Math.max(...wch)} | ${q(rs.map(r => r.life.layouts), 0.5)}/${Math.max(...rs.map(r => r.life.layouts))} | ${q(rs.map(r => r.life.axMsAvg), 0.5)} / ${Math.max(...rs.map(r => r.life.axMsMax ?? 0))} | ${tally(rs.map(r => String((r.life.windows ?? []).length)))} |`);
  }
  console.log('\ntiming rows, row-change times (ms from the observation) per row:');
  for (const r of results.filter(r => r.life && (r.delivery === 'idle' || r.delivery === 'type'))) {
    const ev = (r.life.events ?? []).map(e => `${e[0]}${e[1]}${e[1] === 'r' ? `(${e[2].length})` : e[2] === 'none' ? '(gone)' : ''}`).join(' ');
    console.log(`  ${r.label}${r.typedAt != null ? ` typed@${r.typedAt}` : ''}: ${ev}`);
  }
  console.log('\n### AX surfaces at the observation\n');
  for (const o of [...new Set(results.map(r => r.overlay))]) {
    const rs = results.filter(r => r.overlay === o && r.overlayAtObs);
    console.log(`- ${o}: root ${tally(rs.map(r => `${r.overlayAtObs.rootBy ?? 'none'}:${r.overlayAtObs.root?.role ?? '-'}/${r.overlayAtObs.root?.subrole ?? '-'}`))}; web areas ${tally(rs.map(r => String((r.overlayAtObs.webAreas ?? []).length)))}; row-sized elements ${tally(rs.map(r => String(r.overlayAtObs.rowElements?.length ?? 0)))}`);
    const ex = rs.find(r => r.overlayAtObs.rowElements?.length);
    if (ex) for (const e of ex.overlayAtObs.rowElements.slice(0, 8)) console.log(`    ${e.role}/${e.subrole ?? ''} ${JSON.stringify(e.frame)} actions=${(e.actions ?? []).join(',')} text=${(e.text ?? '').slice(0, 90)}`);
    const om = results.find(r => r.overlay === o && r.omniboxAtObs && !r.omniboxAtObs.error);
    if (om) {
      const a = om.omniboxAtObs;
      console.log(`    address field: ${a.field?.role} "${a.field?.description}" value=${a.value} expanded=${a.expanded} children=${(a.children ?? []).length} element-valued attributes: ${Object.entries(a.linked ?? {}).map(([k, v]) => `${k}=[${v.map(x => `${x.role}${x.frame ? JSON.stringify(x.frame) : ''}`).join(' ')}]`).join('; ') || 'none'}`);
    }
  }
  console.log('\n');
}
