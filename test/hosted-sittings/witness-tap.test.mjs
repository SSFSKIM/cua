// Ruling 1225: before sitting C's matrix runs, R3's witness tap app is built and Input Monitoring granted to it alone
// (ruling 1198's grantDiagnosticListen, widened from the key-route step), on a GitHub-hosted runner only; neither engine
// gets a grant, and the engines' rows are read around it. A tap not built or granted leaves the R3 cells NO VERDICT: the
// step is INFO, never the sitting's verdict, unless its record is missing or the engines' rows changed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CHECKS} from '../../scripts/hosted-sittings/checks.mjs';
import {sittingPlan} from '../../scripts/hosted-sittings/plan.mjs';
import {runWitnessTap} from '../../scripts/hosted-sittings/witness-tap.mjs';

const HOSTED = {RUNNER_ENVIRONMENT: 'github-hosted'};
const rows = list => ({rows: list, bookkeeping: [], columns: ['service', 'client'], full: list.map(r => `${r} ()`)});
function io({env = HOSTED, build = () => ({app: '/A/KeyRouteTap.app', bundleId: 'io.github.ssfskim.cua.key-route-tap'}), grant = () => ({granted: true}), after = rows(['r1'])} = {}) {
  const calls = [], written = {};
  let reads = 0;
  return {calls, written, io: {env, platform: 'darwin',
    engineRows: () => { calls.push('engineRows'); return reads++ ? after : rows(['r1']); },
    buildTap: () => { calls.push('build'); return build(); }, grantTap: app => { calls.push(['grant', app]); return grant(); },
    write: (path, text) => { written[path] = JSON.parse(text); }}};
}

test('the witness tap step builds and grants the tap app alone, the engines\' rows read around it, and records it', () => {
  const {io: given, calls, written} = io();
  assert.equal(runWitnessTap({out: '/o/witness-tap.json'}, given), 0);
  assert.deepEqual(calls, ['engineRows', 'build', ['grant', '/A/KeyRouteTap.app'], 'engineRows']);
  const report = written['/o/witness-tap.json'];
  assert.deepEqual([report.ruling, report.tap.grant, report.tcc.engines.unchanged, report.cleanup], [1225, {granted: true}, true, {ok: true, failures: []}]);
  assert.deepEqual(CHECKS.witnessTap({report: '/o/witness-tap.json'}, {exit: 0, readJson: () => report}), ['INFO', 'R3\'s witness tap built and granted Input Monitoring (ruling 1225)']);
  // A build or grant that failed is recorded: the matrix still runs, its R3 cells NO VERDICT.
  const failed = io({grant: () => { throw new Error('csreq did not compile'); }});
  assert.equal(runWitnessTap({out: '/o/w.json'}, failed.io), 0);
  const unGranted = failed.written['/o/w.json'];
  assert.equal(unGranted.tap.error, 'csreq did not compile');
  assert.deepEqual(CHECKS.witnessTap({report: '/o/w.json'}, {exit: 0, readJson: () => unGranted}),
    ['INFO', 'R3\'s witness tap not ready (csreq did not compile): its cells stay NO VERDICT (ruling 1225)']);
  // The engines' rows changed: a failure, named.
  const changed = io({after: rows(['r1', 'r2'])});
  assert.equal(runWitnessTap({out: '/o/c.json'}, changed.io), 1);
  const [status, reason] = CHECKS.witnessTap({report: '/o/c.json'}, {exit: 1, readJson: () => changed.written['/o/c.json']});
  assert.equal(status, 'FAIL');
  assert.match(reason, /the engines' TCC rows changed/);
  assert.deepEqual(CHECKS.witnessTap({report: '/o/none.json'}, {exit: 1, readJson: () => null}), ['FAIL', 'the witness tap\'s record /o/none.json was not written (exit 1)']);
});

test('off a GitHub-hosted runner the step refuses before it reads, builds or grants anything', () => {
  const {io: given, calls} = io({env: {}});
  assert.throws(() => runWitnessTap({out: '/o/w.json'}, given), /R3's witness tap: refused/);
  assert.deepEqual(calls, []);
});

test('sitting C builds and grants the witness tap before its first matrix run', () => {
  const steps = sittingPlan('c', {commit: 'c'.repeat(40), out: '/w/out', approvedRuntime: '/H', approvedEngine: '/E', runId: '1-1', olderNode: '/n', scratch: '/w/s', flipped: false, pilot: true}).steps;
  const at = id => steps.findIndex(s => s.id === id);
  const step = steps[at('witness-tap')];
  assert.ok(step && at('witness-tap') < at('matrix-vendor-1'), steps.map(s => s.id).join(', '));
  assert.deepEqual([step.kind, step.check, step.report, step.argv.slice(1)], ['diagnostic', 'witnessTap', '/w/out/witness-tap.json', ['scripts/hosted-sittings.mjs', 'witness-tap', '--out', '/w/out/witness-tap.json']]);
});
