import test from 'node:test';
import assert from 'node:assert/strict';
import {attachWaits, captureWaitSignposts, waitIntervals, WAIT_SIGNPOST, ENGINE_SUBSYSTEM} from './qualification-timing.mjs';

// Lines shaped as `log show --signpost --style ndjson` prints an OSSignposter interval (fields and order of a real record,
// ids and wall stamps as it writes them: the id a bare 64-bit integer, the stamp local time to the microsecond).
const T0 = Date.UTC(2026, 10, 17, 10, 0, 0), ENGINE = 4242;
const stamp = ms => {
  const us = Math.round(ms * 1000), whole = Math.floor(us / 1000), micro = us - whole * 1000, d = new Date(whole - 8 * 3600e3);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}${p(micro, 3)}-0800`;
};
const line = (type, id, at, {pid = ENGINE, name = WAIT_SIGNPOST, subsystem = ENGINE_SUBSYSTEM, mach} = {}) =>
  `{"timezoneName":"","eventType":"signpostEvent","signpostID":${id},"signpostScope":"process","source":null,"formatString":"","userID":501,"activityIdentifier":0,"subsystem":"${subsystem}","category":"timing","threadID":2606775194,"senderImageUUID":"10C63D59-07BC-3518-87A0-83CAC48D8A70","signpostType":"${type}","backtrace":{"frames":[{"imageOffset":61072,"imageUUID":"10C63D59-07BC-3518-87A0-83CAC48D8A70"}]},"bootUUID":"9DEFE614-EAA6-4E3D-94A0-2DCC11149C7E","processImagePath":"\\/Applications\\/cua Engine.app\\/Contents\\/MacOS\\/cua-engine","senderImagePath":"\\/Applications\\/cua Engine.app\\/Contents\\/MacOS\\/cua-engine","timestamp":"${stamp(T0 + at)}","signpostName":"${name}","machTimestamp":${mach ?? 102905063376194 + Math.round(at * 24000)},"eventMessage":"","processImageUUID":"FA70F8E6-62B3-361E-8628-F4882492C488","traceID":1290000550590710022,"processID":${pid},"senderProgramCounter":61072,"parentActivityIdentifier":0}`;
const pairOf = (id, begin, end, extra) => [line('begin', id, begin, extra), line('end', id, end, extra)];
const text = (...lines) => lines.flat().join('\n') + '\n';
const call = (startedAt, endedAt, extra = {}) => ({startedAt: T0 + startedAt, endedAt: T0 + endedAt, ...extra});
const fix = (calls, ...lines) => attachWaits(calls, text(...lines), {enginePid: ENGINE, engineSide: 'fix'});
// A real record from the log on the MacBook (Finder's, kept verbatim): other processes' signposts are noise here.
const REAL = '{"timezoneName":"","eventType":"signpostEvent","signpostID":2953015387832229088,"signpostScope":"process","source":null,"formatString":"-[ISIcon initWithURL:]","userID":501,"activityIdentifier":0,"subsystem":"com.apple.iconservices","category":"url-cache","threadID":2606775194,"senderImageUUID":"10C63D59-07BC-3518-87A0-83CAC48D8A70","signpostType":"begin","backtrace":{"frames":[{"imageOffset":61072,"imageUUID":"10C63D59-07BC-3518-87A0-83CAC48D8A70"}]},"bootUUID":"9DEFE614-EAA6-4E3D-94A0-2DCC11149C7E","processImagePath":"\\/System\\/Library\\/CoreServices\\/Finder.app\\/Contents\\/MacOS\\/Finder","senderImagePath":"\\/System\\/Library\\/PrivateFrameworks\\/IconServices.framework\\/Versions\\/A\\/IconServices","timestamp":"2026-11-17 02:00:56.612554-0800","signpostName":"accessing URL","machTimestamp":102905063376194,"eventMessage":"-[ISIcon initWithURL:]","processImageUUID":"FA70F8E6-62B3-361E-8628-F4882492C488","traceID":1290000550590710022,"processID":87423,"senderProgramCounter":61072,"parentActivityIdentifier":0}';

test('a clean begin and end of the engine process give the wait as their wall difference, from the line text, not the call', () => {
  const [a] = fix([call(1000, 2900, {tag: 'kept'})], '{"count":0,"finished":1}', REAL, line('begin', 17, 1005, {name: 'request'}), pairOf(17, 1010.25, 1010.25 + 1873.412), line('event', 18, 1500));
  assert.equal(a.waitEvidence, 'signpost');
  assert.equal(a.waitMs, 1873.412);
  assert.equal(a.tag, 'kept', 'the call stays as it was, annotated');
  assert.deepEqual(a.waitIntervals.map(i => [i.signpostID, i.durationMs]), [['17', 1873.412]]);
  assert.notEqual(a.waitMs, 1900, 'not the RPC subtraction');
  assert.equal(a.waitWhy, undefined);
});

test('a near-zero wait that was measured is a number, not missing and not an assumed zero', () => {
  const [a] = fix([call(1000, 1040)], pairOf(5, 1010, 1010.021));
  assert.equal(a.waitEvidence, 'signpost');
  assert.equal(a.waitMs, 0.021);
});

test('another process\'s interval is not the engine\'s: a wrong pid alone leaves the call unknown, and with the right one beside it the right one is read', () => {
  const [alone] = fix([call(1000, 2900)], pairOf(9, 1010, 2500, {pid: 777}));
  assert.deepEqual([alone.waitMs, alone.waitEvidence, alone.waitWhy], [null, 'missing', 'no-interval']);
  const [both] = fix([call(1000, 2900)], pairOf(9, 1010, 2500, {pid: 777}), pairOf(9, 1020, 1030, {pid: ENGINE}));
  assert.deepEqual([both.waitMs, both.waitEvidence], [10, 'signpost'], 'the same id under two processes pairs apart');
  assert.deepEqual(waitIntervals(text(pairOf(9, 1010, 2500, {pid: 777})), {enginePid: ENGINE}), {pairs: [], fragments: [], unreadable: 0, otherProcess: 2});
});

test('an interval without its begin or end, or ending before it began, is incomplete and unknown, never zero', () => {
  for (const [name, lines] of [['begin only', [line('begin', 3, 1010)]], ['end only', [line('end', 3, 1500)]], ['end before begin', pairOf(3, 1500, 1010)]]) {
    const [a] = fix([call(1000, 2900)], lines);
    assert.deepEqual([a.waitMs, a.waitEvidence, a.waitWhy], [null, 'missing', 'incomplete'], name);
  }
  const [straddle] = fix([call(1000, 2900)], pairOf(3, 2890, 3050));
  assert.deepEqual([straddle.waitMs, straddle.waitWhy, straddle.waitIntervals], [null, 'straddles-call', undefined], 'a pair that ends after the call is not its wait');
  const [empty] = fix([call(1000, 2900)], '');
  assert.deepEqual([empty.waitMs, empty.waitEvidence, empty.waitWhy], [null, 'missing', 'no-interval']);
});

test('a truncated or malformed line that names the interval makes the fix\'s calls unknown; other malformed lines are skipped', () => {
  const cut = line('begin', 3, 1010).slice(0, 200) + WAIT_SIGNPOST;
  assert.equal(fix([call(1000, 2900)], pairOf(4, 1010, 1020), cut)[0].waitWhy, 'unreadable-signpost');
  assert.deepEqual(fix([call(1000, 2900)], pairOf(4, 1010, 1020), '{"not json', 'plain text')[0].waitMs, 10);
  const noId = line('begin', 4, 1010).replace('"signpostID":4,', '');
  assert.equal(fix([call(1000, 2900)], pairOf(4, 1010, 1020), noId)[0].waitWhy, 'unreadable-signpost', 'a begin without an id cannot be paired');
  const badStamp = line('end', 4, 1020).replace(/"timestamp":"[^"]*"/, '"timestamp":"yesterday"');
  assert.equal(fix([call(1000, 2900)], line('begin', 4, 1010), badStamp)[0].waitWhy, 'unreadable-signpost');
});

test('duplicates are unknown: a second begin or end under one id, or two clean pairs inside one call', () => {
  const [dupBegin] = fix([call(1000, 2900)], pairOf(8, 1010, 1020), line('begin', 8, 1015));
  assert.deepEqual([dupBegin.waitMs, dupBegin.waitEvidence, dupBegin.waitWhy], [null, 'missing', 'duplicate']);
  const [dupEnd] = fix([call(1000, 2900)], pairOf(8, 1010, 1020), line('end', 8, 1025));
  assert.equal(dupEnd.waitWhy, 'duplicate');
  const [two] = fix([call(1000, 2900)], pairOf(8, 1010, 1020), pairOf(9, 1100, 1200));
  assert.deepEqual([two.waitMs, two.waitWhy, two.waitIntervals.map(i => i.durationMs)], [null, 'duplicate', [10, 100]], 'a request has one gate: two cannot both be its wait');
});

test('the same log record twice (overlapping reads) counts once, but a second record at another tick is a duplicate', () => {
  const begin = line('begin', 8, 1010), end = line('end', 8, 1020);
  assert.deepEqual(fix([call(1000, 2900)], begin, begin, end, end).map(a => [a.waitMs, a.waitEvidence]), [[10, 'signpost']]);
  assert.equal(fix([call(1000, 2900)], begin, end, line('begin', 8, 1010, {mach: 5})).at(0).waitWhy, 'duplicate');
});

test('two calls each take their own interval; a call with none stays unknown; a stray fragment between calls touches none', () => {
  const calls = [call(1000, 1100), call(3000, 3200), call(5000, 5050), call(6000, 6100)];
  const out = fix(calls, pairOf(1, 1010, 1060), pairOf(2, 3010, 3190), line('begin', 3, 4000), pairOf(4, 6010, 6020));
  assert.deepEqual(out.map(a => [a.waitMs, a.waitEvidence, a.waitWhy]), [[50, 'signpost', undefined], [180, 'signpost', undefined], [null, 'missing', 'no-interval'], [10, 'signpost', undefined]]);
  assert.deepEqual(out.map(a => a.startedAt), calls.map(c => c.startedAt));
  const [a, b] = fix([call(1000, 1100), call(3000, 3200)], pairOf(1, 1010, 1060), line('begin', 3, 3050));
  assert.deepEqual([a.waitMs, b.waitWhy], [50, 'incomplete'], 'a begin without an end inside a call spoils that call only');
});

test('a pair that two overlapping calls both contain belongs to neither', () => {
  const out = fix([call(1000, 1100), call(1020, 1090), call(2000, 2100)], pairOf(1, 1030, 1050), pairOf(2, 2010, 2020));
  assert.deepEqual(out.map(a => [a.waitMs, a.waitWhy]), [[null, 'ambiguous-call'], [null, 'ambiguous-call'], [10, undefined]]);
});

test('association is bounded at plus or minus 1 ms of the call\'s own clock', () => {
  assert.equal(fix([call(1000, 1100)], pairOf(1, 999.2, 1100.9))[0].waitEvidence, 'signpost', 'inside the 1 ms the whole-millisecond clocks allow');
  assert.equal(fix([call(1000, 1100)], pairOf(1, 998.4, 1050))[0].waitWhy, 'straddles-call');
  assert.equal(fix([call(1000, 1100)], pairOf(1, 1050, 1101.5))[0].waitWhy, 'straddles-call');
  const [wide] = attachWaits([call(1000, 1100)], text(pairOf(1, 995, 1050)), {enginePid: ENGINE, engineSide: 'fix', toleranceMs: 6});
  assert.equal(wide.waitEvidence, 'signpost', 'the bound is an option, 1 ms by default');
});

test('64-bit signpost ids that a double cannot tell apart still pair each begin with its own end', () => {
  const [x, y] = ['4611686018427387905', '4611686018427387906'];
  assert.equal(Number(x), Number(y), 'the premise: JSON.parse would merge these');
  const out = fix([call(1000, 1100), call(2000, 2100)], line('begin', x, 1010), line('begin', y, 2010), line('end', y, 2030), line('end', x, 1070));
  assert.deepEqual(out.map(a => [a.waitMs, a.waitEvidence, a.waitIntervals[0].signpostID]), [[60, 'signpost', x], [20, 'signpost', y]]);
});

test('main has no readiness gate: its calls are main-no-gate with a deliberate 0, with or without signposts; a gate seen on main\'s pid voids the call', () => {
  const calls = [call(1000, 1100), call(3000, 3200)];
  for (const body of ['', text(line('begin', 1, 1010, {name: 'request'}), REAL)]) {
    const out = attachWaits(calls, body, {enginePid: ENGINE, engineSide: 'main'});
    assert.deepEqual(out.map(a => [a.waitMs, a.waitEvidence, a.waitIntervals]), [[0, 'main-no-gate', undefined], [0, 'main-no-gate', undefined]]);
  }
  const odd = attachWaits(calls, text(pairOf(1, 3010, 3050)), {enginePid: ENGINE, engineSide: 'main'});
  assert.deepEqual(odd.map(a => [a.waitMs, a.waitEvidence, a.waitWhy]), [[0, 'main-no-gate', undefined], [null, 'missing', 'main-emitted-gate']]);
  assert.equal(attachWaits(calls, text(pairOf(1, 3010, 3050, {pid: 9})), {enginePid: ENGINE, engineSide: 'main'})[1].waitEvidence, 'main-no-gate', 'another process\'s is not main\'s');
});

test('a call without usable times is unknown on the fix; it is still main-no-gate on main', () => {
  const calls = [{startedAt: T0 + 1000}, {startedAt: T0 + 1100, endedAt: T0 + 1000}, null];
  assert.deepEqual(fix(calls, pairOf(1, 1010, 1020)).map(a => [a.waitMs, a.waitWhy]), [[null, 'invalid-call'], [null, 'invalid-call'], [null, 'invalid-call']]);
  assert.deepEqual(attachWaits(calls, '', {enginePid: ENGINE, engineSide: 'main'}).map(a => a.waitEvidence), ['main-no-gate', 'main-no-gate', 'main-no-gate']);
});

test('the inputs are checked at the boundary and not mutated', () => {
  const calls = [call(1000, 1100)], before = JSON.stringify(calls);
  assert.throws(() => attachWaits(calls, '', {enginePid: ENGINE, engineSide: 'both'}), /engineSide/);
  assert.throws(() => attachWaits(calls, '', {enginePid: 0, engineSide: 'fix'}), /enginePid/);
  assert.throws(() => attachWaits(calls, '', {engineSide: 'fix'}), /enginePid/);
  assert.throws(() => attachWaits('calls', '', {enginePid: ENGINE, engineSide: 'fix'}), /calls/);
  fix(calls, pairOf(1, 1010, 1020));
  assert.equal(JSON.stringify(calls), before);
});

test('the capture reads the engine window once, from the earliest start to the latest end, and a failed read throws', async () => {
  const seen = [];
  const raw = await captureWaitSignposts([call(2000, 2100), {startedAt: 'x'}, call(1000, 1500), call(3000, 4000)], {read: async (a, b) => { seen.push([+a, +b]); return 'RAW'; }});
  assert.equal(raw, 'RAW');
  assert.deepEqual(seen, [[T0 + 1000, T0 + 4000]]);
  assert.equal(await captureWaitSignposts([{startedAt: 1}], {read: async () => assert.fail('no window, no read')}), '');
  await assert.rejects(captureWaitSignposts([call(1, 2)], {read: async () => { throw new Error('log show timed out'); }}), /timed out/);
});
