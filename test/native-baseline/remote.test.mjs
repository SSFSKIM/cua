import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {classifyHelpers, handshakeScript, leftoverScript, servePattern, serveCommand} from '../../scripts/native-baseline/remote.mjs';

test('helpers are classified against the pinned runtime, with their age', () => {
  assert.deepEqual(classifyHelpers('   01:02:03 /Users/someone/rt/sky/SkyComputerUseService\n2-00:00:10 /Applications/Other.app/SkyComputerUseService\n', '/Users/someone/rt'), [
    {path: '~/rt/sky/SkyComputerUseService', origin: 'pinned runtime', ageSeconds: 3723},
    {path: '/Applications/Other.app/SkyComputerUseService', origin: 'another installation', ageSeconds: 172810},
  ]);
  assert.deepEqual(classifyHelpers('', '/x'), []);
});

test('the handshake script touches only a native handshake record of the vendor host', () => {
  const record = '/Users/someone/Library/Application Support/cua/state/handshake/26.928.40906-darwin-arm64/vendor@26.928.40906-darwin-arm64/computer@2025-06-18.json';
  assert.match(handshakeScript({record, clear: true}), /^rm -f '.*computer@2025-06-18\.json' && if \[ -f /);
  assert.doesNotMatch(handshakeScript({record, clear: false}), /rm -f/);
  const preIdentity = '/Users/someone/Library/Application Support/cua/state/handshake/26.928.40906-darwin-arm64/computer@2025-06-18.json';
  for (const other of ['/Users/someone/.codex/config.toml', record.replace('computer@', 'computer,browser@'), preIdentity]) assert.throws(() => handshakeScript({record: other, clear: true}), /not a native handshake record/);
});

test('the serve has the native surface only, session approvals and no secret store', () => {
  const {command, args} = serveCommand({device: 'mini', checkout: '/Users/someone/cua-parity', home: '/Users/someone/Library/Application Support/cua'});
  assert.equal(command, 'ssh');
  assert.deepEqual(args.slice(0, 3), ['-o', 'BatchMode=yes', 'mini']);
  assert.match(args[3], /CUA_SHIM_SURFACES=computer CUA_SHIM_PERSIST=session CUA_SHIM_SECRETS=off node '\/Users\/someone\/cua-parity\/bin\/cua\.mjs' serve$/);
});

test('the serve detector matches the command line serveCommand launches, and not itself or another checkout', () => {
  const pattern = new RegExp(servePattern('/Users/someone/cua-parity'));
  assert.ok(pattern.test('node /Users/someone/cua-parity/bin/cua.mjs serve'));
  assert.ok(!pattern.test('node /Users/someone/cua/bin/cua.mjs serve'));
  assert.ok(!pattern.test('node bin/cua.mjs serve'));
  // The script that runs pgrep carries the pattern in its own command line; the bracket keeps it from matching itself.
  assert.ok(!pattern.test(leftoverScript('/Users/someone/cua-parity')));
  // pgrep -f takes an extended regular expression: the pattern must be one.
  const shell = execFileSync('/bin/sh', ['-c', `printf '%s\\n' 'node /Users/someone/cua-parity/bin/cua.mjs serve' | grep -cE '${servePattern('/Users/someone/cua-parity')}'`], {encoding: 'utf8'});
  assert.equal(shell.trim(), '1');
});
