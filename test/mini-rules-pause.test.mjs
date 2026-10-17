// `node scripts/mini-rules.mjs gated --pause -- <command>` as a process, with doubles for gh and ssh: the pause watcher
// it starts is stopped and awaited when the gated command settles, whether the command ran or the gate stopped it, so the
// CLI exits; and the pause files go only then.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {REPO} from './fixtures/runtime-fixture.mjs';

// gh: an idle runner and empty queues. ssh: the frontmost app is `$FRONT`, no workers, low load.
const GH = `#!/bin/sh
case "$*" in *runners*) echo false ;; *jobs*) echo '{"jobs":[],"total_count":0}' ;; *) echo '{"workflow_runs":[],"total_count":0}' ;; esac
`;
const SSH = `#!/bin/sh
case "$*" in *lsappinfo*) echo "bundleID=\\"$FRONT\\"" ;; *) printf 'pgrep_status=1\\nworkers=0\\n load averages: 0.5 0.5 0.5\\n' ;; esac
`;

function cli(t, front, command) {
  const dir = mkdtempSync(join(tmpdir(), 'cua-gated-pause-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  mkdirSync(join(dir, 'bin')); mkdirSync(join(dir, 'logs'));
  for (const [name, body] of [['gh', GH], ['ssh', SSH]]) { writeFileSync(join(dir, 'bin', name), body); chmodSync(join(dir, 'bin', name), 0o755); }
  const child = spawn(process.execPath, ['scripts/mini-rules.mjs', 'gated', '--pause', '--', ...command], {cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'],
    env: {PATH: `${join(dir, 'bin')}:/usr/bin:/bin`, FRONT: front, MINI_RULES_LOG_DIR: join(dir, 'logs'), MINI_RULES_APART_MS: '10', HOME: dir}});
  let err = '';
  child.stderr.on('data', d => { err += d; });
  const exited = new Promise(resolve => child.on('exit', code => resolve(code)));
  const timeout = new Promise(resolve => setTimeout(() => resolve('hung'), 20_000));
  return {dir, child, outcome: Promise.race([exited, timeout]).then(code => { if (code === 'hung') child.kill('SIGKILL'); return {code, err}; })};
}

test('gated --pause exits once its command finishes, the watcher stopped and the pause files removed', async t => {
  const {dir, outcome} = cli(t, 'com.apple.Terminal', ['/bin/sh', '-c', 'test -n "$CUA_PAUSE_FILE" && test -e "$CUA_PAUSE_FILE.alive"']);
  const {code, err} = await outcome;
  assert.notEqual(code, 'hung', 'the CLI must not wait on its watcher');
  assert.equal(code, 0, `the command saw CUA_PAUSE_FILE and a beating watcher: ${err}`);
  assert.deepEqual(readdirSync(join(dir, 'logs')).filter(name => name.startsWith('pause-')), [], 'the pause files go once the group has finished');
});

test('gated --pause exits when the gate stops before the command, the watcher stopped too', async t => {
  const {outcome} = cli(t, 'com.apple.SecurityAgent', ['/usr/bin/true']);
  const {code} = await outcome;
  assert.notEqual(code, 'hung');
  assert.equal(code, 4, 'a Stop');
});
