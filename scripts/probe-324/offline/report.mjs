// #324's offline reader: per block, mode, cell and step, over every results-*.json under the given directories.
//   node scripts/probe-324/offline/report.mjs <dir>... [--detail]
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';

const args = process.argv.slice(2), detail = args.includes('--detail');
const files = [];
const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/^results-.*\.json$/.test(n)) files.push(p); } };
for (const d of args.filter(a => !a.startsWith('--'))) walk(d);
const rows = files.flatMap(f => JSON.parse(readFileSync(f, 'utf8')).results.map(r => ({...r, file: f})));
const med = a => { const s = a.filter(v => v != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const max = a => { const s = a.filter(v => v != null); return s.length ? Math.max(...s) : null; };
const min = a => { const s = a.filter(v => v != null); return s.length ? Math.min(...s) : null; };
const count = (a, f) => a.filter(f).length;
const tally = a => Object.entries(a.reduce((m, v) => { const k = String(v); m[k] = (m[k] ?? 0) + 1; return m; }, {})).map(([k, v]) => `${k}:${v}`).join(' ');

const problems = rows.filter(r => r.problem || r.exception);
for (const p of problems) console.log(`PROBLEM ${p.label}: ${JSON.stringify(p.problem ?? p.exception).slice(0, 300)}`);

const groups = new Map();
for (const r of rows) {
  if (!r.steps) continue;
  r.steps.forEach((s, i) => {
    const cell = r.block === 'residue' ? r.cell.replace(/#\d+$/, '') : r.cell;
    const k = `${r.block} | ${r.mode} | ${cell} | ${i}:${s.kind}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({...s, row: r});
  });
}
console.log('block | mode | cell | step: n ok seen | raised inside after | visibleMs afterReleaseMs | kind | until | hold ms (med/max) capped tr.seen tr.outlived | frozen med/max | front key | ms med | extra');
for (const [k, ss] of [...groups].sort()) {
  const until = ss.map(s => { const p = s.events.filter(e => e.ev === 'dlv.post'); return p.length ? p.map(e => (e.untilOrder ? 'U' : 'n')).join('') : '-'; });
  const extra = [];
  const ff = ss.flatMap(s => s.events.filter(e => /^(ff\.focusWrite|ff\.click|pf|ff)$/.test(e.ev)).map(e => e.ev === 'ff' ? `ff(${e.focused ? 'F' : 'u'})` : e.ev === 'ff.focusWrite' ? `fw(${e.took ? 'took' : 'no'}${e.error ? ' e' + e.error : ''})` : e.ev === 'ff.click' ? 'click' : `pf(${e.already ? 'already' : e.found + ':' + (e.steps ?? '').replace(/ \d+ms/g, '')})`).join('>'));
  if (ff.some(Boolean)) extra.push(`focus[${tally(ff)}]`);
  if (ss.some(s => s.posted != null)) extra.push(`posted[${tally(ss.map(s => s.posted))}]`);
  if (ss.some(s => s.keyed)) extra.push(`key[${count(ss, s => s.keyed?.becameKey)}] active[${count(ss, s => s.keyed?.activeSeen)}]`);
  const answers = tally(ss.map(s => s.answer));
  console.log([k, `${ss.length} ${count(ss, s => s.answer === 'success')} ${count(ss, s => s.effect?.seen)}`,
    `${count(ss, s => s.read.raised)} ${count(ss, s => s.read.raisedInside)} ${count(ss, s => s.read.raisedAfter)}${ss.some(s => s.read.raisedAfterByCall != null) ? `(${count(ss, s => s.read.raisedAfterByCall)})` : ''}`,
    `${JSON.stringify(ss.filter(s => s.read.raisedAfter).map(s => s.read.visibleMs))} ${JSON.stringify(ss.filter(s => s.read.raisedAfter).map(s => s.read.visibleAfterReleaseMs ?? (s.read.visibleNoHold ? 'nohold' : null)))}`,
    tally(ss.map(s => s.record.activationClickKind)), tally(until),
    `${med(ss.map(s => s.record.delivery?.screenHoldMs))}/${max(ss.map(s => s.record.delivery?.screenHoldMs))} ${count(ss, s => s.record.delivery?.capped)} ${count(ss, s => s.record.delivery?.transientRaise?.seen)} ${count(ss, s => s.record.delivery?.transientRaise?.outlivedHold)}`,
    `${med(ss.map(s => s.read.frozenMs))}/${max(ss.map(s => s.read.longestFreezeMs))}`,
    `${count(ss, s => s.read.frontHeld)} ${count(ss, s => s.read.keyHeld)}`, med(ss.map(s => s.ms)), `${answers === `success:${ss.length}` ? '' : answers} ${extra.join(' ')}`].join(' | '));
  if (detail) for (const s of ss.filter(x => x.read.raised)) {
    const ev = s.events.filter(e => e.ev !== 'dlv.above').map(e => `${e.ev}@${e.t}`).join(' ');
    console.log(`    r${s.row.rep ?? s.row.batch} raise@${s.read.raiseAtMs} inside=${s.read.insideMs} visible=${s.read.visibleMs} holds=${JSON.stringify(s.read.holdSpans)} trace=${JSON.stringify(s.read.trace)} :: ${ev}`);
  }
}

// #321's residue: per mode, the visible raises against the activation's time before the events, and the freeze.
const residue = rows.filter(r => r.block === 'residue' && r.steps?.length);
if (residue.length) {
  console.log('\nresidue: mode | clicks delivered | visible after hold | first-of-engine visible | activation-to-events gap (posted after hold start) med/p95/max | hold ms med/max | longest freeze med/p95/max | capped');
  for (const mode of [...new Set(residue.map(r => r.mode))]) {
    const ss = residue.filter(r => r.mode === mode).map(r => ({...r.steps[0], first: r.firstOfEngine}));
    const gaps = ss.map(s => s.record.delivery?.postedAfterHoldStartMs).filter(v => v != null).sort((a, b) => a - b);
    const fr = ss.map(s => s.read.longestFreezeMs).filter(v => v != null).sort((a, b) => a - b);
    const p95 = a => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * 0.95))] : null;
    console.log(`${mode} | ${ss.length} ${count(ss, s => s.effect?.seen)} | ${count(ss, s => s.read.raisedAfter)} (by call ${count(ss, s => s.read.raisedAfterByCall)}) | ${count(ss, s => s.first && s.read.raisedAfter)} of ${count(ss, s => s.first)} | ${med(gaps)}/${p95(gaps)}/${max(gaps)} | ${med(ss.map(s => s.record.delivery?.screenHoldMs))}/${max(ss.map(s => s.record.delivery?.screenHoldMs))} | ${med(fr)}/${p95(fr)}/${max(fr)} | ${count(ss, s => s.record.delivery?.capped)}`);
    for (const s of ss.filter(x => x.read.raisedAfter)) console.log(`    visible ${s.read.visibleMs} ms, ${s.read.visibleAfterReleaseMs} ms after release; gap ${s.record.delivery?.postedAfterHoldStartMs}, hold ${s.record.delivery?.screenHoldMs}, guard ${s.record.delivery?.guardMs}, capped ${s.record.delivery?.capped}, first ${s.first}`);
    const slow = ss.filter(s => (s.record.delivery?.postedAfterHoldStartMs ?? 0) > 100);
    console.log(`    gap > 100 ms: ${slow.length}, visible ${count(slow, s => s.read.raisedAfter)}; longest freeze among them ${max(slow.map(s => s.read.longestFreezeMs))}`);
  }
}
