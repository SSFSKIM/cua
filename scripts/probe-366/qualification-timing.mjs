// The qualification's per-call wait (#366): how long the engine really spent in `prologue.chromiumReady`, the interval
// Methods.swift's execute prologue puts around the readiness gate (ChromiumReadiness.swift's awaitChromiumReadiness), read
// from the engine's own OS signposts and never inferred from the call's duration. A call's elapsed time carries the RPC,
// the walk and the action as well; the interval is the wait alone, begin to end, stamped by the engine in its own process.
//
// Capture is `log show`, once, after the measured trial ends (`captureWaitSignposts`, on cursor-sitting's
// `readEngineWindow`), never `log stream --signpost` while the calls run: a live stream makes every signpost cost its
// emitter about 80 us instead of 2 (signposts.mjs's header, measured on the MacBook), a load of the observer's own on
// the very thing being timed, and on a stressed runner it is the wrong kind of load to add. The store keeps its signposts
// for minutes under load, so the read follows the trial at once and its raw text is archived by the caller, which
// `attachWaits` then reads again from the same text.
//
// Pairing. Each begin and end carries the emitting process (`processID`), a `signpostID` (OSSignposter's makeSignpostID,
// unique within the process) and the interval's name; a pair is the one begin and the one end that share all three. The
// wait is the difference of their wall `timestamp`s (log's microseconds), not of the mach ticks, whose timebase this
// file would have to assume. The ids are 64-bit and JSON.parse would round them to a double, merging neighbours, so they
// are read from the line's text. Lines that are the same log record twice (the same mach tick, type, id, process: two
// overlapping reads) count once; a second begin or end under one id, at another tick, is a duplicate and unknown.
//
// Association with a call is by wall time: the pair must lie inside the call's [startedAt, endedAt] widened by
// MATCH_TOLERANCE_MS each way, the bound Date.now()'s whole milliseconds and the two clocks' offset allow. A call's
// wait is known only when exactly one clean pair lies inside it and nothing else of the interval touches it: a begin
// without its end, an end without its begin, a duplicate, a pair that starts or ends outside the call, a pair two calls
// both contain, an unreadable line that names the interval. Every other case is `missing` with waitMs null and a `waitWhy`,
// never 0, so an absent signpost cannot read as an instant gate. A wait of 0.02 ms that was measured is a number.
//
// The side matters. The fix (d94039ec) emits the interval on every input request and every get_app_state that names an
// app, near zero when no wait was owed; its calls need a valid pair. Main (c7eee724) has no readiness gate and no such
// signpost, so its calls are `main-no-gate` with a deliberate 0 ms, and if main's pid shows the interval anyway the run
// was not main and the call is `missing`.
import {logTimestampMs, readEngineWindow} from '../cursor-sitting/signposts.mjs';

export const WAIT_SIGNPOST = 'prologue.chromiumReady';
export const ENGINE_SUBSYSTEM = 'io.github.ssfskim.cua.engine';
export const MATCH_TOLERANCE_MS = 1;

const microseconds = ms => Math.round(ms * 1000) / 1000;

// One ndjson line as a begin or end of the wait interval of process `enginePid`, or why it is not one.
// -> null (not the interval's, or another process's), {unreadable: true}, or {key, type, ms, id, mach}.
function readLine(line, enginePid) {
  if (!line.startsWith('{')) return null;
  let e;
  try { e = JSON.parse(line); } catch { return line.includes(WAIT_SIGNPOST) ? {unreadable: true} : null; }
  if (e?.signpostName !== WAIT_SIGNPOST) return null;
  if (e.subsystem !== undefined && e.subsystem !== ENGINE_SUBSYSTEM) return null;
  if (e.signpostType !== 'begin' && e.signpostType !== 'end') return null;
  if (e.processID !== enginePid) return {otherProcess: true};
  const id = /"signpostID":\s*(-?\d+)/.exec(line)?.[1];
  const ms = logTimestampMs(e.timestamp);
  if (id === undefined || ms === null) return {unreadable: true};
  return {type: e.signpostType, ms, id, mach: e.machTimestamp ?? e.timestamp};
}

// The wait interval of process `enginePid` in `text` (log show's ndjson).
// -> {pairs: [{signpostID, beginMs, endMs, durationMs}], fragments: [{signpostID, kind, times}], unreadable, otherProcess}:
// `pairs` the clean begin+end couples (epoch ms, microseconds kept); `fragments` what is not one, kind unmatched-begin,
// unmatched-end, duplicate or inverted (an end before its begin), `times` every event's time; `unreadable` the lines that
// name the interval and cannot be placed; `otherProcess` the intervals of other processes, ignored.
export function waitIntervals(text, {enginePid}) {
  const groups = new Map(), seen = new Set();
  let unreadable = 0, otherProcess = 0;
  for (const line of String(text ?? '').split('\n')) {
    const read = readLine(line, enginePid);
    if (read === null) continue;
    if (read.unreadable) { unreadable++; continue; }
    if (read.otherProcess) { otherProcess++; continue; }
    const record = `${read.mach}|${read.id}|${read.type}`;
    if (seen.has(record)) continue;
    seen.add(record);
    const group = groups.get(read.id) ?? {begins: [], ends: []};
    group[read.type === 'begin' ? 'begins' : 'ends'].push(read.ms);
    groups.set(read.id, group);
  }
  const pairs = [], fragments = [];
  for (const [signpostID, {begins, ends}] of groups) {
    const times = [...begins, ...ends];
    if (begins.length === 1 && ends.length === 1 && ends[0] >= begins[0]) {
      pairs.push({signpostID, beginMs: begins[0], endMs: ends[0], durationMs: microseconds(ends[0] - begins[0])});
    } else {
      const kind = begins.length > 1 || ends.length > 1 ? 'duplicate' : !ends.length ? 'unmatched-begin' : !begins.length ? 'unmatched-end' : 'inverted';
      fragments.push({signpostID, kind, times});
    }
  }
  return {pairs, fragments, unreadable, otherProcess};
}

const interval = ({signpostID, beginMs, endMs, durationMs}) => ({signpostID, beginMs, endMs, durationMs});

// `calls` ({startedAt, endedAt} in epoch ms, as the probe's rpc records them) with the wait each really took, each a copy
// with `waitMs` (ms, null when unknown), `waitEvidence` (signpost | main-no-gate | missing) and, for the fix, `waitIntervals`
// (the pair or pairs found inside the call) and, when missing, `waitWhy`: invalid-call, unreadable-signpost, duplicate,
// incomplete, straddles-call, no-interval, ambiguous-call or main-emitted-gate. `signpostText` is `log show`'s ndjson for
// the engine; `enginePid` the process whose intervals count; `engineSide` 'fix' or 'main'.
export function attachWaits(calls, signpostText, {enginePid, engineSide, toleranceMs = MATCH_TOLERANCE_MS} = {}) {
  if (!Array.isArray(calls)) throw new TypeError('attachWaits: calls must be an array');
  if (engineSide !== 'fix' && engineSide !== 'main') throw new TypeError(`attachWaits: engineSide must be 'fix' or 'main', not ${engineSide}`);
  if (!Number.isInteger(enginePid) || enginePid <= 0) throw new TypeError(`attachWaits: enginePid must be a process id, not ${enginePid}`);
  const {pairs, fragments, unreadable} = waitIntervals(signpostText, {enginePid});
  const windows = calls.map(call => {
    const from = call?.startedAt - toleranceMs, to = call?.endedAt + toleranceMs;
    return Number.isFinite(from) && Number.isFinite(to) && to >= from ? {from, to} : null;
  });
  const inside = (w, pair) => pair.beginMs >= w.from && pair.endMs <= w.to;
  const overlaps = (w, pair) => pair.beginMs <= w.to && pair.endMs >= w.from;
  const claims = new Map(pairs.map(pair => [pair, windows.filter(w => w && inside(w, pair)).length]));
  return calls.map((call, i) => {
    const w = windows[i];
    const missing = (waitWhy, found = []) => ({...call, waitMs: null, waitEvidence: 'missing', waitWhy, ...(found.length ? {waitIntervals: found.map(interval)} : {})});
    const touching = w ? fragments.filter(f => f.times.some(t => t >= w.from && t <= w.to)) : [];
    if (engineSide === 'main') {
      if (unreadable) return missing('unreadable-signpost');
      return w && (touching.length || pairs.some(pair => overlaps(w, pair))) ? missing('main-emitted-gate') : {...call, waitMs: 0, waitEvidence: 'main-no-gate'};
    }
    if (!w) return missing('invalid-call');
    if (unreadable) return missing('unreadable-signpost');
    if (touching.length) return missing(touching.some(f => f.kind === 'duplicate') ? 'duplicate' : 'incomplete');
    const contained = pairs.filter(pair => inside(w, pair));
    if (pairs.some(pair => overlaps(w, pair) && !inside(w, pair))) return missing('straddles-call', contained);
    if (!contained.length) return missing('no-interval');
    if (contained.length > 1) return missing('duplicate', contained);
    if (claims.get(contained[0]) > 1) return missing('ambiguous-call', contained);
    return {...call, waitMs: contained[0].durationMs, waitEvidence: 'signpost', waitIntervals: [interval(contained[0])]};
  });
}

// The engine's signposts across `calls` (the earliest startedAt to the latest endedAt), read once, after the trial: the raw
// `log show` ndjson for the caller to archive and hand to `attachWaits`. '' when no call has a time. `read` is
// readEngineWindow's seam, widened by a second each way there. A failed read throws; it is not an empty answer.
export async function captureWaitSignposts(calls, {read = readEngineWindow} = {}) {
  const starts = calls.map(c => c?.startedAt).filter(Number.isFinite), ends = calls.map(c => c?.endedAt).filter(Number.isFinite);
  if (!starts.length || !ends.length) return '';
  return read(new Date(Math.min(...starts)), new Date(Math.max(...ends)));
}
