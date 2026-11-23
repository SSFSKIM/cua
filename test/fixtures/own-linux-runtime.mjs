// cua's own Linux runtime laid down in a scratch home for tests (#171 M6a; the pre-flight's §2, §3.1): the ModuleTree of
// the checked-in lock for a Linux host, as `cua install` would leave it, but with each package holding only a
// package.json naming it. Its install record is the real shape, and its digests are those files', so the connection's
// check and the full check both pass on it. Nothing is fetched and no package code exists in it. And cua's engine and
// the managed Node as `cua install` places them (fakeInstalledEngine, fakeManagedNode).
import {createHash} from 'node:crypto';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {homeLayout} from '../../src/runtime/layout.mjs';
import {loadModuleLock, moduleClosure} from '../../src/runtime/module-tree.mjs';
import {linuxRelease, loadLinuxRuntime} from '../../src/runtime/manifest.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// The host the checked-in provenance is pinned for: glibc Linux.
export const moduleHostOf = host => ({platform: host.platform, arch: host.arch, libc: host.libc ?? 'glibc'});

// -> {root, moduleDir, record, release}: the tree of this checkout's lock for `host` ({platform: 'linux', arch}) under
// `home`, and the release name the checked-in record derives for it.
export function fakeModuleTree(home, host, {lock = loadModuleLock()} = {}) {
  const target = moduleHostOf(host);
  const root = join(homeLayout(home).modules, lock.hash);
  const packages = moduleClosure(lock, target).map(({path, name, version}) => {
    const bytes = Buffer.from(`${JSON.stringify({name, version})}\n`);
    mkdirSync(join(root, path), {recursive: true});
    writeFileSync(join(root, path, 'package.json'), bytes);
    const digest = sha256(JSON.stringify([['package.json', bytes.length, sha256(bytes)]]));
    return {path, name, version, files: 1, digest};
  });
  const record = {schema: 1, lock: lock.hash, platform: target.platform, arch: target.arch, packages, natives: [], source: 'fixture', installedAt: '2026-11-23T00:00:00.000Z'};
  writeFileSync(join(root, 'install.json'), `${JSON.stringify(record, null, 2)}\n`);
  return {root, moduleDir: join(root, 'node_modules'), record, release: linuxRelease(loadLinuxRuntime({host}), host.arch)};
}

// The engine `cua install` would leave in `home` at `version` (src/runtime/linux-engine.mjs): an executable answering
// --version as that release would, and its install.json, whose SHA-256 is the file's unless `recordOf` names other bytes
// (an interrupted downgrade: the older file beside the newer record). `build` is the record's. -> the engine's path.
export function fakeInstalledEngine(home, version, {recordOf, build = 'pinned'} = {}) {
  const dir = join(homeLayout(home).engine, 'linux');
  const bytes = `#!/bin/sh\necho "cua-engine ${version} (0123456789ab)"\n`;
  mkdirSync(dir, {recursive: true});
  writeFileSync(join(dir, 'cua-engine'), bytes, {mode: 0o755});
  writeFileSync(join(dir, 'install.json'), JSON.stringify({schema: 1, build, version, ...(build === 'pinned' ? {release: `linux-engine-v${version}`} : {}),
    sha256: sha256(recordOf ?? bytes), source: 'test', installedAt: '2026-11-23T00:00:00.000Z'}));
  return join(dir, 'cua-engine');
}

// The Node `cua install` would leave in `home` for `host` (src/runtime/managed-node.mjs): node/<version>/bin/node, a
// script answering --version as that Node would, its install record over those bytes, and node/current.json naming it.
// `version` is the record's pinned Node unless given. -> the binary's path.
export function fakeManagedNode(home, host, {version = loadLinuxRuntime({host}).node.version} = {}) {
  const dir = join(homeLayout(home).node, version);
  const bytes = Buffer.from(`#!/bin/sh\necho v${version}\n`);
  mkdirSync(join(dir, 'bin'), {recursive: true});
  writeFileSync(join(dir, 'bin', 'node'), bytes, {mode: 0o755});
  writeFileSync(join(dir, 'install.json'), JSON.stringify({schema: 1, version, platform: host.platform, arch: host.arch, archive: {sha256: 'a'.repeat(64), length: 1},
    node: {sha256: sha256(bytes), size: bytes.length}, source: 'download', installedAt: '2026-11-23T00:00:00.000Z'}));
  writeFileSync(join(homeLayout(home).node, 'current.json'), JSON.stringify({schema: 1, version}));
  return join(dir, 'bin', 'node');
}
