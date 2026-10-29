// `cua install` and `cua engine build|status` with cua's Linux engine (#171; docs/doperpowers/specs/2026-10-28-own-linux-
// engine-design.md, "Selection, distribution and install", and the Decision Log's M1b.1 entry on a missing pin): on
// Linux `cua install` places the pinned engine after the sandbox helper, reporting a missing pin or a failure without
// failing, while `--engine` requires it, refusing a missing pin before anything is installed; `cua engine build` and
// `status` work on Linux, and `approve` and `stop` stay macOS's. The installers and the build are stubbed: nothing is
// downloaded or built.
import './helpers/scratch-home.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {main, linuxEngineStatusLines} from '../src/cli.mjs';
import {CuaError} from '../src/runtime/errors.mjs';

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
const PIN = {version: '0.1.0', release: 'linux-engine-v0.1.0', assets: {x64: {url: 'https://example.invalid/x64', sha256: SHA}, arm64: {url: 'https://example.invalid/arm64', sha256: SHA}}};
const PLACED = {path: '/fixture/home/engine/linux/cua-engine', version: '0.1.0', release: 'linux-engine-v0.1.0', sha256: SHA, changed: true};
// Only selectable for the host running the tests (install selects the runtime pin for it); its installer is a stub.
const RUNTIME_PIN = {release: '0.0.1-fixture', platform: process.platform, arch: process.arch, appVersion: '0.0.1', archive: {url: 'https://example.invalid/runtime'}};

// The Linux install with every other step stubbed; `calls` records the order of the steps.
function installDeps({enginePin = () => PIN, installEngine, calls = []} = {}) {
  return {calls, deps: {home: '/fixture/home', platform: 'linux', pins: () => [RUNTIME_PIN], nodePins: () => [],
    installRuntime: async () => { calls.push('runtime'); return {release: '0.0.1-fixture', root: '/fixture/runtime', changed: false, record: {source: 'archive'}}; },
    installHelper: async () => { calls.push('helper'); return {path: '/fixture/home/sandbox/h', sha256: SHA, changed: false}; },
    enginePin, installEngine: installEngine ?? (async options => { calls.push(['engine', options.home, options.pin.release]); return PLACED; })}};
}

test('cua install on Linux places the pinned engine after the sandbox helper and reports it, in text and JSON', async () => {
  const {deps, calls} = installDeps();
  const text = await cli(['install', '--no-node'], deps);
  assert.equal(text.status, 0, text.stderr);
  assert.deepEqual(calls, ['runtime', 'helper', ['engine', '/fixture/home', 'linux-engine-v0.1.0']]);
  assert.match(text.stdout, /^installed cua's Linux engine 0\.1\.0 \(linux-engine-v0\.1\.0\) at \/fixture\/home\/engine\/linux\/cua-engine$/m);
  const again = await cli(['install', '--no-node', '--engine'], installDeps({installEngine: async () => ({...PLACED, changed: false})}).deps);
  assert.match(again.stdout, /^cua's Linux engine 0\.1\.0 \(linux-engine-v0\.1\.0\) is already installed and verified at /m);
  const json = JSON.parse((await cli(['install', '--no-node', '--json'], installDeps().deps)).stdout);
  assert.deepEqual(json.engine, PLACED);
});

// The M1b.1 decision: until the first release writes the pin, a plain install installs the rest and says so.
test('with no pin a plain install installs the rest and reports the engine as not pinned; --engine refuses before anything is installed', async () => {
  const {deps, calls} = installDeps({enginePin: () => null, installEngine: async () => assert.fail('nothing to install')});
  const text = await cli(['install', '--no-node'], deps);
  assert.equal(text.status, 0, text.stderr);
  assert.deepEqual(calls, ['runtime', 'helper']);
  assert.match(text.stdout, /^cua's Linux engine is not pinned in this cua yet \(runtime\/engine\/linux-engine\.json comes with its first release\), so none was installed: /m);
  assert.deepEqual(JSON.parse((await cli(['install', '--no-node', '--json'], installDeps({enginePin: () => null}).deps)).stdout).engine, {skipped: 'unpinned'});
  const required = installDeps({enginePin: () => null});
  const refused = await cli(['install', '--no-node', '--engine', '--json'], required.deps);
  assert.equal(refused.status, 1);
  const {error} = JSON.parse(refused.stdout);
  assert.equal(error.code, 'engine_not_pinned');
  assert.match(error.message, /runtime\/engine\/linux-engine\.json/);
  assert.match(error.hint, /cua engine build/);
  assert.deepEqual(required.calls, [], 'refused before the runtime, the helper or anything else');
});

test('a failed engine step fails cua install --engine with the runtime\'s remedy; without --engine it is reported and the install succeeds', async () => {
  const failing = async () => { throw new CuaError('archive_hash_mismatch', 'archive SHA-256 is x; the pin expects y'); };
  const required = await cli(['install', '--no-node', '--engine', '--json'], installDeps({installEngine: failing}).deps);
  assert.equal(required.status, 1);
  const {error} = JSON.parse(required.stdout);
  assert.equal(error.code, 'archive_hash_mismatch');
  assert.match(error.message, /^cua's Linux engine was not installed: archive SHA-256 is x/);
  assert.match(error.hint, /^0\.0\.1-fixture is installed and active; for the engine, run cua install --engine again/);
  const plain = await cli(['install', '--no-node'], installDeps({installEngine: failing}).deps);
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /^cua's Linux engine was not installed: archive SHA-256 is x; the pin expects y \(archive_hash_mismatch\); sessions that select it are refused until it is: run cua install --engine to retry$/m);
  const json = JSON.parse((await cli(['install', '--no-node', '--json'], installDeps({installEngine: failing}).deps)).stdout);
  assert.deepEqual(json.engine, {failed: {code: 'archive_hash_mismatch', message: 'archive SHA-256 is x; the pin expects y'}});
  // A failure the step does not classify is normalized at its boundary all the same.
  const raw = await cli(['install', '--no-node', '--engine'], installDeps({installEngine: async () => { throw Object.assign(new Error('EIO: i/o error'), {code: 'EIO'}); }}).deps);
  assert.equal(raw.status, 1);
  assert.match(raw.stderr, /cua's Linux engine was not installed: EIO: EIO: i\/o error \[linux_engine_install_failed\]/);
});

test('--engine is a Linux flag of cua install: elsewhere a usage error; no engine step runs off Linux', async () => {
  const {deps} = installDeps({installEngine: async () => assert.fail('no engine step')});
  const elsewhere = await cli(['install', '--no-node', '--engine'], {...deps, platform: 'darwin'});
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
