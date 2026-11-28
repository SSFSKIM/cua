// The judge's warm-up section (ruling 1278 (b); scripts/native-matrix/warm-up.mjs, summary.mjs): per lane and run what
// each warm-up step did and whether its field was put back, recorded and never judged; a step whose cell failed or whose
// field did not read back as it was is named for the reader, and stops nothing.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderWarmUp, warmUpOf} from '../../scripts/native-matrix/warm-up.mjs';

const EMPTIED = {emptied: true, count: 1, settable: true, write: 0, readBack: 0, reads: 1};
const RESTORED = {restored: true, count: 1, removed: 7, select: 0, write: 0, readBack: 512, reads: 1};
const typed = (venue, extra = {}) => ({venue, kind: 'typeText', at: [1, 2], ok: true, errorName: null, actMs: 40, neutral: venue === 'textedit' ? RESTORED : EMPTIED, ...extra});
const composed = (venue, extra = {}) => ({venue, kind: 'composition', at: [3, 4], ok: true, errorName: null, actMs: 90, ended: true, korean: true, neutral: EMPTIED, ...extra});
const run = (engine, n, steps, first = n % 2 ? 'vendor' : 'cua') => ({result: {lanes: [{engine}], meta: {run: n, laneOrder: {first, position: first === engine ? 1 : 2}, ...(steps ? {warmUp: {steps}} : {})}}});
const all = () => [typed('textedit'), typed('chrome'), typed('electron'), composed('chrome'), composed('electron')];

test('the warm-up section: per lane and run each step, its cell and its field, recorded and never judged', () => {
  const w = warmUpOf([run('cua', 1, all()), run('vendor', 1, all())]);
  assert.deepEqual(w.runs.map(r => [r.engine, r.run, r.lane]), [['vendor', 1, 'first'], ['cua', 1, 'second']]);
  assert.deepEqual(w.shown, []);
  const page = renderWarmUp(w).join('\n');
  assert.match(page, /^## Warm-up \(ruling 1278\)$/m);
  assert.match(page, /Recorded, never judged/);
  assert.match(page, /^\| engine \| run \| lane \| step \| cell \| field put back \|$/m);
  assert.match(page, /^\| vendor \| 1 \| first \| textedit typeText \| ok, 40 ms \| restored \|$/m);
  assert.match(page, /^\| cua \| 1 \| second \| chrome composition \| ok, 90 ms \| emptied \|$/m);
  assert.doesNotMatch(page, /For the reader/);
});

test('a warm-up whose cell failed or whose field did not read back is shown; a skipped one is listed with why', () => {
  const steps = [typed('textedit', {neutral: {restored: false, count: 1, removed: null, select: null, write: null, readBack: null, reads: 0, reason: 'the field did not read as its own text with the typing before it: nothing was removed'}}),
    typed('chrome', {ok: false, errorName: 'typeUnconfirmed'}), typed('electron', {ok: false, errorName: null, unsent: 'not prepared: the field is not in the text'}),
    composed('chrome', {neutral: {emptied: false, count: 0, reason: 'Accessibility lists no matching field in the window'}}),
    {venue: 'electron', kind: 'composition', skipped: 'the Korean condition does not run for this field in the plan'}];
  const w = warmUpOf([run('cua', 2, steps), run('vendor', 2, all())]);
  assert.deepEqual(w.shown.map(s => [s.engine, s.run, s.venue, s.kind]), [['cua', 2, 'textedit', 'typeText'], ['cua', 2, 'chrome', 'typeText'], ['cua', 2, 'electron', 'typeText'], ['cua', 2, 'chrome', 'composition']]);
  const page = renderWarmUp(w).join('\n');
  assert.match(page, /^- \*\*For the reader\*\*: 4 warm-up step\(s\) did not answer ok or did not put their field back; they stopped nothing and made no row invalid\.$/m);
  assert.match(page, /^\| cua \| 2 \| first \| textedit typeText \| ok, 40 ms \| \*\*not restored\*\*: the field did not read as its own text with the typing before it: nothing was removed \|$/m);
  assert.match(page, /^\| cua \| 2 \| first \| chrome typeText \| \*\*failed\*\* \(typeUnconfirmed\) \| emptied \|$/m);
  assert.match(page, /^\| cua \| 2 \| first \| electron typeText \| \*\*unsent\*\*: not prepared: the field is not in the text \| emptied \|$/m);
  assert.match(page, /^\| cua \| 2 \| first \| chrome composition \| ok, 90 ms \| \*\*not emptied\*\*: Accessibility lists no matching field in the window \|$/m);
  assert.match(page, /^\| cua \| 2 \| first \| electron composition \| skipped: the Korean condition does not run for this field in the plan \| - \|$/m);
});

test('nothing when no run recorded a warm-up; a run without one is named as such beside those with one', () => {
  assert.deepEqual(renderWarmUp(warmUpOf([run('cua', 1, null), run('vendor', 1, null)])), []);
  const w = warmUpOf([run('cua', 1, all()), run('vendor', 1, null)]);
  assert.deepEqual(w.unrecorded, [{engine: 'vendor', run: 1}]);
  assert.match(renderWarmUp(w).join('\n'), /^- No warm-up recorded: vendor run 1\.$/m);
});
