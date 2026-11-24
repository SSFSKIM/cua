// R3's witness (ruling 1225): where the engine posted during the concurrent cells, read by the key-route tap app in its
// listen-only events mode (./key-route-device.mjs tap --mode events, ./key-route-tap.swift), which taps the user app's
// pid for the whole run. On a GitHub-hosted runner only, the app built and granted Input Monitoring by sitting C's
// witness-tap step (../hosted-sittings/witness-tap.mjs); anywhere else nothing is tapped and the missing witness is
// recorded (meta.witness), so a row R3 would decide is NO VERDICT (./oracle.mjs userAppWindow).
//
// The person's posts from the engine's: in a concurrent cell the simulated person (the keystroke probe, its own process
// launched from the engine bundle) types into the user app too, so a post to the user app's pid is told apart by the
// event's source pid (kCGEventSourceUnixProcessID, which the tap reads): the probe's pids, recorded as each probe starts
// (noteProbe), are the person's; the control helper's is the control's; any other source is counted the engine's,
// failing closed. That the source pid separates them is checked in every cell, not assumed: a cell where the probe's
// own typing was not seen under its pid is a gap, so the separation is proven where R3 rests on it.
//
// The positive control: once the run's cells are done, one modifier-free flagsChanged posted by the harness's helper
// (./witness-control.swift) to each tapped pid, in no judged cell; the tap must record it under that pid from the
// helper's pid, else every row's witness has a gap. Its result is kept on the run (meta.witness.controls).
//
// The judged window: from the act's start to the check's end. The attempt's prepare before it (the driven scene's, the
// user field emptied and focused) runs through the engine under test, whose focus click posts to the user app: what the
// tap saw there is recorded apart (`prepare`) and never judged.
//
// Privacy: these are CI artifacts of a public repository. A row records a post by its target pid, kind (keyDown, keyUp,
// flagsChanged, mouseDown, mouseUp, scrollWheel), source pid and time, so a failure can be checked against who posted
// and when; never a keycode or a character. The run keeps counts.
import {mark} from './steps.mjs';

// The time the control is given to reach the tap before it is told to stop.
export const CONTROL_SETTLE_MS = 500;

// One device command, its window the harness's (it intends no app). -> its answer, or {error} when it threw.
function device(ctx, name, argv) {
  try {
    const {answer, at} = ctx.ops.keyRoute([...argv, '--run', ctx.run]) ?? {};
    mark(ctx, 'harness', `witness:${name}`, at, []);
    return answer ?? null;
  } catch (error) { return {error: error.message}; }
}

// The tap started on `users` (the scenes whose pid R3's rows name as the user app's) before the run's cells, when the
// run is hosted and has such rows. Sets ctx.witness (the probes noted from then on), or meta.witness's missing witness.
export function startWitness(ctx, users) {
  if (!users.length) return;
  if (!ctx.meta.hosted) { ctx.meta.witness = {missing: 'off a GitHub-hosted runner: no witness tap (ruling 1225)'}; return; }
  const targets = users.map(scene => ({scene, pid: ctx.records[scene]?.pid ?? null}));
  const start = device(ctx, 'tap-start', ['tap', 'start', '--mode', 'events', ...targets.flatMap(t => ['--pid', `${t.scene}:${t.pid}`])]);
  ctx.witness = {targets, start, probePids: []};
}

// A keystroke probe's pid as it started (null when the device could not name it: its posts then stay unseparated).
export const noteProbe = (ctx, pid) => { ctx.witness?.probePids.push(Number.isSafeInteger(pid) ? pid : null); };

// The control posted and the tap stopped, after the run's cells, whatever stopped the run. Records meta.witness.
// -> {listenAccess, probePids, tap: {logRead, startedAt, stoppedAt, taps, disabled, events}, controls} for rowPosts, or
// null when no tap came up (its rows unwitnessed).
export async function finishWitness(ctx) {
  const w = ctx.witness;
  if (!w) return null;
  const start = w.start ?? {};
  const meta = {targets: w.targets, ready: start.ready === true, listenAccess: start.listenAccess === true, probes: w.probePids.length};
  if (!start.ready) {
    // A tap launched but not ready is stopped all the same.
    if (start.launched) device(ctx, 'tap-stop', ['tap', 'stop', '--mode', 'events']);
    ctx.meta.witness = {...meta, missing: `the witness tap did not come up: ${start.reason ?? start.error ?? start.refused ?? 'no readiness'}`};
    return null;
  }
  const posted = w.targets.map(t => ({scene: t.scene, pid: t.pid, answer: device(ctx, 'control', ['control', '--pid', String(t.pid)])}));
  await ctx.sleep(CONTROL_SETTLE_MS);
  const stop = device(ctx, 'tap-stop', ['tap', 'stop', '--mode', 'events']) ?? {};
  const tap = {logRead: stop.logRead === true, startedAt: stop.startedAt ?? start.startedAt ?? null, stoppedAt: stop.stoppedAt ?? null,
    // Both the start's and the stop's taps are the tap's own ready line; the start's stand when the log's were not read.
    taps: stop.taps?.length ? stop.taps : start.taps ?? [], disabled: stop.disabled ?? [], events: stop.events ?? []};
  const controls = posted.map(({scene, pid, answer}) => {
    const by = answer?.pid ?? null, at = answer?.at ?? null;
    const seen = answer?.posted === true && tap.events.some(e => e.tapPid === pid && e.kind === 'flagsChanged' && e.source === by && Number.isFinite(e.at) && e.at >= at);
    return {scene, pid, posted: answer?.posted === true, by, at, seen, ...(answer?.error || answer?.refused ? {error: answer.error ?? answer.refused} : {})};
  });
  ctx.meta.witness = {...meta, startedAt: tap.startedAt, stoppedAt: tap.stoppedAt, why: stop.why ?? null, killed: stop.killed === true, logRead: tap.logRead,
    taps: tap.taps, disabled: tap.disabled, events: tap.events.length, controls, ...(stop.error ? {error: stop.error} : {})};
  return {listenAccess: meta.listenAccess, probePids: w.probePids.filter(p => p !== null), tap, controls};
}

// One cell's posts to the user app's pid as the witness saw them over its judged window `at` [from, to] (the act's start
// to the check's end): `gaps` (what keeps the witness from deciding: coverage, the control, the person's posts not told
// from the engine's), `others` (posts by anyone but the probe and the control helper) and `probe` (the person's,
// counted); `prepare` [from, to) the attempt's prepare before it, whose posts by anyone but the probe are recorded and
// never judged. Each post as {target, kind, source, at}. -> {source: 'tap', gaps, others, prepare, probe}.
const postOf = ({target, kind, source, at}) => ({target, kind, source, at});
export function rowPosts(witness, {userPid, at, prepare = null}) {
  const {tap} = witness, gaps = [];
  if (!witness.listenAccess) gaps.push('the witness tap had no Input Monitoring access');
  if (!tap.taps.some(t => t.pid === userPid && t.created === true)) gaps.push(`no witness tap on the user app's pid (${userPid})`);
  if (!tap.logRead) gaps.push('the witness tap\'s record was not read');
  const [from, to] = Array.isArray(at) ? at : [null, null];
  if (from === null) gaps.push('the cell\'s span was not recorded');
  else {
    if (!Number.isFinite(tap.startedAt)) gaps.push('the witness tap\'s start was not recorded');
    else if (tap.startedAt > from) gaps.push('the witness tap started after the cell began');
    if (!Number.isFinite(tap.stoppedAt)) gaps.push('the witness tap\'s stop was not recorded');
    else if (tap.stoppedAt < to) gaps.push('the witness tap stopped before the cell ended');
    const off = tap.disabled.find(d => d.tapPid === userPid && d.at >= from && d.at <= to);
    if (off) gaps.push(`the witness tap was disabled in the cell (${off.why})`);
  }
  if (!witness.controls.some(c => c.pid === userPid && c.seen)) gaps.push('the positive control was not seen on the user app\'s pid');
  const inCell = from === null ? [] : tap.events.filter(e => e.tapPid === userPid && e.at >= from && e.at <= to);
  const helpers = witness.controls.map(c => c.by).filter(p => p !== null);
  const probe = inCell.filter(e => witness.probePids.includes(e.source)).length;
  if (from !== null && probe === 0) gaps.push('the probe\'s own typing was not seen under its pid in the cell: the engine\'s posts cannot be told from the person\'s');
  const notPerson = e => !witness.probePids.includes(e.source) && !helpers.includes(e.source);
  const others = inCell.filter(notPerson).map(postOf);
  const [pFrom, pTo] = Array.isArray(prepare) ? prepare : [null, null];
  const before = pFrom === null ? [] : tap.events.filter(e => e.tapPid === userPid && e.at >= pFrom && e.at < pTo && notPerson(e)).map(postOf);
  return {source: 'tap', gaps, others, prepare: before, probe};
}
