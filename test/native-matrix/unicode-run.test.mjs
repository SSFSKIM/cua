// The Korean and Unicode matrix in a matrix run (scripts/native-matrix/unicode-run.mjs; the spec's Verification system
// part 6, Acceptance 4) against the run's doubles: every row of `cell korean --scene textedit` in run order with the
// source each condition needs, the owner's source and preference saved first and restored last; the mid-switch row
// judged by the entered count against the field; the composition and per-context conditions valid only when their
// readings held; a row that disturbs the user's composition failing and the rest invalid.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {sha256Hex} from '../../scripts/native-matrix/matrix-text.mjs';
import {emptyFieldCell} from '../../scripts/native-matrix/probe-plan.mjs';
import {planOf} from '../../scripts/native-matrix/run.mjs';
import {sampleCause} from '../../scripts/native-matrix/front-key.mjs';
import {HELD_INVALID, Stop} from '../../scripts/native-matrix/steps.mjs';
import {KOREAN_2SET, MID_SWITCH, NOT_JUDGED, UNICODE_FIELDS, unicodeRowsOf} from '../../scripts/native-matrix/unicode-plan.mjs';
import {HANGUL_LAYOUT, judgeMidSwitch} from '../../scripts/native-matrix/unicode-run.mjs';
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
  assert.deepEqual(sources(steps), ['state', 'save', 'per-context off', 'select ABC', 'current', 'select ABC', 'current', 'select ABC', 'select ABC', 'current', 'current',
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
  assert.equal(result.meta.unicode.unusedDeclarations, undefined, 'the run applies no declaration: the judge applies the departures file');
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

// #186's oracle: the count in the engine's own sentence, the meta's count and the field's committed prefix (its length,
// and its hash against the text's first units) must all agree.
test('the mid-switch judgement holds the sentence\'s count to the field-backed offset, and the meta\'s too', () => {
  const text = MID_SWITCH.text;
  const sentence = (n, of = text.length) => `Computer Use server error -10005: The input source changed after ${n} of ${of} characters were entered; get the app's state to see what was typed.`;
  const field = n => ({length: n, hash: sha256Hex(text.slice(0, n))});
  const judge = ({n = 30, said = n, of = text.length, entered = n, held = field(n), threw = true} = {}) =>
    judgeMidSwitch({threw, message: sentence(said, of), entered, field: held, text});
  assert.deepEqual(judge(), {stopped: true, exact: true, sentenceEntered: 30, sentenceAgrees: true, ok: true});
  // The sentence one short of the field (#186's defect), the meta right: fails on the sentence.
  assert.deepEqual(judge({said: 29}), {stopped: true, exact: true, sentenceEntered: 29, sentenceAgrees: false, ok: false});
  // Both counts one short of what the field holds: not exact, and the sentence disagrees with the field.
  assert.deepEqual(judge({said: 29, entered: 29}), {stopped: true, exact: false, sentenceEntered: 29, sentenceAgrees: false, ok: false});
  assert.equal(judge({of: text.length + 1}).ok, false, 'the sentence names another request\'s length');
  assert.equal(judge({held: {length: 30, hash: sha256Hex('x')}}).ok, false, 'the field holds other text');
  assert.equal(judge({threw: false}).stopped, false);
  assert.deepEqual(judgeMidSwitch({threw: true, message: 'Computer Use server error -10005: Timed out', entered: 30, field: field(30), text}),
    {stopped: false, exact: true, sentenceEntered: null, sentenceAgrees: false, ok: false});
});

test('a composition the user window did not show, or a per-context context that did not hold, leaves those rows invalid; a row that disturbed the composition fails and the rest are invalid', async () => {
  const plan = {...planOf('korean', {scene: 'chrome'}), unicode: {fields: ['chrome'], conditions: ['composing', 'perContext']}};
  // The composed jamo not read: no composition in progress.
  const noComposition = await runWith({plan, cellName: 'korean', ops: {matrix: (base, a) => {
    const out = base(a);
    return a[0] === 'read' && out.focus && out.focus.valueHash === sha256Hex('ㄱ') ? {...out, focus: {...out.focus, valueHash: sha256Hex('r')}} : out;
  }}});
  assert.ok(noComposition.result.rows.filter(r => r.condition === 'composing').every(r => /no composition in progress/.test(r.invalid)));
  // What the field read instead is named (pilot C-2: composing@textedit's rows said only that the jamo was not read).
  assert.ok(noComposition.result.rows.filter(r => r.condition === 'composing').every(r => /\(it read the probe's raw key, uncomposed\)$/.test(r.invalid)));
  assert.equal(noComposition.result.meta.unicode.readings.find(r => r.when === 'composing@textedit').read, 'raw key');
  // A context that did not read Korean back: NO VERDICT `venue`, naming the read-back (pilot C-2 and the mini alike: the
  // preference read on, the context read ABC after its reactivation), never a sample counted against an engine.
  const perContext = noComposition.result.rows.filter(r => r.condition === 'perContext');
  assert.ok(perContext.length > 0);
  for (const r of perContext) {
    assert.match(r.venueInput, /^the per-context preference read on, but the driven scene's context did not read Korean after its reactivation \(the source read com\.apple\.keylayout\.ABC/);
    assert.equal(r.invalid, r.venueInput);
    assert.equal(sampleCause(r).category, 'venue');
  }
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

// Off a hosted runner nothing is selected, so a source that reads otherwise during the refocus is the owner's switch:
// NO VERDICT ownerInput. A refocus whose activation failed is not: it stays a generic invalid row.
test('off a hosted runner: a source switched during the Korean refocus is NO VERDICT ownerInput; a failed refocus activation stays invalid', async () => {
  const plan = {...planOf('korean', {scene: 'textedit'}), unicode: {fields: ['textedit'], conditions: ['korean']}};
  const owner = {writable: false, refused: 'off a GitHub-hosted runner … (ruling 1188)', ...KOREAN, perContext: false};
  const run = ({readAfterRefocus = KOREAN, refocusFails = false}) => {
    let reads = 0;
    return runWith({plan, cellName: 'korean', ops: {matrix: (base, a) => {
      if (a[0] === 'source' && a[1] === 'state') return {...base(a), answer: owner};
      if (a[0] === 'source' && a[1] === 'current') { reads += 1; return {...base(a), answer: reads === 1 ? KOREAN : readAfterRefocus}; }
      // Only the refocus fails: the activation away from textedit once its source was read.
      if (refocusFails && reads > 0 && a[0] === 'step' && a[1] === 'activate' && a[2] !== 'textedit') { const out = base(a); return {...out, answer: {...out.answer, ok: false, reason: 'did not come to the front'}}; }
      return base(a);
    }}});
  };
  const switched = await run({readAfterRefocus: LATIN});
  assert.ok(switched.result.rows.length > 0 && switched.result.rows.every(r => sampleCause(r).category === 'ownerInput'), JSON.stringify(switched.result.rows[0]));
  assert.match(switched.result.rows[0].ownerInput, /ruling 1188.*; the row needs the input source com\.apple\.inputmethod\.Korean\.2SetKorean, and the source read com\.apple\.keylayout\.ABC in textedit after its refocus$/);
  assert.deepEqual(sources(switched.steps).filter(s => !['current', 'state'].includes(s)), [], 'nothing selected');
  const failed = await run({refocusFails: true});
  assert.ok(failed.result.rows.length > 0 && failed.result.rows.every(r => !r.ownerInput && /^textedit could not be refocused after the Korean source was selected/.test(r.invalid)), JSON.stringify(failed.result.rows[0]));
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
  assert.deepEqual(sources(steps), ['state', 'save', 'per-context off', 'select ABC', 'current', 'select ABC', 'current', 'select Korean.2SetKorean', 'current', 'restore']);
  assert.ok(result.rows.every(r => r.ok === true && !r.invalid));
  // The Korean source never holds in Chrome's context: its rows invalid, the Latin ones judged.
  const refused = {matrix: (base, a) => (a[0] === 'source' && a[1] === 'select' && a.includes(KOREAN_2SET) ? {answer: {selected: false, ...LATIN}, at: [1, 2]} : base(a))};
  const stuck = await runWith({plan, cellName: 'korean', ops: refused});
  assert.ok(stuck.result.rows.filter(r => r.condition === 'korean').every(r => /Korean source did not hold with chrome in front/.test(r.invalid)));
  assert.ok(stuck.result.rows.filter(r => r.condition === 'latin').every(r => r.ok === true));
});

// #189, ruling 1119: r k by pressKey reads back 가 under engaged Korean 2-Set and rk under Latin, in every field; a
// Korean row counts only once the source and its layout read 2-Set after the refocus.
test('the pressKey row is read back as 가 under engaged Korean and rk under Latin in all three fields; Korean not engaged leaves it invalid', async () => {
  const plan = {...planOf('korean'), unicode: {fields: UNICODE_FIELDS, conditions: ['latin', 'korean']}};
  const calls = [];
  const {result} = await runWith({plan, cellName: 'korean', calls});
  const keyed = result.rows.filter(r => r.method === 'pressKey');
  assert.deepEqual(keyed.map(r => [r.id, r.ok, r.invalid ?? null]), [...UNICODE_FIELDS.map(f => [`${f}/latin/pressKey.rk`, true, null]), ...UNICODE_FIELDS.map(f => [`${f}/korean/pressKey.rk`, true, null])]);
  // The row's settling read-back (ruling 1197) holds the expected text's hash.
  const checks = text => calls.filter(c => c.code.includes(`const __want = ${JSON.stringify(sha256Hex(text))}`)).length;
  assert.deepEqual([checks('가'), checks('rk')], [3, 3], 'each field\'s Korean row reads back 가, its Latin row rk');
  // 2-Set selected and read back as the source, its layout still ABC after the refocus: not engaged, so not counted.
  const raw = {matrix: (base, a) => {
    const out = base(a);
    return a[0] === 'source' && a[1] === 'current' && out.answer?.current === KOREAN_2SET ? {...out, answer: {...out.answer, layout: 'com.apple.keylayout.ABC'}} : out;
  }};
  const unengaged = await runWith({plan, cellName: 'korean', ops: raw});
  const korean = unengaged.result.rows.filter(r => r.condition === 'korean' && r.method === 'pressKey');
  assert.equal(korean.length, 3);
  assert.ok(korean.every(r => r.ok === false && /did not engage in \w+ after its refocus: the source read com\.apple\.inputmethod\.Korean\.2SetKorean, the layout com\.apple\.keylayout\.ABC/.test(r.invalid)),
    JSON.stringify(korean[0]));
  assert.ok(unengaged.result.rows.filter(r => r.condition === 'latin' && r.method === 'pressKey').every(r => r.ok === true));
});

// #185, ruling 1119: the per-context rows run and report, excluded from every verdict with the ruling's cause.
test('the per-context rows still run and carry ruling 1119\'s cause; failed or held, they never pass or fail the cell', async () => {
  const plan = {...planOf('korean', {scene: 'chrome'}), unicode: {fields: ['chrome'], conditions: ['latin', 'perContext']}};
  const held = await runWith({plan, cellName: 'korean', ops: contextHeld});
  const perContext = held.result.rows.filter(r => r.condition === 'perContext');
  assert.equal(perContext.length, 18);
  assert.ok(perContext.every(r => r.excluded === NOT_JUDGED.perContext && r.ok === true && !r.invalid), 'run and read back as before');
  assert.ok(held.result.rows.filter(r => r.condition === 'latin').every(r => r.excluded === undefined));
  assert.deepEqual(validateCellResult(held.result), []);
  // Every per-context read-back unequal: the rows say so, and the cell's verdict does not count them.
  const only = {...plan, unicode: {fields: ['chrome'], conditions: ['perContext']}};
  const unequal = c => (c.includes('const exact = __hash ===') ? {ok: false, outcome: {exact: false}} : null);
  const failed = await runWith({plan: only, cellName: 'korean', ops: contextHeld, cell: unequal});
  assert.ok(failed.result.rows.every(r => r.ok === false && !r.invalid && r.excluded === NOT_JUDGED.perContext));
  assert.equal(failed.result.verdict, 'no-verdict', 'excluded rows alone are no verdict, never a fail');
});

// The review's finding: the per-context condition's own setup failing is that condition's, not the run's; a run-wide
// stop stays fail-closed, and the rows already run still carry the cause.
test('a per-context setup that throws fails that condition alone, its rows invalid and excluded; a Stop is never caught, and the rows before it keep the cause', async () => {
  const plan = {...planOf('korean', {scene: 'chrome'}), unicode: {fields: ['chrome'], conditions: ['latin', 'perContext']}};
  const perContextOn = a => a[0] === 'source' && a[1] === 'per-context' && a.includes('on');
  const writeFails = {matrix: (base, a) => { if (perContextOn(a)) throw new Error('defaults write failed'); return base(a); }};
  const {code, steps, result} = await runWith({plan, cellName: 'korean', ops: writeFails});
  const perContext = result.rows.filter(r => r.condition === 'perContext');
  assert.equal(perContext.length, 18);
  assert.ok(perContext.every(r => r.invalid === 'the per-context setup failed: defaults write failed' && r.excluded === NOT_JUDGED.perContext), JSON.stringify(perContext[0]));
  assert.ok(result.rows.filter(r => r.condition === 'latin').every(r => r.ok === true && !r.invalid));
  assert.deepEqual([code, result.complete, result.verdict], [0, true, 'pass'], JSON.stringify(result.problems));
  assert.equal(sources(steps).at(-1), 'restore', 'the owner\'s source and preference restored after');
  assert.ok(result.meta.unicode.readings.some(r => r.when === 'perContext:chrome@textedit' && r.setupError === 'defaults write failed'));
  // Chrome's per-context rows run; Electron's setup meets a run-wide stop, which propagates.
  let ons = 0;
  const stops = {matrix: (base, a) => {
    if (perContextOn(a) && ++ons === 2) throw new Stop('interrupted by SIGINT');
    return contextHeld.matrix(base, a);
  }};
  const stopped = await runWith({plan: {...planOf('korean'), unicode: {fields: ['chrome', 'electron'], conditions: ['perContext']}}, cellName: 'korean', ops: stops});
  assert.equal(stopped.result.complete, false);
  assert.ok(stopped.result.problems.some(p => /stopped: interrupted by SIGINT/.test(p)), JSON.stringify(stopped.result.problems));
  const ran = stopped.result.rows.filter(r => r.condition === 'perContext');
  assert.ok(ran.length === 18 && ran.every(r => r.id.startsWith('chrome/') &&r.excluded === NOT_JUDGED.perContext), JSON.stringify(ran.map(r => [r.id, r.excluded])).slice(0, 300));
});

// The review's second round: only the preference's write is the condition's to recover from. A lane-integrity failure
// in the setup (an answer attested by another engine, a cell without its device-clock window) stops the lane, and no
// request follows it.
test('a lane-integrity failure in the per-context setup is never recovered: after an attestation mismatch no request is issued', async () => {
  const plan = {...planOf('korean'), unicode: {fields: ['chrome', 'electron'], conditions: ['perContext']}};
  const calls = [];
  let injected = null;
  const vendorAttested = c => {
    if (injected !== null || !c.includes(emptyFieldCell('chrome'))) return null;
    injected = calls.length;
    return {ready: true, _meta: {'cua/nativeEngine': {engine: 'vendor', version: '26.0', build: '26.0-dry'}}};
  };
  const {result} = await runWith({plan, cellName: 'korean', ops: contextHeld, cell: vendorAttested, calls});
  assert.notEqual(injected, null, 'the per-context prepare was answered');
  assert.equal(calls.length, injected + 1, `no request after the mismatch: ${calls.slice(injected + 1).map(c => c.code.slice(0, 80)).join(' | ')}`);
  assert.equal(result.complete, false);
  assert.ok(result.problems.some(p => /a result attested the vendor engine, not the requested cua: the lane stopped/.test(p)), JSON.stringify(result.problems));
  assert.ok(!result.rows.some(r => r.condition === 'perContext'), 'no row is made up from a stopped lane');
  assert.ok(!result.meta.unicode.readings.some(r => r.setupError), 'not taken for the condition\'s own failure');
});

// The minor of fix wave 3: replayd's capture alert in front at the mid-switch's key guard on a hosted run. The typing is
// never sent, the input-source probe is still finished, Latin is selected again, and the row is NO VERDICT `alert`.
test('the mid-switch row on a hosted run: the typing the capture alert held is never sent; the probe finished, Latin restored, the row skipped', async () => {
  const UNC = 'com.apple.UserNotificationCenter';
  const plan = {...planOf('korean', {scene: 'chrome'}), unicode: {fields: ['chrome'], conditions: ['midSwitch']}};
  let armed = false, pending = false;
  const calls = [];
  const {result, steps} = await runWith({plan, cellName: 'korean', calls, cell: midSwitch, env: {RUNNER_ENVIRONMENT: 'github-hosted'}, ops: {matrix: (base, a) => {
    if (a[0] === 'probe' && a[1] === 'input-source') armed = true;
    // The guard's read, the first after the probe was scheduled: UserNotificationCenter in front, then gone.
    if (a[0] === 'read' && armed) {
      armed = false; pending = true;
      const x = base(a);
      return {...x, reading: {...x.reading, frontmost: {pid: 77, bundleId: UNC, owned: false}}, frontKey: {front: UNC, key: UNC}};
    }
    if (a[0] === 'alerts' && a[1] === 'check' && pending) {
      pending = false;
      return {abort: false, export: {alerts: [], keywords: [], unknown: {count: 0, windows: []}, held: {count: 1, windows: [{bundleId: UNC, layer: 8, titled: null, size: null}]}}, at: base(a).at};
    }
    return base(a);
  }}});
  assert.equal(result.complete, true, JSON.stringify(result.problems));
  assert.deepEqual(validateCellResult(result), []);
  assert.ok(!calls.some(c => tagOf(c.code) === 'unicode.midSwitch'), 'the typing was never sent');
  const probes = matrixSteps(steps, 'probe').map(a => a[1]);
  assert.deepEqual(probes.slice(probes.indexOf('input-source')), ['input-source', 'finish'], 'the scheduled switch was finished');
  const after = sources(steps).slice(sources(steps).lastIndexOf('select 2SetKorean') + 1);
  assert.ok(after.includes('select ABC'), `Latin selected again after the switch: ${after.join(', ')}`);
  const row = result.rows.find(r => r.condition === 'midSwitch');
  assert.deepEqual([row.ok, row.invalid, row.frontKey.before.front], [false, HELD_INVALID, UNC]);
  assert.equal(sampleCause({...row, hosted: true}).category, 'alert');
  assert.equal(row.error, undefined, 'Latin read back');
});

// Ruling 1188: off a GitHub-hosted runner the device writes no input source or preference. The run reads the owner's
// (here Korean 2-Set, the preference off): the Korean condition runs under it, and every row that needs another
// source, or a switch during it, is NO VERDICT `ownerInput`, its cause naming what it needed. Nothing is saved,
// selected, written or restored.
test('off a hosted runner: the rows the owner\'s source allows run; the rest are NO VERDICT ownerInput, and nothing is switched', async () => {
  const owner = {writable: false, refused: 'off a GitHub-hosted runner the harness never selects an input source or writes com.apple.HIToolbox (ruling 1188)', ...KOREAN, perContext: false};
  const ops = {matrix: (base, a) => (a[0] === 'source' && a[1] === 'state' ? {...base(a), answer: owner} : a[0] === 'source' && a[1] === 'current' ? {...base(a), answer: KOREAN} : base(a))};
  const {code, steps, result} = await runWith({plan: planOf('korean', {scene: 'textedit'}), cellName: 'korean', cell: midSwitch, ops});
  assert.equal(code, 0, JSON.stringify(result.problems));
  assert.deepEqual(validateCellResult(result), []);
  assert.deepEqual(sources(steps).filter(s => !['current', 'state'].includes(s)), [], 'never saved, selected, written or restored: only read');
  assert.deepEqual(matrixSteps(steps, 'probe').filter(a => a[1] === 'input-source'), [], 'no switch scheduled');
  assert.deepEqual(result.meta.inputSource, {written: false, refused: owner.refused, owner: {source: KOREAN_2SET, perContext: false}, perContextOff: true, latin: false});
  const byCondition = c => result.rows.filter(r => r.condition === c);
  assert.ok(byCondition('korean').length > 0 && byCondition('korean').every(r => r.ok === true && !r.invalid && !r.ownerInput), JSON.stringify(byCondition('korean')[0]));
  for (const c of ['latin', 'midSwitch', 'composing', 'perContext']) {
    assert.ok(byCondition(c).length > 0, c);
    for (const r of byCondition(c)) {
      assert.equal(sampleCause(r).category, 'ownerInput', `${c}: ${JSON.stringify(r)}`);
      assert.match(r.ownerInput, /^off a GitHub-hosted runner .*ruling 1188.*; the row needs /);
    }
  }
  assert.match(byCondition('latin')[0].ownerInput, /the row needs the input source com\.apple\.keylayout\.ABC, the owner's is com\.apple\.inputmethod\.Korean\.2SetKorean$/);
  assert.match(byCondition('midSwitch')[0].ownerInput, /the row needs the input source switched to com\.apple\.inputmethod\.Korean\.2SetKorean during its typing$/);
  assert.match(byCondition('perContext')[0].ownerInput, /the per-context input preference \(com\.apple\.HIToolbox AppleGlobalTextInputProperties TextInputGlobalPropertyPerContextInput\) on, the owner's is off, and /);
});

// The owner may switch during a run: off a hosted runner each field's rows are held against a reading taken at that
// field, never the run's first. Here the owner is on Korean at the start and on ABC from the first field on: the Latin
// rows run, the Korean ones are NO VERDICT ownerInput naming ABC, and the change is kept.
test('off a hosted runner the owner\'s values are read again at each field: a change is followed and kept, and its rows are NO VERDICT ownerInput', async () => {
  let reads = 0, current = KOREAN;
  const ops = {matrix: (base, a) => {
    if (a[0] === 'source' && a[1] === 'state') {
      reads += 1;
      if (reads > 1) current = LATIN;
      return {...base(a), answer: {writable: false, refused: 'off a GitHub-hosted runner … (ruling 1188)', ...current, perContext: false}};
    }
    return a[0] === 'source' && a[1] === 'current' ? {...base(a), answer: current} : base(a);
  }};
  const {code, steps, result} = await runWith({plan: planOf('korean', {scene: 'textedit'}), cellName: 'korean', cell: midSwitch, ops});
  assert.equal(code, 0, JSON.stringify(result.problems));
  assert.deepEqual(validateCellResult(result), []);
  const byCondition = c => result.rows.filter(r => r.condition === c);
  const fields = new Set(result.rows.map(r => `${r.condition}:${r.scene}`)).size;
  assert.equal(sources(steps).filter(s => s === 'state').length, 1 + fields, 'the start, then once at each condition\'s field');
  assert.ok(byCondition('latin').length > 0 && byCondition('latin').every(r => r.ok === true && !r.ownerInput), JSON.stringify(byCondition('latin')[0]));
  assert.ok(byCondition('korean').length > 0 && byCondition('korean').every(r => sampleCause(r).category === 'ownerInput'));
  assert.match(byCondition('korean')[0].ownerInput, /the row needs the input source com\.apple\.inputmethod\.Korean\.2SetKorean, the owner's is com\.apple\.keylayout\.ABC$/);
  assert.deepEqual(result.meta.inputSource.drift, [{at: `unicode latin:${byCondition('latin')[0].scene}`, from: {source: KOREAN_2SET, perContext: false}, to: {source: LATIN.current, perContext: false}}]);
  assert.deepEqual(sources(steps).filter(s => !['current', 'state'].includes(s)), [], 'never saved, selected, written or restored');
  // A change inside the field, after its boundary's reading: the source read with the field in front decides, and the
  // rows are NO VERDICT ownerInput, not a generic invalid one.
  const inside = {matrix: (base, a) => (a[0] === 'source' && a[1] === 'state' ? {...base(a), answer: {writable: false, refused: 'off a GitHub-hosted runner … (ruling 1188)', ...LATIN, perContext: false}}
    : a[0] === 'source' && a[1] === 'current' ? {...base(a), answer: KOREAN} : base(a))};
  const late = await runWith({plan: planOf('korean', {scene: 'textedit'}), cellName: 'korean', cell: midSwitch, ops: inside});
  const latin = late.result.rows.filter(r => r.condition === 'latin');
  assert.ok(latin.length > 0 && latin.every(r => sampleCause(r).category === 'ownerInput'), JSON.stringify(latin[0]));
  assert.match(latin[0].ownerInput, /ruling 1188.*; the row needs the input source com\.apple\.keylayout\.ABC, and the source read com\.apple\.inputmethod\.Korean\.2SetKorean with textedit in front$/);
});

// Ruling 1189: a source the runner's setup could not enable is never selected; every row selecting it is NO VERDICT
// `venue`, naming it, and never runs under the US layout to be judged.
test('a source the venue could not enable: its rows are NO VERDICT venue naming it, never selected; the rest run', async () => {
  const ops = {matrix: (base, a) => {
    if (a[0] === 'source' && a[1] === 'state') { const out = base(a); return {...out, answer: {...out.answer, venueMissing: [KOREAN_2SET]}}; }
    return base(a);
  }};
  const {code, steps, result} = await runWith({plan: planOf('korean', {scene: 'textedit'}), cellName: 'korean', cell: midSwitch, ops});
  assert.equal(code, 0, JSON.stringify(result.problems));
  assert.deepEqual(validateCellResult(result), []);
  assert.ok(!sources(steps).some(s => s.includes('2SetKorean')), 'Korean 2-Set never selected');
  assert.deepEqual(matrixSteps(steps, 'probe').filter(a => a[1] === 'input-source'), [], 'no switch to it scheduled');
  assert.deepEqual(result.meta.inputSource.venueMissing, [KOREAN_2SET]);
  const byCondition = c => result.rows.filter(r => r.condition === c);
  assert.ok(byCondition('latin').length > 0 && byCondition('latin').every(r => r.ok === true && !r.invalid), 'the Latin rows need ABC only');
  for (const c of ['korean', 'midSwitch', 'composing', 'perContext']) {
    assert.ok(byCondition(c).length > 0, c);
    for (const r of byCondition(c)) {
      assert.deepEqual(sampleCause(r), {category: 'venue', detail: r.venueInput}, c);
      assert.match(r.venueInput, /^the runner's setup could not enable com\.apple\.inputmethod\.Korean\.2SetKorean \(TISEnableInputSource did not read it back as enabled and selectable in TIS's list; ruling 1189\): the row needs it, and is never run under the US layout$/);
    }
  }
});
