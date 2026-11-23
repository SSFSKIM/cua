// The Linux fixtures' shared confinement step (scripts/accept/linux-confinement.mjs; #171 M6a, T6): its targets come
// from the run's own display and bus, its positive controls must connect, the kernel must be refused on every target,
// the fixture's listeners must have accepted the controls and nothing else, and the kernel must run under the pinned
// helper. Each judge has its negative control here: a kernel that connects, a listener that accepted, a control that
// failed, a kernel found outside the helper.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {busSocket, confinementTargets, confinementVerdict, connectOutcome, kernelAncestry, kernelCell, kernelOutcomes, openListeners, TARGETS, xSocket} from '../scripts/accept/linux-confinement.mjs';

test('the bus socket is parsed from the address: a path, an abstract name, the first usable of several, or none', () => {
  assert.deepEqual(busSocket('unix:path=/tmp/dbus-AbC,guid=0123'), {path: '/tmp/dbus-AbC'});
  assert.deepEqual(busSocket('unix:abstract=/tmp/dbus-XyZ,guid=0123'), {path: '\0/tmp/dbus-XyZ'});
  assert.deepEqual(busSocket('tcp:host=127.0.0.1,port=1;unix:path=/run/user/1/bus'), {path: '/run/user/1/bus'});
  assert.deepEqual(busSocket('unix:path=/tmp/a%2cb,guid=1'), {path: '/tmp/a,b'});
  assert.equal(busSocket('tcp:host=127.0.0.1,port=1'), null);
  assert.equal(busSocket(undefined), null);
});

test('the X socket is the display number\'s, whatever the host part and screen', () => {
  assert.equal(xSocket(':99'), '/tmp/.X11-unix/X99');
  assert.equal(xSocket(':12.0'), '/tmp/.X11-unix/X12');
  assert.equal(xSocket('localhost:7'), '/tmp/.X11-unix/X7');
  assert.equal(xSocket(undefined), null);
});

test('the targets are the X socket, the bus\'s actual socket and the two listeners; a missing one is named', () => {
  const listeners = {tcp: {host: '127.0.0.1', port: 4242}, unix: {path: '/tmp/s.sock'}};
  const targets = confinementTargets({env: {DISPLAY: ':99', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/tmp/dbus-1,guid=2'}, listeners});
  assert.deepEqual(Object.keys(targets), TARGETS);
  assert.deepEqual(targets, {x11: {path: '/tmp/.X11-unix/X99'}, bus: {path: '/tmp/dbus-1'}, tcp: {host: '127.0.0.1', port: 4242}, unix: {path: '/tmp/s.sock'}});
  // The bus falls back to XDG_RUNTIME_DIR's, as the runtime's own lookup does.
  assert.deepEqual(confinementTargets({env: {DISPLAY: ':1', XDG_RUNTIME_DIR: '/run/user/7'}, listeners}).bus, {path: '/run/user/7/bus'});
  assert.throws(() => confinementTargets({env: {DBUS_SESSION_BUS_ADDRESS: 'unix:path=/b'}, listeners}), /no X display/);
  assert.throws(() => confinementTargets({env: {DISPLAY: ':1', DBUS_SESSION_BUS_ADDRESS: 'tcp:host=h,port=1'}, listeners}), /no session bus socket/);
});

test('the listeners count what they accept; a connect outcome is ok or the error\'s code', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua-confinement-test-'));
  const listeners = await openListeners(dir);
  try {
    assert.deepEqual(listeners.accepted(), {tcp: 0, unix: 0});
    assert.equal(await connectOutcome(listeners.tcp), 'ok');
    assert.equal(await connectOutcome(listeners.unix), 'ok');
    assert.equal(await connectOutcome({path: join(dir, 'absent.sock')}), 'ENOENT');
    await new Promise(r => setTimeout(r, 100));
    assert.deepEqual(listeners.accepted(), {tcp: 1, unix: 1});
  } finally {
    await listeners.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('the kernel cell is one cell that names every target and reports each outcome as JSON', () => {
  const targets = {x11: {path: '/tmp/.X11-unix/X99'}, bus: {path: '\0/tmp/dbus-1'}, tcp: {host: '127.0.0.1', port: 4242}, unix: {path: '/tmp/s.sock'}};
  const cell = kernelCell(targets);
  for (const t of TARGETS) assert.match(cell, new RegExp(`"${t}"`));
  assert.match(cell, /\\u0000\/tmp\/dbus-1/);
  assert.doesNotThrow(() => new Function(`return (async () => {${cell}})`));
  assert.deepEqual(kernelOutcomes('noise\n{"confinement":{"x11":"EACCES","bus":"EPERM","tcp":"ECONNREFUSED","unix":"ENOENT"}}'),
    {x11: 'EACCES', bus: 'EPERM', tcp: 'ECONNREFUSED', unix: 'ENOENT'});
  assert.equal(kernelOutcomes('no report'), null);
});

const helper = '/home/run/.local/share/cua/sandbox/rust-v0.163.0/codex-linux-sandbox';
const passing = () => ({
  controls: {x11: 'ok', bus: 'ok', tcp: 'ok', unix: 'ok'},
  accepted: {afterControls: {tcp: 1, unix: 1}, afterKernel: {tcp: 1, unix: 1}},
  kernel: {x11: 'EACCES', bus: 'EPERM', tcp: 'ENETUNREACH', unix: 'ENOENT'},
  ancestry: {kernel: 4321, underServe: true, helper, ancestors: [{pid: 4320, comm: 'bwrap', exe: '/usr/bin/bwrap'}, {pid: 4319, comm: 'codex-linux-sa', exe: helper}, {pid: 4300, comm: 'node', exe: '/usr/bin/node'}]},
});

test('the verdict passes when every control connects, the kernel is refused on all four, the listeners saw only the controls and the kernel runs under the pinned helper', () => {
  assert.deepEqual(confinementVerdict(passing()), {pass: true, problems: []});
});

test('negative control: a kernel that connects to any one target fails the step', () => {
  for (const t of TARGETS) {
    const run = passing();
    run.kernel[t] = 'ok';
    const verdict = confinementVerdict(run);
    assert.equal(verdict.pass, false, t);
    assert.match(verdict.problems.join('; '), new RegExp(`the kernel connected to ${t}`));
  }
});

test('negative control: a listener that accepted anything past the controls fails, even when the kernel says it was refused', () => {
  for (const t of ['tcp', 'unix']) {
    const run = passing();
    run.accepted.afterKernel[t] = 2;
    const verdict = confinementVerdict(run);
    assert.equal(verdict.pass, false, t);
    assert.match(verdict.problems.join('; '), new RegExp(`the ${t} listener accepted 1 connection past the controls`));
  }
});

test('negative control: a control that did not connect, or a listener that did not count it, leaves the kernel\'s refusal meaningless and fails', () => {
  for (const t of TARGETS) {
    const run = passing();
    run.controls[t] = 'ECONNREFUSED';
    assert.match(confinementVerdict(run).problems.join('; '), new RegExp(`the positive control could not connect to ${t} \\(ECONNREFUSED\\)`));
  }
  const run = passing();
  run.accepted.afterControls.unix = 0;
  run.accepted.afterKernel.unix = 0;
  assert.match(confinementVerdict(run).problems.join('; '), /the unix listener counted 0 control connections, not 1/);
});

test('negative control: a kernel report that is missing or partial fails', () => {
  const run = passing();
  run.kernel = null;
  assert.match(confinementVerdict(run).problems.join('; '), /the kernel's cell reported no outcomes/);
  const partial = passing();
  delete partial.kernel.bus;
  assert.match(confinementVerdict(partial).problems.join('; '), /the kernel reported nothing for bus/);
});

test('negative control: a kernel not found, not the serve\'s, or without the pinned helper or bubblewrap above it fails', () => {
  const absent = passing();
  absent.ancestry = {kernel: null, underServe: false, helper, ancestors: []};
  assert.match(confinementVerdict(absent).problems.join('; '), /no kernel process was found/);
  const foreign = passing();
  foreign.ancestry.underServe = false;
  assert.match(confinementVerdict(foreign).problems.join('; '), /not a descendant of this session's cua serve/);
  const unhelped = passing();
  unhelped.ancestry.ancestors = unhelped.ancestry.ancestors.filter(a => a.exe !== helper);
  assert.match(confinementVerdict(unhelped).problems.join('; '), /the pinned helper .* is not among the kernel's parents/);
  const otherHelper = passing();
  otherHelper.ancestry.ancestors[1].exe = '/elsewhere/codex-linux-sandbox';
  assert.match(confinementVerdict(otherHelper).problems.join('; '), /the pinned helper .* is not among the kernel's parents/);
  const unwrapped = passing();
  unwrapped.ancestry.ancestors = unwrapped.ancestry.ancestors.filter(a => a.comm !== 'bwrap');
  assert.match(confinementVerdict(unwrapped).problems.join('; '), /no bwrap among the kernel's parents/);
});

test('the kernel is found by its own command line, Node running kernel.mjs, never the helper or bubblewrap that carry the same words', () => {
  const table = new Map([
    [50, {ppid: 1, comm: 'node', argv: ['/usr/bin/node', '/repo/bin/cua.mjs', 'serve']}],
    [51, {ppid: 50, comm: 'node', argv: ['/h/node/bin/node', '/repo/src/repl-host/supervisor.mjs']}],
    [52, {ppid: 51, comm: 'codex-linux-sa', argv: [helper, '--permission-profile', '{}', '--', '/h/node/bin/node', '/repo/src/repl-host/kernel.mjs']}],
    [53, {ppid: 52, comm: 'bwrap', argv: ['bwrap', '--', helper, '--', '/h/node/bin/node', '/repo/src/repl-host/kernel.mjs']}],
    [54, {ppid: 53, comm: 'MainThread', argv: ['/h/node/bin/node', '/repo/src/repl-host/kernel.mjs']}],
    // Another session's kernel, not under this serve.
    [60, {ppid: 1, comm: 'MainThread', argv: ['/h/node/bin/node', '/repo/src/repl-host/kernel.mjs']}],
  ]);
  const exe = pid => ({52: helper, 53: '/usr/bin/bwrap'})[pid] ?? null;
  const found = kernelAncestry({serve: 50, helper, table, exe});
  assert.equal(found.kernel, 54);
  assert.equal(found.underServe, true);
  assert.deepEqual(found.ancestors.map(a => [a.pid, a.comm, a.exe]), [[53, 'bwrap', '/usr/bin/bwrap'], [52, 'codex-linux-sa', helper], [51, 'node', '/h/node/bin/node'], [50, 'node', '/usr/bin/node']]);
  assert.equal(kernelAncestry({serve: 99, helper, table, exe}).underServe, false);
});
