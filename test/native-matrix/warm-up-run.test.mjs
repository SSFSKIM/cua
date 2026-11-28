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
import {sha256Hex} from '../../scripts/native-matrix/matrix-text.mjs';
import {emptyField} from '../../scripts/native-matrix/probe-plan.mjs';
import {KOREAN_2SET, unicodeCase, unicodeRowsOf} from '../../scripts/native-matrix/unicode-plan.mjs';
import {COMPOSITION_VENUES, WARM_UP_TEXT} from '../../scripts/native-matrix/warm-up-run.mjs';
import {cellsOf, runWith} from './run-doubles.mjs';
import {CHECKS} from '../../scripts/hosted-sittings/checks.mjs';
import {runJobStops} from '../../scripts/hosted-sittings/split.mjs';

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
    {venue: 'textedit', kind: 'typeText', sent: true, ok: true, errorName: null, caret: {placed: true, count: 1, write: 0, caret: {location: 0, length: 0}, length: 512},
      neutral: {restored: true, count: 1, removed: 7, select: 0, selected: true, write: 0, readBack: 512, reads: 1}},
    {venue: 'chrome', kind: 'typeText', sent: true, ok: true, errorName: null, neutral: {emptied: true, count: 1, settable: true, write: 0, readBack: 0, reads: 1}},
    {venue: 'electron', kind: 'typeText', sent: true, ok: true, errorName: null, neutral: {emptied: true, count: 1, settable: true, write: 0, readBack: 0, reads: 1}},
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

test('a warm-up whose cell failed is recorded and stops nothing; a field that read back on the second try is recorded with both answers', async () => {
  // The second venue's typing (Chrome's) fails as a cell; the Electron field reads back not empty once.
  let typed = 0, electron = 0;
  const failed = c => (tagOf(c) === 'warmup.typeText' && ++typed === 2 ? {cellError: 'Error: the typing threw'} : null);
  const notEmptied = {matrix: (base, a) => (a[0] === 'field-empty' && a.includes('electron') && ++electron === 1
    ? {answer: {emptied: false, count: 1, settable: false, write: -25205, readBack: 3, reads: 4, why: 'not-empty', reason: 'the field\'s value read back 3 characters after the write (AXError -25205)'}, at: [1, 2]} : base(a))};
  const plain = await ordered();
  const {result, code} = await ordered({cell: failed, ops: notEmptied});
  assert.deepEqual([code, result.complete, result.verdict], [0, true, 'pass'], JSON.stringify(result.problems));
  const [, chrome, field] = result.meta.warmUp.steps;
  assert.deepEqual([chrome.venue, chrome.sent, chrome.ok, chrome.neutral.emptied], ['chrome', true, false, true]);
  assert.deepEqual([field.venue, field.ok, field.neutral, field.secondTry.emptied],
    ['electron', true, {emptied: false, count: 1, settable: false, write: -25205, readBack: 3, reads: 4, why: 'not-empty'}, true], 'the sentence is never on the record, its code is');
  assert.deepEqual(result.rows.map(r => [r.id, r.ok, r.invalid ?? null]), plain.result.rows.map(r => [r.id, r.ok, r.invalid ?? null]), 'no row made invalid');
});

// Review finding 1: judged rows never meet a fixture the warm-up changed. Not every judged row on the web scenes sets its
// own field (the speed and finding cells read the scene as it stands), so a web field that will not read back empty is
// TextEdit's case too.
test('a fixture the typing changed and the harness could not put back stops the run before any judged row, every sample NO VERDICT by that cause', async () => {
  for (const [venue, command, answer] of [['textedit', 'field-strip', {restored: false, count: 1, removed: null, select: 0, selected: false, write: null, readBack: null, reads: 0, why: 'selection-unconfirmed'}],
    ['chrome', 'field-empty', {emptied: false, count: 1, settable: true, write: 0, readBack: 7, reads: 4, why: 'not-empty'}]]) {
    const asked = [];
    const ops = {matrix: (base, a) => { if (a[0] === command && a.includes(venue)) { asked.push(a[0]); return {answer, at: [1, 2]}; } return base(a); }};
    const {result, code} = await ordered({ops});
    assert.equal(asked.length, 2, `${venue}: put back, then tried once more`);
    assert.deepEqual([code, result.complete], [1, false]);
    assert.deepEqual(result.meta.warmUpStop, {venue, why: answer.why});
    assert.ok(result.problems.some(p => p.startsWith(`stopped: the warm-up's typing left ${venue}'s`)), JSON.stringify(result.problems));
    assert.ok(result.rows.length > 0 && result.rows.every(r => r.ok === false && r.invalid === `not run: the run stopped: the warm-up left ${venue}'s fixture changed (${answer.why})`),
      JSON.stringify(result.rows.find(r => !r.invalid?.startsWith('not run'))));
    assert.deepEqual(validateCellResult(result), []);
    const step = result.meta.warmUp.steps.find(s => s.venue === venue);
    assert.deepEqual([step.neutral.why, step.secondTry.why], [answer.why, answer.why], 'the step is on the record though the run stopped');
  }
});

// Verification review: on a hosted run job a FixtureChanged stop fails the lane's run step as a runtime error, its cause
// in the reason, and jobs-check refuses the job until it is re-run (gh run rerun --failed), as ruling 1227's
// infrastructure stops are: a stopped lane is never judged.
test('a FixtureChanged stop fails the run step with its cause named, and jobs-check refuses the job until it is re-run', async () => {
  const ops = {matrix: (base, a) => (a[0] === 'field-strip' ? {answer: {restored: false, why: 'selection-unconfirmed'}, at: [1, 2]} : base(a))};
  const {result} = await ordered({ops});
  const path = '/o/cua/run-1/result.json';
  const [status, reason] = CHECKS.record({record: path}, {exit: 1, readJson: p => (p === path ? result : null), logText: () => '', exists: () => true});
  assert.equal(status, 'FAIL');
  assert.match(reason, /^runtime error: the run is incomplete \(stopped: the warm-up's typing left textedit's document changed and the harness could not put it back \(selection-unconfirmed\): no row is judged on a changed fixture/);
  assert.deepEqual(runJobStops({steps: [{id: 'run-1-cua', status, reason}]}), [{id: 'run-1-cua', status: 'FAIL', reason}]);
});

test('keys that were never sent changed nothing: a field that then does not read back is recorded and the run goes on', async () => {
  const unprepared = c => (tagOf(c) === 'warmup.prepare' && c.includes('Scene notes') ? {ready: false, reason: 'the field is not in the text'} : null);
  const stays = {matrix: (base, a) => (a[0] === 'field-empty' && a.includes('chrome') ? {answer: {emptied: false, count: 0, why: 'no-field'}, at: [1, 2]} : base(a))};
  const {result, code} = await ordered({cell: unprepared, ops: stays});
  assert.deepEqual([code, result.complete], [0, true], JSON.stringify(result.problems));
  const chrome = result.meta.warmUp.steps.find(s => s.venue === 'chrome');
  assert.deepEqual([chrome.sent, chrome.unsent, chrome.neutral.why, chrome.secondTry], [false, 'not prepared: the field is not in the text', 'no-field', undefined]);
});

// Review finding 3: a public record keeps no error's words and no key list.
test('a harness write that threw is recorded by its exit code alone, and a skipped send by its kind and key count, never its keys', async () => {
  const threw = {matrix: (base, a) => {
    if (a[0] === 'field-strip') throw Object.assign(new Error(`panel-ax strip 300 secret-ish ${'f'.repeat(64)}`), {status: 2});
    return base(a);
  }};
  const run = await ordered({ops: threw});
  const textedit = run.result.meta.warmUp.steps[0];
  assert.deepEqual([textedit.neutral, textedit.secondTry], [{restored: false, why: 'command-failed', exitCode: 2}, {restored: false, why: 'command-failed', exitCode: 2}]);
  assert.ok(!JSON.stringify(run.result).includes('f'.repeat(64)) && !JSON.stringify(run.result).includes('secret-ish'));
  assert.equal(run.result.meta.warmUpStop.why, 'command-failed');
  // The key guard's skip on the warm-up's composition: the front not the run's, the run stopped; the skip and the
  // stop name the composition, never r and k.
  let korean = false;
  const owner = {matrix: (base, a) => {
    if (a[0] === 'source' && a[1] === 'select' && a.includes(KOREAN_2SET)) korean = true;
    const out = base(a);
    return korean && a[0] === 'read' && a.includes('--key-window') && a.includes('chrome') ? {...out, reading: {...out.reading, frontmost: {pid: 9, bundleId: 'com.example.owner', owned: false}}} : out;
  }};
  const stopped = await ordered({plan: KOREAN_PLAN, ops: owner});
  const skip = stopped.result.meta.keySkipped.find(k => k.kind === 'composition');
  assert.deepEqual([skip.kind, skip.keyCount, skip.keys], ['composition', 2, undefined]);
  assert.ok(stopped.result.problems.some(p => /composition not sent: the front is not one of the run's windows/.test(p)), JSON.stringify(stopped.result.problems));
  assert.ok(!JSON.stringify(stopped.result.meta.keySkipped).includes('"r"') && !stopped.result.problems.some(p => /\br, k\b/.test(p)));
});

// ---- the Korean composition, inside the input sections -------------------------------------------------------------

const KOREAN_PLAN = {...planOf('korean', {scene: 'chrome'}), unicode: {fields: ['chrome'], conditions: ['latin', 'korean']}};

test('the Korean warm-up: the field cleared, one composition once Korean holds, what composed read, ended, Korean established again, emptied by the harness, before its first Korean row', async () => {
  const {result, events, code, calls} = await ordered({plan: KOREAN_PLAN});
  assert.equal(code, 0, JSON.stringify(result.problems));
  assert.deepEqual(validateCellResult(result), []);
  const at = events.indexOf('warmup.composition');
  // Before: the Korean condition's own establishment (selected, the refocus through TextEdit, read back engaged).
  assert.deepEqual(events.slice(at - 7, at + 9), ['current', 'select Korean', 'activate textedit', 'activate chrome', 'current', 'warmup.prepare', 'field-empty chrome',
    'warmup.composition', 'select ABC', 'current', 'select Korean', 'activate textedit', 'activate chrome', 'current', 'field-empty chrome', 'cell']);
  const composition = calls.find(c => tagOf(c.code) === 'warmup.composition');
  assert.ok(composition.code.includes('await __app.pressKey("r k");'), 'the pressKey row\'s keys');
  // The field's first Korean row comes after it.
  const firstKorean = result.rows.findIndex(r => r.condition === 'korean');
  assert.ok(firstKorean >= 0 && result.rows.slice(firstKorean).every(r => r.ok === true && !r.invalid));
  const korean = result.meta.warmUp.steps.filter(s => s.kind === 'composition' && !s.skipped);
  const EMPTIED = {emptied: true, count: 1, settable: true, write: 0, readBack: 0, reads: 1};
  // The dry focus probe reads the field empty: the category says so.
  assert.deepEqual(strip(korean), [{venue: 'chrome', kind: 'composition', sent: true, ok: true, errorName: null, cleared: EMPTIED, composed: 'empty', composedReads: 2,
    ended: true, korean: true, retried: false, neutral: EMPTIED}]);
  // Electron is not in the plan: no warm-up runs there, and that is recorded.
  assert.deepEqual(result.meta.warmUp.steps.filter(s => s.kind === 'composition' && s.skipped).map(s => [s.venue, s.skipped]), [['electron', 'the Korean condition does not run for this field in the plan']]);
  assert.ok(!JSON.stringify(result.meta.warmUp).includes('가') && !/[0-9a-f]{64}/.test(JSON.stringify(result.meta.warmUp)));
});

// Review minor 6(b): what composed, a category taken from one settled read, the first-lane effect inside the warm-up.
test('the Korean warm-up records what composed as a category alone: complete, partial (ㄱ only), or unread', async () => {
  const reading = hash => {
    let armed = false;
    return {matrix: (base, a) => {
      const out = base(a);
      if (a[0] === 'field-empty' && a.includes('chrome')) armed = true;
      return armed && a[0] === 'read' && out.focus ? {...out, focus: {...out.focus, valueHash: hash}} : out;
    }};
  };
  const composedOf = async ops => (await ordered({plan: KOREAN_PLAN, ops})).result.meta.warmUp.steps.find(s => s.kind === 'composition' && !s.skipped);
  const complete = await composedOf(reading(sha256Hex('가')));
  assert.deepEqual([complete.composed, complete.composedReads], ['complete', 1]);
  const partial = await composedOf(reading(sha256Hex('ㄱ')));
  assert.deepEqual([partial.composed, partial.composedReads], ['partial', 2]);
  assert.equal((await composedOf(reading(null))).composed, 'unread');
  assert.equal((await composedOf(reading(sha256Hex('x')))).composed, 'other');
});

// Verification review: what composed is a diagnostic; the cleanup never depends on it. A read that throws there is
// recorded unread, and the composition is still ended, Korean established again and the field emptied.
test('a composed-outcome read that throws is recorded unread; the cleanup still runs and the field\'s Korean rows still run', async () => {
  let composed = false, selected = false, thrown = 0;
  const cell = c => { if (tagOf(c) === 'warmup.composition') composed = true; return null; };
  const ops = {matrix: (base, a) => {
    if (composed && a[0] === 'source' && a[1] === 'select') selected = true;
    if (composed && !selected && a[0] === 'read') { thrown += 1; throw new Error('the focus probe failed'); }
    return base(a);
  }};
  const {result, events, code} = await ordered({plan: KOREAN_PLAN, ops, cell});
  assert.equal(code, 0, JSON.stringify(result.problems));
  assert.ok(thrown > 0, 'the composed read was reached');
  const step = result.meta.warmUp.steps.find(s => s.kind === 'composition' && !s.skipped);
  assert.deepEqual([step.sent, step.composed, step.ended, step.korean, step.neutral?.emptied], [true, 'unread', true, true, true]);
  assert.ok(!JSON.stringify(step).includes('the focus probe failed'), 'never the error\'s words');
  const at = events.indexOf('warmup.composition');
  assert.deepEqual(events.slice(at, at + 8), ['warmup.composition', 'select ABC', 'current', 'select Korean', 'activate textedit', 'activate chrome', 'current', 'field-empty chrome']);
  const rows = result.rows.filter(r => r.condition === 'korean');
  assert.ok(rows.length > 0 && rows.every(r => r.ok === true && !r.invalid));
});

// Review finding 2: the warm-up never invalidates its rows.
test('keys never sent: no source switch, no re-establishment, no emptying; the rows run under the Korean that held', async () => {
  let korean = false;
  const ops = {matrix: (base, a) => { if (a[0] === 'source' && a[1] === 'select' && a.includes(KOREAN_2SET)) korean = true; return base(a); }};
  const unprepared = c => (korean && tagOf(c) === 'warmup.prepare' ? {ready: false, reason: 'the field is not in the text'} : null);
  const {result, events, code} = await ordered({plan: KOREAN_PLAN, ops, cell: unprepared});
  assert.equal(code, 0, JSON.stringify(result.problems));
  const step = result.meta.warmUp.steps.find(s => s.kind === 'composition' && !s.skipped);
  assert.deepEqual(strip([step]), [{venue: 'chrome', kind: 'composition', sent: false, ok: false, errorName: null, unsent: 'not prepared: the field is not in the text', ended: null, korean: null, retried: false}]);
  const at = events.lastIndexOf('warmup.prepare');
  assert.deepEqual(events.slice(at, at + 2), ['warmup.prepare', 'cell'], 'straight to the first Korean row');
  const rows = result.rows.filter(r => r.condition === 'korean');
  assert.ok(rows.length > 0 && rows.every(r => r.ok === true && !r.invalid));
});

test('Korean that does not engage again after the warm-up is tried once more; a second miss leaves the rows invalid by their own precondition', async () => {
  // The post-refocus reading after the warm-up's end: ABC's layout `misses` times.
  const flaky = misses => {
    let composed = false, left = misses;
    return {cell: c => { if (tagOf(c) === 'warmup.composition') composed = true; return null; }, ops: {matrix: (base, a) => {
      const out = base(a);
      if (composed && a[0] === 'source' && a[1] === 'current' && out.answer?.current === KOREAN_2SET && left > 0) { left -= 1; return {...out, answer: {...out.answer, layout: 'com.apple.keylayout.ABC'}}; }
      return out;
    }}};
  };
  // After the warm-up's ABC, each koreanIn's first read is ABC and its post-refocus read Korean: one miss is the first try's.
  const once = await ordered({plan: KOREAN_PLAN, ...flaky(1)});
  const retried = once.result.meta.warmUp.steps.find(s => s.kind === 'composition' && !s.skipped);
  assert.deepEqual([retried.ended, retried.retried, retried.korean], [true, true, true]);
  assert.ok(once.result.rows.filter(r => r.condition === 'korean').every(r => r.ok === true && !r.invalid));
  // Never again: both tries miss.
  const twice = await ordered({plan: KOREAN_PLAN, ...flaky(Infinity)});
  const missed = twice.result.meta.warmUp.steps.find(s => s.kind === 'composition' && !s.skipped);
  assert.deepEqual([missed.retried, missed.korean], [true, false]);
  assert.ok(twice.result.rows.filter(r => r.condition === 'korean').every(r => /^the Korean source did not engage in chrome after its refocus/.test(r.invalid)));
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

// The Korean step's last emptying is record-only: every Korean row's prepare sets its own field (unicodeCase: emptyField).
test('a Korean warm-up whose composition failed or whose field did not read back empty stops nothing; the rows run', async () => {
  let korean = false;
  const failed = c => (tagOf(c) === 'warmup.composition' ? {cellError: 'Error: keys refused'} : null);
  const notEmptied = {matrix: (base, a) => {
    if (a[0] === 'source' && a[1] === 'select' && a.includes(KOREAN_2SET)) korean = true;
    return korean && a[0] === 'field-empty' ? {answer: {emptied: false, count: 0, settable: null, write: null, readBack: null, reads: 0, why: 'no-field'}, at: [1, 2]} : base(a);
  }};
  const {result, code} = await ordered({plan: KOREAN_PLAN, cell: failed, ops: notEmptied});
  assert.deepEqual([code, result.complete], [0, true], JSON.stringify(result.problems));
  const step = result.meta.warmUp.steps.find(s => s.kind === 'composition' && s.venue === 'chrome');
  assert.deepEqual([step.sent, step.ok, step.composed, step.neutral.emptied, step.korean], [true, false, null, false, true]);
  const rows = result.rows.filter(r => r.condition === 'korean');
  assert.ok(rows.length > 0 && rows.every(r => r.ok === true && !r.invalid), JSON.stringify(rows.find(r => r.invalid)));
  // Why record-only: every Korean row of every web field prepares its own field, emptied through its own case.
  const planned = unicodeRowsOf({fields: COMPOSITION_VENUES, conditions: ['korean']});
  assert.ok(planned.length > 0 && planned.every(r => unicodeCase(r).prepare === emptyField(r.field)));
});
