// The series' signposts, streamed while the series runs (scripts/cursor-sitting/signposts.mjs; #235's task-8 report): the
// engine's into the item's file, WindowServer's FrameUpdate times kept in memory, and a coverage check that reads a
// series whose signposts do not cover every sample as incomplete. Checked without a Mac: a fake `log stream`.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {logTimestampMs, signpostCoverage, startSignpostStreams} from '../../scripts/cursor-sitting/signposts.mjs';

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
    child.kill = signal => { child.killed = signal; setImmediate(() => { child.exitCode = 0; child.stdout.end(); child.emit('exit', 0, signal); }); return true; };
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

test('the streams start before the series, stream the engine\'s signposts to its file and keep the frame times', async t => {
  const dir = scratch(t), {spawn, children} = fakeSpawn();
  const starting = startSignpostStreams({engineFile: join(dir, 'signposts-12.ndjson'), spawn, readyMs: 1000});
  await tick();
  assert.equal(children.length, 2);
  for (const child of children) {
    assert.deepEqual(child.args.slice(0, 4), ['stream', '--signpost', '--style', 'ndjson'], 'log stream --signpost: plain `log stream` carries none');
  }
  assert.match(children[0].args.at(-1), /io\.github\.ssfskim\.cua\.engine/);
  assert.match(children[1].args.at(-1), /FrameUpdate/);
  for (const child of children) child.stdout.write(HEADER);
  const streams = await starting;
  children[0].stdout.write('{"signpostName":"request","machTimestamp":5}\n{"signpostName":"cursor.motion","machTimestamp":6}\n');
  children[1].stdout.write('{"signpostName":"FrameUpdate","subsystem":"com.apple.SkyLight","category":"tracing","machTimestamp":300}\n{"signpostName":"FrameUpd');
  children[1].stdout.write('ate","subsystem":"com.apple.SkyLight","category":"tracing","machTimestamp":200}\n');
  await tick();
  assert.deepEqual(streams.frameTimes(), [200, 300], 'lines split across chunks are joined');
  const kept = await streams.stop();
  assert.equal(kept.engine.ok, true);
  assert.equal(kept.frames.ok, true);
  assert.deepEqual(kept.frames.times, [200, 300]);
  assert.equal(children.every(c => c.killed === 'SIGINT'), true);
  const text = readFileSync(join(dir, 'signposts-12.ndjson'), 'utf8');
  assert.match(text, /"request".*\n.*"cursor\.motion"/);
  assert.doesNotMatch(text, /Filtering/);
});

test('a stream that never starts, or ends before the series does, is not ok, with why', async t => {
  const dir = scratch(t);
  const silent = fakeSpawn();
  const never = await startSignpostStreams({engineFile: join(dir, 'a.ndjson'), spawn: silent.spawn, readyMs: 20});
  assert.equal(never.started, false);
  const stopped = await never.stop();
  assert.equal(stopped.engine.ok, false);
  assert.match(stopped.engine.error, /did not start/);
  const early = fakeSpawn();
  const starting = startSignpostStreams({engineFile: join(dir, 'b.ndjson'), spawn: early.spawn, readyMs: 1000});
  await tick();
  for (const child of early.children) child.stdout.write(HEADER);
  const streams = await starting;
  early.children[1].exitCode = 1;
  early.children[1].emit('exit', 1, null);
  const kept = await streams.stop();
  assert.equal(kept.engine.ok, true);
  assert.equal(kept.frames.ok, false);
  assert.match(kept.frames.error, /ended before the series did \(exit 1\)/);
});

// The engine's signposts as log stream gives them, at local wall times; the item's rows at Date.now() times.
const at = ms => new Date(Date.UTC(2026, 9, 31, 16, 0, 0) + ms);
const stamp = ms => {
  const d = at(ms), pad = (n, w = 2) => String(n).padStart(w, '0');
  // As log prints it in -0700: the UTC hour minus 7.
  return `2026-10-31 ${pad(d.getUTCHours() - 7)}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}000-0700`;
};
const signpost = ms => JSON.stringify({signpostName: 'request', subsystem: 'io.github.ssfskim.cua.engine', timestamp: stamp(ms)});
const rows = () => [{kind: 'start', at: +at(0)}, {kind: 'task', at: +at(1000)},
  ...Array.from({length: 6}, (_, i) => ({kind: 'cell', ok: true, at: +at(2000 + i * 1000), sample: {side: i % 2 ? 'off' : 'on', i: i >> 1}})),
  {kind: 'cell', ok: false, at: +at(9000), sample: {side: 'on', i: 3}}, {kind: 'close', at: +at(10_000)}];

test('a series is complete only when every sample\'s cell has an engine signpost of its own', () => {
  const all = [1500, ...Array.from({length: 6}, (_, i) => 1500 + i * 1000 + 200)].map(signpost).join('\n');
  const complete = signpostCoverage(all, rows());
  assert.equal(complete.complete, true);
  assert.deepEqual([complete.samples, complete.covered], [6, 6], 'a failed cell is not a sample');
  assert.equal(complete.first, +at(1500));
  // The read lost the series' start (the second sitting): the first three samples have none.
  const late = [4700, 5700, 6700].map(signpost).join('\n');
  const short = signpostCoverage(late, rows());
  assert.equal(short.complete, false);
  assert.deepEqual(short.missing, [{side: 'on', i: 0}, {side: 'off', i: 0}, {side: 'on', i: 1}]);
  assert.match(short.why, /3 of 6 samples have no engine signpost; the first signpost is 3\.7 s after the series' first sample began/);
  assert.equal(signpostCoverage('', rows()).complete, false);
  assert.match(signpostCoverage('', rows()).why, /no engine signpost/);
});
