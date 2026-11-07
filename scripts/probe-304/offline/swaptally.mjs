// swaptally.mjs <run-dir>...: the re-read-window swap's answers per run and head, and per answer the medians of the
// click's own ms, the stalePoint check's ms, the observation's time since launch and when the page's swap landed.
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
const med = xs => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? Math.round(s[s.length >> 1]) : '-'; };
const all = [];
for (const dir of process.argv.slice(2)) {
  const run = dir.split('-').pop();
  for (const d of readdirSync(dir).sort()) {
    const f = join(dir, d, 'results.json');
    if (!existsSync(f)) continue;
    for (const c of JSON.parse(readFileSync(f, 'utf8')).cells ?? []) {
      if (!/^chrome\/shared-reread\/swap\/0\.1s/.test(c.label)) continue;
      const head = c.label.endsWith('/branch') ? 'B' : 'A';
      const ans = c.stalePoint?.reason === 'nodeGone' ? 'nodeGone' : c.errorName === 'backgroundClickRefused' ? 'sameElement+background' : `${c.stalePoint?.reason ?? 'none'}+${c.errorName ?? ''}`;
      all.push({run, head, ans, click: c.clickMs, sp: c.stalePoint?.ms, launch: c.observation?.sinceLaunchMs, swap: c.changedAfterClickMs?.[0], el: c.elementClick ? 'route ran' : 'no route'});
    }
  }
}
const by = {};
for (const o of all) { const k = `${o.run} ${o.head}`; (by[k] ??= {}); by[k][o.ans] = (by[k][o.ans] ?? 0) + 1; }
for (const [k, v] of Object.entries(by)) console.log(`${k}: ${JSON.stringify(v)}`);
for (const ans of [...new Set(all.map(o => o.ans))]) {
  const xs = all.filter(o => o.ans === ans);
  console.log(`${ans}: n ${xs.length}; click ms ${med(xs.map(o => o.click))}, stalePoint ms ${med(xs.map(o => o.sp))}, observation at launch+${med(xs.map(o => o.launch))} ms, swap at click+${med(xs.map(o => o.swap))} ms; ${[...new Set(xs.map(o => o.el))].join('/')}`);
}
