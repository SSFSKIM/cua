// The parity devices (#115 M0): the GCE box is a declared Linux device beside the paused cua-linux VM, and the live
// lanes (native, API, capability) run on any declared device of the right platform instead of naming cua-linux.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {declaredDevice} from '../../scripts/repl-parity/devices.mjs';
import {nativeCommand} from '../../scripts/repl-parity/native.mjs';
import {apiCommand} from '../../scripts/repl-parity/api-lanes.mjs';
import {capabilityFixtureCommand} from '../../scripts/repl-parity/capability.mjs';
import {parseSelection} from '../../scripts/repl-parity.mjs';

const facts = {platform: 'linux', checkout: '/fixture/cua-parity', home: '/fixture/home'};

test('the GCE box is declared as a Linux device with no inherited H4 home; cua-linux stays declared', () => {
  const gce = declaredDevice('cua-gce');
  assert.equal(gce.platform, 'linux');
  assert.equal(gce.discoveryHome, undefined, 'a new Linux device must not inherit the VM\'s H4 registration');
  assert.equal(declaredDevice('cua-linux').platform, 'linux');
  assert.throws(() => declaredDevice('cua-nowhere'), /not declared/);
});

test('the native lane runs on any declared Linux device it was prepared on, and on nothing else', () => {
  for (const device of ['cua-gce', 'cua-linux']) {
    const command = nativeCommand({...facts, device, host: 'vendor'});
    assert.equal(command.command, 'ssh');
    assert.ok(command.args.includes(device), device);
    assert.equal(command.expectedFacts.device, device);
  }
  assert.throws(() => nativeCommand({...facts, device: 'mini', platform: 'darwin', host: 'cua'}), /declared Linux device/);
  assert.throws(() => nativeCommand({...facts, device: 'cua-gce', platform: 'darwin', host: 'cua'}), /declared Linux device/);
  assert.throws(() => nativeCommand({...facts, device: 'local', host: 'cua'}), /not declared/);
  assert.throws(() => nativeCommand({...facts, device: 'cua-gce', host: 'other'}), /declared Linux device/);
});

test('the API and capability lanes accept any declared device and still refuse a local runtime', () => {
  const prepared = {device: 'cua-gce', checkout: '/fixture/cua-parity', home: '/fixture/home'};
  assert.ok(apiCommand({...prepared, host: 'cua'}).args.includes('cua-gce'));
  assert.ok(capabilityFixtureCommand(prepared).args.includes('cua-gce'));
  assert.throws(() => apiCommand({...prepared, device: 'local', host: 'cua'}), /remote/);
  assert.throws(() => capabilityFixtureCommand({...prepared, device: 'local'}), /remote/);
});

// Selection only: parseSelection reads no preparation journal and starts nothing, so no live device is ever reached.
test('the parity CLI selects a declared device, and pending declarations need a Linux one', () => {
  const pending = ['--pending-cell', 'x', '--pending-reason', 'y'];
  assert.equal(parseSelection(['run', '--device', 'cua-gce', '--host', 'vendor', '--suite', 'all', '--out', '/nowhere']).v.device, 'cua-gce');
  assert.equal(parseSelection(['run', '--device', 'cua-gce', '--host', 'cua', ...pending, '--out', '/nowhere']).v['pending-reason'], 'y');
  assert.equal(parseSelection(['diff', 'a', 'b']).v.device, 'local');
  assert.throws(() => parseSelection(['run', '--device', 'cua-nowhere', '--host', 'vendor', '--out', '/nowhere']), /Invalid parity selection/);
  assert.throws(() => parseSelection(['run', '--device', 'mini', '--host', 'cua', ...pending, '--out', '/nowhere']), /live Linux run/);
  assert.throws(() => parseSelection(['run', '--device', 'cua-gce', '--host', 'both']), /Invalid parity selection/);
});
