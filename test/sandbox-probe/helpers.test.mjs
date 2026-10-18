// Experiment A's native-helper bookkeeping (#115 M0, M2, scripts/sandbox-probe/helpers.mjs): a helper is this run's only
// when it runs the release's helper executable with one of this run's session temps as its TMPDIR, so a helper the
// owner or another harness starts mid-run is never adopted or stopped; a helper whose ownership cannot be read is an
// error, not "none".
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHelperTracker, helperLauncherIs, ownedBySessionTmp} from '../../scripts/sandbox-probe/helpers.mjs';

const RUN_TMP = '/h/run/s1/tmp';
// A desktop of helpers: `clis` maps a pid to whether it is this run's (its TMPDIR, when it runs the helper), `alive` is
// what runs.
const desktop = clis => {
  const alive = new Set(), killed = [];
  return {alive, killed, tracker: () => createHelperTracker({list: () => [...alive], owns: pid => alive.has(pid) && clis[pid] === RUN_TMP,
    isAlive: pid => alive.has(pid), kill: pid => { killed.push(pid); alive.delete(pid); }})};
};

test('a helper that appears after startup with another TMPDIR is never adopted or stopped', () => {
  const d = desktop({100: RUN_TMP, 200: '/Users/owner/Library/Application Support/cua/run/theirs/tmp', 300: null});
  const tracker = d.tracker();
  d.alive.add(100); // this run's helper, started by the first native call
  tracker.observe();
  d.alive.add(200); d.alive.add(300); // the owner's helper and one with no TMPDIR start mid-run
  tracker.observe();
  assert.deepEqual(tracker.owned(), [100]);
  assert.deepEqual(tracker.foreignSeen(), [200, 300]);
  assert.deepEqual(tracker.stopLeft(), {started: 1, quitByThemselves: 0, quitByHarness: 1});
  assert.deepEqual(d.killed, [100]);
  assert.ok(d.alive.has(200) && d.alive.has(300));
});

test('a helper of this run that quit by itself is counted and not signalled', () => {
  const d = desktop({100: RUN_TMP});
  const tracker = d.tracker();
  d.alive.add(100);
  tracker.observe();
  d.alive.delete(100);
  assert.deepEqual(tracker.stopLeft(), {started: 1, quitByThemselves: 1, quitByHarness: 0});
  assert.deepEqual(d.killed, []);
});

test('a helper whose ownership cannot be read fails the run instead of counting as none', () => {
  const tracker = createHelperTracker({list: () => [100], isAlive: () => true, kill: () => assert.fail('nothing may be stopped'),
    owns: () => { throw new Error('ps: operation not permitted'); }});
  assert.throws(() => tracker.observe(), /ownership of helper 100/);
});

// The ownership rule itself, over doubles of lsof and ps: the release's helper executable, with a TMPDIR that is one of
// the run's session temps; nothing else of the environment is used.
test('a helper is the run\'s only with the release\'s executable and one of the run\'s session temps as its TMPDIR', () => {
  const procs = {
    100: {exe: '/r/Helper.app/Contents/MacOS/Sky', cmd: '/r/Helper.app/Contents/MacOS/Sky', env: 'TMPDIR=/h/run/s1/tmp HOME=/u'},
    200: {exe: '/r/Helper.app/Contents/MacOS/Sky', cmd: '/r/Helper.app/Contents/MacOS/Sky', env: 'TMPDIR=/h/run/other/tmp'},
    300: {exe: '/owner/Helper.app/Contents/MacOS/Sky', cmd: '/owner/Helper.app/Contents/MacOS/Sky', env: 'TMPDIR=/h/run/s1/tmp'},
  };
  const exec = (cmd, args) => {
    const pid = Number(args[args.indexOf('-p') + 1]), p = procs[pid];
    if (cmd === '/usr/sbin/lsof') return `p${pid}\nftxt\nn${p.exe}\n`;
    return args.includes('-E') ? `${p.cmd} ${p.env}\n` : `${p.cmd}\n`;
  };
  const owns = ownedBySessionTmp({executable: '/r/Helper.app/Contents/MacOS/Sky', sessionTmps: () => ['/h/run/s1/tmp'], exec});
  assert.deepEqual([100, 200, 300].map(owns), [true, false, false]);
});

test('the helper\'s launcher is read from its environment\'s CODEX_CLI_PATH alone, and compared', () => {
  const exec = (cmd, args) => (args.includes('-E') ? '/r/Sky CODEX_CLI_PATH=/repo/bin/cua-codex-compat TMPDIR=/t\n' : '/r/Sky\n');
  assert.equal(helperLauncherIs(7, '/repo/bin/cua-codex-compat', {exec}), true);
  assert.equal(helperLauncherIs(7, '/r/CodexCLI.app/Contents/MacOS/codex', {exec}), false);
  assert.equal(helperLauncherIs(7, undefined, {exec}), false);
  assert.throws(() => helperLauncherIs(7, '/x', {exec: () => ''}), /could not read CODEX_CLI_PATH/);
});
