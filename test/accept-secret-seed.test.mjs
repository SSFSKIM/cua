// The live fixtures' disposable store: `cua secrets set` driven at a real pty stores exactly the value in a temporary
// $HOME, nothing echoes it, and the account's own home is refused.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, statSync} from 'node:fs';
import {userInfo} from 'node:os';
import {join} from 'node:path';
import {createStoreHome, EXIT_MARKER, generatedKey, isAccountHome, ptyCommand, removeStoreHome, seedSecret} from '../scripts/accept/secret-seed.mjs';
import {isLabel} from '../src/secrets/label.mjs';
import {fileStore, storeDir} from '../src/secrets/store.mjs';

const hasPty = ['darwin', 'linux'].includes(process.platform) && existsSync('/bin/bash')
  && (process.platform === 'darwin' ? existsSync('/usr/bin/script') : ['/usr/bin/script', '/bin/script'].some(existsSync));

test('generated keys follow the store grammar and differ', () => {
  const [a, b] = [generatedKey(), generatedKey('CUA_PROBE')];
  assert.ok(isLabel(a) && isLabel(b));
  assert.match(b, /^CUA_PROBE_[0-9A-F]{16}$/);
  assert.notEqual(generatedKey(), a);
});

test('the pty command keeps the value out of argv and quotes the Linux command line', () => {
  const mac = ptyCommand(['/n/node', '/c/cua.mjs', 'secrets', 'set', 'KEY'], 'darwin');
  assert.deepEqual(mac.args.slice(2), ['/usr/bin/script', '-q', '/dev/null', '/n/node', '/c/cua.mjs', 'secrets', 'set', 'KEY']);
  const linux = ptyCommand(["/o'dd/node", '/c/cua.mjs', 'secrets', 'set', 'KEY'], 'linux');
  assert.deepEqual(linux.args.slice(2), ['script', '-q', '-e', '-c', `'/o'\\''dd/node' '/c/cua.mjs' 'secrets' 'set' 'KEY'; printf '\\n${EXIT_MARKER}%s\\n' "$?"`, '/dev/null']);
  assert.equal(linux.command, '/bin/bash');
});

test('the account home is never a store home', async () => {
  assert.equal(isAccountHome(userInfo().homedir), true);
  assert.equal(isAccountHome(undefined), true);
  assert.equal(isAccountHome(join(userInfo().homedir, 'x', '..')), true);
  assert.throws(() => seedSecret({home: userInfo().homedir, key: 'K', value: 'v'}), /temporary \$HOME/);
  await assert.rejects(removeStoreHome({home: userInfo().homedir}), /temporary \$HOME/);
  assert.throws(() => seedSecret({home: '/tmp/x', key: 'not-a-key', value: 'v'}), /not a secret key/);
  assert.throws(() => seedSecret({home: '/tmp/x', key: 'K', value: 'a\nb'}), /control characters/);
});

test('cua secrets set at a pty stores exactly the value, 0600 in a 0700 store, without echoing it', {skip: !hasPty && 'needs bash and script'}, async () => {
  const home = createStoreHome();
  assert.equal(isAccountHome(home), false);
  const key = generatedKey('CUA_TEST');
  const value = `SEED${Date.now()}-x_y`;
  try {
    const r = await seedSecret({home, key, value});
    assert.deepEqual({exit: r.exit, timedOut: r.timedOut, prompts: r.prompts, echoed: r.echoed, stored: r.stored}, {exit: 0, timedOut: false, prompts: 2, echoed: false, stored: true});
    assert.ok(!JSON.stringify(r).includes(value));
    const dir = storeDir({HOME: home});
    assert.equal(await fileStore({dir}).read(key), value);
    assert.equal(statSync(dir).mode & 0o777, 0o700);
    assert.equal(statSync(join(dir, key)).mode & 0o777, 0o600);
  } finally {
    assert.deepEqual(await removeStoreHome({home, key}), {keyGone: true, homeGone: true});
  }
});

test('a set that fails before any prompt ends without waiting for the timeout', {skip: !hasPty && 'needs bash and script'}, async () => {
  const home = createStoreHome();
  try {
    const started = Date.now();
    const r = await seedSecret({home, key: 'K', value: 'v', cli: join(home, 'absent.mjs'), timeoutMs: 10_000});
    assert.equal(r.timedOut, false);
    assert.notEqual(r.exit, 0);
    assert.equal(r.prompts, 0);
    assert.equal(r.stored, false);
    assert.ok(Date.now() - started < 9_000);
  } finally {
    await removeStoreHome({home});
  }
});

test('only a temporary home createStoreHome made is ever removed', async () => {
  const home = createStoreHome();
  const inside = join(home, 'not-a-store-home');
  mkdirSync(inside);
  await assert.rejects(removeStoreHome({home: inside}), /temporary \$HOME/);
  assert.ok(existsSync(inside));
  assert.deepEqual(await removeStoreHome({home}), {keyGone: true, homeGone: true});
});
