// The plain-file secret store (src/secrets/store.mjs) and its doctor row (src/secrets/check.mjs), against temporary
// directories only: what a value read accepts and refuses (and that no refusal carries file bytes), the key listing,
// the atomic 0600 write, removal, and what doctor says about the directory and its files without opening one.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileStore, storeDir, connectionSecrets, SecretStoreError, MAX_VALUE_BYTES} from '../src/secrets/store.mjs';
import {inspectStore, classifyStore} from '../src/secrets/check.mjs';
import {isLabel} from '../src/secrets/label.mjs';

const SENTINEL = 'S3NT1NEL-value-never-in-errors';
function scratch(t) {
  const root = mkdtempSync(join(tmpdir(), 'cua-store-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const dir = join(root, '.config', 'claude-secrets');
  mkdirSync(dir, {recursive: true, mode: 0o700});
  const put = (key, content, mode = 0o600) => { const path = join(dir, key); writeFileSync(path, content, {mode}); chmodSync(path, mode); return path; };
  return {root, dir, store: fileStore({dir}), put};
}
const refusal = async promise => {
  try { await promise; } catch (error) { return error; }
  assert.fail('expected a refusal');
};

test('the store is $HOME/.config/claude-secrets, the mod\'s directory', () => {
  assert.equal(storeDir({HOME: '/home/u'}), '/home/u/.config/claude-secrets');
  const secrets = connectionSecrets({enabled: true, env: {HOME: '/Users/u'}});
  assert.equal(secrets.dir, '/Users/u/.config/claude-secrets');
  assert.deepEqual(connectionSecrets({enabled: false, env: {HOME: '/x'}}).unavailable.code, 'secrets_disabled');
});

test('keys follow the mod grammar [A-Za-z_][A-Za-z0-9_]*', () => {
  for (const key of ['A', '_', 'GITHUB_TOKEN', 'work_password2', '_x9']) assert.ok(isLabel(key), key);
  for (const key of ['', '9A', 'work-password', 'a.b', 'a b', '../x', 'x/y', '.hidden', 'é', 42, null]) assert.ok(!isLabel(key), String(key));
});

test('read returns the value with exactly one trailing newline dropped', async t => {
  const {store, put} = scratch(t);
  put('PLAIN', 'abc');
  put('ECHOED', 'abc\n');
  put('TWO', 'abc\n\n');
  put('CRLF', 'abc\r\n');
  put('UNICODE', 'pässwörd ✓');
  put('EMPTY', '');
  assert.equal(await store.read('PLAIN'), 'abc');
  assert.equal(await store.read('ECHOED'), 'abc');
  assert.equal(await store.read('TWO'), 'abc\n');
  assert.equal(await store.read('CRLF'), 'abc\r');
  assert.equal(await store.read('UNICODE'), 'pässwörd ✓');
  assert.equal(await store.read('EMPTY'), '');
});

test('read refuses, classified and value-free: unknown, invalid key, wrong mode, not a regular file, too large, not UTF-8', async t => {
  const {dir, store, put} = scratch(t);
  put('OPEN', SENTINEL, 0o644);
  put('GROUP', SENTINEL, 0o640);
  put('EXEC', SENTINEL, 0o700);
  put('READONLY', SENTINEL, 0o400);
  mkdirSync(join(dir, 'ADIR'));
  put('TARGET', SENTINEL);
  symlinkSync(join(dir, 'TARGET'), join(dir, 'LINK'));
  execFileSync('/usr/bin/mkfifo', ['-m', '600', join(dir, 'FIFO')]);
  put('BIG', 'x'.repeat(MAX_VALUE_BYTES + 1));
  put('BINARY', Buffer.from([0x41, 0xff, 0xfe, 0x42]));
  const cases = {
    MISSING: 'not_found', OPEN: 'insecure_mode', GROUP: 'insecure_mode', EXEC: 'insecure_mode', READONLY: 'insecure_mode',
    ADIR: 'not_regular_file', LINK: 'not_regular_file', FIFO: 'not_regular_file', BIG: 'too_large', BINARY: 'unsupported_value',
    'bad-key': 'invalid_label', '../TARGET': 'invalid_label',
  };
  for (const [key, code] of Object.entries(cases)) {
    const error = await refusal(store.read(key));
    assert.ok(error instanceof SecretStoreError, key);
    assert.equal(error.code, code, key);
    assert.doesNotMatch(error.message, new RegExp(SENTINEL), key);
    assert.equal(error.cause, undefined);
  }
  assert.equal(await store.read('TARGET'), SENTINEL, 'the link target itself is fine');
  assert.match((await refusal(store.read('OPEN'))).message, /not mode 0600.*chmod 600/);
});

test('a file owned by another user is refused before its bytes are read', async t => {
  const {store, put} = scratch(t);
  put('MINE', SENTINEL);
  // The owner check compares the file's uid with the effective uid; another user is simulated by shifting the latter.
  const original = process.geteuid;
  process.geteuid = () => original.call(process) + 1;
  t.after(() => { process.geteuid = original; });
  const error = await refusal(store.read('MINE'));
  assert.equal(error.code, 'wrong_owner');
  assert.doesNotMatch(error.message, new RegExp(SENTINEL));
});

test('list names the regular files that follow the key grammar, sorted; a missing store lists nothing', async t => {
  const {root, dir, store, put} = scratch(t);
  put('B_KEY', 'v'); put('A_KEY', 'v'); put('.A.tmp', 'v'); put('not-a-key', 'v'); put('OPEN', 'v', 0o644);
  mkdirSync(join(dir, 'SUBDIR'));
  symlinkSync(join(dir, 'A_KEY'), join(dir, 'LINKED'));
  assert.deepEqual(await store.list(), ['A_KEY', 'B_KEY', 'OPEN']);
  assert.deepEqual(await fileStore({dir: join(root, 'absent')}).list(), []);
});

test('write creates the directory 0700 and the file 0600, replaces by rename, leaves no temporary file', async t => {
  const root = mkdtempSync(join(tmpdir(), 'cua-store-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const dir = join(root, '.config', 'claude-secrets');
  const store = fileStore({dir});
  const path = await store.write('NEW_KEY', 'first');
  assert.equal(path, join(dir, 'NEW_KEY'));
  assert.equal(statSync(dir).mode & 0o777, 0o700);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(await store.read('NEW_KEY'), 'first');
  chmodSync(dir, 0o755);
  await store.write('NEW_KEY', 'second');
  assert.equal(statSync(dir).mode & 0o777, 0o700, 'the directory is made 0700 again, as the mod does');
  assert.equal(await store.read('NEW_KEY'), 'second');
  assert.deepEqual(readdirSync(dir), ['NEW_KEY']);
  await assert.rejects(store.write('bad-key', 'x'), {code: 'invalid_label'});
});

test('remove deletes one key file; an unknown key is not_found', async t => {
  const {dir, store, put} = scratch(t);
  put('GONE', 'v'); put('KEPT', 'v');
  await store.remove('GONE');
  assert.ok(!existsSync(join(dir, 'GONE')));
  assert.deepEqual(await store.list(), ['KEPT']);
  assert.equal((await refusal(store.remove('GONE'))).code, 'not_found');
  assert.equal((await refusal(store.remove('../KEPT'))).code, 'invalid_label');
});

test('doctor: secrets.store from metadata only', async t => {
  const {root, dir, put} = scratch(t);
  const row = (target = dir, options) => classifyStore(inspectStore({dir: target}), options);
  assert.equal(row(join(root, 'absent')).status, 'blocked');
  assert.match(row(join(root, 'absent')).detail, /\/secret KEY.*cua secrets set KEY/);
  assert.equal(row(dir, {enabled: false}).status, 'skip');
  assert.equal(row().status, 'pass');
  assert.match(row().detail, /^0 secrets in /);
  put('A', SENTINEL);
  assert.match(row().detail, /^1 secret in /);
  put('LOOSE', SENTINEL, 0o644);
  const loose = row();
  assert.equal(loose.status, 'fail');
  assert.match(loose.detail, /LOOSE \(mode 0644, not 0600\)/);
  assert.doesNotMatch(loose.detail, new RegExp(SENTINEL));
  chmodSync(join(dir, 'LOOSE'), 0o600);
  chmodSync(dir, 0o755);
  assert.match(row().detail, /mode 0755, open to other users; chmod 700/);
  chmodSync(dir, 0o700);
  const file = join(root, 'file');
  writeFileSync(file, '');
  assert.equal(row(file).status, 'fail');
  assert.equal(row().status, 'pass');
});
