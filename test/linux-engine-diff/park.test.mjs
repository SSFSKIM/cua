import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ParkRefused, ROOT, displayTools, parkAt, parkOnFront, parkPointer, parkVerdict, restorePointer } from '../../scripts/linux-engine-diff/park.mjs';

const WRITER = 0x2a00007;
const FRAME = 0x400012;

test('a park on the bare root passes only with nothing under the pointer, at the point asked', () => {
  const point = { x: 1190, y: 400 };
  assert.deepEqual(parkVerdict({ x: 1190, y: 400, same_screen: true, chain: [] }, point, ROOT), { ok: true });
  // task 72's review, finding 2: the "outside" point was inside the maximized Writer
  const inside = parkVerdict({ x: 1190, y: 400, same_screen: true, chain: [FRAME, WRITER] }, point, ROOT);
  assert.equal(inside.ok, false);
  assert.match(inside.why, /over window 0x00400012, not on the bare root/);
  assert.match(parkVerdict({ x: 1279, y: 400, same_screen: true, chain: [] }, point, ROOT).why, /at \(1279, 400\), not at \(1190, 400\)/, 'clamped to the screen');
  assert.match(parkVerdict({ x: 1190, y: 400, same_screen: false, chain: [] }, point, ROOT).why, /another screen/);
  assert.equal(parkVerdict(null, point, ROOT).ok, false, 'no reading');
});

test('a park on a window passes with the window anywhere in the chain, and fails over another or the root', () => {
  const point = { x: 300, y: 250 };
  assert.deepEqual(parkVerdict({ x: 300, y: 250, chain: [FRAME, WRITER, 0x2a0000f] }, point, WRITER), { ok: true }, 'under its frame, over a child window of its own');
  assert.match(parkVerdict({ x: 300, y: 250, chain: [0x600003] }, point, WRITER).why, /over 0x00600003, not over window 0x02a00007/);
  assert.match(parkVerdict({ x: 300, y: 250, chain: [] }, point, WRITER).why, /on the bare root, not over window/);
  assert.throws(() => parkVerdict({ x: 300, y: 250, chain: [] }, point, undefined), /window id or ROOT/);
});

test('parkPointer moves, then reads, and refuses a trial whose pointer is not where it was meant to be', () => {
  const moves = [];
  const reading = parkPointer({ x: 10, y: 20 }, ROOT, { move: (p) => moves.push(p), read: () => ({ x: 10, y: 20, same_screen: true, chain: [] }) });
  assert.deepEqual(moves, [{ x: 10, y: 20 }]);
  assert.deepEqual(reading.chain, []);
  assert.throws(
    () => parkPointer({ x: 10, y: 20 }, ROOT, { move: () => {}, read: () => ({ x: 10, y: 20, same_screen: true, chain: [WRITER] }) }),
    (e) => e instanceof ParkRefused && /refused: the pointer is over window 0x02a00007/.test(e.message),
  );
});

test('a reading taken before the move has landed is taken again, and a pointer that never arrives is refused', () => {
  const readings = [{ x: 5, y: 5, chain: [WRITER] }, { x: 10, y: 20, same_screen: true, chain: [] }];
  const pauses = [];
  const reading = parkPointer({ x: 10, y: 20 }, ROOT, { move: () => {}, read: () => readings.shift(), pause: (ms) => pauses.push(ms) });
  assert.deepEqual(reading.chain, []);
  assert.deepEqual(pauses, [20]);
  assert.throws(
    () => parkPointer({ x: 10, y: 20 }, ROOT, { move: () => {}, read: () => ({ x: 1279, y: 20, chain: [] }), pause: () => {} }),
    (e) => e instanceof ParkRefused && /at \(1279, 20\)/.test(e.message),
  );
});

test("the front window parks the pointer on the run's own window, verified, and a run without one parks nothing", () => {
  const moves = [];
  const reading = parkPointer({ x: 1170, y: 715 }, 0xe0000c, { move: (p) => moves.push(p), read: () => ({ x: 1170, y: 715, same_screen: true, chain: [0x40001f, 0xe0000c] }) });
  assert.deepEqual(moves, [{ x: 1170, y: 715 }]);
  assert.deepEqual(reading.chain, [0x40001f, 0xe0000c]);
  assert.equal(parkOnFront({ front: null }), null);
});

// a run's desktop as parkAt reads it: its windows, what is on top at a point (`xprobe top-at`), and which it still owns
function desktopWith(top, { owned = [WRITER] } = {}) {
  const asked = [];
  return {
    asked,
    windows: [{ id: WRITER }, { id: null }, { id: 0xe0000c }],
    topAt: (point, ids) => (asked.push({ point, ids }), top),
    liveOwned: (id) => owned.includes(id),
  };
}

test("parkAt parks over the run's window on top at the point, or the bare root where none is, verified there", () => {
  const point = { x: 400, y: 300 };
  const moves = [];
  const over = desktopWith({ top: FRAME, holds: WRITER });
  const reading = parkAt(over, point, { move: (p) => moves.push(p), read: () => ({ x: 400, y: 300, same_screen: true, chain: [FRAME, WRITER] }) });
  assert.deepEqual(reading.chain, [FRAME, WRITER]);
  assert.deepEqual(moves, [point]);
  assert.deepEqual(over.asked, [{ point, ids: [WRITER, 0xe0000c] }], "only the run's windows with ids are asked about");
  // nothing on top: the bare root is meant, so a window that turns up under the pointer is refused
  const bare = desktopWith({ top: 0 });
  assert.deepEqual(parkAt(bare, point, { move: () => {}, read: () => ({ x: 400, y: 300, chain: [] }) }).chain, []);
  assert.throws(() => parkAt(bare, point, { move: () => {}, read: () => ({ x: 400, y: 300, chain: [WRITER] }) }), (e) => e instanceof ParkRefused && /not on the bare root/.test(e.message));
  // the run's window on top, but the pointer landed elsewhere
  assert.throws(() => parkAt(over, point, { move: () => {}, read: () => ({ x: 400, y: 300, chain: [0x600003] }) }), (e) => e instanceof ParkRefused && /not over window 0x02a00007/.test(e.message));
});

test("parkAt refuses, unmoved, a point under another's window or a window of the run's it no longer owns", () => {
  const point = { x: 400, y: 300 };
  const fail = () => assert.fail('the pointer must not move');
  assert.throws(() => parkAt(desktopWith({ top: 0x600003, holds: null }), point, { move: fail, read: fail }), (e) => e instanceof ParkRefused && /\(400, 300\) is over a window the run did not open/.test(e.message));
  assert.throws(() => parkAt(desktopWith({ top: FRAME, holds: WRITER }, { owned: [] }), point, { move: fail, read: fail }), (e) => e instanceof ParkRefused && /did not open/.test(e.message));
});

test("a restore puts the pointer back verified, and one refused is recorded as a skip, never a failure", () => {
  const skips = [];
  const over = { ...desktopWith({ top: FRAME, holds: WRITER }), skip: (what, window, reason) => skips.push({ what, window, reason }) };
  const point = { x: 300, y: 200 };
  assert.deepEqual(restorePointer(over, point, { move: () => {}, read: () => ({ x: 300, y: 200, chain: [FRAME, WRITER] }) }).chain, [FRAME, WRITER]);
  assert.deepEqual(skips, []);
  assert.equal(restorePointer(over, point, { move: () => {}, read: () => ({ x: 300, y: 200, chain: [0x600003] }) }), null);
  assert.equal(skips.length, 1);
  assert.equal(skips[0].what, 'pointer restore');
  assert.equal(skips[0].window, '(300, 200)');
  assert.match(skips[0].reason, /not over window 0x02a00007/);
  // another's window at the point: refused unmoved, and recorded the same way
  const fail = () => assert.fail('the pointer must not move');
  assert.equal(restorePointer({ ...desktopWith({ top: 0x600003, holds: null }), skip: (what) => skips.push({ what }) }, point, { move: fail, read: fail }), null);
  assert.equal(skips.length, 2);
  // anything but a refused park is the run's failure
  assert.throws(() => restorePointer(over, point, { move: () => { throw new Error('the display is gone'); } }), /the display is gone/);
});

test("a park on a display of its own moves and reads the pointer there, through the tools' environment", () => {
  const calls = [];
  const env = { DISPLAY: ':93' };
  const tools = displayTools(env, (cmd, args, options) => (calls.push({ cmd, args, env: options.env }), cmd === 'xdotool' ? '' : '{"x":300,"y":300,"same_screen":true,"chain":[]}'));
  assert.deepEqual(parkPointer({ x: 300, y: 300 }, ROOT, tools).chain, []);
  assert.deepEqual(calls.map((c) => [c.cmd.endsWith('xprobe') ? 'xprobe' : c.cmd, c.args, c.env.DISPLAY]), [
    ['xdotool', ['mousemove', '300', '300'], ':93'],
    ['xprobe', ['pointer-chain'], ':93'],
  ]);
});
