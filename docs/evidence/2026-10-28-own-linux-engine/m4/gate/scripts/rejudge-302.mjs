#!/usr/bin/env node
// M4's gate (T18, task 76): the shipped settle lane re-judged with #302 encoded. #302 is a limit declared before the gate:
// an Electron page's key release reaches the tree after press_key's 100 ms settle in about a third of the runs, at every
// step (T8, the Decision Log 2026-11-07, carry 1 to T18). The lane's judge never encoded it, so the gate's S1 and L3b
// read its misses as failures. The design session's ruling (2026-11-13), applied mechanically to the stored records:
// a run of an Electron press_key cell that fails the lane's own rule counts as #302 only when its record shows all three:
//   1. the key-down inside the settle: the reading straight after the settle has key_downs one more than before, and
//      last_key the key sent;
//   2. the key-up late: that reading has key_ups unchanged, and the run's late bound saw it come (late_ms set);
//   3. key_ups equal to key_downs at the next before-read: the next timed run on the same page in the record (its
//      counters continuing from this run's), before its own input.
// It must also be the lane's `late` class: every answer ok, nothing invalid, the desktop left alone. Every other run is
// judged by the lane's own rule (action-settle-cells.mjs runPasses, recorded as the row's `ok`), and anything else fails:
// a lost key (`never`), a refusal, an invalid run, a desktop change, or a miss outside the criterion. An Electron
// press_key cell passes when every run outside #302 passes, its series' streak (#302 runs counted as passes, the lane's
// own seriesVerdict) reaches the lane's need, and every audit of the cell passed; every other cell keeps the lane's own
// verdict (its series reached, its audits passed). Read-only: it reads the stored rows and prints.
// usage: node rejudge-302.mjs <harness checkout (the candidate's commit)> <results.jsonl>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [harness, file] = process.argv.slice(2);
if (!harness || !file) {
  console.error('usage: node rejudge-302.mjs <harness checkout> <results.jsonl>');
  process.exit(2);
}
const { runClass } = await import(join(harness, 'scripts/linux-engine-diff/action-settle-cells.mjs'));
const { seriesVerdict } = await import(join(harness, 'scripts/linux-engine-diff/focus-timer.mjs'));
const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const runs = rows.filter((r) => r.kind === 'settle-run');
const series = rows.filter((r) => r.kind === 'settle-series');
const audits = rows.filter((r) => r.kind === 'settle-audit');
const meta = rows.find((r) => r.kind === 'meta');

const electronPressKey = (r) => r.input === 'press_key' && /^electron/.test(r.scene);
/** The next timed run on the same page after `i`: same scene, its counters continuing from run i's reading. */
function nextBeforeRead(i) {
  const r = runs[i];
  for (const n of runs.slice(i + 1)) {
    if (n.scene !== r.scene) continue;
    if (!n.before || typeof n.before.key_downs !== 'number') return null;
    if (n.before.key_downs >= r.after.key_downs) return n;
    return null; // a fresh page: the counters started again
  }
  return null;
}
/** A failing run's #302 check: null when it is #302, else why not. */
function not302(i) {
  const r = runs[i];
  const cls = runClass(r);
  if (cls !== 'late') return `class ${cls}`;
  if (r.desktop_clean !== true || r.front_active !== true) return 'the desktop changed';
  const { before: b, after: a } = r;
  if (!b || !a || typeof b.key_downs !== 'number' || typeof b.key_ups !== 'number') return 'no key counters in the record';
  if (!(a.key_downs === b.key_downs + 1 && a.last_key === r.sent?.key)) return `criterion 1: key_downs ${b.key_downs} -> ${a.key_downs}, last_key ${a.last_key}`;
  if (!(a.key_ups === b.key_ups && r.late_ms !== null && r.late_ms !== undefined)) return `criterion 2: key_ups ${b.key_ups} -> ${a.key_ups}, late_ms ${r.late_ms}`;
  const n = nextBeforeRead(i);
  if (!n) return 'criterion 3: no next before-read on the same page';
  if (n.before.key_ups !== n.before.key_downs) return `criterion 3: next before-read (${n.cell} trial ${n.trial}) key_ups ${n.before.key_ups}, key_downs ${n.before.key_downs}`;
  return null;
}

console.log(`# ${meta?.run} re-judged with #302 encoded (${file})`);
console.log(`label: ${meta?.label}; candidate ${meta?.candidate?.sha256} (${meta?.candidate?.version}); load factor ${meta?.load_factor ?? 'none'}`);
let allPass = true;
const counts = [];
for (const s of series) {
  const mine = runs.map((r, i) => [r, i]).filter(([r]) => r.cell === s.cell && r.lane === s.lane && r.load === s.load);
  const judged = mine.map(([r, i]) => {
    if (r.ok) return { trial: r.trial, cls: 'pass' };
    if (electronPressKey(r)) {
      const why = not302(i);
      if (why === null) return { trial: r.trial, cls: '#302', late_ms: r.late_ms };
      return { trial: r.trial, cls: 'fail', why };
    }
    return { trial: r.trial, cls: 'fail', why: `class ${runClass(r)}` };
  });
  const oks = judged.map((j) => j.cls !== 'fail');
  const { streak, reached } = seriesVerdict(oks, s.need);
  const cellAudits = audits.filter((a) => a.cell === s.cell && a.lane === s.lane && a.load === s.load);
  const auditOk = cellAudits.every((a) => a.pass);
  const failed = judged.filter((j) => j.cls === 'fail');
  const n302 = judged.filter((j) => j.cls === '#302');
  // an Electron press_key cell by the ruling: no failing run at all; every other cell by the lane's own series rule
  const pass = (electronPressKey(s) ? failed.length === 0 : true) && reached && auditOk;
  if (!pass) allPass = false;
  if (n302.length || !pass || electronPressKey(s)) {
    console.log(`\n## ${s.cell} (${s.lane}, load ${s.load})`);
    for (const j of judged) console.log(`  trial ${j.trial}: ${j.cls}${j.late_ms != null ? ` (key-up seen ${j.late_ms} ms after the answer)` : ''}${j.why ? `: ${j.why}` : ''}`);
    console.log(`  runs ${judged.length}, pass ${judged.filter((j) => j.cls === 'pass').length}, #302 ${n302.length}, failing ${failed.length}; streak ${streak} of ${s.need} needed (${reached ? 'reached' : 'not reached'}); audits ${cellAudits.length ? cellAudits.map((a) => (a.pass ? 'pass' : 'FAIL')).join(', ') : 'none'}`);
    console.log(`  verdict: ${pass ? 'PASS' : 'FAIL'}`);
  }
  if (electronPressKey(s)) counts.push({ cell: s.cell, lane: s.lane, load: s.load, runs: judged.length, '#302': n302.length, failing: failed.length, verdict: pass ? 'pass' : 'fail' });
}
console.log(`\n#302 counts per Electron press_key cell: ${JSON.stringify(counts)}`);
console.log(`cells: ${series.length}; VERDICT (the lane's rule with #302 encoded): ${allPass ? 'PASS' : 'FAIL'}`);
process.exit(allPass ? 0 : 1);
