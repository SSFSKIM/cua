import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {classifyHelpers, handshakeScript, leftoverScript, osReleaseFacts, preflightScript, servePattern, serveCommand, xDisplayFacts} from '../../scripts/native-baseline/remote.mjs';

test('helpers are classified against the pinned runtime, with their age', () => {
  assert.deepEqual(classifyHelpers('   01:02:03 /Users/someone/rt/sky/SkyComputerUseService\n2-00:00:10 /Applications/Other.app/SkyComputerUseService\n', '/Users/someone/rt'), [
    {path: '~/rt/sky/SkyComputerUseService', origin: 'pinned runtime', ageSeconds: 3723},
    {path: '/Applications/Other.app/SkyComputerUseService', origin: 'another installation', ageSeconds: 172810},
  ]);
  assert.deepEqual(classifyHelpers('', '/x'), []);
});

test('the handshake script touches only a native handshake record of the selected host (vendor or cua)', () => {
  const record = '/Users/someone/Library/Application Support/cua/state/handshake/26.928.40906-darwin-arm64/vendor@26.928.40906-darwin-arm64/computer@2025-06-18.json';
  assert.match(handshakeScript({record, clear: true}), /^rm -f '.*computer@2025-06-18\.json' && if \[ -f /);
  assert.doesNotMatch(handshakeScript({record, clear: false}), /rm -f/);
  const own = '/home/admin/.local/share/cua/state/handshake/26.928.40906-linux-arm64/cua@0.1.0/computer@2025-06-18.json';
  assert.match(handshakeScript({record: own, clear: true}), /^rm -f '.*\/cua@0\.1\.0\/computer@2025-06-18\.json'/);
  const preIdentity = '/Users/someone/Library/Application Support/cua/state/handshake/26.928.40906-darwin-arm64/computer@2025-06-18.json';
  const otherRelease = record.replace('/vendor@26.928.40906-darwin-arm64/', '/vendor@26.999.1-darwin-arm64/');
  for (const other of ['/Users/someone/.codex/config.toml', record.replace('computer@', 'computer,browser@'), preIdentity, otherRelease, own.replace('cua@0.1.0', 'cua@../x')])
    assert.throws(() => handshakeScript({record: other, clear: true}), /not a native handshake record/);
});

test('the serve has the native surface only, the requested REPL host, session approvals and no secret store', () => {
  const {command, args} = serveCommand({device: 'mini', checkout: '/Users/someone/cua-parity', home: '/Users/someone/Library/Application Support/cua', host: 'vendor', platform: 'darwin'});
  assert.equal(command, 'ssh');
  assert.deepEqual(args.slice(0, 3), ['-o', 'BatchMode=yes', 'mini']);
  assert.match(args[3], /CUA_REPL_HOST=vendor CUA_SHIM_SURFACES=computer CUA_SHIM_PERSIST=session CUA_SHIM_SECRETS=off node '\/Users\/someone\/cua-parity\/bin\/cua\.mjs' serve$/);
  assert.doesNotMatch(args[3], /DISPLAY|CUA_BROWSER_SERVICE/);
  assert.throws(() => serveCommand({device: 'mini', checkout: '/x', home: '/y', host: 'other', platform: 'darwin'}), /host must be vendor or cua/);
});

test('on Linux the serve runs in the X session: the display and its cookie in the account\'s home, never a pasted credential', () => {
  const {args} = serveCommand({device: 'cua-linux', checkout: '/home/admin/Developer/GitHub/cua-parity', home: '/home/admin/.local/share/cua', host: 'cua', platform: 'linux', display: ':0'});
  assert.match(args[3], /CUA_REPL_HOST=cua CUA_SHIM_SURFACES=computer CUA_SHIM_PERSIST=session CUA_SHIM_SECRETS=off DISPLAY=':0' XAUTHORITY="\$HOME\/\.Xauthority" node '\/home\/admin\/Developer\/GitHub\/cua-parity\/bin\/cua\.mjs' serve$/);
  assert.throws(() => serveCommand({device: 'cua-linux', checkout: '/x', home: '/y', host: 'vendor', platform: 'linux', display: ':0; rm -rf ~'}), /display/);
});

test('the preflight names the selected host\'s handshake record and, on Linux, the X session it checks', () => {
  const script = preflightScript({host: 'cua', display: ':0'});
  assert.match(script, /^cd \$HOME\/Developer\/GitHub\/cua-parity && node --input-type=module -e /);
  assert.match(script, /hostIdentity/);
  assert.match(script, /"cua"/);
  assert.match(script, /xdpyinfo/);
  assert.throws(() => preflightScript({host: 'both', display: ':0'}), /host must be vendor or cua/);
});

test('the Linux machine facts are read from os-release and xdpyinfo, sizes only', () => {
  assert.deepEqual(osReleaseFacts('NAME="Ubuntu"\nVERSION_ID="24.04"\nPRETTY_NAME="Ubuntu 24.04.5 LTS"\nID=ubuntu\n', '7.0.0-38-generic'), {name: 'Ubuntu', version: '24.04.5 LTS', build: '7.0.0-38-generic'});
  assert.deepEqual(osReleaseFacts('', '6.1'), {name: 'Linux', version: null, build: '6.1'});
  const xdpyinfo = 'name of display:    :0\nscreen #0:\n  dimensions:    1024x768 pixels (271x203 millimeters)\n  resolution:    96x96 dots per inch\n  depth of root window:    24 planes\n';
  assert.deepEqual(xDisplayFacts(xdpyinfo), {pixels: '1024 x 768', resolution: '1024 x 768', scale: 1, depth: 24});
  assert.equal(xDisplayFacts('xdpyinfo:  unable to open display'), null);
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
