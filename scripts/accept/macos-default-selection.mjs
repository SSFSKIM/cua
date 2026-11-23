#!/usr/bin/env node
// The macOS default-selection mode, live (#117 M5, T11a; the M4/M5 pre-flight's sitting E): which engine a default
// macOS computer session selects, shown by `cua doctor --json` on four homes a runner shapes, nothing in any of them
// selecting an engine (no CUA_NATIVE_ENGINE, no "engine" in engine.json):
//   default   a fixture approved engine at the service's minimum (scripts/probe/fixture-engine.mjs): cua's engine, by
//             default, on cua's own host (repl.host `cua host (cua_engine)`). The `fixture` lane, a selection check:
//             the synthetic bundle's inspection is recorded, not judged. With --approved-home, the `approved` lane, the
//             hosted+ witness: that home's own approved engine instead, which doctor launches, reads and stops, so it
//             is refused unless the run is on a GitHub-hosted runner, the home is a disposable directory under the
//             runner's temp directory, and its approved engine is this checkout's build (the run's own, built and
//             approved by macos-default-selection-hosted.sh); the engine row must pass there
//   none      no approved engine: the vendor's host and engine, engine_not_installed
//   node      the fixture engine, cua run on a Node older than 24 (--older-node) with none other to find (no CUA_NODE,
//             an empty cua home, no node on PATH): the vendor's host and engine, own_host_node_unavailable
//   outdated  a fixture approved engine at 0.1.0, what every approved build before T9 reports: the vendor's host and
//             engine, engine_outdated (R4), the warning naming `cua install --engine` then `cua engine approve`
// macos-selection.mjs judges each home. The mode passes only after the flip: on the commit before it, every home selects
// the vendor's engine by default, and that is the failure the sitting records. In the fixture lane nothing is launched
// (the fixture's bundle id is not cua's engine's, which doctor's inspection requires before it launches anything), and
// nothing captures the screen, opens an app or touches TCC. In the approved lane doctor launches the approved engine
// to read it, and stops it after (src/runtime/engine.mjs inspectEngine). macOS only (the fixture is signed with codesign).
//
//   node scripts/accept/macos-default-selection.mjs --older-node <a Node 22.14+ below 24> [--approved-home <HOME>] [--out <report.json>]
//
// The report: the lane, the minimum, and per home its selection (the mode, what doctor said was selected and why, the
// engine row's status, the host repl.host names), the problem or null, and doctor's exit status; the verdict. Exit 0 PASS, 1 FAIL, 2 usage or refused.
import {mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {homedir, tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {HOMES, PRE_MINIMUM_VERSION, approvedHomeProblem, hostOf, sittingVerdict} from './macos-selection.mjs';
import {engineBuild} from '../../src/runtime/engine-bundle.mjs';
import {engineDirectory, installedEngine} from '../../src/runtime/engine.mjs';
import {readDoctor, selectionRecord, unsetSelectionProblems} from './linux-selection.mjs';
import {FIXTURE_ENGINE, placeFixtureEngine} from '../probe/fixture-engine.mjs';
import {engineSettingsPath, readEngineSettings} from '../../src/runtime/engine-sign.mjs';
import {MIN_ENGINE_VERSION} from '../../src/services/engine/client.mjs';

const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
// No node on the way: cua's own host finds only the Node running cua (and a cua home's, which these homes have none of).
const PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
const usage = message => { process.stderr.write(`macos-default-selection: ${message}\n`); process.exit(2); };

// The older Node's version, which must run cua (22.14 or later) and be below what cua's own host needs (24).
function olderNode(path) {
  const run = spawnSync(path, ['--version'], {encoding: 'utf8'});
  const [major, minor] = /^v(\d+)\.(\d+)\./.exec(run.stdout?.trim() ?? '')?.slice(1).map(Number) ?? [];
  if (run.status !== 0 || major === undefined) usage(`--older-node ${path} does not run`);
  if (major >= 24 || major < 22 || (major === 22 && minor < 14)) usage(`--older-node must be a Node from 22.14 below 24; ${path} is ${run.stdout.trim()}`);
  return run.stdout.trim();
}

const {values} = parseArgs({options: {'older-node': {type: 'string'}, 'approved-home': {type: 'string'}, out: {type: 'string'}}});
if (process.platform !== 'darwin') usage('refused: macOS only');
if (!values['older-node']) usage('--older-node <path> is required (the node home runs cua on it)');
const older = {path: values['older-node'], version: olderNode(values['older-node'])};
const lane = values['approved-home'] ? 'approved' : 'fixture';
if (lane === 'approved') {
  const real = path => { try { return realpathSync(path); } catch { return null; } };
  const home = real(values['approved-home']);
  if (!home) usage(`--approved-home ${values['approved-home']} does not exist`);
  let approvedBuild = null;
  try { approvedBuild = installedEngine({dir: engineDirectory(home)})?.build ?? null; } catch { approvedBuild = null; }
  const refused = approvedHomeProblem({home, env: process.env, runnerTemp: process.env.RUNNER_TEMP && real(process.env.RUNNER_TEMP), accountHome: real(homedir()),
    approvedBuild, sourceBuild: engineBuild()});
  if (refused) usage(`refused: ${refused}`);
}
const root = realpathSync(mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), 'cua-default-selection-')));
const versions = {minimum: FIXTURE_ENGINE.version, old: PRE_MINIMUM_VERSION};

const reports = {}, record = {lane, minimum: MIN_ENGINE_VERSION, olderNode: older.version, homes: {}};
try {
  for (const [kind, home] of Object.entries(HOMES)) {
    const dir = join(root, kind), cuaHome = join(dir, 'cua'), tmp = join(dir, 'tmp');
    const approved = kind === 'default' && values['approved-home'];
    const userHome = approved ? realpathSync(values['approved-home']) : join(dir, 'home');
    for (const path of [cuaHome, tmp, ...(approved ? [] : [userHome])]) mkdirSync(path, {recursive: true, mode: 0o700});
    if (home.engine && !approved) placeFixtureEngine(userHome, {version: versions[home.engine]});
    const env = {PATH, HOME: userHome, CUA_HOME: cuaHome, TMPDIR: tmp, LANG: 'C.UTF-8'};
    const unset = unsetSelectionProblems({env, settings: () => readEngineSettings({env}), path: engineSettingsPath(env)});
    if (unset.length) { record.homes[kind] = {problem: unset.join('; ')}; continue; }
    const {code, report} = readDoctor({cli: CLI, env, node: home.node ? process.execPath : older.path});
    reports[kind] = report;
    record.homes[kind] = {...selectionRecord('default', report), host: hostOf(report), engine: approved ? 'approved home' : home.engine ? versions[home.engine] : null, doctorExit: code};
  }
} finally {
  rmSync(root, {recursive: true, force: true});
}
const verdict = sittingVerdict(reports, {lane});
for (const [kind, judged] of Object.entries(verdict.homes)) {
  const found = record.homes[kind];
  const problem = found?.problem ?? judged;
  record.homes[kind] = {...found, problem};
  process.stdout.write(`${problem === null ? 'PASS' : 'FAIL'} ${kind}: ${problem ?? `selects ${found.selected} (${found.reason}) on the ${found.host?.host} host (${found.host?.reason})`}\n`);
}
record.verdict = verdict.pass && Object.values(record.homes).every(home => home.problem === null) ? 'PASS' : 'FAIL';
const LANE_WORDS = {fixture: 'the fixture lane: a selection check, not the hosted+ witness', approved: 'the approved lane: the run\'s own approved engine, the hosted+ witness'};
process.stdout.write(`default-selection: ${record.verdict} (${LANE_WORDS[lane]}; minimum ${MIN_ENGINE_VERSION}, older Node ${older.version})\n`);
if (values.out) { mkdirSync(dirname(values.out), {recursive: true}); writeFileSync(values.out, `${JSON.stringify(record, null, 2)}\n`); }
process.exit(record.verdict === 'PASS' ? 0 : 1);
