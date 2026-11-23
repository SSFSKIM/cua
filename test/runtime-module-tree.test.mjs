// The ModuleTree (#171 M6a T1; the pre-flight's §4.2, F1 ruled (b)): the packages cells import and `classic-level`,
// pinned by runtime/modules/package-lock.json and the provenance scripts/modules-pin.mjs writes against the vendor's
// own lockfile, installed by cua itself under $CUA_HOME/modules/<lock hash>/: the host's closure, each tarball fetched
// at its pinned length and checked against its SHA-512 before anything reads it, unpacked by cua's reader, recorded as
// it is written, and moved into place with one rename. The record serves two checks: the connection's (a stat of every
// package.json and native file) and the full one (every digest), which the installer runs before it calls a tree
// already there verified. Everything runs in scratch homes against the fixture registry; nothing is downloaded.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, truncateSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {homeLayout} from '../src/runtime/layout.mjs';
import {checkModuleTree, installModuleTree, loadModuleLock, loadModuleProvenance, MODULES_PIN_DIR, moduleClosure, readModuleTree, verifyModuleTree} from '../src/runtime/module-tree.mjs';
import {FIXTURE_CLOSURES, LINUX_ARM64, LINUX_X64, integrityOf, registry, tarball, tarballUrl, writeFixtureModules} from './fixtures/module-registry.mjs';

function setup(t, options) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cua-module-tree-')));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const pins = writeFixtureModules(join(dir, 'pins'), options);
  return {dir, home: join(dir, 'home'), pins, lock: loadModuleLock(pins.dir), provenance: loadModuleProvenance(pins.dir)};
}
const expectCode = (code, pattern) => error => { assert.equal(error.code, code, `${error.code}: ${error.message}`); if (pattern) assert.match(error.message, pattern); return true; };
const install = (s, extra = {}) => installModuleTree({home: s.home, lock: s.lock, provenance: s.provenance, host: LINUX_X64, fetch: s.pins.fetch, ...extra});
const stagingEmpty = home => { const staging = homeLayout(home).staging; return !existsSync(staging) || readdirSync(staging).length === 0; };
const record = root => JSON.parse(readFileSync(join(root, 'install.json'), 'utf8'));

// §1.2 of the pre-flight: the 23 packages on each architecture.
const COMMON = ['@img/colour', 'abstract-level', 'base64-js', 'buffer', 'classic-level', 'detect-libc', 'ieee754', 'is-buffer', 'jpeg-js',
  'level-supports', 'level-transcoder', 'maybe-combine-errors', 'module-error', 'napi-macros', 'node-gyp-build', 'pixelmatch', 'playwright',
  'playwright-core', 'pngjs', 'semver', 'sharp'];
const REAL_CLOSURE = arch => [...COMMON, `@img/sharp-linux-${arch}`, `@img/sharp-libvips-linux-${arch}`].sort();

// ---- the pin: the lock and its provenance ----

test('the checked-in lock is version 3, every entry resolved at its canonical registry URL, and its root is package.json\'s six', () => {
  const lock = loadModuleLock();
  assert.match(lock.hash, /^[0-9a-f]{64}$/);
  const {dependencies} = JSON.parse(readFileSync(join(MODULES_PIN_DIR, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(dependencies).sort(), ['classic-level', 'jpeg-js', 'pixelmatch', 'playwright', 'pngjs', 'sharp']);
  assert.deepEqual(lock.packages[''].dependencies, dependencies);
  for (const [path, entry] of Object.entries(lock.packages)) if (path) {
    const name = path.slice(path.lastIndexOf('node_modules/') + 13);
    assert.equal(entry.resolved, tarballUrl(name, entry.version), path);
    assert.match(entry.integrity, /^sha512-/, path);
  }
  assert.equal(loadModuleProvenance().lock, lock.hash, 'the provenance names the checked-in lock');
});

test('a lock that is not version 3, or whose entry resolves anywhere but its canonical URL, is invalid_pin', t => {
  const cases = {
    'version 2': lock => { lock.lockfileVersion = 2; },
    'another registry': lock => { lock.packages['node_modules/beta'].resolved = 'https://registry.example.com/beta/-/beta-1.1.0.tgz'; },
    'another version\'s file': lock => { lock.packages['node_modules/beta'].resolved = tarballUrl('beta', '1.0.9'); },
    'a git dependency': lock => { lock.packages['node_modules/beta'].resolved = 'git+ssh://git@github.com/x/beta.git#abc'; },
    'no integrity': lock => { delete lock.packages['node_modules/beta'].integrity; },
    'a SHA-1 integrity': lock => { lock.packages['node_modules/beta'].integrity = 'sha1-AAAAAAAAAAAAAAAAAAAAAAAAAAA='; },
    'a link': lock => { lock.packages['node_modules/beta'] = {resolved: '../beta', link: true}; },
    'an alias': lock => { lock.packages['node_modules/beta'].name = 'other'; },
    'no root': lock => { delete lock.packages['']; },
  };
  for (const [name, edit] of Object.entries(cases)) {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cua-module-lock-')));
    t.after(() => rmSync(dir, {recursive: true, force: true}));
    writeFixtureModules(dir, {lock: edit});
    assert.throws(() => loadModuleLock(dir), expectCode('invalid_pin'), name);
  }
});

test('the closure of the checked-in lock is the provenance\'s 23 packages on each architecture, the pre-flight\'s §1.2', () => {
  const lock = loadModuleLock();
  const provenance = loadModuleProvenance();
  for (const host of [LINUX_X64, LINUX_ARM64]) {
    const closure = moduleClosure(lock, host);
    assert.deepEqual(closure.map(p => p.name).sort(), REAL_CLOSURE(host.arch), host.arch);
    const target = provenance.targets.find(p => p.arch === host.arch);
    assert.deepEqual(closure.map(({path, name, version, integrity}) => ({path, name, version, integrity})),
      target.packages.map(({path, name, version, integrity}) => ({path, name, version, integrity})), host.arch);
    for (const absent of ['@img/sharp-wasm32', '@emnapi/runtime', 'tslib', 'fsevents', `@img/sharp-linuxmusl-${host.arch}`])
      assert.ok(!closure.some(p => p.name === absent), `${host.arch}: ${absent} is pruned`);
  }
  assert.deepEqual(provenance.targets.map(p => `${p.platform}-${p.arch}-${p.libc}`).sort(), ['linux-arm64-glibc', 'linux-x64-glibc']);
});

test('the closure follows dependencies always, an optional edge only where os, cpu and libc admit the host, and resolves the nearest copy', t => {
  const {lock} = setup(t);
  assert.deepEqual(moduleClosure(lock, LINUX_X64).map(p => p.path), FIXTURE_CLOSURES.x64);
  assert.deepEqual(moduleClosure(lock, LINUX_ARM64).map(p => p.path), FIXTURE_CLOSURES.arm64);
  const musl = moduleClosure(lock, {...LINUX_X64, libc: 'musl'}).map(p => p.path);
  assert.ok(musl.includes('node_modules/@fx/native-linuxmusl-x64') && !musl.includes('node_modules/@fx/native-linux-x64'));
  const darwin = moduleClosure(lock, {platform: 'darwin', arch: 'arm64'}).map(p => p.path);
  assert.ok(darwin.includes('node_modules/fsev') && !darwin.some(p => p.startsWith('node_modules/@fx/')));
});

test('a lock whose @img entries lack libc yields a closure the provenance does not hold: invalid_pin, before any fetch', async t => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cua-module-libc-')));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const real = JSON.parse(readFileSync(join(MODULES_PIN_DIR, 'package-lock.json'), 'utf8'));
  for (const [path, entry] of Object.entries(real.packages)) if (path.startsWith('node_modules/@img/')) delete entry.libc;
  const lockText = JSON.stringify(real, null, 2) + '\n';
  writeFileSync(join(dir, 'package-lock.json'), lockText);
  const lock = loadModuleLock(dir);
  assert.ok(moduleClosure(lock, LINUX_X64).some(p => p.name === '@img/sharp-linuxmusl-x64'), 'without libc the musl build is admitted');
  const provenance = {...loadModuleProvenance(), lock: lock.hash};
  const {fetch, urls} = registry(new Map());
  await assert.rejects(installModuleTree({home: join(dir, 'home'), lock, provenance, host: LINUX_X64, fetch}), expectCode('invalid_pin', /sharp-linuxmusl-x64/));
  assert.deepEqual(urls, []);
});

test('a closure that differs from the provenance by one entry, or a provenance of another lock, is invalid_pin', async t => {
  const dropped = setup(t, {provenance: p => { p.targets.find(x => x.arch === 'x64').packages.pop(); }});
  await assert.rejects(install(dropped), expectCode('invalid_pin', /node_modules\/native/));
  const otherVersion = setup(t, {provenance: p => { p.targets.find(x => x.arch === 'x64').packages[0].version = '9.9.9'; }});
  await assert.rejects(install(otherVersion), expectCode('invalid_pin'));
  const otherLock = setup(t, {provenance: p => { p.lock = 'f'.repeat(64); }});
  await assert.rejects(install(otherLock), expectCode('invalid_pin', /lock/));
  for (const s of [dropped, otherVersion, otherLock]) {
    assert.deepEqual(s.pins.urls, [], 'nothing was fetched');
    assert.equal(existsSync(homeLayout(s.home).modules), false);
  }
});

test('the provenance parses strictly', t => {
  const s = setup(t);
  const cases = {
    'unknown field': p => { p.extra = 1; },
    'missing lock': p => { delete p.lock; },
    'bad schema': p => { p.schema = 2; },
    'package field': p => { p.targets[0].packages[0].sha1 = 'x'; },
    'bad length': p => { p.targets[0].packages[0].length = -1; },
    'bad integrity': p => { p.targets[0].packages[0].integrity = 'sha512-short'; },
    'bad vendor hash': p => { p.vendor[0].archiveSha256 = 'xyz'; },
    'no vendor': p => { p.vendor = []; },
  };
  for (const [name, edit] of Object.entries(cases)) {
    const provenance = structuredClone(s.provenance);
    edit(provenance);
    writeFileSync(join(s.pins.dir, 'provenance.json'), JSON.stringify(provenance));
    assert.throws(() => loadModuleProvenance(s.pins.dir), expectCode('invalid_pin'), name);
  }
});

test('a host the provenance has no closure for is unsupported_platform', async t => {
  const s = setup(t);
  for (const host of [{platform: 'darwin', arch: 'arm64'}, {...LINUX_X64, libc: 'musl'}, {...LINUX_X64, arch: 'riscv64'}])
    await assert.rejects(install(s, {host}), expectCode('unsupported_platform'), JSON.stringify(host));
});

// ---- the install ----

test('homeLayout names the module trees\' directory, modules/', () => {
  assert.equal(homeLayout('/h').modules, '/h/modules');
});

for (const host of [LINUX_X64, LINUX_ARM64]) test(`an install into an empty home places and records the ${host.arch} closure, changed`, async t => {
  const s = setup(t);
  const result = await install(s, {host});
  const root = join(homeLayout(s.home).modules, s.lock.hash);
  assert.deepEqual(result, {root, moduleDir: join(root, 'node_modules'), lock: s.lock.hash, changed: true});
  const closure = FIXTURE_CLOSURES[host.arch];
  assert.deepEqual([...s.pins.urls].sort(), closure.map(path => s.lock.packages[path].resolved).sort(), 'each closure tarball fetched once, nothing else');

  const written = record(root);
  assert.deepEqual(Object.keys(written).sort(), ['arch', 'installedAt', 'lock', 'natives', 'packages', 'platform', 'schema', 'source'].sort());
  assert.equal(written.schema, 1);
  assert.equal(written.lock, s.lock.hash);
  assert.equal(written.platform, 'linux');
  assert.equal(written.arch, host.arch);
  assert.equal(written.source, 'download');
  assert.deepEqual(written.packages.map(p => p.path), closure);
  for (const p of written.packages) {
    assert.deepEqual(Object.keys(p).sort(), ['digest', 'files', 'name', 'path', 'version']);
    assert.match(p.digest, /^[0-9a-f]{64}$/);
    assert.ok(p.files >= 1);
  }
  const natives = written.natives.map(n => n.path);
  assert.ok(natives.includes('node_modules/lev/prebuilds/linux-x64/lev.node') && natives.includes('node_modules/lev/prebuilds/linux-arm64/lev.armv8.node'), 'lev holds both prebuilds');
  assert.ok(natives.includes(`node_modules/@fx/vips-linux-${host.arch}/lib/libvips.so.8.1.0`), 'a versioned .so is a native file');
  assert.ok(natives.includes(`node_modules/@fx/native-linux-${host.arch}/lib/native-linux-${host.arch}.node`));
  for (const n of written.natives) assert.deepEqual(Object.keys(n).sort(), ['path', 'sha256', 'size']);

  // Node resolves from it as cells do: the nearest copy first.
  const require = createRequire(join(result.moduleDir, 'x.js'));
  assert.equal(require('alpha'), 'alpha');
  assert.equal(createRequire(join(root, 'node_modules/alpha/index.js'))('beta'), 2);
  assert.equal(require('beta'), 1);

  assert.deepEqual(readModuleTree(s.home, s.lock, host), {root, moduleDir: result.moduleDir, record: written});
  assert.deepEqual(checkModuleTree(root, written), {packages: closure.length, natives: written.natives.length});
  assert.deepEqual(verifyModuleTree(root, written), {packages: closure.length, natives: written.natives.length});
  assert.ok(stagingEmpty(s.home));
});

test('a second install is a no-op that fetches nothing; a directory cua did not install at the path is target_occupied', async t => {
  const s = setup(t);
  const first = await install(s);
  const before = readFileSync(join(first.root, 'install.json'));
  s.pins.urls.length = 0;
  assert.deepEqual(await install(s), {...first, changed: false});
  assert.deepEqual(s.pins.urls, []);
  assert.deepEqual(readFileSync(join(first.root, 'install.json')), before);

  const foreign = setup(t);
  const target = join(homeLayout(foreign.home).modules, foreign.lock.hash);
  mkdirSync(target, {recursive: true});
  writeFileSync(join(target, 'mine.txt'), 'not cua\'s');
  await assert.rejects(install(foreign), expectCode('target_occupied'));
  assert.deepEqual(readdirSync(target), ['mine.txt']);
  assert.equal(readModuleTree(foreign.home, foreign.lock, LINUX_X64), null);
  assert.ok(stagingEmpty(foreign.home));
});

test('a tarball whose bytes differ from its SHA-512, or longer than its pinned length, is refused before unpacking: nothing placed, staging removed', async t => {
  const swapped = setup(t);
  const url = swapped.lock.packages['node_modules/lev'].resolved;
  const original = swapped.pins.tarballs.get(url);
  const other = Buffer.from(original);
  other[other.length - 1] ^= 1;
  const differ = registry(swapped.pins.tarballs, href => href === url ? new Response(other) : null);
  await assert.rejects(install(swapped, {fetch: differ.fetch}), expectCode('archive_hash_mismatch'));

  const longer = setup(t);
  const longUrl = longer.lock.packages['node_modules/lev'].resolved;
  const padded = Buffer.concat([longer.pins.tarballs.get(longUrl), Buffer.alloc(16)]);
  const declared = registry(longer.pins.tarballs, href => href === longUrl ? new Response(padded, {headers: {'content-length': String(padded.length)}}) : null);
  await assert.rejects(install(longer, {fetch: declared.fetch}), expectCode('archive_length_mismatch'));
  const undeclared = registry(longer.pins.tarballs, href => href === longUrl ? new Response(new Blob([padded]).stream()) : null);
  await assert.rejects(install(longer, {fetch: undeclared.fetch}), expectCode('archive_length_mismatch'));

  for (const s of [swapped, longer]) {
    assert.equal(existsSync(join(homeLayout(s.home).modules, s.lock.hash)), false, 'nothing placed');
    assert.ok(stagingEmpty(s.home), 'staging removed');
  }
});

test('a tarball the reader refuses fails the install: nothing placed, staging removed', async t => {
  const linked = tarball([{name: 'package/package.json', data: '{}'}, {name: 'package/evil', type: 'symlink', linkname: '/etc'}]);
  const bad = setup(t, {lock: lock => {
    lock.packages['node_modules/beta'].integrity = integrityOf(linked);
    return lock;
  }, provenance: p => {
    for (const target of p.targets) for (const pkg of target.packages) if (pkg.path === 'node_modules/beta') { pkg.integrity = integrityOf(linked); pkg.length = linked.length; }
  }});
  bad.pins.tarballs.set(tarballUrl('beta', '1.1.0'), linked);
  await assert.rejects(install(bad), expectCode('tarball_invalid', /link/));
  assert.equal(existsSync(join(homeLayout(bad.home).modules, bad.lock.hash)), false);
  assert.ok(stagingEmpty(bad.home));
});

test('--modules-dir takes local copies of the tarballs, each still checked against its length and SHA-512', async t => {
  const s = setup(t);
  const local = join(s.dir, 'tarballs');
  mkdirSync(local);
  for (const path of FIXTURE_CLOSURES.x64) {
    const {resolved, version} = s.lock.packages[path];
    const name = path.slice(path.lastIndexOf('node_modules/') + 13);
    writeFileSync(join(local, `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`), s.pins.tarballs.get(resolved));
  }
  const result = await install(s, {dir: local});
  assert.equal(result.changed, true);
  assert.deepEqual(s.pins.urls, [], 'nothing fetched');
  assert.equal(record(result.root).source, 'dir');

  const wrong = setup(t);
  const copies = join(wrong.dir, 'tarballs');
  mkdirSync(copies);
  for (const path of FIXTURE_CLOSURES.x64) {
    const {resolved, version} = wrong.lock.packages[path];
    const name = path.slice(path.lastIndexOf('node_modules/') + 13);
    const bytes = Buffer.from(wrong.pins.tarballs.get(resolved));
    if (name === 'lev') bytes[bytes.length - 1] ^= 1;
    writeFileSync(join(copies, `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`), bytes);
  }
  await assert.rejects(install(wrong, {dir: copies}), expectCode('archive_hash_mismatch'));
  rmSync(join(copies, 'beta-1.1.0.tgz'));
  await assert.rejects(install(wrong, {dir: copies}), expectCode('archive_missing'));
  appendFileSync(join(copies, 'lev-3.0.0.tgz'), 'x');
  writeFileSync(join(copies, 'beta-1.1.0.tgz'), wrong.pins.tarballs.get(tarballUrl('beta', '1.1.0')));
  await assert.rejects(install(wrong, {dir: copies}), expectCode('archive_length_mismatch'));
  assert.ok(stagingEmpty(wrong.home));
});

// ---- the two checks ----

const NATIVE = 'node_modules/lev/prebuilds/linux-x64/lev.node';

test('a native file removed, truncated or altered: the connection\'s check refuses the first two, the full check and a reinstall all three', async t => {
  const damage = {
    removed: path => rmSync(path),
    truncated: path => truncateSync(path, 3),
    altered: path => { const bytes = readFileSync(path); bytes[0] ^= 1; writeFileSync(path, bytes); },
  };
  for (const [name, harm] of Object.entries(damage)) {
    const s = setup(t);
    const {root} = await install(s);
    const written = record(root);
    const file = join(root, NATIVE);
    harm(file);
    const after = existsSync(file) ? readFileSync(file) : null;
    if (name === 'altered') assert.doesNotThrow(() => checkModuleTree(root, written), 'a same-size change passes the stat');
    else assert.throws(() => checkModuleTree(root, written), expectCode('layout_invalid', /lev\.node/), name);
    assert.throws(() => verifyModuleTree(root, written), expectCode('module_tree_invalid', /lev/), name);
    s.pins.urls.length = 0;
    await assert.rejects(install(s), expectCode('module_tree_invalid', /lev/), name);
    assert.deepEqual(s.pins.urls, [], `${name}: the reinstall fetched nothing`);
    assert.deepEqual(existsSync(file) ? readFileSync(file) : null, after, `${name}: nothing repaired in place`);
  }
});

test('a JavaScript file altered, a file added, a package removed or a stranger planted: the full check and a reinstall refuse', async t => {
  const damage = {
    'a JavaScript file altered': root => appendFileSync(join(root, 'node_modules/alpha/index.js'), '// planted\n'),
    'a file added': root => writeFileSync(join(root, 'node_modules/beta/extra.js'), ''),
    'a nested package\'s file altered': root => appendFileSync(join(root, 'node_modules/alpha/node_modules/beta/index.js'), ' '),
    'a stranger planted': root => { mkdirSync(join(root, 'node_modules/stranger')); writeFileSync(join(root, 'node_modules/stranger/index.js'), ''); },
    'a package removed': root => rmSync(join(root, 'node_modules/beta'), {recursive: true}),
  };
  for (const [name, harm] of Object.entries(damage)) {
    const s = setup(t);
    const {root} = await install(s);
    const written = record(root);
    harm(root);
    assert.throws(() => verifyModuleTree(root, written), expectCode('module_tree_invalid'), name);
    await assert.rejects(install(s), expectCode('module_tree_invalid'), name);
  }
});

test('the connection\'s check needs every package.json', async t => {
  const s = setup(t);
  const {root} = await install(s);
  rmSync(join(root, 'node_modules/alpha/package.json'));
  assert.throws(() => checkModuleTree(root, record(root)), expectCode('layout_invalid', /alpha/));
});

test('readModuleTree: null with nothing there, or with a tree whose record is not this lock\'s and host\'s', async t => {
  const s = setup(t);
  assert.equal(readModuleTree(s.home, s.lock, LINUX_X64), null);
  const {root} = await install(s);
  assert.equal(readModuleTree(s.home, s.lock, LINUX_ARM64), null, 'another architecture\'s record');
  const written = record(root);
  writeFileSync(join(root, 'install.json'), JSON.stringify({...written, packages: written.packages.slice(1)}));
  assert.equal(readModuleTree(s.home, s.lock, LINUX_X64), null, 'a record short of the closure');
  writeFileSync(join(root, 'install.json'), JSON.stringify({...written, natives: [{...written.natives[0], path: 'node_modules/lev/../../../outside.node'}]}));
  assert.equal(readModuleTree(s.home, s.lock, LINUX_X64), null, 'a record naming a file outside its packages');
  writeFileSync(join(root, 'install.json'), '{');
  assert.equal(readModuleTree(s.home, s.lock, LINUX_X64), null);
});
