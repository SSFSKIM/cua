// #316's summary: sequences x apps over every results.json given (runs and variants pooled), with the candidate's and
// the proposal's false refusals and true catches. The proposal (W or G) needs the signals read at the screenshot, which
// run 2 added; rows without them count under "n/a".
//   W  a window of the app's own, layer 0, above the screenshot's window, that the window list at the screenshot lacked
//   G  for a page target: the hit lies outside every web area, or in another web area than the screenshot's hit (CFEqual)
//   node scripts/probe-316/offline/summary.mjs <results.json>...
import {readFileSync} from 'node:fs';

const rows = process.argv.slice(2).flatMap(f => JSON.parse(readFileSync(f, 'utf8')).results);
const page = r => ['safari', 'cft', 'stable', 'firefox'].includes(r.app);
function outcome(r) {
  if (r.problem || r.exception || !r.result) return 'unclear';
  const l = r.result.landing;
  if (l === 'landed') return 'landed';
  if (l.startsWith('refused:')) return /screenChanged/.test(l) ? 'guard' : 'refused';
  return l === 'unknown' ? 'unclear' : 'wrong';
}
function newAbove(r) {
  const shot = r.atReobs ?? r.atShot;
  if (!shot) return null;
  const had = new Set((shot.appWindowsCG ?? []).map(w => w.n));
  return (r.signals?.sameAppAbove ?? []).filter(w => !had.has(w.n));
}
const W = r => { const n = newAbove(r); return n == null ? null : n.some(w => w.layer === 0); };
const G = r => { if (!r.atShot) return null; const h = r.signals?.hit; return page(r) && h != null && (h.inWebArea === false || h.sameWebAreaAsShot === false); };
const P = r => { const w = W(r), g = G(r); return w == null ? null : w || g; };

const apps = ['safari', 'cft', 'stable', 'firefox', 'textedit', 'finder'];
const seqs = [...new Set(rows.map(r => r.seq))];
const fmt = (a, b) => (b ? `${a}/${b}` : '-');
console.log('Each cell: clicks; landed / wrong (engine answered success, the click went elsewhere) / guard-refused; candidate false refusals (of landed) and true catches (of wrong); proposal W|G the same (run 2 rows).');
console.log(`\n| sequence | ${apps.join(' | ')} |\n|---|${apps.map(() => '---').join('|')}|`);
for (const s of seqs) {
  const cells = apps.map(a => {
    const rs = rows.filter(r => r.app === a && r.seq === s && r.click);
    if (!rs.length) return '';
    const o = rs.map(outcome);
    const landed = rs.filter((r, i) => o[i] === 'landed'), wrong = rs.filter((r, i) => o[i] === 'wrong');
    const cand = rs[0].candidate;
    const pl = landed.filter(r => P(r) != null), pw = wrong.filter(r => P(r) != null);
    return `${rs.length}: ${landed.length}/${wrong.length}/${o.filter(x => x === 'guard').length}; cand ${cand ? `${landed.length}F ${wrong.length}T` : '0F 0T'}; W|G ${pl.filter(P).length}F/${pl.length} ${pw.filter(P).length}T/${pw.length}`;
  });
  console.log(`| ${s} | ${cells.join(' | ')} |`);
}
const tot = (pred, f) => rows.filter(r => r.click && pred(r)).filter(f).length;
const L = r => outcome(r) === 'landed', X = r => outcome(r) === 'wrong';
console.log(`\nAll: ${tot(() => true, () => true)} clicks, ${tot(() => true, L)} landed, ${tot(() => true, X)} wrong, ${tot(() => true, r => outcome(r) === 'guard')} guard-refused.`);
console.log(`Candidate: ${tot(r => r.candidate, L)} false refusals of ${tot(() => true, L)} landed; ${tot(r => r.candidate, X)} true catches of ${tot(() => true, X)} wrong.`);
const withSig = r => P(r) != null;
console.log(`Proposal W|G (rows with screenshot signals): ${tot(r => withSig(r) && P(r), L)} false refusals of ${tot(withSig, L)} landed; ${tot(r => withSig(r) && P(r), X)} true catches of ${tot(withSig, X)} wrong.`);
console.log(`  W alone: ${tot(r => withSig(r) && W(r), L)} false, ${tot(r => withSig(r) && W(r), X)} caught; G alone: ${tot(r => withSig(r) && G(r), L)} false, ${tot(r => withSig(r) && G(r), X)} caught.`);
console.log(`  Candidate on the same rows: ${tot(r => withSig(r) && r.candidate, L)} false, ${tot(r => withSig(r) && r.candidate, X)} caught.`);
const missed = new Map();
for (const r of rows) if (withSig(r) && X(r) && !P(r)) missed.set(`${r.app}/${r.seq}`, (missed.get(`${r.app}/${r.seq}`) ?? 0) + 1);
console.log(`  Proposal missed: ${JSON.stringify(Object.fromEntries(missed))}`);
const falses = new Map();
for (const r of rows) if (withSig(r) && L(r) && P(r)) falses.set(`${r.app}/${r.seq}/${W(r) ? 'W' : ''}${G(r) ? 'G' : ''}`, (falses.get(`${r.app}/${r.seq}/${W(r) ? 'W' : ''}${G(r) ? 'G' : ''}`) ?? 0) + 1);
console.log(`  Proposal false refusals: ${JSON.stringify(Object.fromEntries(falses))}`);
