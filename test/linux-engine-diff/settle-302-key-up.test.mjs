// #302's key_up form (#171 M5, the design session's rulings 864 and 865), separate from press_key's
// (settle-302.test.mjs). A key held across a key_down and a key_up gets X autorepeat under load, so the page's key-downs
// run ahead of its key-ups, and late repeats arrive along with the late release. The positive fixtures are the five late
// runs of arm64's L3b at H'''' on 0.4.1, `electron-input key_up desktop` at twice the load (trials 7, 12, 15, 25 and 32),
// their key counters as stored; every other field of the page as that record holds it.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { heldKeyUpMiss, judgeSettleSeries, lateKeyUpMiss } from '../../scripts/linux-engine-diff/action-settle-cells.mjs';

// the input page's reading, as arm64's L3b stored it, with the key counters given
const page = (kd, ku, last = 'x', over = {}) => ({
  moves: 2326, downs: 70, ups: 105, drags: 35, key_downs: kd, key_ups: ku, last_key: last, scroll: 0, context: 105, context_on: 'menu', escapes: 0, clicks: 35,
  pointer_at: [600, 240], wheels: 105, wheel_legacy: -12600, ...over,
});
const CELL = 'electron-input key_up desktop';
const row = (trial, { before, after, ok = false, late_ms = ok ? null : 200, ...rest }) => ({
  kind: 'settle-run', cell: CELL, scene: 'electron-input', input: 'key_up', route: 'desktop', lane: 'shipped', load: 2, trial,
  ok, landed: ok, late_ms, answers: [{ ok: true }], before, after, sent: { key: 'x' }, desktop_clean: true, front_active: null, ...rest,
});
// a passing run: its press (and `repeats` autorepeats) before its before-read, its release inside the settle
const passing = (trial, kd, ku, repeats = 0) => row(trial, { ok: true, before: page(kd + 1 + repeats, ku), after: page(kd + 1 + repeats, ku + 1) });
// the run after a late one, as stored: its before-read, and an after-read with its own release
const following = (trial, before, input = 'key_up') => ({ ...row(trial, { ok: true, before, after: { ...before, key_ups: before.key_ups + 1 } }), input, cell: `electron-input ${input} desktop` });

// arm64's five: [trial, the previous run's after-read, this run's before and after, the next before-read, late_ms, the next run's kind]
const ARM64 = [
  [7, [231, 207], [248, 207], [252, 207], [253, 208], 186.8, 'key_up'],
  [12, [256, 212], [257, 212], [258, 212], [259, 213], 251.4, 'key_up'],
  [15, [261, 215], [290, 215], [294, 215], [295, 216], 212.4, 'key_up'],
  [25, [303, 225], [351, 225], [355, 225], [356, 226], 188.1, 'key_up'],
  // the series' last run: the next before-read on the page is the next cell's, a click, which sends no key before it
  [32, [448, 232], [449, 232], [450, 232], [450, 233], 263.9, 'click'],
];
const shape = ([trial, prev, before, after, next, lateMs, nextKind]) => ({
  prev: row(trial - 1, { ok: true, before: page(prev[0], prev[1] - 1), after: page(...prev) }),
  miss: row(trial, { before: page(...before), after: page(...after), late_ms: lateMs }),
  next: following(nextKind === 'key_up' ? trial + 1 : 0, page(...next), nextKind),
});

// the four whose next before-read is the same cell's; trial 32's is the next cell's
const SAME_CELL = ARM64.filter((s) => s[6] === 'key_up');

test("the key_up form: arm64's late runs at twice the load are #302 where the next read is the cell's own, and trial 32 is not", () => {
  for (const s of SAME_CELL) {
    const { prev, miss, next } = shape(s);
    assert.equal(heldKeyUpMiss(miss, prev, next), null, `trial ${s[0]}`);
  }
  for (const s of ARM64) {
    const { miss, next } = shape(s);
    // press_key's form would refuse each (its key-downs not exactly one more, its key-ups never equal to them)
    assert.notEqual(lateKeyUpMiss({ ...miss, input: 'press_key' }, next), null, `trial ${s[0]}: press_key's form`);
  }
  // trial 32: its next before-read is click desktop t0's, after that cell's own preparation (fix wave 1): unconfirmed
  const { prev, miss, next } = shape(ARM64[4]);
  assert.match(heldKeyUpMiss(miss, prev, next), /condition 4: the next before-read is electron-input click desktop's/);
});

test('the key_up form refuses a run that is not late, or whose desktop changed (conditions 1 and 5)', () => {
  const { prev, miss, next } = shape(ARM64[0]);
  assert.match(heldKeyUpMiss({ ...miss, late_ms: null }, prev, next), /class never/, 'a key_up that never arrives');
  assert.match(heldKeyUpMiss({ ...miss, answers: [{ ok: false, error: 'x' }] }, prev, next), /class refused/);
  assert.match(heldKeyUpMiss({ ...miss, invalid: 'a reader failed' }, prev, next), /class invalid/);
  assert.match(heldKeyUpMiss({ ...miss, error: 'the key_down before the key_up failed' }, prev, next), /class invalid/);
  assert.match(heldKeyUpMiss({ ...miss, desktop_clean: false }, prev, next), /the desktop changed/);
  assert.match(heldKeyUpMiss({ ...miss, front_active: false }, prev, next), /the desktop changed/);
  assert.equal(heldKeyUpMiss({ ...miss, front_active: true }, prev, next), null, 'the background route: its front window still active');
});

test("the key_up form's condition 2: the held key's press landed before the run's before-read", () => {
  const { prev, miss, next } = shape(ARM64[1]);
  assert.match(heldKeyUpMiss(miss, undefined, next), /condition 2: no previous reading/, "a series' first run has no reading before its press");
  assert.match(heldKeyUpMiss(miss, { ...prev, after: { error: 'a reader failed' } }, next), /condition 2: no previous reading/);
  assert.match(heldKeyUpMiss(miss, { ...prev, after: page(257, 212) }, next), /condition 2/, 'no key-down since the previous reading: the press had not landed');
  assert.match(heldKeyUpMiss(miss, { ...prev, after: page(300, 212) }, next), /condition 2/, 'counters below the previous reading: another page');
  assert.match(heldKeyUpMiss({ ...miss, before: page(257, 212, 'y') }, prev, next), /condition 2/, 'the last key event before the read was not the key');
  assert.match(heldKeyUpMiss({ ...miss, before: {} }, prev, next), /no key counters/);
  // the review's probe (fix wave 1): a refused key_up may keep its hold (the engine's keyboard.rs), so the next key_down
  // answers ok with no press sent, and the old hold's repeats raise key_downs as a press would. Only a passing previous
  // run, its own release confirmed, ends the hold.
  const refused = { ...prev, ok: false, landed: false, late_ms: null, answers: [{ ok: false, error: 'the key release failed' }] };
  assert.match(heldKeyUpMiss(miss, refused, next), /condition 2: the previous run did not pass/, 'a refused predecessor');
  assert.match(heldKeyUpMiss(miss, { ...prev, ok: false, landed: false, late_ms: 200, after: page(256, 211) }, next), /condition 2: the previous run did not pass/, 'a late predecessor');
  assert.match(heldKeyUpMiss(miss, { ...prev, ok: false, landed: false, late_ms: null, invalid: 'a reader failed' }, next), /condition 2: the previous run did not pass/, 'an invalid predecessor');
});

test("the key_up form's condition 3: at the next before-read, one more key-up, and key-downs grown only by the next run's own press", () => {
  for (const s of SAME_CELL) {
    const { prev, miss, next } = shape(s);
    const at = (kd, ku) => ({ ...next, before: page(kd, ku) });
    const [kd, ku] = [next.before.key_downs, next.before.key_ups];
    assert.match(heldKeyUpMiss(miss, prev, at(kd, ku - 1)), /condition 3/, `trial ${s[0]}: a lost release (no key-up more)`);
    assert.match(heldKeyUpMiss(miss, prev, at(kd, ku + 1)), /condition 3/, `trial ${s[0]}: two key-ups more`);
    assert.match(heldKeyUpMiss(miss, prev, at(kd + 1, ku)), /condition 3/, `trial ${s[0]}: a stray key-down beyond the next run's own press`);
    assert.match(heldKeyUpMiss(miss, prev, at(kd - 1, ku)), /condition 3/, `trial ${s[0]}: the next run's own press missing`);
  }
  const { prev, miss, next } = shape(ARM64[0]);
  assert.match(heldKeyUpMiss(miss, prev, undefined), /condition 3: no next before-read/);
  assert.match(heldKeyUpMiss(miss, prev, { ...next, before: undefined, error: 'preparation refused' }), /condition 3: no next before-read/);
  assert.match(heldKeyUpMiss(miss, prev, { ...next, before: page(1, 0) }), /condition 3: no next before-read/, 'a fresh page: the counters started again');
  // another cell's before-read comes after that cell's own preparation, which may change the page: never a confirmation
  assert.match(heldKeyUpMiss(miss, prev, { ...next, input: 'click', cell: 'electron-input click desktop' }), /condition 4: the next before-read is electron-input click desktop's/);
  assert.match(heldKeyUpMiss(miss, prev, { ...next, lane: 'settle-100' }), /condition 4: the next before-read is electron-input key_up desktop \(settle-100\)'s/);
});

test("the key_up form's condition 4: the late events are only that key's release and its autorepeats", () => {
  const { prev, miss, next } = shape(ARM64[0]);
  const late = (over) => heldKeyUpMiss({ ...miss, after: { ...miss.after, ...over } }, prev, next);
  assert.match(late({ last_key: 'y' }), /condition 4/, "another key's event the last after the answer");
  assert.match(late({ escapes: 1 }), /condition 4/, 'an Escape among the late key-downs');
  assert.match(late({ key_ups: miss.before.key_ups + 1 }), /condition 4/, 'a key-up inside the settle, yet the run late');
  assert.match(late({ key_downs: miss.before.key_downs - 1 }), /condition 4/, 'key-downs fewer after than before');
  assert.match(late({ clicks: 36 }), /condition 4/, 'a pointer event after the answer');
  assert.match(late({ moves: 2327 }), /condition 4/, 'a move after the answer');
  assert.match(heldKeyUpMiss(miss, prev, { ...next, before: { ...next.before, last_key: 'y' } }), /condition 4/, "another key's event the last before the next read");
  assert.match(heldKeyUpMiss(miss, prev, { ...next, before: { ...next.before, escapes: 1 } }), /condition 4/, 'an Escape before the next read');
  // the late interval runs to the next before-read (fix wave 1): any other change of the page there fails too
  const gap = (over) => heldKeyUpMiss(miss, prev, { ...next, before: { ...next.before, ...over } });
  assert.match(gap({ clicks: 36 }), /condition 4: clicks changed before the next read/, 'a click in the gap');
  assert.match(gap({ moves: 2327, pointer_at: [601, 240] }), /condition 4: moves, pointer_at changed before the next read/, 'a move in the gap');
  // a stray key-down of another key, then the key's own event over it, so last_key reads the key again. In the gap the
  // counts are exact, so the stray key-down shows as one too many:
  assert.match(gap({ key_downs: next.before.key_downs + 1 }), /condition 3/, 'a stray key-down in the gap, an x after it');
  // amid the repeats, where key_downs may grow by any count, it reads as one more repeat: the page records no key per
  // event and no repeat flag, so the counters cannot show it (the limit ruling 865 accepted for what this cell observes)
  const stray = { ...miss, after: { ...miss.after, key_downs: miss.after.key_downs + 1 } };
  const strayNext = { ...next, before: { ...next.before, key_downs: next.before.key_downs + 1 } };
  assert.equal(heldKeyUpMiss(stray, prev, strayNext), null, 'a stray key-down amid the repeats, an x repeat after it: not visible');
});

/** arm64's series as a run of 33: passes between the five late runs, the counters continuing as the record's do. */
function arm64Series() {
  const rows = [];
  let [kd, ku] = [200, 199];
  const late = new Map(ARM64.map((s) => [s[0], s]));
  for (let trial = 0; trial < 33; trial++) {
    const s = late.get(trial);
    if (!s) {
      rows.push(passing(trial, kd, ku));
      [kd, ku] = [rows.at(-1).after.key_downs, rows.at(-1).after.key_ups];
      continue;
    }
    const [, prev, before, after, , lateMs] = s;
    // the press and its repeats before the read, the late repeats after the answer, as stored
    const press = before[0] - prev[0];
    const repeats = after[0] - before[0];
    rows.push(row(trial, { before: page(kd + press, ku), after: page(kd + press + repeats, ku), late_ms: lateMs }));
    // the release lands before the next run's before-read
    [kd, ku] = [kd + press + repeats, ku + 1];
  }
  return rows;
}

test("arm64's L3b series: four count toward the streak as #302, trial 32 fails on the next cell's read, and the series still reaches 30", () => {
  const rows = arm64Series();
  const last = rows.at(-1);
  const next = following(0, page(last.after.key_downs, last.after.key_ups + 1), 'click');
  const v = judgeSettleSeries(rows, { need: 30, next });
  assert.equal(v.reached, true, 'trials 0-31 make 32 consecutive');
  assert.deepEqual(v.late_302.map((l) => l.trial), [7, 12, 15, 25]);
  assert.deepEqual(v.late_302.map((l) => l.late_ms), [186.8, 251.4, 212.4, 188.1]);
  assert.equal(v.judged.at(-1).cls, 'fail');
  assert.match(v.judged.at(-1).why, /click desktop's/);
  assert.deepEqual(v.false_ok, []);
  // the same cell's next run would have confirmed it
  const own = judgeSettleSeries([...rows, following(33, page(last.after.key_downs + 1, last.after.key_ups + 1))], { need: 30 });
  assert.deepEqual(own.late_302.map((l) => l.trial), [7, 12, 15, 25, 32]);
  // without the next cell's before-read the last is pending, and the series, its streak broken there, not yet reached
  const open = judgeSettleSeries(rows, { need: 30 });
  assert.deepEqual(open.judged.at(-1), { trial: 32, cls: 'pending', late_ms: 263.9 });
  assert.equal(open.reached, true, 'the streak reached 30 before trial 32 all the same');
});

test("the negative controls in a series: each run no longer #302 is an honest miss, and a 650 hard failure fails the series", () => {
  const index = (rows, trial) => rows.findIndex((r) => r.trial === trial);
  const edits = {
    'a lost release: the next before-read has no key-up more': (rows) => { rows[index(rows, 13)].before.key_ups -= 1; },
    "a stray key-down beyond the next run's own press": (rows) => { rows[index(rows, 13)].before.key_downs += 1; },
    'a late event from another key': (rows) => { rows[index(rows, 12)].after.last_key = 'y'; },
    'a click in the gap before the next read': (rows) => { rows[index(rows, 13)].before.clicks += 1; },
    // the review's probe: the run before it refused, so its hold may not have ended
    'a refused predecessor': (rows) => { Object.assign(rows[index(rows, 11)], { ok: false, landed: false, answers: [{ ok: false, error: 'the key release failed' }] }); },
  };
  for (const [name, edit] of Object.entries(edits)) {
    const rows = arm64Series();
    edit(rows);
    const v = judgeSettleSeries(rows, { need: 30 });
    assert.equal(v.judged[index(rows, 12)].cls, 'fail', name);
    assert.deepEqual(v.late_302.map((l) => l.trial), [7, 15, 25], name);
    assert.equal(v.reached, false, `${name}: no 30 consecutive without trial 12`);
  }
  // a key_up that never arrives, every answer ok: no effect, ruling 650's hard failure, whatever streak follows
  const never = arm64Series();
  Object.assign(never[index(never, 12)], { late_ms: null });
  const v = judgeSettleSeries([...never, ...Array.from({ length: 30 }, (_, i) => passing(33 + i, 500 + i, 300 + i))], { need: 30 });
  assert.equal(v.reached, false);
  assert.deepEqual(v.false_ok, [{ trial: 12, cls: 'false ok', why: 'answered ok with no effect' }]);
  // a 650 hard failure elsewhere in the same series: the five still read #302, and the series fails
  const hard = arm64Series();
  const r = hard[index(hard, 3)];
  Object.assign(r, { ok: false, landed: false, late_ms: null, after: { ...r.before } });
  const h = judgeSettleSeries(hard, { need: 30 });
  assert.equal(h.reached, false);
  assert.equal(h.lost, true);
  assert.deepEqual(h.false_ok.map((f) => f.trial), [3]);
  assert.deepEqual(h.late_302.map((l) => l.trial), [7, 12, 15, 25]);
  // a search lane keeps the lane's own rule: #302's key_up form is the shipped lane's too
  const searched = judgeSettleSeries(arm64Series().map((x) => ({ ...x, lane: 'settle-100' })), { need: 30 });
  assert.deepEqual(searched.late_302, []);
  assert.equal(searched.reached, false);
});

test("press_key's form is unchanged: a press_key run is never read by the key_up form", () => {
  // a press_key run in the key_up form's shape (key-downs four more, key-ups unchanged): press_key's criterion 1 fails it
  const { prev, miss, next } = shape(ARM64[0]);
  const press = { ...miss, input: 'press_key', cell: 'electron-input press_key desktop' };
  const v = judgeSettleSeries([{ ...prev, input: 'press_key' }, press, { ...next, input: 'press_key' }], { need: 30 });
  assert.equal(v.judged[1].cls, 'fail');
  assert.match(v.judged[1].why, /criterion 1/);
});
