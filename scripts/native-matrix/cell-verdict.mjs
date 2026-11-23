// One judged cell of the native matrix (a row id: a method case, a speed op, a probe or Unicode row) from both engines'
// samples, for the judge (./summary.mjs). What a sample needs to have a verdict is ./front-key.mjs's (its readings, the
// harness's invalid reason); what a cua sample needs beside it is decided here:
// - No valid pair, no verdict (ruling 1116): where the verdict rests on the vendor's answer (a frontmost method row,
//   whose reference is the vendor's outcome sample for sample; the pressKey row, where the engines must compose alike;
//   speed and finding, compared; a declared departure, which needs the vendor's ok) a cua sample with no vendor sample
//   with a verdict from the same run is `unpaired`: it has no verdict, never equal and never worse.
// - A declared departure (./departures.mjs) covers a cua sample that answered as declared beside the vendor's ok of the
//   same run, the row's own effect check and interference reading holding on both sides; the cell is then `declared`.
// - A cell qualifies when each engine has at least `required` runs (the triple's three) every sample of which has a
//   verdict. A cell that does not qualify has no verdict unless a sample proved it worse.
// The verdicts: worse (a sample proven worse, or the pressKey row composing otherwise on the vendor), no-verdict (no
// counted cua sample, or not qualified), declared, better, equal.
import {stats} from '../native-baseline/summary.mjs';
import {answeredAs, vendorAnsweredOk} from './departures.mjs';
import {sampleCause} from './front-key.mjs';

const round = n => (n === null || n === undefined ? null : Math.round(n * 10) / 10);
export const BEAT = 0.9;
// The run a sample belongs to: the judge tags every full run's rows with meta.run; a row judged alone pairs by sample.
export const runOf = row => row.run ?? row.sample ?? 1;
const passes = row => row.ok === true;
const causeOf = row => sampleCause(row)?.category ?? null;
const groupBy = (items, key) => { const out = new Map(); for (const item of items) { const k = key(item); if (!out.has(k)) out.set(k, []); out.get(k).push(item); } return out; };

// Both sides' samples with and without a verdict. `cuaCause(row)`: a cua sample's cause (its own, or unpaired).
// -> {vendor: {verdicts, runs, noVerdict: {category: n}}, cua: {…}, qualifies}.
export function accountOf(vendorRows, cuaRows, cuaCause, required) {
  const side = (rows, cause) => {
    const noVerdict = {};
    for (const r of rows) { const c = cause(r); if (c) noVerdict[c] = (noVerdict[c] ?? 0) + 1; }
    const runs = [...groupBy(rows, runOf).values()].filter(list => list.every(r => !cause(r))).length;
    return {verdicts: rows.filter(r => !cause(r)).length, runs, noVerdict};
  };
  const vendor = side(vendorRows, causeOf), cua = side(cuaRows, cuaCause);
  return {vendor, cua, qualifies: vendor.runs >= required && cua.runs >= required};
}

// One cell's verdict. `mode`: 'reference' (a frontmost method row), 'own' (its own outcome: a background method row, a
// launch, probe or Unicode row; the vendor's recorded beside it) or 'pressKey' (ruling 1119). `departure`: the row's
// declared departure, if any; `oracle(row)`: whether the row is one the non-interference oracle judges.
// -> {verdict, vendor: {ok, valid, invalid}, cua: {…}, declared, routes, account, differs?}.
export function judgeCell(mode, vendorRows, cuaRows, {departure = null, required = 1, oracle = () => false} = {}) {
  const vendorByRun = groupBy(vendorRows.filter(r => !causeOf(r)), runOf);
  const held = r => !oracle(r) || r.interference?.ok === true;
  const outcomes = new Map();
  for (const c of cuaRows) {
    const own = causeOf(c);
    if (own) { outcomes.set(c, own); continue; }
    const v = vendorByRun.get(runOf(c))?.[0] ?? null;
    if (passes(c)) {
      outcomes.set(c, mode !== 'own' && !v ? 'unpaired' : v && !passes(v) && mode !== 'pressKey' ? 'better' : 'equal');
      continue;
    }
    if (departure) {
      const {answered, effect} = answeredAs(departure, c);
      if (answered && !v) { outcomes.set(c, 'unpaired'); continue; }
      if (answered && vendorAnsweredOk(v) && held(v) && held(c) && effect) { outcomes.set(c, 'declared'); continue; }
    }
    outcomes.set(c, mode === 'reference' ? (!v ? 'unpaired' : passes(v) ? 'worse' : 'equal') : 'worse');
  }
  const VERDICTS = ['worse', 'equal', 'better', 'declared'];
  const cuaCause = r => (VERDICTS.includes(outcomes.get(r)) ? null : outcomes.get(r));
  const account = accountOf(vendorRows, cuaRows, cuaCause, required);
  const counted = cuaRows.filter(r => !cuaCause(r)), vendorCounted = vendorRows.filter(r => !causeOf(r));
  const has = o => counted.some(r => outcomes.get(r) === o);
  const differs = mode === 'pressKey' && !has('worse') && vendorCounted.some(r => !passes(r));
  const verdict = has('worse') || differs ? 'worse' : !counted.length || !account.qualifies ? 'no-verdict' : has('declared') ? 'declared' : has('better') ? 'better' : 'equal';
  const tally = (rows, all) => ({ok: rows.filter(passes).length, valid: rows.length, invalid: all.length - rows.length});
  // The routes that carried each action, whether or not its sample found a pair.
  const routes = {vendor: [...new Set(vendorCounted.map(r => r.inputRoute ?? null))], cua: [...new Set(cuaRows.filter(r => !causeOf(r)).map(r => r.inputRoute ?? null))]};
  return {verdict, vendor: tally(vendorCounted, vendorRows), cua: tally(counted, cuaRows), declared: counted.filter(r => outcomes.get(r) === 'declared').length, routes, account,
    ...(differs ? {differs: true} : {})};
}

// One method row's verdict: frontmost against the vendor's outcome, background against the fixture's ground truth.
export const judgeMethod = (regime, vendorRows, cuaRows, options) => judgeCell(regime === 'frontmost' ? 'reference' : 'own', vendorRows, cuaRows, options);

// pressKey's r k (ruling 1119): composed by the active input method, so judged on the raw outcomes of both engines,
// never on a declaration. A counted cua sample that did not read the expected text fails the row; a vendor sample with a
// verdict that did not, the engines composing differently, fails it too (`differs`), whatever cua's samples were.
export const judgePressKey = (vendorRows, cuaRows, options) => judgeCell('pressKey', vendorRows, cuaRows, options);

// One speed op's comparison over the samples with a verdict, a cua sample paired by run (its run's vendor samples of the
// op having one). -> {vendor: stats, cua: stats, deltaPct, beat: true|false|null, provisional, account}; beat null when
// unmeasured or not qualified, `provisional` then what the samples measured would give (shown, never counted).
export function judgeSpeed(vendorRows, cuaRows, {required = 1} = {}) {
  const vendorRuns = new Set(vendorRows.filter(r => !causeOf(r)).map(runOf));
  const cuaCause = r => causeOf(r) ?? (vendorRuns.has(runOf(r)) ? null : 'unpaired');
  const account = accountOf(vendorRows, cuaRows, cuaCause, required);
  const times = (rows, cause) => rows.filter(r => !cause(r)).map(r => r.inCellMs);
  const vendor = stats(times(vendorRows, causeOf)), cua = stats(times(cuaRows, cuaCause));
  if (!vendor || !cua) return {vendor, cua, deltaPct: null, beat: null, provisional: null, account};
  const beat = cua.median <= BEAT * vendor.median && cua.p95 <= vendor.p95;
  return {vendor, cua, deltaPct: round(((cua.median - vendor.median) / vendor.median) * 100), beat: account.qualifies ? beat : null, provisional: beat, account};
}

// One finding row's samples with a verdict, paired as speed's are. -> {vendor: [row], cua: [row], account}.
export function findingSamples(vendorRows, cuaRows, {required = 1} = {}) {
  const vendorRuns = new Set(vendorRows.filter(r => !causeOf(r)).map(runOf));
  const cuaCause = r => causeOf(r) ?? (vendorRuns.has(runOf(r)) ? null : 'unpaired');
  return {vendor: vendorRows.filter(r => !causeOf(r)), cua: cuaRows.filter(r => !cuaCause(r)), account: accountOf(vendorRows, cuaRows, cuaCause, required)};
}
