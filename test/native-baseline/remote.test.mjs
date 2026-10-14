import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyHelpers, handshakeScript, serveCommand} from '../../scripts/native-baseline/remote.mjs';

test('helpers are classified against the pinned runtime, with their age', () => {
  assert.deepEqual(classifyHelpers('   01:02:03 /Users/someone/rt/sky/SkyComputerUseService\n2-00:00:10 /Applications/Other.app/SkyComputerUseService\n', '/Users/someone/rt'), [
    {path: '~/rt/sky/SkyComputerUseService', origin: 'pinned runtime', ageSeconds: 3723},
    {path: '/Applications/Other.app/SkyComputerUseService', origin: 'another installation', ageSeconds: 172810},
  ]);
  assert.deepEqual(classifyHelpers('', '/x'), []);
});

test('the handshake script touches only a native handshake record', () => {
  const record = '/Users/someone/Library/Application Support/cua/state/handshake/26.928.40906-darwin-arm64/computer@2025-06-18.json';
  assert.match(handshakeScript({record, clear: true}), /^rm -f '.*computer@2025-06-18\.json' && if \[ -f /);
  assert.doesNotMatch(handshakeScript({record, clear: false}), /rm -f/);
  for (const other of ['/Users/someone/.codex/config.toml', record.replace('computer@', 'computer,browser@')]) assert.throws(() => handshakeScript({record: other, clear: true}), /not a native handshake record/);
});

test('the serve has the native surface only, session approvals and no secret store', () => {
  const {command, args} = serveCommand({device: 'mini', checkout: '/Users/someone/cua-parity', home: '/Users/someone/Library/Application Support/cua'});
  assert.equal(command, 'ssh');
  assert.deepEqual(args.slice(0, 3), ['-o', 'BatchMode=yes', 'mini']);
  assert.match(args[3], /CUA_SHIM_SURFACES=computer CUA_SHIM_PERSIST=session CUA_SHIM_SECRETS=off node bin\/cua\.mjs serve$/);
});
