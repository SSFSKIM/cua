// #463's reader: one block per run (results.json), one line per cell (control, route, mode). A row's UI is a window the
// watch saw appear after its start, at least 30x20 pt; "closed" means it was gone again before 1.8 s, "up" that it was
// there at 1.8 s (on the action's clock). "vs release" is its close time less the delivery guard's release
// (delivery.releasedAt). The person's focus: the key-window watch's focused or main window off F1, then the frontmost
// app and the moved windows at 1.8 s.
//   node scripts/probe-463/reader.mjs <results.json>...
import {readFileSync} from 'node:fs';
const tally = xs => Object.entries(xs.reduce((m, x) => (m[x] = (m[x] ?? 0) + 1, m), {})).map(([k, n]) => `${k} ${n}`).join('; ') || '-';
const pct = (xs, p) => { const s = xs.filter(x => typeof x === 'number').sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]) : '-'; };
const range = xs => { const s = xs.filter(x => typeof x === 'number'); return s.length ? `${pct(s, 0)}..${pct(s, 1)}` : '-'; };
const short = s => (s ?? '').replace(/^com\.\w+\./, '');
const ui = r => (r.spans ?? []).filter(s => s.bounds[2] >= 30 && s.bounds[3] >= 20);
const kind = s => `${s.owner} L${s.layer} a${s.alpha} ${Math.round(s.bounds[2] / 10) * 10}x${Math.round(s.bounds[3] / 10) * 10}`;
for (const file of process.argv.slice(2)) {
  const {config, results} = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`## ${config.engineLabel ?? ''} engine ${config.engineRef} (${config.chrome}; ${config.macOS}; image ${config.image}; kit ${config.commit}; ${results.length} rows, ${config.minutes} min${config.budgetStop ? ', budget stop' : ''})\n`);
  console.log('| control | route | mode | rows | answer / route | node | UI opened | closed before 1.8 s | up at 1.8 s | up at 4 s | from / to ms p50 | close vs release ms | hold ms / restores p50 | key window off F1 | front / moved at 1.8 s |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const keys = [...new Set(results.map(r => `${r.control}|${r.route}|${r.mode}`))];
  for (const k of keys) {
    const rs = results.filter(r => `${r.control}|${r.route}|${r.mode}` === k);
    const ok = rs.filter(r => r.after);
    const [control, route, mode] = k.split('|');
    if (!ok.length) { console.log(`| ${control} | ${route} | ${mode} | ${rs.length} | ${tally(rs.map(r => r.problem ?? r.exception?.split('\n')[0]?.slice(0, 80) ?? '?'))} |||||||||||`); continue; }
    const pc = r => r.click?.meta?.popUpClick;
    const ans = tally(ok.map(r => r.kit ? `kit ${r.kit.result ?? r.kit.error}` : `${r.click.error ?? 'ok'}/${r.click.route ?? '-'}${pc(r) ? ` [popUpClick ${pc(r).kept ? `kept ${pc(r).kept}` : pc(r).effect ?? ''}]` : ''}${r.click.meta?.elementClick ? ` ${r.click.meta.elementClick.plan ?? ''}:${r.click.meta.elementClick.action ?? ''}:${r.click.meta.elementClick.reason ?? ''}` : ''}`));
    const node = tally(ok.map(r => `${r.node.role}${r.node.actions ? ` [${r.node.actions.join(',')}]` : ''}`));
    const opened = ok.filter(r => ui(r).length);
    const closed = ok.filter(r => ui(r).length && ui(r).every(s => s.to != null && s.to <= 1800));
    const up = ok.filter(r => ui(r).some(s => s.from <= 1800 && (s.to == null || s.to > 1800)));
    const end = ok.filter(r => ui(r).some(s => s.to == null));
    const kinds = tally(opened.flatMap(r => [...new Set(ui(r).map(kind))]));
    const from = pct(opened.map(r => Math.min(...ui(r).map(s => s.from))), 0.5);
    const to = pct(closed.map(r => Math.max(...ui(r).map(s => s.to))), 0.5);
    const vs = range(closed.filter(r => r.restoreAt?.release != null).map(r => Math.max(...ui(r).map(s => s.to)) - r.restoreAt.release));
    const hold = `${pct(ok.map(r => r.restoreAt?.screenHoldMs), 0.5)} / ${pct(ok.map(r => r.restoreAt?.restores), 0.5)}`;
    const keyed = ok.filter(r => r.key);
    const off = keyed.filter(r => r.key.focusedOff.length || r.key.mainOff.length);
    const key = keyed.length ? `${off.length}/${keyed.length}${off.length ? ` (end off ${keyed.filter(r => !r.key.endF1).length}, ms p50 ${pct(off.map(r => r.key.offMs), 0.5)})` : ''}` : '-';
    const fm = tally(ok.map(r => `${short(r.after.front)}${r.moved?.length ? ` moved ${r.moved.join(',')}` : ''}`));
    const bad = rs.length - ok.length ? ` (+${rs.length - ok.length} ${tally(rs.filter(r => !r.after).map(r => r.problem ?? 'exception'))})` : '';
    console.log(`| ${control} | ${route} | ${mode} | ${ok.length}${bad} | ${ans} | ${node} | ${opened.length}/${ok.length}${kinds !== '-' ? ` (${kinds})` : ''} | ${closed.length}/${ok.length} | ${up.length}/${ok.length} | ${end.length}/${ok.length} | ${from} / ${to} | ${vs} | ${hold} | ${key} | ${fm} |`);
  }
  console.log('\nrows with UI, spans (owner, layer, alpha, bounds, from, to) and the restore (hold, release):');
  for (const r of results.filter(r => ui(r).length)) console.log(`  ${r.label}: ${JSON.stringify(ui(r).map(s => [s.owner, s.layer, s.alpha, s.bounds.map(Math.round), s.from, s.to]))} restore ${JSON.stringify(r.restoreAt ?? null)} page ${JSON.stringify(r.page ?? [])}`);
  console.log('\nsmall fresh windows (under 30x20):', tally(results.flatMap(r => (r.spans ?? []).filter(s => !(s.bounds[2] >= 30 && s.bounds[3] >= 20)).map(kind))));
  console.log('\nlayouts as built:', tally(results.filter(r => r.layoutBuilt).map(r => `${r.mode === 'shared-front' ? 'front' : 'behind'}: ${r.layoutBuilt.ok ? 'ok' : 'NOT'} ${r.layoutBuilt.actual?.join('>')}`)));
  console.log('\nresets that closed or relaunched:', tally(results.flatMap(r => (r.reset ?? []).map(x => typeof x === 'string' ? x : x.left ? 'left: relaunch' : 'closed'))));
  console.log('\nrepresentative replies (first row per cell, verbatim meta):');
  const seen = new Set();
  for (const r of results.filter(r => r.click)) {
    const k = `${r.control}|${r.route}|${r.mode}`;
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(`  ${r.label}: error=${r.click.error} message=${JSON.stringify(r.click.message)} note=${JSON.stringify(r.click.note)} meta=${JSON.stringify(r.click.meta)}`);
  }
  console.log('\ninventory:');
  for (const [app, inv] of Object.entries(config.inventory ?? {})) console.log(`  ${app}: ${JSON.stringify(inv)}`);
  console.log('\nproblems, exceptions:');
  for (const r of results.filter(r => r.problem || r.exception)) console.log(`  ${r.label}: ${r.problem ?? r.exception.split('\n')[0].slice(0, 200)}${r.inventory ? ` inventory ${JSON.stringify(r.inventory).slice(0, 1500)}` : ''}`);
  console.log('\n');
}
