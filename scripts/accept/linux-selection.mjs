// How a Linux acceptance fixture's session selects its engine, and how that is shown (#171 M5; the pre-flight's §3, "How
// the default is shown live"; docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, Decision Log "M5 pre-flight").
//   explicit  (when --selection is not given) the caller names cua's engine, CUA_NATIVE_ENGINE=cua, as M4 ran the fixtures
//   default   nothing names an engine: no CUA_NATIVE_ENGINE in the environment and no "engine" in the home's
//             ~/.config/cua/engine.json (its "desktop" may stand), so the session runs whatever the default selects. The
//             fixture refuses to start otherwise, then reads the selection from `cua doctor --json`'s engine report and
//             requires cua's engine with reason `default`
// The fallback homes' probe (linux-fallback.mjs) runs with the default mode's inputs and requires the vendor's engine,
// kept by the default for its home's own reason (FALLBACK_HOMES), with doctor's warning naming it and `cua install
// --engine`.
import {spawnSync} from 'node:child_process';
import {engineSettingsPath, readEngineSettings} from '../../src/runtime/engine-sign.mjs';

export const SELECTION_MODES = ['explicit', 'default'];
// Each fallback home, and the reason the default keeps the vendor's engine there (src/runtime/launch.mjs nativeEngineFor).
export const FALLBACK_HOMES = Object.freeze({none: 'engine_not_installed', previous: 'engine_outdated', older: 'engine_outdated', unrecorded: 'engine_unrecorded'});
const REMEDY = 'cua install --engine';

/** The mode `--selection <mode>` in `argv` names: explicit when absent; anything else throws. */
export function selectionMode(argv) {
  const at = argv.indexOf('--selection');
  if (at < 0) return 'explicit';
  const mode = argv[at + 1];
  if (!SELECTION_MODES.includes(mode)) throw new Error(`--selection must be ${SELECTION_MODES.join(' or ')}`);
  return mode;
}

/**
 * What selects an engine though the default mode must run with nothing that does: CUA_NATIVE_ENGINE in `env` (even
 * empty: the runner sets none), and an "engine" in the engine settings `settings()` reads (readEngineSettings, which
 * throws for a file it cannot read), at `path`. -> the problems, each a sentence; none when the mode may start.
 */
export function unsetSelectionProblems({env, settings, path}) {
  const problems = [];
  if (env.CUA_NATIVE_ENGINE !== undefined) problems.push(`CUA_NATIVE_ENGINE is set (${JSON.stringify(env.CUA_NATIVE_ENGINE)}): the default mode runs with none`);
  let read;
  try { read = settings(); } catch (error) { problems.push(`${path} cannot be read (${error.message})`); return problems; }
  if (read && read.engine !== undefined) problems.push(`"engine": ${JSON.stringify(read.engine)} is in ${path}: the default mode runs with no "engine" there`);
  return problems;
}

// The selection `cua doctor --json`'s report carries -> {selected, reason, row} or a problem sentence.
function reported(report) {
  if (!report || typeof report !== 'object') return 'cua doctor --json printed no report';
  const row = (report.checks ?? []).find((c) => c.name === 'engine');
  if (!report.engine || !row) return 'cua doctor --json reports no engine selection';
  return {selected: report.engine.selected, reason: report.engine.reason, row};
}
const says = ({selected, reason}) => `the session selects ${selected} (${reason})`;

/** The default mode's judge: null when doctor says the default selected cua's engine, else what it selected and why. */
export function defaultSelectionProblem(report) {
  const found = reported(report);
  if (typeof found === 'string') return found;
  return found.selected === 'cua' && found.reason === 'default' ? null : `${says(found)}, not cua's engine by default`;
}

/**
 * A fallback home's judge (`kind` a key of FALLBACK_HOMES): null when doctor says the default kept the vendor's engine for
 * that home's reason, its engine row a warning naming the reason and `cua install --engine`; else what differs.
 */
export function fallbackSelectionProblem(report, kind) {
  const reason = FALLBACK_HOMES[kind];
  if (!reason) return `no fallback home ${kind}: ${Object.keys(FALLBACK_HOMES).join(', ').replace(/, (?=[^,]*$)/, ' or ')}`;
  const found = reported(report);
  if (typeof found === 'string') return found;
  if (found.selected !== 'vendor' || found.reason !== reason) return `${says(found)}, not the vendor's engine for ${reason}`;
  if (found.row.status !== 'warn') return `doctor's engine row is ${found.row.status}, not a warning`;
  if (!found.row.detail.includes(`(${reason})`)) return `doctor's engine row does not name its reason, ${reason}`;
  if (!found.row.detail.includes(REMEDY)) return `doctor's engine row does not name ${REMEDY}`;
  return null;
}

/**
 * `cua doctor --json` run as the session would be (`cli` bin/cua.mjs, `env` the session's environment) -> {code, report}:
 * the report parsed whatever the exit status (a failing row elsewhere does not hide the selection), null when none.
 */
export function readDoctor({cli, env}) {
  const run = spawnSync(process.execPath, [cli, 'doctor', '--json'], {env, encoding: 'utf8', timeout: 120_000});
  let report = null;
  try {report = JSON.parse(run.stdout);} catch {report = null;}
  return {code: run.status, report};
}

/** What a report records of a selection: the mode, and what doctor said was selected and why. */
export function selectionRecord(mode, report) {
  const found = reported(report);
  return {mode, ...(typeof found === 'string' ? {selected: null, reason: null, problem: found} : {selected: found.selected, reason: found.reason, row: found.row.status})};
}

/**
 * A fixture's selection steps, before it starts anything (`step(name, ok, detail)` its step recorder; `cli` bin/cua.mjs;
 * `env` the session's environment; `report` the fixture's report, whose `selection` this sets): in the default mode,
 * that nothing selects an engine, then that doctor says the default selected cua's (`judge`: defaultSelectionProblem, or
 * a fallback home's), each a step that stops the fixture when it fails. The report records the mode and what doctor
 * said was selected and why, a failed selection included. In the explicit mode nothing is checked here: the record names
 * the engine the caller set.
 */
export function selectionSteps({mode, env, cli, step, report, judge = defaultSelectionProblem, judged = 'the default selects cua\'s engine (cua doctor --json)'}) {
  if (mode === 'explicit') { report.selection = {mode, engine: env.CUA_NATIVE_ENGINE ?? null}; return; }
  report.selection = {mode};
  const unset = unsetSelectionProblems({env, settings: () => readEngineSettings({env}), path: engineSettingsPath(env)});
  if (!step('the default mode: nothing selects an engine (no CUA_NATIVE_ENGINE, no "engine" in engine.json)', unset.length === 0, unset.length ? unset : undefined)) throw new Error('selection inputs');
  const {code, report: doctor} = readDoctor({cli, env});
  report.selection = selectionRecord(mode, doctor);
  const problem = judge(doctor);
  if (!step(judged, problem === null, {...report.selection, doctorExit: code, ...(problem ? {problem} : {})})) throw new Error('selection');
}
