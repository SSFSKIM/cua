// The launch record for one MCP connection's runtime: the relocated vendor `node` running the relocated `cua-repl`
// entry, with an allowlisted environment built only from the resolved runtime, owned paths under CUA_HOME and the
// caller's explicit services/secrets settings. Nothing is read from an installed desktop app or its plugin cache.
//
// Environment contract (everything else from the caller's environment is dropped, including every NODE_REPL_*,
// SKY_*, BROWSER_USE_*, CUA_REPL_* and NODE_OPTIONS value, so an ambient override cannot redirect the runtime):
//   HOME USER LOGNAME LANG LC_ALL LC_CTYPE __CF_USER_TEXT_ENCODING   copied when set
//   TMPDIR                                   the launch's own session temp, `sessionTmp` (<home>/run/<sessionId>/tmp,
//                                            mode 0700, created with the run directory: createLaunchDirs), never the
//                                            caller's: on macOS the caller's is shared by every session of the account,
//                                            and node_repl writes each session's kernel.js and trusted-worker.js there
//                                            (#115). Every write root a kernel has then lies in its own run directory
//   DISPLAY XAUTHORITY DBUS_SESSION_BUS_ADDRESS XDG_RUNTIME_DIR XDG_DATA_DIRS   linux only, copied when set: the X11
//                                            display and the session bus (AT-SPI) the vendor helper uses, and where
//                                            its app discovery reads .desktop entries. Without DBUS_SESSION_BUS_ADDRESS
//                                            (an SSH session) it is derived as unix:path=$XDG_RUNTIME_DIR/bus. With
//                                            DISPLAY and XAUTHORITY a model cell can reach X directly: on Linux the
//                                            trusted sky wrapper is not a boundary
//   PATH                                     fixed system path
//   CUA_SANDBOX_DENY_READ                    JSON {deny, reexpose}: what the kernel may not read, by real path, and
//                                            what is re-exposed inside it (src/sandbox/policy.mjs denyListFor), resolved
//                                            once here from the same store directories and HOME the worker gets
//   CODEX_HOME                               <home>/state/codex: runtime config and per-user approvals (not for cua's
//                                            own host on macOS, which no longer launches through the Codex CLI)
//   CUA_REPL_NODE_REPL_PATH                  relocated node_repl (required by the vendor launcher)
//   CUA_REPL_ENABLED_SURFACES                required by the vendor launcher: `computer` (the default), `browser` or
//                                            `computer,browser`, from the caller's `surfaces`
//   NODE_REPL_NODE_PATH, NODE_REPL_NODE_MODULE_DIRS    relocated vendor node and its module tree
//   NODE_REPL_TRUSTED_CODE_PATHS             the vendor module tree, src/sandbox and bin/ (cua's sandbox and its compat
//                                            executable, which run outside every sandbox) and, with services registered, each service's
//                                            directory and the owned modules services import (src/secrets), and with the
//                                            browser surface src/browser-service, cua's own browser service, which the
//                                            trusted browser wrapper (src/services/browser.mjs) delegates to (the
//                                            vendor's @oai/browser-desktop service is never selected: #79). Never
//                                            CODEX_HOME or run/: the runtime writes there, and the trusted worker
//                                            imports anything under a trusted path
//   NODE_REPL_TRUSTED_SERVICES               only when services are registered (`cua serve` registers SKY_SERVICE for
//                                            the computer surface and BROWSER_SERVICE for the browser surface, and the
//                                            registered services must be exactly those of the enabled surfaces); unset
//                                            lets the vendor launcher use its own services
//   NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS=1000, NODE_REPL_DISABLE_ANALYTICS=1
//   CODEX_CLI_PATH                           macOS vendor host: bin/cua-codex-compat by its real path, cua's compat
//                                            executable (src/sandbox/codex-compat.mjs: node_repl's `sandbox` calls under
//                                            cua's profiles, the native helper's `app-server`); linux: the relocated
//                                            `codex` until #115 M3. No unsandboxed fallback: node_repl runs its children
//                                            unconfined without it, so the vendor-host preflight refuses a launch whose
//                                            value is not an executable file (src/runtime/sandbox.mjs). Not for cua's own
//                                            host on macOS
//   CUA_COMPAT_NODE                          macOS vendor host: the vendor's pinned Node, which the compat executable's
//                                            `app-server` runs on; it reaches the native helper through `open`. Its
//                                            `sandbox` takes the same Node from the session's compat settings (below),
//                                            since node_repl hands the kernel's launcher a filtered environment
//   SKY_CUA_SERVICE_PATH                     computer surface, darwin: relocated helper app, opened by the vendor through
//                                            LaunchServices
//   OAI_SKY_LINUX_BIN                        computer surface, linux: the relocated sky_linux helper, which the vendor
//                                            spawns as a child over stdio (pinned rather than resolved by the vendor)
//   CUA_SKY_VENDOR_SERVICE                   computer surface: vendor sky service module, for the trusted wrapper
//   BROWSER_USE_AVAILABLE_BACKENDS=chrome    browser surface: the service considers Chrome backends only (no
//                                            BROWSER_USE_DISABLE_AMBIENT_NETWORK or BROWSER_USE_SECURITY_MODE)
//   BROWSER_USE_BACKEND_PATHS                browser surface: cua's host sockets (src/chrome/discovery.mjs), an empty
//                                            list when there are none, so the service looks nowhere else; with
//                                            `browserBackends` (MAWS backends, from CUA_BROWSER_BACKENDS:
//                                            src/chrome/client-mode.mjs) this process's client-mode hosts first
//   BROWSER_USE_PREFERRED_EXTENSION_INSTANCE_ID   with `browserBackends`, the first MAWS backend's instance id once it
//                                            said hello
//   CUA_BROWSER_DEFAULT_INSTANCE             with `browserBackends`: the instance the trusted browser wrapper rewrites
//                                            an unqualified selection to (src/services/browser.mjs); the first MAWS
//                                            backend's instance id, or the marker `maws:` when it has not said hello
//   CUA_SECRETS_DIR                          with secrets on: the secret store directory (src/secrets/store.mjs), which
//                                            the trusted services read a value from; untrusted cells see only the
//                                            vendor's env allowlist (they can still read the directory: the sandbox
//                                            that would deny them would deny the trusted worker too)
//   CUA_SECRETS_PROJECT_DIR                  with secrets on and a project (the stdio `cua serve`'s, never the HTTP agent's):
//                                            the project's store directory, which the trusted services read a key from
//                                            before the global one
//   CUA_SECRETS_UNAVAILABLE                  otherwise: why (e.g. secrets_disabled), so the trusted services fail a
//                                            {{secret:…}} reference with that reason
// The selection (spec docs/doperpowers/specs/2026-10-14-own-repl-host-design.md, "Selection is a connection fact"): the
// launch record also carries `replHost` ({host, reason}, replHostFor), the REPL host it runs. CUA_REPL_HOST and CUA_NODE
// are read by the proxy only and never reach the runtime's environment. Deliberately never set:
// NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS, NODE_REPL_UNTRUSTED_ENV_ALLOWLIST (cells see only what the vendor launcher
// adds), SKY_CUA_SERVICE_NATIVE_PIPE_PATH, NODE_REPL_HOST_SERVICES_PIPE_PATH, NODE_REPL_WORKER_WRAPPER,
// NODE_REPL_DENIED_PATHS.
//
// cua's own REPL host (replHost `cua`, src/repl-host/supervisor.mjs) is launched instead as the Node ownHostNode resolves
// (at least NODE_FLOOR: CUA_NODE, the Node `cua install` pins under $CUA_HOME/node, else the user's; never the vendor's
// pinned Node) running the supervisor with --disable-sigusr1, under the same allowlist, surfaces, services and secrets
// settings, with the host's own settings under owned names in place of the vendor's NODE_REPL_ ones (no vendor
// launcher, node_repl or vendor Node path is set). Its children's sandbox: on macOS cua's own (src/sandbox), through
// CUA_REPL_SANDBOX_EXEC, with neither CODEX_CLI_PATH nor CODEX_HOME; on Linux the Codex CLI (CODEX_CLI_PATH and
// CODEX_HOME) until #115 M3:
//   CUA_REPL_SANDBOX_EXEC                    macOS: /usr/bin/sandbox-exec, which the supervisor runs each child under
//                                            with the profile src/sandbox renders for its role
//   CUA_REPL_NODE_PATH                       the resolved Node the kernel runs on
//   CUA_REPL_TRUSTED_CODE_PATHS              src/repl-host (the host's own code), src/cua-api and docs/cua-api (the cua
//                                            facade the banner imports and the documents it reads), then what
//                                            NODE_REPL_TRUSTED_CODE_PATHS lists for the vendor; the scoped preflight
//                                            protects these (src/runtime/sandbox.mjs trustedCodePathsOf)
//   CUA_REPL_TRUSTED_SERVICES                with services registered, as NODE_REPL_TRUSTED_SERVICES: what the trusted
//                                            worker (src/repl-host/trusted-worker.mjs) loads; every service must lie
//                                            inside a trusted code path by real path (sandbox.mjs
//                                            assertTrustedServicesContained refuses the launch otherwise)
//   CUA_REPL_TRUSTED_RPC_ENABLED=1           with services registered: cells get nodeRepl.rpc
//   CUA_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS=1000
//   CUA_REPL_OWNED_GROUP=1                   the supervisor runs in the process group the proxy's anchor owns
//                                            (src/mcp/upstream.mjs), so it may reap what a finished kernel left there
//   CUA_REPL_NODE_MODULE_DIRS                the vendor module tree, where cells resolve package imports as the vendor
//                                            launcher lets them
//   CUA_REPL_JS_BANNER                       imports cua's own facade bootstrap (src/cua-api/bootstrap.mjs, by file
//                                            URL), which installs `cua` (and `agent`) for the enabled surfaces
//   CUA_REPL_UNTRUSTED_ENV_ALLOWLIST         CUA_REPL_ENABLED_SURFACES,CUA_REPL_BROWSER_ENV, as the vendor launcher adds
//   CUA_REPL_TOOL_OVERRIDES                  the vendor launcher's tool text for this platform and these surfaces
//                                            (src/repl-host/instructions.mjs), as NODE_REPL_TOOL_OVERRIDES
//   NODE_REPL_DISABLE_ANALYTICS=1            kept: the retained vendor sky service reads it
//
// The launch record also carries `managedNodeRoot`, <home>/node (the Node `cua install` places for the own host), and
// `stagingRoot`, <home>/staging (where install verifies what it places), which the scoped preflight protects for either
// host (src/runtime/sandbox.mjs assertSandboxFits); neither is in `env`.
// A macOS vendor-host launch also carries `compat` ({home, sessionId, node}): createLaunchDirs writes the session's
// compat settings from it (src/sandbox/compat-settings.mjs: <home>/state/compat/<sessionId>.json with the deny list and
// the session temp, and .node with the Node), which the run directory's removal removes too (removeLaunchDirs, and
// src/runtime/run-dir.mjs for a session's release or sweep).
// The working directory is <home>/run/<sessionId>; model cells can see it, so it is never the caller's directory or
// the repository. The caller creates it and the session temp inside it (mode 0700, createLaunchDirs) before spawning
// and removes it when the connection ends. The launch record carries both (`cwd`, `sessionTmp`) and the deny list it
// resolved (`denyRead`; null for a disabled connection, `sandbox`), which the scoped preflight protects except for those
// two (src/runtime/sandbox.mjs).
import {accessSync, chmodSync, constants, mkdirSync, realpathSync, rmSync, statSync} from 'node:fs';
import {dirname, isAbsolute, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {CuaError, fail} from './errors.mjs';
import {homeLayout, realHome} from './layout.mjs';
import {STORE_ENV} from '../secrets/store.mjs';
import {desktopSessionEnv} from './linux-desktop.mjs';
import {launchBackendPaths, MAWS_INSTANCE_MARKER} from '../chrome/discovery.mjs';
import {assertTrustedServicesContained} from './sandbox.mjs';
import {toolOverrides} from '../repl-host/instructions.mjs';
import {cuaNodeFrom} from '../mcp/surface.mjs';
import {NODE_FLOOR, managedNode, nodeVersion} from './managed-node.mjs';
import {denyListFor, realDenyList} from '../sandbox/policy.mjs';
import {SEATBELT_EXEC} from '../sandbox/seatbelt.mjs';
import {removeCompatSettings, SESSION_ID, writeCompatSettings} from '../sandbox/compat-settings.mjs';

export {NODE_FLOOR};

const AMBIENT_ALLOWLIST = ['HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE', '__CF_USER_TEXT_ENCODING'];
const FIXED_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
// Each surface the vendor launcher knows, in its canonical order, and the trusted service that serves it.
const SURFACE_SERVICES = {computer: 'sky', browser: 'browser'};
const SURFACES = Object.keys(SURFACE_SERVICES);
const REASON = /^[a-z][a-z_]{0,63}$/;
const ownedPath = relative => realpathSync(fileURLToPath(new URL(relative, import.meta.url)));

// The production trusted sky service, and the owned directories whose modules registered services import (the
// trusted worker refuses any import whose real path lies outside NODE_REPL_TRUSTED_CODE_PATHS).
export const SKY_SERVICE = ownedPath('../services/sky.mjs');
export const BROWSER_SERVICE = ownedPath('../services/browser.mjs');
export const SERVICE_SUPPORT_DIRS = [ownedPath('../secrets')];
// cua's own browser service (docs/doperpowers/specs/2026-10-13-own-browser-service-design.md), trusted with the browser
// surface.
export const BROWSER_SERVICE_IMPL_DIR = ownedPath('../browser-service');
// cua's own REPL host: the supervisor a launch of it runs, and the directory of its code (kernel, worker runtime and
// vendored parser), which is trusted code for the scoped preflight.
export const REPL_HOST_DIR = ownedPath('../repl-host');
export const REPL_HOST_SUPERVISOR = ownedPath('../repl-host/supervisor.mjs');
// cua's own facade (the spec's CuaBootstrap) and its first-call documents (CoreDocumentation): the first cell of a fresh
// own-host kernel imports the bootstrap, which reads the documents; both are trusted code for the scoped preflight.
export const CUA_API_DIR = ownedPath('../cua-api');
export const CUA_API_DOCS_DIR = ownedPath('../../docs/cua-api');
// cua's sandbox (#115): it renders and launches the children's sandbox from outside it, so it is trusted code for the
// scoped preflight of either host.
export const SANDBOX_DIR = ownedPath('../sandbox');
// cua's compat executable for the Codex CLI (#115 M2), the macOS vendor host's CODEX_CLI_PATH, and its directory, which
// is trusted code for the scoped preflight of either host: it runs outside every sandbox too.
export const BIN_DIR = ownedPath('../../bin');
// Its absolute path beside bin/ at load (it may be missing: doctor's sandbox.launcher and the vendor launch preflight
// say so); `compatExecutable()` is its real path, resolved when a launch or doctor names it.
export const COMPAT_EXECUTABLE = join(BIN_DIR, 'cua-codex-compat');
export const compatExecutable = (path = COMPAT_EXECUTABLE) => { try { return realpathSync(path); } catch { return path; } };
export const CUA_BOOTSTRAP_BANNER = `await import(${JSON.stringify(pathToFileURL(join(CUA_API_DIR, 'bootstrap.mjs')).href)});\n`;
const REPL_HOSTS = ['cua', 'vendor'];
// The environment names a cell may read through nodeRepl.env on the own host: the vendor launcher's own additions to
// its node_repl's allowlist (cua-repl launch.js). The facade reads the first (src/cua-api/bootstrap.mjs); the second's
// vendor modes are not ported, and the launch never sets it.
const CELL_ENV_ALLOWLIST = 'CUA_REPL_ENABLED_SURFACES,CUA_REPL_BROWSER_ENV';

// `browserBackends` ({hostPaths, defaultInstance}) is the process's MAWS backends (src/chrome/client-mode.mjs), when
// CUA_BROWSER_BACKENDS configured any. `replHost` (replHostFor) is the connection's, resolved once at its open so every
// launch of it (an idle relaunch too) runs what it resolved then; a caller that gives none, a single launch, has it
// resolved here from `ambient` and `home`, the own host's Node through `resolveOwnNode` (replHostFor's). A `cua`
// selection carries the Node it resolved (`node`), which the launch runs.
export function buildLaunch({runtime, home, sessionId, surfaces = ['computer'], services, secretsDir, secretsProjectDir, secretsUnavailable, ambient = process.env, browserBackends = null, replHost, resolveOwnNode, sandbox}) {
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) fail('invalid_session_id', 'session id must be 1-128 letters, digits or dashes');
  const enabled = canonicalSurfaces(surfaces);
  if (secretsUnavailable !== undefined && (typeof secretsUnavailable !== 'string' || !REASON.test(secretsUnavailable))) fail('invalid_secrets_reason', 'the secrets-unavailable reason must be a lowercase code');
  if (secretsDir !== undefined && (typeof secretsDir !== 'string' || !isAbsolute(secretsDir))) fail('invalid_secrets_dir', 'the secret store directory must be an absolute path');
  if (secretsProjectDir !== undefined && (typeof secretsProjectDir !== 'string' || !isAbsolute(secretsProjectDir) || !secretsDir)) fail('invalid_secrets_dir', 'the project secret store directory must be an absolute path beside the global one');
  replHost ??= replHostFor({platform: runtime.manifest.platform, surfaces: enabled, ambient, home, resolveOwnNode});
  const own = replHost.host === 'cua';
  const ownNode = own ? replHost.node : undefined;
  if (own && typeof ownNode !== 'string') throw new TypeError('buildLaunch: a cua selection carries the Node it resolved');
  const owned = homeLayout(realHome(home));
  const p = runtime.paths;
  const linux = runtime.manifest.platform === 'linux';

  // cua's own host on macOS confines its children with cua's own sandbox, and the vendor host there through cua's compat
  // executable; Linux keeps the Codex CLI's until #115 M3.
  const ownSandbox = own && !linux;
  const compat = !own && !linux;
  const cwd = join(owned.run, sessionId);
  const sessionTmp = join(cwd, 'tmp');
  // A disabled connection confines nothing, so it neither needs the deny list nor fails on discovering it (an unreadable
  // store refuses only confined launches). Its launch carries no list, and the supervisor refuses any confined call
  // without one, so it can never be confined later without its list.
  const denyRead = sandbox === 'disabled' ? null
    : realDenyList(denyListFor({home: owned.home, env: ambient, secretsDir, secretsProjectDir, sessionId, sessionTmp, platform: runtime.manifest.platform}));

  const env = {};
  for (const key of AMBIENT_ALLOWLIST) if (typeof ambient[key] === 'string') env[key] = ambient[key];
  env.TMPDIR = sessionTmp;
  if (linux) Object.assign(env, desktopSessionEnv(ambient));
  const trustedCodePaths = own ? [REPL_HOST_DIR, CUA_API_DIR, CUA_API_DOCS_DIR, p.moduleDir, SANDBOX_DIR, BIN_DIR] : [p.moduleDir, SANDBOX_DIR, BIN_DIR];
  Object.assign(env, {PATH: FIXED_PATH}, denyRead ? {CUA_SANDBOX_DENY_READ: JSON.stringify(denyRead)} : {}, ownSandbox ? {} : {CODEX_HOME: owned.codexHome});
  Object.assign(env, own
    ? {CUA_REPL_ENABLED_SURFACES: enabled.join(','), CUA_REPL_NODE_PATH: ownNode, CUA_REPL_OWNED_GROUP: '1', CUA_REPL_NODE_MODULE_DIRS: p.moduleDir,
      CUA_REPL_JS_BANNER: CUA_BOOTSTRAP_BANNER, CUA_REPL_UNTRUSTED_ENV_ALLOWLIST: CELL_ENV_ALLOWLIST,
      CUA_REPL_TOOL_OVERRIDES: JSON.stringify(toolOverrides({platform: runtime.manifest.platform, surfaces: enabled}))}
    : {CUA_REPL_NODE_REPL_PATH: p.nodeRepl, CUA_REPL_ENABLED_SURFACES: enabled.join(','), NODE_REPL_NODE_PATH: p.node, NODE_REPL_NODE_MODULE_DIRS: p.moduleDir});
  const names = own
    ? {services: 'CUA_REPL_TRUSTED_SERVICES', codePaths: 'CUA_REPL_TRUSTED_CODE_PATHS', pipeTimeout: 'CUA_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS'}
    : {services: 'NODE_REPL_TRUSTED_SERVICES', codePaths: 'NODE_REPL_TRUSTED_CODE_PATHS', pipeTimeout: 'NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS'};
  if (services && Object.keys(services).length) {
    const registered = trustedServices(services, enabled);
    env[names.services] = JSON.stringify(registered);
    if (own) env.CUA_REPL_TRUSTED_RPC_ENABLED = '1';
    for (const dir of [...Object.values(registered).map(module => dirname(module)), ...SERVICE_SUPPORT_DIRS]) if (!trustedCodePaths.includes(dir)) trustedCodePaths.push(dir);
  }
  if (enabled.includes('browser') && !trustedCodePaths.includes(BROWSER_SERVICE_IMPL_DIR)) trustedCodePaths.push(BROWSER_SERVICE_IMPL_DIR);
  Object.assign(env, {
    [names.codePaths]: trustedCodePaths.join(':'),
    [names.pipeTimeout]: '1000',
    NODE_REPL_DISABLE_ANALYTICS: '1',
    ...(ownSandbox ? {CUA_REPL_SANDBOX_EXEC: SEATBELT_EXEC} : compat ? {CODEX_CLI_PATH: compatExecutable(), CUA_COMPAT_NODE: p.node} : {CODEX_CLI_PATH: p.codexCli}),
  });
  if (enabled.includes('computer')) Object.assign(env, linux ? {OAI_SKY_LINUX_BIN: p.skyLinuxBin} : {SKY_CUA_SERVICE_PATH: p.skyServiceApp}, {CUA_SKY_VENDOR_SERVICE: p.skyVendorService});
  if (enabled.includes('browser')) {
    env.BROWSER_USE_AVAILABLE_BACKENDS = 'chrome';
    env.BROWSER_USE_BACKEND_PATHS = launchBackendPaths(home, {clientHosts: browserBackends?.hostPaths ?? null}).join(':');
    if (browserBackends) {
      if (browserBackends.defaultInstance) env.BROWSER_USE_PREFERRED_EXTENSION_INSTANCE_ID = browserBackends.defaultInstance;
      env.CUA_BROWSER_DEFAULT_INSTANCE = browserBackends.defaultInstance ?? MAWS_INSTANCE_MARKER;
    }
  }
  if (secretsDir) {
    env[STORE_ENV.dir] = secretsDir;
    if (secretsProjectDir) env[STORE_ENV.projectDir] = secretsProjectDir;
  } else if (secretsUnavailable) env[STORE_ENV.unavailable] = secretsUnavailable;
  const launch = {command: own ? ownNode : p.node, args: own ? ['--disable-sigusr1', REPL_HOST_SUPERVISOR] : [p.cuaRepl], env, cwd, sessionTmp, denyRead,
    replHost: {host: replHost.host, reason: replHost.reason}, managedNodeRoot: owned.node, stagingRoot: owned.staging,
    compat: compat ? {home: owned.home, sessionId, node: p.node} : null};
  if (own) assertTrustedServicesContained(launch);
  return launch;
}

// Creates `launch`'s working directory and its session temp, each mode 0700 (a directory left from an earlier launch of
// the same session is reused and made private again), the runtime's CODEX_HOME where the launch has one, and a macOS
// vendor-host launch's compat settings (rewritten for each launch of the session).
export function createLaunchDirs(launch) {
  if (launch.env.CODEX_HOME) mkdirSync(launch.env.CODEX_HOME, {recursive: true, mode: 0o700});
  for (const dir of [launch.cwd, launch.sessionTmp]) {
    mkdirSync(dir, {recursive: true, mode: 0o700});
    chmodSync(dir, 0o700);
  }
  if (launch.compat) writeCompatSettings({...launch.compat, denyRead: launch.denyRead, sessionTmp: launch.sessionTmp});
}

// Removes what createLaunchDirs made for `launch` but CODEX_HOME: its run directory (with the session temp) and its
// compat settings. Throws what the removal of the run directory throws.
export function removeLaunchDirs(launch) {
  if (launch.compat) removeCompatSettings(launch.compat);
  rmSync(launch.cwd, {recursive: true, force: true});
}

// The REPL host a launch with `surfaces` on `platform` runs, and why -> {host: 'cua' | 'vendor', reason}, plus, for
// `cua`, `node`: the Node it runs on, and for `own_host_node_unavailable`, `nodeTried`: the candidates ownHostNode tried.
// `resolveOwnNode` resolves the own host's Node (ownHostNode from `ambient` and `home` by default), asked at most once
// and only when the selection would be cua's own host: a connection resolves its selection once, so its Node too.
// Either host runs cua's browser service with the browser surface. CUA_REPL_HOST in `ambient`, the caller's original
// environment:
//   vendor   always the vendor host (`explicit`): the rollback; Node is never asked for.
//   cua      cua's own host (`explicit`) where it can run, else refused before launch (repl_host_refused), never
//            downgraded: with the computer surface on macOS, whose native helper accepts only the vendor host's
//            node_repl as a peer until #117. Where it can run but no Node 24 or later resolves, refused too
//            (repl_host_node).
//   unset or empty   the vendor host with `macos_native_peer_requires_vendor` for the computer surface on macOS (MAWS
//            client mode does not change that); else cua's own host, the default since #116's last stage (M5):
//            `linux` on Linux, `browser_only` for a macOS session with only the browser surface. That default needs a
//            Node 24 or later: where none resolves, the vendor host with `own_host_node_unavailable`, never a refused
//            session (cua itself runs on Node 22).
// Any other CUA_REPL_HOST is refused (invalid_repl_host), as is a CUA_NODE that is not an absolute path wherever Node is
// asked for (invalid_setting).
export function replHostFor({platform, surfaces, ambient, home, resolveOwnNode = () => ownHostNode({ambient, home})}) {
  const value = ambient.CUA_REPL_HOST;
  const requested = value === undefined || value === '' ? null : value;
  if (requested !== null && !REPL_HOSTS.includes(requested)) fail('invalid_repl_host', `CUA_REPL_HOST must be ${REPL_HOSTS.join(' or ')}`);
  if (requested === 'vendor') return {host: 'vendor', reason: 'explicit'};
  const macosComputer = platform === 'darwin' && surfaces.includes('computer');
  if (requested === 'cua') {
    if (macosComputer)
      fail('repl_host_refused', 'CUA_REPL_HOST=cua is not supported with the computer surface on macOS: its computer-use helper accepts only the vendor host\'s node_repl as a peer until #117 replaces it. Use CUA_SHIM_SURFACES=browser for cua\'s own host, or unset CUA_REPL_HOST (or use CUA_REPL_HOST=vendor)');
    return {host: 'cua', reason: 'explicit', node: resolveOwnNode()};
  }
  if (macosComputer) return {host: 'vendor', reason: 'macos_native_peer_requires_vendor'};
  const reason = platform === 'linux' ? 'linux' : 'browser_only';
  try {
    return {host: 'cua', reason, node: resolveOwnNode()};
  } catch (error) {
    if (error?.code !== 'repl_host_node') throw error;
    return {host: 'vendor', reason: 'own_host_node_unavailable', nodeTried: error.tried};
  }
}

// The Node cua's own REPL host runs on: the first of an explicit CUA_NODE (an absolute path), the Node `cua install`
// placed in `home` (managed-node.mjs; a caller that names no home has none to try), the node running cua (`execPath`)
// and the first `node` on the caller's PATH whose `--version` (`versionOf`) is at least NODE_FLOOR, as its real path,
// which the launch can name in an environment whose PATH is fixed. None: refused (repl_host_node), naming every
// candidate tried and its version, which the error also carries as `tried`. The vendor host's pinned Node is never a
// candidate.
export function ownHostNode({ambient, home, execPath = process.execPath, versionOf = nodeVersion}) {
  const explicit = cuaNodeFrom(ambient);
  const managed = home === undefined ? null : managedNode(home);
  const tried = [];
  for (const [label, path, missing] of [['CUA_NODE', explicit, 'unset'], ...(managed ? [['the cua-installed Node', managed.path, managed.missing]] : []),
    ['the node running cua', execPath, 'not found'], ['node on PATH', nodeOnPath(ambient.PATH), 'not found']]) {
    if (!path) { tried.push(`${label} (${missing})`); continue; }
    let real;
    try { real = realpathSync(path); } catch { tried.push(`${label} ${path} (not found)`); continue; }
    const version = versionOf(real);
    if (version && Number(version.slice(1).split('.')[0]) >= NODE_FLOOR) return real;
    tried.push(`${label} ${path} (${version ?? 'no readable version'})`);
  }
  throw Object.assign(new CuaError('repl_host_node', `cua's own REPL host needs Node ${NODE_FLOOR} or later, and none was found: ${tried.join(', ')}; run \`cua install\` to install the pinned Node ${NODE_FLOOR} for it, set CUA_NODE to the absolute path of a Node ${NODE_FLOOR} or later, or run cua with one (the vendor host's pinned Node is never used for it)`), {tried});
}

// The `node` a shell would run from `PATH`: the first executable file of that name in an absolute entry.
function nodeOnPath(PATH = '') {
  for (const dir of PATH.split(':')) {
    if (!isAbsolute(dir)) continue;
    const path = join(dir, 'node');
    try {
      if (!statSync(path).isFile()) continue;
      accessSync(path, constants.X_OK);
      return path;
    } catch { /* not here */ }
  }
  return null;
}

// The enabled surfaces in the vendor launcher's terms: a non-empty set of known surface names, in canonical order.
function canonicalSurfaces(surfaces) {
  const valid = Array.isArray(surfaces) && surfaces.length > 0 && surfaces.every(s => SURFACES.includes(s)) && new Set(surfaces).size === surfaces.length;
  if (!valid) fail('invalid_surfaces', `surfaces must be a non-empty set of ${SURFACES.join(', ')}`);
  return SURFACES.filter(s => surfaces.includes(s));
}

// Service modules are registered by real path: the trusted worker only imports modules whose real path lies under
// NODE_REPL_TRUSTED_CODE_PATHS, so a symlinked checkout (npm link) must not leak its link path in here. The registered
// services are exactly the enabled surfaces' services: with NODE_REPL_TRUSTED_SERVICES set the vendor launcher
// registers nothing of its own, so a missing one would leave its surface without a service.
function trustedServices(services, surfaces) {
  const expected = surfaces.map(s => SURFACE_SERVICES[s]);
  const names = Object.keys(services);
  if (names.length !== expected.length || !expected.every(name => names.includes(name)))
    fail('invalid_service', `the surfaces ${surfaces.join(', ')} take exactly the trusted service(s) ${expected.join(', ')}; got ${names.join(', ') || 'none'}`);
  const out = {};
  for (const [name, module] of Object.entries(services)) {
    if (typeof module !== 'string' || !isAbsolute(module)) fail('invalid_service', `trusted service ${name} must be an absolute module path`);
    let real;
    try { real = realpathSync(module); } catch { fail('invalid_service', `trusted service ${name} module ${module} does not exist`); }
    if (!statSync(real).isFile()) fail('invalid_service', `trusted service ${name} module ${module} is not a file`);
    out[name] = real;
  }
  return out;
}
