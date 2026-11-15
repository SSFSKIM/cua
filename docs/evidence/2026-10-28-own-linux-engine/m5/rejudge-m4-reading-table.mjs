#!/usr/bin/env node
// M5 T2 fix 7 (ruling 716): M4's stored release-gate records read again by the settle lane's reading-table judge
// (action-settle-cells.mjs SETTLE_READINGS) and by #373's witness-observed gap (run.mjs declaredGapVerdict). A read of
// stored rows, not a rerun. For each candidate's settle step (S1-S4, L3a-e) and V3, it prints:
// - every run whose classification (pass, #302, pending, false ok, fail) differs between the judge before fix 7
//   (fc6e74f1, read from git) and the table judge, and how many honest misses' reasons changed only in their wording;
// - the step's verdict under the table judge beside the one M4 recorded (m4/gate/README.md: the shipped judge's, or the
//   re-judge script's where a ruling passed the step), and whether it moved.
// Usage, from the repository's root: node docs/evidence/2026-10-28-own-linux-engine/m5/rejudge-m4-reading-table.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const at = (p) => pathToFileURL(join(ROOT, p)).href;
const { gateRows, CANDIDATES } = await import(at('test/linux-engine-diff/gate-rows.mjs'));
const table = await import(at('scripts/linux-engine-diff/action-settle-cells.mjs'));
const { declaredGapVerdict, judgeWithDecisions, planOps, plannedVerdicts } = await import(at('scripts/linux-engine-diff/run.mjs'));
const { medianDifferenceInterval } = await import(at('scripts/linux-engine-diff/events.mjs'));
const { stepNamed, verdictOps } = await import(at('scripts/linux-engine-gate/steps.mjs'));
const { runOutcome } = await import(at('scripts/linux-engine-diff/stats.mjs'));

// the judge before fix 7, its relative imports pointed at this checkout's modules (unchanged by fix 7)
const BEFORE = 'fc6e74f1';
const scratch = mkdtempSync(join(tmpdir(), 'rejudge-m4-'));
let prior;
try {
  const source = execFileSync('git', ['-C', ROOT, 'show', `${BEFORE}:scripts/linux-engine-diff/action-settle-cells.mjs`], { encoding: 'utf8' })
    .replace("'../../src/services/engine/linux/settle.mjs'", `'${at('src/services/engine/linux/settle.mjs')}'`)
    .replace("'./deviations.mjs'", `'${at('scripts/linux-engine-diff/deviations.mjs')}'`)
    .replace("'./focus-timer.mjs'", `'${at('scripts/linux-engine-diff/focus-timer.mjs')}'`);
  writeFileSync(join(scratch, 'action-settle-cells.mjs'), source);
  prior = await import(pathToFileURL(join(scratch, 'action-settle-cells.mjs')).href);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

/** A stored settle record judged by a judge module: every series rebuilt from its runs, then the sitting. */
function judgeRecord(judge, rows) {
  const runs = rows.filter((r) => r.kind === 'settle-run');
  const meta = rows.find((r) => r.kind === 'meta');
  // the menu control came with candidate 3 (Decision Log, T18 gate)
  const controlled = rows.some((r) => r.kind === 'settle-series' && r.input === 'menu_unconfirmed');
  const planned = judge.cellsFor({ families: meta.families, kinds: meta.kinds, routes: meta.routes }).filter((c) => controlled || c.kind !== 'menu_unconfirmed');
  const series = rows.filter((r) => r.kind === 'settle-series').map((s) => {
    const mine = runs.filter((r) => r.cell === s.cell && r.lane === s.lane && r.load === s.load);
    const last = runs.indexOf(mine.at(-1));
    const next = runs.slice(last + 1).find((r) => r.scene === s.scene);
    const judged = judge.judgeSettleSeries(mine, { need: s.need, next });
    return { ...s, runs: judged.runs, misses: judged.misses, streak: judged.streak, reached: judged.reached, late_302: judged.late_302, false_ok: judged.false_ok, judged: judged.judged };
  });
  const skipped = rows.filter((r) => r.kind === 'settle-skipped').flatMap((k) => planned.filter((c) => judge.FAMILY_SCENES[k.family].includes(c.scene)).map((c) => ({ cell: judge.cellName(c), why: k.why })));
  const audited = meta.lanes.includes('shipped') ? planned.filter((c) => c.route === 'background' && !judge.ACTIVATING.includes(c.kind)).map(judge.cellName) : [];
  return { ...judge.sittingVerdict({ series, cells: planned.map(judge.cellName), search: false, skipped, audits: rows.filter((r) => r.kind === 'settle-audit'), audited }), series };
}

// M4's recorded verdicts (m4/gate/README.md's step tables): pass, by the shipped judge or a ruling's re-judge
const RECORDED = {
  1: { S1: 'pass (ruling: #302)', S2: 'pass', S3: 'pass', S4: 'pass', V3: 'pass (ruling: #373)' },
  2: { S1: 'pass (ruling: #302)', L3a: 'FAIL (Chrome context-menu Copy stuck; ruled a defect, rerun on candidate 3)', L3b: 'pass (ruling: #302)', L3c: 'pass', L3d: 'pass', L3e: 'pass' },
  3: { S1: 'pass (ruling: #302)', S2: 'pass', S4: 'pass', V3: 'pass (ruling: #373)', L3a: 'pass', L3b: 'pass (ruling: #302)' },
};
const passes = (recorded) => recorded.startsWith('pass');

const out = [];
const counts = { steps: 0, series: 0, runs: 0, changed: 0, reworded: 0, moved: 0, v3: 0 };
for (const [candidate, steps] of Object.entries(RECORDED)) {
  for (const [step, recorded] of Object.entries(steps)) {
    if (step === 'V3') continue;
    const rows = gateRows(CANDIDATES[candidate], step);
    const now = judgeRecord(table, rows);
    const then = judgeRecord(prior, rows);
    counts.steps++;
    counts.series += now.series.length;
    for (const s of now.series) {
      const was = then.series.find((x) => x.cell === s.cell && x.lane === s.lane && x.load === s.load);
      s.judged.forEach((j, i) => {
        counts.runs++;
        const w = was.judged[i];
        if (j.cls !== w.cls) {
          counts.changed++;
          out.push(`  CHANGED c${candidate} ${step} ${s.cell} (${s.lane}) trial ${j.trial}: ${w.cls}${w.why ? ` (${w.why})` : ''} -> ${j.cls}${j.why ? ` (${j.why})` : ''}`);
        } else if ((j.why ?? null) !== (w.why ?? null)) counts.reworded++;
      });
    }
    const verdict = now.failed.length ? 'FAIL' : 'pass';
    const moved = (verdict === 'pass') !== passes(recorded);
    if (moved) counts.moved++;
    out.push(`c${candidate} ${step}: recorded ${recorded}; the table judge ${verdict}${now.failed.length ? ` (${now.failed.join('; ')})` : ''}; the judge before fix 7 ${then.failed.length ? 'FAIL' : 'pass'}${moved ? '  ** VERDICT MOVED **' : ''}`);
  }
  if (steps.V3) {
    // V3: every activate_window verdict judged again as run.mjs judges it, the witness required to have observed
    const rows = gateRows(CANDIDATES[candidate], 'V3');
    const VENDORS = ['pinned', 'newest'];
    const judgeOp = (scene, op) => {
      const opRows = rows.filter((r) => r.kind === 'sample' && r.scene === scene && r.op === op && [...VENDORS, 'cua'].includes(r.engine));
      const decided = new Map(rows.filter((d) => d.kind === 'speed-decision' && d.scene === scene && d.op === op && d.candidate === 'cua').map((d) => [`${d.candidate}|${d.series}`, d]));
      const audits = Object.fromEntries(rows.filter((a) => a.kind === 'audit' && a.scene === scene && a.op === op).map((a) => {
        const sent = a.forbidden.map((f) => f.what);
        const error = typeof a.ancestry === 'string' ? a.ancestry : null;
        return [a.engine, { clean: a.clean, oks: a.oks, answered: a.answered, sent, foreign: a.foreign ?? [], observed: { traced: a.traced, watched: error === null, error } }];
      }));
      const verdict = judgeWithDecisions(opRows, { vendors: VENDORS, candidate: 'cua', audits, judgeSpeed: true, noise: medianDifferenceInterval, parity: [] }, decided);
      return { ...verdict, ...(declaredGapVerdict(verdict, { op, candidate: 'cua', rows: opRows, audits }) ?? {}) };
    };
    const verdicts = rows.filter((r) => r.kind === 'verdict').map((v) => {
      if (v.op !== 'activate_window' || v.device || v.candidate !== 'cua') return v;
      counts.v3++;
      const again = judgeOp(v.scene, v.op);
      out.push(`  c${candidate} V3 ${v.scene} ${v.op} cua: stored ${v.verdict}; the gap judge ${again.verdict}${again.reasons.length ? ` (${again.reasons.join('; ')})` : ''}`);
      return { ...v, ...again };
    });
    const samples = rows.filter((r) => r.kind === 'sample' && r.op === 'activate_window' && r.engine === 'cua');
    const unobserved = samples.filter((r) => typeof r.witness !== 'boolean' || (r.witness_fields ?? []).includes('protocol')).length;
    const outcome = runOutcome(verdicts, { valid: rows.find((r) => r.kind === 'end').valid, faults: rows.find((r) => r.kind === 'prepare-faults'), planned: plannedVerdicts(planOps(stepNamed('V3').scenes, verdictOps(stepNamed('V3'))), ['cua']) });
    const verdict = outcome.failed.length ? 'FAIL' : 'pass';
    const moved = (verdict === 'pass') !== passes(steps.V3);
    if (moved) counts.moved++;
    counts.steps++;
    out.push(`c${candidate} V3: recorded ${steps.V3}; the gap judge ${verdict}${outcome.failed.length ? ` (${outcome.failed.join('; ')})` : ''}; cua's activate_window samples the witness did not observe: ${unobserved} of ${samples.length}${moved ? '  ** VERDICT MOVED **' : ''}`);
  }
}
out.push('', `read: ${counts.steps} steps (${counts.steps - 2} settle, 2 V3), ${counts.series} settle series, ${counts.runs} settle runs, ${counts.v3} V3 activate_window verdicts; runs whose classification changed: ${counts.changed}; honest misses whose reason was only reworded: ${counts.reworded}; step verdicts moved against M4's record: ${counts.moved}`);
process.stdout.write(`${out.join('\n')}\n`);
process.exitCode = counts.moved ? 1 : 0;
