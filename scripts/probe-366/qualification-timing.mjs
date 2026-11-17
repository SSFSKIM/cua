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
// Which call a wait belongs to is not decided by wall time. A hosted runner's `Date.now()` (the probe's call times) and
// the `timestamp` log prints are different clocks: in the smoke run 44064188276 the call's start minus its engine
// request's begin was a constant 94 ms on one runner and grew from 124 to 219 ms (and 191 to 297 ms) over about three
// minutes, about 0.5 ms a second, on the other two, in main's calls as much as the fix's. A window of the call's times,
// however wide, would drop the wait or take another's. The engine marks every request it serves with a `request`
// interval (the method as the begin's message) and the gate sits inside it, both stamped by one clock. So the gate
// belongs to the request that contains it, and the request to the call by method and order: the engine of one trial
// serves its calls one after another, a new process per trial, so the nth `click` request is the nth `click` call. That
// is checked, never assumed: the counts must agree, no two calls of a method may overlap in the client's time, and the
// request must fit the call, no longer than it (less the allowance of Date.now()'s whole milliseconds and a clock
// rate off by a tenth of a percent) and no more than MAX_RPC_OVERHEAD_MS shorter, so that a request that is not the
// call's cannot be paired with it. The wait itself is the gate interval's own difference of wall `timestamp`s (log's
// microseconds), a span on the one clock, whatever the offset to the client's.
//
// Pairing. Each begin and end carries the emitting process (`processID`), a `signpostID` (OSSignposter's makeSignpostID,
// unique within the process) and the interval's name; a pair is the one begin and the one end that share all three. The
// ids are 64-bit and JSON.parse would round them to a double, merging neighbours, so they are read from the line's text.
// Lines that are the same log record twice (the same mach tick, type, id, process: two overlapping reads) count once; a
// second begin or end under one id, at another tick, is a duplicate and unknown.
//
// A call's wait is known only when its request is found and exactly one clean gate pair lies inside it, and nothing
// else of the gate touches it: a begin without its end, an end without its begin, a duplicate, a pair that starts or ends
// outside the request, a pair two requests contain, an unreadable line that names the gate. Every other case is `missing`
// with waitMs null and a `waitWhy`, never 0, so an absent signpost cannot read as an instant gate. A wait of 0.02 ms that
// was measured is a number.
//
// The side matters. The fix (d94039ec) emits the gate on every input request and every get_app_state that names an
// app, near zero when no wait was owed; its calls need a valid pair. Main (c7eee724) has no readiness gate and no such
// signpost, so its calls are `main-no-gate` with a deliberate 0 ms, and if main's pid shows the interval anywhere the run
// was not main and its calls are `missing`.
import {logTimestampMs, readEngineWindow} from '../cursor-sitting/signposts.mjs';

export const WAIT_SIGNPOST = 'prologue.chromiumReady';
export const REQUEST_SIGNPOST = 'request';
export const ENGINE_SUBSYSTEM = 'io.github.ssfskim.cua.engine';
// What a call's own time may exceed its engine request by: the socket, the JSON, the client's event loop. Measured in the
// smoke run, 0.2-6.5 ms across 40 calls, the CPU-loaded ones included; the bound only has to tell the call's request from
// another's, whose duration differs by far more (a cold click 2.1 s, a warm one 0.16 s).
export const MAX_RPC_OVERHEAD_MS = 250;
// A request may be this much longer than its call by the clocks: Date.now() truncates each end to a millisecond, and the
// client's clock may run off the log's by a tenth of a percent (the host slews its clock by up to 0.05 %).
export const TRUNCATION_MS = 1, CLOCK_RATE_ALLOWANCE = 0.001;
export const CAPTURE_PAD_MS = 4000;

const microseconds = ms => Math.round(ms * 1000) / 1000;

// One ndjson line as a begin or end of the gate's or a request's interval of process `enginePid`, or why it is not one.
// -> null (not those intervals', or another subsystem's), {unreadable: true, wait} (`wait`: the gate's line), {otherProcess: true}
// or {name, type, ms, id, mach, message}.
function readLine(line, enginePid) {
  if (!line.startsWith('{')) return null;
  let e;
  try { e = JSON.parse(line); } catch {
    return line.includes(WAIT_SIGNPOST) ? {unreadable: true, wait: true} : line.includes(`"signpostName":"${REQUEST_SIGNPOST}"`) ? {unreadable: true, wait: false} : null;
  }
  if (e?.signpostName !== WAIT_SIGNPOST && e?.signpostName !== REQUEST_SIGNPOST) return null;
  if (e.subsystem !== undefined && e.subsystem !== ENGINE_SUBSYSTEM) return null;
  if (e.signpostType !== 'begin' && e.signpostType !== 'end') return null;
  if (e.processID !== enginePid) return {otherProcess: true};
  const id = /"signpostID":\s*(-?\d+)/.exec(line)?.[1];
  const ms = logTimestampMs(e.timestamp);
  if (id === undefined || ms === null) return {unreadable: true, wait: e.signpostName === WAIT_SIGNPOST};
  return {name: e.signpostName, type: e.signpostType, ms, id, mach: e.machTimestamp ?? e.timestamp, message: typeof e.eventMessage === 'string' ? e.eventMessage : ''};
}

// The gate's and the requests' intervals of process `enginePid` in `text` (log show's ndjson).
// -> {wait, request, unreadable, unreadableWait, otherProcess}: `wait` and `request` each {pairs: [{signpostID, beginMs, endMs,
// durationMs}], fragments: [{signpostID, kind, times}]}; a request's pair or fragment also has `method`, the begin's message
// (null when there is no begin). `pairs` are the clean begin+end couples (epoch ms, microseconds kept); `fragments` what is
// not one, kind unmatched-begin, unmatched-end, duplicate or inverted (an end before its begin), `times` every event's time;
// `unreadable` the lines that name either interval and cannot be placed (`unreadableWait` of them the gate's); `otherProcess`
// those of other processes, ignored.
export function readIntervals(text, {enginePid}) {
  const groups = new Map(), seen = new Set();
  let unreadable = 0, unreadableWait = 0, otherProcess = 0;
  for (const line of String(text ?? '').split('\n')) {
    const read = readLine(line, enginePid);
    if (read === null) continue;
    if (read.unreadable) { unreadable++; if (read.wait) unreadableWait++; continue; }
    if (read.otherProcess) { otherProcess++; continue; }
    const record = `${read.name}|${read.mach}|${read.id}|${read.type}`;
    if (seen.has(record)) continue;
    seen.add(record);
    const key = `${read.name}|${read.id}`;
    const group = groups.get(key) ?? {name: read.name, id: read.id, begins: [], ends: []};
    group[read.type === 'begin' ? 'begins' : 'ends'].push({ms: read.ms, message: read.message});
    groups.set(key, group);
  }
  const wait = {pairs: [], fragments: []}, request = {pairs: [], fragments: []};
  for (const {name, id, begins, ends} of groups.values()) {
    const into = name === WAIT_SIGNPOST ? wait : request;
    const extra = name === REQUEST_SIGNPOST ? {method: begins[0]?.message ?? null} : {};
    if (begins.length === 1 && ends.length === 1 && ends[0].ms >= begins[0].ms) {
      into.pairs.push({signpostID: id, beginMs: begins[0].ms, endMs: ends[0].ms, durationMs: microseconds(ends[0].ms - begins[0].ms), ...extra});
    } else {
      const kind = begins.length > 1 || ends.length > 1 ? 'duplicate' : !ends.length ? 'unmatched-begin' : !begins.length ? 'unmatched-end' : 'inverted';
      into.fragments.push({signpostID: id, kind, times: [...begins, ...ends].map(x => x.ms), ...extra});
    }
  }
  for (const side of [wait, request]) side.pairs.sort((a, b) => a.beginMs - b.beginMs);
  return {wait, request, unreadable, unreadableWait, otherProcess};
}

const interval = ({signpostID, beginMs, endMs, durationMs}) => ({signpostID, beginMs, endMs, durationMs});
// The call without a wait annotation an earlier attach left on it: a rescored row carries none of the old verdict.
const bare = call => {
  const {waitMs, waitEvidence, waitWhy, waitIntervals, waitRequest, waitSlackMs, waitClockOffsetMs, ...rest} = call ?? {};
  return rest;
};

// `calls` ({method, startedAt, endedAt}, the probe's rpc records, times in epoch ms) with the wait each really took, each a
// copy with `waitMs` (ms, null when unknown), `waitEvidence` (signpost | main-no-gate | missing) and, for the fix:
// `waitIntervals` (the gate pair), `waitRequest` (the engine's request interval it sat in), `waitSlackMs` (the call's time
// less the request's, the check that the two are one) and `waitClockOffsetMs` (the call's start less the request's begin:
// the client's clock against the log's, which is not 0); when missing, `waitWhy`: invalid-call, unreadable-signpost,
// ambiguous-call, no-request, request-incomplete, request-count-mismatch, request-mismatch, ambiguous-request,
// duplicate, incomplete, straddles-request, no-interval or main-emitted-gate. `signpostText` is `log show`'s ndjson for the
// engine; `enginePid` the process whose intervals count; `engineSide` 'fix' or 'main'.
export function attachWaits(calls, signpostText, {enginePid, engineSide, maxRpcOverheadMs = MAX_RPC_OVERHEAD_MS} = {}) {
  if (!Array.isArray(calls)) throw new TypeError('attachWaits: calls must be an array');
  if (engineSide !== 'fix' && engineSide !== 'main') throw new TypeError(`attachWaits: engineSide must be 'fix' or 'main', not ${engineSide}`);
  if (!Number.isInteger(enginePid) || enginePid <= 0) throw new TypeError(`attachWaits: enginePid must be a process id, not ${enginePid}`);
  const {wait, request, unreadable, unreadableWait} = readIntervals(signpostText, {enginePid});
  const missing = (call, waitWhy, extra = {}) => ({...bare(call), waitMs: null, waitEvidence: 'missing', waitWhy, ...extra});
  if (engineSide === 'main') {
    return calls.map(call => unreadableWait ? missing(call, 'unreadable-signpost')
      : wait.pairs.length || wait.fragments.length ? missing(call, 'main-emitted-gate') : {...bare(call), waitMs: 0, waitEvidence: 'main-no-gate'});
  }
  const out = new Array(calls.length), byMethod = new Map();
  calls.forEach((call, i) => {
    const duration = call?.endedAt - call?.startedAt;
    if (typeof call?.method !== 'string' || !Number.isFinite(duration) || duration < 0) { out[i] = missing(call, 'invalid-call'); return; }
    if (unreadable) { out[i] = missing(call, 'unreadable-signpost'); return; }
    byMethod.set(call.method, [...(byMethod.get(call.method) ?? []), i]);
  });
  const contains = (q, pair) => pair.beginMs >= q.beginMs && pair.endMs <= q.endMs;
  for (const [method, indexes] of byMethod) {
    indexes.sort((a, b) => calls[a].startedAt - calls[b].startedAt);
    const all = why => indexes.forEach(i => { out[i] = missing(calls[i], why); });
    if (indexes.some((i, k) => k > 0 && calls[i].startedAt < calls[indexes[k - 1]].endedAt)) { all('ambiguous-call'); continue; }
    if (request.fragments.some(f => f.method === method || f.method === null)) { all('request-incomplete'); continue; }
    const requests = request.pairs.filter(q => q.method === method);
    if (!requests.length) { all('no-request'); continue; }
    if (requests.length !== indexes.length) { all('request-count-mismatch'); continue; }
    indexes.forEach((i, k) => {
      const call = calls[i], q = requests[k], callMs = call.endedAt - call.startedAt;
      const audit = {waitRequest: interval(q), waitSlackMs: microseconds(callMs - q.durationMs), waitClockOffsetMs: Math.round((call.startedAt - q.beginMs) * 10) / 10};
      const fail = (why, extra = {}) => { out[i] = missing(call, why, {...audit, ...extra}); };
      if (q.durationMs > callMs + TRUNCATION_MS + callMs * CLOCK_RATE_ALLOWANCE || callMs - q.durationMs > maxRpcOverheadMs) return fail('request-mismatch');
      const touching = wait.fragments.filter(f => f.times.some(t => t >= q.beginMs && t <= q.endMs));
      if (touching.length) return fail(touching.some(f => f.kind === 'duplicate') ? 'duplicate' : 'incomplete');
      if (wait.pairs.some(pair => pair.beginMs <= q.endMs && pair.endMs >= q.beginMs && !contains(q, pair))) return fail('straddles-request');
      const inside = wait.pairs.filter(pair => contains(q, pair));
      if (!inside.length) return fail('no-interval');
      if (inside.length > 1) return fail('duplicate', {waitIntervals: inside.map(interval)});
      if (request.pairs.filter(other => contains(other, inside[0])).length > 1) return fail('ambiguous-request', {waitIntervals: [interval(inside[0])]});
      out[i] = {...bare(call), waitMs: inside[0].durationMs, waitEvidence: 'signpost', waitIntervals: [interval(inside[0])], ...audit};
    });
  }
  return out;
}

// The engine's signposts across `calls` (the earliest startedAt to the latest endedAt, padded by `padMs` each way, for the
// client's clock runs off the log's by a few hundred ms, growing), read once, after the trial: the raw `log show` ndjson
// for the caller to archive and hand to `attachWaits`. '' when no call has a time. `read` is readEngineWindow's seam,
// widened by a second each way there. A failed read throws; it is not an empty answer.
export async function captureWaitSignposts(calls, {read = readEngineWindow, padMs = CAPTURE_PAD_MS} = {}) {
  const starts = calls.map(c => c?.startedAt).filter(Number.isFinite), ends = calls.map(c => c?.endedAt).filter(Number.isFinite);
  if (!starts.length || !ends.length) return '';
  return read(new Date(Math.min(...starts) - padMs), new Date(Math.max(...ends) + padMs));
}
