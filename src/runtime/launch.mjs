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
//                                            directory and the owned modules services import (src/secrets). Never
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
//   CUA_SECRETS_UNAVAILABLE                  otherwise: why (e.g. secrets_disabled), so the trusted services fail a
//                                            {{secret:…}} reference with that reason
// Deliberately never set: NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS, NODE_REPL_UNTRUSTED_ENV_ALLOWLIST (cells see only what the
// vendor launcher adds), SKY_CUA_SERVICE_NATIVE_PIPE_PATH, NODE_REPL_HOST_SERVICES_PIPE_PATH,
// NODE_REPL_WORKER_WRAPPER, NODE_REPL_DENIED_PATHS.
//
// The working directory is <home>/run/<sessionId>; model cells can see it, so it is never the caller's directory or
// the repository. The caller creates it (mode 0700) before spawning and removes it when the connection ends.
import {realpathSync, statSync} from 'node:fs';
import {dirname, isAbsolute, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fail} from './errors.mjs';
import {homeLayout, realHome} from './layout.mjs';
import {STORE_ENV} from '../secrets/store.mjs';
import {desktopSessionEnv} from './linux-desktop.mjs';
import {launchBackendPaths, MAWS_INSTANCE_MARKER} from '../chrome/discovery.mjs';

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

// `browserBackends` ({hostPaths, defaultInstance}) is the process's MAWS backends (src/chrome/client-mode.mjs), when
// CUA_BROWSER_BACKENDS configured any.
export function buildLaunch({runtime, home, sessionId, surfaces = ['computer'], services, secretsDir, secretsUnavailable, ambient = process.env, browserBackends = null}) {
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) fail('invalid_session_id', 'session id must be 1-128 letters, digits or dashes');
  const enabled = canonicalSurfaces(surfaces);
  if (secretsUnavailable !== undefined && (typeof secretsUnavailable !== 'string' || !REASON.test(secretsUnavailable))) fail('invalid_secrets_reason', 'the secrets-unavailable reason must be a lowercase code');
  if (secretsDir !== undefined && (typeof secretsDir !== 'string' || !isAbsolute(secretsDir))) fail('invalid_secrets_dir', 'the secret store directory must be an absolute path');
  const owned = homeLayout(realHome(home));
  const p = runtime.paths;
  const linux = runtime.manifest.platform === 'linux';

  const env = {};
  for (const key of AMBIENT_ALLOWLIST) if (typeof ambient[key] === 'string') env[key] = ambient[key];
  if (linux) Object.assign(env, desktopSessionEnv(ambient));
  const trustedCodePaths = [p.moduleDir];
  Object.assign(env, {
    PATH: FIXED_PATH,
    CODEX_HOME: owned.codexHome,
    CUA_REPL_NODE_REPL_PATH: p.nodeRepl,
    CUA_REPL_ENABLED_SURFACES: enabled.join(','),
    NODE_REPL_NODE_PATH: p.node,
    NODE_REPL_NODE_MODULE_DIRS: p.moduleDir,
  });
  if (services && Object.keys(services).length) {
    const registered = trustedServices(services, enabled);
    env.NODE_REPL_TRUSTED_SERVICES = JSON.stringify(registered);
    for (const dir of [...Object.values(registered).map(module => dirname(module)), ...SERVICE_SUPPORT_DIRS]) if (!trustedCodePaths.includes(dir)) trustedCodePaths.push(dir);
  }
  Object.assign(env, {
    NODE_REPL_TRUSTED_CODE_PATHS: trustedCodePaths.join(':'),
    NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS: '1000',
    NODE_REPL_DISABLE_ANALYTICS: '1',
    CODEX_CLI_PATH: p.codexCli,
  });
  if (enabled.includes('computer')) Object.assign(env, linux ? {OAI_SKY_LINUX_BIN: p.skyLinuxBin} : {SKY_CUA_SERVICE_PATH: p.skyServiceApp}, {CUA_SKY_VENDOR_SERVICE: p.skyVendorService});
  if (enabled.includes('browser')) {
    Object.assign(env, {CUA_BROWSER_VENDOR_SERVICE: p.browserVendorService, BROWSER_USE_AVAILABLE_BACKENDS: 'chrome'});
    const paths = launchBackendPaths(home, {clientHosts: browserBackends?.hostPaths ?? null});
    if (paths) env.BROWSER_USE_BACKEND_PATHS = paths.join(':');
    if (browserBackends) {
      if (browserBackends.defaultInstance) env.BROWSER_USE_PREFERRED_EXTENSION_INSTANCE_ID = browserBackends.defaultInstance;
      env.CUA_BROWSER_DEFAULT_INSTANCE = browserBackends.defaultInstance ?? MAWS_INSTANCE_MARKER;
    }
  }
  if (secretsDir) env[STORE_ENV.dir] = secretsDir;
  else if (secretsUnavailable) env[STORE_ENV.unavailable] = secretsUnavailable;
  return {command: p.node, args: [p.cuaRepl], env, cwd: join(owned.run, sessionId)};
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
