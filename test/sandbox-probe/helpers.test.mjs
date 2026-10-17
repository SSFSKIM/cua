// Experiment A's native-helper bookkeeping (#115 M0, scripts/sandbox-probe/helpers.mjs): a helper is this run's only
// when its environment names this run's own CLI slot, so a helper the owner or another harness starts mid-run is never
// adopted or stopped; a helper whose ownership cannot be read is an error, not "none".
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHelperTracker} from '../../scripts/sandbox-probe/helpers.mjs';

const SLOT = '/scratch/run-abc/codex';
// A desktop of helpers: `clis` maps a pid to its CODEX_CLI_PATH (null: none set), `alive` is what runs.
const desktop = clis => {
  const alive = new Set(), killed = [];
  return {alive, killed, tracker: () => createHelperTracker({slot: SLOT, list: () => [...alive], cliPathOf: pid => (alive.has(pid) ? clis[pid] : null),
    isAlive: pid => alive.has(pid), kill: pid => { killed.push(pid); alive.delete(pid); }})};
};

test('a helper that appears after startup with another CODEX_CLI_PATH is never adopted or stopped', () => {
  const d = desktop({100: SLOT, 200: '/Users/owner/Library/Application Support/cua/runtimes/r/CodexCLI.app/Contents/MacOS/codex', 300: null});
  const tracker = d.tracker();
  d.alive.add(100); // this run's helper, started by the first native call
  tracker.observe();
  d.alive.add(200); d.alive.add(300); // the owner's helper and one with no CODEX_CLI_PATH start mid-run
  tracker.observe();
  assert.deepEqual(tracker.owned(), [100]);
  assert.deepEqual(tracker.foreignSeen(), [200, 300]);
  assert.deepEqual(tracker.stopLeft(), {started: 1, quitByThemselves: 0, quitByHarness: 1});
  assert.deepEqual(d.killed, [100]);
  assert.ok(d.alive.has(200) && d.alive.has(300));
});

test('a helper of this run that quit by itself is counted and not signalled', () => {
  const d = desktop({100: SLOT});
  const tracker = d.tracker();
  d.alive.add(100);
  tracker.observe();
  d.alive.delete(100);
  assert.deepEqual(tracker.stopLeft(), {started: 1, quitByThemselves: 1, quitByHarness: 0});
  assert.deepEqual(d.killed, []);
});

test('a helper whose ownership cannot be read fails the run instead of counting as none', () => {
  const tracker = createHelperTracker({slot: SLOT, list: () => [100], isAlive: () => true, kill: () => assert.fail('nothing may be stopped'),
    cliPathOf: () => { throw new Error('ps: operation not permitted'); }});
  assert.throws(() => tracker.observe(), /ownership of helper 100/);
});
