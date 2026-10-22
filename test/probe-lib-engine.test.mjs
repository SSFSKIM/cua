// The engine-aware pieces of scripts/probe/lib.mjs (#117 M3.3): the engine a lane pins, the attestation check, the
// approval matcher and its observation by behaviour, the own host's process tree, the approved engine's socket holders,
// the processes a session starts from cua's own roots, and what a closed connection leaves running.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  approvalsByBehaviour, attestationProblem, boundedError, classifyOwnHostTree, cuaRootProcesses, descendants, engineSocketPeers,
  bindRefusal, isAppApproval, isLifecycleRejection, leftoverProcesses, resultAttestation, abandonedCountProblem, lsappinfoPid, pinnedEngine, psRows, unixSocketEnds, unixSockets,
} from '../scripts/probe/lib.mjs';

const HOME = '/Users/u';
const CUA_HOME = `${HOME}/Library/Application Support/cua`;
const ENGINE_DIR = `${CUA_HOME}/engine`;
const ENGINE_EXE = `${ENGINE_DIR}/cua Engine.app/Contents/MacOS/cua-engine`;
const RUNTIME_ROOT = `${CUA_HOME}/runtimes/26.928.40906-darwin-arm64`;
const HOST_NODE = `${HOME}/.nvm/versions/node/v22.23.2/bin/node`;
const OWN_NODE = `${CUA_HOME}/node/24.11.0/bin/node`;
const PINNED_HELPER = `${RUNTIME_ROOT}/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService`;
const DESKTOP_HELPER = '/Applications/ChatGPT.app/Contents/Resources/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService';
const SANDBOX_EXEC = '/usr/bin/sandbox-exec';

// A cua-engine session on cua's own host, as `ps -axo pid=,ppid=,comm=` prints it (comm is argv[0], spaces included).
const PS = [
  '    1     0 /sbin/launchd',
  `  700     1 ${ENGINE_EXE}`,
  `  710     1 ${DESKTOP_HELPER}`,
  `  900   800 ${HOST_NODE}`,
  ` 1000   900 ${HOST_NODE}`,
  ` 1001  1000 ${HOST_NODE}`,
  ` 1002  1001 ${OWN_NODE}`,
  ` 1003  1002 ${OWN_NODE}`,
  ` 1004  1003 ${SANDBOX_EXEC}`,
  ` 1005  1002 ${OWN_NODE}`,
].join('\n');

test('ps rows keep executable paths with spaces, and descendants still walk from the root', () => {
  const rows = psRows(PS);
  assert.equal(rows.length, 10);
  assert.deepEqual(rows[1], {pid: 700, ppid: 1, executable: ENGINE_EXE});
  assert.deepEqual(descendants(PS, 1000).map(p => p.pid), [1000, 1001, 1002, 1003, 1005, 1004]);
});

test('a lane pins its engine: --engine, else CUA_NATIVE_ENGINE, else the default; anything else is refused', () => {
  assert.deepEqual(pinnedEngine({flag: 'cua', env: {CUA_NATIVE_ENGINE: 'vendor'}, defaultEngine: 'vendor'}), {engine: 'cua', pinnedBy: '--engine'});
  assert.deepEqual(pinnedEngine({env: {CUA_NATIVE_ENGINE: 'cua'}, defaultEngine: 'vendor'}), {engine: 'cua', pinnedBy: 'CUA_NATIVE_ENGINE'});
  assert.deepEqual(pinnedEngine({env: {CUA_NATIVE_ENGINE: ''}, defaultEngine: 'vendor'}), {engine: 'vendor', pinnedBy: 'default'}, 'empty reads as unset, as the launcher reads it');
  assert.deepEqual(pinnedEngine({env: {}, defaultEngine: 'cua'}), {engine: 'cua', pinnedBy: 'default'});
  assert.throws(() => pinnedEngine({flag: 'sky', env: {}, defaultEngine: 'vendor'}), /--engine must be vendor or cua/);
  assert.throws(() => pinnedEngine({env: {CUA_NATIVE_ENGINE: 'Cua'}, defaultEngine: 'vendor'}), /CUA_NATIVE_ENGINE must be vendor or cua/);
});

test('only a pre-dispatch lifecycle rejection is exempt from the attestation; in-flight failures never are', () => {
  // As src/mcp/server.mjs rejectionResult builds it: isError, {status: 'error', code}, no _meta.
  const rejection = code => ({isError: true, structuredContent: {status: 'error', code}, content: [{type: 'text', text: `cua: ${code}`}]});
  const expected = {engine: 'cua', version: '0.1.0', build: 'b74949b3aa'};
  const refused = result => !isLifecycleRejection(result) && attestationProblem(result?._meta, expected);
  for (const code of ['task_ending', 'cancelled']) assert.equal(refused(rejection(code)), false, `${code} with no cua/taskId is exempt`);
  for (const code of ['connection_failed', 'connection_closing', 'completion_timeout', 'completion_failed']) {
    assert.match(refused(rejection(code)), /no cua\/nativeEngine attestation/, `${code} can reject in-flight work: not exempt`);
  }
  assert.match(refused({content: [{type: 'text', text: 'ok'}]}), /no cua\/nativeEngine attestation/, 'a runtime result with no attestation');
  assert.match(refused({...rejection('task_ending'), _meta: {'cua/taskId': 't1'}}), /no cua\/nativeEngine attestation/,
    'a result with cua/taskId, isError and code task_ending, but no attestation, still refuses: the runtime answered it');
  assert.match(refused(rejection('some_other_code')), /no cua\/nativeEngine attestation/, 'an unknown code');
  assert.match(refused({structuredContent: {status: 'error', code: 'task_ending'}}), /no cua\/nativeEngine attestation/, 'not an error');
  assert.match(refused({isError: true, structuredContent: {status: 'ok', code: 'task_ending'}}), /no cua\/nativeEngine attestation/, 'not status error');
  assert.equal(isLifecycleRejection(undefined), false);
});

test('a call declared abandoned may end in the connection\'s failure unattested; nothing else may', () => {
  const rejection = code => ({isError: true, structuredContent: {status: 'error', code}});
  const expected = {engine: 'cua', version: '0.1.0', build: 'b74949b3aa'};
  const abandoned = {abandoned: true};
  for (const code of ['connection_failed', 'connection_closing']) {
    assert.deepEqual(resultAttestation(rejection(code), expected, abandoned), {kind: 'abandoned', problem: null}, code);
    assert.match(resultAttestation(rejection(code), expected).problem, /no cua\/nativeEngine attestation/, `${code}, undeclared`);
  }
  for (const code of ['completion_timeout', 'completion_failed']) {
    assert.match(resultAttestation(rejection(code), expected, abandoned).problem, /no cua\/nativeEngine attestation/, `${code}, even declared`);
  }
  assert.match(resultAttestation({...rejection('connection_failed'), _meta: {'cua/taskId': 't1'}}, expected, abandoned).problem,
    /no cua\/nativeEngine attestation/, 'with cua/taskId the runtime answered it: it must attest');
  assert.match(resultAttestation(rejection('some_other_code'), expected, abandoned).problem, /no cua\/nativeEngine attestation/);
  assert.match(resultAttestation({content: []}, expected, abandoned).problem, /no cua\/nativeEngine attestation/, 'an answer, not a rejection');
  assert.deepEqual(resultAttestation(rejection('task_ending'), expected), {kind: 'rejected', problem: null});
  assert.deepEqual(resultAttestation({_meta: {'cua/nativeEngine': {...expected}, 'cua/taskId': 't1'}}, expected), {kind: 'attested', problem: null});
  assert.match(resultAttestation({_meta: {'cua/nativeEngine': {...expected, build: 'x'}, 'cua/taskId': 't1'}}, expected, abandoned).problem, /build x/);
});

test('probe-lifecycle passes only with exactly one abandoned call accepted unattested', () => {
  const engine = {engine: 'cua', expected: {engine: 'cua', version: '0.1.0', build: 'b'}, attested: 6};
  assert.match(abandonedCountProblem({...engine, abandonedUnattested: 0}), /0 abandoned call\(s\) .* exactly 1/);
  assert.equal(abandonedCountProblem({...engine, abandonedUnattested: 1}), null);
  assert.match(abandonedCountProblem({...engine, abandonedUnattested: 2}), /2 abandoned call\(s\)/);
  assert.match(abandonedCountProblem({...engine}), /no abandoned call\(s\)/);
  assert.equal(abandonedCountProblem({...engine, expected: null, abandonedUnattested: 0}), null, 'nothing attested: nothing to count');
  assert.equal(abandonedCountProblem(undefined), null, 'no engine pinned');
});

test('the attestation must name the pinned engine with the expected version and build, on every result', () => {
  const expected = {engine: 'cua', version: '0.1.0', build: 'b74949b3aa'};
  assert.equal(attestationProblem({'cua/nativeEngine': {...expected}}, expected), null);
  assert.match(attestationProblem({}, expected), /no cua\/nativeEngine attestation/);
  assert.match(attestationProblem(undefined, expected), /no cua\/nativeEngine attestation/);
  assert.match(attestationProblem({'cua/nativeEngine': {engine: 'vendor', version: '26.924.1001281', build: '26.928.40906-darwin-arm64'}}, expected),
    /attested engine vendor .* where engine cua .* was expected/);
  assert.match(attestationProblem({'cua/nativeEngine': {...expected, build: 'other'}}, expected), /build other/);
  // The vendor's attestation carries a null version when the helper's plist is unreadable; the same reading is expected.
  const vendor = {engine: 'vendor', version: null, build: '26.928.40906-darwin-arm64'};
  assert.equal(attestationProblem({'cua/nativeEngine': {...vendor}}, vendor), null);
});

const approval = (app, overrides = {}) => ({
  jsonrpc: '2.0', id: 7, method: 'elicitation/create',
  params: {
    message: 'Allow Computer Use to use "TextEdit"?', mode: 'form', requestedSchema: {type: 'object', properties: {}},
    _meta: {codex_approval_kind: 'mcp_tool_call', connector_id: 'computer-use', connector_name: 'Computer Use', persist: ['session'], riskLevel: 'low',
      tool_name: 'get_app_state', tool_params: {app}, tool_params_display: [{name: 'app', display_name: 'App', value: 'TextEdit'}]},
    ...overrides,
  },
});

test('the approval matcher takes exactly the policy\'s request for the named bundle and nothing else', () => {
  assert.equal(isAppApproval(approval('com.apple.TextEdit'), 'com.apple.TextEdit'), true);
  assert.equal(isAppApproval(approval('com.apple.finder'), 'com.apple.TextEdit'), false, 'another app');
  assert.equal(isAppApproval({...approval('com.apple.TextEdit'), method: 'sampling/createMessage'}, 'com.apple.TextEdit'), false);
  assert.equal(isAppApproval(approval('com.apple.TextEdit', {mode: 'url'}), 'com.apple.TextEdit'), false);
  assert.equal(isAppApproval(approval('com.apple.TextEdit', {requestedSchema: {type: 'object', properties: {ok: {type: 'boolean'}}}}), 'com.apple.TextEdit'), false,
    'a form asking for a field is not the approval');
  assert.equal(isAppApproval(approval('com.apple.TextEdit', {message: 'Allow something else?'}), 'com.apple.TextEdit'), false);
  const other = approval('com.apple.TextEdit');
  other.params._meta = {...other.params._meta, connector_id: 'browser-use'};
  assert.equal(isAppApproval(other, 'com.apple.TextEdit'), false, 'another connector');
  const extra = approval('com.apple.TextEdit');
  extra.params._meta = {...extra.params._meta, tool_params: {app: 'com.apple.TextEdit', path: '/tmp/x'}};
  assert.equal(isAppApproval(extra, 'com.apple.TextEdit'), false, 'tool parameters beyond the app');
});

test('approvals by behaviour: one ask on a connection\'s first bind, none on later binds, every connection asking again', () => {
  const asked = (n, accepted = n) => ({asked: n, accepted, error: false});
  const ok = approvalsByBehaviour([{name: 'connection', binds: [asked(1), asked(0)], declined: 0}]);
  assert.equal(ok.ok, true, ok.problems.join('; '));
  assert.match(ok.detail, /connection: 2 binds, asked 1, 0; accepted 1, 0; declined 0/);
  assert.equal(approvalsByBehaviour([{name: 'A', binds: [asked(1)], declined: 0}, {name: 'B', binds: [asked(1), asked(0)], declined: 0}]).ok, true);

  const silentFirst = approvalsByBehaviour([{name: 'B', binds: [asked(0)], declined: 0}]);
  assert.equal(silentFirst.ok, false);
  assert.match(silentFirst.problems[0], /B: the first bind asked nothing/);
  assert.match(approvalsByBehaviour([{name: 'A', binds: [asked(1), asked(1)], declined: 0}]).problems[0], /A: bind 2 asked 1 time/);
  assert.match(approvalsByBehaviour([{name: 'A', binds: [asked(2)], declined: 0}]).problems[0], /A: the first bind asked 2 times/);
  assert.match(approvalsByBehaviour([{name: 'A', binds: [asked(1, 0)], declined: 0}]).problems[0], /A: bind 1 asked 1, accepted 0/);
  assert.match(approvalsByBehaviour([{name: 'A', binds: [{asked: 1, accepted: 1, error: true}], declined: 0}]).problems[0], /A: bind 1 failed/);
  assert.match(approvalsByBehaviour([{name: 'A', binds: [asked(1)], declined: 2}]).problems[0], /A: 2 other requests declined/);
  assert.match(approvalsByBehaviour([{name: 'A', binds: [], declined: 0}]).problems[0], /A: no bind ran/);
  assert.match(approvalsByBehaviour([]).problems[0], /no connection ran/);
});

test('the own host\'s tree runs only cua\'s Node and the system sandbox launcher', () => {
  const tree = descendants(PS, 1002);
  const clean = classifyOwnHostTree(tree, {cuaNodes: [HOST_NODE, OWN_NODE], systemSandbox: [SANDBOX_EXEC], vendorRoot: RUNTIME_ROOT});
  assert.deepEqual(clean, {allExecutablesExpected: true, vendorRuntime: [], unexpected: []});
  const vendored = [...tree, {pid: 1006, ppid: 1002, executable: `${RUNTIME_ROOT}/cua_node/bin/node_repl`}, {pid: 1007, ppid: 1002, executable: '/usr/bin/python3'}];
  const dirty = classifyOwnHostTree(vendored, {cuaNodes: [HOST_NODE, OWN_NODE], systemSandbox: [SANDBOX_EXEC], vendorRoot: RUNTIME_ROOT});
  assert.equal(dirty.allExecutablesExpected, false);
  assert.deepEqual(dirty.vendorRuntime.map(p => p.pid), [1006]);
  assert.deepEqual(dirty.unexpected.map(p => p.pid), [1006, 1007]);
  assert.equal(classifyOwnHostTree([], {cuaNodes: [OWN_NODE], vendorRoot: RUNTIME_ROOT}).allExecutablesExpected, false, 'no process is no evidence');
  assert.equal(classifyOwnHostTree([{pid: 1, ppid: 0, executable: SANDBOX_EXEC}], {cuaNodes: [OWN_NODE], systemSandbox: [SANDBOX_EXEC], vendorRoot: RUNTIME_ROOT}).allExecutablesExpected, false,
    'a tree of nothing but the launcher is no host');
});

// `lsof -U -F pcfdn` as macOS prints it, read off a real listener and a connected child (2026-10-21): the listener and
// the connection it accepted are both named by the socket's path, and the client's end is unbound, named only by its
// peer, `->` the accepted end's address. A listing filtered by the path therefore shows the server alone.
const SOCKET = `${ENGINE_DIR}/engine.sock`;
const LSOF_U = [
  'p700', 'ccua-engine',
  'f3', 'd0x4eb20eed28506f1e', `n${SOCKET}`,
  'f7', 'd0xfe6fd7ee79b7b265', `n${SOCKET}`,
  'f9', 'd0x1111111111111111', `n${SOCKET}`,
  'f11', 'd0xe47543d1e1de5cd8', 'n->0xce367bd1c7749fc0',
  'p1005', 'cnode',
  'f12', 'd0x2b5e2aae92763c34', 'n->0xfe6fd7ee79b7b265',
  'p4242', 'cnc',
  'f5', 'd0x3333333333333333', 'n->0x1111111111111111',
  'p77', 'cother',
  'f4', 'd0x5555555555555555', 'n/tmp/elsewhere.sock',
].join('\n');

test('unix sockets are read from lsof\'s field output, one entry per descriptor', () => {
  const sockets = unixSockets(LSOF_U);
  assert.equal(sockets.length, 7);
  assert.deepEqual(sockets[0], {pid: 700, command: 'cua-engine', fd: '3', device: '0x4eb20eed28506f1e', name: SOCKET});
  assert.deepEqual(sockets[4], {pid: 1005, command: 'node', fd: '12', device: '0x2b5e2aae92763c34', name: '->0xfe6fd7ee79b7b265'});
});

test('a socket\'s ends: what is bound at its path, and every client whose peer is one of those, matched by address', () => {
  const ends = unixSocketEnds(unixSockets(LSOF_U), SOCKET);
  assert.deepEqual(ends.bound.map(e => [e.pid, e.fd]), [[700, '3'], [700, '7'], [700, '9']]);
  assert.deepEqual(ends.clients.map(e => [e.pid, e.fd]), [[1005, '12'], [4242, '5']]);
  assert.equal(ends.unseen, 0, 'every accepted end has its client; the one left is the listener');
  // The path-filtered listing (the bound ends only) cannot prove there is no other client: two accepted ends with no
  // visible client are two connections whose clients are unseen.
  const pathOnly = unixSockets(LSOF_U).filter(s => s.name === SOCKET);
  assert.equal(unixSocketEnds(pathOnly, SOCKET).unseen, 2);
  assert.deepEqual(unixSocketEnds([], SOCKET), {bound: [], clients: [], unseen: 0});
});

test('the approved engine\'s socket: bound by that engine alone, connected to by cua\'s Node alone, every client seen', () => {
  const executables = new Map([[700, ENGINE_EXE], [1005, OWN_NODE], [4242, '/usr/bin/nc']]);
  const mayConnect = executable => [HOST_NODE, OWN_NODE].includes(executable);
  const options = {engineExecutable: ENGINE_EXE, mayConnect, executableOf: pid => executables.get(pid), requireEngine: true};
  const sockets = unixSockets(LSOF_U);

  const allowed = engineSocketPeers(unixSocketEnds(sockets.filter(s => s.pid !== 4242 && s.device !== '0x1111111111111111'), SOCKET), options);
  assert.deepEqual(allowed, {engine: [700], clients: [1005], problems: []});

  // A deliberately disallowed client: nc connected to the engine.
  const disallowed = engineSocketPeers(unixSocketEnds(sockets, SOCKET), options);
  assert.deepEqual(disallowed.clients, [1005]);
  assert.deepEqual(disallowed.problems, ['pid 4242 /usr/bin/nc is connected to the engine socket, which only cua\'s Node may']);

  // The same session seen through the path alone is never clean: its clients are unproven.
  const pathOnly = engineSocketPeers(unixSocketEnds(sockets.filter(s => s.name === SOCKET), SOCKET), options);
  assert.deepEqual(pathOnly.problems, ['2 connections to the engine socket whose clients lsof does not show: the clients are unproven']);

  const foreign = engineSocketPeers({bound: [{pid: 701, fd: '3'}, {pid: 9, fd: '4'}], clients: [], unseen: 0},
    {...options, executableOf: pid => ({701: '/tmp/elsewhere/cua Engine.app/Contents/MacOS/cua-engine', 9: '/usr/bin/nc'})[pid]});
  assert.deepEqual(foreign.problems, [
    'pid 701 /tmp/elsewhere/cua Engine.app/Contents/MacOS/cua-engine holds the engine socket\'s address, which only the approved engine may',
    'pid 9 /usr/bin/nc holds the engine socket\'s address, which only the approved engine may',
    'no approved engine holds the engine socket',
  ]);
  assert.deepEqual(engineSocketPeers({bound: [], clients: [], unseen: 0}, {...options, requireEngine: false}), {engine: [], clients: [], problems: []},
    'with nothing bound the engine need not be running');
  assert.match(engineSocketPeers({bound: [{pid: 700, fd: '3'}, {pid: 702, fd: '3'}], clients: [], unseen: 0}, {...options, executableOf: () => ENGINE_EXE}).problems[0],
    /2 engine processes \(700, 702\) hold the engine socket/);
});

test('processes started from cua\'s roots during a session are cua-engine and cua\'s Node only; earlier ones and other installations\' are not counted', () => {
  const roots = [CUA_HOME, ENGINE_DIR];
  const allowed = [ENGINE_EXE, HOST_NODE, OWN_NODE];
  const before = psRows(PS).filter(p => p.pid === 700 || p.pid === 710);
  const during = [...psRows(PS), {pid: 1100, ppid: 1, executable: PINNED_HELPER}, {pid: 1101, ppid: 1002, executable: `${RUNTIME_ROOT}/cua_node/bin/node_repl`},
    {pid: 1102, ppid: 1, executable: DESKTOP_HELPER}];
  const verdict = cuaRootProcesses({before, during, roots, allowed});
  assert.deepEqual(verdict.preExisting.map(p => p.pid), [700]);
  assert.deepEqual(verdict.started.map(p => p.pid), [1002, 1003, 1005, 1100, 1101]);
  assert.deepEqual(verdict.problems, [
    `pid 1100 ${PINNED_HELPER} started from cua's home during the session; only cua-engine and cua's Node may`,
    `pid 1101 ${RUNTIME_ROOT}/cua_node/bin/node_repl started from cua's home during the session; only cua-engine and cua's Node may`,
  ]);
  // A pid reused by another executable is a new process.
  const reused = cuaRootProcesses({before: [{pid: 1100, ppid: 1, executable: OWN_NODE}], during: [{pid: 1100, ppid: 1, executable: PINNED_HELPER}], roots, allowed});
  assert.equal(reused.problems.length, 1);
  // A root is a directory: a sibling whose name only starts with it is outside.
  assert.deepEqual(cuaRootProcesses({before: [], during: [{pid: 5, ppid: 1, executable: `${CUA_HOME}-other/bin/x`}], roots, allowed}).started, []);
});

test('a closed connection leaves nothing: neither its observed tree nor anything running from the vendor runtime', () => {
  const observed = descendants(PS, 1000).filter(p => p.pid !== 1000);
  const alive = new Set([1005]);
  const after = [`  1005  1002 ${OWN_NODE}`, `  1200     1 ${RUNTIME_ROOT}/cua_node/bin/node`, `  700     1 ${ENGINE_EXE}`].join('\n');
  assert.deepEqual(leftoverProcesses({observed, isAlive: pid => alive.has(pid), psText: after, runtimeRoot: RUNTIME_ROOT}).map(p => p.pid), [1005, 1200],
    'the resident engine is not the connection\'s');
  assert.deepEqual(leftoverProcesses({observed, isAlive: () => false, psText: `  700     1 ${ENGINE_EXE}`, runtimeRoot: RUNTIME_ROOT}), []);
  // A survivor that also runs from the runtime root is counted once.
  const vendorTree = [{pid: 1300, ppid: 1001, executable: `${RUNTIME_ROOT}/cua_node/bin/node_repl`}];
  assert.deepEqual(leftoverProcesses({observed: vendorTree, isAlive: () => true, psText: ` 1300  1001 ${RUNTIME_ROOT}/cua_node/bin/node_repl`, runtimeRoot: RUNTIME_ROOT}).map(p => p.pid), [1300]);
});

test('an error sentence is reported bounded, first line only, quoted names elided', () => {
  assert.equal(boundedError('Computer Use was not approved to use "TextEdit"\n    at x (y.mjs:1:1)'), 'Computer Use was not approved to use "…"');
  assert.equal(boundedError('The user changed \'TextEdit\'. Window: "secret plan.txt"'), 'The user changed \'…\'. Window: "…"');
  assert.equal(boundedError('x'.repeat(500)).length, 200);
  assert.equal(boundedError(undefined), '');
});

test('a running app\'s pid is read from lsappinfo in either of its forms; nothing means not running', () => {
  assert.equal(lsappinfoPid('"pid"=24364\n'), 24364, 'macOS 26');
  assert.equal(lsappinfoPid('pid = 736\n'), 736, 'the unquoted form');
  assert.equal(lsappinfoPid('"LSDisplayName"="Finder" ASN:0x0-0x15ed6ec1: pid = 736 type="Foreground"'), 736, 'inside a full info line');
  assert.equal(lsappinfoPid('"parentpid"=1 '), null, 'another key ending in pid is not the pid');
  assert.equal(lsappinfoPid(''), null);
  assert.equal(lsappinfoPid('"pid"=0'), null);
});

test('a bind may observe the app only while the window server shows its windows, the same ones before each bind', () => {
  const app = 'com.apple.TextEdit';
  const windows = [{ownerPid: 501, number: 88, onScreen: true}, {ownerPid: 501, number: 91, onScreen: true}];
  assert.equal(bindRefusal({app, pid: 501, windows}), null, 'the first bind: running, with a window');
  assert.match(bindRefusal({app, pid: null, windows: null}), /com\.apple\.TextEdit is not running/);
  assert.match(bindRefusal({app, pid: 501, windows: []}), /com\.apple\.TextEdit \(pid 501\) has no window: .*reopen.*Open panel/,
    'running with no window: an observation would reopen it and capture its panel');
  assert.match(bindRefusal({app, pid: 501, windows: null}), /the window server's windows of com\.apple\.TextEdit \(pid 501\) could not be read/);
  const first = {pid: 501, windows};
  assert.equal(bindRefusal({app, pid: 501, windows: [...windows].reverse(), first}), null, 'the same windows, in another order');
  assert.equal(bindRefusal({app, pid: 501, windows: [...windows, {ownerPid: 501, number: 95}], first}), null, 'a window added beside them');
  assert.match(bindRefusal({app, pid: 501, windows: [windows[0]], first}), /window 91 of com\.apple\.TextEdit read before the first bind is gone/);
  assert.match(bindRefusal({app, pid: 501, windows: [windows[0], {ownerPid: 501, number: 92}], first}), /window 91 .* is gone/, 'a window replaced');
  assert.match(bindRefusal({app, pid: 777, windows: [{ownerPid: 777, number: 88}], first}), /com\.apple\.TextEdit is now pid 777, not the pid 501 read before the first bind/);
  assert.match(bindRefusal({app, pid: 501, windows: [], first}), /has no window/, 'the first rules still hold before the second bind');
  const offScreen = [{ownerPid: 501, number: 88, onScreen: false}, {ownerPid: 501, number: 91, onScreen: false}];
  assert.match(bindRefusal({app, pid: 501, windows: offScreen}), /com\.apple\.TextEdit \(pid 501\) has no window on screen \(2 off screen: minimized, on another Space or hidden\)/,
    'only off-screen windows: a minimized document or a helper window is not the scene');
  assert.match(bindRefusal({app, pid: 501, windows: offScreen, first}), /has no window on screen/, 'nor before the second bind');
  assert.equal(bindRefusal({app, pid: 501, windows: [{...windows[0], onScreen: false}, windows[1]], first}), null,
    'the first window now off screen while another is on screen: every window still there, one on screen');
});
