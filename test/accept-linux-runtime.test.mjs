// The M6a venue pilot's judges (#171 M6a, T6's wave-0 part; the M6a pre-flight §5.2, "The venue pilot"): doctor's four
// environment rows, the sandbox launcher's row, the strace reader that says whether `strace -f` followed the helper's
// children, and the four answers the pilot gives per leg. Each judge has its negative control here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ARTIFACT_FILES, ENVIRONMENT_ROWS, environmentVerdict, MANDATORY_STEPS, pilotAnswers, pilotVerdict, projectSmoke, rowVerdict} from '../scripts/accept/linux-runtime-pilot.mjs';
import {callKind, execArgv, summarizeTrace, traceVerdict} from '../scripts/accept/linux-trace.mjs';

const doctor = (overrides = {}) => ({checks: [
  {name: 'display', status: 'pass', detail: 'X display :99 has XTEST, Composite and XFIXES'},
  {name: 'accessibility.bus', status: 'pass', detail: 'AT-SPI is activatable'},
  {name: 'accessibility.enabled', status: 'pass', detail: 'IsEnabled is true'},
  {name: 'sandbox.userns', status: 'pass', detail: 'bubblewrap can create an unprivileged user namespace'},
  {name: 'sandbox.launcher', status: 'pass', detail: 'the pinned helper'},
].map(row => (overrides[row.name] ? {...row, ...overrides[row.name]} : row))});

test('the environment passes only when doctor\'s four environment rows all pass', () => {
  assert.deepEqual(ENVIRONMENT_ROWS, ['display', 'accessibility.bus', 'accessibility.enabled', 'sandbox.userns']);
  assert.deepEqual(environmentVerdict(doctor()), {pass: true, problems: [], rows: {display: 'pass', 'accessibility.bus': 'pass', 'accessibility.enabled': 'pass', 'sandbox.userns': 'pass'}});
});

test('negative control: a warn on accessibility.enabled stops the run, as a fail, a blocked or a missing row does', () => {
  const warned = environmentVerdict(doctor({'accessibility.enabled': {status: 'warn', detail: 'IsEnabled is false'}}));
  assert.equal(warned.pass, false);
  assert.match(warned.problems[0], /accessibility\.enabled is warn: IsEnabled is false/);
  assert.equal(environmentVerdict(doctor({'sandbox.userns': {status: 'blocked', detail: 'bwrap: setting up uid map: Permission denied'}})).pass, false);
  assert.equal(environmentVerdict(doctor({display: {status: 'fail', detail: 'DISPLAY is not set'}})).pass, false);
  const missing = environmentVerdict({checks: doctor().checks.filter(c => c.name !== 'accessibility.bus')});
  assert.equal(missing.pass, false);
  assert.match(missing.problems[0], /accessibility\.bus is missing/);
  assert.equal(environmentVerdict(null).pass, false);
});

test('one row\'s verdict: sandbox.launcher passes or names its status and detail', () => {
  assert.deepEqual(rowVerdict(doctor(), 'sandbox.launcher'), {pass: true, status: 'pass', detail: 'the pinned helper'});
  assert.deepEqual(rowVerdict(doctor({'sandbox.launcher': {status: 'fail', detail: 'sandbox_unavailable'}}), 'sandbox.launcher'), {pass: false, status: 'fail', detail: 'sandbox_unavailable'});
  assert.deepEqual(rowVerdict({checks: []}, 'sandbox.launcher'), {pass: false, status: 'missing', detail: null});
});

// A trace as `strace -f -qq -s 4096 --pidns-translation -e trace=%file,%process` writes it: the fixture (100) starts the
// serve (101), which starts the trusted worker (102) and the supervisor (103); the supervisor runs the pinned helper
// (104), which runs bubblewrap (105), whose child (106) is the helper again inside the sandbox and then execs the kernel.
const HOME = '/run/home/.local/share/cua';
const HELPER = `${HOME}/sandbox/rust-v0.163.0/codex-linux-sandbox`;
const REPO = '/repo';
const MNODE = `${HOME}/node/v24.22.0/bin/node`;
const traced = ({helper = true, kernelCalls = true, kernelUnderHelper = true, worker = true, serve = true, runtimesRead = true, splitExec = false, disconnected = false, ended = true} = {}) => [
  `100   execve("/usr/bin/node", ["node", "${REPO}/scripts/accept/linux-native.mjs", "--selection", "default"], 0x7ffd /* 40 vars */) = 0`,
  '100   clone(child_stack=NULL, flags=CLONE_CHILD_CLEARTID|CLONE_CHILD_SETTID|SIGCHLD <unfinished ...>',
  '100   <... clone resumed>, child_tidptr=0x7f) = 101',
  serve ? `101   execve("/usr/bin/node", ["/usr/bin/node", "${REPO}/bin/cua.mjs", "serve"], 0x7ffd /* 41 vars */) = 0` : `101   execve("/usr/bin/true", ["true"], 0x0 /* 1 vars */) = 0`,
  '101   execve("/nonexistent/node", ["node"], 0x0 /* 1 vars */) = -1 ENOENT (No such file or directory)',
  // A disconnected trace: the worker and the supervisor appear with no fork from the serve that would place them.
  ...(disconnected ? [] : ['101   clone3({flags=CLONE_VM|CLONE_VFORK|CLONE_CLEAR_SIGHAND, exit_signal=SIGCHLD, stack=0x7f, stack_size=0x9000}, 88) = 102']),
  ...(worker ? [`102   execve("${HOME}/node/v24.22.0/bin/node", ["node", "${REPO}/src/repl-host/trusted-worker.mjs"], 0x7ffd /* 30 vars */) = 0`] : []),
  ...(runtimesRead ? [`102   openat(AT_FDCWD</repo>, "${HOME}/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/sharp/package.json", O_RDONLY|O_CLOEXEC) = 23</run/home/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/sharp/package.json>`] : []),
  ...(disconnected ? [] : ['101   vfork() = 103']),
  `103   execve("${HOME}/node/v24.22.0/bin/node", ["node", "${REPO}/src/repl-host/supervisor.mjs"], 0x7ffd /* 30 vars */) = 0`,
  '103   clone(child_stack=NULL, flags=SIGCHLD) = 104',
  `104   execve("${helper ? HELPER : '/usr/bin/env'}", ["${HELPER}", "--sandbox-policy-cwd", "/w", "--command-cwd", "/w", "--permission-profile", "{}", "--", "node", "${REPO}/src/repl-host/kernel.mjs"], 0x7ffd /* 9 vars */) = 0`,
  '104   clone(child_stack=NULL, flags=SIGCHLD) = 105',
  `105   execve("/usr/bin/bwrap", ["bwrap", "--new-session", "--", "${HELPER}", "--apply-seccomp-then-exec"], 0x7ffd /* 9 vars */) = 0`,
  '105   clone(child_stack=NULL, flags=CLONE_NEWNS|CLONE_NEWPID|CLONE_NEWUSER|SIGCHLD) = 106',
  ...(helper && kernelUnderHelper ? [`106   execve("${HELPER}", ["${HELPER}", "--apply-seccomp-then-exec", "--", "node", "${REPO}/src/repl-host/kernel.mjs"], 0x7ffd /* 9 vars */) = 0`] : []),
  ...(splitExec
    ? [`106   execve("${HOME}/node/v24.22.0/bin/node", ["node", "${REPO}/src/repl-host/kernel.mjs"], 0x7ffd /* 9 vars */ <unfinished ...>`, '103   openat(AT_FDCWD, "/etc/hosts", O_RDONLY) = 5', '106   <... execve resumed>) = 0']
    : [`106   execve("${HOME}/node/v24.22.0/bin/node", ["node", "${REPO}/src/repl-host/kernel.mjs"], 0x7ffd /* 9 vars */) = 0`]),
  ...(kernelCalls ? ['106   openat(AT_FDCWD</w>, "/proc/self/maps", O_RDONLY|O_CLOEXEC) = 3</proc/2/maps>', `106   openat(AT_FDCWD</w>, "${REPO}/src/repl-host/kernel.mjs", O_RDONLY|O_CLOEXEC) = 4<${REPO}/src/repl-host/kernel.mjs>`] : []),
  '106   +++ exited with 0 +++',
  // Each process's end, as -qq leaves it: its exit_group call (a kill would print `+++ killed by`).
  ...(ended ? [100, 101, 102, 103, 104, 105].map(pid => `${pid}   exit_group(0)                   = ?`) : []),
].join('\n');

test('a trace that follows the helper\'s children: the serve, the worker, the helper, bubblewrap and the kernel, which went on calling after its exec', () => {
  const summary = summarizeTrace(traced(), {helper: HELPER, home: HOME});
  assert.equal(summary.processes, 7);
  assert.equal(summary.serve, 101);
  assert.deepEqual(summary.workers, [{pid: 102, underServe: true, exe: MNODE, nodeExes: [MNODE]}]);
  assert.deepEqual(summary.helpers, [104, 106]);
  assert.deepEqual(summary.bwrap, [105]);
  assert.deepEqual(summary.kernels, [{pid: 106, underHelper: true, underServe: true, callsAfterExec: 2, exe: MNODE, nodeExes: [MNODE]}]);
  // Measured, not judged by the pilot: the calls of the serve's tree that name a path under the home's runtimes/.
  // The serve's own first calls come before any decoded working directory, but they name no relative path.
  assert.deepEqual(summary.runtimes, {calls: 1, unresolved: 0, pending: 0, unended: 0, complete: true});
  assert.deepEqual(traceVerdict(summary), {pass: true, problems: []});
  assert.deepEqual(summarizeTrace(traced({splitExec: true}), {helper: HELPER, home: HOME}).kernels, [{pid: 106, underHelper: true, underServe: true, callsAfterExec: 2, exe: MNODE, nodeExes: [MNODE]}]);
  assert.deepEqual(summarizeTrace(traced({runtimesRead: false}), {helper: HELPER, home: HOME}).runtimes, {calls: 0, unresolved: 0, pending: 0, unended: 0, complete: true});
});

test('negative control: a worker and a kernel that do not descend from the serve being judged do not pass, however complete they look', () => {
  const summary = summarizeTrace(traced({disconnected: true}), {helper: HELPER, home: HOME});
  assert.deepEqual(summary.workers, [{pid: 102, underServe: false, exe: MNODE, nodeExes: [MNODE]}]);
  assert.equal(summary.kernels[0].underServe, false);
  const verdict = traceVerdict(summary);
  assert.equal(verdict.pass, false);
  assert.match(verdict.problems.join('; '), /no trusted worker under the serve/);
  assert.match(verdict.problems.join('; '), /no kernel under the serve/);
});

// The vendor-tree counter over one process of the serve's tree (-y decodes each descriptor and AT_FDCWD to a path).
const R = `${HOME}/runtimes`;
const counted = (lines, options = {}) => {
  const all = [`200   execve("/usr/bin/node", ["node", "${REPO}/bin/cua.mjs", "serve"], 0x7ffd /* 4 vars */) = 0`, ...lines];
  const pids = [...new Set(all.map(line => /^(\d+)/.exec(line)?.[1]).filter(Boolean))];
  const {calls, unresolved, complete} = summarizeTrace([...all, ...pids.map(pid => `${pid}   exit_group(0) = ?`)].join('\n'), {helper: HELPER, home: HOME, ...options}).runtimes;
  return {calls, unresolved, complete};
};

test('the vendor-tree counter resolves relative paths against their decoded base, the descriptor or the working directory', () => {
  assert.deepEqual(counted([`200   openat(AT_FDCWD<${R}/26>, "lib/x.js", O_RDONLY) = 3<${R}/26/lib/x.js>`]), {calls: 1, unresolved: 0, complete: true});
  assert.deepEqual(counted([`200   newfstatat(5<${HOME}>, "runtimes/26/p.json", 0x7ffd, 0) = 0`]), {calls: 1, unresolved: 0, complete: true});
  assert.deepEqual(counted([`200   openat(AT_FDCWD<${HOME}>, "./runtimes/../runtimes/26/a", O_RDONLY) = -1 ENOENT (No such file or directory)`]), {calls: 1, unresolved: 0, complete: true});
  // A relative path that leaves runtimes/ is not counted, though its base lies in it.
  assert.deepEqual(counted([`200   openat(AT_FDCWD<${R}>, "../node/x", O_RDONLY) = 3<${HOME}/node/x>`]), {calls: 0, unresolved: 0, complete: true});
  // A non-at call's relative path takes the working directory the process last showed: chdir, fchdir or an AT_FDCWD.
  assert.deepEqual(counted([`200   chdir("${HOME}") = 0`, '200   access("runtimes/26", R_OK) = 0']), {calls: 1, unresolved: 0, complete: true});
  assert.deepEqual(counted([`200   fchdir(7<${R}>) = 0`, '200   stat("26/x", 0x7ffd) = 0']), {calls: 2, unresolved: 0, complete: true});
  assert.deepEqual(counted([`200   openat(AT_FDCWD<${HOME}>, "/etc/hosts", O_RDONLY) = 3</etc/hosts>`, '200   readlink("runtimes", "x", 4096) = 1']), {calls: 1, unresolved: 0, complete: true});
  // A child takes its parent's working directory at the fork.
  assert.deepEqual(counted([`200   chdir("${R}") = 0`, '200   vfork() = 201', '201   execve("26/bin/node", ["node"], 0x7ffd /* 1 vars */) = -1 ENOENT (No such file or directory)']), {calls: 2, unresolved: 0, complete: true});
});

test('the vendor-tree counter counts attempted execs and a resolved descriptor, but never argv or an output buffer', () => {
  assert.deepEqual(counted([`200   execve("${R}/26/bin/node", ["node"], 0x7ffd /* 1 vars */) = -1 ENOENT (No such file or directory)`]), {calls: 1, unresolved: 0, complete: true});
  assert.deepEqual(counted([`200   execve("/usr/bin/node", ["node", "${R}/26/x.js"], 0x7ffd /* 1 vars */) = 0`]), {calls: 0, unresolved: 0, complete: true});
  assert.deepEqual(counted([`200   openat(AT_FDCWD</tmp>, "/tmp/link", O_RDONLY) = 3<${R}/26/real>`]), {calls: 1, unresolved: 0, complete: true});
  assert.deepEqual(counted([`200   readlink("/tmp/link", "${R}/26/real", 4096) = 30`]), {calls: 0, unresolved: 0, complete: true});
});

test('every pathname operand of a call is read at its position: rename\'s and link\'s destinations, the at-forms\' second pair', () => {
  assert.deepEqual(counted([`200   rename("/tmp/a", "${R}/26/b") = 0`]), {calls: 1, unresolved: 0, complete: true});
  assert.deepEqual(counted([`200   link("/tmp/a", "${R}/26/b") = 0`]), {calls: 1, unresolved: 0, complete: true});
  assert.deepEqual(counted([`200   renameat2(AT_FDCWD</tmp>, "a", 7<${R}>, "26/b", RENAME_NOREPLACE) = 0`]), {calls: 1, unresolved: 0, complete: true});
  assert.deepEqual(counted([`200   linkat(AT_FDCWD</tmp>, "a", AT_FDCWD<${HOME}>, "runtimes/b", 0) = 0`]), {calls: 1, unresolved: 0, complete: true});
  // A symlink's target is its content, not a path it touches; its link name is.
  assert.deepEqual(counted([`200   symlink("${R}/26", "/tmp/l") = 0`]), {calls: 0, unresolved: 0, complete: true});
  assert.deepEqual(counted([`200   symlinkat("/tmp/x", AT_FDCWD<${R}>, "l") = 0`]), {calls: 1, unresolved: 0, complete: true});
  // A comma inside a path or a decoded base is part of it.
  assert.deepEqual(counted([`200   openat(AT_FDCWD</tmp/a,b>, "${R}/x,y", O_RDONLY) = -1 ENOENT (No such file or directory)`]), {calls: 1, unresolved: 0, complete: true});
});

test('an absolute path is read whatever its descriptor decodes to: the kernel ignores the descriptor for it', () => {
  assert.deepEqual(counted([`200   openat(5<pipe:[42]>, "${R}/26/x", O_RDONLY) = -1 ENOENT (No such file or directory)`]), {calls: 1, unresolved: 0, complete: true});
  assert.deepEqual(counted([`200   newfstatat(9<socket:[7]>, "${R}/26", 0x7ffd, 0) = 0`]), {calls: 1, unresolved: 0, complete: true});
  // A relative path against a descriptor that is no directory resolves nowhere: unresolved.
  assert.deepEqual(counted(['200   openat(5<pipe:[42]>, "x", O_RDONLY) = -1 ENOTDIR (Not a directory)']), {calls: 0, unresolved: 1, complete: false});
});

test('negative control: a call whose form the reader does not know, or an operand it cannot read, leaves the count incomplete, never zero', () => {
  assert.deepEqual(counted([`200   frobnicateat(AT_FDCWD<${HOME}>, "runtimes/x", 0) = 0`]), {calls: 0, unresolved: 1, complete: false});
  assert.deepEqual(counted(['200   openat(AT_FDCWD</tmp>, 0x7ffd1234, O_RDONLY) = -1 EFAULT (Bad address)']), {calls: 0, unresolved: 1, complete: false});
  assert.deepEqual(counted(['200   stat("/run/home/.local/share/cua/run"..., 0x7ffd) = 0']), {calls: 0, unresolved: 1, complete: false});
  // The process calls with no path are known, and leave it complete.
  assert.deepEqual(counted(['200   wait4(-1, 0x7ffd, WNOHANG, NULL) = 0', '200   exit_group(0) = ?', '200   kill(201, SIGTERM) = 0']), {calls: 0, unresolved: 0, complete: true});
  // As strace pads them (its return column), with an output buffer only (getcwd), and with a NULL source (mount).
  assert.deepEqual(counted([`200   chdir("${R}")                   = 0`, '200   stat("26/x", 0x7ffd)        = 0']), {calls: 2, unresolved: 0, complete: true});
  assert.deepEqual(counted([`200   getcwd("${R}", 4096) = 30`, '200   mount(NULL, "/", NULL, MS_REC|MS_SLAVE, NULL) = 0']), {calls: 0, unresolved: 0, complete: true});
  // utimensat with a NULL path names its descriptor.
  assert.deepEqual(counted([`200   utimensat(4<${R}/26>, NULL, NULL, 0) = 0`]), {calls: 1, unresolved: 0, complete: true});
});

test('a descriptor -y decodes to something other than a path (a pipe, a socket, an anonymous inode) is neither a path nor unresolved', () => {
  // As the live trace showed it: the trusted worker opening its inherited pipe through /proc/self/fd.
  assert.deepEqual(counted([`200   openat(AT_FDCWD<${HOME}/run/x>, "/proc/self/fd/5", O_WRONLY|O_NONBLOCK|O_CLOEXEC) = 20<pipe:[278631620]>`]), {calls: 0, unresolved: 0, complete: true});
  assert.deepEqual(counted(['200   newfstatat(4<socket:[91]>, "", 0x7ffd, AT_EMPTY_PATH) = 0', '200   fchdir(9<anon_inode:[eventfd]>) = -1 ENOTDIR (Not a directory)']), {calls: 0, unresolved: 0, complete: true});
});

test('negative control: a relative path whose base is unknown leaves the count incomplete, never a clean zero', () => {
  assert.deepEqual(counted(['200   access("runtimes/26", R_OK) = 0']), {calls: 0, unresolved: 1, complete: false});
  assert.deepEqual(counted(['200   openat(5, "lib/x.js", O_RDONLY) = 3']), {calls: 0, unresolved: 1, complete: false});
  // Outside the serve's tree nothing is counted or missed.
  assert.deepEqual(summarizeTrace('300   access("runtimes/26", R_OK) = 0', {helper: HELPER, home: HOME}).runtimes, {calls: 0, unresolved: 0, pending: 0, unended: 0, complete: true});
});

test('a kernel is under the helper by its parents too, when the helper did not exec it in place', () => {
  const summary = summarizeTrace(traced({kernelUnderHelper: false}), {helper: HELPER, home: HOME});
  assert.deepEqual(summary.kernels, [{pid: 106, underHelper: true, underServe: true, callsAfterExec: 2, exe: MNODE, nodeExes: [MNODE]}]);
});

test('a fork inside bubblewrap\'s PID namespace is placed by the pid strace translated, not the namespace\'s own', () => {
  // As strace 6.8 writes it on Ubuntu 24.04: the inner helper forks the kernel, which is pid 2 in the sandbox.
  const lines = traced({kernelUnderHelper: false}).split('\n').map(line => line.replace(/^105   clone\(.*$/, '105   clone(child_stack=NULL, flags=SIGCHLD) = 107'))
    .flatMap(line => (line.startsWith('105   clone') ? [line, `107   execve("${HELPER}", ["codex-linux-sandbox", "--apply-seccomp-then-exec"], 0x7ffd /* 9 vars */) = 0`, '107   fork()                          = 2 /* 106 in strace\'s PID NS */'] : [line]));
  const summary = summarizeTrace(lines.join('\n'), {helper: HELPER, home: HOME});
  assert.deepEqual(summary.kernels, [{pid: 106, underHelper: true, underServe: true, callsAfterExec: 2, exe: MNODE, nodeExes: [MNODE]}]);
  assert.equal(summarizeTrace(lines.join('\n'), {helper: HELPER, home: HOME}).helpers.includes(107), true);
});

test('negative control: a trace that lacks the kernel, or saw its exec and nothing after it, did not follow the helper\'s children', () => {
  const noKernel = traced().split('\n').filter(line => !/kernel\.mjs/.test(line) || line.includes(HELPER)).filter(line => !line.startsWith('106')).join('\n');
  const lacking = traceVerdict(summarizeTrace(noKernel, {helper: HELPER, home: HOME}));
  assert.equal(lacking.pass, false);
  assert.match(lacking.problems.join('; '), /the trace holds no kernel exec/);
  const stopped = traceVerdict(summarizeTrace(traced({kernelCalls: false}), {helper: HELPER, home: HOME}));
  assert.equal(stopped.pass, false);
  assert.match(stopped.problems.join('; '), /made no call after its exec/);
});

test('negative control: a kernel outside the helper, a missing worker or a missing serve fails', () => {
  const unhelped = summarizeTrace(traced({helper: false}), {helper: HELPER, home: HOME});
  assert.deepEqual(unhelped.helpers, []);
  assert.equal(unhelped.kernels[0].underHelper, false);
  assert.match(traceVerdict(unhelped).problems.join('; '), /no kernel ran under the pinned helper/);
  assert.match(traceVerdict(summarizeTrace(traced({worker: false}), {helper: HELPER, home: HOME})).problems.join('; '), /no trusted worker under the serve/);
  assert.match(traceVerdict(summarizeTrace(traced({serve: false}), {helper: HELPER, home: HOME})).problems.join('; '), /no cua serve exec/);
});

// The smoke's report as scripts/accept/linux-native.mjs writes it, reduced to what the answers read.
const smoke = ({source = 'at_spi', readBack = true, typed = readBack ? 'PASS' : 'FAIL', confinement = true, bwrap = true, bwrapExe = '/usr/bin/bwrap', bound = true, underServe = true, ran = true} = {}) => ({
  status: 'PASS',
  steps: ran ? [
    {name: 'preconditions', status: 'PASS'},
    {name: 'bind the fixture window by X11 id', status: 'PASS'},
    {name: 'type the marker and read it back from the accessibility tree', status: typed, detail: {source, readBack}},
  ] : [{name: 'preconditions', status: 'FAIL'}],
  ...(ran ? {confinement: {verdict: {pass: confinement, problems: confinement ? [] : ['the kernel connected to bus']},
    ancestry: {kernel: bound ? 55 : null, underServe, ancestors: [...(bwrap ? [{comm: 'bwrap', exe: bwrapExe}] : []), {comm: 'codex-linux-sa', exe: HELPER}]}}} : {}),
});
const inputs = (o = {}) => ({environment: environmentVerdict(doctor()), launcher: rowVerdict(doctor(), 'sandbox.launcher'), smoke: smoke(), trace: traceVerdict(summarizeTrace(traced(), {helper: HELPER, home: HOME})), ...o});

test('the four answers are yes when each question\'s evidence holds', () => {
  const answers = pilotAnswers(inputs());
  assert.deepEqual(Object.keys(answers), ['userns', 'a11y', 'confinement', 'strace']);
  for (const [q, a] of Object.entries(answers)) assert.equal(a.answer, 'yes', q);
});

test('negative controls: each answer is no when its own evidence was taken and failed', () => {
  assert.equal(pilotAnswers(inputs({environment: environmentVerdict(doctor({'sandbox.userns': {status: 'blocked', detail: 'uid map'}}))})).userns.answer, 'no');
  assert.equal(pilotAnswers(inputs({smoke: smoke({bwrap: false})})).userns.answer, 'no');
  assert.equal(pilotAnswers(inputs({smoke: smoke({source: 'x11'})})).a11y.answer, 'no');
  assert.equal(pilotAnswers(inputs({smoke: smoke({readBack: false})})).a11y.answer, 'no');
  assert.equal(pilotAnswers(inputs({smoke: smoke({confinement: false})})).confinement.answer, 'no');
  assert.equal(pilotAnswers(inputs({trace: traceVerdict(summarizeTrace(traced({kernelCalls: false}), {helper: HELPER, home: HOME}))})).strace.answer, 'no');
});

test('an answer whose evidence was never taken is unanswered, naming why, never yes', () => {
  const none = pilotAnswers(inputs({smoke: null, trace: null}));
  for (const q of ['a11y', 'confinement', 'strace']) {
    assert.equal(none[q].answer, 'unanswered', q);
    assert.ok(none[q].why, q);
  }
  assert.equal(none.userns.answer, 'unanswered');
  assert.equal(pilotAnswers(inputs({smoke: smoke({ran: false})})).a11y.answer, 'unanswered');
});

test('negative control: the accessibility answer is yes only for a typing step that completed and passed, whatever its detail says', () => {
  const failed = pilotAnswers(inputs({smoke: smoke({typed: 'FAIL'})})).a11y;
  assert.equal(failed.answer, 'no');
  assert.match(failed.why, /the typing step did not pass/);
});

test('negative control: the userns answer takes bwrap only from the kernel that answered, bound in this serve, with a read executable', () => {
  const unbound = pilotAnswers(inputs({smoke: smoke({bound: false})})).userns;
  assert.equal(unbound.answer, 'unanswered');
  assert.match(unbound.why, /the kernel that answered was not bound under this serve/);
  assert.equal(pilotAnswers(inputs({smoke: smoke({underServe: false})})).userns.answer, 'unanswered');
  assert.equal(pilotAnswers(inputs({smoke: smoke({bwrapExe: null})})).userns.answer, 'no');
});

// The pilot's own report, as it writes pilot.json: every mandatory step and the four answers.
const report = (o = {}) => ({steps: MANDATORY_STEPS.map(name => ({name, status: 'PASS'})), answers: pilotAnswers(inputs()), ...o});

test('the pilot passes only when every mandatory step passed and all four answers are yes', () => {
  assert.deepEqual(pilotVerdict(report()), {pass: true, problems: []});
});

test('negative control: a failed smoke (its end_task, a killed traced run), a missing step or a diagnostic no fails the pilot, though three answers say yes', () => {
  for (const name of MANDATORY_STEPS) {
    const failed = report({steps: MANDATORY_STEPS.map(n => ({name: n, status: n === name ? 'FAIL' : 'PASS'}))});
    const verdict = pilotVerdict(failed);
    assert.equal(verdict.pass, false, name);
    assert.match(verdict.problems.join('; '), new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} is FAIL`));
    const missing = report({steps: MANDATORY_STEPS.filter(n => n !== name).map(n => ({name: n, status: 'PASS'}))});
    assert.match(pilotVerdict(missing).problems.join('; '), /did not run/, name);
  }
  const a11yNo = report({answers: pilotAnswers(inputs({smoke: smoke({typed: 'FAIL'})}))});
  assert.match(pilotVerdict(a11yNo).problems.join('; '), /a11y is no/);
  assert.equal(pilotVerdict({steps: [], answers: {}}).pass, false);
});

test('the artifact is an explicit list of projected reports, and the workflow uploads exactly that list', () => {
  assert.deepEqual(ARTIFACT_FILES, ['pilot.json', 'smoke.json', 'smoke-traced.json']);
  const {upload} = jobUpload('pilot');
  const listed = [...upload.matchAll(/\$\{\{ env\.RUN \}\}\/artifact\/([\w.-]+)/g)].map(m => m[1]);
  assert.deepEqual(listed, ARTIFACT_FILES);
  assert.doesNotMatch(upload, /artifact\/\s*$/m, 'no directory upload');
});

// A job's text in the workflow (from its key to the next job's) and its upload step's text.
function jobUpload(job) {
  const workflow = readFileSync(new URL('../.github/workflows/linux-runtime.yml', import.meta.url), 'utf8');
  const start = workflow.indexOf(`\n  ${job}:\n`);
  const next = workflow.slice(start + 1).search(/\n  [\w-]+:\n/);
  const text = next < 0 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
  return {text, upload: text.slice(text.indexOf('uses: actions/upload-artifact'))};
}

test('the acceptance job runs the driver with the older checkout and uploads only its projected report', () => {
  const {text, upload} = jobUpload('acceptance');
  assert.match(text, /inputs\.suite == 'acceptance'/);
  assert.match(text, /scripts\/accept\/linux-runtime-env\.sh "\$RUN" -- node scripts\/accept\/linux-runtime\.mjs --out "\$RUN\/artifact" --older "\$GITHUB_WORKSPACE\/older-cua"/);
  assert.deepEqual([...upload.matchAll(/\$\{\{ env\.RUN \}\}\/artifact\/([\w.-]+)/g)].map(m => m[1]), ['runtime.json']);
  assert.match(jobUpload('pilot').text, /inputs\.suite == 'pilot'/);
  // #171 M6b: acceptance 13, its upgraded home made by the older cua's real install, which needs the deb's tools (F11),
  // and E0's static-linkage check, which needs file.
  assert.match(text, /name: acceptance 13 /);
  assert.match(text, /apt-get install [^\n]*\\\n[^\n]*\bstrace file binutils xz-utils\b/);
  assert.match(text, /the cua before M6b/);
});

test('a smoke\'s projection keeps its status and each step\'s name and status, nothing of its details', () => {
  const projected = projectSmoke({status: 'FAIL', home: '/h', marker: 'cua-f2-1', steps: [{name: 'bind', status: 'PASS', detail: {title: 'fixture.txt - gedit'}}, {name: 'end_task', status: 'FAIL', detail: 'x'}]});
  assert.deepEqual(projected, {status: 'FAIL', steps: [{name: 'bind', status: 'PASS'}, {name: 'end_task', status: 'FAIL'}]});
  assert.equal(projectSmoke(null), null);
});

// E2's "opened" witness (the M6a pre-flight §5.2, the browser-only fixture): which of the watched paths each kernel
// opened, by itself or through a thread or child that never exec'd (libuv's pool opens for fs.promises).
const MODULES = `${HOME}/modules/b71d/node_modules`;
const WATCH = [`${MODULES}/pngjs/lib/png.js`, `${MODULES}/sharp/dist/index.mjs`];
const withOpens = opens => [traced(), ...opens].join('\n');

test('the reader names the watched paths each kernel opened, its threads\' opens included, and nothing it was not asked to watch', () => {
  const summary = summarizeTrace(withOpens([
    `106   openat(AT_FDCWD</w>, "${WATCH[0]}", O_RDONLY|O_CLOEXEC) = 5<${WATCH[0]}>`,
    '106   clone3({flags=CLONE_VM|CLONE_FS|CLONE_FILES|CLONE_SIGHAND|CLONE_THREAD|CLONE_SYSVSEM, exit_signal=0, stack=0x7f, stack_size=0x7ff}, 88) = 107',
    `107   openat(AT_FDCWD</w>, "${WATCH[1]}", O_RDONLY|O_CLOEXEC) = 6<${WATCH[1]}>`,
    '106   openat(AT_FDCWD</w>, "/etc/passwd", O_RDONLY) = 7</etc/passwd>',
  ]), {helper: HELPER, home: HOME, watch: WATCH});
  assert.deepEqual(summary.kernels.map(k => k.opened), [WATCH]);
});

test('negative control: a failed open, a stat, or an open by a process that is not the kernel\'s is not the kernel opening the path', () => {
  const summary = summarizeTrace(withOpens([
    `106   openat(AT_FDCWD</w>, "${WATCH[0]}", O_RDONLY|O_CLOEXEC) = -1 EACCES (Permission denied)`,
    `106   newfstatat(AT_FDCWD</w>, "${WATCH[1]}", {st_mode=S_IFREG|0644, st_size=1, ...}, 0) = 0`,
    `102   openat(AT_FDCWD</repo>, "${WATCH[1]}", O_RDONLY|O_CLOEXEC) = 9<${WATCH[1]}>`,
  ]), {helper: HELPER, home: HOME, watch: WATCH});
  assert.deepEqual(summary.kernels.map(k => k.opened), [[]]);
  // A child the kernel started that exec'd another program is no longer the kernel.
  const exec = summarizeTrace(withOpens([
    '106   clone(child_stack=NULL, flags=SIGCHLD) = 108',
    '108   execve("/bin/cat", ["cat"], 0x7ffd /* 1 vars */) = 0',
    `108   openat(AT_FDCWD</w>, "${WATCH[0]}", O_RDONLY) = 3<${WATCH[0]}>`,
  ]), {helper: HELPER, home: HOME, watch: WATCH});
  assert.deepEqual(exec.kernels.map(k => k.opened), [[]]);
});

test('without a watch list the summary carries no opened paths', () => {
  assert.equal('opened' in summarizeTrace(traced(), {helper: HELPER, home: HOME}).kernels[0], false);
});

// Fix wave 1 (#2): an unfinished call, a process with no end, and opens made before the kernel's exec.
test('negative control: a trace that ends on an unfinished open under runtimes/ counts the call and is incomplete', () => {
  const summary = summarizeTrace([traced({runtimesRead: false}), `102   openat(AT_FDCWD</repo>, "${HOME}/runtimes/26/x.js", O_RDONLY <unfinished ...>`].join('\n'), {helper: HELPER, home: HOME});
  assert.equal(summary.runtimes.calls, 1);
  assert.equal(summary.runtimes.pending, 1);
  assert.equal(summary.runtimes.complete, false);
  // An unfinished process call (a wait the process never returned from) names no path and leaves the count whole.
  const waiting = summarizeTrace([traced({runtimesRead: false}), '101   wait4(-1,  <unfinished ...>'].join('\n'), {helper: HELPER, home: HOME});
  assert.equal(waiting.runtimes.complete, true);
});

test('negative control: a process of the serve\'s tree with no end (strace detached or killed) leaves the trace incomplete', () => {
  const summary = summarizeTrace(traced({runtimesRead: false, ended: false}), {helper: HELPER, home: HOME});
  assert.equal(summary.runtimes.unended, 5);
  assert.equal(summary.runtimes.complete, false);
  // A kill is an end.
  const killed = summarizeTrace([traced({runtimesRead: false, ended: false}), ...[101, 102, 103, 104, 105].map(pid => `${pid}   +++ killed by SIGKILL +++`)].join('\n'), {helper: HELPER, home: HOME});
  assert.equal(killed.runtimes.complete, true);
});

test('negative control: an open the helper made before it exec\'d the kernel, or a child forked before that exec, is not the kernel\'s', () => {
  const lines = traced().split('\n');
  // In 106, before its exec of the kernel: the helper's own open of a watched path.
  const at = lines.findIndex(line => line.startsWith('106') && line.includes('src/repl-host/kernel.mjs') && line.includes(MNODE));
  const pre = [...lines.slice(0, at), `106   openat(AT_FDCWD</w>, "${WATCH[0]}", O_RDONLY) = 3<${WATCH[0]}>`, '106   clone(child_stack=NULL, flags=SIGCHLD) = 109', `109   openat(AT_FDCWD</w>, "${WATCH[1]}", O_RDONLY) = 3<${WATCH[1]}>`, ...lines.slice(at)];
  assert.deepEqual(summarizeTrace(pre.join('\n'), {helper: HELPER, home: HOME, watch: WATCH}).kernels.map(k => k.opened), [[]]);
});

test('every exec of the serve\'s tree that launches something is listed by kind: the helper, bubblewrap, the REPL host, an engine', () => {
  const summary = summarizeTrace(traced(), {helper: HELPER, home: HOME});
  assert.deepEqual(summary.launched.map(l => [l.pid, l.kind]), [[102, 'trusted-worker'], [103, 'supervisor'], [104, 'helper'], [105, 'bwrap'], [106, 'helper'], [106, 'kernel']]);
  // A probe of a Node's version, or any other program, is not a launch.
  const probe = summarizeTrace([`101   execve("/usr/bin/node", ["/usr/bin/node", "${REPO}/bin/cua.mjs", "serve"], 0x7ffd /* 41 vars */) = 0`, '101   vfork() = 102', `102   execve("${MNODE}", ["${MNODE}", "--version"], 0x7ffd /* 1 vars */) = 0`].join('\n'), {helper: HELPER, home: HOME});
  assert.deepEqual(probe.launched, []);
});

test('a thread ends with its group: an exit_group of the process ends the threads that left no line of their own', () => {
  const lines = [traced({runtimesRead: false}), '102   clone3({flags=CLONE_VM|CLONE_FS|CLONE_FILES|CLONE_SIGHAND|CLONE_THREAD|CLONE_SYSVSEM, exit_signal=0, stack=0x7f, stack_size=0x7ff}, 88) = 110'];
  assert.equal(summarizeTrace(lines.join('\n'), {helper: HELPER, home: HOME}).runtimes.complete, true);
  // A forked child (no CLONE_THREAD) with no end of its own is not ended by its parent's.
  const child = [traced({runtimesRead: false}), '102   clone(child_stack=NULL, flags=SIGCHLD) = 111'];
  assert.equal(summarizeTrace(child.join('\n'), {helper: HELPER, home: HOME}).runtimes.unended, 1);
});

// Fix wave 2 (#1, #3, #4): unfinished execs, individual exits, launches under runtimes/, every Node exec of a pid.
const THREAD_110 = '102   clone3({flags=CLONE_VM|CLONE_FS|CLONE_FILES|CLONE_SIGHAND|CLONE_THREAD|CLONE_SYSVSEM, exit_signal=0, stack=0x7f, stack_size=0x7ff}, 88) = 110';
// The traced fixture's 102 ends by exit_group; here its leader exits alone instead.
const leaderAlone = () => traced({runtimesRead: false}).replace('102   exit_group(0)                   = ?', '102   exit(0)                         = ?');

test('negative control (fix wave 2, #1): an unfinished vendor exec from a thread whose leader alone exited is counted and leaves the trace incomplete', () => {
  const text = [leaderAlone(), THREAD_110, `110   execve("${HOME}/runtimes/26/cua_node/bin/node", ["node"], 0x7ffd /* 1 vars */ <unfinished ...>`].join('\n');
  const summary = summarizeTrace(text, {helper: HELPER, home: HOME});
  assert.equal(summary.runtimes.calls, 1);
  assert.equal(summary.runtimes.pending, 1);
  assert.ok(summary.runtimes.unended >= 1, 'the thread did not end with its leader\'s individual exit');
  assert.equal(summary.runtimes.complete, false);
});

test('a thread group ends by exit_group from any member, or when its last thread exits', () => {
  assert.equal(summarizeTrace([leaderAlone(), THREAD_110, '110   exit_group(0) = ?'].join('\n'), {helper: HELPER, home: HOME}).runtimes.complete, true);
  assert.equal(summarizeTrace([leaderAlone(), THREAD_110, '110   exit(0) = ?'].join('\n'), {helper: HELPER, home: HOME}).runtimes.complete, true);
  assert.equal(summarizeTrace([leaderAlone(), THREAD_110].join('\n'), {helper: HELPER, home: HOME}).runtimes.complete, false);
});

test('negative control (fix wave 2, #3): any exec under runtimes/ is a launch, whatever its basename', () => {
  const summary = summarizeTrace([`101   execve("/usr/bin/node", ["/usr/bin/node", "${REPO}/bin/cua.mjs", "serve"], 0x7ffd /* 41 vars */) = 0`, '101   vfork() = 102',
    `102   execve("${HOME}/runtimes/26/cua_node/bin/whatever", ["whatever", "--version"], 0x7ffd /* 1 vars */) = 0`, '102   exit_group(0) = ?', '101   exit_group(1) = ?'].join('\n'), {helper: HELPER, home: HOME});
  assert.deepEqual(summary.launched.map(l => [l.pid, l.kind]), [[102, 'runtimes']]);
});

test('negative control (fix wave 2, #3): an exec attempted under runtimes/ that failed is listed too, as attempted', () => {
  const summary = summarizeTrace([`101   execve("/usr/bin/node", ["/usr/bin/node", "${REPO}/bin/cua.mjs", "serve"], 0x7ffd /* 41 vars */) = 0`, '101   vfork() = 102',
    `102   execve("${HOME}/runtimes/26/sky/sky_linux_x64", ["sky"], 0x7ffd /* 1 vars */) = -1 ENOENT (No such file or directory)`, '102   exit_group(127) = ?', '101   exit_group(1) = ?'].join('\n'), {helper: HELPER, home: HOME});
  assert.deepEqual(summary.launched, [{pid: 102, kind: 'runtimes', program: `${HOME}/runtimes/26/sky/sky_linux_x64`, attempted: true}]);
});

test('negative control (fix wave 2, #4): every Node a worker or kernel pid exec\'d is kept, not only the last', () => {
  const lines = traced().split('\n');
  const at = lines.findIndex(line => line.startsWith('106') && line.includes(MNODE) && line.includes('kernel.mjs'));
  lines.splice(at, 0, `106   execve("/usr/bin/node", ["node", "${REPO}/src/repl-host/kernel.mjs"], 0x7ffd /* 9 vars */) = 0`);
  const summary = summarizeTrace(lines.join('\n'), {helper: HELPER, home: HOME});
  assert.deepEqual(summary.kernels[0].nodeExes, ['/usr/bin/node', MNODE]);
});

// #171 M6b, T6: the reader's records for a traced command with no serve (an install, a doctor run) and for a refused
// open's execs: every exec with its argument vector, every call under runtimes/ by kind, and the whole trace's count.
test('every exec is kept with its argument vector, done or looked up, and the programs that ran are counted by path', () => {
  const s = summarizeTrace([
    '700   execve("/usr/bin/node", ["node", "/repo/bin/cua.mjs", "doctor", "--json"], 0x7ffd /* 9 vars */) = 0',
    '700   clone(child_stack=NULL, flags=SIGCHLD) = 701',
    '701   execve("/usr/local/bin/gzip", ["gzip", "-d"], 0x7ffd /* 9 vars */) = -1 ENOENT (No such file or directory)',
    '701   execve("/usr/bin/gzip", ["gzip", "-d"], 0x7ffd /* 9 vars */) = 0',
    '700   clone(child_stack=NULL, flags=SIGCHLD) = 702',
    '702   execve("/r/out dated/cua-engine", ["/r/out dated/cua-engine", "--version", "a \\"quoted\\" word"], 0x7ffd /* 1 var */) = 0',
    '700   exit_group(0) = ?', '701   exit_group(0) = ?', '702   exit_group(0) = ?',
  ].join('\n'), {helper: HELPER, home: HOME});
  assert.deepEqual(s.execs.map(({pid, program, argv, ok}) => ({pid, program, argv, ok})), [
    {pid: 700, program: '/usr/bin/node', argv: ['node', '/repo/bin/cua.mjs', 'doctor', '--json'], ok: true},
    {pid: 701, program: '/usr/local/bin/gzip', argv: ['gzip', '-d'], ok: false},
    {pid: 701, program: '/usr/bin/gzip', argv: ['gzip', '-d'], ok: true},
    {pid: 702, program: '/r/out dated/cua-engine', argv: ['/r/out dated/cua-engine', '--version', 'a "quoted" word'], ok: true}]);
  assert.deepEqual(s.programs, [{path: '/r/out dated/cua-engine', count: 1}, {path: '/usr/bin/gzip', count: 1}, {path: '/usr/bin/node', count: 1}]);
  assert.deepEqual(s.whole, {unresolved: 0, pending: 0, unended: 0, complete: true});
});

test('each call under runtimes/ of the whole trace is kept with its kind: lstat, stat, opendir, open, write, unlink, rename, exec', () => {
  const R = `${HOME}/runtimes/26.928.40906-linux-x64`;
  const lines = [
    `800   statx(AT_FDCWD</w>, "${R}", AT_STATX_SYNC_AS_STAT|AT_SYMLINK_NOFOLLOW, STATX_ALL, 0x7ffc) = 0`,
    `800   newfstatat(AT_FDCWD</w>, "${R}/a", {st_mode=S_IFREG|0644, st_size=3, ...}, AT_SYMLINK_NOFOLLOW) = 0`,
    `800   newfstatat(AT_FDCWD</w>, "${R}/b", {st_mode=S_IFREG|0644, st_size=3, ...}, 0) = 0`,
    `800   statx(AT_FDCWD</w>, "${R}/c", AT_STATX_SYNC_AS_STAT, STATX_ALL, 0x7ffc) = 0`,
    `800   openat(AT_FDCWD</w>, "${R}", O_RDONLY|O_CLOEXEC|O_DIRECTORY) = 3<${R}>`,
    `800   openat(AT_FDCWD</w>, "${R}/install.json", O_RDONLY|O_NONBLOCK|O_NOFOLLOW|O_CLOEXEC) = 4<${R}/install.json>`,
    `800   openat(AT_FDCWD</w>, "${R}/new", O_WRONLY|O_CREAT|O_TRUNC|O_CLOEXEC, 0666) = 5<${R}/new>`,
    `800   unlinkat(AT_FDCWD</w>, "${R}/new", 0) = 0`,
    `800   renameat2(AT_FDCWD</w>, "/tmp/x", AT_FDCWD</w>, "${R}/y", 0) = 0`,
    `800   mkdir("${R}/d", 0700) = -1 EEXIST (File exists)`,
    `800   execve("${R}/cua_node/bin/node", ["node"], 0x7ffd /* 9 vars */) = -1 EACCES (Permission denied)`,
    '800   openat(AT_FDCWD</w>, "/etc/hosts", O_RDONLY) = 6</etc/hosts>',
    '800   exit_group(0) = ?',
  ];
  const s = summarizeTrace(lines.join('\n'), {helper: HELPER, home: HOME});
  assert.deepEqual(s.files.map(f => [f.kind, f.ok]), [['lstat', true], ['lstat', true], ['stat', true], ['stat', true], ['opendir', true], ['open', true], ['write', true], ['unlink', true],
    ['rename', true], ['write', false], ['exec', false]]);
  assert.deepEqual(s.files[8].paths, [`${R}/y`]);
});

test('negative control: a process of a traced install with no end, or an unresolved path, leaves the whole trace incomplete', () => {
  const s = summarizeTrace(['900   execve("/usr/bin/node", ["node", "/repo/bin/cua.mjs", "install"], 0x7ffd /* 9 vars */) = 0', '900   clone(child_stack=NULL, flags=SIGCHLD) = 901',
    '901   openat(AT_FDCWD, "relative", O_RDONLY) = 3', '900   exit_group(0) = ?'].join('\n'), {helper: HELPER, home: HOME});
  assert.deepEqual(s.whole, {unresolved: 1, pending: 0, unended: 1, complete: false});
});

test('callKind and execArgv read a call\'s own text', () => {
  assert.equal(callKind('openat', 'openat(AT_FDCWD</w>, "/a", O_RDONLY|O_APPEND) = 3</a>'), 'write');
  assert.equal(callKind('open', 'open("/a", O_RDONLY|O_DIRECTORY) = 3'), 'opendir');
  assert.equal(callKind('creat', 'creat("/a", 0644) = 3'), 'write');
  assert.equal(callKind('lstat', 'lstat("/a", {...}) = 0'), 'lstat');
  assert.equal(callKind('statx', 'statx(21</a/install.json>, "", AT_STATX_SYNC_AS_STAT|AT_EMPTY_PATH, STATX_ALL, {...}) = 0'), 'fstat');
  assert.equal(callKind('newfstatat', 'newfstatat(3</a>, "", {st_mode=S_IFREG|0644, ...}, AT_EMPTY_PATH) = 0'), 'fstat');
  // A named path with AT_EMPTY_PATH is still looked up.
  assert.equal(callKind('statx', 'statx(AT_FDCWD</w>, "/a", AT_STATX_SYNC_AS_STAT|AT_EMPTY_PATH, STATX_ALL, {...}) = 0'), 'stat');
  assert.equal(callKind('readlink', 'readlink("/a", "b", 4095) = 1'), 'readlink');
  assert.equal(callKind('execveat', 'execveat(3</d>, "x", ["x"], 0x1 /* 0 vars */, 0) = 0'), 'exec');
  assert.deepEqual(execArgv('execveat(3</d>, "x", ["x", "-v"], 0x1 /* 0 vars */, 0) = 0'), ['x', '-v']);
  // An argument vector strace abbreviated is not read as one.
  assert.equal(execArgv('execve("/x", ["x", ...], 0x1 /* 0 vars */) = 0'), null);
  assert.equal(execArgv('execve("/x", 0x7ffd, 0x1) = 0'), null);
});
