#!/usr/bin/env node
// The macOS default-selection mode, live (#117 M5, T11a; the M4/M5 pre-flight's sitting E): which engine a default
// macOS computer session selects, shown by `cua doctor --json` on four homes a runner shapes, nothing in any of them
// selecting an engine (no CUA_NATIVE_ENGINE, no "engine" in engine.json):
//   default   a fixture approved engine at the service's minimum (scripts/probe/fixture-engine.mjs): cua's engine, by
//             default. With --approved-home, that user home's own approved engine instead (the hosted+ form, a real
//             bundle approved on the runner)
//   none      no approved engine: the vendor's host and engine, engine_not_installed
//   node      the fixture engine, cua run on a Node older than 24 (--older-node) with none other to find (no CUA_NODE,
//             an empty cua home, no node on PATH): the vendor's host and engine, own_host_node_unavailable
//   outdated  a fixture approved engine at 0.1.0, what every approved build before T9 reports: the vendor's host and
//             engine, engine_outdated (R4), the warning naming `cua install --engine` then `cua engine approve`
// macos-selection.mjs judges each home. The mode passes only after the flip: on the commit before it, every home selects
// the vendor's engine by default, and that is the failure the sitting records. The fixture engine is never launched
// (its bundle id is not cua's engine's, which doctor's inspection requires before it launches anything); nothing here
// captures the screen, opens an app or touches TCC. macOS only (the fixture is signed with codesign).
//
//   node scripts/accept/macos-default-selection.mjs --older-node <a Node 22.14+ below 24> [--approved-home <HOME>] [--out <report.json>]
//
// The report: the minimum, and per home its selection (the mode, what doctor said was selected and why, the engine
// row's status), the problem or null, and doctor's exit status; the verdict. Exit 0 PASS, 1 FAIL, 2 usage or refused.
import {mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {HOMES, PRE_MINIMUM_VERSION, sittingVerdict} from './macos-selection.mjs';
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
const root = realpathSync(mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), 'cua-default-selection-')));
const versions = {minimum: FIXTURE_ENGINE.version, old: PRE_MINIMUM_VERSION};

const reports = {}, record = {minimum: MIN_ENGINE_VERSION, olderNode: older.version, homes: {}};
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
    record.homes[kind] = {...selectionRecord('default', report), engine: approved ? 'approved home' : home.engine ? versions[home.engine] : null, doctorExit: code};
  }
} finally {
  rmSync(root, {recursive: true, force: true});
}
const verdict = sittingVerdict(reports);
for (const [kind, judged] of Object.entries(verdict.homes)) {
  const found = record.homes[kind];
  const problem = found?.problem ?? judged;
  record.homes[kind] = {...found, problem};
  process.stdout.write(`${problem === null ? 'PASS' : 'FAIL'} ${kind}: ${problem ?? `selects ${found.selected} (${found.reason})`}\n`);
}
record.verdict = verdict.pass && Object.values(record.homes).every(home => home.problem === null) ? 'PASS' : 'FAIL';
process.stdout.write(`default-selection: ${record.verdict} (minimum ${MIN_ENGINE_VERSION}, older Node ${older.version})\n`);
if (values.out) { mkdirSync(dirname(values.out), {recursive: true}); writeFileSync(values.out, `${JSON.stringify(record, null, 2)}\n`); }
process.exit(record.verdict === 'PASS' ? 0 : 1);
