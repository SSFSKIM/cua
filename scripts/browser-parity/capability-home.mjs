// The scratch home a capability-host run serves from (`run --device local --backend capability-host`): a CUA_HOME of
// its own, so neither service can list or reach any Chrome host of the machine, holding only
//   - a copy of the installed runtime (an APFS clone on macOS, so no space and no time) and its release pointer;
//   - a cua route record, so a launch lists the sockets in chrome/b (src/chrome/discovery.mjs), where the capability
//     host (test/browser-parity/capability-host.mjs) listens;
//   - the vendor's raw CDP switch in its browser config ($CODEX_HOME/browser/config.toml `full_cdp_access_enabled`,
//     readable chatgpt-26.928.40906 BS:9509 and BS:62613 fullCdpAccessState): the vendor serves raw CDP only with it
//     on, where cua's service gates on the backend's announcement alone (Decision Log, M2 task 2). Without it the
//     vendor would refuse what cua serves and the run would compare nothing.
//   - `home/`, the HOME the serve runs with (scripts/browser-parity/topology.mjs localCuaServeCommand), empty.
// The directory is short because a Unix socket path below it must fit 104 bytes. Remote managed runs install
// freshly under ~/.cp (outside TMPDIR); legacy/local doubles keep the cloned-runtime path in /tmp.
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {userInfo} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ownNodeFacts} from '../repl-parity/provenance.mjs';
import {assertManagedNode,nodeEnvironment} from '../repl-parity/node-provenance.mjs';
import {defaultHome, homeLayout, readPointer, writePointer} from '../../src/runtime/layout.mjs';
import {cuaRecordFile} from '../../src/chrome/route.mjs';
import {backendDir} from '../../src/chrome/extension.mjs';

// The installer and executable-facts boundaries are synchronous and injectable; local doubles never run install.
function installRuntime({env,run}) {
  run(process.execPath, ['bin/cua.mjs', 'install'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), env,
    stdio: ['ignore', 'ignore', 'pipe'], timeout: 300000, maxBuffer: 1024 * 1024,
  });
}

// -> {dir, userHome, release, nodeMode, ownNode?, cleanup()}; source facts remain the caller's provenance.
export function prepareCapabilityHome({source = defaultHome(), platform = process.platform, ambient = process.env,
  prefix = (ambient.CUA_PARITY_SCRATCH_PREFIX??'cua-')+'cap-', scratchRoot, install = installRuntime, run = execFileSync,
  inspect = ({home,ambient}) => ownNodeFacts(ambient,{home})} = {}) {
  const release = readPointer(source);
  const runtime = release && join(homeLayout(source).runtimes, release);
  if (!runtime || !existsSync(runtime)) throw new Error(`no installed runtime in ${source}; run \`cua install\` first`);
  if(!/^cua-[a-z0-9-]+-$/.test(prefix))throw new Error('Invalid capability scratch prefix');
  const managed = ambient.CUA_PARITY_REMOTE === '1' && ambient.CUA_PARITY_NODE_MODE === 'managed';
  // Preparation may already give us a deeply nested private HOME. The account home keeps socket paths short.
  const parent = managed ? (scratchRoot ?? join(userInfo().homedir, '.cp')) : '/tmp';
  if (managed) mkdirSync(parent, {recursive: true, mode: 0o700});
  const dir = realpathSync(mkdtempSync(join(parent,prefix)));
  const userHome = join(dir, 'home');
  let ownNode;
  try {
    mkdirSync(userHome, {mode: 0o700});
    if (managed) {
      const env = nodeEnvironment({...ambient, CUA_HOME: dir, HOME: userHome});
      install({home: dir, env, run});
      if (readPointer(dir) !== release || !existsSync(join(homeLayout(dir).runtimes,release))) throw new Error('Fresh scratch runtime release differs from prepared source');
      ownNode = assertManagedNode({home: dir, ownNode: inspect({home: dir, ambient: env})});
    } else {
      mkdirSync(homeLayout(dir).runtimes, {recursive: true, mode: 0o700});
      execFileSync('cp', [...(platform === 'darwin' ? ['-c'] : []), '-R', runtime, homeLayout(dir).runtimes]);
      writePointer(dir, release);
    }
    mkdirSync(backendDir(dir), {recursive: true, mode: 0o700});
    writeFileSync(cuaRecordFile(dir), JSON.stringify({schema: 1, route: 'cua', launcher: null, backendsDir: backendDir(dir), browsers: {}}) + '\n', {mode: 0o600});
    const browserConfig = join(homeLayout(dir).codexHome, 'browser');
    mkdirSync(browserConfig, {recursive: true, mode: 0o700});
    writeFileSync(join(browserConfig, 'config.toml'), 'full_cdp_access_enabled = true\n', {mode: 0o600});
  } catch (error) {
    rmSync(dir, {recursive: true, force: true});
    throw error;
  }
  return {dir, userHome, release, nodeMode: managed ? 'managed' : 'legacy', ...(managed ? {ownNode} : {}), cleanup() { rmSync(dir, {recursive: true, force: true}); }};
}
