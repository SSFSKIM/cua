// cua doctor's runtime rows on Linux (#171 M6a; docs/doperpowers/specs/2026-10-28-own-linux-engine-m6a-preflight.md
// §4.5): cua's own runtime, which every Linux session resolves, and the vendor's tree in one row beside it.
//
//   platform           the release the record derives (manifest.mjs loadLinuxRuntime, linuxRelease); a record that its
//                      pins contradict fails, and doctor stops there, since nothing resolves without it
//   runtime.installed  the module tree this cua's lock names (manifest.mjs locateRuntime, which never reads the pointer)
//                      and the pointer: `pass` when the tree is installed and current.json names this release (the
//                      install writes it once every common part is in place); `warn` when sessions resolve and it names
//                      the vendor's release, another runtime or nothing; `fail` when the tree is not installed
//   runtime.modules    the tree's full check (module-tree.mjs verifyModuleTree): every package's digest, every native
//                      file's hash, nothing added; `fail` names the first few that differ
//   runtime.node       the Node sessions here run on: `pass` for the pinned managed Node (its bytes the recorded ones);
//                      `warn` for a managed Node other than the pin, or CUA_NODE in its place; `fail` for none
//   runtime.vendor     the vendor's tree (manifest.mjs vendorLinuxRuntime, and its manifest against the pin), kept for
//                      CUA_NATIVE_ENGINE=vendor until M6b: `pass` installed and whole, `skip` absent, `fail` damaged. It
//                      folds the vendor rows doctor had on Linux (runtime.files, vendor-manifest, ipc, signatures)
//
// Every `fail`, and every `warn` for a part behind its pin, names this cua's own installer by its absolute path, the
// command the sessions' refusals name (manifest.mjs ownInstaller; ruling 1110). Nothing here launches anything.
import {CuaError} from './errors.mjs';
import {readPointer, realHome} from './layout.mjs';
import {linuxRelease, loadLinuxRuntime, locateRuntime, ownInstaller, vendorLinuxRuntime} from './manifest.mjs';
import {moduleRecoveryHint, verifyModuleTree} from './module-tree.mjs';
import {NODE_FLOOR, managedNode} from './managed-node.mjs';
import {checkVendorManifest} from './checks.mjs';

const result = (name, status, detail) => ({name, status, detail});
const sentence = error => (error.hint ? `${error.message}; ${error.hint}` : error.message);
const caught = (run, onError) => { try { return run(); } catch (error) { if (!(error instanceof CuaError)) throw error; return onError(error); } };
const older = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; };

// -> {rows, runtime, stop}: `runtime` is what sessions resolve (null when they cannot), `stop` that the record itself
// failed. `linuxRuntime` (the record) is a seam for tests.
export function linuxRuntimeChecks({home, env, host, pins, linuxRuntime = () => loadLinuxRuntime({host})}) {
  let parts, release;
  const refused = caught(() => { parts = linuxRuntime(); release = linuxRelease(parts, host.arch); return null; }, error => error);
  if (refused) return {rows: [result('platform', 'fail', sentence(refused))], runtime: null, stop: true};
  const installer = `\`${ownInstaller({release}).command}\``;
  const rows = [result('platform', 'pass', `linux-${host.arch}: cua's own runtime ${release}`)];

  const runtime = caught(() => locateRuntime({home, host}), error => { rows.push(result('runtime.installed', 'fail', sentence(error))); return null; });
  if (runtime) rows.push(installedRow(runtime, pins, installer));
  rows.push(runtime ? modulesRow(runtime) : result('runtime.modules', 'skip', 'no module tree to verify (see runtime.installed)'));
  rows.push(nodeRow({home, env, host, pinned: parts.node.version, installer}));
  rows.push(vendorRow({home, host, pins, installer}));
  return {rows, runtime: runtime && {release: runtime.release, root: runtime.root, paths: runtime.paths, parts}, stop: false};
}

function installedRow(runtime, pins, installer) {
  const pointer = caught(() => readPointer(realHome(runtime.home)), error => ({unreadable: error.message}));
  if (pointer === runtime.release) return result('runtime.installed', 'pass', `cua's own runtime ${runtime.release} at ${runtime.root}; current.json names it, the last install that completed here`);
  const names = pointer === null ? 'no release'
    : pointer.unreadable ? `nothing readable (${pointer.unreadable})`
      : pins.some(pin => pin.release === pointer) || /^\d/.test(pointer) ? `the vendor's release ${pointer}, which an older cua's install wrote`
        : `another cua's runtime, ${pointer}`;
  return result('runtime.installed', 'warn', `sessions resolve cua's own runtime ${runtime.release} (${runtime.root}), but current.json names ${names}: `
    + `no install of this cua has completed here, so a part may be missing or another install's; run ${installer}`);
}

function modulesRow(runtime) {
  return caught(() => {
    const {packages, natives} = verifyModuleTree(runtime.root, runtime.record);
    return result('runtime.modules', 'pass', `the module tree at ${runtime.root} verifies: ${packages} packages, each file's digest, and ${natives} native files by SHA-256`);
  }, error => result('runtime.modules', 'fail', `${error.message}; ${moduleRecoveryHint(runtime.root, runtime.release)}`));
}

// The Node a session here runs on (launch.mjs ownHostNode on Linux): CUA_NODE when set, else the managed Node.
function nodeRow({home, env, host, pinned, installer}) {
  const managed = managedNode(home, {host});
  if (env.CUA_NODE) return result('runtime.node', 'warn', `CUA_NODE=${env.CUA_NODE} runs sessions here in place of the pinned Node ${pinned} (a named override; `
    + `${managed.path ? `the installed one is ${managed.version}` : `no Node cua installed is usable here: ${managed.missing}`})`);
  if (managed.missing) return result('runtime.node', 'fail', `no Node cua installed is usable here (${managed.missing}), so every session is refused (runtime_not_installed): `
    + `run ${installer}, or set CUA_NODE to the absolute path of a Node ${NODE_FLOOR} or later`);
  if (Number(managed.version.split('.')[0]) < NODE_FLOOR) return result('runtime.node', 'fail', `the installed Node ${managed.version} at ${managed.path} is older than Node ${NODE_FLOOR}, `
    + `which cua's own host needs, so every session is refused: run ${installer}`);
  if (managed.version === pinned) return result('runtime.node', 'pass', `the pinned Node ${pinned} at ${managed.path}, its bytes the ones its install record names`);
  return result('runtime.node', 'warn', `the installed Node ${managed.version} at ${managed.path} runs sessions here, ${older(managed.version, pinned) ? 'behind' : 'ahead of'} `
    + `this cua's pinned ${pinned}: ${installer} installs the pinned one`);
}

function vendorRow({home, host, pins, installer}) {
  return caught(() => {
    const tree = vendorLinuxRuntime({home, pins, host});
    const manifest = checkVendorManifest(tree.root, tree.manifest);
    if (!manifest.ok) return result('runtime.vendor', 'fail', `the vendor's release ${tree.release} at ${tree.root} is not the pinned one: ${manifest.detail}; `
      + `stop any \`cua serve\` using it, remove ${tree.root}, then run ${installer}`);
    return result('runtime.vendor', 'pass', `the vendor's release ${tree.release} at ${tree.root}, kept for CUA_NATIVE_ENGINE=vendor: installed from its pinned archive `
      + `(its length and SHA-256, the trust root on Linux), every layout path present, ${manifest.detail}`);
  }, error => {
    if (error.code === 'release_not_installed') return result('runtime.vendor', 'skip', `the vendor's release ${error.context.release} is not installed here; `
      + `only CUA_NATIVE_ENGINE=vendor needs it, and ${installer} installs it beside cua's own runtime`);
    if (error.code === 'unsupported_platform') return result('runtime.vendor', 'skip', `${error.message}; only CUA_NATIVE_ENGINE=vendor needs the vendor's tree`);
    return result('runtime.vendor', 'fail', sentence(error));
  });
}
