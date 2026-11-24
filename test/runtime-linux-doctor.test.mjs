// Doctor on Linux (Phase F, #115 M3; #171 M6a): the darwin helper and permission rows give way to display,
// accessibility.bus, sandbox.userns and sandbox.launcher (the pinned helper). Since #171 M6a the runtime rows describe
// cua's own runtime (the pre-flight's §4.5): `platform` names the release its record derives, `runtime.installed` every
// common part (the module tree, Node and the sandbox helper) and the pointer, `runtime.modules` the tree's full check,
// `runtime.node` the Node a session resolves (launch.mjs's own lookup) against its pin; since #171 M6b no row checks a
// vendor runtime, whose engine cua 0.30.0 retired on Linux. Every fail, and every warn for a part behind its pin, names
// the remedy that repairs the home: what to move aside where an installer refuses to replace it, then this cua's own
// installer by its absolute path (ruling 1110). The Linux host and every system probe are injected, so this runs on any
// machine.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chmodSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, truncateSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {inspectRuntime, summarize} from '../src/runtime/doctor.mjs';
import {installRuntime} from '../src/runtime/install.mjs';
import {CuaError} from '../src/runtime/errors.mjs';
import {RELEASES_DIR, linuxRelease, loadLinuxRuntime, ownInstaller, parsePin} from '../src/runtime/manifest.mjs';
import {linuxDesktopChecks, sessionBusAddress} from '../src/runtime/linux-desktop.mjs';
import {browsersFor, registerCuaHost} from '../src/chrome/registration.mjs';
import {CUA_HOST_NAME, launcherPath} from '../src/chrome/extension.mjs';
import {fakeManagedNode, fakeModuleTree} from './fixtures/own-linux-runtime.mjs';
import {REPO, shortScratch, debFixture, linuxFixturePin, debTools} from './fixtures/runtime-fixture.mjs';

const LINUX = {platform: 'linux', arch: 'x64'};
const RECORD = loadLinuxRuntime({host: LINUX});
const RELEASE = linuxRelease(RECORD, 'x64');
const INSTALLER = `\`${ownInstaller().command}\``;
const RELEASE_HINT = ownInstaller({release: RELEASE}).hint;
const byName = report => Object.fromEntries(report.checks.map(c => [c.name, c]));
const never = what => async () => { throw new Error(`${what} must not run on linux`); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const VENDOR_ROWS = ['runtime.files', 'runtime.vendor-manifest', 'runtime.ipc', 'runtime.signatures'];
const TREE = home => join(home, 'modules', RECORD.modules.lock);
const NODE_BIN = (home, version = RECORD.node.version) => join(home, 'node', version, 'bin', 'node');

// A Linux home as `cua install` leaves it: cua's own module tree and Node, the pointer naming the derived release, and
// the vendor's tree of a fixture pin (`pin`) beside them. Each part can be left out.
async function linuxHome(t, {vendor = true, modules = true, node = RECORD.node.version, pointer = RELEASE, name = 'home'} = {}) {
  const s = shortScratch();
  t.after(s.cleanup);
  const archive = debFixture(s.dir);
  const pin = parsePin(linuxFixturePin({sha256: archive.sha256, length: archive.length}));
  const home = join(s.dir, name);
  mkdirSync(home, {recursive: true});
  const real = realpathSync(home);
  if (vendor) await installRuntime({home, manifest: pin, archivePath: archive.deb, host: LINUX, tools: debTools(), verifySignatures: never('codesign'), activate: false});
  if (modules) fakeModuleTree(real, LINUX);
  if (node) fakeManagedNode(real, LINUX, {version: node});
  if (pointer) writeFileSync(join(real, 'current.json'), JSON.stringify({schema: 1, release: pointer}));
  return {home: real, pin};
}

// Files added to one package of an installed tree, recorded as the install records them (its digest and file count;
// native files with their size and hash), so the tree still verifies until a test changes one of them.
function addToPackage(home, pkg, files) {
  const root = TREE(home);
  const record = JSON.parse(readFileSync(join(root, 'install.json'), 'utf8'));
  const entry = record.packages.find(p => p.path === pkg);
  const all = [{path: 'package.json', bytes: readFileSync(join(root, pkg, 'package.json'))}, ...Object.entries(files).map(([path, text]) => ({path, bytes: Buffer.from(text)}))];
  for (const {path, bytes} of all) { mkdirSync(join(root, pkg, path, '..'), {recursive: true}); writeFileSync(join(root, pkg, path), bytes); }
  const listed = all.map(({path, bytes}) => ({path, size: bytes.length, sha256: sha256(bytes)})).sort((a, b) => (a.path < b.path ? -1 : 1));
  Object.assign(entry, {files: listed.length, digest: sha256(JSON.stringify(listed.map(f => [f.path, f.size, f.sha256])))});
  for (const file of listed.filter(f => /\.node$/.test(f.path))) record.natives.push({path: `${pkg}/${file.path}`, size: file.size, sha256: file.sha256});
  writeFileSync(join(root, 'install.json'), JSON.stringify(record, null, 2));
  return root;
}

const DESKTOP_ROWS = [
  {name: 'display', status: 'pass', detail: 'fixture'},
  {name: 'accessibility.bus', status: 'pass', detail: 'fixture'},
  {name: 'sandbox.userns', status: 'blocked', detail: 'fixture'},
];
const DESKTOP_PASS = DESKTOP_ROWS.map(row => (row.name === 'sandbox.userns' ? {...row, status: 'pass'} : row));

const pinnedHelper = ({home, arch}) => ({path: join(home, 'sandbox', 'rust-v0.163.0', 'codex-linux-sandbox'), sha256: arch.padEnd(64, '0')});
// cua's pinned engine installed: the selection's inputs, the inspection's facts and the capability report.
const ENGINE_SHA = 'c'.repeat(64);
const pinnedEngine = home => {
  const path = join(home, 'engine', 'linux', 'cua-engine');
  const pinned = {version: RECORD.engine.version, release: `linux-engine-v${RECORD.engine.version}`, sha256: ENGINE_SHA};
  return {engine: {config: () => ({}), installed: () => ({path}), installedVersion: () => RECORD.engine.version},
    inspectLinuxEngine: () => ({path, exists: true, executable: true, sha256: ENGINE_SHA, build: 'pinned', version: pinned.version, release: pinned.release, pinned, current: true}),
    readLinuxCapabilities: async ({desktop}) => ({backend: 'x11', tree: 'at_spi', input: {background: true, desktop: true}, capture: {window: 'retained', desktop: true},
      text: {paste: 'verified', literal: true}, desktop, version: pinned.version, build: 'fixture'})};
};

// Doctor over `home`, with the Node resolved as a session resolves it (launch.mjs ownHostNode, over the fake managed
// Node) and the helper's bytes check stubbed.
const doctor = (home, pin, over = {}) => inspectRuntime({home, env: {DISPLAY: ':9'}, pins: [pin], host: LINUX, verifySignatures: never('codesign'),
  inspectHelper: never('the native socket helper inspection'), inspectSecrets: async () => ({dir: '/home/u/.config/claude-secrets', exists: true, directory: true, owned: true, mode: 0o700, keys: ['K'], unsafe: []}),
  inspectLinux: async () => DESKTOP_PASS, inspectChrome: async () => [], inspectAgent: async () => [], linuxHelper: pinnedHelper, ...pinnedEngine(home), ...over});

test('a healthy Linux install: cua\'s own runtime rows pass, no row checks the vendor\'s tree beside them, no darwin rows, the Linux desktop rows, the pinned sandbox helper, the secret store', async t => {
  const {home, pin} = await linuxHome(t);
  const report = await doctor(home, pin);
  const rows = byName(report);
  assert.equal(report.ok, true, JSON.stringify(report.checks.filter(c => c.status !== 'pass'), null, 1));
  for (const name of ['platform', 'runtime.installed', 'runtime.modules', 'runtime.node', 'sandbox', 'sandbox.launcher', 'sandbox.userns', 'repl.host', 'engine'])
    assert.equal(rows[name]?.status, 'pass', `${name}: ${rows[name]?.detail}`);
  assert.equal(rows.platform.detail, `linux-x64: cua's own runtime ${RELEASE}`);
  assert.equal(rows['runtime.installed'].detail, `cua's own runtime ${RELEASE} at ${TREE(home)}: its module tree, Node and sandbox helper are installed, and current.json names it, the last install that completed here`);
  assert.match(rows['runtime.modules'].detail, /^the module tree at \S+ verifies: \d+ packages, each file's digest, and 0 native files by SHA-256$/);
  assert.equal(rows['runtime.node'].detail, `the pinned Node ${RECORD.node.version} at ${NODE_BIN(home)}, its bytes the ones its install record names`);
  for (const name of ['runtime.vendor', ...VENDOR_ROWS]) assert.equal(rows[name], undefined, `${name}: no row checks a vendor runtime (M6b)`);
  assert.deepEqual(report.runtime, {release: RELEASE, root: TREE(home), paths: {moduleDir: join(TREE(home), 'node_modules')}, parts: RECORD});
  assert.match(rows['sandbox.launcher'].detail, /the pinned helper .*\/sandbox\/rust-v0\.163\.0\/codex-linux-sandbox/);
  assert.equal(rows['helper.live'], undefined);
  assert.equal(rows['helper.permissions'], undefined);
  assert.deepEqual(['display', 'accessibility.bus'].map(n => rows[n].status), ['pass', 'pass']);
  assert.match(rows.sandbox.detail, /^CUA_SHIM_SANDBOX=scoped \(the default\): .*no network \(the trusted services do, so the computer-use helper reaches the X display and the session bus\)/);
  assert.equal(rows['secrets.helper'], undefined);
  assert.equal(rows['secrets.store'].status, 'pass', 'Linux has the same file store');
  assert.equal(summarize(report), 'passive runtime checks pass');
});

test('a home with cua\'s own runtime and no vendor tree gets the own rows, and no vendor row', async t => {
  const {home, pin} = await linuxHome(t, {vendor: false});
  const rows = byName(await doctor(home, pin));
  for (const name of ['platform', 'runtime.installed', 'runtime.modules', 'runtime.node']) assert.equal(rows[name].status, 'pass', `${name}: ${rows[name].detail}`);
  for (const name of ['runtime.vendor', ...VENDOR_ROWS]) assert.equal(rows[name], undefined, name);
});

test('runtime.installed: no module tree fails; a pointer naming the vendor\'s release, another runtime or nothing warns; each names the installer', async t => {
  const missing = await linuxHome(t, {modules: false});
  const failed = byName(await doctor(missing.home, missing.pin))['runtime.installed'];
  assert.equal(failed.status, 'fail');
  assert.ok(failed.detail.startsWith(`cua's Linux runtime ${RELEASE} is not installed in ${missing.home}: its module tree `), failed.detail);
  assert.ok(failed.detail.includes(INSTALLER), failed.detail);
  assert.equal(byName(await doctor(missing.home, missing.pin))['runtime.modules'].status, 'skip');

  for (const [pointer, words] of [['0.0.1-linux-x64', 'the vendor\'s release 0.0.1-linux-x64, which an older cua\'s install wrote'],
    ['cua-linux-x64-e0.0.1-n24.0.0-s0.1.0-m000000000000', 'another cua\'s runtime, cua-linux-x64-e0.0.1-n24.0.0-s0.1.0-m000000000000'], [null, 'no release']]) {
    const {home, pin} = await linuxHome(t, {pointer});
    const row = byName(await doctor(home, pin))['runtime.installed'];
    assert.equal(row.status, 'warn', String(pointer));
    assert.equal(row.detail, `sessions resolve cua's own runtime ${RELEASE} (${TREE(home)}), but current.json names ${words}: no install of this cua has completed here, so a part may be missing or another install's; run ${INSTALLER}`);
  }
});

// Fix wave 1: runtime.installed is every common part, not the tree and the pointer alone.
test('runtime.installed: a tree and a pointer without Node or the helper fail, naming each missing part; a disabled sandbox needs no helper', async t => {
  const noNode = await linuxHome(t, {node: null});
  const row = byName(await doctor(noNode.home, noNode.pin))['runtime.installed'];
  assert.equal(row.status, 'fail');
  assert.ok(row.detail.startsWith(`cua's own runtime ${RELEASE} is not whole at ${TREE(noNode.home)}: its Node: cua's Linux runtime is not installed in ${noNode.home}: its Node is not installed (not installed)`), row.detail);
  assert.ok(row.detail.endsWith(`; runtime.node and sandbox.launcher name each part's remedy, and ${INSTALLER} installs what is absent`), row.detail);

  const {home, pin} = await linuxHome(t);
  const noHelper = byName(await doctor(home, pin, {linuxHelper: undefined}))['runtime.installed'];
  assert.equal(noHelper.status, 'fail');
  assert.match(noHelper.detail, /: its sandbox helper: cua's Linux sandbox helper \S+ is not installed \(ENOENT\)/);
  const disabled = byName(await doctor(home, pin, {linuxHelper: undefined, env: {DISPLAY: ':9', CUA_SHIM_SANDBOX: 'disabled'}}))['runtime.installed'];
  assert.equal(disabled.status, 'warn');
  assert.match(disabled.detail, /its sandbox helper is not installed, which CUA_SHIM_SANDBOX=disabled does not run/);
});

// Fix wave 1: what an installer refuses to replace is named, to be moved aside, before the installer.
test('runtime.installed: a module tree cua did not install, at the lock\'s path, is named to be moved aside', async t => {
  const {home, pin} = await linuxHome(t);
  rmSync(join(TREE(home), 'install.json'));
  const row = byName(await doctor(home, pin))['runtime.installed'];
  assert.equal(row.status, 'fail');
  assert.ok(row.detail.includes(`${TREE(home)} is there, and is not a module tree cua installed for this lock and host; it is never replaced in place`), row.detail);
  assert.ok(row.detail.endsWith(`; stop any \`cua serve\` using it, move ${TREE(home)} aside, then ${RELEASE_HINT}`), row.detail);
});

// Fix wave 2: one classification of the pointer's path for doctor and install (manifest.mjs pointerObstruction): only a
// file cua wrote, or nothing, is current.json; a directory or a link there, to a pointer or to nothing, is named to be
// moved aside, in the words install refuses it with.
test('runtime.installed: a current.json that is a directory or a link is named to be moved aside, as install names it, and doctor goes on', async t => {
  const cases = {
    'a directory': home => mkdirSync(join(home, 'current.json')),
    'a link': home => { writeFileSync(join(home, 'pointer.json'), JSON.stringify({schema: 1, release: RELEASE})); symlinkSync(join(home, 'pointer.json'), join(home, 'current.json')); },
    'a link to nothing': home => symlinkSync(join(home, 'gone.json'), join(home, 'current.json')),
  };
  for (const [name, lay] of Object.entries(cases)) {
    const {home, pin} = await linuxHome(t, {pointer: null});
    lay(home);
    const report = await doctor(home, pin);
    const row = byName(report)['runtime.installed'];
    assert.equal(row.status, 'warn', name);
    const kind = name === 'a directory' ? 'a directory' : 'a link';
    assert.ok(row.detail.endsWith(`, but ${join(home, 'current.json')} is ${kind}, not a file cua wrote, and no install replaces it: move ${join(home, 'current.json')} aside, then ${RELEASE_HINT}`), `${name}: ${row.detail}`);
    assert.ok(byName(report).engine, 'the rows after it are there');
  }
});

// Fix wave 2: runtime.installed asks what a session asks of the tree (manifest.mjs resolveRuntime's check), so a
// recorded tree missing a native file is not whole there either.
test('runtime.installed: a recorded tree that sessions refuse (a native file gone) fails, as the session refuses it', async t => {
  const {home, pin} = await linuxHome(t);
  const root = addToPackage(home, 'node_modules/classic-level', {'prebuilds/linux-x64/classic-level.node': 'ELF-native-code'});
  rmSync(join(root, 'node_modules/classic-level/prebuilds/linux-x64/classic-level.node'));
  const rows = byName(await doctor(home, pin));
  assert.equal(rows['runtime.installed'].status, 'fail');
  assert.match(rows['runtime.installed'].detail, /classic-level\.node/);
  assert.ok(rows['runtime.installed'].detail.includes(RELEASE_HINT), rows['runtime.installed'].detail);
  assert.equal(rows['runtime.modules'].status, 'fail', 'the full check still names what differs');
});

test('runtime.modules: a file altered inside the tree fails, naming it and the installer with the release', async t => {
  const {home, pin} = await linuxHome(t);
  writeFileSync(join(TREE(home), 'node_modules', 'sharp', 'package.json'), '{"altered": true}\n');
  const rows = byName(await doctor(home, pin));
  assert.equal(rows['runtime.modules'].status, 'fail');
  // its manifest is another size, which the full check names too (task 156, fix wave 2)
  assert.match(rows['runtime.modules'].detail, /does not verify: node_modules\/sharp's files are not the ones installed; node_modules\/sharp\/package\.json is \d+ bytes, recorded as \d+; stop any `cua serve` using it, remove \S+, then run /);
  assert.ok(rows['runtime.modules'].detail.includes(INSTALLER), rows['runtime.modules'].detail);
  assert.ok(rows['runtime.modules'].detail.includes(`which may not be ${RELEASE}`), rows['runtime.modules'].detail);
});

// §5.1: a JavaScript file altered inside a package, and a native file removed, truncated or altered, every package.json
// intact: the full check catches each.
test('runtime.modules: a changed JavaScript file, and a native file removed, truncated or altered, each fail', async t => {
  const cases = {
    'a JavaScript file altered': root => writeFileSync(join(root, 'node_modules/classic-level/index.js'), 'module.exports = "altered";\n'),
    'a native file removed': root => rmSync(join(root, 'node_modules/classic-level/prebuilds/linux-x64/classic-level.node')),
    'a native file truncated': root => truncateSync(join(root, 'node_modules/classic-level/prebuilds/linux-x64/classic-level.node'), 3),
    'a native file altered': root => writeFileSync(join(root, 'node_modules/classic-level/prebuilds/linux-x64/classic-level.node'), 'ELF-but-other'),
  };
  for (const [name, change] of Object.entries(cases)) {
    const {home, pin} = await linuxHome(t);
    const root = addToPackage(home, 'node_modules/classic-level', {'index.js': 'module.exports = {};\n', 'prebuilds/linux-x64/classic-level.node': 'ELF-native-code'});
    assert.equal(byName(await doctor(home, pin))['runtime.modules'].status, 'pass', `${name}: the tree verifies before`);
    change(root);
    const row = byName(await doctor(home, pin))['runtime.modules'];
    assert.equal(row.status, 'fail', name);
    assert.match(row.detail, /classic-level/, name);
    assert.ok(row.detail.includes(INSTALLER), name);
  }
});

test('runtime.node: the pinned Node passes; one behind the pin warns naming both and the installer; CUA_NODE warns when it resolves and fails when it does not; none fails naming the installer', async t => {
  const behind = await linuxHome(t, {node: '24.0.0'});
  const warned = byName(await doctor(behind.home, behind.pin))['runtime.node'];
  assert.equal(warned.status, 'warn');
  assert.equal(warned.detail, `the installed Node 24.0.0 at ${NODE_BIN(behind.home, '24.0.0')} runs sessions here, behind this cua's pinned ${RECORD.node.version}: ${INSTALLER} installs the pinned one`);

  const {home, pin} = await linuxHome(t);
  const node = realpathSync(process.execPath);
  const override = byName(await doctor(home, pin, {env: {DISPLAY: ':9', CUA_NODE: process.execPath}}))['runtime.node'];
  assert.equal(override.status, 'warn');
  assert.equal(override.detail, `CUA_NODE=${process.execPath} (${node}) runs sessions here in place of the pinned Node ${RECORD.node.version}, a named override`);
  // The real lookup refuses what CUA_NODE names when it cannot run it: the row fails with that sentence, its correction.
  const gone = byName(await doctor(home, pin, {env: {DISPLAY: ':9', CUA_NODE: '/nonexistent/node'}}))['runtime.node'];
  assert.equal(gone.status, 'fail');
  assert.match(gone.detail, /^cua's own REPL host needs Node 24 or later, and CUA_NODE names \/nonexistent\/node, which is not found: set CUA_NODE to the absolute path of a Node 24 or later, or unset CUA_NODE/);

  const none = await linuxHome(t, {node: null});
  const failed = byName(await doctor(none.home, none.pin))['runtime.node'];
  assert.equal(failed.status, 'fail');
  assert.ok(failed.detail.startsWith(`cua's Linux runtime is not installed in ${none.home}: its Node is not installed (not installed); `), failed.detail);
  assert.ok(failed.detail.includes(INSTALLER), failed.detail);

  // Bytes that are not the ones its record names are never run, and never replaced in place: the pinned version's
  // directory is named to be moved aside first.
  writeFileSync(NODE_BIN(home), '#!/bin/sh\necho v99.0.0\n');
  chmodSync(NODE_BIN(home), 0o755);
  const altered = byName(await doctor(home, pin))['runtime.node'];
  assert.equal(altered.status, 'fail');
  assert.match(altered.detail, /is not the binary its install record names\)/);
  assert.ok(altered.detail.endsWith(`; it is never repaired in place: stop any \`cua serve\` using it, move ${join(home, 'node', RECORD.node.version)} aside, then ${RELEASE_HINT}`), altered.detail);
});

// Fix wave 2: whatever node-install refuses to replace is named, before the installer: a Node pointer that is not a file,
// a pinned version's path that is not its recorded install.
test('runtime.node: a Node pointer that is not a file, or a pinned path that is not its recorded install, is named to be moved aside', async t => {
  const pointed = await linuxHome(t);
  const nodePointer = join(pointed.home, 'node', 'current.json');
  rmSync(nodePointer);
  mkdirSync(nodePointer);
  const row = byName(await doctor(pointed.home, pointed.pin))['runtime.node'];
  assert.equal(row.status, 'fail');
  assert.ok(row.detail.endsWith(`; it is never repaired in place: stop any \`cua serve\` using it, move ${nodePointer} aside, then ${RELEASE_HINT}`), row.detail);

  const occupied = await linuxHome(t, {node: null});
  mkdirSync(join(occupied.home, 'node'));
  writeFileSync(join(occupied.home, 'node', RECORD.node.version), 'not a Node install');
  const blocked = byName(await doctor(occupied.home, occupied.pin))['runtime.node'];
  assert.equal(blocked.status, 'fail');
  assert.ok(blocked.detail.endsWith(`move ${join(occupied.home, 'node', RECORD.node.version)} aside, then ${RELEASE_HINT}`), blocked.detail);
});

// The recorded bytes without their execute bit: node-install keeps that tree and refuses it (its version probe fails),
// so the installer alone repairs nothing; the mode fix, or the version's directory to move aside, comes first.
test('runtime.node: a managed bin/node that lost its execute bit names the mode fix, or its version directory to move aside, before the installer', async t => {
  const {home, pin} = await linuxHome(t);
  chmodSync(NODE_BIN(home), 0o644);
  const row = byName(await doctor(home, pin))['runtime.node'];
  assert.equal(row.status, 'fail');
  assert.ok(row.detail.endsWith(`; ${NODE_BIN(home)} is not executable, and the installer never repairs it in place: restore its mode with \`chmod 755 ${NODE_BIN(home)}\`, `
    + `or stop any \`cua serve\` using it, move ${join(home, 'node', RECORD.node.version)} aside, then ${RELEASE_HINT}`), row.detail);
});

// The mode fix is a command to paste: a home whose path a shell would split has it quoted as one argument, as the
// installer's own command is (task 156, fix wave 2).
test('runtime.node: the mode fix quotes a managed Node path with a space or a quote as one shell argument', async t => {
  const {home, pin} = await linuxHome(t, {name: 'it\'s a home'});
  chmodSync(NODE_BIN(home), 0o644);
  const row = byName(await doctor(home, pin))['runtime.node'];
  const quoted = `'${NODE_BIN(home).replaceAll('\'', '\'\\\'\'')}'`;
  assert.ok(row.detail.includes(`restore its mode with \`chmod 755 ${quoted}\``), row.detail);
});

// #171 M6b (§2.3): the vendor's tree, whole, damaged or blocked, fails no row; a vendor selection is refused whatever it is.
test('the vendor\'s tree, damaged, or a runtimes/ that is a file or a link to nothing, fails no row; a vendor selection is refused whatever the tree', async t => {
  const {home, pin} = await linuxHome(t);
  const vendorSelected = {env: {DISPLAY: ':9', CUA_NATIVE_ENGINE: 'vendor'}};
  const retired = rows => {
    assert.equal(rows.engine.status, 'fail');
    assert.match(rows['repl.host'].detail, /^refused \(engine_retired\): CUA_NATIVE_ENGINE=vendor selects the vendor's engine, which cua 0\.30\.0 removed from Linux/);
  };
  retired(byName(await doctor(home, pin, vendorSelected)));
  rmSync(join(home, 'runtimes', pin.release, 'install.json'));
  for (const setup of [() => {}, () => { rmSync(join(home, 'runtimes'), {recursive: true}); writeFileSync(join(home, 'runtimes'), 'not a directory'); },
    () => { rmSync(join(home, 'runtimes')); symlinkSync(join(home, 'gone'), join(home, 'runtimes')); }]) {
    setup();
    const report = await doctor(home, pin);
    assert.equal(report.ok, true, JSON.stringify(report.checks.filter(c => c.status === 'fail'), null, 1));
    assert.equal(byName(report)['runtime.vendor'], undefined);
    retired(byName(await doctor(home, pin, vendorSelected)));
  }
});

// Vendor pins this checkout cannot load or read fail nothing: they describe only the vendor's tree, which no row checks
// and no session uses; the leftovers scan goes on without them.
test('vendor pins that cannot be loaded or read fail no row', async t => {
  const {home} = await linuxHome(t);
  for (const loadPins of [() => { throw new CuaError('invalid_pin', 'release pin x.json: unknown field "y"'); },
    () => { throw Object.assign(new Error(`ENOENT: no such file or directory, scandir '${RELEASES_DIR}'`), {code: 'ENOENT', syscall: 'scandir', path: RELEASES_DIR}); }]) {
    const report = await doctor(home, null, {pins: undefined, loadPins});
    assert.equal(report.ok, true, JSON.stringify(report.checks.filter(c => c.status === 'fail'), null, 1));
    assert.equal(byName(report)['runtime.vendor'], undefined);
  }
});

test('sandbox.launcher: a helper not placed fails, naming the installer', async t => {
  const {home, pin} = await linuxHome(t);
  const row = byName(await doctor(home, pin, {linuxHelper: undefined}))['sandbox.launcher'];
  assert.equal(row.status, 'fail');
  assert.match(row.detail, /^cua's Linux sandbox helper \S+\/sandbox\/rust-v[\d.]+\/codex-linux-sandbox is not installed \(ENOENT\)/);
  assert.ok(row.detail.includes(`; run ${INSTALLER} to place the pinned helper`), row.detail);
  assert.doesNotMatch(row.detail, /`cua install`/);
});

test('repl.host keeps the refusal\'s remedy', async t => {
  const {home, pin} = await linuxHome(t, {node: null});
  const row = byName(await doctor(home, pin))['repl.host'];
  assert.equal(row.status, 'fail');
  assert.ok(row.detail.includes(`its Node is not installed (not installed); run ${INSTALLER}`), row.detail);
});

test('platform: a checkout whose record and pins disagree fails and stops there', async t => {
  const {home, pin} = await linuxHome(t);
  const report = await doctor(home, pin, {linuxRuntime: () => { throw new CuaError('invalid_pin', 'the Linux runtime record x has node.version 1.2.3, and its pin y has version 24.22.0', {hint: 'the record repeats its pins: change node.version with y'}); }});
  assert.equal(report.ok, false);
  assert.deepEqual(report.checks, [{name: 'platform', status: 'fail', detail: 'the Linux runtime record x has node.version 1.2.3, and its pin y has version 24.22.0; the record repeats its pins: change node.version with y'}]);
});

// #115 M3: every scoped or default launch on Linux runs under cua's pinned helper, which needs bubblewrap and user
// namespaces; without them confined connections are refused. The computer surface works under scoped (the worker has
// the network), so nothing about the surfaces fails the row any more.
test('the sandbox row on Linux: scoped and default need user namespaces for the helper; disabled needs nothing', async t => {
  const {home, pin} = await linuxHome(t);
  const doctor = (env, userns) => inspectRuntime({home, env, pins: [pin], host: LINUX, verifySignatures: never('codesign'),
    inspectHelper: never('the native socket helper inspection'), inspectSecrets: async () => ({dir: '/home/u/.config/claude-secrets', exists: true, directory: true, owned: true, mode: 0o700, keys: ['K'], unsafe: []}),
    inspectLinux: async () => [DESKTOP_ROWS[0], DESKTOP_ROWS[1], {name: 'sandbox.userns', status: userns, detail: 'fixture'}],
    inspectChrome: async () => [], inspectAgent: async () => [], linuxHelper: pinnedHelper}).then(byName);

  for (const surfaces of ['computer', 'browser', 'computer,browser']) {
    const rows = await doctor({CUA_SHIM_SURFACES: surfaces}, 'pass');
    assert.equal(rows.sandbox.status, 'pass', surfaces);
    assert.match(rows.sandbox.detail, /^CUA_SHIM_SANDBOX=scoped \(the default\)/);
    assert.equal(/the trusted services do/.test(rows.sandbox.detail), surfaces.includes('computer'), 'the worker\'s network, with the computer surface only');
    assert.equal(rows['sandbox.userns'].status, 'pass');
  }
  for (const mode of ['scoped', 'default']) {
    const rows = await doctor({CUA_SHIM_SANDBOX: mode}, 'blocked');
    assert.equal(rows.sandbox.status, 'fail', mode);
    assert.match(rows.sandbox.detail, new RegExp(`^CUA_SHIM_SANDBOX=${mode}, but bubblewrap cannot create a user namespace here \\(see sandbox.userns\\)`));
    assert.match(rows.sandbox.detail, /refuse confined connections \(sandbox_unavailable\)/);
    assert.equal(rows['sandbox.userns'].status, 'blocked', 'the probe row keeps its own verdict and remedy');
    assert.equal(rows['sandbox.userns'].detail, 'fixture');
  }
  let rows = await doctor({CUA_SHIM_SANDBOX: 'default'}, 'pass');
  assert.equal(rows.sandbox.status, 'pass');
  assert.match(rows.sandbox.detail, /^CUA_SHIM_SANDBOX=default: .*write nowhere.*; cells have no network \(the trusted services do, so the computer-use helper reaches the X display/,
    'with the computer surface the trusted worker has the network under default too');
  rows = await doctor({CUA_SHIM_SANDBOX: 'default', CUA_SHIM_SURFACES: 'browser'}, 'pass');
  assert.match(rows.sandbox.detail, /^CUA_SHIM_SANDBOX=default: .*write nowhere.*; neither has the network$/);

  for (const value of ['', 'computer,', 'mouse']) {
    rows = await doctor({CUA_SHIM_SURFACES: value}, 'pass');
    assert.equal(rows.sandbox.status, 'fail', JSON.stringify(value));
    assert.match(rows.sandbox.detail, /CUA_SHIM_SURFACES must be computer, browser or computer,browser/);
  }

  rows = await doctor({CUA_SHIM_SANDBOX: 'disabled'}, 'blocked');
  assert.equal(rows.sandbox.status, 'pass');
  assert.match(rows.sandbox.detail, /^CUA_SHIM_SANDBOX=disabled/);
  assert.equal(rows['sandbox.userns'].status, 'skip');
  assert.match(rows['sandbox.userns'].detail, /not needed here: CUA_SHIM_SANDBOX=disabled confines nothing/);
});

test('skip is neither a failure nor blocked: ok stays true and the verdict does not list it', () => {
  const report = {ok: true, checks: [{name: 'runtime.files', status: 'pass', detail: ''}, {name: 'secrets.store', status: 'skip', detail: ''}]};
  assert.equal(summarize(report), 'passive runtime checks pass');
});

test('the session bus address is DBUS_SESSION_BUS_ADDRESS, else derived from XDG_RUNTIME_DIR, else none', () => {
  assert.equal(sessionBusAddress({DBUS_SESSION_BUS_ADDRESS: 'unix:path=/x/bus', XDG_RUNTIME_DIR: '/run/user/1000'}), 'unix:path=/x/bus');
  assert.equal(sessionBusAddress({XDG_RUNTIME_DIR: '/run/user/1000'}), 'unix:path=/run/user/1000/bus');
  assert.equal(sessionBusAddress({}), undefined);
});

// A fake system: which tools exist, and what each command prints and exits with.
function system({tools = ['xdpyinfo', 'dbus-send', 'bwrap'], answers = {}, osRelease = 'ID=debian\nVERSION_ID="12"\n'} = {}) {
  const calls = [];
  return {
    calls,
    findTool: name => tools.includes(name) ? `/usr/bin/${name}` : null,
    findSystemTool: name => tools.includes(name) ? `/usr/bin/${name}` : null,
    exec: async (command, args, {env}) => {
      calls.push({command, args, env});
      const key = [command.split('/').pop(), ...args].join(' ');
      const hit = Object.entries(answers).find(([prefix]) => key.startsWith(prefix));
      return hit ? {code: 0, stdout: '', stderr: '', ...hit[1]} : {code: 1, stdout: '', stderr: `unexpected ${key}`};
    },
    osRelease: () => osRelease,
  };
}
const XDPYINFO = 'name of display:    :0\nnumber of extensions:    5\n    BIG-REQUESTS\n    Composite\n    XFIXES\n    XTEST\n    RANDR\ndefault screen number:    0\n';
const NAMES = list => `method return time=1 sender=org.freedesktop.DBus\n   array [\n${list.map(n => `      string "${n}"`).join('\n')}\n   ]\n`;
const rowsOf = async (env, sys) => Object.fromEntries((await linuxDesktopChecks({env, ...sys})).map(r => [r.name, r]));

test('display passes with XTEST, Composite and XFIXES on the display, and names what is wrong otherwise', async () => {
  const env = {DISPLAY: ':0', XAUTHORITY: '/home/u/.Xauthority', HOME: '/home/u', PATH: '/usr/bin'};
  const ok = system({answers: {xdpyinfo: {stdout: XDPYINFO}, 'dbus-send': {stdout: NAMES(['org.a11y.Bus'])}, bwrap: {}}});
  const rows = await rowsOf(env, ok);
  assert.equal(rows.display.status, 'pass');
  assert.match(rows.display.detail, /:0.*XTEST, Composite and XFIXES/);
  assert.equal(ok.calls.find(c => c.command.endsWith('xdpyinfo')).env.DISPLAY, ':0');

  assert.equal((await rowsOf({...env, DISPLAY: undefined}, ok)).display.status, 'fail');
  assert.match((await rowsOf({HOME: '/home/u'}, ok)).display.detail, /DISPLAY is not set/);
  const noTool = (await rowsOf(env, system({tools: ['dbus-send', 'bwrap']}))).display;
  assert.equal(noTool.status, 'blocked');
  assert.match(noTool.detail, /missing_tool.*xdpyinfo.*x11-utils/);
  const refused = (await rowsOf(env, system({answers: {xdpyinfo: {code: 1, stderr: 'xdpyinfo:  unable to open display ":0".\n'}}}))).display;
  assert.equal(refused.status, 'fail');
  assert.match(refused.detail, /unable to open display/);
  const bare = (await rowsOf(env, system({answers: {xdpyinfo: {stdout: XDPYINFO.replace('    XTEST\n', '')}}}))).display;
  assert.equal(bare.status, 'fail');
  assert.match(bare.detail, /lacks XTEST/);
});

test('accessibility.bus asks the session bus for AT-SPI, at the derived address when only XDG_RUNTIME_DIR is set', async () => {
  const env = {XDG_RUNTIME_DIR: '/run/user/1000', PATH: '/usr/bin'};
  const running = system({answers: {'dbus-send --session --print-reply --dest=org.freedesktop.DBus / org.freedesktop.DBus.ListNames': {stdout: NAMES([':1.0', 'org.a11y.Bus'])}}});
  const rows = await rowsOf(env, running);
  assert.equal(rows['accessibility.bus'].status, 'pass');
  const call = running.calls.find(c => c.command.endsWith('dbus-send'));
  assert.equal(call.env.DBUS_SESSION_BUS_ADDRESS, 'unix:path=/run/user/1000/bus');

  const activatable = system({answers: {
    'dbus-send --session --print-reply --dest=org.freedesktop.DBus / org.freedesktop.DBus.ListNames': {stdout: NAMES([':1.0'])},
    'dbus-send --session --print-reply --dest=org.freedesktop.DBus / org.freedesktop.DBus.ListActivatableNames': {stdout: NAMES(['org.a11y.Bus'])},
  }});
  const started = (await rowsOf(env, activatable))['accessibility.bus'];
  assert.equal(started.status, 'pass');
  assert.match(started.detail, /activatable/);

  const absent = system({answers: {'dbus-send': {stdout: NAMES([':1.0'])}}});
  const none = (await rowsOf(env, absent))['accessibility.bus'];
  assert.equal(none.status, 'fail');
  assert.match(none.detail, /at-spi2-core/);
  assert.equal((await rowsOf({PATH: '/usr/bin'}, absent))['accessibility.bus'].status, 'fail');
  assert.match((await rowsOf({PATH: '/usr/bin'}, absent))['accessibility.bus'].detail, /DBUS_SESSION_BUS_ADDRESS.*XDG_RUNTIME_DIR/);
  assert.equal((await rowsOf(env, system({tools: ['xdpyinfo', 'bwrap']})))['accessibility.bus'].status, 'blocked');
  const silent = (await rowsOf(env, system({answers: {}})))['accessibility.bus'];
  assert.equal(silent.status, 'fail');
  assert.match(silent.detail, /did not answer/);
});

// #171 M3 (Plan of Work, M3; Surprises, M0.4): Qt 6 puts its tree on the bus only when org.a11y.Status IsEnabled is
// true at its start, so doctor reads it from the bus's own launcher.
const GET_ENABLED = 'dbus-send --session --print-reply --dest=org.a11y.Bus /org/a11y/bus org.freedesktop.DBus.Properties.Get string:org.a11y.Status string:IsEnabled';
const LIST_NAMES = 'dbus-send --session --print-reply --dest=org.freedesktop.DBus / org.freedesktop.DBus.ListNames';
const REPLY = value => `method return time=1 sender=:1.5 -> destination=:1.9 serial=3 reply_serial=2\n   variant       boolean ${value}\n`;

test('accessibility.enabled reads org.a11y.Status IsEnabled from AT-SPI\'s bus launcher: true passes, false warns with the remedy', async () => {
  const env = {XDG_RUNTIME_DIR: '/run/user/1000', PATH: '/usr/bin'};
  const on = system({answers: {[LIST_NAMES]: {stdout: NAMES(['org.a11y.Bus'])}, [GET_ENABLED]: {stdout: REPLY('true')}}});
  const enabled = (await rowsOf(env, on))['accessibility.enabled'];
  assert.deepEqual([enabled.status, enabled.detail], ['pass', 'org.a11y.Status IsEnabled is true on the session bus at unix:path=/run/user/1000/bus, so Qt applications put their accessibility trees on the bus']);
  assert.equal(on.calls.find(c => c.args.includes('string:IsEnabled')).env.DBUS_SESSION_BUS_ADDRESS, 'unix:path=/run/user/1000/bus');
  const off = (await rowsOf(env, system({answers: {[LIST_NAMES]: {stdout: NAMES(['org.a11y.Bus'])}, [GET_ENABLED]: {stdout: REPLY('false')}}})))['accessibility.enabled'];
  assert.equal(off.status, 'warn');
  assert.equal(off.detail, 'org.a11y.Status IsEnabled is false on the session bus at unix:path=/run/user/1000/bus, so a Qt 6 application started now puts no accessibility tree on the bus '
    + '(cua sees its windows without their elements): turn it on with dbus-send --session --print-reply --dest=org.a11y.Bus /org/a11y/bus org.freedesktop.DBus.Properties.Set '
    + 'string:org.a11y.Status string:IsEnabled variant:boolean:true, then restart those applications');
  // AT-SPI only activatable: the read starts it, as any client's first use does.
  const activatable = system({answers: {[LIST_NAMES]: {stdout: NAMES([':1.0'])}, 'dbus-send --session --print-reply --dest=org.freedesktop.DBus / org.freedesktop.DBus.ListActivatableNames': {stdout: NAMES(['org.a11y.Bus'])},
    [GET_ENABLED]: {stdout: REPLY('true')}}});
  assert.equal((await rowsOf(env, activatable))['accessibility.enabled'].status, 'pass');
  const refused = (await rowsOf(env, system({answers: {[LIST_NAMES]: {stdout: NAMES(['org.a11y.Bus'])}, [GET_ENABLED]: {code: 1, stderr: 'Error org.freedesktop.DBus.Error.UnknownMethod: No such interface\n'}}})))['accessibility.enabled'];
  assert.equal(refused.status, 'warn');
  assert.match(refused.detail, /^org\.a11y\.Status IsEnabled could not be read on the session bus at unix:path=\/run\/user\/1000\/bus \(Error org\.freedesktop\.DBus\.Error\.UnknownMethod: No such interface\)/);
  // Without AT-SPI on the bus (accessibility.bus fails and says why), nothing is asked.
  const none = system({answers: {'dbus-send': {stdout: NAMES([':1.0'])}}});
  const skipped = (await rowsOf(env, none))['accessibility.enabled'];
  assert.deepEqual([skipped.status, skipped.detail], ['skip', 'no AT-SPI bus to ask (see accessibility.bus)']);
  assert.equal(none.calls.some(c => c.args.includes('string:IsEnabled')), false);
});

test('sandbox.userns finds bwrap where the launch check does, on the system path, not the caller\'s PATH', async () => {
  const sys = system({answers: {'bwrap --ro-bind / / true': {}}});
  const onlySystem = {...sys, findTool: name => (name === 'bwrap' ? null : sys.findTool(name))};
  assert.equal((await rowsOf({PATH: '/home/u/bin'}, onlySystem))['sandbox.userns'].status, 'pass');
  const noSystem = {...sys, findTool: name => `/home/u/bin/${name}`, findSystemTool: () => null};
  assert.equal((await rowsOf({PATH: '/home/u/bin'}, noSystem))['sandbox.userns'].status, 'blocked');
});

test('sandbox.userns runs bwrap --ro-bind / / true; a refusal is blocked with its stderr, naming the Ubuntu sysctl there', async () => {
  const env = {PATH: '/usr/bin'};
  const ok = system({answers: {'bwrap --ro-bind / / true': {}}});
  assert.equal((await rowsOf(env, ok))['sandbox.userns'].status, 'pass');
  const denied = {'bwrap --ro-bind / / true': {code: 1, stderr: 'bwrap: setting up uid map: Permission denied\n'}};
  const ubuntu = (await rowsOf(env, system({answers: denied, osRelease: 'NAME="Ubuntu"\nID=ubuntu\nVERSION_ID="24.04"\n'})))['sandbox.userns'];
  assert.equal(ubuntu.status, 'blocked');
  assert.match(ubuntu.detail, /setting up uid map: Permission denied/);
  assert.match(ubuntu.detail, /kernel\.apparmor_restrict_unprivileged_userns/);
  assert.match(ubuntu.detail, /^bubblewrap could not create an unprivileged user namespace/);
  assert.doesNotMatch(ubuntu.detail, /cannot start/, 'it says what bubblewrap did, not that the runtime\'s sandbox cannot start');
  const older = (await rowsOf(env, system({answers: denied, osRelease: 'ID=ubuntu\nVERSION_ID="22.04"\n'})))['sandbox.userns'];
  assert.doesNotMatch(older.detail, /apparmor_restrict_unprivileged_userns/);
  const debian = (await rowsOf(env, system({answers: denied})))['sandbox.userns'];
  assert.doesNotMatch(debian.detail, /apparmor_restrict_unprivileged_userns/);
  const noBwrap = (await rowsOf(env, system({tools: ['xdpyinfo', 'dbus-send']})))['sandbox.userns'];
  assert.equal(noBwrap.status, 'blocked');
  assert.match(noBwrap.detail, /missing_tool.*bwrap.*bubblewrap/);
});

test('the default Chrome checks on Linux read the host\'s Chrome under $XDG_CONFIG_HOME, as doctor\'s env and host say', async t => {
  const {home, pin} = await linuxHome(t);
  const xdg = join(realpathSync(join(home, '..')), 'config');
  mkdirSync(join(xdg, 'google-chrome'), {recursive: true});
  await registerCuaHost({home, checkout: REPO, browsers: browsersFor({host: LINUX, env: {XDG_CONFIG_HOME: xdg}, userHome: '/nonexistent-user'})});
  // The secrets rows are stubbed: this env has no HOME, so the default would describe the account's own store.
  const report = await inspectRuntime({home, env: {XDG_CONFIG_HOME: xdg}, pins: [pin], host: LINUX,
    inspectSecrets: async () => ({dir: '/none', exists: false}), inspectLinux: async () => DESKTOP_ROWS, inspectAgent: async () => []});
  const rows = byName(report);
  assert.equal(rows['chrome.route'].status, 'pass', rows['chrome.route'].detail);
  assert.equal(rows['chrome.host.registered'].status, 'pass', rows['chrome.host.registered'].detail);
  assert.ok(rows['chrome.host.registered'].detail.startsWith(`cua: ${CUA_HOST_NAME} names this home's launcher ${launcherPath(realpathSync(home))} `), rows['chrome.host.registered'].detail);
  assert.ok(rows['chrome.hosts.live'], 'the live-host row is computed from the home\'s sockets');
});
