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

test('a helper that appears after startup with another TMPDIR is never adopted or stopped', async () => {
  const d = desktop({100: RUN_TMP, 200: '/Users/owner/Library/Application Support/cua/run/theirs/tmp', 300: null});
  const tracker = d.tracker();
  d.alive.add(100); // this run's helper, started by the first native call
  tracker.observe();
  d.alive.add(200); d.alive.add(300); // the owner's helper and one with no TMPDIR start mid-run
  tracker.observe();
  assert.deepEqual(tracker.owned(), [100]);
  assert.deepEqual(tracker.foreignSeen(), [200, 300]);
  assert.deepEqual(await tracker.stopLeft({waitMs: 50, pollMs: 5}), {started: 1, quitByThemselves: 0, quitByHarness: 1, stillAlive: 0, uncertain: 0, unclassified: 0});
  assert.deepEqual(d.killed, [100]);
  assert.ok(d.alive.has(200) && d.alive.has(300));
});

test('a helper of this run that quit by itself is counted and not signalled', async () => {
  const d = desktop({100: RUN_TMP});
  const tracker = d.tracker();
  d.alive.add(100);
  tracker.observe();
  d.alive.delete(100);
  assert.deepEqual(await tracker.stopLeft({waitMs: 50, pollMs: 5}), {started: 1, quitByThemselves: 1, quitByHarness: 0, stillAlive: 0, uncertain: 0, unclassified: 0});
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

// #115 M2 re-review: a signalled helper counts as stopped only once its pid is verified gone. A harmless child that
// ignores SIGTERM stands in for a helper (no native helper is started).
test('stopLeft verifies each pid is gone: TERM ignored, ownership re-read, then KILL for a pid still ours', async t => {
  const {spawn} = await import('node:child_process');
  const stubborn = () => {
    const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000);"], {stdio: ['ignore', 'pipe', 'ignore']});
    t.after(() => { try { process.kill(child.pid, 'SIGKILL'); } catch {} });
    return new Promise(done => child.stdout.once('data', () => done(child)));
  };
  const signals = [];
  const ours = await stubborn();
  const tracker = createHelperTracker({list: () => [ours.pid], owns: pid => pid === ours.pid, kill: (pid, signal) => { signals.push([pid, signal]); process.kill(pid, signal); }});
  tracker.observe();
  assert.deepEqual(await tracker.stopLeft({waitMs: 500, pollMs: 20}), {started: 1, quitByThemselves: 0, quitByHarness: 1, stillAlive: 0, uncertain: 0, unclassified: 0});
  assert.deepEqual(signals, [[ours.pid, 'SIGTERM'], [ours.pid, 'SIGKILL']]);
  // Ownership no longer proven after TERM: never escalated, reported alive and uncertain.
  const other = await stubborn();
  let reads = 0;
  const unsure = createHelperTracker({list: () => [other.pid], owns: pid => pid === other.pid && reads++ === 0, kill: (pid, signal) => { signals.push([pid, signal]); process.kill(pid, signal); }});
  unsure.observe();
  assert.deepEqual(await unsure.stopLeft({waitMs: 300, pollMs: 20}), {started: 1, quitByThemselves: 0, quitByHarness: 0, stillAlive: 1, uncertain: 1, unclassified: 0});
  assert.deepEqual(signals.filter(([pid]) => pid === other.pid), [[other.pid, 'SIGTERM']]);
});

// #115 M2 PR review: a helper whose ownership cannot be read is carried into the teardown as unclassified, never
// signalled, and keeps the teardown unproven while it lives. A harmless child stands in for the helper.
test('an unreadable ownership leaves the pid unclassified in stopLeft, unsignalled, while it lives', async t => {
  const {spawn} = await import('node:child_process');
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio: 'ignore'});
  t.after(() => { try { process.kill(child.pid, 'SIGKILL'); } catch {} });
  const signals = [];
  const tracker = createHelperTracker({list: () => [child.pid], owns: () => { throw new Error('ps: operation not permitted'); }, kill: (pid, signal) => signals.push([pid, signal])});
  assert.throws(() => tracker.observe(), /ownership of helper/);
  assert.deepEqual(await tracker.stopLeft({waitMs: 50, pollMs: 10}), {started: 0, quitByThemselves: 0, quitByHarness: 0, stillAlive: 0, uncertain: 0, unclassified: 1});
  assert.deepEqual(signals, []);
  process.kill(child.pid, 'SIGKILL');
  await new Promise(done => child.once('exit', done));
  assert.equal((await tracker.stopLeft({waitMs: 50, pollMs: 10})).unclassified, 0, 'gone: no longer counted');
});

// #115 M2 PR review: the TMPDIR (and CODEX_CLI_PATH) witness reads the whole value, spaces included: a cua home under
// "Application Support" is the default on macOS. A harmless child carries such a session temp.
test('a session temp whose path holds spaces is matched whole, from a real process\'s environment', {skip: process.platform !== 'darwin' && 'ps -E is macOS ps'}, async t => {
  const {spawn} = await import('node:child_process');
  const {hasRunTmpdir, envValues} = await import('../../scripts/native-baseline/prepare.mjs');
  const tmp = '/Users/x/Library/Application Support/cua/run/s1/tmp', cli = '/Users/x/My Checkout/cua/bin/cua-codex-compat';
  const child = spawn(process.execPath, ['-e', 'process.stdout.write("ready"); setInterval(() => {}, 1000)'], {stdio: ['ignore', 'pipe', 'ignore'],
    env: {PATH: '/usr/bin:/bin', TMPDIR: tmp, CODEX_CLI_PATH: cli, AFTER: 'x y'}});
  t.after(() => { try { process.kill(child.pid, 'SIGKILL'); } catch {} });
  await new Promise(done => child.stdout.once('data', done));
  assert.equal(hasRunTmpdir(child.pid, tmp), true);
  assert.equal(hasRunTmpdir(child.pid, '/Users/x/Library/Application'), false, 'never a truncated value');
  assert.equal(helperLauncherIs(child.pid, cli), true);
  assert.deepEqual(envValues(` PATH=/usr/bin TMPDIR=${tmp} AFTER=x y`, 'TMPDIR'), [tmp]);
  assert.deepEqual(envValues(` TMPDIR=${tmp}`, 'TMPDIR'), [tmp]);
});
