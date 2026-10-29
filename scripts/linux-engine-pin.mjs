#!/usr/bin/env node
// Pins a release of cua's Linux engine (#171): downloads the linux-engine-v<version> release's two assets, verifies
// each with `gh attestation verify` (built by .github/workflows/linux-engine.yml, from the release commit, on a
// GitHub-hosted runner), checks them against the release's SHA256SUMS, and writes runtime/engine/linux-engine.json,
// which `cua install` fetches by. Spec docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, Distribution and
// Interfaces.
//
//   node scripts/linux-engine-pin.mjs linux-engine-v<version>
//
// It refuses a release whose version is not the checkout's native/linux-engine/Cargo.toml, or whose commit's engine
// sources differ from HEAD's: the pin is committed to the pull request the release was built from, and names the
// engine that pull request merges. Nothing is written unless every check passes.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const REPO = 'SSFSKIM/cua';
export const WORKFLOW = '.github/workflows/linux-engine.yml';
export const PIN_PATH = 'runtime/engine/linux-engine.json';
export const ENGINE_DIR = 'native/linux-engine';
export const ARCHES = ['x64', 'arm64'];
const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function versionOfTag(tag) {
  const match = /^linux-engine-v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(tag ?? '');
  if (!match) throw new Error(`a release tag is linux-engine-v<major>.<minor>.<patch>, not ${JSON.stringify(tag)}`);
  return match[1];
}

export const assetName = (version, arch) => `cua-engine-${version}-linux-${arch}`;
export const assetUrl = (tag, name) => `https://github.com/${REPO}/releases/download/${tag}/${name}`;

// `sha256sum`'s output: a lowercase sum, a space, then a space (text mode) or `*` (binary mode), then the name.
export function parseSha256Sums(text) {
  const sums = new Map();
  text.split('\n').forEach((line, i) => {
    if (line === '') return;
    const match = /^([0-9a-f]{64}) [ *](.+)$/.exec(line);
    if (!match) throw new Error(`SHA256SUMS line ${i + 1} is not "<sha256>  <name>"`);
    sums.set(match[2], match[1]);
  });
  return sums;
}

// The version in Cargo.toml's [package] table.
export function cargoVersion(toml) {
  const table = /^\[package\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(toml)?.[1] ?? '';
  const version = /^version\s*=\s*"([^"]+)"/m.exec(table)?.[1];
  if (!version) throw new Error(`${ENGINE_DIR}/Cargo.toml has no [package] version`);
  return version;
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function must(result, what) {
  if (result.status !== 0) throw new Error(`${what} failed: ${(result.stderr || result.stdout || '').trim()}`);
  return result.stdout;
}

// `run(command, args)` returns {status, stdout, stderr}; the tests pass a fake gh and git.
export function pinRelease({tag, root = ROOT, run = runCommand}) {
  const version = versionOfTag(tag);
  const checkoutVersion = cargoVersion(readFileSync(join(root, ENGINE_DIR, 'Cargo.toml'), 'utf8'));
  if (checkoutVersion !== version)
    throw new Error(`${ENGINE_DIR}/Cargo.toml is ${checkoutVersion}, not the release's ${version}: pin from the checkout the release was built from`);

  const commit = must(run('gh', ['api', `repos/${REPO}/commits/${tag}`, '--jq', '.sha']), `resolving ${tag}`).trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`${tag} resolves to ${JSON.stringify(commit)}, not a commit`);
  const diff = run('git', ['-C', root, 'diff', '--quiet', commit, 'HEAD', '--', ENGINE_DIR]);
  if (diff.status === 1) throw new Error(`${ENGINE_DIR} differs between the release commit ${commit} and HEAD: the release is not this checkout's engine`);
  must(diff, `comparing ${ENGINE_DIR} at ${commit} with HEAD (fetch the release commit if it is missing)`);

  const names = ARCHES.map(arch => assetName(version, arch));
  const dir = mkdtempSync(join(tmpdir(), 'cua-engine-pin-'));
  try {
    must(run('gh', ['release', 'download', tag, '--repo', REPO, '--dir', dir,
      ...[...names, 'SHA256SUMS'].flatMap(name => ['--pattern', name])]), `downloading ${tag}'s assets`);
    const sums = parseSha256Sums(readFileSync(join(dir, 'SHA256SUMS'), 'utf8'));
    const assets = {};
    for (const [i, arch] of ARCHES.entries()) {
      const name = names[i], file = join(dir, name);
      const verified = run('gh', ['attestation', 'verify', file, '--repo', REPO, '--signer-workflow', `${REPO}/${WORKFLOW}`,
        '--source-digest', commit, '--deny-self-hosted-runners']);
      if (verified.status !== 0) throw new Error(`gh attestation verify failed for ${name}: ${(verified.stderr || verified.stdout || '').trim()}`);
      const digest = sha256(readFileSync(file));
      if (!sums.has(name)) throw new Error(`SHA256SUMS does not list ${name}`);
      if (sums.get(name) !== digest) throw new Error(`${name}: SHA-256 ${digest} is not SHA256SUMS' ${sums.get(name)}`);
      assets[arch] = {url: assetUrl(tag, name), sha256: digest};
    }
    const pin = {version, release: tag, assets};
    mkdirSync(dirname(join(root, PIN_PATH)), {recursive: true});
    writeFileSync(join(root, PIN_PATH), `${JSON.stringify(pin, null, 2)}\n`);
    return pin;
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {encoding: 'utf8'});
  if (result.error) return {status: -1, stdout: '', stderr: result.error.message};
  return result;
}

function main(argv) {
  if (argv.length !== 1) {
    console.error('usage: node scripts/linux-engine-pin.mjs linux-engine-v<version>');
    return 2;
  }
  try {
    const pin = pinRelease({tag: argv[0]});
    console.log(`${PIN_PATH}: ${pin.release}`);
    for (const [arch, {url, sha256: digest}] of Object.entries(pin.assets)) console.log(`  ${arch} ${digest} ${url} (attestation verified)`);
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
