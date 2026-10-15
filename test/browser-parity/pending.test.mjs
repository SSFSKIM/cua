// A run's declared pending cases (browser-parity run --pending <ids> --pending-reason <why>): cases an environment
// cannot run now are recorded as such, by name and reason, never silently skipped, and the diff reports them as pending.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PENDING_PREFIX, declarePending, pendingCases} from '../../scripts/browser-parity.mjs';
import {compareRuns} from '../../scripts/browser-parity/compare.mjs';

const scenarios = [{id: 'downloads/media', cells: [{label: 'media'}]}, {id: 'dialogs/alert', cells: [{label: 'alert'}]}];

test('pending cases are marked with the declared reason; nothing else changes', () => {
  const {scenarios: marked, pending} = declarePending(scenarios, {pending: 'downloads/media', reason: 'Downloads consent pending on the device'});
  assert.deepEqual(pending, {cases: ['downloads/media'], reason: 'Downloads consent pending on the device'});
  assert.equal(marked[0].skip, `${PENDING_PREFIX}Downloads consent pending on the device`);
  assert.equal(Object.hasOwn(marked[1], 'skip'), false);
  assert.deepEqual(declarePending(scenarios, {}), {scenarios, pending: null});
});

test('a pending list needs a reason and may name only cases the run selects', () => {
  assert.throws(() => declarePending(scenarios, {pending: 'downloads/media'}), /--pending-reason/);
  assert.throws(() => declarePending(scenarios, {pending: 'downloads/media', reason: '  '}), /--pending-reason/);
  assert.throws(() => declarePending(scenarios, {pending: ' , ', reason: 'x'}), /--pending-reason/);
  assert.throws(() => declarePending(scenarios, {pending: 'downloads/absent', reason: 'x'}), /does not select: downloads\/absent/);
});

test('the diff names pending cases; a case pending on one side only is a difference', () => {
  const row = (id, skip) => ({case: id, skip, assertion: {ok: true}});
  const pending = row('downloads/media', `${PENDING_PREFIX}consent`);
  assert.deepEqual(pendingCases([pending, {case: 'dialogs/alert', cell: 'alert', ok: true, value: 1}]), [{case: 'downloads/media', reason: 'consent'}]);
  assert.equal(compareRuns([pending], [pending]).ok, true);
  const ran = [{case: 'downloads/media', cell: 'media', ok: true, value: 1}, {case: 'downloads/media', assertion: {ok: true}}];
  assert.equal(compareRuns([pending], ran).ok, false);
});
