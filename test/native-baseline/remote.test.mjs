import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {classifyHelpers, HELPER_SCRIPT, handshakeScript, leftoverScript, osReleaseFacts, preflightScript, servePattern, serveCommand, xDisplayFacts} from '../../scripts/native-baseline/remote.mjs';

test('helpers are classified against the pinned runtime, with their age', () => {
  assert.deepEqual(classifyHelpers('   01:02:03 /Users/someone/rt/sky/SkyComputerUseService\n2-00:00:10 /Applications/Other.app/SkyComputerUseService\n', '/Users/someone/rt'), [
    {path: '~/rt/sky/SkyComputerUseService', kind: 'vendor', origin: 'pinned runtime', ageSeconds: 3723},
    {path: '/Applications/Other.app/SkyComputerUseService', kind: 'vendor', origin: 'another installation', ageSeconds: 172810},
  ]);
  assert.deepEqual(classifyHelpers('', '/x'), []);
});

// #117: the helper attestation covers both engines' processes (the own native engine spec, Verification system part 1).
test('both engines\' processes are classified: the vendor helper against the pinned runtime, cua-engine against the approved engine', () => {
  const engine = '/Users/someone/Library/Application Support/cua/engine/cua Engine.app';
  const ps = ['      00:07 /Users/someone/rt/sky/SkyComputerUseService', `      00:04 ${engine}/Contents/MacOS/cua-engine`,
    '   01:00:00 /tmp/cua-m1b4-copy/cua Engine.app/Contents/MacOS/cua-engine'].join('\n');
  assert.deepEqual(classifyHelpers(ps, '/Users/someone/rt', engine), [
    {path: '~/rt/sky/SkyComputerUseService', kind: 'vendor', origin: 'pinned runtime', ageSeconds: 7},
    {path: '~/Library/Application Support/cua/engine/cua Engine.app/Contents/MacOS/cua-engine', kind: 'cua', origin: 'approved engine', ageSeconds: 4},
    {path: '/tmp/cua-m1b4-copy/cua Engine.app/Contents/MacOS/cua-engine', kind: 'cua', origin: 'another engine copy', ageSeconds: 3600},
  ]);
  assert.equal(classifyHelpers(`00:04 ${engine}/Contents/MacOS/cua-engine`, '/x', null)[0].origin, 'another engine copy', 'no approved engine known: no copy is it');
  // The script lists both processes and nothing else: a process whose path only contains the name is not one.
  const listed = execFileSync('/bin/sh', ['-c', `printf '%s\\n' '00:01 /a/SkyComputerUseService' '00:02 /b/cua Engine.app/Contents/MacOS/cua-engine' '00:03 /c/cua-engine-helper' '00:04 /d/SkyComputerUseService.log' | ${HELPER_SCRIPT.replace(/^.*?\| /, '')}`], {encoding: 'utf8'});
  assert.deepEqual(listed.trim().split('\n'), ['00:01 /a/SkyComputerUseService', '00:02 /b/cua Engine.app/Contents/MacOS/cua-engine']);
});

test('a macOS computer serve and its preflight name the requested native engine; the preflight reads the approved engine on the device', () => {
  const at = {device: 'mini', checkout: '/Users/someone/cua-parity', home: '/Users/someone/cua-home', userHome: '/Users/someone', configHome: '/c', host: 'vendor', platform: 'darwin'};
  assert.match(serveCommand({...at, engine: 'cua'}).args[3], /CUA_REPL_HOST=vendor CUA_NATIVE_ENGINE=cua CUA_SHIM_SURFACES=computer /);
  assert.doesNotMatch(serveCommand(at).args[3], /CUA_NATIVE_ENGINE/);
  assert.throws(() => serveCommand({...at, engine: 'sky'}), /engine must be vendor or cua/);
  // The route A/B's switch only when asked for.
  assert.match(serveCommand({...at, engine: 'cua', spikeRoute: true}).args[3], / CUA_ENGINE_SPIKE_ROUTE=1[ "]/);
  assert.doesNotMatch(serveCommand({...at, engine: 'cua'}).args[3], /CUA_ENGINE_SPIKE_ROUTE/);
  const bundle = '/Users/someone/Library/Application Support/cua/engine/cua Engine.app';
  const prepared = {home: at.home, userHome: at.userHome, configHome: '/c', xSession: {}};
  const script = preflightScript({host: 'vendor', engine: 'cua', approvedEngine: bundle, prepared});
  assert.match(script, /HOME='\/Users\/someone' /);
  assert.match(script, /CUA_NATIVE_ENGINE=cua/);
  assert.match(script, /scripts\/native-baseline\/engine\.mjs/);
  assert.match(script, /approvedEngineFacts/);
  assert.ok(script.includes(JSON.stringify(bundle).replace(/'/g, "'\\''")));
  assert.doesNotMatch(preflightScript({host: 'cua', display: ':0', surface: 'browser'}), /approvedEngineFacts\(\{/, 'a browser-surface run reads no engine');
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
  assert.doesNotMatch(args[3], /DISPLAY/);
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

test('the own host\'s Node reaches the serve only through its command environment: absolute, and for the cua host only', () => {
  const node = '/home/admin/.local/share/cua-parity-node/node-v24.18.0-linux-arm64/bin/node';
  const at = {device: 'cua-linux', checkout: '/home/admin/Developer/GitHub/cua-parity', home: '/home/admin/.local/share/cua', platform: 'linux', display: ':0'};
  const {args} = serveCommand({...at, host: 'cua', node});
  assert.match(args[3], /CUA_REPL_HOST=cua CUA_NODE='\/home\/admin\/\.local\/share\/cua-parity-node\/node-v24\.18\.0-linux-arm64\/bin\/node' CUA_SHIM_SURFACES=computer /);
  // The proxy itself stays on the device's node; only the own host's executable is named.
  assert.match(args[3], / node '\/home\/admin\/Developer\/GitHub\/cua-parity\/bin\/cua\.mjs' serve$/);
  assert.throws(() => serveCommand({...at, host: 'vendor', node}), /--node names the own host's Node; the vendor host uses its pinned one/);
  assert.throws(() => serveCommand({...at, host: 'cua', node: 'bin/node'}), /absolute path/);
  assert.throws(() => serveCommand({...at, host: 'cua', node: "/x'; rm -rf ~; '"}), /absolute path/);
  const script = preflightScript({host: 'cua', display: ':0', node});
  assert.match(script, /ownNode/);
  assert.ok(script.includes(JSON.stringify(node).replace(/'/g, "'\\''")));
  assert.doesNotMatch(preflightScript({host: 'cua', display: ':0'}), /cua-parity-node/);
  assert.throws(() => preflightScript({host: 'vendor', display: ':0', node}), /vendor host uses its pinned one/);
});

test('ARM Linux CPU identity uses lscpu when the kernel exposes no model name to Node', async () => {
  const {linuxCpuFacts}=await import('../../scripts/native-baseline/remote.mjs');
  assert.deepEqual(linuxCpuFacts(JSON.stringify({lscpu:[{field:'Architecture:',data:'aarch64'},{field:'Model name:',data:'Neoverse-N1'}]}),[{model:'unknown'},{model:'unknown'}]),{model:'Neoverse-N1',count:2});
  assert.deepEqual(linuxCpuFacts('',[{model:'Test CPU'}]),{model:'Test CPU',count:1});
  assert.deepEqual(linuxCpuFacts('',[{model:'unknown'}]),{model:null,count:1});
});

// The browser-surface mode (#115 acceptance 11): the serve has the browser surface alone with cua's browser service,
// and the preflight resolves that surface's handshake record and sandbox mode.
test('a browser-surface serve names the browser surface and cua\'s browser service; its handshake record is the browser one', () => {
  const at = {device: 'mini', checkout: '/Users/someone/cua-parity', home: '/Users/someone/Library/Application Support/cua', host: 'cua', platform: 'darwin'};
  assert.match(serveCommand({...at, surface: 'browser'}).args[3], /CUA_REPL_HOST=cua CUA_SHIM_SURFACES=browser CUA_SHIM_PERSIST=session CUA_SHIM_SECRETS=off node /);
  assert.throws(() => serveCommand({...at, surface: 'computer,browser'}), /--surfaces must be computer or browser/);
  const record = '/Users/someone/.local/share/cua/state/handshake/26.928.40906-darwin-arm64/cua@0.1.0/browser@2025-06-18.json';
  assert.match(handshakeScript({record, clear: true}), /^rm -f '.*\/browser@2025-06-18\.json'/);
  const script = preflightScript({host: 'cua', display: ':0', surface: 'browser'});
  assert.match(script, /browser@2025-06-18\.json/);
  assert.doesNotMatch(script, /computer@2025-06-18\.json/);
  assert.match(preflightScript({host: 'cua', display: ':0'}), /computer@2025-06-18\.json/);
});
