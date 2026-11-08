// #314's A/B offline reader: every artifact directory of a run (each holding scripts/probe-314/ab.mjs's results.json),
// per browser, page and position over the repetitions: node counts, the wide elements' `shown` and printed children
// against the side tool's truth, the printed tree across heads against within a head, the plain observation's and the
// forced settle's times (medians, and B less A paired by position and repetition), and the clicks by token.
//   node scripts/probe-314/offline/report.mjs <run dir> [--detail]
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const dir = process.argv[2];
const DETAIL = process.argv.includes('--detail');
const med = xs => { const s = xs.filter(x => x != null).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const f = x => x == null ? '-' : Math.round(x);
const f1 = x => x == null ? '-' : (Math.round(x * 10) / 10).toFixed(1);
const uniq = xs => [...new Set(xs.map(x => JSON.stringify(x)))].map(x => JSON.parse(x));

const rows = [];
for (const d of readdirSync(dir).sort()) {
  const p = [join(dir, d, 'results.json'), join(dir, d, 'probe-314', 'results.json')].find(existsSync);
  if (!p) continue;
  const {config, results} = JSON.parse(readFileSync(p, 'utf8'));
  if (config.exception) console.log(`${d}: EXCEPTION ${config.exception.slice(0, 300)}`);
  for (const r of results) rows.push({...r, rep: config.rep, browser: config.browser, config});
}
const configs = uniq(rows.map(r => [r.config.group, r.config.rep, r.config.browserVersion, r.config.aCommit?.slice(0, 8), r.config.bCommit?.slice(0, 8), r.config.probeCommit?.slice(0, 8)]));
console.log('configs', JSON.stringify(configs));

const byBrowser = {};
for (const r of rows) (byBrowser[r.browser] ??= []).push(r);
for (const [browser, list] of Object.entries(byBrowser)) {
  console.log(`\n## ${browser}\n`);
  console.log('| page | pos | n | nodes A | nodes B | wide (truth shows) | A prints | B prints | B miss/extra | B rows | total ms A | B | B−A | settle ms A | B | B−A | busy walk ms A | B | text A≠B (within) |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const keys = uniq(list.map(r => [r.target, r.pos]));
  const pageTotals = {};
  for (const [target, pos] of keys) {
    const rs = list.filter(r => r.target === target && r.pos === pos);
    const skipped = rs.filter(r => r.skipped || r.exception);
    const ok = rs.filter(r => r.slots);
    if (!ok.length) { console.log(`| ${target} | ${pos} | 0 | ${skipped.map(r => r.skipped ?? 'exception').join(',')} |`); continue; }
    const slots = ok.flatMap(r => r.slots.map((s, k) => ({...s, rep: r.rep, k})));
    const plain = h => slots.filter(s => s.head === h && !s.settle && s.obs);
    const settled = h => slots.filter(s => s.head === h && s.settle && s.obs);
    const nodes = h => uniq(plain(h).map(s => s.obs.nodes)).sort((a, b) => a - b);
    const wideOf = h => uniq(plain(h).flatMap(s => s.obs.wides.map(w => `${w.role.replace('AX', '')}/${w.children}:${w.shown ? (w.shown.subset === 'omitted' ? 'omit' : `${w.shown.subset} ${w.shown.count}`) : 'all'}→${w.printedChildren}${w.ordered ? '' : '!ord'}`)));
    const truth = uniq(ok.flatMap(r => (r.truth?.wide ?? []).map(t => `${t.role.replace('AX', '')}/${t.children}:${t.shownCount}${typeof t.visibleChildren === 'number' ? ` vis${t.visibleChildren}` : ''}`)));
    const missExtra = uniq(plain('b').flatMap(s => s.obs.wides.filter(w => w.truth).map(w => `${w.truth.missing}/${w.truth.extra}`)));
    const bRows = uniq(plain('b').flatMap(s => s.obs.wides.filter(w => w.firstRows.length).map(w => `${w.firstRows[0]}..${w.lastRows.at(-1)}`)));
    // B less A, paired within a repetition and position: the mean of each head's slots.
    const paired = (sel, key) => {
      const ds = [];
      for (const r of ok) {
        const m = h => { const xs = r.slots.filter(s => s.head === h && sel(s) && s.obs).map(s => s.obs.timings[key]); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
        const a = m('a'), b = m('b');
        if (a != null && b != null) ds.push(b - a);
      }
      return med(ds);
    };
    const t = (h, key, sel) => med(slots.filter(s => s.head === h && sel(s) && s.obs).map(s => s.obs.timings[key]));
    const isPlain = s => !s.settle, isSettle = s => s.settle;
    const cmp = ok.flatMap(r => r.compare ?? []);
    const across = cmp.filter(c => !c.same && !c.settle[0] && !c.settle[1]);
    const within = cmp.filter(c => c.same && !c.settle[0] && !c.settle[1]);
    const text = `${across.filter(c => c.printed).length}/${across.length} (${within.filter(c => c.printed).length}/${within.length})`;
    (pageTotals[target] ??= []).push(paired(isPlain, 'totalMs'));
    console.log(`| ${target} | ${pos} | ${ok.length} | ${nodes('a').join(',')} | ${nodes('b').join(',')} | ${truth.join('; ') || '-'} | ${wideOf('a').join('; ') || '-'} | ${wideOf('b').join('; ') || '-'} | ${missExtra.join(',') || '-'} | ${bRows.join(', ') || '-'} | ` +
      `${f(t('a', 'totalMs', isPlain))} | ${f(t('b', 'totalMs', isPlain))} | ${f1(paired(isPlain, 'totalMs'))} | ${f(t('a', 'settleMs', isSettle))} | ${f(t('b', 'settleMs', isSettle))} | ${f1(paired(isSettle, 'settleMs'))} | ` +
      `${f1(t('a', 'settleBusyWalkMs', isSettle))} | ${f1(t('b', 'settleBusyWalkMs', isSettle))} | ${text} |`);
    if (DETAIL) for (const c of across.filter(c => c.printed).slice(0, 2)) console.log(`    diff ${JSON.stringify({slots: c.slots, heads: c.heads, lines: c.printed.lines, differing: c.printed.differing, a: c.printed.a?.line, b: c.printed.b?.line})}`);
  }
  console.log(`\npage medians of B−A total ms (paired by position and rep): ${Object.entries(pageTotals).map(([k, v]) => `${k} ${f1(med(v))}`).join(', ')}`);
  const clickRows = list.filter(r => r.clicks);
  if (clickRows.length) {
    console.log(`\n### ${browser} clicks by token\n`);
    console.log('| page | pos | rep | head | wide shown | target | answer | page got |');
    console.log('|---|---|---|---|---|---|---|---|');
    for (const r of clickRows) for (const c of r.clicks) {
      const shown = c.wide ? (c.wide.shown ? `${c.wide.shown.subset} ${c.wide.shown.count}/${c.wide.children}` : 'all') : '-';
      if (!c.clicks?.length) { console.log(`| ${r.target} | ${r.pos} | ${r.rep} | ${c.head} | ${shown} | ${c.none ?? c.error?.name ?? c.exception?.slice(0, 80)} | | |`); continue; }
      for (const k of c.clicks) {
        const ans = k.answer.error ? `${k.answer.error.name}: ${k.answer.error.message.slice(0, 60)}` : `ok ${k.answer.result?.meta?.inputRoute ?? ''}`;
        console.log(`| ${r.target} | ${r.pos} | ${r.rep} | ${c.head}${c.desktop ? ` ${c.desktop}` : ''} | ${shown} | ${k.kind} ${k.row} (${k.role.replace('AX', '')} "${k.label}") | ${ans} ${k.ms} ms | ${k.page.map(p => `${p.text?.trim()}${p.trusted ? '' : ' (untrusted)'}`).join(', ') || 'nothing'} |`);
      }
    }
  }
}
