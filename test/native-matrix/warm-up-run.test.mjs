// Ruling 1278 (b)'s warm-up through a matrix run on its doubles (scripts/native-matrix/warm-up-run.mjs, run.mjs runOnce;
// unicode-run.mjs frontmostRows): one typeText into each text venue the plan brings up, before any judged row, and one
// Korean composition in each web field after Korean holds and before its first Korean row; each followed by the
// harness's own Accessibility write (never the engine's setValue), the same on both lanes, recorded with no text, and
// never a stop or an invalid row.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {CASES} from '../../scripts/native-matrix/plan.mjs';
import {planOf} from '../../scripts/native-matrix/run.mjs';
import {KOREAN_2SET} from '../../scripts/native-matrix/unicode-plan.mjs';
import {WARM_UP_TEXT} from '../../scripts/native-matrix/warm-up-run.mjs';
import {cellsOf, runWith} from './run-doubles.mjs';

const HOSTED = {RUNNER_ENVIRONMENT: 'github-hosted'};
const tagOf = code => /cua-matrix-cell: ([\w.]+)/.exec(code)?.[1] ?? null;
const short = id => (id === KOREAN_2SET ? 'Korean' : id === 'com.apple.keylayout.ABC' ? 'ABC' : id);
// The frontmost regime of the three text scenes, nothing else.
const TEXT_PLAN = {...planOf('method', {scene: 'textedit'}), frontmost: ['textedit', 'chrome', 'electron'], background: []};
// The run's order as one list: the activations, the harness's field writes, the alert checks, the source's selections
// and reads, and every cell (by its tag; a case's cells as `case`).
async function ordered({engine = 'cua', plan = TEXT_PLAN, env = HOSTED, cell = null, ops: over = {}} = {}) {
  const events = [];
  const ops = {...over, matrix: (base, a) => {
    if (a[0] === 'step' && a[1] === 'activate') events.push(`activate ${a[2]}`);
    if (/^field-/.test(a[0])) events.push(`${a[0]} ${a[a.indexOf('--scene') + 1]}`);
    if (a[0] === 'alerts' && a[1] === 'check') events.push('alerts');
    if (a[0] === 'source' && ['select', 'current'].includes(a[1])) events.push(a[1] === 'select' ? `select ${short(a[a.indexOf('--source') + 1])}` : 'current');
    return over.matrix ? over.matrix(base, a) : base(a);
  }};
  const lane = code => events.push(tagOf(code) ?? 'cell');
  const run = await runWith({engine, attest: engine, plan, env, ops, cell, lane, cellName: 'method'});
  return {...run, events};
}
const strip = steps => steps.map(({at: _at, actMs: _ms, ...s}) => s);

test('the typing warm-up: one typeText into each text venue before the first judged row, each followed by the harness\'s own write', async () => {
  const {result, events, code, calls} = await ordered();
  assert.equal(code, 0, JSON.stringify(result.problems));
  assert.deepEqual(validateCellResult(result), []);
  const first = events.indexOf('warmup.prepare') - 1;
  const firstRow = cellsOf('textedit', CASES.textedit[0].method, CASES.textedit[0].case).prepare;
  const lastWarm = calls.findLastIndex(c => /^warmup\./.test(tagOf(c.code) ?? ''));
  assert.ok(lastWarm >= 0 && calls[lastWarm + 1].code.includes(firstRow), 'the first judged row\'s prepare is the first cell after the warm-up');
  assert.ok(calls.slice(0, lastWarm).every(c => !c.code.includes(firstRow)), 'and no row\'s cell before it');
  assert.deepEqual(events.slice(first, first + 22), [
    'activate textedit', 'warmup.prepare', 'field-caret textedit', 'alerts', 'warmup.typeText', 'alerts', 'field-strip textedit',
    'activate chrome', 'warmup.prepare', 'alerts', 'warmup.typeText', 'alerts', 'field-empty chrome',
    'activate electron', 'warmup.prepare', 'alerts', 'warmup.typeText', 'alerts', 'field-empty electron',
    // Then the frontmost regime.
    'activate textedit', 'cell', 'cell']);
  // The typing is the engine's (one typeText of the warm-up's text); nothing of the warm-up empties through it.
  const warm = calls.filter(c => /^warmup\./.test(tagOf(c.code) ?? ''));
  assert.ok(warm.every(c => !/setValue\(/.test(c.code)), 'no engine setValue in any warm-up cell');
  assert.deepEqual(warm.filter(c => tagOf(c.code) === 'warmup.typeText').map(c => c.code.includes(`await __app.typeText(${JSON.stringify(WARM_UP_TEXT)});`)), [true, true, true]);
  assert.ok(warm.filter(c => tagOf(c.code) === 'warmup.prepare').every(c => /__app\.click\(/.test(c.code) && !/__app\.typeText/.test(c.code)));
  assert.deepEqual(strip(result.meta.warmUp.steps), [
    {venue: 'textedit', kind: 'typeText', ok: true, errorName: null, caret: {placed: true, count: 1, write: 0, caret: {location: 0, length: 0}, length: 512},
      neutral: {restored: true, count: 1, removed: 7, select: 0, write: 0, readBack: 512, reads: 1}},
    {venue: 'chrome', kind: 'typeText', ok: true, errorName: null, neutral: {emptied: true, count: 1, settable: true, write: 0, readBack: 0, reads: 1}},
    {venue: 'electron', kind: 'typeText', ok: true, errorName: null, neutral: {emptied: true, count: 1, settable: true, write: 0, readBack: 0, reads: 1}},
  ]);
  assert.ok(result.meta.warmUp.steps.every(s => Array.isArray(s.at) && s.at.length === 2 && s.at[0] <= s.at[1] && Number.isFinite(s.actMs)), 'each step\'s device-clock window and its act\'s time');
  // No text on the record: neither the warm-up's string nor the document's digest.
  const record = JSON.stringify(result.meta.warmUp);
  assert.ok(!record.includes(WARM_UP_TEXT) && !record.includes('digest') && !/[0-9a-f]{64}/.test(record), record);
});

test('the warm-up is the same on both lanes, each through its own engine', async () => {
  const cua = await ordered({engine: 'cua'});
  const vendor = await ordered({engine: 'vendor'});
  assert.deepEqual(vendor.events, cua.events);
  assert.deepEqual(strip(vendor.result.meta.warmUp.steps), strip(cua.result.meta.warmUp.steps));
  assert.deepEqual([cua.result.lanes[0].engine, vendor.result.lanes[0].engine], ['cua', 'vendor']);
});

test('off a hosted runner nothing is typed: each venue is recorded skipped, with why', async () => {
  const {result, events, calls} = await ordered({env: {}});
  assert.ok(!calls.some(c => /^warmup\./.test(tagOf(c.code) ?? '')), 'no warm-up cell');
  assert.ok(!events.some(e => /^field-(empty|caret|strip) /.test(e)), 'no harness write');
  assert.deepEqual(result.meta.warmUp.steps.map(s => [s.venue, s.kind, s.ok ?? null]), [['textedit', 'typeText', null], ['chrome', 'typeText', null], ['electron', 'typeText', null]]);
  assert.ok(result.meta.warmUp.steps.every(s => /^off a GitHub-hosted runner/.test(s.skipped)), JSON.stringify(result.meta.warmUp.steps[0]));
});

test('a warm-up whose cell failed or whose field did not read back empty is recorded and stops nothing', async () => {
  // The second venue's typing (Chrome's) fails as a cell.
  let typed = 0;
  const failed = c => (tagOf(c) === 'warmup.typeText' && ++typed === 2 ? {cellError: 'Error: the typing threw'} : null);
  const notEmptied = {matrix: (base, a) => (a[0] === 'field-empty' && a.includes('electron') ? {answer: {emptied: false, count: 1, settable: false, write: -25205, readBack: 3, reads: 4, reason: 'the field\'s value read back 3 characters after the write (AXError -25205)'}, at: [1, 2]} : base(a))};
  const plain = await ordered();
  const {result, code} = await ordered({cell: failed, ops: notEmptied});
  assert.deepEqual([code, result.complete, result.verdict], [0, true, 'pass'], JSON.stringify(result.problems));
  const [, chrome, electron] = result.meta.warmUp.steps;
  assert.deepEqual([chrome.venue, chrome.ok, chrome.neutral.emptied], ['chrome', false, true]);
  assert.deepEqual([electron.venue, electron.ok, electron.neutral.emptied, electron.neutral.reason], ['electron', true, false, 'the field\'s value read back 3 characters after the write (AXError -25205)']);
  assert.deepEqual(result.rows.map(r => [r.id, r.ok, r.invalid ?? null]), plain.result.rows.map(r => [r.id, r.ok, r.invalid ?? null]), 'no row made invalid');
});

// ---- the Korean composition, inside the input sections -------------------------------------------------------------

const KOREAN_PLAN = {...planOf('korean', {scene: 'chrome'}), unicode: {fields: ['chrome'], conditions: ['latin', 'korean']}};

test('the Korean warm-up: one composition in the web field once Korean holds, ended, emptied by the harness, Korean established again, before its first Korean row', async () => {
  const {result, events, code, calls} = await ordered({plan: KOREAN_PLAN});
  assert.equal(code, 0, JSON.stringify(result.problems));
  assert.deepEqual(validateCellResult(result), []);
  const at = events.indexOf('warmup.composition');
  // Before: the Korean condition's own establishment (selected, the refocus through TextEdit, read back engaged).
  assert.deepEqual(events.slice(at - 6, at + 9), ['current', 'select Korean', 'activate textedit', 'activate chrome', 'current', 'warmup.prepare',
    'warmup.composition', 'select ABC', 'current', 'select Korean', 'activate textedit', 'activate chrome', 'current', 'field-empty chrome', 'cell']);
  const composition = calls.find(c => tagOf(c.code) === 'warmup.composition');
  assert.ok(composition.code.includes('await __app.pressKey("r k");'), 'the pressKey row\'s keys');
  // The field's first Korean row comes after it.
  const firstKorean = result.rows.findIndex(r => r.condition === 'korean');
  assert.ok(firstKorean >= 0 && result.rows.slice(firstKorean).every(r => r.ok === true && !r.invalid));
  const korean = result.meta.warmUp.steps.filter(s => s.kind === 'composition' && !s.skipped);
  assert.deepEqual(strip(korean), [{venue: 'chrome', kind: 'composition', ok: true, errorName: null, ended: true, korean: true,
    neutral: {emptied: true, count: 1, settable: true, write: 0, readBack: 0, reads: 1}}]);
  // Electron is not in the plan: no warm-up runs there, and that is recorded.
  assert.deepEqual(result.meta.warmUp.steps.filter(s => s.kind === 'composition' && s.skipped).map(s => [s.venue, s.skipped]), [['electron', 'the Korean condition does not run for this field in the plan']]);
  assert.ok(!JSON.stringify(result.meta.warmUp).includes('가'));
});

test('the Korean warm-up is skipped and recorded where the Korean condition does not run, or off a hosted runner', async () => {
  const off = await ordered({plan: KOREAN_PLAN, env: {}});
  assert.ok(!off.events.includes('warmup.composition'));
  assert.deepEqual(off.result.meta.warmUp.steps.filter(s => s.kind === 'composition').map(s => [s.venue, /^off a GitHub-hosted runner/.test(s.skipped ?? '') || s.skipped]),
    [['electron', 'the Korean condition does not run for this field in the plan'], ['chrome', true]]);
  // The owner's Mac on Korean 2-Set with the preference off: the Korean rows run under it, and nothing composes, since
  // nothing could select the Latin source to end the composition.
  const KOREAN = {current: KOREAN_2SET, layout: 'com.apple.keylayout.2SetHangul'};
  const ownerOps = {matrix: (base, a) => (a[0] === 'source' && a[1] === 'state' ? {...base(a), answer: {writable: false, refused: 'off a GitHub-hosted runner … (ruling 1188)', ...KOREAN, perContext: false}}
    : a[0] === 'source' && a[1] === 'current' ? {...base(a), answer: KOREAN} : base(a))};
  const owner = await ordered({plan: KOREAN_PLAN, env: {}, ops: ownerOps});
  assert.ok(!owner.events.includes('warmup.composition'));
  assert.match(owner.result.meta.warmUp.steps.find(s => s.kind === 'composition' && s.venue === 'chrome').skipped, /ruling 1188.*: nothing could end the composition, so none is made$/);
  assert.ok(owner.result.rows.filter(r => r.condition === 'korean').every(r => r.ok === true && !r.invalid));
  // A source the venue could not enable: the Korean rows are NO VERDICT venue, and the warm-up names that cause.
  const missing = {matrix: (base, a) => { const out = base(a); return a[0] === 'source' && a[1] === 'state' ? {...out, answer: {...out.answer, venueMissing: [KOREAN_2SET]}} : out; }};
  const venue = await ordered({plan: KOREAN_PLAN, ops: missing});
  const chrome = venue.result.meta.warmUp.steps.find(s => s.kind === 'composition' && s.venue === 'chrome');
  assert.match(chrome.skipped, /^the Korean condition's rows did not run: the runner's setup could not enable com\.apple\.inputmethod\.Korean\.2SetKorean/);
  // Korean that does not hold in the field: its rows invalid as before, and no warm-up.
  const refused = {matrix: (base, a) => (a[0] === 'source' && a[1] === 'select' && a.includes(KOREAN_2SET) ? {answer: {selected: false, current: 'com.apple.keylayout.ABC', layout: 'com.apple.keylayout.ABC'}, at: [1, 2]} : base(a))};
  const stuck = await ordered({plan: KOREAN_PLAN, ops: refused});
  assert.ok(!stuck.events.includes('warmup.composition'));
  assert.match(stuck.result.meta.warmUp.steps.find(s => s.kind === 'composition' && s.venue === 'chrome').skipped, /^the Korean condition's rows did not run: the Korean source did not hold with chrome in front/);
});

test('a Korean warm-up whose composition failed or whose field did not read back empty stops nothing; the rows run', async () => {
  const failed = c => (tagOf(c) === 'warmup.composition' ? {cellError: 'Error: keys refused'} : null);
  const notEmptied = {matrix: (base, a) => (a[0] === 'field-empty' ? {answer: {emptied: false, count: 0, settable: null, write: null, readBack: null, reads: 0, reason: 'Accessibility lists no matching field in the window'}, at: [1, 2]} : base(a))};
  const {result, code} = await ordered({plan: KOREAN_PLAN, cell: failed, ops: notEmptied});
  assert.deepEqual([code, result.complete], [0, true], JSON.stringify(result.problems));
  const step = result.meta.warmUp.steps.find(s => s.kind === 'composition' && s.venue === 'chrome');
  assert.deepEqual([step.ok, step.neutral.emptied, step.korean], [false, false, true]);
  const korean = result.rows.filter(r => r.condition === 'korean');
  assert.ok(korean.length > 0 && korean.every(r => r.ok === true && !r.invalid), JSON.stringify(korean.find(r => r.invalid)));
});
