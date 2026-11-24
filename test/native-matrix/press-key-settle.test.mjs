// The pressKey row's read-back settles (ruling 1197; scripts/native-matrix/unicode-plan.mjs unicodeCase): r then k
// under Korean composes ㄱ then 가, and a field's accessibility value can trail its input method (pilot C-2's vendor read ㄱ
// in Chrome and Electron, 가 in TextEdit). Its check reads the field until it holds the expected text or has read the
// same for SETTLE_STABLE_MS, never past SETTLE_CAP_MS, on both lanes alike; the row records how many reads it took and
// when the last one was taken. The expectation is unchanged, and the other Unicode rows keep their one read.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCell} from '../../scripts/native-baseline/cells.mjs';
import {caseCells} from '../../scripts/native-matrix/matrix-cells.mjs';
import {sha256Hex} from '../../scripts/native-matrix/matrix-text.mjs';
import {fieldCheck} from '../../scripts/native-matrix/probe-plan.mjs';
import {PRESS_KEY, SETTLE_CAP_MS, SETTLE_STABLE_MS, unicodeCase} from '../../scripts/native-matrix/unicode-plan.mjs';

const AsyncFunction = (async () => {}).constructor;
async function runCell(text, apps) {
  let out = '';
  globalThis.__apps = apps;
  try { await new AsyncFunction('cua', 'nodeRepl', text)({}, {write: s => { out += s; }}); } finally { delete globalThis.__apps; }
  return parseCell(out);
}
// The Electron fixture, its text field (index 5) reading `valueAt(n)` on its nth observation.
const GOLDEN = fs.readFileSync(new URL('../native-goldens/electron/vendor.txt', import.meta.url), 'utf8').split('\n\nThe focused UI element')[0].split('\n');
// `delayOf(n)`: how long the nth observation takes; `started` the times (performance.now) each began.
function fixture(valueAt, delayOf = () => 0) {
  let n = 0;
  const started = [], ended = [];
  return {reads: () => n, started, ended, app: {async getAXState() {
    started.push(performance.now());
    const delay = delayOf(n + 1);
    if (delay) await new Promise(done => setTimeout(done, delay));
    ended.push(performance.now());
    const value = valueAt(++n);
    return GOLDEN.map(line => (/^\t+5 /.test(line) ? `${line}${value ? `, Value: ${value}` : ''}` : line)).join('\n');
  }}};
}
const korean = {field: 'electron', method: 'pressKey', string: {id: PRESS_KEY.id, keys: PRESS_KEY.keys, text: PRESS_KEY.expected.korean}};
async function check(valueAt, delayOf, f = fixture(valueAt, delayOf)) {
  globalThis.__m = {ready: true, threw: null};
  try { return {...(await runCell(caseCells('electron', unicodeCase(korean)).check, {electron: f.app})).value, observed: f.reads()}; } finally { delete globalThis.__m; }
}

test('the field reaching the expected text late, inside the cap: ok, with the reads it took and when the last was', async () => {
  const r = await check(n => (n < 4 ? 'ㄱ' : '가'));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.outcome.exact, true);
  assert.equal(r.outcome.reads, 4);
  assert.ok(r.outcome.settleMs >= 0 && r.outcome.settleMs < SETTLE_STABLE_MS, `settled at ${r.outcome.settleMs} ms`);
  assert.equal(r.outcome.hash, sha256Hex('가'));
});

test('a field that never reaches it ends at its stable reading, not ok, its reads and time recorded', async () => {
  const r = await check(() => 'ㄱ');
  assert.equal(r.ok, false);
  assert.deepEqual([r.outcome.exact, r.outcome.hash, r.outcome.length], [false, sha256Hex('ㄱ'), 1]);
  assert.ok(r.outcome.reads > 1, `${r.outcome.reads} reads`);
  assert.ok(r.outcome.settleMs >= SETTLE_STABLE_MS && r.outcome.settleMs < SETTLE_CAP_MS, `ended at ${r.outcome.settleMs} ms`);
});

test('a field still changing at the cap ends there, not ok', async () => {
  const r = await check(n => 'ㄱ'.repeat(n % 7 + 1));
  assert.equal(r.ok, false);
  assert.ok(r.outcome.settleMs >= SETTLE_CAP_MS - 150 && r.outcome.settleMs <= SETTLE_CAP_MS + 300, `ended at ${r.outcome.settleMs} ms`);
  assert.ok(r.outcome.reads > 2);
});

test('the clock starts when the first read completes: a slow first observation is not counted, and no read starts past the cap', async () => {
  // The first observation takes 400 ms and already holds 가: settled at the first read, 0 ms after it.
  const slow = await check(() => '가', n => (n === 1 ? 400 : 0));
  assert.deepEqual([slow.ok, slow.outcome.reads], [true, 1]);
  assert.ok(slow.outcome.settleMs < 50, `settled at ${slow.outcome.settleMs} ms`);
  // Each observation takes 700 ms and the value keeps changing: the cap counts from the first read's completion, and
  // no observation begins once it has passed.
  const f = fixture(n => 'ㄱ'.repeat(n), () => 700);
  const capped = await check(null, null, f);
  assert.equal(capped.ok, false);
  const first = f.ended[0];
  assert.ok(f.started.slice(1).every(t => t - first < SETTLE_CAP_MS), JSON.stringify(f.started.map(t => Math.round(t - first))));
  assert.ok(capped.outcome.settleMs >= SETTLE_CAP_MS - 700 && capped.outcome.settleMs < SETTLE_CAP_MS + 750, `ended at ${capped.outcome.settleMs} ms`);
});

test('a read that returns after the cap is never taken: the last value read inside it is judged, even when only the late one matches', async () => {
  // Each read after the first takes 450 ms and reads a new value; the fifth starts inside the cap and returns after it
  // with the expected text.
  const f = fixture(n => (n < 5 ? 'ㄱ'.repeat(n) : '가'), n => (n === 1 ? 0 : 450));
  const r = await check(null, null, f);
  assert.equal(f.reads(), 5, 'the late read was taken');
  assert.ok(f.ended[4] - f.ended[0] > SETTLE_CAP_MS, 'and it returned after the cap');
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.deepEqual([r.outcome.hash, r.outcome.reads, r.outcome.late], [sha256Hex('ㄱㄱㄱㄱ'), 4, true]);
  assert.ok(r.outcome.settleMs < SETTLE_CAP_MS, `the last read inside the cap at ${r.outcome.settleMs} ms`);
});

test('only the pressKey row polls: the typeText and paste rows keep their one read', () => {
  for (const method of ['typeText', 'paste']) {
    const c = unicodeCase({field: 'electron', method, string: {id: 'hangul', text: '한글 테스트'}});
    assert.equal(c.check, fieldCheck('electron', '한글 테스트'), method);
  }
  assert.notEqual(unicodeCase(korean).check, fieldCheck('electron', '가'));
});
