// scripts/linux-engine-pin.mjs: writes runtime/engine/linux-engine.json from a linux-engine-v<version> release, after
// gh attestation verify of both assets (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, Distribution
// and Interfaces). gh and git are faked here: the fake serves a release's assets from bytes the test chooses, and
// records every call.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PIN_PATH, assetName, parseSha256Sums, pinRelease, versionOfTag} from '../scripts/linux-engine-pin.mjs';

const COMMIT = 'a'.repeat(40);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// A checkout whose engine is at `version`.
function checkout(t, version = '0.1.0') {
  const root = mkdtempSync(join(tmpdir(), 'cua-engine-pin-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  mkdirSync(join(root, 'native/linux-engine'), {recursive: true});
  writeFileSync(join(root, 'native/linux-engine/Cargo.toml'),
    `[package]\nname = "cua-linux-engine"\n# a comment\nversion = "${version}"\nedition = "2024"\n\n[dependencies]\nserde = { version = "1.0.228" }\n`);
  return root;
}

// gh and git as the release `tag` would answer them. `assets` maps file names to bytes; `sums` is SHA256SUMS's text
// (by default the assets' true sums); `attested` the asset names whose attestation verifies; `sourcesDiffer` makes
// the engine's sources at HEAD differ from the release commit's.
function fake({tag = 'linux-engine-v0.1.0', version = '0.1.0', assets, sums, attested, sourcesDiffer = false} = {}) {
  assets ??= {[assetName(version, 'x64')]: Buffer.from('x64 engine'), [assetName(version, 'arm64')]: Buffer.from('arm64 engine')};
  sums ??= Object.entries(assets).map(([name, bytes]) => `${sha256(bytes)}  ${name}\n`).join('');
  attested ??= Object.keys(assets);
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    const ok = (stdout = '') => ({status: 0, stdout, stderr: ''});
    if (command === 'gh' && args[0] === 'api' && args[1] === `repos/SSFSKIM/cua/commits/${tag}`) return ok(`${COMMIT}\n`);
    if (command === 'git' && args.includes('diff')) return {status: sourcesDiffer ? 1 : 0, stdout: '', stderr: ''};
    if (command === 'gh' && args[0] === 'release' && args[1] === 'download' && args[2] === tag) {
      const dir = args[args.indexOf('--dir') + 1];
      for (const [name, bytes] of Object.entries(assets)) writeFileSync(join(dir, name), bytes);
      writeFileSync(join(dir, 'SHA256SUMS'), sums);
      return ok();
    }
    if (command === 'gh' && args[0] === 'attestation' && args[1] === 'verify') {
      const name = args[2].split('/').pop();
      return attested.includes(name) ? ok() : {status: 1, stdout: '', stderr: 'no matching attestations'};
    }
    return {status: 1, stdout: '', stderr: `unexpected: ${command} ${args.join(' ')}`};
  };
  return {run, calls, assets};
}

const pinned = root => JSON.parse(readFileSync(join(root, PIN_PATH), 'utf8'));

test('the tag names the version: linux-engine-v<major>.<minor>.<patch>, nothing else', () => {
  assert.equal(versionOfTag('linux-engine-v0.1.0'), '0.1.0');
  assert.equal(versionOfTag('linux-engine-v12.0.3'), '12.0.3');
  for (const bad of ['0.1.0', 'linux-engine-0.1.0', 'linux-engine-v0.1', 'linux-engine-v0.1.0-rc1', 'linux-sandbox-v0.1.0', 'linux-engine-v01.1.0'])
    assert.throws(() => versionOfTag(bad), /linux-engine-v<major>\.<minor>\.<patch>/, bad);
});

test('SHA256SUMS: one lowercase sum and a name per line, binary or text mode', () => {
  const sums = parseSha256Sums(`${'1'.repeat(64)}  cua-engine-0.1.0-linux-x64\n${'2'.repeat(64)} *cua-engine-0.1.0-linux-arm64\n`);
  assert.deepEqual([...sums], [['cua-engine-0.1.0-linux-x64', '1'.repeat(64)], ['cua-engine-0.1.0-linux-arm64', '2'.repeat(64)]]);
  assert.throws(() => parseSha256Sums('not a sum\n'), /SHA256SUMS line 1/);
});

test('pins both assets by their URLs and the SHA-256 of the bytes downloaded, in the Interfaces schema', t => {
  const root = checkout(t);
  const {run, assets} = fake();
  const pin = pinRelease({tag: 'linux-engine-v0.1.0', root, run});
  const base = 'https://github.com/SSFSKIM/cua/releases/download/linux-engine-v0.1.0';
  const expected = {
    version: '0.1.0',
    release: 'linux-engine-v0.1.0',
    assets: {
      x64: {url: `${base}/cua-engine-0.1.0-linux-x64`, sha256: sha256(assets['cua-engine-0.1.0-linux-x64'])},
      arm64: {url: `${base}/cua-engine-0.1.0-linux-arm64`, sha256: sha256(assets['cua-engine-0.1.0-linux-arm64'])},
    },
  };
  assert.deepEqual(pin, expected);
  assert.deepEqual(pinned(root), expected);
  assert.equal(readFileSync(join(root, PIN_PATH), 'utf8'), `${JSON.stringify(expected, null, 2)}\n`);
});

test('each asset is verified as built by the release workflow from the release commit on a hosted runner', t => {
  const root = checkout(t);
  const {run, calls} = fake();
  pinRelease({tag: 'linux-engine-v0.1.0', root, run});
  const verifies = calls.filter(c => c[0] === 'gh' && c[1] === 'attestation');
  assert.deepEqual(verifies.map(c => c[3].split('/').pop()), ['cua-engine-0.1.0-linux-x64', 'cua-engine-0.1.0-linux-arm64']);
  for (const call of verifies) {
    const flag = name => call[call.indexOf(name) + 1];
    assert.equal(flag('--repo'), 'SSFSKIM/cua');
    assert.equal(flag('--signer-workflow'), 'SSFSKIM/cua/.github/workflows/linux-engine.yml');
    assert.equal(flag('--source-digest'), COMMIT);
    assert.ok(call.includes('--deny-self-hosted-runners'));
  }
});

test('an asset whose attestation does not verify is refused, and nothing is written', t => {
  for (const arch of ['x64', 'arm64']) {
    const root = checkout(t);
    const {run} = fake({attested: [assetName('0.1.0', arch === 'x64' ? 'arm64' : 'x64')]});
    assert.throws(() => pinRelease({tag: 'linux-engine-v0.1.0', root, run}),
      new RegExp(`gh attestation verify failed for cua-engine-0\\.1\\.0-linux-${arch}`));
    assert.equal(existsSync(join(root, PIN_PATH)), false);
  }
});

test('an asset whose bytes do not match the release\'s SHA256SUMS, or that it does not list, is refused', t => {
  const assets = {'cua-engine-0.1.0-linux-x64': Buffer.from('x64'), 'cua-engine-0.1.0-linux-arm64': Buffer.from('arm64')};
  const wrong = `${sha256(Buffer.from('other'))}  cua-engine-0.1.0-linux-x64\n${sha256(assets['cua-engine-0.1.0-linux-arm64'])}  cua-engine-0.1.0-linux-arm64\n`;
  let root = checkout(t);
  assert.throws(() => pinRelease({tag: 'linux-engine-v0.1.0', root, run: fake({assets, sums: wrong}).run}),
    /cua-engine-0\.1\.0-linux-x64: SHA-256 [0-9a-f]{64} is not SHA256SUMS' [0-9a-f]{64}/);
  assert.equal(existsSync(join(root, PIN_PATH)), false);
  root = checkout(t);
  const partial = `${sha256(assets['cua-engine-0.1.0-linux-x64'])}  cua-engine-0.1.0-linux-x64\n`;
  assert.throws(() => pinRelease({tag: 'linux-engine-v0.1.0', root, run: fake({assets, sums: partial}).run}),
    /SHA256SUMS does not list cua-engine-0\.1\.0-linux-arm64/);
});

test('a release of another version than the checkout\'s engine is refused before anything is fetched', t => {
  const root = checkout(t, '0.2.0');
  const {run, calls} = fake();
  assert.throws(() => pinRelease({tag: 'linux-engine-v0.1.0', root, run}),
    /native\/linux-engine\/Cargo\.toml is 0\.2\.0, not the release's 0\.1\.0/);
  assert.deepEqual(calls, []);
});

test('a release built from other engine sources than the checkout\'s is refused: the pin must name the merged engine', t => {
  const root = checkout(t);
  const {run, calls} = fake({sourcesDiffer: true});
  assert.throws(() => pinRelease({tag: 'linux-engine-v0.1.0', root, run}),
    new RegExp(`native/linux-engine differs between the release commit ${COMMIT} and HEAD`));
  const diff = calls.find(c => c[0] === 'git');
  assert.deepEqual(diff.slice(-5), ['--quiet', COMMIT, 'HEAD', '--', 'native/linux-engine']);
  assert.equal(calls.some(c => c[1] === 'release'), false);
});
