// The deferred action settle (src/services/engine/linux/settle.mjs; R/A §1.6): a successful input defers the next
// eligible call by 100 ms; a later call waits until that deadline; calls with nothing deferred go at once.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ActionSettler, POST_ACTION_MS} from '../../src/services/engine/linux/settle.mjs';

function clock() {
  let time = 1000;
  const slept = [];
  return {slept, now: () => time, sleep: async ms => { slept.push(ms); time += ms; }, advance: ms => { time += ms; }};
}

test('the settle is the vendor\'s 100 ms', () => assert.equal(POST_ACTION_MS, 100));

test('nothing deferred: wait returns at once', async () => {
  const c = clock();
  await new ActionSettler(c).wait();
  assert.deepEqual(c.slept, []);
});

test('after defer, wait sleeps out the rest of the 100 ms, and only once', async () => {
  const c = clock();
  const settler = new ActionSettler(c);
  settler.defer();
  c.advance(30);
  await settler.wait();
  assert.deepEqual(c.slept, [70]);
  await settler.wait();
  assert.deepEqual(c.slept, [70]);
});

test('a later defer extends the deadline, an earlier one never shortens it', async () => {
  const c = clock();
  const settler = new ActionSettler(c);
  settler.defer();
  c.advance(60);
  settler.defer();
  await settler.wait();
  assert.deepEqual(c.slept, [100]);
});
