// #458's qualification reader: one block per engine run (results.json each), per cell (kind, control, mode, layout):
// the answer with popUpClick's effect or kept reason, the menu or list open at 1.8 s, the pick afterwards, the whole
// window order kept (n/N) and what moved, the frontmost app and the person's focused window kept, the app's AXFrontmost,
// how long the app's window covered F1 (p50/max) and the meta's restore. Then false confirmations (confirmed, nothing
// open), the layouts as built, the sentences and the problems.
//   node scripts/probe-458/qreader.mjs <results.json>...
import {readFileSync} from 'node:fs';
const tally = xs => Object.entries(xs.reduce((m, x) => (m[x] = (m[x] ?? 0) + 1, m), {})).map(([k, n]) => `${k} ${n}`).join('; ') || '-';
const pct = (xs, p) => { const s = xs.filter(x => typeof x === 'number').sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]) : '-'; };
const short = s => (s ?? '').replace(/^com\.\w+\./, '');
for (const file of process.argv.slice(2)) {
  const {config, results} = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`## ${config.engineLabel ?? ''} engine ${config.engineRef} (${config.chrome}; ${config.macOS}; image ${config.image}; kit ${config.commit}; ${results.length} rows, ${config.minutes} min${config.budgetStop ? ', budget stop' : ''})\n`);
  console.log('| cell | rows | answer [popUpClick] | open at 1.8 s | pick after | whole order kept | moved | front / person focus kept (1.8 s) | key window off F1 (5 ms watch): transient / end / unread | app AXFrontmost | F1 covered ms p50/max | click ms p50/max | restored (meta) |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const keys = [...new Set(results.map(r => `${r.kind}|${r.control}|${r.mode}|${r.layout}`))];
  for (const k of keys) {
    const rs = results.filter(r => `${r.kind}|${r.control}|${r.mode}|${r.layout}` === k);
    const ok = rs.filter(r => r.after);
    const pc = r => r.click?.meta?.popUpClick;
    const ans = tally(ok.map(r => `${r.click.error ?? 'ok'}/${r.click.route ?? '-'}${pc(r) ? ` [${pc(r).kept ? `kept ${pc(r).kept}` : pc(r).refused ? 'refused' : `${pc(r).action ?? ''} ${pc(r).effect ?? ''}${pc(r).arrow ? ' arrow' : ''}`}]` : ''}`));
    const open = tally(ok.map(r => r.opened ?? (r.page?.length ? r.page.join(',') : r.after.focused ?? '-')));
    const pick = tally(ok.filter(r => r.itemClick).map(r => `${r.itemClick.error ?? 'ok'} ${r.item?.taken ? 'taken' : 'not taken'}${r.item?.moved?.length ? ` moved ${r.item.moved.join(',')}` : ''}`));
    const kept = `${ok.filter(r => r.orderRestored).length}/${ok.length}`;
    const mv = tally(ok.filter(r => r.moved?.length).map(r => r.moved.join(',')));
    const fr = tally(ok.map(r => `${short(r.before.front)}->${short(r.after.front)}, focus ${JSON.stringify(r.after.personFocusedWindow) === JSON.stringify(r.before.personFocusedWindow) ? 'kept' : 'CHANGED'}`));
    const af = tally(ok.map(r => String(r.after.appFrontmost)));
    const keyed = ok.filter(r => r.key);
    const key = keyed.length ? `${keyed.filter(r => r.key.focusedOff.length || r.key.mainOff.length).length} / ${keyed.filter(r => !r.key.endF1).length} / ${keyed.filter(r => r.key.unread).length} of ${keyed.length}` : '-';
    const actMs = `${pct(ok.map(r => r.actMs), 0.5)}/${pct(ok.map(r => r.actMs), 1)}`;
    const cover = `${pct(ok.map(r => r.watch?.aboveMs), 0.5)}/${pct(ok.map(r => r.watch?.aboveMs), 1)}`;
    const rest = tally(ok.filter(r => pc(r)?.restored).map(r => { const x = pc(r).restored; return `${x.windows} win ${x.complete ? 'complete' : 'INCOMPLETE'}${x.stopped ? ` stopped ${x.stopped}` : ''}${x.skipped ? ` skipped ${x.skipped}` : ''} ${x.raises} raise${x.raises === 1 ? '' : 's'}`; }));
    const noRestore = ok.filter(r => pc(r)?.action && !pc(r).restored).length;
    const restMs = ok.filter(r => pc(r)?.restored).map(r => pc(r).restored.ms);
    const bad = rs.length - ok.length ? ` (${rs.length - ok.length} setup)` : '';
    console.log(`| ${k.replace(/\|/g, ' ')} | ${rs.length}${bad} | ${ans} | ${open} | ${pick || '-'} | ${kept} | ${mv} | ${fr} | ${key} | ${af} | ${cover} | ${actMs} | ${rest}${noRestore ? `; none ${noRestore}` : ''}${restMs.length ? `; ms ${pct(restMs, 0.5)}/${pct(restMs, 1)}` : ''} |`);
  }
  console.log('\nkey window off F1 (rows, behind modes; first samples):');
for (const r of results.filter(r => r.key && r.mode !== 'shared-front' && (r.key.focusedOff.length || r.key.mainOff.length || !r.key.endF1))) console.log(`  ${r.label}: focused off ${JSON.stringify(r.key.focusedOff.slice(0, 3))} main off ${JSON.stringify(r.key.mainOff.slice(0, 3))} end F1 ${r.key.endF1}`);
console.log('\nunconfirmed answers with the menu up at 1.8 s (false unconfirmed):');
for (const r of results.filter(r => r.click?.meta?.popUpClick?.effect === 'unconfirmed' && r.opened !== 'none')) console.log(`  ${r.label}: ${r.opened} popUpClick.ms ${r.click.meta.popUpClick.ms}`);
console.log('\nfalse confirmations (popUpClick confirmed, nothing open at 300 ms or 1.8 s):');
  for (const r of results.filter(r => r.click?.meta?.popUpClick?.effect === 'confirmed' && r.opened === 'none')) console.log(`  ${r.label}`);
  console.log('\nlayouts as built:', tally(results.map(r => `${r.layout}${r.mode === 'shared-front' ? ' (front)' : ''}: ${r.layoutBuilt?.ok ? 'ok' : 'NOT'} ${r.layoutBuilt?.actual?.join('>')}`)));
  console.log('\nrepresentative replies (first row per cell, verbatim meta):');
  const seen = new Set();
  for (const r of results.filter(r => r.click)) {
    const k = `${r.kind}|${r.control}|${r.mode}|${r.layout}`;
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(`  ${r.label}: error=${r.click.error} message=${JSON.stringify(r.click.message)} note=${JSON.stringify(r.click.note)} meta=${JSON.stringify(r.click.meta)}`);
  }
  console.log('\nsentences:');
  const sentences = results.flatMap(r => [r.click, r.itemClick].filter(c => c?.message || c?.note).map(c => [`${c.error ?? 'ok'}: ${c.message ?? ''} ${c.note ?? ''}`, `${r.control}/${r.mode}/${r.layout}`])).reduce((m, [s, w]) => ((m[s] ??= []).push(w), m), {});
  for (const [s, where] of Object.entries(sentences)) console.log(`  ${where.length}x [${tally(where)}] ${s}`);
  console.log('\nproblems, exceptions:');
  for (const r of results.filter(r => r.problem || r.exception)) console.log(`  ${r.label}: ${r.problem ?? r.exception.split('\n')[0].slice(0, 200)}`);
  console.log('\n');
}
