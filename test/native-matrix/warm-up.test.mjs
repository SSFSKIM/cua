// The judge's warm-up section (ruling 1278 (b); scripts/native-matrix/warm-up.mjs, summary.mjs): per lane, run and job
// what each warm-up step did and whether its field was put back, recorded and never judged; a step whose cell failed or
// whose field did not read back as it was is named for the reader, and a run the warm-up stopped is said to be stopped.
// Each warm-up is reported under the job that recorded it: a full run's own, a filtered rerun's (carried on the run's
// meta.warmUps by ./combine.mjs), a speed-extra cell's; never one job's under another's.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderWarmUp, warmUpOf} from '../../scripts/native-matrix/warm-up.mjs';

const EMPTIED = {emptied: true, count: 1, settable: true, write: 0, readBack: 0, reads: 1};
const RESTORED = {restored: true, count: 1, removed: 7, select: 0, selected: true, write: 0, readBack: 512, reads: 1};
const typed = (venue, extra = {}) => ({venue, kind: 'typeText', at: [1, 2], sent: true, ok: true, errorName: null, actMs: 40, neutral: venue === 'textedit' ? RESTORED : EMPTIED, ...extra});
const composed = (venue, extra = {}) => ({venue, kind: 'composition', at: [3, 4], sent: true, ok: true, errorName: null, actMs: 90, cleared: EMPTIED, composed: 'complete', composedReads: 1,
  ended: true, korean: true, retried: false, neutral: EMPTIED, ...extra});
const position = (engine, n) => { const first = n % 2 ? 'vendor' : 'cua'; return {first, position: first === engine ? 1 : 2}; };
const run = (engine, n, steps, meta = {}) => ({result: {cell: 'matrix', lanes: [{engine}], meta: {run: n, planId: 'full', laneOrder: position(engine, n), ...(steps ? {warmUp: {steps}} : {}), ...meta}}});
const all = () => [typed('textedit'), typed('chrome'), typed('electron'), composed('chrome'), composed('electron')];

test('the warm-up section: per lane and run each step, its cell and its field, recorded and never judged', () => {
  const w = warmUpOf([run('cua', 1, all()), run('vendor', 1, all())]);
  assert.deepEqual(w.runs.map(r => [r.engine, r.run, r.lane, r.source]), [['vendor', 1, 'first', 'full'], ['cua', 1, 'second', 'full']]);
  assert.deepEqual(w.shown, []);
  const page = renderWarmUp(w).join('\n');
  assert.match(page, /^## Warm-up \(ruling 1278\)$/m);
  assert.match(page, /Recorded, never judged/);
  assert.match(page, /^\| engine \| run \| job \| lane \| step \| cell \| field put back \|$/m);
  assert.match(page, /^\| vendor \| 1 \| full run \| first \| textedit typeText \| ok, 40 ms \| restored \|$/m);
  assert.match(page, /^\| cua \| 1 \| full run \| second \| chrome composition \| ok, 90 ms, composed complete \| emptied; Korean again \|$/m);
  assert.doesNotMatch(page, /For the reader|Stopped/);
});

test('a warm-up whose cell failed or whose field did not read back is shown by its fixed code; a skipped one is listed with why', () => {
  const steps = [typed('textedit', {neutral: {restored: false, count: 1, select: null, write: null, readBack: null, reads: 0, why: 'not-own-text'}, secondTry: RESTORED}),
    typed('chrome', {ok: false, errorName: 'typeUnconfirmed'}), typed('electron', {sent: false, ok: false, errorName: null, unsent: 'not prepared: the field is not in the text'}),
    composed('chrome', {composed: 'partial', neutral: {emptied: false, count: 0, why: 'no-field'}}),
    {venue: 'electron', kind: 'composition', skipped: 'the Korean condition does not run for this field in the plan'}];
  const w = warmUpOf([run('cua', 2, steps), run('vendor', 2, all())]);
  assert.deepEqual(w.shown.map(s => [s.engine, s.run, s.venue, s.kind]), [['cua', 2, 'chrome', 'typeText'], ['cua', 2, 'electron', 'typeText'], ['cua', 2, 'chrome', 'composition']]);
  const page = renderWarmUp(w).join('\n');
  assert.match(page, /^- \*\*For the reader\*\*: 3 warm-up step\(s\) did not answer ok or did not put their field back; no row is judged on them\.$/m);
  assert.match(page, /^\| cua \| 2 \| full run \| first \| textedit typeText \| ok, 40 ms \| restored \(on the second try; the first: `not-own-text`\) \|$/m);
  assert.match(page, /^\| cua \| 2 \| full run \| first \| chrome typeText \| \*\*failed\*\* \(typeUnconfirmed\) \| emptied \|$/m);
  assert.match(page, /^\| cua \| 2 \| full run \| first \| electron typeText \| \*\*unsent\*\*: not prepared: the field is not in the text \| emptied \|$/m);
  assert.match(page, /^\| cua \| 2 \| full run \| first \| chrome composition \| ok, 90 ms, composed partial \| \*\*not emptied\*\* \(`no-field`\); Korean again \|$/m);
  assert.match(page, /^\| cua \| 2 \| full run \| first \| electron composition \| skipped: the Korean condition does not run for this field in the plan \| - \|$/m);
});

test('the composition\'s source afterwards: Korean on the second try, or not held, whose rows its precondition makes invalid', () => {
  const w = warmUpOf([run('cua', 1, [composed('chrome', {retried: true}), composed('electron', {retried: true, korean: false, ended: false})]), run('vendor', 1, all())]);
  assert.deepEqual(w.shown.map(s => [s.engine, s.venue]), [['cua', 'electron']]);
  const page = renderWarmUp(w).join('\n');
  assert.match(page, /^\| cua \| 1 \| full run \| second \| chrome composition \| ok, 90 ms, composed complete \| emptied; Korean again on the second try \|$/m);
  assert.match(page, /^\| cua \| 1 \| full run \| second \| electron composition \| ok, 90 ms, composed complete \| emptied; \*\*the Latin source not selected\*\*; \*\*Korean not held again\*\*: the field's Korean rows are invalid \|$/m);
});

test('a run the warm-up stopped (a fixture it could not put back) is said to be stopped, its rows NO VERDICT', () => {
  const steps = [typed('textedit', {neutral: {restored: false, why: 'selection-unconfirmed'}, secondTry: {restored: false, why: 'selection-unconfirmed'}})];
  const w = warmUpOf([run('cua', 2, steps, {warmUpStop: {venue: 'textedit', why: 'selection-unconfirmed'}}), run('vendor', 2, all())]);
  assert.deepEqual(w.stopped, [{engine: 'cua', run: 2, source: 'full', job: null, venue: 'textedit', why: 'selection-unconfirmed'}]);
  const page = renderWarmUp(w).join('\n');
  assert.match(page, /^- \*\*Stopped\*\*: cua run 2 \(full run\): the warm-up left textedit's fixture changed and the harness could not put it back \(`selection-unconfirmed`\); every planned sample of that run is NO VERDICT\.$/m);
  assert.match(page, /^\| cua \| 2 \| full run \| first \| textedit typeText \| ok, 40 ms \| \*\*not restored\*\* \(`selection-unconfirmed`, on the second try too\) \|$/m);
});

test('a warm-up is reported under the job that recorded it: a rerun\'s carried on the base, a speed-extra cell\'s, never the base\'s own', () => {
  const carried = engine => ({warmUps: [{runId: '777', attempt: '2', engine, laneOrder: position(engine, 3), steps: [typed('chrome')]}], runner: {run: {id: '46165236186', attempt: '1'}}});
  const extra = engine => ({result: {cell: 'speed-extra', lanes: [{engine}], meta: {run: 1, planId: 'speed-extra', laneOrder: position(engine, 1), runner: {run: {id: '888', attempt: '1'}}, warmUp: {steps: [typed('textedit')]}}}});
  const w = warmUpOf([run('vendor', 3, null, carried('vendor')), run('cua', 3, null, carried('cua'))], [extra('vendor'), extra('cua')]);
  assert.deepEqual(w.runs.map(r => [r.engine, r.run, r.source, r.job, r.lane]), [
    ['vendor', 1, 'speed-extra', {runId: '888', attempt: '1'}, 'first'], ['cua', 1, 'speed-extra', {runId: '888', attempt: '1'}, 'second'],
    ['vendor', 3, 'rerun', {runId: '777', attempt: '2'}, 'first'], ['cua', 3, 'rerun', {runId: '777', attempt: '2'}, 'second']]);
  // The base itself recorded none: named, and nothing of the rerun's is put under it.
  assert.deepEqual(w.unrecorded, [{engine: 'vendor', run: 3}, {engine: 'cua', run: 3}]);
  const page = renderWarmUp(w).join('\n');
  assert.match(page, /^- No warm-up recorded on the full run: vendor run 3, cua run 3\.$/m);
  assert.match(page, /^\| cua \| 3 \| filtered rerun \(job 777, attempt 2\) \| second \| chrome typeText \| ok, 40 ms \| emptied \|$/m);
  assert.match(page, /^\| vendor \| 1 \| speed-extra \(job 888, attempt 1\) \| first \| textedit typeText \| ok, 40 ms \| restored \|$/m);
  assert.doesNotMatch(page, /\| full run/);
});

test('nothing when no run recorded a warm-up; a run without one is named as such beside those with one', () => {
  assert.deepEqual(renderWarmUp(warmUpOf([run('cua', 1, null), run('vendor', 1, null)])), []);
  const w = warmUpOf([run('cua', 1, all()), run('vendor', 1, null)]);
  assert.deepEqual(w.unrecorded, [{engine: 'vendor', run: 1}]);
  assert.match(renderWarmUp(w).join('\n'), /^- No warm-up recorded on the full run: vendor run 1\.$/m);
});
