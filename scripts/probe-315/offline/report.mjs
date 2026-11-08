// #315's offline reader: per browser, mode and cell, each head's answers over the repetitions, A against B.
//   node scripts/probe-315/offline/report.mjs <run dir>...   (each holding probe-315-ab-*/<browser>/results-<browser>.json)
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';

const files = [];
const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/^results-\w+\.json$/.test(f)) files.push(p); } };
for (const d of process.argv.slice(2)) walk(d);
const rows = [];
const configs = [];
for (const f of files) { const r = JSON.parse(readFileSync(f, 'utf8')); configs.push(r.config); rows.push(...r.results); }
const metaOf = a => a?.error ? a.error.meta : a?.result?.meta;
const answerOf = a => (!a ? '-' : a.error ? (a.error.errorName ?? a.error.code) : 'success');
const tally = xs => { const m = new Map(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return [...m].map(([k, v]) => (v > 1 ? `${k}×${v}` : k)).join(', '); };
const raised = w => w ? (w.raisedAfterHold || w.raisedInsideHold || !w.frontHeld || w.stuck) : null;

function summarise(group) {
  const out = {n: group.length};
  out.answer = tally(group.map(r => r.problem || r.exception ? 'PROBLEM' : answerOf(r.answer)));
  out.ec = tally(group.map(r => { const e = metaOf(r.answer)?.elementClick; return e ? [e.reason, e.plan === 'action' ? e.action : e.plan, e.pressed, e.pressedRole, e.focus && `focus:${e.focus}`, e.focusStep && `step:${e.focusStep}`, e.walkStopped && `stop:${e.walkStopped}`].filter(Boolean).join('/') : '-'; }));
  out.seen = `${group.filter(r => r.effect?.seen).length}/${group.length}`;
  out.posted = tally(group.map(r => r.effect?.posted ?? '-'));
  out.raise = `${group.filter(r => raised(r.watch)).length}/${group.length}`;
  out.above = `${group.filter(r => r.orderAfter?.browserAbove).length}/${group.length}`;
  out.frontAfter = tally(group.map(r => r.frontAfter ?? '-'));
  if (group.some(r => r.typed)) out.typed = `${group.filter(r => r.typed?.landed).length}/${group.length} (${tally(group.map(r => answerOf(r.typeAnswer)))})`;
  if (group.some(r => r.effect && 'checkedAfter' in r.effect)) out.checked = tally(group.map(r => `${r.effect.checkedBefore}->${r.effect.checkedAfter}`));
  if (group.some(r => r.setValueAnswer)) out.setValue = `${tally(group.map(r => answerOf(r.setValueAnswer)))} seen ${group.filter(r => r.setValueEffect?.seen).length}/${group.length}`;
  const msgs = [...new Set(group.map(r => r.answer?.error?.message).filter(Boolean))];
  if (msgs.length) out.messages = msgs;
  return out;
}
const fmt = s => `${s.answer} | ${s.ec} | seen ${s.seen} | posted ${s.posted} | raise ${s.raise}${s.typed ? ` | typed ${s.typed}` : ''}${s.checked ? ` | checked ${s.checked}` : ''}${s.setValue ? ` | setValue ${s.setValue}` : ''}`;

const browsers = [...new Set(rows.map(r => r.browser).filter(Boolean))];
for (const b of browsers) {
  console.log(`\n## ${b}`);
  const cells = rows.filter(r => r.browser === b && r.block === 'page' && r.cell !== 'warm');
  for (const mode of ['shared', 'dedicated']) {
    const names = [...new Set(cells.filter(r => r.mode === mode).map(r => r.cell))];
    if (!names.length) continue;
    console.log(`\n### ${b} ${mode}`);
    for (const name of names) {
      for (const head of ['a', 'b']) {
        const g = cells.filter(r => r.mode === mode && r.cell === name && r.head === head);
        if (g.length) console.log(`${name.padEnd(22)} ${head.toUpperCase()} ${fmt(summarise(g))}`);
      }
    }
  }
  const ft = rows.filter(r => r.browser === b && r.block === 'fixedtail' && r.clicks);
  if (ft.length) {
    console.log(`\n### ${b} /fixedtail by token`);
    for (const mode of ['shared', 'dedicated']) for (const pos of ['top', 'f25', 'f50', 'f90']) for (const kind of ['row', 'bar']) for (const head of ['a', 'b']) {
      const ks = ft.filter(r => r.mode === mode && r.pos === pos && r.head === head).flatMap(r => r.clicks.filter(k => k.kind === kind));
      if (!ks.length) continue;
      const ec = tally(ks.map(k => { const e = metaOf(k.answer)?.elementClick; return e ? [e.reason, e.plan === 'action' ? e.action : e.plan, e.hit && `hit:${e.hit}`, e.pressed].filter(Boolean).join('/') : '-'; }));
      console.log(`${mode} ${pos} ${kind} ${head.toUpperCase()}: ${tally(ks.map(k => answerOf(k.answer)))} | ${ec} | seen ${ks.filter(k => k.seen).length}/${ks.length} | raise ${ks.filter(k => raised(k.watch)).length}/${ks.length}`);
    }
  }
  const ch = rows.filter(r => r.browser === b && r.block === 'chrome' && r.cell === 'chrome');
  for (const r of ch) {
    console.log(`\n### ${b} sidebar/devtools ${r.head.toUpperCase()} rep ${r.rep}: panes ${JSON.stringify(r.panes)} page ${JSON.stringify(r.pageArea)}`);
    console.log(`  webAreas ${JSON.stringify(r.webAreas)}`);
    console.log(`  grid ${JSON.stringify(r.gridSummary)}`);
    for (const k of r.clicks) console.log(`  ${k.pane} ${k.what}: ${k.none ?? `${answerOf(k.answer)} ec=${JSON.stringify(metaOf(k.answer)?.elementClick ?? null)} node=${JSON.stringify(k.node ? [k.node.role, k.node.title ?? k.node.description] : null)} hit=${JSON.stringify(k.hit?.chain)} raise=${raised(k.watch)}`}`);
    if (r.problem || r.exception) console.log(`  PROBLEM ${JSON.stringify(r.problem ?? r.exception).slice(0, 500)}`);
  }
  const problems = rows.filter(r => r.browser === b && (r.problem || r.exception));
  if (problems.length) console.log(`\nproblems: ${problems.map(r => `${r.label}: ${JSON.stringify(r.problem ?? r.exception).slice(0, 200)}`).join('\n  ')}`);
}
console.log(`\nconfigs: ${JSON.stringify(configs.map(c => [c.browser, c.rep, c.browserVersion, c.aCommit?.slice(0, 8), c.bCommit?.slice(0, 8), c.probeCommit?.slice(0, 8), c.headOrder]))}`);
