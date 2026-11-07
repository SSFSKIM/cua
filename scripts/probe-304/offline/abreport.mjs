// #304's A/B tables from a run's downloaded artifacts (scripts/probe-304/ab.mjs's results.json, one directory per job):
// the guard's share per page and position per head, live walk ms per page (p50 / p95 per head, B minus A, and the
// paired per-position difference), the printed-tree and record comparisons on uncut observations, the cut flags that
// differ between the heads, and the kit's own checks (the guard port against the engine's record, read counts).
// #305's sweep and #296's stale suite: scripts/probe-305/abreport.mjs over the same directory.
//   node scripts/probe-304/offline/abreport.mjs <run-dir>
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {diffPrinted, diffRecord, diffNodes, canon} from '../treediff.mjs';

const dir = process.argv[2];
const fileName = s => s.replace(/[^a-z0-9+-]+/gi, '_');
const rows = [];
const heads = new Set();
for (const d of readdirSync(dir).sort()) {
  const f = join(dir, d, 'results.json');
  if (!existsSync(f)) continue;
  const j = JSON.parse(readFileSync(f, 'utf8'));
  if (!['chrome-a', 'chrome-b', 'chrome-c', 'safari'].includes(j.config.group)) continue;
  heads.add(`A ${(j.config.aCommit ?? '').slice(0, 8)} / B ${(j.config.bCommit ?? '').slice(0, 8)}`);
  if (j.config.exception) console.log(`${d}: EXCEPTION ${j.config.exception.split('\n')[0]}`);
  const app = j.config.group === 'safari' ? 'safari' : 'chrome';
  for (const r of j.results ?? []) {
    // The comparisons again from the saved observations (consecutive slots), canonical JSON throughout: kit 021a062d's
    // runner-side comparison read the engines' JSON in its per-process key order.
    const obs = (r.slots ?? []).map((s, k) => { const f = join(dir, d, `obs-${fileName(r.label)}-${k + 1}-${s.head}.json.gz`); return existsSync(f) ? JSON.parse(gunzipSync(readFileSync(f))) : null; });
    if (obs.some(Boolean)) {
      r.compare = [];
      for (let i = 0; i + 1 < obs.length; i++) {
        const x = obs[i], y = obs[i + 1], sx = r.slots[i], sy = r.slots[i + 1];
        if (!x || !y) continue;
        r.compare.push({slots: [i + 1, i + 2], heads: [sx.head, sy.head], same: sx.head === sy.head, uncut: !sx.obs?.cut && !sy.obs?.cut,
          printed: diffPrinted(x.printed, y.printed), record: diffRecord(x.probeRecord, y.probeRecord), nodes: diffNodes(x.nodes, y.nodes)});
      }
    }
    rows.push({...r, rep: j.config.rep, app});
  }
}
console.log(`heads: ${[...heads].join('; ')}; ${rows.length} positions\n`);
const POS = ['top', 'f25', 'f50', 'f90'];
const share = o => o?.guard ? `${o.guard.checked}/${o.guard.containerOnly}/${o.guard.unrecorded}` : (o ? '-' : 'err');
const q = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.round((s.length - 1) * p))]; };
const median = xs => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
const slotsOf =(r, head) => (r.slots ?? []).filter(s => s.head === head);
const pages = [...new Map(rows.map(r => [`${r.app}/${r.target}`, {app: r.app, target: r.target}])).values()];

// ---- 1. coverage ----------------------------------------------------------------------------------------------------
console.log('### Coverage: checked / container-only / unrecorded %, per rep (a head\'s two observations joined by "|" where they differ)\n');
console.log('| app | page | pos | A rep1 | A rep2 | B rep1 | B rep2 | cut (A, B) | B vs A |');
console.log('|---|---|---|---|---|---|---|---|---|');
const coverageDiffs = [];
for (const {app, target} of pages) for (const pos of POS) {
  const at = rows.filter(r => r.app === app && r.target === target && r.pos === pos);
  if (!at.length) continue;
  const cell = (head, rep) => {
    const r = at.find(x => Number(x.rep) === rep);
    if (!r) return '-';
    if (r.exception) return 'EXC';
    const v = [...new Set(slotsOf(r, head).map(s => share(s.obs)))];
    return v.join(' \\| ');
  };
  const cut = head => { const c = at.flatMap(r => slotsOf(r, head)).map(s => s.obs?.cut); return c.every(Boolean) ? 'cut' : c.some(Boolean) ? 'some' : 'no'; };
  // B against A within each rep (the same runner and page load): B's median checked share less A's.
  const deltas = at.map(r => {
    const m = h => median(slotsOf(r, h).map(s => s.obs?.guard?.checked).filter(v => v != null));
    const [ma, mb] = [m('a'), m('b')];
    return ma == null || mb == null ? null : Math.round(10 * (mb - ma)) / 10;
  }).filter(v => v != null);
  const verdict = !deltas.length ? '?' : deltas.every(v => v === 0) ? 'same' : deltas.some(v => v < 0) ? `B LOWER (${deltas.join(', ')})` : `B higher (+${deltas.join(', +')})`;
  if (verdict !== 'same') coverageDiffs.push(`${app}/${target}/${pos}: ${verdict}`);
  console.log(`| ${app} | ${target} | ${pos} | ${cell('a', 1)} | ${cell('a', 2)} | ${cell('b', 1)} | ${cell('b', 2)} | ${cut('a')}, ${cut('b')} | ${verdict} |`);
}
console.log(`\ncoverage differing between the heads: ${coverageDiffs.length ? `\n- ${coverageDiffs.join('\n- ')}` : 'none'}`);

// ---- 2. walk ms -----------------------------------------------------------------------------------------------------
console.log('\n### Walk ms (timed observations only; paired = per position, B\'s median less A\'s)\n');
console.log('| app | page | n A, B | A p50 / p95 | B p50 / p95 | B−A p50 / p95 | paired median / p95 abs / range | cut |');
console.log('|---|---|---|---|---|---|---|---|');
const paired = r => {
  // A head's median at the position: a slow spell is one-sided and short, so the median resists it.
  const m = h => median(slotsOf(r, h).map(s => s.obs?.walkMs).filter(Number.isFinite));
  const a = m('a'), b = m('b');
  return a != null && b != null ? b - a : null;
};
const all = {cut: {a: [], b: [], d: []}, uncut: {a: [], b: [], d: []}};
for (const {app, target} of pages) {
  const at = rows.filter(r => r.app === app && r.target === target);
  const w = h => at.flatMap(r => slotsOf(r, h)).map(s => s.obs?.walkMs).filter(Number.isFinite);
  const [wa, wb] = [w('a'), w('b')];
  const d = at.map(paired).filter(v => v != null);
  const cutRows = at.filter(r => (r.slots ?? []).some(s => s.obs?.cut));
  for (const r of at) {
    const k = (r.slots ?? []).some(s => s.obs?.cut) ? 'cut' : 'uncut';
    for (const h of ['a', 'b']) all[k][h].push(...slotsOf(r, h).map(s => s.obs?.walkMs).filter(Number.isFinite));
    const p = paired(r); if (p != null) all[k].d.push(p);
  }
  const f = v => v == null ? '-' : Math.round(v);
  console.log(`| ${app} | ${target} | ${wa.length}, ${wb.length} | ${f(q(wa, 0.5))} / ${f(q(wa, 0.95))} | ${f(q(wb, 0.5))} / ${f(q(wb, 0.95))} | ${f(q(wb, 0.5) - q(wa, 0.5))} / ${f(q(wb, 0.95) - q(wa, 0.95))} | ${f(median(d))} / ${f(q(d.map(Math.abs), 0.95))} / ${f(Math.min(...d))}..${f(Math.max(...d))} | ${cutRows.length}/${at.length} |`);
}
for (const k of ['cut', 'uncut']) {
  const {a, b, d} = all[k];
  const f = v => v == null ? '-' : Math.round(v);
  console.log(`\nall ${k} positions: A p50 ${f(q(a, 0.5))} p95 ${f(q(a, 0.95))} (n ${a.length}); B p50 ${f(q(b, 0.5))} p95 ${f(q(b, 0.95))} (n ${b.length}); B−A p50 ${f(q(b, 0.5) - q(a, 0.5))} p95 ${f(q(b, 0.95) - q(a, 0.95))}; paired median ${f(median(d))}, |paired| p95 ${f(q(d.map(Math.abs), 0.95))}`);
}

// ---- 3. tree equality on uncut observations -------------------------------------------------------------------------
console.log('\n### Uncut-tree equality (printed tree and guard record; across heads, and each head against itself as the page\'s control)\n');
const tally = {cross: {n: 0, printed: 0, record: 0, nodes: 0}, same: {n: 0, printed: 0, record: 0, nodes: 0}};
const crossDiffs = [];
for (const r of rows) for (const c of r.compare ?? []) {
  if (!c.uncut) continue;
  const t = tally[c.same ? 'same' : 'cross'];
  t.n += 1; if (c.printed) t.printed += 1; if (c.record) t.record += 1; if (c.nodes) t.nodes += 1;
  // The raw nodes count too: they carry the action descriptions (`actionDescriptions`), which the fix's
  // describeAtPreorderPlaces settles, and an uncut walk must match main's exactly.
  if (!c.same && (c.printed || c.record || c.nodes)) {
    const control = (r.compare ?? []).filter(x => x.same && x.uncut);
    const moved = control.some(x => x.printed || x.record || x.nodes);
    crossDiffs.push({label: `${r.label} rep${r.rep}`, slots: c.slots, moved, printed: c.printed, record: c.record, nodes: c.nodes});
  }
}
for (const k of ['cross', 'same']) console.log(`- ${k === 'cross' ? 'A vs B' : 'a head vs itself'}: ${tally[k].n} uncut pairs; printed differs ${tally[k].printed}, record differs ${tally[k].record}, raw nodes differ ${tally[k].nodes}`);
// Cut observations too, for information (the fix is expected to change these): consecutive pairs that differ.
const cutTally = {cross: {n: 0, printed: 0, record: 0}, same: {n: 0, printed: 0, record: 0}};
for (const r of rows) for (const c of r.compare ?? []) if (!c.uncut) { const t = cutTally[c.same ? 'same' : 'cross']; t.n += 1; if (c.printed) t.printed += 1; if (c.record) t.record += 1; }
for (const k of ['cross', 'same']) console.log(`- cut pairs, ${k === 'cross' ? 'A vs B' : 'a head vs itself'}: ${cutTally[k].n}; printed differs ${cutTally[k].printed}, record differs ${cutTally[k].record}`);
// Per page: how often consecutive uncut observations differ across the heads and within a head. A live page (ads, a
// ticker) differs at both rates; a head difference shows as cross-head differences on a page whose same-head pairs agree.
console.log('\n| app | page | A vs B: differ / uncut pairs | a head vs itself: differ / pairs | verdict |');
console.log('|---|---|---|---|---|');
for (const {app, target} of pages) {
  const cs = rows.filter(r => r.app === app && r.target === target).flatMap(r => (r.compare ?? []).filter(c => c.uncut));
  if (!cs.length) continue;
  const differs = c => Boolean(c.printed || c.record || c.nodes);
  const cross = cs.filter(c => !c.same), same = cs.filter(c => c.same);
  const [dc, ds] = [cross.filter(differs).length, same.filter(differs).length];
  const verdict = !dc ? 'identical' : ds ? 'live page' : '**HEADS DIFFER**';
  console.log(`| ${app} | ${target} | ${dc} / ${cross.length} | ${ds} / ${same.length} | ${verdict} |`);
}
console.log('');
const unexplained = crossDiffs.filter(x => !x.moved);
console.log(`- A vs B differences where the page's own control was identical (the head, not the page): ${unexplained.length}`);
for (const x of crossDiffs) {
  console.log(`  - ${x.label} slots ${x.slots.join('-')}${x.moved ? ' (the page moved: its control differs too)' : ' **HEAD DIFFERENCE**'}`);
  if (x.printed) console.log(`    printed: ${x.printed.differing} lines differ (of ${x.printed.lines.join(', ')}), first at ${x.printed.first}: ${JSON.stringify(x.printed.a?.path)} vs ${JSON.stringify(x.printed.b?.path)}`);
  if (x.record) console.log(`    record: ${x.record.differing} entries differ (of ${x.record.entries.join(', ')}), first at ${x.record.first}: ${JSON.stringify(x.record.a?.path)} vs ${JSON.stringify(x.record.b?.path)}`);
  if (x.nodes) console.log(`    raw nodes: ${x.nodes.differing} differ (of ${x.nodes.nodes.join(', ')}), first at ${x.nodes.first}: ${x.nodes.a} vs ${x.nodes.b}`);
}

// ---- 4. cut flags -----------------------------------------------------------------------------------------------------
console.log('\n### Cut flags differing between the heads (any observation of the position)\n');
let flagDiffs = 0;
for (const r of rows) {
  const flags = h => [...new Set(slotsOf(r, h).map(s => s.obs ? `${s.obs.stops.join('+') || 'none'}${s.obs.truncated ? ` trunc${canon(s.obs.truncated)}` : ''}` : 'error'))];
  const [fa, fb] = [flags('a'), flags('b')];
  const key = x => [...x].sort().join(',');
  if (key(fa) !== key(fb)) { flagDiffs += 1; console.log(`- ${r.label} rep${r.rep}: A ${fa.join(' | ')}; B ${fb.join(' | ')}`); }
}
if (!flagDiffs) console.log('none');

// ---- 5. the kit's checks -------------------------------------------------------------------------------------------------
console.log('\n### Kit checks\n');
for (const r of rows) {
  if (r.exception) { console.log(`- ${r.label} rep${r.rep}: EXCEPTION ${r.exception.split('\n')[0]}`); continue; }
  for (const [k, s] of (r.slots ?? []).entries()) {
    if (s.error) console.log(`- ${r.label} rep${r.rep} slot ${k + 1} ${s.head}: ERROR ${JSON.stringify(s.error)}`);
    else if (s.obs.port?.differ) console.log(`- ${r.label} rep${r.rep} slot ${k + 1} ${s.head}: guard port differs from the engine's record on ${s.obs.port.differ}/${s.obs.port.nodes}`);
  }
  for (const h of ['a', 'b']) {
    const reads = slotsOf(r, h).map(s => s.obs?.reads).filter(Number.isFinite);
    if (reads.length === 2 && Math.abs(reads[0] - reads[1]) > Math.max(20, 0.05 * Math.max(...reads))) console.log(`- ${r.label} rep${r.rep} ${h}: read counts ${reads.join(' vs ')} (a page read before it was built?)`);
  }
  if (r.pageInfo?.scrollMissed) console.log(`- ${r.label} rep${r.rep}: Safari's scroll missed (${JSON.stringify(r.pageInfo.scroll)})`);
}
