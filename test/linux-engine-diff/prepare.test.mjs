// The gate's rule for a sample whose harness-side preparation fails (#171,
// docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, Decision Log 2026-11-01, the design session): every
// attempt records the step that failed, the harness oracle's or the engine's request; a harness-oracle failure is
// resampled once in the sample's own condition (a cold sample on a fresh engine), else the sample is invalid; an
// engine's failure is never resampled; invalid and resampled samples are counted per case and for the run, with caps.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ENGINE, ORACLE, PrepareStepError, judgePrepareFaults, prepareFailureRow, sampleUnderRule } from '../../scripts/linux-engine-diff/prepare.mjs';
import { prepareFaultsMarkdown, renderSummary } from '../../scripts/linux-engine-diff/report.mjs';
import { judgeOperation, runOutcome, verdictLine } from '../../scripts/linux-engine-diff/stats.mjs';
import { NO_HANDLE, TEXT_OPS, handleOfFirstWord } from '../../scripts/linux-engine-diff/text.mjs';

const fieldText = () => 'cua171 differential scene';

/** A context for the handle's preparation: the oracle's selections answer `selects` in turn, the engine `copies`. */
function handleCtx({ selects, copies }) {
  const requests = [];
  return {
    requests,
    ctx: {
      scene: { id: 7, field: 'f', label: 'gedit-text_cua' },
      desktop: { oracle: { select: () => selects.shift(), text: fieldText } },
      engine: { request: async (command) => (requests.push(command), { response: copies.shift() }) },
    },
  };
}
const copied = { ok: true, output: 'handle-1' };
const refusedCopy = { ok: false, error: 'editable element has no selected text to Copy' };

// ---------------------------------------------------------------------------------------------------------------
// every attempt records the step that failed

test('a selection the window refuses twice is a harness-oracle failure: no Copy sent, both attempts recorded', async () => {
  const { ctx, requests } = handleCtx({ selects: [false, false], copies: [] });
  await assert.rejects(handleOfFirstWord(ctx), (error) => {
    assert.ok(error instanceof PrepareStepError);
    assert.equal(error.step, ORACLE);
    assert.match(error.message, /gedit-text_cua refused the selection/);
    return true;
  });
  assert.deepEqual(requests, [], 'no Copy without a selection');
  assert.deepEqual(
    ctx.prepareAttempts.map((a) => a.step),
    [ORACLE, ORACLE],
  );
  assert.equal(ctx.prepareError, undefined, 'no handle sent in place of one: the sample is not run');
});

test("the engine's Copy failing is the engine's failure: never retried, a handle no engine issued, never a harness fault", async () => {
  const { ctx, requests } = handleCtx({ selects: [true, true], copies: [refusedCopy, refusedCopy] });
  assert.equal(await handleOfFirstWord(ctx), NO_HANDLE);
  assert.deepEqual(requests, ['clipboard_read'], 'the Copy is not tried again');
  assert.deepEqual(
    ctx.prepareAttempts.map((a) => a.step),
    [ENGINE],
  );
  assert.equal(ctx.prepareStep, ENGINE);
  assert.match(ctx.prepareError, /^clipboard_read for a handle failed: editable element has no selected text to Copy/);
});

test("a Copy that fails and would succeed when tried again still fails the sample's verdict: no retry hides it", async () => {
  // the task 22 review's probe: a failed Copy, then a successful one, had given a valid handle and a passing verdict
  const { ctx, requests } = handleCtx({ selects: [true, true], copies: [refusedCopy, copied] });
  assert.equal(await handleOfFirstWord(ctx), NO_HANDLE);
  assert.deepEqual(requests, ['clipboard_read']);
  assert.equal(ctx.prepareStep, ENGINE);
  assert.match(ctx.prepareError, /no selected text to Copy/);
  const rows = ['pinned', 'newest', 'cua'].flatMap((engine) => ['cold', 'warm'].map((series) => ({ kind: 'sample', engine, series, ok: true, ms: 1, witness: true, equal: true, clipboard_kept: true, effect: true })));
  rows.push({ kind: 'sample', engine: 'cua', series: 'warm', ok: true, ms: 1, witness: true, equal: true, clipboard_kept: true, effect: true, prepare_error: ctx.prepareError });
  const verdict = judgeOperation(rows, { vendors: ['pinned', 'newest'], candidate: 'cua', text: true, judgeSpeed: false });
  assert.equal(verdict.pass, false);
  assert.match(verdict.reasons.join('; '), /cua: 1 sample's preparation failed \(clipboard_read for a handle failed: editable element has no selected text to Copy\)/);
});

test("an oracle refusal then the engine's failure is the engine's failure: the engine's request is never excused", async () => {
  const { ctx } = handleCtx({ selects: [false, true], copies: [refusedCopy] });
  assert.equal(await handleOfFirstWord(ctx), NO_HANDLE);
  assert.deepEqual(
    ctx.prepareAttempts.map((a) => a.step),
    [ORACLE, ENGINE],
  );
  assert.equal(ctx.prepareStep, ENGINE);
  assert.match(ctx.prepareError, /no selected text to Copy/);
});

test('an attempt that failed before one that succeeded is still recorded', async () => {
  const { ctx } = handleCtx({ selects: [false, true], copies: [copied] });
  assert.equal(await handleOfFirstWord(ctx), 'handle-1');
  assert.deepEqual(ctx.prepareAttempts, [{ step: ORACLE, error: 'gedit-text_cua refused the selection' }]);
  assert.equal(ctx.prepareError, undefined);
});

test('a preparation that selects the first word itself (clipboard_read, the preselected range) fails at the oracle', async () => {
  for (const op of ['clipboard_read', 'type_text_selection']) {
    const ctx = {
      scene: { id: 7, field: 'f', label: 'gedit-text_cua' },
      desktop: { oracle: { select: () => false, text: fieldText, setCaret: () => true, count: () => 25 } },
      engine: { label: 'cua' },
    };
    await assert.rejects(TEXT_OPS[op].prepare(ctx), (error) => error instanceof PrepareStepError && error.step === ORACLE, op);
  }
});

test("a harness-oracle failure's row names the sample, the step and every attempt, and is no sample", () => {
  const error = new PrepareStepError(ORACLE, 'gedit-text_cua refused the selection', [
    { step: ORACLE, error: 'gedit-text_cua refused the selection' },
    { step: ORACLE, error: 'gedit-text_cua refused the selection' },
  ]);
  const row = prepareFailureRow({ label: 'cua', sceneName: 'gedit', op: 'clipboard_write', block: 'topup-0-0', i: 0 }, error);
  assert.deepEqual(row, {
    kind: 'prepare-failure',
    engine: 'cua',
    scene: 'gedit',
    op: 'clipboard_write',
    block: 'topup-0-0',
    series: 'cold',
    i: 0,
    step: ORACLE,
    error: 'gedit-text_cua refused the selection',
    attempts: error.attempts,
  });
});

// ---------------------------------------------------------------------------------------------------------------
// one resample, in the sample's condition

/** A `take` answering `results` in turn: 'ok', 'oracle' (a harness-oracle failure) or 'engine' (cua's request failed). */
function takes(results, { i = 0 } = {}) {
  const calls = [];
  const take = async () => {
    const what = results.shift();
    calls.push(what);
    if (what === ORACLE) return { row: { kind: 'prepare-failure', engine: 'cua', scene: 'gedit', op: 'clipboard_write', block: 0, series: i === 0 ? 'cold' : 'warm', i, step: ORACLE, error: 'refused', attempts: [] }, response: null, fault: ORACLE };
    const row = { kind: 'sample', engine: 'cua', scene: 'gedit', op: 'clipboard_write', block: 0, series: i === 0 ? 'cold' : 'warm', i, ok: what === 'ok' };
    if (what === ENGINE) Object.assign(row, { prepare_error: 'clipboard_read for a handle failed: x', prepare_step: ENGINE });
    return { row, response: { ok: what === 'ok' }, fault: null };
  };
  return { take, calls };
}

test('a prepared sample is counted as it is: nothing emitted, no resample', async () => {
  const emitted = [];
  const { take, calls } = takes(['ok']);
  const out = await sampleUnderRule({ cold: true, take, renew: async () => assert.fail('no renew'), emit: (r) => emitted.push(r) });
  assert.equal(out.counted.row.ok, true);
  assert.equal(out.stop, false);
  assert.deepEqual(calls, ['ok']);
  assert.deepEqual(emitted, []);
});

test("a failure at the engine's request is never resampled: the sample stands and fails its verdict", async () => {
  const emitted = [];
  const { take, calls } = takes([ENGINE, 'ok']);
  const out = await sampleUnderRule({ cold: false, take, renew: async () => assert.fail('no renew'), emit: (r) => emitted.push(r) });
  assert.deepEqual(calls, [ENGINE], 'taken once');
  assert.equal(out.counted.row.prepare_error, 'clipboard_read for a handle failed: x');
  assert.equal(out.counted.row.resampled, undefined);
  assert.deepEqual(emitted, []);
});

test('a cold sample whose preparation failed at the oracle is resampled once, cold, on a fresh engine', async () => {
  const emitted = [];
  let renewed = 0;
  const { take, calls } = takes([ORACLE, 'ok']);
  const out = await sampleUnderRule({ cold: true, take, renew: async () => (renewed++, true), emit: (r) => emitted.push(r) });
  assert.deepEqual(calls, [ORACLE, 'ok']);
  assert.equal(renewed, 1, 'a fresh engine: the gate’s own definition of cold');
  assert.equal(out.counted.row.resampled, true);
  assert.equal(out.counted.row.series, 'cold');
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].kind, 'prepare-failure');
  assert.equal(emitted[0].outcome, 'resampled');
});

test('a warm sample is resampled on its own engine, still warm', async () => {
  const emitted = [];
  const { take, calls } = takes([ORACLE, 'ok'], { i: 2 });
  const out = await sampleUnderRule({ cold: false, take, renew: async () => assert.fail('a warm sample keeps its engine'), emit: (r) => emitted.push(r) });
  assert.deepEqual(calls, [ORACLE, 'ok']);
  assert.equal(out.counted.row.resampled, true);
  assert.equal(emitted[0].outcome, 'resampled');
  assert.equal(out.stop, false);
});

test('a resample that fails at the oracle again leaves the sample invalid, never replaced', async () => {
  const emitted = [];
  const { take, calls } = takes([ORACLE, ORACLE, 'ok'], { i: 1 });
  const out = await sampleUnderRule({ cold: false, take, renew: async () => true, emit: (r) => emitted.push(r) });
  assert.deepEqual(calls, [ORACLE, ORACLE], 'resampled once only');
  assert.equal(out.counted, null);
  assert.equal(out.stop, false, 'the warm series goes on: its engine is still warm');
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].outcome, 'invalid');
  assert.equal(emitted[0].resample.step, ORACLE);
});

test("a resample that fails at the engine's request stands as the sample, and fails its verdict", async () => {
  const emitted = [];
  const { take } = takes([ORACLE, ENGINE]);
  const out = await sampleUnderRule({ cold: true, take, renew: async () => true, emit: (r) => emitted.push(r) });
  assert.equal(out.counted.row.prepare_error, 'clipboard_read for a handle failed: x');
  assert.equal(out.counted.row.resampled, true);
  assert.equal(emitted[0].outcome, 'resampled');
});

test('a cold sample left invalid ends its series: no later request on that engine is warm', async () => {
  const emitted = [];
  const { take } = takes([ORACLE, ORACLE]);
  const out = await sampleUnderRule({ cold: true, take, renew: async () => true, emit: (r) => emitted.push(r) });
  assert.equal(out.counted, null);
  assert.equal(out.stop, true);
  assert.equal(emitted[0].outcome, 'invalid');
});

test('a resample that cannot reproduce the condition counts the sample invalid', async () => {
  const emitted = [];
  const { take, calls } = takes([ORACLE, 'ok']);
  const out = await sampleUnderRule({ cold: true, take, renew: async () => false, emit: (r) => emitted.push(r) });
  assert.deepEqual(calls, [ORACLE], 'no resample in another condition');
  assert.equal(out.counted, null);
  assert.equal(out.stop, true);
  assert.equal(emitted[0].outcome, 'invalid');
  assert.match(emitted[0].why, /condition/);
});

// ---------------------------------------------------------------------------------------------------------------
// the counts and their caps

const sampleRows = (scene, op, n, extra = {}) => Array.from({ length: n }, (_, i) => ({ kind: 'sample', engine: 'cua', scene, op, block: 0, i, ...extra }));
const failure = (scene, op, outcome) => ({ kind: 'prepare-failure', engine: 'cua', scene, op, block: 0, i: 0, step: ORACLE, outcome });

test('a run with no harness-oracle failure passes the rule and lists no case', () => {
  const faults = judgePrepareFaults(sampleRows('gedit', 'clipboard_write', 41));
  assert.equal(faults.pass, true);
  assert.deepEqual(faults.cases, []);
  assert.deepEqual(faults.total, { samples: 41, resampled: 0, invalid: 0, limit: 0.41, over: false });
});

test('a case may have 2 resampled or invalid samples; a third fails the run', () => {
  const two = [...sampleRows('gedit', 'clipboard_write', 39), failure('gedit', 'clipboard_write', 'resampled'), failure('gedit', 'clipboard_write', 'invalid'), ...sampleRows('chrome', 'tree', 400)];
  const ok = judgePrepareFaults(two);
  assert.equal(ok.pass, true, ok.reasons.join('; '));
  assert.deepEqual(ok.cases, [{ scene: 'gedit', op: 'clipboard_write', samples: 40, resampled: 1, invalid: 1, limit: 2, over: false }]);
  // the invalid sample is a sample of the case's, never replaced: 39 counted, 1 invalid
  const three = judgePrepareFaults([...two, failure('gedit', 'clipboard_write', 'resampled')]);
  assert.equal(three.pass, false);
  assert.equal(three.cases[0].over, true);
  assert.match(three.reasons.join('; '), /gedit clipboard_write: 3 of 40 samples resampled or invalid \(2 resampled, 1 invalid\), more than the case's cap of 2/);
});

test("a case's cap is 1% of its samples where that is larger than 2", () => {
  const rows = [...sampleRows('gedit', 'tree', 400), ...Array.from({ length: 4 }, () => failure('gedit', 'tree', 'resampled')), ...sampleRows('chrome', 'tree', 10000)];
  const four = judgePrepareFaults(rows);
  assert.equal(four.cases[0].limit, 4);
  assert.equal(four.pass, true, four.reasons.join('; '));
  const five = judgePrepareFaults([...rows, failure('gedit', 'tree', 'resampled')]);
  assert.equal(five.pass, false);
  assert.match(five.reasons.join('; '), /gedit tree: 5 of 400 samples/);
});

test("more than 1% of the run's samples fails the run though every case is within its cap", () => {
  // 3 cases of 100 samples each, 2 failures each: 6 of 300 is over 1% (3)
  const rows = ['a', 'b', 'c'].flatMap((op) => [...sampleRows('gedit', op, 99), failure('gedit', op, 'resampled'), failure('gedit', op, 'invalid')]);
  const faults = judgePrepareFaults(rows);
  assert.ok(faults.cases.every((c) => !c.over));
  assert.equal(faults.pass, false);
  assert.deepEqual(faults.total, { samples: 300, resampled: 3, invalid: 3, limit: 3, over: true });
  assert.match(faults.reasons.join('; '), /the run: 6 of 300 samples resampled or invalid \(3 resampled, 3 invalid\), more than 1% of the run's samples \(3\)/);
});

test("the summary lists the rule's counts per case and for the run, and each failed sample's step", () => {
  const rows = [...sampleRows('gedit', 'clipboard_write', 40), { ...failure('gedit', 'clipboard_write', 'resampled'), block: 'topup-0-0', series: 'cold', error: 'gedit-text_cua refused the selection' }];
  const faults = judgePrepareFaults(rows);
  const md = prepareFaultsMarkdown([...rows, { kind: 'prepare-faults', ...faults }]).join('\n');
  assert.match(md, /Harness preparation failures \(the gate's rule, Decision Log 2026-11-01\): 1 resampled and 0 invalid of 40 samples, against the run's cap of 1% \(0\.4\), \*\*over the cap\*\*:/);
  assert.match(md, /\| gedit \| clipboard_write \| 40 \| 1 \| 0 \| 2 \| within \|/);
  assert.match(md, /- gedit clipboard_write cua topup-0-0\/0 \(cold\): resampled; failed at the oracle step: gedit-text_cua refused the selection/);
  assert.deepEqual(prepareFaultsMarkdown(sampleRows('gedit', 'tree', 3)), [], 'a run from before the rule shows nothing');
  const none = judgePrepareFaults(sampleRows('gedit', 'tree', 3));
  assert.deepEqual(prepareFaultsMarkdown([{ kind: 'prepare-faults', ...none }]), ['', "Harness preparation failures (the gate's rule, Decision Log 2026-11-01): 0 resampled and 0 invalid of 3 samples, against the run's cap of 1% (0.03)."]);
});

test("the rule's record, emitted as run.mjs emits every row, keeps its run's name and renders under it", () => {
  // run.mjs's emitter writes `{run, ...row}`: a payload field named `run` would replace the run's name (task 22 review)
  const run = 't22-render';
  const emitted = [];
  const emit = (row) => emitted.push(JSON.parse(JSON.stringify({ run, ...row })));
  emit({ kind: 'meta', commit: 'c', cua_version: 'v', occlusion: 'covered', blocks: 1, samples_tree: 7, samples_input: 5, engines: [] });
  const rows = [...sampleRows('gedit', 'clipboard_write', 40), { ...failure('gedit', 'clipboard_write', 'resampled'), error: 'refused' }];
  for (const r of rows) emit(r);
  emit({ kind: 'prepare-faults', ...judgePrepareFaults(rows) });
  emit({ kind: 'end', valid: true, pass: true, failed: [], parity: [], refused: [], finished: 'now' });
  assert.ok(emitted.every((r) => r.run === run), 'every row keeps its run');
  const md = renderSummary(emitted);
  assert.equal(md.match(/^## /gm).length, 1, md);
  assert.doesNotMatch(md, /object Object|run unfinished/);
  assert.match(md, /## t22-render[\s\S]*Harness preparation failures \(the gate's rule, Decision Log 2026-11-01\): 1 resampled and 0 invalid of 40 samples/);
});

test('a cap the rule fails fails the run outcome, its reason in the verdict line', () => {
  const verdict = { kind: 'verdict', scene: 'gedit', op: 'tree', candidate: 'cua', pass: true, verdict: 'pass', reasons: [] };
  const clean = runOutcome([verdict], { valid: true, faults: { pass: true, reasons: [] } });
  assert.equal(clean.code, 0);
  const over = runOutcome([verdict], { valid: true, faults: { pass: false, reasons: ['the run: 6 of 300 samples resampled or invalid'] } });
  assert.equal(over.pass, false);
  assert.equal(over.code, 1);
  assert.match(verdictLine(over), /^FAIL: harness preparation failures over the cap \(the run: 6 of 300 samples resampled or invalid\)$/);
});
