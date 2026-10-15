// The launch record for one MCP connection's runtime: the relocated vendor `node` running the relocated `cua-repl`
// entry, with an allowlisted environment built only from the resolved runtime, owned paths under CUA_HOME and the
// caller's explicit services/secrets settings. Nothing is read from an installed desktop app or its plugin cache.
//
// Environment contract (everything else from the caller's environment is dropped, including every NODE_REPL_*,
// SKY_*, BROWSER_USE_*, CUA_REPL_* and NODE_OPTIONS value, so an ambient override cannot redirect the runtime):
//   HOME USER LOGNAME TMPDIR LANG LC_ALL LC_CTYPE __CF_USER_TEXT_ENCODING   copied when set
//   DISPLAY XAUTHORITY DBUS_SESSION_BUS_ADDRESS XDG_RUNTIME_DIR XDG_DATA_DIRS   linux only, copied when set: the X11
//                                            display and the session bus (AT-SPI) the vendor helper uses, and where
//                                            its app discovery reads .desktop entries. Without DBUS_SESSION_BUS_ADDRESS
//                                            (an SSH session) it is derived as unix:path=$XDG_RUNTIME_DIR/bus. With
//                                            DISPLAY and XAUTHORITY a model cell can reach X directly: on Linux the
//                                            trusted sky wrapper is not a boundary
//   PATH                                     fixed system path
//   CODEX_HOME                               <home>/state/codex: runtime config and per-user approvals
//   CUA_REPL_NODE_REPL_PATH                  relocated node_repl (required by the vendor launcher)
//   CUA_REPL_ENABLED_SURFACES                required by the vendor launcher: `computer` (the default), `browser` or
//                                            `computer,browser`, from the caller's `surfaces`
//   NODE_REPL_NODE_PATH, NODE_REPL_NODE_MODULE_DIRS    relocated vendor node and its module tree
//   NODE_REPL_TRUSTED_CODE_PATHS             the vendor module tree and, with services registered, each service's
//                                            directory and the owned modules services import (src/secrets), and under
//                                            the cua browser service src/browser-service (below). Never
//                                            CODEX_HOME or run/: the runtime writes there, and the trusted worker
//                                            imports anything under a trusted path
//   NODE_REPL_TRUSTED_SERVICES               only when services are registered (`cua serve` registers SKY_SERVICE for
//                                            the computer surface and BROWSER_SERVICE for the browser surface, and the
//                                            registered services must be exactly those of the enabled surfaces); unset
//                                            lets the vendor launcher use its own services
//   NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS=1000, NODE_REPL_DISABLE_ANALYTICS=1
//   CODEX_CLI_PATH                           relocated CodexCLI.app executable, or on linux the relocated `codex` (the
//                                            sandbox; no unsandboxed fallback)
//   SKY_CUA_SERVICE_PATH                     computer surface, darwin: relocated helper app, opened by the vendor through
//                                            LaunchServices
//   OAI_SKY_LINUX_BIN                        computer surface, linux: the relocated sky_linux helper, which the vendor
//                                            spawns as a child over stdio (pinned rather than resolved by the vendor)
//   CUA_SKY_VENDOR_SERVICE                   computer surface: vendor sky service module, for the trusted wrapper
//   CUA_BROWSER_VENDOR_SERVICE               browser surface: vendor @oai/browser-desktop service module, for the
//                                            trusted browser wrapper (src/services/browser.mjs) to delegate to
//   CUA_BROWSER_SERVICE                      browser surface: which browser service the wrapper delegates to, always
//                                            written out (browserServiceFor): the caller's value when it sets one,
//                                            else resolved from the home's Chrome route. `cua` is src/browser-service/,
//                                            whose real directory is then added to NODE_REPL_TRUSTED_CODE_PATHS, and
//                                            nothing wider; `vendor` is the pinned vendor module, kept one release for
//                                            rollback and for the ChatGPT extension route, removed by #116. Any other
//                                            value is refused
//   BROWSER_USE_AVAILABLE_BACKENDS=chrome    browser surface: the vendor service considers Chrome backends only. Its
//                                            network and security behaviour is the vendor default (no
//                                            BROWSER_USE_DISABLE_AMBIENT_NETWORK or BROWSER_USE_SECURITY_MODE)
//   BROWSER_USE_BACKEND_PATHS                browser surface on the cua route only: cua's host sockets
//                                            (src/chrome/discovery.mjs), so the vendor's /tmp scan is skipped; on the
//                                            vendor route (or with no Chrome registration) unset, and the vendor's own
//                                            discovery finds OpenAI's hosts. With `browserBackends` (MAWS backends, from
//                                            CUA_BROWSER_BACKENDS: src/chrome/client-mode.mjs) set on every route,
//                                            this process's client-mode hosts first (discovery.mjs launchBackendPaths)
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
// cua's own REPL host (replHost `cua`, src/repl-host/supervisor.mjs) is launched instead as the user's Node (ownHostNode,
// at least NODE_FLOOR; never the vendor's pinned Node) running the supervisor with --disable-sigusr1, under the same
// allowlist, CODEX_HOME, CODEX_CLI_PATH (its kernel's sandbox), surfaces, services and secrets settings, with the host's
// own settings under owned names in place of the vendor's NODE_REPL_ ones (no vendor launcher, node_repl or vendor Node
// path is set):
//   CUA_REPL_NODE_PATH                       the resolved Node the kernel runs on
//   CUA_REPL_TRUSTED_CODE_PATHS              src/repl-host (the host's own code), then what NODE_REPL_TRUSTED_CODE_PATHS
//                                            lists for the vendor; the scoped preflight protects these
//                                            (src/runtime/sandbox.mjs trustedCodePathsOf)
//   CUA_REPL_TRUSTED_SERVICES                with services registered, as NODE_REPL_TRUSTED_SERVICES (#116 M2's worker)
//   CUA_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS=1000
//   CUA_REPL_OWNED_GROUP=1                   the supervisor runs in the process group the proxy's anchor owns
//                                            (src/mcp/upstream.mjs), so it may reap what a finished kernel left there
//   NODE_REPL_DISABLE_ANALYTICS=1            kept: the retained vendor sky service reads it
// M1's host has no first-cell banner, module directories or cell environment allowlist: it runs raw cells.
//
// The working directory is <home>/run/<sessionId>; model cells can see it, so it is never the caller's directory or
// the repository. The caller creates it (mode 0700) before spawning and removes it when the connection ends.
import {accessSync, constants, realpathSync, statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname, isAbsolute, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fail} from './errors.mjs';
import {homeLayout, realHome} from './layout.mjs';
import {STORE_ENV} from '../secrets/store.mjs';
import {desktopSessionEnv} from './linux-desktop.mjs';
import {launchBackendPaths, MAWS_INSTANCE_MARKER} from '../chrome/discovery.mjs';
import {chromeRoute, registrationTimes} from '../chrome/route.mjs';

const AMBIENT_ALLOWLIST = ['HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', '__CF_USER_TEXT_ENCODING'];
const FIXED_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
// Each surface the vendor launcher knows, in its canonical order, and the trusted service that serves it.
const SURFACE_SERVICES = {computer: 'sky', browser: 'browser'};
const SURFACES = Object.keys(SURFACE_SERVICES);
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/;
const REASON = /^[a-z][a-z_]{0,63}$/;
const ownedPath = relative => realpathSync(fileURLToPath(new URL(relative, import.meta.url)));

// The production trusted sky service, and the owned directories whose modules registered services import (the
// trusted worker refuses any import whose real path lies outside NODE_REPL_TRUSTED_CODE_PATHS).
export const SKY_SERVICE = ownedPath('../services/sky.mjs');
export const BROWSER_SERVICE = ownedPath('../services/browser.mjs');
export const SERVICE_SUPPORT_DIRS = [ownedPath('../secrets')];
// cua's own browser service (docs/doperpowers/specs/2026-10-13-own-browser-service-design.md): the default selection,
// trusted only when the launch selects it.
export const BROWSER_SERVICE_IMPL_DIR = ownedPath('../browser-service');
// cua's own REPL host: the supervisor a launch of it runs, and the directory of its code (kernel, worker runtime and
// vendored parser), which is trusted code for the scoped preflight.
export const REPL_HOST_DIR = ownedPath('../repl-host');
export const REPL_HOST_SUPERVISOR = ownedPath('../repl-host/supervisor.mjs');
const BROWSER_SERVICES = ['cua', 'vendor'];
const REPL_HOSTS = ['cua', 'vendor'];
// The oldest Node major cua's own REPL host runs on (its kernel's vm modules); the vendor host keeps its pinned Node.
export const NODE_FLOOR = 24;

// `browserBackends` ({hostPaths, defaultInstance}) is the process's MAWS backends (src/chrome/client-mode.mjs), when
// CUA_BROWSER_BACKENDS configured any. `browserSelection` (browserSelectionFor) and `replHost` (replHostFor) are the
// connection's, resolved once at its open so every launch of it (an idle relaunch too) runs what it resolved then; a
// caller that gives neither, a single launch, has them resolved here from `ambient` and `home`. `ownNode` is the own
// host's Node (ownHostNode) when the connection resolved it already; otherwise a launch of the own host resolves it.
export function buildLaunch({runtime, home, sessionId, surfaces = ['computer'], services, secretsDir, secretsProjectDir, secretsUnavailable, ambient = process.env, browserBackends = null, browserSelection, replHost, ownNode}) {
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) fail('invalid_session_id', 'session id must be 1-128 letters, digits or dashes');
  const enabled = canonicalSurfaces(surfaces);
  if (secretsUnavailable !== undefined && (typeof secretsUnavailable !== 'string' || !REASON.test(secretsUnavailable))) fail('invalid_secrets_reason', 'the secrets-unavailable reason must be a lowercase code');
  if (secretsDir !== undefined && (typeof secretsDir !== 'string' || !isAbsolute(secretsDir))) fail('invalid_secrets_dir', 'the secret store directory must be an absolute path');
  if (secretsProjectDir !== undefined && (typeof secretsProjectDir !== 'string' || !isAbsolute(secretsProjectDir) || !secretsDir)) fail('invalid_secrets_dir', 'the project secret store directory must be an absolute path beside the global one');
  browserSelection = enabled.includes('browser') ? (browserSelection ?? browserSelectionFor(ambient, home)) : null;
  replHost ??= replHostFor({platform: runtime.manifest.platform, surfaces: enabled, ambient, browserSelection});
  const own = replHost.host === 'cua';
  if (own) ownNode ??= ownHostNode({ambient});
  const browserService = browserSelection?.service ?? null;
  const owned = homeLayout(realHome(home));
  const p = runtime.paths;
  const linux = runtime.manifest.platform === 'linux';

  const env = {};
  for (const key of AMBIENT_ALLOWLIST) if (typeof ambient[key] === 'string') env[key] = ambient[key];
  if (linux) Object.assign(env, desktopSessionEnv(ambient));
  const trustedCodePaths = own ? [REPL_HOST_DIR, p.moduleDir] : [p.moduleDir];
  Object.assign(env, {PATH: FIXED_PATH, CODEX_HOME: owned.codexHome});
  Object.assign(env, own
    ? {CUA_REPL_ENABLED_SURFACES: enabled.join(','), CUA_REPL_NODE_PATH: ownNode, CUA_REPL_OWNED_GROUP: '1'}
    : {CUA_REPL_NODE_REPL_PATH: p.nodeRepl, CUA_REPL_ENABLED_SURFACES: enabled.join(','), NODE_REPL_NODE_PATH: p.node, NODE_REPL_NODE_MODULE_DIRS: p.moduleDir});
  const names = own
    ? {services: 'CUA_REPL_TRUSTED_SERVICES', codePaths: 'CUA_REPL_TRUSTED_CODE_PATHS', pipeTimeout: 'CUA_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS'}
    : {services: 'NODE_REPL_TRUSTED_SERVICES', codePaths: 'NODE_REPL_TRUSTED_CODE_PATHS', pipeTimeout: 'NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS'};
  if (services && Object.keys(services).length) {
    const registered = trustedServices(services, enabled);
    env[names.services] = JSON.stringify(registered);
    for (const dir of [...Object.values(registered).map(module => dirname(module)), ...SERVICE_SUPPORT_DIRS]) if (!trustedCodePaths.includes(dir)) trustedCodePaths.push(dir);
  }
  if (browserService === 'cua' && !trustedCodePaths.includes(BROWSER_SERVICE_IMPL_DIR)) trustedCodePaths.push(BROWSER_SERVICE_IMPL_DIR);
  Object.assign(env, {
    [names.codePaths]: trustedCodePaths.join(':'),
    [names.pipeTimeout]: '1000',
    NODE_REPL_DISABLE_ANALYTICS: '1',
    CODEX_CLI_PATH: p.codexCli,
  });
  if (enabled.includes('computer')) Object.assign(env, linux ? {OAI_SKY_LINUX_BIN: p.skyLinuxBin} : {SKY_CUA_SERVICE_PATH: p.skyServiceApp}, {CUA_SKY_VENDOR_SERVICE: p.skyVendorService});
  if (enabled.includes('browser')) {
    Object.assign(env, {CUA_BROWSER_VENDOR_SERVICE: p.browserVendorService, BROWSER_USE_AVAILABLE_BACKENDS: 'chrome'});
    env.CUA_BROWSER_SERVICE = browserService;
    const paths = launchBackendPaths(home, {clientHosts: browserBackends?.hostPaths ?? null});
    if (paths) env.BROWSER_USE_BACKEND_PATHS = paths.join(':');
    if (browserBackends) {
      if (browserBackends.defaultInstance) env.BROWSER_USE_PREFERRED_EXTENSION_INSTANCE_ID = browserBackends.defaultInstance;
      env.CUA_BROWSER_DEFAULT_INSTANCE = browserBackends.defaultInstance ?? MAWS_INSTANCE_MARKER;
    }
  }
  if (secretsDir) {
    env[STORE_ENV.dir] = secretsDir;
    if (secretsProjectDir) env[STORE_ENV.projectDir] = secretsProjectDir;
  } else if (secretsUnavailable) env[STORE_ENV.unavailable] = secretsUnavailable;
  return {command: own ? ownNode : p.node, args: own ? ['--disable-sigusr1', REPL_HOST_SUPERVISOR] : [p.cuaRepl], env, cwd: join(owned.run, sessionId), replHost: {host: replHost.host, reason: replHost.reason}};
}

// The browser service a launch from `home` gets, and why -> {service: 'cua' | 'vendor', reason}. A CUA_BROWSER_SERVICE
// the caller sets wins (`explicit`; exactly `cua` or `vendor`). Unset or empty, it follows the home's active Chrome
// route, the one backend discovery uses (src/chrome/route.mjs chromeRoute: the most recent registration;
// src/chrome/discovery.mjs), so the service and the sockets it is given always agree: cua's on the cua route
// (`cua_route`) or with MAWS's in-app browser configured (`maws_client_mode`, CUA_BROWSER_BACKENDS listing a socket, as
// src/chrome/client-mode.mjs configuredBackends reads it); otherwise the vendor's (`chatgpt_extension_route`: the
// ChatGPT extension's registration is the most recent, or there is none, which is that route as effectiveRoute reads
// it), whose backends cua's service refuses. Resolved at each launch, so a later `cua chrome register` moves the next
// launch. Shared with the live runners' attestation (scripts/accept/service-attest.mjs). When #79 removes the vendor
// route this collapses to a blanket `cua` default.
export function browserServiceFor(ambient, home) {
  const {service, reason} = browserSelectionFor(ambient, home);
  return {service, reason};
}

// browserServiceFor's choice with its provenance, which the REPL host selection needs (replHostFor):
// {service, reason, explicit, route, registration}. `explicit`: CUA_BROWSER_SERVICE was set (nonempty) in `ambient`, the
// caller's original environment, never a value a caller wrote back after resolving it. `route`: the home's active
// Chrome route (chromeRoute: 'cua', 'vendor' or null), whatever decided the service. `registration` ({route, at}, `at`
// its record's write time in epoch ms): the registration that decided an unset selection, or null when none did (an
// explicit value, MAWS client mode, or a home with no registration).
export function browserSelectionFor(ambient, home) {
  const value = ambient.CUA_BROWSER_SERVICE;
  const explicit = value !== undefined && value !== '';
  if (explicit && !BROWSER_SERVICES.includes(value)) fail('invalid_browser_service', `CUA_BROWSER_SERVICE must be ${BROWSER_SERVICES.join(' or ')}`);
  const route = chromeRoute(home);
  const decidedBy = which => ({route: which, at: registrationTimes(home)[which]});
  if (explicit) return {service: value, reason: 'explicit', explicit, route, registration: null};
  if (route === 'cua') return {service: 'cua', reason: 'cua_route', explicit, route, registration: decidedBy('cua')};
  if (ambient.CUA_BROWSER_BACKENDS?.split(':').some(Boolean)) return {service: 'cua', reason: 'maws_client_mode', explicit, route, registration: null};
  return {service: 'vendor', reason: 'chatgpt_extension_route', explicit, route, registration: route === 'vendor' ? decidedBy('vendor') : null};
}

// What decided a browser selection, in words: the route and the registration that made it active, or their absence.
export function describeBrowserRoute({service, reason, registration}) {
  const at = ms => new Date(ms).toISOString();
  if (reason === 'explicit') return `CUA_BROWSER_SERVICE=${service}`;
  if (reason === 'cua_route') return `the cua route, by cua's registration (cua chrome register) of ${at(registration.at)}`;
  if (reason === 'maws_client_mode') return 'MAWS\'s in-app browser (CUA_BROWSER_BACKENDS), no registration deciding';
  return registration ? `the ChatGPT extension route, by its registration (cua chrome register --vendor) of ${at(registration.at)}`
    : 'the ChatGPT extension route, as a home with no Chrome registration is read';
}

// The REPL host a launch with `surfaces` on `platform` runs, and why -> {host: 'cua' | 'vendor', reason}. `browserSelection`
// (browserSelectionFor; required with the browser surface, ignored without it, as the launch ignores CUA_BROWSER_SERVICE
// then) carries the original explicitness. CUA_REPL_HOST in `ambient`, the caller's original environment:
//   vendor   always the vendor host (`explicit`): the rollback.
//   cua      cua's own host (`explicit`) where it can run, else refused before launch (repl_host_refused), never
//            downgraded: with CUA_BROWSER_SERVICE=vendor (a contradictory pair); with the browser surface on a vendor
//            browser route resolved from the home (named, with the registration that decided it and how to move the
//            home); with the computer surface on macOS, whose native helper accepts only the vendor host's node_repl as
//            a peer until #117.
//   unset or empty   the vendor host: `vendor_browser_route` when the browser surface's service is the vendor's (only the
//            vendor host runs it), `macos_native_peer_requires_vendor` for the computer surface on macOS (MAWS client
//            mode does not change that), else `staged_vendor_default`: the sessions #116's last stage (M5) moves to
//            cua's own host by default (`linux`, `browser_only`).
// Any other value is refused (invalid_repl_host).
export function replHostFor({platform, surfaces, ambient, browserSelection}) {
  const value = ambient.CUA_REPL_HOST;
  const requested = value === undefined || value === '' ? null : value;
  if (requested !== null && !REPL_HOSTS.includes(requested)) fail('invalid_repl_host', `CUA_REPL_HOST must be ${REPL_HOSTS.join(' or ')}`);
  if (requested === 'vendor') return {host: 'vendor', reason: 'explicit'};
  if (surfaces.includes('browser') && !browserSelection) throw new TypeError('replHostFor: the browser surface needs its browser selection');
  const browser = surfaces.includes('browser') ? browserSelection : null;
  const macosComputer = platform === 'darwin' && surfaces.includes('computer');
  if (requested === 'cua') {
    if (browser?.service === 'vendor' && browser.explicit)
      fail('repl_host_refused', 'CUA_REPL_HOST=cua and CUA_BROWSER_SERVICE=vendor contradict each other: cua\'s own REPL host runs only cua\'s browser service, and the vendor\'s runs only on the vendor host. To move to cua\'s host, unset CUA_BROWSER_SERVICE (or set it to cua); to keep the vendor\'s service, unset CUA_REPL_HOST or use CUA_REPL_HOST=vendor');
    if (browser?.service === 'vendor')
      fail('repl_host_refused', `CUA_REPL_HOST=cua needs cua's own browser service, but this home's browser service resolves to the vendor's: ${describeBrowserRoute(browser)}. Run \`cua chrome register\` to move this home to the cua route, or unset CUA_REPL_HOST (or use CUA_REPL_HOST=vendor) to keep the vendor host`);
    if (macosComputer)
      fail('repl_host_refused', 'CUA_REPL_HOST=cua is not supported with the computer surface on macOS: its computer-use helper accepts only the vendor host\'s node_repl as a peer until #117 replaces it. Use CUA_SHIM_SURFACES=browser for cua\'s own host, or unset CUA_REPL_HOST (or use CUA_REPL_HOST=vendor)');
    return {host: 'cua', reason: 'explicit'};
  }
  if (browser?.service === 'vendor') return {host: 'vendor', reason: 'vendor_browser_route'};
  if (macosComputer) return {host: 'vendor', reason: 'macos_native_peer_requires_vendor'};
  return {host: 'vendor', reason: 'staged_vendor_default'};
}

// The Node cua's own REPL host runs on: the first of an explicit CUA_NODE (an absolute path), the node running cua
// (`execPath`) and the first `node` on the caller's PATH whose `--version` (`versionOf`) is at least NODE_FLOOR, as its
// real path, which the launch can name in an environment whose PATH is fixed. None: refused (repl_host_node), naming
// every candidate tried and its version. The vendor host's pinned Node is never a candidate.
export function ownHostNode({ambient, execPath = process.execPath, versionOf = nodeVersion}) {
  const explicit = ambient.CUA_NODE || null;
  if (explicit !== null && !isAbsolute(explicit)) fail('invalid_setting', 'CUA_NODE must be the absolute path of a Node executable');
  const tried = [];
  for (const [label, path] of [['CUA_NODE', explicit], ['the node running cua', execPath], ['node on PATH', nodeOnPath(ambient.PATH)]]) {
    if (!path) { tried.push(`${label} (${label === 'CUA_NODE' ? 'unset' : 'not found'})`); continue; }
    let real;
    try { real = realpathSync(path); } catch { tried.push(`${label} ${path} (not found)`); continue; }
    const version = versionOf(real);
    if (version && Number(version.slice(1).split('.')[0]) >= NODE_FLOOR) return real;
    tried.push(`${label} ${path} (${version ?? 'no readable version'})`);
  }
  fail('repl_host_node', `cua's own REPL host needs Node ${NODE_FLOOR} or later, and none was found: ${tried.join(', ')}; set CUA_NODE to the absolute path of a Node ${NODE_FLOOR} or later, or run cua with one (the vendor host's pinned Node is never used for it)`);
}

// `vX.Y.Z` as the executable at `path` reports it, or null.
function nodeVersion(path) {
  try {
    const out = execFileSync(path, ['--version'], {encoding: 'utf8', timeout: 5000, env: {PATH: FIXED_PATH}, stdio: ['ignore', 'pipe', 'ignore']});
    return out.trim().match(/^v\d+\.\d+\.\d+/)?.[0] ?? null;
  } catch { return null; }
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
