// src/sandbox/linux.mjs: the pinned Linux helper (codex-linux-sandbox, built from openai/codex in this repository's
// workflow) and the argv cua runs it with. The pin is the trust root: a helper whose bytes differ, or that is missing,
// is refused (sandbox_unavailable) on every launch.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {HELPER_NAME, helperAsset, helperDir, helperFor, linuxCommand, linuxHelper, loadHelperPin, parseHelperPin, verifyHelper} from '../../src/sandbox/linux.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const PIN = {
  upstreamTag: 'rust-v0.163.0', upstreamCommit: '83086188ae0614bd882818ff1aa23f3194962012',
  assets: {
    'linux-x64': {url: 'https://github.com/SSFSKIM/cua/releases/download/linux-sandbox-rust-v0.163.0/codex-linux-sandbox-x86_64-unknown-linux-musl', length: 7, sha256: sha('x64-bin')},
    'linux-arm64': {url: 'https://github.com/SSFSKIM/cua/releases/download/linux-sandbox-rust-v0.163.0/codex-linux-sandbox-aarch64-unknown-linux-musl', length: 9, sha256: sha('arm64-bin')},
  },
  attestation: {workflow: '.github/workflows/linux-sandbox-helper.yml', runId: 39109266313},
};

function home(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cua-helper-')));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  return root;
}
function place(root, bytes, pin = PIN) {
  const dir = helperDir(root, pin);
  mkdirSync(dir, {recursive: true});
  writeFileSync(join(dir, HELPER_NAME), bytes);
  chmodSync(join(dir, HELPER_NAME), 0o755);
  return join(dir, HELPER_NAME);
}

test('the checked-in pin parses: an exact upstream release commit, both architectures, the attesting run', () => {
  const pin = loadHelperPin();
  assert.match(pin.upstreamTag, /^rust-v\d+\.\d+\.\d+$/);
  assert.match(pin.upstreamCommit, /^[0-9a-f]{40}$/);
  for (const arch of ['x64', 'arm64']) {
    const asset = helperAsset(pin, arch);
    assert.equal(new URL(asset.url).origin, 'https://github.com');
    assert.ok(asset.url.startsWith(`https://github.com/SSFSKIM/cua/releases/download/linux-sandbox-${pin.upstreamTag}/`), asset.url);
    assert.match(asset.sha256, /^[0-9a-f]{64}$/);
    assert.ok(Number.isSafeInteger(asset.length) && asset.length > 0);
  }
  assert.equal(pin.attestation.workflow, '.github/workflows/linux-sandbox-helper.yml');
  assert.ok(Number.isSafeInteger(pin.attestation.runId));
});

test('the pin is strict: unknown or missing fields, a non-https or foreign URL, a short hash or a prerelease tag are refused', () => {
  assert.deepEqual(parseHelperPin(PIN), PIN);
  const broken = [
    {...PIN, extra: 1},
    {...PIN, upstreamTag: 'rust-v0.164.0-alpha.3'},
    {...PIN, upstreamCommit: 'ae7aad5'},
    {...PIN, assets: {'linux-x64': PIN.assets['linux-x64']}},
    {...PIN, assets: {...PIN.assets, 'linux-x64': {...PIN.assets['linux-x64'], url: 'http://github.com/x'}}},
    {...PIN, assets: {...PIN.assets, 'linux-x64': {...PIN.assets['linux-x64'], sha256: 'abc'}}},
    {...PIN, assets: {...PIN.assets, 'linux-x64': {...PIN.assets['linux-x64'], length: 0}}},
    {...PIN, attestation: {workflow: '.github/workflows/linux-sandbox-helper.yml'}},
  ];
  for (const json of broken) assert.throws(() => parseHelperPin(json), {code: 'invalid_pin'}, JSON.stringify(json).slice(0, 120));
});

test('helperAsset names the asset for this machine\'s architecture and refuses any other', () => {
  assert.equal(helperAsset(PIN, 'arm64'), PIN.assets['linux-arm64']);
  assert.equal(helperAsset(PIN, 'x64'), PIN.assets['linux-x64']);
  assert.throws(() => helperAsset(PIN, 'riscv64'), {code: 'unsupported_platform'});
});

test('linuxHelper: the placed helper under $CUA_HOME/sandbox/<upstreamTag>/ when its bytes are the pinned ones', t => {
  const root = home(t);
  const path = place(root, 'arm64-bin');
  assert.equal(helperDir(root, PIN), join(root, 'sandbox', 'rust-v0.163.0'));
  assert.deepEqual(linuxHelper({home: root, arch: 'arm64', pin: PIN}), {path, sha256: PIN.assets['linux-arm64'].sha256});
});

test('linuxHelper refuses a missing helper and a helper whose hash differs from the pin, every time it is asked', t => {
  const root = home(t);
  assert.throws(() => linuxHelper({home: root, arch: 'arm64', pin: PIN}), error => error.code === 'sandbox_unavailable' && /is not installed/.test(error.message) && /cua install/.test(error.hint));
  const path = place(root, 'arm64-bin');
  assert.ok(linuxHelper({home: root, arch: 'arm64', pin: PIN}));
  writeFileSync(path, 'arm64-bin, tampered');
  assert.throws(() => linuxHelper({home: root, arch: 'arm64', pin: PIN}), error => error.code === 'sandbox_unavailable' && /SHA-256/.test(error.message) && error.message.includes(path));
  place(root, 'x64-bin');
  assert.throws(() => linuxHelper({home: root, arch: 'arm64', pin: PIN}), {code: 'sandbox_unavailable'}, 'another architecture\'s helper is not this one');
});

// The pinned bytes are not enough: a helper that cannot be executed would pass the check and then fail at spawn with
// EACCES, so the verifier wants a regular executable file, and refuses anything else the same way (sandbox_unavailable).
test('verifyHelper refuses the pinned bytes when they are not a regular executable file', {skip: process.getuid?.() === 0 && 'root executes any file'}, t => {
  const root = home(t);
  const path = place(root, 'arm64-bin');
  const helper = {path, sha256: PIN.assets['linux-arm64'].sha256};
  assert.deepEqual(verifyHelper(helper), helper);
  chmodSync(path, 0o644);
  assert.throws(() => verifyHelper(helper), error => error.code === 'sandbox_unavailable' && /is not an executable file/.test(error.message) && /cua install/.test(error.hint));
  chmodSync(path, 0o755);
  assert.deepEqual(verifyHelper(helper), helper);
  const dir = join(root, 'not-a-file');
  mkdirSync(dir);
  assert.throws(() => verifyHelper({path: dir, sha256: helper.sha256}), {code: 'sandbox_unavailable'});
});

test('linuxCommand renders the original\'s argv: policy cwd and command cwd, the profile as JSON, then the command', () => {
  const profile = {type: 'managed', network: 'restricted', file_system: {type: 'restricted', entries: [{path: {type: 'special', value: {kind: 'root'}}, access: 'read'}]}};
  const command = ['/node', '--experimental-vm-modules', '/kernel.mjs', '--working-dir', '/run/s'];
  assert.deepEqual(linuxCommand({profile, cwd: '/run/s', command, helper: {path: '/h/codex-linux-sandbox', sha256: 'x'}}), {
    file: '/h/codex-linux-sandbox',
    args: ['--sandbox-policy-cwd', '/run/s', '--command-cwd', '/run/s', '--permission-profile', JSON.stringify(profile), '--', ...command],
  });
});

test('helperFor names the placed path and the pinned hash without reading the helper; verifyHelper reads and checks it', t => {
  const root = home(t);
  const helper = helperFor({home: root, arch: 'x64', pin: PIN});
  assert.deepEqual(helper, {path: join(root, 'sandbox', 'rust-v0.163.0', HELPER_NAME), sha256: PIN.assets['linux-x64'].sha256});
  assert.throws(() => verifyHelper(helper), {code: 'sandbox_unavailable'});
  place(root, 'x64-bin');
  assert.equal(verifyHelper(helper), helper);
  for (const unnamed of [undefined, {}, {path: helper.path}]) assert.throws(() => verifyHelper(unnamed), /names no Linux sandbox helper/);
});
