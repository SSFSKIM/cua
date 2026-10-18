// `cua install`'s Linux sandbox helper step (#115 M3): the pinned asset for the machine's architecture, fetched (or
// taken from a local file), checked against the pin's length and SHA-256 before it is placed, then moved to
// $CUA_HOME/sandbox/<upstreamTag>/codex-linux-sandbox (0755, directory 0755) with one rename. A verified helper makes
// the step a no-op; a different one is never replaced in place.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {installSandboxHelper} from '../src/runtime/install.mjs';
import {HELPER_NAME, linuxHelper} from '../src/sandbox/linux.mjs';

const BYTES = Buffer.from('#!/bin/sh\necho fixture helper\n');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const URL_X64 = 'https://github.com/SSFSKIM/cua/releases/download/linux-sandbox-rust-v0.163.0/codex-linux-sandbox-x86_64-unknown-linux-musl';
const PIN = {upstreamTag: 'rust-v0.163.0', upstreamCommit: '83086188ae0614bd882818ff1aa23f3194962012',
  assets: {'linux-x64': {url: URL_X64, length: BYTES.length, sha256: sha(BYTES)}, 'linux-arm64': {url: URL_X64.replace('x86_64', 'aarch64'), length: 3, sha256: sha('arm')}},
  attestation: {workflow: '.github/workflows/linux-sandbox-helper.yml', runId: 1}};
const LINUX = {platform: 'linux', arch: 'x64'};

function setup(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cua-helper-install-')));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  return {dir, home: join(dir, 'home')};
}
const serving = (bytes, urls = []) => async url => { urls.push(url); return new Response(bytes, {headers: {'content-length': String(bytes.length)}}); };
const expectCode = code => error => { assert.equal(error.code, code, `${error.code}: ${error.message}`); return true; };

test('the helper is fetched from the pinned URL, verified, and placed 0755 in a 0755 directory; the staging is gone', async t => {
  const {home} = setup(t);
  const urls = [];
  const result = await installSandboxHelper({home, pin: PIN, host: LINUX, fetch: serving(BYTES, urls)});
  const path = join(realpathSync(home), 'sandbox', 'rust-v0.163.0', HELPER_NAME);
  assert.deepEqual(result, {path, sha256: sha(BYTES), changed: true});
  assert.deepEqual(urls, [URL_X64]);
  assert.deepEqual(readFileSync(path), BYTES);
  assert.equal(statSync(path).mode & 0o777, 0o755);
  assert.equal(statSync(join(realpathSync(home), 'sandbox', 'rust-v0.163.0')).mode & 0o777, 0o755);
  assert.deepEqual(readdirSync(join(realpathSync(home), 'staging')), []);
  assert.ok(linuxHelper({home: realpathSync(home), arch: 'x64', pin: PIN}), 'what install placed is what every launch accepts');
});

test('a local file is taken instead of the download; a verified helper makes the step a no-op', async t => {
  const {dir, home} = setup(t);
  writeFileSync(join(dir, 'helper'), BYTES);
  assert.equal((await installSandboxHelper({home, pin: PIN, host: LINUX, path: join(dir, 'helper'), fetch: async () => assert.fail('no download')})).changed, true);
  assert.equal((await installSandboxHelper({home, pin: PIN, host: LINUX, fetch: async () => assert.fail('no download')})).changed, false);
});

test('bytes that are not the pinned ones are never placed: a short, long or different download or local file', async t => {
  const {dir, home} = setup(t);
  const other = Buffer.from('#!/bin/sh\necho this is not the pinned helper\n');
  await assert.rejects(installSandboxHelper({home, pin: PIN, host: LINUX, fetch: serving(other)}), expectCode('archive_length_mismatch'));
  const same = Buffer.alloc(BYTES.length, 0x41);
  await assert.rejects(installSandboxHelper({home, pin: PIN, host: LINUX, fetch: serving(same)}), expectCode('archive_hash_mismatch'));
  writeFileSync(join(dir, 'helper'), same);
  await assert.rejects(installSandboxHelper({home, pin: PIN, host: LINUX, path: join(dir, 'helper')}), expectCode('archive_hash_mismatch'));
  assert.equal(existsSync(join(realpathSync(home), 'sandbox')), false);
  assert.deepEqual(readdirSync(join(realpathSync(home), 'staging')), []);
});

test('a placed helper whose bytes differ is not replaced in place; another platform has no helper step', async t => {
  const {home} = setup(t);
  mkdirSync(join(home, 'sandbox', 'rust-v0.163.0'), {recursive: true});
  writeFileSync(join(home, 'sandbox', 'rust-v0.163.0', HELPER_NAME), 'tampered');
  await assert.rejects(installSandboxHelper({home, pin: PIN, host: LINUX, fetch: serving(BYTES)}), error => error.code === 'sandbox_helper_invalid' && /remove/.test(error.hint));
  assert.equal(readFileSync(join(home, 'sandbox', 'rust-v0.163.0', HELPER_NAME), 'utf8'), 'tampered');
  await assert.rejects(installSandboxHelper({home, pin: PIN, host: {platform: 'darwin', arch: 'arm64'}}), expectCode('unsupported_platform'));
});
