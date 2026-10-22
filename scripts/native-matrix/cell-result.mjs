// The cell-result shape of the native matrix (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification
// system parts 4 to 7; Interfaces, NativeMatrix): what every matrix cell writes, whoever implements it, so that
// `native-matrix.mjs summary` and `compare` read one shape. The matrix's own run writes it (scripts/native-matrix.mjs run,
// one per run directory), `native-matrix.mjs cell <name>` writes it for a single cell, and a cell implemented elsewhere
// (M2a's residue cells on the live harness, ./live.mjs; M2b.3's probe cells) writes it too: one `result.json` per cell
// invocation, beside whatever else that harness keeps.
//
// CellResult (one JSON object, `result.json`):
//   schema     'native-matrix-cell-1'
//   cell       the registry name the result answers (./registry.mjs), e.g. 'matrix', 'non-interference', 'route4'
//   device     the device alias it ran on, or null for a result computed off any device
//   started, finished   ISO times
//   lanes      [{host, engine, build, version}]: each lane the result measured, as its results attested it
//              (`_meta['cua/nativeEngine']`; a lane that drives the engine's socket directly names host null)
//   complete   true when the cell ran to its end, all its mandatory evidence is in and its put-back held; a result
//              that is not complete is no-verdict
//   verdict    'pass' | 'fail' | 'no-verdict' | 'refused' (verdictOf: refused before anything on the device changed;
//              no-verdict when no row is valid or the result is not complete (missing evidence: never a pass, never a
//              plain fail); fail when any valid row is neither ok nor declared, or, in a result that judges
//              interference, any valid row whose oracle reading did not hold and was not declared; else pass)
//   judgesInterference   optional, true: the verdict also judges each row's oracle reading (a standalone cell, e.g.
//              `cell non-interference`, which no summary judges; the whole matrix's runs leave it to summary)
//   problems   [string]: why it is not complete, each a bounded sentence
//   rows       [Row]
//   putBack    optional, the put-back's answer ({ok, ...})
//   meta       optional, anything the cell keeps about its context (never screen content)
//
// Row (one judged sample):
//   section    which part of the summary it feeds (SECTIONS): 'method' (part 4), 'speed' (part 5's speed), 'finding'
//              (part 5's finding elements), 'interference' (part 5's not interfering), 'launch' (part 4's launch path),
//              'concurrent', 'intervention', 'unicode', 'settle' (M2b.3), 'residue' (M2a's residue, M2b.1), 'route-ab' (hold 3's
//              route A/B on the Electron button, ./route-ab.mjs)
//   id         the row's name within its section, stable across runs and engines, so two engines' rows pair by it:
//              a method row `<target>/<regime>/<method>.<case>` (the target a scene or `openPanel`; a background row
//              ends `@<user>`, the user scene), a speed row
//              `<scene>/<op>` (op getAXState, getScreenshot, listApps or `method.<method>.<case>`), a finding row
//              `<scene>/target.<id>` (outcome {found, resolved}), `<scene>/lines` (outcome {lines, named, unclassified})
//              or `<scene>/ids` (outcome {ids}), a launch row `<scene>/background/launch@<user>`, a residue row whatever its
//              cell names it
//   engine     'vendor' | 'cua': the engine the row measured (a residue cell comparing both carries rows of each)
//   sample     a positive integer (1 when the cell takes one)
//   ok         the outcome judged against its reference (the fixture's ground truth, or the refusal the case expects);
//              on a 'speed' or 'finding' row, that the sample was measured (those sections are judged by comparing the
//              two engines' samples, ./summary.mjs, not row by row)
//   invalid    optional, a reason: the sample says nothing (its target was not in front, its probe post fell outside
//              the action's interval); never a pass and never a fail, kept out of every verdict and statistic
//   scene, user, regime ('frontmost' | 'background'), method, case   optional, what the row drove
//   inCellMs, wallMs   optional numbers: performance.now() around the facade call inside the cell; the harness's time
//   inputRoute optional: the `cua/inputRoute` the action reported (1, "2'", 2, 3, 4, "paste"), null when none came
//   outcome    optional, what was read back: booleans, numbers, error names, bounded sentences; never accessibility
//              text, titles or values of windows the run does not own
//   interference   optional, part 5's oracle on the row (./oracle.mjs): {ok, frontmost, topWindow, activations, route4}
//   declared   optional, the declared cause of a row that is not ok, which keeps it from failing the verdict (a vendor
//              defect the cell exists to show, an expected difference): {kind, cause}. Never silent: the summary lists
//              every declared row that is not ok. The oracle's own declarations (an owner-accepted route 4, a family
//              that activates itself at launch) are `interference.declared`, and do not excuse the row's outcome.
//   error      optional, a bounded sentence (at most 300 characters)
// Anything else a row carries is kept and ignored by the summary.
import * as fs from 'node:fs';
import {join} from 'node:path';

export const CELL_RESULT_SCHEMA = 'native-matrix-cell-1';
export const RESULT_FILE = 'result.json';
export const SECTIONS = Object.freeze(['method', 'speed', 'finding', 'interference', 'launch', 'concurrent', 'intervention', 'unicode', 'settle', 'residue', 'route-ab']);
export const ENGINES = Object.freeze(['vendor', 'cua']);
export const REGIMES = Object.freeze(['frontmost', 'background']);
export const VERDICTS = Object.freeze(['pass', 'fail', 'no-verdict', 'refused']);
export const INPUT_ROUTES = Object.freeze([1, "2'", 2, 3, 4, 'paste']);
const ERROR_CHARS = 300;

const isString = value => typeof value === 'string' && value.length > 0;
const isTime = value => isString(value) && !Number.isNaN(Date.parse(value));
const bounded = text => String(text).slice(0, ERROR_CHARS);

// The cell's verdict from its rows: refused before anything ran; no-verdict without a valid row or when the cell did
// not complete (its evidence is missing: a cell with missing samples is NO VERDICT, which blocks); fail on any valid
// row that is neither ok nor declared (a declared row is not ok and says why); else pass.
export const counts = row => row.ok === true || row.declared !== undefined;
// The row's oracle reading held, or the oracle declared why not (an owner-accepted route 4, a self-activating family).
const interferenceHolds = row => row.interference === undefined || row.interference.ok === true || row.interference.declared !== undefined;
export function verdictOf({refused = false, complete, rows, judgesInterference = false}) {
  if (refused) return 'refused';
  const valid = rows.filter(row => !row.invalid);
  if (!valid.length || !complete) return 'no-verdict';
  return valid.every(row => counts(row) && (!judgesInterference || interferenceHolds(row))) ? 'pass' : 'fail';
}

// A CellResult from its parts, the verdict computed and the errors bounded. -> CellResult.
export function cellResult({cell, device = null, started, finished = new Date().toISOString(), lanes = [], complete, refused = false, problems = [], rows = [], putBack, meta,
  judgesInterference = false}) {
  const kept = rows.map(row => (row.error === undefined ? row : {...row, error: bounded(row.error)}));
  return {schema: CELL_RESULT_SCHEMA, cell, device, started, finished, lanes, complete: Boolean(complete) && !refused,
    verdict: verdictOf({refused, complete: Boolean(complete), rows: kept, judgesInterference}), ...(judgesInterference ? {judgesInterference: true} : {}),
    problems: problems.map(bounded), rows: kept,
    ...(putBack === undefined ? {} : {putBack}), ...(meta === undefined ? {} : {meta})};
}

// The problems with a row, each naming the field. -> [string].
export function rowProblems(row, at = 'row') {
  const out = [];
  if (!row || typeof row !== 'object' || Array.isArray(row)) return [`${at} is not an object`];
  if (!SECTIONS.includes(row.section)) out.push(`${at}.section is not one of ${SECTIONS.join(', ')}`);
  if (!isString(row.id)) out.push(`${at}.id is not a non-empty string`);
  if (!ENGINES.includes(row.engine)) out.push(`${at}.engine is not vendor or cua`);
  if (row.sample !== undefined && !(Number.isSafeInteger(row.sample) && row.sample > 0)) out.push(`${at}.sample is not a positive integer`);
  if (typeof row.ok !== 'boolean') out.push(`${at}.ok is not a boolean`);
  if (row.invalid !== undefined && !isString(row.invalid)) out.push(`${at}.invalid is not a reason`);
  if (row.regime !== undefined && !REGIMES.includes(row.regime)) out.push(`${at}.regime is not frontmost or background`);
  for (const key of ['inCellMs', 'wallMs']) if (row[key] !== undefined && !Number.isFinite(row[key])) out.push(`${at}.${key} is not a number`);
  if (row.inputRoute !== undefined && row.inputRoute !== null && !INPUT_ROUTES.includes(row.inputRoute)) out.push(`${at}.inputRoute is not one of 1, "2'", 2, 3, 4, "paste" or null`);
  if (row.error !== undefined && !(typeof row.error === 'string' && row.error.length <= ERROR_CHARS)) out.push(`${at}.error is not a sentence of at most ${ERROR_CHARS} characters`);
  if (row.interference !== undefined && typeof row.interference?.ok !== 'boolean') out.push(`${at}.interference.ok is not a boolean`);
  if (row.declared !== undefined && !(isString(row.declared?.kind) && isString(row.declared?.cause))) out.push(`${at}.declared needs a kind and a cause`);
  return out;
}

// The problems with a CellResult. -> [string]; empty when it conforms.
export function validateCellResult(result) {
  if (!result || typeof result !== 'object') return ['the result is not an object'];
  const out = [];
  if (result.schema !== CELL_RESULT_SCHEMA) out.push(`schema is not ${CELL_RESULT_SCHEMA}`);
  if (!isString(result.cell)) out.push('cell is not a registry name');
  if (result.device !== null && !isString(result.device)) out.push('device is neither an alias nor null');
  if (!isTime(result.started)) out.push('started is not an ISO time');
  if (!isTime(result.finished)) out.push('finished is not an ISO time');
  if (!Array.isArray(result.lanes) || result.lanes.some(lane => !ENGINES.includes(lane?.engine))) out.push('lanes is not a list of {host, engine, build, version}');
  if (typeof result.complete !== 'boolean') out.push('complete is not a boolean');
  if (!VERDICTS.includes(result.verdict)) out.push(`verdict is not one of ${VERDICTS.join(', ')}`);
  if (!Array.isArray(result.problems) || result.problems.some(p => typeof p !== 'string')) out.push('problems is not a list of sentences');
  if (result.judgesInterference !== undefined && result.judgesInterference !== true) out.push('judgesInterference is true or absent');
  if (!Array.isArray(result.rows)) return [...out, 'rows is not a list'];
  result.rows.forEach((row, i) => out.push(...rowProblems(row, `rows[${i}]`)));
  if (result.complete === false && ['pass', 'fail'].includes(result.verdict)) out.push(`an incomplete result cannot ${result.verdict === 'pass' ? 'pass' : 'fail'}: it is no-verdict`);
  if (Array.isArray(result.rows) && VERDICTS.includes(result.verdict) && result.verdict !== 'refused') {
    const expected = verdictOf({complete: result.complete === true, rows: result.rows, judgesInterference: result.judgesInterference === true});
    if (expected !== result.verdict) out.push(`verdict ${result.verdict} does not follow from the rows and complete (${expected})`);
  }
  const seen = new Set();
  for (const row of result.rows) {
    const key = `${row?.section}\0${row?.id}\0${row?.engine}\0${row?.sample ?? 1}`;
    if (seen.has(key)) out.push(`two rows are ${row.section} ${row.id} on ${row.engine}, sample ${row.sample ?? 1}`);
    seen.add(key);
  }
  return out;
}

// Writes a CellResult into `dir` (result.json), refusing one that does not conform. -> the file's path.
export function writeCellResult(dir, result) {
  const problems = validateCellResult(result);
  if (problems.length) throw new Error(`the cell result does not conform: ${problems.join('; ')}`);
  fs.mkdirSync(dir, {recursive: true});
  const file = join(dir, RESULT_FILE);
  fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  return file;
}

// Every CellResult under `dir` (result.json files at any depth, read in path order), each with its path relative to
// `dir`; a result.json of another schema is skipped (another harness's), one of this schema that does not conform is
// returned with its problems. -> [{path, result, problems}].
export function readCellResults(dir) {
  const found = [];
  const walk = (at, rel) => {
    for (const entry of fs.readdirSync(at, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) walk(join(at, entry.name), rel ? `${rel}/${entry.name}` : entry.name);
      else if (entry.name === RESULT_FILE) {
        let result;
        try { result = JSON.parse(fs.readFileSync(join(at, entry.name), 'utf8')); } catch (error) { found.push({path: rel || '.', result: null, problems: [`not JSON: ${error.message}`]}); continue; }
        if (result?.schema !== CELL_RESULT_SCHEMA) continue;
        found.push({path: rel || '.', result, problems: validateCellResult(result)});
      }
    }
  };
  walk(dir, '');
  return found;
}
