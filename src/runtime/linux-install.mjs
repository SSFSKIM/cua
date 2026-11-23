// `cua install` on Linux (#171 M6a; docs/doperpowers/specs/2026-10-28-own-linux-engine-m6a-preflight.md §4.1, ruled F4):
// cua's own runtime first, so a browser-only session needs nothing from either engine's server, then each engine's lane
// on its own.
//
//   1. the record (manifest.mjs loadLinuxRuntime): a checkout whose record and pins disagree refuses here, before
//      anything is fetched, and the release it derives names everything below;
//   2. the module tree (module-tree.mjs installModuleTree; `--modules-dir` takes local copies of its tarballs);
//   3. the sandbox helper (install.mjs installSandboxHelper; `--sandbox-helper` takes a local copy);
//   4. Node (node-install.mjs; `--node-archive` takes a local copy, `--no-node` places none, and the home's sessions then
//      need CUA_NODE);
//   5. the pointer, current.json, to the derived release once 2 to 4 are in place, else left as it was. It records what
//      the last install completed and selects nothing on Linux (§4.3), so an older cua's vendor name there is migrated;
//   6. cua's engine (install.mjs installLinuxEngine);
//   7. the vendor's tree (install.mjs installRuntime, which leaves the pointer alone here), kept for
//      CUA_NATIVE_ENGINE=vendor until M6b; `--archive` takes the deb, `--release` names a vendor release;
//   8. the Codex CLI's leftovers, as before: removed with `--prune-leftovers`, else named.
//
// Every step is attempted whatever happened before. The command fails when a common part (2 to 4) failed, or when a lane
// the home asks for failed: cua's when the effective engine setting names cua's engine (CUA_NATIVE_ENGINE, else
// engine.json's `engine`, else the default, launch.mjs nativeEngineSetting) or `--engine` is given, the vendor's when the
// setting names it or `--archive` or `--release` is given. A lane nobody asked for that fails is said in one line and in
// the report, and the command succeeds. The last line says which sessions open now.
//
// The report (`--json`): {ok, release, changed, modules, sandboxHelper, node, pointer: {previous, current, changed},
// engine, vendor: {release, root, changed, source}, sessions: {browser, cua, vendor}, codexLeftovers?, error?}, where a
// step that failed is {failed: {code, message, hint?}} and `error` is the first failure that fails the command, its
// remedy naming this cua's own installer by its absolute path (manifest.mjs ownInstaller, F9).
import {CuaError} from './errors.mjs';
import {readPointer, realHome, writePointer} from './layout.mjs';
import {findPin, linuxRelease, loadLinuxRuntime, loadPins, ownInstaller, selectPin} from './manifest.mjs';
import {installModuleTree} from './module-tree.mjs';
import {installLinuxEngine, installRuntime, installSandboxHelper} from './install.mjs';
import {installNode} from './node-install.mjs';
import {loadNodePins, nodeDistName, selectNodePin} from './managed-node.mjs';
import {loadEnginePin} from './linux-engine.mjs';
import {nativeEngineSetting} from './launch.mjs';
import {describeLeftovers, describeRemoval, findCodexLeftovers, removeCodexLeftovers} from './codex-leftovers.mjs';

const failure = (error, code) => (error instanceof CuaError
  ? {code: error.code, message: error.message, ...(error.hint ? {hint: error.hint} : {})}
  : {code, message: `${error.code ?? 'error'}: ${error.message}`});
// A step's outcome: what it returned, or {failed} with what went wrong.
const attempt = async (run, code) => { try { return await run(); } catch (error) { return {failed: failure(error, code)}; } };

// The lanes the home asks for (the header): the effective engine setting, and the flags. A setting that cannot be read
// asks for neither; every computer session is refused by it, and doctor says why.
function requestedLanes(values, env) {
  let engine = null;
  try { engine = nativeEngineSetting({env, platform: 'linux'}).engine; } catch (error) { if (!(error instanceof CuaError)) throw error; }
  return {cua: values.engine === true || engine === 'cua', vendor: values.archive !== undefined || values.release !== undefined || engine === 'vendor'};
}

// -> {ok, report, error}. `say` prints a line of the human output, `progress` a progress line (stderr). The installers,
// the pins, the record and the host are seams for tests (cli.mjs passes its own `deps`).
export async function installLinux({values, home, env = process.env, host = {platform: 'linux', arch: process.arch}, say = () => {}, progress = () => {}, onProgress,
  linuxRuntime = () => loadLinuxRuntime({host}), installModules = installModuleTree, installHelper = installSandboxHelper, installNode: nodeInstaller = installNode,
  installEngine = installLinuxEngine, installRuntime: vendorInstaller = installRuntime, enginePin = loadEnginePin, pins: pinsOf = loadPins, nodePins = loadNodePins}) {
  const release = linuxRelease(linuxRuntime(), host.arch);
  const installer = ownInstaller({release});
  const again = `run \`${installer.command}\` again`;
  // A vendor release named by --release must be one this cua pins: refused here, before anything is fetched.
  const vendorPin = values.release === undefined ? null : findPin(pinsOf(), values.release);
  const requested = requestedLanes(values, env);
  progress(`installing cua's Linux runtime ${release}`);

  // 2-4: the common parts.
  const modules = await attempt(() => installModules({home, dir: values['modules-dir']}), 'module_tree_install_failed');
  say(modules.failed ? `cua's module tree was not installed: ${modules.failed.message} (${modules.failed.code})`
    : modules.changed ? `installed cua's module tree at ${modules.root}` : `cua's module tree is already installed and verified at ${modules.root}`);

  const sandboxHelper = await attempt(() => installHelper({home, path: values['sandbox-helper'], onProgress}), 'sandbox_helper_install_failed');
  say(sandboxHelper.failed ? `cua's sandbox helper was not installed: ${sandboxHelper.failed.message} (${sandboxHelper.failed.code})`
    : sandboxHelper.changed ? `installed cua's sandbox helper at ${sandboxHelper.path}` : `cua's sandbox helper is already installed and verified at ${sandboxHelper.path}`);

  const nodePin = values['no-node'] ? null : selectNodePin(nodePins(), host);
  let node;
  if (!nodePin) {
    node = {skipped: values['no-node'] ? 'no_node' : 'unpinned'};
    say(values['no-node'] ? 'skipped the pinned Node (--no-node): sessions here run on CUA_NODE, and are refused without it'
      : `no Node is pinned for linux-${host.arch}: sessions here run on CUA_NODE, and are refused without it`);
  } else {
    progress(`installing Node ${nodePin.version} for cua's own REPL host from ${values['node-archive'] ?? nodePin.archive.url}`);
    node = await attempt(() => nodeInstaller({home, pin: nodePin, archivePath: values['node-archive'], onProgress}), 'node_install_failed');
    say(node.failed ? `Node ${nodePin.version} for cua's own REPL host was not installed: ${node.failed.message} (${node.failed.code})`
      : node.changed ? `installed Node ${node.version} for cua's own REPL host at ${node.root}`
        : `Node ${node.version} for cua's own REPL host is already installed and verified at ${node.root}${node.activated ? '; it is the active one again' : ''}`);
  }
  const common = [['cua\'s module tree', modules, again],
    ['cua\'s sandbox helper', sandboxHelper, `${again}, or pass --sandbox-helper <file> with the pinned asset`],
    [`Node ${nodePin?.version} for cua's own REPL host`, node, nodePin && `${again}, pass --node-archive <${nodeDistName(nodePin)}.tar.gz> with the pinned tarball, or pass --no-node and set CUA_NODE`]];
  const commonFailed = common.filter(([, outcome]) => outcome.failed);

  // 5: the pointer.
  const pointer = await attempt(() => movePointer(home, release, commonFailed.length === 0), 'activation_failed');
  say(pointer.failed ? `current.json could not be written: ${pointer.failed.message}`
    : !pointer.changed ? (pointer.current === release ? `current.json names ${release} already` : `current.json is left as it was (${pointer.current ?? 'none'}): a common part was not installed`)
      : `current.json now names ${release}, cua's own runtime${pointer.previous ? ` (it named ${pointer.previous})` : ''}`);

  // 6: cua's engine.
  const engine = await attempt(() => installEngine({home, pin: enginePin()}), 'linux_engine_install_failed');
  say(engine.failed ? `cua's Linux engine was not installed: ${engine.failed.message} (${engine.failed.code})${requested.cua ? '' : '; only sessions on cua\'s engine need it, and this home does not select it'}`
    : engine.changed ? `installed cua's Linux engine ${engine.version} (${engine.release}) at ${engine.path}`
      : `cua's Linux engine ${engine.version} (${engine.release}) is already installed and verified at ${engine.path}`);

  // 7: the vendor's tree.
  let vendorRelease = vendorPin?.release;
  const vendor = await attempt(async () => {
    const manifest = vendorPin ?? selectPin(pinsOf(), host);
    vendorRelease = manifest.release;
    progress(`installing the vendor's release ${manifest.release} from ${values.archive ?? manifest.archive.url}`);
    const placed = await vendorInstaller({home, manifest, archivePath: values.archive, onProgress, activate: false});
    return {release: placed.release, root: placed.root, changed: placed.changed, source: placed.record.source};
  }, 'vendor_install_failed');
  const vendorName = `the vendor's release${vendorRelease ? ` ${vendorRelease}` : ''}`;
  say(vendor.failed ? `${vendorName} was not installed: ${vendor.failed.message} (${vendor.failed.code})${requested.vendor ? '' : '; only CUA_NATIVE_ENGINE=vendor needs it, and this home does not select it'}`
    : vendor.changed ? `installed ${vendorName} at ${vendor.root}, kept for CUA_NATIVE_ENGINE=vendor`
      : `${vendorName} is already installed and verified at ${vendor.root}, kept for CUA_NATIVE_ENGINE=vendor`);

  // 8: the Codex CLI's leftovers.
  let codexLeftovers = null;
  if (values['prune-leftovers']) codexLeftovers = await attempt(() => removeCodexLeftovers({home, pins: pinsOf()}), 'prune_failed');
  if (codexLeftovers && !codexLeftovers.failed) for (const line of describeRemoval(codexLeftovers)) say(line);
  else if (!codexLeftovers) for (const line of describeLeftovers(findCodexLeftovers({home, pins: pinsOf()}))) say(line);

  // The pointer selects nothing (§4.3): what opens follows the parts alone.
  const browser = commonFailed.length === 0;
  const sessions = {browser, cua: browser && !engine.failed, vendor: browser && !vendor.failed};
  say(opensNow(sessions, node));

  const fatal = [
    ...commonFailed.map(([what, outcome, remedy]) => [`${what} was not installed`, outcome.failed, remedy]),
    ...(pointer.failed ? [['current.json could not be written', pointer.failed, again]] : []),
    ...(requested.cua && engine.failed ? [['cua\'s Linux engine was not installed', engine.failed, `run \`${installer.command} --engine\` again`]] : []),
    ...(requested.vendor && vendor.failed ? [[`${vendorName} was not installed`, vendor.failed, `${again} with its server reachable, or pass --archive <ChatGPT deb> with the pinned deb`]] : []),
    ...(codexLeftovers?.failed ? [['the Codex CLI\'s leftovers were not removed', codexLeftovers.failed, again]] : []),
  ];
  const error = fatal.length ? errorOf(fatal[0]) : undefined;
  const changed = [modules, sandboxHelper, node, pointer].some(outcome => outcome.changed === true);
  const report = {ok: !error, release, changed, modules, sandboxHelper, node, pointer, engine, vendor, sessions,
    ...(codexLeftovers ? {codexLeftovers} : {}), ...(error ? {error} : {})};
  return {ok: !error, report, error};
}

const errorOf = ([what, failed, remedy]) => ({code: failed.code, message: `${what}: ${failed.message}`, hint: failed.hint ? `${failed.hint}; ${remedy}` : remedy});

// Writes the pointer to `release` when the common parts are in place (`complete`) and it names something else ->
// {previous, current, changed}. A pointer that cannot be read is replaced like any other.
function movePointer(home, release, complete) {
  const real = realHome(home, {create: true});
  let previous;
  try { previous = readPointer(real); } catch (error) { if (!(error instanceof CuaError)) throw error; previous = 'unreadable'; }
  if (!complete || previous === release) return {previous, current: previous, changed: false};
  writePointer(real, release);
  return {previous, current: release, changed: true};
}

// The last line: which sessions open now.
function opensNow({browser, cua, vendor}, node) {
  if (!browser) return 'opens now: nothing, since a common part is missing (above): every session needs it';
  const head = node.skipped ? `opens now, each with CUA_NODE (${node.skipped === 'no_node' ? '--no-node placed no Node' : 'no Node is pinned here'}): ` : 'opens now: ';
  const vendorWords = 'the vendor\'s (CUA_NATIVE_ENGINE=vendor)';
  const computer = cua && vendor ? `computer sessions on cua's engine, and on ${vendorWords}`
    : cua ? `computer sessions on cua's engine; not on ${vendorWords}: its release is not installed`
      : vendor ? `computer sessions on ${vendorWords}; not on cua's engine: it is not installed`
        : 'no computer session: neither engine is installed';
  return `${head}browser-only sessions, ${computer}`;
}
