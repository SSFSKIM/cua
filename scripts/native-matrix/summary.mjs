// The native matrix's judgment and report (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification
// system parts 4 and 5, Acceptance 7): every CellResult under one or more directories (./cell-result.mjs; the matrix's
// own runs and any cell implemented elsewhere, M2a's residue on the live harness, M2b.3's probe cells), pooled by
// engine, judged and written as the method table, the per-scene speed table and the three-point section.
// `native-matrix.mjs summary <dir>` writes summary.md; `compare <vendor-dir> <cua-dir>` prints the verdict; both judge
// alike (judge).
//
// The rules:
// - Method rows (section 'method', id `<target>/<regime>/<method>.<case>`). Frontmost: the vendor's outcome is the
//   reference, sample for sample (the run number): cua is worse on a sample where the vendor passed and cua did not;
//   better where cua passed and the vendor did not. Background: the fixture's ground truth is the reference, so every
//   valid cua sample passes. A row with no valid cua sample has no verdict, which blocks as a failure does.
// - Speed rows (section 'speed', id `<scene>/<op>`, ok meaning measured): the in-cell medians and p95s, the beat being
//   cua's median at most 90% of the vendor's with its p95 not worse; a missed beat is the owner's fork at M5, not a failure.
// - Finding rows (section 'finding', ok meaning measured): per scene the targets resolved (in every valid sample), the
//   titled share and the ID count (medians); cua not lower on any measure and its resolved sum higher passes; not lower
//   with the sum equal is parity, the owner's call; lower on any measure fails.
// - Interference (the `interference` of background method rows, launch rows, concurrent-use rows and the Unicode
//   matrix's rows behind a user window): cua at 100%, a row with a declared cause (a self-activating family, an
//   accepted route 4) listed for the owner rather than passed; the vendor's score recorded beside it.
// - Launch rows (section 'launch'): the launch worked (`ok`) judged as a background method row is, apart from their
//   interference: a valid cua sample that did not launch is worse, none valid is no verdict.
// - The probe cells (sections 'concurrent' and 'intervention', ./probe-run.mjs) and the Korean and Unicode matrix
//   ('unicode', ./unicode-run.mjs), rows of every full run: each judged against its own outcome as a background method
//   row is (the cell's rule, not the vendor's result, is the reference; the vendor's is recorded beside it): a valid
//   cua sample that failed blocks, none valid is no verdict; a declared Unicode row is the owner's to read, and a
//   declaration of the expected file no full run needed is named for the owner.
// - Any other cell (the settle cell, M2a's residue): each cell's verdict per engine as its rows give it
//   (./cell-result.mjs verdictOf), listed.
//
// What counts (the proof): only the whole matrix's results (cell 'matrix', meta.planId 'full') feed the tables; a
// narrowed matrix cell (`cell method --scene …`) is listed and not counted. The full runs must form one proof: at least
// RUNS_PER_SIDE complete, attested runs per engine, one device, one OS, one host and one engine build per engine; each
// run number's vendor and cua runs one hold (meta.sitting, the lanes' --sitting), one commit and one approved engine
// build, so every pair of samples compared was measured together (the run numbers may span holds: hold 2a's runs 1
// and 2, hold 2b's run 3); no (section, id, engine, sample) twice, and every row of the manifest (manifestOf) in
// every run, built only from a run whose own metadata says what it holds (a positive meta.run and meta.samples, an
// attested lane naming its host and engine); every valid background or launch row carries its oracle reading. Whatever
// is missing is NO VERDICT, which blocks M5 as a failure does but is not one. What the matrix does not run on a shared
// Mac (./plan.mjs OWNER_OPTIONS) is listed as the owner's option, outside the verdict.
//
// The verdict: FAIL when something was judged worse, lower or interfering; else NO VERDICT when proof is missing; else
// OWNER when only the owner's calls remain; else PASS.
import {stats} from '../native-baseline/summary.mjs';
import {SCENES} from '../repl-parity/scenes-mac.mjs';
import {readCellResults} from './cell-result.mjs';
import {CASES, caseId, ENGINE_METHOD, METHODS, NOT_APPLICABLE, OWNER_OPTIONS, SCENE_OF, TARGETS} from './plan.mjs';
import {MATRIX_CELLS} from './registry.mjs';
import {probeRowsOf} from './probe-run.mjs';
import {FULL_PLAN} from './run.mjs';
import {CONDITIONS, readDeclarations, UNICODE_FIELDS, unicodeRowsOf} from './unicode-plan.mjs';

export const BEAT = 0.9;
export const RUNS_PER_SIDE = 3;
export const SPEED_OPS = Object.freeze(['getAXState', 'getScreenshot', 'listApps']);
const SCENE_IDS = ['textedit', 'finder', 'chrome', 'electron'];
const round = n => (n === null || n === undefined ? null : Math.round(n * 10) / 10);
const SECTION_NAMES = {concurrent: 'concurrent use', intervention: 'intervention', unicode: 'unicode'};

// Every CellResult under `dirs`, with what keeps any of them from being read. -> {results: [{path, result}], problems}.
export function readResults(dirs) {
  const results = [], problems = [];
  for (const dir of dirs) for (const {path, result, problems: own} of readCellResults(dir)) {
    if (own.length) problems.push(`${dir}/${path}: ${own.join('; ')}`);
    else results.push({path: `${dir}/${path}`, result});
  }
  return {results, problems};
}

// Every row one full matrix run must hold (FULL_PLAN): the method cases of both regimes, the speed ops of every scene
// (`samples` each), the finding rows of every scene (its ten targets, the lines and the ID count), the launch rows, the
// probe cells' rows and the Unicode matrix's.
// `run` is the run's number (meta.run), the sample of its method, finding and launch rows. -> [{section, id, sample}].
export function manifestOf({run, samples}, plan = FULL_PLAN) {
  const out = [];
  for (const target of plan.frontmost) for (const c of CASES[target]) out.push({section: 'method', id: caseId(target, 'frontmost', c), sample: run});
  for (const {driven, user} of plan.background) for (const c of CASES[driven]) out.push({section: 'method', id: caseId(driven, 'background', c, user), sample: run});
  const scenes = [...new Set(plan.frontmost.filter(t => t !== 'openPanel').map(t => SCENE_OF[t]))];
  if (plan.speed) for (const scene of scenes) for (const op of SPEED_OPS) for (let i = 1; i <= samples; i++) out.push({section: 'speed', id: `${scene}/${op}`, sample: (run - 1) * samples + i});
  if (plan.finding) for (const scene of scenes) {
    for (const t of SCENES[scene].targets) out.push({section: 'finding', id: `${scene}/target.${t.id}`, sample: run});
    out.push({section: 'finding', id: `${scene}/lines`, sample: run}, {section: 'finding', id: `${scene}/ids`, sample: run});
  }
  for (const {scene, user} of plan.launch) out.push({section: 'launch', id: `${scene}/background/launch@${user}`, sample: run});
  for (const {section, id} of probeRowsOf(plan)) out.push({section, id, sample: run});
  if (plan.unicode) for (const {id} of unicodeRowsOf(plan.unicode)) out.push({section: 'unicode', id, sample: run});
  return out;
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

// Whether the full runs are one proof (the module's header). -> [missing proof, each a sentence].
export function proofProblems(full) {
  const missing = [];
  const one = (what, values) => {
    const seen = [...new Set(values.map(v => JSON.stringify(v ?? null)))];
    if (seen.length > 1) missing.push(`the full runs name more than one ${what} (${seen.join(', ')}): one proof's runs are judged together`);
  };
  one('device', full.map(({result}) => result.device));
  one('OS', full.map(({result}) => result.meta?.os));
  // Each run number's pair: one hold, one commit, one approved engine build (the bundle every lane's probes run).
  const byRun = new Map();
  for (const entry of full) if (Number.isSafeInteger(entry.result.meta?.run)) byRun.set(entry.result.meta.run, [...(byRun.get(entry.result.meta.run) ?? []), entry]);
  for (const [n, list] of [...byRun].sort(([a], [b]) => a - b)) {
    const has = engine => list.some(({result}) => result.lanes[0]?.engine === engine);
    if (!has('cua')) missing.push(`run ${n} has no cua full run: its samples cannot be compared with the vendor's`);
    if (!has('vendor')) missing.push(`run ${n} has no vendor full run: its samples cannot be compared with cua's`);
    const pair = (what, values) => {
      const seen = [...new Set(values.map(v => JSON.stringify(v ?? null)))];
      if (seen.length > 1) missing.push(`run ${n}'s vendor and cua runs name more than one ${what} (${seen.join(', ')}): a pair is measured in one hold`);
    };
    pair('hold', list.map(({result}) => result.meta?.sitting));
    pair('commit', list.map(({result}) => result.meta?.commit));
    const builds = list.map(({result}) => result.meta?.nativeEngine?.approved?.build);
    if (builds.some(b => typeof b !== 'string' || !b)) missing.push(`run ${n}: a run records no approved engine build (meta.nativeEngine.approved): its pair cannot be shown to share one`);
    else pair('approved engine build', builds);
  }
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
      const absent = manifestOf({run: result.meta?.run, samples: result.meta?.samples}).filter(e => !have.has(`${e.section} ${e.id} ${e.sample}`));
      if (absent.length) missing.push(`${path}: ${absent.length} row(s) of the manifest missing (${absent.slice(0, 3).map(e => `${e.section} ${e.id}#${e.sample}`).join(', ')}${absent.length > 3 ? ', …' : ''})`);
    }
  }
  const keys = full.flatMap(({result}) => result.rows.map(r => `${r.section} ${r.id} ${r.engine} ${r.sample}`));
  const repeated = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
  if (repeated.length) missing.push(`${repeated.length} row(s) appear twice in the full runs (${repeated.slice(0, 3).join(', ')}${repeated.length > 3 ? ', …' : ''})`);
  return missing;
}

const groupBy = (items, key) => { const out = new Map(); for (const item of items) { const k = key(item); if (!out.has(k)) out.set(k, []); out.get(k).push(item); } return out; };

// One method row's verdict from both engines' samples. -> {verdict: 'equal'|'better'|'worse'|'no-verdict', vendor, cua, routes}.
export function judgeMethod(regime, vendorRows, cuaRows) {
  const valid = rows => rows.filter(r => !r.invalid);
  const v = valid(vendorRows), c = valid(cuaRows);
  const passes = r => r.ok === true || r.declared !== undefined;
  const count = rows => ({ok: rows.filter(passes).length, valid: rows.length, invalid: 0});
  const vendor = {...count(v), invalid: vendorRows.length - v.length}, cua = {...count(c), invalid: cuaRows.length - c.length};
  const routes = {vendor: [...new Set(v.map(r => r.inputRoute ?? null))], cua: [...new Set(c.map(r => r.inputRoute ?? null))]};
  if (!c.length) return {verdict: 'no-verdict', vendor, cua, routes};
  if (regime === 'background') return {verdict: c.every(passes) ? (v.length && v.some(r => !passes(r)) ? 'better' : 'equal') : 'worse', vendor, cua, routes};
  const bySample = new Map(v.map(r => [r.sample ?? 1, r]));
  let worse = false, better = false;
  for (const row of c) {
    const reference = bySample.get(row.sample ?? 1);
    if (!reference) { if (!passes(row)) worse = true; continue; }
    if (passes(reference) && !passes(row)) worse = true;
    if (!passes(reference) && passes(row)) better = true;
  }
  return {verdict: worse ? 'worse' : better ? 'better' : 'equal', vendor, cua, routes};
}

// One speed op's comparison. -> {vendor: stats, cua: stats, deltaPct, beat: true|false|null}.
export function judgeSpeed(vendorRows, cuaRows) {
  const times = rows => rows.filter(r => r.ok && !r.invalid).map(r => r.inCellMs);
  const vendor = stats(times(vendorRows)), cua = stats(times(cuaRows));
  if (!vendor || !cua) return {vendor, cua, deltaPct: null, beat: null};
  return {vendor, cua, deltaPct: round(((cua.median - vendor.median) / vendor.median) * 100), beat: cua.median <= BEAT * vendor.median && cua.p95 <= vendor.p95};
}

// One scene's finding measures for one engine. -> {resolved, found, share, ids, targets} or null without a sample.
export function findingMeasures(rows) {
  const valid = rows.filter(r => !r.invalid);
  const targets = groupBy(valid.filter(r => /\/target\./.test(r.id)), r => r.id);
  if (!targets.size) return null;
  const all = (list, key) => list.every(r => r.outcome?.[key] === true);
  const resolved = [...targets.values()].filter(list => all(list, 'resolved')).length;
  const found = [...targets.values()].filter(list => all(list, 'found')).length;
  const lines = valid.filter(r => r.id.endsWith('/lines')).map(r => (r.outcome?.lines ? r.outcome.named / r.outcome.lines : null));
  const ids = valid.filter(r => r.id.endsWith('/ids')).map(r => r.outcome?.ids);
  return {resolved, found, share: round((stats(lines)?.median ?? 0) * 1000) / 1000, ids: stats(ids)?.median ?? 0, targets: targets.size};
}

// The judgment of everything read. `problems`: results that could not be read, missing proof. -> {problems, runs,
// narrowed, methods, launch, speed, finding, interference, others, owner, blocking, missing, verdict}.
export function judge(results, problems = []) {
  const own = ({result}) => Boolean(MATRIX_CELLS[result.cell]);
  const full = results.filter(r => own(r) && r.result.cell === 'matrix' && r.result.meta?.planId === 'full');
  const narrowed = results.filter(r => own(r) && !full.includes(r)).map(({path, result}) => ({path, cell: result.cell, planId: result.meta?.planId ?? null}));
  const rows = full.flatMap(({result}) => result.rows.map(row => ({...row, cell: result.cell})));
  const runs = {vendor: 0, cua: 0};
  for (const {result} of full) runs[result.lanes[0]?.engine] = (runs[result.lanes[0]?.engine] ?? 0) + 1;
  const missingProof = [...problems, ...proofProblems(full)];
  for (const {result, path} of results) {
    if (!result.complete && !narrowed.some(n => n.path === path)) missingProof.push(`${path}: ${result.cell} is ${result.verdict === 'refused' ? 'refused' : 'incomplete'}${result.problems.length ? ` (${result.problems.join('; ')})` : ''}`);
  }

  // Methods.
  const methodRows = rows.filter(r => r.section === 'method');
  const methods = [];
  for (const [id, list] of groupBy(methodRows, r => r.id)) {
    const [target, regime] = id.split('/');
    methods.push({id, target, regime, method: list[0].method, case: list[0].case, ...judgeMethod(regime, list.filter(r => r.engine === 'vendor'), list.filter(r => r.engine === 'cua'))});
  }
  methods.sort((a, b) => a.id.localeCompare(b.id));

  // Speed.
  const speedRows = rows.filter(r => r.section === 'speed');
  const speed = [];
  for (const [id, list] of groupBy(speedRows, r => r.id)) {
    const [scene, op] = [id.slice(0, id.indexOf('/')), id.slice(id.indexOf('/') + 1)];
    speed.push({id, scene, op, ...judgeSpeed(list.filter(r => r.engine === 'vendor'), list.filter(r => r.engine === 'cua'))});
  }
  speed.sort((a, b) => a.id.localeCompare(b.id));

  // Finding.
  const finding = SCENE_IDS.map(scene => {
    const of = engine => findingMeasures(rows.filter(r => r.section === 'finding' && r.engine === engine && r.id.startsWith(`${scene}/`)));
    return {scene, vendor: of('vendor'), cua: of('cua')};
  }).filter(f => f.vendor || f.cua);
  const measured = finding.filter(f => f.vendor && f.cua);
  const lower = measured.filter(f => ['resolved', 'share', 'ids'].some(k => f.cua[k] < f.vendor[k]));
  const sum = engine => measured.reduce((n, f) => n + f[engine].resolved, 0);
  const findingVerdict = !measured.length || measured.length < finding.length ? 'no-verdict' : lower.length ? 'fail' : sum('cua') > sum('vendor') ? 'pass' : 'parity';

  // Interference: background method rows, launch rows, the probe cells' concurrent-use rows (the user window in front,
  // the sheet variant's among them) and the Unicode matrix's rows behind a user window (`<field>/<condition>@<user>/…`);
  // a valid one without its reading is missing proof.
  const applicable = r => !r.invalid && ((r.section === 'method' && r.regime === 'background') || r.section === 'launch' || r.section === 'concurrent'
    || (r.section === 'unicode' && r.id.split('/')[1]?.includes('@')));
  for (const engine of ['vendor', 'cua']) {
    const unread = rows.filter(r => r.engine === engine && applicable(r) && !r.interference).length;
    if (unread) missingProof.push(`not interfering: ${unread} valid background or launch row(s) on ${engine} carry no oracle reading`);
  }
  const judged = engine => rows.filter(r => r.engine === engine && applicable(r) && r.interference);
  const interference = Object.fromEntries(['vendor', 'cua'].map(engine => {
    const list = judged(engine);
    const declared = r => r.interference.declared;
    return [engine, {rows: list.length, ok: list.filter(r => r.interference.ok).length, route4: list.filter(r => r.interference.route4 && declared(r)?.kind !== 'route4-accepted').length,
      declared: list.filter(r => !r.interference.ok && declared(r)).map(r => ({id: r.id, ...declared(r)})),
      failed: list.filter(r => !r.interference.ok && !declared(r)).map(r => ({id: r.id, frontmost: r.interference.frontmost, topWindow: r.interference.topWindow, focus: r.interference.focus ?? null,
        activations: r.interference.activations, route4: r.interference.route4}))}];
  }));
  // The launch path's outcome, apart from its interference.
  const launch = [];
  for (const [id, list] of groupBy(rows.filter(r => r.section === 'launch'), r => r.id)) {
    launch.push({id, ...judgeMethod('background', list.filter(r => r.engine === 'vendor'), list.filter(r => r.engine === 'cua'))});
  }
  launch.sort((a, b) => a.id.localeCompare(b.id));

  // The probe cells and the Unicode matrix, each row against its own outcome.
  const byOwnOutcome = sections => {
    const out = [];
    for (const [id, list] of groupBy(rows.filter(r => sections.includes(r.section)), r => r.id)) {
      out.push({id, section: list[0].section, ...judgeMethod('background', list.filter(r => r.engine === 'vendor'), list.filter(r => r.engine === 'cua'))});
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  };
  const probe = byOwnOutcome(['concurrent', 'intervention']);
  const unicode = byOwnOutcome(['unicode']);
  const failedUnicode = new Set(rows.filter(r => r.section === 'unicode' && !r.invalid && r.ok !== true).map(r => `${r.id}\0${r.engine}`));
  const unneeded = full.length ? readDeclarations().filter(d => !failedUnicode.has(`${d.id}\0${d.engine}`)) : [];

  // Other cells (implemented elsewhere), by cell and engine.
  const others = [];
  for (const {result, path} of results) {
    if (own({result})) continue;
    for (const [engine, list] of groupBy(result.rows, r => r.engine)) {
      const valid = list.filter(r => !r.invalid);
      others.push({cell: result.cell, path, engine, sections: [...new Set(list.map(r => r.section))], verdict: result.verdict, ok: valid.filter(r => r.ok).length, valid: valid.length, invalid: list.length - valid.length});
    }
  }

  const methodFails = methods.filter(m => m.verdict === 'worse'), methodUnproven = methods.filter(m => m.verdict === 'no-verdict');
  const interferencePass = interference.cua.rows > 0 && interference.cua.failed.length === 0 && interference.cua.declared.length === 0;
  const speedMisses = speed.filter(s => s.beat === false);
  const speedUnmeasured = speed.filter(s => s.beat === null);
  // Rows not ok with a declared cause (./cell-result.mjs counts): never silent, each the owner's to read.
  const declaredRows = rows.filter(r => !r.invalid && r.ok !== true && r.declared);
  const owner = [
    ...declaredRows.map(r => `declared: ${r.section} ${r.id} on ${r.engine}: ${r.declared.kind}: ${r.declared.cause}`),
    ...speedMisses.map(s => `speed: ${s.id} missed the 10% beat (cua ${round(s.cua.median)} ms against ${round(s.vendor.median)} ms, p95 ${round(s.cua.p95)} against ${round(s.vendor.p95)})`),
    ...(findingVerdict === 'parity' ? ['finding elements: parity on the resolved sum (the owner decides)'] : []),
    ...interference.cua.declared.map(d => `not interfering: ${d.id}: ${d.cause}`),
    ...unneeded.map(d => `unicode: the expected file declares ${d.id} on ${d.engine}, which no full run needed: remove it`),
  ];
  const blocking = [
    ...methodFails.map(m => `method: ${m.id} is worse on cua`),
    ...launch.filter(l => l.verdict === 'worse').map(l => `launch: ${l.id} did not launch on cua`),
    ...(findingVerdict === 'fail' ? lower.map(f => `finding elements: ${f.scene} is lower on cua`) : []),
    ...interference.cua.failed.map(f => `not interfering: ${f.id} failed on cua`),
    ...[...probe, ...unicode].filter(r => r.verdict === 'worse').map(r => `${r.section}: ${r.id} failed on cua`),
    ...others.filter(o => o.engine === 'cua' && o.verdict === 'fail').map(o => `${o.cell}: fail on cua`),
  ];
  const missing = [
    ...missingProof,
    ...methodUnproven.map(m => `method: ${m.id} has no valid cua sample`),
    ...launch.filter(l => l.verdict === 'no-verdict').map(l => `launch: ${l.id} has no valid cua sample`),
    ...[...probe, ...unicode].filter(r => r.verdict === 'no-verdict').map(r => `${SECTION_NAMES[r.section]}: ${r.id} has no valid cua sample`),
    ...(findingVerdict === 'no-verdict' ? ['finding elements: a scene has no measure on one engine'] : []),
    ...(interference.cua.rows === 0 ? ['not interfering: no background row was judged on cua'] : []),
    ...speedUnmeasured.map(s => `speed: ${s.id} has no measure on one engine`),
    ...others.filter(o => o.engine === 'cua' && o.verdict !== 'pass' && o.verdict !== 'fail').map(o => `${o.cell}: ${o.verdict} on cua`),
  ];
  const verdict = blocking.length ? 'FAIL' : missing.length ? 'NO VERDICT' : owner.length ? 'OWNER' : 'PASS';
  return {problems: missingProof, runs, narrowed, methods, launch, speed, finding, findingVerdict, interference, interferencePass, probe, unicode, others, owner, blocking, missing,
    options: OWNER_OPTIONS.map(o => ({...o})), verdict};
}

// ---- the report ---------------------------------------------------------------------------------------------------------

const MARK = {equal: 'equal', better: 'better', worse: '**worse**', 'no-verdict': '**no verdict**'};
const ms = n => (n === null || n === undefined ? '-' : (Math.round(n * 10) / 10).toFixed(1));
const counts = c => `${c.ok}/${c.valid}${c.invalid ? ` (+${c.invalid} invalid)` : ''}`;
const routeText = list => list.map(r => (r === null ? '-' : String(r))).join(', ');

// The method table: the 11 methods against the four scenes and the Open panel, each cell the worst verdict of its cases
// per regime (front/back), n/a with the plan's reason in a note.
export function methodTable(methods) {
  const rank = ['equal', 'better', 'no-verdict', 'worse'];
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

export function renderSummary(j, {title = 'Native matrix summary'} = {}) {
  const note = {OWNER: ' (nothing failed; the owner\'s calls below remain)', 'NO VERDICT': ' (nothing failed, but the proof below is missing: it blocks M5 as a failure does)'};
  const out = [`# ${title}`, '', `Verdict: **${j.verdict}**${note[j.verdict] ?? ''}`, '',
    `Full matrix runs: ${j.runs.vendor} vendor, ${j.runs.cua} cua (${RUNS_PER_SIDE} per side are the rule).`, ''];
  if (j.blocking.length) out.push('## Blocking', '', ...j.blocking.map(b => `- ${b}`), '');
  if (j.missing.length) out.push('## Missing proof (no verdict)', '', ...j.missing.map(b => `- ${b}`), '');
  if (j.options.length) out.push('## Owner options (not run; not part of the verdict)', '', ...j.options.map(o => `- ${o.option} (${o.section} ${o.id}): ${o.reason}`), '');
  if (j.owner.length) out.push('## For the owner', '', ...j.owner.map(o => `- ${o}`), '');

  out.push('## The three points', '');
  const beats = j.speed.filter(s => s.beat === true).length;
  out.push(`- **Speed**: ${beats} of ${j.speed.length} measured ops beat the vendor by at least 10% with p95 not worse; ${j.speed.filter(s => s.beat === false).length} missed (the owner's fork), ${j.speed.filter(s => s.beat === null).length} unmeasured.`);
  const sum = engine => j.finding.reduce((n, f) => n + (f[engine]?.resolved ?? 0), 0);
  out.push(`- **Finding elements**: ${j.findingVerdict}; resolved targets vendor ${sum('vendor')}, cua ${sum('cua')} of ${j.finding.reduce((n, f) => n + (f.vendor?.targets ?? f.cua?.targets ?? 0), 0)}.`);
  const share = engine => (j.interference[engine].rows ? `${Math.round((j.interference[engine].ok / j.interference[engine].rows) * 1000) / 10}% (${j.interference[engine].ok}/${j.interference[engine].rows})` : 'no rows');
  out.push(`- **Not interfering**: cua ${share('cua')}, vendor ${share('vendor')}; cua route-4 actions outside accepted families: ${j.interference.cua.route4}; declared for the owner: ${j.interference.cua.declared.length}.`);
  const passing = list => list.filter(r => ['equal', 'better'].includes(r.verdict)).length;
  out.push(`- **Concurrent use and intervention**: ${passing(j.probe)} of ${j.probe.length} rows pass on cua (concurrent use and its sheet variant, intervention fires, the pre-action refusal).`);
  out.push(`- **Korean and Unicode**: ${passing(j.unicode)} of ${j.unicode.length} rows pass on cua.`, '');

  out.push('## Methods', '', methodTable(j.methods), '', 'F: frontmost regime (the vendor\'s outcome is the reference, sample for sample); B: background regime (the fixture\'s ground truth). n/a: no meaningful target on that scene, on both engines:', '');
  for (const target of TARGETS) for (const [method, reason] of Object.entries(NOT_APPLICABLE[target] ?? {})) out.push(`- ${target} ${ENGINE_METHOD[method]}: ${reason}`);
  out.push('', '| row | verdict | vendor ok | cua ok | vendor route | cua route |', '|---|---|---|---|---|---|');
  for (const m of j.methods) out.push(`| ${m.id} | ${MARK[m.verdict]} | ${counts(m.vendor)} | ${counts(m.cua)} | ${routeText(m.routes.vendor)} | ${routeText(m.routes.cua)} |`);
  out.push('');

  out.push('## Speed (in-cell ms)', '');
  for (const scene of SCENE_IDS) {
    const list = j.speed.filter(s => s.scene === scene);
    if (!list.length) continue;
    out.push(`### ${scene}`, '', '| op | vendor median | vendor p95 | cua median | cua p95 | change | beat |', '|---|---|---|---|---|---|---|');
    for (const s of list) out.push(`| ${s.op} | ${ms(s.vendor?.median)} | ${ms(s.vendor?.p95)} | ${ms(s.cua?.median)} | ${ms(s.cua?.p95)} | ${s.deltaPct === null ? '-' : `${s.deltaPct > 0 ? '+' : ''}${s.deltaPct}%`} | ${s.beat === null ? 'unmeasured' : s.beat ? 'yes' : '**no**'} |`);
    out.push('');
  }

  out.push('## Finding elements', '', '| scene | vendor resolved | cua resolved | vendor titled share | cua titled share | vendor ID count | cua ID count |', '|---|---|---|---|---|---|---|');
  for (const f of j.finding) out.push(`| ${f.scene} | ${f.vendor?.resolved ?? '-'}/${f.vendor?.targets ?? '-'} | ${f.cua?.resolved ?? '-'}/${f.cua?.targets ?? '-'} | ${f.vendor?.share ?? '-'} | ${f.cua?.share ?? '-'} | ${f.vendor?.ids ?? '-'} | ${f.cua?.ids ?? '-'} |`);
  out.push('');

  if (j.launch.length) {
    out.push('## Launch path', '', '| row | verdict | vendor ok | cua ok |', '|---|---|---|---|');
    for (const l of j.launch) out.push(`| ${l.id} | ${MARK[l.verdict]} | ${counts(l.vendor)} | ${counts(l.cua)} |`);
    out.push('');
  }

  if (j.probe.length) {
    out.push('## Concurrent use and intervention', '', 'Each row against its own outcome (the user\'s keystroke kept, userIntervened, the refusal); the vendor\'s recorded beside it.', '',
      '| row | verdict | vendor ok | cua ok |', '|---|---|---|---|');
    for (const r of j.probe) out.push(`| ${r.id} | ${MARK[r.verdict]} | ${counts(r.vendor)} | ${counts(r.cua)} |`);
    out.push('');
  }
  if (j.unicode.length) {
    out.push('## Korean and Unicode', '', 'Each field\'s cell: cua ok/valid, then the vendor\'s; a cua row that failed is marked. Read back by SHA-256 against the string sent.', '');
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

  out.push('## Not interfering', '');
  for (const engine of ['cua', 'vendor']) {
    const i = j.interference[engine];
    out.push(`- ${engine}: ${share(engine)}${i.failed.length ? `; failed: ${i.failed.map(f => `${f.id} (${[!f.frontmost && 'frontmost changed', !f.topWindow && 'top window changed', f.focus === false && 'focus left the user window', f.activations && `${f.activations} activation(s)`, f.route4 && 'route 4'].filter(Boolean).join(', ')})`).join('; ')}` : ''}${i.declared.length ? `; declared: ${i.declared.map(d => `${d.id} (${d.kind})`).join('; ')}` : ''}`);
  }
  out.push('');
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
