// The gate's rule for a sample whose harness-side preparation fails (#171, Decision Log 2026-11-01, the design
// session, declared before M3's gate rerun), in every case alike:
// - every preparation attempt records the step that failed: the harness oracle's (its own reads and writes of the
//   accessibility bus, `oracle.mjs`) or the engine's request (a Copy, a paste, any engine command);
// - a sample whose preparation failed at a harness oracle's step is resampled once in its own condition: a cold sample
//   on a fresh engine (the gate's own definition of cold: the first request of a fresh engine process), a warm one on
//   its engine; a resample that fails at the oracle again, or that cannot reproduce the condition, leaves the sample
//   invalid, never replaced;
// - a failure at the engine's request is never resampled: it fails the verdict as before (stats.mjs `judgeOperation`);
// - invalid and resampled samples are counted per case and for the run: more than 2, or 1% of a case's samples if that
//   is larger, fails the run, and so does more than 1% of all the run's samples.

/** The harness oracle's step: its own accessibility-bus reads and writes (a selection the window refuses). */
export const ORACLE = 'oracle';
/** The engine's request: a request of the engine under measurement, cua's or a vendor build's. */
export const ENGINE = 'engine';

/** A preparation that failed at `step`, with every attempt's record (`{step, error}`). */
export class PrepareStepError extends Error {
  constructor(step, message, attempts = []) {
    super(message);
    this.step = step;
    this.attempts = attempts;
  }
}

/** The record of a sample whose preparation failed at the harness oracle: no request was sent, so it is no sample. */
export function prepareFailureRow(s, error) {
  return {
    kind: 'prepare-failure',
    engine: s.label,
    scene: s.sceneName,
    op: s.op,
    block: s.block,
    series: s.i === 0 ? 'cold' : 'warm',
    i: s.i,
    step: error.step,
    error: error.message,
    attempts: error.attempts,
  };
}

/**
 * One sample under the rule. `take()` runs it and answers `{row, response, fault}`, `fault` ORACLE when its
 * preparation failed at the harness oracle (`row` then the failure's record) and null otherwise (an engine's failure
 * included); `renew()` gives a cold sample's resample a fresh engine and answers whether it could. `restoreScene({cold})`
 * is the backstop (task 24): the lane's scene restored before the one resample (a fresh window, and for a warm sample
 * the operation run once on it, as the series' samples ran it), answering its record, which the failure's row and the
 * counted resample carry (`scene_restore`); false, or a record with `invalid`, when the condition could not be
 * reproduced, which leaves the sample invalid.
 * `emit` records the failed sample once its outcome is known. Answers `{counted, stop}`: the sample to count (null when
 * invalid) and whether its series ends, which a cold sample left invalid does, since no later request on its engine is
 * warm.
 */
export async function sampleUnderRule({ cold, take, renew, restoreScene = null, emit }) {
  const first = await take();
  if (first.fault !== ORACLE) return { counted: first, stop: false };
  if (restoreScene) {
    const restored = await restoreScene({ cold });
    if (!restored || restored.invalid) {
      emit({ ...first.row, outcome: 'invalid', ...(restored ? { scene_restore: restored } : {}), why: `the resample could not reproduce the condition: ${restored?.invalid ?? 'the scene could not be restored'}` });
      return { counted: null, stop: cold };
    }
    first.row = { ...first.row, scene_restore: restored };
  }
  if (cold && !(await renew())) {
    emit({ ...first.row, outcome: 'invalid', why: 'the resample could not reproduce the cold condition: no fresh engine' });
    return { counted: null, stop: true };
  }
  const second = await take();
  if (second.fault === ORACLE) {
    emit({ ...first.row, outcome: 'invalid', resample: { step: second.row.step, error: second.row.error, attempts: second.row.attempts } });
    return { counted: null, stop: cold };
  }
  emit({ ...first.row, outcome: 'resampled' });
  second.row.resampled = true;
  if (first.row.scene_restore) second.row.scene_restore = first.row.scene_restore;
  return { counted: second, stop: false };
}

/**
 * The scene text put back before preparations (text.mjs `sceneTextBefore`), counted per lane over a run's rows, every
 * lane listed, a lane with none at 0: `{lanes, samples}`. Every restore counts wherever it was made: a sample's, a failed
 * preparation's and the bus pass's (`text_restored`), the backstop's warm-up's (`scene_restore.warm_up.text_restored`,
 * marked `warm_up`), the audit's (its row's `text_restores`, block `audit`), and a candidate's `text-lost`, the restore
 * it needed and never got. Counting adds no sample: a restore never touches the caps or the medians.
 */
export function judgeTextRestores(rows, lanes) {
  const at = (r, extra = {}) => ({ engine: r.engine, scene: r.scene, op: r.op, block: r.block, series: r.series, i: r.i, ...extra });
  const samples = rows.flatMap((r) => {
    if (r.kind === 'text-lost') return [at(r, { found: r.found, lost: true })];
    if (r.kind === 'audit') return (r.text_restores ?? []).map(({ i, ...record }) => at({ ...r, block: 'audit', i }, record));
    if (!['sample', 'prepare-failure', 'text-bus'].includes(r.kind)) return [];
    const own = r.text_restored ? [at(r, r.text_restored)] : [];
    const warm = r.kind === 'prepare-failure' && r.scene_restore?.warm_up?.text_restored ? [at(r, { ...r.scene_restore.warm_up.text_restored, warm_up: true })] : [];
    return [...own, ...warm];
  });
  const counts = Object.fromEntries(lanes.map((l) => [l, 0]));
  for (const s of samples) counts[s.engine] = (counts[s.engine] ?? 0) + 1;
  return { lanes: counts, samples };
}

/**
 * The backstop's warm-ups judged (task 24, fix round 1): a candidate's warm-up is its own request on the fresh window, so
 * an answer that failed fails the run with the engine's own error text, and a witness that saw a change fails it as any
 * candidate's would; the harness-fault allowance covers only the oracle's own steps. A vendor build's warm-up is
 * recorded and judged nothing: its warm samples follow its own answers too. `{pass, reasons}`.
 */
export function judgeWarmUps(rows, vendors) {
  const reasons = [];
  for (const r of rows) {
    const w = r.kind === 'prepare-failure' ? r.scene_restore?.warm_up : null;
    if (!w || w.refused || vendors.includes(r.engine)) continue;
    const at = `${r.scene} ${r.op} ${r.engine} ${r.block}/${r.i}`;
    if (w.ok !== true) reasons.push(`${at}: the backstop's warm-up failed: ${w.error ?? 'no answer'}`);
    if (w.witness === false) reasons.push(`${at}: the backstop's warm-up changed the desktop (${(w.witness_fields ?? []).join(', ')})`);
  }
  return { pass: reasons.length === 0, reasons };
}

/** A case's cap: more than 2 resampled or invalid samples, or 1% of its samples if that is larger, fails the run. */
const caseLimit = (samples) => Math.max(2, samples / 100);

/**
 * The rule's counts over a run's rows (`sample` and `prepare-failure`): per case (scene and operation, every engine's
 * samples), the samples taken (counted ones plus invalid ones), how many were resampled and how many left invalid, and
 * the same for the whole run (`total`, never `run`: a results row's `run` names its run), each against its cap. `cases`
 * lists only the cases with a failure. Answers `{cases, total, pass, reasons}`.
 */
export function judgePrepareFaults(rows) {
  const byCase = new Map();
  const at = (r) => {
    const key = `${r.scene}|${r.op}`;
    if (!byCase.has(key)) byCase.set(key, { scene: r.scene, op: r.op, samples: 0, resampled: 0, invalid: 0 });
    return byCase.get(key);
  };
  for (const r of rows) {
    if (r.kind === 'sample') at(r).samples += 1;
    if (r.kind === 'prepare-failure' && r.outcome === 'resampled') at(r).resampled += 1;
    if (r.kind === 'prepare-failure' && r.outcome === 'invalid') {
      at(r).samples += 1;
      at(r).invalid += 1;
    }
  }
  const all = [...byCase.values()];
  const reasons = [];
  const cases = all
    .filter((c) => c.resampled + c.invalid > 0)
    .map((c) => {
      const limit = caseLimit(c.samples);
      const over = c.resampled + c.invalid > limit;
      if (over) reasons.push(`${c.scene} ${c.op}: ${c.resampled + c.invalid} of ${c.samples} samples resampled or invalid (${c.resampled} resampled, ${c.invalid} invalid), more than the case's cap of ${limit}`);
      return { ...c, limit, over };
    });
  const sum = (key) => all.reduce((n, c) => n + c[key], 0);
  const total = { samples: sum('samples'), resampled: sum('resampled'), invalid: sum('invalid') };
  total.limit = total.samples / 100;
  total.over = total.resampled + total.invalid > total.limit;
  if (total.over) reasons.push(`the run: ${total.resampled + total.invalid} of ${total.samples} samples resampled or invalid (${total.resampled} resampled, ${total.invalid} invalid), more than 1% of the run's samples (${total.limit})`);
  return { cases, total, pass: reasons.length === 0, reasons };
}
