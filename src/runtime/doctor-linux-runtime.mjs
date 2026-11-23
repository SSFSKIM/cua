// cua doctor's runtime rows on Linux (#171 M6a; docs/doperpowers/specs/2026-10-28-own-linux-engine-m6a-preflight.md
// §4.5): cua's own runtime, which every Linux session resolves, and the vendor's tree in one row beside it.
//
//   platform           the release the record derives (manifest.mjs loadLinuxRuntime, linuxRelease); a record that its
//                      pins contradict fails, and doctor stops there, since nothing resolves without it
//   runtime.installed  every common part and the pointer: `pass` when the module tree this cua's lock names passes the
//                      check a session makes of it (manifest.mjs resolveRuntime, which never reads the pointer), the
//                      Node a session resolves and the sandbox helper are installed, and current.json names this
//                      release (the install writes it once every common part is in place); `warn` when sessions
//                      resolve and current.json names the vendor's release, another runtime or nothing, cannot be read,
//                      or is no file cua wrote (a directory, a link: manifest.mjs pointerObstruction, as install
//                      refuses it), or when the only part missing is a helper CUA_SHIM_SANDBOX=disabled does not run;
//                      `fail` when a part is missing, not cua's, or not whole as a session checks it
//   runtime.modules    the tree's full check (module-tree.mjs verifyModuleTree): every package's digest, every native
//                      file's hash, nothing added; `fail` names the first few that differ
//   runtime.node       the Node a session runs on, as the session resolves it (launch.mjs ownHostNode: CUA_NODE, else
//                      the managed Node, its bytes the recorded ones): `pass` for the pinned managed Node; `warn` for a
//                      managed Node other than the pin, or CUA_NODE in its place; `fail` with the lookup's own refusal
//   runtime.vendor     the vendor's tree (manifest.mjs vendorLinuxRuntime, and its manifest against the pin), kept for
//                      CUA_NATIVE_ENGINE=vendor until M6b: `pass` installed and whole, `skip` absent, `fail` damaged or
//                      its pins unparsable or unreadable (that error stays in this row, naming the pins to restore). It
//                      folds the vendor rows doctor had on Linux
//                      (runtime.files, vendor-manifest, ipc, signatures)
//
// Every `fail`, and every `warn` for a part behind its pin, names the remedy that repairs the home: where an installer
// refuses to replace what is there (a tree or a Node cua did not install as recorded, a pointer that is not a file), the
// exact path to move aside first; then this cua's own installer by its absolute path, with the release it installs
// (manifest.mjs ownInstaller; ruling 1110). Nothing here launches anything.
import {accessSync, constants, lstatSync, realpathSync} from 'node:fs';
import {join} from 'node:path';
import {CuaError} from './errors.mjs';
import {readPointer, realHome} from './layout.mjs';
import {RESTORE_PINS, isRealDirectory, linuxRelease, loadLinuxRuntime, locateRuntime, ownInstaller, pointerObstruction, resolveRuntime, vendorLinuxRuntime} from './manifest.mjs';
import {moduleRecoveryHint, verifyModuleTree} from './module-tree.mjs';
import {managedNode, nodeLayout, nodeMatchesRecord, readNodeRecord} from './managed-node.mjs';
import {checkVendorManifest} from './checks.mjs';

const result = (name, status, detail) => ({name, status, detail});
const sentence = error => (error.hint ? `${error.message}; ${error.hint}` : error.message);
const caught = (run, onError) => { try { return run(); } catch (error) { if (!(error instanceof CuaError)) throw error; return onError(error); } };
const outcome = run => caught(() => ({value: run()}), error => ({refused: error}));
const older = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; };
const present = path => { try { lstatSync(path); return true; } catch { return false; } };
const real = path => { try { return realpathSync(path); } catch { return path; } };
const executable = path => { try { accessSync(path, constants.X_OK); return true; } catch { return false; } };

// -> {rows, runtime, stop}: `runtime` is what sessions resolve (null when they cannot), `stop` that the record itself
// failed. `resolveNode` is the session's Node lookup (doctor's one resolution, shared with repl.host), `linuxHelper` the
// helper's check, `sandbox` the CUA_SHIM_SANDBOX mode (null when invalid), and `pins` the vendor's pins or `pinsError`
// why they could not be loaded. `linuxRuntime` (the record) is a seam for tests.
export function linuxRuntimeChecks({home, env, host, pins, pinsError, resolveNode, linuxHelper, sandbox, linuxRuntime = () => loadLinuxRuntime({host})}) {
  let parts, release;
  const refused = caught(() => { parts = linuxRuntime(); release = linuxRelease(parts, host.arch); return null; }, error => error);
  if (refused) return {rows: [result('platform', 'fail', sentence(refused))], runtime: null, stop: true};
  const installer = `\`${ownInstaller({release}).command}\``;
  const rows = [result('platform', 'pass', `linux-${host.arch}: cua's own runtime ${release}`)];

  const node = outcome(resolveNode);
  const helper = outcome(() => linuxHelper({home: realHome(home), arch: host.arch}));
  // The tree as a session checks it (resolveRuntime), and the tree as recorded, which runtime.modules verifies in full.
  const located = caught(() => locateRuntime({home, host}), error => { rows.push(result('runtime.installed', 'fail', sentence(error))); return null; });
  const refusedTree = located && caught(() => { resolveRuntime({home, host}); return null; }, error => error);
  if (refusedTree) rows.push(result('runtime.installed', 'fail', sentence(refusedTree)));
  else if (located) rows.push(installedRow({runtime: located, pins, release, installer, node, helper, sandbox}));
  const runtime = refusedTree ? null : located;
  rows.push(located ? modulesRow(located) : result('runtime.modules', 'skip', 'no module tree to verify (see runtime.installed)'));
  rows.push(nodeRow({home, env, host, release, pinned: parts.node.version, installer, node}));
  rows.push(vendorRow({home, host, pins, pinsError, installer}));
  return {rows, runtime: runtime && {release: runtime.release, root: runtime.root, paths: runtime.paths, parts}, stop: false};
}

function installedRow({runtime, pins, release, installer, node, helper, sandbox}) {
  const missing = [...(node.refused ? [`its Node: ${node.refused.message}`] : []),
    ...(helper.refused && sandbox !== 'disabled' ? [`its sandbox helper: ${helper.refused.message}`] : [])];
  if (missing.length) return result('runtime.installed', 'fail', `cua's own runtime ${runtime.release} is not whole at ${runtime.root}: ${missing.join('; ')}; `
    + `runtime.node and sandbox.launcher name each part's remedy, and ${installer} installs what is absent`);
  const unrun = helper.refused ? '; its sandbox helper is not installed, which CUA_SHIM_SANDBOX=disabled does not run' : '';
  // What is no file cua wrote, the install refuses to write over, in these same words.
  const blocked = pointerObstruction({home: realHome(runtime.home), release});
  if (blocked) return result('runtime.installed', 'warn', `sessions resolve cua's own runtime ${runtime.release} (${runtime.root})${unrun}, but ${blocked.message}: ${blocked.hint}`);
  let pointer;
  try { pointer = readPointer(realHome(runtime.home)); } catch (error) {
    if (!(error instanceof CuaError) && typeof error?.code !== 'string') throw error;
    pointer = {unreadable: error.message};   // a file that does not parse, or cannot be read: the install replaces it
  }
  if (pointer === runtime.release) return result('runtime.installed', unrun ? 'warn' : 'pass', `cua's own runtime ${runtime.release} at ${runtime.root}: `
    + `its module tree, Node and sandbox helper are installed${unrun ? ' but for the helper' : ''}, and current.json names it, the last install that completed here${unrun}`);
  const names = pointer === null ? 'no release'
    : pointer.unreadable ? `nothing readable (${pointer.unreadable})`
      : (pins ?? []).some(pin => pin.release === pointer) || /^\d/.test(pointer) ? `the vendor's release ${pointer}, which an older cua's install wrote`
        : `another cua's runtime, ${pointer}`;
  return result('runtime.installed', 'warn', `sessions resolve cua's own runtime ${runtime.release} (${runtime.root})${unrun}, but current.json names ${names}: `
    + `no install of this cua has completed here, so a part may be missing or another install's; run ${installer}`);
}

function modulesRow(runtime) {
  return caught(() => {
    const {packages, natives} = verifyModuleTree(runtime.root, runtime.record);
    return result('runtime.modules', 'pass', `the module tree at ${runtime.root} verifies: ${packages} packages, each file's digest, and ${natives} native files by SHA-256`);
  }, error => result('runtime.modules', 'fail', `${error.message}; ${moduleRecoveryHint(runtime.root, runtime.release)}`));
}

// The Node a session here runs on, as the session's own lookup answers (`node`): CUA_NODE when set, else the managed
// Node. A refusal is the lookup's sentence; what node-install refuses to replace (nodeBlockers) is named to be moved
// aside first.
function nodeRow({home, env, host, release, pinned, installer, node}) {
  if (node.refused) {
    const {message, hint} = node.refused;
    if (env.CUA_NODE) return result('runtime.node', 'fail', hint ? `${message}; ${hint}` : message);
    const blocking = nodeBlockers(realHome(home), {version: pinned, ...host});
    if (blocking.length) return result('runtime.node', 'fail', `${message}; it is never repaired in place: stop any \`cua serve\` using it, move ${blocking.join(' and ')} aside, then ${ownInstaller({release}).hint}`);
    // The recorded bytes without their execute bit: node-install keeps that install and refuses it, so its mode first.
    const dir = nodeLayout(realHome(home)).version(pinned);
    const bin = join(dir, 'bin', 'node');
    if (present(bin) && !executable(bin)) return result('runtime.node', 'fail', `${message}; ${bin} is not executable, and the installer never repairs it in place: `
      + `restore its mode with \`chmod 755 ${bin}\`, or stop any \`cua serve\` using it, move ${dir} aside, then ${ownInstaller({release}).hint}`);
    return result('runtime.node', 'fail', hint ? `${message}; ${hint}` : `${message}; run ${installer}`);
  }
  if (env.CUA_NODE) return result('runtime.node', 'warn', `CUA_NODE=${env.CUA_NODE} (${node.value}) runs sessions here in place of the pinned Node ${pinned}, a named override`);
  const managed = managedNode(home, {host});
  if (!managed.path || real(managed.path) !== node.value) return result('runtime.node', 'warn', `sessions here run the Node at ${node.value}, not one cua installed: ${installer} installs the pinned ${pinned}`);
  if (managed.version === pinned) return result('runtime.node', 'pass', `the pinned Node ${pinned} at ${managed.path}, its bytes the ones its install record names`);
  return result('runtime.node', 'warn', `the installed Node ${managed.version} at ${managed.path} runs sessions here, ${older(managed.version, pinned) ? 'behind' : 'ahead of'} `
    + `this cua's pinned ${pinned}: ${installer} installs the pinned one`);
}

// What node-install (node-install.mjs) refuses to replace in the real home `home`, for the pinned `version`: a node/
// that is not a directory, a node/current.json that is not a file (its stagePointer), and a node/<version> that is not
// that version's recorded install whose bin/node is the recorded bytes (it is never repaired in place).
function nodeBlockers(home, {version, platform, arch}) {
  const {root, pointer, version: dirOf} = nodeLayout(home);
  if (present(root) && !isRealDirectory(root)) return [root];
  const pointerStat = (() => { try { return lstatSync(pointer); } catch { return null; } })();
  const dir = dirOf(version);
  const record = isRealDirectory(dir) ? readNodeRecord(dir, {version, platform, arch}) : null;
  return [...(pointerStat && !pointerStat.isFile() ? [pointer] : []), ...(present(dir) && !(record && nodeMatchesRecord(dir, record)) ? [dir] : [])];
}

function vendorRow({home, host, pins, pinsError, installer}) {
  if (pinsError) return result('runtime.vendor', 'fail', `${sentence(pinsError)}; ${RESTORE_PINS}, then run ${installer}; only CUA_NATIVE_ENGINE=vendor needs the vendor's tree`);
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
