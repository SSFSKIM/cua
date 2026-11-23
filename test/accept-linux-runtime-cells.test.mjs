// Acceptance 12's driver judges (#171 M6a, T6; the M6a pre-flight §5.2, the cell table): the process watch around each
// fixture (which engine answered, none, the vendor's, nothing launched), E0's install, a refused open's sentence, the
// traced runs, and U2's upgrade. Each judge has its negative control here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CELLS, engineRowProblems, fixtureProblems, installProblems, parseRefusal, pinsChanged, refusalProblems, traceProblems, upgradeProblems} from '../scripts/accept/linux-runtime-cells.mjs';
import {cuaEngineProblems, foldSample, newWatch, noEngineProblems, nothingLaunchedProblems, vendorEngineProblems, watchRecord} from '../scripts/accept/linux-runtime-watch.mjs';

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
  assert.deepEqual(record.replHost, [{pid: 20, role: 'trusted-worker'}, {pid: 30, role: 'kernel'}]);
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

test('a fixture passes only with exit 0 and its own status PASS; each failed step is named', () => {
  assert.deepEqual(fixtureProblems({exit: 0, report: {status: 'PASS', steps: [{name: 'a', status: 'PASS'}]}}), []);
  assert.match(fixtureProblems({exit: 1, report: {status: 'FAIL', steps: [{name: 'bind', status: 'FAIL'}]}}).join('; '), /exited 1.*bind failed/);
  assert.match(fixtureProblems({exit: 0, report: {status: 'FAIL', steps: []}}).join('; '), /its status is FAIL/);
  assert.match(fixtureProblems({exit: null, signal: 'SIGTERM', report: null}).join('; '), /SIGTERM.*no report/);
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

test('an open refused with its code, naming this cua\'s installer and the release, passes', () => {
  assert.deepEqual(refusalProblems({exit: 1, initialized: false, stderr: refused()}, {code: 'runtime_not_installed', installer: INSTALLER, release: RELEASE}), []);
});

test('negative control: an open that was answered, another code, another installer or no release named fails the refusal', () => {
  assert.match(refusalProblems({exit: 0, initialized: true, stderr: ''}, {code: 'runtime_not_installed', installer: INSTALLER}).join('; '), /the open was answered/);
  assert.match(refusalProblems({exit: 1, initialized: false, stderr: refused('engine_not_installed')}, {code: 'runtime_not_installed', installer: INSTALLER}).join('; '), /refused engine_not_installed, not runtime_not_installed/);
  assert.match(refusalProblems({exit: 1, initialized: false, stderr: refused().replaceAll(INSTALLER, 'cua install')}, {code: 'runtime_not_installed', installer: INSTALLER}).join('; '), /does not name .*node \/repo\/bin\/cua\.mjs install/);
  assert.match(refusalProblems({exit: 1, initialized: false, stderr: refused().replaceAll(RELEASE, 'r')}, {code: 'runtime_not_installed', installer: INSTALLER, release: RELEASE}).join('; '), /does not name the release/);
  assert.match(refusalProblems({exit: 1, initialized: false, stderr: 'killed\n'}, {code: 'runtime_not_installed', installer: INSTALLER}).join('; '), /no refusal sentence/);
});

const summary = (o = {}) => ({serve: 101, workers: [{pid: 102, underServe: true}], helpers: [104], kernels: [{pid: 106, underHelper: true, underServe: true, callsAfterExec: 300, ...o.kernel}],
  runtimes: {calls: 0, unresolved: 0, complete: true, ...o.runtimes}, processes: 40});

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
