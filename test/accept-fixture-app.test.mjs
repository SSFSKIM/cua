// The fixture app's cleanup (scripts/accept/fixture-app.mjs, #157): only the launch the run recorded right after its
// `open` is quit, only while it is still that process and only when the caller confirms it holds no window but the
// fixture's; a process that was running before, or one the owner starts
// mid-run, is never touched, and the front goes back to the app that had it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {awaitLaunch, captureLaunch, cleanUpFixtureApp, isSameLaunch, parseLaunch, quitOwned, restoreFront} from '../scripts/accept/fixture-app.mjs';

test('ps lstart text (C locale, UTC) parses to epoch ms; anything else is null', () => {
  assert.equal(parseLaunch('Sun Oct 18 02:51:07 2026    \n'), Date.parse('2026-10-18T02:51:07Z'));
  assert.equal(parseLaunch('Mon Oct  5 09:01:02 2026'), Date.parse('2026-10-05T09:01:02Z'));
  // A US fall-back hour (01:00-02:00 local happens twice on 2026-11-01): in UTC each instant has one text, so the second
  // occurrence (06:30Z, 01:30 EST) is not read as the first (05:30Z, 01:30 EDT), whatever this process's time zone.
  assert.equal(parseLaunch('Sun Nov  1 06:30:00 2026'), Date.parse('2026-11-01T06:30:00Z'));
  assert.equal(parseLaunch('Sun Nov  1 05:30:00 2026'), Date.parse('2026-11-01T05:30:00Z'));
  for (const bad of ['', '2026년 10월 18일 일요일 10시 53분 03초', 'Sun Foo 18 02:51:07 2026']) assert.equal(parseLaunch(bad), null, bad);
});

test('launch capture right after the open: one new pid launched in or after the run\'s first second is the run\'s; none or several record none', () => {
  const startedAt = Date.parse('2026-10-18T10:00:05.700Z');
  const launches = {11: Date.parse('2026-10-18T10:00:05.000Z'), 12: Date.parse('2026-10-18T10:00:04.000Z'), 13: Date.parse('2026-10-18T10:00:09.000Z'), 14: null, 15: Date.parse('2026-10-18T10:00:09.000Z')};
  const launchOf = pid => launches[pid];
  // 12 launched before the run, 14 unreadable, 15 was running before: 11 is the run's.
  assert.deepEqual(captureLaunch({pids: [11, 12, 14, 15], before: [15], startedAt, launchOf}), {launch: {pid: 11, at: launches[11]}, candidates: [11]});
  // The document went to a TextEdit already running: nothing is the run's.
  assert.deepEqual(captureLaunch({pids: [15], before: [15], startedAt, launchOf}), {launch: null, candidates: []});
  // Two new launches (the owner started one too): ambiguous, nothing recorded.
  assert.deepEqual(captureLaunch({pids: [11, 13, 15], before: [15], startedAt, launchOf}), {launch: null, candidates: [11, 13]});
});

test('a recorded launch is still that process only while its pid has the same launch time', () => {
  const at = Date.parse('2026-10-18T10:00:06.000Z');
  assert.equal(isSameLaunch({pid: 42, at}, {launchOf: () => at}), true);
  assert.equal(isSameLaunch({pid: 42, at}, {launchOf: () => at + 60_000}), false);  // the pid was reused
  assert.equal(isSameLaunch({pid: 42, at}, {launchOf: () => null}), false);         // gone or unreadable
  assert.equal(isSameLaunch(null, {launchOf: () => at}), false);
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

const startedAt = Date.parse('2026-10-18T10:00:05.000Z');
const ours = {pid: 42, at: startedAt + 2000};
// A cleanup with fakes: `running` pids and their launch times; `quit` records what it was asked to signal.
async function cleanup({launch = ours, alone = true, before = [7], running = [7, 42], launches = {7: startedAt - 3_600_000, 42: ours.at}} = {}) {
  const quitCalls = []; let front = 'com.apple.TextEdit';
  const r = await cleanUpFixtureApp({name: 'TextEdit', bundle: 'com.apple.TextEdit', run: {before, front: 'com.apple.Terminal', launch}, alone,
    pids: () => running, launchOf: pid => launches[pid] ?? null,
    quit: async pids => { quitCalls.push(pids); return {quit: pids, remaining: []}; },
    frontmost: () => front, activate: id => { front = id; }, sleep: async () => {}});
  return {r, quitCalls};
}

test('cleanup: the recorded launch, confirmed alone, is quit; a TextEdit running before is kept; the front is handed back', async () => {
  const {r, quitCalls} = await cleanup();
  assert.deepEqual(quitCalls, [[42]]);
  assert.deepEqual({quit: r.quit, remaining: r.remaining, leftRunning: r.leftRunning, keptBefore: r.keptBefore, restored: r.front.restored}, {quit: [42], remaining: [], leftRunning: null, keptBefore: [7], restored: true});
});

test('cleanup: the run\'s own launch not confirmed to hold only the fixture\'s windows is left running, unsignalled, and the front still goes back', async () => {
  for (const alone of [false, null, 'yes', 1]) {
    const {r, quitCalls} = await cleanup({alone});
    assert.deepEqual(quitCalls, [], String(alone));
    assert.deepEqual({live: r.live, alone: r.alone, quit: r.quit, leftRunning: r.leftRunning, restored: r.front.restored}, {live: true, alone: false, quit: [], leftRunning: 42, restored: true}, String(alone));
  }
  // Omitted, the confirmation is absent too.
  const omitted = await cleanUpFixtureApp({name: 'TextEdit', bundle: 'com.apple.TextEdit', run: {before: [], front: null, launch: ours}, pids: () => [42], launchOf: () => ours.at,
    quit: async () => assert.fail('nothing may be signalled'), frontmost: () => 'com.apple.Terminal', sleep: async () => {}});
  assert.equal(omitted.leftRunning, 42);
});

test('cleanup: running before (nothing recorded) is never quit, and the front still goes back', async () => {
  const {r, quitCalls} = await cleanup({launch: null, running: [7]});
  assert.deepEqual(quitCalls, []);
  assert.deepEqual({keptBefore: r.keptBefore, restored: r.front.restored}, {keptBefore: [7], restored: true});
});

test('cleanup: a TextEdit the owner launches mid-run is never selected (nothing is re-scanned)', async () => {
  // The document went to the TextEdit running before, so nothing was recorded; the owner then starts pid 50.
  const {quitCalls} = await cleanup({launch: null, running: [7, 50], launches: {7: startedAt - 3_600_000, 50: startedAt + 30_000}});
  assert.deepEqual(quitCalls, []);
  // Ours exited, and the owner relaunched TextEdit as pid 50: still only the recorded pid is a candidate, and it is gone.
  const relaunched = await cleanup({running: [50], launches: {50: startedAt + 30_000}});
  assert.deepEqual(relaunched.quitCalls, []);
});

test('cleanup: a reused pid (the recorded pid, another launch time) is not quit', async () => {
  const {r, quitCalls} = await cleanup({running: [42], launches: {42: ours.at + 120_000}});
  assert.deepEqual(quitCalls, []);
  assert.equal(r.live, false);
});

test('cleanup: an ambiguous launch records nothing, so nothing is quit', async () => {
  const captured = captureLaunch({pids: [42, 50], before: [], startedAt, launchOf: pid => ({42: ours.at, 50: ours.at + 1000})[pid]});
  assert.equal(captured.launch, null);
  const {quitCalls} = await cleanup({launch: captured.launch, before: [], running: [42, 50], launches: {42: ours.at, 50: ours.at + 1000}});
  assert.deepEqual(quitCalls, []);
});

test('awaitLaunch: polls until the new pid is listed and times it; past the bound a miss; with an app running before, one reading', async () => {
  let t = 0; const at = Date.UTC(2026, 9, 18, 10, 0, 6);
  const listings = [[], [], [42]];
  const r = await awaitLaunch({pids: () => listings.shift() ?? [42], before: [], startedAt: at - 500, launchOf: () => at, now: () => t, sleep: async ms => { t += ms; }, pollMs: 100});
  assert.deepEqual({launch: r.launch, waitedMs: r.waitedMs, missed: r.missed}, {launch: {pid: 42, at}, waitedMs: 200, missed: false});
  t = 0;
  const miss = await awaitLaunch({pids: () => [], before: [], startedAt: at, launchOf: () => at, now: () => t, sleep: async ms => { t += ms; }, boundMs: 1000, pollMs: 100});
  assert.deepEqual({launch: miss.launch, missed: miss.missed, waitedMs: miss.waitedMs}, {launch: null, missed: true, waitedMs: 1000});
  let reads = 0;
  const running = await awaitLaunch({pids: () => { reads++; return [7]; }, before: [7], startedAt: at, launchOf: () => at - 60_000, now: () => 0, sleep: async () => assert.fail('no poll')});
  assert.deepEqual({launch: running.launch, missed: running.missed, reads}, {launch: null, missed: false, reads: 1});
});

test('awaitLaunch: a late reading past the bound is a miss even when it lists the new pid', async () => {
  let t = 0; const at = Date.UTC(2026, 9, 18, 10, 0, 6);
  const listings = [[], [42]];
  const late = await awaitLaunch({pids: () => listings.shift(), before: [], startedAt: at - 500, launchOf: () => at, now: () => t,
    sleep: async () => { t = 12_000; }, boundMs: 10_000, pollMs: 100});
  assert.deepEqual({launch: late.launch, missed: late.missed, waitedMs: late.waitedMs}, {launch: null, missed: true, waitedMs: 12_000});
});
