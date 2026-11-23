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
// the report, and the command succeeds.
//
// Apart from that accounting, the install ends by resolving which sessions open as `cua serve` would open them
// (`sessions`), by what is installed and set: `cua serve`'s settings (server.mjs settingsFrom), the runtime (manifest.mjs
// resolveRuntime), the REPL host's selection (launch.mjs replHostFor: CUA_REPL_HOST, the Node, and for a computer session
// the engine, CUA_LINUX_ENGINE_BIN honoured), the device mode cua's engine runs in (desktopModeFor) and, unless
// CUA_SHIM_SANDBOX=disabled, the sandbox helper. A computer session is resolved on the engine the setting selects, and
// on the other engine under its override (CUA_NATIVE_ENGINE), which is said as an override, never as what opens. What a
// session needs of the machine (the desktop, bubblewrap's user namespaces) is doctor's to say. Each refusal is reported
// in its own words, with this cua's remedies; the last line says it.
//
// The report (`--json`): {ok, release, changed, modules, sandboxHelper, node, pointer: {previous, current, changed},
// engine, vendor: {release, root, changed, source}, sessions: {browser, computer, engine, alternate: {engine, override,
// opens} | null, why: {browser?, computer?, alternate?}}, codexLeftovers?, error?}, where a step that failed is {failed:
// {code, message, hint?}}, `changed` is whether any step changed anything, `sessions.engine` the engine the setting
// selects (null when it cannot be read), `why` the refusal of each session that does not open, and `error` the first
// failure that fails the command, its remedy naming this cua's own installer by its absolute path (manifest.mjs
// ownInstaller, F9). The vendor's pins are read inside the vendor's lane and selection only (manifest.mjs vendorPinsOf):
// pins this checkout cannot parse or read fail those, naming the pins to restore, and the leftovers scan goes on without
// the release trees they name.
import {readFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {CuaError, fail} from './errors.mjs';
import {readPointer, realHome, writePointer} from './layout.mjs';
import {RESTORE_PINS, findPin, linuxRelease, loadLinuxRuntime, loadPins, ownInstaller, pointerObstruction, resolveRuntime, selectPin, vendorLinuxRuntime, vendorPinsOf} from './manifest.mjs';
import {installModuleTree} from './module-tree.mjs';
import {installLinuxEngine, installRuntime, installSandboxHelper} from './install.mjs';
import {installNode} from './node-install.mjs';
import {loadNodePins, nodeDistName, selectNodePin} from './managed-node.mjs';
import {loadEnginePin} from './linux-engine.mjs';
import {desktopModeFor, nativeEngineSetting, ownHostNode, replHostFor} from './launch.mjs';
import {settingsFrom} from '../mcp/server.mjs';
import {configuredBackends} from '../chrome/client-mode.mjs';
import {helperFor, sha256Of} from '../sandbox/linux.mjs';
import {installedLinuxHelper} from './sandbox.mjs';
import {describeLeftovers, describeRemoval, findCodexLeftovers, removeCodexLeftovers} from './codex-leftovers.mjs';

const failure = (error, code) => (error instanceof CuaError
  ? {code: error.code, message: error.message, ...(error.hint ? {hint: error.hint} : {})}
  : {code, message: `${error.code ?? 'error'}: ${error.message}`});
// A step's outcome: what it returned, or {failed} with what went wrong.
const attempt = async (run, code) => { try { return await run(); } catch (error) { return {failed: failure(error, code)}; } };
const refusal = error => ({code: error.code, message: error.message, ...(error.hint ? {hint: error.hint} : {})});

// The lanes the home asks for (the header): the effective engine setting, and the flags. A setting that cannot be read
// asks for neither; every computer session is refused by it, and doctor says why.
function requestedLanes(values, env) {
  let engine = null;
  try { engine = nativeEngineSetting({env, platform: 'linux'}).engine; } catch (error) { if (!(error instanceof CuaError)) throw error; }
  return {cua: values.engine === true || engine === 'cua', vendor: values.archive !== undefined || values.release !== undefined || engine === 'vendor'};
}

// -> {ok, report, error}. `say` prints a line of the human output, `progress` a progress line (stderr). The installers,
// the pins, the record and the host are seams for tests (cli.mjs passes its own `deps`), as are the session's Node
// lookup, the helper's check and the engine selection's inputs (`engine`, launch.mjs nativeEngineFor's).
export async function installLinux({values, home, env = process.env, host = {platform: 'linux', arch: process.arch}, say = () => {}, progress = () => {}, onProgress,
  linuxRuntime = () => loadLinuxRuntime({host}), installModules = installModuleTree, installHelper = installSandboxHelper, installNode: nodeInstaller = installNode,
  installEngine = installLinuxEngine, installRuntime: vendorInstaller = installRuntime, enginePin = loadEnginePin, pins: loadVendorPins = loadPins, nodePins = loadNodePins,
  resolveOwnNode = () => ownHostNode({ambient: env, home, platform: 'linux', arch: host.arch}), linuxHelper = installedLinuxHelper, engine: engineInputs}) {
  const pinsOf = () => vendorPinsOf(loadVendorPins);
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
  else if (!codexLeftovers) {
    let pins = [];   // pins this checkout cannot load failed the vendor's lane above; the scan names no release tree then
    try { pins = pinsOf(); } catch (error) { if (!(error instanceof CuaError)) throw error; }
    for (const line of describeLeftovers(findCodexLeftovers({home, pins}))) say(line);
  }

  // A vendor selection finds the vendor's tree by the same pins, read as the lane reads them.
  const selection = {vendor: ({home: at, host: on}) => vendorLinuxRuntime({home: at, host: on, pins: pinsOf()}), ...engineInputs};
  const sessions = readiness({home, env, host, installer, resolveOwnNode, linuxHelper, engine: selection});
  say(opensNow(sessions, env));

  const fatal = [
    ...commonFailed.map(([what, outcome, remedy]) => [`${what} was not installed`, outcome.failed, remedy]),
    ...(pointer.failed ? [['current.json could not be written', pointer.failed, pointer.failed.hint ? null : again]] : []),
    ...(requested.cua && engine.failed ? [['cua\'s Linux engine was not installed', engine.failed, `run \`${installer.command} --engine\` again`]] : []),
    ...(requested.vendor && vendor.failed ? [[`${vendorName} was not installed`, vendor.failed, PIN_ERRORS.includes(vendor.failed.code) ? `${RESTORE_PINS}, then ${again}`
      : `${again} with its server reachable, or pass --archive <ChatGPT deb> with the pinned deb`]] : []),
    ...(codexLeftovers?.failed ? [['the Codex CLI\'s leftovers were not removed', codexLeftovers.failed, again]] : []),
  ];
  const error = fatal.length ? errorOf(fatal[0]) : undefined;
  const changed = [modules, sandboxHelper, node, pointer, engine, vendor].some(outcome => outcome.changed === true);
  const report = {ok: !error, release, changed, modules, sandboxHelper, node, pointer, engine, vendor, sessions,
    ...(codexLeftovers ? {codexLeftovers} : {}), ...(error ? {error} : {})};
  return {ok: !error, report, error};
}

const PIN_ERRORS = ['invalid_pin', 'pins_unavailable'];
const errorOf = ([what, failed, remedy]) => ({code: failed.code, message: `${what}: ${failed.message}`, hint: [failed.hint, remedy].filter(Boolean).join('; ')});

// Writes the pointer to `release` when the common parts are in place (`complete`) and it names something else ->
// {previous, current, changed}. A pointer file that cannot be parsed or read is replaced like any other; anything else at
// its path is refused as doctor names it (manifest.mjs pointerObstruction).
function movePointer(home, release, complete) {
  const real = realHome(home, {create: true});
  const blocked = pointerObstruction({home: real, release});
  if (blocked) fail(blocked.code, blocked.message, {hint: blocked.hint});
  let previous;
  try { previous = readPointer(real); } catch (error) { if (!(error instanceof CuaError) && typeof error?.code !== 'string') throw error; previous = 'unreadable'; }
  if (!complete || previous === release) return {previous, current: previous, changed: false};
  writePointer(real, release);
  return {previous, current: release, changed: true};
}

// Which sessions open, resolved as `cua serve` resolves them (the header) -> {browser, computer, engine, alternate, why}.
// A computer session needs what a browser-only one needs first, but CUA_BROWSER_BACKENDS, which only the browser reads.
function readiness({home, env, host, installer, resolveOwnNode, linuxHelper, engine}) {
  const why = {};
  const opens = (name, run) => {
    try { run(); return true; } catch (error) { if (!(error instanceof CuaError)) throw error; why[name] = refusal(error); return false; }
  };
  const node = once(resolveOwnNode);   // a connection resolves its Node once
  const select = (ambient, surfaces) => replHostFor({platform: 'linux', arch: host.arch, surfaces, ambient, home, resolveOwnNode: node, engine});
  let selected = null;
  try { selected = nativeEngineSetting({env, platform: 'linux'}).engine; } catch (error) { if (!(error instanceof CuaError)) throw error; }
  const common = opens('browser', () => {
    const {sandbox} = settingsFrom(env, {platform: 'linux'});
    resolveRuntime({home, host});
    select(env, ['browser']);
    if (sandbox !== 'disabled') checkedHelper({home, host, linuxHelper, installer});
  });
  if (!common) return {browser: false, computer: false, engine: selected, alternate: null, why};
  // serve refuses a CUA_BROWSER_BACKENDS it cannot use when the browser is among its surfaces, and only then.
  const browser = opens('browser', () => configuredBackends(env));
  const computerOn = ambient => () => {
    const chosen = select(ambient, ['computer']).engine;
    if (chosen.engine === 'cua') desktopModeFor({env: ambient});
  };
  const computer = opens('computer', computerOn(env));
  const other = selected && (selected === 'cua' ? 'vendor' : 'cua');
  const alternate = other ? {engine: other, override: `CUA_NATIVE_ENGINE=${other}`, opens: opens('alternate', computerOn({...env, CUA_NATIVE_ENGINE: other}))} : null;
  return {browser, computer, engine: selected, alternate, why};
}

const once = resolve => {
  let outcome;
  return () => {
    outcome ??= (() => { try { return {value: resolve()}; } catch (error) { return {error}; } })();
    if (outcome.error) throw outcome.error;
    return outcome.value;
  };
};

// The helper's check, its refusal remedied by this cua's installer with its release (the check's own remedy names a bare
// `cua install`). What is at the helper's path and is not the pinned helper is never replaced by the install, so it is
// named to be moved aside first; an absent helper, or the pinned one without its mode, the install places or restores.
function checkedHelper({home, host, linuxHelper, installer}) {
  try { linuxHelper({home: realHome(home), arch: host.arch}); } catch (error) {
    if (!(error instanceof CuaError)) throw error;
    // A link into the vendor's tree is named as the check names it, and what it leads to is never read here either.
    if (error.context?.blocking) throw new CuaError(error.code, error.message, {hint: `stop any \`cua serve\` using it, move ${error.context.blocking} aside, then ${installer.hint}`});
    const {path, sha256} = helperFor({home: realHome(home), arch: host.arch});
    let foreign;
    try { foreign = sha256Of(readFileSync(path)) !== sha256; } catch (cause) { foreign = cause.code !== 'ENOENT'; }
    throw new CuaError(error.code, error.message, {hint: foreign ? `stop any \`cua serve\` using it, move ${dirname(path)} aside, then ${installer.hint}`
      : `${installer.hint}, or set CUA_SHIM_SANDBOX=disabled to run without a sandbox openly`});
  }
}

// The last line: which sessions open, each refusal in its own words, the other engine's under its override.
const SAID = 'sessions here, by what is installed and set: ';
function opensNow({browser, computer, engine, alternate, why}, env) {
  const words = ({code, message, hint}) => `${message} (${code})${hint ? `; ${hint}` : ''}`;
  const label = name => (name === 'cua' ? 'cua\'s engine' : 'the vendor\'s engine');
  if (!browser) return `${SAID}no session opens: ${words(why.browser)}`;
  const parts = [`browser-only sessions open${env.CUA_NODE ? ` on CUA_NODE=${env.CUA_NODE}` : ''}`,
    !engine ? `no computer session opens: ${words(why.computer)}`
      : computer ? `computer sessions open on ${label(engine)}, which this home selects`
        : `computer sessions on ${label(engine)}, which this home selects, do not open: ${words(why.computer)}`];
  if (alternate) parts.push(alternate.opens ? `with ${alternate.override} they would open on ${label(alternate.engine)}`
    : `${alternate.override} would not open them on ${label(alternate.engine)}: ${words(why.alternate)}`);
  return SAID + parts.join('; ');
}
