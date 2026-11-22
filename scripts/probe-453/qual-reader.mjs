// #453 qual's reader (qual453.mjs): per cell, the engine's answer and its overlayClick, where the click went, and what of
// the person's moved; then the bar's lines (ruling 1040) for this engine.
//   node scripts/probe-453/qual-reader.mjs <results.json>...
import {readFileSync} from 'node:fs';
const tally = xs => Object.entries(xs.reduce((m, x) => (m[x] = (m[x] ?? 0) + 1, m), {})).map(([k, n]) => `${k} ×${n}`).join('; ') || '-';
const answerOf = r => {
  const a = r.click ?? {};
  const oc = a.overlayClick;
  const o = oc ? ` [${[oc.from === 'element' ? 'element' : null, oc.kind, oc.route, oc.effect, oc.confirmed === true ? 'confirmed' : oc.confirmed === false ? 'unconfirmed' : null, oc.refused ? `refused ${oc.refused}` : null, oc.refusedBy ? `by ${oc.refusedBy.role}:${oc.refusedBy.reason}` : null, oc.row ? `row ${oc.row.role}` : null].filter(Boolean).join(' ')}]` : '';
  const pc = a.popUpClick ? ` {popUp ${JSON.stringify(a.popUpClick).slice(0, 60)}}` : '';
  return `${a.error ?? `ok route ${JSON.stringify(a.route)}`}${o}${pc}`;
};
// The fix's overlay cells; a p- cell (parity, including the element click by ID that ruling 1066 cut from the fix) expects main's answer.
const OVERLAY_CELLS = /^(omnibox|datalist|permission|popover)\/[^/]+\/(?!p-)/;
const pct = (xs, q) => { const v = xs.filter(x => typeof x === 'number').sort((a, b) => a - b); return v.length ? Math.round(v[Math.min(v.length - 1, Math.floor(q * v.length))]) : '-'; };
const isTaken = r => /^(taken|changed|clicked|typed$|opened)/.test(r.effect ?? '');
/// The spike's and the order measure's table (ruling 1069: the window listed over the cover's is part of the bar, beside
/// frontmost and the key window; ruling 1070: a raise fails only in shared mode, in dedicated it is recorded).
function spikeTable(results) {
  const groups = new Map();
  for (const r of results) { const k = `${r.cell}${r.observedIsOverlay ? ' (prompt observed as the window)' : ''}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  console.log('| cell | rows | answer | taken | frontmost changed, transient / end | key/main window changed | window over the cover, transient / end | first over, ms after the click (p50) | AXPress result | AXPress ms p50 / max | overlay gone, ms after (p50) | problems |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [k, rs] of groups) {
    const m = rs.filter(r => r.click), n = m.length, behind = !/shared-front/.test(k);
    console.log(`| ${k} | ${n}/${rs.length} | ${tally(m.map(answerOf))} | ${m.filter(isTaken).length}/${n} | ${m.filter(r => r.front?.transient).length}/${n} / ${m.filter(r => r.front?.endChanged).length}/${n} | ${m.filter(r => r.key?.changed).length}/${n} | ${behind ? `${m.filter(r => r.windows?.aboveMs > 0).length}/${n} / ${m.filter(r => r.windows?.aboveAtEnd).length}/${n}` : 'n/a'} | ${behind ? pct(m.map(r => r.windows?.firstAboveAfterClick), 0.5) : '-'} | ${m.some(r => r.press) ? tally(m.filter(r => r.press).map(r => r.press.error ?? `${r.press.result}${r.press.sameRole ? '' : ' (other role)'}`)) : '-'} | ${m.some(r => r.press) ? `${pct(m.map(r => r.press?.actionMs), 0.5)} / ${pct(m.map(r => r.press?.actionMs), 1)}` : '-'} | ${m.some(r => r.life?.shownAtStart) ? `${pct(m.filter(r => r.life?.shownAtStart).map(r => r.life.goneMs), 0.5)} (${m.filter(r => r.life?.shownAtStart && r.life.goneMs == null).length} stayed)` : '-'} | ${tally(rs.filter(r => !r.click).map(r => r.problem ?? r.exception?.split('\n')[0] ?? '?'))} |`);
  }
  const perm = results.filter(r => r.permission);
  if (perm.length) console.log(`\n- permission state after: ${tally(perm.map(r => `${r.cell.split('/').slice(1).join('/')} ${r.pick?.want}->${r.permission.state ?? '-'}/${r.permission.request ?? '-'}`))}`);
  const wrong = results.filter(r => /^wrongRow/.test(r.effect ?? ''));
  console.log(`- wrong row: ${wrong.length}${wrong.length ? ` (${wrong.map(r => `${r.label} ${r.effect}`).join(', ')})` : ''}\n`);
}
for (const file of process.argv.slice(2)) {
  const {config, results} = JSON.parse(readFileSync(file, 'utf8'));
  if (config.spike || config.order) {
    console.log(`## ${config.label ?? ''} engine ${config.engineRef}  (${config.chrome}; ${config.macOS}; image ${config.image}; kit ${config.commit}; ${results.length} rows, ${config.minutes} min${config.budgetStop ? ', budget stop' : ''}${config.spikeReps < 99 ? `, spike reps ${config.spikeReps}` : ''})\n`);
    spikeTable(results);
    continue;
  }
  console.log(`## ${config.label ?? ''} engine ${config.engineRef}  (${config.chrome}; ${config.macOS}; image ${config.image}; kit ${config.commit}; ${results.length} rows, ${config.minutes} min${config.budgetStop ? ', budget stop' : ''})\n`);
  // Frontmost, Chrome's permission prompt is observed as the window itself: out of #453's scope (ruling 1071), kept apart.
  const keyOf = r => `${r.cell}${r.observedIsOverlay ? ' (prompt observed as the window)' : ''}`;
  const groups = new Map();
  for (const r of results) { const k = keyOf(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  console.log('| cell | rows | answer [overlayClick] | effect | frontmost changed, transient / end | key/main window changed | window over the cover, transient / end | beneath | problems |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const [k, rs] of groups) {
    const m = rs.filter(r => r.click);
    const n = m.length, behind = !/shared-front/.test(k);
    console.log(`| ${k} | ${n}/${rs.length} | ${tally(m.map(answerOf))} | ${tally(m.map(r => r.effect ?? '-'))} | ${m.filter(r => r.front?.transient).length} / ${m.filter(r => r.front?.endChanged).length} | ${m.filter(r => r.key?.changed).length} | ${behind ? `${m.filter(r => r.windows?.aboveMs > 0).length} / ${m.filter(r => r.windows?.aboveAtEnd).length}` : 'n/a'} | ${m.filter(r => r.reachedBeneath).length} | ${tally(rs.filter(r => !r.click).map(r => r.problem ?? r.exception?.split('\n')[0] ?? '?'))} |`);
  }
  // The bar's lines (rulings 1040, 1069, 1070, 1071).
  const inScope = r => r.click && OVERLAY_CELLS.test(r.cell) && !r.observedIsOverlay;
  const ov = results.filter(inScope);
  const ok = r => !r.click.error;
  const tookIt = r => /^(taken|changed)/.test(r.effect ?? '');
  const confirmed = r => r.click.overlayClick?.confirmed === true;
  const wrong = results.filter(r => /^wrongRow/.test(r.effect ?? ''));
  const falseOk = ov.filter(r => ok(r) && !tookIt(r));
  const falseConfirmed = ov.filter(r => confirmed(r) && !tookIt(r));
  const missed = ov.filter(r => r.click.error && tookIt(r));
  const clicked = results.filter(r => r.click);
  const count = (xs, f) => `${xs.filter(f).length}/${xs.length}`;
  console.log('\n### Bar lines\n');
  console.log(`- delivered, confirmed and taken, per overlay cell: ${[...groups].filter(([k, rs]) => rs.some(inScope) && rs[0].how !== 'relayout').map(([k, rs]) => `${k} ${count(rs.filter(inScope), r => ok(r) && confirmed(r) && tookIt(r))}`).join('; ')}`);
  for (const desktop of ['shared', 'dedicated']) {
    const xs = clicked.filter(r => r.desktop === desktop && !r.observedIsOverlay), behind = xs.filter(r => !r.mode.endsWith('front'));
    console.log(`- ${desktop}${desktop === 'dedicated' ? ' (recorded, not failed: ruling 1070)' : ''}: frontmost changed transient ${count(xs, r => r.front?.transient)}, end ${count(xs, r => r.front?.endChanged)}; key or main window changed ${count(xs, r => r.key?.changed)}; window over the cover transient ${count(behind, r => r.windows?.aboveMs > 0)}, end ${count(behind, r => r.windows?.aboveAtEnd)}${behind.some(r => r.windows?.aboveMs > 0) ? ` (${tally(behind.filter(r => r.windows?.aboveMs > 0).map(r => r.cell))})` : ''}`);
  }
  console.log(`- wrong row: ${wrong.length}/${clicked.length}${wrong.length ? ` (${wrong.map(r => `${r.label} ${r.effect}`).join(', ')})` : ''}`);
  for (const kind of ['omnibox', 'datalist', 'permission']) {
    const rl = results.filter(r => r.click && r.how === 'relayout' && r.kind === kind && !r.observedIsOverlay);
    if (rl.length) console.log(`- re-laid-out ${kind}: refused ${tally(rl.filter(r => r.click.error).map(r => r.click.overlayClick?.refused ?? r.click.error))}, the recorded row taken ${rl.filter(r => ok(r) && tookIt(r)).length}, a neighbour taken ${rl.filter(r => /^wrongRow/.test(r.effect ?? '')).length} (must be 0), other ${rl.filter(r => !r.click.error && !tookIt(r) && !/^wrongRow/.test(r.effect ?? '')).length} (of ${rl.length}; the list or prompt changed before the click in ${rl.filter(r => r.relaidOut ? r.relaidOut.window != null : JSON.stringify(r.overlayAtObs?.bounds) !== JSON.stringify(r.overlayAtClick?.bounds) || r.overlayAtObs?.n !== r.overlayAtClick?.n).length})`);
  }
  const ap = results.filter(r => r.atPoint && r.click);
  if (ap.length) {
    console.log(`- omnibox re-laid out, the row at the point: shown in the screenshot vs held now: changed in ${ap.filter(r => r.atPoint.nowPath !== r.atPoint.shownPath).length}/${ap.length} (now ${tally(ap.map(r => r.atPoint.nowPath === r.atPoint.shownPath ? 'same row' : r.atPoint.now == null ? 'no row' : 'another row'))}); pressed/taken: ${tally(ap.map(r => r.atPoint.taken == null ? `${r.click.error ?? 'ok'}, nothing taken` : r.atPoint.taken === r.atPoint.shownPath ? `${r.click.error ?? 'ok'}, the shown row` : `${r.click.error ?? 'ok'}, ANOTHER ROW ${r.atPoint.taken}`))}`);
    const bad = ap.filter(r => r.atPoint.taken != null && r.atPoint.taken !== r.atPoint.shownPath);
    if (bad.length) console.log(`  - wrong rows: ${bad.map(r => `${r.label}: shown ${r.atPoint.shownPath}, at the point now ${r.atPoint.nowPath}, taken ${r.atPoint.taken}`).join('; ')}`);
  }
  console.log(`- false ok (answered ok, not taken): ${falseOk.length}${falseOk.length ? ` (${falseOk.map(r => `${r.label} ${r.effect}`).join(', ')})` : ''}`);
  console.log(`- false confirmed (overlayClick confirmed, not taken): ${falseConfirmed.length}${falseConfirmed.length ? ` (${falseConfirmed.map(r => r.label).join(', ')})` : ''}`);
  console.log(`- refused but taken anyway: ${missed.length}${missed.length ? ` (${missed.map(r => r.label).join(', ')})` : ''}`);
  console.log(`- reached the window beneath: ${ov.filter(r => r.reachedBeneath).length}/${ov.length}`);
  const own = results.filter(r => r.observedIsOverlay && r.click);
  console.log(`- frontmost prompt observed as the window itself (out of scope, main's click): ${own.length}${own.length ? ` (${tally(own.map(r => `${r.cell} ${answerOf(r)} ${r.effect}`))})` : ''}`);
  const behindListed = results.filter(r => r.overlayListedBehind);
  if (behindListed.length) console.log(`- overlay listed behind the browser window while shown: ${behindListed.length} (${tally(behindListed.map(r => r.cell))})`);
  const perm = results.filter(r => r.permission);
  if (perm.length) console.log(`- permission state after: ${tally(perm.map(r => `${r.cell.split('/').slice(1).join('/')} ${r.pick?.want}->${r.permission.state ?? r.permission.geo ?? '-'}/${r.permission.request ?? '-'}`))}`);
  console.log('');
}
// Parity across heads (the first file the baseline): every cell outside #453's in-scope overlay cells, each head's answer
// and effect, and whether they differ.
const files = process.argv.slice(2).map(f => JSON.parse(readFileSync(f, 'utf8'))).filter(f => !f.config.spike && !f.config.order);
if (files.length > 1) {
  const cellsOf = f => { const g = new Map(); for (const r of f.results.filter(r => r.click && !(OVERLAY_CELLS.test(r.cell) && !r.observedIsOverlay))) { const k = `${r.cell}${r.observedIsOverlay ? ' (prompt observed as the window)' : ''}`; if (!g.has(k)) g.set(k, []); g.get(k).push(r); } return g; };
  const heads = files.map(cellsOf);
  console.log(`### Parity: ${files.map(f => `${f.config.label ?? ''} ${String(f.config.engineRef).slice(0, 8)}`).join(' against ')}\n`);
  console.log(`| cell | ${files.map(f => f.config.label ?? f.config.engineRef).join(' | ')} | same |`);
  console.log(`|---|${files.map(() => '---|').join('')}---|`);
  for (const k of [...new Set(heads.flatMap(h => [...h.keys()]))]) {
    const cols = heads.map(h => (h.get(k) ?? []).map(r => `${r.click.error ?? 'ok'} → ${r.effect ?? '-'}`));
    const sig = cols.map(c => [...new Set(c)].sort().join('; '));
    console.log(`| ${k} | ${cols.map(tally).join(' | ')} | ${sig.every(s => s === sig[0]) ? 'yes' : '**no**'} |`);
  }
  console.log('');
}
// Ruling 1074: the observation, main against fix. Per head the observations' time (the kit's wall clock around
// get_app_state, and the engine's screenshotWindowsListed and total timings where they reach the result), p50/p95; the
// result's shape (keys of the Skyshot, its screenshot, window and nodes); then across heads the shape's difference and the
// parity cells' rendered text (the model's view, each head rendered by its own renderer), lines one head has that the
// other never shows.
{
  const all = process.argv.slice(2).map(f => JSON.parse(readFileSync(f, 'utf8'))).filter(f => !f.config.spike && !f.config.order);
  const obsOf = f => f.results.flatMap(r => (r.observations ?? []).map(o => ({...o, cell: r.cell, how: r.how})).filter(o => !/^warm-/.test(o.label)));
  const q = (xs, p) => { const v = xs.filter(x => typeof x === 'number').sort((a, b) => a - b); return v.length ? Math.round(v[Math.min(v.length - 1, Math.floor(p * v.length))] * 10) / 10 : '-'; };
  const timingKeys = os => [...new Set(os.flatMap(o => Object.keys(o.timings ?? {})))];
  if (all.some(f => obsOf(f).length)) {
    console.log('### Observations (ruling 1074)\n');
    console.log('| head | observations | wall ms p50 / p95 | screenshotWindowsListed ms p50 / p95 | total timing p50 / p95 | render errors |');
    console.log('|---|---|---|---|---|---|');
    for (const f of all) {
      const os = obsOf(f);
      const total = timingKeys(os).find(k => /^(total|totalMs|getAppState)$/i.test(k));
      console.log(`| ${f.config.label ?? f.config.engineRef} | ${os.length} | ${q(os.map(o => o.ms), 0.5)} / ${q(os.map(o => o.ms), 0.95)} | ${q(os.map(o => (o.timings?.screenshotWindowsListedMs ?? o.timings?.screenshotWindowsListed)), 0.5)} / ${q(os.map(o => (o.timings?.screenshotWindowsListedMs ?? o.timings?.screenshotWindowsListed)), 0.95)} | ${total ? `${q(os.map(o => o.timings[total]), 0.5)} / ${q(os.map(o => o.timings[total]), 0.95)} (${total})` : '-'} | ${os.filter(o => /^render error/.test(o.text ?? '')).length} |`);
    }
    if (all.length > 1) {
      const [base, ...rest] = all;
      const shapeOf = f => { const s = {}; for (const o of obsOf(f)) for (const [k, v] of Object.entries(o.shape ?? {})) for (const x of v ?? []) (s[k] ??= new Set()).add(x); return s; };
      const sb = shapeOf(base);
      for (const f of rest) {
        const sf = shapeOf(f), lab = f.config.label ?? f.config.engineRef;
        const diff = Object.keys({...sb, ...sf}).map(k => { const add = [...(sf[k] ?? [])].filter(x => !sb[k]?.has(x)), gone = [...(sb[k] ?? [])].filter(x => !sf[k]?.has(x)); return add.length || gone.length ? `${k}: +${add.join(',') || '-'} −${gone.join(',') || '-'}` : null; }).filter(Boolean);
        console.log(`\n- result shape, ${lab} against ${base.config.label}: ${diff.length ? diff.join('; ') : 'the same keys'}`);
        const tk = timingKeys(obsOf(f)).filter(k => !timingKeys(obsOf(base)).includes(k));
        console.log(`- timing keys only on ${lab}: ${tk.join(', ') || 'none'}`);
        const linesOf = x => new Set(obsOf(x).filter(o => o.text).flatMap(o => o.text.split('\n').map(l => l.replace(/^\t*\d+ /, '').replace(/Memory usage - [0-9.]+ [KMG]B/g, 'Memory usage - N').trim()).filter(Boolean)));
        const lb = linesOf(base), lf = linesOf(f);
        const onlyF = [...lf].filter(l => !lb.has(l)), onlyB = [...lb].filter(l => !lf.has(l));
        console.log(`- parity cells' rendered text: ${obsOf(f).filter(o => o.text).length} observations on ${lab}, ${obsOf(base).filter(o => o.text).length} on ${base.config.label}; lines only on ${lab}: ${onlyF.length}${onlyF.length ? ` (${onlyF.slice(0, 8).map(l => JSON.stringify(l.slice(0, 100))).join(', ')})` : ''}; only on ${base.config.label}: ${onlyB.length}${onlyB.length ? ` (${onlyB.slice(0, 8).map(l => JSON.stringify(l.slice(0, 100))).join(', ')})` : ''}`);
        const owners = ['Google Chrome', 'TextEdit', 'Finder', 'cua-engine', 'Dock', 'Window Server'];
        const ownerLines = onlyF.filter(l => owners.some(o => l.includes(o)));
        console.log(`- new in the model's view on ${lab} (lines naming a window owner that ${base.config.label} never shows): ${ownerLines.length ? `yes: ${ownerLines.slice(0, 4).map(l => JSON.stringify(l.slice(0, 100))).join(', ')}` : 'no'}`);
      }
    }
    console.log('');
  }
}
