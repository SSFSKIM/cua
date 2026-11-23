// The scratch home a capability-host run serves from (`run --device local --backend capability-host`): a CUA_HOME of
// its own, so neither service can list or reach any Chrome host of the machine, holding only
//   - a copy of the installed runtime (an APFS clone on macOS, so no space and no time) and its release pointer. On
//     Linux the runtime is cua's own (#171 M6a): what the source home resolves (manifest.mjs resolveRuntime: the
//     record's release and its module tree), never a tree under runtimes/ and never the pointer, which there records
//     and selects nothing; its copy is the own parts a session takes from a home (the module tree, the managed Node, the
//     sandbox helper and cua's engine, those the source holds), and the copy is checked by resolving it;
//   - a cua route record, so a launch lists the sockets in chrome/b (src/chrome/discovery.mjs), where the capability
//     host (test/browser-parity/capability-host.mjs) listens;
//   - the vendor's raw CDP switch in its browser config ($CODEX_HOME/browser/config.toml `full_cdp_access_enabled`,
//     readable chatgpt-26.928.40906 BS:9509 and BS:62613 fullCdpAccessState): the vendor serves raw CDP only with it
//     on, where cua's service gates on the backend's announcement alone (Decision Log, M2 task 2). Without it the
//     vendor would refuse what cua serves and the run would compare nothing.
//   - `home/`, the HOME the serve runs with (scripts/browser-parity/topology.mjs localCuaServeCommand), empty.
// The directory is short because a Unix socket path below it must fit 104 bytes. Remote managed runs install
// freshly under ~/.cp (outside TMPDIR), through the real release install path from the prepared home's verified
// archive cache (scripts/repl-parity/archive-cache.mjs; on Linux, once pinned, cua's engine placed from it first, and the
// module tree installed from its tarballs), never a download, and the fresh home must resolve to the source's release;
// legacy/local doubles keep the cloned-runtime path in /tmp.
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync} from 'node:fs';
import {removeScratchHomes, userHomeBeside} from '../harness-home.mjs';
import {userInfo} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ownNodeFacts} from '../repl-parity/provenance.mjs';
import {cachedArchives, installArgs, placeCachedEngine} from '../repl-parity/archive-cache.mjs';
import {assertManagedNode,nodeEnvironment} from '../repl-parity/node-provenance.mjs';
import {defaultHome, homeLayout, readPointer, writePointer} from '../../src/runtime/layout.mjs';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {cuaRecordFile} from '../../src/chrome/route.mjs';
import {backendDir} from '../../src/chrome/extension.mjs';

// The installer and executable-facts boundaries are synchronous and injectable; local doubles never run install. The
// install acquires only: pinned to the vendor engine, so it never builds an engine under the scratch HOME (#117 M4).
function installRuntime({env,run,archives}) {
  run(process.execPath, ['bin/cua.mjs', ...installArgs(archives)], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), env: {...env, CUA_NATIVE_ENGINE: 'vendor'},
    stdio: ['ignore', 'ignore', 'pipe'], timeout: 300000, maxBuffer: 1024 * 1024,
  });
}

// The installed runtime of `home` for `host` -> {release, parts}: the directories a copy takes, each [from, the directory
// of the copy's home it goes into]. On Linux, what the home resolves (its module tree) and the other own parts it holds;
// elsewhere the pointer's release under runtimes/. A home without one is refused.
function installedRuntime(home, host) {
  if (host.platform === 'linux') {
    let runtime;
    try { runtime = resolveRuntime({home, host}); } catch (error) { throw new Error(`no installed runtime in ${home}: ${error.message}; run \`cua install\` first`, {cause: error}); }
    const layout = homeLayout(home);
    return {release: runtime.release, parts: [[runtime.root, 'modules'], ...['node', 'sandbox', 'engine'].filter(part => existsSync(layout[part])).map(part => [layout[part], '.'])]};
  }
  const release = readPointer(home);
  const runtime = release && join(homeLayout(home).runtimes, release);
  if (!runtime || !existsSync(runtime)) throw new Error(`no installed runtime in ${home}; run \`cua install\` first`);
  return {release, parts: [[runtime, 'runtimes']]};
}

// The release the fresh home `dir` serves: on Linux what it resolves to, or it throws why it does not (the pointer
// selects nothing there); elsewhere its pointer's, when that release is under runtimes/, else null.
function servedRelease(dir, host) {
  if (host.platform === 'linux') return resolveRuntime({home: dir, host}).release;
  const release = readPointer(dir);
  return release && existsSync(join(homeLayout(dir).runtimes, release)) ? release : null;
}
function assertServes(dir, release, host, what) {
  let served, why = '';
  try { served = servedRelease(dir, host); } catch (error) { why = `: ${error.message}`; }
  if (served !== release) throw new Error(`${what}${why}`);
}

// -> {dir, userHome, release, nodeMode, ownNode?, cleanup()}; source facts remain the caller's provenance.
export function prepareCapabilityHome({source = defaultHome(), platform = process.platform, arch = process.arch, ambient = process.env,
  prefix = (ambient.CUA_PARITY_SCRATCH_PREFIX??'cua-')+'cap-', scratchRoot, install = installRuntime, run = execFileSync,
  archives = cachedArchives, placeEngine = placeCachedEngine, inspect = ({home,ambient}) => ownNodeFacts(ambient,{home})} = {}) {
  const host = {platform, arch};
  const {release, parts} = installedRuntime(source, host);
  if(!/^cua-[a-z0-9-]+-$/.test(prefix))throw new Error('Invalid capability scratch prefix');
  const managed = ambient.CUA_PARITY_REMOTE === '1' && ambient.CUA_PARITY_NODE_MODE === 'managed';
  const cache = managed ? archives(source) : null;
  // Preparation may already give us a deeply nested private HOME. The account home keeps socket paths short.
  const parent = managed ? (scratchRoot ?? join(userInfo().homedir, '.cp')) : '/tmp';
  if (managed) mkdirSync(parent, {recursive: true, mode: 0o700});
  const dir = realpathSync(mkdtempSync(join(parent,prefix)));
  const userHome = userHomeBeside(dir);   // never inside the cua home (../harness-home.mjs)
  let ownNode;
  try {
    mkdirSync(userHome, {mode: 0o700});
    if (managed) {
      const env = nodeEnvironment({...ambient, CUA_HOME: dir, HOME: userHome});
      // A pinned Linux engine from the cache, in place before the install, whose engine step then finds it (#171).
      if (cache.engine) placeEngine(dir, cache.engine);
      try { install({home: dir, env, run, archives: cache}); }
      catch (error) {
        if (!/\[archive_[a-z_]+\]/.test(error.message)) throw error;
        throw new Error(`${error.message}\nThe prepared archive cache was refused; managed fixtures never download: run cleanup-prepared, then prepare again`, {cause: error});
      }
      assertServes(dir, release, host, 'Fresh scratch runtime release differs from prepared source');
      ownNode = assertManagedNode({home: dir, ownNode: inspect({home: dir, ambient: env})});
    } else {
      for (const [from, into] of parts) {
        mkdirSync(join(dir, into), {recursive: true, mode: 0o700});
        // an APFS clone where the copy runs on macOS (the host may be another, injected by a test)
        execFileSync('cp', [...(process.platform === 'darwin' ? ['-c'] : []), '-R', from, join(dir, into)]);
      }
      writePointer(dir, release);
      assertServes(dir, release, host, 'Scratch runtime copy does not serve the prepared source\'s release');
    }
    mkdirSync(backendDir(dir), {recursive: true, mode: 0o700});
    writeFileSync(cuaRecordFile(dir), JSON.stringify({schema: 1, route: 'cua', launcher: null, backendsDir: backendDir(dir), browsers: {}}) + '\n', {mode: 0o600});
    const browserConfig = join(homeLayout(dir).codexHome, 'browser');
    mkdirSync(browserConfig, {recursive: true, mode: 0o700});
    writeFileSync(join(browserConfig, 'config.toml'), 'full_cdp_access_enabled = true\n', {mode: 0o600});
  } catch (error) {
    removeScratchHomes(dir);
    throw error;
  }
  return {dir, userHome, release, nodeMode: managed ? 'managed' : 'legacy', ...(managed ? {ownNode} : {}), cleanup() { removeScratchHomes(dir); }};
}
