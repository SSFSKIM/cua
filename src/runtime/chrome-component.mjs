// The pinned archive's Chrome plugin as an additive component of an installed release:
//   runtimes/<release>/<chromePlugin.dir>/         the whole plugin directory, vendor bytes unchanged
//     component.json                               our record, like the release's install.json
//     extension-host/macos/arm64/ChatGPT for Chrome  the signed host Chrome launches over native messaging
//     extension-host/macos/arm64/extension-host-config.json  written by us: the host reads it from its own directory
// The component is staged, signature-checked against the pinned team (a linux pin lists nothing to check: the archive
// hash is its trust root) and written (config and record included) before one rename puts it in place, so an installed
// release gains it without any existing file changing. Like the base
// release it is never repaired in place. The whole plugin directory is kept because its scripts import
// ../node_modules (classic-level) and load their wasm files beside them.
//
// The configuration names the release's own node, node_repl and codex CLI, the plugin's own browser scripts (the
// pair the vendor ships with this host), and the server's owned CODEX_HOME. Its keys are the ones the vendor's
// installManifest.mjs writes plus `browserServicePath` and `codexHome`, which the host's config loader also accepts.
import {accessSync, constants, lstatSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {CuaError, fail} from './errors.mjs';
import {homeLayout} from './layout.mjs';
import {isRealDirectory} from './manifest.mjs';

export const COMPONENT_RECORD = 'component.json';
export const HOST_CONFIG_FILE = 'extension-host-config.json';
// The configuration keys that name executables or scripts; each must resolve inside the release tree.
export const CONFIG_PATH_KEYS = ['nodePath', 'nodeReplPath', 'codexCliPath', 'browserClientPath', 'browserServicePath'];

export function chromeComponentPaths(runtime) {
  const plugin = runtime.manifest.chromePlugin;
  const root = join(runtime.root, plugin.dir);
  const host = join(root, plugin.layout.host);
  return {
    root, host,
    browserClient: join(root, plugin.layout.browserClient),
    browserService: join(root, plugin.layout.browserService),
    installManifest: join(root, plugin.layout.installManifest),
    config: join(dirname(host), HOST_CONFIG_FILE),
    record: join(root, COMPONENT_RECORD),
  };
}

export function hostConfigFor(runtime) {
  const paths = chromeComponentPaths(runtime);
  return {
    schemaVersion: 1,
    channel: 'prod',
    browserClientPath: paths.browserClient,
    browserServicePath: paths.browserService,
    codexCliPath: runtime.paths.codexCli,
    nodePath: runtime.paths.node,
    nodeReplPath: runtime.paths.nodeRepl,
    codexHome: homeLayout(runtime.home).codexHome,
    proxyHost: '127.0.0.1',
    proxyPort: 0,
  };
}

// The pin-shaped argument the shared signature checker takes, for the component's own signed files.
const componentSigning = pin => ({release: pin.release, signing: {team: pin.signing?.team, components: pin.chromePlugin.signing}});
// How the doctor line names the host's trust: its signing team, or the archive hash where nothing is signed.
const hostTrust = pin => pin.chromePlugin.signing.length ? `signed by team ${pin.signing.team}` : `trusted by the archive hash (${pin.platform})`;

export const componentRecoveryHint = root => `if cua's host is registered run \`cua chrome unregister --vendor\` first; stop any \`cua serve\`, remove ${root}, then run \`cua install\``;

// What occupies a release's component path: nothing, a component this tool placed (its record), or something else.
export function componentState(root, pin) {
  try { lstatSync(root); } catch (error) { if (error.code === 'ENOENT') return {state: 'absent'}; throw error; }
  if (!isRealDirectory(root)) return {state: 'occupied'};
  const record = readRecord(root, pin);
  return record ? {state: 'placed', record} : {state: 'occupied'};
}

function readRecord(root, pin) {
  let record;
  try { record = JSON.parse(readFileSync(join(root, COMPONENT_RECORD), 'utf8')); } catch { return null; }
  const valid = record !== null && typeof record === 'object' && record.schema === 1 && record.component === pin.chromePlugin.dir
    && record.release === pin.release && record.archive?.sha256 === pin.archive.sha256 && record.archive?.length === pin.archive.length;
  return valid ? record : null;
}

// Files present and the host signed by the pinned team (where the pin lists it). This is all a staged component can show: install writes the
// host configuration after it passes. Anything that keeps, activates or registers a placed component uses
// verifyPlacedChromeComponent, which also checks that configuration.
async function verifyChromeComponent(root, pin, {verifySignatures}) {
  const missing = Object.entries(pin.chromePlugin.layout).filter(([, rel]) => !exists(join(root, rel))).map(([key, rel]) => `${key} (${rel})`);
  if (missing.length) fail('layout_invalid', `Chrome plugin component of ${pin.release} is missing ${missing.join(', ')}`);
  if (!pin.chromePlugin.signing.length) return;
  const signatures = await verifySignatures(root, componentSigning(pin));
  const bad = signatures.filter(s => !s.valid);
  if (bad.length || signatures.length !== pin.chromePlugin.signing.length)
    fail('signature_invalid', `Chrome plugin component of ${pin.release}: invalid vendor signature on ${bad.map(s => `${s.component} (${s.detail})`).join(', ') || 'unchecked components'}`);
}

// Moves the plugin out of an extracted archive into `into/<dir>`, verifies it, and writes the host configuration for
// the release's final location (`runtime`, never the staging path) and the component record. Returns the placed path.
export async function stageChromeComponent({extracted, into, runtime, source, verifySignatures}) {
  const pin = runtime.manifest;
  const from = join(extracted, pin.chromePlugin.from);
  if (!isRealDirectory(from)) fail('layout_invalid', `archive for ${pin.release} has no Chrome plugin directory ${pin.chromePlugin.from}`);
  const dest = join(into, pin.chromePlugin.dir);
  renameSync(from, dest);
  await verifyChromeComponent(dest, pin, {verifySignatures});
  writeFileSync(join(dest, dirname(pin.chromePlugin.layout.host), HOST_CONFIG_FILE), JSON.stringify(hostConfigFor(runtime), null, 2) + '\n', {mode: 0o644});
  const record = {schema: 1, component: pin.chromePlugin.dir, release: pin.release, archive: {sha256: pin.archive.sha256, length: pin.archive.length}, source, installedAt: new Date().toISOString()};
  writeFileSync(join(dest, COMPONENT_RECORD), JSON.stringify(record, null, 2) + '\n', {mode: 0o644});
  return dest;
}

// The placed component of the active release, its record valid; the classified error tells the user what to do.
export function locateChromeComponent(runtime) {
  const paths = chromeComponentPaths(runtime);
  const {state} = componentState(paths.root, runtime.manifest);
  if (state === 'absent') fail('chrome_host_not_installed', `the Chrome host is not placed in release ${runtime.release}`, {hint: 'run `cua install`; it adds the Chrome host to the installed release without changing it'});
  if (state === 'occupied') fail('chrome_component_invalid', `${paths.root} is not a Chrome host component placed by cua`, {hint: componentRecoveryHint(paths.root)});
  return paths;
}

// Why the host configuration beside a placed host is not the one the host must read, or null: it parses as a
// schemaVersion 1 object, names executables and scripts that resolve to files inside the release, and points
// CODEX_HOME at the server's own <home>/state/codex.
function hostConfigProblem(paths, runtime) {
  let config;
  try { config = JSON.parse(readFileSync(paths.config, 'utf8')); } catch (error) {
    return `${paths.config} cannot be read as JSON (${error.code ?? error.message})`;
  }
  if (config === null || typeof config !== 'object' || Array.isArray(config) || config.schemaVersion !== 1)
    return `${paths.config} is not a schemaVersion 1 host configuration`;
  const outside = CONFIG_PATH_KEYS.filter(key => !insideRelease(config[key], runtime.root));
  if (outside.length) return `${paths.config}: ${outside.map(key => `${key} ${JSON.stringify(config[key] ?? null)}`).join(', ')} does not resolve to a file inside the release ${runtime.root}`;
  const codexHome = homeLayout(runtime.home).codexHome;
  if (config.codexHome !== codexHome) return `${paths.config}: codexHome ${JSON.stringify(config.codexHome ?? null)} is not the server's own ${codexHome}`;
  return null;
}

// A component this tool placed in `runtime`'s release, whole: its files, the host signed by the pinned team, and the
// host configuration install wrote beside it. Install's "already placed" path, `runtime use` and `chrome register`
// all accept a placed component only through this check. Returns the component paths.
export async function verifyPlacedChromeComponent(runtime, {verifySignatures}) {
  const paths = chromeComponentPaths(runtime);
  await verifyChromeComponent(paths.root, runtime.manifest, {verifySignatures});
  const problem = hostConfigProblem(paths, runtime);
  if (problem) fail('host_config_invalid', `Chrome plugin component of ${runtime.release}: ${problem}`, {hint: componentRecoveryHint(paths.root)});
  return paths;
}

const result = (status, detail) => ({name: 'chrome.host.config', status, detail});

// Doctor's chrome.host.config: the placed component verifies whole (verifyPlacedChromeComponent) and the CODEX_HOME
// its configuration names is a writable directory. A missing component is `blocked` (install adds it); anything wrong
// with what cua placed is `fail`.
export async function inspectChromeHostConfig({runtime, verifySignatures}) {
  let paths;
  try { paths = locateChromeComponent(runtime); } catch (error) {
    if (!(error instanceof CuaError)) throw error;
    return result(error.code === 'chrome_host_not_installed' ? 'blocked' : 'fail', `${error.message}; ${error.hint}`);
  }
  const broken = why => result('fail', `${why}; ${componentRecoveryHint(paths.root)}`);
  try { await verifyPlacedChromeComponent(runtime, {verifySignatures}); } catch (error) {
    if (!(error instanceof CuaError)) throw error;
    return broken(error.message);
  }
  const codexHome = homeLayout(runtime.home).codexHome;
  if (!writableDirectory(codexHome)) return broken(`${paths.config}: codexHome ${codexHome} is not a writable directory`);
  return result('pass', `host ${paths.host} ${hostTrust(runtime.manifest)}; ${HOST_CONFIG_FILE} names node, node_repl, the codex CLI and the browser scripts inside the active release, codexHome ${codexHome} (owned, writable)`);
}

function exists(path) {
  try { lstatSync(path); return true; } catch { return false; }
}

function insideRelease(value, root) {
  if (typeof value !== 'string' || !value.startsWith('/')) return false;
  let real;
  try { real = realpathSync(value); } catch { return false; }
  return real.startsWith(root + '/') && statSync(real).isFile();
}

function writableDirectory(path) {
  try { return statSync(path).isDirectory() && (accessSync(path, constants.W_OK), true); } catch { return false; }
}
