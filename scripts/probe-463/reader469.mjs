// #469 qual's reader: one block per run (results.json), one line per cell (control, mode, layout). "UI" is a window the
// watch saw appear (at least 30x20 pt); "up" that it was there at 1.8 s. Frontmost: the frontmost app at 1.8 s against
// before the click, and the 5 ms watch's system focused application other than Finder at any sample. Focused window:
// Finder's AXFocusedWindow or AXMainWindow off F1 at any sample (transient) and at the watch's end. F1 covered: a
// layer-0 window in front of F1 overlapping it at 1.8 s.
//   node scripts/probe-463/reader469.mjs <results.json>...
import {readFileSync} from 'node:fs';
const tally = xs => Object.entries(xs.reduce((m, x) => (m[x] = (m[x] ?? 0) + 1, m), {})).map(([k, n]) => `${k} ${n}`).join('; ') || '-';
const ui = r => (r.spans ?? []).filter(s => s.bounds[2] >= 30 && s.bounds[3] >= 20);
const short = s => (s ?? '').replace(/^com\.\w+\./, '');
for (const file of process.argv.slice(2)) {
  const {config, results} = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`## ${config.engineLabel ?? ''} engine ${config.engineRef} (${config.chrome}; ${config.electron ?? 'no Electron'}; ${config.macOS}; image ${config.image}; kit ${config.commit}; ${results.length} rows, ${config.minutes} min${config.budgetStop ? ', budget stop' : ''})\n`);
  console.log('| control | mode | layout | rows | answer [popUpClick] | UI opened / up at 1.8 s (kinds) | frontmost changed at 1.8 s | frontmost off Finder at any sample | focused window off F1: transient / end | F1 covered at 1.8 s (by) | layout built |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  const keys = [...new Set(results.map(r => `${r.control}|${r.mode}|${r.layout}`))];
  for (const k of keys) {
    const rs = results.filter(r => `${r.control}|${r.mode}|${r.layout}` === k);
    const ok = rs.filter(r => r.after);
    const [control, mode, layout] = k.split('|');
    if (!ok.length) { console.log(`| ${control} | ${mode} | ${layout} | 0 (${tally(rs.map(r => r.problem ?? r.exception?.split('\n')[0]?.slice(0, 80) ?? '?'))}) |||||||`); continue; }
    const pc = r => r.click?.meta?.popUpClick;
    const ans = tally(ok.map(r => `${r.click.error ?? 'ok'}/${r.click.route ?? '-'}${pc(r) ? ` [${pc(r).kept ? `kept ${pc(r).kept}` : pc(r).refused ? 'refused' : `${pc(r).action ?? ''} ${pc(r).effect ?? ''}`}]` : ''}${r.click.meta?.elementClick ? ` ${r.click.meta.elementClick.plan}:${r.click.meta.elementClick.action ?? ''}:${r.click.meta.elementClick.reason ?? ''}` : ''}`));
    const opened = ok.filter(r => ui(r).length);
    const up = ok.filter(r => ui(r).some(s => s.from <= 1800 && (s.to == null || s.to > 1800)));
    const kinds = tally(opened.flatMap(r => [...new Set(ui(r).map(s => `L${s.layer} ${Math.round(s.bounds[2] / 10) * 10}x${Math.round(s.bounds[3] / 10) * 10}`))]));
    const frontChanged = ok.filter(r => r.after.front !== r.before.front);
    const keyed = ok.filter(r => r.key);
    const frontAny = keyed.filter(r => r.key.frontOff.length);
    const keyT = keyed.filter(r => r.key.focusedOff.length || r.key.mainOff.length).length, keyE = keyed.filter(r => !r.key.endF1).length;
    const covered = ok.filter(r => r.after.covering?.length);
    const built = `${ok.filter(r => r.layoutBuilt?.ok).length}/${ok.length}`;
    const bad = rs.length - ok.length ? ` (+${rs.length - ok.length} ${tally(rs.filter(r => !r.after).map(r => r.problem ?? 'exception'))})` : '';
    console.log(`| ${control} | ${mode} | ${layout} | ${ok.length}${bad} | ${ans} | ${opened.length} / ${up.length}${kinds !== '-' ? ` (${kinds})` : ''} | ${frontChanged.length}/${ok.length}${frontChanged.length ? ` (${tally(frontChanged.map(r => short(r.after.front)))})` : ''} | ${frontAny.length}/${keyed.length} | ${keyT} / ${keyE} of ${keyed.length} | ${covered.length}/${ok.length}${covered.length ? ` (${tally(covered.map(r => r.after.covering.join(',')))})` : ''} | ${built} |`);
  }
  console.log('\nfrontmost off Finder at a sample (rows, first samples):');
  for (const r of results.filter(r => r.key?.frontOff?.length)) console.log(`  ${r.label}: ${JSON.stringify(r.key.frontOff.slice(0, 3))} end Finder ${r.key.endFront}`);
  console.log('\nfront read failures (samples with no focused application):', tally(results.filter(r => r.key?.frontUnread).map(r => r.label.replace(/-\d+$/, ''))));
  console.log('\nrepresentative replies (first row per cell, verbatim meta):');
  const seen = new Set();
  for (const r of results.filter(r => r.click)) {
    const k = `${r.control}|${r.mode}|${r.layout}`;
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(`  ${r.label}: error=${r.click.error} message=${JSON.stringify(r.click.message)} meta=${JSON.stringify(r.click.meta)}`);
  }
  console.log('\nElectron menu popups (ms after the click):', JSON.stringify(results.filter(r => r.menuPopups).map(r => [r.label, r.menuPopups])));
  console.log('\nresets:', tally(results.flatMap(r => (r.reset ?? []).map(x => typeof x === 'string' ? x : x.left ? 'left: relaunch' : 'closed'))));
  console.log('\nproblems, exceptions:');
  for (const r of results.filter(r => r.problem || r.exception)) console.log(`  ${r.label}: ${r.problem ?? r.exception.split('\n')[0].slice(0, 200)}${r.inventory ? ` ${JSON.stringify(r.inventory).slice(0, 1200)}` : ''}`);
  console.log('\n');
}
