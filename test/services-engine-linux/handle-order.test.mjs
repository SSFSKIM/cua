// The order of cua's Linux service's drag-handle requests on the wire, over every interleaving of a small script (the
// design session's ruling on the whole-branch review of M4): the engine holds at most one handle and the wire names
// none, so a request of one handle written after another handle's start acts on that other handle, and one written
// after a reset acts on a handle the service has forgotten. Each case starts handle A, then invokes some arrangement of
// A's move or end, B's start (which succeeds or fails) and a kernel reset, with the settle free, the real ActionSettler,
// or a held settle released at a chosen point, and each step invoked at once or once the ones before it have settled
// (or 100 ms, when a held settle holds them).
// For every case: no request of A reaches the wire after a successful start of B was written; nothing of a handle the
// reset forgot reaches the wire after the reset's release; a reset never waits for a held settle; everything settles.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createService} from '../../src/services/engine/linux/service.mjs';
import {ActionSettler} from '../../src/services/engine/linux/settle.mjs';
import {fakeLinuxEngine} from '../helpers/fake-linux-engine.mjs';

// A settler whose wait, while held, does not return until released.
function heldSettler() {
  let holding = false;
  const held = [];
  return {
    wait: () => (holding ? new Promise(resolve => held.push(resolve)) : Promise.resolve()),
    defer: () => {},
    hold: () => { holding = true; },
    release: () => { holding = false; held.splice(0).forEach(resolve => resolve()); },
  };
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const within = (promise, ms, what) => Promise.race([promise, delay(ms).then(() => { throw new Error(`${what} did not settle within ${ms} ms`); })]);

// Every ordering of every subset of two or more of the steps.
function arrangements(steps) {
  const out = [];
  const permute = (left, picked) => {
    if (picked.length >= 2) out.push(picked);
    for (const step of left) permute(left.filter(s => s !== step), [...picked, step]);
  };
  permute(steps, []);
  return out;
}
const product = (...lists) => lists.reduce((acc, list) => acc.flatMap(a => list.map(b => [...a, b])), [[]]);

function cases() {
  const out = [];
  for (const seq of arrangements(['A', 'B', 'reset']))
    for (const [req, bFails] of product(['move', 'end'], [false, true])) {
      if (!seq.includes('B') && bFails) continue;
      const gapCount = seq.length - 1;
      const settles = ['free', 'real', 'held', ...Array.from({length: gapCount}, (_, g) => `release@${g + 1}`)];
      for (const gaps of product(...Array.from({length: gapCount}, () => ['now', 'later'])))
        for (const settle of settles) out.push({seq, req, bFails, gaps, settle});
    }
  return out;
}

const name = c => `${c.seq.map(s => (s === 'A' ? `A.${c.req}` : s === 'B' ? (c.bFails ? 'B.start(fails)' : 'B.start') : s)).join(' ')} gaps=${c.gaps.join(',')} settle=${c.settle}`;

async function run(t, c) {
  const engine = fakeLinuxEngine(t, {behaviour: c.bFails
    ? 'export function answer(command, input) { if (command === \'drag_handle\' && input.action === \'start\' && input.x === 3) return {error: \'another application holds the pointer\'}; }'
    : 'export function answer() {}'});
  const settler = c.settle === 'real' ? new ActionSettler() : heldSettler();
  const svc = createService({env: {CUA_ENGINE_BIN: engine.path}, settler});
  try {
    await svc.handleRpc({type: 'drag_start', handle_id: 'A', point: {x: 1, y: 2}});
    if (c.settle === 'held' || c.settle.startsWith('release@')) settler.hold();
    const pending = [];
    const outcomes = {};
    for (const [i, step] of c.seq.entries()) {
      if (i > 0) {
        // the steps before settle first, or are held by the settle: a bounded wait, since a held settle holds them
        if (c.gaps[i - 1] === 'later') await Promise.race([Promise.allSettled(pending), delay(100)]);
        if (c.settle === `release@${i}`) settler.release();
      }
      let made;
      if (step === 'reset') {
        made = svc.kernelReset();
        // a reset never waits for the settle, held or not (F1)
        await within(made, 2000, 'the reset');
      } else if (step === 'B') made = svc.handleRpc({type: 'drag_start', handle_id: 'B', point: {x: 3, y: 4}});
      else made = c.req === 'move' ? svc.handleRpc({type: 'drag_move', handle_id: 'A', point: {x: 9, y: 9}}) : svc.handleRpc({type: 'drag_end', handle_id: 'A'});
      outcomes[step] = made;
      pending.push(made.catch(() => {}));
    }
    settler.release?.();
    await within(Promise.allSettled(pending), 3000, 'the script');
    const settled = Object.fromEntries(await Promise.all(Object.entries(outcomes).map(async ([k, p]) => [k, await p.then(() => 'ok', e => e.message)])));
    const wire = engine.requests().filter(r => r.command !== 'capabilities').map(r => (r.command === 'release_handle' ? 'release' : r.input.action === 'start' ? (r.input.x === 3 ? 'startB' : 'startA') : `A.${r.input.action === 'move_to' ? 'move' : 'end'}`));
    return {wire, settled};
  } finally {
    svc.close();
  }
}

function violations(c, {wire, settled}) {
  const found = [];
  const bStart = wire.indexOf('startB');
  const aAfter = (from) => wire.slice(from + 1).some(w => w.startsWith('A.'));
  if (bStart !== -1 && settled.B === 'ok' && aAfter(bStart)) found.push('a request of A was written after B\'s successful start');
  const release = wire.indexOf('release');
  if (release !== -1) {
    const after = wire.slice(release + 1);
    if (after.some(w => w.startsWith('A.') || w === 'startA')) found.push('a request of A was written after the reset\'s release');
    if (after.includes('startB') && c.seq.indexOf('B') < c.seq.indexOf('reset')) found.push('B\'s start, invoked before the reset, was written after its release');
  }
  // a request of A invoked after the reset names a forgotten handle
  if (c.seq.includes('reset') && c.seq.indexOf('A') > c.seq.indexOf('reset') && settled.A === 'ok') found.push('A\'s request after the reset was answered');
  // an answered request was on the wire
  if (settled.A === 'ok' && !wire.includes(`A.${c.req}`)) found.push('A\'s request answered ok without reaching the wire');
  return found;
}

test('over every interleaving of A\'s request, B\'s start and a reset, no request reaches the wire for a handle the engine no longer holds', async t => {
  const all = cases();
  const failures = [];
  for (let i = 0; i < all.length; i += 12) {
    const batch = all.slice(i, i + 12);
    const results = await Promise.all(batch.map(c => run(t, c).then(r => [c, r], e => [c, {error: e.message}])));
    for (const [c, r] of results) {
      const found = r.error ? [r.error] : violations(c, r);
      if (found.length) failures.push(`${name(c)}: ${found.join('; ')}  wire=${(r.wire ?? []).join(' ')}`);
    }
  }
  assert.ok(all.length > 300, `${all.length} cases`);
  assert.deepEqual(failures, [], `${failures.length} of ${all.length} interleavings broke the order`);
});
