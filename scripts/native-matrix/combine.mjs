// Ruling 1228 (E): the full run's records combined with filtered reruns (./run.mjs filteredPlan), so a rerun proves only
// the cells that needed it. A filtered rerun of run n replaces only its listed cells' rows of run n, both lanes together:
// its vendor and cua results must list the same cells and a full run of number n must lie beneath it on each lane,
// else nothing of it is combined (a problem names why). Every replaced row names the job its evidence came from
// (`evidence`: the rerun's runner run id and attempt); the full run's own rows keep their run's (meta.runner.run). The
// combined result keeps the full run's commit and build, which the judge pairs on, and lists each rerun with its own
// (`meta.reruns`). A cell that failed in the full run on its own verdict (ok false with no `invalid`: not a missing
// proof) and passes in the rerun is flagged, never silently replaced (`flags`). Reruns are applied in the order given,
// so a later attempt's rows replace an earlier one's.
const keyOf = r => `${r.section} ${r.id}`;
const jobOf = result => ({runId: result.meta?.runner?.run?.id ?? null, attempt: result.meta?.runner?.run?.attempt ?? null});
const engineOf = result => result.lanes?.[0]?.engine ?? null;

// `full`: [{path, result}] of the full runs (planId 'full'); `reruns`: [{path, result}] of filtered ones. -> {results:
// the full runs as combined, combined: [{run, runId, attempt, cells}], flags: [{run, engine, cell, full, rerun}], problems}.
export function combineReruns(full, reruns) {
  const results = full.map(({path, result}) => ({path, result: {...result, rows: [...result.rows], meta: {...result.meta}}}));
  const combined = [], flags = [], problems = [];
  const groups = new Map();
  for (const entry of reruns) {
    const {meta} = entry.result, job = jobOf(entry.result), key = `${meta.run} ${job.runId} ${job.attempt}`;
    if (!groups.has(key)) groups.set(key, {run: meta.run, job, lanes: {}});
    groups.get(key).lanes[engineOf(entry.result)] = entry.result;
  }
  for (const {run, job, lanes} of groups.values()) {
    const name = `run ${run}'s filtered rerun (job ${job.runId}, attempt ${job.attempt})`;
    const missing = ['vendor', 'cua'].find(e => !lanes[e]);
    if (missing) { problems.push(`${name} has no ${missing} lane: not combined`); continue; }
    const cells = [...lanes.vendor.meta.filter ?? []];
    if (cells.length === 0 || cells.join('\n') !== [...lanes.cua.meta.filter ?? []].join('\n')) { problems.push(`${name}: its lanes list different cells: not combined`); continue; }
    const under = Object.fromEntries(['vendor', 'cua'].map(e => [e, results.find(r => r.result.meta?.run === run && engineOf(r.result) === e)]));
    if (!under.vendor || !under.cua) { problems.push(`${name} has no full run of its number beneath it: not combined`); continue; }
    for (const engine of ['vendor', 'cua']) {
      const base = under[engine].result, rerun = lanes[engine];
      for (const cell of cells) {
        const fresh = rerun.rows.filter(r => keyOf(r) === cell);
        if (!fresh.length) { problems.push(`${name} recorded no row of ${cell} on ${engine}: the full run's kept`); continue; }
        const old = base.rows.filter(r => keyOf(r) === cell);
        if (old.some(r => r.ok === false && r.invalid === undefined) && fresh.every(r => r.ok === true && r.invalid === undefined)) {
          flags.push({run, engine, cell, full: jobOf(base), rerun: job});
        }
        base.rows = [...base.rows.filter(r => keyOf(r) !== cell), ...fresh.map(r => ({...r, evidence: job}))];
      }
      base.meta.reruns = [...(base.meta.reruns ?? []), {...job, commit: rerun.meta.commit ?? null, filter: cells, build: rerun.lanes?.[0]?.build ?? null}];
    }
    combined.push({run, ...job, cells});
  }
  return {results, combined, flags, problems};
}
