// The native baseline's Linux device side: the scratch gedit processes the run owns (opened, watched and ended only
// when the process is provably the run's own: its command line names the run's scratch file), the helper's attestation
// and what a run may leave. The ownership scripts are portable (ps, kill, node) and run here against stand-in processes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {existsSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {classifyLinuxHelpers, linuxDevice, ownedEntry, spawnGeditScript, targetStateScript, terminateScript} from '../../scripts/native-baseline/linux.mjs';

const sh = script => execFileSync('/bin/sh', ['-c', script], {encoding: 'utf8'}).trim();
// A stand-in for a scratch gedit: a process whose command line names a file in a run-owned directory.
function standIn(t, role = 'scratch') {
  const dir = mkdtempSync('/tmp/cua-native-baseline-');
  const file = join(dir, `${role}-0a1b2c.txt`);
  writeFileSync(file, '');
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)', file], {stdio: 'ignore'});
  t.after(() => { try { child.kill('SIGKILL'); } catch {} rmSync(dir, {recursive: true, force: true}); });
  return {child, entry: {pid: child.pid, dir, file, role}};
}
const exited = child => new Promise(resolve => (child.exitCode !== null || child.signalCode ? resolve() : child.once('exit', resolve)));

test('an owned entry is a run directory under /tmp, a scratch file in it and a pid; anything else is refused', () => {
  const entry = {pid: 4242, dir: '/tmp/cua-native-baseline-AbC123', file: '/tmp/cua-native-baseline-AbC123/scratch-0a1b2c.txt', role: 'scratch'};
  assert.deepEqual(ownedEntry(entry), entry);
  for (const bad of [{...entry, pid: 0}, {...entry, pid: '4242; kill 1'}, {...entry, dir: '/home/admin'}, {...entry, dir: '/tmp/cua-native-baseline-AbC123/..'},
    {...entry, file: '/tmp/cua-native-baseline-AbC123/../etc/passwd'}, {...entry, file: '/tmp/cua-native-baseline-ZZZ999/scratch-0a1b2c.txt'}, {...entry, role: 'owner'}])
    assert.throws(() => ownedEntry(bad), /not a run-owned scratch process/, JSON.stringify(bad));
});

test('the spawn script opens a standalone gedit on a new empty file in a new run directory, in the X session', () => {
  const script = spawnGeditScript({display: ':0', role: 'victim'});
  assert.match(script, /mkdtempSync\("\/tmp\/cua-native-baseline-"\)/);
  assert.match(script, /"--standalone"/);
  assert.match(script, /DISPLAY: ":0"/);
  assert.match(script, /detached: true/);
  assert.throws(() => spawnGeditScript({display: ':0', role: 'owner'}), /role/);
  assert.throws(() => spawnGeditScript({display: '$(id)', role: 'scratch'}), /display/);
});

test('a target is "survived" while its own process runs and "exited" once it has gone', async t => {
  const {child, entry} = standIn(t);
  assert.equal(sh(targetStateScript(entry, {waitMs: 0})), 'survived');
  child.kill('SIGKILL'); await exited(child);
  assert.equal(sh(targetStateScript(entry, {waitMs: 2000})), 'exited');
});

test('termination ends only the run\'s own process and removes only its directory', async t => {
  const {child, entry} = standIn(t);
  const other = standIn(t);
  // The other process does not name this entry's file: same pid, different file is not ours.
  const impostor = {...entry, pid: other.child.pid};
  const result = JSON.parse(sh(terminateScript([entry, impostor])));
  await exited(child);
  assert.deepEqual(result.terminated, [entry.pid]);
  assert.deepEqual(result.notOwned, [other.child.pid]);
  assert.deepEqual(result.removed, [entry.dir]);
  assert.equal(existsSync(entry.dir), false);
  assert.equal(other.child.exitCode, null);
  assert.equal(existsSync(other.entry.dir), true);
  // Again: nothing left to end, the directory already gone.
  assert.deepEqual(JSON.parse(sh(terminateScript([entry]))), {terminated: [], notOwned: [], gone: [entry.pid], removed: []});
});

test('the sky_linux helpers are classified against the pinned runtime, with their age', () => {
  const output = '  42 /home/admin/.local/share/cua/runtimes/r1/cua_node/lib/node_modules/@oai/cua/bin/linux/sky_linux_arm64 --stdio\n 9000 /opt/other/sky_linux_arm64\n';
  assert.deepEqual(classifyLinuxHelpers(output, '/home/admin/.local/share/cua/runtimes/r1'), [
    {path: '~/.local/share/cua/runtimes/r1/cua_node/lib/node_modules/@oai/cua/bin/linux/sky_linux_arm64', origin: 'pinned runtime', ageSeconds: 42},
    {path: '/opt/other/sky_linux_arm64', origin: 'another installation', ageSeconds: 9000},
  ]);
  assert.deepEqual(classifyLinuxHelpers('', '/x'), []);
});

test('the device operations parse what the scripts print and refuse output that is not a run-owned process', () => {
  const scripts = [];
  const reply = {spawn: '{"pid":4242,"dir":"/tmp/cua-native-baseline-AbC123","file":"/tmp/cua-native-baseline-AbC123/victim-0a1b2c.txt"}', leftovers: '1 0', crash: '{"files":1,"newest":"2026-10-07T02:00:00.000Z"}'};
  const remote = script => { scripts.push(script); return /gedit/.test(script) && /mkdtemp/.test(script) ? reply.spawn : /crash/.test(script) ? reply.crash : reply.leftovers; };
  const device = linuxDevice(remote, {display: ':0', checkout: '/home/admin/Developer/GitHub/cua-parity'});
  assert.deepEqual(device.spawnGedit('victim'), {pid: 4242, dir: '/tmp/cua-native-baseline-AbC123', file: '/tmp/cua-native-baseline-AbC123/victim-0a1b2c.txt', role: 'victim'});
  assert.deepEqual(device.leftovers(), {serves: 1, geditRunning: 0});
  assert.deepEqual(device.crashReports(), {files: 1, newest: '2026-10-07T02:00:00.000Z'});
  reply.spawn = '{"pid":1,"dir":"/home/admin","file":"/home/admin/.bashrc"}';
  assert.throws(() => device.spawnGedit('scratch'), /not a run-owned scratch process/);
});
