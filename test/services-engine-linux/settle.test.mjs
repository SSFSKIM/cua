// The action settle (src/services/engine/linux/settle.mjs; R/A §1.6; M4's T8): a successful input defers the next
// eligible call by its own method's constant; a later call waits until that deadline; calls with nothing deferred go
// at once.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ActionSettler, SETTLE_MS} from '../../src/services/engine/linux/settle.mjs';

function clock() {
  let time = 1000;
  const slept = [];
  return {slept, now: () => time, sleep: async ms => { slept.push(ms); time += ms; }, advance: ms => { time += ms; }};
}
const constant = ms => Object.fromEntries(Object.keys(SETTLE_MS).map(method => [method, ms]));

// Every method that defers (src/services/engine/linux/methods.mjs): each has its own constant.
const DEFERRING = ['perform_secondary_action', 'click', 'clipboard_read', 'clipboard_write', 'drag', 'drag_handle', 'activate_window', 'move', 'move_relative',
  'press_key', 'key_down', 'key_up', 'scroll', 'type_text', 'launch_app'];

test('every method that defers has its own constant, a whole number of ms from 0 to the vendor\'s 100', () => {
  assert.deepEqual(Object.keys(SETTLE_MS).sort(), [...DEFERRING].sort());
  for (const [method, ms] of Object.entries(SETTLE_MS)) assert.ok(Number.isInteger(ms) && ms >= 0 && ms <= 100, `${method}: ${ms}`);
  assert.ok(Object.isFrozen(SETTLE_MS));
});

test('the constants are T8\'s measured steps; where no step up to 100 showed every effect, the vendor\'s 100', () => {
  assert.deepEqual({...SETTLE_MS}, {
    perform_secondary_action: 10, click: 100, clipboard_read: 0, clipboard_write: 0, drag: 10, drag_handle: 10, activate_window: 10, move: 10,
    move_relative: 0, press_key: 100, key_down: 25, key_up: 50, scroll: 10, type_text: 0, launch_app: 100,
  });
});

test('nothing deferred: wait returns at once', async () => {
  const c = clock();
  await new ActionSettler(c).wait();
  assert.deepEqual(c.slept, []);
});

test('after a defer, wait sleeps out the rest of that method\'s constant, and only once', async () => {
  const c = clock();
  const settler = new ActionSettler({...c, settles: {...constant(100), click: 40}});
  settler.defer('click');
  c.advance(30);
  await settler.wait();
  assert.deepEqual(c.slept, [10]);
  await settler.wait();
  assert.deepEqual(c.slept, [10]);
});

test('each method defers by its own constant; a 0 ms constant defers nothing', async () => {
  const c = clock();
  const settler = new ActionSettler({...c, settles: {...constant(100), press_key: 0, scroll: 60}});
  settler.defer('press_key');
  await settler.wait();
  assert.deepEqual(c.slept, [], 'press_key at 0 ms');
  settler.defer('scroll');
  await settler.wait();
  assert.deepEqual(c.slept, [60]);
});

test('a later defer extends the deadline, an earlier or shorter one never shortens it', async () => {
  const c = clock();
  const settler = new ActionSettler({...c, settles: {...constant(100), press_key: 10}});
  settler.defer('click');
  c.advance(60);
  settler.defer('click');
  settler.defer('press_key');
  await settler.wait();
  assert.deepEqual(c.slept, [100], 'the second click\'s deadline, which the shorter press_key does not move');
});

test('the shipped constants by default', async () => {
  const c = clock();
  const settler = new ActionSettler(c);
  settler.defer('activate_window');
  await settler.wait();
  assert.deepEqual(c.slept, SETTLE_MS.activate_window > 0 ? [SETTLE_MS.activate_window] : []);
});

test('a method with no constant is refused, and so are settles that leave one out or are not whole ms from 0', () => {
  assert.throws(() => new ActionSettler(clock()).defer('get_window_state'), {message: 'cua\'s Linux service has no action settle for get_window_state'});
  const {press_key: _, ...missing} = constant(10);
  assert.throws(() => new ActionSettler({settles: missing}), {message: 'the action settle needs a constant for press_key'});
  assert.throws(() => new ActionSettler({settles: {...constant(10), click: -1}}), {message: 'the action settle for click must be a whole number of ms from 0, not -1'});
  assert.throws(() => new ActionSettler({settles: {...constant(10), drag: 2.5}}), {message: 'the action settle for drag must be a whole number of ms from 0, not 2.5'});
  assert.throws(() => new ActionSettler({settles: {...constant(10), other: 5}}), {message: 'the action settle has no method other'});
});
