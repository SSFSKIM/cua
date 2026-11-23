import './helpers/scratch-home.mjs'; // first: nothing here may read the account's engine settings or approved engine
// The macOS default-selection mode (#117 M5, T11a; the pre-flight's sitting E): its homes, its judges, and its verdict
// against production's own selection. The runner (scripts/accept/macos-default-selection.mjs) reads `cua doctor --json`
// on each home a runner shapes; here doctor runs in process on the same four homes, its engine read stubbed (nothing is
// signed, launched or connected to), so the verdict is the one this commit's default gives.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FALLBACK_HOMES, HOMES, PRE_MINIMUM_VERSION, fallbackSelectionProblem, judgeFor, sittingVerdict} from '../scripts/accept/macos-selection.mjs';
import {FIXTURE_ENGINE} from '../scripts/probe/fixture-engine.mjs';
import {inspectRuntime} from '../src/runtime/doctor.mjs';
import {CuaError} from '../src/runtime/errors.mjs';

test('the homes: the default one with an approved engine at the minimum, and the three fallbacks of sitting E', () => {
  assert.deepEqual(Object.keys(HOMES), ['default', 'none', 'node', 'outdated']);
  assert.deepEqual(FALLBACK_HOMES, {none: 'engine_not_installed', node: 'own_host_node_unavailable', outdated: 'engine_outdated'});
  assert.equal(PRE_MINIMUM_VERSION, '0.1.0', 'what every approved build before T9 reports');
});

// doctor --json's report as macOS prints it: the repl.host and engine rows, and the report's engine object.
const doctor = (selected, reason, {status = 'warn', detail = `… (${reason}): …`, host = {status: 'warn', detail: `vendor host (${reason}): …`}} = {}) => ({ok: true,
  checks: [{name: 'repl.host', ...host}, {name: 'engine', status, detail}], engine: {selected, reason, preferred: {engine: 'cua', reason: 'default'}}});
const REMEDY = {engine_not_installed: '… then approve it with cua engine approve (the owner at the console)', own_host_node_unavailable: 'cua\'s own host finds no Node 24 or later',
  engine_outdated: 'build it with `cua install --engine`, which builds it pending approval, then approve it with `cua engine approve`'};
const warned = reason => doctor('vendor', reason, {detail: `cua's engine is preferred (the default engine), but …, so macOS computer sessions keep the vendor host and engine (${reason}): ${REMEDY[reason]}`});

test('a fallback home passes only when the default keeps the vendor\'s engine and host for its own reason, both rows warning, the engine row naming the remedy', () => {
  for (const [kind, reason] of Object.entries(FALLBACK_HOMES)) assert.equal(fallbackSelectionProblem(warned(reason), kind), null, kind);
  assert.equal(fallbackSelectionProblem(warned('engine_not_installed'), 'outdated'), 'the session selects vendor (engine_not_installed), not the vendor\'s engine for engine_outdated');
  assert.equal(fallbackSelectionProblem(doctor('cua', 'default', {status: 'pass'}), 'none'), 'the session selects cua (default), not the vendor\'s engine for engine_not_installed');
  // the negative control: the unflipped default selects the vendor's engine for no fallback reason
  assert.equal(fallbackSelectionProblem(doctor('vendor', 'default', {status: 'skip'}), 'none'), 'the session selects vendor (default), not the vendor\'s engine for engine_not_installed');
  assert.equal(fallbackSelectionProblem({...warned('engine_outdated'), checks: warned('engine_outdated').checks.map(c => (c.name === 'engine' ? {...c, status: 'pass'} : c))}, 'outdated'),
    'doctor\'s engine row is pass, not a warning');
  assert.equal(fallbackSelectionProblem(doctor('vendor', 'engine_outdated', {detail: `… (engine_outdated): approve it with \`cua engine approve\``}), 'outdated'),
    'doctor\'s engine row does not name cua install --engine', 'below the minimum with nothing pending, both steps are named');
  assert.equal(fallbackSelectionProblem(doctor('vendor', 'engine_not_installed', {detail: `…: ${REMEDY.engine_not_installed}`}), 'none'), 'doctor\'s engine row does not name its reason, engine_not_installed');
  assert.equal(fallbackSelectionProblem(doctor('vendor', 'own_host_node_unavailable', {detail: '… (own_host_node_unavailable): see repl.host'}), 'node'), 'doctor\'s engine row does not name Node 24');
  assert.equal(fallbackSelectionProblem(doctor('vendor', 'engine_not_installed', {detail: `… (engine_not_installed): ${REMEDY.engine_not_installed}`, host: {status: 'pass', detail: 'cua host (cua_engine): …'}}), 'none'),
    'doctor\'s repl.host row is pass and does not keep the vendor host for engine_not_installed');
  assert.equal(fallbackSelectionProblem({ok: false, checks: []}, 'none'), 'cua doctor --json reports no engine selection');
  assert.equal(fallbackSelectionProblem(null, 'none'), 'cua doctor --json printed no report');
  assert.equal(fallbackSelectionProblem(warned('engine_outdated'), 'older'), 'no fallback home older: none, node or outdated');
});

test('the default home passes only when doctor says the default selected cua\'s engine; a home with no report fails the sitting', () => {
  assert.equal(judgeFor('default')(doctor('cua', 'default', {status: 'pass'})), null);
  assert.equal(judgeFor('default')(doctor('vendor', 'default', {status: 'skip'})), 'the session selects vendor (default), not cua\'s engine by default');
  assert.equal(judgeFor('default')(doctor('cua', 'explicit', {status: 'pass'})), 'the session selects cua (explicit), not cua\'s engine by default');
  const passing = {default: doctor('cua', 'default', {status: 'pass'}), ...Object.fromEntries(Object.entries(FALLBACK_HOMES).map(([kind, reason]) => [kind, warned(reason)]))};
  assert.deepEqual(sittingVerdict(passing), {pass: true, homes: {default: null, none: null, node: null, outdated: null}});
  const {node, ...short} = passing;
  assert.deepEqual(sittingVerdict(short), {pass: false, homes: {default: null, none: null, node: 'not run', outdated: null}});
});

// Doctor on each home as the runner shapes it, in process: production's selection (its default and the service's
// minimum, neither injected), the approved engine the home holds (the fixture's version, PRE_MINIMUM_VERSION's, or
// none), and whether cua's own host finds a Node 24. Every other read doctor makes is stubbed or scratch.
const NODE24 = {path: '/runner/node24/bin/node', version: 'v24.11.0', source: 'the node running cua'};
const WITHOUT_NODE = () => { throw Object.assign(new CuaError('repl_host_node', 'cua\'s own REPL host needs Node 24 or later, and none was found'), {tried: ['the node running cua /runner/node22/bin/node (v22.14.0)']}); };
const BUNDLE = '/runner/home/Library/Application Support/cua/engine/cua Engine.app';
async function doctorOn(kind, t) {
  const home = HOMES[kind];
  const version = home.engine === 'minimum' ? FIXTURE_ENGINE.version : home.engine === 'old' ? PRE_MINIMUM_VERSION : null;
  const app = version && {bundlePath: BUNDLE, engineVersion: version, build: FIXTURE_ENGINE.build};
  const cuaHome = mkdtempSync(join(tmpdir(), 'cua-default-selection-'));
  t.after(() => rmSync(cuaHome, {recursive: true, force: true}));
  // the fixture as inspectEngine reads it: approved, ad hoc, not running, never cua's own bundle id, so never launched
  const facts = {bundlePath: BUNDLE, exists: Boolean(app), engineVersion: version, build: app ? FIXTURE_ENGINE.build : null, bundleId: app ? 'io.github.ssfskim.cua.fixture-engine' : null,
    signature: app ? {kind: 'adhoc', identityMatches: null} : null, approved: app ? true : false, approvedBuild: app ? FIXTURE_ENGINE.build : null, approvedAt: null, pending: null,
    running: false, status: null, statusError: null, launch: null};
  return inspectRuntime({home: cuaHome, env: {HOME: '/runner/home', PATH: '/usr/bin:/bin'}, host: {platform: 'darwin', arch: 'arm64'},
    verifySignatures: async () => [], inspectHelper: async () => ({socket: '/x', holders: []}), inspectSecrets: async () => ({dir: '/none', exists: false}),
    inspectChrome: async () => [], inspectAgent: async () => [],
    resolveOwnNode: home.node ? () => NODE24 : WITHOUT_NODE,
    engine: {installed: () => app, pending: () => null, sourceBuild: () => FIXTURE_ENGINE.build, location: () => null, config: () => ({})},
    inspectEngine: async () => facts, readEngineRecords: () => ({bundlePath: BUNDLE, exists: Boolean(app), approved: app ? {build: FIXTURE_ENGINE.build, approvedAt: null} : null, pending: null})});
}

// The mode's verdict against this commit's default. macOS's default is cua's engine since the flip (T11b), so the mode
// passes on every home: the approved engine at the minimum is selected by default, and the three fallbacks keep the
// vendor's host and engine with the warning naming why. On the commit before the flip the same homes all selected the
// vendor's engine by default, and the mode failed (T11a).
test('the mode\'s verdict against production\'s selection: PASS since the macOS default is cua\'s engine', async t => {
  const reports = {};
  for (const kind of Object.keys(HOMES)) reports[kind] = await doctorOn(kind, t);
  assert.deepEqual(sittingVerdict(reports), {pass: true, homes: {default: null, none: null, node: null, outdated: null}});
  assert.deepEqual(Object.fromEntries(Object.entries(reports).map(([kind, report]) => [kind, [report.engine.selected, report.engine.reason]])),
    {default: ['cua', 'default'], none: ['vendor', 'engine_not_installed'], node: ['vendor', 'own_host_node_unavailable'], outdated: ['vendor', 'engine_outdated']});
});
