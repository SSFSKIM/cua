// The acceptance runner's engine lane (#117 M3.4; scripts/accept/engine-lane.mjs): every reply checked against the
// pinned engine's attestation, the TextEdit fixture's approvals counted per bind and per connection, and the judgments
// accept-native's items 3, 4 and 8 read from doctor, verify and probe-lifecycle. No GUI, no engine, no serve.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  approvalLedger, AttestationRefusal, attestReplies, doctorEngineCheck, lifecycleEngineCheck, verifyChecks,
} from '../scripts/accept/engine-lane.mjs';
import {sendToPausedSession} from '../scripts/accept/key-guard.mjs';
import {NO_PAUSE, pausing} from '../scripts/mini-pause.mjs';

const CUA = {engine: 'cua', version: '0.1.0', build: 'b'.repeat(64)};
const VENDOR = {engine: 'vendor', version: '1.0', build: '26.928.40906'};
const attested = (engine = CUA) => ({result: {content: [], _meta: {'cua/nativeEngine': engine, 'cua/taskId': 't1'}}});

// A session double: js answers from `replies` in turn and records what was sent; the pause wrapper's dispatch too.
function fakeSession(replies, {dispatch = false} = {}) {
  const sent = [];
  const answer = (via, code) => { sent.push([via, code]); return Promise.resolve(replies.shift()); };
  return {sent, js: code => answer('js', code), ...(dispatch ? {dispatch: code => answer('dispatch', code)} : {})};
}

test('every reply that carries a result is checked against the pinned engine; a match passes through', async () => {
  let count = 0;
  const session = attestReplies(fakeSession([attested(), {timedOut: true}, {error: {code: -32603, message: 'x'}}]), {expected: CUA, onAttested: () => count++});
  assert.deepEqual(await session.js('a'), attested());
  assert.deepEqual(await session.js('b'), {timedOut: true}, 'a timed-out reply carries no result to attest');
  assert.deepEqual(await session.js('c'), {error: {code: -32603, message: 'x'}});
  assert.equal(count, 1);
});

test('the first mismatch refuses: it throws, reports once, and nothing more is sent on js or dispatch', async () => {
  const refused = [];
  const session = attestReplies(fakeSession([attested(VENDOR), attested(), attested()], {dispatch: true}), {expected: CUA, onRefused: p => refused.push(p)});
  await assert.rejects(session.dispatch('first'), error => error instanceof AttestationRefusal && /attested engine vendor/.test(error.message));
  await assert.rejects(session.js('second'), AttestationRefusal);
  await assert.rejects(session.dispatch('third'), AttestationRefusal);
  assert.deepEqual(session.sent, [['dispatch', 'first']], 'only the refused call was ever sent');
  assert.equal(refused.length, 1);
});

test('a result with no attestation, or another build, is refused like another engine', async () => {
  for (const meta of [{}, {'cua/nativeEngine': {...CUA, build: 'c'.repeat(64)}}, {'cua/nativeEngine': {...CUA, version: null}}]) {
    const session = attestReplies(fakeSession([{result: {content: [], _meta: meta}}]), {expected: CUA});
    await assert.rejects(session.js('x'), AttestationRefusal, JSON.stringify(meta));
  }
});

test('wrapped after the pause gate, as the TextEdit fixture wraps it, the key guard\'s undelayed dispatch is checked too', async () => {
  const session = attestReplies(pausing(fakeSession([attested(VENDOR)]), NO_PAUSE), {expected: CUA});
  const frontmost = () => 'com.apple.TextEdit';
  await assert.rejects(sendToPausedSession({session, target: 'com.apple.TextEdit', keys: ['typeText'], frontmost, args: ['typed', 1000]}), AttestationRefusal);
  await assert.rejects(session.js('after'), AttestationRefusal, 'and nothing is sent after it');
});

test('with no engine pinned the session is left as it is', async () => {
  const session = fakeSession([attested(VENDOR)]);
  const js = session.js;
  assert.equal(attestReplies(session, {expected: null}).js, js);
});

// ---- approvals by behaviour ----

const approval = (app = 'com.apple.TextEdit', message = 'Allow Computer Use to use "텍스트 편집"?') => ({method: 'elicitation/create', id: 1, params: {
  message, mode: 'form', requestedSchema: {type: 'object', properties: {}},
  _meta: {connector_id: 'computer-use', codex_approval_kind: 'mcp_tool_call', tool_params: {app}},
}});

test('the ledger accepts the app\'s approval only while a bind of that connection runs, and counts it to that bind', () => {
  const ledger = approvalLedger({app: 'com.apple.TextEdit'});
  ledger.begin('connection A');
  assert.deepEqual(ledger.answer('connection A', approval()), {action: 'accept', content: {}}, 'a localized display name is the same approval');
  assert.deepEqual(ledger.answer('connection B', approval()), {action: 'decline'}, 'another connection\'s ask during A\'s bind');
  assert.deepEqual(ledger.answer('connection A', approval('com.apple.Notes')), {action: 'decline'}, 'another app');
  ledger.end();
  assert.deepEqual(ledger.answer('connection A', approval()), {action: 'decline'}, 'outside a bind the connection\'s memory must answer');
  assert.deepEqual(ledger.answer('connection A', {method: 'roots/list', id: 2}), {action: 'decline'}, 'not an elicitation: declined, not counted');
  ledger.begin('connection A');
  ledger.end();
  assert.deepEqual(ledger.connections(), [
    {name: 'connection A', bound: false, binds: [{asked: 1, accepted: 1, error: false}, {asked: 0, accepted: 0, error: false}], declined: 2},
    {name: 'connection B', bound: false, binds: [], declined: 1},
  ]);
});

test('a bind\'s failure and the connection\'s binding are recorded on the ledger\'s entries', () => {
  const ledger = approvalLedger({app: 'com.apple.TextEdit'});
  const bind = ledger.begin('connection A');
  bind.error = true;
  ledger.entry('connection A').bound = true;
  ledger.end();
  assert.deepEqual(ledger.connections(), [{name: 'connection A', bound: true, binds: [{asked: 0, accepted: 0, error: true}], declined: 0}]);
});

// ---- item 3: doctor's engine row ----

const doctorWith = (engineRow, engine) => ({ok: true, checks: [{name: 'repl.host', status: 'pass'}, ...(engineRow ? [{name: 'engine', ...engineRow}] : [])], ...(engine ? {engine} : {})});
const pinned = (engine, pinnedBy = '--engine') => ({engine, pinnedBy});

test('doctor\'s engine row: sessions here drive the pinned engine, judged by the row the engine calls for', () => {
  const cuaReport = {selected: 'cua', preferred: {engine: 'cua', reason: 'explicit'}, build: 'b'.repeat(64), approvedBuild: 'b'.repeat(64),
    permissions: {accessibility: true, screenRecording: true, inputMonitoring: false}};
  const pass = doctorEngineCheck(doctorWith({status: 'warn', detail: 'Input Monitoring missing'}, cuaReport), pinned('cua'));
  assert.equal(pass.status, 'PASS');
  assert.match(pass.detail, /selected cua/);
  assert.match(pass.detail, /inputMonitoring false/);
  assert.equal(doctorEngineCheck(doctorWith({status: 'pass'}, cuaReport), pinned('cua')).status, 'PASS');
  assert.equal(doctorEngineCheck(doctorWith({status: 'fail'}, cuaReport), pinned('cua')).status, 'FAIL', 'Accessibility missing, say');
  assert.equal(doctorEngineCheck(doctorWith({status: 'skip'}, cuaReport), pinned('cua')).status, 'FAIL', 'the cua lane with a skipped row');
  assert.equal(doctorEngineCheck(doctorWith({status: 'warn'}, {...cuaReport, selected: 'vendor'}), pinned('cua')).status, 'FAIL', 'the default\'s fallback: sessions drive the vendor\'s');
  assert.equal(doctorEngineCheck(doctorWith({status: 'fail'}, {...cuaReport, selected: null, refused: {code: 'engine_not_installed'}}), pinned('cua')).status, 'FAIL');

  const vendorReport = {selected: 'vendor', preferred: {engine: 'vendor', reason: 'explicit'}};
  assert.equal(doctorEngineCheck(doctorWith({status: 'skip'}, vendorReport), pinned('vendor')).status, 'PASS');
  assert.equal(doctorEngineCheck(doctorWith({status: 'pass'}, vendorReport), pinned('vendor')).status, 'FAIL', 'a vendor lane whose row reads cua\'s engine in use');
  assert.equal(doctorEngineCheck(doctorWith(null, null), pinned('vendor')).status, 'FAIL', 'no engine row, no report');
  assert.equal(doctorEngineCheck(null, pinned('cua')).status, 'FAIL');
  assert.equal(doctorEngineCheck(doctorWith({status: 'skip'}, null), null), null, 'no engine pinned (off macOS): nothing to judge');
});

// ---- item 4: verify's report ----

const verifyReport = over => ({
  problems: [],
  processes: {host: 'cua', allExecutablesRelocated: null, allExecutablesExpected: true, desktopRuntimePaths: [], ancestry: [{executable: '<host node> bin/cua.mjs serve'}, {executable: '<host node>'}]},
  engine: {engine: 'cua', pinnedBy: '--engine', host: 'cua', expected: CUA, attested: 3, socket: {bound: [], clients: [], unseenClients: 0}, startedFromCuaRoots: [], runningBefore: []},
  ...over,
});
const named = (checks, pattern) => checks.find(c => pattern.test(c.name));

test('item 4 reads verify\'s host-aware tree verdict, which cua\'s own host carries in allExecutablesExpected', () => {
  const own = named(verifyChecks(verifyReport(), pinned('cua')), /executables/);
  assert.equal(own.status, 'PASS', 'allExecutablesRelocated is null on cua\'s own host and must not be read');
  assert.match(own.detail, /cua host/);
  assert.equal(named(verifyChecks(verifyReport({processes: {...verifyReport().processes, allExecutablesExpected: false}}), pinned('cua')), /executables/).status, 'FAIL');
  assert.equal(named(verifyChecks(verifyReport({processes: {...verifyReport().processes, desktopRuntimePaths: ['/Applications/ChatGPT.app/Contents/x']}}), pinned('cua')), /executables/).status, 'FAIL');
  assert.equal(named(verifyChecks(verifyReport({processes: undefined}), pinned('cua')), /executables/).status, 'FAIL');
  const vendorHost = verifyReport({processes: {host: 'vendor', allExecutablesRelocated: true, allExecutablesExpected: true, desktopRuntimePaths: [], ancestry: []}});
  assert.equal(named(verifyChecks(vendorHost, pinned('cua')), /executables/).status, 'PASS');
});

test('item 4 requires verify to have pinned the run\'s engine and every result to have attested it', () => {
  assert.equal(named(verifyChecks(verifyReport(), pinned('cua')), /attest/).status, 'PASS');
  assert.equal(named(verifyChecks(verifyReport({engine: {...verifyReport().engine, engine: 'vendor'}}), pinned('cua')), /attest/).status, 'FAIL', 'verify pinned another engine');
  assert.equal(named(verifyChecks(verifyReport({engine: {...verifyReport().engine, attested: 0}}), pinned('cua')), /attest/).status, 'FAIL', 'nothing attested');
  assert.equal(named(verifyChecks(verifyReport({engine: undefined}), pinned('cua')), /attest/).status, 'FAIL');
  const refused = verifyReport({problems: ['verify failed: refused on the attestation: the result attested engine vendor version 1 build r where engine cua … was expected']});
  assert.equal(named(verifyChecks(refused, pinned('cua')), /attest/).status, 'FAIL');
  const launcher = verifyReport({engine: undefined, problems: ['the launcher refuses this selection: [engine_not_installed] …']});
  assert.match(named(verifyChecks(launcher, pinned('cua')), /attest/).detail, /engine_not_installed/);
  assert.equal(verifyChecks(verifyReport({engine: undefined}), null).some(c => /attest/.test(c.name)), false, 'no engine pinned: no attestation check');
  assert.equal(verifyChecks(null, pinned('cua')).every(c => c.status === 'FAIL'), true, 'no report');
});

// ---- item 8: probe-lifecycle's report ----

const closeRecord = over => ({code: 0, runtimeProcessesAfterExit: 0, leftAfterExit: [], engineSocketHeldAfterExit: [], engineSocketClientsUnseen: 0, ...over});
const lifecycle = over => ({
  engine: {engine: 'cua', pinnedBy: '--engine', host: 'cua', expected: CUA, attested: 9, abandonedUnattested: 1},
  cancelDuringJs: {close: closeRecord()}, endTaskWithWorkInFlight: {close: closeRecord()},
  uncertainCompletion: {exit: {code: 1}, ...closeRecord()}, idleClose: closeRecord(), ...over,
});

test('item 8: probe-lifecycle pinned the run\'s engine, every result attested it, and no closed connection holds cua\'s engine socket', () => {
  assert.equal(lifecycleEngineCheck(lifecycle(), pinned('cua')).status, 'PASS');
  assert.equal(lifecycleEngineCheck(lifecycle({refused: 'refused on the attestation: …'}), pinned('cua')).status, 'FAIL');
  assert.equal(lifecycleEngineCheck(lifecycle({engine: {...lifecycle().engine, engine: 'vendor'}}), pinned('cua')).status, 'FAIL');
  assert.equal(lifecycleEngineCheck(lifecycle({engine: {...lifecycle().engine, attested: 0}}), pinned('cua')).status, 'FAIL');
  assert.equal(lifecycleEngineCheck(lifecycle({engine: undefined}), pinned('cua')).status, 'FAIL');
  for (const count of [0, 2, undefined]) {
    assert.match(lifecycleEngineCheck(lifecycle({engine: {...lifecycle().engine, abandonedUnattested: count}}), pinned('cua')).detail,
      /abandoned call\(s\) accepted unattested where exactly 1/, `abandonedUnattested ${count}`);
  }
  const held = lifecycleEngineCheck(lifecycle({idleClose: closeRecord({engineSocketHeldAfterExit: [4242]})}), pinned('cua'));
  assert.equal(held.status, 'FAIL');
  assert.match(held.detail, /idleClose.*4242/);
  const unseen = lifecycleEngineCheck(lifecycle({cancelDuringJs: {close: closeRecord({engineSocketClientsUnseen: 1})}}), pinned('cua'));
  assert.equal(unseen.status, 'FAIL', 'a connection whose client lsof could not show leaves the release unproven');
  assert.equal(lifecycleEngineCheck(lifecycle({uncertainCompletion: {exit: {code: 1}}}), pinned('cua')).status, 'FAIL', 'a close with no socket reading');
  const vendor = {engine: {engine: 'vendor', pinnedBy: '--engine', host: 'vendor', expected: VENDOR, attested: 9, abandonedUnattested: 1}, idleClose: closeRecord({engineSocketHeldAfterExit: undefined, engineSocketClientsUnseen: undefined})};
  assert.equal(lifecycleEngineCheck(vendor, pinned('vendor')).status, 'PASS', 'the vendor lane has no cua engine socket to read');
  assert.equal(lifecycleEngineCheck(lifecycle(), null), null);
});
