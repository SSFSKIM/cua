// What a whole Linux `cua install` takes, as fixtures served by URL (#171 M6b): pins of the tests' own for the sandbox
// helper, the engine and the managed Node, each naming bytes the tests lay or serve, and the archives a full install
// fetches through them, with the module tree's fixture registry. The real assets are never fetched. Shared by the
// no-vendor-read replay and the provenance records' unreachability test.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {join} from 'node:path';
import {loadLinuxRuntime} from '../../src/runtime/manifest.mjs';
import {loadModuleLock, loadModuleProvenance} from '../../src/runtime/module-tree.mjs';
import {loadHelperPin} from '../../src/sandbox/linux.mjs';
import {MIN_ENGINE_VERSION} from '../../src/services/engine/linux/client.mjs';
import {shortScratch} from './runtime-fixture.mjs';
import {writeFixtureModules} from './module-registry.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const HELPER_BYTES = Buffer.from('#!/bin/sh\nexit 0\n');
const REAL_HELPER_PIN = loadHelperPin();
export const helperPin = bytes => ({...REAL_HELPER_PIN, assets: {...REAL_HELPER_PIN.assets, 'linux-x64': {url: 'https://fixture.invalid/codex-linux-sandbox', length: bytes.length, sha256: sha256(bytes)}}});
export const enginePinFor = bytes => ({version: MIN_ENGINE_VERSION, release: `linux-engine-v${MIN_ENGINE_VERSION}`,
  assets: {x64: {url: 'https://fixture.invalid/cua-engine', sha256: sha256(bytes)}, arm64: {url: 'https://fixture.invalid/cua-engine-arm64', sha256: sha256('arm64')}}});
export const NODE_VERSION = loadLinuxRuntime({host: {platform: 'linux', arch: 'x64'}}).node.version;
export const nodePinFor = ({sha256: hash, length}) => ({schema: 1, version: NODE_VERSION, platform: 'linux', arch: 'x64',
  archive: {url: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz`, length, sha256: hash}, notes: 'fixture'});

// The archives a full install takes on linux-x64, each served by URL: the module tree's fixture registry, the helper, a
// Node tarball and the engine -> {modules: {lock, provenance, fetch}, nodePin, enginePin, helper, serve: {url: bytes}}.
export function servedArchives(t) {
  const s = shortScratch();
  t.after(s.cleanup);
  const registry = writeFixtureModules(join(s.dir, 'modules-pins'));
  const modules = {lock: loadModuleLock(registry.dir), provenance: loadModuleProvenance(registry.dir), fetch: registry.fetch};
  const top = `node-v${NODE_VERSION}-linux-x64`;
  fs.mkdirSync(join(s.dir, 'node-tree', top, 'bin'), {recursive: true});
  fs.writeFileSync(join(s.dir, 'node-tree', top, 'bin', 'node'), `#!/bin/sh\necho v${NODE_VERSION}\n`, {mode: 0o755});
  fs.writeFileSync(join(s.dir, 'node-tree', top, 'LICENSE'), 'licence\n');
  const tarball = join(s.dir, 'node.tar.gz');
  assert.equal(spawnSync('tar', ['-czf', tarball, '-C', join(s.dir, 'node-tree'), top]).status, 0);
  const nodeBytes = fs.readFileSync(tarball);
  const nodePin = nodePinFor({sha256: sha256(nodeBytes), length: nodeBytes.length});
  const engine = Buffer.from(`#!/bin/sh\necho "cua-engine ${MIN_ENGINE_VERSION} (fedcba987654)"\n`);
  const helper = helperPin(HELPER_BYTES);
  const enginePin = enginePinFor(engine);
  return {modules, nodePin, enginePin, helper,
    serve: {[helper.assets['linux-x64'].url]: HELPER_BYTES, [nodePin.archive.url]: nodeBytes, [enginePin.assets.x64.url]: engine}};
}
