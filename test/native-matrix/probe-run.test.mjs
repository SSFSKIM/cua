// The probe cells in a matrix run (scripts/native-matrix/probe-run.mjs; the spec's Verification system part 5) against
// the run's doubles: the input source saved, set and restored around them; the probe scheduled on the run's own window
// and awaited after the act it falls inside; a sample valid only when the post falls inside the action's interval (or,
// for the pre-action refusal, before a receipt within the debounce), retried from its own times, else invalid; the
// debounce waited out before the run drives a scene the probe typed into; and each cell's judgment.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {sha256Hex} from '../../scripts/native-matrix/matrix-text.mjs';
import {PRE_ACTION_DELAY_MS, PRE_MS, PROBE_ATTEMPTS, STILL_INTERACTING, USER_CHANGED} from '../../scripts/native-matrix/probe-plan.mjs';
import {planOf} from '../../scripts/native-matrix/run.mjs';
import {matrixSteps, names, runWith, stopWith} from './run-doubles.mjs';

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
  assert.deepEqual(sourceSteps(steps), ['save', 'per-context off', 'select com.apple.keylayout.ABC', 'restore']);
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
    cell: c => (tagOf(c) === 'intervention.act' ? acted(c, {threw: `${USER_CHANGED}x'. Re-query`, errorName: 'userIntervened'})
      : tagOf(c) === 'intervention.next' ? {...acted(c), threw: true, errorName: 'userIntervened', message: `${USER_CHANGED}x'.`}
        : tagOf(c) === 'preaction.act' ? acted(c, {threw: `${STILL_INTERACTING}x'. Wait`, errorName: 'userIntervened', interval: null}) : null)});
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
    cell: c => (tagOf(c) === 'intervention.act' ? acted(c, {threw: `${USER_CHANGED}/x'. Re-query`, errorName: 'userIntervened', meta: {'cua/entered': 12}})
      : tagOf(c) === 'intervention.next' ? {...acted(c), threw: true, errorName: 'userIntervened', message: `${USER_CHANGED}/x'.`} : null)});
  const row = rowOf(result, 'textedit/intervention.fires');
  assert.equal(row.ok, true, JSON.stringify(row));
  assert.deepEqual({fired: row.outcome.fired, entered: row.outcome.entered, refusedNext: row.outcome.refusedNext, nothingPosted: row.outcome.nothingPosted, againLanded: row.outcome.againLanded},
    {fired: true, entered: 12, refusedNext: true, nothingPosted: true, againLanded: true});
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
  const refused = (c, offset) => acted(c, {threw: `${STILL_INTERACTING}/x'. Wait 5 seconds and retry.`, errorName: 'userIntervened', interval: null,
    meta: {'cua/receivedAt': atOf(c) - PRE_ACTION_DELAY_MS + offset}});
  const {result} = await runWith({plan: planOf('pre-action-refusal'), cellName: 'pre-action-refusal', cell: c => (tagOf(c) === 'preaction.act' ? refused(c, 160) : null)});
  const row = rowOf(result, 'textedit/intervention.preAction');
  assert.deepEqual([row.ok, row.outcome.refused, row.outcome.nothingPosted, row.outcome.receiptAfterPostMs], [true, true, true, 160]);
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

// The sheet variant's two acts, each its own call with its own meta: super+w at `at` (its interval `[from, to]` relative
// to `at`), then the follow-up click on the sheet at `followAt` (received `receipt` ms after it).
const opening = (c, {interval = [50, 150], route = "2'", over = {}} = {}) => ({...acted(c, {interval}), actMs: 120, endAt: atOf(c) + 200,
  _meta: {...acted(c, {interval})._meta, 'cua/inputRoute': route}, ...over});
const followUp = (c, {receipt = 10, route = "2'", over = {}} = {}) => ({opened: true, clicked: true, clickAt: followOf(c), endAt: followOf(c) + 50, threw: false, errorName: null, message: null,
  _meta: {'cua/receivedAt': followOf(c) + receipt, 'cua/inputRoute': route}, ...over});
const sheetCells = ({open = opening, follow = followUp} = {}) => c => (tagOf(c) === 'sheet.open' ? open(c) : tagOf(c) === 'sheet.follow' ? follow(c) : null);
const SHEET = 'textedit/concurrent.sheet@electron';

test('the sheet variant: super+w on TextEdit\'s dirty untitled document as its own action, the keystroke into the Electron field inside its interval, the follow-up not refused, the oracle judging the row', async () => {
  const calls = [];
  const {result, steps} = await runWith({plan: planOf('concurrent-use-sheet'), cellName: 'concurrent-use-sheet', calls, cell: sheetCells()});
  const row = rowOf(result, SHEET);
  assert.deepEqual([row.ok, row.invalid, row.attempts, row.outcome.sheetOpened, row.outcome.followUpRefused, row.outcome.userLanded], [true, undefined, 1, true, false, true]);
  assert.deepEqual([row.outcome.intervalSource, row.outcome.postOffsetMs], ['engine', 100 - 50]);
  assert.equal(row.interference.ok, true, 'the oracle judged the row');
  assert.deepEqual(row.inputRoutes, {opening: "2'", followUp: "2'"});
  const open = calls.find(c => tagOf(c.code) === 'sheet.open'), follow = calls.find(c => tagOf(c.code) === 'sheet.follow');
  assert.match(open.code, /__app\.pressKey\("super\+w"\)/);
  assert.doesNotMatch(open.code, /click/, 'the opening call holds only the opening action, so its meta is its own');
  assert.ok(follow.at[0] >= open.at[1], 'the follow-up is its own call, after');
  assert.ok(matrixSteps(steps, 'probe')[0].includes('keystroke'));
  // A refused follow-up fails the row, and the untitled document's cleanup closes the sheet before the run goes on.
  const refusedCalls = [];
  const refused = await runWith({plan: planOf('concurrent-use-sheet'), cellName: 'concurrent-use-sheet', calls: refusedCalls,
    cell: c => (tagOf(c) === 'sheet.follow' ? followUp(c, {over: {threw: true, errorName: 'userIntervened', message: `${STILL_INTERACTING}/x'.`}})
      : tagOf(c) === 'sheet.check' ? {closed: false, sceneInFront: false} : sheetCells()(c))});
  const failed = rowOf(refused.result, SHEET);
  assert.deepEqual([failed.ok, failed.outcome.followUpRefused], [false, true]);
  assert.ok(refusedCalls.some(c => tagOf(c.code) === 'sheet.cleanup'));
});

test('the sheet variant: a post outside the opening action\'s own interval is retried at its middle; none measured is no verdict; a follow-up received past the debounce is invalid', async () => {
  // super+w posted 0..50 ms after its time, the post at 100: outside, then aimed at 25.
  const narrow = await runWith({plan: planOf('concurrent-use-sheet'), cellName: 'concurrent-use-sheet', cell: sheetCells({open: c => opening(c, {interval: [0, 50]})})});
  const row = rowOf(narrow.result, SHEET);
  assert.deepEqual([row.attempts, row.ok, row.invalid], [2, true, undefined]);
  assert.match(row.outcome.retries[0], /after the action's interval/);
  const none = await runWith({plan: planOf('concurrent-use-sheet'), cellName: 'concurrent-use-sheet', cell: sheetCells({open: c => opening(c, {interval: null})})});
  const invalid = rowOf(none.result, SHEET);
  assert.equal(invalid.attempts, PROBE_ATTEMPTS);
  assert.match(invalid.invalid, /reported no interval/);
  assert.equal(none.result.verdict, 'no-verdict');
  const late = await runWith({plan: planOf('concurrent-use-sheet'), cellName: 'concurrent-use-sheet', cell: sheetCells({follow: c => followUp(c, {receipt: 6_000})})});
  assert.match(rowOf(late.result, SHEET).invalid, /past the 5000 ms debounce/);
  // The opening refused as the user's intervention, inside its interval: no sheet, nothing to follow up, the dirty
  // untitled document still TextEdit's front window. The row fails, and the untitled document's own cleanup closes it.
  const firedCalls = [];
  const fired = await runWith({plan: planOf('concurrent-use-sheet'), cellName: 'concurrent-use-sheet', calls: firedCalls,
    cell: c => (tagOf(c) === 'sheet.check' ? {closed: true, sceneInFront: false}
      : sheetCells({open: c2 => opening(c2, {over: {threw: true, errorName: 'userIntervened', message: `${USER_CHANGED}/x'.`}}),
        follow: c2 => ({...followUp(c2, {over: {opened: false, clicked: false}}), _meta: {}})})(c))});
  assert.equal(fired.result.rows.length, 1, JSON.stringify(fired.result.problems));
  const refusedOpening = rowOf(fired.result, SHEET);
  assert.deepEqual([refusedOpening.ok, refusedOpening.invalid, refusedOpening.outcome.openingThrew, refusedOpening.outcome.sheetOpened], [false, undefined, true, false]);
  assert.ok(firedCalls.some(c => tagOf(c.code) === 'sheet.cleanup'), 'the untitled document closed by its own cleanup');
  assert.equal(fired.result.complete, true, JSON.stringify(fired.result.problems));
});

test('the sheet variant\'s oracle: a transient focus steal during the opening action, or an unaccepted route 4 on either action, fails its interference', async () => {
  const calls = [];
  const stolen = await runWith({plan: planOf('concurrent-use-sheet'), cellName: 'concurrent-use-sheet', calls, cell: sheetCells(),
    ops: stopWith(() => ({activations: [{kind: 'activated', bundleId: 'com.apple.TextEdit', scene: true, at: calls.find(c => tagOf(c.code) === 'sheet.open').at[0] + 1}]}))});
  const row = rowOf(stolen.result, SHEET);
  assert.deepEqual([row.ok, row.interference.ok, row.interference.activations], [true, false, 1]);
  const route4 = await runWith({plan: planOf('concurrent-use-sheet'), cellName: 'concurrent-use-sheet', cell: sheetCells({follow: c => followUp(c, {route: 4})})});
  const r4 = rowOf(route4.result, SHEET);
  assert.deepEqual([r4.interference.ok, r4.interference.route4], [false, true]);
  assert.deepEqual(r4.inputRoutes, {opening: "2'", followUp: 4});
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
