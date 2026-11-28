// The warm-up as the judge reports it (ruling 1278 (b); the run's side in ./warm-up-run.mjs): per lane and run, each
// step the run recorded (meta.warmUp: the typing in each text venue, the composition in each web field), whether its cell
// answered ok, and whether the harness's own write put its field back. Recorded, never judged: a step that failed or a
// field not put back is named for the reader and stops nothing, and no row is judged on it. The first-lane effect the
// warm-up is for stays visible where it is measured (the rows; ./summary.mjs firstLaneSplitOf).
const LANES = ['vendor', 'cua'];

// A step's field put back: the web fields emptied, TextEdit's document restored. -> {done, how, reason} | null.
function putBackOf(step) {
  const n = step.neutral;
  if (!n) return null;
  const how = 'restored' in n ? 'restored' : 'emptied';
  return {done: n[how] === true, how, reason: n.reason ?? n.refused ?? null};
}
const failedCell = step => !step.skipped && step.ok !== true;
const notPutBack = step => { const p = putBackOf(step); return Boolean(p) && !p.done; };

// `full`: [{result}] of the full runs. -> {runs: [{engine, run, lane: 'first' | 'second' | null, steps}], shown: [{engine,
// run, venue, kind}], unrecorded: [{engine, run}]}.
export function warmUpOf(full) {
  const runs = [], unrecorded = [];
  for (const {result} of full) {
    const engine = result.lanes?.[0]?.engine, n = result.meta?.run;
    if (!LANES.includes(engine)) continue;
    const position = result.meta?.laneOrder?.position;
    const steps = result.meta?.warmUp?.steps;
    if (!Array.isArray(steps)) { unrecorded.push({engine, run: n ?? null}); continue; }
    runs.push({engine, run: n ?? null, lane: position === 1 ? 'first' : position === 2 ? 'second' : null, steps});
  }
  const order = (a, b) => (a.run ?? 0) - (b.run ?? 0) || LANES.indexOf(a.engine) - LANES.indexOf(b.engine);
  runs.sort(order);
  unrecorded.sort(order);
  const shown = runs.flatMap(r => r.steps.filter(s => failedCell(s) || notPutBack(s)).map(s => ({engine: r.engine, run: r.run, venue: s.venue, kind: s.kind})));
  return {runs, shown, unrecorded};
}

const cellText = s => (s.skipped ? `skipped: ${s.skipped}` : s.ok === true ? `ok${Number.isFinite(s.actMs) ? `, ${s.actMs} ms` : ''}`
  : s.unsent ? `**unsent**: ${s.unsent}` : `**failed**${s.errorName ? ` (${s.errorName})` : ''}`);
const putBackText = s => {
  const p = putBackOf(s);
  if (!p) return '-';
  return p.done ? p.how : `**not ${p.how}**${p.reason ? `: ${p.reason}` : ''}`;
};
const cellOf = text => String(text).replace(/\|/g, '\\|');

// The section, nothing when no run recorded a warm-up. -> [line].
export function renderWarmUp(w) {
  if (!w?.runs.length) return [];
  return ['## Warm-up (ruling 1278)', '',
    'Before its first judged row each lane typed once into each text venue its run brought up, and composed once in each web field before that field\'s first Korean row, '
      + 'each through its own engine as a harness cell; the harness\'s own Accessibility write then put the field back (the web fields emptied, TextEdit\'s document restored). '
      + 'Recorded, never judged: a step that failed stops nothing and makes no row invalid.', '',
    ...(w.shown.length ? [`- **For the reader**: ${w.shown.length} warm-up step(s) did not answer ok or did not put their field back; they stopped nothing and made no row invalid.`] : []),
    ...(w.unrecorded.length ? [`- No warm-up recorded: ${w.unrecorded.map(u => `${u.engine} run ${u.run ?? '?'}`).join(', ')}.`] : []),
    ...(w.shown.length || w.unrecorded.length ? [''] : []),
    '| engine | run | lane | step | cell | field put back |', '|---|---|---|---|---|---|',
    ...w.runs.flatMap(r => r.steps.map(s => `| ${r.engine} | ${r.run ?? '-'} | ${r.lane ?? '-'} | ${s.venue} ${s.kind} | ${cellOf(cellText(s))} | ${cellOf(putBackText(s))} |`)), ''];
}
