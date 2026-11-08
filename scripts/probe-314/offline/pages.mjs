// #314's A/B offline summary per browser and page, over every position and repetition of the run directories given:
// node counts per head, each wide element's printed run against the truth (B's missing and extra), the printed tree
// across heads (and within a head), and medians of the plain observation's total ms, the forced settle's ms and its busy
// walk's ms per head, with B less A paired by position and repetition; then the clicks by token tallied.
//   node scripts/probe-314/offline/pages.mjs <run dir>...
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const med = xs => { const s = xs.filter(x => x != null && !Number.isNaN(x)).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const f = x => x == null ? '-' : String(Math.round(x));
const sgn = x => x == null ? '-' : `${x >= 0 ? '+' : ''}${Math.round(x)}`;
const range = xs => { const s = [...new Set(xs)].sort((a, b) => a - b); return s.length ? (s.length === 1 ? `${s[0]}` : `${s[0]}–${s.at(-1)}`) : '-'; };
const rows = [];
for (const dir of process.argv.slice(2)) for (const d of readdirSync(dir).sort()) {
  const p = [join(dir, d, 'results.json'), join(dir, d, 'probe-314', 'results.json')].find(existsSync);
  if (!p) continue;
  const {config, results} = JSON.parse(readFileSync(p, 'utf8'));
  for (const r of results) if (r.slots) rows.push({...r, rep: config.rep, browser: config.browser, run: dir});
}
const by = {};
for (const r of rows) ((by[r.browser] ??= {})[r.target] ??= []).push(r);
for (const [browser, pages] of Object.entries(by)) {
  console.log(`\n## ${browser}\n`);
  console.log('| page | cells | nodes A | nodes B | B wide prints (truth) | B miss/extra | text A≠B (within) | total A | B | B−A | settle A | B | B−A | busy walk A | B | B−A |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [page, rs] of Object.entries(pages)) {
    const slots = rs.flatMap(r => r.slots.filter(s => s.obs));
    const n = h => range(slots.filter(s => s.head === h && !s.settle).map(s => s.obs.nodes));
    const wides = slots.filter(s => s.head === 'b' && !s.settle).flatMap(s => s.obs.wides.filter(w => w.shown?.subset === 'shown' && w.role !== 'AXColumn'));
    const wideText = [...new Set(wides.map(w => w.role.replace('AX', '') + '/' + w.children))].map(k => {
      const ws = wides.filter(w => `${w.role.replace('AX', '')}/${w.children}` === k);
      return `${k}: ${range(ws.map(w => w.printedChildren))} (${range(ws.filter(w => w.truth).map(w => w.truth.shownCount))})`;
    }).join('; ') || '-';
    const me = wides.filter(w => w.truth && w.truth.missing != null);
    const missExtra = me.length ? `${range(me.map(w => w.truth.missing))}/${range(me.map(w => w.truth.extra))}` : '-';
    const cmp = rs.flatMap(r => r.compare ?? []).filter(c => !c.settle[0] && !c.settle[1]);
    const across = cmp.filter(c => !c.same), within = cmp.filter(c => c.same);
    const t = (h, key, settle) => med(slots.filter(s => s.head === h && s.settle === settle).map(s => s.obs.timings[key]));
    const paired = (key, settle) => med(rs.map(r => {
      const m = h => { const xs = r.slots.filter(s => s.obs && s.head === h && s.settle === settle).map(s => s.obs.timings[key]); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
      const a = m('a'), b = m('b'); return a != null && b != null ? b - a : null;
    }));
    console.log(`| ${page} | ${rs.length} | ${n('a')} | ${n('b')} | ${wideText} | ${missExtra} | ${across.filter(c => c.printed).length}/${across.length} (${within.filter(c => c.printed).length}/${within.length}) | ` +
      `${f(t('a', 'totalMs', false))} | ${f(t('b', 'totalMs', false))} | ${sgn(paired('totalMs', false))} | ${f(t('a', 'settleMs', true))} | ${f(t('b', 'settleMs', true))} | ${sgn(paired('settleMs', true))} | ` +
      `${f(t('a', 'settleBusyWalkMs', true))} | ${f(t('b', 'settleBusyWalkMs', true))} | ${sgn(paired('settleBusyWalkMs', true))} |`);
  }
  const clicks = rows.filter(r => r.browser === browser && r.clicks).flatMap(r => r.clicks.flatMap(c => (c.clicks ?? []).map(k => ({...k, target: r.target, head: c.head, desktop: c.desktop}))));
  if (clicks.length) {
    const tally = {};
    for (const k of clicks) {
      const key = `${k.target} ${k.head} ${k.desktop} ${k.kind}`;
      const t = (tally[key] ??= {n: 0, ok: 0, delivered: 0, errors: new Set()});
      t.n += 1; if (!k.answer.error) t.ok += 1; else t.errors.add(String(k.answer.error.code ?? k.answer.error.name));
      if (k.page.length && k.page.some(p => p.text?.trim() === k.label.trim())) t.delivered += 1;
    }
    console.log(`\nclicks by token (answered ok / page got the click / tries, errors): ${Object.entries(tally).map(([k, t]) => `${k} ${t.ok}/${t.delivered}/${t.n}${t.errors.size ? ` [${[...t.errors]}]` : ''}`).join('; ')}`);
    const none = rows.filter(r => r.browser === browser && r.clicks).flatMap(r => r.clicks.filter(c => c.none).map(c => `${r.target} ${c.head}`));
    if (none.length) console.log(`no row or bar printed to click: ${[...new Set(none)].join(', ')}`);
  }
}
