// Medians, block rotation and the per-operation verdict of the differential harness (Design, Verification system).

export function median(values) {
  const xs = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/**
 * A run's outcome from its verdict rows (Interfaces: exit 0 only when the negative check held and every verdict
 * passes, exploratory variants included; their rows stay in the evidence either way). `valid` is the negative
 * check's alone, kept apart from `pass`. A declared parity verdict (deviations.mjs `PARITY`) is listed in `parity`:
 * neither a failure nor a pass.
 */
export function runOutcome(verdicts, { valid }) {
  const name = (v) => `${v.scene} ${v.op} ${v.candidate}`;
  const judged = verdicts.filter((v) => v.kind === 'verdict');
  const parity = judged.filter((v) => !v.pass && v.verdict === 'parity').map(name);
  // a declared refusal (deviations.mjs REFUSALS) is a recorded loss: listed apart, never a pass, not a failure
  const refused = judged.filter((v) => !v.pass && v.verdict === 'declared refusal').map(name);
  const failed = judged.filter((v) => !v.pass && !['parity', 'declared refusal'].includes(v.verdict)).map(name);
  const pass = failed.length === 0;
  return { valid, pass, failed, parity, refused, code: valid && pass ? 0 : 1 };
}

/** A run's verdicts in one line: its failures, else every verdict PASS; a parity verdict listed apart either way. */
export function verdictLine({ pass, failed, parity = [], refused = [] }, strong = (s) => s) {
  const listed = `${parity.length ? `; ${strong('parity')} (declared, not a pass): ${parity.join(', ')}` : ''}${refused.length ? `; ${strong('declared refusal')} (a loss, not a pass): ${refused.join(', ')}` : ''}`;
  if (!pass) return `${strong('FAIL')}: ${failed.join(', ')}${listed}`;
  return `${parity.length || refused.length ? 'no verdict FAIL' : 'every verdict PASS'}${listed}`;
}

/** The engine order of block `index`: rotated, so every engine takes every position across the sitting. */
export function blockOrder(engines, index) {
  const k = ((index % engines.length) + engines.length) % engines.length;
  return [...engines.slice(k), ...engines.slice(0, k)];
}

/** M0's constant: cua's accessibility-bus calls on a tree read may exceed the vendor's by at most this many. */
export const CALL_SLACK = 256;

/**
 * The bus-call bound for one tree read (Design, Observation; Acceptance 4): in the cold and the warm count pass alike,
 * the candidate's calls at most the fewest of the vendor builds' plus `CALL_SLACK`. A pass with no successful count from
 * the candidate, or none from any vendor build, fails: an unmeasured bound is not a kept one.
 */
export function judgeCalls(countRows, { vendors, candidate, slack = CALL_SLACK }) {
  const reasons = [];
  const counted = (engine, pass) => countRows.find((r) => r.engine === engine && r.pass === pass);
  for (const pass of ['cold', 'warm']) {
    const mine = counted(candidate, pass);
    const theirs = vendors.map((v) => counted(v, pass)).filter((r) => r?.ok === true && Number.isFinite(r.calls));
    if (!mine) reasons.push(`${candidate}: the ${pass} bus-call count did not run`);
    else if (mine.ok !== true || !Number.isFinite(mine.calls)) reasons.push(`${candidate}: the ${pass} bus-call count failed`);
    if (theirs.length === 0) reasons.push(`no vendor build's ${pass} bus-call count to bound ${candidate}'s by`);
    if (mine?.ok === true && Number.isFinite(mine.calls) && theirs.length) {
      const bound = Math.min(...theirs.map((r) => r.calls)) + slack;
      if (mine.calls > bound) reasons.push(`${candidate}: ${pass} bus calls ${mine.calls} > the bound ${bound} (the vendor's plus ${slack})`);
    }
  }
  return { pass: reasons.length === 0, reasons };
}

const round = (v) => (v === null ? null : Math.round(v * 10) / 10);

/**
 * The times of one engine's samples of a series as the medians count them. A sample whose preparation failed
 * (`prepare_error`: a handle no engine issued sent in place of the one its Copy could not make) timed another request
 * than the operation's, so it is left out. The answered requests are timed; a request every sample answers with an
 * error (a refusal the vendor gives too) is timed as it is answered.
 */
export function timedMs(series) {
  const prepared = series.filter((r) => !r.prepare_error);
  return (prepared.some((r) => r.ok) ? prepared.filter((r) => r.ok) : prepared).map((r) => r.ms).filter(Number.isFinite);
}

/** One engine's samples summarized: medians per series, and whether every sample held each property. */
export function summarizeEngine(rows) {
  const all = (key) => {
    const known = rows.filter((r) => typeof r[key] === 'boolean');
    return known.length === 0 ? null : known.every((r) => r[key]);
  };
  const cold = rows.filter((r) => r.series === 'cold');
  const warm = rows.filter((r) => r.series === 'warm');
  const timed = timedMs;
  return {
    cold: round(median(timed(cold))),
    warm: round(median(timed(warm))),
    // the verdict compares these: a loss under the shown tenth of a millisecond is still a loss
    exact: { cold: median(timed(cold)), warm: median(timed(warm)) },
    n_cold: cold.length,
    n_warm: warm.length,
    ok: rows.length > 0 && rows.every((r) => r.ok),
    any_ok: rows.some((r) => r.ok),
    witness: all('witness'),
    effect: all('effect'),
    equal: all('equal'),
    clipboard: all('clipboard_kept'),
  };
}

/**
 * The candidate's samples whose effect was not verified (Design, Verification system; Decision Log, M1a.4: cua's
 * effect is judged absolutely). An operation reads effects when any of its samples, any engine's, has one; then every
 * candidate sample that was answered must show its effect, whatever the vendor builds did on that sample: a miss
 * (`false`), or an effect not read (`null`, absent). An operation whose definition requires an effect
 * (`effect_required`, every text operation but the one with none to read, M2 whole-branch review) reads it on every
 * sample, readable or not. Returns the samples as `block/i` labels.
 */
export function missedEffects(rows, candidate) {
  if (!rows.some((r) => typeof r.effect === 'boolean' || r.effect_required)) return [];
  return rows.filter((r) => r.engine === candidate && r.ok && r.effect !== true).map((r, k) => `${r.block ?? 0}/${r.i ?? k}`);
}

/**
 * One engine's audit of an operation: `clean` only when the trace held no forbidden request and its audited requests
 * (`oks`, one per sample) answered as the engine's timed samples did; an operation that failed early under the proxy
 * leaves only its setup in the trace, which proves nothing. An expected refusal is refused in both passes.
 */
export function auditVerdict(audit, timedRows) {
  if (!audit) return 'did not run';
  if (!audit.clean) return 'found a forbidden request';
  const timed = new Set(timedRows.map((r) => r.ok));
  if (!audit.oks?.length || !audit.oks.every((ok) => timed.has(ok))) return 'did not answer as the timed pass, so it did not exercise the operation';
  return 'clean';
}

/** The samples a side a series needs before Acceptance 3's noise rule may judge it (Acceptance 3). */
export const MIN_NOISE_SAMPLES = 20;

/**
 * Acceptance 3's bound on a noise pass: the bootstrap interval's upper end, the worst plausible loss, at most 5% of the
 * bar (below anything an agent loop notices above about 20 ms) or 1 ms (below the MCP round trip), whichever is larger.
 */
export const noiseBound = (bar) => Math.max(0.05 * bar, 1);

/**
 * A passing series' label (Acceptance 3, spec 948c30d4), always shown with its interval: `faster` when the interval
 * lies wholly below 0, `within the bound` when it lies wholly above 0 (a small measured loss inside the bound, never
 * called noise), `same (within noise)` when it includes 0.
 */
export function speedLabel(interval) {
  if (interval[1] < 0) return 'faster';
  if (interval[0] > 0) return 'within the bound';
  return 'same (within noise)';
}

/**
 * A series judged by its bootstrap interval of cua's median minus the bar build's, whichever way the medians point
 * (Acceptance 3's interval guard): `same` when its upper end, the worst plausible loss, is within `noiseBound`; `loss`
 * when it lies above 0 and reaches past the bound; `wide` otherwise (undetermined: more samples, else a failure).
 */
export function noiseVerdict(interval, bar) {
  if (interval[1] <= noiseBound(bar)) return 'same';
  return interval[0] > 0 ? 'loss' : 'wide';
}

/**
 * The verdict for one operation and scene: the candidate's speed judged against the bar (the faster vendor build,
 * cold against cold, warm against warm), every request answered, its output equal, its witness clean wherever a
 * vendor build's is, and its effect verified on every sample (`missedEffects`).
 *
 * `text` (M2's text and clipboard commands): the bar is built from the vendor samples that succeeded (the union of what
 * either build succeeds at; a build that only failed sets no bar, and with none there is no speed judgement), every
 * candidate request must answer success, and the clipboard is judged on every candidate sample that records it. A
 * candidate sample whose preparation failed (`prepare_error`) fails the verdict; no engine's such sample is timed.
 *
 * The speed (Acceptance 3, revised by the design session at M3.1): a series is judged only when the candidate and the
 * bar build each have `MIN_NOISE_SAMPLES` samples, and only through the interval guard, whichever way the medians
 * point: the bootstrap 95% interval (`noise`) of the candidate's median minus the bar build's passes when its upper end
 * is within `noiseBound` (listed in `labels` as `faster`, `same (within noise)` (also `noise`) or `within the bound`,
 * `speedLabel`), is a loss when it
 * lies above 0, and is otherwise undetermined. A series with fewer samples is undetermined too, never judged on its
 * medians. An undetermined series is listed in `undetermined` (`{series, samples, interval}`) for the run to top up;
 * as a verdict it fails. A series `parity` declares (deviations.mjs `PARITY`) whose interval does not pass and whose
 * median lies within the bar build's own spread of samples is parity: the verdict is then `parity`, neither a pass nor
 * a failure (an open interval still lists it in `undetermined`, flagged `parity`, so the run samples it on). With `judgeSpeed` false (through the vendor client) the speed is recorded, not judged.
 * Every judged series' interval is kept in `intervals`. Returns `{engines, bar, speed, noise, parity, undetermined,
 * intervals, labels, pass, verdict, reasons}`.
 */
export function judgeOperation(rows, { vendors, candidate, audits = null, judgeSpeed = true, text = false, noise: interval = null, parity: parityList = [] }) {
  const engines = {};
  for (const label of new Set(rows.map((r) => r.engine))) {
    engines[label] = summarizeEngine(rows.filter((r) => r.engine === label));
  }
  const vendorRows = vendors.map((v) => engines[v]).filter(Boolean);
  // the speed bar's samples: with `text`, a vendor build's successes only
  const barRowsOf = (v) => rows.filter((r) => r.engine === v && (!text || r.ok));
  const barEngines = vendors.map(barRowsOf).filter((x) => x.length).map(summarizeEngine);
  const best = (series, exact = false) => {
    const values = barEngines.map((e) => (exact ? e.exact[series] : e[series])).filter((v) => v !== null);
    return values.length ? Math.min(...values) : null;
  };
  const bar = { cold: best('cold'), warm: best('warm') };
  const exactBar = { cold: best('cold', true), warm: best('warm', true) };
  const c = engines[candidate];
  const reasons = [];
  if (!c) return { engines, bar, speed: false, noise: [], parity: [], undetermined: [], intervals: [], labels: [], pass: false, verdict: 'fail', reasons: [`no samples from ${candidate}`] };
  // a failed request fails the verdict where a vendor build answered every request; where the vendors' answers are
  // errors too, the answers are compared (`equal`)
  if (!c.ok && (text || vendorRows.length === 0 || vendorRows.some((e) => e.ok))) reasons.push(`${candidate}: a request failed`);
  const unprepared = rows.filter((r) => r.engine === candidate && r.prepare_error);
  if (unprepared.length) reasons.push(`${candidate}: ${unprepared.length} sample${unprepared.length === 1 ? "'s" : "s'"} preparation failed (${unprepared[0].prepare_error})`);
  let speed = true;
  const noise = [];
  const parity = [];
  const undetermined = [];
  // every judged series' interval, kept in the verdict so a run can be judged again offline under another reading
  const intervals = [];
  // every passing series with its label (`speedLabel`)
  const labels = [];
  const timedOf = (engine, series) => timedMs(rows.filter((r) => r.engine === engine && r.series === series));
  const barTimes = (v, series) => timedMs(barRowsOf(v).filter((r) => r.series === series));
  const shown = (v) => Math.round(v * 100) / 100;
  for (const series of ['cold', 'warm']) {
    if (exactBar[series] === null || c.exact[series] === null) continue;
    // the build that set the bar, and its samples as the bar counts them (a text command's: its successes)
    const barEngine = vendors.find((v) => {
      const xs = barTimes(v, series);
      return xs.length > 0 && median(xs) === exactBar[series];
    });
    const theirs = barEngine ? barTimes(barEngine, series) : [];
    const mine = timedOf(candidate, series);
    const samples = Math.min(mine.length, theirs.length);
    const against = `${shown(c.exact[series])} ms against the bar ${shown(exactBar[series])} ms`;
    if (samples < MIN_NOISE_SAMPLES || !interval) {
      undetermined.push({ series, samples, against: barEngine ?? null, interval: null });
      speed = false;
      if (judgeSpeed) reasons.push(`${candidate}: ${series} ${against}, undetermined: ${samples} samples a side, fewer than ${MIN_NOISE_SAMPLES}; not judged on medians`);
      continue;
    }
    // Acceptance 3: the bootstrap 95% interval of the candidate's median minus the bar build's
    const ci = interval(mine, theirs);
    const bound = noiseBound(exactBar[series]);
    intervals.push({ series, samples, against: barEngine, candidate: c.exact[series], bar: exactBar[series], interval: ci, bound });
    if (ci[1] <= bound) {
      const label = speedLabel(ci);
      intervals.at(-1).label = label;
      labels.push({ series, label, candidate: c.exact[series], bar: exactBar[series], against: barEngine, interval: ci, bound });
      if (label === 'same (within noise)') noise.push({ series, candidate: c.exact[series], bar: exactBar[series], against: barEngine, interval: ci });
      continue;
    }
    const wide = ci[0] <= 0;
    let loss = wide
      ? `${candidate}: ${series} ${against}, undetermined: the interval [${ci.join(', ')}] reaches past ${shown(bound)} ms`
      : `${candidate}: ${series} ${shown(c.exact[series])} ms > bar ${shown(exactBar[series])} ms, the interval [${ci.join(', ')}] above 0`;
    const declared = parityList.find((p) => p.series === series);
    if (declared && theirs.length) {
      const range = [Math.min(...theirs), Math.max(...theirs)];
      if (c.exact[series] >= range[0] && c.exact[series] <= range[1]) {
        parity.push({ series, candidate: c.exact[series], bar: exactBar[series], against: barEngine, spread: range, section: declared.section });
        // still sampled on while its interval is open: parity is where it rests at 40 a side
        if (wide) undetermined.push({ series, samples, against: barEngine, interval: ci, parity: true });
        continue;
      }
      loss += `, outside the bar's spread [${range.join(', ')}]`;
    }
    if (wide) undetermined.push({ series, samples, against: barEngine, interval: ci });
    speed = false;
    // through the vendor JavaScript a request's time includes the client's deferred settle after the previous
    // action, which the harness's own reads between requests use up unevenly: recorded, judged over the wire only
    if (judgeSpeed) reasons.push(loss);
  }
  // a text command's witness is judged whatever the vendor builds did (by the route each request took, run.mjs)
  if ((text || vendorRows.some((e) => e.witness === true)) && c.witness !== true) reasons.push(`${candidate}: the witness changed`);
  // the X request audit (audits: engine -> {clean, oks}), required wherever a vendor build's witness or audit is clean
  if (audits) {
    const verdictOf = (engine) => auditVerdict(audits[engine], rows.filter((r) => r.engine === engine));
    const required = vendorRows.some((e) => e.witness === true) || vendors.some((v) => verdictOf(v) === 'clean');
    const mine = verdictOf(candidate);
    if (required && mine !== 'clean') reasons.push(`${candidate}: the audit ${mine}`);
  }
  const missed = missedEffects(rows, candidate);
  if (missed.length) reasons.push(`${candidate}: the effect was not verified on ${missed.length} sample${missed.length === 1 ? '' : 's'} (${missed.slice(0, 5).join(', ')})`);
  if (c.equal === false) reasons.push(`${candidate}: the output differs from the vendor's`);
  if (text && c.clipboard === false) reasons.push(`${candidate}: the clipboard was not left as it was before the paste`);
  const verdict = reasons.length ? 'fail' : parity.length ? 'parity' : 'pass';
  return { engines, bar, speed, noise, parity, undetermined: judgeSpeed ? undetermined : [], intervals, labels, pass: verdict === 'pass', verdict, reasons };
}
