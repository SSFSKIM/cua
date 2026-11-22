// #453 qual's reader (qual453.mjs): per cell, the engine's answer and its overlayClick, where the click went, and what of
// the person's moved; then the bar's lines (ruling 1040) for this engine.
//   node scripts/probe-453/qual-reader.mjs <results.json>...
import {readFileSync} from 'node:fs';
const tally = xs => Object.entries(xs.reduce((m, x) => (m[x] = (m[x] ?? 0) + 1, m), {})).map(([k, n]) => `${k} ×${n}`).join('; ') || '-';
const answerOf = r => {
  const a = r.click ?? {};
  const oc = a.overlayClick;
  const o = oc ? ` [${[oc.from === 'element' ? 'element' : null, oc.kind, oc.route, oc.effect, oc.refused ? `refused ${oc.refused}` : null].filter(Boolean).join(' ')}]` : '';
  const pc = a.popUpClick ? ` {popUp ${JSON.stringify(a.popUpClick).slice(0, 60)}}` : '';
  return `${a.error ?? `ok route ${JSON.stringify(a.route)}`}${o}${pc}`;
};
// The fix's overlay cells; a p- cell (parity, including the element click by ID that ruling 1066 cut from the fix) expects main's answer.
const OVERLAY_CELLS = /^(omnibox|datalist|permission|popover)\/[^/]+\/(?!p-)/;
for (const file of process.argv.slice(2)) {
  const {config, results} = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`## ${config.label ?? ''} engine ${config.engineRef}  (${config.chrome}; ${config.macOS}; image ${config.image}; kit ${config.commit}; ${results.length} rows, ${config.minutes} min${config.budgetStop ? ', budget stop' : ''})\n`);
  const groups = new Map();
  for (const r of results) { if (!groups.has(r.cell)) groups.set(r.cell, []); groups.get(r.cell).push(r); }
  console.log('| cell | rows | answer [overlayClick] | effect | frontmost changed, transient / end | key/main window changed | observed window over the cover | reordered | beneath | problems |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const [cell, rs] of groups) {
    const m = rs.filter(r => r.click);
    const n = m.length;
    console.log(`| ${cell} | ${n}/${rs.length} | ${tally(m.map(answerOf))} | ${tally(m.map(r => r.effect ?? '-'))} | ${m.filter(r => r.front?.transient).length} / ${m.filter(r => r.front?.endChanged).length} | ${m.filter(r => r.key?.changed).length} | ${m.filter(r => r.windows?.aboveMs > 0).length} | ${m.filter(r => r.windows?.reordered).length} | ${m.filter(r => r.reachedBeneath).length} | ${tally(rs.filter(r => !r.click).map(r => r.problem ?? r.exception?.split('\n')[0] ?? '?'))} |`);
  }
  // The bar's lines.
  const ov = results.filter(r => r.click && OVERLAY_CELLS.test(r.cell));
  const ok = r => !r.click.error;
  const tookIt = r => /^(taken|changed)/.test(r.effect ?? '');
  const wrong = results.filter(r => /^wrongRow/.test(r.effect ?? ''));
  const falseOk = ov.filter(r => ok(r) && !tookIt(r));
  const falseConfirmed = ov.filter(r => ['closed', 'rowGone'].includes(r.click.overlayClick?.effect) && !tookIt(r));
  const missed = ov.filter(r => r.click.error && tookIt(r));
  const clicked = results.filter(r => r.click);
  console.log('\n### Bar lines\n');
  console.log(`- overlay kinds delivered and taken, per cell: ${[...groups].filter(([c]) => OVERLAY_CELLS.test(c)).map(([c, rs]) => `${c} ${rs.filter(r => r.click && ok(r) && tookIt(r)).length}/${rs.filter(r => r.click).length}`).join('; ')}`);
  console.log(`- frontmost changed, transient: ${clicked.filter(r => r.front?.transient).length}/${clicked.length}; at the end: ${clicked.filter(r => r.front?.endChanged).length}/${clicked.length}`);
  console.log(`- key or main window changed: ${clicked.filter(r => r.key?.changed).length}/${clicked.length}`);
  const raised = clicked.filter(r => r.windows?.aboveMs > 0);
  console.log(`- observed window listed over the cover's (behind rows), window order changed: ${raised.length}/${clicked.filter(r => !r.front).length}${raised.length ? ` (${tally(raised.map(r => r.cell))})` : ''}`);
  console.log(`- wrong row: ${wrong.length}/${clicked.length}${wrong.length ? ` (${wrong.map(r => `${r.label} ${r.effect}`).join(', ')})` : ''}`);
  const rl = results.filter(r => r.click && r.how === 'relayout');
  console.log(`- re-laid-out: refused ${rl.filter(r => r.click.error).length}, same text taken ${rl.filter(r => ok(r) && tookIt(r)).length}, different row taken ${rl.filter(r => /^wrongRow/.test(r.effect ?? '')).length}, other ${rl.filter(r => !r.click.error && !tookIt(r) && !/^wrongRow/.test(r.effect ?? '')).length} (of ${rl.length})`);
  console.log(`- false ok (answered ok, not taken): ${falseOk.length}${falseOk.length ? ` (${falseOk.map(r => `${r.label} ${r.effect}`).join(', ')})` : ''}`);
  console.log(`- false confirmed (overlayClick closed or rowGone, not taken): ${falseConfirmed.length}${falseConfirmed.length ? ` (${falseConfirmed.map(r => r.label).join(', ')})` : ''}`);
  console.log(`- refused but taken anyway: ${missed.length}${missed.length ? ` (${missed.map(r => r.label).join(', ')})` : ''}`);
  console.log(`- reached the window beneath: ${ov.filter(r => r.reachedBeneath).length}/${ov.length}`);
  const behind = results.filter(r => r.overlayListedBehind);
  console.log(`- overlay listed behind the browser window while shown: ${behind.length}${behind.length ? ` (${tally(behind.map(r => r.cell))})` : ''}`);
  const perm = results.filter(r => r.permission);
  if (perm.length) console.log(`- permission state after: ${tally(perm.map(r => `${r.cell.split('/').slice(1).join('/')} ${r.pick?.want}->${r.permission.state ?? '-'}/${r.permission.request ?? '-'}`))}`);
  console.log('');
}
