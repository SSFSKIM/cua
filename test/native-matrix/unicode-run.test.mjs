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
import {HANGUL_LAYOUT} from '../../scripts/native-matrix/unicode-run.mjs';
import {matrixSteps, runWith} from './run-doubles.mjs';

const tagOf = code => /cua-matrix-cell: ([\w.]+)/.exec(code)?.[1] ?? null;
const atOf = code => Number(/const __at = (\d+)/.exec(code)?.[1]);
const sources = steps => matrixSteps(steps, 'source').map(a => [a[1], ...(a.includes('--source') ? [a[a.indexOf('--source') + 1].replace(/^com\.apple\.(keylayout|inputmethod)\./, '')] : []),
  ...(a.includes('--value') ? [a[a.indexOf('--value') + 1]] : [])].join(' '));
const ENTERED = 30;
// A source reading as the device reports it: 2-Set engaged (its own layout), or Latin.
const KOREAN = {current: KOREAN_2SET, layout: HANGUL_LAYOUT}, LATIN = {current: 'com.apple.keylayout.ABC', layout: 'com.apple.keylayout.ABC'};
// The mid-switch: stopped by the switch after ENTERED units, the field holding exactly those.
const midSwitch = c => (tagOf(c) === 'unicode.midSwitch' ? {actMs: 900, callAt: atOf(c), endAt: atOf(c) + 900, late: 0, threw: true, errorName: 'Error',
  message: `Computer Use server error -10005: The input source changed after ${ENTERED} of ${MID_SWITCH.text.length} characters were entered; get the app's state to see what was typed.`,
  _meta: {'cua/actionInterval': {startedAt: atOf(c) + 50, endedAt: atOf(c) + 900}, 'cua/entered': ENTERED}}
  : tagOf(c) === 'unicode.midSwitch.check' ? {hash: sha256Hex(MID_SWITCH.text.slice(0, ENTERED)), length: ENTERED} : null);
// The driven scene's context reads Korean when it is brought back (the per-context preference held).
const contextHeld = {matrix: (base, a) => { const out = base(a); return a[0] === 'source' && a[1] === 'current' ? {...out, answer: KOREAN} : out; }};

test('cell korean --scene textedit: every row in run order under its source, Acceptance 4\'s two rows among them, the owner\'s source restored last', async () => {
  const {code, steps, result} = await runWith({plan: planOf('korean', {scene: 'textedit'}), cellName: 'korean', cell: midSwitch, ops: contextHeld});
  assert.equal(code, 0, JSON.stringify(result.problems));
  assert.deepEqual(validateCellResult(result), []);
  const expected = unicodeRowsOf(planOf('korean', {scene: 'textedit'}).unicode).map(r => r.id);
  assert.deepEqual(result.rows.map(r => r.id), expected);
  assert.ok(result.rows.every(r => r.section === 'unicode' && r.ok === true && !r.invalid), JSON.stringify(result.rows.filter(r => !r.ok).slice(0, 2)));
  assert.ok(result.rows.some(r => r.id === 'textedit/latin/typeText.acceptance4') && result.rows.some(r => r.id === 'textedit/korean/typeText.acceptance4'));
  // The run's Latin; then each target's source read with it in front (this double's context always reads Korean): the
  // Latin condition's and the mid-switch's selected there, the one after the switch; the Korean condition's read as
  // held, then read again after the refocus; the composition's Latin with its user window in front (ending any
  // composition there), then Korean read as held and read again after the refocus; then the per-context condition's,
  // read and read after the refocus, the user window's Latin, and the read-back after the driven scene came back.
  assert.deepEqual(sources(steps), ['save', 'per-context off', 'select ABC', 'current', 'select ABC', 'current', 'select ABC', 'select ABC', 'current', 'current',
    'select ABC', 'current', 'current', 'per-context on', 'current', 'current', 'select ABC', 'current', 'restore']);
  // The mid-switch: the probe's switch scheduled inside the typing, finished after it.
  assert.deepEqual(matrixSteps(steps, 'probe').map(a => a[1]), ['input-source', 'finish', 'keystroke', 'finish']);
  const mid = result.rows.find(r => r.condition === 'midSwitch');
  assert.deepEqual([mid.outcome.stopped, mid.outcome.entered, mid.outcome.exact], [true, ENTERED, true]);
  assert.match(mid.outcome.message, /The input source changed after 30 of/, 'the engine\'s sentence is kept on the row');
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

test('a composition the user window\'s input method still holds from an earlier row is ended before the field is emptied and the jamo composed; one still open leaves the rows invalid', async () => {
  // Hold 2b, both lanes: the Korean condition's `r k` row left 가 composing in the Electron field (Chromium sends the
  // pid-posted keys through the input method), and the composing condition's user window was Electron with nothing
  // activated in between, so the probe's r composed 각, not ㄱ. Likewise TextEdit after the Chrome group's ㄱ (ㄲ).
  // The double: an input method holding a syllable in the user window that a source switch made with the field focused
  // does not reach (MAWS B2's regime) and that the window's losing the focus ends (`ends`).
  const plan = {...planOf('korean', {scene: 'textedit'}), unicode: {fields: ['textedit'], conditions: ['composing']}};
  const imeRun = async ({ends}) => {
    let open = true;
    const events = [];
    const ime = {matrix: (base, a) => {
      if (a[0] === 'source' && a[1] === 'select') events.push(`select ${a[a.indexOf('--source') + 1]}`);
      if (a[0] === 'step' && a[1] === 'activate') { events.push(`activate ${a[2]}`); if (a[2] !== 'electron' && ends) open = false; }
      if (a[0] === 'probe' && a[1] === 'keystroke') events.push('probe');
      const out = base(a);
      return open && a[0] === 'read' && out.focus?.valueHash === sha256Hex('ㄱ') ? {...out, focus: {...out.focus, valueHash: sha256Hex('각')}} : out;
    }};
    const lane = code => { if (tagOf(code) === 'field.empty') events.push('empty'); };
    return {events, ...(await runWith({plan, cellName: 'korean', ops: ime, lane}))};
  };
  const {events, result} = await imeRun({ends: true});
  assert.ok(result.rows.every(r => !r.invalid), JSON.stringify(result.rows.find(r => r.invalid)));
  const ended = result.meta.unicode.readings.find(r => r.when === 'composing@electron:end');
  assert.deepEqual([ended.select, ended.held], ['com.apple.keylayout.ABC', true]);
  // The user window in front, Latin then Korean selected there, the refocus (another scene, then the user window), then
  // its field emptied, then the probe's key.
  const from = events.lastIndexOf('activate electron', events.indexOf('probe'));
  assert.deepEqual(events.slice(from - 3, from + 2), ['select com.apple.keylayout.ABC', 'select com.apple.inputmethod.Korean.2SetKorean', 'activate textedit', 'activate electron', 'empty']);
  // A composition nothing ended: the field reads 각 after the probe's r, so no composition of the run's is in progress.
  const stuck = await imeRun({ends: false});
  assert.ok(stuck.result.rows.every(r => /no composition in progress: the user window's field did not read the composed jamo/.test(r.invalid)));
});

test('Korean counts only on its layout after the target is refocused: a selection made with the field focused that leaves the layout ABC (MAWS B2) is engaged by the refocus, and one the refocus does not engage leaves the rows invalid', async () => {
  const plan = {...planOf('korean', {scene: 'textedit'}), unicode: {fields: ['textedit'], conditions: ['korean']}};
  // The device: a 2-Set selection reads back as current with the layout still ABC until the target loses and regains
  // the focus (`engages`); `steps` records the order of selections, activations and source reads.
  const b2Run = async ({engages}) => {
    let selected = null, engaged = false, away = false;
    const order = [];
    const ops = {matrix: (base, a) => {
      const out = base(a);
      if (a[0] === 'step' && a[1] === 'activate') { order.push(`activate ${a[2]}`); if (a[2] !== 'textedit') away = true; else if (away && selected === KOREAN_2SET && engages) engaged = true; }
      if (a[0] !== 'source') return out;
      if (a[1] === 'select') { selected = a[a.indexOf('--source') + 1]; engaged = false; away = false; order.push(`select ${selected === KOREAN_2SET ? 'Korean' : 'ABC'}`); }
      if (a[1] === 'current') order.push('current');
      const reading = selected === KOREAN_2SET ? {current: KOREAN_2SET, layout: engaged ? HANGUL_LAYOUT : 'com.apple.keylayout.ABC'} : LATIN;
      return ['select', 'current'].includes(a[1]) ? {...out, answer: {...out.answer, ...reading}} : out;
    }};
    return {order, ...(await runWith({plan, cellName: 'korean', ops}))};
  };
  const {order, result} = await b2Run({engages: true});
  assert.ok(result.rows.every(r => r.ok === true && !r.invalid), JSON.stringify(result.rows.find(r => r.invalid)));
  const at = order.lastIndexOf('select Korean');
  assert.deepEqual(order.slice(at, at + 4), ['select Korean', `activate ${order[at + 1].slice(9)}`, 'activate textedit', 'current']);
  assert.notEqual(order[at + 1], 'activate textedit', 'another scene first');
  const readings = result.meta.unicode.readings;
  assert.deepEqual(readings.find(r => r.when === 'korean:textedit pre-refocus'), {when: 'korean:textedit pre-refocus', select: KOREAN_2SET, held: true, layout: 'com.apple.keylayout.ABC'});
  assert.deepEqual(readings.find(r => r.when === 'korean:textedit post-refocus'), {when: 'korean:textedit post-refocus', current: KOREAN_2SET, layout: HANGUL_LAYOUT, held: true});
  const raw = await b2Run({engages: false});
  assert.ok(raw.result.rows.every(r => r.invalid === 'the Korean source did not engage in textedit after its refocus: the source read com.apple.inputmethod.Korean.2SetKorean, the layout com.apple.keylayout.ABC'),
    JSON.stringify(raw.result.rows[0]));
});

test('the per-context condition reads the driven scene\'s source again for a while after bringing it back, since the switch follows the activation', async () => {
  const plan = {...planOf('korean', {scene: 'chrome'}), unicode: {fields: ['chrome'], conditions: ['perContext']}};
  // Chrome's context reads Latin on the first reading after it comes back, Korean on the second.
  // (Brought back: Chrome's activation after the user window's Latin was selected.)
  let on = false, latin = false, back = false, reads = 0;
  const late = {matrix: (base, a) => {
    if (a[0] === 'source' && a[1] === 'per-context' && a.includes('on')) on = true;
    if (on && a[0] === 'source' && a[1] === 'select' && a.includes('com.apple.keylayout.ABC')) latin = true;
    if (latin && a[0] === 'step' && a[1] === 'activate' && a[2] === 'chrome') back = true;
    const out = base(a);
    if (a[0] === 'source' && a[1] === 'current' && back) return {...out, answer: ++reads < 2 ? LATIN : KOREAN};
    return out;
  }};
  const slept = [];
  const {result} = await runWith({plan, cellName: 'korean', ops: late, slept});
  assert.ok(result.rows.every(r => r.ok === true && !r.invalid), JSON.stringify(result.rows.find(r => r.invalid)));
  const reading = result.meta.unicode.readings.find(r => r.when === 'perContext:chrome@textedit');
  assert.deepEqual([reading.heldAfter, reading.reads], [true, 2]);
  assert.ok(slept.length > 0, 'waited between the readings');
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
    if (a[0] === 'source' && a[1] === 'current' && drift) { drift = false; return {...out, answer: KOREAN}; }
    return out;
  }};
  const {steps, result} = await runWith({plan, cellName: 'korean', ops: drifted});
  assert.deepEqual(sources(steps), ['save', 'per-context off', 'select ABC', 'current', 'select ABC', 'current', 'select Korean.2SetKorean', 'current', 'restore']);
  assert.ok(result.rows.every(r => r.ok === true && !r.invalid));
  // The Korean source never holds in Chrome's context: its rows invalid, the Latin ones judged.
  const refused = {matrix: (base, a) => (a[0] === 'source' && a[1] === 'select' && a.includes(KOREAN_2SET) ? {answer: {selected: false, ...LATIN}, at: [1, 2]} : base(a))};
  const stuck = await runWith({plan, cellName: 'korean', ops: refused});
  assert.ok(stuck.result.rows.filter(r => r.condition === 'korean').every(r => /Korean source did not hold with chrome in front/.test(r.invalid)));
  assert.ok(stuck.result.rows.filter(r => r.condition === 'latin').every(r => r.ok === true));
});
