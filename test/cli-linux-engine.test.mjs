// `cua engine build|status` with cua's Linux engine (#171; docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md,
// "Selection, distribution and install"): `cua engine build` and `status` work on Linux, and `approve` and `stop` stay
// macOS's; `cua install --engine` is a Linux flag. The build is stubbed: nothing is built. `cua install`'s engine lane
// on Linux, with the rest of its steps, is test/cli-linux-install.test.mjs's (#171 M6a).
import './helpers/scratch-home.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {main, linuxEngineStatusLines} from '../src/cli.mjs';

async function cli(args, deps) {
  const out = [], err = [];
  const write = {stdout: process.stdout.write, stderr: process.stderr.write};
  process.stdout.write = chunk => { out.push(String(chunk)); return true; };
  process.stderr.write = chunk => { err.push(String(chunk)); return true; };
  try {
    const status = await main(args, deps);
    return {status, stdout: out.join(''), stderr: err.join('')};
  } finally { Object.assign(process.stdout, {write: write.stdout}); Object.assign(process.stderr, {write: write.stderr}); }
}

const SHA = 'a'.repeat(64);

test('--engine is a Linux flag of cua install: elsewhere a usage error; no engine step runs off Linux', async () => {
  const elsewhere = await cli(['install', '--no-node', '--engine'], {platform: 'darwin', installEngine: async () => assert.fail('no engine step')});
  assert.equal(elsewhere.status, 2);
  assert.match(elsewhere.stderr, /--engine on Linux only/);
});

test('cua engine status and build on Linux report the engine against the pin; approve and stop stay macOS\'s', async () => {
  const facts = {path: '/h/engine/linux/cua-engine', exists: true, executable: true, sha256: SHA, build: 'pinned', version: '0.1.0', release: 'linux-engine-v0.1.0',
    pinned: {version: '0.1.0', release: 'linux-engine-v0.1.0', sha256: SHA}, current: true};
  const linux = {platform: 'linux', home: '/h', arch: 'x64', inspectLinuxEngine: () => facts, buildLinuxEngine: async options => ({path: facts.path, version: '0.2.0', commit: 'abc', sha256: 'b'.repeat(64), build: 'local', changed: true, home: options.home})};
  const status = await cli(['engine', 'status'], linux);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(status.stdout, `engine: /h/engine/linux/cua-engine, cua-engine 0.1.0 (the pinned linux-engine-v0.1.0), SHA-256 ${SHA}\npin: cua-engine 0.1.0 (linux-engine-v0.1.0) for linux-x64, SHA-256 ${SHA}\n`);
  assert.deepEqual(JSON.parse((await cli(['engine', 'status', '--json'], linux)).stdout), facts);
  const built = await cli(['engine', 'build'], linux);
  assert.equal(built.status, 0, built.stderr);
  assert.equal(built.stdout, `built cua's Linux engine 0.2.0 (abc) and installed it at /h/engine/linux/cua-engine as a local build, SHA-256 ${'b'.repeat(64)}; CUA_NATIVE_ENGINE=cua selects it\n`);
  assert.equal(JSON.parse((await cli(['engine', 'build', '--json'], linux)).stdout).build, 'local');
  for (const command of ['approve', 'stop']) {
    const refused = await cli(['engine', command], linux);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /\[engine_macos_only\]/);
    assert.match(refused.stderr, /cua engine build|cua engine status/);
  }
  assert.equal((await cli(['engine', 'build', '--sign', 'adhoc'], linux)).status, 2, 'signing is macOS\'s');
});

test('the Linux status lines say what the engine is against the pin, and what is missing', () => {
  const pinned = {version: '0.1.0', release: 'linux-engine-v0.1.0', sha256: SHA};
  const base = {path: '/h/e', exists: true, executable: true, sha256: 'b'.repeat(64), release: null, pinned, current: false};
  assert.deepEqual(linuxEngineStatusLines({...base, build: 'local', version: '0.2.0'}, 'x64')[0], `engine: /h/e, cua-engine 0.2.0 (a local build, not the pinned engine), SHA-256 ${'b'.repeat(64)}`);
  assert.deepEqual(linuxEngineStatusLines({...base, build: 'pinned', version: '0.0.9', release: 'linux-engine-v0.0.9'}, 'x64')[0],
    `engine: /h/e, cua-engine 0.0.9 (from linux-engine-v0.0.9, not this cua's pinned 0.1.0), SHA-256 ${'b'.repeat(64)}`);
  assert.deepEqual(linuxEngineStatusLines({...base, build: 'unknown', version: null}, 'x64')[0], `engine: /h/e is neither this cua's pinned engine nor a build cua recorded (SHA-256 ${'b'.repeat(64)})`);
  assert.deepEqual(linuxEngineStatusLines({...base, build: 'local', version: '0.2.0', executable: false}, 'x64')[0], `engine: /h/e, cua-engine 0.2.0 (a local build, not the pinned engine), SHA-256 ${'b'.repeat(64)}; not executable`);
  assert.deepEqual(linuxEngineStatusLines({...base, exists: false, executable: false, sha256: null, build: null, version: null, pinned: null}, 'arm64'), [
    'engine: none installed at /h/e (cua install --engine, or cua engine build)',
    'pin: none in this cua (runtime/engine/linux-engine.json comes with the engine\'s first release)',
  ]);
});
