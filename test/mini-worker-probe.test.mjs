// The mini's Runner.Worker count (scripts/mini-rules.mjs workerProbe), run here with the real pgrep and ps against
// processes this test starts: a worker is a process whose executable is the runner's Runner.Worker, never a shell
// whose argv merely names that path (another reader's own probe), and what is logged of it never includes its environment.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gate, observeRunner, workerProbe, RUNNER_WORKER, TERMINAL} from '../scripts/mini-rules.mjs';

const SLEEP = ['/bin/sleep', '/usr/bin/sleep'].find(path => spawnSync('test', ['-x', path]).status === 0);

// A Runner.Worker executable of our own (a link to sleep, so its process name is Runner.Worker), under a scratch bin.
function runner(t) {
  const dir = mkdtempSync(join(tmpdir(), 'cua-worker-'));
  mkdirSync(join(dir, 'bin'));
  const executable = join(dir, 'bin', 'Runner.Worker');
  symlinkSync(SLEEP, executable);
  const children = [];
  t.after(() => { for (const child of children) child.kill('SIGKILL'); rmSync(dir, {recursive: true, force: true}); });
  const start = (cmd, args, env) => new Promise(resolve => {
    const child = spawn(cmd, args, {stdio: 'ignore', env: {...process.env, ...env}});
    children.push(child);
    setTimeout(resolve, 300);
  });
  return {executable, start};
}
// The probe as ssh runs it: as source for the remote account's login shell, sh or zsh.
const probe = (executable, shell = '/bin/sh') => spawnSync(shell, ['-c', workerProbe(executable)], {encoding: 'utf8'}).stdout;
const ZSH = ['/bin/zsh', '/usr/bin/zsh'].find(path => spawnSync('test', ['-x', path]).status === 0);
const count = text => Number(/workers=(\d+)/.exec(text)[1]);

test('a concurrent shell whose argv names the Runner.Worker path is not a worker', async t => {
  const {executable, start} = runner(t);
  await start('/bin/sh', ['-c', 'sleep 30; : "$1" "$2"', 'sh', executable, RUNNER_WORKER]);
  const text = probe(executable);
  assert.equal(count(text), 0, text);
  assert.doesNotMatch(text, /worker_pid=/);
});

test('a process running the Runner.Worker executable is a worker, logged with its command, parent and elapsed time', async t => {
  const {executable, start} = runner(t);
  await start(executable, ['30'], {CUA_WORKER_ENV_SENTINEL: 'sentinel-not-for-logs'});
  const text = probe(executable);
  assert.equal(count(text), 1, text);
  assert.match(text, new RegExp(`worker_command=${executable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} 30\\n`));
  assert.match(text, /worker_pid=\d+\n/);
  assert.match(text, /worker_ppid=\d+\n/);
  assert.match(text, /worker_parent=\S/);
  assert.match(text, /worker_etime=[0-9:-]+\n/);
  assert.doesNotMatch(text, /sentinel-not-for-logs|CUA_WORKER_ENV_SENTINEL/, 'never the environment');
});

test('the default probe matches only the mac lane runner\'s own executable', () => {
  assert.equal(RUNNER_WORKER, '/Users/new/actions-runner-maws/bin/Runner.Worker');
  assert.equal(workerProbe(), workerProbe(RUNNER_WORKER));
  assert.match(workerProbe(), /^sh -c '/, 'one sh script, whatever the login shell');
  assert.match(workerProbe(), /pgrep -x '\\''Runner\.Worker'\\''/);
  assert.doesNotMatch(workerProbe(), /pgrep -f|ps [^;|]*(-E|\be\b|eww)/, 'no argv match, no environment');
});

test('a worker reading logs what it saw, once per reading, in the gate and in the reading itself', async () => {
  const seenText = 'pgrep_status=0\nworker_pid=4242\nworker_etime=01:02\nworker_command=/Users/new/actions-runner-maws/bin/Runner.Worker spawnclient 1 2\nworker_ppid=4200\nworker_parent=/Users/new/actions-runner-maws/bin/Runner.Listener run\nworkers=1\n 19:00  up 8 days, load averages: 1.0 1.0 1.0\n';
  const exec = (cmd, args) => {
    const line = [cmd, ...args].join(' ');
    if (cmd === 'gh' && line.includes('/runners')) return 'false\n';
    if (cmd === 'gh') return JSON.stringify({total_count: 0, workflow_runs: [], jobs: []});
    if (line.includes('lsappinfo')) return `bundleID="${TERMINAL}"\n`;
    return seenText;
  };
  const o = observeRunner({exec});
  assert.equal(o.workers, 1);
  assert.deepEqual(o.seen, [{pid: 4242, etime: '01:02', command: '/Users/new/actions-runner-maws/bin/Runner.Worker spawnclient 1 2', ppid: 4200, parent: '/Users/new/actions-runner-maws/bin/Runner.Listener run'}]);
  const lines = [];
  await assert.rejects(gate('x', {exec, sleep: async () => {}, log: line => lines.push(line), maxWaits: 0}), /did not become idle/);
  assert.ok(lines.some(line => line.includes('Runner.Worker seen: pid 4242 (elapsed 01:02) /Users/new/actions-runner-maws/bin/Runner.Worker spawnclient 1 2; parent 4200 /Users/new/actions-runner-maws/bin/Runner.Listener run')), lines.join('\n'));
});

test('two workers count as two whichever shell the remote account logs in with, zsh included', {skip: !ZSH && 'needs zsh'}, async t => {
  const {executable, start} = runner(t);
  await start(executable, ['30']);
  await start(executable, ['31']);
  for (const shell of ['/bin/sh', ZSH]) {
    const text = probe(executable, shell);
    assert.equal(count(text), 2, `${shell}: ${text}`);
    assert.equal(text.match(/^worker_pid=/gm)?.length, 2, shell);
  }
});
