// accept-native item 2's checks (scripts/accept/install-item.mjs) at the item's own boundary: the run's selected engine
// pin reaches the reinstall, apart from the runtime's release pin, which only the release and download checks read.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {installChecks} from '../scripts/accept/install-item.mjs';
import {REPO} from './fixtures/runtime-fixture.mjs';
import {enginePaths} from '../src/runtime/engine.mjs';
import {infoPlist} from '../src/runtime/engine-bundle.mjs';

const VERIFIED = ['runtime.files', 'runtime.vendor-manifest', 'runtime.ipc', 'runtime.signatures'].map(name => ({name, status: 'pass', detail: ''}));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'accept-install-item-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const runtimeRoot = join(root, 'runtime');
  mkdirSync(runtimeRoot);
  writeFileSync(join(runtimeRoot, 'file'), 'runtime');
  const paths = enginePaths(join(root, 'engine'));
  mkdirSync(join(paths.bundle, 'Contents'), {recursive: true});
  writeFileSync(join(paths.bundle, 'Contents', 'Info.plist'), infoPlist({version: '0.1.0', build: 'a'.repeat(64)}));
  writeFileSync(paths.approved, JSON.stringify({build: 'a'.repeat(64), identity: 'f'.repeat(40)}));
  const releasePin = {release: 'r1', platform: 'darwin'};
  const calls = [];
  const options = {
    releasePin, archivePath: '/nonexistent.zip', cli: '/fixture/cua.mjs', env: {HOME: root, CUA_HOME: '/fixture/home'}, engineDir: paths.dir,
    doctorChecks: VERIFIED, fromSuite: name => ({name, status: 'PASS', detail: 'suite'}), sanitize: text => String(text),
    runtimeOf: () => ({root: runtimeRoot, release: 'r1', manifest: {}}),
    recordOf: () => ({source: 'archive', archive: {sha256: '0'.repeat(64), length: 1}}),
    downloadProof: ({pin}) => ({name: 'download mode (official pinned URL)', status: 'BLOCKED', detail: `release ${pin.release}`}),
    run: async (file, args, {env}) => {
      calls.push(env.CUA_NATIVE_ENGINE);
      return {code: 0, stderr: '', stdout: JSON.stringify({ok: true, changed: false, engine: env.CUA_NATIVE_ENGINE === 'cua'
        ? {status: 'pass', bundlePath: paths.bundle, build: 'a'.repeat(64), changed: false, pending: false, approved: true}
        : {skipped: 'not_selected'}})};
    },
  };
  return {options, calls};
}

test('item 2 reinstalls with the engine the run pinned: cua pinned, the engine step runs and is judged', async t => {
  const {options, calls} = fixture(t);
  const checks = await installChecks({...options, enginePin: {engine: 'cua', pinnedBy: '--engine'}, platform: 'darwin'});
  assert.deepEqual(calls, ['cua']);
  assert.ok(checks.some(c => c.name.startsWith('reinstall keeps the approved engine') && c.status === 'PASS'), JSON.stringify(checks));
  assert.equal(checks.find(c => c.name === 'installed release').status, 'PASS');
  assert.match(checks.find(c => c.name.startsWith('download mode')).detail, /release r1/, 'the download check reads the release pin');
});

test('item 2 on the vendor engine, or none driven, stays acquisition-only', async t => {
  for (const enginePin of [{engine: 'vendor', pinnedBy: 'default'}, null]) {
    const {options, calls} = fixture(t);
    const checks = await installChecks({...options, enginePin, platform: 'darwin'});
    assert.deepEqual(calls, ['vendor']);
    assert.ok(!checks.some(c => c.name.startsWith('reinstall keeps the approved engine')));
    assert.equal(checks.find(c => c.name === 'reinstall mutates nothing').status, 'PASS');
  }
});

test('accept-native hands item 2 the engine pin it pinned, and declares no other `pin` that could shadow it', () => {
  const source = readFileSync(join(REPO, 'scripts', 'accept-native.mjs'), 'utf8');
  assert.match(source, /installChecks\(\{[^}]*\benginePin: pin\b/);
  const declarations = [...source.matchAll(/\b(?:const|let|var)\s+(?:\{[^}]*\bpin\b[^}]*\}|pin\b)|\(\{pin\}\s*=/g)].map(m => m[0]);
  assert.deepEqual(declarations, ['let pin', '({pin} ='], 'one engine pin, from pinLane');
});

test('item 2 does not reinstall over a release that does not verify', async t => {
  const {options, calls} = fixture(t);
  const checks = await installChecks({...options, enginePin: {engine: 'cua'}, doctorChecks: VERIFIED.slice(1), platform: 'darwin'});
  assert.deepEqual(calls, []);
  assert.equal(checks.find(c => c.name === 'reinstall mutates nothing').status, 'FAIL');
});
