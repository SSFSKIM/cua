// The probe cells in a matrix run (scripts/native-matrix/probe-run.mjs; the spec's Verification system part 5) against
// the run's doubles: the input source saved, set and restored around them; the probe scheduled on the run's own window
// and awaited after the act it falls inside; a sample valid only when the post falls inside the action's interval (or,
// for the pre-action refusal, before a receipt within the debounce), retried from its own times, else invalid; the
// debounce waited out before the run drives a scene the probe typed into; and each cell's judgment.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {sha256Hex} from '../../scripts/native-matrix/matrix-text.mjs';
import {PRE_ACTION_DELAY_MS, PRE_MS, PROBE_ATTEMPTS, SAVE_NAME, SAVE_PANEL_CONTROLS, SAVE_SHEET_PROBE_BEFORE_MS, SHEET_EXPECTED, SHEET_FOLLOW_MS, SHEET_PROBE_BEFORE_MS, STILL_INTERACTING,
  USER_CHANGED} from '../../scripts/native-matrix/probe-plan.mjs';
import {planOf} from '../../scripts/native-matrix/run.mjs';
import {sceneKeyWindow} from '../../scripts/native-matrix/matrix-device.mjs';
import {sampleCause} from '../../scripts/native-matrix/front-key.mjs';
import {matrixSteps, names, runWith as runDoubles, stopWith} from './run-doubles.mjs';

// An engine refusal as a cell sees it: the REPL hands the cell a plain Error (src/repl-host/trusted-worker.mjs), so its
// name is 'Error' and only its message, the vendor's envelope around the engine's sentence, says what it was.
const REFUSED = 'Computer Use server error -10016: ';
const tagOf = code => /cua-matrix-cell: ([\w.]+)/.exec(code)?.[1] ?? null;
const atOf = code => Number(/const __at = (\d+)/.exec(code)?.[1]);
const followOf = code => Number(/__followAt = (\d+)/.exec(code)?.[1]);
// An act's answer: the cell's own times around the call and the engine's interval `[from, to]` relative to `at`.
const acted = (code, {interval = [50, 2_500], threw = null, errorName = null, meta = {}} = {}) => {
  const at = atOf(code);
  return {actMs: 2_000, callAt: at, endAt: at + 3_000, late: 0, threw: threw !== null, errorName, message: threw,
    _meta: {'cua/inputRoute': "2'", 'cua/actionInterval': interval ? {startedAt: at + interval[0], endedAt: at + interval[1]} : {startedAt: null, endedAt: null}, ...meta}};
};
const rowOf = (result, id) => result.rows.find(r => r.id === id);
// #212's runs with TextEdit's untitled document as ⌘N makes it: the window list's newcomer from its opening cell until
// its cleanup closes it, so the run knows its own window and the unsaved proof reads it (probe-run.mjs unsavedProof).
const UNTITLED = 500;
const runWith = opts => {
  if (opts.cellName !== 'intervention-save-sheet') return runDoubles(opts);
  let untitled = false;
  const cell = code => {
    const tag = tagOf(code);
    if (tag === 'sheet.new') untitled = true;
    if (tag === 'sheet.cleanup') untitled = false;
    return opts.cell ? opts.cell(code) : null;
  };
  const given = opts.ops?.matrix;
  const matrix = (base, a) => {
    const out = given ? given(base, a) : base(a);
    return untitled && a[0] === 'read' && out?.alertBounds
      ? {...out, alertBounds: {...out.alertBounds, windows: [...out.alertBounds.windows, {scene: 'textedit', number: UNTITLED, recorded: false, bounds: {x: 240, y: 100, width: 500, height: 400}}]}} : out;
  };
  return runDoubles({...opts, cell, ops: {...opts.ops, matrix}});
};
const probeSteps = steps => matrixSteps(steps, 'probe').map(a => a.slice(0, 2).join(' '));
const sourceSteps = steps => matrixSteps(steps, 'source').map(a => [a[1], ...(a.includes('--source') ? [a[a.indexOf('--source') + 1]] : []), ...(a.includes('--value') ? [a[a.indexOf('--value') + 1]] : [])].join(' '));

test('concurrent use: the owner\'s source saved and Latin set, the keystroke scheduled on TextEdit\'s document, the typing sent at its time behind it, both landings read back', async () => {
  const calls = [];
  const {code, steps, result} = await runWith({plan: planOf('concurrent-use', {scene: 'chrome'}), cellName: 'concurrent-use', calls,
    cell: c => (tagOf(c) === 'concurrent.act' ? acted(c) : null)});
  assert.equal(code, 0, JSON.stringify(result.problems));
  assert.deepEqual(validateCellResult(result), []);
  const row = rowOf(result, 'chrome/concurrent@textedit');
  assert.deepEqual([row.section, row.engine, row.sample, row.ok, row.invalid, row.attempts], ['concurrent', 'cua', 1, true, undefined, 1]);
  assert.deepEqual({drivenLanded: row.outcome.drivenLanded, userLanded: row.outcome.userLanded, intervalSource: row.outcome.intervalSource, postOffsetMs: row.outcome.postOffsetMs},
    {drivenLanded: true, userLanded: true, intervalSource: 'engine', postOffsetMs: PRE_MS.chrome - 50});
  assert.equal(row.interference.ok, true, 'the oracle judged the row');
  // The source: saved before the first switch, the preference off, Latin selected, and restored after.
  assert.deepEqual(sourceSteps(steps), ['state', 'save', 'per-context off', 'select com.apple.keylayout.ABC', 'restore']);
  // The probe: on the user window (the run's TextEdit), started before the act and finished after it.
  const probe = matrixSteps(steps, 'probe')[0];
  assert.deepEqual(probe.slice(0, 2), ['probe', 'keystroke']);
  assert.match(probe[probe.indexOf('--window') + 1], /^\d+,100,100,800,600$/);
  assert.equal(probe[probe.indexOf('--text') + 1], 'qz');
  assert.deepEqual(probeSteps(steps), ['probe keystroke', 'probe finish']);
  const act = calls.find(c => tagOf(c.code) === 'concurrent.act');
  assert.match(act.code, /__app\.typeText\("The quick brown fox/);
  assert.equal(result.meta.inputSource.latin, true);
});

test('concurrent use: a post outside the interval is retried, aimed at the middle of the interval it measured; all attempts invalid is no verdict', async () => {
  const acts = [];
  // Finder's typing posts from 400 to 640 ms after the call: the first post, 120 ms after it, is too early.
  const {result} = await runWith({plan: planOf('concurrent-use', {scene: 'finder'}), cellName: 'concurrent-use',
    cell: c => { if (tagOf(c) !== 'concurrent.act') return null; acts.push(c); return acted(c, {interval: [400, 640]}); }});
  const row = rowOf(result, 'finder/concurrent@textedit');
  assert.match(acts[0], /__app\.typeText\("scene-file-150-/, 'Finder type-selects its typing target');
  assert.deepEqual([acts.length, row.attempts, row.ok, row.invalid], [2, 2, true, undefined]);
  assert.match(row.outcome.retries[0], /posted 280 ms before the action's interval/);
  assert.equal(row.outcome.postOffsetMs, 120, 'the second post at the interval\'s middle');
  // Nothing reported (no interval) on every attempt: invalid, the cell no verdict.
  const none = await runWith({plan: planOf('concurrent-use', {scene: 'finder'}), cellName: 'concurrent-use',
    cell: c => (tagOf(c) === 'concurrent.act' ? acted(c, {interval: null}) : null)});
  const invalid = rowOf(none.result, 'finder/concurrent@textedit');
  assert.deepEqual([invalid.attempts, invalid.outcome.retries.length], [PROBE_ATTEMPTS, PROBE_ATTEMPTS - 1]);
  assert.match(invalid.invalid, /no interval/);
  assert.equal(none.result.verdict, 'no-verdict');
});

test('the probe cells wait out the debounce the probe started before the run drives that scene again, and observe it once', async () => {
  const calls = [];
  const {slept} = await runWith({plan: {...planOf('intervention-fires'), intervention: ['fires', 'preAction'], id: 'x'}, cellName: 'intervention-fires', calls,
    cell: c => (tagOf(c) === 'intervention.act' ? acted(c, {threw: `${REFUSED}${USER_CHANGED}x'. Re-query`, errorName: 'Error'})
      : tagOf(c) === 'intervention.next' ? {...acted(c), threw: true, errorName: 'Error', message: `${REFUSED}${USER_CHANGED}x'.`}
        : tagOf(c) === 'preaction.act' ? acted(c, {threw: `${REFUSED}${STILL_INTERACTING}x'. Wait`, errorName: 'Error', interval: null}) : null)});
  assert.ok(slept.some(ms => ms > 5_000), `waited: ${slept.join(', ')}`);
  // After fires: the next action is sent before any observation of TextEdit (which would clear the flag).
  const tags = calls.map(c => tagOf(c.code) ?? (c.code.includes('return {observed: true}') ? 'requery' : null)).filter(Boolean);
  assert.deepEqual(tags.slice(tags.indexOf('intervention.act'), tags.indexOf('intervention.landed') + 1),
    ['intervention.act', 'intervention.next', 'requery', 'intervention.again', 'intervention.landed']);
  // The pre-action cell starts with a re-query: the probe typed into TextEdit in the cell before.
  assert.equal(tags[tags.indexOf('intervention.landed') + 1], 'field.empty');
});

test('intervention fires: userIntervened with the user-changed sentence, the next action refused with nothing posted until a get_app_state, then the same one lands', async () => {
  const {result} = await runWith({plan: planOf('intervention-fires'), cellName: 'intervention-fires',
    cell: c => (tagOf(c) === 'intervention.act' ? acted(c, {threw: `${REFUSED}${USER_CHANGED}/x'. Re-query`, errorName: 'Error', meta: {'cua/entered': 12}})
      : tagOf(c) === 'intervention.next' ? {...acted(c), threw: true, errorName: 'Error', message: `${REFUSED}${USER_CHANGED}/x'.`} : null)});
  const row = rowOf(result, 'textedit/intervention.fires');
  assert.equal(row.ok, true, JSON.stringify(row));
  assert.deepEqual({fired: row.outcome.fired, entered: row.outcome.entered, refusedNext: row.outcome.refusedNext, nothingPosted: row.outcome.nothingPosted, againLanded: row.outcome.againLanded},
    {fired: true, entered: 12, refusedNext: true, nothingPosted: true, againLanded: true});
  assert.equal(row.outcome.message, `${REFUSED}${USER_CHANGED}/x'. Re-query`, 'the engine\'s sentence is kept on the row');
  assert.equal(row.outcome.nextMessage, `${REFUSED}${USER_CHANGED}/x'.`);
  // The typing went with TextEdit in front (the key guard's own case), never through a user window.
  assert.equal(result.verdict, 'pass');
  // Not fired: a failure, not invalid.
  const quiet = await runWith({plan: planOf('intervention-fires'), cellName: 'intervention-fires', cell: c => (tagOf(c) === 'intervention.act' ? acted(c) : null)});
  assert.deepEqual([rowOf(quiet.result, 'textedit/intervention.fires').ok, rowOf(quiet.result, 'textedit/intervention.fires').invalid], [false, undefined]);
  assert.equal(quiet.result.verdict, 'fail');
  // Detection off on the engine: the cell cannot be judged.
  const off = await runWith({plan: planOf('intervention-fires'), cellName: 'intervention-fires', cell: c => (tagOf(c) === 'intervention.act' ? acted(c, {meta: {'cua/intervention': 'off'}}) : null)});
  assert.match(rowOf(off.result, 'textedit/intervention.fires').invalid, /detection is off/);
});

test('the pre-action refusal: valid only when the engine received the request after the post and within the debounce; refused as still interacting, nothing posted', async () => {
  const refused = (c, offset) => acted(c, {threw: `${REFUSED}${STILL_INTERACTING}/x'. Wait 5 seconds and retry.`, errorName: 'Error', interval: null,
    meta: {'cua/receivedAt': atOf(c) - PRE_ACTION_DELAY_MS + offset}});
  const {result} = await runWith({plan: planOf('pre-action-refusal'), cellName: 'pre-action-refusal', cell: c => (tagOf(c) === 'preaction.act' ? refused(c, 160) : null)});
  const row = rowOf(result, 'textedit/intervention.preAction');
  assert.deepEqual([row.ok, row.outcome.refused, row.outcome.nothingPosted, row.outcome.receiptAfterPostMs], [true, true, true, 160]);
  assert.match(row.outcome.message, /^Computer Use server error -10016: The user is still interacting/);
  // The sentence under another code is not the engine's userIntervened refusal.
  const other = await runWith({plan: planOf('pre-action-refusal'), cellName: 'pre-action-refusal',
    cell: c => (tagOf(c) === 'preaction.act' ? {...refused(c, 160), message: `Computer Use server error -10005: ${STILL_INTERACTING}/x'.`} : null)});
  assert.equal(rowOf(other.result, 'textedit/intervention.preAction').outcome.refused, false);
  const late = await runWith({plan: planOf('pre-action-refusal'), cellName: 'pre-action-refusal', cell: c => (tagOf(c) === 'preaction.act' ? refused(c, 5_200) : null)});
  assert.match(rowOf(late.result, 'textedit/intervention.preAction').invalid, /past the 5000 ms debounce/);
  assert.equal(late.result.verdict, 'no-verdict');
});

test('a focus probe that did not name the document leaves the precondition invalid, with why it did not recorded on the row', async () => {
  // Hold 2a: the probe read no focused application at all, so the document was never named.
  const unnamed = {accessibility: true, appRead: false, appNamed: false, windowRead: false, windowNamed: false, deltas: null};
  const unread = (base, args) => { const r = base(args); return args[0] === 'read' && args.includes('--focus') ? {...r, focus: {appOwned: false, appPid: null, named: false, valueHash: null, unnamed}} : r; };
  const {result} = await runWith({plan: planOf('pre-action-refusal'), cellName: 'pre-action-refusal', ops: {matrix: unread}});
  const row = rowOf(result, 'textedit/intervention.preAction');
  assert.equal(row.invalid, 'the focus probe did not read the document focused and empty');
  assert.deepEqual(row.focus.unnamed, unnamed);
});

// The sheet variant's two acts, each its own call with its own meta: super+w at `at` (its interval `[from, to]` and its
// receipt relative to `at`), then the follow-up click on the sheet at `followAt` (received `receipt` ms after it).
const opening = (c, {interval = [50, 150], receipt = 40, route = "2'", over = {}} = {}) => ({...acted(c, {interval}), actMs: 120, endAt: atOf(c) + 200,
  _meta: {...acted(c, {interval})._meta, 'cua/receivedAt': atOf(c) + receipt, 'cua/inputRoute': route}, ...over});
const followUp = (c, {receipt = 10, route = "2'", over = {}} = {}) => ({opened: true, clicked: true, clickAt: followOf(c), endAt: followOf(c) + 50, threw: false, errorName: null, message: null,
  _meta: {'cua/receivedAt': followOf(c) + receipt, 'cua/inputRoute': route}, ...over});
const sheetCells = ({open = opening, follow = followUp} = {}) => c => (tagOf(c) === 'sheet.open' ? open(c) : tagOf(c) === 'sheet.follow' ? follow(c) : null);
const SHEET = 'textedit/concurrent.sheet@electron';
const refusing = sentence => ({threw: true, errorName: 'Error', message: `${REFUSED}${sentence}/x'.`});
// Ruling 1238 (b): a hosted sheet run whose witness tap on the Electron fixture's pid saw the probe's key at
// `keyAt(receipt, act)` (none when null), `receipt` the opening's (cua's own clock; the vendor's cell call time) and `act`
// the opening's {at, end}, and the control. -> the run, its row, the tap's start, the fixture's pid.
async function sheetWitnessed({engine = 'cua', cell = sheetCells(), keyAt = receipt => receipt - 300, ops: given = {}, calls = []} = {}) {
  let electron = null, probe = null, control = null, receipt = null, act = null;
  const ops = {
    ...given,
    scenes: (base, a) => { const out = base(a); if (a[0] === 'up' && a[1] === 'electron') electron = out.pid; return out; },
    matrix: (base, a) => { const out = given.matrix ? given.matrix(base, a) : base(a); if (a[0] === 'probe' && a[1] === 'keystroke') probe = out.answer.pid; return out; },
    keyRoute: (base, a) => {
      const out = base(a);
      if (a[0] === 'control') control = out.answer;
      if (a[0] === 'tap' && a[1] === 'stop') out.answer.events = [...(keyAt && receipt !== null ? [{tapPid: electron, kind: 'keyDown', target: electron, source: probe, at: keyAt(receipt, act)}] : []),
        {tapPid: electron, kind: 'flagsChanged', target: electron, source: control.pid, at: control.at}];
      return out;
    },
  };
  const run = await runWith({engine, plan: planOf('concurrent-use-sheet'), cellName: 'concurrent-use-sheet', env: SHEET_HOSTED, ops, calls,
    cell: c => {
      const out = cell(c);
      if (tagOf(c) === 'sheet.open' && out) {
        act = {at: atOf(c), end: out.endAt};
        receipt = engine === 'cua' ? out._meta?.['cua/receivedAt'] ?? null : out.callAt;
      }
      return out;
    }});
  return {...run, row: rowOf(run.result, SHEET), electron};
}
const SHEET_HOSTED = {RUNNER_ENVIRONMENT: 'github-hosted'};

test('the sheet variant\'s declaration (ruling 1238): both engines expected to act, the person typing in another app; the probe armed a fixed lead before the opening, the follow-up its fixed gap after', () => {
  assert.deepEqual(SHEET_EXPECTED, {cua: 'act', vendor: 'act'});
  assert.ok(Object.isFrozen(SHEET_EXPECTED));
  // Past the probe's worst measured lateness in C (248 ms), and short enough that the follow-up's receipt stays inside
  // the 5 s debounce from the post (C's slowest follow-up came about 4.1 s after its opening).
  assert.ok(SHEET_PROBE_BEFORE_MS > 248 && SHEET_PROBE_BEFORE_MS + 4_100 < 5_000, String(SHEET_PROBE_BEFORE_MS));
  assert.equal(SHEET_FOLLOW_MS, 400, 'the opening-to-follow-up gap the cell always had (100 + 300 ms)');
});

test('the sheet variant (ruling 1238): super+w on TextEdit\'s dirty untitled document a fixed lead after the probe\'s time, the follow-up its gap after; the tap on the Electron fixture\'s pid proves the key before the receipt, cua acts, the oracle judges the row', async () => {
  const calls = [];
  const {row, result, steps, electron} = await sheetWitnessed({calls});
  assert.deepEqual(validateCellResult(result), []);
  assert.deepEqual([row.ok, row.invalid, row.attempts, row.outcome.sheetOpened, row.outcome.followUpRefused, row.outcome.userLanded], [true, undefined, 1, true, false, true], JSON.stringify(row.outcome));
  assert.equal(row.interference.ok, true, 'the oracle judged the row');
  assert.deepEqual(row.inputRoutes, {opening: "2'", followUp: "2'"});
  const o = row.outcome;
  assert.deepEqual([o.expected, o.answer, o.probeBeforeMs], ['act', 'act', SHEET_PROBE_BEFORE_MS]);
  assert.equal(o.callAt, o.postedAt + SHEET_PROBE_BEFORE_MS, 'the opening called the lead after the probe\'s time');
  assert.equal(o.receivedAt, o.callAt + 40, 'the opening\'s receipt kept');
  assert.deepEqual([o.intervalSource, o.intervalMs, o.actEnd], ['engine', 100, o.callAt + 150]);
  assert.deepEqual(o.witness, {gaps: [], keyAt: o.receivedAt - 300, beforeReceipt: true, window: [o.callAt - SHEET_PROBE_BEFORE_MS, o.callAt + 150]});
  assert.equal(result.verdict, 'pass');
  // The tap watched the pid the scene's record names for the Electron fixture: the user window the probe typed into.
  assert.equal(result.meta.witness.targets.find(t => t.scene === 'electron')?.pid, electron, JSON.stringify(result.meta.witness));
  const open = calls.find(c => tagOf(c.code) === 'sheet.open'), follow = calls.find(c => tagOf(c.code) === 'sheet.follow');
  assert.match(open.code, /__app\.pressKey\("super\+w"\)/);
  assert.doesNotMatch(open.code, /click/, 'the opening call holds only the opening action, so its meta is its own');
  assert.equal(followOf(follow.code), atOf(open.code) + SHEET_FOLLOW_MS);
  assert.ok(follow.at[0] >= open.at[1], 'the follow-up is its own call, after');
  assert.ok(matrixSteps(steps, 'probe')[0].includes('keystroke'));
});

test('the sheet variant (ruling 1238): cua refusing, the follow-up or the opening, fails only on the tap\'s proof of the key before the receipt; without it the row is invalid', async () => {
  const followRefused = sheetCells({follow: c => followUp(c, {over: refusing(STILL_INTERACTING)})});
  const refusedCheck = cell => c => (tagOf(c) === 'sheet.check' ? {closed: false, sceneInFront: false} : cell(c));
  const calls = [];
  const proved = await sheetWitnessed({cell: refusedCheck(followRefused), calls});
  assert.deepEqual([proved.row.ok, proved.row.invalid, proved.row.outcome.followUpRefused, proved.row.outcome.answer], [false, undefined, true, 'refuse'], JSON.stringify(proved.row.outcome));
  assert.ok(proved.row.outcome.findings.includes('cua refused though the probe\'s key reached the Electron fixture, another app, 300 ms before the engine received the opening (expected: act)'), proved.row.outcome.findings?.join('; '));
  assert.equal(proved.result.verdict, 'fail');
  assert.ok(calls.some(c => tagOf(c.code) === 'sheet.cleanup'), 'the untitled document\'s cleanup closed the sheet');
  // The opening refused: no sheet, nothing to follow up, the dirty untitled document closed by its own cleanup.
  const openRefused = c => (tagOf(c) === 'sheet.check' ? {closed: true, sceneInFront: false}
    : sheetCells({open: c2 => opening(c2, {over: refusing(USER_CHANGED)}), follow: c2 => ({...followUp(c2, {over: {opened: false, clicked: false}}), _meta: {}})})(c));
  const opened = await sheetWitnessed({cell: openRefused});
  assert.deepEqual([opened.row.ok, opened.row.invalid, opened.row.outcome.openingThrew, opened.row.outcome.sheetOpened, opened.row.outcome.answer], [false, undefined, true, false, 'refuse']);
  assert.equal(opened.result.complete, true, JSON.stringify(opened.result.problems));
  // The key after the receipt, or none seen: the refusal is not proved the forbidden one.
  const late = await sheetWitnessed({cell: refusedCheck(followRefused), keyAt: receipt => receipt + 10});
  assert.deepEqual([late.row.ok, late.result.verdict], [false, 'no-verdict']);
  assert.match(late.row.invalid, /^the witness does not show the probe's key reaching the Electron fixture before the engine received the opening \(its first key 10 ms after the receipt\)$/);
  const unseen = await sheetWitnessed({cell: refusedCheck(followRefused), keyAt: null});
  assert.match(unseen.row.invalid, /\(the probe's key was not seen on the Electron fixture's pid\)$/);
});

test('the sheet variant (ruling 1238): cua acting is judged only with the tap\'s proof; a key outside [act − lead, act end], or no witness off a hosted runner, leaves it invalid', async () => {
  const late = await sheetWitnessed({keyAt: receipt => receipt + 5});
  assert.match(late.row.invalid, /^the witness does not show the probe's key reaching the Electron fixture before the engine received the opening/);
  assert.equal(late.row.interference, undefined, 'nothing judged it');
  const early = await sheetWitnessed({keyAt: (receipt, act) => act.at - SHEET_PROBE_BEFORE_MS - 1});
  assert.match(early.row.invalid, /\(its first key 1 ms before the act's window \[act − lead, act end\]\)$/);
  const off = await runWith({plan: planOf('concurrent-use-sheet'), cellName: 'concurrent-use-sheet', cell: sheetCells()});
  assert.match(rowOf(off.result, SHEET).invalid, /witness tap.*off a GitHub-hosted runner/);
  assert.equal(off.result.verdict, 'no-verdict');
});

// The review of 37f32fdf9: cua's guard refuses before anything is posted (Input.swift pressKey, checkBeforePosting), so
// a refused opening reports its receipt and no action interval. Recognised as a refusal before the action, its window is
// bounded by the cell's own recorded end, as the vendor's is, its receipt still cua's own: the tap then decides it.
test('the sheet variant: cua refusing super+w before posting (a receipt, no action interval) fails on the tap\'s proof and is invalid without it', async () => {
  const prePost = c => (tagOf(c) === 'sheet.check' ? {closed: true, sceneInFront: false}
    : sheetCells({open: c2 => opening(c2, {interval: null, over: refusing(STILL_INTERACTING)}), follow: c2 => ({...followUp(c2, {over: {opened: false, clicked: false}}), _meta: {}})})(c));
  const proved = await sheetWitnessed({cell: prePost});
  const o = proved.row.outcome;
  assert.deepEqual([proved.row.ok, proved.row.invalid, proved.row.attempts, o.openingRefused, o.answer], [false, undefined, 1, true, 'refuse'], JSON.stringify(o));
  assert.deepEqual([o.intervalMs, o.receivedAt, o.actEnd], [null, o.callAt + 40, o.callAt + 200], 'the cell\'s own end bounds the window');
  assert.deepEqual(o.witness.window, [o.callAt - SHEET_PROBE_BEFORE_MS, o.callAt + 200]);
  assert.ok(o.findings.includes('cua refused though the probe\'s key reached the Electron fixture, another app, 300 ms before the engine received the opening (expected: act)'), o.findings?.join('; '));
  assert.equal(proved.result.verdict, 'fail');
  const unseen = await sheetWitnessed({cell: prePost, keyAt: null});
  assert.match(unseen.row.invalid, /^the witness does not show the probe's key reaching the Electron fixture before the engine received the opening \(the probe's key was not seen on the Electron fixture's pid\)$/);
  assert.equal(unseen.result.verdict, 'no-verdict');
  // Without its receipt, the refusal is still no sample; an opening that is no refusal still needs its interval.
  const unreceived = await sheetWitnessed({cell: c => (tagOf(c) === 'sheet.open' ? (({_meta: {'cua/receivedAt': _r, ...meta}, ...rest}) => ({...rest, _meta: meta}))(opening(c, {interval: null, over: refusing(STILL_INTERACTING)})) : prePost(c))});
  assert.match(unreceived.row.invalid, /the opening carried no cua\/receivedAt/);
  const silent = await sheetWitnessed({cell: sheetCells({open: c => opening(c, {interval: null})})});
  assert.match(silent.row.invalid, /reported no interval/);
});

test('the sheet variant (ruling 1238): the vendor is judged by its own declared answer, against its opening\'s call time', async () => {
  const vendorOpening = c => ({...opening(c), _meta: {'cua/inputRoute': "2'"}});
  const vendorFollow = c => ({...followUp(c), _meta: {}});
  const acts = await sheetWitnessed({engine: 'vendor', cell: sheetCells({open: vendorOpening, follow: vendorFollow})});
  assert.deepEqual([acts.row.engine, acts.row.ok, acts.row.invalid, acts.row.outcome.answer, acts.row.outcome.receivedAt], ['vendor', true, undefined, 'act', null], JSON.stringify(acts.row.outcome));
  assert.equal(acts.row.outcome.witness.keyAt, acts.row.outcome.callAt - 300);
  const refuses = await sheetWitnessed({engine: 'vendor', cell: c => (tagOf(c) === 'sheet.check' ? {closed: false, sceneInFront: false}
    : sheetCells({open: vendorOpening, follow: c2 => ({...followUp(c2, {over: refusing(STILL_INTERACTING)}), _meta: {}})})(c))});
  assert.deepEqual([refuses.row.ok, refuses.row.invalid, refuses.row.outcome.answer], [false, undefined, 'refuse']);
  assert.ok(refuses.row.outcome.findings.some(f => /^the vendor refused though the probe's key reached the Electron fixture, another app, \d+ ms before its opening was called \(expected: act\)$/.test(f)), refuses.row.outcome.findings?.join('; '));
});

test('the sheet variant (ruling 1238): a probe that printed its post after the opening\'s receipt is retried at the same lead; a follow-up received past the debounce is invalid', async () => {
  const calls = [];
  let n = 0;
  // The first opening's receipt before the probe's time: its printed post came after it.
  const run = await sheetWitnessed({calls, cell: sheetCells({open: c => opening(c, {receipt: ++n === 1 ? -SHEET_PROBE_BEFORE_MS - 5 : 40})})});
  assert.deepEqual([run.row.attempts, run.row.ok, run.row.invalid], [2, true, undefined], JSON.stringify(run.row.outcome));
  assert.match(run.row.outcome.retries[0], /^the probe posted 5 ms after the engine received the opening$/);
  const opens = calls.filter(c => tagOf(c.code) === 'sheet.open').map(c => atOf(c.code));
  assert.equal(opens.length, 2);
  assert.equal(run.row.outcome.callAt - run.row.outcome.postedAt, SHEET_PROBE_BEFORE_MS, 'the retry kept the lead, never re-aimed');
  const late = await sheetWitnessed({cell: sheetCells({follow: c => followUp(c, {receipt: 6_000})})});
  assert.match(late.row.invalid, /past the 5000 ms debounce/);
});

// TextEdit's untitled document placed above the user window once `from` (a cell tag) is sent, until TextEdit is
// activated: the reading's top window is then TextEdit's, so neither the user window's guard nor TextEdit's own sends.
const untitledOnTop = from => {
  let onTop = false;
  return {
    lane: code => { if (tagOf(code) === from) onTop = true; },
    ops: {matrix: (base, a) => {
      if (a[0] === 'step' && a[1] === 'activate' && a[2] === 'textedit') onTop = false;
      const r = base(a);
      if (a[0] !== 'read' || !onTop) return r;
      return {...r, reading: {...r.reading, topWindow: {ownerPid: 4_242, number: 9, bounds: {x: 10, y: 10, width: 500, height: 400}, owned: true}}};
    }},
  };
};

test('the sheet variant\'s cleanup: when the untitled document will not close behind the user window, TextEdit is brought to the front and it is closed there', async () => {
  // cua run 3 stopped here: the untitled document came up above the Electron window, so the cleanup's keys (sent only
  // with the user window in front) were never sent, and the run stopped with the scene document not in front.
  const calls = [];
  const {lane, ops} = untitledOnTop('sheet.new');
  const {result, steps} = await runWith({plan: planOf('concurrent-use-sheet'), cellName: 'concurrent-use-sheet', calls, lane, ops, cell: sheetCells()});
  assert.equal(result.complete, true, JSON.stringify(result.problems));
  assert.match(rowOf(result, SHEET).invalid, /text was not typed \(the key guard did not send it\)/);
  const tags = calls.map(c => tagOf(c.code)).filter(Boolean);
  assert.equal(tags.filter(t => t === 'sheet.cleanup').length, 1, 'the cleanup sent once, from TextEdit in front');
  const activations = matrixSteps(steps, 'step').filter(a => a[1] === 'activate').map(a => a[2]);
  assert.equal(activations.at(-1), 'textedit');
});

test('the sheet variant\'s cleanup after the probe ran waits the debounce out first; a scene document still not in front stops the run with what the cleanup saw', async () => {
  const calls = [], slept = [];
  const {lane, ops} = untitledOnTop('sheet.type');
  const {result} = await runWith({plan: planOf('concurrent-use-sheet'), cellName: 'concurrent-use-sheet', calls, slept, lane, ops,
    cell: c => (tagOf(c) === 'sheet.cleanup' ? {closed: true, sceneInFront: false, front: 'none'} : sheetCells()(c))});
  assert.equal(result.complete, false);
  assert.match(result.problems.join(' '), /untitled document could not be closed: TextEdit's scene document is not in front \(.*front: none/);
  // The probe was scheduled on the user window before the opening found it covered: TextEdit observed once the
  // debounce is out, before the cleanup's keys.
  assert.ok(slept.some(ms => ms > 5_000), `waited: ${slept.join(', ')}`);
  const tags = calls.map(c => tagOf(c.code) ?? (c.code.includes('return {observed: true}') ? 'requery' : null)).filter(Boolean);
  assert.equal(tags[tags.indexOf('sheet.cleanup') - 1], 'requery');
});

test('the sheet variant\'s oracle: a transient focus steal during the opening action, or an unaccepted route 4 on either action, fails its interference', async () => {
  const calls = [];
  const stolen = await sheetWitnessed({calls,
    ops: stopWith(() => ({activations: [{kind: 'activated', bundleId: 'com.apple.TextEdit', scene: true, at: calls.find(c => tagOf(c.code) === 'sheet.open').at[0] + 1}]}))});
  assert.deepEqual([stolen.row.ok, stolen.row.interference.ok, stolen.row.interference.activations], [true, false, 1]);
  const route4 = await sheetWitnessed({cell: sheetCells({follow: c => followUp(c, {route: 4})})});
  assert.deepEqual([route4.row.interference.ok, route4.row.interference.route4], [false, true]);
  assert.deepEqual(route4.row.inputRoutes, {opening: "2'", followUp: 4});
});

test('without the Latin source read back, the probe cells are invalid and nothing is posted; the source is restored all the same', async () => {
  const {steps, result} = await runWith({plan: planOf('concurrent-use'), cellName: 'concurrent-use',
    ops: {matrix: (base, a) => (a[0] === 'source' && a[1] === 'select' ? {answer: {selected: false, current: 'com.apple.inputmethod.Korean.2SetKorean'}, at: [1, 2]} : base(a))}});
  assert.ok(result.rows.every(r => /Latin input source/.test(r.invalid)));
  assert.deepEqual(probeSteps(steps), []);
  assert.equal(sourceSteps(steps).at(-1), 'restore');
  assert.ok(!names(steps).includes('matrix probe'));
});

test('a probe left pending is finished whatever the act did, and the run\'s keys stay under the guard', async () => {
  const {steps, result} = await runWith({plan: planOf('concurrent-use', {scene: 'chrome'}), cellName: 'concurrent-use',
    lane: code => { if (tagOf(code) === 'concurrent.act') throw new Error('the lane died'); }});
  assert.equal(result.complete, false);
  assert.deepEqual(probeSteps(steps), ['probe keystroke', 'probe finish']);
  assert.ok(names(steps).includes('live recover'));
  assert.equal(sha256Hex('qz').length, 64);
});

// #212's save sheet (the gate's hosted cell): TextEdit in front, its dirty untitled document's Save sheet opened by
// super+s, the probe's keystroke and, SAVE_SHEET_PROBE_BEFORE_MS later, set_value on the sheet's name field (ruling
// 1228). In the dry device the probe posts at its scheduled time: the act's `at` less the interval.
const SAVE_SHEET = 'textedit/intervention.saveSheet';
const TEXTEDIT = '/System/Applications/TextEdit.app';
const STOPPED = `${REFUSED}${USER_CHANGED}${TEXTEDIT}'. Re-query the latest state with \`get_app_state\` before sending more actions. The action was stopped part-way. What may have taken effect: the value written to the field. Nothing was undone.`;
const REFUSED_FIRST = `${REFUSED}${STILL_INTERACTING}${TEXTEDIT}'. Wait 5 seconds and retry. The requested input was refused before its first step.`;
// The act answered `threw` (null: it returned; by default cua's refusal before it acts, ruling 1228), received `receipt`
// ms after its `at`, its response `response` ms after it; its structured account by the sentence unless given.
const saveAct = (c, {threw = REFUSED_FIRST, receipt = 5, response = 3_000,
  interruption = threw === REFUSED_FIRST ? {phase: 'beforeAction', effects: []} : threw ? {phase: 'inFlight', effects: ['value']} : undefined} = {}) => ({
  ...acted(c, {threw, errorName: threw ? 'Error' : null, interval: null, meta: {'cua/receivedAt': atOf(c) + receipt, ...(interruption ? {'cua/interruption': interruption} : {})}}),
  endAt: atOf(c) + response});
const saveCells = ({act = saveAct, check = {sheetOpen: true, nameWritten: true, destinationFiles: []}, destination = null, cleanup = null, cancel = null} = {}) => c => (
  tagOf(c) === 'savesheet.act' ? act(c) : tagOf(c) === 'savesheet.check' ? check : tagOf(c) === 'savesheet.destination' ? destination
    : tagOf(c) === 'sheet.cleanup' ? cleanup : tagOf(c) === 'savesheet.cancel' ? cancel : null);

test('#212\'s save sheet: super+n, the text typed and super+s under the key guard, the probe then set_value on the sheet\'s name field; a refusal before the action, the sheet still open, passes', async () => {
  const calls = [];
  const {code, result, steps} = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', calls, cell: saveCells()});
  assert.equal(code, 0, JSON.stringify(result.problems));
  assert.deepEqual(validateCellResult(result), []);
  const row = rowOf(result, SAVE_SHEET);
  assert.deepEqual([row.section, row.method, row.ok, row.invalid, row.attempts], ['intervention', 'setValue', true, undefined, 1]);
  assert.deepEqual({refused: row.outcome.refused, stopped: row.outcome.stopped, effectsNamed: row.outcome.effectsNamed, sheetOpen: row.outcome.sheetOpen, interruption: row.outcome.interruption},
    {refused: true, stopped: false, effectsNamed: null, sheetOpen: true, interruption: {phase: 'beforeAction', effects: []}});
  // The times kept: the probe's post the interval before the call, the engine's receipt after it.
  const at = row.outcome.callAt;
  assert.deepEqual([row.outcome.probeBeforeMs, row.outcome.postedAt, row.outcome.receivedAt, row.outcome.endAt, row.outcome.postBeforeReceiptMs, row.outcome.agree],
    [SAVE_SHEET_PROBE_BEFORE_MS, at - SAVE_SHEET_PROBE_BEFORE_MS, at + 5, at + 3_000, SAVE_SHEET_PROBE_BEFORE_MS + 5, true]);
  assert.deepEqual(row.outcome.destinationFiles, []);
  const tags = calls.map(c => tagOf(c.code)).filter(Boolean);
  assert.deepEqual(tags.filter(t => /^(sheet|savesheet)\./.test(t)),
    ['sheet.new', 'sheet.type', 'savesheet.open', 'savesheet.destination', 'savesheet.act', 'savesheet.check', 'savesheet.cancel', 'savesheet.cancel', 'sheet.cleanup'],
    'the sheet cancelled for the unsaved proof, and again by the cleanup, which then finds none');
  const open = calls.find(c => tagOf(c.code) === 'savesheet.open').code, act = calls.find(c => tagOf(c.code) === 'savesheet.act').code;
  assert.match(open, /__app\.pressKey\("super\+s"\)/);
  assert.match(open, /saveAsNameTextField/);
  // The sheet's destination cell, the one probe-plan's fixtures judge (test/native-matrix/probe-plan.test.mjs).
  assert.ok(calls.find(c => tagOf(c.code) === 'savesheet.destination').code.includes(`const __controls = ${JSON.stringify(SAVE_PANEL_CONTROLS)};`), 'the shipped controls, unread');
  assert.match(calls.find(c => tagOf(c.code) === 'savesheet.check').code, /readdirSync\(globalThis\.__saveDir\)/);
  assert.ok(act.includes(`await __app.setValue(globalThis.__saveNameIndex, ${JSON.stringify(SAVE_NAME)});`), act);
  assert.doesNotMatch(act, /pressKey|click\(/, 'the act holds the set_value alone, so its meta is its own');
  assert.match(calls.find(c => tagOf(c.code) === 'savesheet.cancel').code, /__app\.pressKey\("Escape"\)/, 'the sheet is cancelled, never saved');
  assert.deepEqual(probeSteps(steps), ['probe keystroke', 'probe finish']);
  // The probe's debounce waited out and TextEdit observed before the sheet is cancelled.
  const all = calls.map(c => tagOf(c.code) ?? (c.code.includes('return {observed: true}') ? 'requery' : null)).filter(Boolean);
  assert.equal(all[all.indexOf('savesheet.cancel') - 1], 'requery');
});

test('#212\'s save sheet: the sheet gone after the act fails the row, whatever the answer', async () => {
  const closed = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', cell: saveCells({check: {sheetOpen: false, nameWritten: false}})});
  const committed = rowOf(closed.result, SAVE_SHEET);
  assert.deepEqual([committed.ok, committed.invalid, committed.outcome.sheetOpen], [false, undefined, false]);
  assert.equal(closed.result.verdict, 'fail');
});

test('#212\'s save sheet on the vendor\'s lane: its set_value is never stopped, so the row records its answer and the sheet, valid when the post fell inside the call', async () => {
  const {result} = await runWith({engine: 'vendor', plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet',
    cell: saveCells({act: c => ({...saveAct(c, {threw: null}), _meta: {}})})});
  const row = rowOf(result, SAVE_SHEET);
  assert.deepEqual([row.engine, row.ok, row.invalid, row.outcome.stopped, row.outcome.sheetOpen], ['vendor', true, undefined, false, true]);
});

test('#212\'s save sheet is its own registered cell, not a row of the full matrix', () => {
  assert.deepEqual(planOf('intervention-save-sheet').intervention, ['saveSheet']);
  assert.ok(!planOf('matrix').intervention.includes('saveSheet'));
  assert.throws(() => planOf('intervention-save-sheet', {scene: 'finder'}), /nothing to run/);
});

test('#212\'s save sheet: the engine\'s structured phase must agree with its sentence; a disagreement fails the row', async () => {
  const cases = [
    {label: 'the sentence says part-way, the meta a refusal', act: c => saveAct(c, {threw: STOPPED, interruption: {phase: 'beforeAction', effects: ['value']}})},
    {label: 'the sentence says part-way, the meta has no account', act: c => saveAct(c, {threw: STOPPED, interruption: null})},
    {label: 'the meta says in flight, the sentence a refusal', act: c => saveAct(c, {threw: REFUSED_FIRST, interruption: {phase: 'inFlight', effects: []}})},
  ];
  for (const {label, act} of cases) {
    const {result} = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', cell: saveCells({act})});
    const row = rowOf(result, SAVE_SHEET);
    assert.deepEqual([row.ok, row.invalid, row.attempts, row.outcome.agree, row.outcome.stopped], [false, undefined, 1, false, false], label);
    assert.equal(result.verdict, 'fail', label);
  }
});

test('#212\'s save sheet: a sheet gone after a set_value that returned normally is recorded at once and never retried', async () => {
  const acts = [];
  const {result} = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet',
    cell: saveCells({act: c => { acts.push(c); return saveAct(c, {threw: null}); }, check: {sheetOpen: false, nameWritten: false, destinationFiles: []}})});
  const row = rowOf(result, SAVE_SHEET);
  assert.deepEqual([acts.length, row.attempts, row.ok, row.invalid, row.outcome.sheetOpen], [1, 1, false, undefined, false]);
  assert.equal(row.outcome.validity, null, 'nothing kept it from being judged');
  assert.equal(result.verdict, 'fail');
});

test('#212\'s save sheet: a cleanup that throws (a save that renamed the document) stops the run after the row is recorded, its failure reported apart', async () => {
  const renamed = {closed: true, sceneInFront: false, front: 'other'};
  const {result} = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet',
    cell: saveCells({check: {sheetOpen: false, nameWritten: true, destinationFiles: ['cua-212-intended.rtf']}, cleanup: renamed})});
  const row = rowOf(result, SAVE_SHEET);
  assert.ok(row, 'the row is recorded before the cleanup');
  assert.deepEqual([row.ok, row.invalid, row.attempts, row.outcome.sheetOpen, row.outcome.destinationFiles], [false, undefined, 1, false, ['cua-212-intended.rtf']]);
  assert.match(row.outcome.cleanupFailed, /untitled document could not be closed/);
  assert.equal(result.complete, false);
  assert.ok(result.problems.some(p => /^stopped: #212's save sheet's untitled document could not be closed/.test(p)), JSON.stringify(result.problems));
  // A preparation that failed is recorded before its cleanup too.
  const unprepared = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet',
    cell: saveCells({destination: {ready: false, reason: 'the Save sheet was not up'}, cleanup: renamed})});
  const invalid = rowOf(unprepared.result, SAVE_SHEET);
  assert.match(invalid.invalid, /destination was not set to the run's folder \(the Save sheet was not up\)/);
  assert.match(invalid.outcome.cleanupFailed, /could not be closed/);
  assert.equal(unprepared.result.complete, false);
});

test('#212\'s save sheet: no act without the run\'s own destination; a file in it afterwards fails the row, never retried', async () => {
  const calls = [];
  const {result} = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', calls,
    cell: saveCells({destination: {ready: false, reason: 'the folder\'s path did not land in the Go To field'}})});
  const row = rowOf(result, SAVE_SHEET);
  assert.match(row.invalid, /destination was not set/);
  assert.ok(!calls.some(c => tagOf(c.code) === 'savesheet.act'), 'nothing is sent toward the sheet');
  // Observation only (the panel's controls unread): the row is invalid and carries what the cell observed.
  const observed = {before: {trailer: 'focused', count: 9, lines: []}, after: {trailer: 'focused', count: 11, lines: []}};
  const reading = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet',
    cell: saveCells({destination: {ready: false, reason: 'the save panel\'s controls are not identified yet: observation only, nothing typed and no Return', observed}})});
  const first = rowOf(reading.result, SAVE_SHEET);
  assert.match(first.invalid, /observation only/);
  assert.deepEqual([first.attempts, first.outcome.observed], [1, observed]);
  assert.ok(calls.some(c => tagOf(c.code) === 'savesheet.cancel'));
  const saved = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet',
    cell: saveCells({check: {sheetOpen: true, nameWritten: true, destinationFiles: ['cua-212-intended.rtf']}})});
  const committed = rowOf(saved.result, SAVE_SHEET);
  assert.deepEqual([committed.ok, committed.invalid, committed.attempts, committed.outcome.destinationFiles], [false, undefined, 1, ['cua-212-intended.rtf']]);
  const unread = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet',
    cell: saveCells({check: {sheetOpen: true, nameWritten: true, destinationFiles: null}})});
  assert.match(rowOf(unread.result, SAVE_SHEET).invalid, /run's save folder could not be read/);
});

// I3 of T10b′ part 2's fix wave 2: on a hosted run, replayd's capture alert (UserNotificationCenter) may come to the front
// after the scene's activation took and before a guarded key. The key stays blocked; the sample is recorded with the
// readings that show the alert (NO VERDICT, ruling 1141), the alert's own activation inside the row's window, and the
// run goes on. Off a runner, or with anything the alert watch does not hold, the run stops as before.
const UNC = 'com.apple.UserNotificationCenter';
// The device with the capture alert popping up after the probe section's first TextEdit activation (once the probe's
// Latin source is selected), until the next activation; `held` the alert check's answer while it is up.
function alertAfterActivation({held = true, activationAt = null} = {}) {
  let armed = false, up = false, popped = false;
  const check = () => (held && up ? {abort: false, export: {alerts: [], keywords: [], unknown: {count: 0, windows: []}, held: {count: 1, windows: [{bundleId: UNC, layer: 8, titled: null, size: [420, 180]}]}}}
    : up ? {abort: true, export: {alerts: [{bundleId: UNC, layer: 8, isAlertProcess: true}], keywords: [], unknown: {count: 0, windows: []}}} : null);
  return {matrix: (base, a) => {
    if (a[0] === 'source' && a[1] === 'select') armed = true;
    if (a[0] === 'step' && a[1] === 'activate') {
      const answer = base(a);
      up = armed && !popped && a[2] === 'textedit';
      if (up) { popped = true; activationAt?.(answer.at[1] + 500); }
      return answer;
    }
    if (a[0] === 'alerts' && a[1] === 'check') { const c = check(); return c ? {...c, at: base(a).at} : base(a); }
    if (a[0] === 'read' && up) {
      const r = base(a);
      return {...r, reading: {...r.reading, frontmost: {pid: 77, bundleId: UNC, owned: false}, topWindow: null}, ...(r.frontKey ? {frontKey: {front: UNC, key: UNC}} : {})};
    }
    return base(a);
  }};
}

test('#212\'s save sheet on a hosted run: the capture alert in front at the key guard is the sample\'s NO VERDICT, its key never sent, and the run goes on', async () => {
  const calls = [];
  let alertAt = null;
  const device = alertAfterActivation({activationAt: at => { alertAt = at; }});
  const {code, result} = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', calls, cell: saveCells(), env: {RUNNER_ENVIRONMENT: 'github-hosted'},
    ops: {...device, ...stopWith(() => ({activations: [{kind: 'activated', bundleId: UNC, at: alertAt}]}))}});
  assert.equal(result.complete, true, JSON.stringify(result.problems));
  assert.deepEqual(validateCellResult(result), []);
  const row = rowOf(result, SAVE_SHEET);
  assert.deepEqual([row.ok, row.frontKey.activate, row.frontKey.before, row.frontKey.after],
    [false, {app: 'com.apple.TextEdit', front: true, key: true}, {front: UNC, key: UNC}, {front: UNC, key: UNC}]);
  assert.deepEqual(sampleCause({...row, hosted: true}), {category: 'alert', detail: `${UNC} in front at the key guard; super+n held`}, 'ruling 1141: the alert frontmost, NO VERDICT');
  assert.equal(calls.filter(c => tagOf(c.code) === 'sheet.new').length, 0, 'the key stays blocked');
  assert.deepEqual(result.meta.keySkipped.map(k => [k.keys.join('+'), k.front.bundleId, k.held]), [['super+n', UNC, true]]);
  assert.deepEqual(result.meta.activations.unaccounted, [], 'the alert\'s activation is the row\'s');
  assert.deepEqual(result.meta.alertsHeld.map(h => [h.count, h.windows]), [[1, [{bundleId: UNC, layer: 8, titled: null, size: [420, 180]}]]]);
  assert.deepEqual([code, result.verdict], [1, 'no-verdict'], 'a cell with no verdict is no pass');
});

test('the capture alert at the key guard: off a runner, or not held by the alert watch, the run stops as before', async () => {
  const off = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', cell: saveCells(), ops: alertAfterActivation()});
  assert.equal(off.result.complete, false);
  assert.ok(off.result.problems.some(p => /not one of the run's windows/.test(p)), JSON.stringify(off.result.problems));
  const unheld = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', cell: saveCells(), env: {RUNNER_ENVIRONMENT: 'github-hosted'}, ops: alertAfterActivation({held: false})});
  assert.equal(unheld.result.complete, false);
  assert.ok(unheld.result.problems.some(p => /possible system alert/.test(p)), JSON.stringify(unheld.result.problems));
  assert.equal(rowOf(unheld.result, SAVE_SHEET), undefined);
});

// I3b of fix wave 3: a hold after the attempt made its fixture (the untitled document) still cleans it up. The cleanup is
// registered when the document opens; a cleanup the alert holds too is retried with TextEdit activated before anything
// else is collected, and one that cannot be reset stops the run. `persist`: 'flash' (up for the typing's guard only),
// 'activation' (up until TextEdit is next activated) or 'always' (no activation clears it).
function heldTyping(calls, persist) {
  let state = 'idle', pending = false;
  const opened = () => calls.some(c => tagOf(c.code) === 'sheet.new') && !calls.some(c => tagOf(c.code) === 'sheet.type');
  const held = {abort: false, export: {alerts: [], keywords: [], unknown: {count: 0, windows: []}, held: {count: 1, windows: [{bundleId: UNC, layer: 8, titled: null, size: null}]}}};
  return {matrix: (base, a) => {
    if (a[0] === 'step' && a[1] === 'activate' && state === 'up' && persist === 'activation') state = 'gone';
    if (a[0] === 'alerts' && a[1] === 'check' && (state === 'up' || pending)) { pending = false; return {...held, at: base(a).at}; }
    if (a[0] === 'read') {
      if (state === 'idle' && opened() && !a.includes('--with')) state = 'up';
      if (state !== 'up') return base(a);
      if (persist === 'flash') { state = 'gone'; pending = true; }
      const x = base(a);
      return {...x, reading: {...x.reading, frontmost: {pid: 77, bundleId: UNC, owned: false}}, ...(x.frontKey ? {frontKey: {front: UNC, key: UNC}} : {})};
    }
    return base(a);
  }};
}
const sheetTags = calls => calls.map(c => tagOf(c.code)).filter(t => /^(sheet|savesheet)\./.test(t ?? ''));

test('#212\'s save sheet, hosted: the typing held after the untitled document opened still runs its cleanup, the row NO VERDICT', async () => {
  const calls = [];
  const {result} = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', calls, cell: saveCells(), env: {RUNNER_ENVIRONMENT: 'github-hosted'}, ops: heldTyping(calls, 'flash')});
  assert.equal(result.complete, true, JSON.stringify(result.problems));
  assert.deepEqual(sheetTags(calls), ['sheet.new', 'savesheet.cancel', 'sheet.cleanup'], 'nothing typed; the sheet cancelled and the document closed');
  const row = rowOf(result, SAVE_SHEET);
  assert.equal(sampleCause({...row, hosted: true}).category, 'alert');
  assert.equal(row.outcome?.cleanupHeld, undefined);
  assert.equal(result.meta.fixturesHeld, undefined);
});

test('#212\'s save sheet, hosted: a cleanup the alert holds too is reset with TextEdit activated; one that cannot be reset stops the run', async () => {
  const calls = [];
  const reset = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', calls, cell: saveCells(), env: {RUNNER_ENVIRONMENT: 'github-hosted'}, ops: heldTyping(calls, 'activation')});
  assert.equal(reset.result.complete, true, JSON.stringify(reset.result.problems));
  const row = rowOf(reset.result, SAVE_SHEET);
  assert.match(row.outcome.cleanupHeld, /Escape not sent/);
  assert.deepEqual(reset.result.meta.fixturesHeld, [{row: SAVE_SHEET, sample: 1, scene: 'textedit', reset: true}]);
  assert.deepEqual(sheetTags(calls), ['sheet.new', 'savesheet.cancel', 'sheet.cleanup'], 'the cleanup ran once TextEdit was activated again');
  const stuck = [];
  const stopped = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', calls: stuck, cell: saveCells(), env: {RUNNER_ENVIRONMENT: 'github-hosted'}, ops: heldTyping(stuck, 'always')});
  assert.equal(stopped.result.complete, false);
  assert.ok(stopped.result.problems.some(p => /fixture.*left \(its cleanup held by the capture alert\) could not be reset/.test(p)), JSON.stringify(stopped.result.problems));
  assert.deepEqual(stopped.result.meta.fixturesHeld, [{row: SAVE_SHEET, sample: 1, scene: 'textedit', reset: false, blockedBy: 'alert'}]);
  assert.equal(sampleCause({...rowOf(stopped.result, SAVE_SHEET), hosted: true}).category, 'alert', 'the row it kept stays missing proof');
});

// T8e review, Minor 2: a run stopped because a held fixture's reset was held too keeps every sample its plan still had
// to take, NO VERDICT by the reset's cause, as a refused harness cell's run does; none vanishes from the counts.
test('a held fixture whose reset is held stops the run with every planned sample after it recorded NO VERDICT, none missing', async () => {
  const {manifestOf} = await import('../../scripts/native-matrix/manifest.mjs');
  const plan = {...planOf('intervention-save-sheet'), launch: planOf('launch').launch};
  const stuck = [];
  const {result} = await runWith({plan, cellName: 'intervention-save-sheet', calls: stuck, cell: saveCells(), env: {RUNNER_ENVIRONMENT: 'github-hosted'}, ops: heldTyping(stuck, 'always')});
  assert.equal(result.complete, false);
  assert.deepEqual(result.meta.fixturesHeld.map(f => [f.reset, f.blockedBy]), [[false, 'alert']]);
  const planned = manifestOf({run: 1, samples: 2}, plan);
  const have = new Set(result.rows.map(r => `${r.section} ${r.id} ${r.sample}`));
  assert.deepEqual(planned.filter(e => !have.has(`${e.section} ${e.id} ${e.sample}`)), [], 'no planned sample vanished');
  const unrun = result.rows.filter(r => r.section === 'launch');
  assert.ok(unrun.length > 0 && unrun.every(r => sampleCause(r).category === 'alert' && /not run: the run stopped when a held fixture could not be reset/.test(r.alertGuard.detail)),
    JSON.stringify(unrun));
  assert.deepEqual(validateCellResult(result), []);
});

// The key-window requirement (ruling 1169's addition) across a second TextEdit window: after super+n every key the
// variant sends acts in the untitled document, and a sheet on it is part of it. The device's reading is the real one
// (matrix-device.mjs sceneKeyWindow) against a modelled screen: the scene document (recorded, window 4), the untitled
// document in front of it once super+n landed, its sheet in front of that while one is up. Accessibility lists the two
// documents, never the sheet, and names the frontmost document TextEdit's focused and main window.
function twoWindows(calls) {
  const tags = () => calls.map(c => tagOf(c.code)).filter(Boolean);
  const rect = (x, y, width, height) => ({x, y, width, height});
  const DOC = {ownerPid: 600, layer: 0, number: 4, bounds: rect(242, 107, 603, 505)}, UNTITLED = {ownerPid: 600, layer: 0, number: 9, bounds: rect(262, 127, 603, 505)};
  const SHEET = {ownerPid: 600, layer: 0, number: 11, bounds: rect(323, 149, 480, 300)};
  const world = () => {
    let untitled = false, sheet = false;
    for (const t of tags()) {
      if (t === 'sheet.new') untitled = true;
      if (t === 'sheet.open' || t === 'savesheet.open') sheet = true;
      if (t === 'savesheet.cancel') sheet = false;
      if (t === 'sheet.follow' || t === 'sheet.cleanup') { sheet = false; untitled = false; }
    }
    return [...(sheet ? [SHEET] : []), ...(untitled ? [UNTITLED] : []), DOC];
  };
  const asked = [];
  const wire = b => [b.x, b.y, b.width, b.height].join(',');
  // Accessibility as TextEdit shows it: the sheet no window of its own, an AXSheet child of the untitled document.
  const io = {state: () => ({scenes: {textedit: {pid: 600, window: {number: 4}}}}), windows: world, axState: (pid, bounds, sheetAt) => {
    const listed = world().filter(w => w !== SHEET), at = listed.find(w => wire(w.bounds) === bounds);
    asked.push({bounds, found: Boolean(at)});
    const front = listed[0] === at ? 'run' : 'other';
    return {trusted: true, ok: Boolean(at), found: Boolean(at), failed: [], frontmost: false, focusedWindow: at ? front : 'other', mainWindow: at ? front : 'other',
      ...(sheetAt === undefined ? {} : {sheet: at === UNTITLED && world().includes(SHEET) && sheetAt === wire(SHEET.bounds)})};
  }};
  return {asked, ops: {matrix: (base, a) => {
    const out = base(a);
    return a[0] === 'read' && a.includes('--key-window') && a[a.indexOf('--key-window') + 1] === 'textedit' ? {...out, ownKey: sceneKeyWindow('textedit', io)} : out;
  }}};
}

test('the key-window rule reads the window a cell acts in: the sheet variant\'s and #212\'s keys and cleanups after super+n are sent, none refused', async () => {
  for (const [planId, cell, tag] of [['concurrent-use-sheet', sheetCells(), 'sheet.open'], ['intervention-save-sheet', saveCells(), 'savesheet.act']]) {
    const calls = [];
    const {asked, ops} = twoWindows(calls);
    const {result} = await runWith({plan: planOf(planId), cellName: planId, calls, cell, ops});
    assert.equal(result.complete, true, `${planId}: ${result.problems.join('; ')}`);
    assert.equal((result.meta.alertGuards ?? []).filter(g => g.cause === 'keyWindow').length, 0, `${planId}: ${JSON.stringify(result.meta.alertGuards)}`);
    assert.equal(result.meta.keyWindowUnread, undefined, planId);
    assert.ok(calls.some(c => tagOf(c.code) === tag), `${planId}: ${tag} sent`);
    // The untitled document was the one read once super+n landed, and a sheet in front was read as its document.
    assert.ok(asked.some(a => a.bounds === '262,127,603,505'), planId);
    if (planId === 'intervention-save-sheet') assert.ok(asked.some(a => a.bounds === '323,149,480,300' && !a.found), 'the sheet: not an Accessibility window, its document read instead');
  }
});

// Inside a timed probe the key cell's key-window reading is the user-window read's own (./steps.mjs userFront), never a
// device read of its own between that read and the act, which would spend the probe's lead.
test('a timed probe\'s key cell reads its key window with the user window, never in a read of its own', async () => {
  for (const [plan, cellName, cell] of [[planOf('concurrent-use', {scene: 'chrome'}), 'concurrent-use', c => (tagOf(c) === 'concurrent.act' ? acted(c) : null)],
    [planOf('concurrent-use-sheet'), 'concurrent-use-sheet', sheetCells()]]) {
    const {steps, result} = await runWith({plan, cellName, cell});
    assert.equal(result.complete, true, result.problems.join('; '));
    const keyed = matrixSteps(steps, 'read').filter(a => a.includes('--key-window'));
    assert.ok(keyed.length > 0, cellName);
    const own = keyed.filter(a => !(a[a.indexOf('--with') + 1] ?? '').includes('window-order') && !(a[a.indexOf('--with') + 1] ?? '').includes('alert-bounds'));
    assert.deepEqual(own, [], `${cellName}: a key-window read of its own`);
  }
});

// Ruling 1188: off a GitHub-hosted runner the probe cells run only under the owner's own Latin source with the
// preference off; anything else is NO VERDICT `ownerInput`, and nothing is saved, selected or restored.
test('probe cells off a hosted runner: run under the owner\'s ABC with the preference off, NO VERDICT ownerInput otherwise; nothing is switched', async () => {
  const offHosted = owner => ({matrix: (base, a) => (a[0] === 'source' && a[1] === 'state'
    ? {...base(a), answer: {writable: false, refused: 'off a GitHub-hosted runner … (ruling 1188)', current: owner.source, layout: owner.source, perContext: owner.perContext}} : base(a))});
  const plan = planOf('concurrent-use', {scene: 'chrome'});
  const latin = await runWith({plan, cellName: 'concurrent-use', ops: offHosted({source: 'com.apple.keylayout.ABC', perContext: false}), cell: c => (tagOf(c) === 'concurrent.act' ? acted(c) : null)});
  assert.equal(latin.code, 0, JSON.stringify(latin.result.problems));
  assert.deepEqual(sourceSteps(latin.steps), ['state', 'state'], 'read at the start and again at the probe');
  assert.deepEqual([rowOf(latin.result, 'chrome/concurrent@textedit').ok, latin.result.meta.inputSource.latin, latin.result.meta.inputSource.drift], [true, true, undefined]);
  const other = await runWith({plan, cellName: 'concurrent-use', ops: offHosted({source: 'com.apple.keylayout.US', perContext: null}), cell: c => (tagOf(c) === 'concurrent.act' ? acted(c) : null)});
  assert.deepEqual(sourceSteps(other.steps), ['state', 'state']);
  assert.deepEqual(matrixSteps(other.steps, 'probe'), [], 'nothing posted');
  const row = rowOf(other.result, 'chrome/concurrent@textedit');
  assert.equal(sampleCause(row).category, 'ownerInput');
  assert.match(row.ownerInput, /ruling 1188.*the row needs the per-context input preference \(.*\) off, the owner's is unset, and the input source com\.apple\.keylayout\.ABC, the owner's is com\.apple\.keylayout\.US$/);
  assert.deepEqual(validateCellResult(other.result), []);
  // The owner switched to Korean after the run's first reading: the probe's own reading decides, the change is kept,
  // and the row is NO VERDICT ownerInput, never a generic invalid one and never posted.
  let reads = 0;
  const drifting = {matrix: (base, a) => {
    if (!(a[0] === 'source' && a[1] === 'state')) return base(a);
    reads += 1;
    return {...base(a), answer: {writable: false, refused: 'off a GitHub-hosted runner … (ruling 1188)', current: reads === 1 ? 'com.apple.keylayout.ABC' : 'com.apple.inputmethod.Korean.2SetKorean', perContext: false}};
  }};
  const drifted = await runWith({plan, cellName: 'concurrent-use', ops: drifting, cell: c => (tagOf(c) === 'concurrent.act' ? acted(c) : null)});
  assert.deepEqual(matrixSteps(drifted.steps, 'probe'), [], 'nothing posted');
  const moved = rowOf(drifted.result, 'chrome/concurrent@textedit');
  assert.equal(sampleCause(moved).category, 'ownerInput');
  assert.match(moved.ownerInput, /the row needs the input source com\.apple\.keylayout\.ABC, the owner's is com\.apple\.inputmethod\.Korean\.2SetKorean$/);
  assert.deepEqual(drifted.result.meta.inputSource.drift, [{at: 'probe chrome/concurrent@textedit', from: {source: 'com.apple.keylayout.ABC', perContext: false}, to: {source: 'com.apple.inputmethod.Korean.2SetKorean', perContext: false}}]);
  assert.equal(drifted.result.meta.inputSource.latin, true, 'the first reading stays as it was read');
  assert.deepEqual(validateCellResult(drifted.result), []);
});

// A baseline the restore could not put back (the runner's preference read malformed) is refused before anything is
// written or selected: the run only reads, and the rows needing a write are NO VERDICT venue (a hosted runner's
// precondition, not the owner's state), naming why. Refused where it shows: at the first reading, or at the save's own.
test('probe cells on a hosted runner whose per-context baseline reads malformed, at the first reading or at the save: nothing written or selected; NO VERDICT venue naming it', async () => {
  const malformed = {malformed: 'AppleGlobalTextInputProperties is a string, not a dictionary'};
  const refusal = /the per-context input preference \(.*\) reads malformed \(AppleGlobalTextInputProperties is a string, not a dictionary\): a restore could not put it back, so nothing is saved, selected or written/;
  const hosted = perContext => ({writable: true, current: 'com.apple.keylayout.US', layout: 'com.apple.keylayout.US', perContext, venueMissing: []});
  const atState = {matrix: (base, a) => (a[0] === 'source' && a[1] === 'state' ? {...base(a), answer: hosted(malformed)} : base(a))};
  // The state read valid, then the save's own read malformed (the preference changed in between).
  const atSave = {matrix: (base, a) => (a[0] === 'source' && a[1] === 'state' ? {...base(a), answer: hosted(false)}
    : a[0] === 'source' && a[1] === 'save' ? {...base(a), answer: {kept: false, refused: 'the per-context input preference (com.apple.HIToolbox AppleGlobalTextInputProperties TextInputGlobalPropertyPerContextInput) reads malformed (AppleGlobalTextInputProperties is a string, not a dictionary): a restore could not put it back, so nothing is saved, selected or written', saved: null}} : base(a))};
  for (const [name, ops, expected] of [['the first reading', atState, ['state', 'state']], ['the save', atSave, ['state', 'save', 'state']]]) {
    const {steps, result} = await runWith({plan: planOf('concurrent-use', {scene: 'chrome'}), cellName: 'concurrent-use', ops, cell: c => (tagOf(c) === 'concurrent.act' ? acted(c) : null)});
    assert.deepEqual(sourceSteps(steps), expected, `${name}: read only, never written, selected or restored`);
    assert.deepEqual(matrixSteps(steps, 'probe'), [], name);
    assert.match(result.meta.inputSource.refused, refusal, name);
    const row = rowOf(result, 'chrome/concurrent@textedit');
    assert.equal(sampleCause(row).category, 'venue', name);
    assert.equal(row.ownerInput, undefined, name);
    assert.match(row.venueInput, /^the per-context input preference .* reads malformed .*: a restore could not put it back, so nothing is saved, selected or written; the row needs /, name);
    assert.deepEqual(validateCellResult(result), [], name);
  }
});

test('probe cells when the venue could not enable ABC: NO VERDICT venue naming it, ABC never selected, nothing posted', async () => {
  const ops = {matrix: (base, a) => {
    if (a[0] === 'source' && a[1] === 'state') { const out = base(a); return {...out, answer: {...out.answer, venueMissing: ['com.apple.keylayout.ABC']}}; }
    return base(a);
  }};
  const {steps, result} = await runWith({plan: planOf('concurrent-use', {scene: 'chrome'}), cellName: 'concurrent-use', ops, cell: c => (tagOf(c) === 'concurrent.act' ? acted(c) : null)});
  assert.deepEqual(sourceSteps(steps), ['state', 'save', 'per-context off', 'restore'], 'ABC never selected');
  assert.deepEqual(matrixSteps(steps, 'probe'), []);
  const row = rowOf(result, 'chrome/concurrent@textedit');
  assert.equal(sampleCause(row).category, 'venue');
  assert.match(row.venueInput, /could not enable com\.apple\.keylayout\.ABC .*ruling 1189/);
  assert.deepEqual(validateCellResult(result), []);
});

// Ruling 1220's fourth condition: a failure anywhere on #212's destination path decides that row alone. The Go To dialog
// that would not close is said on the row; the run goes on to its next row, with no stop and no ResetBlocked.
// Ruling 1221 (F1): a Go To dialog Escape left up closes on its CloseButton in the same cell; the row gets its verdict
// and the run goes on.
test('#212\'s destination failing with the Go To dialog closed on its CloseButton decides its row alone; the run goes on', async () => {
  const destination = {ready: false, reason: 'the Go To dialog and its focused path field were not identified', goTo: {closed: true, sheetUp: true, escapes: 3, closeClicked: true}};
  const plan = {...planOf('intervention-save-sheet'), intervention: ['saveSheet', 'fires'], id: 'x'};
  const {result} = await runWith({plan, cellName: 'intervention-save-sheet', cell: saveCells({destination})});
  const row = rowOf(result, SAVE_SHEET);
  assert.equal(row.invalid, 'the Save sheet\'s destination was not set to the run\'s folder (the Go To dialog and its focused path field were not identified)');
  assert.deepEqual(row.outcome.goTo, destination.goTo);
  assert.ok(result.rows.some(r => r.id === 'textedit/intervention.fires'), 'the next row ran');
  assert.deepEqual(result.problems, []);
  assert.equal(result.complete, true);
});
// Only a dialog that survives Escape, its CloseButton and the Save sheet's cancel leaves TextEdit's key window another
// one, so the cleanup is refused, the reset too, and the run stops: its text names the dialog and each step tried.
test('#212\'s Go To dialog surviving every step stops the run, the stop naming it and each step tried', async () => {
  const destination = {ready: false, reason: 'the Go To dialog and its focused path field were not identified', goTo: {closed: false, sheetUp: null, escapes: 3, closeClicked: true, sheetCancel: 'unreachable'}};
  let stuck = false;
  const cell = c => { if (tagOf(c) === 'savesheet.destination') stuck = true; return saveCells({destination})(c); };
  const ops = {matrix: (base, a) => {
    const out = base(a);
    return stuck && out?.ownKey ? {...out, ownKey: {...out.ownKey, focusedWindow: 'other', focused: {number: 9, frame: null, role: 'AXSheet', subrole: null, parent: null}}} : out;
  }};
  const plan = {...planOf('intervention-save-sheet'), intervention: ['saveSheet', 'fires'], id: 'x'};
  const {result} = await runWith({plan, cellName: 'intervention-save-sheet', cell, ops});
  assert.equal(result.complete, false);
  const stop = result.problems.find(p => /could not be reset/.test(p));
  // Fix wave M7: the stop leads with the dialog and its steps, before the fixture clause.
  assert.match(stop ?? '', /^stopped: the Go To dialog stayed up through each step its cell tried \(Escape 3x, still up; CloseButton clicked, still up; the Save sheet's cancel unreachable behind it\): the textedit fixture textedit\/intervention\.saveSheet left \(its cleanup refused by the key-window guard\) could not be reset/, JSON.stringify(result.problems));
});
// Fix wave I4: a destination cell that threw after super+shift+g closed the dialog and said the throw: its row is invalid
// with the throw kept, and the run goes on.
test('#212\'s destination that threw after super+shift+g decides its row alone, the throw kept; the run goes on', async () => {
  const destination = {ready: false, reason: 'the cell threw after super+shift+g: typeUnconfirmed', threw: {name: 'typeUnconfirmed', message: 'the typed text did not read back'},
    goTo: {closed: true, sheetUp: true, escapes: 1, closeClicked: false}};
  const plan = {...planOf('intervention-save-sheet'), intervention: ['saveSheet', 'fires'], id: 'x'};
  const {result} = await runWith({plan, cellName: 'intervention-save-sheet', cell: saveCells({destination})});
  const row = rowOf(result, SAVE_SHEET);
  assert.equal(row.invalid, 'the Save sheet\'s destination was not set to the run\'s folder (the cell threw after super+shift+g: typeUnconfirmed)');
  assert.deepEqual([row.outcome.threw, row.outcome.goTo], [destination.threw, destination.goTo]);
  assert.ok(result.rows.some(r => r.id === 'textedit/intervention.fires'), 'the next row ran');
  assert.deepEqual(result.problems, []);
  assert.equal(result.complete, true);
});

// Ruling 1220's third condition, by ruling 1221 (F2) read with no protected folder: nothing is saved, proved at the run's
// folder and, once the sheet is cancelled inside the attempt, by Accessibility on TextEdit's own window: no document on
// disk behind it (AXDocument) and its edits still unsaved (AXEdited). No default save folder is listed.
test('#212\'s row proves nothing saved on TextEdit\'s own window after the cancel: a stubbed save (AXDocument appears) fails it', async () => {
  const order = [];
  const documentOps = answer => ({matrix: (base, a) => {
    if (a[0] === 'saved') throw new Error('no default save folder is read');
    if (a[0] !== 'document') return base(a);
    order.push(`document:${a[a.indexOf('--window') + 1]}`);
    return {answer, at: [1, 2]};
  }});
  const cell = c => { if (['savesheet.cancel', 'savesheet.check'].includes(tagOf(c))) order.push(tagOf(c)); return saveCells()(c); };
  const run = answer => runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', cell, ops: documentOps(answer)});
  const clean = rowOf((await run({ok: true, number: 1, found: true, document: false, edited: true, editedFrom: 'window'})).result, SAVE_SHEET);
  assert.equal(clean.ok, true, JSON.stringify(clean));
  assert.deepEqual(clean.outcome.unsaved, {document: false, edited: true, editedFrom: 'window'});
  assert.deepEqual(clean.outcome.findings, [], 'the row\'s ok is its findings\'');
  assert.equal(clean.outcome.defaultSaves, undefined);
  assert.deepEqual(order.slice(0, 3), ['savesheet.check', 'savesheet.cancel', `document:${UNTITLED}`], 'the run\'s own untitled window read after the cancel');
  order.length = 0;
  const saved = rowOf((await run({ok: true, number: 1, found: true, document: true, edited: false, editedFrom: 'window'})).result, SAVE_SHEET);
  assert.equal(saved.ok, false);
  assert.equal(saved.invalid, undefined, 'a save is a finding, not a missing proof');
  assert.deepEqual(saved.outcome.unsaved, {document: true, edited: false, editedFrom: 'window'});
  assert.ok(saved.outcome.findings.includes('a document on disk behind TextEdit\'s window (AXDocument names a file)'), JSON.stringify(saved.outcome.findings));
  // Ruling 1223 (R1): AXEdited is a diagnostic only. C-6's vendor row read it false from the close button with no file
  // behind the window and the run's folder empty; that alone passes, the reading kept.
  order.length = 0;
  const editedOnly = rowOf((await run({ok: true, number: 1, found: true, document: false, edited: false, editedFrom: 'closeButton'})).result, SAVE_SHEET);
  assert.equal(editedOnly.ok, true, JSON.stringify(editedOnly));
  assert.deepEqual([editedOnly.outcome.unsaved, editedOnly.outcome.findings], [{document: false, edited: false, editedFrom: 'closeButton'}, []]);
  // A file the cancel found in the run's folder is a save, though the act's check read it empty.
  const late = rowOf((await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet',
    cell: saveCells({cancel: {cancelled: true, destinationRemoved: false, destinationFiles: ['cua-212-intended.rtf']}})})).result, SAVE_SHEET);
  assert.deepEqual([late.ok, late.invalid, late.attempts], [false, undefined, 1]);
  assert.ok(late.outcome.findings.includes('the run\'s folder held cua-212-intended.rtf at the cancel'), JSON.stringify(late.outcome.findings));
  order.length = 0;
  const unread = rowOf((await run({ok: false, number: 1, reason: 'the reader is not trusted for Accessibility'})).result, SAVE_SHEET);
  assert.equal(unread.ok, false);
  assert.equal(unread.invalid, 'nothing saved was not proved: TextEdit\'s own window could not be read (the reader is not trusted for Accessibility)');
});

// Fix wave M1: the unsaved proof's cancel catches only the alert holding its key (AlertHeld, the guard's refusal among
// them); a key-guard stop (the front not the run's) stops the run, as it does everywhere else.
test('#212\'s unsaved proof: a key-guard stop at the cancel stops the run, never a row with its proof unread', async () => {
  let foreign = false;
  const ops = {matrix: (base, a) => {
    const r = base(a);
    if (a[0] !== 'read' || !foreign) return r;
    return {...r, reading: {...r.reading, frontmost: {pid: 77, bundleId: 'com.example.foreign', owned: false}, topWindow: null}, ...(r.frontKey ? {frontKey: {front: 'com.example.foreign', key: 'com.example.foreign'}} : {})};
  }};
  const cell = c => { if (tagOf(c) === 'savesheet.check') foreign = true; return saveCells()(c); };
  const {result} = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', ops, cell});
  assert.equal(result.complete, false);
  assert.ok(result.problems.some(p => /Escape not sent: the front is not one of the run's windows/.test(p)), JSON.stringify(result.problems));
  assert.equal(rowOf(result, SAVE_SHEET)?.outcome?.unsaved?.unread, undefined, 'no row records the stop as an unread proof');
});

// C-6: every exit of #212's destination cell carries its Go To close record and the observation it was judged on, the
// ready one included; and once the destination cell ran, an exit before the act's check still cancels the sheet first, so
// its row carries the cancel's temp-folder result and the unsaved proof (cua's C-6 row carried neither).
const LAST_OBSERVATION = {trailer: 'focused', count: 4, lines: [{index: 0, depth: 0, parent: null, id: 'GoToWindow', head: 'sheet', focused: false}]};
const CANCELLED = {cancelled: true, destinationRemoved: true, destinationFiles: []};
test('#212\'s ready destination keeps its Go To close record and last observation on the row', async () => {
  const destination = {ready: true, initialWhere: 'Documents', goTo: {closed: true, sheetUp: true, escapes: 0, closeClicked: false}, lastObservation: LAST_OBSERVATION};
  const {result} = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', cell: saveCells({destination, cancel: CANCELLED})});
  const row = rowOf(result, SAVE_SHEET);
  assert.equal(row.ok, true, JSON.stringify(row));
  assert.deepEqual([row.outcome.goTo, row.outcome.lastObservation, row.outcome.cancel], [destination.goTo, LAST_OBSERVATION, CANCELLED]);
});
test('#212\'s exits after the destination cell carry the cancel\'s temp-folder result and the unsaved proof', async () => {
  // C-6's cua row: the Go To dialog's path field not identified, the dialog closed by one Escape.
  const destination = {ready: false, reason: 'the Go To dialog and its focused path field were not identified (field not found)', identification: 'field not found',
    goTo: {closed: true, sheetUp: true, escapes: 1, closeClicked: false}, lastObservation: LAST_OBSERVATION};
  const calls = [];
  const failed = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', calls, cell: saveCells({destination, cancel: CANCELLED})});
  const row = rowOf(failed.result, SAVE_SHEET);
  assert.equal(row.invalid, 'the Save sheet\'s destination was not set to the run\'s folder (the Go To dialog and its focused path field were not identified (field not found))');
  assert.deepEqual({goTo: row.outcome.goTo, lastObservation: row.outcome.lastObservation, identification: row.outcome.identification},
    {goTo: destination.goTo, lastObservation: LAST_OBSERVATION, identification: 'field not found'});
  assert.deepEqual([row.outcome.unsaved, row.outcome.cancel], [{document: false, edited: true, editedFrom: 'window'}, CANCELLED]);
  assert.deepEqual(calls.map(c => tagOf(c.code)).filter(t => /^(sheet|savesheet)\./.test(t)), ['sheet.new', 'sheet.type', 'savesheet.open', 'savesheet.destination', 'savesheet.cancel', 'savesheet.cancel', 'sheet.cleanup']);
  assert.equal(failed.result.verdict, 'no-verdict');
  // The act cell failing: the same, its proof read.
  const act = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', cell: saveCells({act: () => ({cellError: 'boom'}), cancel: CANCELLED})});
  const unacted = rowOf(act.result, SAVE_SHEET);
  assert.match(unacted.invalid, /^the act cell failed/);
  assert.deepEqual([unacted.outcome.unsaved, unacted.outcome.cancel], [{document: false, edited: true, editedFrom: 'window'}, CANCELLED]);
  // Fix wave M7: an early exit whose cancel found a file in the run's folder, or whose window has a document on disk, is
  // a harness save: a FAIL naming it, the exit's reason kept, never NO VERDICT.
  const found = {cancelled: true, destinationRemoved: false, destinationFiles: ['cua-212-intended.rtf']};
  const savedEarly = rowOf((await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', cell: saveCells({act: () => ({cellError: 'boom'}), cancel: found})})).result, SAVE_SHEET);
  assert.deepEqual([savedEarly.ok, savedEarly.invalid, savedEarly.outcome.cancel], [false, undefined, found]);
  assert.deepEqual(savedEarly.outcome.findings, ['the run\'s folder held cua-212-intended.rtf at the cancel']);
  assert.match(savedEarly.outcome.earlyExit, /^the act cell failed/);
  const documentOps = {matrix: (base, a) => (a[0] === 'document' ? {answer: {ok: true, number: 1, found: true, document: true, edited: false, editedFrom: 'window'}, at: [1, 2]} : base(a))};
  const onDisk = rowOf((await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', ops: documentOps, cell: saveCells({destination, cancel: CANCELLED})})).result, SAVE_SHEET);
  assert.deepEqual([onDisk.ok, onDisk.invalid, onDisk.outcome.findings], [false, undefined, ['a document on disk behind TextEdit\'s window (AXDocument names a file)']]);
  assert.match(onDisk.outcome.earlyExit, /^the Save sheet's destination was not set/);
  // The cancel that did not take leaves the proof unread, said on the row.
  const held = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', cell: saveCells({destination, cancel: {cancelled: false, destinationRemoved: null, destinationFiles: null}})});
  const unread = rowOf(held.result, SAVE_SHEET);
  assert.deepEqual(unread.outcome.unsaved, {unread: 'the Save sheet was not cancelled first (the sheet still up)'});
  assert.deepEqual(unread.outcome.cancel, {cancelled: false, destinationRemoved: null, destinationFiles: null});
});

// Ruling 1223 (R2): C-6's fires and pre-action rows found the run's Electron fixture window on top of TextEdit on both
// lanes. Their TextEdit activation waits for its window on top, then raises it on a hosted runner, as ruling 1221's
// background user windows do (./steps.mjs activateToTop); the path is kept on the row (`toTop`). The save sheet's
// activation, a fixture's reset and the panels' are left as they were.
test('the intervention probes bring TextEdit\'s window to the top as ruling 1221\'s user windows, the path on the row', async () => {
  const raised = {path: 'raised', ms: 900, topBefore: {bundleId: 'com.github.Electron', number: 41, layer: 0, owned: true}, raise: {ok: true}};
  const ops = {matrix: (base, a) => {
    const out = base(a);
    return a[0] === 'step' && a[1] === 'activate' && a.includes('--top-window') ? {...out, answer: {...out.answer, toTop: raised}} : out;
  }};
  const {result, steps} = await runWith({plan: {...planOf('intervention-fires'), intervention: ['fires', 'preAction'], id: 'x'}, cellName: 'intervention-fires', ops,
    env: {RUNNER_ENVIRONMENT: 'github-hosted'},
    cell: c => (tagOf(c) === 'intervention.act' ? acted(c, {threw: `${REFUSED}${USER_CHANGED}x'. Re-query`, errorName: 'Error'})
      : tagOf(c) === 'intervention.next' ? {...acted(c), threw: true, errorName: 'Error', message: `${REFUSED}${USER_CHANGED}x'.`}
        : tagOf(c) === 'preaction.act' ? acted(c, {threw: `${REFUSED}${STILL_INTERACTING}x'. Wait`, errorName: 'Error', interval: null}) : null)});
  for (const id of ['textedit/intervention.fires', 'textedit/intervention.preAction']) assert.deepEqual(rowOf(result, id).toTop, {scene: 'textedit', ...raised}, id);
  const activations = matrixSteps(steps, 'step').filter(a => a[1] === 'activate' && a[2] === 'textedit');
  // Each of the two rows' two samples; the run's setup activation before them stays plain.
  assert.equal(activations.filter(a => a[a.indexOf('--top-window') + 1] === 'yes' && a.includes('--approved-engine')).length, 4, JSON.stringify(activations));
  // #212's save sheet keeps its plain activation.
  const sheet = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', cell: saveCells()});
  assert.ok(matrixSteps(sheet.steps, 'step').filter(a => a[1] === 'activate').every(a => !a.includes('--top-window')));
  assert.equal(rowOf(sheet.result, SAVE_SHEET).toTop, undefined);
});

// Ruling 1228 (B): #212's probe is armed SAVE_SHEET_PROBE_BEFORE_MS before set_value is sent, the same on both lanes,
// inside the engine's 5 s "still interacting" debounce (Intervention.swift interventionDebounceMs). cua passes by refusing
// before it acts with nothing saved; the vendor by nothing saved. A cua row that acted fails only when R3's witness tap
// shows the probe's key reaching TextEdit before the engine received the request; otherwise it says nothing (invalid).
const SAVE_HOSTED = {RUNNER_ENVIRONMENT: 'github-hosted'};
const saveActed = c => saveAct(c, {threw: null, interruption: null});
const saveRefused = c => saveAct(c, {threw: REFUSED_FIRST, interruption: {phase: 'beforeAction', effects: []}});
// A hosted save-sheet run whose witness tap saw the probe's key on TextEdit's pid at `keyAt(receivedAt)` (none when
// null) and the control. -> the run, its row.
async function savedWitnessed({act = saveActed, keyAt = null, engine = 'cua'} = {}) {
  let textedit = null, probe = null, control = null, receivedAt = null;
  const ops = {
    scenes: (base, a) => { const out = base(a); if (a[0] === 'up' && a[1] === 'textedit') textedit = out.pid; return out; },
    matrix: (base, a) => { const out = base(a); if (a[0] === 'probe' && a[1] === 'keystroke') probe = out.answer.pid; return out; },
    keyRoute: (base, a) => {
      const out = base(a);
      if (a[0] === 'control') control = out.answer;
      if (a[0] === 'tap' && a[1] === 'stop') out.answer.events = [...(keyAt ? [{tapPid: textedit, kind: 'keyDown', target: textedit, source: probe, at: keyAt(receivedAt)}] : []),
        {tapPid: textedit, kind: 'flagsChanged', target: textedit, source: control.pid, at: control.at}];
      return out;
    },
  };
  const run = await runWith({engine, plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', env: SAVE_HOSTED, ops,
    cell: saveCells({act: c => { const out = act(c); receivedAt = out._meta?.['cua/receivedAt'] ?? null; return out; }})});
  return {...run, row: rowOf(run.result, SAVE_SHEET), steps: run.steps};
}

test('#212 (ruling 1228): cua refusing before it acts, nothing saved, passes; the probe armed the fixed interval before the call, the receipt on the row, no effects asked', async () => {
  assert.ok(SAVE_SHEET_PROBE_BEFORE_MS >= 100 && SAVE_SHEET_PROBE_BEFORE_MS <= 200, 'inside the engine\'s still-interacting window, well before its 5 s end');
  const {result} = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', cell: saveCells({act: saveRefused})});
  const row = rowOf(result, SAVE_SHEET);
  assert.deepEqual([row.ok, row.invalid, row.attempts], [true, undefined, 1], JSON.stringify(row.outcome));
  const o = row.outcome;
  assert.deepEqual([o.refused, o.stopped, o.agree, o.effectsNamed, o.findings], [true, false, true, null, []]);
  assert.equal(o.probeBeforeMs, SAVE_SHEET_PROBE_BEFORE_MS);
  assert.equal(o.postedAt, o.callAt - SAVE_SHEET_PROBE_BEFORE_MS, 'the probe posted the interval before the call');
  assert.equal(o.receivedAt, o.callAt + 5, 'the engine\'s receipt kept');
  assert.equal(result.verdict, 'pass');
});

test('#212 (ruling 1228): cua acting while the witness shows the probe\'s key reached TextEdit before its receipt fails the row', async () => {
  const {row, result} = await savedWitnessed({keyAt: receivedAt => receivedAt - 140});
  assert.deepEqual([row.ok, row.invalid], [false, undefined], JSON.stringify(row.outcome?.witness));
  assert.ok(row.outcome.findings.some(f => /^cua acted though the probe's key reached TextEdit 140 ms before the engine received the request$/.test(f)), row.outcome.findings.join('; '));
  assert.deepEqual(row.outcome.witness, {gaps: [], keyAt: row.outcome.receivedAt - 140, beforeReceipt: true});
  assert.equal(result.verdict, 'fail');
  assert.doesNotMatch(JSON.stringify(row.outcome.witness), /keycode|characters/);
});

test('#212 (ruling 1228): cua acting with the probe\'s key not shown before its receipt is invalid, never a failure; off a hosted runner the missing witness is named', async () => {
  const late = await savedWitnessed({keyAt: receivedAt => receivedAt + 10});
  assert.deepEqual([late.row.ok, late.row.attempts], [false, 1]);
  assert.match(late.row.invalid, /^cua acted, and the witness does not show the probe's key reaching TextEdit before the engine received the request \(its first key 10 ms after the receipt\)$/);
  assert.equal(late.result.verdict, 'no-verdict');
  const unseen = await savedWitnessed({keyAt: null});
  assert.match(unseen.row.invalid, /\(the probe's key was not seen on TextEdit's pid\)$/);
  const off = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', cell: saveCells({act: saveActed})});
  assert.match(rowOf(off.result, SAVE_SHEET).invalid, /witness tap.*off a GitHub-hosted runner/);
});

// m1 of the cell review: only a set_value that returned, or stopped part-way, acted; any other throw is no answer of
// the gate's, so it is invalid and named, never judged by the witness.
test('#212 (ruling 1228): a cua set_value that threw neither a refusal nor a stop did not act: invalid, the throw named, even with the witness against it', async () => {
  const {row, result} = await savedWitnessed({act: c => saveAct(c, {threw: 'the element is not settable', interruption: null}), keyAt: receivedAt => receivedAt - 140});
  assert.deepEqual([row.ok, row.outcome.refused, row.outcome.stopped], [false, false, false]);
  assert.equal(row.invalid, 'set_value threw Error, neither a refusal nor a stop part-way: the element is not settable');
  assert.equal(row.outcome.witness, undefined, 'no witness asked of a row that did not act');
  assert.equal(result.verdict, 'no-verdict');
});

test('#212 (ruling 1228): the vendor passes on nothing saved and fails on a save, whatever its answer and with no witness asked', async () => {
  const kept = await runWith({engine: 'vendor', plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', cell: saveCells({act: c => ({...saveActed(c), _meta: {}})})});
  const row = rowOf(kept.result, SAVE_SHEET);
  assert.deepEqual([row.engine, row.ok, row.invalid, row.outcome.probeBeforeMs, row.outcome.receivedAt], ['vendor', true, undefined, SAVE_SHEET_PROBE_BEFORE_MS, null]);
  const gone = await runWith({engine: 'vendor', plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet',
    cell: saveCells({act: c => ({...saveActed(c), _meta: {}}), check: {sheetOpen: false, nameWritten: false, destinationFiles: []}})});
  assert.deepEqual([rowOf(gone.result, SAVE_SHEET).ok, rowOf(gone.result, SAVE_SHEET).invalid], [false, undefined]);
  assert.equal(gone.result.verdict, 'fail');
});

test('#212 (ruling 1228): what may have taken effect is asked only of a stop part-way', async () => {
  const bare = `${REFUSED}${USER_CHANGED}${TEXTEDIT}'. Re-query the latest state with \`get_app_state\` before sending more actions. The action was stopped part-way.`;
  const stopped = await savedWitnessed({act: c => saveAct(c, {threw: bare}), keyAt: receivedAt => receivedAt - 140});
  assert.deepEqual([stopped.row.outcome.stopped, stopped.row.outcome.effectsNamed], [true, false]);
  assert.ok(stopped.row.outcome.findings.includes('the stop part-way did not name what may have taken effect'));
  const refused = await runWith({plan: planOf('intervention-save-sheet'), cellName: 'intervention-save-sheet', cell: saveCells({act: saveRefused})});
  assert.ok(!rowOf(refused.result, SAVE_SHEET).outcome.findings.some(f => /taken effect/.test(f)));
});
