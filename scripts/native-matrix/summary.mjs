// The native matrix's judgment and report (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification
// system parts 4 and 5, Acceptance 7; the M4/M5 pre-flight's §7, "The judge's rule for a row that differs", "No valid
// pair, no verdict" and "The three-point report"): every CellResult under one or more directories (./cell-result.mjs; the
// matrix's own runs and any cell implemented elsewhere, M2a's residue on the live harness, M2b.3's probe cells), pooled by
// engine, judged and written as the report. `native-matrix.mjs summary <dir>` writes summary.md; `compare <vendor-dir>
// <cua-dir>` prints the verdict; both judge alike (judge).
//
// The rules (each cell's verdict from both engines' samples is ./cell-verdict.mjs's):
// - A sample has a verdict only with good front/key readings and no invalid reason (./front-key.mjs: an alert front or
//   key, a failed activate step, a hosted run's sample without readings, rulings 1136 and 1141). A sample without one is
//   NO VERDICT: never a pass, never a fail, counted per cell by its cause.
// - No valid pair, no verdict (ruling 1116): where the verdict rests on the vendor's answer, a cua sample with no vendor
//   sample with a verdict from the same run has none. Only a run whose pair is one proof (pairableRuns: one vendor and
//   one cua run, one hold, one commit, one approved build, one device, one OS, and on a hosted runner one job's run) is
//   compared or lets a departure find its
//   vendor ok; speed and finding compare the same complete run pairs on both sides.
// - Shared limits (ruling 1144, the fixed-string rows only: a Unicode row judged by its absolute expected string, and
//   the pressKey row): a cua sample that failed the same way as its paired vendor sample (the same answer, the same
//   read-back, the user's value kept on both) is equal and listed apart under "Shared limits (vendor has them too)",
//   each observation by its own cause; the vendor passing a sample whose cua pair failed fails the row; cua refusing or
//   answering unconfirmed where the vendor gave a false ok, its recorded effect allowing that answer, is better. An
//   acceptance row is absolute: no shared limit or departure satisfies it. The mid-switch row is judged by the prefix
//   it measured, as a background row is by its own outcome.
// - A cell qualifies with three complete run pairs (RUNS_PER_SIDE): runs whose pair is one proof, both sides holding the
//   planned samples, every one with a verdict. One that does not has no verdict, and the manifest's cells that do not
//   qualify are missing proof (the manifest is checked for validity, not only presence). A partial run's samples are
//   diagnostics.
// - Method rows (section 'method', id `<target>/<regime>/<method>.<case>`). Frontmost: the vendor's outcome is the
//   reference, sample for sample (the run number): cua is worse on a sample where the vendor passed and cua did not, or
//   where both failed otherwise than the same answer with every effect field its case recorded alike; better where cua
//   passed and the vendor did not; cua refusing where the vendor answered ok needs a declared departure. Background:
//   the fixture's ground truth is the reference. Differs is
//   judged on the row's own check (`ok`): cua answering ok with its effect verified where the vendor failed is better
//   (S L225, "equal or better"); cua answering ok where the reference is a refusal fails its check. The caret rows of
//   #258 and #259 (./caret.mjs) are frontmost rows whose two passes are equal only with the same reading of the field's
//   range (./cell-verdict.mjs 'reading'), and no departure may name them.
// - The declared departures (R3 as ruled 1108, ./departures.mjs): cua refused or answered unconfirmed where the vendor
//   answered ok, the pair observed, each entry citing its Decision Log entry; listed under "What changes for a user".
//   Everything else that differs fails; an entry of another kind is itself a failure; one no sample needed is named for
//   the owner. A declaration carried on a full run's own row excuses nothing (the file is the one place).
// - Speed rows (section 'speed', id `<scene>/<op>`, ok meaning measured): the in-cell medians and p95s over the complete
//   run pairs (a partial run's readings shown as diagnostics only), the beat being
//   cua's median at most 90% of the vendor's with its p95 not worse; a missed beat is the owner's fork at M5, not a failure.
// - Finding rows (section 'finding', ok meaning measured): per scene the targets resolved (in every counted sample), the
//   titled share and the ID count (medians); cua not lower on any measure and its resolved sum higher passes; not lower
//   with the sum equal is parity, the owner's call; lower on any measure fails.
// - Interference (the `interference` of background method rows, launch rows, concurrent-use rows and the Unicode
//   matrix's rows behind a user window, on samples with a verdict): cua at 100%, a row with a declared cause (a
//   self-activating family, an accepted route 4) listed for the owner rather than passed; the vendor's score beside it.
// - Launch rows (section 'launch'): the launch worked (`ok`) judged as a background method row is.
// - The probe cells (sections 'concurrent' and 'intervention', ./probe-run.mjs): each judged against its own outcome as
//   a background method row is. The Korean and Unicode matrix ('unicode', ./unicode-run.mjs): against its absolute
//   expected string, a failure compared with its paired vendor sample (ruling 1144); the mid-switch row against its own
//   measured prefix. The pressKey row
//   (r k, ruling 1119) is judged on both engines' raw outcomes (./cell-verdict.mjs judgePressKey), and no departure may
//   name it; under Korean each engine is judged against ruling 1119's oracle 가 (ruling 1219), so the vendor composing
//   otherwise fails the vendor alone, listed as a declared departure where cua is right.
// - Not judged (./not-judged.mjs; rulings 1119 and 1222: the per-context rows, #577, and the Open panel's search row,
//   #588, by section and id; and a not-interfering failure cua shares with its paired vendor sample, a defect with its
//   ticket or the venue's on its recorded evidence): outside the manifest and every judgment, listed under "Not judged"
//   with their reason and their ticket or evidence. An entry with neither is missing proof instead (ruling 1222).
// - Any other cell (the settle cell, M2a's residue): each cell's verdict per engine as its rows give it
//   (./cell-result.mjs verdictOf), listed.
//
// What counts (the proof): only the whole matrix's results (cell 'matrix', meta.planId 'full') feed the tables; a
// narrowed matrix cell is listed and not counted. The full runs must form one proof: at least RUNS_PER_SIDE complete,
// attested runs per engine, one device, one OS, one host and one engine build per engine; each run number's vendor and
// cua runs one hold, one commit and one approved engine build; no (section, id, engine, sample) twice; every row of the
// manifest (./manifest.mjs) in every run, built only from a run whose own metadata says what it holds; every judged
// cell qualifying; every counted background or launch row carrying its oracle reading; the shared device mode, the
// default, wherever a run records its mode (meta.desktopMode); every full run's lane attesting the side it measured
// (ruling 1149: a cua run answered by the vendor's engine, state 1, is named and its rows not judged). Whatever is
// missing is NO VERDICT, which blocks M5 as a failure does but is not one. What the matrix does not run on a shared Mac
// (./plan.mjs OWNER_OPTIONS) is listed as the owner's option, outside the verdict.
//
// The verdict: FAIL when something was judged worse, lower or interfering, or the departures file holds an entry of
// another kind; else NO VERDICT when proof is missing; else OWNER when only the owner's calls remain; else PASS (the
// declared departures listed beside it).
import {stats} from '../native-baseline/summary.mjs';
import {isOsRecord, readCellResults} from './cell-result.mjs';
import {findingSamples, judgeCell, judgeRemeasured, judgeSpeed, remeasuredStats, runOf} from './cell-verdict.mjs';
import {noteLine, readCapabilityNotes} from './capability-notes.mjs';
import {composingRetriesOf, renderComposingRetries} from './composing-retries.mjs';
import {acceptanceExceeded, acceptedMissProblems, departureProblems, readAcceptedMisses, readDepartures, usableAcceptedMisses, usableDepartures, vendorAnsweredOk} from './departures.mjs';
import {SCENES} from '../repl-parity/scenes-mac.mjs';
import {NO_VERDICT_CAUSES, sampleCause} from './front-key.mjs';
import {cellsOf, manifestOf, SPEED_OPS} from './manifest.mjs';
import {caseId, casesOf, ENGINE_METHOD, isCaretRow, isPointerdownRow, METHODS, methodTimingId, NOT_APPLICABLE, OWN_EFFECT_IDS, OWNER_OPTIONS, pointerdownReference, TARGETS} from './plan.mjs';
import {MATRIX_CELLS} from './registry.mjs';
import {filteredPlan, FULL_PLAN, SPEED_CONTROL_IDS, SPEED_EXTRA_IDS} from './run.mjs';
import {exclusionOf, NOT_JUDGED_RULES, notJudgedRefusal, notJudgedRuleOf} from './not-judged.mjs';
import {CONDITIONS, isAcceptanceRow, isMidSwitchRow, isPressKeyRow, NOT_JUDGED, PRESS_KEY, UNICODE_FIELDS, unicodeRowsOf} from './unicode-plan.mjs';
import {runnerKey, runnerProblems} from '../hosted-sittings/runner.mjs';
import {frameAsymmetry, panelFrameSplits} from '../hosted-sittings/venue.mjs';
import {classifyAttestation, classifyAttestedRecord} from '../probe/lib.mjs';

export {BEAT, judgeMethod, judgePressKey, judgeSpeed} from './cell-verdict.mjs';
export {manifestOf, SPEED_OPS} from './manifest.mjs';
export const RUNS_PER_SIDE = 3;
export const SHARED_MODE = 'shared';
const SCENE_IDS = ['textedit', 'finder', 'chrome', 'electron'];
const round = n => (n === null || n === undefined ? null : Math.round(n * 10) / 10);
const SECTION_NAMES = {method: 'method', launch: 'launch', concurrent: 'concurrent use', intervention: 'intervention', unicode: 'unicode'};

// Every CellResult under `dirs`, with what keeps any of them from being read. -> {results: [{path, result}], problems}.
export function readResults(dirs) {
  const results = [], problems = [];
  for (const dir of dirs) for (const {path, result, problems: own} of readCellResults(dir)) {
    if (own.length) problems.push(`${dir}/${path}: ${own.join('; ')}`);
    else results.push({path: `${dir}/${path}`, result});
  }
  return {results, problems};
}

// A not-judged row's samples; of the invalid, those the owner's input values (ruling 1188) or the runner's input
// sources (ruling 1189) left without a reading, when there are any: out of the verdict, still reported.
const sampleCounts = rows => {
  const valid = rows.filter(r => !r.invalid), owned = rows.filter(r => r.ownerInput).length, venue = rows.filter(r => r.venueInput).length;
  return {ok: valid.filter(r => r.ok === true).length, valid: valid.length, invalid: rows.length - valid.length, ...(owned ? {ownerInput: owned} : {}), ...(venue ? {venue} : {})};
};
// Every not-judged row of the plan and any other not-judged row a run recorded (./not-judged.mjs: by section and id,
// never by a row's own mark), with its rule's condition, cause and ticket and what each engine read; `recorded` is false
// for a row of the plan no lane recorded. -> [{id, section, condition, cause, ticket?, recorded, vendor: {ok, valid,
// invalid, ownerInput?, venue?}, cua: {…}}], by id.
function notJudgedOf(excluded, plan = FULL_PLAN, rules = NOT_JUDGED_RULES) {
  // A filtered plan's (a proof run's, ruling 1248) are its listed cells' alone.
  const candidates = [...unicodeRowsOf(plan.unicode ?? {fields: [], conditions: []}).map(r => ({section: 'unicode', id: r.id})),
    ...plan.frontmost.flatMap(t => casesOf(t, 'frontmost').map(c => ({section: 'method', id: caseId(t, 'frontmost', c)}))),
    ...plan.background.flatMap(({driven, user}) => casesOf(driven, 'background').map(c => ({section: 'method', id: caseId(driven, 'background', c, user)}))),
    ...(plan.speed ? plan.frontmost.flatMap(t => casesOf(t, 'frontmost').map(c => ({section: 'speed', id: methodTimingId(t, c)}))) : [])]
    .filter(r => !plan.only || plan.only.has(`${r.section} ${r.id}`));
  const entryOf = r => {
    const rule = notJudgedRuleOf(r, rules);
    return {id: r.id, section: r.section, condition: rule.condition, cause: rule.cause, ...(rule.ticket ? {ticket: rule.ticket} : {})};
  };
  const planned = candidates.filter(r => notJudgedRuleOf(r, rules)).map(entryOf);
  const same = (a, b) => a.section === b.section && a.id === b.id;
  const others = [...new Map(excluded.filter(r => !planned.some(p => same(p, r))).map(r => [`${r.section} ${r.id}`, entryOf(r)])).values()];
  return [...planned, ...others].map(entry => {
    const mine = excluded.filter(r => same(r, entry));
    return {...entry, recorded: mine.length > 0, ...Object.fromEntries(['vendor', 'cua'].map(engine => [engine, sampleCounts(mine.filter(r => r.engine === engine))]))};
  }).sort((a, b) => a.id.localeCompare(b.id));
}

// What a full run's own metadata must say before its manifest can be built. -> [sentence].
function metadataProblems(result) {
  const out = [];
  const positive = n => Number.isSafeInteger(n) && n > 0;
  if (!positive(result.meta?.run)) out.push('meta.run is not a positive run number');
  if (!positive(result.meta?.samples)) out.push('meta.samples is not a positive sample count');
  const lane = result.lanes?.[0];
  if (result.lanes?.length !== 1) out.push('a full run measures exactly one lane');
  if (!['vendor', 'cua'].includes(lane?.host)) out.push('its lane names no host');
  if (typeof lane?.build !== 'string' || !lane.build || typeof lane?.version !== 'string' || !lane.version) out.push('its lane carries no attested build and version');
  return out;
}

// Ruling 1149: whether a full run attests the side it measured, the engine its run requested
// (meta.nativeEngine.requested, ./run.mjs), else the one engine its rows name. Every answer the run kept
// (meta.nativeEngine {attested, unattested}) is classed, since the lane names only the first (scripts/probe/lib.mjs
// classifyAttestedRecord: a vendor answer anywhere on the cua side is state 1, a result left unattested is missing); a run
// that kept none is classed by its lane. -> null, or the problem. A run whose lane or side cannot be read is left to
// metadataProblems.
export function unmeasuredSide(result) {
  const engines = [...new Set(result.rows.map(r => r.engine))];
  const kept = result.meta?.nativeEngine;
  const side = kept?.requested ?? (engines.length === 1 ? engines[0] : null);
  const lane = result.lanes?.[0];
  if (!side) return null;
  if (Array.isArray(kept?.attested)) return classifyAttestedRecord(kept, {engine: side}).problem;
  return lane ? classifyAttestation(lane, {engine: side}).problem : null;
}

// The full runs by run number, in order. -> [[n, [entry]]].
const runsByNumber = full => {
  const byRun = new Map();
  for (const entry of full) if (Number.isSafeInteger(entry.result.meta?.run)) byRun.set(entry.result.meta.run, [...(byRun.get(entry.result.meta.run) ?? []), entry]);
  return [...byRun].sort(([a], [b]) => a - b);
};

// What keeps run `n`'s vendor and cua runs from being one pair: each engine's run there, one hold, one commit, one
// approved engine build (the bundle every lane's probes run), one device and one OS, each recorded on every run of the
// pair (a non-empty string; the OS a whole record, ./cell-result.mjs isOsRecord, compared field by field), since values
// absent on both sides are not one shared value; and when either run is hosted, one job's run (the runner each run's
// device attested). -> [sentence].
// An OS record by its fields, in one order. -> string.
const osKey = os => JSON.stringify([os.name, os.version, os.build]);
function pairProblems(n, list) {
  const out = [];
  const has = engine => list.some(({result}) => result.lanes[0]?.engine === engine);
  if (!has('cua')) out.push(`run ${n} has no cua full run: its samples cannot be compared with the vendor's`);
  if (!has('vendor')) out.push(`run ${n} has no vendor full run: its samples cannot be compared with cua's`);
  const shared = (what, field, values, {measured = 'in one hold', valid = v => typeof v === 'string' && v.length > 0, key = v => JSON.stringify(v)} = {}) => {
    if (values.some(v => !valid(v))) { out.push(`run ${n}: a run records no ${what} (${field}): its pair cannot be shown to share one`); return; }
    const seen = [...new Set(values.map(key))];
    if (seen.length > 1) out.push(`run ${n}'s vendor and cua runs name more than one ${what} (${seen.join(', ')}): a pair is measured ${measured}`);
  };
  shared('hold', 'meta.sitting', list.map(({result}) => result.meta?.sitting));
  shared('commit', 'meta.commit', list.map(({result}) => result.meta?.commit));
  shared('approved engine build', 'meta.nativeEngine.approved', list.map(({result}) => result.meta?.nativeEngine?.approved?.build));
  shared('device', 'device', list.map(({result}) => result.device), {measured: 'on one device'});
  shared('OS', 'meta.os {name, version, build}', list.map(({result}) => result.meta?.os),
    {measured: 'on one OS', valid: isOsRecord, key: osKey});
  // On a GitHub-hosted runner the device alias names every runner alike: the pair is one job's run, by the runner each
  // run's device attested (meta.runner, ../hosted-sittings/runner.mjs).
  if (list.some(({result}) => result.meta?.hosted === true))
    shared('hosted runner', 'meta.runner', list.map(({result}) => hostedRunnerKey(result.meta)), {measured: 'in one job\'s run'});
  // Ruling 1169: both sides of a pair stand on one frame (the venue each launched on, every window each read back); a
  // pair that did not is no pair, its samples unpaired and so no verdict, whatever either side's rows say.
  const apart = frameSplit(list);
  if (apart) out.push(`run ${n}'s vendor and cua runs did not stand on one frame (${apart}): a pair is measured on one frame (ruling 1169)`);
  return out;
}
// Ruling 1169: how run `list`'s vendor and cua runs stood on different frames (../hosted-sittings/venue.mjs
// frameAsymmetry), or null when they stood on one.
function frameSplit(list) {
  const side = engine => list.find(({result}) => result.lanes[0]?.engine === engine)?.result;
  return frameAsymmetry(side('cua'), side('vendor'));
}
// The run numbers whose vendor and cua runs stood on different frames, with how. Every row of such a run, on either
// side, is NO VERDICT `venue` (./front-key.mjs sampleCause): not only unpaired, so no rule that judges a cua sample on
// its own (a proven change of the user's value, an `own` or acceptance row, the oracle's interference reading) and no
// vendor sample (pressKey's `differs`) can fail the matrix from a pair that was no pair. -> Map(run -> asymmetry).
export const splitFrameRuns = full => new Map(runsByNumber(full).map(([n, list]) => [n, frameSplit(list)]).filter(([, apart]) => apart));
// The panel openings whose placements a run's vendor and cua sides read apart, paired by opening
// (../hosted-sittings/venue.mjs panelFrameSplits). -> Map(run -> Map(opening -> how)).
export function splitPanelRuns(full) {
  const side = (list, engine) => list.find(({result}) => result.lanes[0]?.engine === engine)?.result;
  return new Map(runsByNumber(full).map(([n, list]) => [n, panelFrameSplits(side(list, 'cua'), side(list, 'vendor'))]).filter(([, apart]) => apart.size));
}

// The run a hosted result's runner names, or null when it records none that is whole.
const hostedRunnerKey = meta => (meta?.runner && !runnerProblems(meta.runner).length ? runnerKey(meta.runner) : null);

// The run numbers whose pair is one proof: exactly one vendor and one cua full run, with no pair problem. Only these
// runs' vendor samples answer for cua's (./cell-verdict.mjs `pairable`). -> Set.
export function pairableRuns(full) {
  const count = (list, engine) => list.filter(({result}) => result.lanes[0]?.engine === engine).length;
  return new Set(runsByNumber(full).filter(([n, list]) => count(list, 'vendor') === 1 && count(list, 'cua') === 1 && !pairProblems(n, list).length).map(([n]) => n));
}

// Whether the full runs are one proof (the module's header), apart from each cell's qualification. -> [missing proof,
// each a sentence].
// C2 of the split review (ruling 1228): sitting C split into one job per run number. When every full run is hosted, all
// of one workflow run at one harness commit, on more than one runner (each job its own VM, an attempt or an image build
// apart), the runners and OS by run number are reported instead of held to one across runs; each pair is still held to
// one runner and one OS (pairProblems), and the engines' builds to one across runs. -> [{run, runner, os}] or null.
export function splitJobRunners(full) {
  if (!full.length || !full.every(({result}) => result.meta?.hosted === true && hostedRunnerKey(result.meta))) return null;
  const one = pick => new Set(full.map(({result}) => pick(result))).size === 1;
  if (!one(r => r.meta.runner.run.id) || !one(r => r.meta?.commit) || one(r => hostedRunnerKey(r.meta))) return null;
  const osText = os => (isOsRecord(os) ? `${os.name} ${os.version} (${os.build})` : 'no OS recorded');
  return runsByNumber(full).map(([run, list]) => ({run, runner: hostedRunnerKey(list[0].result.meta), os: osText(list[0].result.meta?.os)}));
}
export const renderRunners = runners => (runners ? ['## Runners by run (sitting C split into jobs, ruling 1228)', '',
  'Each run\'s pair stood on one runner; the runs did not need to.', '', ...runners.map(r => `- run ${r.run}: ${r.runner}; ${r.os}`), ''] : []);

export function proofProblems(full, plan = FULL_PLAN) {
  const missing = [];
  const one = (what, values) => {
    const seen = [...new Set(values.map(v => JSON.stringify(v ?? null)))];
    if (seen.length > 1) missing.push(`the full runs name more than one ${what} (${seen.join(', ')}): one proof's runs are judged together`);
  };
  const split = splitJobRunners(full);
  one('device', full.map(({result}) => result.device));
  if (!split) one('OS', full.map(({result}) => (isOsRecord(result.meta?.os) ? osKey(result.meta.os) : result.meta?.os)));
  if (!split && full.some(({result}) => result.meta?.hosted === true)) one('hosted runner', full.map(({result}) => hostedRunnerKey(result.meta)));
  for (const [n, list] of runsByNumber(full)) missing.push(...pairProblems(n, list));
  for (const engine of ['vendor', 'cua']) {
    const mine = full.filter(({result}) => result.lanes[0]?.engine === engine);
    one(`host for the ${engine} engine`, mine.map(({result}) => result.lanes[0].host));
    one(`build of the ${engine} engine`, mine.map(({result}) => [result.lanes[0].build, result.lanes[0].version]));
    const attested = mine.filter(({result}) => result.complete && result.lanes[0].build);
    if (attested.length < RUNS_PER_SIDE) missing.push(`runs: ${attested.length} complete, attested full matrix run(s) on ${engine}, ${RUNS_PER_SIDE} are the rule`);
    const runs = mine.map(({result}) => result.meta?.run);
    const twice = runs.filter((n, i) => runs.indexOf(n) !== i);
    if (twice.length) missing.push(`the ${engine} engine's full runs repeat run number(s) ${[...new Set(twice)].join(', ')}: two lanes' runs cannot be told apart sample for sample`);
    for (const {path, result} of mine) {
      const unusable = metadataProblems(result);
      if (unusable.length) { missing.push(`${path}: ${unusable.join('; ')}: its rows cannot be checked against the manifest`); continue; }
      const have = new Set(result.rows.map(r => `${r.section} ${r.id} ${r.sample}`));
      const absent = manifestOf({run: result.meta?.run, samples: result.meta?.samples}, plan).filter(e => !have.has(`${e.section} ${e.id} ${e.sample}`));
      if (absent.length) missing.push(`${path}: ${absent.length} row(s) of the manifest missing (${absent.slice(0, 3).map(e => `${e.section} ${e.id}#${e.sample}`).join(', ')}${absent.length > 3 ? ', …' : ''})`);
    }
  }
  const keys = full.flatMap(({result}) => result.rows.map(r => `${r.section} ${r.id} ${r.engine} ${r.sample}`));
  const repeated = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
  if (repeated.length) missing.push(`${repeated.length} row(s) appear twice in the full runs (${repeated.slice(0, 3).join(', ')}${repeated.length > 3 ? ', …' : ''})`);
  for (const [mode, n] of groupCount(full.map(({result}) => result.meta?.desktopMode).filter(m => m !== undefined && m !== SHARED_MODE))) {
    missing.push(`${n} full run(s) record the device mode ${mode}: the matrix is judged in the shared device mode (R3)`);
  }
  return missing;
}

const groupBy = (items, key) => { const out = new Map(); for (const item of items) { const k = key(item); if (!out.has(k)) out.set(k, []); out.get(k).push(item); } return out; };
const groupCount = values => [...groupBy(values, v => v)].map(([v, list]) => [v, list.length]);

// One scene's finding measures for one engine, over its samples with a verdict. -> {resolved, found, share, ids,
// targets} or null without a sample.
export function findingMeasures(rows) {
  const targets = groupBy(rows.filter(r => /\/target\./.test(r.id)), r => r.id);
  if (!targets.size) return null;
  const all = (list, key) => list.every(r => r.outcome?.[key] === true);
  const resolved = [...targets.values()].filter(list => all(list, 'resolved')).length;
  const found = [...targets.values()].filter(list => all(list, 'found')).length;
  const lines = rows.filter(r => r.id.endsWith('/lines')).map(r => (r.outcome?.lines ? r.outcome.named / r.outcome.lines : null));
  const ids = rows.filter(r => r.id.endsWith('/ids')).map(r => r.outcome?.ids);
  return {resolved, found, share: round((stats(lines)?.median ?? 0) * 1000) / 1000, ids: stats(ids)?.median ?? 0, targets: targets.size};
}

// The rows the non-interference oracle judges: background method rows, launch rows, the probe cells' concurrent-use rows
// (the user window in front, the sheet variant's among them) and the Unicode matrix's rows behind a user window.
const oracleJudges = r => (r.section === 'method' && r.regime === 'background') || r.section === 'launch' || r.section === 'concurrent'
  || (r.section === 'unicode' && r.id.split('/')[1]?.includes('@'));
// How the judge reads a cell (judge below): its judgeCell mode and the options that are the cell's own.
function cellMode(section, id) {
  if (section === 'method') {
    const regime = id.split('/')[1];
    // Ruling 1168: a pointerdown row's pair has no verdict unless the vendor's count rose by exactly one.
    return {mode: regime !== 'frontmost' ? 'own' : isCaretRow(id) ? 'reading' : 'reference', options: {reference: isPointerdownRow(id) ? pointerdownReference : null, ownEffect: OWN_EFFECT_IDS.includes(id)}};
  }
  const mode = section !== 'unicode' || isMidSwitchRow(id) ? 'own' : isPressKeyRow(id) ? 'pressKey' : 'absolute';
  // Ruling 1219: the Korean r k is judged against ruling 1119's oracle (가) on each engine, not cua against the vendor.
  return {mode, options: mode === 'pressKey' && id.includes('/korean/') ? {expected: PRESS_KEY.expected.korean} : {}};
}
// One cell's verdict on one run's pair, as the judge reads it with that run alone and no declared departure (I5 of the
// split review: combine's rerun flag, ./combine.mjs): 'fail' when cua's sample is worse or a cua oracle reading
// interfered (undeclared), else judgeCell's verdict. -> 'fail' | 'no-verdict' | 'equal' | 'better' | 'shared' | ….
export function runVerdict(section, id, vendorRows, cuaRows) {
  const {mode, options} = cellMode(section, id);
  const regime = section === 'method' ? id.split('/')[1] : undefined, tag = r => ({...r, section, id, ...(regime ? {regime: r.regime ?? regime} : {})});
  const v = vendorRows.map(tag), c = cuaRows.map(tag);
  const judged = judgeCell(mode, v, c, {...options, required: 1, oracle: oracleJudges, acceptance: isAcceptanceRow(id)});
  const interfered = c.some(r => oracleJudges(r) && !sampleCause(r) && r.interference?.ok === false && !r.interference.declared);
  return interfered || judged.verdict === 'worse' ? 'fail' : judged.verdict;
}

// Ruling 1228 (F): the speed-extra cell's samples (../native-matrix/run.mjs SPEED_EXTRA_IDS and SPEED_CONTROL_IDS), of
// the runs whose two lanes both have them, by op: the judge judges the missed ops on them alone and reports the controls
// (ruling 1232). Only as it takes a full run's samples (split review): a complete lane attesting its own side (ruling
// 1149), of a run whose full pair is one proof (`pairable`). -> Map(id -> {vendor, cua, runs}).
function speedExtrasOf(results, own, pairable = () => true) {
  const extra = results.filter(r => own(r) && r.result.cell === 'speed-extra' && r.result.meta?.planId === 'speed-extra' && r.result.complete === true
    && pairable(r.result.meta?.run) && r.result.lanes?.[0]?.engine && r.result.rows.every(row => row.engine === r.result.lanes[0].engine) && !unmeasuredSide(r.result));
  const lane = (engine, run) => extra.filter(r => r.result.lanes[0]?.engine === engine && r.result.meta?.run === run);
  const runs = [...new Set(extra.map(r => r.result.meta?.run))].filter(run => lane('vendor', run).length && lane('cua', run).length).sort((a, b) => a - b);
  const byId = new Map();
  for (const run of runs) for (const engine of ['vendor', 'cua']) for (const {result} of lane(engine, run)) for (const row of result.rows) {
    if (row.section !== 'speed' || !(SPEED_EXTRA_IDS.includes(row.id) || SPEED_CONTROL_IDS.includes(row.id))) continue;
    if (!byId.has(row.id)) byId.set(row.id, {vendor: [], cua: [], runs});
    byId.get(row.id)[engine].push(row);
  }
  return byId;
}

// The judgment of everything read. `problems`: results that could not be read, missing proof; `departures`: the
// declared-departures file's entries (./departures.mjs). -> {problems, runs, narrowed, methods, launch, speed, finding,
// findingVerdict, interference, interferencePass, probe, unicode, notJudged, departures, cells, others, owner, blocking,
// missing, options, desktop, verdict}.
// `proof` (ruling 1248 A(1)): the cells of a proof run, a filtered split with no base. Its filtered matrix runs are then
// the runs judged, pairwise and alone, never over a base: the manifest, the coverage and the missing proof are the proof
// cells' (./run.mjs filteredPlan), a row of another cell those runs hold is not counted, and every other record (a full
// run, the save sheet's, the speed extras') is listed, never counted.
export function judge(results, problems = [], {departures: entries = readDepartures(), acceptedMisses: acceptances = readAcceptedMisses(), knownDefects = KNOWN_DEFECTS, notJudgedRules = NOT_JUDGED_RULES, proof = null} = {}) {
  const plan = proof ? filteredPlan(proof) : FULL_PLAN, inPlan = row => !proof || plan.only.has(`${row.section} ${row.id}`);
  const own = ({result}) => Boolean(MATRIX_CELLS[result.cell]);
  const fullRuns = results.filter(r => own(r) && r.result.cell === 'matrix' && r.result.meta?.planId === (proof ? 'filtered' : 'full'));
  const narrowed = results.filter(r => (proof || own(r)) && !fullRuns.includes(r)).map(({path, result}) => ({path, cell: result.cell, planId: result.meta?.planId ?? null}));
  // Ruling 1149: a run whose lane attests another engine than the side it measured is no measurement of that side (the
  // cua side on the vendor's engine, state 1, would compare the vendor with itself): its rows are not judged and the
  // missing proof names it (unmeasuredSide).
  const unmeasured = fullRuns.map(entry => [entry, unmeasuredSide(entry.result)]).filter(([, problem]) => problem);
  const full = fullRuns.filter(entry => !unmeasured.some(([u]) => u === entry));
  // Each row tagged with its run's number (the pairing key), whether that run is hosted, and how its pair stood on two
  // frames when it did (`frameSplit`, ruling 1169; ./front-key.mjs): the whole run's, or a panel opening's alone for the
  // rows that opening wrote (`opening`, ./panels.mjs tagOpening).
  const split = splitFrameRuns(full), panelSplit = splitPanelRuns(full);
  // A row a filtered rerun replaced (./combine.mjs: its `evidence` one of the replacements its run records, meta.reruns)
  // stood on its rerun's frames, which combine checked: the full run's whole-run split is not its. An `evidence` no
  // recorded replacement backs is no replacement.
  const replaced = (result, row) => Boolean(row.evidence) && (result.meta?.reruns ?? []).some(r => r?.runId === row.evidence.runId && r?.attempt === row.evidence.attempt);
  const all = full.flatMap(({result}) => result.rows.filter(inPlan).map(row => ({...row, cell: result.cell, run: result.meta?.run, hosted: result.meta?.hosted === true,
    ...(split.has(result.meta?.run) && !replaced(result, row) ? {frameSplit: split.get(result.meta.run)}
      : panelSplit.get(result.meta?.run)?.has(row.opening) ? {frameSplit: `the panel opening ${row.opening}: ${panelSplit.get(result.meta.run).get(row.opening)}`} : {})})));
  // The rows a ruling put out of the judged matrix go to the not-judged list and nowhere else.
  const rows = all.filter(r => !exclusionOf(r, notJudgedRules));
  const notJudgedRows = full.length ? notJudgedOf(all.filter(r => exclusionOf(r, notJudgedRules)), plan, notJudgedRules) : [];
  const runs = {vendor: 0, cua: 0};
  for (const {result} of full) runs[result.lanes[0]?.engine] = (runs[result.lanes[0]?.engine] ?? 0) + 1;
  const missingProof = [...problems, ...unmeasured.map(([{path}, problem]) => `${path}: ${problem}; its rows are not judged`), ...proofProblems(full, plan)];
  // Marks the rules do not allow, on results that reached the judge without the reader's check: an `excluded` mark on a
  // row no ruling puts out (the row is judged as it read), a declaration on a full run's row (judged on its raw outcome).
  const misMarked = all.filter(r => r.excluded !== undefined && !exclusionOf(r, notJudgedRules)).length;
  if (misMarked) missingProof.push(`${misMarked} row(s) of the full runs are marked excluded, which only ruling 1119's per-context rows may be: they are judged as they read`);
  for (const r of rows.filter(x => x.declared !== undefined)) {
    missingProof.push(r.section === 'unicode' && isPressKeyRow(r.id)
      ? `unicode: ${r.id} on ${r.engine} (sample ${r.sample ?? 1}) carries a declaration, which no pressKey row may (ruling 1119): its raw outcome is judged`
      : `${r.section}: ${r.id} on ${r.engine} (sample ${r.sample ?? 1}) carries a declaration, which no row of the matrix may (R3: the declared-departures file is the one place): its raw outcome is judged`);
  }
  for (const {result, path} of results) {
    if (!result.complete && !narrowed.some(n => n.path === path)) missingProof.push(`${path}: ${result.cell} is ${result.verdict === 'refused' ? 'refused' : 'incomplete'}${result.problems.length ? ` (${result.problems.join('; ')})` : ''}`);
  }
  const departureFailures = [...departureProblems(entries).map(p => `departures: ${p}`), ...acceptedMissProblems(acceptances).map(p => `accepted misses: ${p}`)];
  const byRow = new Map(usableDepartures(entries).map(e => [`${e.section} ${e.id}`, e]));
  // Only a run whose pair is one proof is compared, and only there may a departure find its vendor ok (finding 1).
  const eligible = pairableRuns(full);
  const pairable = run => eligible.has(run);
  // Each cell's planned samples in a run: a scene's speed op the run's meta.samples (0 where the pair's plans differ),
  // every other row one.
  const runSamples = new Map(full.map(({result}) => [`${result.lanes[0]?.engine} ${result.meta?.run}`, result.meta?.samples]));
  const sampled = run => { const v = runSamples.get(`vendor ${run}`); return Number.isSafeInteger(v) && v === runSamples.get(`cua ${run}`) ? v : 0; };
  const plannedOf = (section, id) => (section === 'speed' && SPEED_OPS.includes(id.slice(id.indexOf('/') + 1)) ? sampled : () => 1);
  const options = section => id => ({departure: byRow.get(`${section} ${id}`) ?? null, required: RUNS_PER_SIDE, oracle: oracleJudges, pairable, planned: plannedOf(section, id), acceptance: isAcceptanceRow(id)});
  const sides = list => [list.filter(r => r.engine === 'vendor'), list.filter(r => r.engine === 'cua')];

  // Methods.
  const methods = [];
  for (const [id, list] of groupBy(rows.filter(r => r.section === 'method'), r => r.id)) {
    const [target, regime] = id.split('/');
    const {mode, options: own} = cellMode('method', id);
    methods.push({id, section: 'method', target, regime, method: list[0].method, case: list[0].case, ...judgeCell(mode, ...sides(list), {...options('method')(id), ...own})});
  }
  methods.sort((a, b) => a.id.localeCompare(b.id));

  // Speed.
  const speed = [], extras = speedExtrasOf(results, own, pairable);
  for (const [id, list] of groupBy(rows.filter(r => r.section === 'speed'), r => r.id)) {
    const [scene, op] = [id.slice(0, id.indexOf('/')), id.slice(id.indexOf('/') + 1)];
    const base = judgeSpeed(...sides(list), {required: RUNS_PER_SIDE, pairable, planned: plannedOf('speed', id)});
    // Ruling 1232: an op the full runs missed, re-measured, is judged on its re-measurement alone.
    const extra = SPEED_EXTRA_IDS.includes(id) ? extras.get(id) : undefined;
    speed.push({id, section: 'speed', scene, op, ...(extra ? judgeRemeasured(base, extra, {required: RUNS_PER_SIDE}) : base)});
  }
  speed.sort((a, b) => a.id.localeCompare(b.id));
  // Ruling 1240: a miss the owner accepted (departures.json's acceptedMisses) stays judged with its numbers and reads
  // accepted; an entry whose op did not miss applies to nothing. Ruling 1278: one whose re-measurement is worse than
  // the entry's bound is not accepted, and is the owner's with why (./departures.mjs acceptanceExceeded).
  const accepting = new Map(usableAcceptedMisses(acceptances).map(e => [e.id, e]));
  for (const s of speed) {
    if (s.beat !== false || !accepting.has(s.id)) continue;
    const entry = accepting.get(s.id), exceeded = acceptanceExceeded(entry, s);
    if (exceeded) s.acceptanceExceeded = {ticket: entry.ticket, ...exceeded};
    else s.accepted = {ticket: entry.ticket, ruling: entry.ruling};
  }
  const acceptedMisses = speed.filter(s => s.accepted).map(s => ({section: 'speed', id: s.id, ...s.accepted, vendor: s.vendor, cua: s.cua, deltaPct: s.deltaPct, ...(s.remeasured ? {remeasured: s.remeasured} : {})}));
  // Ruling 1232: the controls' re-measurement beside their base, never judged (their full runs' judgment stands).
  const speedControls = [...SPEED_CONTROL_IDS].sort().filter(id => extras.has(id)).map(id => {
    const judged = speed.find(s => s.id === id);
    return {id, scene: id.slice(0, id.indexOf('/')), op: id.slice(id.indexOf('/') + 1), ...remeasuredStats(extras.get(id)),
      base: {vendor: judged?.vendor ?? null, cua: judged?.cua ?? null, deltaPct: judged?.deltaPct ?? null, beat: judged?.beat ?? null}};
  });

  // Finding: each row's samples with a verdict, then per scene.
  const findingRows = [];
  for (const [id, list] of groupBy(rows.filter(r => r.section === 'finding'), r => r.id)) findingRows.push({id, section: 'finding', ...findingSamples(...sides(list), {required: RUNS_PER_SIDE, pairable, planned: plannedOf('finding', id)})});
  const finding = SCENE_IDS.map(scene => {
    const mine = findingRows.filter(f => f.id.startsWith(`${scene}/`));
    return {scene, vendor: findingMeasures(mine.flatMap(f => f.vendor)), cua: findingMeasures(mine.flatMap(f => f.cua)), qualifies: mine.every(f => f.account.qualifies)};
  }).filter(f => f.vendor || f.cua);
  const measured = finding.filter(f => f.vendor && f.cua);
  const lower = measured.filter(f => ['resolved', 'share', 'ids'].some(k => f.cua[k] < f.vendor[k]));
  const sum = engine => measured.reduce((n, f) => n + f[engine].resolved, 0);
  // Lower on the paired samples is shown whether or not every row qualifies, as a method sample proven worse is.
  // A proof run measures no finding elements: they are not in its proof.
  const findingVerdict = proof ? 'not in the proof' : !measured.length || measured.length < finding.length ? 'no-verdict' : lower.length ? 'fail' : finding.some(f => !f.qualifies) ? 'no-verdict'
    : sum('cua') > sum('vendor') ? 'pass' : 'parity';

  // Interference, on the oracle's rows with a verdict; one without its reading is missing proof.
  const applicable = r => oracleJudges(r) && !sampleCause(r);
  for (const engine of ['vendor', 'cua']) {
    const unread = rows.filter(r => r.engine === engine && applicable(r) && !r.interference).length;
    if (unread) missingProof.push(`not interfering: ${unread} valid background or launch row(s) on ${engine} carry no oracle reading`);
  }
  const judgedRows = engine => rows.filter(r => r.engine === engine && applicable(r) && r.interference);
  const interference = Object.fromEntries(['vendor', 'cua'].map(engine => {
    const list = judgedRows(engine);
    const declared = r => r.interference.declared;
    return [engine, {rows: list.length, ok: list.filter(r => r.interference.ok).length, route4: list.filter(r => r.interference.route4 && declared(r)?.kind !== 'route4-accepted').length,
      declared: list.filter(r => !r.interference.ok && declared(r)).map(r => ({id: r.id, ...declared(r)})),
      failed: list.filter(r => !r.interference.ok && !declared(r)).map(r => ({id: r.id, frontmost: r.interference.frontmost, topWindow: r.interference.topWindow, focus: r.interference.focus ?? null,
        activations: r.interference.activations, route4: r.interference.route4, ...(r.interference.windowOrder ? {windowOrder: r.interference.windowOrder} : {})}))}];
  }));

  // The launch path, the probe cells and the Unicode matrix, each against its own outcome; the pressKey row by its rule.
  const byOwnOutcome = sections => {
    const out = [];
    for (const [id, list] of groupBy(rows.filter(r => sections.includes(r.section)), r => r.id)) {
      const section = list[0].section;
      const {mode, options: own} = cellMode(section, id);
      out.push({id, section, ...judgeCell(mode, ...sides(list), {...options(section)(id), ...own})});
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  };
  const launch = byOwnOutcome(['launch']);
  const probe = byOwnOutcome(['concurrent', 'intervention']);
  const unicode = byOwnOutcome(['unicode']);

  // The declared departures observed: every entry that covered a sample, and those no sample needed.
  const judgedCells = [...methods, ...launch, ...probe, ...unicode];
  const applied = judgedCells.filter(c => c.declared > 0).map(c => ({...byRow.get(`${c.section} ${c.id}`), samples: c.declared,
    measured: departureMeasured(rows.filter(r => r.section === c.section && r.id === c.id && r.engine === 'vendor' && pairable(r.run)))}));
  // cua refusing or answering unconfirmed where the vendor gave a false ok (ruling 1144): better, listed beside them.
  const honest = judgedCells.filter(c => c.honest.length).map(c => ({section: c.section, id: c.id, cua: c.honest[0].cua, samples: c.honest.length}));
  // The rows judged against an oracle where cua read it and the vendor did not (ruling 1219): a declared departure
  // where cua is right, listed, never blocking.
  const oracleDepartures = judgedCells.filter(c => c.oracle && c.oracle.cuaRight > 0 && c.oracle.vendorWrong > 0).map(c => ({section: c.section, id: c.id, ...c.oracle}));
  // The shared limits (ruling 1144): each observation by its own cause (the answer both gave, on one scene and method)
  // and priority, then each cause's rows; each cause is a ticket for the design session to register (a shared false ok
  // P2 or higher, an honest shared failure P3).
  const sharedGroups = new Map();
  for (const c of judgedCells) for (const sample of c.shared) {
    const {answer} = sample;
    const kind = answer.kind === 'ok' ? 'shared false ok' : 'honest failure';
    const [scene] = c.id.split('/');
    const method = c.id.split('/').pop().split('.')[0];
    const said = answer.kind === 'ok' ? 'answers ok with other text' : `answers ${answer.kind}${answer.name ? ` (${answer.name})` : ''}${answer.sentence ? `: "${answer.sentence}"` : ''}`;
    const cause = `${scene} ${method} ${said}`;
    const key = `${kind}\0${cause}`;
    if (!sharedGroups.has(key)) sharedGroups.set(key, {kind, priority: kind === 'shared false ok' ? 'P2 or higher' : 'P3', cause, rows: []});
    const rows = sharedGroups.get(key).rows;
    const row = rows.find(r => r.section === c.section && r.id === c.id);
    const lengths = {length: sample.length, expectedLength: sample.expectedLength};
    if (!row) rows.push({section: c.section, id: c.id, samples: 1, ...lengths});
    else { row.samples += 1; if (row.length !== lengths.length) row.length = null; }
  }
  const shared = [...sharedGroups.values()];
  const unneeded = full.length ? [...byRow.values()].filter(e => inPlan(e) && !applied.some(a => a.section === e.section && a.id === e.id)) : [];

  // Every judged cell of the manifest: its samples with and without a verdict, and whether it qualifies.
  const speedVerdict = c => (c.accepted ? 'accepted-miss' : `${c.beat === null ? 'no-verdict' : c.beat ? 'beat' : 'missed'}${c.remeasured && c.beat !== null ? '-remeasured' : ''}`);
  const found = new Map([...judgedCells, ...speed].map(c => [`${c.section} ${c.id}`, {verdict: c.section === 'speed' ? speedVerdict(c) : c.verdict, account: c.account, ...(c.unreferenced ? {unreferenced: c.unreferenced} : {})}]));
  for (const f of findingRows) found.set(`${f.section} ${f.id}`, {verdict: f.account.qualifies ? 'measured' : 'no-verdict', account: f.account});
  const empty = {vendor: {verdicts: 0, runs: 0, byRun: {}, noVerdict: {}}, cua: {verdicts: 0, runs: 0, byRun: {}, noVerdict: {}}, pairs: 0, pairRuns: [], qualifies: false};
  const cells = cellsOf(plan).map(({section, id}) => {
    const c = found.get(`${section} ${id}`) ?? {verdict: 'no-verdict', account: empty};
    return {section, id, verdict: c.verdict, account: c.account, qualifies: c.account.qualifies, ...(c.unreferenced ? {unreferenced: c.unreferenced} : {})};
  });

  // Other cells (implemented elsewhere), by cell and engine.
  const others = [];
  for (const {result, path} of results) {
    if (own({result}) || proof) continue;
    for (const [engine, list] of groupBy(result.rows, r => r.engine)) {
      const valid = list.filter(r => !r.invalid);
      others.push({cell: result.cell, path, engine, sections: [...new Set(list.map(r => r.section))], verdict: result.verdict, ok: valid.filter(r => r.ok).length, valid: valid.length, invalid: list.length - valid.length});
    }
  }

  // Ruling 1219 (h5): a cua sample that failed not interfering alongside its own paired vendor sample blocks nothing; what
  // moved decides its kind, and none of the kinds is a pass (sharedInterferenceOf). Ruling 1222: a defect with its ticket,
  // or the venue's on its recorded evidence, is not judged; anything else of it is missing proof.
  // Every shared pair leaves blocking (both engines failed it: no verdict on cua's side), whatever its kind; only the
  // not-judged ones leave the verdict, and the rest are missing proof below.
  const {shared: sharedInterference, cuaKeys: sharedKeys} = sharedInterferenceOf(rows, applicable, knownDefects);
  const cuaFailed = judgedRows('cua').filter(r => interferenceFailed(r) && !sharedKeys.has(pairKey(r)));
  const interferencePass = interference.cua.rows > 0 && cuaFailed.length === 0 && interference.cua.declared.length === 0;
  const sharedEntryFor = new Map(sharedInterference.map(s => [s, sharedEntryOf(s)]));
  const sharedEntries = [...sharedEntryFor.values()].filter(Boolean);
  // Every not-judged entry under ruling 1222's condition: one with neither a ticket nor evidence is missing proof.
  const refusedNotJudged = [...notJudgedRows, ...sharedEntries].map(entry => [entry, notJudgedRefusal(entry)]).filter(([, why]) => why);
  const notJudged = [...notJudgedRows, ...sharedEntries].filter(entry => !refusedNotJudged.some(([e]) => e === entry));
  const speedMisses = speed.filter(s => s.beat === false && !s.remeasured && !s.accepted);
  // Ruling 1232, as 1240 settles it: a pass on re-measurement counts as a pass; any other re-measured op is the owner's
  // whatever its numbers, unless its miss is accepted.
  const remeasuredLine = s => `speed: ${s.id} ${s.beat === true ? 'passes on re-measurement' : s.beat === false ? 'missed the 10% beat on re-measurement' : 'not qualified on re-measurement'} (cua ${round(s.cua?.median)} ms against ${round(s.vendor?.median)} ms, p95 ${round(s.cua?.p95)} against ${round(s.vendor?.p95)}, n = ${nOf(s.remeasured)}; the base's n = ${s.base.vendor?.n ?? 0}: cua ${round(s.base.cua?.median)} ms against ${round(s.base.vendor?.median)} ms): the owner's whatever the numbers (ruling 1232)${s.acceptanceExceeded ? exceededNote(s.acceptanceExceeded) : ''}`;
  const ratio = v => (v === null ? 'unread' : v.toFixed(3));
  const exceededNote = e => `; worse than ${e.ticket}'s accepted bound (ruling ${e.ruling}, ${e.evidence}) on ${e.worse.join(' and ')}: cua/vendor median ${ratio(e.ratios.median)} against ${ratio(e.bound.median)}, p95 ${ratio(e.ratios.p95)} against ${ratio(e.bound.p95)}, so no longer the accepted miss`;
  const evidence = evidenceOf(full);
  const owner = [
    ...speedMisses.map(s => `speed: ${s.id} missed the 10% beat (cua ${round(s.cua.median)} ms against ${round(s.vendor.median)} ms, p95 ${round(s.cua.p95)} against ${round(s.vendor.p95)})`),
    ...speed.filter(s => s.remeasured && s.beat !== true && !s.accepted).map(remeasuredLine),
    ...(findingVerdict === 'parity' ? ['finding elements: parity on the resolved sum (the owner decides)'] : []),
    ...interference.cua.declared.map(d => `not interfering: ${d.id}: ${d.cause}`),
    ...unneeded.map(e => `departures: the file declares ${e.section} ${e.id}, which no sample of the full runs needed: remove it`),
    ...evidence.flags.map(f => `rerun: ${f.cell}, run ${f.run}: ${f.why} (full run job ${f.full.runId}, attempt ${f.full.attempt}; rerun job ${f.rerun.runId}, attempt ${f.rerun.attempt})${f.vendorRegressed ? '' : ': it passes only in the filtered rerun'}`),
  ];
  const blocking = [
    ...departureFailures,
    ...methods.filter(m => m.verdict === 'worse').map(m => `method: ${m.id} is worse on cua${knownDefect('method', m.id, rows)}`),
    ...launch.filter(l => l.verdict === 'worse').map(l => `launch: ${l.id} did not launch on cua`),
    ...(findingVerdict === 'fail' ? lower.map(f => `finding elements: ${f.scene} is lower on cua`) : []),
    ...[...new Set(cuaFailed.map(f => f.id))].map(id => `not interfering: ${id} failed on cua`),
    ...[...probe, ...unicode].filter(r => r.verdict === 'worse').map(r => (r.differs ? `${r.section}: ${r.id} composes otherwise on the vendor: the engines differ (ruling 1119)` : `${r.section}: ${r.id} failed on cua${knownDefect(r.section, r.id, rows)}`)),
    ...others.filter(o => o.engine === 'cua' && o.verdict === 'fail').map(o => `${o.cell}: fail on cua`),
  ];
  // A judged cell with no counted cua sample is named; every cell that does not qualify is counted once and listed
  // under NO VERDICT by cell.
  const unproven = judgedCells.filter(c => c.verdict === 'no-verdict' && c.cua.valid === 0).map(c => {
    const causes = Object.keys(c.account.cua.noVerdict);
    const unpaired = (c.account.cua.noVerdict.unpaired ?? 0) > 0, only = k => causes.length > 0 && causes.every(x => x === k);
    // Ruling 1214: where the vendor's run stopped before its samples, the missing proof is the vendor's, named.
    const byStop = new Map();
    for (const s of c.account.vendorStopped ?? []) { const k = `${s.reason ?? 'its stop unrecorded'}; after ${s.after ?? 'no row'}`; byStop.set(k, [...(byStop.get(k) ?? []), s.run]); }
    const stops = [...byStop].map(([k, runs]) => `${k} (run ${runs.join(', ')})`).join('; ');
    // Ruling 1168: where every sample's vendor pair could not be the reference, the missing proof is the vendor's.
    return `${SECTION_NAMES[c.section]}: ${c.id} ${only('vendorStopped') ? `has no cua sample with a vendor sample to compare: the vendor's run stopped before it (${stops})`
      : unpaired ? 'has no cua sample with a valid vendor sample of its run (ruling 1116)'
      : only('reference') ? 'has no vendor sample that registered the pointerdown (ruling 1168)'
      : only('venue') ? 'has no cua sample from a run pair that stood on one frame (ruling 1169) with the input sources it selects enabled on the runner (ruling 1189)' : 'has no valid cua sample'}${knownDefect(c.section, c.id, rows)}`;
  });
  const unqualified = cells.filter(c => !c.qualifies);
  const missing = [
    ...missingProof,
    ...unproven,
    ...(unqualified.length ? [`${unqualified.length} cell(s) do not qualify: fewer than ${RUNS_PER_SIDE} complete run pairs (NO VERDICT by cell)`] : []),
    ...(findingVerdict === 'no-verdict' ? ['finding elements: a scene has no measure on one engine, or a finding row does not qualify'] : []),
    ...(interference.cua.rows === 0 ? ['not interfering: no background row was judged on cua'] : []),
    ...speed.filter(s => !s.partial.vendor || !s.partial.cua).map(s => `speed: ${s.id} has no measure on one engine`),
    ...others.filter(o => o.engine === 'cua' && o.verdict !== 'pass' && o.verdict !== 'fail').map(o => `${o.cell}: ${o.verdict} on cua`),
    ...sharedInterference.filter(s => !sharedEntryFor.get(s)).map(s => `not interfering: ${s.id} failed on both engines (${s.kind}), NO VERDICT on cua: ticket to be registered`),
    ...refusedNotJudged.map(([e, why]) => `not judged without a ticket or recorded evidence: ${e.section} ${e.id} (${e.condition}): ${why}; ${e.cause}`),
  ];
  const desktop = {recorded: groupCount(full.map(({result}) => result.meta?.desktopMode).filter(m => m !== undefined)), unrecorded: full.filter(({result}) => result.meta?.desktopMode === undefined).length,
    hosted: full.filter(({result}) => result.meta?.hosted === true).length, full: full.length};
  const verdict = blocking.length ? 'FAIL' : missing.length ? 'NO VERDICT' : owner.length ? 'OWNER' : 'PASS';
  return {problems: missingProof, runs, narrowed, methods, launch, speed, speedControls, acceptedMisses, finding, findingVerdict, interference, interferencePass, probe, unicode, notJudged, departures: applied, honest, oracleDepartures, shared, sharedInterference, cells, others, owner,
    blocking, missing, options: OWNER_OPTIONS.filter(inPlan).map(o => ({...o})), desktop, thrownButLanded: thrownButLandedOf(rows), toTop: toTopOf(rows), witness: witnessOf(full),
    firstLane: firstLaneSplitOf(full), composingRetries: composingRetriesOf(full), evidence, runners: splitJobRunners(full), ...(proof ? {proof: {cells: plan.only.size}} : {}), verdict};
}

// Ruling 1228 (E): the jobs each run's evidence came from, the full runs combined with filtered reruns (./combine.mjs):
// per run number its full run's job and every rerun's job with the cells it proved, and the rerun flags combine recorded
// (a cell that failed on its own verdict in the full run and passes only in the rerun), which go to the owner. Nothing
// when no full run names a job. -> {jobs: [{run, full, reruns: [{runId, attempt, commit, cells}]}], flags}.
export function evidenceOf(full) {
  const jobs = new Map(), flags = [], vendorOnly = [];
  for (const {result} of full) {
    const run = result.meta?.run, job = result.meta?.runner?.run;
    if (!job || jobs.has(run)) continue;
    jobs.set(run, {run, full: {runId: job.id ?? null, attempt: job.attempt ?? null}, reruns: (result.meta.reruns ?? []).map(r => ({runId: r.runId, attempt: r.attempt, commit: r.commit, cells: r.filter}))});
  }
  const seen = new Set();
  for (const {result} of full) for (const f of result.meta?.rerunFlags ?? []) {
    const key = `${f.run} ${f.cell}`;
    if (!seen.has(key)) { seen.add(key); flags.push(f); }
  }
  // Ruling 1231: a change on the vendor's side alone is parity, listed and never the owner's flag.
  for (const {result} of full) for (const v of result.meta?.rerunVendorOnly ?? []) {
    const key = `vendor-only ${v.run} ${v.cell}`;
    if (!seen.has(key)) { seen.add(key); vendorOnly.push(v); }
  }
  return {jobs: [...jobs.values()].sort((a, b) => a.run - b.run), flags, vendorOnly};
}
// The evidence as a report section, nothing when no run named its job. -> [line].
export function renderEvidence(evidence) {
  if (!evidence?.jobs.length) return [];
  const job = j => `job ${j.runId} attempt ${j.attempt}`;
  return ['## Evidence by job (ruling 1228)', '', 'Each run\'s cells come from its full run\'s job, but those a filtered rerun replaced, both lanes together (./combine.mjs).', '',
    ...evidence.jobs.map(e => `- run ${e.run}: ${job(e.full)}${e.reruns.map(r => `, but ${r.cells.length} cell${r.cells.length === 1 ? '' : 's'} from ${job(r)} (commit ${r.commit}): ${r.cells.join(', ')}`).join('')}`),
    ...evidence.flags.map(f => `- FLAG: ${f.cell}, run ${f.run}: ${f.why}${f.vendorRegressed ? '' : ': it passes only in the filtered rerun'} (the owner's)`), '',
    ...(evidence.vendorOnly?.length ? ['## Vendor-only changes between the base and the rerun (ruling 1231)', '',
      ...evidence.vendorOnly.map(v => `- ${v.cell}, run ${v.run}: the vendor's row failed in the full run (job ${v.full.runId}, attempt ${v.full.attempt}) and passes in the rerun (job ${v.rerun.runId}, attempt ${v.rerun.attempt}); cua's row and the pair's verdict unchanged`), ''] : [])];
}

// A declared departure's known capability difference as the runs measured it (ruling 1228): of the vendor's runs of
// the row (`vendorRows`, the pairable runs' samples), how many did what the row asks cleanly (every sample answered ok,
// its interference reading held), and whether the user scene stayed front and key throughout every sample (its
// before and after front and key the user's app; null where no sample read them, off a hosted runner).
// -> {runs, clean, user, frontKey: true | false | null}.
const APP_NAMES = Object.freeze({textedit: 'TextEdit', finder: 'Finder', chrome: 'Chrome', electron: 'the Electron fixture'});
export function departureMeasured(vendorRows) {
  const runs = [...new Set(vendorRows.map(r => r.run))];
  const clean = runs.filter(n => vendorRows.filter(r => r.run === n).every(r => vendorAnsweredOk(r) && r.interference?.ok !== false)).length;
  const user = vendorRows.find(r => r.user)?.user ?? null, bundle = user ? SCENES[user]?.bundleId : null;
  const read = vendorRows.filter(r => r.frontKey?.before && r.frontKey?.after);
  // Read on every sample, or not read (null): an unread sample says nothing either way (m2 of the cell review).
  const frontKey = !bundle || !read.length || read.length !== vendorRows.length ? null
    : read.every(r => [r.frontKey.before, r.frontKey.after].every(x => x.front === bundle && x.key === bundle));
  return {runs: runs.length, clean, user: user ? APP_NAMES[user] ?? user : null, frontKey};
}

// Ruling 1226: a sitting alternates which lane runs first by run (meta.laneOrder), so state one lane leaves for the
// other (C-7: Go To reopened on the vendor's path) shows. Every failed sample (its own check, or not interfering) and
// every sample without a verdict (sampleCause), per cell and engine, counted by the lane that ran first in its run.
// Recorded, never judged. `results`: [{result}] of any cell (the sitting report passes the save-sheet's too, so a run
// number has up to four records): `runs` counts run numbers, each once under the first lane its records name. Every
// record of a run number must name the same first lane; a number whose records disagree is in `disagree`, with what
// each record says (and counted under each lane named).
// -> {runs: {vendor, cua}, disagree: [{run, sides: [{engine, cell, first}]}], cells: [{section, id, engine, failed: {vendor, cua}, noVerdict: {vendor, cua}}]}.
export function firstLaneSplitOf(results) {
  const numbers = {vendor: new Set(), cua: new Set()}, sides = new Map(), cells = new Map();
  for (const {result} of results) {
    const first = result.meta?.laneOrder?.first;
    if (first !== 'vendor' && first !== 'cua') continue;
    const run = result.meta?.run ?? null;
    numbers[first].add(run);
    if (!sides.has(run)) sides.set(run, []);
    sides.get(run).push({engine: result.lanes?.[0]?.engine ?? null, cell: result.cell ?? null, first});
    for (const row of result.rows ?? []) {
      const cause = sampleCause({...row, hosted: result.meta?.hosted === true});
      const failed = !cause && (row.ok === false || row.interference?.ok === false);
      if (!cause && !failed) continue;
      const key = `${row.section} ${row.id} ${row.engine}`;
      if (!cells.has(key)) cells.set(key, {section: row.section, id: row.id, engine: row.engine, failed: {vendor: 0, cua: 0}, noVerdict: {vendor: 0, cua: 0}});
      cells.get(key)[cause ? 'noVerdict' : 'failed'][first] += 1;
    }
  }
  const order = c => `${c.section} ${c.id} ${c.engine}`;
  return {runs: {vendor: numbers.vendor.size, cua: numbers.cua.size},
    disagree: [...sides].filter(([, list]) => new Set(list.map(x => x.first)).size > 1).map(([run, list]) => ({run, sides: list})),
    cells: [...cells.values()].sort((a, b) => order(a).localeCompare(order(b)))};
}
// A departure's known capability difference, as measured (departureMeasured), or nothing for an entry that names no
// capability. -> text ending '; ' or ''.
function measuredLine(d) {
  if (!d.capability || !d.measured) return '';
  const m = d.measured;
  const user = m.user === null ? '' : m.frontKey === true ? `, ${m.user} front and key throughout` : m.frontKey === false ? `, ${m.user} NOT front and key throughout` : `, ${m.user}'s front and key not read`;
  return `known capability difference: the vendor ${d.capability} cleanly in ${m.clean} of ${m.runs} runs${user}; `;
}
// The split as a report section, nothing when no run recorded its order. -> [line].
export function renderFirstLaneSplit(split) {
  if (!split || split.runs.vendor + split.runs.cua === 0) return [];
  const sum = (kind, first) => split.cells.reduce((n, c) => n + c[kind][first], 0);
  return ['## By the lane that ran first (ruling 1226)', '',
    `Run numbers by the lane that ran first: vendor first ${split.runs.vendor}, cua first ${split.runs.cua}. Failed samples: ${sum('failed', 'vendor')} in vendor-first runs, `
      + `${sum('failed', 'cua')} in cua-first runs; samples without a verdict: ${sum('noVerdict', 'vendor')} and ${sum('noVerdict', 'cua')}. Recorded, never judged.`, '',
    ...(split.disagree ?? []).flatMap(d => [`The records of run ${d.run} disagree on the lane that ran first: ${d.sides.map(x => `${x.engine}'s ${x.cell} ${x.first}`).join(', ')}.`, '']),
    ...(split.cells.length ? ['| cell | engine | failed, vendor first | failed, cua first | no verdict, vendor first | no verdict, cua first |', '|---|---|---|---|---|---|',
      ...split.cells.map(c => `| ${c.section} ${c.id} | ${c.engine} | ${c.failed.vendor} | ${c.failed.cua} | ${c.noVerdict.vendor} | ${c.noVerdict.cua} |`), ''] : [])];
}

// R3's witness per full run that recorded one (ruling 1225, ./witness.mjs): its positive control's result per tapped
// scene, or why the run had none, and the rows its gaps left NO VERDICT. Recorded; the rows' own NO VERDICT carries it
// into the counts. -> [{engine, run, missing?, controls: [{scene, pid, seen}], noVerdict}].
export function witnessOf(full) {
  return full.filter(({result}) => result.meta?.witness).map(({result}) => {
    const w = result.meta.witness;
    return {engine: result.lanes[0]?.engine, run: result.meta.run, ...(w.missing ? {missing: w.missing} : {}),
      controls: (w.controls ?? []).map(c => ({scene: c.scene, pid: c.pid, seen: c.seen === true})),
      noVerdict: result.rows.filter(r => typeof r.invalid === 'string' && r.invalid.startsWith('R3\'s witness')).length};
  });
}

// The background rows' user windows by the path they took to the top (ruling 1221, H2; ./steps.mjs keepToTop): per user
// scene and engine, the rows whose activation's wait found the run's window on top, those it raised there and those
// whose raise threw (counted apart, fix wave M3), and the rows still not ok after a raise. Recorded, never judged. ->
// {counts: [{scene, engine, waited, raised, raiseFailed}], afterRaise: [{engine, id}]}.
export function toTopOf(rows) {
  const counts = new Map(), afterRaise = [];
  for (const r of rows) {
    const path = r.toTop?.path;
    if (!['waited', 'raised', 'raiseFailed'].includes(path)) continue;
    const k = `${r.toTop.scene}\u0000${r.engine}`;
    if (!counts.has(k)) counts.set(k, {scene: r.toTop.scene, engine: r.engine, waited: 0, raised: 0, raiseFailed: 0});
    counts.get(k)[path] += 1;
    if (path === 'raised' && r.ok !== true) afterRaise.push({engine: r.engine, id: r.id});
  }
  return {counts: [...counts.values()].sort((a, b) => a.scene.localeCompare(b.scene) || a.engine.localeCompare(b.engine)), afterRaise};
}

// The samples of a row judged by its own effect (./plan.mjs OWN_EFFECT_IDS) that passed although the act threw: a write a
// model was told failed while it landed. A pass all the same, counted apart per engine with the thrown reply (its error
// name and its message's first line). -> {vendor: [{id, run, sample, errorName, message}], cua: […]}.
export function thrownButLandedOf(rows) {
  const out = {vendor: [], cua: []};
  for (const r of rows) {
    const threw = r.outcome?.threw;
    if (r.section !== 'method' || r.ok !== true || !OWN_EFFECT_IDS.includes(r.id) || typeof threw !== 'string' || !threw || !out[r.engine]) continue;
    out[r.engine].push({id: r.id, run: r.run ?? null, sample: r.sample ?? null, errorName: r.outcome.errorName ?? null, message: threw.split('\n')[0]});
  }
  return out;
}

// ---- the report ---------------------------------------------------------------------------------------------------------

// The not-judged entries one line each for a log (ruling 1222): a rule's rows by condition with their ticket, a shared
// item with its ticket or its evidence. -> [line].
export function notJudgedLines(j) {
  const rows = j.notJudged.filter(n => n.section !== 'interference'), shared = j.notJudged.filter(n => n.section === 'interference');
  return [...[...groupBy(rows, n => n.condition)].map(([condition, list]) => `${condition} (${list.length} row${list.length === 1 ? '' : 's'}): ticket ${[...new Set(list.map(n => n.ticket))].join(', ')}`),
    ...shared.map(n => `${n.id} (${n.condition}): ${n.ticket ? `ticket ${n.ticket}` : `evidence ${n.evidence.map(e => `${e.engine} run ${e.run} sample ${e.sample} ${e.field}`).join('; ')}`}`)];
}

// The "Not judged" section (ruling 1222), as the summary, the matrix CLI's sitting report and the hosted sitting's
// sitting.md show it: every not-judged entry with its reason and its ticket or its recorded evidence. A row rule's rows
// by condition, with what each engine read; a shared not-interfering item with its samples. -> [line].
export function renderNotJudged(j) {
  if (!j.notJudged?.length) return [];
  const out = ['## Not judged', '', 'What a ruling put out of the judged matrix: it runs and is reported, and counts as neither pass nor fail, nor as missing proof. Each entry names its reason and its ticket or the recorded evidence it rests on (ruling 1222); one with neither is missing proof instead. For rows, cua ok/valid, then the vendor\'s; "not recorded" where that lane has no sample of the row, which is distinct from an invalid sample.', ''];
  const recorded = c => (c.valid + c.invalid ? counts(c) : 'not recorded');
  const rowEntries = j.notJudged.filter(n => n.section !== 'interference'), shared = j.notJudged.filter(n => n.section === 'interference');
  for (const [condition, list] of groupBy(rowEntries, n => n.condition)) {
    // The input causes among the invalid samples (rulings 1188 and 1189), so the report shows what the run could not take.
    const sum = (side, key) => list.reduce((n, entry) => n + (entry[side][key] ?? 0), 0);
    const causes = [['ownerInput', 'the owner\'s input source or per-context preference not the row\'s, never changed off a GitHub-hosted runner, ruling 1188'],
      ['venue', `an input source the runner's setup could not enable, ruling 1189${condition === 'perContext' ? ', or the sources enabled and the per-context context not reading Korean after its reactivation, #577' : ''}`]].filter(([key]) => sum('cua', key) + sum('vendor', key))
      .map(([key, what]) => `\`${key}\` (${what}): cua ${sum('cua', key)}, vendor ${sum('vendor', key)}`);
    const tickets = [...new Set(list.map(n => n.ticket).filter(Boolean))];
    out.push(`### ${condition}`, '', list[0].cause, '', `Ticket: ${tickets.join(', ')}.`, '', ...(causes.length ? [`Of the invalid samples, ${causes.join('; ')}.`, ''] : []), '| row | cua ok | vendor ok |', '|---|---|---|');
    for (const n of list) out.push(`| ${n.id} | ${recorded(n.cua)} | ${recorded(n.vendor)} |`);
    out.push('');
  }
  if (shared.length) {
    const evidence = n => n.evidence.map(e => `${e.engine} run ${e.run} sample ${e.sample}: ${e.row}'s ${e.field}`).join('; ');
    out.push('### Shared not-interfering failures', '', 'Cells where a cua sample failed not interfering with its own paired vendor sample (rulings 1219 and 1222): a product defect both engines share, with its ticket, or the venue\'s, on the evidence recorded.', '',
      '| row | reason | ticket or evidence | samples |', '|---|---|---|---|', ...shared.map(n => `| ${n.id} | ${n.cause} | ${n.ticket ? `ticket ${n.ticket}` : `evidence: ${evidence(n)}`} | ${n.samples} |`), '');
  }
  return out;
}

const MARK = {equal: 'equal', better: 'better', declared: 'declared', shared: 'shared', worse: '**worse**', 'no-verdict': '**no verdict**', beat: 'beat', missed: 'missed', 'beat-remeasured': 'passes on re-measurement', 'missed-remeasured': 'missed on re-measurement', 'accepted-miss': 'accepted miss', measured: 'measured'};
const ms = n => (n === null || n === undefined ? '-' : (Math.round(n * 10) / 10).toFixed(1));
const counts = c => `${c.ok}/${c.valid}${c.invalid ? ` (+${c.invalid} invalid)` : ''}`;
const verdictCounts = c => `${c.ok}/${c.valid}${c.invalid ? ` (+${c.invalid} no verdict)` : ''}`;
const routeText = list => list.map(r => (r === null ? '-' : String(r))).join(', ');
const causesText = noVerdict => Object.entries(noVerdict).map(([k, n]) => `${k} ${n}`).join(', ') || '-';

// The method table: the 11 methods against the four scenes and the Open panel, each cell the worst verdict of its cases
// per regime (front/back), n/a with the plan's reason in a note.
export function methodTable(methods) {
  const rank = ['equal', 'better', 'shared', 'declared', 'no-verdict', 'worse'];
  const worst = list => list.reduce((a, m) => (rank.indexOf(m.verdict) > rank.indexOf(a) ? m.verdict : a), 'better');
  const cell = (target, method) => {
    if (NOT_APPLICABLE[target]?.[method]) return 'n/a';
    const parts = ['frontmost', 'background'].map(regime => {
      const list = methods.filter(m => m.target === target && m.regime === regime && m.method === method);
      return list.length ? `${regime === 'frontmost' ? 'F' : 'B'} ${MARK[worst(list)].replace(/\*/g, '')}` : null;
    }).filter(Boolean);
    return parts.length ? parts.join(' / ') : 'not run';
  };
  const lines = [`| method | ${TARGETS.join(' | ')} |`, `|---|${TARGETS.map(() => '---').join('|')}|`];
  for (const method of METHODS) lines.push(`| ${ENGINE_METHOD[method]} | ${TARGETS.map(t => cell(t, method)).join(' | ')} |`);
  return lines.join('\n');
}

// The device mode and venue line (R3: the matrix runs in the shared device mode, the default, and the report says so).
// Why a row's window order failed it (./oracle.mjs judgeInterference: `after` must be false), or nothing when it held.
function windowOrderReason(order) {
  if (!order || order.after === false) return null;
  return order.after === true ? 'a target window left above the user window' : 'the window order after the action proved nothing (unread, or without the user window)';
}

function desktopLine(d) {
  const parts = [];
  if (d.recorded.length) parts.push(`${d.recorded.map(([m]) => m).join(', ')}${d.recorded.every(([m]) => m === SHARED_MODE) ? ' (the default)' : ''}, recorded by ${d.unrecorded ? `${d.full - d.unrecorded} full run(s)` : 'every full run'}`);
  if (d.unrecorded) parts.push(`not recorded by ${d.unrecorded} full run(s) (the default, ${SHARED_MODE}, is the rule)`);
  return `Device mode: ${parts.join('; ') || 'no full run'}; hosted: ${d.hosted} of ${d.full} full runs.`;
}

const pct = d => (d === null || d === undefined ? '-' : `${d > 0 ? '+' : ''}${d}%`);
const nOf = counts => (counts.vendor === counts.cua ? `${counts.vendor} a side` : `${counts.vendor} vendor, ${counts.cua} cua`);
// Ruling 1232's asymmetry, said plainly: only the missed ops were re-measured, at their n, and judged on it alone.
function renderRemeasurement(j) {
  const re = j.speed.filter(s => s.remeasured);
  if (!re.length) return [];
  const others = j.speed.filter(s => !s.remeasured && s.vendor);
  const ns = [...new Set(others.map(s => s.vendor.n))];
  const runs = [...new Set(re.flatMap(s => s.remeasured.runs))].sort((a, b) => a - b);
  const counts = [...new Set(re.map(s => nOf(s.remeasured)))];
  const perLane = [...new Set(re.flatMap(s => ['vendor', 'cua'].map(e => Math.round((s.remeasured[e] / s.remeasured.runs.length) * 10) / 10)))];
  return [`Only the ${re.length} op${re.length === 1 ? '' : 's'} that missed in the base ${re.length === 1 ? 'was' : 'were'} re-measured, at n = ${counts.join(' or ')} (the speed-extra cell, ${perLane.join(' or ')} samples a lane in each of run${runs.length === 1 ? '' : 's'} ${runs.join(', ')}), and ${re.length === 1 ? 'is' : 'are'} judged on the re-measurement alone; the other ${others.length} ops (${others.filter(s => s.beat === true).length} of them beating the vendor) rest on the full runs' samples, n = ${ns.join(' or ')} a side. The base's samples are shown beside each re-measured op for reference, never pooled; a pass on re-measurement counts as a pass, and any other re-measured op stays the owner's unless it is an accepted miss (rulings 1232, 1240).`, ''];
}

// `notes`: the known capability differences no cell exercises (./capability-notes.mjs), printed, never judged.
export function renderSummary(j, {title = 'Native matrix summary', notes = readCapabilityNotes()} = {}) {
  const apart = [j.departures.length && `${j.departures.length} declared departure${j.departures.length === 1 ? '' : 's'}: What changes for a user`,
    j.shared.length && `${j.shared.length} shared limit${j.shared.length === 1 ? '' : 's'}: Shared limits (vendor has them too)`].filter(Boolean);
  const departures = apart.length ? ` (${apart.join('; ')})` : '';
  const note = {PASS: departures, OWNER: ` (nothing failed; the owner's calls below remain)${departures}`, 'NO VERDICT': ' (nothing failed, but the proof below is missing: it blocks M5 as a failure does)'};
  const out = [`# ${title}${j.proof ? ` (proof run: ${j.proof.cells} cells, no base)` : ''}`, '', `Verdict: **${j.verdict}**${note[j.verdict] ?? ''}`, '',
    `${j.proof ? 'Proof runs (filtered, judged alone, ruling 1248)' : 'Full matrix runs'}: ${j.runs.vendor} vendor, ${j.runs.cua} cua (${RUNS_PER_SIDE} per side are the rule)${j.proof ? `; the verdict is about these ${j.proof.cells} cells alone` : ''}.`, desktopLine(j.desktop), ''];
  if (j.blocking.length) out.push('## Blocking', '', ...j.blocking.map(b => `- ${b}`), '');
  if (j.missing.length) out.push('## Missing proof (no verdict)', '', ...j.missing.map(b => `- ${b}`), '');
  if (j.options.length) out.push('## Owner options (not run; not part of the verdict)', '', ...j.options.map(o => `- ${o.option} (${o.section} ${o.id}): ${o.reason}`), '');
  if (j.owner.length) out.push('## For the owner', '', ...j.owner.map(o => `- ${o}`), '');
  // Ruling 1240: the misses the owner accepted, each with its ticket and its numbers.
  if (j.acceptedMisses?.length) out.push('## Accepted misses (not blocking)', '', ...j.acceptedMisses.map(a => `- speed: ${a.id}: accepted miss (${a.ticket}, ruling ${a.ruling}): cua ${round(a.cua?.median)} ms against ${round(a.vendor?.median)} ms median, p95 ${round(a.cua?.p95)} against ${round(a.vendor?.p95)}, n = ${a.remeasured ? `${nOf(a.remeasured)} on re-measurement` : `${a.vendor?.n ?? 0} a side`}`), '');

  out.push('## The three points', '');
  const beats = j.speed.filter(s => s.beat === true).length, repassed = j.speed.filter(s => s.beat === true && s.remeasured).length, accepted = j.speed.filter(s => s.accepted).length;
  out.push(`- **Speed**: ${beats} of ${j.speed.length} measured ops beat the vendor by at least 10% with p95 not worse${repassed ? `, ${repassed} of them on re-measurement (ruling 1240)` : ''}; ${accepted ? `${accepted} accepted miss${accepted === 1 ? '' : 'es'} (not blocking); ` : ''}${j.speed.filter(s => s.beat === false && !s.accepted).length} missed (the owner's fork), ${j.speed.filter(s => s.beat === null).length} unmeasured or not qualified.`);
  const sum = engine => j.finding.reduce((n, f) => n + (f[engine]?.resolved ?? 0), 0);
  out.push(`- **Finding elements**: ${j.findingVerdict}; resolved targets vendor ${sum('vendor')}, cua ${sum('cua')} of ${j.finding.reduce((n, f) => n + (f.vendor?.targets ?? f.cua?.targets ?? 0), 0)}.`);
  const share = engine => (j.interference[engine].rows ? `${Math.round((j.interference[engine].ok / j.interference[engine].rows) * 1000) / 10}% (${j.interference[engine].ok}/${j.interference[engine].rows})` : 'no rows');
  out.push(`- **Not interfering**: cua ${share('cua')}, vendor ${share('vendor')}; cua route-4 actions outside accepted families: ${j.interference.cua.route4}; declared for the owner: ${j.interference.cua.declared.length}.`);
  out.push(`- **What changes for a user**: ${j.departures.length} declared departure(s) (R3).`);
  // A shared limit is equal to the vendor, never a pass of the row's own check.
  const passing = list => list.filter(r => ['equal', 'better', 'declared'].includes(r.verdict)).length;
  out.push(`- **Concurrent use and intervention**: ${passing(j.probe)} of ${j.probe.length} rows pass on cua (concurrent use and its sheet variant, intervention fires, the pre-action refusal).`);
  const unicodeNotJudged = j.notJudged.filter(n => n.section === 'unicode');
  const notJudged = unicodeNotJudged.length ? `; ${unicodeNotJudged.length} ${[...new Set(unicodeNotJudged.map(n => n.condition))].join(', ')} rows are not judged (below)` : '';
  const sharedRows = j.unicode.filter(r => r.verdict === 'shared').length;
  out.push(`- **Korean and Unicode**: ${passing(j.unicode)} of ${j.unicode.length} rows pass on cua${sharedRows ? `, ${sharedRows} a shared limit` : ''}${notJudged}.`);
  const without = side => j.cells.reduce((n, c) => n + Object.values(c.account[side].noVerdict).reduce((a, b) => a + b, 0), 0);
  // Ruling 1154: the alert's own count per side (by cell below, in NO VERDICT by cell).
  const alerted = side => j.cells.reduce((n, c) => n + (c.account[side].noVerdict.alert ?? 0), 0);
  // Ruling 1188: the rows the owner's Mac could not judge, its input source or preference not theirs, per side.
  const ownerInput = side => j.cells.reduce((n, c) => n + (c.account[side].noVerdict.ownerInput ?? 0), 0);
  const owned = ownerInput('cua') + ownerInput('vendor');
  // Ruling 1189: the rows an input source the runner could not enable left unjudged (and any frame split), per side.
  const venue = side => j.cells.reduce((n, c) => n + (c.account[side].noVerdict.venue ?? 0), 0);
  const venued = venue('cua') + venue('vendor');
  // Ruling 1203: the Open panel's pointer cells a hosted runner left to the owner's sitting, per side.
  const ownerSitting = side => j.cells.reduce((n, c) => n + (c.account[side].noVerdict.ownerSitting ?? 0), 0);
  const sitting = ownerSitting('cua') + ownerSitting('vendor');
  // Ruling 1214: the cua samples whose vendor sample a stopped vendor run never took (cua's side only).
  const stoppedCount = j.cells.reduce((n, c) => n + (c.account.cua.noVerdict.vendorStopped ?? 0), 0);
  out.push(`- **NO VERDICT**: ${without('cua')} cua and ${without('vendor')} vendor sample(s) without a verdict; of them \`alert\` (an alert in front or key, or the alert guard's refusal): cua ${alerted('cua')}, vendor ${alerted('vendor')}${owned ? `; \`ownerInput\` (the owner's input source or per-context preference not the row's, never changed off a GitHub-hosted runner, ruling 1188): cua ${ownerInput('cua')}, vendor ${ownerInput('vendor')}` : ''}${venued ? `; \`venue\` (a frame split, or an input source the runner's setup could not enable, ruling 1189): cua ${venue('cua')}, vendor ${venue('vendor')}` : ''}${sitting ? `; \`ownerSitting\` (the Open panel's pointer cells left to the owner's sitting, the panel clamped short of the strip, ruling 1203): cua ${ownerSitting('cua')}, vendor ${ownerSitting('vendor')}` : ''}${stoppedCount ? `; \`vendorStopped\` (cua samples whose vendor sample was never run, the vendor's run having stopped before it: no verdict, never cua's failure): cua ${stoppedCount}` : ''}; ${j.cells.filter(c => !c.qualifies).length} of ${j.cells.length} cells do not qualify.`, '');
  const stoppedCells = j.cells.filter(c => c.account.vendorStopped?.length);
  if (stoppedCells.length) {
    out.push('## The vendor\'s run stopped', '', 'Each judged cell whose cua samples have no vendor sample to compare because the vendor\'s run stopped part-way before it (ruling 1214): NO VERDICT `vendorStopped`, the proof missing the vendor\'s.', '',
      '| cell | run | the vendor\'s run stopped after | why it stopped |', '|---|---|---|---|');
    for (const c of stoppedCells) for (const s of c.account.vendorStopped) out.push(`| ${c.section} ${c.id} | ${s.run} | ${s.after ?? '-'} | ${String(s.reason ?? '-').replace(/\|/g, '\\|')} |`);
    out.push('');
  }

  // A pass on its own effect whose act threw: a model told the write failed while it worked (ruling 1204's setValue.name).
  const landed = j.thrownButLanded ?? {vendor: [], cua: []};
  if (landed.vendor.length + landed.cua.length) {
    out.push(`- **Thrown but landed** (\`thrownButLanded\`: a pass on its own effect whose act threw, so a model was told the write failed while it worked): cua ${landed.cua.length}, vendor ${landed.vendor.length}.`, '');
    out.push('## Thrown but landed', '', 'Each sample that passed on its own effect while its act threw, with the thrown reply (its error name and its message\'s first line).', '',
      '| engine | row | run | sample | error name | message |', '|---|---|---|---|---|---|');
    for (const engine of ['cua', 'vendor']) for (const t of landed[engine]) out.push(`| ${engine} | ${t.id} | ${t.run ?? '-'} | ${t.sample ?? '-'} | ${t.errorName ?? '-'} | ${t.message.replace(/\|/g, '\\|')} |`);
    out.push('');
  }

  out.push(...renderFirstLaneSplit(j.firstLane));
  out.push(...renderComposingRetries(j.composingRetries));
  out.push(...renderEvidence(j.evidence));
  out.push(...renderRunners(j.runners));
  out.push('## Speed (in-cell ms)', '');
  out.push(...renderRemeasurement(j));
  for (const scene of SCENE_IDS) {
    const list = j.speed.filter(s => s.scene === scene);
    if (!list.length) continue;
    out.push(`### ${scene}`, '', '| op | vendor median | vendor p95 | cua median | cua p95 | change | beat |', '|---|---|---|---|---|---|---|');
    for (const s of list) out.push(`| ${s.op} | ${ms(s.vendor?.median)} | ${ms(s.vendor?.p95)} | ${ms(s.cua?.median)} | ${ms(s.cua?.p95)} | ${pct(s.deltaPct)} | ${s.accepted ? `accepted miss (${s.accepted.ticket}, ruling ${s.accepted.ruling})` : s.beat !== null ? `${s.beat ? (s.remeasured ? 'passes' : 'yes') : '**no**'}${s.remeasured ? ' on re-measurement' : ''}` : s.provisional === null ? 'unmeasured' : `not qualified${s.remeasured ? ' on re-measurement' : ''}`} |`);
    out.push('');
    // What an op that does not qualify would give on every eligible reading, partial runs included: apart from the
    // official columns, which rest on the complete run pairs only.
    const side = st => `median ${ms(st.median)}, p95 ${ms(st.p95)} (${st.n})`;
    const diagnostic = list.filter(s => s.beat === null && s.provisional !== null && !s.remeasured);
    if (diagnostic.length) out.push(...diagnostic.map(s => `- ${s.op} (diagnostic, not counted): every eligible reading, partial runs included: vendor ${side(s.partial.vendor)}; cua ${side(s.partial.cua)}; would beat: ${s.provisional ? 'yes' : 'no'}`), '');
    // Ruling 1232: a re-measured op's base, beside it for reference.
    const remeasured = list.filter(s => s.remeasured);
    const stat = st => (st ? `median ${ms(st.median)}, p95 ${ms(st.p95)}` : 'unmeasured');
    if (remeasured.length) out.push(...remeasured.map(s => `- ${s.op}: re-measured, n = ${nOf(s.remeasured)} (run${s.remeasured.runs.length === 1 ? '' : 's'} ${s.remeasured.runs.join(', ')}); the base for reference (n = ${s.base.vendor?.n ?? 0} a side): vendor ${stat(s.base.vendor)}; cua ${stat(s.base.cua)}; change ${pct(s.base.deltaPct)}; ${s.base.beat === true ? 'it beat there' : s.base.beat === false ? 'it missed the beat there' : 'not qualified there'}`), '');
  }
  if (j.speedControls?.length) {
    out.push('### Controls (re-measured, not judged; ruling 1232)', '', 'The base\'s most narrowly passing method timings the speed-extra cell can host, re-measured beside the missed ops the same way: a check on the re-measurement itself, never a verdict (each op is judged on its full runs above).', '',
      '| op | vendor median | vendor p95 | cua median | cua p95 | change | base vendor median | base cua median | base change |', '|---|---|---|---|---|---|---|---|---|');
    for (const c of j.speedControls) out.push(`| ${c.id} | ${ms(c.vendor?.median)} | ${ms(c.vendor?.p95)} | ${ms(c.cua?.median)} | ${ms(c.cua?.p95)} | ${pct(c.deltaPct)} | ${ms(c.base.vendor?.median)} | ${ms(c.base.cua?.median)} | ${pct(c.base.deltaPct)} |`);
    out.push('');
  }

  out.push('## Finding elements', '', '| scene | vendor resolved | cua resolved | vendor titled share | cua titled share | vendor ID count | cua ID count |', '|---|---|---|---|---|---|---|');
  for (const f of j.finding) out.push(`| ${f.scene}${f.qualifies ? '' : ' (not qualified)'} | ${f.vendor?.resolved ?? '-'}/${f.vendor?.targets ?? '-'} | ${f.cua?.resolved ?? '-'}/${f.cua?.targets ?? '-'} | ${f.vendor?.share ?? '-'} | ${f.cua?.share ?? '-'} | ${f.vendor?.ids ?? '-'} | ${f.cua?.ids ?? '-'} |`);
  out.push('');

  out.push('## Not interfering', '', 'The background, launch, concurrent-use and behind-a-user-window Unicode rows with a verdict, by the oracle (the front app, the top window, the focus, activations, the route).', '');
  for (const engine of ['cua', 'vendor']) {
    const i = j.interference[engine];
    out.push(`- ${engine}: ${share(engine)}${i.failed.length ? `; failed: ${i.failed.map(f => `${f.id} (${[!f.frontmost && 'frontmost changed', !f.topWindow && 'top window changed', f.focus === false && 'focus left the user window', windowOrderReason(f.windowOrder), f.activations && `${f.activations} activation(s)`, f.route4 && 'route 4'].filter(Boolean).join(', ')})`).join('; ')}` : ''}${i.declared.length ? `; declared: ${i.declared.map(d => `${d.id} (${d.kind})`).join('; ')}` : ''}`);
  }
  out.push('');

  const toTop = j.toTop ?? {counts: [], afterRaise: []};
  if (toTop.counts.length) {
    out.push(`- User windows to the top (ruling 1221): ${toTop.counts.map(c => `${c.scene} ${c.engine} waited ${c.waited}, raised ${c.raised}, raise failed ${c.raiseFailed}`).join('; ')}`
      + `${toTop.afterRaise.length ? `; not ok after a raise: ${toTop.afterRaise.map(r => `${r.engine} ${r.id}`).join(', ')}` : ''}.`);
  }
  // Ruling 1225: R3's witness, its control's result per run; a run with no control seen leaves its R3 rows NO VERDICT.
  const witness = j.witness ?? [];
  if (witness.length) {
    const runName = w => `${w.engine} run ${w.run}`;
    const seen = witness.filter(w => w.controls.length && w.controls.every(c => c.seen));
    const unseen = witness.filter(w => w.controls.some(c => !c.seen)), none = witness.filter(w => !w.controls.length);
    out.push(`- R3's witness (ruling 1225): the control seen in ${seen.length} of ${witness.length} runs`
      + `${unseen.length ? `; NOT seen: ${unseen.map(w => `${runName(w)} (${w.controls.filter(c => !c.seen).map(c => c.scene).join(', ')})`).join(', ')}` : ''}`
      + `${none.length ? `; no witness: ${none.map(w => `${runName(w)} (${w.missing ?? 'no control posted'})`).join(', ')}` : ''}`
      + `; ${witness.reduce((n, w) => n + w.noVerdict, 0)} row(s) NO VERDICT on it.`);
  }
  const notJudgedListed = s => j.notJudged.some(n => n.section === 'interference' && n.id === s.id);
  for (const s of j.sharedInterference ?? []) out.push(`- ${s.id}: both engines failed; ${s.kind === 'defect' ? `the person's ${s.moved.map(m => m.replace(/^the /, '')).join(', ')} moved: a shared product defect, ${notJudgedListed(s) ? `ticket ${s.ticket}, not judged (below)` : 'NO VERDICT on cua, ticket to be registered'}`
    : s.kind === 'venue' ? `nothing of the person's moved (${s.seen.join(', ')}): the venue's, ${notJudgedListed(s) ? 'not judged on its recorded evidence (below)' : 'NO VERDICT on cua'}` : `the record does not say what moved (${s.seen.join(', ')}): unread, NO VERDICT on cua`} (rulings 1219 and 1222)`);
  if (j.sharedInterference?.length) out.push('');
  out.push('## What changes for a user', '', 'The places where cua refuses or answers unconfirmed where the vendor answered ok (R3), each declared with its Decision Log entry; nothing else can be here.', '');
  if (j.departures.length) for (const d of j.departures) out.push(`- ${d.section} ${d.id}: the vendor answered ok, cua ${d.cua.answer} ("${d.cua.sentence}") in ${d.samples} sample(s); ${measuredLine(d)}${d.decision}`);
  for (const h of j.honest) out.push(`- ${h.section} ${h.id}: the vendor answered ok with other text (a false ok), cua answered ${h.cua.kind} (${h.cua.name}) in ${h.samples} sample(s): better, no entry needed`);
  for (const o of j.oracleDepartures ?? []) out.push(`- ${o.section} ${o.id}: judged against ruling 1119's oracle ${o.expected} on each engine (ruling 1219): cua read it in ${o.cuaRight} sample(s), the vendor composed otherwise in ${o.vendorWrong}; a declared departure where cua is right, the vendor's own failure and no cua block`);
  if (!j.departures.length && !j.honest.length && !j.oracleDepartures?.length) out.push('No declared departure was observed in these runs.');
  out.push('');
  if (notes.length) out.push('Known capability differences no matrix cell exercises (report text, never judged):', '', ...notes.map(noteLine), '');

  if (j.shared.length) {
    out.push('## Shared limits (vendor has them too)', '', 'Fixed-string rows where cua failed the same way as its own paired vendor sample, the same answer and the same read-back with the user\'s value kept (ruling 1144): equal, never a pass of the row\'s own check. Each observation grouped by its own cause; each cause needs a ticket, which the design session registers: P2 or higher for a shared false ok, P3 for an honest shared failure.', '');
    for (const g of j.shared) {
      out.push(`### ${g.kind} (${g.priority}): ${g.cause}`, '');
      for (const r of g.rows) out.push(`- ${r.id}: ${r.samples} sample(s)${Number.isInteger(r.length) && Number.isInteger(r.expectedLength) ? `, read back ${r.length} of ${r.expectedLength} characters on both` : ''}`);
      out.push('');
    }
  }

  out.push(...renderNotJudged(j));

  out.push('## NO VERDICT by cell', '');
  const listed = j.cells.filter(c => !c.qualifies || Object.keys(c.account.vendor.noVerdict).length || Object.keys(c.account.cua.noVerdict).length);
  if (!j.runs.vendor && !j.runs.cua) out.push('No full run: no cell has a verdict.');
  else if (!listed.length) out.push(`No cell has a NO VERDICT sample, and every cell qualifies (${RUNS_PER_SIDE} complete run pairs).`);
  else {
    out.push(`Each judged cell with a sample without a verdict, or with fewer than ${RUNS_PER_SIDE} complete run pairs (the triple's requirement: runs whose pair is one proof, both sides holding the planned samples, every one with a verdict), which does not qualify and is missing proof. A sample without a verdict is never a pass and never a fail. Its causes: ${Object.entries(NO_VERDICT_CAUSES).map(([k, v]) => `${k}, ${v}`).join('; ')}. Vendor and cua runs are each side's runs every sample of which has a verdict (diagnostics); by run, the samples with a verdict of the samples the run holds.`, '',
      '| cell | verdict | complete pairs | vendor runs | cua runs | vendor by run | cua by run | vendor no verdict | cua no verdict | qualifies |', '|---|---|---|---|---|---|---|---|---|---|');
    const byRun = side => Object.entries(side.byRun).map(([run, r]) => `r${run} ${r.verdicts}/${r.samples}`).join(', ') || '-';
    for (const c of listed) out.push(`| ${c.section} ${c.id} | ${MARK[c.verdict] ?? c.verdict} | ${c.account.pairs} of ${RUNS_PER_SIDE} | ${c.account.vendor.runs} | ${c.account.cua.runs} | ${byRun(c.account.vendor)} | ${byRun(c.account.cua)} | ${causesText(c.account.vendor.noVerdict)} | ${causesText(c.account.cua.noVerdict)} | ${c.qualifies ? 'yes' : 'no'} |`);
    const unreferenced = listed.flatMap(c => (c.unreferenced ?? []).map(u => `- ${c.section} ${c.id}, run ${u.run}: ${u.reason}`));
    if (unreferenced.length) out.push('', 'The pairs whose vendor sample could not be the reference (`reference`):', '', ...unreferenced);
  }
  out.push('');

  out.push('## Methods', '', methodTable(j.methods), '', 'F: frontmost regime (the vendor\'s outcome is the reference, sample for sample); B: background regime (the fixture\'s ground truth). n/a: no meaningful target on that scene, on both engines:', '');
  for (const target of TARGETS) for (const [method, reason] of Object.entries(NOT_APPLICABLE[target] ?? {})) out.push(`- ${target} ${ENGINE_METHOD[method]}: ${reason}`);
  out.push('', '| row | verdict | vendor ok | cua ok | vendor route | cua route |', '|---|---|---|---|---|---|');
  for (const m of j.methods) out.push(`| ${m.id} | ${MARK[m.verdict]} | ${verdictCounts(m.vendor)} | ${verdictCounts(m.cua)} | ${routeText(m.routes.vendor)} | ${routeText(m.routes.cua)} |`);
  out.push('');

  if (j.launch.length) {
    out.push('## Launch path', '', '| row | verdict | vendor ok | cua ok |', '|---|---|---|---|');
    for (const l of j.launch) out.push(`| ${l.id} | ${MARK[l.verdict]} | ${verdictCounts(l.vendor)} | ${verdictCounts(l.cua)} |`);
    out.push('');
  }

  if (j.probe.length) {
    out.push('## Concurrent use and intervention', '', 'Each row against its own outcome (the user\'s keystroke kept, userIntervened, the refusal); the vendor\'s recorded beside it.', '',
      '| row | verdict | vendor ok | cua ok |', '|---|---|---|---|');
    for (const r of j.probe) out.push(`| ${r.id} | ${MARK[r.verdict]} | ${verdictCounts(r.vendor)} | ${verdictCounts(r.cua)} |`);
    out.push('');
  }
  if (j.unicode.length) {
    out.push('## Korean and Unicode', '', 'Each field\'s cell: cua ok/valid, then the vendor\'s; a cua row that failed is marked. Read back by SHA-256 against the text expected: the string sent, and for pressKey r k, rk under Latin and 가 under Korean 2-Set (ruling 1119).', '');
    for (const condition of CONDITIONS) {
      const list = j.unicode.filter(r => r.id.split('/')[1].split('@')[0] === condition);
      if (!list.length) continue;
      const users = [...new Set(list.map(r => r.id.split('/')[1].split('@')[1]).filter(Boolean))];
      out.push(`### ${condition}${users.length ? ` (user window: ${list.map(r => `${r.id.split('/')[0]}@${r.id.split('/')[1].split('@')[1]}`).filter((v, i, a) => a.indexOf(v) === i).join(', ')})` : ''}`, '',
        `| row | ${UNICODE_FIELDS.join(' | ')} |`, `|---|${UNICODE_FIELDS.map(() => '---').join('|')}|`);
      for (const name of [...new Set(list.map(r => r.id.split('/')[2]))]) {
        const cell = field => { const r = list.find(x => x.id.startsWith(`${field}/`) && x.id.endsWith(`/${name}`)); return r ? `${r.verdict === 'worse' ? '**' : ''}${r.cua.ok}/${r.cua.valid}${r.verdict === 'worse' ? '**' : ''} · ${r.vendor.ok}/${r.vendor.valid}` : '-'; };
        out.push(`| ${name} | ${UNICODE_FIELDS.map(cell).join(' | ')} |`);
      }
      out.push('');
    }
  }
  if (j.narrowed.length) {
    out.push('## Narrowed matrix cells (listed, not counted)', '', ...j.narrowed.map(n => `- ${n.path}: ${n.cell} (${n.planId ?? 'no plan id'})`), '');
  }
  if (j.others.length) {
    out.push('## Other cells', '', '| cell | engine | sections | verdict | ok |', '|---|---|---|---|---|');
    for (const o of j.others) out.push(`| ${o.cell} | ${o.engine} | ${o.sections.join(', ')} | ${o.verdict} | ${o.ok}/${o.valid}${o.invalid ? ` (+${o.invalid} invalid)` : ''} |`);
    out.push('');
  }
  return `${out.join('\n')}\n`;
}

// Main's tickets for known defects (#587, #588), cited wherever the judge names their cells; the same field a shared
// not-interfering defect's ticket fills once main registers it (sharedInterferenceOf's `ticket`).
// #588's Open panel search row is not judged (ruling 1222, ./not-judged.mjs), so it is no longer named here.
// Ruling 1223 (R5 i): cua's background type-select cells are #587's as the frontmost one is; (R5 ii) TextEdit's Latin
// typeText #590's.
export const KNOWN_DEFECTS = Object.freeze({'method finder/frontmost/typeText.typeSelect': '#587', 'method finder/background/typeText.typeSelect@textedit': '#587',
  'method finder/background/typeText.typeSelect@electron': '#587', 'unicode textedit/latin/typeText.latin': '#590'});
// #590 (ruling 1223, R5 ii): a cua row that answered typeUnconfirmed after its text landed in a text field (its check read
// the effect, the field no "not a text field", which is #587's), the read-back failing.
export const READBACK_DEFECT = '#590';
const readbackFailedAfterLanding = r => r.engine === 'cua' && r.outcome?.errorName === 'typeUnconfirmed' && r.outcome.effect === true
  && !/not a text field/.test(String(r.outcome.threw ?? '')) && r.readback?.engine?.reason !== 'notTextField';
// The ticket a judged cell cites (`rows`: the judged rows), or ''.
const knownDefect = (section, id, rows = []) => {
  const ticket = KNOWN_DEFECTS[`${section} ${id}`] ?? (rows.some(r => r.section === section && r.id === id && readbackFailedAfterLanding(r)) ? READBACK_DEFECT : null);
  return ticket ? ` (known defect ${ticket})` : '';
};

// Ruling 1219 (h5): the not-interfering cells cua failed whose vendor rows failed too (undeclared on both). Each is judged
// from what moved, read on both engines' failing records: the person's front app, focus, an activation, the user's own
// window (`topChange.userWindowMoved`), or the user's input (`userKept`, `userLanded`) is a shared product defect, NO
// VERDICT on cua naming a ticket (null until main registers it; KNOWN_DEFECTS); with none of those, positive evidence of
// a window over the user's (`topChange` recorded with another window on top, or a target window above the user's,
// `windowOrder.after`) is the venue's, each such sample's row and field kept as its evidence; anything else (a top
// window changed with nothing recorded of what came over it, route 4 alone, an order or focus unread) is unread, never
// the venue's by default (fix wave I3).
// A cua sample is shared only with its own paired vendor sample, the same row, run and sample, as ruling 1144's shared
// limits pair (fix wave I2): a vendor failure elsewhere in the cell excuses nothing. Only samples the oracle judges
// (`applicable`: no sampleCause) pair or feed what moved. Each pair is classified on its two samples alone, never by
// the cell (the verification review): a defect when either moved the person's state; the venue's only when each of the
// two has evidence of its own (one side's evidence explains nothing of the other's failure); else unread. The pairs are
// then grouped by row and kind. -> {shared: [{id, kind: 'defect'|'venue'|'unread', moved, seen, ticket, samples,
// evidence}], cuaKeys: Set(pairKey) of every shared pair}.
function sharedInterferenceOf(rows, applicable, knownDefects = KNOWN_DEFECTS) {
  const failing = engine => rows.filter(r => r.engine === engine && applicable(r) && r.interference && interferenceFailed(r));
  const vendorFailed = new Map(failing('vendor').map(r => [pairKey(r), r]));
  const pairs = failing('cua').filter(c => vendorFailed.has(pairKey(c))).map(c => pairOf(c, vendorFailed.get(pairKey(c))));
  const order = ['defect', 'venue', 'unread'];
  const shared = [...groupBy(pairs, p => `${p.id}\u0000${order.indexOf(p.kind)}`)].sort(([a], [b]) => a.localeCompare(b)).map(([, list]) => {
    const {id, kind} = list[0], union = key => [...new Set(list.flatMap(p => p[key]))];
    return {id, kind, moved: union('moved'), seen: union('seen'), ticket: knownDefects[`interference ${id}`] ?? null, samples: list.length, evidence: list.flatMap(p => p.evidence)};
  });
  return {shared, cuaKeys: new Set(pairs.map(p => p.key))};
}
// One shared pair (a cua sample and its paired vendor sample) read on those two alone. -> {id, key, kind, moved, seen,
// evidence}.
function pairOf(c, v) {
  const moved = new Set(), seen = new Set(), evidence = [];
  let explained = 0;
  for (const r of [c, v]) {
    const i = r.interference;
    if (i.frontmost === false) moved.add('the front app');
    if (i.focus === false) moved.add('the focus');
    if (i.activations > 0) moved.add('an activation');
    if (i.topChange?.userWindowMoved) moved.add('the user window');
    if (r.outcome?.userKept === false || r.outcome?.userLanded === false) moved.add('the input');
    const at = field => { evidence.push({row: r.id, engine: r.engine, run: runOf(r), sample: r.sample ?? runOf(r), field}); explained += 1; };
    // A target window above the user's (`windowOrder.after`) is what came over it; else `topChange` says, or nothing does.
    if (i.windowOrder?.after === true) { seen.add('a target window above the user\'s'); at('interference.windowOrder.after'); }
    else if (i.topWindow === false && !i.topChange?.userWindowMoved) {
      seen.add(i.topChange ? 'the top window (another window over the user\'s)' : 'the top window (what came over it not recorded)');
      if (i.topChange) at('interference.topChange');
    }
    if (i.route4) seen.add('route 4');
  }
  const kind = moved.size ? 'defect' : explained === 2 ? 'venue' : 'unread';
  return {id: c.id, key: pairKey(c), kind, moved: [...moved], seen: [...seen], evidence: kind === 'venue' ? evidence : []};
}
// A sample's pairing key: its row, run and sample (ruling 1144's pairing).
const pairKey = r => `${r.id}\u0000${runOf(r)}\u0000${r.sample ?? runOf(r)}`;
// A judged sample that failed not interfering, not declared.
const interferenceFailed = r => !r.interference.ok && !r.interference.declared;
// A shared item as a not-judged entry (ruling 1222): a defect with its ticket, or the venue's with its evidence; null for
// anything else, which stays missing proof.
function sharedEntryOf(s) {
  const base = {id: s.id, section: 'interference'};
  if (s.kind === 'defect' && s.ticket) return {...base, condition: 'sharedDefect', cause: `cua failed not interfering with its paired vendor sample, and the person's ${s.moved.map(m => m.replace(/^the /, '')).join(', ')} moved: a product defect both engines share (rulings 1219 and 1222)`, ticket: s.ticket, samples: s.samples};
  if (s.kind === 'venue') return {...base, condition: 'sharedVenue', cause: `cua failed not interfering with its paired vendor sample, and nothing of the person's moved (${s.seen.join(', ')}): the venue's (rulings 1219 and 1222)`, evidence: s.evidence, samples: s.samples};
  return null;
}
