import assert from 'node:assert/strict';
import { test } from 'node:test';

import { judgeDevice } from '../../scripts/linux-engine-diff/device.mjs';
import { routeWitness } from '../../scripts/linux-engine-diff/safety.mjs';
import { judgeSpan } from '../../scripts/linux-engine-diff/witness.mjs';

// routeWitness (safety.mjs) display-free: a witness whose spans answer recorded reports, and the X probes replaced.
// task 23 (the whole-branch review of M3): an in-front request's temporary grabs must be gone after it, as a foreground
// request's must, so the post-request check (a quiet 300 ms, and no grab left) runs for both.
const ROOT = 0x21d;
const TARGET = 0x600007;
const FRAME = 0x400010;
const OTHER_FRAME = 0x400020;
const OPENBOX = 0x400001;
const quietReport = () => ({ root: ROOT, tree: [[OTHER_FRAME, 1, 0], [FRAME, 1, 0], [OPENBOX, 1, 1]], restacks: [], focus: [], changes: [], notifies: {}, samples: 60, max_gap_ms: 5 });
const inFrontStats = { stats: { route: 'background', dnd: { in_front: true } } };

/** A witness whose spans run `fn` and answer the next report of `reports`, recording each tag. */
function fakeWitness(reports) {
  const tags = [];
  return {
    tags,
    async span(tag, fn) {
      tags.push(tag);
      const value = await fn();
      const report = reports.shift();
      return { value, report, witness: judgeSpan(report) };
    },
  };
}
// the grab watch's record (clip.mjs `watchGrabs`, RECORD): a keyboard grab granted and never released
const KEYBOARD_HELD = [
  { kind: 'grab_keyboard', client: 0x600000, window: ROOT },
  { kind: 'grab_keyboard_reply', client: 0x600000, status: 0 },
];
const probes = (lines = [], log = []) => ({
  toplevel: () => FRAME,
  watchGrabs: async () => {
    log.push('watch');
    return { stop: async () => (log.push('stop'), lines), kill: () => log.push('kill') };
  },
});
const run = (witness, lines, log) => routeWitness(witness, 'case', TARGET, 'background', async () => inFrontStats, { inFront: true, probes: probes(lines, log) });

test('an in-front request is followed by the post-request check: a quiet span and no grab left', async () => {
  const witness = fakeWitness([quietReport(), quietReport()]);
  const result = await run(witness);
  assert.equal(result.judged.clean, true, JSON.stringify(result.judged));
  assert.deepEqual(witness.tags, ['case', 'case:after'], 'the quiet span ran');
});

test('an in-front request that leaves a keyboard grab held fails, and so does its device verdict', async () => {
  const result = await run(fakeWitness([quietReport(), quietReport()]), KEYBOARD_HELD);
  assert.equal(result.judged.clean, false);
  assert.ok(result.judged.fields.some((f) => f.startsWith('grab left')), JSON.stringify(result.judged.fields));
  const row = { block: 1, i: 0, ok: true, effect: true, dnd: { in_front: true }, desktop_same: true, witness: result.judged.clean };
  const verdict = judgeDevice('chrome_dnd_in_front_shared', [row], { clean: true, kind: 'background', answered: [{ ok: true }] });
  assert.equal(verdict.pass, false);
  assert.ok(verdict.reasons.some((r) => r.startsWith('the witness changed')), JSON.stringify(verdict.reasons));
});

test('an in-front request after which the desktop changes within the quiet span fails', async () => {
  const after = { ...quietReport(), changes: [{ field: 'focus', from: TARGET, to: OTHER_FRAME }] };
  const result = await run(fakeWitness([quietReport(), after]));
  assert.equal(result.judged.clean, false);
  assert.deepEqual(result.judged.fields, ['focus after the request']);
});

test('the reviewer\'s unmatched root grab and a drag window left mapped fail an in-front request through routeWitness', async () => {
  const grabbed = { ...quietReport(), focus: [{ kind: 'focus_in', window: ROOT, detail: 2, mode: 1 }] };
  assert.deepEqual((await run(fakeWitness([grabbed, quietReport()]))).judged.fields, ['focus']);
  const mapped = { ...quietReport(), restacks: [{ kind: 'create', window: TARGET + 0x100, or: 1 }, { kind: 'map', window: TARGET + 0x100, or: 1 }] };
  assert.deepEqual((await run(fakeWitness([mapped, quietReport()]))).judged.fields, ['stacking']);
});

test('a request not recorded as in front gets no allowance and no post-request span', async () => {
  const witness = fakeWitness([quietReport()]);
  const result = await routeWitness(witness, 'case', TARGET, 'background', async () => ({ stats: { route: 'background', dnd: { in_front: false } } }), { inFront: true, probes: probes() });
  assert.equal(result.judged.clean, true);
  assert.deepEqual(witness.tags, ['case']);
});

test("the grab check reads the server's record of grabs and never takes the pointer or the keyboard itself", async () => {
  const log = [];
  // granted then released, and one refused: nothing left
  const released = [...KEYBOARD_HELD, { kind: 'ungrab_keyboard', client: 0x600000 }, { kind: 'grab_pointer', client: 0x800000, window: ROOT }, { kind: 'grab_pointer_reply', client: 0x800000, status: 1 }];
  assert.equal((await run(fakeWitness([quietReport(), quietReport()]), released, log)).judged.clean, true);
  assert.deepEqual(log, ['watch', 'stop'], 'the watch began before the request and ended after the quiet span');
  // an XInput 2 grab of the master pointer, never released
  const xi = [{ kind: 'xi_grab_device', client: 0x600000, window: ROOT, device: 2 }, { kind: 'xi_grab_device_reply', client: 0x600000, status: 0 }];
  assert.ok((await run(fakeWitness([quietReport(), quietReport()]), xi)).judged.fields.some((f) => f.startsWith('grab left')));
});

test('the grab watch is ended even when the request throws, and only a request with an allowance starts one', async () => {
  const log = [];
  const failing = async () => {
    throw new Error('the engine failed');
  };
  await assert.rejects(routeWitness(fakeWitness([]), 'case', TARGET, 'background', failing, { inFront: true, probes: probes([], log) }), /the engine failed/);
  assert.deepEqual(log, ['watch', 'kill']);
  const none = [];
  await routeWitness(fakeWitness([quietReport()]), 'case', TARGET, 'background', async () => inFrontStats, { probes: probes([], none) });
  assert.deepEqual(none, [], 'a plain background request watches no grabs');
});

test('grabsIn: a grab is in force from its granted reply to its own ungrab, per client and kind', async () => {
  const { grabsIn } = await import('../../scripts/linux-engine-diff/clip.mjs');
  assert.deepEqual(grabsIn([]), { pointer: 'free', keyboard: 'free', held: [], granted: [] });
  const held = grabsIn(KEYBOARD_HELD);
  assert.equal(held.keyboard, 'grabbed');
  assert.equal(held.pointer, 'free');
  // another client's ungrab does not release it
  assert.equal(grabsIn([...KEYBOARD_HELD, { kind: 'ungrab_keyboard', client: 0x800000 }]).keyboard, 'grabbed');
  // an XInput 2 grab of a device the watch cannot name counts as both
  const other = grabsIn([{ kind: 'xi_grab_device', client: 1, device: 9 }, { kind: 'xi_grab_device_reply', client: 1, status: 0 }]);
  assert.deepEqual([other.pointer, other.keyboard], ['grabbed', 'grabbed']);
});
