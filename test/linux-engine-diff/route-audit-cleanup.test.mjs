// A route audit's own resources, each ended however the audit goes (#171 M4, task 53's review): the xtrace proxy, the
// ancestry watcher on it and the engine through it. A watcher whose start threw used to leave the proxy running, and an
// engine whose close threw left the watcher's xprobe until the run's end. Display-free: every resource a stand-in.

import assert from 'node:assert/strict';
import test from 'node:test';

import { withRouteAudit } from '../../scripts/linux-engine-diff/run.mjs';

/** Stand-ins that log what was done to them; `fail` names the steps that throw. */
function resources(fail = []) {
  const log = [];
  const step = (name, value) => async () => {
    log.push(name);
    if (fail.includes(name)) throw new Error(`${name} failed`);
    return value;
  };
  const proxy = { marks: [], stop: step('proxy stop', 'the trace') };
  return {
    log,
    proxy,
    parts: {
      openProxy: async () => proxy,
      watch: async () => {
        await step('watch')();
        return { chain: [1, 2], stop: step('watch stop', { watched: true }) };
      },
      startEngine: () => {
        log.push('engine start');
        if (fail.includes('engine start')) throw new Error('engine start failed');
        return { close: step('engine close') };
      },
      after: step('after'),
    },
  };
}

test('the audit answers its trace, the watcher and its answer, everything ended in order', async () => {
  const { log, proxy, parts } = resources();
  const done = await withRouteAudit(parts, async (engine, p) => {
    assert.equal(p, proxy);
    log.push('body');
  });
  assert.equal(done.trace, 'the trace');
  assert.deepEqual(done.ancestry, { watched: true });
  assert.deepEqual(done.watcher.chain, [1, 2]);
  assert.equal(done.proxy, proxy);
  assert.deepEqual(log, ['watch', 'engine start', 'body', 'engine close', 'watch stop', 'after', 'proxy stop']);
});

test("a watcher whose start threw leaves no proxy running, and no engine is started", async () => {
  const { log, parts } = resources(['watch']);
  await assert.rejects(withRouteAudit(parts, async () => log.push('body')), /watch failed/);
  assert.deepEqual(log, ['watch', 'proxy stop']);
  // an engine that did not start: its watcher and proxy stopped, nothing to put back
  const unstarted = resources(['engine start']);
  await assert.rejects(withRouteAudit(unstarted.parts, async () => unstarted.log.push('body')), /engine start failed/);
  assert.deepEqual(unstarted.log, ['watch', 'engine start', 'watch stop', 'proxy stop']);
});

test("an engine whose close threw still has its watcher and its proxy stopped", async () => {
  const { log, parts } = resources(['engine close']);
  await assert.rejects(withRouteAudit(parts, async () => log.push('body')), (error) => {
    assert.match(error.message, /the route audit's cleanup failed: engine close failed/);
    return true;
  });
  assert.deepEqual(log, ['watch', 'engine start', 'body', 'engine close', 'watch stop', 'after', 'proxy stop']);
});

test('a body that threw keeps its error, with every resource ended and the cleanup failures attached', async () => {
  const { log, parts } = resources(['watch stop']);
  await assert.rejects(
    withRouteAudit(parts, async () => {
      log.push('body');
      throw new Error('sample failed');
    }),
    (error) => {
      assert.equal(error.message, 'sample failed');
      assert.deepEqual(error.cleanup.map((e) => e.message), ['watch stop failed']);
      return true;
    },
  );
  assert.deepEqual(log, ['watch', 'engine start', 'body', 'engine close', 'watch stop', 'after', 'proxy stop']);
});

test('no watcher (a target with no window) is a watch of nothing, answered as watched', async () => {
  const { log, parts } = resources();
  const done = await withRouteAudit({ ...parts, watch: async () => null }, async () => log.push('body'));
  assert.equal(done.watcher, null);
  assert.deepEqual(done.ancestry, { watched: true });
  assert.deepEqual(log, ['engine start', 'body', 'engine close', 'after', 'proxy stop']);
});
