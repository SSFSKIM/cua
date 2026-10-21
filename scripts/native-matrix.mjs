#!/usr/bin/env node
// The native matrix (#117; docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system parts 4
// and 5, Acceptance 3 and 7, M2b and M5): the 11 methods on the four macOS scenes and TextEdit's Open panel in the
// frontmost and background regimes, judged by outcome read back through getAXState with each action's cua/inputRoute;
// the per-scene speed cells; the finding-elements scorer; the non-interference oracle; the launch path. Each lane is
// driven through the real facade (a serve of the requested host and engine on the device, CUA_NATIVE_ENGINE pinned to
// --engine), so every speed number is in-cell, and every result must attest that engine.
//
//   node scripts/native-matrix.mjs run --device <alias> --host vendor|cua --engine vendor|cua --approved-runtime <CUA_HOME>
//        --approved-engine <the approved cua Engine.app> --sitting <hold id> --out <dir> [--runs 3] [--run-number n] [--samples 10]
//        [--run <device dir>] [--dry-run]
//     One lane, --runs runs, each the whole hold (./native-matrix/run.mjs) and one result in <out>/run-<n>/result.json.
//     The lanes are --host vendor --engine vendor, --host vendor --engine cua and --host cua --engine cua; every lane
//     of one hold names the same --sitting, the hold's id, recorded in each run's meta. A hold split by run runs exactly
//     run n with --run-number n (--runs then counts from n, 1 by default; <out>/run-<n>/), so each run's vendor and cua
//     lanes share one sitting: `summary` pairs them per run number.
//   node scripts/native-matrix.mjs cell <name> [the run's options] [--scene <id>] [--user <id>]
//   node scripts/native-matrix.mjs cell --list
//     One registered cell (./native-matrix/registry.mjs): the matrix's own (a part of the run, narrowed by --scene and
//     --user, e.g. `cell non-interference --scene textedit --user finder`, `cell korean --scene textedit`, the probe
//     cells `concurrent-use`, `concurrent-use-sheet`, `intervention-fires`, `pre-action-refusal`), or one implemented on
//     another harness (M2a's residue on the live harness; `settle`, the native-mac suite's lane).
//   node scripts/native-matrix.mjs compare <vendor-dir> <cua-dir> [--out comparison.md]
//     Every result under the two directories judged (./native-matrix/summary.mjs; only full matrix runs count, three
//     complete attested runs per side, each run number's vendor and cua runs of one hold, one commit and one approved
//     build, every manifest row present): VERDICT PASS (exit 0), OWNER (exit 3:
//     nothing failed, the owner's calls remain: a missed speed beat, finding parity, a declared self-activating family),
//     NO VERDICT (exit 4: nothing failed, proof is missing; it blocks M5 as a failure does) or FAIL (exit 1).
//   node scripts/native-matrix.mjs summary <dir>... [--out summary.md]
//     The method table, the per-scene speed table and the three-point section, written to --out (default
//     <first dir>/summary.md): Acceptance 7's docs/evidence/<sitting date>-own-native-engine/summary.md.
//   node scripts/native-matrix.mjs cleanup --device <alias> [--run <device dir>] [--preparation <file>] [--dry-run]
//     What a run that died leaves: the live hold's recovery and put-back, then the approved home's cleanup.
//
// The hold's discipline (the spec's M2b pre-flight item 4): the admission lock and the engine stopped at the start and
// the end, the owner's Chrome and Claude Desktop never touched, no content of a window the run does not own leaving the
// device, the put-back of Finder's keys and chrome, the input source and per-context preference, and the owner's front
// app (lsappinfo; restored by activation only). --dry-run prints every device step in order and runs none.
import * as fs from 'node:fs';
import {isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {StdioClient} from './browser-parity/mcp.mjs';
import {controllerCheckout} from './native-matrix/goldens.mjs';
import {REPO_ROOT} from './native-matrix/goldens-install.mjs';
import {dryConnect, dryOps, matrixOps} from './native-matrix/lane.mjs';
import {listCells, resolveCell, runExternal} from './native-matrix/registry.mjs';
import {cleanupMatrix, planOf, runMatrix} from './native-matrix/run.mjs';
import {judge, readResults, renderSummary} from './native-matrix/summary.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
export const USAGE = `usage: native-matrix.mjs run --device <alias> --host vendor|cua --engine vendor|cua --approved-runtime <home> --approved-engine <bundle> --sitting <hold id> --out <dir> [--runs n] [--run-number n] [--samples n] [--run <device dir>] [--dry-run]
       native-matrix.mjs cell <name> [the run's options] [--scene <id>] [--user <id>] | cell --list
       native-matrix.mjs compare <vendor-dir> <cua-dir> [--out <file>]
       native-matrix.mjs summary <dir>... [--out <file>]
       native-matrix.mjs cleanup --device <alias> [--run <device dir>] [--preparation <file>] [--dry-run]`;
const OPTIONS = {device: {type: 'string'}, host: {type: 'string'}, engine: {type: 'string'}, 'approved-runtime': {type: 'string'}, 'approved-engine': {type: 'string'},
  out: {type: 'string'}, runs: {type: 'string'}, 'run-number': {type: 'string'}, samples: {type: 'string'}, run: {type: 'string'}, scene: {type: 'string'}, user: {type: 'string'}, sitting: {type: 'string'},
  preparation: {type: 'string'}, list: {type: 'boolean', default: false}, 'dry-run': {type: 'boolean', default: false}};
const fail = message => { throw new Error(`${message}\n${USAGE}`); };
const absolute = (value, name) => { if (value !== undefined && (!isAbsolute(value) || value.includes('\n'))) fail(`--${name} needs an absolute path`); return value; };
// The hold every lane of one hold names (`summary` refuses a run number whose vendor and cua runs name two): required on
// the device, made up in a dry run.
const sittingOf = (value, dryRun) => {
  if (value === undefined) return dryRun ? 'dry-run' : fail('--sitting <hold id> is required: the same id on every lane of the hold');
  if (!/^[\w.-]+$/.test(value)) fail('--sitting takes letters, digits, dot, dash and underscore');
  return value;
};
const count = (value, name, fallback) => {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value)) fail(`--${name} needs a positive integer`);
  return Number(value);
};

export function parseCommand(argv) {
  let parsed;
  try { parsed = parseArgs({args: argv, allowPositionals: true, options: OPTIONS}); } catch (error) { fail(error.message); }
  const {values, positionals: [command, ...rest]} = parsed;
  const dryRun = values['dry-run'];
  const lane = () => ({device: values.device, host: values.host, engine: values.engine, approvedRuntime: absolute(values['approved-runtime'], 'approved-runtime'),
    approvedEngine: absolute(values['approved-engine'], 'approved-engine'), out: values.out ? resolve(values.out) : undefined, runs: count(values.runs, 'runs', undefined),
    runNumber: count(values['run-number'], 'run-number', undefined),
    samples: count(values.samples, 'samples', undefined), run: absolute(values.run, 'run'), sitting: sittingOf(values.sitting, dryRun), dryRun});
  switch (command) {
    case 'run':
      if (rest.length) fail(`unexpected ${rest.join(' ')}`);
      if (!values.device) fail('--device is required');
      if (!values.out && !dryRun) fail('--out is required');
      return {command, ...lane(), out: values.out ? resolve(values.out) : resolve('native-matrix-dry-run')};
    case 'cell':
      if (values.list) return {command, list: true};
      if (rest.length !== 1) fail('cell needs one name (cell --list lists them)');
      if (!values.device) fail('--device is required');
      if (!values.out && !dryRun) fail('--out is required');
      return {command, name: rest[0], ...lane(), out: values.out ? resolve(values.out) : resolve('native-matrix-dry-run'), scene: values.scene ?? null, user: values.user ?? null};
    case 'compare':
      if (rest.length !== 2) fail('compare needs <vendor-dir> <cua-dir>');
      return {command, dirs: rest.map(d => resolve(d)), out: values.out ? resolve(values.out) : null};
    case 'summary':
      if (!rest.length) fail('summary needs at least one directory');
      return {command, dirs: rest.map(d => resolve(d)), out: values.out ? resolve(values.out) : join(resolve(rest[0]), 'summary.md')};
    case 'cleanup':
      if (rest.length) fail(`unexpected ${rest.join(' ')}`);
      if (!values.device) fail('--device is required');
      return {command, device: values.device, run: absolute(values.run, 'run'), preparation: absolute(values.preparation, 'preparation'), dryRun};
    default: return fail(`unknown command ${command ?? '(none)'}`);
  }
}

// The judgment of results under `dirs`. -> {judged, text}.
function judgeDirs(dirs) {
  for (const dir of dirs) if (!fs.existsSync(dir)) throw new Error(`${dir} does not exist`);
  const {results, problems} = readResults(dirs);
  if (!results.length) throw new Error(`no cell results under ${dirs.join(', ')}`);
  const judged = judge(results, problems);
  return {judged, text: renderSummary(judged)};
}
const VERDICT_CODE = {PASS: 0, FAIL: 1, OWNER: 3, 'NO VERDICT': 4};

export async function main(argv = process.argv.slice(2), {log = console.log, io: given = null} = {}) {
  const options = parseCommand(argv);
  if (options.command === 'compare' || options.command === 'summary') {
    const {judged, text} = judgeDirs(options.dirs);
    if (options.out) { fs.writeFileSync(options.out, text); log(`wrote ${options.out}`); }
    if (options.command === 'compare') {
      log(`VERDICT: ${judged.verdict}`);
      for (const b of judged.blocking) log(`  blocking: ${b}`);
      for (const m of judged.missing) log(`  missing: ${m}`);
      for (const o of judged.owner) log(`  owner: ${o}`);
    }
    return VERDICT_CODE[judged.verdict];
  }
  if (options.command === 'cell' && options.list) {
    for (const c of await listCells()) log(`${c.name.padEnd(22)} ${c.kind.padEnd(8)} ${c.section.padEnd(12)} ${c.describe}${c.module ? ` (${c.module})` : ''}`);
    return 0;
  }

  const checkout = controllerCheckout(REPO_ROOT);
  const interrupt = {signal: null};
  const onSignal = signal => {
    if (interrupt.signal) { log(`${signal}: the put-back is already running; it is bounded, let it finish`); return; }
    interrupt.signal = signal;
    log(`${signal}: stopping at the next step, then the put-back runs once`);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  const io = given ?? (options.dryRun
    ? {ops: dryOps({log, engine: options.engine, approvedEngine: options.approvedEngine, commit: checkout.commit}), connect: dryConnect({log, engine: options.engine, host: options.host}),
      controllerCheckout: () => checkout, log, dryRun: true, interrupt, sleep: async () => {}}
    : {ops: matrixOps(options.device), connect: spec => new StdioClient(spec), controllerCheckout: () => checkout, log, interrupt});
  if (options.dryRun) log(`# dry run of native-matrix.mjs ${options.command}${options.name ? ` ${options.name}` : ''} on ${options.device}: every device step in order, none run`);
  try {
    if (options.command === 'cleanup') return cleanupMatrix(options, io);
    if (options.command === 'run') return await runMatrix({...options, cell: 'matrix', plan: planOf('matrix')}, io);
    const resolved = await resolveCell(options.name);
    if (resolved.kind === 'external') return await runExternal(options.name, resolved, options, {log, interrupt, dryRun: options.dryRun});
    return await runMatrix({...options, cell: options.name, plan: planOf(resolved.plan, {scene: options.scene, user: options.user})}, io);
  } finally { process.off('SIGINT', onSignal); process.off('SIGTERM', onSignal); }
}

if (process.argv[1] && SCRIPT === fs.realpathSync(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, error => { console.error(error.message); process.exitCode = 1; });
}
