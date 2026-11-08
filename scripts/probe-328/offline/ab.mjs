// #328's A/B reader (ruling b1921fc3's gates), head a = main, head b = the branch, under the given directories:
//   engine  ab-engine-<h>/results-engine.json: per cell the answers, what moved (t328's read-back or the app's truth),
//           false successes (success, nothing moved, no atEnd), false scrollUnconfirmed (unconfirmed, it moved), the
//           at-end answers, and the scroll meta's firstMoveMs, readMs, ms, walked, barWrite and the answer's latency
//   web     ab-confirm-<browser>-<h>/confirm-*.json: the same against the page's own truth, and what else moved (a
//           container other than the scroller under the point)
//   sweep   ab-sweep-<app>-<h>/sweep-*.json: per point kind, a's and b's refusals, new refusals in b inside the screenshot,
//           and whether a refused outside point posted anything (the page's pointer events)
//   repro   repro324-*-<h>: #324's own cells
//   node scripts/probe-328/offline/ab.mjs <dir>...
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, basename, dirname} from 'node:path';

const files = [];
const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.json$/.test(f)) files.push(p); } };
process.argv.slice(2).forEach(walk);
const headOf = p => (basename(dirname(p)).match(/-(a|b)$/) || [])[1];
const load = re => files.filter(f => re.test(basename(dirname(f)))).flatMap(f => { const j = JSON.parse(readFileSync(f, 'utf8')); return (j.results ?? []).map(r => ({...r, head: headOf(f)})); });
const med = xs => { const v = xs.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
const p95 = xs => { const v = xs.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(0.95 * v.length))] : null; };
const f0 = v => (v == null ? '-' : Math.round(v));
const tally = xs => { const t = {}; for (const x of xs) t[x] = (t[x] ?? 0) + 1; return Object.entries(t).map(([k, v]) => `${k} ${v}`).join(', '); };
const table = (head, rows) => { console.log(`| ${head.join(' | ')} |`); console.log(`|${head.map(() => '---').join('|')}|`); rows.forEach(r => console.log(`| ${r.join(' | ')} |`)); };

// ---- engine cells -------------------------------------------------------------------------------------------------------
const eng = load(/^ab-engine-(a|b)$/).filter(r => r.block === 'engine');
if (eng.length) {
  console.log('### Engine cells (native)');
  const g = new Map();
  for (const r of eng) { const k = `${r.desktop}\t${r.target.replace(/#.*/, '')}\t${r.name.replace('engine/', '')}`; if (!g.has(k)) g.set(k, {a: [], b: []}); g.get(k)[r.head].push(r); }
  const moved = r => (r.read?.movedPx ?? 0) > 2 || (r.read?.barDelta ?? 0) > 0.0005 || (r.truth?.y ? r.truth.y[1] - r.truth.y[0] > 2 : false)
    || (r.truth?.offsets ? Object.keys(r.truth.offsets[1] ?? {}).some(k => (r.truth.offsets[1][k] ?? 0) - (r.truth.offsets[0]?.[k] ?? 0) > 2) : false);
  const cell = rs => {
    if (!rs.length) return ['-', '-', '-'];
    const ans = rs.map(r => r.answer ?? (r.problem ? 'problem' : r.exception ? 'exception' : '?'));
    const ok = rs.filter(r => r.answer);
    const falseSuccess = ok.filter(r => r.answer === 'success' && !moved(r) && !r.meta?.scroll?.atEnd).length;
    const falseUnconf = ok.filter(r => r.answer === 'scrollUnconfirmed' && moved(r)).length;
    const sc = ok.map(r => r.meta?.scroll).filter(Boolean);
    const meta = sc.length ? `first ${f0(med(sc.map(s => s.firstMoveMs)))}/${f0(p95(sc.map(s => s.firstMoveMs)))}, read ${f0(med(sc.map(s => s.readMs)))}, ms ${f0(med(sc.map(s => s.ms)))}, walked ${f0(med(sc.map(s => s.walked)))}, ${tally(sc.map(s => `${s.outcome}${s.barWrite != null ? '+write' : ''}:${s.container}`))}` : '';
    return [`${tally(ans)}; moved ${ok.filter(moved).length}/${ok.length}${falseSuccess ? `; FALSE SUCCESS ${falseSuccess}` : ''}${falseUnconf ? `; FALSE UNCONFIRMED ${falseUnconf}` : ''}`, f0(med(ok.map(r => r.ms))), meta];
  };
  table(['desktop', 'target', 'cell', 'a: answers', 'a ms', 'b: answers', 'b ms', 'b scroll meta (firstMoveMs p50/p95, readMs, ms, walked, outcomes)'],
    [...g].sort().map(([k, v]) => { const [d, t, c] = k.split('\t'); const a = cell(v.a), b = cell(v.b); return [d, t, c, a[0], a[1], b[0], b[1], b[2]]; }));
}

// ---- web cells -----------------------------------------------------------------------------------------------------------
const web = load(/^ab-confirm-\w+-(a|b)$/);
if (web.length) {
  console.log('\n### Web cells (page-sized delta; the page\'s own truth)');
  const g = new Map();
  for (const r of web) { const k = `${r.browser}\t${r.cell}`; if (!g.has(k)) g.set(k, {a: [], b: []}); g.get(k)[r.head].push(r); }
  const cell = rs => {
    if (!rs.length) return ['-', '-', '-'];
    const ok = rs.filter(r => r.answer && r.truth);
    const mv = r => (r.truth.moved ?? 0) > 1;
    const falseSuccess = ok.filter(r => r.answer === 'success' && !mv(r) && !r.meta?.scroll?.atEnd && !(r.truth.others ?? []).length).length;
    const falseUnconf = ok.filter(r => r.answer === 'scrollUnconfirmed' && mv(r)).length;
    const elsewhere = ok.filter(r => (r.truth.others ?? []).length).map(r => `${r.truth.others.join('+')}${r.meta?.scroll?.barWrite != null ? '(bar written)' : ''}`);
    const sc = ok.map(r => r.meta?.scroll).filter(Boolean);
    return [`${tally(rs.map(r => r.answer ?? r.problem ?? 'exception'))}; moved ${ok.filter(mv).length}/${ok.length}${falseSuccess ? `; FALSE SUCCESS ${falseSuccess}` : ''}${falseUnconf ? `; FALSE UNCONFIRMED ${falseUnconf}` : ''}${elsewhere.length ? `; also moved: ${tally(elsewhere)}` : ''}`,
      `${f0(med(ok.filter(mv).map(r => r.truth.firstMs)))}/${f0(p95(ok.filter(mv).map(r => r.truth.firstMs)))}`,
      sc.length ? `first ${f0(med(sc.map(s => s.firstMoveMs)))}/${f0(p95(sc.map(s => s.firstMoveMs)))}, read ${f0(med(sc.map(s => s.readMs)))}, ms ${f0(med(sc.map(s => s.ms)))}, walked ${f0(med(sc.map(s => s.walked)))}, ${tally(sc.map(s => `${s.outcome}${s.barWrite != null ? '+write' : ''}:${s.container}${s.by ? `/${s.by}` : ''}`))}, answer ${f0(med(ok.map(r => r.answerMs)))}` : `answer ${f0(med(ok.map(r => r.answerMs)))}`];
  };
  table(['browser', 'cell', 'a: answers', 'a truth first p50/p95', 'a', 'b: answers', 'b truth first p50/p95', 'b scroll meta'],
    [...g].sort().map(([k, v]) => { const [br, c] = k.split('\t'); const a = cell(v.a), b = cell(v.b); return [br, c, a[0], a[1], a[2], b[0], b[1], b[2]]; }));
}

// ---- the sweep -----------------------------------------------------------------------------------------------------------
const sw = load(/^ab-sweep-\w+-(a|b)$/).filter(r => r.action);
if (sw.length) {
  console.log('\n### Still sweep (clicks and drags)');
  const key = r => `${r.app}\t${r.action}\t${r.name}`;
  const a = new Map(sw.filter(r => r.head === 'a').map(r => [key(r), r])), b = new Map(sw.filter(r => r.head === 'b').map(r => [key(r), r]));
  const g = new Map();
  for (const [k, rb] of b) {
    const ra = a.get(k);
    const gk = `${rb.app}\t${rb.action}\t${rb.kind}`;
    if (!g.has(gk)) g.set(gk, {n: 0, aRef: [], bRef: [], newRef: [], posted: []});
    const x = g.get(gk); x.n += 1;
    if (ra && ra.answer !== 'success') x.aRef.push(ra.answer ?? (ra.exception ? 'exception' : '?'));
    if (rb.answer !== 'success') x.bRef.push(rb.answer ?? (rb.exception ? 'exception' : '?'));
    if (rb.kind !== 'outside' && rb.answer !== 'success' && (!ra || ra.answer === 'success')) x.newRef.push(`${rb.name}:${rb.answer}`);
    if (rb.kind === 'outside' && (rb.page ?? []).length) x.posted.push(`${rb.name}:${rb.page.join('+')}`);
  }
  table(['app', 'action', 'points', 'n', 'a refusals', 'b refusals', 'NEW refusals in b (inside the screenshot)', 'b refused yet posted'],
    [...g].sort().map(([k, x]) => { const [ap, ac, kind] = k.split('\t'); return [ap, ac, kind, x.n, tally(x.aRef) || '0', tally(x.bRef) || '0', x.newRef.join(', ') || '0', x.posted.join(', ') || '-']; }));
}

// ---- #324's own cells ------------------------------------------------------------------------------------------------------
const rp = files.filter(f => /^repro324-\w+-(a|b)$/.test(basename(dirname(f)))).flatMap(f => (JSON.parse(readFileSync(f, 'utf8')).results ?? []).flatMap(r => (r.steps ?? []).map(s => ({head: headOf(f), block: r.block, answer: s.answer, args: s.args, seen: s.effect?.seen}))));
if (rp.length) {
  console.log('\n### #324\'s own cells');
  for (const h of ['a', 'b']) console.log(`- ${h}: ${tally(rp.filter(r => r.head === h).map(r => `${r.block} (${r.args.x},${r.args.y}) ${r.answer}${r.seen ? ' moved' : ''}`))}`);
}
