// A drop counts as landed only where the path ended (the design session's rulings 957 and 961, task 128): a landing
// in the zone on a drag whose path ended outside it is "a drop at a stale position", a named wrong outcome beside the
// false oks; a path that ended within the border margin is ambiguous, neither landed nor wrong. Judged from the cell's
// path end against the page's zone, display-free, the pages unchanged.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { CELL_SOURCE, LATE_BANDS, OFF_WINDOW_CELLS, PATH_ENDS, STALE_MARGIN_PX, T14_SOURCE, ZONE, chromeDropVerdict, electronDropVerdict, endAgainstZone, holdRegressionVerdict } from '../../scripts/linux-engine-diff/drop-signals-judge.mjs';
import { CELLS } from '../../scripts/linux-engine-diff/drop-signals.mjs';
import { dropRow } from './drop-rows.mjs';

const chrome = (o) => dropRow({ family: 'chrome', ...o });
const electron = (o) => dropRow({ family: 'electron', ...o });
const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const specs = (...cells) => cells.map(([lane, cell, n]) => ({ lane, cell, n }));
/** A row whose drop landed in the zone (the zone's counter moved), whatever the cell. */
const landedIn = (row) => ({ ...row, outcome: { ...row.outcome, landed: true, started: true }, after: { ...row.after, dnd: Object.fromEntries(Object.entries(row.after.dnd).map(([k, c]) => [k, { ...c, drops: row.before.dnd[k].drops + 1 }])) } });
const page = readFileSync(new URL('../../scripts/linux-engine-diff/pages/drop-signals.html', import.meta.url), 'utf8');

test("the judge's zone is the page's #zone, and every drop cell's path end is its path's own last point", () => {
  const css = /#zone \{ left: (\d+)px; top: (\d+)px; width: (\d+)px; height: (\d+)px;/.exec(page).slice(1).map(Number);
  assert.deepEqual(ZONE, { left: css[0], top: css[1], right: css[0] + css[2], bottom: css[1] + css[3] });
  const dropCells = Object.keys(CELLS).filter((c) => CELL_SOURCE[c] || T14_SOURCE[c]);
  for (const cell of dropCells) {
    if (OFF_WINDOW_CELLS.includes(cell)) {
      assert.equal(PATH_ENDS[cell], undefined, `${cell} ends off the window`);
      continue;
    }
    for (const i of [0, 1]) assert.deepEqual(PATH_ENDS[cell], CELLS[cell](i).at(-1), `${cell} #${i}`);
  }
  // every drop cell is placed: in the window by its end, or off it
  assert.deepEqual(dropCells.filter((c) => !PATH_ENDS[c] && !OFF_WINDOW_CELLS.includes(c)), []);
});

test('a path end against the zone: inside, outside, and within the border margin ambiguous', () => {
  assert.equal(STALE_MARGIN_PX, 3);
  assert.equal(endAgainstZone([570, 128]), 'inside', "the short drop's 10 px in");
  assert.equal(endAgainstZone([725, 108]), 'inside', "the move's 8 px in");
  assert.equal(endAgainstZone([500, 128]), 'outside');
  assert.equal(endAgainstZone([725, 632]), 'outside', "inzone-out's 12 px below");
  for (const p of [[557, 300], [559, 300], [560, 300], [563, 300], [957, 300], [962, 300], [700, 98], [700, 622], [958, 618], [962, 622]]) assert.equal(endAgainstZone(p), 'ambiguous', String(p));
  assert.equal(endAgainstZone([556, 300]), 'outside');
  assert.equal(endAgainstZone([564, 300]), 'inside');
  assert.equal(endAgainstZone([963, 624]), 'outside', 'a corner, by its distance');
  // the planned cells: none ends within the margin
  assert.deepEqual(Object.entries(PATH_ENDS).filter(([, p]) => endAgainstZone(p) === 'ambiguous'), []);
});

test("ruling 957: Chrome's long-left control, its path ended left of the zone, a drop landed in the zone: a drop at a stale position, never landed, and the step fails", () => {
  const rows = [...many(5, (i) => landedIn(chrome({ cell: 'long-left', i }))), ...many(95, (i) => chrome({ cell: 'long-left', i: 5 + i, pending: 'unconfirmed' }))];
  const v = chromeDropVerdict(rows, { specs: specs(['cua', 'long-left', 100]), plan: 't14-long' });
  assert.deepEqual(v.failed, ['cua long-left: a drop at a stale position (the path ended outside the zone, the drop landed in it) on 5 of 100 (#0, #1, #2)']);
  assert.equal(v.counts.landed, 0, 'never counted as landed');
  assert.equal(v.counts.stale_drops, 5);
  assert.equal(v.counts.false_ok, 0, 'a drop at a stale position is its own wrong outcome, not a false ok');
  const cellRow = v.md.find((l) => l.startsWith('| cua | long-left |')).split('|').map((c) => c.trim());
  assert.equal(cellRow[5], '0', 'the landed column');
  assert.equal(cellRow[13], '5', 'the stale-position column');
});

test("ruling 957 on t14-floor: left and inzone-out end outside the zone, the long drop inside; only the controls' landings are stale", () => {
  const rows = [chrome({ cell: 'plain-long', i: 0 }), landedIn(chrome({ cell: 'left', i: 0 })), chrome({ cell: 'left', i: 1, pending: 'unconfirmed' }), landedIn(chrome({ cell: 'inzone-out', i: 0 }))];
  const v = chromeDropVerdict(rows, { specs: specs(['cua', 'plain-long', 1], ['cua', 'left', 2], ['cua', 'inzone-out', 1]), plan: 't14-floor' });
  assert.deepEqual(v.failed, [
    'cua left: a drop at a stale position (the path ended outside the zone, the drop landed in it) on 1 of 2 (#0)',
    'cua inzone-out: a drop at a stale position (the path ended outside the zone, the drop landed in it) on 1 of 1 (#0)',
  ]);
  assert.equal(v.counts.landed, 1);
  assert.equal(v.counts.stale_drops, 2);
  // with every control's drag not dropping, the sitting passes
  assert.deepEqual(chromeDropVerdict([rows[0], chrome({ cell: 'left', i: 0, pending: 'unconfirmed' })], { specs: specs(['cua', 'plain-long', 1], ['cua', 'left', 1]), plan: 't14-floor' }).failed, []);
});

test("the measurement lane's release at the accept ends the drag at the accept, in the zone: its landing is not a stale one", () => {
  const accepted = { ...landedIn(chrome({ lane: 'cua:accept', cell: 'left', i: 0 })), accept: { accepted: true } };
  const v = chromeDropVerdict([accepted], { specs: specs(['cua:accept', 'left', 1]), plan: 't14' });
  assert.deepEqual(v.failed, []);
  assert.equal(v.counts.stale_drops, 0);
  // the floor's fallback on that lane (no release at the accept) ends at the path's end, as shipped
  const fell = { ...landedIn(chrome({ lane: 'cua:accept', cell: 'left', i: 1 })), accept: { accepted: false } };
  assert.match(chromeDropVerdict([fell], { specs: specs(['cua:accept', 'left', 1]), plan: 't14' }).failed.join('\n'), /a drop at a stale position/);
});

test('ruling 961: a path that ended within the border margin is ambiguous: neither landed nor wrong, named and counted; where a landing is needed, unexercised', () => {
  const ends = { ...PATH_ENDS, left: [558, 128], 'freeze-600': [562, 312] };
  const v = chromeDropVerdict([landedIn(chrome({ cell: 'left', i: 0 })), chrome({ cell: 'left', i: 1, pending: 'unconfirmed' })], { specs: specs(['cua', 'left', 2]), plan: 't14-floor', ends });
  assert.deepEqual(v.failed, []);
  assert.equal(v.counts.ambiguous, 1);
  assert.equal(v.counts.landed, 0);
  assert.match(v.findings.join('\n'), /1 drop whose path ended within 3 px of the zone's border \(cua left #0\): ambiguous, neither landed nor at a stale position \(ruling 961\)/);
  // in t14-late's inside band, an ambiguous landing is unexercised, never the band's outcome
  const inside = many(10, (i) => ({ ...chrome({ cell: 'freeze-600', i, landed: true }), hold: { taken: true, adaptive: { source: { identified: true } } }, freeze: { pid: 1, stopped_ms: 60, continued_ms: 600 } }));
  const band = chromeDropVerdict(inside, { specs: specs(['cua', 'freeze-600', 10]), plan: 't14-late', bands: [LATE_BANDS[0]], ends });
  assert.deepEqual(band.counts.bands.inside, { drags: 10, expected: 0, late: 0, unexercised: 10 });
  assert.match(band.findings.join('\n'), /the inside band: 10 of 10 drags unexercised \(the source not identified on 0, the stop skipped on 0, the stop not begun before the thaw on 0, the path's end ambiguous on 10\)/);
});

test("ruling 957 in Electron: the controls' and the off-window releases' landings in the zone are stale; the short drop's and the move's land", () => {
  const rows = [electron({ cell: 'plain', i: 0 }), electron({ cell: 'move', i: 0, landed: true }), landedIn(electron({ cell: 'left', i: 0 })), landedIn(electron({ lane: 'cua:desktop', cell: 'root', i: 0, verified: true }))];
  const v = electronDropVerdict(rows, { specs: specs(['cua', 'plain', 1], ['cua', 'move', 1], ['cua', 'left', 1], ['cua:desktop', 'root', 1]) });
  assert.deepEqual(v.failed, [
    'cua left: a drop at a stale position (the path ended outside the zone, the drop landed in it) on 1 of 1 (#0)',
    'cua:desktop root: a drop at a stale position (the path ended outside the zone, the drop landed in it) on 1 of 1 (#0)',
  ]);
  assert.equal(v.counts.landed, 2);
  assert.equal(v.counts.stale_drops, 2);
  assert.equal(v.counts.false_ok, 0);
  // the Electron long path that leaves (L4d's cell, ruling 962) is judged the same way
  const long = electronDropVerdict([landedIn(electron({ cell: 'long-left', i: 0 })), electron({ cell: 'long-left', i: 1, pending: 'unconfirmed' })], { specs: specs(['cua', 'long-left', 2]) });
  assert.deepEqual(long.failed, ['cua long-left: a drop at a stale position (the path ended outside the zone, the drop landed in it) on 1 of 2 (#0)']);
});

test("the hold's regression cells land only where their paths end, inside the zone", () => {
  const ok = (cell, i) => ({ ...chrome({ cell, i, landed: true }), hold: { taken: true, adaptive: { way: 'fixed', source: { identified: true } } } });
  const rows = [...many(10, (i) => ok('dragstart-150', i)), ...many(10, (i) => ok('dragstart-400', i))];
  const manifest = specs(['cua', 'dragstart-150', 10], ['cua', 'dragstart-400', 10]);
  assert.deepEqual(holdRegressionVerdict(rows, { specs: manifest }).failed, []);
  const moved = holdRegressionVerdict(rows, { specs: manifest, ends: { ...PATH_ENDS, 'dragstart-150': [500, 266] } });
  assert.match(moved.failed.join('\n'), /dragstart-150: not landed on 10 of 10/);
});
