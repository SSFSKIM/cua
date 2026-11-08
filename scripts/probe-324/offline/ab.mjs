// #324's A/B reader: per configuration (block, browser, desktop), cell, step and head, over every results-*.json given.
// Visibility is judged against the SLS log's frozen spans (`reading`), never the record's hold boundaries. For the
// delivery record: frozenMs against the logged span to SLSReenableUpdate's call, and holdStartedAt against the logged
// SLSDisableUpdate (2821788e's timestamps can shift later while the guard waits for the stamp).
//   node scripts/probe-324/offline/ab.mjs <dir>... [--detail]
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
const args = process.argv.slice(2), detail = args.includes('--detail');
const files = [];
const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/^results-.*\.json$/.test(n)) files.push(p); } };
for (const d of args.filter(a => !a.startsWith('--'))) walk(d);
const q = (a, p) => { const s = a.filter(v => v != null && Number.isFinite(v)).sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] * 10) / 10 : '-'; };
const dist = a => `${q(a, .5)}/${q(a, .95)}/${q(a, 1)}`;
const tally = a => Object.entries(a.reduce((m, v) => { const k = String(v); m[k] = (m[k] ?? 0) + 1; return m; }, {})).map(([k, v]) => `${k}:${v}`).join(' ');

/// The delivery's own hold in the log: the last span begun at or before the delivery guard's dlv.post.
function deliverySpan(s) {
  const post = s.events.find(e => e.ev === 'dlv.post');
  if (!post) return null;
  let idx = -1;
  s.read.holdSpans.forEach((sp, i) => { if (sp[0] <= post.t + 0.5) idx = i; });
  if (idx < 0) return null;
  const byCall = s.read.holdSpansByCall?.[idx];
  return {start: s.read.holdStartsUnix?.[idx], callSpan: byCall ? byCall[1] - byCall[0] : null, returnSpan: s.read.holdSpans[idx][1] - s.read.holdSpans[idx][0]};
}
const rows = [];
const problems = [];
for (const f of files) {
  const {config, results} = JSON.parse(readFileSync(f, 'utf8'));
  for (const r of results) {
    if (r.problem || r.exception) { problems.push(`${config.browser ?? 'safari'}/${config.desktop ?? 'shared'} ${r.label}: ${JSON.stringify(r.problem ?? r.exception).slice(0, 200)}`); continue; }
    (r.steps ?? []).forEach((s, i) => rows.push({config, r, s, i, cell: r.block === 'residue' ? r.cell.replace(/#\d+$/, '') : r.cell}));
  }
}
for (const p of problems) console.log('PROBLEM', p);
const groups = new Map();
for (const x of rows) {
  const k = `${x.r.block}/${x.config.browser ?? 'safari'}/${x.config.desktop ?? 'shared'}${x.config.delay ? '/delay' + x.config.delay : ''} | ${x.cell} ${x.i}:${x.s.kind}`;
  if (!groups.has(k)) groups.set(k, new Map());
  const g = groups.get(k);
  if (!g.has(x.r.mode)) g.set(x.r.mode, []);
  g.get(x.r.mode).push(x);
}
console.log('config | cell step | head: n ok/delivered | answers | fieldFocus | page pointer events (steps with any) | raised: inside, after (by call) | delivery records | screenHoldMs p50/p95/max | frozenMs p50/p95/max | frozenMs - logged call span p50/max | holdStartedAt - logged disable p50/max (shifted >5 ms) | freeze total by call p50/p95/max | latency p50');
for (const [k, g] of [...groups].sort()) {
  for (const [head, xs] of [...g].sort()) {
    const ss = xs.map(x => x.s);
    const c = f => ss.filter(f).length;
    const dl = xs.map(x => ({rec: x.s.record.delivery, span: deliverySpan(x.s)}));
    const diff = dl.filter(d => d.rec?.frozenMs != null && d.span?.callSpan != null).map(d => d.rec.frozenMs - d.span.callSpan);
    const shift = dl.filter(d => d.rec?.holdStartedAt && d.span?.start).map(d => d.rec.holdStartedAt - d.span.start);
    const ptr = ss.map(s => ['pointerdown', 'mousedown', 'mouseup', 'click'].reduce((t, e) => t + (s.pageDelta?.[e] ?? 0), 0));
    const ff = ss.map(s => s.record.fieldFocus ? `${s.record.fieldFocus.focus}/${s.record.fieldFocus.focusStep}${s.record.fieldFocus.caretWriteError ? '/e' + s.record.fieldFocus.caretWriteError : ''}` : '-');
    console.log([`${k} | ${head}: ${ss.length} ${c(s => s.answer === 'success')}/${c(s => s.effect?.seen)}`, tally(ss.map(s => s.answer)), tally(ff),
      ss.some(s => s.pageDelta) ? `${c((s, i) => ptr[ss.indexOf(s)] > 0)} (${tally(ptr)})` : '-',
      `${c(s => s.read.raisedInside)}, ${c(s => s.read.raisedAfter)} (${c(s => s.read.raisedAfterByCall)})`,
      c(s => s.record.delivery), dist(ss.map(s => s.record.delivery?.screenHoldMs)), dist(ss.map(s => s.record.delivery?.frozenMs)),
      `${q(diff, .5)}/${q(diff.map(Math.abs), 1)}`, `${q(shift, .5)}/${q(shift, 1)} (${shift.filter(v => v > 5).length}/${shift.length})`,
      dist(ss.map(s => s.read.frozenByCallMs)), q(ss.map(s => s.ms), .5)].join(' | '));
    if (detail) for (const s of ss.filter(s => s.read.raisedAfter || s.read.raisedAfterByCall || s.answer !== 'success' || !s.effect?.seen))
      console.log(`      ${s.answer} effect=${JSON.stringify(s.effect)} visible=${s.read.visibleMs}/${s.read.visibleMsByCall} holds=${JSON.stringify(s.read.holdSpansByCall)} trace=${JSON.stringify(s.read.trace)} ${s.message ?? ''}`);
  }
}
