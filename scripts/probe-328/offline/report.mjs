// #328's offline reader: every results-*.json under the given directories, one row per target and trial name:
// delivered n/N (the view moved more than 2 points the asked way, by t328's Accessibility read-back), the move against
// the 120 points asked (pixel units) or per line (line units), raises (a target window above the cover's at any 5 ms
// sample), key changes (the cover's focused window, the front app, the target's focused or main window), the call's
// cost and the first move's time, and the probe apps' own ground truth beside it.
//   node scripts/probe-328/offline/report.mjs <dir>... [--only <regex>] [--engine] [--factors]
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';

const args = process.argv.slice(2);
const flag = n => args.includes(`--${n}`);
const opt = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const only = opt('only') ? new RegExp(opt('only')) : null;
const dirs = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--only'));
const files = [];
const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/^results-.*\.json$/.test(f)) files.push(p); } };
dirs.forEach(walk);
const rows = files.flatMap(f => { const j = JSON.parse(readFileSync(f, 'utf8')); return j.results.map(r => ({...r, file: f})); });
const med = xs => { const v = xs.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
const f1 = v => (v == null ? '-' : Math.round(v * 10) / 10);

/// What a trial did: moved the asked way, how far, any raise or key change.
function judge(r) {
  const sign = r.down === false ? -1 : 1;
  const px = r.movedPx == null ? null : r.movedPx * sign;
  const kb = r.keysBefore ?? {}, ka = r.keysAfter ?? {};
  const keyChange = (kb.coverFocused !== ka.coverFocused) || (ka.coverFrontmost === false) || (r.frontOther?.length > 0)
    || kb.targetFocused !== ka.targetFocused || kb.targetMain !== ka.targetMain;
  const truth = r.truth?.y && r.truth.y[0] != null && r.truth.y[1] != null ? (r.truth.y[1] - r.truth.y[0]) * sign
    : r.truth?.offsets ? (() => { const k = /list/.test(r.target) ? 'list' : /catalyst/.test(r.target) ? 'table' : 'scroll'; const b = r.truth.offsets[0]?.[k], a = r.truth.offsets[1]?.[k]; return a != null && b != null ? (a - b) * sign : null; })() : null;
  // Moved the asked way: by more than 2 points, or (no length to scale it: SwiftUI's List) its bar the asked way.
  const barMoved = r.barDelta != null && r.barDelta * sign > 0.0005;
  return {delivered: (px != null && px > 2) || barMoved, barMoved, px, raised: !!r.raised, keyChange, truth, reached: r.truth?.reached ?? null, wheels: r.truth?.wheels ?? null};
}
const table = (head, body) => { console.log(`| ${head.join(' | ')} |`); console.log(`|${head.map(() => '---').join('|')}|`); for (const b of body) console.log(`| ${b.join(' | ')} |`); };

const trials = rows.filter(r => r.block !== 'engine' && r.name && (!only || only.test(`${r.target} ${r.name}`)));
const groups = new Map();
for (const r of trials) { const k = `${r.target}\t${r.name}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
const body = [];
for (const [k, rs] of [...groups].sort()) {
  const [target, name] = k.split('\t');
  const j = rs.map(judge);
  const errs = rs.filter(r => r.error || r.exception).length;
  const truthN = j.filter(x => x.truth != null);
  body.push([target, name, `${j.filter(x => x.delivered).length}/${rs.length}${errs ? ` (${errs} err)` : ''}`, f1(med(j.map(x => x.px))),
    truthN.length ? `${truthN.filter(x => x.truth > 2).length}/${truthN.length} ${f1(med(truthN.map(x => x.truth)))}` : '-',
    j.filter(x => x.raised).length, j.filter(x => x.keyChange).length, f1(med(rs.map(r => r.costMs))), f1(med(rs.map(r => r.firstMoveMs))), f1(med(rs.map(r => r.settledMs))),
    [...new Set(rs.map(r => r.movedBy))].join(','), [...new Set(rs.map(r => JSON.stringify(r.detail?.rc ?? r.detail?.missing ?? '')))].join(' ').slice(0, 40),
    j[0].reached ? [...new Set(j.flatMap(x => x.reached ?? []))].slice(0, 4).join(' ') : '']);
}
if (!flag('engine')) table(['target', 'trial', 'delivered', 'moved (med, pt)', 'truth n/N med', 'raised', 'key/front change', 'cost ms', 'first move ms', 'settled ms', 'by', 'rc', 'reached'], body);

if (flag('factors')) {
  // The factorial's marginals per target: delivered n/N for each level of each factor.
  console.log('\n### Factor marginals (post/<tap>/<pointer>/<phase>/<units>/<fields>)');
  const names = ['tap', 'pointer', 'phase', 'units', 'fields'];
  const byTarget = new Map();
  for (const r of trials.filter(r => r.name.startsWith('post/'))) { if (!byTarget.has(r.target)) byTarget.set(r.target, []); byTarget.get(r.target).push(r); }
  for (const [t, rs] of byTarget) {
    const cells = names.map((n, i) => { const lv = new Map(); for (const r of rs) { const v = r.name.split('/')[i + 1]; const x = lv.get(v) ?? [0, 0]; x[0] += judge(r).delivered ? 1 : 0; x[1] += 1; lv.set(v, x); } return `${n}: ${[...lv].map(([v, x]) => `${v} ${x[0]}/${x[1]}`).join(', ')}`; });
    console.log(`- ${t}: ${cells.join('; ')}`);
  }
}

if (flag('timing')) {
  // The read-back an honest answer would rest on: against the apps' own ground truth, how often Accessibility saw a
  // move that happened (and saw one that did not), and how soon the first move read back.
  console.log('\n### Read-back against ground truth, and the first move\'s time');
  const pct = (xs, p) => { const v = xs.filter(x => x != null).sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : null; };
  const fam = t => t.split('/')[0] + (/list/.test(t) ? '/list' : '');
  const g = new Map();
  for (const r of trials) { const k = fam(r.target); if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
  table(['family', 'trials with truth', 'truth moved, AX saw', 'truth moved, AX missed', 'truth still, AX moved', 'first move p50/p95/max ms (posted, no phase, delivered)'], [...g].map(([k, rs]) => {
    const t = rs.map(r => ({r, j: judge(r)})).filter(x => x.j.truth != null);
    const moved = t.filter(x => Math.abs(x.j.truth) > 2);
    const fm = rs.filter(r => r.spec?.route === 'post' && (r.spec.post?.phase ?? 'none') === 'none' && judge(r).delivered).map(r => r.firstMoveMs);
    return [k, t.length, moved.filter(x => x.j.delivered || Math.abs(x.j.px ?? 0) > 2).length, moved.filter(x => !(x.j.delivered || Math.abs(x.j.px ?? 0) > 2)).length,
      t.filter(x => Math.abs(x.j.truth) <= 2 && (x.j.delivered || Math.abs(x.j.px ?? 0) > 2)).length, `${f1(pct(fm, 0.5))}/${f1(pct(fm, 0.95))}/${f1(pct(fm, 1))} (n ${fm.length})`];
  }));
}

const eng = rows.filter(r => r.block === 'engine');
if (eng.length) {
  console.log('\n### Main\'s engine');
  const g = new Map();
  for (const r of eng) { const k = `${r.desktop}\t${r.target}\t${r.name}`; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
  table(['desktop', 'target', 'how', 'answers', 'route', 'moved n/N (AX)', 'truth', 'ms'], [...g].map(([k, rs]) => {
    const [d, t, n] = k.split('\t');
    const ans = {}; rs.forEach(r => { const a = r.answer ?? r.problem?.error?.name ?? (r.problem ? 'problem' : r.exception ? 'exception' : '?'); ans[a] = (ans[a] ?? 0) + 1; });
    const moved = rs.filter(r => (r.read?.movedPx ?? r.movedPx ?? 0) > 2 || (r.read?.barDelta ?? 0) > 0.0005 || (r.bar?.[1] ?? 0) - (r.bar?.[0] ?? 0) > 0.0005);
    const tr = rs.map(r => r.truth?.y ? r.truth.y[1] - r.truth.y[0] : r.truth?.offsets ? null : null).filter(x => x != null);
    return [d, t, n, JSON.stringify(ans), [...new Set(rs.map(r => r.route))].join(','), `${moved.length}/${rs.length}`, tr.length ? tr.join(',') : '-', f1(med(rs.map(r => r.ms)))];
  }));
}
