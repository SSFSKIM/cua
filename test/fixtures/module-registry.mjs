// A fixture npm registry for the ModuleTree (#171 M6a T1; the pre-flight's §4.2): gzipped tarballs written by a tar
// writer of the tests' own, so a test can build exactly the member a reader must refuse (a link, a device, an absolute
// or `..` path, a second top directory, a duplicate, an oversized header), and a small package-lock.json with the
// shapes the real one has: a nested dependency, platform packages pruned by os, cpu and libc, a branch reachable only
// through a pruned package, and a package that carries prebuilds for both architectures. Its provenance.json is written
// here from the fixture's own data, never by the code under test.
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const TYPES = {file: '0', hardlink: '1', symlink: '2', char: '3', block: '4', dir: '5', fifo: '6', pax: 'x', global: 'g', longname: 'L'};

function field(buffer, offset, width, value) {
  buffer.write(value, offset, width, 'utf8');
}
const octal = (value, width) => value.toString(8).padStart(width - 1, '0') + '\0';

// One 512-byte ustar header. `size` may claim more than the body that follows (an oversized member).
export function tarHeader({name, type = 'file', size = 0, mode = 0o644, linkname = '', prefix = '', checksum}) {
  const header = Buffer.alloc(512);
  field(header, 0, 100, name);
  field(header, 100, 8, octal(mode, 8));
  field(header, 108, 8, octal(0, 8));
  field(header, 116, 8, octal(0, 8));
  field(header, 124, 12, octal(size, 12));
  field(header, 136, 12, octal(0, 12));
  field(header, 148, 8, '        ');
  field(header, 156, 1, TYPES[type] ?? type);
  field(header, 157, 100, linkname);
  field(header, 257, 6, 'ustar\0');
  field(header, 263, 2, '00');
  field(header, 345, 155, prefix);
  const sum = checksum ?? header.reduce((total, byte) => total + byte, 0);
  field(header, 148, 8, octal(sum, 7) + ' ');
  return header;
}

const pad = data => Buffer.concat([data, Buffer.alloc((512 - (data.length % 512)) % 512)]);

// Entries: {name, data, type, mode, linkname, prefix, size}. `data` is a string or a Buffer; `size` overrides the
// header's size without writing that many bytes.
export function tarBytes(entries) {
  const blocks = [];
  for (const {data = '', size, ...entry} of entries) {
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
    blocks.push(tarHeader({...entry, size: size ?? body.length}));
    if (body.length) blocks.push(pad(body));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

export const tarball = entries => gzipSync(tarBytes(entries));

// A pax extended header record for the entry after it.
export function paxRecord(key, value) {
  const body = ` ${key}=${value}\n`;
  let length = body.length + 1;
  while (String(length).length + body.length !== length) length = String(length).length + body.length;
  return `${length}${body}`;
}

export const integrityOf = bytes => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
export const sha256Of = bytes => createHash('sha256').update(bytes).digest('hex');
export const tarballUrl = (name, version) => `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${version}.tgz`;

// A package's tarball: package.json plus `files`, under the top directory `package/`.
export function packageTarball(name, version, files = {}) {
  return tarball([
    {name: 'package/', type: 'dir', mode: 0o755},
    {name: 'package/package.json', data: JSON.stringify({name, version}) + '\n'},
    ...Object.entries(files).map(([path, data]) => ({name: `package/${path}`, data, mode: path.endsWith('.node') || path.includes('.so') ? 0o755 : 0o644})),
  ]);
}

const linux = (cpu, libc = 'glibc') => ({os: ['linux'], cpu: [cpu], libc: [libc]});

// path -> {version, deps, optional, optionalEntry, platform, files, bytes (the tarball itself, in place of files)}.
// The closure on linux-x64 (glibc) is alpha, alpha's nested beta, beta, native, @fx/native-linux-x64,
// @fx/vips-linux-x64 and lev; on arm64 the two @fx packages are the arm64 ones.
export const FIXTURE_PACKAGES = {
  'node_modules/alpha': {version: '1.0.0', deps: {beta: '^2.0.0'}, optional: {fsev: '1.0.0'}, files: {'index.js': 'module.exports = "alpha";\n'}},
  'node_modules/alpha/node_modules/beta': {version: '2.0.0', files: {'index.js': 'module.exports = 2;\n'}},
  'node_modules/beta': {version: '1.1.0', files: {'index.js': 'module.exports = 1;\n'}},
  'node_modules/fsev': {version: '1.0.0', optionalEntry: true, platform: {os: ['darwin']}, files: {'fsev.node': 'darwin native'}},
  'node_modules/native': {version: '2.0.0', deps: {beta: '^1.0.0'},
    optional: {'@fx/native-linux-x64': '2.0.0', '@fx/native-linux-arm64': '2.0.0', '@fx/native-linuxmusl-x64': '2.0.0', '@fx/native-freebsd': '2.0.0'},
    files: {'lib/index.js': 'module.exports = "native";\n'}},
  'node_modules/@fx/native-linux-x64': {version: '2.0.0', optionalEntry: true, platform: linux('x64'), optional: {'@fx/vips-linux-x64': '8.1.0'}, files: {'lib/native-linux-x64.node': 'x64 addon bytes'}},
  'node_modules/@fx/vips-linux-x64': {version: '8.1.0', optionalEntry: true, platform: linux('x64'), files: {'lib/libvips.so.8.1.0': 'x64 vips bytes', 'lib/index.js': ''}},
  'node_modules/@fx/native-linux-arm64': {version: '2.0.0', optionalEntry: true, platform: linux('arm64'), optional: {'@fx/vips-linux-arm64': '8.1.0'}, files: {'lib/native-linux-arm64.node': 'arm64 addon bytes'}},
  'node_modules/@fx/vips-linux-arm64': {version: '8.1.0', optionalEntry: true, platform: linux('arm64'), files: {'lib/libvips.so.8.1.0': 'arm64 vips bytes'}},
  'node_modules/@fx/native-linuxmusl-x64': {version: '2.0.0', optionalEntry: true, platform: linux('x64', 'musl'), files: {'lib/native.node': 'musl'}},
  'node_modules/@fx/native-freebsd': {version: '2.0.0', optionalEntry: true, platform: {os: ['freebsd']}, deps: {'@fx/native-wasm': '2.0.0'}, files: {}},
  'node_modules/@fx/native-wasm': {version: '2.0.0', optionalEntry: true, deps: {gamma: '^1.0.0'}, files: {'lib/native.wasm': 'wasm'}},
  'node_modules/gamma': {version: '1.0.0', optionalEntry: true, files: {}},
  'node_modules/lev': {version: '3.0.0', deps: {beta: '^1.0.0'},
    files: {'prebuilds/linux-x64/lev.node': 'lev x64 prebuild', 'prebuilds/linux-arm64/lev.armv8.node': 'lev arm64 prebuild', 'index.js': 'module.exports = "lev";\n'}},
};
export const FIXTURE_ROOTS = {alpha: '1.0.0', lev: '3.0.0', native: '2.0.0'};
export const FIXTURE_CLOSURES = {
  x64: ['node_modules/@fx/native-linux-x64', 'node_modules/@fx/vips-linux-x64', 'node_modules/alpha', 'node_modules/alpha/node_modules/beta', 'node_modules/beta', 'node_modules/lev', 'node_modules/native'],
  arm64: ['node_modules/@fx/native-linux-arm64', 'node_modules/@fx/vips-linux-arm64', 'node_modules/alpha', 'node_modules/alpha/node_modules/beta', 'node_modules/beta', 'node_modules/lev', 'node_modules/native'],
};
export const LINUX_X64 = {platform: 'linux', arch: 'x64', libc: 'glibc'};
export const LINUX_ARM64 = {platform: 'linux', arch: 'arm64', libc: 'glibc'};

const nameOf = path => path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);

// -> {lock, tarballs: Map<url, Buffer>}. `edit(lock)` may change the lock before it is returned.
export function fixtureLock({packages = FIXTURE_PACKAGES, roots = FIXTURE_ROOTS} = {}) {
  const tarballs = new Map();
  const lock = {name: 'cua-modules-fixture', lockfileVersion: 3, requires: true, packages: {'': {name: 'cua-modules-fixture', dependencies: {...roots}}}};
  for (const [path, spec] of Object.entries(packages)) {
    const name = nameOf(path);
    const bytes = spec.bytes ?? packageTarball(name, spec.version, spec.files);
    const url = tarballUrl(name, spec.version);
    tarballs.set(url, bytes);
    lock.packages[path] = {
      version: spec.version, resolved: url, integrity: integrityOf(bytes), license: 'MIT',
      ...(spec.deps ? {dependencies: spec.deps} : {}),
      ...(spec.optional ? {optionalDependencies: spec.optional} : {}),
      ...(spec.optionalEntry ? {optional: true} : {}),
      ...(spec.platform ?? {}),
    };
  }
  return {lock, tarballs};
}

// The provenance for a lock's text, from the fixture's own closure lists (never computed by the code under test).
export function fixtureProvenance(lockText, tarballs, {closures = FIXTURE_CLOSURES} = {}) {
  const lock = JSON.parse(lockText);
  const target = (arch, paths) => ({platform: 'linux', arch, libc: 'glibc', packages: [...paths].sort().map(path => {
    const entry = lock.packages[path];
    return {path, name: nameOf(path), version: entry.version, integrity: entry.integrity, length: tarballs.get(entry.resolved).length};
  })});
  return {
    schema: 1,
    lock: sha256Of(Buffer.from(lockText)),
    vendor: [{release: '0.0.1-linux-x64', archiveSha256: '0'.repeat(64), lockfileSha256: '1'.repeat(64)}],
    targets: [target('arm64', closures.arm64), target('x64', closures.x64)],
  };
}

// Writes a module pin directory (package-lock.json and provenance.json) -> {dir, lock, tarballs, fetch, urls}.
export function writeFixtureModules(dir, {lock: editLock, provenance: editProvenance, packages} = {}) {
  const built = fixtureLock({packages});
  const clone = structuredClone(built.lock);
  const lock = editLock ? editLock(clone) ?? clone : built.lock;
  const lockText = JSON.stringify(lock, null, 2) + '\n';
  const provenance = fixtureProvenance(JSON.stringify(built.lock, null, 2) + '\n', built.tarballs);
  provenance.lock = sha256Of(Buffer.from(lockText));
  const finalProvenance = editProvenance ? editProvenance(provenance) ?? provenance : provenance;
  mkdirSync(dir, {recursive: true});
  writeFileSync(join(dir, 'package-lock.json'), lockText);
  writeFileSync(join(dir, 'provenance.json'), JSON.stringify(finalProvenance, null, 2) + '\n');
  return {dir, lock, lockText, tarballs: built.tarballs, provenance: finalProvenance, ...registry(built.tarballs)};
}

// A fake fetch serving the tarballs, recording each URL asked for. `override(url)` may answer instead.
export function registry(tarballs, override) {
  const urls = [];
  const fetch = async url => {
    urls.push(url);
    const answer = override?.(url);
    if (answer) return answer;
    const bytes = tarballs.get(url);
    if (!bytes) return new Response('not found', {status: 404});
    return new Response(bytes, {headers: {'content-length': String(bytes.length)}});
  };
  return {fetch, urls};
}

// The vendor's side for scripts/modules-pin.mjs: a pnpm lockfile (lockfileVersion 9.0, the shape of the pinned deb's
// `.pnpm/lock.yaml`) naming the fixture's packages, with their integrities, platform fields and resolved edges, and
// a vendor workspace package beside them. `edit(specs)` may change the {key -> spec} map first, where key is
// `name@version` and spec is {integrity, platform, deps, optional, isOptional}.
export function fixturePnpmLock({packages = FIXTURE_PACKAGES, roots = FIXTURE_ROOTS, edit} = {}) {
  const {lock} = fixtureLock({packages, roots});
  const versionsOf = name => Object.entries(lock.packages).filter(([path]) => path && nameOf(path) === name).map(([, entry]) => entry.version);
  const resolve = (name, range) => {
    const versions = versionsOf(name);
    return versions.length === 1 ? versions[0] : versions.find(v => v.split('.')[0] === range.replace(/^\^/, '').split('.')[0]);
  };
  const edges = deps => Object.fromEntries(Object.entries(deps ?? {}).map(([name, range]) => [name, resolve(name, range)]));
  let specs = {};
  for (const [path, entry] of Object.entries(lock.packages)) if (path) {
    specs[`${nameOf(path)}@${entry.version}`] = {integrity: entry.integrity, platform: {os: entry.os, cpu: entry.cpu, libc: entry.libc},
      deps: edges(entry.dependencies), optional: edges(entry.optionalDependencies), isOptional: entry.optional};
  }
  if (edit) specs = edit(specs) ?? specs;
  const key = k => k.startsWith('@') ? `'${k}'` : k;
  const sorted = () => Object.entries(specs).sort(([a], [b]) => a < b ? -1 : 1);
  const lines = ["lockfileVersion: '9.0'", '', 'settings:', '  autoInstallPeers: true', '  excludeLinksFromLockfile: false', '', 'importers:', '', '  .:', '    dependencies:',
    "      '@oai/sky':", '        specifier: workspace:*', '        version: file:packages/sky_js_build.tgz'];
  for (const [name, version] of Object.entries(roots)) lines.push(`      ${key(name)}:`, `        specifier: ${version}`, `        version: ${version}`);
  lines.push('', '  packages/sky_js_build.tgz: {}', '', 'packages:', '',
    "  '@oai/sky@file:packages/sky_js_build.tgz':", '    resolution: {directory: packages/sky_js_build.tgz, type: directory}', '    hasBin: true', '');
  for (const [k, spec] of sorted()) {
    lines.push(`  ${key(k)}:`, `    resolution: {integrity: ${spec.integrity}}`, "    engines: {node: '>=18'}");
    for (const field of ['cpu', 'os', 'libc']) if (spec.platform?.[field]) lines.push(`    ${field}: [${spec.platform[field].join(', ')}]`);
    lines.push('');
  }
  lines.push('snapshots:', '', "  '@oai/sky@file:packages/sky_js_build.tgz': {}", '');
  for (const [k, spec] of sorted()) {
    const deps = Object.entries(spec.deps ?? {});
    const optional = Object.entries(spec.optional ?? {});
    if (!deps.length && !optional.length && !spec.isOptional) { lines.push(`  ${key(k)}: {}`, ''); continue; }
    lines.push(`  ${key(k)}:`);
    if (deps.length) lines.push('    dependencies:', ...deps.map(([n, v]) => `      ${key(n)}: ${v}`));
    if (optional.length) lines.push('    optionalDependencies:', ...optional.map(([n, v]) => `      ${key(n)}: ${v}`));
    if (spec.isOptional) lines.push('    optional: true');
    lines.push('');
  }
  return lines.join('\n');
}
