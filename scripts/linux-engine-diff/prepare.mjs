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
 * is the backstop (task 24): the lane's scene restored before the one resample (a fresh window, warmed again for a warm
 * sample), answering its record, which the failure's row carries (`scene_restore`), or false when it could not be.
 * `emit` records the failed sample once its outcome is known. Answers `{counted, stop}`: the sample to count (null when
 * invalid) and whether its series ends, which a cold sample left invalid does, since no later request on its engine is
 * warm.
 */
export async function sampleUnderRule({ cold, take, renew, restoreScene = null, emit }) {
  const first = await take();
  if (first.fault !== ORACLE) return { counted: first, stop: false };
  if (restoreScene) {
    const restored = await restoreScene({ cold });
    if (!restored) {
      emit({ ...first.row, outcome: 'invalid', why: 'the resample could not reproduce the condition: the scene could not be restored' });
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
  return { counted: second, stop: false };
}

/**
 * The scene text put back before samples' preparations (text.mjs `sceneTextBefore`), counted per lane over a run's rows
 * (`sample`, `prepare-failure` and the bus pass's `text-bus` rows carrying `text_restored`, and a candidate's
 * `text-lost`, the restore it needed and never got), every lane listed, a lane with none at 0: `{lanes, samples}`. A
 * restore never touches the caps: the sample it preceded is prepared and measured as any other.
 */
export function judgeTextRestores(rows, lanes) {
  const samples = rows
    .filter((r) => (['sample', 'prepare-failure', 'text-bus'].includes(r.kind) && r.text_restored) || r.kind === 'text-lost')
    .map((r) => ({ engine: r.engine, scene: r.scene, op: r.op, block: r.block, series: r.series, i: r.i, ...(r.kind === 'text-lost' ? { found: r.found, lost: true } : r.text_restored) }));
  const counts = Object.fromEntries(lanes.map((l) => [l, 0]));
  for (const s of samples) counts[s.engine] = (counts[s.engine] ?? 0) + 1;
  return { lanes: counts, samples };
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
