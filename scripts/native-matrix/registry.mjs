// The native matrix's cell registry (`scripts/native-matrix.mjs cell <name>`; docs/doperpowers/specs/2026-10-18-own-
// native-engine-design.md, Verification system parts 4 to 7, M5's "cell non-interference --scene textedit --user
// finder"): every cell by name, whoever implements it, each writing one CellResult (./cell-result.mjs) that `summary`
// reads in one shape.
//
// Three kinds:
// - The matrix's own (MATRIX_CELLS): a plan (./run.mjs planOf) run by the matrix's lane, narrowed by --scene and
//   --user; `matrix` is the whole of it, what `run` runs.
// - External (EXTERNAL_SOURCES): cells another harness implements, called here as they are, never copied (M2a's
//   residue cells on the live harness, M2b.1). A source names the module listing the cells' names, the section their
//   rows feed, and the runner module, which exports `runCell(name, options, io) -> exit code` and `cellIo(options,
//   {log, interrupt, dryRun}) -> io` (the io its own CLI builds). The runner writes its CellResult to
//   `<options.out>/result.json`; the registry then reads it back, validates it and checks it answers the name asked.
//   A source whose module is not on this checkout yet is skipped. A name two kinds define is refused.
// - Planned (PLANNED): named so `cell <name>` says which task builds it rather than that it does not exist; the
//   section each will write is already in the schema (concurrent, intervention, unicode, settle).
import {join} from 'node:path';
import * as fs from 'node:fs';
import {RESULT_FILE, SECTIONS, validateCellResult} from './cell-result.mjs';

export const MATRIX_CELLS = Object.freeze({
  matrix: {section: 'method', plan: 'matrix', describe: 'the whole matrix: both regimes, the speed and finding-elements cells, the launch path (what run runs)'},
  method: {section: 'method', plan: 'method', describe: 'the method cases in both regimes (--scene narrows to one scene\'s targets, --user to one pairing)'},
  speed: {section: 'speed', plan: 'speed', describe: 'getAXState, getScreenshot and listApps in-cell, --samples each (--scene narrows)'},
  finding: {section: 'finding', plan: 'finding', describe: 'the finding-elements scorer: ten targets per scene resolved by name, the titled share, the ID count (--scene narrows)'},
  'non-interference': {section: 'method', plan: 'background', describe: 'the background regime\'s cells under the oracle: --scene <driven> [--user <user window\'s scene>]'},
  launch: {section: 'launch', plan: 'launch', describe: 'the launch path: TextEdit and the Electron fixture resolved while not running, behind the user window (--scene narrows)'},
});

export const PLANNED = Object.freeze({
  'concurrent-use': {section: 'concurrent', by: 'M2b.3', describe: 'a probe keystroke into the user window during a long driven typeText'},
  'concurrent-use-sheet': {section: 'concurrent', by: 'M2b.3', describe: 'the concurrent-use cell with the driven action opening a sheet'},
  'intervention-fires': {section: 'intervention', by: 'M2b.3', describe: 'a probe keystroke into the driven window during an action: userIntervened'},
  'pre-action-refusal': {section: 'intervention', by: 'M2b.3', describe: 'a probe keystroke just before typeText: refused with the still-interacting sentence'},
  unicode: {section: 'unicode', by: 'M2b.3', describe: 'the Korean and Unicode matrix (part 6)'},
  settle: {section: 'settle', by: 'M2b.3', describe: 'the settle cell: the observation after an action equals the one two seconds later'},
});

export const EXTERNAL_SOURCES = Object.freeze([{names: './residue-checks.mjs', list: 'RESIDUE_CELLS', section: 'residue', runner: './live.mjs'}]);
const importHere = spec => import(new URL(spec, import.meta.url).href);
const missing = error => error?.code === 'ERR_MODULE_NOT_FOUND';

// The external cells, by name. -> {[name]: {module, section, describe, load()}}.
export async function externalCells({sources = EXTERNAL_SOURCES, load = importHere} = {}) {
  const out = {};
  for (const source of sources) {
    let names;
    try { names = (await load(source.names))?.[source.list]; } catch (error) { if (missing(error)) continue; throw error; }
    if (!Array.isArray(names)) continue;
    if (!SECTIONS.includes(source.section)) throw new Error(`${source.names} feeds ${source.section}, not a section of the schema`);
    for (const name of names) {
      if (MATRIX_CELLS[name] || PLANNED[name] || out[name]) throw new Error(`the cell ${name} is defined twice (${source.names})`);
      out[name] = {module: source.runner, section: source.section, describe: `${source.section} cell on ${source.runner}`, load: () => load(source.runner)};
    }
  }
  return out;
}

// What `cell <name>` runs. -> {kind: 'matrix', plan, section} | {kind: 'external', ...} | {kind: 'planned', by, section};
// an unknown name throws with the list.
export async function resolveCell(name, options = {}) {
  if (MATRIX_CELLS[name]) return {kind: 'matrix', ...MATRIX_CELLS[name]};
  const external = await externalCells(options);
  if (external[name]) return {kind: 'external', ...external[name]};
  if (PLANNED[name]) return {kind: 'planned', ...PLANNED[name]};
  throw new Error(`no cell ${name}; the cells: ${Object.keys({...MATRIX_CELLS, ...external, ...PLANNED}).join(', ')}`);
}

// Every cell with its kind, for `cell --list`. -> [{name, kind, section, describe, by?, module?}].
export async function listCells(options = {}) {
  const external = await externalCells(options);
  return [...Object.entries(MATRIX_CELLS).map(([name, d]) => ({name, kind: 'matrix', section: d.section, describe: d.describe})),
    ...Object.entries(external).map(([name, d]) => ({name, kind: 'external', section: d.section, describe: d.describe, module: d.module})),
    ...Object.entries(PLANNED).map(([name, d]) => ({name, kind: 'planned', section: d.section, describe: d.describe, by: d.by}))];
}

// Runs an external cell through its runner (its own io, its own harness), then reads its CellResult back from
// `<out>/result.json` and checks it (in a dry run nothing is written, so nothing is read). -> the runner's exit code.
export async function runExternal(name, def, options, base) {
  const runner = await def.load();
  if (typeof runner?.runCell !== 'function' || typeof runner?.cellIo !== 'function') throw new Error(`${def.module} exports no runCell and cellIo: the ${name} cell cannot be run from here`);
  const code = await runner.runCell(name, options, await runner.cellIo(options, base));
  if (options.dryRun) return code;
  const file = join(options.out, RESULT_FILE);
  if (!fs.existsSync(file)) throw new Error(`${name} (${def.module}) wrote no ${file}`);
  const result = JSON.parse(fs.readFileSync(file, 'utf8'));
  const problems = validateCellResult(result);
  if (result?.cell !== name) problems.push(`the result answers ${result?.cell ?? 'no cell'}, not ${name}`);
  if (problems.length) throw new Error(`${name} (${def.module}) wrote a result that does not conform: ${problems.join('; ')}`);
  (base.log ?? console.log)(`${name}: ${result.verdict}: ${file}`);
  return code;
}
