// One judged cell of the native matrix (a row id: a method case, a speed op, a probe or Unicode row) from both engines'
// samples, for the judge (./summary.mjs). What a sample needs to have a verdict is ./front-key.mjs's (its readings, the
// harness's invalid reason); what a cua sample needs beside it is decided here:
// - Eligible pairs: a vendor sample answers for a cua sample only from the same run, and only where that run's pair is
//   one proof (`pairable`: one vendor and one cua run of the number, one hold, one commit, one approved build; the
//   judge's provenance check). A cua failure proven on its own (against ground truth) needs no pair.
// - No valid pair, no verdict (ruling 1116): where the verdict rests on the vendor's answer (a frontmost method row,
//   whose reference is the vendor's outcome sample for sample; the pressKey row; a failed sample of a row judged by an
//   absolute expected string; speed and finding, compared; a declared departure) a cua sample with no eligible vendor
//   sample with a verdict is `unpaired`: it has no verdict, never equal and never worse.
// - Two failures are equal only as the same failure (ruling 1144, ./answers.mjs): the same answer and the same effect,
//   for a row judged by an absolute expected string the same read-back. Such a sample is `shared` (a shared limit, the
//   vendor has it too), listed apart. The vendor passing a sample whose cua pair failed fails the row. cua refusing or
//   answering unconfirmed (its recorded engine name of that kind) where the vendor answered ok with the wrong effect
//   (a false ok) is better, listed with the departures. An acceptance row (./unicode-plan.mjs isAcceptanceRow) is
//   absolute: neither a shared limit nor a departure satisfies it.
// - A declared departure (./departures.mjs) covers a cua sample that answered as declared beside the vendor's ok of the
//   same run, the row's own effect check and interference reading holding on both sides; the cell is then `declared`.
// - A cell qualifies when each engine has at least `required` runs (the triple's three) every sample of which has a
//   verdict. A cell that does not qualify has no verdict unless a sample proved it worse.
// The verdicts: worse (a sample proven worse, or the pressKey row composing otherwise on the vendor), no-verdict (no
// counted cua sample, or not qualified), declared, shared, better, equal.
import {stats} from '../native-baseline/summary.mjs';
import {answerOf, sameFailure} from './answers.mjs';
import {answeredAs, vendorAnsweredOk} from './departures.mjs';
import {sampleCause} from './front-key.mjs';

const round = n => (n === null || n === undefined ? null : Math.round(n * 10) / 10);
export const BEAT = 0.9;
// The run a sample belongs to: the judge tags every full run's rows with meta.run; a row judged alone pairs by sample.
export const runOf = row => row.run ?? row.sample ?? 1;
const passes = row => row.ok === true;
const causeOf = row => sampleCause(row)?.category ?? null;
const groupBy = (items, key) => { const out = new Map(); for (const item of items) { const k = key(item); if (!out.has(k)) out.set(k, []); out.get(k).push(item); } return out; };
const all = () => true;

// Both sides' samples with and without a verdict. `cuaCause(row)`: a cua sample's cause (its own, or unpaired).
// -> {vendor: {verdicts, runs, byRun: {run: {verdicts, samples}}, noVerdict: {category: n}}, cua: {…}, qualifies}.
export function accountOf(vendorRows, cuaRows, cuaCause, required) {
  const side = (rows, cause) => {
    const noVerdict = {};
    for (const r of rows) { const c = cause(r); if (c) noVerdict[c] = (noVerdict[c] ?? 0) + 1; }
    const byRun = Object.fromEntries([...groupBy(rows, runOf)].sort(([a], [b]) => a - b).map(([run, list]) => [run, {verdicts: list.filter(r => !cause(r)).length, samples: list.length}]));
    const runs = Object.values(byRun).filter(r => r.verdicts === r.samples).length;
    return {verdicts: rows.filter(r => !cause(r)).length, runs, byRun, noVerdict};
  };
  const vendor = side(vendorRows, causeOf), cua = side(cuaRows, cuaCause);
  return {vendor, cua, qualifies: vendor.runs >= required && cua.runs >= required};
}

const VERDICTS = ['worse', 'equal', 'better', 'honest', 'declared', 'shared'];

// One cell's verdict. `mode`: 'reference' (a frontmost method row), 'own' (its own outcome against ground truth: a
// background method row, a launch or probe row; the vendor's recorded beside it), 'absolute' (a Unicode row, judged by
// its absolute expected string; ruling 1144) or 'pressKey' (absolute, and ruling 1119: the engines must compose alike).
// `departure`: the row's declared departure, if any; `oracle(row)`: whether the non-interference oracle judges the row;
// `pairable(run)`: whether the run's pair is one proof; `acceptance`: the row is an acceptance item's.
// -> {verdict, vendor: {ok, valid, invalid}, cua: {…}, declared, shared: [sample], honest: [sample], routes, account,
// differs?}.
export function judgeCell(mode, vendorRows, cuaRows, {departure = null, required = 1, oracle = () => false, pairable = all, acceptance = false} = {}) {
  const vendorByRun = groupBy(vendorRows.filter(r => !causeOf(r) && pairable(runOf(r))), runOf);
  const held = r => !oracle(r) || r.interference?.ok === true;
  const absolute = mode === 'absolute' || mode === 'pressKey';
  const outcomes = new Map(), notes = new Map();
  const failed = (c, v) => {
    if (departure && !acceptance) {
      const {answered, effect} = answeredAs(departure, c);
      if (answered && !v) return 'unpaired';
      if (answered && vendorAnsweredOk(v) && held(v) && held(c) && effect) return 'declared';
    }
    if (mode === 'own' || acceptance) return 'worse';
    if (!v) return 'unpaired';
    if (passes(v)) return 'worse';
    if (sameFailure(v, c, {readBack: absolute})) return 'shared';
    const vendorAnswer = answerOf(v), cuaAnswer = answerOf(c);
    if (vendorAnswer.kind === 'ok' && ['refused', 'unconfirmed'].includes(cuaAnswer.kind) && held(c)) { notes.set(c, {vendor: vendorAnswer, cua: cuaAnswer}); return 'honest'; }
    return 'worse';
  };
  for (const c of cuaRows) {
    const own = causeOf(c);
    if (own) { outcomes.set(c, own); continue; }
    const v = vendorByRun.get(runOf(c))?.[0] ?? null;
    if (passes(c)) outcomes.set(c, (mode === 'reference' || mode === 'pressKey') && !v ? 'unpaired' : v && !passes(v) && mode !== 'pressKey' ? 'better' : 'equal');
    else outcomes.set(c, failed(c, v));
  }
  const cuaCause = r => (VERDICTS.includes(outcomes.get(r)) ? null : outcomes.get(r));
  const account = accountOf(vendorRows, cuaRows, cuaCause, required);
  const counted = cuaRows.filter(r => !cuaCause(r)), vendorCounted = vendorRows.filter(r => !causeOf(r));
  const has = o => counted.some(r => outcomes.get(r) === o);
  // pressKey: a vendor sample with a verdict that composed otherwise fails the row, unless cua's sample of its run
  // failed the same way (ruling 1119 with 1144).
  const sharedRuns = new Set(counted.filter(r => outcomes.get(r) === 'shared').map(runOf));
  const differs = mode === 'pressKey' && !has('worse') && vendorCounted.some(r => !passes(r) && !sharedRuns.has(runOf(r)));
  const verdict = has('worse') || differs ? 'worse' : !counted.length || !account.qualifies ? 'no-verdict'
    : has('declared') ? 'declared' : has('shared') ? 'shared' : has('better') || has('honest') ? 'better' : 'equal';
  const tally = (rows, rowsAll) => ({ok: rows.filter(passes).length, valid: rows.length, invalid: rowsAll.length - rows.length});
  const of = o => counted.filter(r => outcomes.get(r) === o);
  // The routes that carried each action, whether or not its sample found a pair.
  const routes = {vendor: [...new Set(vendorCounted.map(r => r.inputRoute ?? null))], cua: [...new Set(cuaRows.filter(r => !causeOf(r)).map(r => r.inputRoute ?? null))]};
  return {verdict, vendor: tally(vendorCounted, vendorRows), cua: tally(counted, cuaRows), declared: of('declared').length,
    shared: of('shared').map(r => ({run: runOf(r), answer: answerOf(r), length: r.outcome?.length ?? null, expectedLength: r.outcome?.expectedLength ?? null})),
    honest: of('honest').map(r => ({run: runOf(r), ...notes.get(r)})), routes, account, ...(differs ? {differs: true} : {})};
}

// One method row's verdict: frontmost against the vendor's outcome, background against the fixture's ground truth.
export const judgeMethod = (regime, vendorRows, cuaRows, options) => judgeCell(regime === 'frontmost' ? 'reference' : 'own', vendorRows, cuaRows, options);

// pressKey's r k (ruling 1119): composed by the active input method, so judged on the raw outcomes of both engines,
// never on a declaration. A counted cua sample that did not read the expected text fails the row unless its vendor pair
// failed the same way; a vendor sample with a verdict that did not, the engines composing differently, fails it too
// (`differs`), whatever cua's samples were.
export const judgePressKey = (vendorRows, cuaRows, options) => judgeCell('pressKey', vendorRows, cuaRows, options);

// The runs both sides observed with a verdict (pairable ones), and each side's samples in them. `causeOf` decides a
// sample's own verdict. -> {eligible: Set(run), cuaCause}.
function eligibleRuns(vendorRows, cuaRows, pairable) {
  const runsOf = rows => new Set(rows.filter(r => !causeOf(r) && pairable(runOf(r))).map(runOf));
  const vendorRuns = runsOf(vendorRows), cuaRuns = runsOf(cuaRows);
  const eligible = new Set([...cuaRuns].filter(n => vendorRuns.has(n)));
  return {eligible, cuaCause: r => causeOf(r) ?? (eligible.has(runOf(r)) ? null : 'unpaired')};
}

// One speed op's comparison over the same eligible observations on both sides (runs where each has samples with a
// verdict); each side's own counts kept in `account` as diagnostics. -> {vendor: stats, cua: stats, deltaPct, beat:
// true|false|null, provisional, account}; beat null when unmeasured or not qualified, `provisional` then what the
// samples measured would give (shown, never counted).
export function judgeSpeed(vendorRows, cuaRows, {required = 1, pairable = all} = {}) {
  const {eligible, cuaCause} = eligibleRuns(vendorRows, cuaRows, pairable);
  const account = accountOf(vendorRows, cuaRows, cuaCause, required);
  const times = rows => rows.filter(r => !causeOf(r) && eligible.has(runOf(r))).map(r => r.inCellMs);
  const vendor = stats(times(vendorRows)), cua = stats(times(cuaRows));
  if (!vendor || !cua) return {vendor, cua, deltaPct: null, beat: null, provisional: null, account};
  const beat = cua.median <= BEAT * vendor.median && cua.p95 <= vendor.p95;
  return {vendor, cua, deltaPct: round(((cua.median - vendor.median) / vendor.median) * 100), beat: account.qualifies ? beat : null, provisional: beat, account};
}

// One finding row's samples on the same eligible observations as speed's. -> {vendor: [row], cua: [row], account}.
export function findingSamples(vendorRows, cuaRows, {required = 1, pairable = all} = {}) {
  const {eligible, cuaCause} = eligibleRuns(vendorRows, cuaRows, pairable);
  const kept = rows => rows.filter(r => !causeOf(r) && eligible.has(runOf(r)));
  return {vendor: kept(vendorRows), cua: kept(cuaRows), account: accountOf(vendorRows, cuaRows, cuaCause, required)};
}
