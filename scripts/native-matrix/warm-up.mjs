// The warm-up as the judge reports it (ruling 1278 (b); the run's side in ./warm-up-run.mjs): per lane, run and job,
// each step the run recorded (meta.warmUp: the typing in each text venue, the composition in each web field), whether
// its cell answered ok, and whether the harness's own write put its field back. Recorded, never judged: a step that
// failed is named for the reader and no row is judged on it. A run the warm-up stopped (a fixture it changed and could
// not put back, meta.warmUpStop) is said to be stopped; its rows are NO VERDICT on the run's own record. The first-lane
// effect the warm-up is for stays visible where it is measured (the rows; ./summary.mjs firstLaneSplitOf).
//
// Each warm-up is reported under the job that recorded it: a full run's own (meta.warmUp), a filtered rerun's that
// ./combine.mjs carried onto the full run (meta.warmUps, with its job and lane), a speed-extra cell's (its own record).
// A rerun's warm-up never stands as the base's: the base's own is named as unrecorded when it has none.
const LANES = ['vendor', 'cua'];
const SOURCES = ['full', 'rerun', 'speed-extra'];

// A step's field put back: the web fields emptied, TextEdit's document restored, by the second try when the first did
// not hold (`secondTry`). -> {done, how, why, second, first} | null: `first` the first try's code when a second was made.
function putBackOf(step) {
  const n = step.secondTry ?? step.neutral;
  if (!n) return null;
  const how = 'restored' in n ? 'restored' : 'emptied';
  return {done: n[how] === true, how, why: n.why ?? null, second: Boolean(step.secondTry), first: step.secondTry ? step.neutral?.why ?? null : null};
}
const failedCell = step => !step.skipped && step.ok !== true;
const notPutBack = step => { const p = putBackOf(step); return Boolean(p) && !p.done; };
// A composition whose keys were sent and that left Korean not held: its field's Korean rows invalid by their precondition.
const koreanLost = step => step.kind === 'composition' && step.sent === true && step.korean === false;

const jobOfMeta = meta => (meta?.runner?.run?.id ? {runId: meta.runner.run.id, attempt: meta.runner.run.attempt ?? null} : null);
const laneOf = laneOrder => (laneOrder?.position === 1 ? 'first' : laneOrder?.position === 2 ? 'second' : null);

// `full`: [{result}] of the full runs as combined; `speedExtra`: [{result}] of the speed-extra cell's records. -> {runs:
// [{engine, run, source: 'full' | 'rerun' | 'speed-extra', job: {runId, attempt} | null, lane: 'first' | 'second' |
// null, steps}], shown: [{engine, run, source, job, venue, kind}], stopped: [{engine, run, source, job, venue, why}],
// unrecorded: [{engine, run}]: the full runs with no warm-up of their own}.
export function warmUpOf(full, speedExtra = []) {
  const runs = [], stopped = [], unrecorded = [];
  const add = (engine, n, source, meta, warmUp, laneOrder, job) => {
    if (!Array.isArray(warmUp?.steps)) return false;
    runs.push({engine, run: n ?? null, source, job, lane: laneOf(laneOrder), steps: warmUp.steps});
    if (meta?.warmUpStop) stopped.push({engine, run: n ?? null, source, job, venue: meta.warmUpStop.venue ?? null, why: meta.warmUpStop.why ?? null});
    return true;
  };
  for (const {result} of full) {
    const engine = result.lanes?.[0]?.engine, meta = result.meta ?? {};
    if (!LANES.includes(engine)) continue;
    if (!add(engine, meta.run, 'full', meta, meta.warmUp, meta.laneOrder, jobOfMeta(meta))) unrecorded.push({engine, run: meta.run ?? null});
    for (const w of Array.isArray(meta.warmUps) ? meta.warmUps : []) {
      if (w?.engine === engine) add(engine, meta.run, 'rerun', null, w, w.laneOrder, {runId: w.runId ?? null, attempt: w.attempt ?? null});
    }
  }
  for (const {result} of speedExtra) {
    const engine = result.lanes?.[0]?.engine, meta = result.meta ?? {};
    if (LANES.includes(engine)) add(engine, meta.run, 'speed-extra', meta, meta.warmUp, meta.laneOrder, jobOfMeta(meta));
  }
  const order = (a, b) => (a.run ?? 0) - (b.run ?? 0) || SOURCES.indexOf(a.source) - SOURCES.indexOf(b.source)
    || String(a.job?.runId ?? '').localeCompare(String(b.job?.runId ?? '')) || String(a.job?.attempt ?? '').localeCompare(String(b.job?.attempt ?? ''))
    || LANES.indexOf(a.engine) - LANES.indexOf(b.engine);
  runs.sort(order);
  stopped.sort(order);
  unrecorded.sort((a, b) => (a.run ?? 0) - (b.run ?? 0) || LANES.indexOf(a.engine) - LANES.indexOf(b.engine));
  const shown = runs.flatMap(r => r.steps.filter(s => failedCell(s) || notPutBack(s) || koreanLost(s))
    .map(s => ({engine: r.engine, run: r.run, source: r.source, job: r.job, venue: s.venue, kind: s.kind})));
  return {runs, shown, stopped, unrecorded};
}

const jobText = (source, job) => {
  const name = source === 'full' ? 'full run' : source === 'rerun' ? 'filtered rerun' : source;
  return source !== 'full' && job?.runId ? `${name} (job ${job.runId}, attempt ${job.attempt ?? '?'})` : name;
};
const cellText = s => {
  if (s.skipped) return `skipped: ${s.skipped}`;
  const cell = s.ok === true ? `ok${Number.isFinite(s.actMs) ? `, ${s.actMs} ms` : ''}` : s.unsent ? `**unsent**: ${s.unsent}` : `**failed**${s.errorName ? ` (${s.errorName})` : ''}`;
  return s.kind === 'composition' && typeof s.composed === 'string' ? `${cell}, composed ${s.composed}` : cell;
};
const putBackText = s => {
  const p = putBackOf(s);
  const field = !p ? '-' : p.done ? `${p.how}${p.second ? ` (on the second try${p.first ? `; the first: \`${p.first}\`` : ''})` : ''}`
    : `**not ${p.how}**${p.why || p.second ? ` (${[p.why ? `\`${p.why}\`` : null, p.second ? 'on the second try too' : null].filter(Boolean).join(', ')})` : ''}`;
  if (s.kind !== 'composition' || s.sent !== true) return field;
  const source = [...(s.ended === false ? ['**the Latin source not selected**'] : []),
    s.korean === true ? `Korean again${s.retried === true ? ' on the second try' : ''}` : '**Korean not held again**: the field\'s Korean rows are invalid'];
  return [field, ...source].join('; ');
};
const cellOf = text => String(text).replace(/\|/g, '\\|');

// The section, nothing when no run recorded a warm-up. -> [line].
export function renderWarmUp(w) {
  if (!w?.runs.length) return [];
  const notes = [
    ...w.stopped.map(s => `- **Stopped**: ${s.engine} run ${s.run ?? '?'} (${jobText(s.source, s.job)}): the warm-up left ${s.venue ?? 'a venue'}'s fixture changed and the harness could not put it back (\`${s.why ?? 'other'}\`); every planned sample of that run is NO VERDICT.`),
    ...(w.shown.length ? [`- **For the reader**: ${w.shown.length} warm-up step(s) did not answer ok or did not put their field back; no row is judged on them.`] : []),
    ...(w.unrecorded.length ? [`- No warm-up recorded on the full run: ${w.unrecorded.map(u => `${u.engine} run ${u.run ?? '?'}`).join(', ')}.`] : [])];
  return ['## Warm-up (ruling 1278)', '',
    'Before its first judged row each lane typed once into each text venue its run brought up, and composed once in each web field before that field\'s first Korean row, '
      + 'each through its own engine as a harness cell; the harness\'s own Accessibility write then put the field back (the web fields emptied, TextEdit\'s document restored), '
      + 'once more when the first did not hold. Recorded, never judged: a step that failed makes no row invalid, and only a fixture the harness could not put back stops its run. '
      + 'Each warm-up is listed under the job that recorded it.', '',
    ...(notes.length ? [...notes, ''] : []),
    '| engine | run | job | lane | step | cell | field put back |', '|---|---|---|---|---|---|---|',
    ...w.runs.flatMap(r => r.steps.map(s => `| ${r.engine} | ${r.run ?? '-'} | ${cellOf(jobText(r.source, r.job))} | ${r.lane ?? '-'} | ${s.venue} ${s.kind} | ${cellOf(cellText(s))} | ${cellOf(putBackText(s))} |`)), ''];
}
