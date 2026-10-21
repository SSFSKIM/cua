// The Korean and Unicode matrix in a matrix run (scripts/native-matrix/unicode-run.mjs; the spec's Verification system
// part 6, Acceptance 4) against the run's doubles: every row of `cell korean --scene textedit` in run order with the
// source each condition needs, the owner's source and preference saved first and restored last; the mid-switch row
// judged by the entered count against the field; the composition and per-context conditions valid only when their
// readings held; a row that disturbs the user's composition failing and the rest invalid.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {sha256Hex} from '../../scripts/native-matrix/matrix-text.mjs';
import {planOf} from '../../scripts/native-matrix/run.mjs';
import {KOREAN_2SET, MID_SWITCH, unicodeRowsOf} from '../../scripts/native-matrix/unicode-plan.mjs';
import {matrixSteps, runWith} from './run-doubles.mjs';

const tagOf = code => /cua-matrix-cell: ([\w.]+)/.exec(code)?.[1] ?? null;
const atOf = code => Number(/const __at = (\d+)/.exec(code)?.[1]);
const sources = steps => matrixSteps(steps, 'source').map(a => [a[1], ...(a.includes('--source') ? [a[a.indexOf('--source') + 1].replace(/^com\.apple\.(keylayout|inputmethod)\./, '')] : []),
  ...(a.includes('--value') ? [a[a.indexOf('--value') + 1]] : [])].join(' '));
const ENTERED = 30;
// The mid-switch: stopped by the switch after ENTERED units, the field holding exactly those.
const midSwitch = c => (tagOf(c) === 'unicode.midSwitch' ? {actMs: 900, callAt: atOf(c), endAt: atOf(c) + 900, late: 0, threw: true, errorName: 'inputSourceChanged', message: 'changed',
  _meta: {'cua/actionInterval': {startedAt: atOf(c) + 50, endedAt: atOf(c) + 900}, 'cua/entered': ENTERED}}
  : tagOf(c) === 'unicode.midSwitch.check' ? {hash: sha256Hex(MID_SWITCH.text.slice(0, ENTERED)), length: ENTERED} : null);
// The driven scene's context reads Korean when it is brought back (the per-context preference held).
const contextHeld = {matrix: (base, a) => { const out = base(a); return a[0] === 'source' && a[1] === 'current' ? {...out, answer: {current: KOREAN_2SET}} : out; }};

test('cell korean --scene textedit: every row in run order under its source, Acceptance 4\'s two rows among them, the owner\'s source restored last', async () => {
  const {code, steps, result} = await runWith({plan: planOf('korean', {scene: 'textedit'}), cellName: 'korean', cell: midSwitch, ops: contextHeld});
  assert.equal(code, 0, JSON.stringify(result.problems));
  assert.deepEqual(validateCellResult(result), []);
  const expected = unicodeRowsOf(planOf('korean', {scene: 'textedit'}).unicode).map(r => r.id);
  assert.deepEqual(result.rows.map(r => r.id), expected);
  assert.ok(result.rows.every(r => r.section === 'unicode' && r.ok === true && !r.invalid), JSON.stringify(result.rows.filter(r => !r.ok).slice(0, 2)));
  assert.ok(result.rows.some(r => r.id === 'textedit/latin/typeText.acceptance4') && result.rows.some(r => r.id === 'textedit/korean/typeText.acceptance4'));
  // The run's Latin; then each target's source read with it in front (this double's context always reads Korean): the
  // Latin condition's and the mid-switch's selected there, the one after the switch; the Korean conditions' read as
  // held; then the per-context condition's.
  assert.deepEqual(sources(steps), ['save', 'per-context off', 'select ABC', 'current', 'select ABC', 'current', 'select ABC', 'select ABC', 'current', 'current',
    'per-context on', 'select Korean.2SetKorean', 'select ABC', 'current', 'restore']);
  // The mid-switch: the probe's switch scheduled inside the typing, finished after it.
  assert.deepEqual(matrixSteps(steps, 'probe').map(a => a[1]), ['input-source', 'finish', 'keystroke', 'finish']);
  const mid = result.rows.find(r => r.condition === 'midSwitch');
  assert.deepEqual([mid.outcome.stopped, mid.outcome.entered, mid.outcome.exact], [true, ENTERED, true]);
  // The composition: the probe's ANSI r into the user window (the Electron fixture's field), read back as ㄱ.
  const composing = matrixSteps(steps, 'probe').find(a => a[1] === 'keystroke');
  assert.deepEqual([composing[composing.indexOf('--text') + 1], composing[composing.indexOf('--mode') + 1]], ['r', 'ansiKeys']);
  assert.ok(result.rows.filter(r => r.condition === 'composing').every(r => r.user === 'electron' && r.outcome.userKept === true && r.interference?.ok === true));
  assert.deepEqual(result.meta.unicode.unusedDeclarations, []);
});

test('the mid-switch row: a switch outside the typing is retried; a typing the switch did not stop, or a field not holding the entered count, fails', async () => {
  const plan = {...planOf('korean', {scene: 'chrome'}), unicode: {fields: ['chrome'], conditions: ['midSwitch']}};
  const notStopped = await runWith({plan, cellName: 'korean', cell: c => (tagOf(c) === 'unicode.midSwitch' ? {...midSwitch(c), threw: false, errorName: null} : midSwitch(c))});
  const row = notStopped.result.rows[0];
  assert.deepEqual([row.ok, row.invalid, row.outcome.stopped], [false, undefined, false]);
  const short = await runWith({plan, cellName: 'korean', cell: c => (tagOf(c) === 'unicode.midSwitch.check' ? {hash: sha256Hex('x'), length: ENTERED} : midSwitch(c))});
  assert.equal(short.result.rows[0].outcome.exact, false);
  const outside = await runWith({plan, cellName: 'korean',
    cell: c => (tagOf(c) === 'unicode.midSwitch' ? {...midSwitch(c), _meta: {...midSwitch(c)._meta, 'cua/actionInterval': {startedAt: atOf(c) + 500, endedAt: atOf(c) + 900}}} : midSwitch(c))});
  assert.equal(outside.result.rows[0].attempts, 2, 'the second attempt aimed at the measured interval');
  assert.equal(outside.result.rows[0].invalid, undefined);
});

test('a composition the user window did not show, or a per-context context that did not hold, leaves those rows invalid; a row that disturbed the composition fails and the rest are invalid', async () => {
  const plan = {...planOf('korean', {scene: 'chrome'}), unicode: {fields: ['chrome'], conditions: ['composing', 'perContext']}};
  // The composed jamo not read: no composition in progress.
  const noComposition = await runWith({plan, cellName: 'korean', ops: {matrix: (base, a) => {
    const out = base(a);
    return a[0] === 'read' && out.focus && out.focus.valueHash === sha256Hex('ㄱ') ? {...out, focus: {...out.focus, valueHash: sha256Hex('r')}} : out;
  }}});
  assert.ok(noComposition.result.rows.filter(r => r.condition === 'composing').every(r => /no composition in progress/.test(r.invalid)));
  assert.ok(noComposition.result.rows.filter(r => r.condition === 'perContext').every(r => /did not read Korean afterwards/.test(r.invalid)), 'the dry context reads Latin when brought back');
  // The second composing row's act changes the user's field.
  let acts = 0, disturbed = false;
  const run = await runWith({plan: {...plan, unicode: {fields: ['chrome'], conditions: ['composing']}}, cellName: 'korean',
    lane: code => { if (/__app\.(typeText|paste)\(/.test(code) && !tagOf(code) && ++acts === 2) disturbed = true; },
    ops: {matrix: (base, a) => { const out = base(a); return disturbed && a[0] === 'read' && out.focus ? {...out, focus: {...out.focus, valueHash: sha256Hex('가')}} : out; }}});
  const rows = run.result.rows;
  assert.deepEqual([rows[0].ok, rows[1].ok, rows[1].outcome.userKept], [true, false, false]);
  assert.ok(rows.slice(2).every(r => /disturbed the user window's composition/.test(r.invalid)));
  assert.equal(run.result.verdict, 'fail');
});

test('a per-context preference still reading on after the off request leaves every source-dependent row invalid, whatever a selection read back', async () => {
  const stillOn = {matrix: (base, a) => { const out = base(a); return a[0] === 'source' && a[1] === 'per-context' ? {...out, answer: {perContext: true}} : out; }};
  const {result} = await runWith({plan: planOf('korean', {scene: 'textedit'}), cellName: 'korean', cell: midSwitch, ops: stillOn});
  assert.equal(result.meta.inputSource.latin, false);
  const dependent = result.rows.filter(r => r.condition !== 'perContext');
  assert.ok(dependent.length > 0);
  assert.ok(dependent.every(r => /per-context preference did not read off/.test(r.invalid)), JSON.stringify(dependent.find(r => !r.invalid)));
  assert.notEqual(result.verdict, 'pass');
});

test('each target\'s source is read with the target in front and selected there when it reads another; one that will not hold leaves its rows invalid', async () => {
  const plan = {...planOf('korean', {scene: 'chrome'}), unicode: {fields: ['chrome'], conditions: ['latin', 'korean']}};
  // Chrome's context reads Korean when it first comes to the front: the Latin source is selected with it in front.
  let drift = true;
  const drifted = {matrix: (base, a) => {
    const out = base(a);
    if (a[0] === 'source' && a[1] === 'current' && drift) { drift = false; return {...out, answer: {current: KOREAN_2SET}}; }
    return out;
  }};
  const {steps, result} = await runWith({plan, cellName: 'korean', ops: drifted});
  assert.deepEqual(sources(steps), ['save', 'per-context off', 'select ABC', 'current', 'select ABC', 'current', 'select Korean.2SetKorean', 'restore']);
  assert.ok(result.rows.every(r => r.ok === true && !r.invalid));
  // The Korean source never holds in Chrome's context: its rows invalid, the Latin ones judged.
  const refused = {matrix: (base, a) => (a[0] === 'source' && a[1] === 'select' && a.includes(KOREAN_2SET) ? {answer: {selected: false, current: 'com.apple.keylayout.ABC'}, at: [1, 2]} : base(a))};
  const stuck = await runWith({plan, cellName: 'korean', ops: refused});
  assert.ok(stuck.result.rows.filter(r => r.condition === 'korean').every(r => /Korean source did not hold with chrome in front/.test(r.invalid)));
  assert.ok(stuck.result.rows.filter(r => r.condition === 'latin').every(r => r.ok === true));
});
