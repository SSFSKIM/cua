// The engine-aware pieces of scripts/probe/lib.mjs (#117 M3.3): the engine a lane pins, the attestation check, the
// approval matcher and its observation by behaviour, the own host's process tree, the approved engine's socket holders,
// the processes a session starts from cua's own roots, and what a closed connection leaves running.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  approvalsByBehaviour, attestationProblem, boundedError, classifyOwnHostTree, cuaRootProcesses, descendants, engineSocketHolders,
  isAppApproval, leftoverProcesses, pinnedEngine, psRows, runningPid,
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

test('the approved engine\'s socket is held by that engine and by cua\'s Node, nothing else', () => {
  const lsofHolders = [{pid: 700, executable: ENGINE_EXE}, {pid: 1005, executable: OWN_NODE}];
  const mayConnect = executable => [HOST_NODE, OWN_NODE].includes(executable);
  const ok = engineSocketHolders(lsofHolders, {engineExecutable: ENGINE_EXE, mayConnect, requireEngine: true});
  assert.deepEqual(ok, {engine: [700], clients: [1005], problems: []});

  const foreign = engineSocketHolders([{pid: 701, executable: '/tmp/elsewhere/cua Engine.app/Contents/MacOS/cua-engine'}, {pid: 9, executable: '/usr/bin/nc'}],
    {engineExecutable: ENGINE_EXE, mayConnect, requireEngine: true});
  assert.deepEqual(foreign.engine, []);
  assert.deepEqual(foreign.problems, [
    'pid 701 /tmp/elsewhere/cua Engine.app/Contents/MacOS/cua-engine holds the engine socket, which only the approved engine and cua\'s Node may',
    'pid 9 /usr/bin/nc holds the engine socket, which only the approved engine and cua\'s Node may',
    'no approved engine holds the engine socket',
  ]);
  assert.deepEqual(engineSocketHolders([], {engineExecutable: ENGINE_EXE, mayConnect, requireEngine: false}), {engine: [], clients: [], problems: []},
    'with nothing bound the engine need not be running');
  assert.match(engineSocketHolders([{pid: 700, executable: ENGINE_EXE}, {pid: 702, executable: ENGINE_EXE}], {engineExecutable: ENGINE_EXE, mayConnect, requireEngine: true}).problems[0],
    /2 engine processes \(700, 702\) hold the engine socket/);
  // lsof lists a pid once per descriptor: one engine holding the listener and an accepted connection is one engine.
  assert.deepEqual(engineSocketHolders([{pid: 700, executable: ENGINE_EXE}, {pid: 700, executable: ENGINE_EXE}], {engineExecutable: ENGINE_EXE, mayConnect, requireEngine: true}).problems, []);
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

test('a running app\'s pid is read from lsappinfo; nothing means not running', () => {
  assert.equal(runningPid('"pid"=24364\n'), 24364);
  assert.equal(runningPid(''), null);
  assert.equal(runningPid('"pid"=0'), null);
});
