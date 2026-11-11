import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ParkRefused, ROOT, outsidePoint, parkPointer, parkVerdict } from '../../scripts/linux-engine-diff/park.mjs';

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

test("an outside point is derived from the window's frame, beside it and clear of the front window, or there is none", () => {
  const screen = [1280, 800];
  const frame = [1, 1, 23, 1];
  const front = { x: 1069, y: 617, width: 202, height: 174 };
  // Writer at its family's size: the strip right of its frame, at the strip's middle height, off the front window
  const p = outsidePoint({ x: 1, y: 23, width: 1100, height: 760 }, frame, screen, { avoid: [front] });
  assert.ok(p.x > 1102 && p.x < 1280, `beside the frame: ${JSON.stringify(p)}`);
  assert.ok(p.y < front.y - 8, `above the front window: ${JSON.stringify(p)}`);
  // the maximized window of the review's finding: no bare root on its screen, so no point
  assert.equal(outsidePoint({ x: 0, y: 21, width: 1280, height: 779 }, [0, 0, 21, 0], screen), null);
  // the front window over the whole strip leaves another strip, or none
  const below = outsidePoint({ x: 0, y: 21, width: 1280, height: 500 }, [0, 0, 21, 0], screen, { avoid: [] });
  assert.ok(below.y > 521, `below the window: ${JSON.stringify(below)}`);
  assert.equal(outsidePoint({ x: 0, y: 21, width: 1180, height: 779 }, [0, 0, 21, 0], screen, { avoid: [{ x: 1180, y: 0, width: 100, height: 800 }] }), null);
});
