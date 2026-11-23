// The M6a venue pilot's judges (#171 M6a, T6's wave-0 part; the M6a pre-flight §5.2, "The venue pilot"): doctor's four
// environment rows, the sandbox launcher's row, the strace reader that says whether `strace -f` followed the helper's
// children, and the four answers the pilot gives per leg. Each judge has its negative control here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ARTIFACT_FILES, ENVIRONMENT_ROWS, environmentVerdict, MANDATORY_STEPS, pilotAnswers, pilotVerdict, projectSmoke, rowVerdict} from '../scripts/accept/linux-runtime-pilot.mjs';
import {summarizeTrace, traceVerdict} from '../scripts/accept/linux-trace.mjs';

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
const traced = ({helper = true, kernelCalls = true, kernelUnderHelper = true, worker = true, serve = true, runtimesRead = true, splitExec = false, disconnected = false} = {}) => [
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
].join('\n');

test('a trace that follows the helper\'s children: the serve, the worker, the helper, bubblewrap and the kernel, which went on calling after its exec', () => {
  const summary = summarizeTrace(traced(), {helper: HELPER, home: HOME});
  assert.equal(summary.processes, 7);
  assert.equal(summary.serve, 101);
  assert.deepEqual(summary.workers, [{pid: 102, underServe: true}]);
  assert.deepEqual(summary.helpers, [104, 106]);
  assert.deepEqual(summary.bwrap, [105]);
  assert.deepEqual(summary.kernels, [{pid: 106, underHelper: true, underServe: true, callsAfterExec: 2}]);
  // Measured, not judged by the pilot: the calls of the serve's tree that name a path under the home's runtimes/.
  // The serve's own first calls come before any decoded working directory, but they name no relative path.
  assert.deepEqual(summary.runtimes, {calls: 1, unresolved: 0, complete: true});
  assert.deepEqual(traceVerdict(summary), {pass: true, problems: []});
  assert.deepEqual(summarizeTrace(traced({splitExec: true}), {helper: HELPER, home: HOME}).kernels, [{pid: 106, underHelper: true, underServe: true, callsAfterExec: 2}]);
  assert.deepEqual(summarizeTrace(traced({runtimesRead: false}), {helper: HELPER, home: HOME}).runtimes, {calls: 0, unresolved: 0, complete: true});
});

test('negative control: a worker and a kernel that do not descend from the serve being judged do not pass, however complete they look', () => {
  const summary = summarizeTrace(traced({disconnected: true}), {helper: HELPER, home: HOME});
  assert.deepEqual(summary.workers, [{pid: 102, underServe: false}]);
  assert.equal(summary.kernels[0].underServe, false);
  const verdict = traceVerdict(summary);
  assert.equal(verdict.pass, false);
  assert.match(verdict.problems.join('; '), /no trusted worker under the serve/);
  assert.match(verdict.problems.join('; '), /no kernel under the serve/);
});

// The vendor-tree counter over one process of the serve's tree (-y decodes each descriptor and AT_FDCWD to a path).
const R = `${HOME}/runtimes`;
const counted = (lines, options = {}) => summarizeTrace([`200   execve("/usr/bin/node", ["node", "${REPO}/bin/cua.mjs", "serve"], 0x7ffd /* 4 vars */) = 0`, ...lines].join('\n'), {helper: HELPER, home: HOME, ...options}).runtimes;

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

test('a descriptor -y decodes to something other than a path (a pipe, a socket, an anonymous inode) is neither a path nor unresolved', () => {
  // As the live trace showed it: the trusted worker opening its inherited pipe through /proc/self/fd.
  assert.deepEqual(counted([`200   openat(AT_FDCWD<${HOME}/run/x>, "/proc/self/fd/5", O_WRONLY|O_NONBLOCK|O_CLOEXEC) = 20<pipe:[278631620]>`]), {calls: 0, unresolved: 0, complete: true});
  assert.deepEqual(counted(['200   newfstatat(4<socket:[91]>, "", 0x7ffd, AT_EMPTY_PATH) = 0', '200   fchdir(9<anon_inode:[eventfd]>) = -1 ENOTDIR (Not a directory)']), {calls: 0, unresolved: 0, complete: true});
});

test('negative control: a relative path whose base is unknown leaves the count incomplete, never a clean zero', () => {
  assert.deepEqual(counted(['200   access("runtimes/26", R_OK) = 0']), {calls: 0, unresolved: 1, complete: false});
  assert.deepEqual(counted(['200   openat(5, "lib/x.js", O_RDONLY) = 3']), {calls: 0, unresolved: 1, complete: false});
  // Outside the serve's tree nothing is counted or missed.
  assert.deepEqual(summarizeTrace('300   access("runtimes/26", R_OK) = 0', {helper: HELPER, home: HOME}).runtimes, {calls: 0, unresolved: 0, complete: true});
});

test('a kernel is under the helper by its parents too, when the helper did not exec it in place', () => {
  const summary = summarizeTrace(traced({kernelUnderHelper: false}), {helper: HELPER, home: HOME});
  assert.deepEqual(summary.kernels, [{pid: 106, underHelper: true, underServe: true, callsAfterExec: 2}]);
});

test('a fork inside bubblewrap\'s PID namespace is placed by the pid strace translated, not the namespace\'s own', () => {
  // As strace 6.8 writes it on Ubuntu 24.04: the inner helper forks the kernel, which is pid 2 in the sandbox.
  const lines = traced({kernelUnderHelper: false}).split('\n').map(line => line.replace(/^105   clone\(.*$/, '105   clone(child_stack=NULL, flags=SIGCHLD) = 107'))
    .flatMap(line => (line.startsWith('105   clone') ? [line, `107   execve("${HELPER}", ["codex-linux-sandbox", "--apply-seccomp-then-exec"], 0x7ffd /* 9 vars */) = 0`, '107   fork()                          = 2 /* 106 in strace\'s PID NS */'] : [line]));
  const summary = summarizeTrace(lines.join('\n'), {helper: HELPER, home: HOME});
  assert.deepEqual(summary.kernels, [{pid: 106, underHelper: true, underServe: true, callsAfterExec: 2}]);
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
  const workflow = readFileSync(new URL('../.github/workflows/linux-runtime.yml', import.meta.url), 'utf8');
  const upload = workflow.slice(workflow.indexOf('uses: actions/upload-artifact'));
  const listed = [...upload.matchAll(/\$\{\{ env\.RUN \}\}\/artifact\/([\w.-]+)/g)].map(m => m[1]);
  assert.deepEqual(listed, ARTIFACT_FILES);
  assert.doesNotMatch(upload, /artifact\/\s*$/m, 'no directory upload');
});

test('a smoke\'s projection keeps its status and each step\'s name and status, nothing of its details', () => {
  const projected = projectSmoke({status: 'FAIL', home: '/h', marker: 'cua-f2-1', steps: [{name: 'bind', status: 'PASS', detail: {title: 'fixture.txt - gedit'}}, {name: 'end_task', status: 'FAIL', detail: 'x'}]});
  assert.deepEqual(projected, {status: 'FAIL', steps: [{name: 'bind', status: 'PASS'}, {name: 'end_task', status: 'FAIL'}]});
  assert.equal(projectSmoke(null), null);
});
