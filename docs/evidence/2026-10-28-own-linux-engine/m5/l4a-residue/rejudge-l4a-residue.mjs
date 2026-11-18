// L4a's residue (the design session's ruling 827, 3b) over the stored T17 Electron steps, read-only (the M5 pre-flight's
// §8.1, point 4: a fix to a judge alone re-judges the stored rows of the steps it reaches).
//
// Each step is judged from its own rows twice, through drop-signals-judge.mjs `dropSignalsVerdict`: by H's judge (read
// from git at `--old-rev`, unchanged from H to H‴) and by this checkout's, with the residue. The replay stands only when
// H's judge reproduces the step's stored judge verdict (`electron-drop-verdict`) exactly. The step's new result starts
// from its stored terminal outcome, never from the judge alone:
// - the run's `experiment-summary` (its `complete` and `failed`, the judge's failures and the run's own, such as a
//   window the harness did not open);
// - and the step's `step.json` (its exit, the private display's watchdog, the end check, anything left unclean).
// Only the judge failures the residue clears are taken out, and any it adds put in; every other failure stands. A step
// with no terminal outcome, or whose records disagree, keeps its stored result. Then the negative controls: a passing
// step's own records edited one way at a time, every edit failing.
//
//   node rejudge-l4a-residue.mjs --harness <checkout> [--old-rev <rev>] <label>=<step dir | git:<rev>:<step dir>>...

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv.splice(at, 2)[1] : dflt;
};
const harness = resolve(opt('--harness', '.'));
const oldRev = opt('--old-rev', 'fefe306c');
const git = (...a) => execFileSync('git', ['-C', harness, ...a], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] });

const now = await import(pathToFileURL(join(harness, 'scripts/linux-engine-diff/drop-signals-judge.mjs')).href);
const scratch = mkdtempSync(join(tmpdir(), 'l4a-residue-'));
const oldFile = join(scratch, 'drop-signals-judge.mjs');
writeFileSync(oldFile, git('show', `${oldRev}:scripts/linux-engine-diff/drop-signals-judge.mjs`));
const old = await import(pathToFileURL(oldFile).href);
rmSync(scratch, { recursive: true });

/** A step directory's file, from the filesystem or from a commit (`git:<rev>:<dir>`); null when it has none. */
function fileOf(src, name) {
  if (src.startsWith('git:')) {
    const [, rev, ...rest] = src.split(':');
    try {
      return git('show', `${rev}:${join(rest.join(':'), name)}`);
    } catch {
      return null;
    }
  }
  const p = join(src, name);
  return existsSync(p) ? readFileSync(p) : null;
}

/** A step's stored records: its results rows and its step.json. */
function stepOf(src) {
  const gz = fileOf(src, 'run/results.jsonl.gz');
  const bytes = gz ? gunzipSync(gz) : fileOf(src, 'run/results.jsonl');
  if (!bytes) throw new Error(`${src}: no run/results.jsonl`);
  const step = fileOf(src, 'step.json');
  return { rows: bytes.toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)), step: step ? JSON.parse(step.toString('utf8')) : null };
}

/**
 * What the step's own record fails beside its run, as gate.mjs sets its exit (the run's exit 0 and the private display's
 * watchdog clean): the watchdog, or an exit its run's does not explain. The end check and the unclean end are findings
 * there, never failures (gate.mjs `stepEndCheck`, `stepUnclean`), and are left as stored.
 */
function stepFailures(step) {
  const out = [];
  if ('display_watchdog' in step && step.display_watchdog !== 'clean') out.push(`the private display's watchdog: ${step.display_watchdog}`);
  else if (step.exit !== step.child_exit) out.push(`the step exited ${step.exit}, its run ${step.child_exit}`);
  return out;
}

/**
 * A step re-judged from its records: `{stored, replay, result, ...}`. `stored` is its recorded pass; `result` the pass
 * with the residue, or the stored one where the replay cannot stand (`refused`, with why).
 */
function rejudgeStep({ rows, step }) {
  const runs = [...new Set(rows.map((r) => r.run))];
  if (runs.length !== 1) return { refused: `${runs.length} runs in one results file` };
  const meta = rows.find((r) => r.kind === 'meta');
  if (meta?.experiment !== 'drop-signals') return { refused: 'not a drop-signals run' };
  const args = { families: meta.families ?? ['chrome'], plan: meta.plan ?? 'main', samplesTrials: meta.trials ?? null };
  const then = old.dropSignalsVerdict(args, rows);
  const v = now.dropSignalsVerdict(args, rows);
  const summaries = rows.filter((r) => r.kind === 'experiment-summary');
  const verdicts = rows.filter((r) => r.kind === 'electron-drop-verdict');
  const base = { meta, then, v, load: [...new Set(rows.filter((r) => r.kind === 'drop-signal').map((r) => r.load))].join(', ') };
  if (!step) return { ...base, refused: 'no step.json: the step has no terminal record' };
  const stepFails = stepFailures(step);
  const stored = step.exit === 0 && stepFails.length === 0;
  if (summaries.length !== 1) return { ...base, stored, refused: `${summaries.length} experiment-summary rows: the run has no single terminal outcome` };
  const summary = summaries[0];
  if (verdicts.length !== 1) return { ...base, stored, refused: `${verdicts.length} stored judge verdicts` };
  if (!isDeepStrictEqual(then.failed, verdicts[0].failed)) return { ...base, stored, refused: "H's judge does not reproduce the stored judge verdict" };
  if (!then.failed.every((f) => summary.failed.includes(f))) return { ...base, stored, refused: "the terminal outcome does not carry the judge's failures" };
  if (summary.complete !== (summary.failed.length === 0)) return { ...base, stored, refused: 'the terminal outcome is incomplete with no failure named' };
  if ((step.child_exit === 0) !== summary.complete) return { ...base, stored, refused: `the run exited ${step.child_exit} on a terminal outcome ${summary.complete ? 'complete' : 'incomplete'}` };
  const cleared = then.failed.filter((f) => !v.failed.includes(f));
  const added = v.failed.filter((f) => !then.failed.includes(f));
  const kept = summary.failed.filter((f) => !then.failed.includes(f));
  const failed = [...summary.failed.filter((f) => !cleared.includes(f)), ...added];
  return { ...base, stored, cleared, added, kept, stepFails, failed: [...failed, ...stepFails], result: failed.length === 0 && stepFails.length === 0 };
}

const word = (pass) => (pass ? 'pass' : 'FAIL');
const residueOf = (v) => (v.counts.residue?.length ? v.counts.residue.map((x) => `${x.lane} ${x.cell} ${x.count} of ${x.drags}, bound ${x.bound}${x.over ? ' (OVER)' : ''}`).join('; ') : 'not covered');

const judged = [];
for (const a of argv) {
  const at = a.indexOf('=');
  const [label, src] = [a.slice(0, at), a.slice(at + 1)];
  const records = stepOf(src);
  const j = rejudgeStep(records);
  judged.push({ label, records, j });
  console.log(`## ${label}`);
  console.log(`source: ${src}`);
  if (j.meta) console.log(`run ${j.meta.run}, plan ${j.meta.plan}, load ${j.load}, trials ${j.meta.trials ?? 'the plan whole'}; checkout ${records.step?.checkout?.commit?.slice(0, 8) ?? '?'}; step exit ${records.step?.exit ?? '?'}`);
  if (j.refused) {
    console.log(`REPLAY REFUSED: ${j.refused}; the step keeps its stored result${j.stored === undefined ? '' : ` (${word(j.stored)})`}`);
  } else {
    console.log(`stored: ${word(j.stored)} (H's judge reproduces the stored verdict: ${word(!j.then.failed.length)}); with the residue: ${word(j.result)}; ${j.stored === j.result ? 'result unchanged' : 'RESULT MOVED'}`);
    console.log(`residue: ${residueOf(j.v)}`);
    if (j.cleared.length) console.log(`judge failures the residue cleared: ${j.cleared.join(' | ')}`);
    if (j.added.length) console.log(`judge failures the residue added: ${j.added.join(' | ')}`);
    if (j.kept.length || j.stepFails.length) console.log(`other failures, kept: ${[...j.kept, ...j.stepFails].join(' | ')}`);
    if (j.failed.length) console.log(`failures that stand: ${j.failed.join(' | ')}`);
  }
  console.log('');
}

// ---- negative controls: a step the residue passes, its records edited one way at a time; every edit must fail
const base = judged.find(({ j }) => j.result === true && j.v.counts.residue?.some((x) => x.count > 0));
if (!base) {
  console.log('negative controls: no step passes with a residue, none run');
} else {
  const cell = base.j.v.counts.residue.find((x) => x.count > 0);
  const inCell = (r) => r.kind === 'drop-signal' && r.lane === cell.lane && r.cell === cell.cell;
  const residual = (r) => inCell(r) && !r.outcome?.landed;
  const clone = () => structuredClone(base.records);
  // a row edit's records made whole again as H's judge would have recorded those rows: its stored verdict, the
  // terminal outcome's judge failures (every other failure kept), and the exits; so the replay stands and the residue's
  // own judgement of the edit is what is tested
  const rerecord = (rec) => {
    const meta = rec.rows.find((r) => r.kind === 'meta');
    const then = old.dropSignalsVerdict({ families: meta.families, plan: meta.plan, samplesTrials: meta.trials ?? null }, rec.rows);
    const stored = rec.rows.find((r) => r.kind === 'electron-drop-verdict');
    const summary = rec.rows.find((r) => r.kind === 'experiment-summary');
    summary.failed = [...summary.failed.filter((f) => !stored.failed.includes(f)), ...then.failed];
    summary.complete = summary.failed.length === 0;
    Object.assign(stored, { pass: then.failed.length === 0, failed: then.failed });
    rec.step.child_exit = summary.complete ? 0 : 1;
    rec.step.exit = rec.step.child_exit;
    return rec;
  };
  const rowEdit = (edit) => () => {
    const rec = clone();
    edit(rec.rows);
    return rerecord(rec);
  };
  const onResidue = (edit) => rowEdit((rows) => {
    for (const r of rows) if (residual(r)) edit(r);
  });
  const onSummary = (edit) => () => {
    const rec = clone();
    edit(rec.rows.find((r) => r.kind === 'experiment-summary'));
    return rec;
  };
  const controls = [
    [`one more honest non-landing than the bound (${cell.bound + 1 - cell.count} landed drops made the residue's shape)`, rowEdit((rows) => {
      const model = rows.find(residual);
      for (const r of rows.filter((x) => inCell(x) && x.outcome?.landed).slice(0, cell.bound + 1 - cell.count)) Object.assign(r, structuredClone({ ok: model.ok, notice: model.notice, next: model.next, outcome: model.outcome, before: model.before, after: model.after }));
    })],
    ['the residue row answered ok, its notice and refusal removed: a false ok', onResidue((r) => Object.assign(r, { notice: null, next: { ok: true, error: null, late_dnd: null } }))],
    ["the residue row's notice not kept by the next acting request", onResidue((r) => Object.assign(r, { next: { ok: true, error: null, late_dnd: null } }))],
    ['the residue row answered an error, its notice kept', onResidue((r) => Object.assign(r, { ok: false, error: 'drag_handle move_to failed' }))],
    ["the residue row's dragend record missing", onResidue((r) => { r.after.last = null; })],
    ["the residue row's dragend an earlier press's (stale)", onResidue((r) => { r.after.last.seq = r.before.press.seq; })],
    ["the residue row's dragend another source's (foreign)", onResidue((r) => { r.after.last.src = 'inzone'; })],
    ["the residue row's dragend a drop", onResidue((r) => { r.after.last.effect = 1; })],
    ["the residue row's zone counters unread", onResidue((r) => { r.after.dnd = {}; })],
    ['the same rows at idle', rowEdit((rows) => {
      for (const r of rows) if (r.kind === 'drop-signal') r.load = 'idle';
    })],
    ['the same rows under another judged plan at twice the load (t17-fix2)', rowEdit((rows) => {
      for (const r of rows) if (['meta', 'drop-signal-scene'].includes(r.kind)) r.plan = 't17-fix2';
    })],
    ['a false ok added in the same series (another landed drop answered ok, nothing dropped)', rowEdit((rows) => {
      const r = rows.find((x) => inCell(x) && x.outcome?.landed && x.ok === true && !x.notice);
      Object.assign(r, { outcome: { ...r.outcome, landed: false }, after: { ...r.after, last: { ...r.after.last, effect: 0 } } });
    })],
    ['a failure of the run outside this judge kept in its terminal outcome (a window the harness did not open)', onSummary((s) => {
      s.failed.push('a window the harness did not open was changed: 0x1 (control)');
    })],
    ["the private display's watchdog not clean", () => {
      const rec = clone();
      rec.step.display_watchdog = 'flagged (control)';
      return rec;
    }],
  ];
  // the replay's own guards: each edit must refuse the replay, so the step keeps its stored result
  const refusals = [
    ['no terminal outcome stored', () => {
      const rec = clone();
      rec.rows = rec.rows.filter((r) => r.kind !== 'experiment-summary');
      return rec;
    }],
    ['no step.json', () => ({ ...clone(), step: null })],
    ["a stored judge verdict H's judge does not reproduce", () => {
      const rec = clone();
      rec.rows.find((r) => r.kind === 'electron-drop-verdict').failed.push('a failure H did not record (control)');
      return rec;
    }],
    ["a terminal outcome without the judge's failures", () => {
      const rec = clone();
      const s = rec.rows.find((r) => r.kind === 'experiment-summary');
      s.failed = [];
      return rec;
    }],
    ['a run exit its terminal outcome does not explain', () => {
      const rec = clone();
      rec.step.child_exit = 0;
      rec.step.exit = 0;
      return rec;
    }],
  ];
  console.log(`## negative controls on ${base.label} (${cell.lane} ${cell.cell}: ${cell.count} of ${cell.drags}, bound ${cell.bound})`);
  let held = 0;
  for (const [name, edit] of controls) {
    const j = rejudgeStep(edit());
    const ok = !j.refused && j.result === false;
    held += ok ? 1 : 0;
    console.log(`- ${name}: ${ok ? `FAIL, as it must (${j.failed.join(' | ')})` : `NOT FAILED BY THE RESIDUE'S JUDGEMENT (${j.refused ? `replay refused: ${j.refused}` : 'passed'})`}`);
  }
  for (const [name, edit] of refusals) {
    const j = rejudgeStep(edit());
    const ok = Boolean(j.refused);
    held += ok ? 1 : 0;
    console.log(`- ${name}: ${ok ? `replay refused, as it must (${j.refused}); the step keeps its stored result` : 'THE REPLAY STOOD'}`);
  }
  controls.push(...refusals);
  console.log(`controls: ${held} of ${controls.length} failed`);
  if (held !== controls.length) process.exitCode = 1;
}
