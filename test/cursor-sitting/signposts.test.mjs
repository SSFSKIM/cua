// The series' signposts (scripts/cursor-sitting/signposts.mjs; #235's task-8 report): the engine's read in chunks while
// the series runs, a FrameUpdate stream for the fps60 cap's proof only, and a coverage check that reads a series whose
// signposts do not cover every sample as incomplete. Checked without a Mac: a fake `log stream` and a fake `log show`.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {keepSeriesSignposts, logTimestampMs, signpostCoverage, startFrameStream, startSignpostChunks} from '../../scripts/cursor-sitting/signposts.mjs';

const scratch = t => { const dir = mkdtempSync(join(tmpdir(), 'cua-235-signposts-')); t.after(() => rmSync(dir, {recursive: true, force: true})); return dir; };
const HEADER = 'Filtering the log data using "…"\n';

// A fake `log stream`: each spawn a child whose stdout the test writes; `kill` ends it.
function fakeSpawn() {
  const children = [];
  const spawn = (command, args) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.args = args;
    child.exitCode = null;
    // As Node may: `exit` first, then the last of stdout (`late`), then `close` once stdout has ended.
    child.kill = signal => {
      child.killed = signal;
      setImmediate(() => {
        child.exitCode = 0;
        child.emit('exit', 0, signal);
        setImmediate(() => { if (child.late) child.stdout.write(child.late); child.stdout.end(); setImmediate(() => child.emit('close', 0, signal)); });
      });
      return true;
    };
    children.push(child);
    return child;
  };
  return {spawn, children};
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('a log timestamp is read as its instant, microseconds and zone included', () => {
  assert.equal(logTimestampMs('2026-10-31 10:10:19.681911-0700'), Date.parse('2026-10-31T17:10:19.681Z') + 0.911);
  assert.equal(logTimestampMs('2026-10-31 10:10:19-0700'), Date.parse('2026-10-31T17:10:19Z'));
  assert.equal(logTimestampMs('garbage'), null);
});

const FRAME = t => `{"signpostName":"FrameUpdate","subsystem":"com.apple.SkyLight","category":"tracing","machTimestamp":${t}}\n`;

test('the frame stream runs log stream --signpost on FrameUpdate and keeps the times, lines split across chunks joined', async () => {
  const {spawn, children} = fakeSpawn();
  const starting = startFrameStream({spawn, readyMs: 1000});
  await tick();
  assert.equal(children.length, 1, 'one stream: the frames, and only for the proof');
  assert.deepEqual(children[0].args.slice(0, 4), ['stream', '--signpost', '--style', 'ndjson'], 'plain `log stream` carries no signposts');
  assert.match(children[0].args.at(-1), /FrameUpdate/);
  children[0].stdout.write(HEADER);
  const frames = await starting;
  assert.equal(frames.started, true);
  const line = FRAME(300);
  children[0].stdout.write(line + line.slice(0, 20));
  children[0].stdout.write(FRAME(200).slice(0, 0) + line.slice(20).replace('300', '200'));
  await tick();
  assert.deepEqual(frames.frameTimes(), [200, 300]);
  const kept = await frames.stop();
  assert.equal(kept.ok, true);
  assert.equal(children[0].killed, 'SIGINT');
});

test('stop waits for the stream\'s close, so a frame delivered after its exit is in the snapshot', async () => {
  const {spawn, children} = fakeSpawn();
  const starting = startFrameStream({spawn, readyMs: 1000});
  await tick();
  children[0].stdout.write(HEADER);
  const frames = await starting;
  children[0].late = FRAME(400);
  assert.deepEqual((await frames.stop()).times, [400]);
});

test('a stream that never starts, or ends before it is stopped, is not ok, with why', async () => {
  const silent = fakeSpawn();
  const never = await startFrameStream({spawn: silent.spawn, readyMs: 20});
  assert.equal(never.started, false);
  assert.match((await never.stop()).error, /did not start/);
  const early = fakeSpawn();
  const starting = startFrameStream({spawn: early.spawn, readyMs: 1000});
  await tick();
  early.children[0].stdout.write(HEADER);
  const frames = await starting;
  early.children[0].emit('exit', 1, null);
  early.children[0].emit('close', 1, null);
  const kept = await frames.stop();
  assert.equal(kept.ok, false);
  assert.match(kept.error, /ended before .* \(exit 1\)/);
});

// An engine signpost line as `log show` gives it.
const line = (ms, id, type = 'event') => JSON.stringify({signpostName: 'request', signpostType: type, signpostID: id, processID: 7, machTimestamp: ms * 24_000, timestamp: stamp(ms)});

test('the engine\'s signposts are read only inside the gaps between samples, with an overlap, each line kept once', async t => {
  const dir = scratch(t), file = join(dir, 'signposts-12.ndjson');
  let clock = +at(0), inGap = false, sampling = false;
  const now = () => new Date(clock);
  const sleep = async ms => { clock += ms; };
  const asked = [];
  // The store: one line every 2 s; the second read fails; each read takes 400 ms of the clock.
  const store = Array.from({length: 60}, (_, k) => ({ms: k * 2000, text: line(k * 2000, k)}));
  const read = async (start, end) => {
    assert.equal(inGap && !sampling, true, 'a read runs only inside a gap, never under a sample');
    asked.push([+start - +at(0), +end - +at(0)]);
    clock += 400;
    if (asked.length === 2) throw new Error('log show timed out');
    return store.filter(e => +at(e.ms) >= +start - 1000 && +at(e.ms) <= +end + 1000).map(e => e.text).join('\n');
  };
  const chunks = startSignpostChunks({engineFile: file, since: now(), periodMs: 20_000, overlapMs: 10_000, marginMs: 1000, read, now, sleep});
  const gaps = [], rows = [];
  // Samples of 3 s, gaps of 6 s, for 100 s of the clock.
  while (clock < +at(100_000)) {
    sampling = true; clock += 3000; sampling = false;
    inGap = true;
    const from = clock;
    await chunks.gap(6000, row => rows.push(row));
    gaps.push(clock - from);
    inGap = false;
  }
  inGap = true;  // the series has ended: its final read runs after the last sample
  const kept = await chunks.stop();
  assert.ok(gaps.every(g => g === 6000), `a gap with a read in it still lasts its 6 s, the read inside it: ${gaps}`);
  // Each read is in the series' rows, started at its gap's start and ended at least the margin before the next sample.
  assert.equal(rows.length, asked.length - 1, "every read but the final one, after the last sample, is in the rows");
  for (const row of rows) {
    assert.equal(row.kind, 'signposts-read');
    assert.equal(row.end - row.start, 400);
    assert.ok((row.start - +at(0)) % 9000 === 3000, `a read starts as its gap does (${row.start - +at(0)})`);
  }
  assert.ok(asked.length >= 4 && asked.length <= 6, `${asked.length} reads: about one every 20 s`);
  assert.deepEqual(asked[2][0], asked[1][0], 'a failed read leaves the next to start where it would have');
  assert.deepEqual(kept.failures, ['log show timed out']);
  const ids = readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l).signpostID);
  const last = Math.floor((clock - +at(0) + 1000) / 2000);  // the final read's end, widened by 1 s
  assert.deepEqual(ids, Array.from({length: last + 1}, (_, k) => k), 'every line up to the final read once, in order');
});

test('a read that ran long holds the next sample to its end and the margin; one that would not fit waits for another gap', async t => {
  const dir = scratch(t);
  let clock = +at(0);
  const read = async () => { clock += 5500; return ''; };  // 5.5 s a read
  const chunks = startSignpostChunks({engineFile: join(dir, 'a.ndjson'), since: new Date(clock), periodMs: 1000, overlapMs: 0, marginMs: 1000, read,
    now: () => new Date(clock), sleep: async ms => { clock += ms; }});
  clock += 2000;
  let from = clock;
  await chunks.gap(6000);  // the first read: its length not yet known, so it runs, and runs long
  assert.equal(clock - from, 6500, 'the next sample waits for the read and its margin: 5.5 s + 1 s');
  from = clock;
  await chunks.gap(6000);  // 5.5 s + 1 s does not fit in 6 s
  assert.equal(clock - from, 6000, 'no read: the gap is the gap');
  from = clock;
  await chunks.gap(8000);
  assert.equal(clock - from, 8000, 'a longer gap takes it, its margin inside');
  assert.equal((await chunks.stop()).reads, 3, 'two in gaps and the final one');
});

test('a series\' signposts are kept by chunked reads only: no stream runs under its timed samples', async t => {
  const dir = scratch(t), file = join(dir, 'signposts-12.ndjson');
  let reads = 0;
  const {result, signposts} = await keepSeriesSignposts({engineFile: file, run: async ({gap}) => { assert.equal(typeof gap, 'function'); return 'ran'; },
    read: async () => { reads++; return line(1000, 1); }, spawn: () => { throw new Error('no stream may start for a series'); }});
  assert.equal(result, 'ran');
  assert.ok(reads >= 1);
  assert.equal(signposts.ok, true);
  assert.match(readFileSync(file, 'utf8'), /"signpostID":1/);
});

// The engine's signposts as log stream gives them, at local wall times; the item's rows at Date.now() times.
const at = ms => new Date(Date.UTC(2026, 9, 31, 16, 0, 0) + ms);
const stamp = ms => {
  const d = at(ms), pad = (n, w = 2) => String(n).padStart(w, '0');
  // As log prints it in -0700: the UTC hour minus 7.
  return `2026-10-31 ${pad(d.getUTCHours() - 7)}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}000-0700`;
};
// A request interval's begin as log streams it (its message the method), and a cursor's window-state read.
const request = (ms, method) => JSON.stringify({signpostName: 'request', signpostType: 'begin', eventMessage: method, subsystem: 'io.github.ssfskim.cua.engine', timestamp: stamp(ms)});
const windowList = ms => JSON.stringify({signpostName: 'cursor.windowList', signpostType: 'begin', eventMessage: '', subsystem: 'io.github.ssfskim.cua.engine', timestamp: stamp(ms)});
// Six press_key samples, each cell from its startedAt to its row's at, with the 6 s waits (no row) between them.
const rows = () => [{kind: 'start', at: +at(0)}, {kind: 'task', at: +at(1000)},
  ...Array.from({length: 6}, (_, i) => ({kind: 'cell', ok: true, startedAt: +at(7000 + i * 7000), at: +at(7500 + i * 7000), sample: {side: i % 2 ? 'off' : 'on', i: i >> 1, covers: ['press_key x30']}})),
  {kind: 'cell', ok: false, startedAt: +at(49_000), at: +at(49_100), sample: {side: 'on', i: 3, covers: ['press_key x30']}}, {kind: 'close', at: +at(50_000)}];
const pressKeys = i => request(7100 + i * 7000, 'press_key');

test('a sample is covered only by a request of its own timed method inside its own cell', () => {
  const all = Array.from({length: 6}, (_, i) => pressKeys(i)).join('\n');
  const complete = signpostCoverage(all, rows());
  assert.equal(complete.complete, true);
  assert.deepEqual([complete.samples, complete.covered], [6, 6], 'a failed cell is not a sample');
  // The read lost the series' start (the second sitting): the first three samples have none.
  const short = signpostCoverage([3, 4, 5].map(pressKeys).join('\n'), rows());
  assert.equal(short.complete, false);
  assert.deepEqual(short.missing, [{side: 'on', i: 0}, {side: 'off', i: 0}, {side: 'on', i: 1}]);
  assert.match(short.why, /3 of 6 samples have no request signpost of their own; the first signpost is 21\.1 s after the series' first sample began/);
  // A visible cursor's window-state reads in the 6 s wait, a request of another method, or one just outside the cell,
  // do not cover it.
  const borrowed = [windowList(6600), request(7200, 'click'), request(6900, 'press_key'), ...[1, 2, 3, 4, 5].map(pressKeys)].join('\n');
  assert.deepEqual(signpostCoverage(borrowed, rows()).missing, [{side: 'on', i: 0}]);
  // A typing sample needs both its methods.
  const typing = [{kind: 'start', at: +at(0)}, {kind: 'cell', ok: true, startedAt: +at(1000), at: +at(3000), sample: {side: 'on', i: 0, covers: ['type_text', 'press_key x30']}}];
  assert.equal(signpostCoverage(request(1500, 'type_text'), typing).complete, false);
  assert.equal(signpostCoverage([request(1500, 'type_text'), request(2500, 'press_key')].join('\n'), typing).complete, true);
  // Clicks: each sample names its one series.
  const clicks = [{kind: 'start', at: +at(0)}, {kind: 'cell', ok: true, startedAt: +at(1000), at: +at(1100), sample: {side: 'off', i: 0, series: 'drag'}}];
  assert.equal(signpostCoverage(request(1050, 'drag'), clicks).complete, true);
  assert.equal(signpostCoverage('', rows()).complete, false);
  assert.match(signpostCoverage('', rows()).why, /no engine signpost/);
});
