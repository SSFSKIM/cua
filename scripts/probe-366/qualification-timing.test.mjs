import test from 'node:test';
import assert from 'node:assert/strict';
import {attachWaits, captureWaitSignposts, readIntervals, WAIT_SIGNPOST, OBSERVATION_SIGNPOST, REQUEST_SIGNPOST, ENGINE_SUBSYSTEM} from './qualification-timing.mjs';

// Lines shaped as `log show --signpost --style ndjson` prints an OSSignposter interval (fields and order of a real record,
// ids and wall stamps as it writes them: the id a bare 64-bit integer, the stamp local time to the microsecond).
const T0 = Date.UTC(2026, 10, 17, 10, 0, 0), ENGINE = 4242;
const stamp = ms => {
  const us = Math.round(ms * 1000), whole = Math.floor(us / 1000), micro = us - whole * 1000, d = new Date(whole - 8 * 3600e3);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}${p(micro, 3)}-0800`;
};
const line = (type, id, at, {pid = ENGINE, name = WAIT_SIGNPOST, subsystem = ENGINE_SUBSYSTEM, mach, message = ''} = {}) =>
  `{"timezoneName":"","eventType":"signpostEvent","signpostID":${id},"signpostScope":"process","source":null,"formatString":"","userID":501,"activityIdentifier":0,"subsystem":"${subsystem}","category":"timing","threadID":2606775194,"senderImageUUID":"10C63D59-07BC-3518-87A0-83CAC48D8A70","signpostType":"${type}","backtrace":{"frames":[{"imageOffset":61072,"imageUUID":"10C63D59-07BC-3518-87A0-83CAC48D8A70"}]},"bootUUID":"9DEFE614-EAA6-4E3D-94A0-2DCC11149C7E","processImagePath":"\\/Applications\\/cua Engine.app\\/Contents\\/MacOS\\/cua-engine","senderImagePath":"\\/Applications\\/cua Engine.app\\/Contents\\/MacOS\\/cua-engine","timestamp":"${stamp(T0 + at)}","signpostName":"${name}","machTimestamp":${mach ?? 102905063376194 + Math.round(at * 24000)},"eventMessage":${JSON.stringify(message)},"processImageUUID":"FA70F8E6-62B3-361E-8628-F4882492C488","traceID":1290000550590710022,"processID":${pid},"senderProgramCounter":61072,"parentActivityIdentifier":0}`;
// The gate's interval, and a request's (its method the begin's message, as the engine writes it), on the engine's clock.
const gate = (id, begin, end, extra) => [line('begin', id, begin, extra), line('end', id, end, extra)];
const req = (id, begin, end, method, extra) => [line('begin', id, begin, {...extra, name: REQUEST_SIGNPOST, message: method}), line('end', id, end, {...extra, name: REQUEST_SIGNPOST})];
const text = (...lines) => lines.flat(Infinity).join('\n') + '\n';
// A call in the client's clock, which runs `skew` ms ahead of the log's: the engine's request [begin, end] seen from outside,
// the rpc starting `lead` ms before it and ending `tail` ms after.
const SKEW = 129;
const call = (method, begin, end, {skew = SKEW, lead = 0.6, tail = 0.9, ...extra} = {}) => ({method, startedAt: Math.floor(T0 + begin + skew - lead), endedAt: Math.ceil(T0 + end + skew + tail), ...extra});
const fix = (calls, ...lines) => attachWaits(calls, text(...lines), {enginePid: ENGINE, engineSide: 'fix'});
const verdicts = out => out.map(a => [a.waitMs, a.waitEvidence, a.waitWhy]);
// A real record from the log on the MacBook (Finder's, kept verbatim): other processes' signposts are noise here.
const REAL = '{"timezoneName":"","eventType":"signpostEvent","signpostID":2953015387832229088,"signpostScope":"process","source":null,"formatString":"-[ISIcon initWithURL:]","userID":501,"activityIdentifier":0,"subsystem":"com.apple.iconservices","category":"url-cache","threadID":2606775194,"senderImageUUID":"10C63D59-07BC-3518-87A0-83CAC48D8A70","signpostType":"begin","backtrace":{"frames":[{"imageOffset":61072,"imageUUID":"10C63D59-07BC-3518-87A0-83CAC48D8A70"}]},"bootUUID":"9DEFE614-EAA6-4E3D-94A0-2DCC11149C7E","processImagePath":"\\/System\\/Library\\/CoreServices\\/Finder.app\\/Contents\\/MacOS\\/Finder","senderImagePath":"\\/System\\/Library\\/PrivateFrameworks\\/IconServices.framework\\/Versions\\/A\\/IconServices","timestamp":"2026-11-17 02:00:56.612554-0800","signpostName":"accessing URL","machTimestamp":102905063376194,"eventMessage":"-[ISIcon initWithURL:]","processImageUUID":"FA70F8E6-62B3-361E-8628-F4882492C488","traceID":1290000550590710022,"processID":87423,"senderProgramCounter":61072,"parentActivityIdentifier":0}';

// The engine's own records from hosted run 44064188276 (electron, fix engine pid 5540), kept verbatim: a get_app_state, a cold
// click that waited, a warm click that did not. The runner's Date.now() ran 129 ms and then 132 ms ahead of these stamps.
const HOSTED_FIX_5540 = [
  "{\"timezoneName\":\"\",\"eventType\":\"signpostEvent\",\"signpostID\":2,\"signpostScope\":\"process\",\"source\":null,\"formatString\":\"%{public}s\",\"userID\":501,\"activityIdentifier\":0,\"subsystem\":\"io.github.ssfskim.cua.engine\",\"category\":\"timing\",\"threadID\":23905,\"senderImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"signpostType\":\"begin\",\"backtrace\":{\"frames\":[{\"imageOffset\":819412,\"imageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\"}]},\"bootUUID\":\"B70CDB50-4B61-48D8-B0C3-F054A7E07FA3\",\"processImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"senderImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"timestamp\":\"2026-11-17 10:25:35.908358+0000\",\"signpostName\":\"request\",\"machTimestamp\":6490706710,\"eventMessage\":\"get_app_state\",\"processImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"traceID\":6850861565378822,\"processID\":5540,\"senderProgramCounter\":819412,\"parentActivityIdentifier\":0}",
  "{\"timezoneName\":\"\",\"eventType\":\"signpostEvent\",\"signpostID\":7,\"signpostScope\":\"process\",\"source\":null,\"formatString\":\"\",\"userID\":501,\"activityIdentifier\":0,\"subsystem\":\"io.github.ssfskim.cua.engine\",\"category\":\"timing\",\"threadID\":23905,\"senderImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"signpostType\":\"begin\",\"backtrace\":{\"frames\":[{\"imageOffset\":1160532,\"imageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\"}]},\"bootUUID\":\"B70CDB50-4B61-48D8-B0C3-F054A7E07FA3\",\"processImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"senderImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"timestamp\":\"2026-11-17 10:25:35.917038+0000\",\"signpostName\":\"prologue.chromiumReady\",\"machTimestamp\":6490915037,\"eventMessage\":\"\",\"processImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"traceID\":6471315305431302,\"processID\":5540,\"senderProgramCounter\":1160532,\"parentActivityIdentifier\":0}",
  "{\"timezoneName\":\"\",\"eventType\":\"signpostEvent\",\"signpostID\":7,\"signpostScope\":\"process\",\"source\":null,\"formatString\":\"\",\"userID\":501,\"activityIdentifier\":0,\"subsystem\":\"io.github.ssfskim.cua.engine\",\"category\":\"timing\",\"threadID\":23905,\"senderImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"signpostType\":\"end\",\"backtrace\":{\"frames\":[{\"imageOffset\":1161108,\"imageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\"}]},\"bootUUID\":\"B70CDB50-4B61-48D8-B0C3-F054A7E07FA3\",\"processImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"senderImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"timestamp\":\"2026-11-17 10:25:35.917046+0000\",\"signpostName\":\"prologue.chromiumReady\",\"machTimestamp\":6490915210,\"eventMessage\":\"\",\"processImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"traceID\":6471315305431558,\"processID\":5540,\"senderProgramCounter\":1161108,\"parentActivityIdentifier\":0}",
  "{\"timezoneName\":\"\",\"eventType\":\"signpostEvent\",\"signpostID\":2,\"signpostScope\":\"process\",\"source\":null,\"formatString\":\"\",\"userID\":501,\"activityIdentifier\":0,\"subsystem\":\"io.github.ssfskim.cua.engine\",\"category\":\"timing\",\"threadID\":23905,\"senderImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"signpostType\":\"end\",\"backtrace\":{\"frames\":[{\"imageOffset\":834476,\"imageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\"}]},\"bootUUID\":\"B70CDB50-4B61-48D8-B0C3-F054A7E07FA3\",\"processImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"senderImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"timestamp\":\"2026-11-17 10:25:36.399176+0000\",\"signpostName\":\"request\",\"machTimestamp\":6502486347,\"eventMessage\":\"\",\"processImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"traceID\":6471315305431558,\"processID\":5540,\"senderProgramCounter\":834476,\"parentActivityIdentifier\":0}",
  "{\"timezoneName\":\"\",\"eventType\":\"signpostEvent\",\"signpostID\":8,\"signpostScope\":\"process\",\"source\":null,\"formatString\":\"%{public}s\",\"userID\":501,\"activityIdentifier\":0,\"subsystem\":\"io.github.ssfskim.cua.engine\",\"category\":\"timing\",\"threadID\":23905,\"senderImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"signpostType\":\"begin\",\"backtrace\":{\"frames\":[{\"imageOffset\":819412,\"imageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\"}]},\"bootUUID\":\"B70CDB50-4B61-48D8-B0C3-F054A7E07FA3\",\"processImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"senderImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"timestamp\":\"2026-11-17 10:25:36.426898+0000\",\"signpostName\":\"request\",\"machTimestamp\":6503151658,\"eventMessage\":\"click\",\"processImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"traceID\":6850861565378822,\"processID\":5540,\"senderProgramCounter\":819412,\"parentActivityIdentifier\":0}",
  "{\"timezoneName\":\"\",\"eventType\":\"signpostEvent\",\"signpostID\":13,\"signpostScope\":\"process\",\"source\":null,\"formatString\":\"\",\"userID\":501,\"activityIdentifier\":0,\"subsystem\":\"io.github.ssfskim.cua.engine\",\"category\":\"timing\",\"threadID\":23905,\"senderImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"signpostType\":\"begin\",\"backtrace\":{\"frames\":[{\"imageOffset\":1160532,\"imageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\"}]},\"bootUUID\":\"B70CDB50-4B61-48D8-B0C3-F054A7E07FA3\",\"processImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"senderImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"timestamp\":\"2026-11-17 10:25:36.428571+0000\",\"signpostName\":\"prologue.chromiumReady\",\"machTimestamp\":6503191822,\"eventMessage\":\"\",\"processImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"traceID\":6471315305431302,\"processID\":5540,\"senderProgramCounter\":1160532,\"parentActivityIdentifier\":0}",
  "{\"timezoneName\":\"\",\"eventType\":\"signpostEvent\",\"signpostID\":13,\"signpostScope\":\"process\",\"source\":null,\"formatString\":\"\",\"userID\":501,\"activityIdentifier\":0,\"subsystem\":\"io.github.ssfskim.cua.engine\",\"category\":\"timing\",\"threadID\":23905,\"senderImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"signpostType\":\"end\",\"backtrace\":{\"frames\":[{\"imageOffset\":1161108,\"imageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\"}]},\"bootUUID\":\"B70CDB50-4B61-48D8-B0C3-F054A7E07FA3\",\"processImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"senderImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"timestamp\":\"2026-11-17 10:25:38.457814+0000\",\"signpostName\":\"prologue.chromiumReady\",\"machTimestamp\":6551893661,\"eventMessage\":\"\",\"processImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"traceID\":6471315305431558,\"processID\":5540,\"senderProgramCounter\":1161108,\"parentActivityIdentifier\":0}",
  "{\"timezoneName\":\"\",\"eventType\":\"signpostEvent\",\"signpostID\":8,\"signpostScope\":\"process\",\"source\":null,\"formatString\":\"\",\"userID\":501,\"activityIdentifier\":0,\"subsystem\":\"io.github.ssfskim.cua.engine\",\"category\":\"timing\",\"threadID\":23905,\"senderImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"signpostType\":\"end\",\"backtrace\":{\"frames\":[{\"imageOffset\":834476,\"imageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\"}]},\"bootUUID\":\"B70CDB50-4B61-48D8-B0C3-F054A7E07FA3\",\"processImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"senderImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"timestamp\":\"2026-11-17 10:25:38.553056+0000\",\"signpostName\":\"request\",\"machTimestamp\":6554179460,\"eventMessage\":\"\",\"processImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"traceID\":6471315305431558,\"processID\":5540,\"senderProgramCounter\":834476,\"parentActivityIdentifier\":0}",
  "{\"timezoneName\":\"\",\"eventType\":\"signpostEvent\",\"signpostID\":43,\"signpostScope\":\"process\",\"source\":null,\"formatString\":\"%{public}s\",\"userID\":501,\"activityIdentifier\":0,\"subsystem\":\"io.github.ssfskim.cua.engine\",\"category\":\"timing\",\"threadID\":23905,\"senderImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"signpostType\":\"begin\",\"backtrace\":{\"frames\":[{\"imageOffset\":819412,\"imageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\"}]},\"bootUUID\":\"B70CDB50-4B61-48D8-B0C3-F054A7E07FA3\",\"processImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"senderImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"timestamp\":\"2026-11-17 10:25:41.606999+0000\",\"signpostName\":\"request\",\"machTimestamp\":6627474083,\"eventMessage\":\"click\",\"processImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"traceID\":6850861565378822,\"processID\":5540,\"senderProgramCounter\":819412,\"parentActivityIdentifier\":0}",
  "{\"timezoneName\":\"\",\"eventType\":\"signpostEvent\",\"signpostID\":48,\"signpostScope\":\"process\",\"source\":null,\"formatString\":\"\",\"userID\":501,\"activityIdentifier\":0,\"subsystem\":\"io.github.ssfskim.cua.engine\",\"category\":\"timing\",\"threadID\":23905,\"senderImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"signpostType\":\"begin\",\"backtrace\":{\"frames\":[{\"imageOffset\":1160532,\"imageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\"}]},\"bootUUID\":\"B70CDB50-4B61-48D8-B0C3-F054A7E07FA3\",\"processImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"senderImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"timestamp\":\"2026-11-17 10:25:41.608066+0000\",\"signpostName\":\"prologue.chromiumReady\",\"machTimestamp\":6627499708,\"eventMessage\":\"\",\"processImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"traceID\":6471315305431302,\"processID\":5540,\"senderProgramCounter\":1160532,\"parentActivityIdentifier\":0}",
  "{\"timezoneName\":\"\",\"eventType\":\"signpostEvent\",\"signpostID\":48,\"signpostScope\":\"process\",\"source\":null,\"formatString\":\"\",\"userID\":501,\"activityIdentifier\":0,\"subsystem\":\"io.github.ssfskim.cua.engine\",\"category\":\"timing\",\"threadID\":23905,\"senderImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"signpostType\":\"end\",\"backtrace\":{\"frames\":[{\"imageOffset\":1161108,\"imageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\"}]},\"bootUUID\":\"B70CDB50-4B61-48D8-B0C3-F054A7E07FA3\",\"processImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"senderImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"timestamp\":\"2026-11-17 10:25:41.608069+0000\",\"signpostName\":\"prologue.chromiumReady\",\"machTimestamp\":6627499767,\"eventMessage\":\"\",\"processImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"traceID\":6471315305431558,\"processID\":5540,\"senderProgramCounter\":1161108,\"parentActivityIdentifier\":0}",
  "{\"timezoneName\":\"\",\"eventType\":\"signpostEvent\",\"signpostID\":43,\"signpostScope\":\"process\",\"source\":null,\"formatString\":\"\",\"userID\":501,\"activityIdentifier\":0,\"subsystem\":\"io.github.ssfskim.cua.engine\",\"category\":\"timing\",\"threadID\":23905,\"senderImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"signpostType\":\"end\",\"backtrace\":{\"frames\":[{\"imageOffset\":834476,\"imageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\"}]},\"bootUUID\":\"B70CDB50-4B61-48D8-B0C3-F054A7E07FA3\",\"processImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"senderImagePath\":\"\\/Users\\/runner\\/work\\/_temp\\/qual-build-fix\\/arm64-apple-macosx\\/release\\/cua-engine\",\"timestamp\":\"2026-11-17 10:25:41.771064+0000\",\"signpostName\":\"request\",\"machTimestamp\":6631411649,\"eventMessage\":\"\",\"processImageUUID\":\"00F60C85-1DA9-31B1-B79B-4FD58234181F\",\"traceID\":6471315305431558,\"processID\":5540,\"senderProgramCounter\":834476,\"parentActivityIdentifier\":0}",
];
const HOSTED_CALLS = [
  {label: 'cold', method: 'click', startedAt: 1794911136556, endedAt: 1794911138684},
  {label: 'warm', method: 'click', startedAt: 1794911141739, endedAt: 1794911141904},
];

test('the hosted run\'s real records give the cold wait and the warm wait although the client\'s clock is 129 ms off the log\'s', () => {
  const body = ['{"count":0,"finished":1}', ...HOSTED_FIX_5540, '{"count":12,"finished":1}'].join('\n') + '\n';
  const out = attachWaits(HOSTED_CALLS, body, {enginePid: 5540, engineSide: 'fix'});
  assert.deepEqual(out.map(a => [a.label, a.waitMs, a.waitEvidence]), [['cold', 2029.243, 'signpost'], ['warm', 0.003, 'signpost']]);
  assert.deepEqual(out.map(a => [a.waitSlackMs, a.waitClockOffsetMs]), [[1.842, 129.1], [0.935, 132]]);
  assert.deepEqual(out.map(a => a.waitRequest.durationMs), [2126.158, 164.065]);
  assert.equal(attachWaits(HOSTED_CALLS, body, {enginePid: 5541, engineSide: 'fix'})[0].waitWhy, 'no-request', 'another pid reads none of it');
  assert.deepEqual(attachWaits(HOSTED_CALLS, body, {enginePid: 5540, engineSide: 'main'}).map(a => a.waitWhy), ['main-emitted-gate', 'main-emitted-gate']);
});

test('the gate inside the call\'s request gives the wait as its own wall difference, whatever the clock offset to the client', () => {
  const [a] = fix([call('click', 1000, 3130, {tag: 'kept'})], '{"count":0,"finished":1}', REAL, req(1, 1000, 3130, 'click'), gate(17, 1002.5, 1002.5 + 2029.243), line('event', 18, 1500));
  assert.equal(a.waitEvidence, 'signpost');
  assert.equal(a.waitMs, 2029.243);
  assert.equal(a.tag, 'kept', 'the call stays as it was, annotated');
  assert.deepEqual(a.waitIntervals.map(i => [i.signpostID, i.durationMs]), [['17', 2029.243]]);
  assert.equal(a.waitRequest.durationMs, 2130);
  assert.equal(a.waitClockOffsetMs, 128, 'the offset between the clocks is reported, not hidden: the 129 ms skew less the rpc\'s lead, to the whole millisecond Date.now() gives');
  assert.equal(a.waitWhy, undefined);
});

test('another request\'s gate is not taken, calls need not come in order, and the offset may differ call to call', () => {
  const lines = [req(1, 500, 900, 'get_app_state'), gate(2, 502, 502.01), req(3, 1000, 3130, 'click'), gate(4, 1002, 1002 + 2029.243), req(5, 4000, 4164, 'click'), gate(6, 4001, 4001.003)];
  const cold = call('click', 1000, 3130, {skew: 129}), warm = call('click', 4000, 4164, {skew: 133});
  assert.deepEqual(fix([warm, cold], lines).map(a => [a.waitMs, a.waitClockOffsetMs]), [[0.003, 132], [2029.243, 128]]);
  const obs = fix([call('get_app_state', 500, 900)], lines)[0];
  assert.deepEqual([obs.waitMs, obs.waitWhy, obs.waitPrologueMs], [null, 'no-interval', 0.01], 'an observation\'s wait is the walk\'s gate: the prologue\'s near-zero one does not stand in for it');
});

// A get_app_state's request holds the prologue's gate (near zero) and, after the enablement, the walk's own wait.
const obsGate = (id, begin, end, extra) => [line('begin', id, begin, {...extra, name: OBSERVATION_SIGNPOST}), line('end', id, end, {...extra, name: OBSERVATION_SIGNPOST})];
const observation = (begin, end, {skew = SKEW, ...extra} = {}) => call('get_app_state', begin, end, {skew, ...extra});

test('a get_app_state\'s wait is the observation interval, the prologue\'s near-zero gate kept beside it and not added', () => {
  const lines = [req(1, 500, 3100, 'get_app_state'), gate(2, 502, 502.004), obsGate(3, 900, 2999.5)];
  const timings = {chromiumReadyMs: 2099.4, chromiumReadyWaitMs: 2090, other: 1};
  const [a] = fix([observation(500, 3100, {raw: {result: {timings}}, tag: 'obs'})], lines);
  assert.deepEqual([a.waitMs, a.waitEvidence, a.waitWhy, a.tag], [2099.5, 'signpost', undefined, 'obs']);
  assert.deepEqual(a.waitIntervals.map(i => [i.signpostID, i.durationMs]), [['3', 2099.5]], 'the interval that makes the wait');
  assert.deepEqual([a.waitPrologueMs, a.waitPrologueIntervals.map(i => i.signpostID)], [0.004, ['2']]);
  assert.deepEqual([a.waitDeadline, a.waitReportedMs, a.waitSleptMs], [false, 2099.4, 2090], 'what the engine says of it, as audit');
  assert.equal(a.waitRequest.durationMs, 2600);
});

test('a deadline-cut observation is a measured near-zero wait with its marker, not an unknown', () => {
  const lines = [req(1, 500, 560, 'get_app_state'), gate(2, 502, 502.004), obsGate(3, 520, 520.12)];
  const [a] = fix([observation(500, 560, {raw: {result: {timings: {chromiumReady: 'deadline', chromiumReadyMs: 0.1}}}})], lines);
  assert.deepEqual([a.waitMs, a.waitEvidence, a.waitDeadline, a.waitReportedMs, a.waitSleptMs], [0.12, 'signpost', true, 0.1, 0]);
  const [bare] = fix([observation(500, 560)], lines);
  assert.deepEqual([bare.waitMs, bare.waitDeadline, bare.waitReportedMs, bare.waitSleptMs], [0.12, null, null, null], 'a call with no timings has no marker to read, and is still measured');
  const [failed] = fix([observation(500, 560, {raw: {error: {name: 'timeoutReached'}}})], lines);
  assert.deepEqual([failed.waitMs, failed.waitDeadline], [0.12, null], 'an observation that errored after its wait still waited');
});

test('an observation needs the walk\'s own pair: the prologue\'s alone, a broken one, a duplicate or a straddling one leave it unknown', () => {
  const base = [req(1, 500, 3100, 'get_app_state'), gate(2, 502, 502.004)];
  assert.deepEqual(verdicts(fix([observation(500, 3100)], base)), [[null, 'missing', 'no-interval']]);
  assert.equal(fix([observation(500, 3100)], base, line('begin', 3, 900, {name: OBSERVATION_SIGNPOST}))[0].waitWhy, 'incomplete');
  assert.equal(fix([observation(500, 3100)], base, line('end', 3, 900, {name: OBSERVATION_SIGNPOST}))[0].waitWhy, 'incomplete');
  assert.equal(fix([observation(500, 3100)], base, obsGate(3, 900, 950), line('begin', 3, 920, {name: OBSERVATION_SIGNPOST}))[0].waitWhy, 'duplicate');
  assert.equal(fix([observation(500, 3100)], base, obsGate(3, 900, 950), obsGate(4, 1000, 1050))[0].waitWhy, 'duplicate');
  assert.equal(fix([observation(500, 3100)], base, obsGate(3, 3000, 3200))[0].waitWhy, 'straddles-request');
  assert.equal(fix([observation(500, 3100)], base, obsGate(3, 900, 950), req(5, 400, 3200, 'click'))[0].waitWhy, 'ambiguous-request', 'a pair that two requests contain');
  assert.equal(fix([observation(500, 3100)], base, line('begin', 3, 900, {name: OBSERVATION_SIGNPOST}).slice(0, 150) + OBSERVATION_SIGNPOST)[0].waitWhy, 'unreadable-signpost');
});

test('a broken prologue gate beside a valid observation pair leaves the observation measured and the prologue unknown', () => {
  const [a] = fix([observation(500, 3100)], req(1, 500, 3100, 'get_app_state'), line('begin', 2, 502), obsGate(3, 900, 2999.5));
  assert.deepEqual([a.waitMs, a.waitEvidence, a.waitPrologueMs], [2099.5, 'signpost', null]);
  const [none] = fix([observation(500, 3100)], req(1, 500, 3100, 'get_app_state'), obsGate(3, 900, 2999.5));
  assert.deepEqual([none.waitMs, none.waitPrologueMs, none.waitPrologueIntervals], [2099.5, null, []]);
  const [two] = fix([observation(500, 3100)], req(1, 500, 3100, 'get_app_state'), gate(2, 502, 502.004), gate(4, 600, 600.002), obsGate(3, 900, 2999.5));
  assert.deepEqual([two.waitMs, two.waitPrologueMs, two.waitPrologueIntervals.length], [2099.5, null, 2], 'two prologue gates in one request: neither is the prologue\'s');
  const [stray] = fix([observation(500, 3100)], req(1, 500, 3100, 'get_app_state'), gate(2, 502, 502.004), line('end', 5, 700), obsGate(3, 900, 2999.5));
  assert.deepEqual([stray.waitMs, stray.waitPrologueMs], [2099.5, null]);
});

test('observations and actions together: each takes its own request and gate, in order, whatever order they are given', () => {
  const lines = [
    req(1, 500, 3100, 'get_app_state'), gate(2, 502, 502.004), obsGate(3, 900, 2999.5),           // the first observation waits
    req(4, 3300, 3460, 'click'), gate(5, 3302, 3302.003), obsGate(6, 3303, 3303.1),               // the click's request: an observation interval here is not its wait
    req(7, 9000, 9120, 'get_app_state'), gate(8, 9001, 9001.003), obsGate(9, 9050, 9050.01),      // a later observation waits for nothing
    req(10, 9300, 9460, 'click'), gate(11, 9302, 9302.002)];
  const o1 = observation(500, 3100), c1 = call('click', 3300, 3460, {skew: 130}), o2 = observation(9000, 9120, {skew: 131}), c2 = call('click', 9300, 9460, {skew: 131});
  const out = fix([c2, o2, c1, o1], lines);
  assert.deepEqual(out.map(a => [a.method, a.waitMs, a.waitEvidence, a.waitPrologueMs]), [['click', 0.002, 'signpost', undefined], ['get_app_state', 0.01, 'signpost', 0.003], ['click', 0.003, 'signpost', undefined], ['get_app_state', 2099.5, 'signpost', 0.004]]);
  assert.deepEqual(out.map(a => a.waitIntervals[0].signpostID), ['11', '9', '5', '3']);
  // The caller can hand observations and actions as one list and take them apart by identity, the copies in the order given.
  const mixed = [o1, c1, o2, c2], parted = fix(mixed, lines);
  assert.deepEqual(parted.map((a, i) => [a.method === mixed[i].method, a.startedAt === mixed[i].startedAt]), [[true, true], [true, true], [true, true], [true, true]]);
  assert.deepEqual(parted.map(a => a.waitMs), [2099.5, 0.003, 0.01, 0.002]);
  // Actions alone still work with no observation in the list: the unlisted requests are not theirs.
  assert.deepEqual(fix([c1, c2], lines).map(a => a.waitMs), [0.003, 0.002]);
  // A count that does not agree fails closed for that method only.
  assert.deepEqual(fix([o1, c1, c2], lines).map(a => [a.method, a.waitWhy]), [['get_app_state', 'request-count-mismatch'], ['click', undefined], ['click', undefined]]);
  assert.deepEqual(fix([o1, o2, c1], lines).map(a => [a.method, a.waitWhy]), [['get_app_state', undefined], ['get_app_state', undefined], ['click', 'request-count-mismatch']]);
});

test('a near-zero wait that was measured is a number, not missing and not an assumed zero', () => {
  const [a] = fix([call('click', 1000, 1040)], req(1, 1000, 1040, 'click'), gate(5, 1010, 1010.021));
  assert.equal(a.waitEvidence, 'signpost');
  assert.equal(a.waitMs, 0.021);
});

test('another process\'s intervals are not the engine\'s: a wrong pid alone leaves the call unknown, and with the right one beside it the right one is read', () => {
  const other = [req(1, 1000, 3130, 'click', {pid: 777}), gate(9, 1010, 2500, {pid: 777})];
  const [alone] = fix([call('click', 1000, 3130)], other);
  assert.deepEqual(verdicts([alone]), [[null, 'missing', 'no-request']]);
  const [both] = fix([call('click', 1000, 3130)], other, req(1, 1000, 3130, 'click'), gate(9, 1020, 1030));
  assert.deepEqual([both.waitMs, both.waitEvidence], [10, 'signpost'], 'the same ids under two processes pair apart');
  const read = readIntervals(text(other), {enginePid: ENGINE});
  assert.deepEqual([read.wait.pairs, read.request.pairs, read.otherProcess], [[], [], 4]);
});

test('a gate without its begin or end, or ending before it began, inside the request is incomplete and unknown, never zero', () => {
  for (const [name, lines] of [['begin only', [line('begin', 3, 1010)]], ['end only', [line('end', 3, 1500)]], ['end before begin', gate(3, 1500, 1010)]]) {
    const [a] = fix([call('click', 1000, 3130)], req(1, 1000, 3130, 'click'), lines);
    assert.deepEqual(verdicts([a]), [[null, 'missing', 'incomplete']], name);
  }
  const [straddle] = fix([call('click', 1000, 3130)], req(1, 1000, 3130, 'click'), gate(3, 3100, 3200));
  assert.deepEqual([straddle.waitMs, straddle.waitWhy, straddle.waitIntervals], [null, 'straddles-request', undefined], 'a pair that ends after the request is not its wait');
  const [empty] = fix([call('click', 1000, 3130)], req(1, 1000, 3130, 'click'));
  assert.deepEqual(verdicts([empty]), [[null, 'missing', 'no-interval']]);
  const [elsewhere] = fix([call('click', 1000, 3130)], req(1, 1000, 3130, 'click'), gate(3, 1100, 1200), req(2, 400, 600, 'get_app_state'), line('begin', 4, 500));
  assert.deepEqual(verdicts([elsewhere]), [[100, 'signpost', undefined]], 'a stray begin in another request spoils that request only');
});

test('a request that did not complete, or that has no begin to name its method, leaves the calls of its method unknown', () => {
  const unfinished = line('begin', 1, 1000, {name: REQUEST_SIGNPOST, message: 'click'});
  assert.deepEqual(verdicts(fix([call('click', 1000, 3130)], unfinished, req(2, 1000, 3130, 'click'), gate(3, 1010, 1020))), [[null, 'missing', 'request-incomplete']]);
  assert.deepEqual(verdicts(fix([call('click', 1000, 3130)], line('end', 1, 900, {name: REQUEST_SIGNPOST}), req(2, 1000, 3130, 'click'), gate(3, 1010, 1020))), [[null, 'missing', 'request-incomplete']]);
  assert.deepEqual(verdicts(fix([call('click', 1000, 3130)], unfinished.replace('"click"', '"get_app_state"'), req(2, 1000, 3130, 'click'), gate(3, 1010, 1020))), [[10, 'signpost', undefined]], 'another method\'s does not');
});

test('a truncated or malformed line that names the gate makes the fix\'s calls unknown; other malformed lines are skipped', () => {
  const base = [req(1, 1000, 3130, 'click'), gate(4, 1010, 1020)], c = () => [call('click', 1000, 3130)];
  const cut = line('begin', 3, 1010).slice(0, 200) + WAIT_SIGNPOST;
  assert.equal(fix(c(), base, cut)[0].waitWhy, 'unreadable-signpost');
  assert.equal(fix(c(), base, '{"not json', 'plain text')[0].waitMs, 10);
  assert.equal(fix(c(), base, line('begin', 4, 1010).replace('"signpostID":4,', ''))[0].waitWhy, 'unreadable-signpost', 'a begin without an id cannot be paired');
  assert.equal(fix(c(), base, line('end', 4, 1020).replace(/"timestamp":"[^"]*"/, '"timestamp":"yesterday"'))[0].waitWhy, 'unreadable-signpost');
  assert.equal(fix(c(), base, '{"signpostName":"request","oops')[0].waitWhy, 'unreadable-signpost', 'nor can a request line that is cut');
  assert.equal(attachWaits(c(), text(base[0], '{"signpostName":"request","oops'), {enginePid: ENGINE, engineSide: 'main'})[0].waitEvidence, 'main-no-gate', 'main reads no request');
});

test('duplicates are unknown: a second begin or end under one id, or two clean gates inside one request', () => {
  const base = req(1, 1000, 3130, 'click'), c = () => [call('click', 1000, 3130)];
  assert.deepEqual(verdicts(fix(c(), base, gate(8, 1010, 1020), line('begin', 8, 1015))), [[null, 'missing', 'duplicate']]);
  assert.equal(fix(c(), base, gate(8, 1010, 1020), line('end', 8, 1025))[0].waitWhy, 'duplicate');
  const [two] = fix(c(), base, gate(8, 1010, 1020), gate(9, 1100, 1200));
  assert.deepEqual([two.waitMs, two.waitWhy, two.waitIntervals.map(i => i.durationMs)], [null, 'duplicate', [10, 100]], 'a request has one gate: two cannot both be its wait');
  const dupRequest = fix(c(), base, req(1, 1000, 3130, 'click', {mach: 5}), gate(8, 1010, 1020));
  assert.equal(dupRequest[0].waitWhy, 'request-incomplete', 'a second begin under a request\'s id spoils the request');
});

test('the same log record twice (overlapping reads) counts once, but a second record at another tick is a duplicate', () => {
  const [rb, re] = req(1, 1000, 3130, 'click'), [gb, ge] = gate(8, 1010, 1020);
  assert.deepEqual(fix([call('click', 1000, 3130)], rb, rb, gb, gb, ge, re, ge, re).map(a => [a.waitMs, a.waitEvidence]), [[10, 'signpost']]);
  assert.equal(fix([call('click', 1000, 3130)], rb, re, gb, ge, line('begin', 8, 1010, {mach: 5}))[0].waitWhy, 'duplicate');
});

test('the request is the call\'s by method and order, checked: counts, overlap, and a duration that fits', () => {
  const requests = [req(1, 1000, 3130, 'click'), gate(2, 1002, 3031), req(3, 4000, 4164, 'click'), gate(4, 4001, 4001.003)];
  const cold = call('click', 1000, 3130), warm = call('click', 4000, 4164);
  assert.deepEqual(fix([cold, warm], requests).map(a => a.waitMs), [2029, 0.003]);
  assert.deepEqual(verdicts(fix([cold], requests)), [[null, 'missing', 'request-count-mismatch']], 'two requests, one call: which is it?');
  assert.deepEqual(verdicts(fix([cold, warm, call('click', 6000, 6100)], requests)).map(v => v[2]), ['request-count-mismatch', 'request-count-mismatch', 'request-count-mismatch']);
  assert.deepEqual(verdicts(fix([cold], '')), [[null, 'missing', 'no-request']]);
  // Swapped durations: the order says the cold call is the first request, the first request is not the cold call's.
  const swapped = fix([call('click', 4000, 4164), call('click', 1000, 3130)], req(1, 1000, 1164, 'click'), gate(2, 1001, 1001.003), req(3, 4000, 6130, 'click'), gate(4, 4001, 6030));
  assert.deepEqual(swapped.map(a => [a.waitWhy, a.waitMs]), [['request-mismatch', null], ['request-mismatch', null]]);
  assert.equal(swapped[0].waitSlackMs !== undefined && swapped[0].waitRequest !== undefined, true, 'the mismatch is shown');
  // A request a little longer than its call by the clocks' allowance is still its call's: Date.now() truncates each end.
  assert.equal(fix([{method: 'click', startedAt: T0 + 1129, endedAt: T0 + 1129 + 100}], req(1, 1000, 1100.9, 'click'), gate(2, 1010, 1020))[0].waitMs, 10);
  assert.equal(fix([{method: 'click', startedAt: T0 + 1129, endedAt: T0 + 1129 + 100}], req(1, 1000, 1102, 'click'), gate(2, 1010, 1020))[0].waitWhy, 'request-mismatch');
  // A request far shorter than its call is not its call's.
  assert.equal(fix([{method: 'click', startedAt: T0, endedAt: T0 + 2000}], req(1, 1000, 1164, 'click'), gate(2, 1010, 1020))[0].waitWhy, 'request-mismatch');
  assert.equal(attachWaits([{method: 'click', startedAt: T0, endedAt: T0 + 2000}], text(req(1, 1000, 1164, 'click'), gate(2, 1010, 1020)), {enginePid: ENGINE, engineSide: 'fix', maxRpcOverheadMs: 5000})[0].waitMs, 10, 'the bound is an option');
  // Two calls of one method that overlap in the client's time cannot be told apart by order.
  const overlapping = fix([call('click', 1000, 1100), call('click', 1050, 1150)], req(1, 1000, 1100, 'click'), gate(2, 1010, 1020), req(3, 1050, 1150, 'click'), gate(4, 1060, 1070));
  assert.deepEqual(overlapping.map(a => a.waitWhy), ['ambiguous-call', 'ambiguous-call']);
});

test('calls of different methods take their own requests; a call without a method or times is invalid', () => {
  const lines = [req(1, 1000, 3130, 'click'), gate(2, 1002, 3031), req(3, 3500, 5900, 'set_value'), gate(4, 3502, 5800)];
  assert.deepEqual(fix([call('set_value', 3500, 5900), call('click', 1000, 3130)], lines).map(a => [a.method, a.waitMs]), [['set_value', 2298], ['click', 2029]]);
  const invalid = fix([{startedAt: T0 + 1000, endedAt: T0 + 1100}, {method: 'click', startedAt: T0 + 1100, endedAt: T0 + 1000}, {method: 'click', startedAt: T0 + 1000}, null], lines);
  assert.deepEqual(invalid.map(a => a.waitWhy), ['invalid-call', 'invalid-call', 'invalid-call', 'invalid-call']);
  assert.equal(fix([call('click', 1000, 3130), {}], lines)[0].waitMs, 2029, 'one bad call does not spoil the others');
});

test('a gate that two requests both contain belongs to neither', () => {
  const [a] = fix([call('click', 1000, 3130)], req(1, 1000, 3130, 'click'), req(2, 900, 3300, 'get_app_state'), gate(3, 1010, 1020));
  assert.deepEqual([a.waitMs, a.waitWhy, a.waitIntervals.map(i => i.durationMs)], [null, 'ambiguous-request', [10]]);
});

test('64-bit ids that a double cannot tell apart still pair each begin with its own end, gates and requests alike', () => {
  const [x, y] = ['4611686018427387905', '4611686018427387906'], [p, q] = ['4611686018427387911', '4611686018427387912'];
  assert.equal(Number(x), Number(y), 'the premise: JSON.parse would merge these');
  const lines = [line('begin', p, 1000, {name: REQUEST_SIGNPOST, message: 'click'}), line('begin', q, 4000, {name: REQUEST_SIGNPOST, message: 'click'}),
    line('begin', x, 1010), line('begin', y, 4010), line('end', y, 4030), line('end', x, 1070), line('end', q, 4164, {name: REQUEST_SIGNPOST}), line('end', p, 1100, {name: REQUEST_SIGNPOST})];
  const out = fix([call('click', 1000, 1100), call('click', 4000, 4164)], lines);
  assert.deepEqual(out.map(a => [a.waitMs, a.waitEvidence, a.waitIntervals[0].signpostID, a.waitRequest.signpostID]), [[60, 'signpost', x, p], [20, 'signpost', y, q]]);
});

test('main has no readiness gate: its calls are main-no-gate with a deliberate 0, with or without signposts; a gate seen on main\'s pid voids them', () => {
  const calls = [call('click', 1000, 1100), call('click', 3000, 3200)];
  for (const body of ['', text(req(1, 1000, 1100, 'click'), REAL)]) {
    const out = attachWaits(calls, body, {enginePid: ENGINE, engineSide: 'main'});
    assert.deepEqual(out.map(a => [a.waitMs, a.waitEvidence, a.waitIntervals]), [[0, 'main-no-gate', undefined], [0, 'main-no-gate', undefined]]);
  }
  const odd = attachWaits(calls, text(gate(1, 3010, 3050)), {enginePid: ENGINE, engineSide: 'main'});
  assert.deepEqual(verdicts(odd), [[null, 'missing', 'main-emitted-gate'], [null, 'missing', 'main-emitted-gate']], 'the run was not main');
  assert.equal(attachWaits(calls, text(gate(1, 3010, 3050, {pid: 9})), {enginePid: ENGINE, engineSide: 'main'})[1].waitEvidence, 'main-no-gate', 'another process\'s is not main\'s');
  assert.deepEqual(attachWaits([{startedAt: 1}, null], '', {enginePid: ENGINE, engineSide: 'main'}).map(a => a.waitEvidence), ['main-no-gate', 'main-no-gate']);
  // An observation on main has no gate either: a known 0, with nothing of the fix's observation fields.
  const [obs] = attachWaits([observation(500, 900, {raw: {result: {timings: {}}}})], text(req(1, 500, 900, 'get_app_state')), {enginePid: ENGINE, engineSide: 'main'});
  assert.deepEqual([obs.waitMs, obs.waitEvidence, 'waitPrologueMs' in obs, 'waitDeadline' in obs], [0, 'main-no-gate', false, false]);
  const seen = attachWaits([observation(500, 900)], text(obsGate(1, 600, 700)), {enginePid: ENGINE, engineSide: 'main'});
  assert.deepEqual(verdicts(seen), [[null, 'missing', 'main-emitted-gate']], 'the observation\'s interval on main\'s pid says the run was not main');
  assert.equal(attachWaits(calls, text(line('begin', 3, 900, {name: OBSERVATION_SIGNPOST}).slice(0, 150) + OBSERVATION_SIGNPOST), {enginePid: ENGINE, engineSide: 'main'})[0].waitWhy, 'unreadable-signpost');
});

test('rescoring a row drops the verdict an earlier attach left on it, and the inputs are checked at the boundary and not mutated', () => {
  const calls = [call('click', 1000, 3130)], before = JSON.stringify(calls);
  const first = fix(calls, req(1, 1000, 3130, 'click'));
  assert.equal(first[0].waitWhy, 'no-interval');
  const again = fix(first, req(1, 1000, 3130, 'click'), gate(2, 1010, 1020));
  assert.deepEqual([again[0].waitMs, again[0].waitEvidence, 'waitWhy' in again[0]], [10, 'signpost', false]);
  const asMain = attachWaits(again, '', {enginePid: ENGINE, engineSide: 'main'});
  assert.deepEqual(['waitWhy' in asMain[0], 'waitRequest' in asMain[0], 'waitIntervals' in asMain[0], asMain[0].waitMs], [false, false, false, 0]);
  const watched = fix([observation(500, 900, {raw: {result: {timings: {chromiumReady: 'deadline'}}}})], req(1, 500, 900, 'get_app_state'), gate(2, 502, 502.1), obsGate(3, 520, 520.2));
  assert.equal(watched[0].waitDeadline, true);
  const asMainAgain = attachWaits(watched, '', {enginePid: ENGINE, engineSide: 'main'});
  assert.deepEqual(['waitPrologueMs', 'waitPrologueIntervals', 'waitDeadline', 'waitReportedMs', 'waitSleptMs'].map(k => k in asMainAgain[0]), [false, false, false, false, false]);
  assert.equal(JSON.stringify(calls), before);
  assert.throws(() => attachWaits(calls, '', {enginePid: ENGINE, engineSide: 'both'}), /engineSide/);
  assert.throws(() => attachWaits(calls, '', {enginePid: 0, engineSide: 'fix'}), /enginePid/);
  assert.throws(() => attachWaits(calls, '', {engineSide: 'fix'}), /enginePid/);
  assert.throws(() => attachWaits('calls', '', {enginePid: ENGINE, engineSide: 'fix'}), /calls/);
});

test('the capture reads the engine window once, from the earliest start to the latest end padded for the clock offset, and a failed read throws', async () => {
  const seen = [];
  const raw = await captureWaitSignposts([call('click', 2000, 2100), {startedAt: 'x'}, call('click', 1000, 1500), call('click', 3000, 4000)], {read: async (a, b) => { seen.push([+a, +b]); return 'RAW'; }});
  assert.equal(raw, 'RAW');
  const starts = [Math.floor(T0 + 1000 + SKEW - 0.6), Math.ceil(T0 + 4000 + SKEW + 0.9)];
  assert.deepEqual(seen, [[starts[0] - 4000, starts[1] + 4000]]);
  await captureWaitSignposts([{startedAt: 10, endedAt: 20}], {padMs: 0, read: async (a, b) => { assert.deepEqual([+a, +b], [10, 20]); return ''; }});
  assert.equal(await captureWaitSignposts([{startedAt: 1}], {read: async () => assert.fail('no window, no read')}), '');
  await assert.rejects(captureWaitSignposts([call('click', 1, 2)], {read: async () => { throw new Error('log show timed out'); }}), /timed out/);
});
