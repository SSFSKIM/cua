// What the sitting keeps of a js reply (scripts/cursor-sitting/session.mjs readReply): the cell's answer, the route and
// the attested engine, and the meta the last call carried: its times (the engine's round trip, the wrapper's time, route
// 3's guard and activation click, the action interval and receipt), so a timing difference can be split by where it
// arose, and the intervention guard's reading (hidIdleMs, whether detection ran, what a stopped type_text entered), so a
// refusal can be placed against the person's input.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MARKER} from '../../scripts/native-baseline/cells.mjs';
import {readReply} from '../../scripts/cursor-sitting/session.mjs';

const answer = value => `${MARKER}${JSON.stringify({ok: true, value, inCellMs: 70})}`;
const reply = (meta, text = answer({ms: 60})) => ({result: {content: [{type: 'text', text}], _meta: meta}});

test('a route-3 reply keeps its guard, its activation click and the times around it', () => {
  const read = readReply(reply({
    'cua/inputRoute': 3, 'cua/nativeEngine': {engine: 'cua'}, 'cua/engineMs': 41.2, 'cua/serviceMs': 44.9,
    'cua/activationGuardMs': 33.1, 'cua/activationClick': 'posted', 'cua/actionInterval': {startedAt: 10, endedAt: 12},
    'cua/receivedAt': 5, 'cua/hidIdleMs': 900, 'cua/settle': {capped: true},
  }));
  assert.equal(read.route, 3);
  assert.equal(read.engine, 'cua');
  assert.deepEqual(read.meta, {engineMs: 41.2, serviceMs: 44.9, activationGuardMs: 33.1, activationClick: 'posted',
    actionInterval: {startedAt: 10, endedAt: 12}, receivedAt: 5, hidIdleMs: 900});
  assert.deepEqual(read.value, {ms: 60});
});

test('a reply without timing meta keeps none, and a failed cell keeps what came', () => {
  assert.deepEqual(readReply(reply({'cua/inputRoute': "2'"})).meta, {});
  const failed = readReply(reply({'cua/engineMs': 3}, 'no marker here'));
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.meta, {engineMs: 3});
  assert.deepEqual(readReply({timedOut: true}).meta, {});
});

test('a refusal keeps the intervention guard\'s reading: the time since the last attributed event, and what was entered', () => {
  const text = `${MARKER}${JSON.stringify({ok: false, error: 'Computer Use server error -10016: The user changed …'})}`;
  const refused = readReply(reply({'cua/nativeEngine': {engine: 'cua'}, 'cua/engineMs': null, 'cua/inputRoute': null,
    'cua/actionInterval': {startedAt: 30, endedAt: 2050}, 'cua/receivedAt': 25, 'cua/hidIdleMs': 1840, 'cua/entered': 412}, text));
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.meta, {actionInterval: {startedAt: 30, endedAt: 2050}, receivedAt: 25, hidIdleMs: 1840, entered: 412});
  assert.deepEqual(readReply(reply({'cua/hidIdleMs': 0, 'cua/intervention': 'off'})).meta, {hidIdleMs: 0, intervention: 'off'},
    'with detection off the reading is the machine-wide idle time, and the meta says so');
});
