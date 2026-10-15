// The own host's execution budget (src/repl-host/budget.mjs): nested suspension resumes what was left, a stopped budget
// never fires, unbalanced resumes are ignored. A manual clock and scheduler make every step exact.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {executionBudget, timer} from '../../src/repl-host/budget.mjs';

function clock() {
  let now = 0;
  let armed = null;   // {at, fn}
  return {
    now: () => now,
    schedule: (ms, fn) => { const entry = {at: now + ms, fn}; armed = entry; return () => { if (armed === entry) armed = null; }; },
    advance(ms) { now += ms; if (armed && armed.at <= now) { const {fn} = armed; armed = null; fn(); } },
    get armedAt() { return armed?.at ?? null; },
  };
}

test('a budget expires once, at its duration', () => {
  const c = clock();
  let fired = 0;
  executionBudget(100, () => fired++, c);
  c.advance(99);
  assert.equal(fired, 0);
  c.advance(1);
  c.advance(1000);
  assert.equal(fired, 1);
});

test('suspensions nest: the budget pauses at the first and resumes, with what was left, only after the last', () => {
  const c = clock();
  let fired = 0;
  const budget = executionBudget(100, () => fired++, c);
  c.advance(40);
  budget.suspend();
  assert.equal(c.armedAt, null, 'paused');
  budget.suspend();
  c.advance(500);
  budget.resume();
  assert.equal(c.armedAt, null, 'still inside the outer suspension');
  assert.equal(budget.suspended, true);
  c.advance(500);
  budget.resume();
  assert.equal(c.armedAt, 1040 + 60, 'the 60 ms that were left');
  c.advance(59);
  assert.equal(fired, 0);
  c.advance(1);
  assert.equal(fired, 1);
});

test('an unbalanced resume changes nothing; a stopped budget never fires and ignores suspensions', () => {
  const c = clock();
  let fired = 0;
  const budget = executionBudget(100, () => fired++, c);
  budget.resume();
  assert.equal(c.armedAt, 100);
  budget.stop();
  assert.equal(c.armedAt, null);
  budget.suspend();
  budget.resume();
  c.advance(1000);
  assert.equal(fired, 0);
});

test('the real timer fires and cancels', async () => {
  let fired = false;
  const cancel = timer(5, () => { fired = true; });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(fired, true);
  let late = false;
  timer(5, () => { late = true; })();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(late, false);
  cancel();
});
