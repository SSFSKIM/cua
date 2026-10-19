// measure.mjs's vendor lane on this Mac (`--device local --lane vendor`; scripts/spike/engine/measure/lane.mjs
// localPreparation): prepare.mjs's approved-home functions called in process, with the device injected. The order is
// build gate, admission and preparation, the engine stop inside the admission, the run, scenes down, the engine stop,
// cleanup. A held admission refuses the run before anything starts. A run that dies mid-way still restores the
// approved home, and a cleanup that cannot finish names its recovery directory and can be resumed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runOnce, localPreparation, cleanupPreparation, homeHolders} from '../scripts/spike/engine/measure/lane.mjs';
import {parseCommand} from '../scripts/spike/engine/measure.mjs';
import {ADMISSION} from '../scripts/native-baseline/prepare.mjs';
import {claimRunSession} from '../src/runtime/run-dir.mjs';

function fixture(t, {rename = renameSync, inspect, usersOf = () => [], duringServe = () => {}, scenesPreflight} = {}) {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'measure-local-vendor-')));
  t.after(() => rmSync(parent, {recursive: true, force: true}));
  const home = join(parent, 'cua'), root = join(parent, 'native-baseline');
  mkdirSync(join(home, 'state', 'codex'), {recursive: true});
  writeFileSync(join(home, 'state', 'codex', 'kept'), 'owner state');
  mkdirSync(join(home, 'run', 'old'), {recursive: true});
  writeFileSync(join(home, 'run', 'old', 'kept'), 'owner run');
  const order = [], logged = [];
  const seams = {
    directoryRoot: root, tempRoot: '/different-tmp', userHomeDir: '/Users/owner', rename,
    locate: h => ({release: 'r1', root: join(h, 'runtimes', 'r1'), helper: join(h, 'runtimes', 'r1', 'Sky.app'), executable: join(h, 'runtimes', 'r1', 'Sky.app', 'Contents', 'MacOS', 'Sky'), pinned: 'r1'}),
    usersOf, kill: pid => assert.fail(`nothing is signalled (${pid})`), alive: () => false, wait: () => {},
    inspect: inspect ?? (({source}) => ({home: source, ownNode: {path: join(source, 'node/24.22.0/bin/node'), version: 'v24.22.0'}})),
  };
  const real = localPreparation(seams);
  const recorded = {prepare: home => { order.push('prepare'); return real.prepare(home); }, cleanup: prepared => { order.push('cleanup'); return real.cleanup(prepared); }};
  const ops = {
    rpc: method => { order.push(`engine ${method}`); return {ok: false, unreachable: 'ENOENT'}; },
    bundle: () => ({bundle: '/b', exists: true, build: 'b', identity: 'I'}), approved: () => null, checkoutBuild: () => ({build: 'b'}),
  };
  // The device: the baseline's preflight, the helper list and the scene CLI, each step recorded by what it is.
  const shell = script => {
    if (script.includes('hostIdentity')) { order.push('preflight'); return JSON.stringify({commit: 'c', dirty: false, checkout: '/checkout', home, runtimeRoot: join(home, 'runtimes', 'r1'), release: 'r1'}); }
    if (script.includes('SkyComputerUseService')) return '';
    const scene = /scenes\.mjs '(\w+)'(?: '(\w+)')?/.exec(script);
    if (scene?.[1] === 'preflight') { order.push('scenes preflight'); if (scenesPreflight) return scenesPreflight(); return JSON.stringify({refusals: [], finderWindows: []}); }
    if (scene?.[1] === 'up') { order.push(`up ${scene[2]}`); return JSON.stringify({scene: scene[2], app: '/System/Applications/TextEdit.app', bundleId: 'com.apple.TextEdit', pid: 41, window: {number: 7}}); }
    if (scene?.[1] === 'down') { order.push(`down ${scene[2]}`); return JSON.stringify({scene: scene[2], down: true}); }
    if (script.startsWith('cat ')) return '{}';
    throw new Error(`unexpected device step: ${script.slice(0, 80)}`);
  };
  // The serve: the connection is opened, then the run dies (the serve exits) before its first cell.
  const connect = spec => {
    order.push('connect');
    assert.equal(spec.command, '/bin/sh', 'on this Mac the baseline\'s serve script runs under /bin/sh, not ssh');
    assert.match(spec.args[1], /scripts\/native-baseline\/serve\.mjs/);
    assert.match(spec.args[1], /CUA_REPL_HOST=vendor/);
    assert.match(spec.args[1], /CUA_NATIVE_ADMISSION=/, 'the serve presents the admission token');
    duringServe();
    return {initialize: async () => { throw new Error('the serve exited'); }, close: async () => {}};
  };
  const run = (n, extra = {}) => runOnce({lane: 'vendor', d: {device: 'local', local: true, node: 'node'}, dir: join(parent, `run-${n}`), run: n, approvedRuntime: home, scenes: ['textedit'], samples: 1, tasks: 1, sceneDir: join(parent, 'scenes'), ...extra},
    {shell, ops, connect, localPreparation: recorded, log: line => logged.push(line), sleep: async () => {}, serveNode: () => ({path: '/node/bin/node', version: 'v24.22.0'})});
  const owner = () => ({state: readFileSync(join(home, 'state', 'codex', 'kept'), 'utf8'), run: readFileSync(join(home, 'run', 'old', 'kept'), 'utf8')});
  return {parent, home, root, seams, order, logged, run, owner, recorded, shell};
}

test('the local vendor lane: admission and preparation, the stop inside it, the run, scenes down, the stop, cleanup; the home restored', async t => {
  const f = fixture(t);
  assert.equal(await f.run(1), 1, 'the run died mid-way');
  assert.deepEqual(f.order, ['prepare', 'engine status', 'preflight', 'scenes preflight', 'up textedit', 'connect', 'down textedit', 'engine status', 'cleanup']);
  const meta = JSON.parse(readFileSync(join(f.parent, 'run-1', 'meta.json'), 'utf8'));
  assert.match(meta.error, /the serve exited/);
  assert.equal(meta.preparationCleanup.removed, true);
  assert.deepEqual(meta.preparationCleanup.restored, ['state', 'run']);
  assert.deepEqual(f.owner(), {state: 'owner state', run: 'owner run'});
  assert.equal(existsSync(join(f.home, ADMISSION)), false, 'the admission is released');
  const saved = JSON.parse(readFileSync(join(f.parent, 'run-1', 'preparation.json'), 'utf8'));
  assert.equal(saved.device, 'local');
  assert.equal(saved.prepared.runtimeReuse.approvedHome, f.home, 'written at once, for a resumed cleanup');
  assert.ok(f.logged.some(line => line.includes(`the approved home ${f.home} is held: start no cua session on this home until cleanup reports removed: true`)));
  assert.ok(f.logged.some(line => line.includes(`node scripts/spike/engine/measure.mjs cleanup --device local --preparation '${join(f.parent, 'run-1', 'preparation.json')}'`)));
  assert.deepEqual(meta.serveNode, {path: '/node/bin/node', version: 'v24.22.0'});
});

test('a held admission refuses the local vendor run before the engine, the scenes or the serve', async t => {
  const f = fixture(t);
  mkdirSync(join(f.home, ADMISSION));
  writeFileSync(join(f.home, ADMISSION, 'owner.json'), JSON.stringify({token: 'other', scratch: '/elsewhere'}));
  assert.equal(await f.run(1), 1);
  assert.deepEqual(f.order, ['prepare'], 'nothing after the refused preparation, and no cleanup of an admission it does not hold');
  assert.match(JSON.parse(readFileSync(join(f.parent, 'run-1', 'meta.json'), 'utf8')).error, /admission .* is held by another run/);
  assert.equal(existsSync(join(f.parent, 'run-1', 'preparation.json')), false);
  assert.deepEqual(f.owner(), {state: 'owner state', run: 'owner run'});
  assert.equal(JSON.parse(readFileSync(join(f.home, ADMISSION, 'owner.json'), 'utf8')).token, 'other', 'the other run\'s admission is untouched');
});

test('a cleanup that cannot finish names its recovery directory and keeps the admission; resuming it restores the home', async t => {
  // The third rename is the first move back (two moved state/ and run/ aside at preparation): it fails once.
  let calls = 0;
  const f = fixture(t, {rename: (from, to) => { if (++calls === 3) throw Object.assign(new Error('EXDEV: cross-device link not permitted'), {code: 'EXDEV'}); renameSync(from, to); }});
  assert.equal(await f.run(1), 1);
  const meta = JSON.parse(readFileSync(join(f.parent, 'run-1', 'meta.json'), 'utf8'));
  assert.equal(meta.preparationCleanup.removed, false);
  assert.match(meta.preparationCleanup.error, /nothing was deleted, the admission is kept, recovery in .*run-/);
  assert.equal(existsSync(join(f.home, ADMISSION)), true, 'the admission stays held until the home is restored');
  assert.equal(existsSync(join(f.home, 'state')), false, 'the owner\'s state is still aside');
  // What `measure.mjs cleanup --device local --preparation <run>/preparation.json` does.
  const {device, prepared} = JSON.parse(readFileSync(join(f.parent, 'run-1', 'preparation.json'), 'utf8'));
  const resumed = cleanupPreparation({device, local: true}, f.shell, prepared, localPreparation({...f.seams, rename: renameSync}));
  assert.equal(resumed.removed, true);
  assert.deepEqual(f.owner(), {state: 'owner state', run: 'owner run'});
  assert.equal(existsSync(join(f.home, ADMISSION)), false);
});

test('on this Mac a live cua session registered in the home\'s run/ refuses the preparation; the owner\'s home is left as it was', async t => {
  const f = fixture(t);
  writeFileSync(join(f.home, 'run', '4b679d66-66d4-4c98-8066-976b4c3926b7.pid'), `${process.pid}\n`);
  writeFileSync(join(f.home, 'run', 'dead-session.pid'), '999999999\n');
  assert.equal(await f.run(1), 1);
  assert.deepEqual(f.order, ['prepare']);
  assert.match(JSON.parse(readFileSync(join(f.parent, 'run-1', 'meta.json'), 'utf8')).error, new RegExp(`in use by 1 process\\(es\\) \\(pids ${process.pid}\\)`));
  assert.deepEqual(f.owner(), {state: 'owner state', run: 'owner run'});
  assert.equal(existsSync(join(f.home, ADMISSION)), false, 'the refused preparation released its admission');
  assert.deepEqual(homeHolders(f.home).map(s => s.pid), [process.pid], 'a dead session\'s record is not a user');
});

test('a live holder of state/agent.lock refuses the preparation; a stale one does not', async t => {
  const f = fixture(t);
  writeFileSync(join(f.home, 'state', 'agent.lock'), `${JSON.stringify({pid: process.pid, token: 't'})}\n`);
  assert.equal(await f.run(1), 1);
  assert.deepEqual(f.order, ['prepare']);
  assert.match(JSON.parse(readFileSync(join(f.parent, 'run-1', 'meta.json'), 'utf8')).error, new RegExp(`in use by 1 process\\(es\\) \\(pids ${process.pid}\\)`));
  assert.deepEqual(f.owner(), {state: 'owner state', run: 'owner run'});
  writeFileSync(join(f.home, 'state', 'agent.lock'), `${JSON.stringify({pid: 999999999, token: 't'})}\n`);
  assert.deepEqual(homeHolders(f.home), [], 'a dead agent\'s lock is not a holder');
});

test('a session record or agent lock that is unreadable, empty or malformed refuses; only an absent one is skipped', t => {
  const f = fixture(t);
  assert.deepEqual(homeHolders(f.home), []);
  for (const [setup, what] of [
    [() => writeFileSync(join(f.home, 'run', 'empty.pid'), ''), 'run/empty.pid'],
    [() => writeFileSync(join(f.home, 'run', 'garbage.pid'), 'not a pid\n'), 'run/garbage.pid'],
    [() => writeFileSync(join(f.home, 'run', 'bad.name.pid'), '1\n'), 'run/bad.name.pid'],
    [() => mkdirSync(join(f.home, 'run', 'adir.pid')), 'run/adir.pid'],
    [() => writeFileSync(join(f.home, 'state', 'agent.lock'), '{'), 'state/agent.lock'],
  ]) {
    setup();
    assert.ok(homeHolders(f.home).some(h => h.unreadable && h.pid === `unreadable ${what}`), what);
    rmSync(join(f.home, ...what.split('/')), {recursive: true, force: true});
  }
  assert.deepEqual(homeHolders(f.home), []);
});

test('the record format is the run directory\'s own: a session claimed through claimRunSession is a live holder', t => {
  const f = fixture(t);
  const claim = claimRunSession(f.home, '4b679d66-66d4-4c98-8066-976b4c3926b7');
  t.after(() => claim.release());
  assert.deepEqual(homeHolders(f.home), [{pid: process.pid, helper: false, owned: false}]);
});

test('a home without the managed Node refuses before the admission or any move', async t => {
  const f = fixture(t, {inspect: ({source}) => ({home: source, ownNode: null})});
  assert.equal(await f.run(1), 1);
  assert.deepEqual(f.order, ['prepare']);
  assert.match(JSON.parse(readFileSync(join(f.parent, 'run-1', 'meta.json'), 'utf8')).error, /managed Node 24/);
  assert.deepEqual(f.owner(), {state: 'owner state', run: 'owner run'});
  assert.equal(existsSync(join(f.home, ADMISSION)), false, 'no admission was ever taken');
  assert.equal(existsSync(f.root) && readdirSync(f.root).length > 0, false, 'no scratch directory was made');
});

test('cleanup keeps the home aside while a session lives on it, and resumes once it is gone', async t => {
  const record = () => join(f.home, 'run', '0ae541ba-7e12-4dc7-a241-6c30e02d9375.pid');
  // A session started on the home during the run (the run's own run/ is the home's then).
  const f = fixture(t, {duringServe: () => { mkdirSync(join(f.home, 'run'), {recursive: true}); writeFileSync(record(), `${process.pid}\n`); }});
  assert.equal(await f.run(1), 1);
  const meta = JSON.parse(readFileSync(join(f.parent, 'run-1', 'meta.json'), 'utf8'));
  assert.equal(meta.preparationCleanup.removed, false);
  assert.match(meta.preparationCleanup.error, /not proven this run's; none was signalled, nothing was restored, the admission is kept, recovery in /);
  assert.equal(existsSync(join(f.home, 'state')), false, 'the owner\'s state is still aside');
  assert.equal(existsSync(join(f.home, ADMISSION)), true);
  rmSync(record());
  const {prepared} = JSON.parse(readFileSync(join(f.parent, 'run-1', 'preparation.json'), 'utf8'));
  assert.equal(cleanupPreparation({device: 'local', local: true}, f.shell, prepared, localPreparation(f.seams)).removed, true);
  assert.deepEqual(f.owner(), {state: 'owner state', run: 'owner run'});
});

test('a helper proven the run\'s beside a live session: nothing is signalled and the home stays aside', async t => {
  let serving = false;
  const f = fixture(t, {usersOf: () => (serving ? [{pid: 4242, helper: true, owned: true}] : []),
    duringServe: () => { serving = true; mkdirSync(join(f.home, 'run'), {recursive: true}); writeFileSync(join(f.home, 'run', 'live.pid'), `${process.pid}\n`); }});
  assert.equal(await f.run(1), 1, 'the fixture\'s kill fails the test if anything is signalled');
  const meta = JSON.parse(readFileSync(join(f.parent, 'run-1', 'meta.json'), 'utf8'));
  assert.equal(meta.preparationCleanup.removed, false);
  assert.match(meta.preparationCleanup.error, /1 process\(es\) \(pids \d+\) using the approved home are not proven this run's/);
  assert.equal(existsSync(join(f.home, 'state')), false);
});

test('a scenes preflight that fails with {error} stops the run before any scene, with its text; the home is restored', async t => {
  const f = fixture(t, {scenesPreflight: () => { throw Object.assign(new Error('Command failed'), {status: 1, stdout: '{"error":"swift is not installed"}\n'}); }});
  assert.equal(await f.run(1), 1);
  assert.deepEqual(f.order, ['prepare', 'engine status', 'preflight', 'scenes preflight', 'engine status', 'cleanup']);
  assert.match(JSON.parse(readFileSync(join(f.parent, 'run-1', 'meta.json'), 'utf8')).error, /^scenes\.mjs preflight: swift is not installed$/);
  assert.deepEqual(f.owner(), {state: 'owner state', run: 'owner run'});
});

test('measure.mjs cleanup takes the device and the preparation file', () => {
  assert.deepEqual(parseCommand(['cleanup', '--device', 'local', '--preparation', '/runs/run-1/preparation.json']), {command: 'cleanup', device: 'local', preparation: '/runs/run-1/preparation.json'});
  assert.throws(() => parseCommand(['cleanup', '--device', 'local']), /--preparation/);
  assert.throws(() => parseCommand(['cleanup', '--device', 'local', '--preparation', 'relative.json']), /absolute/);
});
