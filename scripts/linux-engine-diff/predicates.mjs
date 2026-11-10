// The adopted predicate cases (#171 M4; Decision Log, M4 pre-flight, "The gate"): the manifest of the conditions a
// loosened refusal now lets through, each with its effect and witness, and of the counterexamples it still refuses,
// with their counts. A predicate that loosens a refusal is a new way to send input the person might see, so the gate
// proves each case it allows, and a case the run did not measure fails it, as a missing operation does.
//
// T19 (#353; the design session, 2026-11-10; evidence `m4/pointer-route/`): Gecko takes background pointer input only
// while the real pointer is in its window, whatever covers the window. So its coordinate clicks, scrolls, moves and
// drags take the background route in shared mode while `QueryPointer` puts the pointer in the window
// (families.rs `unless_pointer_within`), a partly covered window included, which the window rule it replaces refused;
// with the pointer under a cover or outside, they are refused, the fully visible window included, which the window rule
// let through to answer ok for input Gecko ignored. T15's point rule did not merge (Decision Log, 2026-11-10).
//
// Each case is one kind, occlusion and pointer place in Firefox (pointer-route.mjs's cells, its runner `measureRoute`:
// the pointer parked before each run and read before each request, one window a lane):
// - `cua`, as it ships, in shared mode: an allowed case takes effect on every run, answered ok, with the witness
//   unchanged; a refused case answers the Device mode sentence on every run, with the witness unchanged and nothing
//   taking effect;
// - `pinned`, beside it: the vendor's answer, ok whether or not Gecko took the input;
// - `cua:any-pointer` (`--ignore-pointer`, measurement only) on a refused case: cua's own events sent with the pointer
//   unjudged, the count of what the refusal keeps from being sent (Gecko ignores it: the refusal is no loss).

import { DEVICE_REFUSAL, GECKO_POINTER_LEFT } from './deviations.mjs';
import { OCCLUSION_PARKS, ROUTE_GROUPS, cellKey, leavePlan, measureRoute } from './pointer-route.mjs';

/** The runs of an allowed case, every one of which must take effect (the row's proof: 30 of 30). */
export const ALLOWED_RUNS = 30;
/** The runs of a still-refused counterexample: each answers the refusal, whatever the lanes beside it did. */
export const REFUSED_RUNS = 10;
/** The runs of a leave case (the pointer moved out during the request): each answers honestly. */
export const LEAVE_RUNS = 20;

/** The kinds, each with the scene group pointer-route.mjs measures it in. */
export const PREDICATE_KINDS = ROUTE_GROUPS.flatMap(({ group, kinds }) => kinds.map((kind) => ({ kind, group })));

const why = {
  in: 'the real pointer in the window (unless_pointer_within), whatever covers the rest of it',
  under: 'the real pointer under a window over it: outside it, by the server',
  out: 'the real pointer outside the window',
  leave: 'the real pointer in the window at the request, moved out while it runs',
};

/** The manifest: every pointer place each occlusion has (pointer-route.mjs), allowed with the pointer in, else refused. */
export const PREDICATE_CASES = [
  ...Object.entries(OCCLUSION_PARKS).flatMap(([occlusion, parks]) =>
    parks.flatMap((park) => PREDICATE_KINDS.map(({ kind, group }) => ({ family: 'firefox', group, kind, occlusion, park, expect: park === 'in' ? 'allowed' : 'refused', why: why[park] }))),
  ),
  // the pointer leaving during the request (T19's watch, engine/within.rs): never ok with no effect
  ...leavePlan(['firefox']).map((c) => ({ ...c, expect: 'honest', why: why.leave })),
];

export const caseKey = cellKey;

/** The lanes a case runs: cua as it ships and the pinned build always; the pointer-unjudged lane on a refused case. */
export function caseLanes(c, args) {
  const lanes = [
    { label: 'cua', bin: args.cua, args: [] },
    { label: 'pinned', bin: args.vendor, args: [] },
  ];
  if (c.expect === 'refused') lanes.push({ label: 'cua:any-pointer', bin: args.cua, args: ['--ignore-pointer'] });
  return lanes;
}

// ---------------------------------------------------------------------------------------------------------------
// the judge (pure)

const refusal = (r) => r.ok !== true && DEVICE_REFUSAL.test(String(r.error ?? ''));
const leftAnswer = (r) => r.ok !== true && GECKO_POINTER_LEFT.test(String(r.error ?? ''));

/**
 * One case judged from its runs (each `{engine, ok, error, took, witness}`): an allowed case passes when cua ran
 * `ALLOWED_RUNS` or more, every one ok, taking effect and with the witness unchanged; a refused one when cua ran
 * `REFUSED_RUNS` or more, every one the Device mode sentence with the witness unchanged and no effect. The other lanes'
 * counts stand beside it, never judged.
 */
export function judgeCase(c, runs, { allowedRuns = ALLOWED_RUNS, refusedRuns = REFUSED_RUNS, leaveRuns = LEAVE_RUNS } = {}) {
  const mine = runs.filter((r) => r.engine === 'cua');
  const counts = {};
  for (const r of runs) {
    counts[r.engine] ??= { took: 0, n: 0, refused: 0, left: 0, ok_no_effect: 0 };
    counts[r.engine].n++;
    if (r.took === true) counts[r.engine].took++;
    if (refusal(r)) counts[r.engine].refused++;
    if (leftAnswer(r)) counts[r.engine].left++;
    if (r.ok === true && r.took !== true) counts[r.engine].ok_no_effect++;
  }
  const need = c.expect === 'allowed' ? allowedRuns : c.expect === 'honest' ? leaveRuns : refusedRuns;
  const failed = [];
  if (mine.length < need) failed.push(`cua ran ${mine.length} of ${need}`);
  const unclean = mine.filter((r) => r.witness !== true).length;
  if (unclean) failed.push(`the witness changed on ${unclean}`);
  if (c.expect === 'allowed') {
    const missed = mine.filter((r) => r.ok !== true || r.took !== true).length;
    if (missed) failed.push(`${missed} did not take effect`);
  } else if (c.expect === 'honest') {
    // each run took effect answered ok, or was refused before anything was sent, or answers that the pointer left
    const falseOk = mine.filter((r) => r.ok === true && r.took !== true).length;
    if (falseOk) failed.push(`${falseOk} answered ok with no effect`);
    const other = mine.filter((r) => r.ok !== true && !refusal(r) && !leftAnswer(r)).length;
    if (other) failed.push(`${other} answered another error`);
    const refusedTook = mine.filter((r) => r.ok !== true && refusal(r) && r.took === true).length;
    if (refusedTook) failed.push(`${refusedTook} were refused and took effect`);
  } else {
    const answered = mine.filter((r) => !refusal(r)).length;
    if (answered) failed.push(`${answered} were not refused`);
    const took = mine.filter((r) => r.took === true).length;
    if (took) failed.push(`${took} took effect`);
  }
  return { kind: 'predicate-case', ...c, counts, pass: failed.length === 0, failed };
}

/** Every case of the manifest judged; a case with no runs fails as unmeasured. */
export function judgePredicates(cases, runs, options = {}) {
  const rows = cases.map((c) => {
    const own = runs.filter((r) => r.case === caseKey(c));
    if (!own.length) return { kind: 'predicate-case', ...c, counts: {}, pass: false, failed: ['not measured'] };
    return judgeCase(c, own, options);
  });
  const failed = rows.filter((r) => !r.pass).map((r) => `${caseKey(r)}: ${r.failed.join(', ')}`);
  return { rows, pass: failed.length === 0, failed };
}

/** The summary's table, one row a case. */
export function predicatesMarkdown(rows) {
  const count = (row, lane) => (row.counts[lane] ? `${row.counts[lane].took}/${row.counts[lane].n}` : '–');
  const cua = (row) => {
    const c = row.counts.cua;
    if (!c) return '–';
    if (row.expect === 'honest') return `took ${c.took}, left ${c.left}, refused ${c.refused}, ok with no effect ${c.ok_no_effect} (of ${c.n})`;
    return row.expect === 'allowed' ? `took ${c.took}/${c.n}` : `refused ${c.refused}/${c.n}`;
  };
  return [
    '| occlusion | pointer | kind | expected | cua | pinned took | cua:any-pointer took | why | verdict |',
    '|---|---|---|---|---:|---:|---:|---|---|',
    ...rows.map((r) => `| ${r.occlusion} | ${r.park} | ${r.kind} | ${r.expect} | ${cua(r)} | ${count(r, 'pinned')} | ${count(r, 'cua:any-pointer')} | ${r.why} | ${r.pass ? 'PASS' : `**FAIL**: ${r.failed.join(', ')}`} |`),
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// the run

/** The cases a run measures: the manifest, narrowed by `--ops` (kinds) where asked; the gate runs them all. */
export function predicatePlan(args, cases = PREDICATE_CASES) {
  if (args.plan && args.plan !== 'manifest') throw new Error(`--plan ${args.plan}: the predicates plan is manifest (the gate's); T15's pointer probes are pointer-route.mjs's sitting now`);
  const kinds = args.ops && args.ops !== 'all' ? args.ops : null;
  return cases.filter((c) => !kinds || kinds.includes(c.kind));
}

export async function runPredicates(args, { desktop, emit }) {
  if (!args.vendor) throw new Error('the predicates experiment needs --vendor (the pinned build beside cua)');
  const plan = predicatePlan(args);
  if (!plan.length) throw new Error('no predicate case to measure');
  const runs = [];
  const { errors } = await measureRoute(args, { desktop, emit }, plan, {
    lanesOf: (c) => caseLanes(c, args),
    runsOf: (c) => (c.expect === 'allowed' ? ALLOWED_RUNS : c.expect === 'honest' ? LEAVE_RUNS : REFUSED_RUNS),
    cellRow: (c, own) => {
      runs.push(...own);
      const row = judgeCase(c, own);
      process.stdout.write(`${predicatesMarkdown([row]).at(-1)}\n`);
      return row;
    },
  });
  const verdict = judgePredicates(plan, runs);
  for (const row of verdict.rows) emit({ ...row, kind: 'predicate-verdict' });
  const md = [
    `T19's adopted cases (predicates.mjs): Gecko's pointer kinds by the real pointer. Each allowed case ${ALLOWED_RUNS} runs of cua as it ships, every one taking effect with the witness unchanged; each still-refused counterexample ${REFUSED_RUNS}, every one the Device mode sentence with the witness unchanged; each leave case (the pointer moved out during the request) ${LEAVE_RUNS}, none answered ok with no effect. Beside them the pinned build's counts and, on a refused case, cua's own events with the pointer unjudged (\`cua:any-pointer\`, \`--ignore-pointer\`).`,
    '',
    ...predicatesMarkdown(verdict.rows),
    '',
    verdict.pass ? 'Every case holds.' : `**FAIL**: ${verdict.failed.join('; ')}`,
  ];
  return { md, complete: errors.length === 0, pass: verdict.pass, failed: [...errors, ...verdict.failed] };
}
