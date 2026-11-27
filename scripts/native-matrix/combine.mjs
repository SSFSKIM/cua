// Ruling 1228 (E): the full run's records combined with filtered reruns (./run.mjs filteredPlan), so a rerun proves only
// the cells that needed it. A filtered rerun of run n replaces only its listed cells' rows of run n, both lanes together:
// its vendor and cua results must list the same cells and a full run of number n must lie beneath it on each lane,
// else nothing of it is combined (a problem names why). Every replaced row names the job its evidence came from
// (`evidence`: the rerun's runner run id and attempt); the full run's own rows keep their run's (meta.runner.run). The
// combined result keeps the full run's commit and build, which the judge pairs on, and lists each rerun with its own
// (`meta.reruns`). A rerun's pair is combined only as the judge takes a full run's (I4 of the split review): both lanes
// complete, neither refused, each attesting its own side (ruling 1149), the two on one frame (ruling 1169). A cell that
// failed in the full run and passes in the rerun is flagged, never silently replaced (`flags`, I5): its pair judged per
// run as the judge reads it (../native-matrix/summary.mjs runVerdict: worse than the vendor, or interfering) from a
// failing verdict to another, or its rows failing on their own (ok false with no `invalid`: not a missing proof) and
// passing in the rerun. Reruns are applied in the order given, so a later attempt's rows replace an earlier one's.
// The run-level meta the judge reads per cell follows the rows: a replaced composing group's readings (its attempts and
// the readings around them, ../native-matrix/composing-retries.mjs) and a replaced panel opening's placement
// (../hosted-sittings/venue.mjs panelFrameSplits) come from the rerun's job, each naming it (`evidence`); the full run's
// stay for every cell the rerun did not replace (carriedMeta).
import {frameAsymmetry} from '../hosted-sittings/venue.mjs';
import {FULL_PLAN} from './run.mjs';
import {runVerdict, unmeasuredSide} from './summary.mjs';
import {unicodeRowsOf} from './unicode-plan.mjs';

const keyOf = r => `${r.section} ${r.id}`;
const jobOf = result => ({runId: result.meta?.runner?.run?.id ?? null, attempt: result.meta?.runner?.run?.attempt ?? null});
const engineOf = result => result.lanes?.[0]?.engine ?? null;

// A composing cell's group (`<field>/composing@<user>/…` -> `<field>@<user>`, ./unicode-run.mjs's record), or null.
const COMPOSING = /^composing@([^:\s]+)/;
const groupOfCell = id => { const [field, condition] = String(id).split('/'); return condition?.startsWith('composing@') ? `${field}@${condition.slice('composing@'.length)}` : null; };
let planGroups = null;
const groupsOfUser = user => (planGroups ??= [...new Set(unicodeRowsOf(FULL_PLAN.unicode).map(r => groupOfCell(r.id)).filter(Boolean))]).filter(g => g.endsWith(`@${user}`));
const isAttempt = r => 'composed' in r || 'setup' in r;
// Each reading with the composing groups it belongs to: an attempt's record its own group; a reading around an attempt
// (its :end, its refocus reads) the next attempt's of its user window; one recorded before ruling 1229 (no group) every
// group of its user window. -> [[reading, groups | null]].
function attributed(readings) {
  const list = readings ?? [];
  return list.map((r, i) => {
    const user = COMPOSING.exec(r?.when ?? '')?.[1];
    if (!user) return [r, null];
    if (typeof r.group === 'string') return [r, [r.group]];
    if (isAttempt(r)) return [r, groupsOfUser(user)];
    const next = list.slice(i + 1).find(x => COMPOSING.exec(x?.when ?? '')?.[1] === user && isAttempt(x));
    return [r, typeof next?.group === 'string' ? [next.group] : groupsOfUser(user)];
  });
}
// The full run's meta with the replaced cells' share of it taken from the rerun's (`rerun`, its meta) job: the composing
// readings of every group a replaced cell belongs to, and the placement of every panel opening a replaced row (`fresh`)
// names. A full run's readings that name no group, of a user window only some of whose groups were replaced, cannot be
// told apart: kept, and a problem. -> {meta, problems}.
function carriedMeta(meta, rerun, cells, fresh, job, name) {
  const out = {...meta}, problems = [];
  const groups = new Set(cells.filter(c => c.startsWith('unicode ')).map(c => groupOfCell(c.slice('unicode '.length))).filter(Boolean));
  if (groups.size) {
    const all = gs => gs.every(g => groups.has(g)), some = gs => gs.some(g => groups.has(g));
    const kept = [];
    for (const [r, gs] of attributed(meta.unicode?.readings)) {
      if (!gs || !some(gs)) kept.push(r);
      else if (!all(gs)) {
        problems.push(`${name}: ${COMPOSING.exec(r.when)[0]}'s readings in the full run name no group, and the rerun replaced only some of its groups (${gs.filter(g => groups.has(g)).join(', ')}): they cannot be told apart, kept`);
        kept.push(r);
      }
    }
    const taken = attributed(rerun.unicode?.readings).filter(([, gs]) => gs && all(gs)).map(([r]) => ({...r, evidence: job}));
    out.unicode = {...meta.unicode, readings: [...kept, ...taken]};
  }
  const openings = new Set(fresh.map(r => r.opening).filter(o => typeof o === 'string'));
  if (openings.size) {
    const mine = meta.placement?.panel ?? [], theirs = rerun.placement?.panel ?? [];
    out.placement = {...(meta.placement ?? {scenes: {}}), panel: [...mine.filter(p => !openings.has(p?.opening)), ...theirs.filter(p => openings.has(p?.opening)).map(p => ({...p, evidence: job}))]};
  }
  return {meta: out, problems: [...new Set(problems)]};
}

// Why a rerun's pair is not taken as the judge would take a full run's, or null.
function pairUnfit(lanes) {
  for (const engine of ['vendor', 'cua']) {
    const r = lanes[engine];
    if (r.verdict === 'refused') return `its ${engine} lane was refused`;
    if (r.complete !== true) return `its ${engine} lane is not complete`;
    const side = unmeasuredSide(r);
    if (side) return `its ${engine} lane ${side}`;
  }
  const apart = frameAsymmetry(lanes.cua, lanes.vendor);
  return apart ? `its lanes did not stand on one frame (${apart})` : null;
}
// How a listed cell's rerun changed from its full run (I5, ruling 1231): {flag: why} when cua's side went from fail to
// not (the pair's verdict, or cua's own row), the owner's; {vendorOnly: true} when only the vendor's row did (parity,
// listed, never flagged); else null. The pair leaving fail only because the vendor's row went from pass to fail, cua's
// failing in both (a shared limit now), is still flagged, with `vendorRegressed` and a reason that says so: no gain of
// cua's.
function rerunChange(cell, base, fresh) {
  const section = cell.slice(0, cell.indexOf(' ')), id = cell.slice(cell.indexOf(' ') + 1);
  const was = runVerdict(section, id, base.vendor, base.cua), now = runVerdict(section, id, fresh.vendor, fresh.cua);
  const failed = rows => rows.some(r => r.ok === false && r.invalid === undefined), passed = rows => rows.length > 0 && rows.every(r => r.ok === true && r.invalid === undefined);
  if (was === 'fail' && now !== 'fail' && passed(base.vendor) && failed(fresh.vendor) && failed(base.cua) && failed(fresh.cua)) {
    return {flag: `pair now ${now}: vendor regressed; cua unchanged (fail)`, vendorRegressed: true};
  }
  if (was === 'fail' && now !== 'fail') return {flag: `its pair was judged fail in the full run and ${now} in the rerun`};
  const turned = e => failed(base[e]) && passed(fresh[e]);
  if (turned('cua')) return {flag: 'its cua row failed in the full run and passes in the rerun'};
  return turned('vendor') ? {vendorOnly: true} : null;
}

// `full`: [{path, result}] of the full runs (planId 'full'); `reruns`: [{path, result}] of filtered ones. -> {results:
// the full runs as combined, combined: [{run, runId, attempt, cells}], flags: [{run, cell, why, full, rerun}], vendorOnly:
// [{run, cell, full, rerun}], problems}.
export function combineReruns(full, reruns) {
  const results = full.map(({path, result}) => ({path, result: {...result, rows: [...result.rows], meta: {...result.meta}}}));
  const combined = [], flags = [], vendorOnly = [], problems = [];
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
    const unfit = pairUnfit(lanes);
    if (unfit) { problems.push(`${name}: ${unfit}: not combined`); continue; }
    const under = Object.fromEntries(['vendor', 'cua'].map(e => [e, results.find(r => r.result.meta?.run === run && engineOf(r.result) === e)]));
    if (!under.vendor || !under.cua) { problems.push(`${name} has no full run of its number beneath it: not combined`); continue; }
    // Each cell's pair before and after, judged before any row is replaced.
    for (const cell of cells) {
      const rowsOf = side => Object.fromEntries(['vendor', 'cua'].map(e => [e, side[e].rows.filter(r => keyOf(r) === cell)]));
      const change = rerunChange(cell, rowsOf({vendor: under.vendor.result, cua: under.cua.result}), rowsOf(lanes));
      if (change?.flag) flags.push({run, cell, why: change.flag, ...(change.vendorRegressed ? {vendorRegressed: true} : {}), full: jobOf(under.vendor.result), rerun: job});
      if (change?.vendorOnly) vendorOnly.push({run, cell, full: jobOf(under.vendor.result), rerun: job});
    }
    for (const engine of ['vendor', 'cua']) {
      const base = under[engine].result, rerun = lanes[engine], replaced = [], freshRows = [];
      for (const cell of cells) {
        const fresh = rerun.rows.filter(r => keyOf(r) === cell);
        if (!fresh.length) { problems.push(`${name} recorded no row of ${cell} on ${engine}: the full run's kept`); continue; }
        base.rows = [...base.rows.filter(r => keyOf(r) !== cell), ...fresh.map(r => ({...r, evidence: job}))];
        replaced.push(cell); freshRows.push(...fresh);
      }
      const carried = carriedMeta(base.meta, rerun.meta ?? {}, replaced, freshRows, job, `${name} on ${engine}`);
      base.meta = carried.meta;
      problems.push(...carried.problems);
      base.meta.reruns = [...(base.meta.reruns ?? []), {...job, commit: rerun.meta.commit ?? null, filter: cells, build: rerun.lanes?.[0]?.build ?? null}];
    }
    combined.push({run, ...job, cells});
  }
  return {results, combined, flags, vendorOnly, problems};
}
