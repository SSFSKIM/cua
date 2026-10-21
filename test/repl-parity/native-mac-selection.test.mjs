// The native-mac suite's selection (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, M2b; Verification
// system part 3; the Decision Log's whole-M1b review rule): `--engine`, `--approved-runtime` and `--approved-engine` on
// the parity CLI, the approved route of `prepare` on macOS (the approved runtime and engine served in place, never a
// fresh home), and the darwin native command, whose serve pins CUA_NATIVE_ENGINE to its --engine. Nothing reaches a
// device: preparation runs against a command double.
import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseSelection} from '../../scripts/repl-parity.mjs';
import {nativeCommand, nativeMacCommand} from '../../scripts/repl-parity/native.mjs';
import {approvedJournalFor, manageApprovedPreparation} from '../../scripts/repl-parity/prepare-device.mjs';

const scratches = [];
after(() => { for (const dir of scratches) fs.rmSync(dir, {recursive: true, force: true}); });
const scratch = () => { const dir = fs.mkdtempSync(join(tmpdir(), 'cua-native-mac-sel-')); scratches.push(dir); return dir; };
const A = ['--approved-runtime', '/Users/u/Library/Application Support/cua', '--approved-engine', '/Users/u/Library/Application Support/cua/engine/cua Engine.app'];
const run = (...rest) => parseSelection(['run', '--device', 'mini', ...A, '--suite', 'native-mac', '--out', '/nowhere', ...rest]);

test('parseSelection: a native-mac run names its host and engine apart, on a declared macOS device, with the approved runtime and engine', () => {
  assert.equal(run('--host', 'vendor', '--engine', 'vendor').v.engine, 'vendor');
  assert.equal(run('--host', 'vendor', '--engine', 'cua').v.engine, 'cua');
  assert.equal(run('--host', 'cua', '--engine', 'cua').v['approved-engine'], A[3]);
  assert.throws(() => run('--host', 'cua', '--engine', 'vendor'), /accepts only the vendor host/);
  assert.throws(() => run('--host', 'vendor'), /--engine vendor\|cua/);
  assert.throws(() => run('--host', 'vendor', '--engine', 'sky'), /--engine vendor\|cua/);
  assert.throws(() => parseSelection(['run', '--device', 'mini', '--suite', 'native-mac', '--engine', 'cua', '--approved-runtime', A[1], '--out', '/x']), /--approved-engine/);
  assert.throws(() => parseSelection(['run', '--device', 'mini', '--suite', 'native-mac', '--engine', 'cua', '--approved-engine', A[3], '--out', '/x']), /--approved-runtime/);
  assert.throws(() => parseSelection(['run', '--device', 'mini', '--suite', 'native-mac', '--engine', 'cua', '--approved-runtime', 'relative', '--approved-engine', A[3], '--out', '/x']), /absolute/);
  assert.throws(() => parseSelection(['run', '--device', 'cua-gce', ...A, '--suite', 'native-mac', '--engine', 'cua', '--out', '/x']), /macOS device/);
  assert.throws(() => parseSelection(['run', '--device', 'local', ...A, '--suite', 'native-mac', '--engine', 'cua', '--out', '/x']), /macOS device/);
  assert.throws(() => run('--engine', 'cua', '--through', 'M4'), /--through/);
});

test('parseSelection: the engine options belong to the native-mac suite and to the approved prepare, nowhere else', () => {
  assert.throws(() => parseSelection(['run', '--device', 'mini', '--suite', 'cells', '--engine', 'cua', '--out', '/x']), /native-mac/);
  assert.throws(() => parseSelection(['run', '--device', 'mini', '--suite', 'cells', ...A, '--out', '/x']), /native-mac/);
  assert.throws(() => parseSelection(['diff', 'a', 'b', '--engine', 'cua']), /native-mac/);
  const prepared = parseSelection(['prepare', '--device', 'mini', '--commit', 'abc1234', ...A]);
  assert.equal(prepared.v['approved-runtime'], A[1]);
  assert.throws(() => parseSelection(['prepare', '--device', 'mini', '--commit', 'abc1234', ...A.slice(0, 2)]), /--approved-engine/);
  assert.throws(() => parseSelection(['prepare', '--device', 'cua-gce', '--commit', 'abc1234', ...A]), /macOS device/);
  assert.throws(() => parseSelection(['prepare', '--device', 'mini', '--commit', 'abc1234', ...A, '--engine', 'cua']), /--engine/);
  // The other suites' selection is unchanged.
  assert.equal(parseSelection(['run', '--device', 'mini', '--host', 'cua', '--suite', 'api', '--out', '/x']).v.suite, 'api');
  assert.equal(parseSelection(['diff', 'a', 'b', '--suite', 'native-mac']).v.suite, 'native-mac');
});

const PREPARED = {device: 'mini', home: '/Users/u/Library/Application Support/cua', userHome: '/Users/u', configHome: '/s/config', tmpdir: '/s/tmp', admission: 'secret-token', token: 'secret-token',
  runtimeReuse: {approvedHome: '/Users/u/Library/Application Support/cua', release: '26.928.40906-darwin-arm64'}};
const PRE = {checkout: '/Users/u/Developer/GitHub/cua-parity', home: '/Users/u/Library/Application Support/cua'};

test('the darwin native command: the approved home\'s admitted serve, with the host and the engine each pinned', () => {
  for (const [host, engine] of [['vendor', 'vendor'], ['vendor', 'cua'], ['cua', 'cua']]) {
    const {command, args} = nativeMacCommand({device: 'mini', host, engine, approvedEngine: A[3], pre: PRE, prepared: PREPARED});
    const script = args.at(-1);
    assert.equal(command, 'ssh');
    assert.ok(args.includes('mini'));
    assert.match(script, new RegExp(`CUA_REPL_HOST=${host} CUA_NATIVE_ENGINE=${engine} `), `${host}/${engine}`);
    assert.match(script, /CUA_SHIM_SURFACES=computer /);
    assert.match(script, /CUA_NATIVE_ADMISSION='secret-token'/);
    assert.match(script, /scripts\/native-baseline\/serve\.mjs/);
    assert.match(script, /HOME='\/Users\/u'/);
  }
  assert.throws(() => nativeMacCommand({device: 'mini', host: 'cua', engine: 'vendor', approvedEngine: A[3], pre: PRE, prepared: PREPARED}), /accepts only the vendor host/);
  assert.throws(() => nativeMacCommand({device: 'mini', host: 'vendor', approvedEngine: A[3], pre: PRE, prepared: PREPARED}), /--engine/);
  assert.throws(() => nativeMacCommand({device: 'cua-gce', host: 'vendor', engine: 'vendor', approvedEngine: A[3], pre: PRE, prepared: PREPARED}), /macOS device/);
  assert.throws(() => nativeMacCommand({device: 'mini', host: 'vendor', engine: 'vendor', approvedEngine: A[3], pre: PRE, prepared: {...PREPARED, runtimeReuse: undefined}}), /approved runtime/);
  // Today's native lane stays Linux-only.
  assert.throws(() => nativeCommand({device: 'mini', platform: 'darwin', host: 'cua', checkout: '/c', home: '/h'}), /declared Linux device/);
});

const ENGINE_CHECK = {ok: true, engine: {bundlePath: A[3], build: 'b'.repeat(64), engineVersion: '0.1.0', approvedAt: '2026-10-21T00:00:00Z', signature: {kind: 'identity', identityMatches: true}}, checkout: {build: 'b'.repeat(64)}, problems: []};

test('prepare on macOS serves the approved runtime and engine: it places the harness checkout and checks the engine, and installs nothing', () => {
  const dir = scratch(), journal = join(dir, 'mini.json'), out = join(dir, 'out');
  const commands = [];
  const execute = command => { commands.push(command.args.at(-1)); return 'Cloning…\n' + 'a'.repeat(40) + '\n'; };
  const prepared = manageApprovedPreparation('prepare', {journal, out, device: 'mini', commit: 'aaaaaaa', 'approved-runtime': A[1], 'approved-engine': A[3]}, {execute, engineCheck: () => ENGINE_CHECK});
  assert.equal(commands.length, 1);
  assert.match(commands[0], /git checkout --detach 'aaaaaaa'/);
  assert.match(commands[0], /git rev-parse HEAD$/);
  assert.doesNotMatch(commands[0], /cua\.mjs install|prepare-device\.mjs/);
  assert.deepEqual(prepared, {route: 'approved', device: 'mini', platform: 'darwin', commit: 'a'.repeat(40), approvedRuntime: A[1], approvedEngine: A[3],
    engine: {build: 'b'.repeat(64), engineVersion: '0.1.0', signature: {kind: 'identity', identityMatches: true}}, preparedAt: prepared.preparedAt});
  assert.deepEqual(JSON.parse(fs.readFileSync(journal, 'utf8')), prepared);
  assert.deepEqual(JSON.parse(fs.readFileSync(join(out, 'prepare.json'), 'utf8')), prepared);
  // A run must name the prepared sitting's approved runtime and engine, on its device.
  assert.equal(approvedJournalFor(prepared, {device: 'mini', 'approved-runtime': A[1], 'approved-engine': A[3]}), prepared);
  assert.throws(() => approvedJournalFor(prepared, {device: 'mini', 'approved-runtime': '/other', 'approved-engine': A[3]}), /approved runtime/);
  assert.throws(() => approvedJournalFor(prepared, {device: 'mini', 'approved-runtime': A[1], 'approved-engine': '/other.app'}), /approved engine/);
  assert.throws(() => approvedJournalFor({...prepared, route: undefined, ownedPreparation: {}}, {device: 'mini', 'approved-runtime': A[1], 'approved-engine': A[3]}), /approved-runtime/);
  // Prepared twice: refused while a fresh-home preparation is outstanding; cleanup removes only the journal.
  fs.writeFileSync(journal, JSON.stringify({ownedPreparation: {home: '/h'}}));
  assert.throws(() => manageApprovedPreparation('prepare', {journal, device: 'mini', commit: 'aaaaaaa', 'approved-runtime': A[1], 'approved-engine': A[3]}, {execute, engineCheck: () => ENGINE_CHECK}), /cleanup-prepared/);
  fs.writeFileSync(journal, JSON.stringify(prepared));
  assert.deepEqual(manageApprovedPreparation('cleanup-prepared', {journal, device: 'mini'}), {removed: true, owned: false});
  assert.equal(fs.existsSync(journal), false);
});

test('prepare on macOS refuses an engine that is not approved or not the checkout\'s build, and a checkout that did not land on the commit', () => {
  const dir = scratch(), journal = join(dir, 'mini.json');
  const options = {journal, device: 'mini', commit: 'aaaaaaa', 'approved-runtime': A[1], 'approved-engine': A[3]};
  const execute = () => 'a'.repeat(40) + '\n';
  assert.throws(() => manageApprovedPreparation('prepare', options, {execute, engineCheck: () => ({...ENGINE_CHECK, ok: false, problems: ['the approved engine\'s build bbbbbbbbbbbb is not this checkout\'s cccccccccccc']})}), /not this checkout's/);
  assert.throws(() => manageApprovedPreparation('prepare', options, {execute: () => 'e'.repeat(40) + '\n', engineCheck: () => ENGINE_CHECK}), /not at aaaaaaa/);
  assert.equal(fs.existsSync(journal), false);
  assert.throws(() => manageApprovedPreparation('cleanup-prepared', {journal, device: 'mini'}), /No approved preparation/);
});
