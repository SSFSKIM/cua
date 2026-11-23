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
import {busSocket, confinementTargets, confinementVerdict, connectOutcome, kernelAncestry, kernelCell, kernelReport, openListeners, REFUSALS, TARGETS, xSocket} from '../scripts/accept/linux-confinement.mjs';

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
  // The cell names itself: its pid in its own namespace and its start time, which bind it to one host process. A kernel
  // cell has no `process` global (the first live run reported no identity for it), so both come from /proc/self/stat.
  assert.match(cell, /\/proc\/self\/stat/);
  assert.doesNotMatch(cell, /\bprocess\b/);
  assert.deepEqual(kernelReport('noise\n{"confinement":{"x11":"EACCES","bus":"EPERM","tcp":"ECONNREFUSED","unix":"ENOENT"},"identity":{"pid":2,"starttime":"881234"}}'),
    {outcomes: {x11: 'EACCES', bus: 'EPERM', tcp: 'ECONNREFUSED', unix: 'ENOENT'}, identity: {pid: 2, starttime: '881234'}});
  assert.deepEqual(kernelReport('no report'), {outcomes: null, identity: null});
  assert.deepEqual(kernelReport('{"confinement":{"x11":"EPERM"},"identity":{"pid":"2"}}').identity, null);
});

const helper = '/home/run/.local/share/cua/sandbox/rust-v0.163.0/codex-linux-sandbox';
const passing = () => ({
  controls: {x11: 'ok', bus: 'ok', tcp: 'ok', unix: 'ok'},
  accepted: {afterControls: {tcp: 1, unix: 1}, afterKernel: {tcp: 1, unix: 1}},
  kernel: {x11: 'EACCES', bus: 'EPERM', tcp: 'ENETUNREACH', unix: 'ENOENT'},
  ancestry: {kernel: 4321, underServe: true, helper, ancestors: [{pid: 4320, comm: 'bwrap', exe: '/usr/bin/bwrap'}, {pid: 4319, comm: 'codex-linux-sa', exe: helper}, {pid: 4300, comm: 'node', exe: '/usr/bin/node'}]},
});

test('negative control: a refusal is proved only by an expected errno for its target; a timeout, a generic error or a malformed value proves none', () => {
  assert.equal(REFUSALS.tcp.includes('ENETUNREACH'), true);
  assert.equal(REFUSALS.x11.includes('ENETUNREACH'), false);
  for (const t of TARGETS) {
    for (const bad of ['timeout', 'error', null, undefined, '', 'EINVAL', 42, {code: 'EPERM'}]) {
      const run = passing();
      run.kernel[t] = bad;
      const verdict = confinementVerdict(run);
      assert.equal(verdict.pass, false, `${t}: ${JSON.stringify(bad)}`);
      assert.match(verdict.problems.join('; '), new RegExp(`the kernel's outcome for ${t} \\(.*\\) proves no refusal`), `${t}: ${JSON.stringify(bad)}`);
    }
  }
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
  assert.match(confinementVerdict(partial).problems.join('; '), /the kernel's outcome for bus \(undefined\) proves no refusal/);
});

test('negative control: a kernel not found, not the serve\'s, or without the pinned helper or bubblewrap above it fails', () => {
  const absent = passing();
  absent.ancestry = {kernel: null, underServe: false, helper, ancestors: [], reason: 'no sampled process matches the identity the kernel\'s cell reported'};
  assert.match(confinementVerdict(absent).problems.join('; '), /the kernel that answered was not found: no sampled process matches/);
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

test('negative control: an executable that could not be read never certifies the helper or bubblewrap, whatever the name or argv says', () => {
  const unread = passing();
  unread.ancestry.ancestors[1].exe = null;
  assert.match(confinementVerdict(unread).problems.join('; '), /the pinned helper .* is not among the kernel's parents/);
  const unreadBwrap = passing();
  unreadBwrap.ancestry.ancestors[0].exe = null;
  assert.match(confinementVerdict(unreadBwrap).problems.join('; '), /no bwrap among the kernel's parents/);
});

// The sampler's view (50 ms samples of /proc): the serve (50) and its tree, with two kernels under it, and one kernel
// of another session. Each process: its parent, comm, argv, executable (null when unreadable), its pid in its innermost
// PID namespace and its start time.
const node = (ppid, script, nspid, starttime, exe = '/h/node/bin/node') => ({ppid, comm: 'MainThread', argv: ['/h/node/bin/node', `/repo/src/repl-host/${script}`], exe, nspid, starttime});
const sample = () => new Map([
  [50, {ppid: 1, comm: 'node', argv: ['/usr/bin/node', '/repo/bin/cua.mjs', 'serve'], exe: '/usr/bin/node', nspid: 50, starttime: '100'}],
  [51, node(50, 'supervisor.mjs', 51, '110')],
  [52, {ppid: 51, comm: 'codex-linux-sa', argv: [helper, '--permission-profile', '{}', '--', '/h/node/bin/node', '/repo/src/repl-host/kernel.mjs'], exe: helper, nspid: 52, starttime: '120'}],
  [53, {ppid: 52, comm: 'bwrap', argv: ['bwrap', '--', helper, '--', '/h/node/bin/node', '/repo/src/repl-host/kernel.mjs'], exe: '/usr/bin/bwrap', nspid: 1, starttime: '121'}],
  [54, {ppid: 53, comm: 'codex-linux-sa', argv: ['codex-linux-sandbox', '--apply-seccomp-then-exec'], exe: helper, nspid: 1, starttime: '122'}],
  [55, node(54, 'kernel.mjs', 2, '123')],
  // A second kernel of the same serve (a restarted one), not the one that answered.
  [56, node(50, 'kernel.mjs', 2, '999')],
  // Another session's kernel, outside this serve, with the same identity as the one that answered.
  [60, node(1, 'kernel.mjs', 2, '123')],
]);

test('the kernel is the one that answered the cell: bound by its namespace pid and start time, under this serve, never the first match or the helper and bwrap that carry the same words', () => {
  const found = kernelAncestry({serve: 50, helper, identity: {pid: 2, starttime: '123'}, samples: [sample()]});
  assert.equal(found.kernel, 55);
  assert.equal(found.underServe, true);
  assert.deepEqual(found.ancestors.map(a => [a.pid, a.comm, a.exe]), [[54, 'codex-linux-sa', helper], [53, 'bwrap', '/usr/bin/bwrap'], [52, 'codex-linux-sa', helper], [51, 'MainThread', '/h/node/bin/node'], [50, 'node', '/usr/bin/node']]);
  assert.deepEqual(confinementVerdict({...passing(), ancestry: found}), {pass: true, problems: []});
});

test('negative control: a kernel that reported no identity, or whose identity matches no sampled process under this serve, is not found, and nothing outside the serve stands in', () => {
  for (const identity of [null, {pid: 7, starttime: '123'}, {pid: 2, starttime: '124'}]) {
    const found = kernelAncestry({serve: 50, helper, identity, samples: [sample()]});
    assert.equal(found.kernel, null, JSON.stringify(identity));
    assert.match(confinementVerdict({...passing(), ancestry: found}).problems.join('; '), /the kernel that answered was not found/);
  }
  // The other session's kernel matches the identity but lies outside this serve: it never stands in.
  const elsewhere = sample();
  elsewhere.delete(55);
  const found = kernelAncestry({serve: 50, helper, identity: {pid: 2, starttime: '123'}, samples: [elsewhere]});
  assert.equal(found.kernel, null);
  assert.deepEqual(found.ancestors, []);
});

test('a kernel seen in an earlier sample is still bound, with the executables read while it lived', () => {
  const later = new Map([...sample()].filter(([pid]) => pid < 52));
  const found = kernelAncestry({serve: 50, helper, identity: {pid: 2, starttime: '123'}, samples: [sample(), later]});
  assert.equal(found.kernel, 55);
  assert.equal(found.ancestors[0].exe, helper);
});
