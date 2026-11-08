// #328's gate (b) scorer: confirm-*.json (scripts/probe-328/confirm.mjs) under the given directories. Per browser and
// cell: what the approved confirmation (ruling b1921fc3: the hit's container's bar, its content, a descendant 40%
// across) would answer within a window W (moved, at the end, or scrollUnconfirmed), with and without the hit element
// as a fourth measure, against the page's own scroll events; a false scrollUnconfirmed is a scroll that moved (truth)
// answered unconfirmed. Latencies: the page's first scroll event and the read-back's first move, p50/p95/max in ms.
//   node scripts/probe-328/offline/confirm.mjs <dir>... [--windows 300,500,800,1500]
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';

const args = process.argv.slice(2);
const wi = args.indexOf('--windows');
const WINDOWS = (wi >= 0 ? args[wi + 1] : '300,500,800,1500').split(',').map(Number);
const dirs = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--windows'));
const files = [];
const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/^confirm-.*\.json$/.test(f)) files.push(p); } };
dirs.forEach(walk);
const rows = files.flatMap(f => JSON.parse(readFileSync(f, 'utf8')).results);
const pct = (xs, p) => { const v = xs.filter(x => x != null).sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : null; };
const lat = xs => { const v = xs.filter(x => x != null); return v.length ? `${Math.round(pct(v, 0.5))}/${Math.round(pct(v, 0.95))}/${Math.round(pct(v, 1))}` : '-'; };
const RULED = ['bar', 'content', 'tracked'];
function verdict(r, W, withHit) {
  const f = r.read?.firstMs ?? {};
  const ms = [...RULED, ...(withHit ? ['hit'] : [])].map(k => f[k]).filter(x => x != null);
  const first = ms.length ? Math.min(...ms) : null;
  if (first != null && first <= W) return 'moved';
  if (r.read?.atEnd === true) return 'atEnd';
  return 'unconfirmed';
}
const groups = new Map();
for (const r of rows) { const k = `${r.browser}\t${r.cell}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
const head = ['browser', 'cell', 'n', 'truth moved', 'container', ...WINDOWS.map(W => `false unconfirmed @${W} (ruled / +hit)`), 'at end', 'truth first ms p50/p95/max', 'AX first ms (ruled)', 'AX first ms (+hit)', 'answers'];
console.log(`| ${head.join(' | ')} |`); console.log(`|${head.map(() => '---').join('|')}|`);
for (const [k, rs] of [...groups].sort()) {
  const [b, c] = k.split('\t');
  const ok = rs.filter(r => r.read && !r.read.error && !r.problem && !r.exception);
  const moved = ok.filter(r => (r.truth?.moved ?? 0) > 1);
  const fu = W => `${moved.filter(r => verdict(r, W, false) === 'unconfirmed').length} / ${moved.filter(r => verdict(r, W, true) === 'unconfirmed').length}`;
  const ax = withHit => ok.map(r => { const f = r.read.firstMs ?? {}; const v = [...RULED, ...(withHit ? ['hit'] : [])].map(x => f[x]).filter(x => x != null); return v.length ? Math.min(...v) : null; });
  const answers = {}; rs.forEach(r => { const a = r.answer ?? r.problem ?? (r.exception ? 'exception' : r.read?.error ?? '?'); answers[a] = (answers[a] ?? 0) + 1; });
  console.log(`| ${[b, c, rs.length, `${moved.length}/${ok.length}`, [...new Set(ok.map(r => `${r.read.container?.how}:${r.read.container?.role}`))].join(','),
    ...WINDOWS.map(fu), ok.filter(r => r.read.atEnd === true).length, lat(moved.map(r => r.truth.firstMs)), lat(ax(false)), lat(ax(true)), JSON.stringify(answers)].join(' | ')} |`);
}
