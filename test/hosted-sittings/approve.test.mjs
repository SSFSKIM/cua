// The hosted approval (scripts/hosted-sittings/approve.mjs): on a GitHub-hosted runner, cua's engine bundle granted by
// system-database rows, relaunched, then `cua engine approve` run unattended twice (H0: the first approve's own capture
// raises replayd's confirmation and fails engine_capture_confirmation; the second, by the same copy, raises none and
// passes), and the report says so. Every seam is a double: no CLI runs, no TCC row is written.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {engineToApprove, hostedApprove} from '../../scripts/hosted-sittings/approve.mjs';

const HOSTED = {RUNNER_ENVIRONMENT: 'github-hosted'};
const CAPTURE = {ok: false, error: {code: 'engine_capture_confirmation', message: 'a screen capture confirmation for cua Engine may be waiting'}};
const APPROVED = {ok: true, approved: true, build: 'b'.repeat(24), approvedAt: '2026-11-23T00:00:00.000Z', captureConfirmation: 'none', grants: {accessibility: true, screenRecording: true, inputMonitoring: true}};

function doubles({answers = [CAPTURE, APPROVED], bundle = '/h/Library/Application Support/cua/engine/pending/cua Engine.app'} = {}) {
  const calls = [];
  let pass = 0;
  const cli = args => {
    calls.push(['cli', ...args]);
    if (args[1] === 'stop') return {status: 0, stdout: JSON.stringify({ok: true, wasRunning: false}, null, 2)};
    const answer = answers[pass++];
    return {status: answer.ok ? 0 : 1, stdout: JSON.stringify(answer, null, 2)};
  };
  const grant = grants => { calls.push(['grant', grants]); return {decision: 'O0', rows: grants.map(g => ({client: g.client, granted: ['accessibility', 'screenRecording', 'inputMonitoring', 'postEvent']})), missing: []}; };
  return {calls, deps: {env: HOSTED, platform: 'darwin', home: '/h', cli, grant, bundleOf: () => bundle, now: (() => { let t = 0; return () => (t += 1000); })()}};
}

test('rows, then the relaunch, then two passes, in that order; the report names both passes', async () => {
  const {calls, deps} = doubles();
  const report = await hostedApprove(deps);
  assert.deepEqual(calls.map(c => (c[0] === 'grant' ? 'grant' : c.slice(1, 3).join(' '))), ['grant', 'engine stop', 'engine approve', 'engine approve']);
  assert.deepEqual(calls[0][1], [{client: 'io.github.ssfskim.cua.engine', bundle: '/h/Library/Application Support/cua/engine/pending/cua Engine.app'}]);
  assert.deepEqual(report.passes.map(p => ({pass: p.pass, exit: p.exit, approved: p.approved, code: p.code})),
    [{pass: 1, exit: 1, approved: false, code: 'engine_capture_confirmation'}, {pass: 2, exit: 0, approved: true, code: null}]);
  assert.equal(report.approved, true);
  assert.equal(report.build, 'b'.repeat(24));
  assert.equal(report.passes[1].captureConfirmation, 'none');
  assert.equal(report.relaunch.stopped, true);
  assert.match(report.summary, /^approved in two passes: pass 1 engine_capture_confirmation, pass 2 approved/);
});

test('both passes run even when the first approves, and the second must approve too', async () => {
  const both = await hostedApprove(doubles({answers: [APPROVED, APPROVED]}).deps);
  assert.equal(both.passes.length, 2);
  assert.equal(both.approved, true);
  assert.match(both.summary, /pass 1 approved, pass 2 approved/);
  const second = await hostedApprove(doubles({answers: [APPROVED, CAPTURE]}).deps);
  assert.equal(second.approved, false);
  assert.match(second.summary, /^not approved: pass 1 approved, pass 2 engine_capture_confirmation/);
});

test('a missing row stops before any approve: the engine would ask for a grant nobody can give', async () => {
  const {calls, deps} = doubles();
  const report = await hostedApprove({...deps, grant: () => ({decision: 'O0', rows: [], missing: ['io.github.ssfskim.cua.engine accessibility']})});
  assert.equal(report.approved, false);
  assert.deepEqual(report.passes, []);
  assert.match(report.summary, /rows missing: io\.github\.ssfskim\.cua\.engine accessibility/);
  assert.ok(!calls.some(c => c[2] === 'approve'));
});

test('off a GitHub-hosted runner it refuses before any row, relaunch or approve', async () => {
  for (const where of [{env: {}, platform: 'darwin'}, {env: {RUNNER_ENVIRONMENT: 'self-hosted'}, platform: 'darwin'}, {env: HOSTED, platform: 'linux'}]) {
    const {calls, deps} = doubles();
    await assert.rejects(hostedApprove({...deps, ...where}), /refused/);
    assert.deepEqual(calls, []);
  }
});

test('no engine to approve under the home stops before any row', async () => {
  const {calls, deps} = doubles({bundle: null});
  await assert.rejects(hostedApprove(deps), /no engine build to approve/);
  assert.deepEqual(calls, []);
});

test('the bundle approve will approve: the pending slot first, else the bundle at the approved path', () => {
  const home = mkdtempSync(join(tmpdir(), 'hosted-approve-'));
  try {
    const dir = join(home, 'Library/Application Support/cua/engine');
    const plist = build => `<plist><dict><key>CFBundleShortVersionString</key><string>0.2.0</string><key>CUAEngineBuild</key><string>${build}</string></dict></plist>`;
    const place = (path, build) => { mkdirSync(join(path, 'Contents'), {recursive: true}); writeFileSync(join(path, 'Contents/Info.plist'), plist(build)); };
    assert.equal(engineToApprove(home), null);
    place(join(dir, 'cua Engine.app'), 'a1');
    assert.equal(engineToApprove(home), join(dir, 'cua Engine.app'));
    place(join(dir, 'pending/cua Engine.app'), 'b2');
    assert.equal(engineToApprove(home), join(dir, 'pending/cua Engine.app'));
  } finally { rmSync(home, {recursive: true, force: true}); }
});
