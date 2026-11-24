// One judged cell of the native matrix (a row id: a method case, a speed op, a probe or Unicode row) from both engines'
// samples, for the judge (./summary.mjs). What a sample needs to have a verdict is ./front-key.mjs's (its readings, the
// harness's invalid reason); what a cua sample needs beside it is decided here:
// - Eligible pairs: a vendor sample answers for a cua sample only from the same run, and only where that run's pair is
//   one proof (`pairable`: one vendor and one cua run of the number, one hold, one commit, one approved build, one
//   device, one OS; the judge's provenance check). A cua failure proven on its own (against ground truth) needs no pair.
// - No valid pair, no verdict (ruling 1116): where the verdict rests on the vendor's answer (a frontmost method row,
//   whose reference is the vendor's outcome sample for sample; a fixed-string Unicode row's failure and the pressKey
//   row; speed and finding, compared; a declared departure) a cua sample with no eligible vendor sample with a verdict
//   is `unpaired`: it has no verdict, never equal and never worse. Where the vendor's sample of that run was never run
//   because the vendor's run stopped part-way (./run.mjs recordUnrun's rows, marked `unrun` {reason, after}), the cua
//   sample is `vendorStopped` instead, the stop and the row it came after kept on the account (`vendorStopped`): the
//   proof missing is the vendor's, never cua's failure. A row judged on cua's own effect ('own', acceptance) is judged
//   as ever.
// - Two failures are equal only as the same failure (./answers.mjs): the same answer, and on a frontmost method row
//   every effect field its case recorded alike (`equal`). A caret row (#258, #259) asks the same of two passes: its
//   reading is the field's range on the device, and the same reading is what "equal to the vendor's" means there.
//   On a fixed-string row (ruling 1144: a Unicode row judged by its absolute expected string, the pressKey row) the
//   same read-back with the user's value kept on both: such a sample is `shared` (a shared limit, the vendor has it
//   too), listed apart; the vendor passing a sample whose cua pair failed fails the row; cua refusing or answering
//   unconfirmed (its recorded engine name of that kind, its recorded
//   effect allowing it) where the vendor answered ok and read back other text (a false ok) is better, listed with the
//   departures. A cua sample that proved the user's value changed (`outcome.userKept` false) fails before any of this:
//   no departure, pair or shared failure answers for it. Anywhere else cua answering conservatively where the vendor answered ok needs a declared departure. An
//   acceptance row (./unicode-plan.mjs isAcceptanceRow) is absolute: neither a shared limit nor a departure satisfies it.
// - A declared departure (./departures.mjs) covers a cua sample that answered as declared beside the vendor's ok of the
//   same run, the row's own effect check and interference reading holding on both sides; the cell is then `declared`.
// - A cell qualifies with at least `required` complete run pairs (the triple's three): runs whose pair is eligible and
//   where both sides hold the same samples, as many as planned (`planned(run)`), every one with a verdict. Partial runs'
//   samples are diagnostics: they never qualify a cell and never enter the official speed. A cell that does not qualify
//   has no verdict unless a sample proved it worse.
// The verdicts: worse (a sample proven worse, or the pressKey row composing otherwise on the vendor), no-verdict (no
// counted cua sample, or not qualified), declared, shared, better, equal.
import {stats} from '../native-baseline/summary.mjs';
import {answerOf, conservativeEffect, sameEffect, sameFailure} from './answers.mjs';
import {answeredAs, vendorAnsweredOk} from './departures.mjs';
import {sampleCause} from './front-key.mjs';

const round = n => (n === null || n === undefined ? null : Math.round(n * 10) / 10);
export const BEAT = 0.9;
// The run a sample belongs to: the judge tags every full run's rows with meta.run; a row judged alone pairs by sample.
export const runOf = row => row.run ?? row.sample ?? 1;
const sampleOf = row => row.sample ?? runOf(row);
const passes = row => row.ok === true;
const causeOf = row => sampleCause(row)?.category ?? null;
const groupBy = (items, key) => { const out = new Map(); for (const item of items) { const k = key(item); if (!out.has(k)) out.set(k, []); out.get(k).push(item); } return out; };
const all = () => true;
const unknown = () => null;
// The vendor's stop that left its sample of `run` unrun ({reason, after}), or null.
const stopOf = (vendorRows, run) => vendorRows.find(r => runOf(r) === run && r.unrun)?.unrun ?? null;
// A cua sample's cause where it has no vendor pair: the vendor's stop, or none to compare with.
const noPair = (vendorRows, c) => (stopOf(vendorRows, runOf(c)) ? 'vendorStopped' : 'unpaired');

// The complete run pairs: runs whose pair is eligible (`pairable`) and where both sides hold the same samples, as many
// as `planned(run)` gives (null: as many as the other side; 0: the sides' plans differ), every one with a verdict by its
// side's cause. -> Set(run).
function completeRuns(vendorRows, cuaRows, vendorCause, cuaCause, {pairable = all, planned = unknown} = {}) {
  const vendorByRun = groupBy(vendorRows, runOf), cuaByRun = groupBy(cuaRows, runOf);
  const samples = list => JSON.stringify(list.map(sampleOf).sort((a, b) => a - b));
  const out = new Set();
  for (const [run, vendor] of vendorByRun) {
    const cua = cuaByRun.get(run) ?? [], plan = planned(run);
    if (!pairable(run) || !cua.length || samples(vendor) !== samples(cua) || (plan !== null && vendor.length !== plan)) continue;
    if (vendor.every(r => !vendorCause(r)) && cua.every(r => !cuaCause(r))) out.add(run);
  }
  return out;
}

// Both sides' samples with and without a verdict, and the complete run pairs. `cuaCause(row)`: a cua sample's cause (its
// own, or unpaired). -> {vendor: {verdicts, runs, byRun: {run: {verdicts, samples}}, noVerdict: {category: n}}, cua: {…},
// pairs, pairRuns: [run], qualifies}; `runs` each side's runs every sample of which has a verdict (diagnostics).
export function accountOf(vendorRows, cuaRows, cuaCause, {required = 1, pairable = all, planned = unknown} = {}) {
  const side = (rows, cause) => {
    const noVerdict = {};
    for (const r of rows) { const c = cause(r); if (c) noVerdict[c] = (noVerdict[c] ?? 0) + 1; }
    const byRun = Object.fromEntries([...groupBy(rows, runOf)].sort(([a], [b]) => a - b).map(([run, list]) => [run, {verdicts: list.filter(r => !cause(r)).length, samples: list.length}]));
    const runs = Object.values(byRun).filter(r => r.verdicts === r.samples).length;
    return {verdicts: rows.filter(r => !cause(r)).length, runs, byRun, noVerdict};
  };
  const pairRuns = [...completeRuns(vendorRows, cuaRows, causeOf, cuaCause, {pairable, planned})].sort((a, b) => a - b);
  // Each run where a cua sample is `vendorStopped`: the vendor's stop, once a run.
  const stopRuns = [...new Set(cuaRows.filter(r => cuaCause(r) === 'vendorStopped').map(runOf))].sort((a, b) => a - b);
  const vendorStopped = stopRuns.map(run => ({run, reason: stopOf(vendorRows, run)?.reason ?? null, after: stopOf(vendorRows, run)?.after ?? null}));
  return {vendor: side(vendorRows, causeOf), cua: side(cuaRows, cuaCause), pairs: pairRuns.length, pairRuns, qualifies: pairRuns.length >= required,
    ...(vendorStopped.length ? {vendorStopped} : {})};
}

// A caret row's device reading on its outcome (./caret.mjs caretOutcome: the range it read).
const hasReading = row => typeof row?.outcome?.range === 'object' && row.outcome.range !== null;

const VERDICTS = ['worse', 'equal', 'better', 'honest', 'declared', 'shared'];

// One cell's verdict. `mode`: 'reference' (a frontmost method row), 'own' (its own outcome against ground truth or its
// own measure: a background method row, a launch or probe row, the mid-switch row; the vendor's recorded beside it),
// 'absolute' (a fixed-string Unicode row, ruling 1144), 'pressKey' (a fixed-string row, and ruling 1119: the engines
// must compose alike) or 'reading' (a frontmost row judged by the device's reading of what the act did, the caret rows of
// #258 and #259, ./caret.mjs: as 'reference', except that two passes are equal only with the same reading, every effect
// field alike, since a caret elsewhere is a difference a model meets whether or not each side met its own check).
// `departure`: the row's declared departure, if any; `oracle(row)`: whether the non-interference oracle judges the row;
// `pairable(run)`: whether the run's pair is one proof; `planned(run)`: the row's planned samples in a run;
// `acceptance`: the row is an acceptance item's. `reference(vendorRow)`: why a vendor sample with a verdict cannot be
// the reference for its run's cua sample (ruling 1168's pointerdown cell: the vendor's real click must register exactly
// one pointer down, else the scene, not cua, is in question), or null; such a pair has no verdict (`reference`), its
// reason listed (`unreferenced`).
// -> {verdict, vendor: {ok, valid, invalid}, cua: {…}, declared, shared: [sample], honest: [sample], routes, account,
// differs?, unreferenced?: [{run, reason}]}.
// `ownEffect`: a frontmost row judged by its own effect (./plan.mjs OWN_EFFECT_IDS): compared with the vendor's as any
// reference row, but where the vendor's sample of the run was never run because its run stopped (ruling 1214), the cua
// sample is judged on its own effect ('own') rather than left `vendorStopped`.
export function judgeCell(mode, vendorRows, cuaRows, {departure = null, required = 1, oracle = () => false, pairable = all, planned = unknown, acceptance = false, reference = null, ownEffect = false} = {}) {
  const vendorByRun = groupBy(vendorRows.filter(r => !causeOf(r) && pairable(runOf(r))), runOf);
  const held = r => !oracle(r) || r.interference?.ok === true;
  const fixed = mode === 'absolute' || mode === 'pressKey';
  const outcomes = new Map(), notes = new Map(), unreferenced = [];
  const ownAfterStop = c => ownEffect && Boolean(stopOf(vendorRows, runOf(c)));
  const failed = (c, v) => {
    // A proven change of the user's value (the rows behind a user window) fails on its own: no departure, pair or
    // shared failure answers for it.
    if (c.outcome?.userKept === false) return 'worse';
    if (departure && !acceptance) {
      const {answered, effect} = answeredAs(departure, c);
      if (answered && !v) return noPair(vendorRows, c);
      if (answered && vendorAnsweredOk(v) && held(v) && held(c) && effect) return 'declared';
    }
    if (mode === 'own' || acceptance || (!v && ownAfterStop(c))) return 'worse';
    if (!v) return noPair(vendorRows, c);
    if (passes(v)) return 'worse';
    if (sameFailure(v, c, {readBack: fixed})) return fixed ? 'shared' : 'equal';
    if (!fixed) return 'worse';
    const vendorAnswer = answerOf(v), cuaAnswer = answerOf(c);
    // Better only than an actual false ok: the vendor answered ok and read back other text than expected (not exact text
    // that failed only for the user's value).
    const conservative = ['refused', 'unconfirmed'].includes(cuaAnswer.kind) && conservativeEffect(cuaAnswer.kind, c) && held(c);
    if (vendorAnswer.kind === 'ok' && v.outcome?.exact === false && conservative) { notes.set(c, {vendor: vendorAnswer, cua: cuaAnswer}); return 'honest'; }
    return 'worse';
  };
  for (const c of cuaRows) {
    const own = causeOf(c);
    if (own) { outcomes.set(c, own); continue; }
    const v = vendorByRun.get(runOf(c))?.[0] ?? null;
    const unfit = v && reference ? reference(v) : null;
    if (unfit) { outcomes.set(c, 'reference'); unreferenced.push({run: runOf(c), reason: unfit}); continue; }
    // 'reading': a pair missing either side's reading has no verdict (ruling 1141), never a difference.
    if (mode === 'reading' && v && !(hasReading(v) && hasReading(c))) { outcomes.set(c, 'unread'); continue; }
    if (passes(c)) outcomes.set(c, ['reference', 'pressKey', 'reading'].includes(mode) && !v ? (ownAfterStop(c) ? 'equal' : noPair(vendorRows, c)) : v && !passes(v) && mode !== 'pressKey' ? 'better'
      : mode === 'reading' && !sameEffect(v, c) ? 'worse' : 'equal');
    else outcomes.set(c, failed(c, v));
  }
  const cuaCause = r => (VERDICTS.includes(outcomes.get(r)) ? null : outcomes.get(r));
  const account = accountOf(vendorRows, cuaRows, cuaCause, {required, pairable, planned});
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
    honest: of('honest').map(r => ({run: runOf(r), ...notes.get(r)})), routes, account, ...(differs ? {differs: true} : {}),
    ...(unreferenced.length ? {unreferenced} : {})};
}

// One method row's verdict: frontmost against the vendor's outcome, background against the fixture's ground truth.
export const judgeMethod = (regime, vendorRows, cuaRows, options) => judgeCell(regime === 'frontmost' ? 'reference' : 'own', vendorRows, cuaRows, options);

// pressKey's r k (ruling 1119): composed by the active input method, so judged on the raw outcomes of both engines,
// never on a declaration. A counted cua sample that did not read the expected text fails the row unless its vendor pair
// failed the same way; a vendor sample with a verdict that did not, the engines composing differently, fails it too
// (`differs`), whatever cua's samples were.
export const judgePressKey = (vendorRows, cuaRows, options) => judgeCell('pressKey', vendorRows, cuaRows, options);

// A measured row's observations (speed, finding): the complete run pairs, which the official measure and the verdict
// rest on, and the partial ones (an eligible run where each side has some sample with a verdict), diagnostics only.
// -> {complete: Set(run), partial: Set(run), cuaCause}.
function measuredRuns(vendorRows, cuaRows, pairable, planned) {
  const complete = completeRuns(vendorRows, cuaRows, causeOf, causeOf, {pairable, planned});
  const runsOf = rows => new Set(rows.filter(r => !causeOf(r) && pairable(runOf(r))).map(runOf));
  const vendorRuns = runsOf(vendorRows);
  const partial = new Set([...runsOf(cuaRows)].filter(n => vendorRuns.has(n)));
  return {complete, partial, cuaCause: r => causeOf(r) ?? (complete.has(runOf(r)) ? null : noPair(vendorRows, r))};
}
const beatOf = (vendor, cua) => (vendor && cua ? cua.median <= BEAT * vendor.median && cua.p95 <= vendor.p95 : null);

// One speed op's comparison over the complete run pairs (the same observations on both sides). -> {vendor: stats, cua:
// stats, deltaPct, beat: true|false|null, provisional, partial: {vendor, cua}, account}; beat null when not qualified;
// `partial` every eligible reading's stats, partial runs included, and `provisional` the beat they would give: shown as
// diagnostics, never counted.
export function judgeSpeed(vendorRows, cuaRows, {required = 1, pairable = all, planned = unknown} = {}) {
  const {complete, partial, cuaCause} = measuredRuns(vendorRows, cuaRows, pairable, planned);
  const account = accountOf(vendorRows, cuaRows, cuaCause, {required, pairable, planned});
  const times = (rows, runs) => rows.filter(r => !causeOf(r) && runs.has(runOf(r))).map(r => r.inCellMs);
  const vendor = stats(times(vendorRows, complete)), cua = stats(times(cuaRows, complete));
  const seen = {vendor: stats(times(vendorRows, partial)), cua: stats(times(cuaRows, partial))};
  return {vendor, cua, deltaPct: vendor && cua ? round(((cua.median - vendor.median) / vendor.median) * 100) : null,
    beat: account.qualifies ? beatOf(vendor, cua) : null, provisional: beatOf(seen.vendor, seen.cua), partial: seen, account};
}

// One finding row's samples on the complete run pairs, as speed's. -> {vendor: [row], cua: [row], account}.
export function findingSamples(vendorRows, cuaRows, {required = 1, pairable = all, planned = unknown} = {}) {
  const {complete, cuaCause} = measuredRuns(vendorRows, cuaRows, pairable, planned);
  const kept = rows => rows.filter(r => !causeOf(r) && complete.has(runOf(r)));
  return {vendor: kept(vendorRows), cua: kept(cuaRows), account: accountOf(vendorRows, cuaRows, cuaCause, {required, pairable, planned})};
}
