// M5's T4: the `:0` sitting's guards (task 50's owner checks, task 71's wrap71.py) protect the person the session belongs
// to, read from it: the account they run as, its passwd home and its runtime directory. Task 50 wrote in the #171 x86-64
// VM's (uid 501, /Users/new); M5's arm64 VM's may differ. Each guard is run here in a user namespace that maps this user
// to root, so the session is another account (uid 0, home /root), and never on a display: the owner checks read `:0`,
// so only their shared reading of the person (person.sh) runs.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const EVIDENCE = new URL('../../docs/evidence/2026-10-28-own-linux-engine/m4/', import.meta.url).pathname;
const WRAP71 = join(EVIDENCE, 'pointer-route/scripts/wrap71.py');
const PERSON = join(EVIDENCE, 'person-display-live/scripts/person.sh');
const linux = process.platform === 'linux';
// whether this machine lets an unprivileged user map itself to root in a user namespace (Ubuntu may restrict it)
const userns = linux && spawnSync('unshare', ['--user', '--map-root-user', 'true']).status === 0;

/** wrap71.py in private mode around `true`, in a fresh directory, as this account or (`asRoot`) as root in a user namespace; its summary. */
function wrap71({ asRoot = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-guard-'));
  try {
    mkdirSync(join(dir, 'tmp'));
    const argv = ['python3', '-I', WRAP71, join(dir, 'out'), join(dir, 'tmp'), 'private', 'true'];
    const [cmd, ...args] = asRoot ? ['unshare', '--user', '--map-root-user', ...argv] : argv;
    const run = spawnSync(cmd, args, { encoding: 'utf8', timeout: 30000 });
    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
    return JSON.parse(readFileSync(join(dir, 'out', 'wrap-summary.json'), 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("wrap71.py guards the session's own person: this account's uid, passwd home and runtime directory", { skip: !linux && 'Linux only' }, () => {
  const me = userInfo();
  const summary = wrap71();
  assert.deepEqual(summary.person, { uid: me.uid, home: me.homedir, runtime_dir: `/run/user/${me.uid}` });
  assert.deepEqual(summary.flags, []);
});

test('wrap71.py follows a session of another account, never a home or uid written in', { skip: !userns && 'needs an unprivileged user namespace' }, () => {
  const summary = wrap71({ asRoot: true });
  assert.deepEqual(summary.person, { uid: 0, home: '/root', runtime_dir: '/run/user/0' });
  assert.deepEqual(summary.flags, []);
});

test("person.sh reads the owner checks' person from the session, and stops where the account has no home", { skip: !userns && 'needs an unprivileged user namespace' }, () => {
  const read = (argv) => spawnSync(argv[0], argv.slice(1), { encoding: 'utf8' });
  const show = `. ${PERSON}; echo "$PUID $H $PRUN"`;
  const me = userInfo();
  assert.equal(read(['bash', '-c', show]).stdout.trim(), `${me.uid} ${me.homedir} /run/user/${me.uid}`);
  assert.equal(read(['unshare', '--user', '--map-root-user', 'bash', '-c', show]).stdout.trim(), '0 /root /run/user/0');
  // an account with no passwd entry: the guard stops before it reads anything
  const none = read(['unshare', '--user', '--map-user=4242', '--map-group=4242', 'bash', '-c', show]);
  assert.equal(none.status, 3);
  assert.match(none.stderr, /no home for uid 4242/);
});
