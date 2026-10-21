// scripts/probe/pinned-engine.mjs (#117 M3.3): the engine a live script pins, the selection it predicts, and the
// attestation it expects. The selection runs the real launcher (replHostFor) against a scratch HOME, so the account's
// engine.json and approved engine are never read.
import './helpers/scratch-home.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {approvedEngineFacts, cuaNodes, expectedAttestation, LaneUsageError, pinLane, selectLane} from '../scripts/probe/pinned-engine.mjs';

const HOME = '/tmp/cua-home';

test('a macOS computer lane pins its engine into cua serve\'s environment; elsewhere --engine is a usage error', () => {
  const env = {PATH: '/usr/bin', CUA_NATIVE_ENGINE: 'vendor'};
  const lane = pinLane({flag: 'cua', env, home: HOME, surfaces: ['computer'], platform: 'darwin'});
  assert.deepEqual(lane.pin, {engine: 'cua', pinnedBy: '--engine'});
  assert.deepEqual(lane.serveEnv, {PATH: '/usr/bin', CUA_NATIVE_ENGINE: 'cua', CUA_HOME: HOME});
  assert.equal(env.CUA_NATIVE_ENGINE, 'vendor', 'the caller\'s environment is not touched');
  assert.equal(pinLane({env: {}, home: HOME, surfaces: ['computer', 'browser'], platform: 'darwin'}).serveEnv.CUA_NATIVE_ENGINE, 'vendor', 'the default is pinned too');

  assert.throws(() => pinLane({flag: 'cua', env: {}, home: HOME, surfaces: ['computer'], platform: 'linux'}), LaneUsageError);
  assert.throws(() => pinLane({flag: 'cua', env: {}, home: HOME, surfaces: ['browser'], platform: 'darwin'}), LaneUsageError);
  assert.throws(() => pinLane({flag: 'sky', env: {}, home: HOME, surfaces: ['computer'], platform: 'darwin'}), LaneUsageError);
  const linux = pinLane({env: {CUA_NATIVE_ENGINE: 'cua'}, home: HOME, surfaces: ['computer'], platform: 'linux'});
  assert.equal(linux.pin, null, 'no engine is driven off macOS, so none is pinned');
});

test('the selection is the launcher\'s: the vendor engine on the vendor host, cua\'s refused without an approved engine', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua-pinned-'));
  try {
    const helper = join(dir, 'Codex Computer Use.app');
    mkdirSync(join(helper, 'Contents'), {recursive: true});
    writeFileSync(join(helper, 'Contents', 'Info.plist'), '<plist><dict><key>CFBundleShortVersionString</key>\n<string>26.924.1001281</string></dict></plist>');
    const runtime = {release: '26.928.40906-darwin-arm64', paths: {skyServiceApp: helper}};
    const vendor = pinLane({flag: 'vendor', env: {}, home: dir, surfaces: ['computer'], platform: 'darwin'});
    const selected = selectLane({...vendor, home: dir, runtime, surfaces: ['computer'], platform: 'darwin'});
    assert.equal(selected.selection.host, 'vendor');
    assert.equal(selected.selection.engine.engine, 'vendor');
    assert.deepEqual(selected.expected, {engine: 'vendor', version: '26.924.1001281', build: '26.928.40906-darwin-arm64'});

    const cua = pinLane({flag: 'cua', env: {}, home: dir, surfaces: ['computer'], platform: 'darwin'});
    assert.throws(() => selectLane({...cua, home: dir, runtime, surfaces: ['computer'], platform: 'darwin'}), {code: 'engine_not_installed'});
    assert.deepEqual(selectLane({pin: null, serveEnv: {}, home: dir, runtime, surfaces: ['computer'], platform: 'linux'}), {selection: null, expected: null});
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('the expected attestation: cua\'s from the approved bundle, the vendor\'s null version when its plist is unreadable', () => {
  const app = {bundlePath: '/Users/u/Library/Application Support/cua/engine/cua Engine.app', engineVersion: '0.1.0', build: 'b74949b3'};
  const selection = {host: 'cua', node: '/opt/node24/bin/node', engine: {engine: 'cua', app}};
  assert.deepEqual(expectedAttestation({engine: 'cua', selection}), {engine: 'cua', version: '0.1.0', build: 'b74949b3'});
  assert.deepEqual(expectedAttestation({engine: 'vendor', selection: {host: 'vendor'}, runtime: {release: 'r1', paths: {skyServiceApp: '/nonexistent/x.app'}}}),
    {engine: 'vendor', version: null, build: 'r1'});
  assert.deepEqual(approvedEngineFacts(selection), {
    bundlePath: app.bundlePath, executable: `${app.bundlePath}/Contents/MacOS/cua-engine`,
    socket: '/Users/u/Library/Application Support/cua/engine/engine.sock', directory: '/Users/u/Library/Application Support/cua/engine',
  });
  assert.deepEqual(cuaNodes({hostNode: '/usr/local/bin/node', selection}), ['/usr/local/bin/node', '/opt/node24/bin/node']);
  assert.deepEqual(cuaNodes({hostNode: '/usr/local/bin/node', selection: {host: 'vendor'}}), ['/usr/local/bin/node']);
});
