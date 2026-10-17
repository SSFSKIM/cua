// The approved runtime's lifecycle on the mini (scripts/native-baseline/prepare.mjs; the spec's Decision Log, "native
// runs on the mini"): an admission under the approved home that one run holds and its serves register with; the home's
// state/ and run/ moved aside and back without ever losing either, whichever move fails; and the native helper a run
// started stopped by its pid before the state is restored, so the next run is admitted.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {spawn, spawnSync, execFileSync as execFileSyncReal} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {prepareNative, cleanupNative, admitServe, ADMISSION, homeUsers, hasRunTmpdir, executableOf} from '../../scripts/native-baseline/prepare.mjs';
import {nativeEnvironment} from '../../scripts/native-baseline/remote.mjs';

function fixture(t) {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'approved-runtime-test-')));
  t.after(() => rmSync(parent, {recursive: true, force: true}));
  const home = join(parent, 'approved'), root = join(parent, 'scratch');
  mkdirSync(join(home, 'state', 'codex'), {recursive: true});
  writeFileSync(join(home, 'state', 'codex', 'kept'), 'task 1 state');
  mkdirSync(join(home, 'run', 'old'), {recursive: true});
  writeFileSync(join(home, 'run', 'old', 'kept'), 'task 1 run');
  const helper = join(home, 'runtimes', 'r1', 'Sky.app');
  // The device double: the processes using the home, each with its start time and whether it is the approved helper.
  const device = {users: [], killed: [], now: 1_000_000};
  const options = {
    directoryRoot: root, tempRoot: '/different-tmp', userHomeDir: '/Users/owner', now: () => device.now,
    locate: h => ({release: 'r1', root: join(h, 'runtimes', 'r1'), helper: join(h, 'runtimes', 'r1', 'Sky.app'), executable: join(h, 'runtimes', 'r1', 'Sky.app', 'Contents', 'MacOS', 'Sky'), pinned: 'r1'}),
    usersOf: () => device.users.filter(u => !device.killed.includes(u.pid)),
    kill: pid => device.killed.push(pid), alive: pid => !device.killed.includes(pid), wait: () => {},
    run: () => { throw new Error('nothing is installed'); },
    inspect: ({source}) => ({home: source, ownNode: {path: join(source, 'node/24.22.0/bin/node'), version: 'v24.22.0'}}),
  };
  const original = () => ({state: readFileSync(join(home, 'state', 'codex', 'kept'), 'utf8'), run: readFileSync(join(home, 'run', 'old', 'kept'), 'utf8')});
  return {home, root, helper, device, options, original};
}
// A rename that fails on its `n`th call (1-based) with EXDEV and works otherwise.
const failingRename = n => { let calls = 0; return (from, to) => { if (++calls === n) { const e = new Error(`EXDEV: cross-device link not permitted, rename '${from}'`); e.code = 'EXDEV'; throw e; } renameSync(from, to); }; };

test('preparation takes the admission, and a second preparation is refused while it is held', t => {
  const {home, options} = fixture(t);
  const prepared = prepareNative({device: 'mini', approvedHome: home}, options);
  const owner = JSON.parse(readFileSync(join(home, ADMISSION, 'owner.json'), 'utf8'));
  assert.equal(owner.token, prepared.token);
  assert.equal(prepared.admission, prepared.token);
  assert.throws(() => prepareNative({device: 'mini', approvedHome: home}, options), /admission .* is held/);
  cleanupNative(prepared, {...options, directoryRoot: options.directoryRoot});
  assert.equal(existsSync(join(home, ADMISSION)), false);
});

test('a process already using the approved home (argv or environment) refuses preparation and leaves nothing behind', t => {
  const {home, options, device, original} = fixture(t);
  device.users = [{pid: 77, helper: false, owned: false}];
  assert.throws(() => prepareNative({device: 'mini', approvedHome: home}, options), /in use by 1 process/);
  assert.equal(existsSync(join(home, ADMISSION)), false);
  assert.deepEqual(original(), {state: 'task 1 state', run: 'task 1 run'});
});

test('a failed move during preparation undoes only the moves that happened; nothing is lost, whichever rename fails', t => {
  for (const n of [1, 2]) {
    const {home, options, original} = fixture(t);
    assert.throws(() => prepareNative({device: 'mini', approvedHome: home}, {...options, rename: failingRename(n)}), /EXDEV/);
    assert.deepEqual(original(), {state: 'task 1 state', run: 'task 1 run'}, `rename ${n}`);
    assert.deepEqual(readdirSync(home).sort(), ['run', 'state'], `rename ${n}: the admission is released, nothing else added`);
    assert.deepEqual(readdirSync(options.directoryRoot), [], `rename ${n}: the scratch directory is gone`);
  }
});

test('a failed undo keeps the recovery data and the admission, and says where they are', t => {
  const {home, options} = fixture(t);
  // state/ moves (1), run/ fails (2), the undo of state/ fails (3).
  assert.throws(() => prepareNative({device: 'mini', approvedHome: home}, {...options, rename: failingRename(2), undo: failingRename(1)}),
    /could not be undone.*recovery in .*run-/);
  const [scratch] = readdirSync(options.directoryRoot);
  const recovery = JSON.parse(readFileSync(join(options.directoryRoot, scratch, 'recovery.json'), 'utf8'));
  assert.deepEqual(recovery.stashed, ['state']);
  assert.equal(readFileSync(join(options.directoryRoot, scratch, 'stash', 'state', 'codex', 'kept'), 'utf8'), 'task 1 state');
  assert.equal(readFileSync(join(home, 'run', 'old', 'kept'), 'utf8'), 'task 1 run');
  assert.equal(existsSync(join(home, ADMISSION)), true, 'the next run is refused until someone recovers');
});

test('cleanup after a completed run restores the state whichever rename fails, keeping recovery data when it cannot', t => {
  // Cleanup moves the run's state/ and run/ out (renames 1, 2), then the stashed ones back (3, 4).
  for (const n of [1, 2, 3, 4]) {
    const {home, options, original} = fixture(t);
    const prepared = prepareNative({device: 'mini', approvedHome: home}, options);
    mkdirSync(join(home, 'state', 'handshake'), {recursive: true});   // what the run wrote
    mkdirSync(join(home, 'run', 'session'), {recursive: true});
    assert.throws(() => cleanupNative(prepared, {...options, rename: failingRename(n)}), /EXDEV.*recovery in .*run-/s, `rename ${n}`);
    // Nothing is deleted on a failure: each original is either back in the home or still in the stash.
    for (const name of ['state', 'run']) {
      const file = name === 'state' ? join('codex', 'kept') : join('old', 'kept');
      const back = existsSync(join(home, name, file)), stashed = existsSync(join(prepared.scratch, 'stash', name, file));
      assert.ok(back !== stashed, `rename ${n}: ${name} is in exactly one place`);
    }
    assert.equal(existsSync(join(home, ADMISSION)), true, `rename ${n}: the admission is kept`);
    // The same cleanup, retried with a working rename, completes from wherever the failure left it.
    cleanupNative(prepared, options);
    assert.deepEqual(original(), {state: 'task 1 state', run: 'task 1 run'}, `rename ${n}: retried`);
    assert.equal(existsSync(prepared.scratch), false);
  }
});

test('a serve on the approved home must hold the run\'s admission, and registers itself while it runs', t => {
  const {home, options} = fixture(t);
  const prepared = prepareNative({device: 'mini', approvedHome: home}, options);
  assert.throws(() => admitServe({home, token: undefined, pid: 501}), /admission/);
  assert.throws(() => admitServe({home, token: 'another', pid: 501}), /admission/);
  const release = admitServe({home, token: prepared.token, pid: 501});
  assert.deepEqual(readdirSync(join(home, ADMISSION, 'serves')), ['501']);
  assert.throws(() => cleanupNative(prepared, options), /1 admitted serve\(s\) still running/);
  release();
  assert.deepEqual(readdirSync(join(home, ADMISSION, 'serves')), []);
  cleanupNative(prepared, options);
  assert.equal(admitServe({home, token: undefined, pid: 502})(), undefined, 'a home with no admission is not guarded');
  assert.match(nativeEnvironment({home, userHome: '/Users/owner', configHome: '/c', admission: prepared.token, host: 'vendor', platform: 'darwin'}), new RegExp(`CUA_NATIVE_ADMISSION='${prepared.token}'`));
});

test('two consecutive native runs: the helper the first started is stopped by its pid at cleanup, and the second is admitted', t => {
  const {home, options, device, original} = fixture(t);
  const asked = [];
  options.usersOf = (h, witness) => { asked.push(witness); return device.users.filter(u => !device.killed.includes(u.pid)); };
  const first = prepareNative({device: 'mini', approvedHome: home}, options);
  assert.equal(first.tmpdir, join(first.scratch, 'tmp'));
  assert.equal(statSync(first.tmpdir).mode & 0o777, 0o700);
  assert.deepEqual(asked.at(-1), {executable: join(home, 'runtimes', 'r1', 'Sky.app', 'Contents', 'MacOS', 'Sky'), tmpdir: null}, 'preparation: any helper is a user');
  device.now += 5000;
  device.users = [{pid: 900, helper: true, owned: true}];   // the helper the run's native call opened, carrying the run's TMPDIR
  const result = cleanupNative(first, options);
  assert.deepEqual(asked.at(-1).tmpdir, first.tmpdir, 'cleanup: ownership by the run\'s TMPDIR');
  assert.deepEqual(device.killed, [900]);
  assert.deepEqual(result, {removed: true, restored: ['state', 'run'], helpersStopped: [900]});
  device.now += 5000;
  const second = prepareNative({device: 'mini', approvedHome: home}, options);
  device.users.push({pid: 901, helper: true, owned: true});
  assert.deepEqual(cleanupNative(second, options).helpersStopped, [901]);
  assert.deepEqual(device.killed, [900, 901]);
  assert.deepEqual(original(), {state: 'task 1 state', run: 'task 1 run'});
});

test('cleanup never signals a process it cannot prove is this run\'s helper, and then restores nothing', t => {
  const {home, options, device} = fixture(t);
  const prepared = prepareNative({device: 'mini', approvedHome: home}, options);
  for (const stranger of [{pid: 950, helper: true, owned: false}, {pid: 951, helper: false, owned: false}, {pid: 952, helper: true, owned: false, unreadable: true}]) {
    device.users = [stranger];
    assert.throws(() => cleanupNative(prepared, options), /not proven this run's/);
    assert.deepEqual(device.killed, []);
    assert.equal(existsSync(join(prepared.scratch, 'stash', 'state')), true, 'nothing restored while a stranger uses the home');
  }
  device.users = [];
  cleanupNative(prepared, options);
});

test('a helper that will not stop keeps the state stashed and the admission held', t => {
  const {home, options, device} = fixture(t);
  const prepared = prepareNative({device: 'mini', approvedHome: home}, options);
  device.users = [{pid: 960, helper: true, owned: true}];
  assert.throws(() => cleanupNative(prepared, {...options, kill: () => {}, alive: () => true}), /helper 960 did not stop/);
  assert.equal(existsSync(join(home, ADMISSION)), true);
  assert.equal(existsSync(join(prepared.scratch, 'stash', 'state')), true);
});

// A copy of this Node at `executable` that runs there. A Node built against a shared libnode (Homebrew's: @rpath/
// libnode.N.dylib, searched at @loader_path/../lib) cannot load it from a copy elsewhere, so that library is copied
// beside the copy, where the copy looks for it. Whatever Node runs the suite (the official build, Homebrew's, a
// runtime's), the stand-in starts or the test says why it cannot.
function standalone(executable, libDir) {
  const runs = () => spawnSync(executable, ['-e', '0'], {stdio: 'ignore', env: {PATH: '/usr/bin:/bin'}}).status === 0;
  if (runs()) return;
  const origin = join(dirname(realpathSync(process.execPath)), '..', 'lib');
  mkdirSync(libDir, {recursive: true});
  for (const name of readdirSync(origin).filter(n => /^libnode\.\d+\.dylib$/.test(n))) copyFileSync(join(origin, name), join(libDir, name));
  assert.ok(runs(), `a copy of ${process.execPath} does not start at ${executable}, even with its libnode beside it`);
}

// The attribution itself, on real processes: a stand-in "helper" executable (a link to this Node at a bundle path), a
// decoy that only names that path in its argv, and the same executable carrying another run's TMPDIR. Each carries a
// secret-shaped variable that must never leave the ownership check.
test('ownership is the exact executable plus the run\'s TMPDIR; argv mentions and other TMPDIRs are not owned; nothing else is read out', async t => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'helper-attribution-test-')));
  const children = [];
  t.after(() => { for (const child of children) child.kill(); rmSync(dir, {recursive: true, force: true}); });
  const executable = join(dir, 'Fake Helper.app', 'Contents', 'MacOS', 'Fake');
  mkdirSync(join(dir, 'Fake Helper.app', 'Contents', 'MacOS'), {recursive: true});
  copyFileSync(process.execPath, executable);   // a copy: lsof names a hard link by its first path
  standalone(executable, join(dir, 'Fake Helper.app', 'Contents', 'lib'));
  const runTmp = join(dir, 'run-A', 'tmp'), otherTmp = join(dir, 'run-B', 'tmp'), sentinel = 'sentinel-6f1c2d';
  const start = (file, args, tmp) => { const child = spawn(file, args, {stdio: 'ignore', env: {PATH: '/usr/bin:/bin', TMPDIR: tmp, PLAYWRIGHT_MCP_EXTENSION_TOKEN: sentinel}}); children.push(child); return child.pid; };
  const keep = ['-e', 'setTimeout(() => {}, 30000)'];
  const owned = start(executable, keep, runTmp);
  const decoy = start(process.execPath, [...keep, '--', '--note', executable], runTmp);   // names the helper's path in its argv
  const otherRun = start(executable, keep, otherTmp);
  await new Promise(r => setTimeout(r, 400));
  assert.equal(executableOf(owned), executable);
  assert.equal(executableOf(decoy), realpathSync(process.execPath));
  const users = homeUsers(dir, {executable, tmpdir: runTmp}, {candidates: () => [owned, decoy, otherRun]});
  assert.deepEqual(users, [{pid: owned, helper: true, owned: true}, {pid: decoy, helper: false, owned: false}, {pid: otherRun, helper: true, owned: false}]);
  assert.equal(JSON.stringify(users).includes(sentinel), false);
  assert.equal(hasRunTmpdir(otherRun, otherTmp), true);
  // Parse failures say only that they failed: an environment that does not continue the command, or a failed read.
  const leaky = (cmd, args) => args.includes('-E') ? `something else PLAYWRIGHT_MCP_EXTENSION_TOKEN=${sentinel}\n` : 'decoyname -e x\n';
  for (const exec of [leaky, () => { throw Object.assign(new Error(`ps: PLAYWRIGHT_MCP_EXTENSION_TOKEN=${sentinel}`), {stdout: `TMPDIR=${runTmp} PLAYWRIGHT_MCP_EXTENSION_TOKEN=${sentinel}`}); }]) {
    let error;
    try { hasRunTmpdir(owned, runTmp, {exec}); } catch (caught) { error = caught; }
    assert.ok(error, 'the failure is reported');
    assert.equal(`${error.message} ${error.stack} ${JSON.stringify(error)} ${error.cause ?? ''}`.includes(sentinel), false);
    assert.match(error.message, /^could not read TMPDIR of process \d+$/);
  }
  // Since #115 M1 a helper carries its session's own TMPDIR, <home>/run/<session>/tmp: one of this home's is the run's,
  // anything else under run/ or another home's is not.
  const session = start(executable, keep, join(dir, 'run', '6f1c2d3e-0000-4000-8000-000000000001', 'tmp'));
  const deeper = start(executable, keep, join(dir, 'run', 'x', 'tmp', 'deeper'));
  const elsewhere = start(executable, keep, join(dir, 'other-home', 'run', 's', 'tmp'));
  await new Promise(r => setTimeout(r, 400));
  assert.deepEqual(homeUsers(dir, {executable, tmpdir: runTmp}, {candidates: () => [session, deeper, elsewhere]}),
    [{pid: session, helper: true, owned: true}, {pid: deeper, helper: true, owned: false}, {pid: elsewhere, helper: true, owned: false}]);
  // A failed read in homeUsers marks the helper unreadable, never owned, and carries nothing from the environment.
  const unreadable = homeUsers(dir, {executable, tmpdir: runTmp}, {candidates: () => [owned], exec: (cmd, args, options) => cmd === '/bin/ps' ? leaky(cmd, args) : execFileSyncReal(cmd, args, options)});
  assert.deepEqual(unreadable, [{pid: owned, helper: true, owned: false, unreadable: true}]);
});
