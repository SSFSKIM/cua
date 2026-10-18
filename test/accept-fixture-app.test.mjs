// The fixture app's cleanup (scripts/accept/fixture-app.mjs, #157): only a launch the run caused is quit, a process
// that was running before is never touched, and the front goes back to the app that had it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanUpFixtureApp, ownedLaunches, parseLaunch, quitOwned, restoreFront} from '../scripts/accept/fixture-app.mjs';

test('ps lstart text (C locale) parses to local epoch ms; anything else is null', () => {
  assert.equal(parseLaunch('Sun Oct 18 02:51:07 2026    \n'), new Date(2026, 9, 18, 2, 51, 7).getTime());
  assert.equal(parseLaunch('Mon Oct  5 09:01:02 2026'), new Date(2026, 9, 5, 9, 1, 2).getTime());
  for (const bad of ['', '2026년 10월 18일 일요일 10시 53분 03초', 'Sun Foo 18 02:51:07 2026']) assert.equal(parseLaunch(bad), null, bad);
});

test('ownership by launch: absent before the run and launched in or after its first second; unreadable is not ours', () => {
  const startedAt = Date.parse('2026-10-18T10:00:05.700Z');
  const launches = {11: Date.parse('2026-10-18T10:00:05.000Z'), 12: Date.parse('2026-10-18T10:00:04.000Z'), 13: Date.parse('2026-10-18T10:00:09.000Z'), 14: null, 15: Date.parse('2026-10-18T10:00:09.000Z')};
  const owned = ownedLaunches({pids: [11, 12, 13, 14, 15], before: [15], startedAt, launchOf: pid => launches[pid]});
  assert.deepEqual(owned, [11, 13]);  // 12 launched before the run, 14 unreadable, 15 was running before
});

test('quitOwned: SIGTERM, then waits for each to go; one that stays is reported', async () => {
  const live = new Set([1, 2]), sent = [];
  const r = await quitOwned([1, 2], {kill: (pid, s) => { sent.push([pid, s]); if (pid === 1) live.delete(pid); }, alive: pid => live.has(pid), sleep: async () => {}, waitMs: 300});
  assert.deepEqual(sent, [[1, 'SIGTERM'], [2, 'SIGTERM']]);
  assert.deepEqual(r, {quit: [1], remaining: [2]});
});

test('restoreFront activates the previous front only when another app holds it, and confirms it', async () => {
  let front = 'com.apple.TextEdit'; const activated = [];
  const r = await restoreFront('com.apple.Terminal', {frontmost: () => front, activate: id => { activated.push(id); front = id; }, app: 'com.apple.TextEdit', sleep: async () => {}});
  assert.deepEqual(r, {previous: 'com.apple.Terminal', before: 'com.apple.TextEdit', after: 'com.apple.Terminal', restored: true});
  assert.deepEqual(activated, ['com.apple.Terminal']);
  // Already in front, unknown before, or the fixture app itself: nothing is activated.
  for (const previous of ['com.apple.Terminal', null, 'com.apple.TextEdit']) {
    const calls = [];
    await restoreFront(previous, {frontmost: () => (previous === 'com.apple.Terminal' ? previous : 'com.apple.Safari'), activate: id => calls.push(id), app: 'com.apple.TextEdit', sleep: async () => {}});
    assert.deepEqual(calls, [], String(previous));
  }
  // An activation that never takes is reported, not assumed.
  const stuck = await restoreFront('com.apple.Terminal', {frontmost: () => 'com.apple.TextEdit', activate: () => {}, app: 'com.apple.TextEdit', sleep: async () => {}, waitMs: 400});
  assert.equal(stuck.restored, false);
});

test('cleanup: the run\'s own launch is quit, a TextEdit running before is kept, the front is handed back', async () => {
  const startedAt = Date.parse('2026-10-18T10:00:05.000Z');
  let running = [7, 42], front = 'com.apple.TextEdit';
  const quitCalls = [];
  const r = await cleanUpFixtureApp({name: 'TextEdit', bundle: 'com.apple.TextEdit', run: {startedAt, before: [7], front: 'com.apple.Terminal'},
    pids: () => running, launchOf: pid => (pid === 42 ? startedAt + 2000 : startedAt - 3_600_000),
    quit: async pids => { quitCalls.push(pids); running = running.filter(p => !pids.includes(p)); return {quit: pids, remaining: []}; },
    frontmost: () => front, activate: id => { front = id; }, sleep: async () => {}});
  assert.deepEqual(quitCalls, [[42]]);
  assert.deepEqual({owned: r.owned, quit: r.quit, remaining: r.remaining, keptBefore: r.keptBefore, restored: r.front.restored}, {owned: [42], quit: [42], remaining: [], keptBefore: [7], restored: true});
  // Nothing launched by the run (the document went to the TextEdit already running): nothing is quit.
  const none = await cleanUpFixtureApp({name: 'TextEdit', bundle: 'com.apple.TextEdit', run: {startedAt, before: [7], front: 'com.apple.Terminal'},
    pids: () => [7], launchOf: () => startedAt - 1000, quit: async () => assert.fail('nothing to quit'), frontmost: () => 'com.apple.Terminal', sleep: async () => {}});
  assert.deepEqual({owned: none.owned, keptBefore: none.keptBefore}, {owned: [], keptBefore: [7]});
});
