// `cua install` on Linux (#171 M6a; docs/doperpowers/specs/2026-10-28-own-linux-engine-m6a-preflight.md §4.1, ruled F4;
// M6b's pre-flight, §2.2 and §3.5): cua's own runtime first, so a browser-only session needs nothing from the engine's
// server, then cua's engine on its own.
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
//   7. the vendor's release an older cua's install placed, reported and left in place (retired-tree.mjs: one sentence
//      per release whose install record says cua placed it, with its path and size; M6b's pre-flight §3);
//   8. the Codex CLI's leftovers in the home's state/codex: removed with `--prune-leftovers`, else named. Nothing inside a
//      release is looked at (N4).
// Nothing of the vendor's is fetched or placed: cua 0.30.0 retired its engine on Linux (M6b), and `--archive` and
// `--release` are usage errors here (cli.mjs). Every lane that acquires a part refuses a staging/ that is a link before it
// touches it (vendor-tree.mjs stagingOutsideVendorTree), so nothing is created, unpacked or removed inside the tree.
//
// Every step is attempted whatever happened before. The command fails when a common part (2 to 4) failed, or when the
// engine failed and the home asks for it: when the effective engine setting (CUA_NATIVE_ENGINE, else engine.json's
// `engine`, else the default, launch.mjs nativeEngineSetting) names cua's engine, or the vendor's, whose home needs
// cua's once the setting is undone, or when `--engine` is given. An engine nobody asked for that fails is said in one
// line and in the report, and the command succeeds. A vendor selection fails the command too, last (F10): once every
// step ran, and only when none failed the command, its error is engine_retired, its sentence ending with what to undo
// and that the install otherwise completed (launch.mjs retiredEngine), and promising nothing of the next open.
//
// Apart from that accounting, the install ends by resolving which sessions open as `cua serve` would open them
// (`sessions`), by what is installed and set: `cua serve`'s settings (server.mjs settingsFrom), the runtime (manifest.mjs
// resolveRuntime), the REPL host's selection (launch.mjs replHostFor: CUA_REPL_HOST, the Node, and for a computer session
// the engine, CUA_LINUX_ENGINE_BIN honoured), the device mode cua's engine runs in (desktopModeFor) and, unless
// CUA_SHIM_SANDBOX=disabled, the sandbox helper. What a session needs of the machine (the desktop, bubblewrap's user
// namespaces) is doctor's to say. Each refusal is reported in its own words, with this cua's remedies; the last line says
// it.
//
// The report (`--json`): {ok, release, changed, modules, sandboxHelper, node, pointer: {previous, current, changed},
// engine, retired, sessions: {browser, computer, engine, why: {browser?, computer?}}, codexLeftovers?, error?}, where a
// step that failed is {failed: {code, message, hint?}}, `changed` is whether any step changed anything, `retired` the
// vendor's releases step 7 names ([{release, path, bytes, installedAt, source}], which never set `changed`),
// `sessions.engine` the engine the setting selects (null when it cannot be read), `why` the refusal of each session
// that does not open, and `error` the first failure that fails the command, its remedy naming this cua's own installer
// by its absolute path (manifest.mjs ownInstaller, F9), else a vendor selection's. No vendor pin is read.
import {readFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {CuaError, fail} from './errors.mjs';
import {readPointer, realHome, writePointer} from './layout.mjs';
import {linuxRelease, loadLinuxRuntime, ownInstaller, pointerObstruction, resolveRuntime} from './manifest.mjs';
import {installModuleTree} from './module-tree.mjs';
import {installLinuxEngine, installSandboxHelper} from './install.mjs';
import {installNode} from './node-install.mjs';
import {loadNodePins, nodeDistName, selectNodePin} from './managed-node.mjs';
import {loadEnginePin} from './linux-engine.mjs';
import {desktopModeFor, nativeEngineSetting, ownHostNode, replHostFor, retiredEngine} from './launch.mjs';
import {settingsFrom} from '../mcp/server.mjs';
import {configuredBackends} from '../chrome/client-mode.mjs';
import {helperFor, sha256Of} from '../sandbox/linux.mjs';
import {installedLinuxHelper} from './sandbox.mjs';
import {describeLeftovers, describeRemoval, findCodexLeftovers, removeCodexLeftovers} from './codex-leftovers.mjs';
import {retiredTrees} from './retired-tree.mjs';

const failure = (error, code) => (error instanceof CuaError
  ? {code: error.code, message: error.message, ...(error.hint ? {hint: error.hint} : {})}
  : {code, message: `${error.code ?? 'error'}: ${error.message}`});
// A step's outcome: what it returned, or {failed} with what went wrong.
const attempt = async (run, code) => { try { return await run(); } catch (error) { return {failed: failure(error, code)}; } };
const refusal = error => ({code: error.code, message: error.message, ...(error.hint ? {hint: error.hint} : {})});

// The engine setting this home has (the header): {engine, reason}, or null when it cannot be read; every computer
// session is refused by such a setting, and doctor says why.
function settingOf(env) {
  try { return nativeEngineSetting({env, platform: 'linux'}); } catch (error) { if (!(error instanceof CuaError)) throw error; return null; }
}

// -> {ok, report, error}. `say` prints a line of the human output, `progress` a progress line (stderr). The installers,
// the pins, the record and the host are seams for tests (cli.mjs passes its own `deps`), as are the session's Node
// lookup, the helper's check, the engine selection's inputs (`engine`, launch.mjs nativeEngineFor's) and step 7's
// report (`retired`).
export async function installLinux({values, home, env = process.env, host = {platform: 'linux', arch: process.arch}, say = () => {}, progress = () => {}, onProgress,
  linuxRuntime = () => loadLinuxRuntime({host}), installModules = installModuleTree, installHelper = installSandboxHelper, installNode: nodeInstaller = installNode,
  installEngine = installLinuxEngine, enginePin = loadEnginePin, nodePins = loadNodePins,
  resolveOwnNode = () => ownHostNode({ambient: env, home, platform: 'linux', arch: host.arch}), linuxHelper = installedLinuxHelper, engine: engineInputs,
  retired: findRetired = retiredTrees}) {
  const release = linuxRelease(linuxRuntime(), host.arch);
  const installer = ownInstaller({release});
  const again = `run \`${installer.command}\` again`;
  const setting = settingOf(env);
  // A vendor selection asks for cua's engine too: undoing it leaves the default, cua's (F10).
  const engineAsked = values.engine === true || setting !== null;
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
  say(engine.failed ? `cua's Linux engine was not installed: ${engine.failed.message} (${engine.failed.code})${engineAsked ? '' : '; only sessions on cua\'s engine need it, and this home does not select it'}`
    : engine.changed ? `installed cua's Linux engine ${engine.version} (${engine.release}) at ${engine.path}`
      : `cua's Linux engine ${engine.version} (${engine.release}) is already installed and verified at ${engine.path}`);

  // 7: the vendor's release, reported (M6b, 1216): nothing there is changed.
  const retired = findRetired({home});
  for (const line of retired.lines) say(line);

  // 8: the Codex CLI's leftovers, in state/codex only (N4).
  let codexLeftovers = null;
  if (values['prune-leftovers']) codexLeftovers = await attempt(() => removeCodexLeftovers({home}), 'prune_failed');
  if (codexLeftovers && !codexLeftovers.failed) for (const line of describeRemoval(codexLeftovers)) say(line);
  else if (!codexLeftovers) for (const line of describeLeftovers(findCodexLeftovers({home}))) say(line);

  const sessions = readiness({home, env, host, installer, resolveOwnNode, linuxHelper, engine: engineInputs});
  say(opensNow(sessions, env));

  const fatal = [
    ...commonFailed.map(([what, outcome, remedy]) => [`${what} was not installed`, outcome.failed, remedy]),
    ...(pointer.failed ? [['current.json could not be written', pointer.failed, pointer.failed.hint ? null : again]] : []),
    ...(engineAsked && engine.failed ? [['cua\'s Linux engine was not installed', engine.failed, `run \`${installer.command} --engine\` again`]] : []),
    ...(codexLeftovers?.failed ? [['the Codex CLI\'s leftovers were not removed', codexLeftovers.failed, again]] : []),
  ];
  // F10: a vendor selection fails an install that otherwise completed, and says so; a failed step's error comes first.
  const error = fatal.length ? errorOf(fatal[0])
    : setting?.engine === 'vendor' ? retiredEngine({setting, env, cuaHome: () => realHome(home), after: 'install'}) : undefined;
  const changed = [modules, sandboxHelper, node, pointer, engine].some(outcome => outcome.changed === true);
  const report = {ok: !error, release, changed, modules, sandboxHelper, node, pointer, engine, retired: retired.trees, sessions,
    ...(codexLeftovers ? {codexLeftovers} : {}), ...(error ? {error} : {})};
  return {ok: !error, report, error};
}

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

// Which sessions open, resolved as `cua serve` resolves them (the header) -> {browser, computer, engine, why}. A
// computer session needs what a browser-only one needs first, but CUA_BROWSER_BACKENDS, which only the browser reads.
function readiness({home, env, host, installer, resolveOwnNode, linuxHelper, engine}) {
  const why = {};
  const opens = (name, run) => {
    try { run(); return true; } catch (error) { if (!(error instanceof CuaError)) throw error; why[name] = refusal(error); return false; }
  };
  const node = once(resolveOwnNode);   // a connection resolves its Node once
  const select = (ambient, surfaces) => replHostFor({platform: 'linux', arch: host.arch, surfaces, ambient, home, resolveOwnNode: node, engine});
  const setting = settingOf(env);
  const selected = setting?.engine ?? null;
  const common = opens('browser', () => {
    const {sandbox} = settingsFrom(env, {platform: 'linux'});
    resolveRuntime({home, host});
    select(env, ['browser']);
    if (sandbox !== 'disabled') checkedHelper({home, host, linuxHelper, installer});
  });
  if (!common) {
    // A vendor selection is refused whatever else blocks the sessions (F10, §2.2): the last line names it beside the
    // shared blocker, from the engine setting itself, since a session's own selection may refuse first for another
    // reason (CUA_REPL_HOST=vendor's guard).
    if (selected === 'vendor') why.computer = refusal(retiredEngine({setting, env, cuaHome: () => realHome(home)}));
    return {browser: false, computer: false, engine: selected, why};
  }
  // serve refuses a CUA_BROWSER_BACKENDS it cannot use when the browser is among its surfaces, and only then.
  const browser = opens('browser', () => configuredBackends(env));
  const computer = opens('computer', () => {
    select(env, ['computer']);
    desktopModeFor({env});
  });
  return {browser, computer, engine: selected, why};
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

// The last line: which sessions open, each refusal in its own words.
const SAID = 'sessions here, by what is installed and set: ';
function opensNow({browser, computer, engine, why}, env) {
  const words = ({code, message, hint}) => `${message} (${code})${hint ? `; ${hint}` : ''}`;
  const label = name => (name === 'cua' ? 'cua\'s engine' : 'the vendor\'s engine');
  // A shared prerequisite that failed opens nothing, and readiness then evaluated no computer session (no why.computer),
  // but a vendor selection's, which is said beside it; a browser-only refusal of its own (CUA_BROWSER_BACKENDS) leaves
  // the computer sessions to be said.
  if (!browser && !computer && !why.computer) return `${SAID}no session opens: ${words(why.browser)}`;
  const parts = [browser ? `browser-only sessions open${env.CUA_NODE ? ` on CUA_NODE=${env.CUA_NODE}` : ''}` : `browser-only sessions do not open: ${words(why.browser)}`,
    !engine ? `no computer session opens: ${words(why.computer)}`
      : computer ? `computer sessions open on ${label(engine)}, which this home selects`
        : `computer sessions on ${label(engine)}, which this home selects, do not open: ${words(why.computer)}`];
  return SAID + parts.join('; ');
}
