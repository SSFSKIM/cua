// `cua engine build|approve|status|stop` (src/cli.mjs over src/runtime/engine.mjs; docs/doperpowers/specs/2026-10-18-
// own-native-engine-design.md, M1b): the commands run against a scratch HOME, so the engine directory is a temp
// directory with no bundle and no engine; nothing is built, signed or launched, and every refusal comes before one.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {REPO, shortScratch} from './fixtures/runtime-fixture.mjs';
import {engineStatusLines} from '../src/cli.mjs';

const CLI = join(REPO, 'bin', 'cua.mjs');
const onMac = {skip: process.platform !== 'darwin' && 'the engine commands are macOS only'};

function cua(t, args) {
  const home = shortScratch('cua-cli-eng-');
  t.after(home.cleanup);
  const env = {...process.env, HOME: home.dir, CUA_HOME: join(home.dir, 'cua-home')};
  delete env.CUA_SIGNING_IDENTITY;
  return {home: home.dir, ...spawnSync(process.execPath, [CLI, ...args], {env, encoding: 'utf8', timeout: 60_000})};
}

test('engine without a known subcommand, or build with another --sign, is a usage error', t => {
  for (const args of [['engine'], ['engine', 'install'], ['engine', 'build', '--sign', 'identity'], ['engine', 'status', 'extra']]) {
    const r = cua(t, args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /usage: cua/);
  }
});

test('engine status on a Mac with no engine names the place it would be and nothing running', onMac, t => {
  const r = cua(t, ['engine', 'status', '--json']);
  assert.equal(r.status, 0, r.stderr);
  const status = JSON.parse(r.stdout);
  assert.equal(status.bundlePath, join(r.home, 'Library', 'Application Support', 'cua', 'engine', 'cua Engine.app'), 'no CUA_HOME moves it');
  assert.equal(status.exists, false);
  assert.equal(status.approved, false);
  assert.equal(status.running, false);
  const text = cua(t, ['engine', 'status']);
  assert.match(text.stdout, /none built at .*cua engine build/);
});

test('engine stop with nothing running says so', onMac, t => {
  const r = cua(t, ['engine', 'stop']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /no engine was running/);
});

test('engine build without an identity refuses before building, naming the setting', onMac, t => {
  const r = cua(t, ['engine', 'build', '--json']);
  assert.equal(r.status, 1);
  const answer = JSON.parse(r.stdout);
  assert.equal(answer.error.code, 'engine_identity_missing');
  assert.match(answer.error.message, /signingIdentity/);
});

test('engine approve with no bundle refuses, naming cua engine build', onMac, t => {
  const r = cua(t, ['engine', 'approve']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\[engine_not_built\]/);
  assert.match(r.stderr, /cua engine build/);
});

test('the status lines say whether the signature is the configured identity without naming it', () => {
  const lines = engineStatusLines({bundlePath: '/e/cua Engine.app', exists: true, engineVersion: '0.1.0', build: 'f'.repeat(64),
    signature: {kind: 'identity', identityMatches: true}, approved: false, approvedBuild: 'a'.repeat(64), approvedAt: null, pending: null, running: true,
    status: {pid: 7, accessibility: true, screenRecording: false, inputMonitoring: true, connections: 1}});
  assert.deepEqual(lines, [
    'engine: /e/cua Engine.app (version 0.1.0, build ffffffffffff), signed with the configured identity',
    'approved: no (approved.json names build aaaaaaaaaaaa); run cua engine approve with the owner at the console',
    'running: pid 7, accessibility true, screen recording false, input monitoring true, 1 other connection(s)',
  ]);
});
