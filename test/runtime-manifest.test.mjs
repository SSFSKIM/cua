import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePin, loadPins, selectPin, resolveRuntime} from '../src/runtime/manifest.mjs';
import {defaultHome} from '../src/runtime/layout.mjs';
import {realPinJson, scratch} from './fixtures/runtime-fixture.mjs';

const expectCode = code => err => { assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`); return true; };

test('the checked-in pin names the official archive, its length and hash, and the vendor runtime it carries', () => {
  const pins = loadPins();
  assert.equal(pins.length, 1);
  const [pin] = pins;
  assert.equal(pin.release, '26.928.40906-darwin-arm64');
  assert.equal(pin.archive.url, 'https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.928.40906.zip');
  assert.equal(pin.archive.length, 687457051);
  assert.equal(pin.archive.sha256, '93bf16b32c80c567e46141f87317ab48489f5b9b6454060ba694f1eed5fbf857');
  assert.deepEqual(pin.runtime, {version: '0.0.27/20260927214556-b77d38801cca', node: '24.21.0-cua.1', ipc: 'CodexComputerUseIPC-5'});
  assert.equal(pin.signing.team, '2DC432GLL2');
  assert.deepEqual(Object.values(pin.components), ['ChatGPT.app/Contents/Resources/cua_node', 'ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app']);
});

test('pin parsing rejects fields it does not know, at any level, rather than ignoring something that affects execution', () => {
  assert.throws(() => parsePin({...realPinJson(), postInstall: 'sh x'}), expectCode('invalid_pin'));
  const nested = realPinJson();
  nested.archive.mirror = 'https://elsewhere.invalid/x.zip';
  assert.throws(() => parsePin(nested), expectCode('invalid_pin'));
  const layout = realPinJson();
  layout.layout.extra = 'cua_node/bin/other';
  assert.throws(() => parsePin(layout), expectCode('invalid_pin'));
});

test('pin parsing rejects malformed values: schema, hash, length, url scheme, release id and escaping paths', () => {
  const cases = {
    schema: p => { p.schema = 2; },
    sha: p => { p.archive.sha256 = 'abc'; },
    length: p => { p.archive.length = -1; },
    http: p => { p.archive.url = 'http://persistent.oaistatic.com/x.zip'; },
    release: p => { p.release = '26.928.40906-linux-x64'; },
    absoluteLayout: p => { p.layout.node = '/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node'; },
    dotdotLayout: p => { p.layout.node = 'cua_node/../../outside'; },
    layoutOutsideComponents: p => { p.layout.node = 'elsewhere/bin/node'; },
    componentName: p => { p.components = {'../x': 'ChatGPT.app/Contents/Resources/cua_node'}; },
    signingOutside: p => { p.signing.components = ['/usr/bin/true']; },
    team: p => { p.signing.team = ''; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const pin = realPinJson();
    mutate(pin);
    assert.throws(() => parsePin(pin), expectCode('invalid_pin'), name);
  }
});

test('platform selection returns the host pin and refuses other targets instead of guessing a download', () => {
  const pins = loadPins();
  assert.equal(selectPin(pins, {platform: 'darwin', arch: 'arm64'}).release, '26.928.40906-darwin-arm64');
  assert.throws(() => selectPin(pins, {platform: 'darwin', arch: 'x64'}), err => {
    assert.equal(err.code, 'unsupported_platform');
    assert.match(err.message, /darwin-x64/);
    assert.match(err.message, /darwin-arm64/);
    return true;
  });
  assert.throws(() => selectPin(pins, {platform: 'linux', arch: 'arm64'}), expectCode('unsupported_platform'));
});

test('CUA_HOME overrides the default home, which is under Application Support', () => {
  assert.equal(defaultHome({CUA_HOME: '/tmp/x'}), '/tmp/x');
  assert.match(defaultHome({HOME: '/Users/someone'}), /\/Library\/Application Support\/cua$/);
});

test('resolving with no pointer is a classified not-installed error with install guidance', () => {
  const {dir, cleanup} = scratch();
  try {
    assert.throws(() => resolveRuntime({home: dir}), err => {
      assert.equal(err.code, 'runtime_not_installed');
      assert.match(err.hint, /cua install/);
      return true;
    });
  } finally { cleanup(); }
});
