// The hold canary's criterion by architecture (the design session's ruling 930, task 121). On x64, Chrome 158 often
// takes its drag before a ping has waited 20 ms (task 119: 0 and then 1 of 9 held draggable presses reached it, every
// drop landing), so K1 and K2 there judge a draggable press against the plain control's own waits in the same run: at
// least one press that started a drag (a take, or the page's own dragstart) waits 3x the plain control's warm maximum,
// and 5 ms at the least. arm64 keeps the engine's own 20 ms. Every canary record carries the waits, so drift toward
// the bar shows before it fails.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import { CANARY_RELATIVE_FACTOR, CANARY_RELATIVE_FLOOR_MS, canaryPlainControl, judgeDevice } from '../../scripts/linux-engine-diff/device.mjs';
import { renderSummary } from '../../scripts/linux-engine-diff/report.mjs';
import { rejudgeDevice } from '../../scripts/linux-engine-diff/rejudge-device.mjs';
import { CANARY_CRITERION, STEPS, stepArgs, stepNamed } from '../../scripts/linux-engine-gate/steps.mjs';

const PATHS = { vendor: '/v/pinned', newest: '/v/newest', vendorJs: '/v/sky', candidate: '/c/cua-engine' };
const DRAG = 'chrome_dnd_short_in_front_shared';
const PLAIN = 'chrome_select_nudged_shared';
const audit = { clean: true, kind: 'background', answered: [{ ok: true }] };
const source = { identified: true, by: 'Google-chrome, role browser, application "Google Chrome", executable not visible here' };
const fastWhy = 'every ping answered by B came back under 20 ms';
const hold = (waits, { taken = true, way = 'fixed', why = 'the take came 60 ms after the press, inside B' } = {}) => ({
  held: true,
  taken,
  pings: { asked: true, round_trips: waits.map((w, k) => (w < 0 ? { sent_after_press_ms: 50 + 25 * k, rtt_ms: null, unanswered_ms: -w } : { sent_after_press_ms: 50 + 25 * k, rtt_ms: w })) },
  adaptive: { way, why, source },
});
const base = { engine: 'cua', scene: 'device-chrome-dnd', block: 0, witness: true, ok: true, effect: true, route: 'background', dnd: { in_front: true }, desktop_same: true, state_notice: null };
/** A press on the draggable source: its waits, its take (or none), and its drop. */
const press = (i, waits, { taken = true } = {}) => ({ ...base, kind: 'sample', op: DRAG, i, reply_notice: null, dropped: true, engine_stats: { hold: hold(waits, { taken }) } });
/** A plain select drag: fast at B. */
const select = (i, waits) => ({ ...base, kind: 'sample', op: PLAIN, i, engine_stats: { hold: hold(waits, { taken: false, why: fastWhy }) } });
const plainRows = (waits) => waits.map((w, i) => select(i, [w]));
const relative = (plain) => ({ canary: { criterion: 'relative', plain: canaryPlainControl(plain) } });
const judge = (rows, options) => judgeDevice(DRAG, rows, audit, undefined, options);

test("the plain control's own waits: the warm held drags' largest, the cold first one apart", () => {
  assert.deepEqual(canaryPlainControl(plainRows([30, 1.2, 0.9, 1.5])), { warm: 3, max_ms: 1.5 });
  assert.deepEqual(canaryPlainControl([]), { warm: 0, max_ms: null });
  // a select drag whose hold never ran says nothing of the browser's idle waits
  assert.deepEqual(canaryPlainControl([select(0, [1]), { ...select(1, [9]), engine_stats: { route: 'background' } }, select(2, [2])]), { warm: 1, max_ms: 2 });
  assert.equal(CANARY_RELATIVE_FACTOR, 3);
  assert.equal(CANARY_RELATIVE_FLOOR_MS, 5);
});

test("relative (x64): a started press waiting 3x the plain control's maximum passes, where the engine's 20 ms would not", () => {
  // task 119's failing K2: busy presses at 6 to 16 ms, none at 20; its select control at about 1.2 ms
  const rows = [press(0, [8]), press(1, [1, -16]), press(2, [6])];
  const plain = plainRows([1, 1.2, 0.9, 1.1]);
  const v = judge(rows, relative(plain));
  assert.equal(v.pass, true, v.reasons.join('; '));
  assert.deepEqual(v.hold_canary, { kind: 'draggable', criterion: 'relative', held: 3, busy: 3, slow: 0, slow_started: 0, started: 3, wait_max_ms: 16, wait_median_ms: 8, plain_max_ms: 1.2, bar_ms: 5 });
  // the same rows under the absolute criterion (arm64's): none read slow by the engine's own threshold
  const absolute = judge(rows);
  assert.match(absolute.reasons.join('; '), /none of 3 held presses on a draggable source read slow by the engine's own threshold/);
  assert.equal(absolute.hold_canary.criterion, 'absolute');
  assert.equal(absolute.hold_canary.wait_max_ms, 16);
  assert.equal(absolute.hold_canary.plain_max_ms, undefined, 'the absolute criterion reads no plain control');
  // the bar is 3x the plain maximum once that is past the floor
  const slowerPlain = judge(rows, relative(plainRows([1, 6, 2, 1])));
  assert.equal(slowerPlain.hold_canary.bar_ms, 18);
  assert.match(slowerPlain.reasons.join('; '), /none of the 3 held presses on a draggable source that started a drag waited 18 ms or more \(3x the plain control's 6 ms, at least 5 ms\): the largest waited 16 ms/);
});

test('relative: negative controls fail it, a run of plain presses alone and one whose draggable waits equal the plain ones', () => {
  // only plain presses: busy enough to pass the busy rule, but no take and no dragstart of their own, so none started
  const plainPresses = [press(0, [6], { taken: false }), press(1, [7], { taken: false }), press(2, [6], { taken: false })];
  const onlyPlain = judge(plainPresses, relative(plainRows([1, 1, 1, 1])));
  assert.equal(onlyPlain.pass, false);
  assert.match(onlyPlain.reasons.join('; '), /none of the 3 held presses on a draggable source started a drag \(no take of the engine's watch, no dragstart of the sample's own on the page\)/);
  assert.equal(onlyPlain.hold_canary.started, 0);
  assert.equal(onlyPlain.hold_canary.wait_max_ms, null);
  // the draggable presses wait as the plain drags do: nothing marks the drag
  const equal = judge([press(0, [6]), press(1, [6]), press(2, [6])], relative(plainRows([6, 6, 6, 6])));
  assert.equal(equal.pass, false);
  assert.match(equal.reasons.join('; '), /waited 18 ms or more/);
  // and at the floor: plain drags of 1 ms, presses of 1.5 ms, under 5 (the busy rule fails them first)
  assert.equal(judge([press(0, [1.5]), press(1, [1.5]), press(2, [1.5])], relative(plainRows([1, 1, 1, 1]))).pass, false);
});

test('relative: without the plain control in the same run the criterion is untested, and fails', () => {
  const rows = [press(0, [8]), press(1, [9]), press(2, [30])];
  for (const plain of [[], plainRows([1, 1, 1])]) {
    const v = judge(rows, relative(plain));
    assert.equal(v.pass, false);
    assert.match(v.reasons.join('; '), /the hold canary's relative criterion is untested: the run's plain control has \d warm held samples, fewer than 3/);
  }
  assert.equal(judge(rows, { canary: { criterion: 'relative', plain: null } }).pass, false);
});

test("the plain control's own record carries its warm maximum; its rule is unchanged", () => {
  const v = judgeDevice(PLAIN, plainRows([30, 1.2, 0.9, 1.5]), audit);
  assert.ok(!v.reasons.some((r) => r.includes('hold canary')), v.reasons.join('; '));
  assert.deepEqual(v.hold_canary, { kind: 'plain', held: 4, slow: 1, cold_slow: 1, warm: 3, wait_max_ms: 1.5 });
});

test('the criterion is a step parameter the gate sets by architecture: relative on x64, absolute on arm64, only for K1 and K2', () => {
  assert.deepEqual(CANARY_CRITERION, { x64: 'relative', arm64: 'absolute' });
  const flag = (args) => (args.includes('--hold-canary') ? args[args.indexOf('--hold-canary') + 1] : null);
  for (const name of ['K1', 'K2']) {
    assert.equal(flag(stepArgs(stepNamed(name), { paths: PATHS, gate: 'pinned', arch: 'x64' })), 'relative', name);
    assert.equal(flag(stepArgs(stepNamed(name), { paths: PATHS, gate: 'pinned', arch: 'arm64' })), 'absolute', name);
    // an architecture with no ruling keeps the engine's own threshold
    assert.equal(flag(stepArgs(stepNamed(name), { paths: PATHS, gate: 'pinned', arch: 'riscv64' })), 'absolute', name);
  }
  for (const step of STEPS.filter((s) => !['K1', 'K2', 'V5'].includes(s.name))) {
    for (const arch of ['x64', 'arm64']) assert.equal(flag(stepArgs(step, { paths: PATHS, gate: 'pinned', arch })), null, `${step.name} on ${arch}`);
  }
});

test("V5's in-step canary takes the same criterion by architecture (ruling 932): relative on x64, absolute on arm64", () => {
  const flag = (args) => (args.includes('--hold-canary') ? args[args.indexOf('--hold-canary') + 1] : null);
  const v5 = stepNamed('V5');
  assert.equal(flag(stepArgs(v5, { paths: PATHS, gate: 'pinned', arch: 'x64' })), 'relative');
  assert.equal(flag(stepArgs(v5, { paths: PATHS, gate: 'pinned', arch: 'arm64' })), 'absolute');
  assert.equal(flag(stepArgs(v5, { paths: PATHS, gate: 'pinned', arch: 'riscv64' })), 'absolute');
  // and only the criterion: V5 keeps its engines unsandboxed, as it ran
  assert.ok(!stepArgs(v5, { paths: PATHS, gate: 'pinned', arch: 'x64' }).includes('--engine-sandbox'));
});

test('the harness takes --hold-canary relative or absolute, absolute by default', () => {
  const run = ['--vendor', '/v', '--newest', '/n', '--cua', '/c', '--out', '/o', '--scene', 'device-chrome-dnd', '--ops', 'chrome_dnd_short_in_front_shared,chrome_select_nudged_shared'];
  assert.equal(parseArgs(run).holdCanary, 'absolute');
  assert.equal(parseArgs([...run, '--hold-canary', 'relative']).holdCanary, 'relative');
  assert.throws(() => parseArgs([...run, '--hold-canary', 'loose']), /--hold-canary takes relative or absolute/);
});

test("the summary lists each canary cell's criterion, its waits and the plain control's maximum", () => {
  const meta = { kind: 'meta', run: 'k', scenes: ['device-chrome-dnd'], blocks: 3, engines: [] };
  const drag = { kind: 'verdict', run: 'k', scene: 'device-chrome-dnd', op: DRAG, candidate: 'cua', device: true, pass: true, reasons: [], hold_canary: { kind: 'draggable', criterion: 'relative', held: 9, busy: 9, slow: 0, slow_started: 0, started: 9, wait_max_ms: 16.4, wait_median_ms: 9.1, plain_max_ms: 1.3, bar_ms: 5 } };
  const plain = { kind: 'verdict', run: 'k', scene: 'device-chrome-dnd', op: PLAIN, candidate: 'cua', device: true, pass: true, reasons: [], hold_canary: { kind: 'plain', held: 9, slow: 0, cold_slow: 0, warm: 6, wait_max_ms: 1.3 } };
  const text = renderSummary([meta, drag, plain]);
  assert.match(text, /The hold canary/);
  assert.match(text, /\| device-chrome-dnd \| chrome_dnd_short_in_front_shared \| draggable \| relative \| 9 \| 9 \| 16\.4 \| 9\.1 \| 1\.3 \| 5 \|/);
  assert.match(text, /\| device-chrome-dnd \| chrome_select_nudged_shared \| plain \| – \| 9 \| – \| 1\.3 \| – \| – \| – \|/);
});

test('a re-judge keeps the criterion the run was judged by, and its plain control', () => {
  const rows = [press(0, [8]), press(1, [1, -16]), press(2, [6])].map((r) => ({ ...r, run: 'k' }));
  const plain = plainRows([1, 1.2, 0.9, 1.1]).map((r) => ({ ...r, run: 'k' }));
  const stored = (criterion) => ({ kind: 'verdict', run: 'k', scene: 'device-chrome-dnd', op: DRAG, candidate: 'cua', device: true, pass: true, verdict: 'pass', reasons: [], hold_canary: { kind: 'draggable', criterion } });
  const now = (criterion) => rejudgeDevice([...rows, ...plain, stored(criterion)], { noAudit: true })[0].verdicts.find((v) => v.name.includes(DRAG)).now;
  assert.equal(now('relative').verdict, 'pass');
  assert.equal(now('absolute').verdict, 'fail');
});
