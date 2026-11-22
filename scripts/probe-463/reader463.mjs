// #463 qual's reader: one block per run (results.json), one line per cell (control, mode). "UI": a window the watch saw
// appear (at least 30x20 pt); "closed" gone again before 1.8 s, "up" there at 1.8 s. Frontmost: `lsappinfo front` read
// back to back for 4 s, any read other than before the click (transient) and the last (end), with the delivery guard's
// frontmostRestored beside it. Focused window: Finder's AXFocusedWindow or AXMainWindow off F1 at any sample (transient)
// and at the watch's end. F1 covered: a layer-0 window in front of F1 overlapping it at 1.8 s. Then the false answers:
// ok while the UI it opened closed before 1.8 s or nothing opened (transient-UI cells), and confirmed with nothing up.
//   node scripts/probe-463/reader463.mjs <results.json>...
import {readFileSync} from 'node:fs';
const tally = xs => Object.entries(xs.reduce((m, x) => (m[x] = (m[x] ?? 0) + 1, m), {})).map(([k, n]) => `${k} ${n}`).join('; ') || '-';
const ui = r => (r.spans ?? []).filter(s => s.bounds[2] >= 30 && s.bounds[3] >= 20);
const short = s => (s ?? '').replace(/^com\.\w+\./, '');
const pcText = pc => !pc ? '' : ` [${pc.refused ? `refused ${pc.refused}` : pc.kept ? `kept ${pc.kept}` : `${pc.kind ?? ''} ${pc.action ?? ''} ${pc.effect ?? ''}`.trim()}${pc.activated ? ' activated' : ''}]`;
for (const file of process.argv.slice(2)) {
  const {config, results} = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`## ${config.engineLabel ?? ''} engine ${config.engineRef} (${config.chrome}; ${config.macOS}; image ${config.image}; kit ${config.commit}; ${results.length} rows, ${config.minutes} min${config.budgetStop ? ', budget stop' : ''})\n`);
  console.log('| control | mode | rows | answer [popUpClick] | posted | UI open / closed / up (kinds) | frontmost: transient / end (guard restored) | focused window: transient / end | F1 covered | effect |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  const keys = [...new Set(results.map(r => `${r.control}|${r.mode}`))];
  for (const k of keys) {
    const rs = results.filter(r => `${r.control}|${r.mode}` === k);
    const ok = rs.filter(r => r.after);
    const [control, mode] = k.split('|');
    if (!ok.length) { console.log(`| ${control} | ${mode} | 0 (${tally(rs.map(r => r.problem ?? r.exception?.split('\n')[0]?.slice(0, 80) ?? '?'))}) ||||||||`); continue; }
    const ans = tally(ok.map(r => `${r.click.error ?? 'ok'}/${r.click.route ?? '-'}${pcText(r.click.meta?.popUpClick)}${r.click.meta?.elementClick ? ` ${r.click.meta.elementClick.plan}:${r.click.meta.elementClick.action ?? ''}:${r.click.meta.elementClick.reason ?? ''}` : ''}`));
    const posted = ok.filter(r => r.click.posted).length;
    const opened = ok.filter(r => ui(r).length);
    const closed = ok.filter(r => ui(r).length && ui(r).every(s => s.to != null && s.to <= 1800));
    const up = ok.filter(r => ui(r).some(s => s.from <= 1800 && (s.to == null || s.to > 1800)));
    const kinds = tally(opened.flatMap(r => [...new Set(ui(r).map(s => `L${s.layer} ${Math.round(s.bounds[2] / 10) * 10}x${Math.round(s.bounds[3] / 10) * 10}`))]));
    const fronted = ok.filter(r => r.front);
    const fT = fronted.filter(r => r.front.off.some(o => o[1])), fE = fronted.filter(r => !r.front.endSame);
    const restored = ok.filter(r => r.click.meta?.delivery?.frontmostRestored).length;
    const keyed = ok.filter(r => r.key);
    const kT = keyed.filter(r => r.key.focusedOff.length || r.key.mainOff.length).length, kE = keyed.filter(r => !r.key.endF1).length;
    const covered = ok.filter(r => r.f1Covering?.length);
    const effect = tally(ok.filter(r => r.effect).map(r => r.effect.taken != null ? (r.effect.taken ? 'taken' : 'NOT taken') : r.pick ? (r.effect.value === r.pick.title ? 'taken' : `NOT taken (${r.effect.value})`) : JSON.stringify(r.effect)));
    const bad = rs.length - ok.length ? ` (+${rs.length - ok.length} ${tally(rs.filter(r => !r.after).map(r => r.problem ?? 'exception'))})` : '';
    console.log(`| ${control} | ${mode} | ${ok.length}${bad} | ${ans} | ${posted}/${ok.length} | ${opened.length} / ${closed.length} / ${up.length}${kinds !== '-' ? ` (${kinds})` : ''} | ${fT.length} / ${fE.length} of ${fronted.length}${fT.length ? ` (${tally(fT.map(r => [...new Set(r.front.off.map(o => short(o[1])))].join(',')))})` : ''} (${restored}) | ${kT} / ${kE} of ${keyed.length} | ${covered.length}/${ok.length}${covered.length ? ` (${tally(covered.map(r => r.f1Covering.join(',')))})` : ''} | ${effect} |`);
  }
  const transient = results.filter(r => r.after && !r.control.startsWith('p-') && r.control !== 'pg-datalist-text');
  console.log('\nok while the UI closed before 1.8 s, or nothing opened (transient-UI cells; rows):');
  for (const r of transient.filter(r => !r.click.error && (!ui(r).length || ui(r).every(s => s.to != null && s.to <= 1800)))) console.log(`  ${r.label}: ${ui(r).length ? 'opened and closed' : 'nothing opened'}${r.click.meta?.popUpClick ? ` ${JSON.stringify(r.click.meta.popUpClick)}` : ''}`);
  console.log('\nconfirmed with nothing up at 1.8 s:');
  for (const r of results.filter(r => r.after && r.click.meta?.popUpClick?.effect === 'confirmed' && !ui(r).some(s => s.from <= 1800 && (s.to == null || s.to > 1800)))) console.log(`  ${r.label}: ${JSON.stringify(ui(r).map(s => [s.layer, s.from, s.to]))}`);
  console.log('\nunconfirmed with the UI up at 1.8 s:');
  for (const r of results.filter(r => r.after && r.click.meta?.popUpClick?.effect === 'unconfirmed' && ui(r).some(s => s.from <= 1800 && (s.to == null || s.to > 1800)))) console.log(`  ${r.label}`);
  console.log('\nrefused rows that posted or moved the page:');
  for (const r of results.filter(r => r.after && r.click.error === 'backgroundClickRefused' && (r.click.posted || r.page?.length || ui(r).length))) console.log(`  ${r.label}: posted ${r.click.posted} page ${JSON.stringify(r.page)} ui ${ui(r).length}`);
  console.log('\nfrontmost changed (lsappinfo; rows, ms after the click):');
  for (const r of results.filter(r => r.front?.off?.length)) console.log(`  ${r.label}: ${JSON.stringify(r.front.off.slice(0, 3))} end same ${r.front.endSame}`);
  console.log('\nfocused window off F1 (rows):');
  for (const r of results.filter(r => r.key && (r.key.focusedOff.length || r.key.mainOff.length || !r.key.endF1))) console.log(`  ${r.label}: ${JSON.stringify(r.key.focusedOff.slice(0, 2))} ${JSON.stringify(r.key.mainOff.slice(0, 2))} end F1 ${r.key.endF1}`);
  console.log('\nsentences:');
  const sentences = results.filter(r => r.click?.message || r.click?.note).reduce((m, r) => ((m[`${r.click.error ?? 'ok'}: ${r.click.message ?? ''} ${r.click.note ?? ''}`] ??= []).push(`${r.control}/${r.mode}`), m), {});
  for (const [s, where] of Object.entries(sentences)) console.log(`  ${where.length}x [${tally(where)}] ${s}`);
  console.log('\nrepresentative replies (first row per cell, verbatim meta):');
  const seen = new Set();
  for (const r of results.filter(r => r.click)) {
    const k = `${r.control}|${r.mode}`;
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(`  ${r.label}: error=${r.click.error} meta=${JSON.stringify(r.click.meta)}`);
  }
  console.log('\nlayouts:', tally(results.filter(r => r.layoutBuilt).map(r => r.layoutBuilt.ok ? 'ok' : 'NOT')), ' resets:', tally(results.flatMap(r => (r.reset ?? []).map(x => typeof x === 'string' ? x : x.left ? 'left: relaunch' : 'closed'))));
  console.log('\nproblems, exceptions:');
  for (const r of results.filter(r => r.problem || r.exception)) console.log(`  ${r.label}: ${r.problem ?? r.exception.split('\n')[0].slice(0, 200)}${r.inventory ? ` ${JSON.stringify(r.inventory).slice(0, 800)}` : ''}`);
  console.log('\n');
}
