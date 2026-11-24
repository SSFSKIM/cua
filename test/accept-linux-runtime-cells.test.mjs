// Acceptance 13's driver judges (#171 M6b, T6; the M6b pre-flight §5.2, the cell table), and those M6a's acceptance 12
// left it: the process watch around each fixture (which engine answered, none, nothing launched), E0's install, the
// fetch log, a refused open's sentence and what its trace shows launched, the traced install's and doctor's calls under
// runtimes/, the retired tree's report, and the trees' snapshots. Each judge has its negative control here: a missing
// record never passes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {APPROVED_OLDER, CELLS, ENGINE_HINT_LITERAL, FIXTURE_STEPS, FORBIDDEN_ROWS, OUTDATED_ENGINE, VENDOR_RELEASES, boundaryProblems, controlProblems, doctorRefusalProblems, doctorRowsProblems,
  emptyHomeProblems, engineRowProblems, execRoleProblems, fetchLogProblems, fixtureProblems, inheritedOverrides, initializeAnswered, installProblems, launchedProblems, noFetchProblems,
  notNamedProblems, olderProblems, outdatedOverrideMessage, parsePhases, parseRefusal, refusedAsProblems, reinstallProblems, retiredInstallProblems, retiredLineProblems,
  retiredMessage, retiredReportProblems, retiredSentence, runVerdict, runtimesCallProblems, snapshotProblems, staticEngineProblems, toolProblems, traceProblems, treeSnapshot,
  witnessOf} from '../scripts/accept/linux-runtime-cells.mjs';
import {loggedFetch, readFetchLog} from '../scripts/accept/fetch-log.mjs';
import {summarizeTrace} from '../scripts/accept/linux-trace.mjs';
import {cuaEngineProblems, foldSample, newWatch, noEngineProblems, nothingLaunchedProblems, ownNodeProblems, sampleTree, watchRecord} from '../scripts/accept/linux-runtime-watch.mjs';

const HOME = '/run/user/.local/share/cua';
const ENGINE = `${HOME}/engine/linux/cua-engine`;
const VENDOR = `${HOME}/runtimes/26.928.40906-linux-x64`;
const SKY = `${VENDOR}/sky/sky_linux_x64`;
const SERVICE = `${VENDOR}/sky/service.js`;
const WORKER_ARGV = ['/n/bin/node', '/repo/src/repl-host/trusted-worker.mjs'];
const KERNEL = {pid: 30, ppid: 29, comm: 'node', exe: '/n/bin/node', argv: ['node', '/repo/src/repl-host/kernel.mjs']};
const WORKER = {pid: 20, ppid: 10, comm: 'node', exe: '/n/bin/node', argv: WORKER_ARGV};
const cuaEngine = (exe = ENGINE, parentArgv = WORKER_ARGV) => ({pid: 21, ppid: 20, comm: 'cua-engine', exe, argv: [exe, 'server'], parent: {argv: parentArgv, env: {CUA_SKY_SERVICE: '/repo/src/services/engine/linux/service.mjs'}}});
const sky = (exe = SKY, service = SERVICE) => ({pid: 22, ppid: 20, comm: 'sky_linux_x64', exe, argv: [exe], parent: {argv: WORKER_ARGV, env: {CUA_SKY_SERVICE: service, OAI_SKY_LINUX_BIN: exe}}});
const watched = (...samples) => watchRecord(samples.reduce((state, sample) => foldSample(state, sample), newWatch()));

// ---- the process watch ----

test('the watch folds each sample: the most sky_linux at once, every engine with its executable and parent, the REPL host\'s processes', () => {
  const record = watched([WORKER, cuaEngine()], [WORKER, cuaEngine(), KERNEL]);
  assert.equal(record.samples, 2);
  assert.equal(record.maxSkyLinux, 0);
  assert.deepEqual(record.engines, [{pid: 21, exe: ENGINE, parent: WORKER_ARGV.join(' ')}]);
  assert.deepEqual(record.replHost, [{pid: 20, role: 'trusted-worker', exes: ['/n/bin/node']}, {pid: 30, role: 'kernel', exes: ['/n/bin/node']}]);
});

test('the REPL host ran on the home\'s managed Node: every worker and kernel sampled, at least one of each', () => {
  assert.deepEqual(ownNodeProblems(watched([WORKER, KERNEL]), {node: '/n/bin/node'}), []);
});

test('negative control (fix wave 1, #8): a worker or kernel on another Node, or none seen, fails the managed-Node check', () => {
  assert.match(ownNodeProblems(watched([WORKER, {...KERNEL, exe: '/usr/bin/node'}]), {node: '/n/bin/node'}).join('; '), /kernel 30 ran \/usr\/bin\/node, not the home's managed Node/);
  assert.match(ownNodeProblems(watched([KERNEL]), {node: '/n/bin/node'}).join('; '), /no trusted-worker was seen/);
  assert.match(ownNodeProblems(watched([WORKER]), {node: '/n/bin/node'}).join('; '), /no kernel was seen/);
});

test('cua\'s engine answered: the home\'s cua-engine under the trusted worker and no sky_linux at any sample', () => {
  assert.deepEqual(cuaEngineProblems(watched([WORKER, cuaEngine()]), {engine: ENGINE}), []);
});

test('negative control: a sky_linux at one sample, an engine that is not the home\'s, or none under the worker fails cua\'s engine', () => {
  assert.match(cuaEngineProblems(watched([WORKER, cuaEngine()], [WORKER, cuaEngine(), sky()]), {engine: ENGINE}).join('; '), /sky_linux was seen/);
  assert.match(cuaEngineProblems(watched([WORKER, cuaEngine(`${VENDOR}/cua-engine`)]), {engine: ENGINE}).join('; '), /ran .*runtimes.*, not the run home's installed engine/);
  assert.match(cuaEngineProblems(watched([WORKER, cuaEngine(ENGINE, ['/n/bin/node', '/repo/src/repl-host/supervisor.mjs'])]), {engine: ENGINE}).join('; '), /no cua-engine under the trusted worker/);
  assert.match(cuaEngineProblems(watched(), {engine: ENGINE}).join('; '), /took no samples/);
});

test('no engine ran: no cua-engine and no sky_linux at any sample', () => {
  assert.deepEqual(noEngineProblems(watched([WORKER, KERNEL])), []);
  assert.match(noEngineProblems(watched([WORKER, KERNEL], [WORKER, cuaEngine()])).join('; '), /cua-engine 21 ran/);
  assert.match(noEngineProblems(watched([WORKER, sky()])).join('; '), /sky_linux was seen/);
  assert.match(noEngineProblems(watched()).join('; '), /took no samples/);
});

test('nothing launched: no REPL host process and no engine at any sample', () => {
  assert.deepEqual(nothingLaunchedProblems(watched([], [])), []);
  assert.match(nothingLaunchedProblems(watched([], [WORKER])).join('; '), /trusted-worker 20 ran/);
  assert.match(nothingLaunchedProblems(watched([KERNEL])).join('; '), /kernel 30 ran/);
  assert.match(nothingLaunchedProblems(watched([sky()])).join('; '), /sky_linux was seen/);
});

test('a process already exited (a zombie, whose executable cannot be read) is not judged, and an executable read later fills one unread before', () => {
  const zombie = {...cuaEngine(null), state: 'Z'};
  assert.deepEqual(watched([WORKER, zombie]).engines, []);
  // One sampled while it exits (PF_EXITING; its memory, and with it the executable's link, already gone): the same.
  const exiting = {...cuaEngine(null), state: 'S', exiting: true};
  assert.deepEqual(watched([WORKER, exiting]).engines, []);
  // A sky_linux is counted by its name in any state: one seen only while it exits still fails a run on cua's engine.
  assert.match(cuaEngineProblems(watched([WORKER, cuaEngine()], [WORKER, cuaEngine(), {...sky(null), state: 'Z'}]), {engine: ENGINE}).join('; '), /sky_linux was seen/);
  assert.deepEqual(cuaEngineProblems(watched([WORKER, cuaEngine(null)], [WORKER, cuaEngine()], [WORKER, zombie]), {engine: ENGINE}), []);
  // Unread for all its life: never taken for the home's engine.
  assert.match(cuaEngineProblems(watched([WORKER, cuaEngine(null)]), {engine: ENGINE}).join('; '), /ran null, not the run home's installed engine/);
});

test('the bubblewrap and helper processes that carry the kernel\'s words are not the kernel', () => {
  const bwrap = {pid: 28, ppid: 27, comm: 'bwrap', exe: '/usr/bin/bwrap', argv: ['bwrap', '--', '/h/codex-linux-sandbox', '--', 'node', '/repo/src/repl-host/kernel.mjs']};
  assert.deepEqual(watched([bwrap]).replHost, []);
});

// ---- the cells ----

test('the cell table is the pre-flight\'s, in its order: the empty home\'s, the upgraded home\'s and the two copies\'', () => {
  assert.deepEqual(CELLS.map(c => c.cell), ['E0', 'E1', 'E2', 'E3', 'U0', 'U1', 'U2', 'U3', 'U4', 'U5']);
  assert.deepEqual([...new Set(CELLS.map(c => c.home))], ['empty', 'upgraded', 'a copy']);
});

// #171 M6b: the vendor's engine is retired on Linux. No cell expects it to answer: E3 and U0 judge its refusal, and
// nothing finds the vendor's tree through a pin or the retired selection's lookup.
test('no cell runs the vendor\'s engine, and the driver reads no Linux pin and no vendor lookup', async () => {
  const source = f => readFileSync(new URL(`../scripts/accept/${f}`, import.meta.url), 'utf8');
  assert.deepEqual(Object.keys(FIXTURE_STEPS), ['linux-native', 'linux-text', 'linux-browser-only']);
  assert.equal('vendorEngineProblems' in await import('../scripts/accept/linux-runtime-watch.mjs'), false);
  // linux-text.mjs keeps no read-only branch; it names --read-only only to refuse it (fix wave 1)
  assert.doesNotMatch(source('linux-text.mjs'), /readOnly/);
  assert.match((await import('../scripts/accept/linux-text.mjs')).argumentProblem(['--read-only']), /removed in cua 0\.30\.0/);
  const driver = source('linux-runtime.mjs');
  assert.doesNotMatch(driver, /vendorLinuxRuntime|loadPins|selectPin|runtime\/provenance|'rollback'/);
  // The vendor's release by its name alone, for each architecture the hosted legs run.
  assert.deepEqual(VENDOR_RELEASES, {x64: '26.928.40906-linux-x64', arm64: '26.928.40906-linux-arm64'});
});

const passed = fixture => ({fixture, status: 'PASS', steps: FIXTURE_STEPS[fixture].map(name => ({name, status: 'PASS'}))});

test('a fixture passes only with exit 0, its own identity, every one of its mandatory steps passed, and its status PASS', () => {
  for (const fixture of Object.keys(FIXTURE_STEPS)) assert.deepEqual(fixtureProblems({exit: 0, report: passed(fixture)}, {fixture}), []);
  assert.match(fixtureProblems({exit: 1, report: {...passed('linux-text'), status: 'FAIL', steps: [{name: 'bind', status: 'FAIL'}]}}, {fixture: 'linux-text'}).join('; '), /exited 1.*bind failed/);
  assert.match(fixtureProblems({exit: null, signal: 'SIGTERM', report: null}, {fixture: 'linux-text'}).join('; '), /SIGTERM.*no report/);
});

test('negative control (fix wave 1, #1): a PASS with no steps, a PASS from another fixture, or one missing a mandatory step fails', () => {
  assert.match(fixtureProblems({exit: 0, report: {fixture: 'linux-text', status: 'PASS'}}, {fixture: 'linux-text'}).join('; '), /did not run: preconditions/);
  assert.match(fixtureProblems({exit: 0, report: {status: 'PASS', steps: []}}, {fixture: 'linux-browser-only'}).join('; '), /is unnamed, not linux-browser-only/);
  assert.match(fixtureProblems({exit: 0, report: passed('linux-text')}, {fixture: 'linux-browser-only'}).join('; '), /is linux-text, not linux-browser-only/);
  const missing = passed('linux-native');
  missing.steps = missing.steps.filter(s => !/launch_app/.test(s.name));
  assert.match(fixtureProblems({exit: 0, report: missing}, {fixture: 'linux-native'}).join('; '), /did not run: launch_app/);
});

test('each fixture\'s mandatory steps are named in its own source, so the list cannot drift from it', () => {
  const sources = {'linux-native': ['linux-native.mjs', 'linux-selection.mjs'], 'linux-text': ['linux-text.mjs'], 'linux-browser-only': ['linux-browser-only.mjs']};
  for (const [fixture, files] of Object.entries(sources)) {
    const text = files.map(f => readFileSync(new URL(`../scripts/accept/${f}`, import.meta.url), 'utf8')).join('\n');
    for (const name of FIXTURE_STEPS[fixture]) assert.ok(text.includes(JSON.stringify(name).slice(1, -1)) || text.includes(name.replaceAll("'", "\\'")), `${fixture}: ${name}`);
  }
});

test('the phases: E, U or both, named once each; anything else is refused rather than selecting nothing', () => {
  assert.deepEqual(parsePhases(undefined), ['E', 'U']);
  assert.deepEqual(parsePhases('U'), ['U']);
  for (const bad of ['', 'X', 'e', 'E,E', 'E,X', ',']) assert.throws(() => parsePhases(bad), /--phases/);
});

test('negative control (fix wave 1, #1): a partial run that passes is not acceptance, and a missing cell fails it', () => {
  const cell = (id, pass = true) => ({cell: id, verdict: {pass}});
  const all = CELLS.map(c => cell(c.cell));
  assert.deepEqual(runVerdict({phases: ['E', 'U'], cells: all}).acceptance, true);
  const partial = runVerdict({phases: ['E'], cells: all.filter(c => c.cell[0] === 'E')});
  assert.equal(partial.pass, true);
  assert.equal(partial.acceptance, false);
  assert.equal(partial.scope, 'partial');
  assert.deepEqual(runVerdict({phases: ['E', 'U'], cells: all.slice(1)}).missing, ['E0']);
  assert.equal(runVerdict({phases: ['E', 'U'], cells: all.slice(1)}).pass, false);
  assert.equal(runVerdict({phases: ['E', 'U'], cells: all, error: 'stopped'}).pass, false);
  assert.equal(runVerdict({phases: ['E', 'U'], cells: []}).pass, false);
});

const PIN = {version: '0.4.4', assets: {x64: {sha256: 'e'.repeat(64)}}};
const RELEASE = 'cua-linux-x64-e0.4.4-n24.22.0-s0.163.0-mb71dc1f8185d';
const row = (name, status = 'pass', detail = '') => ({name, status, detail});
const ROWS = ['platform', 'runtime.installed', 'runtime.modules', 'runtime.node', 'sandbox', 'sandbox.launcher', 'run.stale', 'runtime.leftovers', 'display', 'engine'];
const doctor = (o = {}) => ({ok: true, checks: ROWS.map(n => o[n] ?? row(n)), ...(o.extraRows ? {checks: [...ROWS.map(n => o[n] ?? row(n)), ...o.extraRows]} : {}),
  engine: {selected: 'cua', service: 'cua', installed: {version: '0.4.4', sha256: 'e'.repeat(64)}, ...o.engineReport}, ...o.top});

test('E0 passes: exit 0, the pointer the derived name, doctor ok with the runtime\'s rows passing and the engine row showing the pin', () => {
  assert.deepEqual(installProblems({exit: 0, pointer: RELEASE, release: RELEASE, doctor: doctor(), pin: PIN, arch: 'x64'}), []);
});

test('negative control: a failed install, a vendor pointer, a failing row, a vendor row, doctor not ok, or an engine not the pin\'s fails E0', () => {
  const judged = o => installProblems({exit: 0, pointer: RELEASE, release: RELEASE, doctor: doctor(), pin: PIN, arch: 'x64', ...o}).join('; ');
  assert.match(judged({exit: 1}), /cua install exited 1/);
  assert.match(judged({pointer: '26.928.40906-linux-x64'}), /the pointer names 26\.928\.40906-linux-x64/);
  assert.match(judged({doctor: doctor({'runtime.modules': row('runtime.modules', 'fail', 'sharp differs')})}), /runtime\.modules is fail: sharp differs/);
  for (const name of FORBIDDEN_ROWS) assert.match(judged({doctor: doctor({extraRows: [row(name, 'pass')]})}), new RegExp(`a row named ${name.replace('.', '\\.')}`));
  assert.match(judged({doctor: doctor({top: {ok: false}})}), /doctor is not ok/);
  assert.match(judged({doctor: null}), /doctor printed no report/);
  assert.match(engineRowProblems(doctor({engineReport: {installed: {version: '0.4.3', sha256: 'd'.repeat(64)}}}), {pin: PIN, arch: 'x64'}).join('; '), /engine 0\.4\.3, not the pinned 0\.4\.4.*SHA-256/);
  assert.match(engineRowProblems(doctor({engineReport: {service: 'vendor'}}), {pin: PIN, arch: 'x64'}).join('; '), /service is vendor/);
  assert.match(engineRowProblems({checks: []}, {pin: PIN, arch: 'x64'}).join('; '), /no engine row/);
});

const INSTALLER = 'node /repo/bin/cua.mjs install';
const refused = (code = 'runtime_not_installed', message = `cua's Linux runtime ${RELEASE} is not installed in ${HOME}: its module tree ${HOME}/modules/b71d is missing`) =>
  `cua serve: a diagnostic first\ncua: ${message} [${code}]\n  run \`${INSTALLER}\`; a \`cua\` from another checkout installs that checkout's runtime, which may not be ${RELEASE}\n`;

test('a refusal is read from serve\'s standard error: its message, code and remedy', () => {
  assert.deepEqual(parseRefusal(refused()), {message: `cua's Linux runtime ${RELEASE} is not installed in ${HOME}: its module tree ${HOME}/modules/b71d is missing`, code: 'runtime_not_installed',
    hint: `run \`${INSTALLER}\`; a \`cua\` from another checkout installs that checkout's runtime, which may not be ${RELEASE}`});
  assert.equal(parseRefusal('cua serve: listening\n'), null);
});

const attempt = (o = {}) => ({exit: 1, signal: null, replied: false, spontaneous: true, drained: true, stderr: refused(), ...o});
const ASKED = {code: 'runtime_not_installed', message: parseRefusal(refused()).message, hint: parseRefusal(refused()).hint};

test('negative control (fix wave 1, #7): a JSON-RPC error reply, a signalled exit, an exit the driver forced, undrained stderr or no sentence fails the refusal', () => {
  assert.deepEqual(refusedAsProblems(attempt(), ASKED), []);
  const judged = o => refusedAsProblems(attempt(o), ASKED).join('; ');
  assert.match(judged({replied: true}), /initialize was answered/);
  assert.match(judged({exit: null, signal: 'SIGKILL'}), /ended by SIGKILL, not a nonzero exit of its own/);
  assert.match(judged({exit: 0}), /exited 0/);
  assert.match(judged({spontaneous: false}), /did not exit on its own/);
  assert.match(judged({drained: false}), /standard error was not drained/);
  assert.match(judged({stderr: 'killed\n'}), /no refusal sentence/);
});

const NODE = '/run/user/.local/share/cua/node/v24.22.0/bin/node';
const summary = (o = {}) => ({serve: 101, workers: [{pid: 102, underServe: true, exe: NODE, ...o.worker}], helpers: [104], kernels: [{pid: 106, underHelper: true, underServe: true, callsAfterExec: 300, exe: NODE, ...o.kernel}],
  runtimes: {calls: 0, unresolved: 0, pending: 0, unended: 0, complete: true, ...o.runtimes}, processes: 40, launched: [], ...o.top});

test('a traced run passes when the trace followed the kernel and the serve\'s tree named nothing under runtimes/', () => {
  assert.deepEqual(traceProblems(summary()), []);
  assert.deepEqual(traceProblems(summary({kernel: {opened: ['/m/a', '/m/b']}}), {opened: ['/m/a', '/m/b']}), []);
});

test('negative control: a path under runtimes/ in the trace, a trace incomplete by the reader\'s rule, a missing kernel or an entry not opened fails', () => {
  assert.match(traceProblems(summary({runtimes: {calls: 3}})).join('; '), /3 calls .* under runtimes\//);
  assert.match(traceProblems(summary({runtimes: {unresolved: 2, complete: false}})).join('; '), /incomplete: 2 calls/);
  assert.match(traceProblems({...summary(), kernels: []}).join('; '), /no kernel exec/);
  assert.match(traceProblems({...summary(), workers: []}).join('; '), /no trusted worker/);
  assert.match(traceProblems(summary({kernel: {opened: ['/m/a']}}), {opened: ['/m/a', '/m/b']}).join('; '), /did not open \/m\/b/);
  // Opened by a kernel that is not the serve's, under the helper, does not count.
  assert.match(traceProblems(summary({kernel: {opened: ['/m/a'], underHelper: false}}), {opened: ['/m/a']}).join('; '), /did not open \/m\/a/);
});

test('negative control (fix wave 1, #2): an unfinished file call or a process with no end leaves the trace incomplete; opens pooled across kernels do not count', () => {
  assert.match(traceProblems(summary({runtimes: {pending: 1, complete: false}})).join('; '), /1 file call unfinished/);
  assert.match(traceProblems(summary({runtimes: {unended: 2, complete: false}})).join('; '), /2 processes of the serve's tree with no end/);
  // complete: false alone fails, whatever the counts say.
  assert.match(traceProblems(summary({runtimes: {complete: false}})).join('; '), /incomplete/);
  const pooled = {...summary(), kernels: [{pid: 106, underHelper: true, underServe: true, callsAfterExec: 9, exe: NODE, opened: ['/m/a']}, {pid: 107, underHelper: true, underServe: true, callsAfterExec: 9, exe: NODE, opened: ['/m/b']}]};
  assert.match(traceProblems(pooled, {opened: ['/m/a', '/m/b']}).join('; '), /no one kernel of the serve's opened all 2/);
});

test('negative control (fix wave 1, #8): a worker or kernel that exec\'d another Node than the home\'s managed one fails', () => {
  assert.deepEqual(traceProblems(summary(), {node: [NODE]}), []);
  assert.match(traceProblems(summary({kernel: {exe: '/usr/bin/node'}}), {node: [NODE]}).join('; '), /the kernel 106 ran \/usr\/bin\/node, not the home's managed Node/);
  assert.match(traceProblems(summary({worker: {exe: '/opt/hostedtoolcache/node/24/bin/node'}}), {node: [NODE]}).join('; '), /the worker 102 ran .*hostedtoolcache/);
});

test('nothing launched, by exec evidence: the serve\'s trace complete and no helper, bubblewrap, REPL host or engine exec in it', () => {
  const ok = {serve: 101, launched: [], runtimes: {complete: true, pending: 0, unended: 0, unresolved: 0, calls: 0}};
  assert.deepEqual(launchedProblems(ok), []);
  assert.match(launchedProblems({...ok, launched: [{pid: 104, kind: 'helper', program: '/h/codex-linux-sandbox'}]}).join('; '), /helper 104 was launched/);
  assert.match(launchedProblems({...ok, launched: [{pid: 105, kind: 'bwrap', program: '/usr/bin/bwrap'}]}).join('; '), /bwrap 105 was launched/);
  assert.match(launchedProblems({...ok, serve: null}).join('; '), /no cua serve exec/);
  assert.match(launchedProblems({...ok, runtimes: {...ok.runtimes, complete: false, unended: 1}}).join('; '), /incomplete/);
  assert.match(launchedProblems(null).join('; '), /no trace/);
});

test('counted runs inherit no runtime override: a variable that names a part of the runtime or how it launches is named', () => {
  assert.deepEqual(inheritedOverrides({CUA_HOME: '/h', HOME: '/u', PATH: '/bin'}), []);
  // The host lock's marker and the feedback directory name no part of the runtime.
  assert.deepEqual(inheritedOverrides({CUA_LOCK_HELD: '1', CUA_FEEDBACK_DIR: '/f'}), []);
  assert.deepEqual(inheritedOverrides({CUA_SKY_SERVICE: '/s', CUA_ENGINE_BIN: '/e', CUA_SANDBOX_DENY_READ: '/x', SKY_CUA_SERVICE_PATH: '/y', CUA_SHIM_SURFACES: 'browser'}),
    ['CUA_ENGINE_BIN', 'CUA_SANDBOX_DENY_READ', 'CUA_SHIM_SURFACES', 'CUA_SKY_SERVICE', 'SKY_CUA_SERVICE_PATH']);
  assert.deepEqual(inheritedOverrides({CUA_NODE: '/usr/bin/node', OAI_SKY_LINUX_BIN: '/x', NODE_OPTIONS: '--x', CUA_REPL_NODE_MODULE_DIRS: '/m', CUA_HOME: '/h'}),
    ['CUA_NODE', 'CUA_REPL_NODE_MODULE_DIRS', 'NODE_OPTIONS', 'OAI_SKY_LINUX_BIN']);
});

test('negative control (fix wave 1, #5): the vendor tree must be in the state the cell names at its boundary, not taken from the label', () => {
  assert.deepEqual(boundaryProblems({expected: 'present', exists: true, resolves: true}), []);
  assert.deepEqual(boundaryProblems({expected: 'absent', exists: false, resolves: false}), []);
  assert.match(boundaryProblems({expected: 'absent', exists: true, resolves: true}).join('; '), /runtimes\/ is there/);
  assert.match(boundaryProblems({expected: 'present', exists: true, resolves: false, why: 'release_damaged'}).join('; '), /does not resolve \(release_damaged\)/);
});

const OLDER = (o = {}) => ({commit: APPROVED_OLDER, clean: true, exit: 0, pointer: RELEASE, release: RELEASE, vendorRelease: '26.928.40906-linux-x64', recorded: true, vendorRow: {status: 'pass'}, ...o});

test('the upgraded home\'s setup: the approved older commit, clean, its install placing the derived pointer and the vendor release that its doctor verifies', () => {
  assert.equal(APPROVED_OLDER, '854103aa58b56521ba85afb4b392e1f3c5a8287d');
  assert.deepEqual(olderProblems(OLDER()), []);
});

test('negative control: another older commit, a dirty checkout, a failed install, another pointer, no recorded release, or a vendor row not passing fails the setup', () => {
  assert.match(olderProblems(OLDER({commit: '0d19fdfadce47fc6ba88db180fb4845346c9be26'})).join('; '), /is not the approved/);
  assert.match(olderProblems(OLDER({clean: false})).join('; '), /has local changes/);
  assert.match(olderProblems(OLDER({exit: 1})).join('; '), /install exited 1/);
  assert.match(olderProblems(OLDER({pointer: '26.928.40906-linux-x64'})).join('; '), /the pointer names 26\.928/);
  assert.match(olderProblems(OLDER({recorded: false})).join('; '), /no recorded vendor release/);
  assert.match(olderProblems(OLDER({vendorRow: {status: 'fail', detail: 'signature'}})).join('; '), /runtime\.vendor is fail: signature/);
  assert.match(olderProblems(OLDER({vendorRow: null})).join('; '), /runtime\.vendor is missing/);
});

test('Minor (a): a browser-only run\'s witnesses are kept relative to the module root, and anything outside it stays absolute', () => {
  const root = '/r/modules/b71d';
  const report = {imports: {selected: {pngjs: `${root}/node_modules/pngjs/lib/png.js`}, natives: [`${root}/node_modules/x.node`, '/elsewhere/y.node'],
    loaded: {playwright: {entry: `${root}/node_modules/playwright/index.js`, files: [`${root}/node_modules/playwright/index.js`, `${root}/node_modules/playwright-core/index.js`]}}}};
  const kernels = [{pid: 6, underServe: true, underHelper: true, opened: [`${root}/node_modules/pngjs/lib/png.js`]}];
  assert.deepEqual(witnessOf(report, {root, kernels}), {root, selected: {pngjs: 'node_modules/pngjs/lib/png.js'}, natives: ['node_modules/x.node', '/elsewhere/y.node'],
    playwright: {entry: 'node_modules/playwright/index.js', files: 2, outside: []}, opened: [{pid: 6, paths: ['node_modules/pngjs/lib/png.js']}]});
});


// Pilot 3's hosted failures (fix wave 1, the coordinator's ruling): a short-lived cua-engine read alive in /proc/<pid>/stat
// and gone by its /proc/<pid>/exe. A stubbed /proc: each path's reads in turn (a list), or always the same value.
const statLine = (pid, comm, state, ppid, {flags = 0, start = 4200} = {}) => `${pid} (${comm}) ${state} ${ppid} 0 0 0 -1 ${flags} ${Array(12).fill(0).join(' ')} ${start} 0`;
function fakeProc(files) {
  const reads = new Map(Object.entries(files).map(([path, v]) => [path, Array.isArray(v) ? [...v] : v]));
  const next = path => { const v = reads.get(path); return Array.isArray(v) ? (v.length > 1 ? v.shift() : v[0]) ?? null : v ?? null; };
  return {list: () => [...new Set(Object.keys(files).map(p => /^\/proc\/(\d+)\//.exec(p)?.[1]).filter(Boolean))], read: next, readlink: next};
}
const tree = engine => fakeProc({
  '/proc/10/stat': statLine(10, 'node', 'S', 1), '/proc/10/exe': '/n/bin/node', '/proc/10/cmdline': 'node\0/repo/src/repl-host/trusted-worker.mjs\0', '/proc/10/environ': '',
  '/proc/11/cmdline': '/h/engine/linux/cua-engine\0--version\0', ...engine,
});

test('the sampler tells a cua-engine gone between its stat and its exe from a live one: gone is skipped and recorded', () => {
  const entries = sampleTree(10, tree({'/proc/11/stat': [statLine(11, 'cua-engine', 'S', 10), null], '/proc/11/exe': null}));
  assert.equal(entries.find(e => e.pid === 11).vanished, 'gone');
  const record = watched(entries);
  assert.deepEqual(record.engines, []);
  assert.deepEqual(record.engineProcesses, [{pid: 11, starttime: '4200', exe: null, skipped: 'gone'}]);
});

test('the sampler skips a cua-engine found exiting or a zombie when its exe could not be read', () => {
  for (const second of [statLine(11, 'cua-engine', 'Z', 10), statLine(11, 'cua-engine', 'X', 10), statLine(11, 'cua-engine', 'S', 10, {flags: 0x4})]) {
    const entries = sampleTree(10, tree({'/proc/11/stat': [statLine(11, 'cua-engine', 'S', 10), second], '/proc/11/exe': null}));
    assert.equal(entries.find(e => e.pid === 11).vanished, 'exiting');
    assert.deepEqual(watched(entries).engineProcesses, [{pid: 11, starttime: '4200', exe: null, skipped: 'exiting'}]);
  }
});

test('negative control: a cua-engine still alive whose executable cannot be read fails cua\'s engine', () => {
  const entries = sampleTree(10, tree({'/proc/11/stat': statLine(11, 'cua-engine', 'S', 10), '/proc/11/exe': null}));
  assert.equal(entries.find(e => e.pid === 11).vanished, undefined);
  const record = watched(entries);
  assert.deepEqual(record.engineProcesses, [{pid: 11, starttime: '4200', exe: null, skipped: null}]);
  assert.match(cuaEngineProblems(record, {engine: ENGINE}).join('; '), /cua-engine 11 ran null/);
});

test('a cua-engine read alive is recorded with its pid, start time and executable, and judged', () => {
  const entries = sampleTree(10, tree({'/proc/11/stat': statLine(11, 'cua-engine', 'S', 10, {start: 77}), '/proc/11/exe': ENGINE}));
  assert.deepEqual(watched(entries).engineProcesses, [{pid: 11, starttime: '77', exe: ENGINE, skipped: null}]);
});

// Fix wave 2 (#3, #4, #5).
test('negative control (fix wave 2, #4): a kernel or worker pid that ever exec\'d another Node fails, whatever it ran last', () => {
  assert.match(traceProblems(summary({kernel: {exe: NODE, nodeExes: ['/usr/bin/node', NODE]}}), {node: [NODE]}).join('; '), /the kernel 106 ran \/usr\/bin\/node/);
  // The sampler keeps every executable it saw at a pid.
  const record = watched([WORKER, KERNEL], [WORKER, {...KERNEL, exe: '/usr/bin/node'}]);
  assert.deepEqual(record.replHost.find(p => p.role === 'kernel').exes, ['/n/bin/node', '/usr/bin/node']);
  assert.match(ownNodeProblems(record, {node: '/n/bin/node'}).join('; '), /kernel 30 ran \/usr\/bin\/node/);
});

test('negative control (fix wave 2, #5): an engine sighted only as it vanished still fails a no-engine run and nothing-launched', () => {
  const entries = sampleTree(10, tree({'/proc/11/stat': [statLine(11, 'cua-engine', 'S', 10), null], '/proc/11/exe': null}));
  const record = watched(entries);
  assert.match(noEngineProblems(record).join('; '), /cua-engine 11 ran/);
  assert.match(nothingLaunchedProblems(record).join('; '), /cua-engine 11 ran/);
});

test('negative control (fix wave 2, #3): an exec under runtimes/ in a refused open\'s trace, attempted or done, is a launch', () => {
  const ok = {serve: 101, launched: [], runtimes: {complete: true, pending: 0, unended: 0, unresolved: 0, calls: 2}};
  // A refused open's stat under runtimes/ is a call there, not a launch.
  assert.deepEqual(launchedProblems(ok), []);
  assert.match(launchedProblems({...ok, launched: [{pid: 102, kind: 'runtimes', program: '/h/runtimes/26/x'}]}).join('; '), /runtimes 102 was launched/);
  assert.match(launchedProblems({...ok, launched: [{pid: 102, kind: 'runtimes', program: '/h/runtimes/26/x', attempted: true}]}).join('; '), /runtimes 102 was attempted/);
});

test('negative control (fix wave 2, #3): an initialize reply delivered while stdout drained is a reply', () => {
  const sent = JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {}});
  assert.equal(initializeAnswered([sent]), false);
  assert.equal(initializeAnswered([sent, 'not json', JSON.stringify({jsonrpc: '2.0', id: 1, result: {}})]), true);
  assert.equal(initializeAnswered([sent, JSON.stringify({jsonrpc: '2.0', id: 1, error: {code: -32603, message: 'refused'}})]), true);
  // A notification or another id is not the answer.
  assert.equal(initializeAnswered([sent, JSON.stringify({jsonrpc: '2.0', method: 'notifications/message', params: {}}), JSON.stringify({jsonrpc: '2.0', id: 2, result: {}})]), false);
});

// ---- acceptance 13 (#171 M6b, T6) ----

// The fetch log's preload, on a served fetch: every URL asked, the URL that answered and the bytes its body gave.
const served = (bodies, {final = url => url} = {}) => async url => {
  const body = bodies[url];
  if (body === undefined) throw Object.assign(new TypeError('fetch failed'), {cause: {code: 'ENOTFOUND'}});
  const response = new Response(body, {status: 200, headers: {'content-length': String(body.length)}});
  Object.defineProperty(response, 'url', {value: final(url)});
  return response;
};

test('the preload logs every fetch: the URL asked, where it answered (no query kept), the status and every byte its body gave', async () => {
  const lines = [];
  const fetch = loggedFetch(served({'https://a.example/x.tgz': 'abcdef', 'https://a.example/y': ''}, {final: url => `${url}?sig=secret&jwt=t`}), record => lines.push(JSON.stringify(record)));
  const response = await fetch('https://a.example/x.tgz', {redirect: 'error'});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), '6');
  assert.equal(response.url, 'https://a.example/x.tgz?sig=secret&jwt=t');
  assert.equal(await response.text(), 'abcdef');
  await (await fetch(new URL('https://a.example/y'))).arrayBuffer();
  await assert.rejects(fetch('https://nowhere.example/z'), /fetch failed/);
  const dir = mkdtempSync(join(tmpdir(), 'cua-fetch-log-'));
  try {
    writeFileSync(join(dir, 'log'), `${lines.join('\n')}\n`);
    assert.deepEqual(readFetchLog(join(dir, 'log')), [
      {url: 'https://a.example/x.tgz', answered: 'https://a.example/x.tgz', status: 200, bytes: 6, complete: true, error: null},
      {url: 'https://a.example/y', answered: 'https://a.example/y', status: 200, bytes: 0, complete: true, error: null},
      {url: 'https://nowhere.example/z', answered: null, status: null, bytes: null, complete: null, error: 'ENOTFOUND'}]);
    assert.doesNotMatch(lines.join('\n'), /secret|jwt/);
    // No file is no log, never an empty one; an unreadable line is no log either.
    assert.equal(readFetchLog(join(dir, 'absent')), null);
    writeFileSync(join(dir, 'torn'), '{"event":"asked","id":1,"url":"u"}\n{"event":');
    assert.equal(readFetchLog(join(dir, 'torn')), null);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('a body read only in part is logged as not complete, with the bytes it gave', async () => {
  const lines = [];
  const fetch = loggedFetch(served({'https://a.example/big': 'x'.repeat(100_000)}), record => lines.push(record));
  const response = await fetch('https://a.example/big');
  const reader = response.body.getReader();
  const first = await reader.read();
  await reader.cancel();
  const answered = lines.find(l => l.event === 'answered');
  assert.equal(answered.complete, false);
  assert.equal(answered.bytes, first.value.byteLength);
});

const ASSETS = [{url: 'https://registry.npmjs.org/pngjs/-/pngjs-7.0.0.tgz', length: 3}, {url: 'https://nodejs.org/dist/v24.22.0/node-v24.22.0-linux-x64.tar.gz', length: 5},
  {url: 'https://github.com/SSFSKIM/cua/releases/download/linux-engine-v0.4.5/cua-engine-0.4.5-linux-x64'}];
const fetched = (o = {}) => ASSETS.map(a => ({url: a.url, answered: a.url, status: 200, bytes: a.length ?? 9, complete: true, error: null, ...o[a.url]}));
const DEB = {url: 'https://persistent.oaistatic.com/codex-app-prod/chatgpt_26.928.40906_amd64.deb', length: 474898954};

test('E0\'s fetch log holds exactly the arch\'s pinned assets, each asked once and answered whole', () => {
  assert.deepEqual(fetchLogProblems(fetched(), {expected: ASSETS}), []);
});

test('negative control: a log with the deb\'s URL, a missing asset, an extra or repeated URL, a short body or no log fails E0\'s fetch log', () => {
  const judged = (log, expected = ASSETS) => fetchLogProblems(log, {expected}).join('; ');
  assert.match(judged([...fetched(), {url: DEB.url, answered: DEB.url, status: 200, bytes: DEB.length, complete: true, error: null}]), /chatgpt_26\.928\.40906_amd64\.deb was asked for, OpenAI's/);
  assert.match(judged(fetched({[ASSETS[1].url]: {answered: 'https://cdn.oaistatic.com/node.tgz'}})), /answered from https:\/\/cdn\.oaistatic\.com\/node\.tgz, OpenAI's/);
  assert.match(judged(fetched().slice(1)), /pngjs-7\.0\.0\.tgz was not asked for/);
  assert.match(judged([...fetched(), fetched()[0]]), /pngjs-7\.0\.0\.tgz was asked for 2 times/);
  assert.match(judged([...fetched(), {url: 'https://example.com/other', answered: 'https://example.com/other', status: 200, bytes: 1, complete: true, error: null}]), /https:\/\/example\.com\/other is no pinned asset/);
  assert.match(judged(fetched({[ASSETS[1].url]: {bytes: 4}})), /node-v24\.22\.0-linux-x64\.tar\.gz gave 4 bytes, not its pinned 5/);
  assert.match(judged(fetched({[ASSETS[2].url]: {complete: false}})), /cua-engine-0\.4\.5-linux-x64 was not read whole/);
  assert.match(judged(fetched({[ASSETS[0].url]: {status: 404}})), /answered 404/);
  assert.match(judged(null), /no fetch log/);
  assert.match(judged([], []), /the pinned assets are unknown/);
});

test('the control: the older cua\'s log under the same preload holds the vendor\'s deb, asked for and answered in full', () => {
  const log = [...fetched(), {url: DEB.url, answered: 'https://cdn.example/chatgpt.deb', status: 200, bytes: DEB.length, complete: true, error: null}];
  assert.deepEqual(controlProblems(log, {deb: DEB}), []);
});

test('negative control: a control log without the deb, with a short deb, or no log at all does not count as the control', () => {
  assert.match(controlProblems(fetched(), {deb: DEB}).join('; '), /does not hold the deb/);
  assert.match(controlProblems([{url: DEB.url, answered: DEB.url, status: 200, bytes: DEB.length - 1, complete: true}], {deb: DEB}).join('; '), /gave 474898953 bytes/);
  assert.match(controlProblems([{url: DEB.url, answered: null, status: null, bytes: null, complete: null, error: null}], {deb: DEB}).join('; '), /was not answered/);
  assert.match(controlProblems(null, {deb: DEB}).join('; '), /no fetch log/);
  assert.match(controlProblems(fetched(), {deb: null}).join('; '), /the deb's URL is unknown/);
});

test('nothing fetched: an existing log with no URL asked; any URL, or no log, fails', () => {
  assert.deepEqual(noFetchProblems([]), []);
  assert.match(noFetchProblems(fetched().slice(0, 1)).join('; '), /asked for https:\/\/registry\.npmjs\.org\/pngjs/);
  assert.match(noFetchProblems(null).join('; '), /no fetch log/);
});

// Traces as strace --seccomp-bpf -f -y writes them, summarized by the reader.
const H = '/run/u/cua';
const ENDS = pids => pids.map(pid => `${pid}   exit_group(0) = ?`);
const installTrace = (lines, {pids = [500]} = {}) => summarizeTrace([`500   execve("/usr/bin/node", ["node", "--import", "/repo/scripts/accept/fetch-log.mjs", "/repo/bin/cua.mjs", "install"], 0x7ffd /* 9 vars */) = 0`,
  ...lines, ...ENDS(pids)].join('\n'), {helper: '/h/helper', home: H, cwd: '/repo'});

test('the install ran no ar and no xz: a trace whole, with every exec listed, gzip and tar allowed', () => {
  const summary = installTrace(['500   clone(child_stack=NULL, flags=SIGCHLD) = 501', '501   execve("/usr/bin/tar", ["tar", "-xzf", "a.tgz"], 0x7ffd /* 9 vars */) = 0'], {pids: [500, 501]});
  assert.deepEqual(toolProblems(summary), []);
  assert.deepEqual(summary.programs, [{path: '/usr/bin/node', count: 1}, {path: '/usr/bin/tar', count: 1}]);
});

test('negative control: a trace with ar, with xz looked up along PATH, with an unended process, or no trace fails the install\'s tools', () => {
  const ar = installTrace(['500   clone(child_stack=NULL, flags=SIGCHLD) = 501', '501   execve("/usr/bin/ar", ["ar", "p", "chatgpt.deb", "data.tar.xz"], 0x7ffd /* 9 vars */) = 0'], {pids: [500, 501]});
  assert.match(toolProblems(ar).join('; '), /\/usr\/bin\/ar was executed/);
  const xz = installTrace(['500   clone(child_stack=NULL, flags=SIGCHLD) = 501', '501   execve("/usr/local/bin/xz", ["xz", "-d"], 0x7ffd /* 9 vars */) = -1 ENOENT (No such file or directory)'], {pids: [500, 501]});
  assert.match(toolProblems(xz).join('; '), /\/usr\/local\/bin\/xz was looked up/);
  const unended = installTrace(['500   clone(child_stack=NULL, flags=SIGCHLD) = 501', '501   openat(AT_FDCWD</repo>, "/etc/hosts", O_RDONLY) = 3</etc/hosts>']);
  assert.match(toolProblems(unended).join('; '), /the trace is incomplete: 1 process with no end/);
  assert.match(toolProblems(null).join('; '), /no trace/);
});

const R6 = `${H}/runtimes/26.928.40906-linux-x64`;
// The retired tree's reads as Node makes them: lstat of runtimes/ and of both names, the record opened once, the walk.
const readsOfTree = [
  `500   statx(AT_FDCWD</repo>, "${H}/runtimes", AT_STATX_SYNC_AS_STAT|AT_SYMLINK_NOFOLLOW, STATX_ALL, 0x7ffc) = 0`,
  `500   statx(AT_FDCWD</repo>, "${R6}", AT_STATX_SYNC_AS_STAT|AT_SYMLINK_NOFOLLOW, STATX_ALL, 0x7ffc) = 0`,
  `500   statx(AT_FDCWD</repo>, "${R6}/install.json", AT_STATX_SYNC_AS_STAT|AT_SYMLINK_NOFOLLOW, STATX_ALL, 0x7ffc) = 0`,
  `500   openat(AT_FDCWD</repo>, "${R6}/install.json", O_RDONLY|O_NONBLOCK|O_NOFOLLOW|O_CLOEXEC) = 21<${R6}/install.json>`,
  `500   openat(AT_FDCWD</repo>, "${R6}", O_RDONLY|O_CLOEXEC|O_DIRECTORY) = 22<${R6}>`,
  `500   statx(AT_FDCWD</repo>, "${R6}/cua_node", AT_STATX_SYNC_AS_STAT|AT_SYMLINK_NOFOLLOW, STATX_ALL, 0x7ffc) = 0`,
  `500   statx(AT_FDCWD</repo>, "${H}/runtimes/26.928.40906-linux-arm64", AT_STATX_SYNC_AS_STAT|AT_SYMLINK_NOFOLLOW, STATX_ALL, 0x7ffc) = -1 ENOENT (No such file or directory)`,
];
const RELEASES = Object.values(VENDOR_RELEASES);

test('the traced calls under runtimes/ are lstat, directory reads and one open of install.json, inside the two release names', () => {
  assert.deepEqual(runtimesCallProblems(installTrace(readsOfTree), {home: H, releases: RELEASES}), []);
});

test('negative control: a trace with an unlink, a write, a rename, an exec, a following stat, a second open, a path outside the two names, or no trace fails', () => {
  const judged = (...extra) => runtimesCallProblems(installTrace([...readsOfTree, ...extra]), {home: H, releases: RELEASES}).join('; ');
  assert.match(judged(`500   unlinkat(AT_FDCWD</repo>, "${R6}/cua_node/x", 0) = 0`), /unlink of .*cua_node\/x/);
  assert.match(judged(`500   openat(AT_FDCWD</repo>, "${R6}/added", O_WRONLY|O_CREAT|O_TRUNC|O_CLOEXEC, 0666) = 23<${R6}/added>`), /write of .*\/added/);
  assert.match(judged(`500   mkdir("${R6}/tmp-x", 0700) = 0`), /write of .*tmp-x/);
  assert.match(judged(`500   renameat2(AT_FDCWD</repo>, "${R6}/a", AT_FDCWD</repo>, "${R6}/b", 0) = 0`), /rename of/);
  assert.match(judged(`500   execve("${R6}/cua_node/bin/node", ["node"], 0x7ffd /* 9 vars */) = 0`), /exec of/);
  assert.match(judged(`500   statx(AT_FDCWD</repo>, "${R6}/cua_node", AT_STATX_SYNC_AS_STAT, STATX_ALL, 0x7ffc) = 0`), /stat of .*cua_node/);
  assert.match(judged(`500   openat(AT_FDCWD</repo>, "${R6}/install.json", O_RDONLY|O_NONBLOCK|O_NOFOLLOW|O_CLOEXEC) = 23<${R6}/install.json>`), /install\.json was opened 2 times, not once/);
  assert.match(judged(`500   openat(AT_FDCWD</repo>, "${R6}/cua_node/package.json", O_RDONLY|O_CLOEXEC) = 24<${R6}/cua_node/package.json>`), /open of .*package\.json/);
  assert.match(judged(`500   statx(AT_FDCWD</repo>, "${H}/runtimes/m6b-added", AT_STATX_SYNC_AS_STAT|AT_SYMLINK_NOFOLLOW, STATX_ALL, 0x7ffc) = 0`), /outside the two release names: .*m6b-added/);
  assert.match(runtimesCallProblems(installTrace(readsOfTree.filter(l => !/install\.json", O_RDONLY/.test(l))), {home: H, releases: RELEASES}).join('; '), /install\.json was opened 0 times/);
  assert.match(runtimesCallProblems(null, {home: H, releases: RELEASES}).join('; '), /no trace/);
});

const INSTALLER_13 = 'node /repo/bin/cua.mjs install';
const SETTINGS = '/run/u/user/.config/cua/engine.json';

test('the refusals\' literals: each vendor source, the install\'s ending, and an outdated override', () => {
  const tail = 'which cua 0.30.0 removed from Linux, where cua\'s own engine (CUA_NATIVE_ENGINE=cua, the default) is the only one: ';
  assert.equal(retiredMessage({sources: ['variable'], settings: SETTINGS, installer: INSTALLER_13}),
    `CUA_NATIVE_ENGINE=vendor selects the vendor's engine, ${tail}unset CUA_NATIVE_ENGINE, then run \`${INSTALLER_13} --engine\``);
  assert.equal(retiredMessage({sources: ['file'], settings: SETTINGS, installer: INSTALLER_13}),
    `"engine": "vendor" in ${SETTINGS} selects the vendor's engine, ${tail}remove "engine" from ${SETTINGS}, then run \`${INSTALLER_13} --engine\``);
  assert.equal(retiredMessage({sources: ['variable', 'file'], settings: SETTINGS, installer: INSTALLER_13}),
    `CUA_NATIVE_ENGINE=vendor and "engine": "vendor" in ${SETTINGS} select the vendor's engine, ${tail}unset CUA_NATIVE_ENGINE and remove "engine" from ${SETTINGS}, then run \`${INSTALLER_13} --engine\``);
  assert.equal(retiredMessage({sources: ['variable'], settings: SETTINGS, installer: INSTALLER_13, after: 'install'}),
    `CUA_NATIVE_ENGINE=vendor selects the vendor's engine, ${tail}unset CUA_NATIVE_ENGINE; the install otherwise completed`);
  assert.equal(outdatedOverrideMessage({path: '/r/outdated/cua-engine', version: '0.4.4', minimum: '0.4.5', installer: INSTALLER_13}),
    `the default engine (cua) selects cua's own engine, and CUA_LINUX_ENGINE_BIN names /r/outdated/cua-engine, which is 0.4.4, older than 0.4.5, which this cua needs: unset CUA_LINUX_ENGINE_BIN, then run \`${INSTALLER_13} --engine\``);
  assert.equal(ENGINE_HINT_LITERAL, 'a `cua` from another checkout installs that checkout\'s engine, not this one\'s');
  assert.equal(OUTDATED_ENGINE.version, '0.4.4');
  assert.deepEqual(Object.keys(OUTDATED_ENGINE.assets), ['x64', 'arm64']);
});

const RETIRED = {code: 'engine_retired', message: retiredMessage({sources: ['variable'], settings: SETTINGS, installer: INSTALLER_13}), hint: ENGINE_HINT_LITERAL};
const refusedOpen = (message = RETIRED.message, {code = RETIRED.code, hint = RETIRED.hint} = {}) => ({exit: 1, signal: null, replied: false, spontaneous: true, drained: true,
  stderr: `cua: ${message} [${code}]\n  ${hint}\n`});

test('a vendor source\'s open is refused with exactly its sentence and the hint', () => {
  assert.deepEqual(refusedAsProblems(refusedOpen(), RETIRED), []);
});

test('negative control: a sentence one word off, another code, another hint, an answered open or no attempt fails the refusal', () => {
  assert.match(refusedAsProblems(refusedOpen(RETIRED.message.replace('removed', 'retired')), RETIRED).join('; '), /its sentence is not the literal/);
  assert.match(refusedAsProblems(refusedOpen(RETIRED.message, {code: 'engine_outdated'}), RETIRED).join('; '), /refused engine_outdated, not engine_retired/);
  assert.match(refusedAsProblems(refusedOpen(RETIRED.message, {hint: 'run `cua install --engine`'}), RETIRED).join('; '), /its hint is not the literal/);
  assert.match(refusedAsProblems({...refusedOpen(), replied: true}, RETIRED).join('; '), /initialize was answered/);
  assert.match(refusedAsProblems(null, RETIRED).join('; '), /no attempt/);
});

// A refused open's trace: the serve alone, or the serve and the override's version probe.
const OVERRIDE = '/r/outdated/cua-engine';
const openTrace = (extra = [], pids = [600]) => summarizeTrace([`600   execve("/usr/bin/node", ["node", "/repo/bin/cua.mjs", "serve"], 0x7ffd /* 9 vars */) = 0`, ...extra, ...ENDS(pids)].join('\n'),
  {helper: '/h/helper', home: H, cwd: '/repo'});
const probe = (argv = `["${OVERRIDE}", "--version"]`) => ['600   clone(child_stack=NULL, flags=SIGCHLD) = 601', `601   execve("${OVERRIDE}", ${argv}, 0x7ffd /* 1 var */) = 0`];

test('what a refused open executed: nothing of an engine, a worker, a helper or a host; under the override exactly its --version', () => {
  assert.deepEqual(execRoleProblems(openTrace(), {helper: '/h/helper', allowed: []}), []);
  assert.deepEqual(execRoleProblems(openTrace(probe(), [600, 601]), {helper: '/h/helper', allowed: [{program: OVERRIDE, argv: [OVERRIDE, '--version']}]}), []);
});

test('negative control: a worker, a helper, an engine server, a second probe, a probe with other arguments, a missing probe or no trace fails', () => {
  const judged = (extra, pids, allowed = []) => execRoleProblems(openTrace(extra, pids), {helper: '/h/helper', allowed}).join('; ');
  assert.match(judged(['600   clone(child_stack=NULL, flags=SIGCHLD) = 602', '602   execve("/n/bin/node", ["node", "/repo/src/repl-host/trusted-worker.mjs"], 0x7ffd /* 9 vars */) = 0'], [600, 602]), /trusted-worker 602 ran \/n\/bin\/node/);
  assert.match(judged(['600   clone(child_stack=NULL, flags=SIGCHLD) = 603', '603   execve("/h/helper", ["/h/helper", "--", "true"], 0x7ffd /* 9 vars */) = 0'], [600, 603]), /helper 603 ran \/h\/helper/);
  assert.match(judged(['600   clone(child_stack=NULL, flags=SIGCHLD) = 604', `604   execve("${H}/engine/linux/cua-engine", ["cua-engine", "server"], 0x7ffd /* 9 vars */) = 0`], [600, 604]), /engine 604 ran .*cua-engine server/);
  const allowed = [{program: OVERRIDE, argv: [OVERRIDE, '--version']}];
  assert.match(judged([...probe(), '600   clone(child_stack=NULL, flags=SIGCHLD) = 605', `605   execve("${OVERRIDE}", ["${OVERRIDE}", "--version"], 0x7ffd /* 1 var */) = 0`], [600, 601, 605], allowed), /ran 2 times, not once/);
  assert.match(judged(probe(`["${OVERRIDE}", "server"]`), [600, 601], allowed), /engine 601 ran .*cua-engine server/);
  assert.match(judged([], [600], allowed), /\/r\/outdated\/cua-engine --version ran 0 times, not once/);
  assert.match(execRoleProblems(null, {helper: '/h/helper', allowed: []}).join('; '), /no trace/);
});

const doctorRefused = ({engine = `the vendor's engine is selected (CUA_NATIVE_ENGINE=vendor), and every Linux computer session is refused (engine_retired; see repl.host): ${RETIRED.message}; ${RETIRED.hint}; in this home: the pinned engine`,
  repl = `refused (engine_retired): ${RETIRED.message}; ${RETIRED.hint}. The profile listing (browser only): cua host (linux) on Node 24.22.0: x.`} = {}) =>
  ({ok: false, checks: [row('engine', 'fail', engine), row('repl.host', 'fail', repl)]});

test('doctor under a vendor source fails its engine and repl.host rows with that source\'s sentence and the hint', () => {
  assert.deepEqual(doctorRefusalProblems(doctorRefused(), RETIRED), []);
});

test('negative control: a row that passes, a sentence one word off, a missing hint or no doctor report fails doctor\'s refusal', () => {
  assert.match(doctorRefusalProblems({...doctorRefused(), checks: [row('engine', 'pass', RETIRED.message), doctorRefused().checks[1]]}, RETIRED).join('; '), /the engine row is pass, not fail/);
  assert.match(doctorRefusalProblems(doctorRefused({repl: `refused (engine_retired): ${RETIRED.message.replace('only one', 'one')}; ${RETIRED.hint}.`}), RETIRED).join('; '), /repl\.host does not carry the sentence and the hint/);
  assert.match(doctorRefusalProblems(doctorRefused({engine: `refused (engine_retired): ${RETIRED.message}; in this home`}), RETIRED).join('; '), /engine does not carry the sentence and the hint/);
  assert.match(doctorRefusalProblems(null, RETIRED).join('; '), /no doctor report/);
});

const INSTALL_RETIRED = retiredMessage({sources: ['variable'], settings: SETTINGS, installer: INSTALLER_13, after: 'install'});
const installedReport = (o = {}) => ({ok: false, release: RELEASE, changed: false, modules: {changed: false}, sandboxHelper: {changed: false}, node: {changed: false}, engine: {changed: false},
  pointer: {previous: RELEASE, current: RELEASE, changed: false}, retired: [], error: {code: 'engine_retired', message: INSTALL_RETIRED}, ...o});

test('cua install under the variable: every part in place, a nonzero exit with the install\'s sentence and no hint', () => {
  assert.deepEqual(retiredInstallProblems({exit: 1, report: installedReport()}, {message: INSTALL_RETIRED, release: RELEASE}), []);
});

test('negative control: exit 0, a failed part, another sentence, a hint, or no report fails the install under the variable', () => {
  const judged = (o, exit = 1) => retiredInstallProblems({exit, report: o === null ? null : installedReport(o)}, {message: INSTALL_RETIRED, release: RELEASE}).join('; ');
  assert.match(judged({}, 0), /exited 0/);
  assert.match(judged({node: {failed: {code: 'download_failed', message: 'x'}}}), /node was not placed/);
  assert.match(judged({error: {code: 'engine_retired', message: INSTALL_RETIRED.replace('otherwise ', '')}}), /its sentence is not the literal/);
  assert.match(judged({error: {code: 'engine_retired', message: INSTALL_RETIRED, hint: 'run `x`'}}), /a hint/);
  assert.match(judged({pointer: {current: '26.928.40906-linux-x64'}}), /the pointer is 26\.928/);
  assert.match(judged(null), /printed no report/);
});

test('the retired tree\'s sentence: the path, the size as the driver counts it, the record\'s date, and both checks', () => {
  assert.equal(retiredSentence({path: R6, bytes: 211063820, installedAt: '2026-10-28T09:10:11.000Z'}), `cua 0.30.0 no longer uses the vendor's release at ${R6} for sessions: 211.1 MB as it is now, `
    + 'where a cua install recorded placing it on 2026-10-28. cua leaves it in place and has not checked what it holds. Before deleting it by hand, check that no older cua '
    + '(another checkout on this home) still runs from it, and for files added to it');
  assert.match(retiredSentence({path: R6, bytes: 99_999, installedAt: '2026-10-28T09:10:11.000Z'}), /: 99999 bytes as it is now/);
});

const TREE = {release: '26.928.40906-linux-x64', path: R6, bytes: 211063820, installedAt: '2026-10-28T09:10:11.000Z', source: 'download'};

test('doctor and install report the one recorded release with the driver\'s count; doctor\'s row is a skip carrying the sentence', () => {
  const report = {ok: true, retired: [TREE], checks: [row('runtime.leftovers'), row('runtime.retired', 'skip', retiredSentence(TREE)), row('display')]};
  assert.deepEqual(retiredReportProblems(report.retired, {expected: [TREE]}), []);
  assert.deepEqual(doctorRowsProblems(report, {retired: TREE, reference: {checks: [row('runtime.leftovers'), row('display')]}}), []);
});

test('negative control: a report whose bytes are off by one, another date, a second release, a row not skip, a sentence one word off, rows unlike E0\'s, or no report fails', () => {
  assert.match(retiredReportProblems([{...TREE, bytes: TREE.bytes + 1}], {expected: [TREE]}).join('; '), /bytes 211063821, not 211063820/);
  assert.match(retiredReportProblems([{...TREE, installedAt: '2026-10-29T00:00:00.000Z'}], {expected: [TREE]}).join('; '), /installedAt/);
  assert.match(retiredReportProblems([TREE, {...TREE, release: '26.928.40906-linux-arm64'}], {expected: [TREE]}).join('; '), /2 releases, not 1/);
  assert.match(retiredReportProblems(undefined, {expected: []}).join('; '), /no retired list/);
  const rows = (status, detail = retiredSentence(TREE), extra = []) => ({ok: true, retired: [TREE], checks: [row('runtime.leftovers'), row('runtime.retired', status, detail), row('display'), ...extra]});
  const judged = (report, reference = {checks: [row('runtime.leftovers'), row('display')]}) => doctorRowsProblems(report, {retired: TREE, reference}).join('; ');
  assert.match(judged(rows('warn')), /runtime\.retired is warn, not skip/);
  assert.match(judged(rows('skip', retiredSentence(TREE).replace('in place', 'there'))), /runtime\.retired's sentence is not the literal/);
  assert.match(judged(rows('skip', retiredSentence({...TREE, bytes: TREE.bytes + 100_000}))), /runtime\.retired's sentence is not the literal/);
  assert.match(judged(rows('skip'), {checks: [row('runtime.leftovers'), row('display', 'warn')]}), /display is pass, not E0's warn/);
  assert.match(judged(rows('skip', undefined, [row('runtime.vendor')])), /a row named runtime\.vendor/);
  assert.match(judged({...rows('skip'), checks: [row('runtime.leftovers'), row('display')]}), /no runtime\.retired row/);
  assert.match(judged({...rows('skip'), ok: false}), /doctor is not ok/);
  assert.match(judged(null), /no doctor report/);
  // With no recorded release, a runtime.retired row or a retired entry is the failure.
  assert.match(doctorRowsProblems(rows('skip'), {retired: null}).join('; '), /a runtime\.retired row/);
  assert.deepEqual(doctorRowsProblems({ok: true, retired: [], checks: [row('display')]}, {retired: null}), []);
});

test('the install\'s line: §3.3\'s sentence exactly once, and the run\'s added entries named nowhere', () => {
  const lines = ['current.json names r already', retiredSentence(TREE), 'sessions here...'];
  assert.deepEqual(retiredLineProblems({out: lines.join('\n'), err: ''}, {sentence: retiredSentence(TREE), unnamed: ['m6b-added-dir', 'm6b-added-file']}), []);
});

test('negative control: a line one word off, the line twice, an added entry named, or no output fails the install\'s line', () => {
  const judged = (out, err = '') => retiredLineProblems({out, err}, {sentence: retiredSentence(TREE), unnamed: ['m6b-added-dir', 'm6b-added-file']}).join('; ');
  assert.match(judged(retiredSentence(TREE).replace('hand', 'command')), /printed the sentence 0 times, not once/);
  assert.match(judged(`${retiredSentence(TREE)}\n${retiredSentence(TREE)}`), /2 times/);
  assert.match(judged(retiredSentence(TREE), 'warning: m6b-added-file is not a release'), /names m6b-added-file/);
  assert.match(judged(null), /no output/);
});

test('a tree\'s snapshot: every entry\'s kind, mode, size, mtime, link target and file hash; one file changed is a difference', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua-snapshot-'));
  try {
    mkdirSync(join(dir, 'a'));
    writeFileSync(join(dir, 'a', 'f'), 'one');
    symlinkSync('a/f', join(dir, 'l'));
    const before = treeSnapshot(dir);
    assert.deepEqual(before.entries.map(e => [e.path, e.kind]), [['.', 'directory'], ['a', 'directory'], ['a/f', 'file'], ['l', 'link']]);
    assert.deepEqual(snapshotProblems(before, treeSnapshot(dir)), []);
    // One file's bytes and mtime changed.
    const stamp = new Date('2026-01-01T00:00:00Z');
    writeFileSync(join(dir, 'a', 'f'), 'two');
    utimesSync(join(dir, 'a', 'f'), stamp, stamp);
    assert.match(snapshotProblems(before, treeSnapshot(dir)).join('; '), /a\/f: sha256 .*mtime/);
    writeFileSync(join(dir, 'new'), '');
    assert.match(snapshotProblems(before, treeSnapshot(dir)).join('; '), /new was added/);
    rmSync(join(dir, 'l'));
    assert.match(snapshotProblems(before, treeSnapshot(dir)).join('; '), /l was removed/);
    assert.match(snapshotProblems(null, before).join('; '), /no snapshot/);
    assert.match(snapshotProblems(before, treeSnapshot(join(dir, 'absent'))).join('; '), /no snapshot/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('the second install changes nothing: every part changed: false, the pointer kept, the same retired list', () => {
  const report = installedReport({ok: true, error: undefined, retired: [TREE]});
  assert.deepEqual(reinstallProblems({exit: 0, report}, {retired: [TREE]}), []);
});

test('negative control: a part changed, an absent changed, a failed part, another retired list, a nonzero exit or no report fails the second install', () => {
  const judged = (o, exit = 0) => reinstallProblems({exit, report: o === null ? null : installedReport({ok: true, error: undefined, retired: [TREE], ...o})}, {retired: [TREE]}).join('; ');
  assert.match(judged({engine: {changed: true}}), /engine changed: true, not false/);
  assert.match(judged({node: {}}), /node changed: undefined, not false/);
  assert.match(judged({modules: {failed: {code: 'x'}}}), /modules changed: undefined/);
  assert.match(judged({pointer: {changed: true}}), /pointer changed: true/);
  assert.match(judged({changed: true}), /the install changed: true/);
  assert.match(judged({retired: []}), /0 releases, not 1/);
  assert.match(judged({}, 1), /exited 1/);
  assert.match(judged(null), /printed no report/);
});

test('a copy that fails its record is named by neither: retired empty and no runtime.retired row', () => {
  assert.deepEqual(notNamedProblems({exit: 0, report: {ok: true, retired: []}, doctor: {ok: true, retired: [], checks: [row('display')]}}), []);
});

test('negative control: a copy named by install or by doctor, a failed install, or a missing report fails', () => {
  const doc = {ok: true, retired: [], checks: [row('display')]};
  assert.match(notNamedProblems({exit: 0, report: {ok: true, retired: [TREE]}, doctor: doc}).join('; '), /install named 26\.928\.40906-linux-x64/);
  assert.match(notNamedProblems({exit: 0, report: {ok: true, retired: []}, doctor: {...doc, checks: [row('runtime.retired', 'skip', 'x')]}}).join('; '), /a runtime\.retired row/);
  assert.match(notNamedProblems({exit: 0, report: {ok: true, retired: []}, doctor: {...doc, retired: [TREE]}}).join('; '), /doctor named 26\.928/);
  assert.match(notNamedProblems({exit: 1, report: {ok: false, retired: []}, doctor: doc}).join('; '), /install exited 1/);
  assert.match(notNamedProblems({exit: 0, report: null, doctor: doc}).join('; '), /printed no report/);
  assert.match(notNamedProblems({exit: 0, report: {ok: true, retired: []}, doctor: null}).join('; '), /no doctor report/);
});

test('E0\'s home: no runtimes/, no line naming a vendor release, doctor\'s retired empty with no runtime.retired row', () => {
  assert.deepEqual(emptyHomeProblems({runtimes: 'ENOENT', out: 'installed cua\'s Linux engine 0.4.5', doctor: {retired: [], checks: [row('display')]}}), []);
});

test('negative control: a runtimes/ made, a line naming the vendor\'s release, a runtime.retired row, a retired entry or no doctor fails E0\'s home', () => {
  const judged = o => emptyHomeProblems({runtimes: 'ENOENT', out: '', doctor: {retired: [], checks: []}, ...o}).join('; ');
  assert.match(judged({runtimes: 'directory'}), /runtimes\/ is a directory/);
  assert.match(judged({out: retiredSentence(TREE)}), /a line names a vendor release/);
  assert.match(judged({doctor: {retired: [], checks: [row('runtime.retired', 'skip')]}}), /a runtime\.retired row/);
  assert.match(judged({doctor: {retired: [TREE], checks: []}}), /retired lists 1/);
  assert.match(judged({doctor: null}), /no doctor report/);
  assert.match(judged({out: null}), /no output/);
});

test('item 9: file says the engine is statically linked; anything else, or nothing, fails', () => {
  assert.deepEqual(staticEngineProblems('/h/engine/linux/cua-engine: ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), static-pie linked, stripped'), []);
  assert.deepEqual(staticEngineProblems('/h/cua-engine: ELF 64-bit LSB executable, ARM aarch64, version 1 (SYSV), statically linked, stripped'), []);
  assert.match(staticEngineProblems('/h/cua-engine: ELF 64-bit LSB pie executable, x86-64, dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2').join('; '), /not statically linked/);
  assert.match(staticEngineProblems('').join('; '), /file said nothing/);
});
