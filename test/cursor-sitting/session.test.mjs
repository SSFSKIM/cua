// What the sitting keeps of a js reply (scripts/cursor-sitting/session.mjs readReply): the cell's answer, the route and
// the attested engine, and the meta the last call carried: its times (the engine's round trip, the wrapper's time, route
// 3's guard and activation click, the action interval and receipt), so a timing difference can be split by where it
// arose, and the intervention guard's reading (hidIdleMs, whether detection ran, what a stopped type_text entered), so a
// refusal can be placed against the person's input.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FIRST, MARKER} from '../../scripts/native-baseline/cells.mjs';
import {openDriven, readReply} from '../../scripts/cursor-sitting/session.mjs';

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

test('an observation keeps its own diagnostics (#244: the role read, the prior, the web area\'s wait)', () => {
  const observation = {appRoleReadMs: 0.4, enablementPrior: 'owned', webAreaFound: true, webAreaWaitMs: 312};
  assert.deepEqual(readReply(reply({'cua/nativeEngine': {engine: 'cua'}, 'cua/engineMs': 120, 'cua/observation': observation})).meta, {engineMs: 120, observation});
});

// A session whose serve is a fake: what each opening sends.
async function opened(bind) {
  const sent = [];
  const fake = () => ({initialize: async () => {}, terminate: async () => {}, close: async () => {}, call: async () => ({}),
    js: async code => { sent.push(code); return reply({'cua/nativeEngine': {engine: 'cua'}}, answer({ready: true})); }});
  const scene = {id: 'electron', app: '/c/F.app', pid: 7, at: 1, window: {number: 5}};
  const session = await openDriven({name: 's', engine: 'cua', env: {}, scenes: [scene], guard: {problem: () => null, frontmost: () => null}, open: fake, ...(bind === undefined ? {} : {bind})});
  return {sent, session};
}

test('a session opened with bind false sends only its first cell, and its scene is still one a cell may act on', async () => {
  const bound = await opened(undefined);
  assert.equal(bound.sent.length, 2, 'the default binds the scene: an observation before any cell');
  assert.match(bound.sent[1], /cua\.getApp\("\/c\/F\.app"\)/);
  const bare = await opened(false);
  assert.deepEqual(bare.sent, [FIRST]);
  assert.equal((await bare.session.run('/* cursor-sitting:scene electron */ 1')).ok, true, 'the guard knows the scene');
});
