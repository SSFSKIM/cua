import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {writeFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {REPO, scratch} from './fixtures/runtime-fixture.mjs';

const CLI = join(REPO, 'bin', 'cua.mjs');
// The CLI always runs against a scratch CUA_HOME here; nothing reaches the owner's real home or the network.
function cua(args, home) {
  const env = {...process.env, CUA_HOME: home};
  return spawnSync(process.execPath, [CLI, ...args], {env, encoding: 'utf8', timeout: 60_000});
}

test('doctor --json on an empty home exits nonzero with structured checks and install guidance', {skip: process.platform !== 'darwin' || process.arch !== 'arm64'}, () => {
  const s = scratch();
  try {
    const r = cua(['doctor', '--json'], s.dir);
    assert.equal(r.status, 1, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.equal(report.ok, false);
    const installed = report.checks.find(c => c.name === 'runtime.installed');
    assert.equal(installed.status, 'fail');
    assert.match(installed.detail, /cua install/);
    for (const c of report.checks) assert.ok(['pass', 'fail', 'blocked'].includes(c.status), c.name);
  } finally { s.cleanup(); }
});

test('install --archive with a file that is not the pinned archive fails classified and activates nothing', {skip: process.platform !== 'darwin' || process.arch !== 'arm64'}, () => {
  const s = scratch();
  try {
    const archive = join(s.dir, 'not-the-pin.zip');
    writeFileSync(archive, 'definitely not 687457051 bytes');
    const home = join(s.dir, 'home');
    const r = cua(['install', '--archive', archive, '--json'], home);
    assert.equal(r.status, 1);
    const out = JSON.parse(r.stdout);
    assert.equal(out.ok, false);
    assert.equal(out.error.code, 'archive_length_mismatch');
    assert.equal(existsSync(join(home, 'current.json')), false);
  } finally { s.cleanup(); }
});

test('runtime use of a release with no pin fails classified', () => {
  const s = scratch();
  try {
    const r = cua(['runtime', 'use', '0.0.0-darwin-arm64'], s.dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unknown_release/);
  } finally { s.cleanup(); }
});

test('unknown commands and missing arguments print usage and exit 2', () => {
  const s = scratch();
  try {
    for (const args of [[], ['frobnicate'], ['runtime'], ['runtime', 'use'], ['install', '--bogus']]) {
      const r = cua(args, s.dir);
      assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`);
      assert.match(r.stderr, /usage: cua/i);
    }
  } finally { s.cleanup(); }
});

test('there is no public way to swap the release pins or skip verification', () => {
  const s = scratch();
  try {
    for (const flag of ['--pins', '--releases', '--skip-verify', '--no-verify', '--insecure'])
      assert.equal(cua(['install', flag, 'x'], s.dir).status, 2, flag);
  } finally { s.cleanup(); }
});
