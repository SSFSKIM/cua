// #187's judge replay before READY (~/.local/share/187/next-slot-plan.md section D, with its RULINGS 2): the isolating
// slot's judge (./item-187-isolate.mjs: repPremise, rowPremise, cellOutcome, rowOutcome, partVerdict) run over the
// records of the second re-slot of 2026-11-05 (item-187-reslot2/), as they are and under named mutations, so every
// predicate is shown coming out each way it can; and C2's and C3's judges (./item-187-join.mjs) over synthetic fixtures
// built from the shapes they read, since 11-05 ran neither. Each case states its edit and its expected outcome; the
// replay fails when any outcome differs.
//
// How the replay reads 11-05's records (its adaptation, said in the output):
// - Attestation. 11-05's results carry no `cua/nativeEngine` (the kit did not keep it then). Only where a result has
//   none, each half is attested by a labelled stand-in, the slot's own recorded build: AFTER by 187-place's preflight reading of the engine, BEFORE by 187-putback's reading
//   of the restored save (dd7a). BEFORE is given the control's variant as a stand-in: dd7a is not the control build, but
//   like it posts no inert click. A recorded identity is never replaced: one that conflicts with its half is not attested.
// - BEFORE's click kind. dd7a predates `activationClickKind`; its background paste skipped the activation-point click
//   (outsideFrame) and posted no inert click, so the replay reads it as `skipped controlBuild`.
// - Full halves. 11-05 ran 3 repetitions a half; a case that needs the slot's 6 counts each real repetition twice, and
//   says so. Composing ran on the shipping build only; its BEFORE rows are the same 9 paste rows edited to a read-stage
//   timeout with the control's click kind, and say so.
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {attestProblem, BAR, CLICK_KIND, cellOutcome, partVerdict, repPremise, rowOutcome, rowPremise, VARIANTS} from './item-187-isolate.mjs';
import {ITEMS_JOIN, JOIN_REPS, joinRecord, judgeJoin} from './item-187-join.mjs';
import {lastAttempt} from './item-187.mjs';
import {SCENES} from '../repl-parity/scenes-mac.mjs';

export const RECORDS = fileURLToPath(new URL('../../docs/evidence/2026-10-30-macos-agent-cursor/item-187-reslot2/', import.meta.url));
export const REPLAY_FILE = fileURLToPath(new URL('../../docs/evidence/2026-10-30-macos-agent-cursor/item-187-isolate-replay.md', import.meta.url));

const clone = v => structuredClone(v);
const readItems = dir => Object.fromEntries(readdirSync(dir).map(f => f.match(/^item-(187-[\w-]+)\.jsonl$/)?.[1]).filter(Boolean)
  .map(name => [name, lastAttempt(readFileSync(join(dir, `item-${name}.jsonl`), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)))]));
const task = (rows, t) => rows?.findLast(r => r.kind === 'task' && r.task === t)?.result ?? null;

// The slot's records, read for the replay: each half's 3 repetitions (their '187-cell' records), the 9 composing paste
// rows, and each half's recorded build.
export function realRecords(dir = RECORDS) {
  if (!existsSync(dir)) throw new Error(`${dir} does not exist`);
  const items = readItems(dir);
  const reps = half => [0, 1, 2].map(n => task(items[`187-cell-${half}-${n}`], '187-cell')).filter(Boolean);
  const composing = (items['187-chrome-composing'] ?? []).filter(r => r.kind === 'task' && r.task === '187-row' && r.result?.method === 'paste').map(r => r.result);
  return {builds: {after: task(items['187-place'], '187-preflight')?.engine?.build ?? null, before: task(items['187-putback'], '187-putback')?.current?.build ?? null},
    reps: {after: reps('after'), before: reps('before')}, composing};
}

// ---- the adaptation and the edits ----------------------------------------------------------------------------------

const nativeOf = (builds, half) => ({engine: 'cua', build: builds[half], ...(VARIANTS[half] ? {variant: VARIANTS[half]} : {})});
// A row given the half's labelled stand-in attestation only where the record carries no identity (a recorded one is kept,
// so one that conflicts with its half is judged not attested), and, on BEFORE where it has none, the control's click kind.
const adaptRow = (row, half, builds, {click = true} = {}) => (!row ? row : {...row, nativeEngine: row.nativeEngine ?? nativeOf(builds, half),
  ...(click && half === 'before' && row.activationClickKind == null ? {activationClickKind: {...CLICK_KIND.before}} : {})});
export const adaptRep = (rec, half, builds) => ({...rec, background: adaptRow(rec.background, half, builds), row: adaptRow(rec.row, half, builds, {click: false})});
export const adaptComposing = (row, half, builds) => adaptRow(row, half, builds);

// A paste's outcome edited: delivered, a read-stage timeout, or a timeout at the effect stage, each with its stage meta.
const asDelivered = r => ({...r, delivered: true, readBack: {exact: true, length: r.expectedLength}, threw: false, error: null,
  paste: {...(r.paste ?? {}), stage: 'effect', readWait: 'handedOver', effectWait: 'reading', confirmed: true}});
const asReadTimeout = r => ({...r, delivered: false, readBack: {exact: false, length: 0}, threw: true, paste: {...(r.paste ?? {}), stage: 'read', readWait: 'timeout', confirmed: null}});
const asEffectTimeout = r => ({...r, delivered: false, readBack: {exact: false, length: 0}, threw: true, paste: {...(r.paste ?? {}), stage: 'effect', readWait: 'handedOver', effectWait: 'timeout', confirmed: false}});
const bg = f => rec => ({...rec, background: f(rec.background)});
const fg = f => rec => ({...rec, row: f(rec.row)});
const both = (...fs) => rec => fs.reduce((r, f) => f(r), rec);
const withNative = native => r => ({...r, nativeEngine: native});
const withKind = kind => r => ({...r, activationClickKind: kind});
const withClick = click => r => ({...r, activationClick: click});

// ---- C2 and C3's synthetic fixtures (./item-187-join.mjs's shapes, as its tests build them) ---------------------------

const T = 1_000_000, PIDS = {chrome: 201, textedit: 202, electron: 203}, Z = {windowFocus: 0, windowBlur: 0, textFocus: 0, textBlur: 0, mousedown: 0, click: 0};
const SYNTH_NATIVE = {engine: 'cua', version: '0.1.0', build: 'a'.repeat(64)};
const synthAttest = native => attestProblem(native, {build: SYNTH_NATIVE.build, variant: null});
const KEY = (frontmost = false) => ({trusted: true, ok: true, frontmost, found: true, focused: false, main: true, focusedWindow: 'run', mainWindow: 'run'});
const page = (seq, counts, focused) => ({seq, counts: {...Z, ...counts}, focused});
const answer = meta => ({ok: true, value: {sent: true, threw: false, message: null}, route: 3, nativeEngine: SYNTH_NATIVE, meta});
const holder = () => answer({activationJoin: 'fresh', activationClickKind: {kind: 'inertOutside', point: 'offset', when: 'early'}, activationGuardMs: 40});
const click = () => answer({activationJoin: 'rearmed', activationClickKind: {kind: 'action', when: 'consumedByAction'}, activationGuardMs: 45,
  delivery: {restores: 0, raiseLeft: false, repairedAfterRelease: false, capped: false, holdStartedAt: T + 500, releasedAt: T + 560, postedAt: T + 510}, actionInterval: {startedAt: T + 505}});
const later = () => ({ok: true, value: {inFront: true}, meta: {}});
const run = (changes = []) => ({start: {state: 'front-above', at: T - 100}, changes, end: null});
const STOP = {ok: true, maxGapMs: 9, raises: 0};
function raiseFixture(rep, {changes = []} = {}) {
  return joinRecord({kind: 'raise', tag: `${ITEMS_JOIN.raise(rep)}#0`, rep, holder: holder(), click: click(), later: later(),
    reads: {before: {at: T, front: PIDS.textedit, page: page(1, {}, false), key: KEY()},
      keys: {at: T + 300, front: PIDS.textedit, page: page(3, {windowFocus: 1, windowBlur: 1, textBlur: 1}, false), key: KEY()},
      after: {at: T + 2000, front: PIDS.textedit, page: page(6, {windowFocus: 2, windowBlur: 1, textFocus: 1, textBlur: 1, mousedown: 1, click: 1}, true), key: KEY()}},
    run: run(changes), activations: [], scenePids: Object.values(PIDS), texteditPid: PIDS.textedit});
}
function dialogFixture(rep, {stillFocused = false} = {}) {
  return joinRecord({kind: 'dialog', tag: `${ITEMS_JOIN.dialog(rep)}#0`, rep, holder: holder(), click: click(), later: later(),
    reads: {before: {at: T, front: PIDS.textedit, page: page(2, {windowFocus: 1, windowBlur: 1}, false), key: KEY()},
      keys: {at: T + 300, front: PIDS.textedit, page: page(2, {windowFocus: 1, windowBlur: 1}, false), key: KEY()},
      held: {at: T + 1800, front: PIDS.textedit, page: page(3, {windowFocus: 2, windowBlur: 1}, true), key: KEY(true)},
      released: {at: T + 2100, front: PIDS.textedit, page: stillFocused ? page(4, {windowFocus: 2, windowBlur: 1}, true) : page(4, {windowFocus: 2, windowBlur: 2}, false), key: KEY(false), settledMs: 120, polls: 2}},
    run: run(), activations: [{kind: 'activated', bundleId: SCENES.chrome.bundleId, at: T - 50}], scenePids: Object.values(PIDS), texteditPid: PIDS.textedit,
    popup: {number: 555, bounds: {x: 64, y: 200, width: 360, height: 240}, ms: 900, chromeFront: true}, gone: {gone: true, ms: 80}});
}
const joinItems = (kind, make) => Object.fromEntries(Array.from({length: JOIN_REPS}, (_, n) => [ITEMS_JOIN[kind](n),
  [{kind: 'start', at: T - 5000}, {kind: 'task', task: '187-join-record', result: make(n)}, {kind: 'task', task: '187-order-stop', result: STOP}]]));

// ---- the cases -----------------------------------------------------------------------------------------------------

const premiseText = ([status, why]) => (status === 'counted' ? 'counted' : `${status}${why ? ` (${why})` : ''}`);
const statusOf = ([status]) => status;
// A cell repetition's outcome on its half, in words: AFTER met or missed (and a read timeout); BEFORE met, delivered,
// failed at another stage, or stage unknown.
function outcomeWord(o, half) {
  if (half === 'after') return o.readTimeout ? 'read-stage timeout' : o.met ? 'AFTER-passing' : 'missed';
  return o.met ? 'BEFORE met (read timeout)' : o.delivers ? 'delivered' : o.otherStage ? 'failed at another stage' : o.stageUnknown ? 'stage unknown' : 'missed';
}
const counted = (entries, half, outcome) => entries.map(([record, status]) => ({counted: status === 'counted', ...(status === 'counted' ? outcome(record, half) : {})}));

// Every predicate's cases over `real` (realRecords). -> [{predicate, cases: [{name, edit, expected, outcome, match}]}].
export function replayCases(real = realRecords()) {
  const {builds} = real;
  const A = real.reps.after.map(r => adaptRep(r, 'after', builds)), B = real.reps.before.map(r => adaptRep(r, 'before', builds));
  const prem = (rec, half) => repPremise(rec, {half, build: builds[half]});
  const cellPart = (after, before) => {
    const entries = (list, half) => list.map(rec => [rec, statusOf(prem(rec, half))]);
    return partVerdict({after: counted(entries(after, 'after'), 'after', cellOutcome), before: counted(entries(before, 'before'), 'before', cellOutcome)}, BAR.cell);
  };
  const twice = list => [...list, ...list.map(clone)];
  const at = (list, k, f) => list.map((r, i) => (i === k ? f(r) : r));
  const atAll = (list, ks, f) => list.map((r, i) => (ks.includes(i) ? f(r) : r));
  const readB = B.map(bg(asReadTimeout));  // BEFORE's background pastes given stage meta read
  const verdictWord = v => `${v.verdict}${v.why.length ? `: ${v.why.join('; ')}` : ''}`;
  const sections = [];
  // A case: [name, edit, expected, outcome, because]: the outcome is the expected one, and, where `because` is given,
  // for that reason (its text in the outcome's why).
  const section = (predicate, cases) => sections.push({predicate, cases: cases.map(([name, edit, expected, outcome, because = null]) => ({name, edit,
    expected: because ? `${expected} (${because})` : expected, outcome,
    match: (outcome === expected || (typeof outcome === 'string' && (outcome.startsWith(`${expected}:`) || outcome.startsWith(`${expected} (`)))) && (!because || String(outcome).includes(because))}))});

  section('the premise per repetition (repPremise)', [
    ...A.map((r, k) => [`11-05 AFTER rep ${k + 1}`, 'none (the adaptation only)', 'counted', premiseText(prem(r, 'after'))]),
    ...B.map((r, k) => [`11-05 BEFORE rep ${k + 1}`, 'none (the adaptation only)', 'counted', premiseText(prem(r, 'before'))]),
    ['AFTER rep 1 as recorded', 'no adaptation: no cua/nativeEngine, as 11-05 kept it', 'not attested', statusOf(prem(real.reps.after[0], 'after'))],
    ['AFTER rep 1 answered by the control', 'its pastes\' nativeEngine given the control\'s variant', 'not attested', statusOf(prem(both(bg(withNative(nativeOf(builds, 'before'))), fg(withNative(nativeOf(builds, 'before'))))(A[0]), 'after'))],
    ['BEFORE rep 1 with no variant', 'its background paste\'s nativeEngine without the control\'s variant', 'not attested', statusOf(prem(bg(withNative({engine: 'cua', build: builds.before}))(B[0]), 'before'))],
    ['AFTER rep 1 with the control\'s click kind', 'its background paste\'s activationClickKind skipped controlBuild', 'premise not met', statusOf(prem(bg(withKind({...CLICK_KIND.before}))(A[0]), 'after'))],
    ['BEFORE rep 1 with an inert click', 'its background paste\'s activationClickKind inertOutside early', 'premise not met', statusOf(prem(bg(withKind({kind: 'inertOutside', point: 'activationPoint', when: 'early'}))(B[0]), 'before'))],
    ['AFTER rep 1 clicking at its activation point', 'its background paste\'s activationClick posted', 'premise not met', statusOf(prem(bg(withClick('posted'))(A[0]), 'after'))],
  ]);
  // The recorded identity, apart from the mutations above (which edit the adapted record): the stand-in fills only a
  // missing identity, and a recorded one that conflicts with its half stays and is judged.
  const recorded = native => rec => ({...rec, background: rec.background && {...rec.background, nativeEngine: native}, row: rec.row && {...rec.row, nativeEngine: native}});
  const recordedPrem = (raw, half, native) => premiseText(prem(adaptRep(recorded(native)(raw), half, builds), half));
  section('the recorded identity (adaptRep: the stand-in only where a result names none)', [
    ['11-05 BEFORE rep 1 recorded with the shipping identity', 'the raw record\'s pastes carry AFTER\'s nativeEngine, then adapted', 'not attested', recordedPrem(real.reps.before[0], 'before', nativeOf(builds, 'after')), 'build was'],
    ['11-05 AFTER rep 1 recorded with the control\'s identity', 'the raw record\'s pastes carry the control\'s nativeEngine, then adapted', 'not attested', recordedPrem(real.reps.after[0], 'after', {...nativeOf(builds, 'after'), variant: VARIANTS.before}), 'variant was control-no-inert-click'],
    ['11-05 AFTER rep 1 recorded with its own identity', 'the raw record\'s pastes carry the slot\'s AFTER build, then adapted', 'counted', recordedPrem(real.reps.after[0], 'after', nativeOf(builds, 'after'))],
    ['11-05 composing row 1 recorded with the control\'s identity', 'the raw row carries the control\'s nativeEngine, then adapted', 'not attested',
      premiseText(rowPremise(adaptComposing({...real.composing[0], nativeEngine: nativeOf(builds, 'before')}, 'after', builds), {half: 'after', build: builds.after})), 'not the half'],
  ]);
  section('the cell repetition\'s outcome (cellOutcome)', [
    ...A.map((r, k) => [`11-05 AFTER rep ${k + 1}`, 'none', 'AFTER-passing', outcomeWord(cellOutcome(r, 'after'), 'after')]),
    ...B.map((r, k) => [`11-05 BEFORE rep ${k + 1}`, 'none: dd7a\'s legacy -10005, no stage meta', 'stage unknown', outcomeWord(cellOutcome(r, 'before'), 'before')]),
    ['BEFORE rep 1 with stage meta read', 'its background paste given stage read, readWait timeout', 'BEFORE met (read timeout)', outcomeWord(cellOutcome(bg(asReadTimeout)(B[0]), 'before'), 'before')],
    ['BEFORE rep 1 delivered', 'its background paste delivered', 'delivered', outcomeWord(cellOutcome(bg(asDelivered)(B[0]), 'before'), 'before')],
    ['BEFORE rep 1 at the effect stage', 'its background paste given stage effect, effectWait timeout', 'failed at another stage', outcomeWord(cellOutcome(bg(asEffectTimeout)(B[0]), 'before'), 'before')],
    ['AFTER rep 1 with a read timeout', 'its frontmost paste given stage read, readWait timeout', 'read-stage timeout', outcomeWord(cellOutcome(fg(asReadTimeout)(A[0]), 'after'), 'after')],
    ['AFTER rep 1 missing otherwise', 'its frontmost paste given stage effect, effectWait timeout', 'missed', outcomeWord(cellOutcome(fg(asEffectTimeout)(A[0]), 'after'), 'after')],
  ]);
  const six = {A: twice(A), B: twice(readB)};
  section('the cell\'s verdict (partVerdict, BAR.cell: at least 5 counted each way)', [
    ['11-05 as recorded', 'none: AFTER 3, BEFORE 3 (stage unknown)', 'INCONCLUSIVE', verdictWord(cellPart(A, B)), 'fewer than 4 counted'],
    ['11-05 with BEFORE\'s stage read', 'every BEFORE background paste given stage read', 'INCONCLUSIVE', verdictWord(cellPart(A, readB)), 'fewer than 4 counted'],
    ['six a half, as predicted', 'each real repetition counted twice; BEFORE\'s stage read', 'LANDS', verdictWord(cellPart(six.A, six.B))],
    ['six a half, AFTER\'s one allowed miss', 'as above, AFTER rep 2\'s frontmost paste at the effect stage', 'LANDS', verdictWord(cellPart(at(six.A, 1, fg(asEffectTimeout)), six.B))],
    ['ruling 2: six a half, one AFTER read timeout', 'as above, AFTER rep 2\'s frontmost paste at a read timeout', 'DOES NOT LAND', verdictWord(cellPart(at(six.A, 1, fg(asReadTimeout)), six.B)), 'read-stage timeout'],
    ['ruling 2 at a low count: 11-05, one AFTER read timeout', 'AFTER rep 1\'s background paste at a read timeout; BEFORE as recorded', 'DOES NOT LAND', verdictWord(cellPart(at(A, 0, bg(asReadTimeout)), B)), 'read-stage timeout'],
    ['ruling 3 at a low count: 11-05, two BEFORE deliveries', 'BEFORE reps 1 and 2\'s background pastes delivered', 'DOES NOT LAND', verdictWord(cellPart(A, atAll(B, [0, 1], bg(asDelivered)))), 'BEFORE delivered in 2'],
    ['BEFORE\'s one allowed miss: one delivery', 'six a half; BEFORE rep 1\'s background paste delivered', 'LANDS', verdictWord(cellPart(six.A, at(six.B, 0, bg(asDelivered))))],
    ['two BEFORE misses, neither decisive', 'six a half; BEFORE rep 1 delivered, rep 2 at the effect stage', 'INCONCLUSIVE', verdictWord(cellPart(six.A, at(at(six.B, 0, bg(asDelivered)), 1, bg(asEffectTimeout)))), 'under 5'],
    ['two BEFORE failures at another stage', 'six a half; BEFORE reps 1 and 4 at the effect stage', 'DOES NOT LAND', verdictWord(cellPart(six.A, atAll(six.B, [0, 3], bg(asEffectTimeout)))), 'stage other than read in 2'],
    ['two AFTER misses', 'six a half; AFTER reps 1 and 4\'s frontmost pastes at the effect stage', 'DOES NOT LAND', verdictWord(cellPart(atAll(six.A, [0, 3], fg(asEffectTimeout)), six.B)), 'AFTER missed its delivery in 2'],
    ['premise failures to 3 counted', 'six a half; AFTER reps 1, 2, 3 posting their activation click', 'INCONCLUSIVE', verdictWord(cellPart(atAll(six.A, [0, 1, 2], bg(withClick('posted'))), six.B)), 'fewer than 4 counted'],
    ['ruling 1: premise failures to 4 counted', 'six a half; AFTER reps 1 and 2 posting their activation click (4 counted, all delivered)', 'INCONCLUSIVE', verdictWord(cellPart(atAll(six.A, [0, 1], bg(withClick('posted'))), six.B)), 'under 5'],
    ['ruling 1: premise failures to 5 counted', 'six a half; BEFORE rep 6 answered with no variant', 'LANDS', verdictWord(cellPart(six.A, at(six.B, 5, bg(withNative({engine: 'cua', build: builds.before})))))],
    ['the halves mismatched', 'six a half, the halves swapped: AFTER judged on BEFORE\'s records', 'INCONCLUSIVE', verdictWord(cellPart(six.B, six.A)), 'AFTER 0, BEFORE 0'],
  ]);

  // Composing: AFTER the 9 real paste rows; BEFORE the same rows edited to a read-stage timeout on the control.
  const CA = real.composing.map(r => adaptComposing(r, 'after', builds)), CB = real.composing.map(r => adaptComposing(withKind({...CLICK_KIND.before})(asReadTimeout(r)), 'before', builds));
  const compPart = (after, before) => {
    const entries = (list, half) => list.map(r => [r, statusOf(rowPremise(r, {half, build: builds[half]}))]);
    return partVerdict({after: counted(entries(after, 'after'), 'after', rowOutcome), before: counted(entries(before, 'before'), 'before', rowOutcome)}, BAR.composing);
  };
  const rowWord = (r, half) => { const o = rowOutcome(r, half); return half === 'after' ? (o.readTimeout ? 'read-stage timeout' : o.met ? 'AFTER-passing' : 'missed') : outcomeWord(o, half); };
  section('composing (rowPremise, rowOutcome, partVerdict, BAR.composing: at least 8 counted each way)', [
    ...CA.map(r => [`11-05 AFTER ${r.id}`, 'none (the adaptation only)', 'AFTER-passing', statusOf(rowPremise(r, {half: 'after', build: builds.after})) === 'counted' ? rowWord(r, 'after') : premiseText(rowPremise(r, {half: 'after', build: builds.after}))]),
    ['the base', 'BEFORE: the 9 rows given stage read, readWait timeout and the control\'s click kind (11-05 ran composing on the shipping build only)', 'LANDS', verdictWord(compPart(CA, CB))],
    ['AFTER\'s one allowed miss', 'AFTER row 1 at the effect stage', 'LANDS', verdictWord(compPart(at(CA, 0, asEffectTimeout), CB))],
    ['ruling 2: one AFTER read timeout', 'AFTER row 9 at a read timeout', 'DOES NOT LAND', verdictWord(compPart(at(CA, 8, asReadTimeout), CB)), 'read-stage timeout'],
    ['ruling 3: two BEFORE deliveries', 'BEFORE rows 1 and 2 delivered', 'DOES NOT LAND', verdictWord(compPart(CA, atAll(CB, [0, 1], asDelivered))), 'BEFORE delivered in 2'],
    ['ruling 3 at a low count: two BEFORE deliveries of 3 counted', 'BEFORE rows 4 to 9 with an inert click (not counted), rows 1 and 2 delivered', 'DOES NOT LAND',
      verdictWord(compPart(CA, atAll(atAll(CB, [3, 4, 5, 6, 7, 8], withKind({kind: 'inertOutside', point: 'activationPoint', when: 'early'})), [0, 1], asDelivered))), 'BEFORE delivered in 2'],
    ['two BEFORE failures at another stage', 'BEFORE rows 1 and 2 at the effect stage', 'DOES NOT LAND', verdictWord(compPart(CA, atAll(CB, [0, 1], asEffectTimeout))), 'stage other than read in 2'],
    ['premise failures to 3 counted', 'BEFORE rows 4 to 9 answered with no variant', 'INCONCLUSIVE', verdictWord(compPart(CA, atAll(CB, [3, 4, 5, 6, 7, 8], withNative({engine: 'cua', build: builds.before})))), 'fewer than 4 counted'],
    ['ruling 1: premise failures to 7 counted', 'AFTER rows 1 and 2 posting their activation click', 'INCONCLUSIVE', verdictWord(compPart(atAll(CA, [0, 1], withClick('posted')), CB)), 'under 8'],
    ['ruling 1: premise failures to 8 counted', 'AFTER row 1 posting its activation click', 'LANDS', verdictWord(compPart(at(CA, 0, withClick('posted')), CB))],
  ]);

  // C2 and C3, synthetic.
  const joinWord = part => `${part.verdict}${part.why?.length ? `: ${part.why.join('; ')}` : ''}`;
  const raise = changes => judgeJoin('raise', joinItems('raise', n => raiseFixture(n, n === 1 ? {changes} : {})), {attest: synthAttest});
  const dialog = still => judgeJoin('dialog', joinItems('dialog', n => dialogFixture(n, {stillFocused: still && n === 1})), {attest: synthAttest});
  section('C2, the keys-then-click row (judgeJoin raise; synthetic fixtures, 11-05 ran none)', [
    ['the passing case', 'synthetic: 3 repetitions, every condition holding', 'PASS', joinWord(raise([]))],
    ['a raise sample', 'synthetic: repetition 2\'s order watcher sees Chrome above TextEdit 10 ms after the click', 'FAIL',
      joinWord(raise([{at: T + 520, prev: T + 515, state: 'back-above'}, {at: T + 540, prev: T + 535, state: 'front-above'}])), 'not noRaise'],
  ]);
  section('C3, the dialog variant (judgeJoin dialog; synthetic fixtures, 11-05 ran none)', [
    ['the passing case', 'synthetic: 3 repetitions, every condition holding', 'PASS', joinWord(dialog(false))],
    ['hasFocus still true after the release', 'synthetic: repetition 2\'s page focused after the release, no blur', 'FAIL', joinWord(dialog(true)), 'not pageReleased'],
  ]);
  return sections;
}

const cellText = v => String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
// The replay's Markdown. -> {text, cases, mismatches}.
export function replayMarkdown(real = realRecords(), {commit = null} = {}) {
  const sections = replayCases(real), all = sections.flatMap(s => s.cases), mismatches = all.filter(c => !c.match);
  const lines = [`# #187: the isolating judge replayed on the second re-slot's records (scripts/cursor-sitting/isolate-replay.mjs${commit ? `, the kit at ${commit}` : ''})`, '',
    'Section D of the next slot\'s plan: the isolating slot\'s judge (`item-187-isolate.mjs`, with the design session\'s RULINGS 2 on its readings) run over `item-187-reslot2/`, as recorded and under named mutations, so each predicate is shown coming out each way. C2\'s and C3\'s judges run over synthetic fixtures. A case whose outcome differs from its expected one fails the replay.', '',
    `**${all.length} cases, ${all.length - mismatches.length} as expected${mismatches.length ? `, ${mismatches.length} NOT` : ''}.**`, '',
    '**How the replay reads 11-05\'s records** (its adaptation, applied to every real case):', '',
    `- **Attestation.** 11-05's results carry no \`cua/nativeEngine\`. Only where a result names none, a labelled stand-in attests each half by the slot's own recorded build: AFTER ${real.builds.after?.slice(0, 12) ?? 'unread'} (187-place's preflight reading), BEFORE ${real.builds.before?.slice(0, 12) ?? 'unread'} (187-putback's reading of the restored save, dd7a). BEFORE is given the control's variant (\`${VARIANTS.before}\`) as a stand-in: dd7a is not the control build, but like it posts no inert click. A recorded identity is never replaced: one that conflicts with its half is judged not attested (the recorded-identity table).`,
    '- **BEFORE\'s click kind.** dd7a predates `activationClickKind`. Its background paste skipped the activation-point click (outsideFrame) and posted no inert click, so the replay reads it as `skipped controlBuild`.',
    `- **Counts.** 11-05 ran ${real.reps.after.length} repetitions a half. A case marked "six a half" counts each real repetition twice. 11-05 ran composing on the shipping build only, so composing's BEFORE rows are its ${real.composing.length} paste rows edited to a read-stage timeout with the control's click kind.`, ''];
  for (const s of sections) {
    lines.push(`## ${s.predicate}`, '', '| case | edit | expected | outcome | as expected |', '|---|---|---|---|---|',
      ...s.cases.map(c => `| ${cellText(c.name)} | ${cellText(c.edit)} | ${cellText(c.expected)} | ${cellText(c.outcome)} | ${c.match ? 'yes' : '**NO**'} |`), '');
  }
  return {text: `${lines.join('\n')}`, cases: all.length, mismatches};
}
