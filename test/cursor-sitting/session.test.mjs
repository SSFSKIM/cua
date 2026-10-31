// What the sitting keeps of a js reply (scripts/cursor-sitting/session.mjs readReply): the cell's answer, the route and
// the attested engine, and the timing meta the last call carried (the engine's round trip, the wrapper's time, route 3's
// guard and activation click, the action interval and receipt), so a timing difference can be split by where it arose.
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
    actionInterval: {startedAt: 10, endedAt: 12}, receivedAt: 5});
  assert.deepEqual(read.value, {ms: 60});
});

test('a reply without timing meta keeps none, and a failed cell keeps what came', () => {
  assert.deepEqual(readReply(reply({'cua/inputRoute': "2'"})).meta, {});
  const failed = readReply(reply({'cua/engineMs': 3}, 'no marker here'));
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.meta, {engineMs: 3});
  assert.deepEqual(readReply({timedOut: true}).meta, {});
});
