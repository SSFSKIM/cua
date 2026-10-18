// The during-run watch (scripts/mini-watch.mjs, #157): what ends a run in each mode, that only the root's tree is ended,
// and that every line goes to the log the caller names.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {holdingIn, judge, watch} from '../scripts/mini-watch.mjs';
import {TERMINAL, Unread} from '../scripts/mini-rules.mjs';

const idle = {front: TERMINAL, busy: false, workers: 0, queued: 0, load: 1, seen: []};

test('kill mode: any work ends the run; a queued job does not count inside a hold; a dialog always ends it', () => {
  assert.deepEqual(judge({o: idle, mode: 'kill'}).why, []);
  assert.deepEqual(judge({o: {...idle, busy: true}, mode: 'kill'}).why, ['runner busy']);
  assert.deepEqual(judge({o: {...idle, queued: 2}, mode: 'kill'}).why, ['2 queued macOS job(s)']);
  assert.deepEqual(judge({o: {...idle, queued: 2}, mode: 'kill', inHold: true}).why, []);
  assert.deepEqual(judge({o: {...idle, workers: 1}, mode: 'dialog-only'}).why, []);
  assert.deepEqual(judge({o: {...idle, front: 'com.apple.SecurityAgent'}, mode: 'dialog-only'}).why, ['com.apple.SecurityAgent in front']);
});

test('pause-aware mode: ends only when the pause cannot be trusted', () => {
  const ok = {paused: true, beatAgeS: 10, holding: true};
  assert.deepEqual(judge({o: {...idle, busy: true}, mode: 'pause-aware', pause: ok}).why, []);
  assert.deepEqual(judge({o: {...idle, busy: true}, mode: 'pause-aware', pause: {...ok, beatAgeS: 120}}).why, ['pause heartbeat 120 s old']);
  // The pause file absent while the runner works: the second such reading ends the run.
  const first = judge({o: {...idle, busy: true}, mode: 'pause-aware', pause: {paused: false, beatAgeS: 5, holding: false}});
  assert.deepEqual(first.why, []);
  assert.deepEqual(judge({o: {...idle, busy: true}, mode: 'pause-aware', pause: {paused: false, beatAgeS: 5, holding: false}, state: first.state}).why, ['no pause file on two readings while runner busy']);
  // A pause on for over a minute with no cell held at a boundary.
  const t0 = 1_000_000, on = judge({o: idle, mode: 'pause-aware', pause: {...ok, holding: false}, now: t0});
  assert.deepEqual(on.why, []);
  assert.deepEqual(judge({o: idle, mode: 'pause-aware', pause: {...ok, holding: false}, state: on.state, now: t0 + 61_000}).why, ['a cell still running 60 s after the pause began']);
  assert.deepEqual(judge({o: idle, mode: 'pause-aware', pause: ok, state: on.state, now: t0 + 61_000}).why, []);
});

test('holding: the run log\'s latest pause line decides', () => {
  assert.equal(holdingIn('x paused before a\n'), true);
  assert.equal(holdingIn('x paused before a\nresumed at a\n'), false);
  assert.equal(holdingIn(''), false);
});

test('the loop logs each reading, retries an unread one, ends only the root\'s tree on a stop, and exits when the root is gone', async () => {
  const lines = [], ended = [];
  const readings = [() => { throw new Unread('gh failed'); }, () => idle, () => ({...idle, busy: true})];
  const code = await watch({root: 77, mode: 'kill', log: line => lines.push(line), observe: () => readings.shift()(), alive: () => true,
    endTree: async pid => { ended.push(pid); return [78, pid]; }, sleep: async () => {}});
  assert.equal(code, 4);
  assert.deepEqual(ended, [77]);
  assert.match(lines[0], /started for pid 77 \(mode kill\)/);
  assert.ok(lines.some(l => /unread observation \(unread: gh failed\)/.test(l)));
  assert.ok(lines.some(l => /STOP the run: runner busy/.test(l)));
  assert.equal(lines.at(-1), 'ended pids 78 77');
  let n = 0;
  assert.equal(await watch({root: 77, log: line => lines.push(line), observe: () => idle, alive: () => n++ < 2, endTree: async () => assert.fail('no stop'), sleep: async () => {}}), 0);
  assert.equal(lines.at(-1), 'the run ended on its own; no stop');
});

test('the CLI refuses without a root and a log (no log path is ever assumed)', () => {
  const cli = fileURLToPath(new URL('../scripts/mini-watch.mjs', import.meta.url));
  for (const args of [[], ['--root', '123'], ['--log', '/tmp/x'], ['--root', '123', '--log', '/tmp/x', '--mode', 'pause-aware']]) {
    const r = spawnSync(process.execPath, [cli, ...args], {encoding: 'utf8'});
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /usage: mini-watch\.mjs/);
  }
});
