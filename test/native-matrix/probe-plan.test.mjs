// The probe cells' rules (scripts/native-matrix/probe-plan.mjs; the spec's Verification system part 5): where a probe's
// post must fall for a sample to say anything (inside the action's interval, or before a receipt within the debounce),
// how the next attempt's call is placed from the last one's times, and what a probe's answer says about its post.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {intervalOf, nextPreMs, postValidity, probeProblem, receiptValidity, PROBE_LEAD_MS} from '../../scripts/native-matrix/probe-plan.mjs';

const act = (engine, meta = {}, value = {callAt: 1_000, endAt: 3_000}) => ({engine: {actionInterval: null, receivedAt: null, ...meta}, value});

test('the interval: cua\'s from the engine (cua/actionInterval), the vendor\'s from the cell around the call; none when nothing was posted', () => {
  assert.deepEqual(intervalOf('cua', act('cua', {actionInterval: {startedAt: 1_100, endedAt: 2_900}})), {from: 1_100, to: 2_900, source: 'engine'});
  assert.equal(intervalOf('cua', act('cua', {actionInterval: {startedAt: null, endedAt: null}})), null, 'a refusal before any post has no interval');
  assert.equal(intervalOf('cua', act('cua')), null);
  assert.deepEqual(intervalOf('vendor', act('vendor')), {from: 1_000, to: 3_000, source: 'cell'});
  assert.equal(intervalOf('vendor', act('vendor', {}, {})), null);
});

test('a post outside the interval, or no interval, makes the sample invalid, never a verdict', () => {
  const interval = {from: 1_000, to: 2_000, source: 'engine'};
  assert.equal(postValidity(1_000, interval), null);
  assert.equal(postValidity(2_000, interval), null);
  assert.match(postValidity(999, interval), /1 ms before the action's interval/);
  assert.match(postValidity(2_250, interval), /250 ms after the action's interval/);
  assert.match(postValidity(1_500, null), /no interval/);
  assert.match(postValidity(null, interval), /no post time/);
});

test('the pre-action refusal\'s receipt: after the post and within the debounce (cua\'s cua/receivedAt; the vendor\'s cell call time)', () => {
  assert.equal(receiptValidity({engine: 'cua', postedAt: 10_000, receivedAt: 10_150}), null);
  assert.equal(receiptValidity({engine: 'cua', postedAt: 10_000, receivedAt: 15_000}), null);
  assert.match(receiptValidity({engine: 'cua', postedAt: 10_000, receivedAt: 15_001}), /5001 ms after the post: past the 5000 ms debounce/);
  assert.match(receiptValidity({engine: 'cua', postedAt: 10_000, receivedAt: 9_990}), /before the post/);
  assert.match(receiptValidity({engine: 'cua', postedAt: 10_000, receivedAt: null}), /no cua\/receivedAt/);
  assert.equal(receiptValidity({engine: 'vendor', postedAt: 10_000, callAt: 10_200}), null);
  assert.match(receiptValidity({engine: 'vendor', postedAt: 10_000, callAt: 9_000}), /before the post/);
});

test('the next attempt\'s call lead: the post aimed at the middle of the interval the last attempt measured', () => {
  // The call left at 1_000 and the engine posted from 1_080 to 1_320 (Finder's 240 ms); the probe, scheduled at 1_400,
  // posted 3 ms late: aiming at 1_200, 200 ms after the call, means calling 200 - 3 ms before the scheduled time.
  assert.equal(nextPreMs({callAt: 1_000, interval: {from: 1_080, to: 1_320}, postedAt: 1_403, scheduled: 1_400}), 197);
  assert.equal(nextPreMs({callAt: 1_000, interval: {from: 900, to: 950}, postedAt: 1_400, scheduled: 1_400}), 0, 'never a call after the post\'s time');
  assert.equal(nextPreMs({callAt: 1_000, interval: {from: 1_000, to: 99_000}, postedAt: 1_400, scheduled: 1_400}), PROBE_LEAD_MS - 1_000, 'within the lead');
  assert.equal(nextPreMs({callAt: 1_000, interval: null, postedAt: 1_400, scheduled: 1_400, preMs: 300}), 300, 'nothing measured: the last lead kept');
});

test('a probe that did not post is named from its answer', () => {
  assert.equal(probeProblem({postedAt: 5, units: 2, chars: 2}), null);
  assert.match(probeProblem({postedAt: 5, units: 2, aborted: true}), /front window was not the named one/);
  assert.match(probeProblem({error: 'the front window is not the named one; nothing was sent'}), /did not post: the front window is not the named one/);
  assert.match(probeProblem(undefined), /no answer/);
  assert.equal(probeProblem({selected: true, selectedAt: 7}), null, 'a switch posts nothing and is timed by selectedAt');
  assert.match(probeProblem({selected: false, selectedAt: 7}), /not selected/);
});
