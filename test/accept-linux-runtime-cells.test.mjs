// Acceptance 12's driver judges (#171 M6a, T6; the M6a pre-flight §5.2, the cell table): the process watch around each
// fixture (which engine answered, none, the vendor's, nothing launched), E0's install, a refused open's sentence, the
// traced runs, and U2's upgrade. Each judge has its negative control here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {APPROVED_OLDER, CELLS, FIXTURE_STEPS, boundaryProblems, engineRowProblems, fixtureProblems, inheritedOverrides, installProblems, launchedProblems, olderProblems, parsePhases, parseRefusal,
  pinsChanged, refusalProblems, reinstallProblems, runVerdict, traceProblems, upgradeProblems, witnessOf} from '../scripts/accept/linux-runtime-cells.mjs';
import {cuaEngineProblems, foldSample, newWatch, noEngineProblems, nothingLaunchedProblems, ownNodeProblems, sampleTree, vendorEngineProblems, watchRecord} from '../scripts/accept/linux-runtime-watch.mjs';

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
  assert.deepEqual(record.replHost, [{pid: 20, role: 'trusted-worker', exe: '/n/bin/node'}, {pid: 30, role: 'kernel', exe: '/n/bin/node'}]);
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

test('the vendor\'s engine answered: this home\'s sky_linux behind the vendor service, and no cua-engine', () => {
  assert.deepEqual(vendorEngineProblems(watched([WORKER, sky()]), {bin: SKY, service: SERVICE}), []);
});

test('negative control: a cua-engine beside it, another sky_linux, another service, or none fails the vendor\'s engine', () => {
  assert.match(vendorEngineProblems(watched([WORKER, sky(), cuaEngine()]), {bin: SKY, service: SERVICE}).join('; '), /cua-engine 21 ran/);
  assert.match(vendorEngineProblems(watched([WORKER, sky('/elsewhere/sky_linux_x64')]), {bin: SKY, service: SERVICE}).join('; '), /no sky_linux .* ran this home's/);
  assert.match(vendorEngineProblems(watched([WORKER, sky(SKY, '/repo/src/services/engine/linux/service.mjs')]), {bin: SKY, service: SERVICE}).join('; '), /behind the vendor service/);
  assert.match(vendorEngineProblems(watched([WORKER]), {bin: SKY, service: SERVICE}).join('; '), /no sky_linux/);
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

test('the cell table is the pre-flight\'s, in its order, with the empty home\'s and the upgraded home\'s cells', () => {
  assert.deepEqual(CELLS.map(c => c.cell), ['E0', 'E1', 'E2', 'E3', 'E4', 'E5', 'U0', 'U1', 'U2', 'U3', 'U4', 'U5']);
  assert.deepEqual([...new Set(CELLS.map(c => c.home))], ['empty', 'upgraded']);
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
  const sources = {'linux-native': ['linux-native.mjs', 'linux-selection.mjs'], 'linux-text': ['linux-text.mjs'], 'linux-text --read-only': ['linux-text.mjs'], 'linux-browser-only': ['linux-browser-only.mjs']};
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
const doctor = (o = {}) => ({checks: ['runtime.installed', 'runtime.modules', 'runtime.node', 'sandbox.launcher', 'engine'].map(n => o[n] ?? row(n)),
  engine: {selected: 'cua', service: 'cua', installed: {version: '0.4.4', sha256: 'e'.repeat(64)}, ...o.engineReport}});

test('E0 passes: exit 0, the pointer the derived name, doctor\'s rows pass and the engine row shows the pin', () => {
  assert.deepEqual(installProblems({exit: 0, pointer: RELEASE, release: RELEASE, doctor: doctor(), pin: PIN, arch: 'x64'}), []);
});

test('negative control: a failed install, a vendor pointer, a failing row, or an engine not the pin\'s fails E0', () => {
  assert.match(installProblems({exit: 1, pointer: RELEASE, release: RELEASE, doctor: doctor(), pin: PIN, arch: 'x64'}).join('; '), /cua install exited 1/);
  assert.match(installProblems({exit: 0, pointer: '26.928.40906-linux-x64', release: RELEASE, doctor: doctor(), pin: PIN, arch: 'x64'}).join('; '), /the pointer names 26\.928\.40906-linux-x64/);
  assert.match(installProblems({exit: 0, pointer: RELEASE, release: RELEASE, doctor: doctor({'runtime.modules': row('runtime.modules', 'fail', 'sharp differs')}), pin: PIN, arch: 'x64'}).join('; '), /runtime\.modules is fail: sharp differs/);
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

test('an open refused with its code, naming this cua\'s installer and the release, passes', () => {
  assert.deepEqual(refusalProblems(attempt(), {code: 'runtime_not_installed', installer: INSTALLER, release: RELEASE}), []);
});

test('negative control: an open that was answered, another code, another installer or no release named fails the refusal', () => {
  assert.match(refusalProblems(attempt({exit: 0, replied: true, stderr: ''}), {code: 'runtime_not_installed', installer: INSTALLER}).join('; '), /initialize was answered/);
  assert.match(refusalProblems(attempt({stderr: refused('engine_not_installed')}), {code: 'runtime_not_installed', installer: INSTALLER}).join('; '), /refused engine_not_installed, not runtime_not_installed/);
  assert.match(refusalProblems(attempt({stderr: refused().replaceAll(INSTALLER, 'cua install')}), {code: 'runtime_not_installed', installer: INSTALLER}).join('; '), /does not name .*node \/repo\/bin\/cua\.mjs install/);
  assert.match(refusalProblems(attempt({stderr: refused().replaceAll(RELEASE, 'r')}), {code: 'runtime_not_installed', installer: INSTALLER, release: RELEASE}).join('; '), /does not name the release/);
  assert.match(refusalProblems(attempt({stderr: 'killed\n'}), {code: 'runtime_not_installed', installer: INSTALLER}).join('; '), /no refusal sentence/);
});

test('negative control (fix wave 1, #7): a JSON-RPC error reply, a signalled exit, an exit the driver forced, or undrained stderr fails the refusal', () => {
  const judged = o => refusalProblems(attempt(o), {code: 'runtime_not_installed', installer: INSTALLER, release: RELEASE}).join('; ');
  assert.match(judged({replied: true}), /initialize was answered/);
  assert.match(judged({exit: null, signal: 'SIGKILL'}), /ended by SIGKILL, not a nonzero exit of its own/);
  assert.match(judged({exit: 0}), /exited 0/);
  assert.match(judged({spontaneous: false}), /did not exit on its own/);
  assert.match(judged({drained: false}), /standard error was not drained/);
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

test('negative control (fix wave 1, #6): another older commit, a dirty checkout, a vendor release not the arch\'s pin, or one doctor does not verify fails the setup', () => {
  const good = {commit: APPROVED_OLDER, clean: true, exit: 0, vendorRelease: '26.928.40906-linux-x64', pinnedRelease: '26.928.40906-linux-x64', vendorRow: {status: 'pass'}, record: {sha256: 'a'}};
  assert.equal(APPROVED_OLDER, '0d19fdfadce47fc6ba88db180fb4845346c9be26');
  assert.deepEqual(olderProblems(good), []);
  assert.match(olderProblems({...good, commit: 'da7585c3'.padEnd(40, '0')}).join('; '), /is not the approved/);
  assert.match(olderProblems({...good, clean: false}).join('; '), /has local changes/);
  assert.match(olderProblems({...good, vendorRelease: 'cua-linux-x64-e0.4.4-n24.22.0-s0.163.0-mb71dc1f8185d'}).join('; '), /not the arch's pinned vendor release/);
  assert.match(olderProblems({...good, vendorRow: {status: 'fail', detail: 'signature'}}).join('; '), /runtime\.vendor is fail/);
  assert.match(olderProblems({...good, record: null}).join('; '), /no install\.json/);
});

test('negative control (fix wave 1, #6): U1\'s reinstall is a no-op only by all four explicit changed: false, the vendor record kept and no module tree', () => {
  const report = {ok: true, changed: false, sandboxHelper: {changed: false}, engine: {changed: false}, node: {changed: false}};
  const same = {before: {sha256: 'a', ino: 1, mtimeMs: 5}, after: {sha256: 'a', ino: 1, mtimeMs: 5}};
  assert.deepEqual(reinstallProblems({exit: 0, report, modules: false, vendorRecord: same}), []);
  assert.match(reinstallProblems({exit: 0, report: {...report, engine: {}}, modules: false, vendorRecord: same}).join('; '), /engine changed: undefined, not false/);
  assert.match(reinstallProblems({exit: 0, report: {...report, changed: true}, modules: false, vendorRecord: same}).join('; '), /the vendor release changed: true/);
  assert.match(reinstallProblems({exit: 0, report: null, modules: false, vendorRecord: same}).join('; '), /printed no report/);
  assert.match(reinstallProblems({exit: 0, report, modules: true, vendorRecord: same}).join('; '), /a modules\/ directory is there/);
  assert.match(reinstallProblems({exit: 0, report, modules: false, vendorRecord: {...same, after: {sha256: 'b', ino: 1, mtimeMs: 5}}}).join('; '), /install\.json is not the same file/);
});

test('Minor (a): a browser-only run\'s witnesses are kept relative to the module root, and anything outside it stays absolute', () => {
  const root = '/r/modules/b71d';
  const report = {imports: {selected: {pngjs: `${root}/node_modules/pngjs/lib/png.js`}, natives: [`${root}/node_modules/x.node`, '/elsewhere/y.node'],
    loaded: {playwright: {entry: `${root}/node_modules/playwright/index.js`, files: [`${root}/node_modules/playwright/index.js`, `${root}/node_modules/playwright-core/index.js`]}}}};
  const kernels = [{pid: 6, underServe: true, underHelper: true, opened: [`${root}/node_modules/pngjs/lib/png.js`]}];
  assert.deepEqual(witnessOf(report, {root, kernels}), {root, selected: {pngjs: 'node_modules/pngjs/lib/png.js'}, natives: ['node_modules/x.node', '/elsewhere/y.node'],
    playwright: {entry: 'node_modules/playwright/index.js', files: 2, outside: []}, opened: [{pid: 6, paths: ['node_modules/pngjs/lib/png.js']}]});
});

const upgrade = ({report, ...o} = {}) => ({exit: 0, report: {ok: true, release: RELEASE, pointer: {previous: '26.928.40906-linux-x64', current: RELEASE, changed: true}, modules: {changed: true},
  sandboxHelper: {changed: false}, node: {changed: false}, engine: {changed: false}, ...report}, pointer: RELEASE, vendorRelease: '26.928.40906-linux-x64', release: RELEASE,
expectChanged: {sandboxHelper: false, node: false, engine: false}, vendorRecord: {before: {sha256: 'a', ino: 1, mtimeMs: 5}, after: {sha256: 'a', ino: 1, mtimeMs: 5}}, ...o});

test('U2 passes: the pointer from the vendor name to the derived one, the tree placed, the shared parts unchanged, the vendor record the same file', () => {
  assert.deepEqual(upgradeProblems(upgrade()), []);
  // A part whose pin moved between the two cuas is expected to change.
  assert.deepEqual(upgradeProblems(upgrade({report: {engine: {changed: true}}, expectChanged: {sandboxHelper: false, node: false, engine: true}})), []);
});

test('negative control: a pointer not migrated, a part reinstalled, no tree, or a vendor record rewritten fails U2', () => {
  assert.match(upgradeProblems(upgrade({pointer: '26.928.40906-linux-x64'})).join('; '), /current\.json names 26\.928/);
  assert.match(upgradeProblems(upgrade({report: {pointer: {previous: null, current: RELEASE}}})).join('; '), /previous pointer null/);
  assert.match(upgradeProblems(upgrade({report: {node: {changed: true}}})).join('; '), /node changed: true, expected false/);
  assert.match(upgradeProblems(upgrade({report: {modules: {changed: false}}})).join('; '), /module tree was not placed/);
  assert.match(upgradeProblems(upgrade({vendorRecord: {before: {sha256: 'a', ino: 1, mtimeMs: 5}, after: {sha256: 'a', ino: 2, mtimeMs: 6}}})).join('; '), /install\.json is not the same file/);
  assert.match(upgradeProblems(upgrade({exit: 1})).join('; '), /exited 1/);
});

test('which parts the older cua shares with this one: the helper pin, the host\'s Node pin, the engine asset for the arch', () => {
  const pins = (engine = 'e', node = '{"v":1}', helper = '{"h":1}') => ({helper, node, engine: {assets: {x64: {sha256: engine}}}});
  assert.deepEqual(pinsChanged({head: pins(), older: pins(), arch: 'x64'}), {sandboxHelper: false, node: false, engine: false});
  assert.deepEqual(pinsChanged({head: pins('e'), older: pins('d', null), arch: 'x64'}), {sandboxHelper: false, node: true, engine: true});
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
