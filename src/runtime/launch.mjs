// The launch record for one MCP connection's runtime, with an allowlisted environment built only from the resolved
// runtime, owned paths under CUA_HOME and the caller's explicit services/secrets settings: on macOS the relocated vendor
// `node` running the relocated `cua-repl` entry, or cua's own REPL host (below); on Linux cua's own host only, from cua's
// own runtime (#171 M6a: the ModuleTree, the managed Node, the sandbox helper and cua's engine), never the vendor's tree,
// whose engine cua 0.30.0 retired there (M6b). Nothing is read from an installed desktop app or its plugin cache.
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
//                                            (an SSH session) it is derived as unix:path=$XDG_RUNTIME_DIR/bus. A
//                                            confined cell has no socket to reach X with (#115: only the trusted
//                                            worker has the network); under disabled a model cell can reach X
//                                            directly, and the trusted sky wrapper is then not a boundary
//   PATH                                     fixed system path
//   CUA_SANDBOX_DENY_READ                    JSON {deny, reexpose, metadataOnly, tiers}: what the kernel may not read,
//                                            by real path, and what is re-exposed inside it (src/sandbox/policy.mjs
//                                            denyListFor), resolved once here from the same store directories and HOME
//                                            the worker gets; not for a disabled connection
//   CODEX_HOME                               macOS vendor host only: <home>/state/codex, node_repl's config and
//                                            per-user approvals (cua's own host launches through no Codex CLI)
//   CUA_REPL_NODE_REPL_PATH                  relocated node_repl (required by the vendor launcher)
//   CUA_REPL_ENABLED_SURFACES                required by the vendor launcher: `computer` (the default), `browser` or
//                                            `computer,browser`, from the caller's `surfaces`
//   NODE_REPL_NODE_PATH, NODE_REPL_NODE_MODULE_DIRS    relocated vendor node and its module tree
//   NODE_REPL_TRUSTED_CODE_PATHS             the vendor module tree, src/sandbox and bin/ (cua's sandbox and its compat
//                                            executable, which run outside every sandbox) and, with services registered, each service's
//                                            directory and the owned modules services import (src/secrets), on macOS
//                                            with the sky wrapper src/services/engine, cua's own native engine service,
//                                            which CUA_SKY_SERVICE may name (#117; it may not exist yet), and with the
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
//                                            cua's profiles, the native helper's `app-server`). No unsandboxed fallback:
//                                            node_repl runs its children unconfined without it, so the vendor-host
//                                            preflight refuses a launch whose value is not an executable file
//                                            (src/runtime/sandbox.mjs). Never for cua's own host
//   CUA_COMPAT_NODE                          macOS vendor host: the vendor's pinned Node, which the compat executable's
//                                            `app-server` runs on; it reaches the native helper through `open`. Its
//                                            `sandbox` takes the same Node from the session's compat settings (below),
//                                            since node_repl hands the kernel's launcher a filtered environment
//   SKY_CUA_SERVICE_PATH                     computer surface, darwin, the vendor engine selected: relocated helper app,
//                                            opened by the vendor through LaunchServices (never with cua's engine, so
//                                            nothing may open the vendor helper)
//   CUA_SKY_SERVICE                          computer surface: the sky service module the trusted wrapper delegates to:
//                                            on macOS the vendor's (@oai/sky/service), or with cua's engine selected
//                                            (nativeEngineFor) cua's own, src/services/engine/service.mjs, on either
//                                            host; on Linux (#171 M3) src/services/engine/linux/service.mjs, so no
//                                            vendor module serves the computer surface there
//   CUA_ENGINE_BIN                           computer surface, linux: cua-engine, installed under
//                                            <home>/engine/linux or named by CUA_LINUX_ENGINE_BIN (its canonical path,
//                                            the selection's), which cua's Linux service spawns as a child over stdio
//   CUA_DESKTOP_MODE                         computer surface, cua's engine selected: the device mode (desktopModeFor:
//                                            shared or dedicated), which cua's Linux service passes to the engine as
//                                            --desktop, and cua's macOS service names in its connection's ping (#282:
//                                            one macOS engine serves many sessions, so the mode is per connection)
//   CUA_ENGINE_APP                           computer surface, darwin, cua's engine selected: the approved engine bundle
//                                            (src/runtime/engine.mjs installedEngine), which cua's service connects to at
//                                            the engine.sock beside it and launches when nothing answers there
//   CUA_ENGINE_SCREENSHOTS                   computer surface, darwin: where cua's own engine writes screenshots, under
//                                            the session's run directory, which the kernel may read; the engine creates
//                                            it (outside every sandbox, never through a symbolic link), since the
//                                            worker writes nothing in the default mode (#117)
//   CUA_CURSOR_LABEL, CUA_CURSOR_COLOR, CUA_CURSOR   computer surface, darwin, cua's engine selected: the session's agent
//                                            cursor (#235), its label (when any source gives one), its #rrggbb colour
//                                            and, when off, CUA_CURSOR=0: the connection's `cursor` context, resolved
//                                            on this trusted side (./cursor-identity.mjs, the sminos name among its
//                                            sources, or a remote client's checked context), else resolved here from
//                                            `ambient` without the sminos name. The service reads only these
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
// launch record also carries `replHost` ({host, reason}, replHostFor), the REPL host it runs, and `nativeEngine`, the
// engine attestation the proxy puts on every js result of a macOS computer session ({engine, version, build}: cua's
// engine's version and build from its approved bundle, the vendor's helper bundle version and runtime release; null
// elsewhere; docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, EngineAttestation). CUA_REPL_HOST, CUA_NODE,
// CUA_NATIVE_ENGINE and CUA_LINUX_ENGINE_BIN are read by the proxy only and never reach the runtime's environment. A
// Linux launch also carries `engineRoot`, <home>/engine, and `linuxEngine`, the cua engine its computer surface runs
// ({path: its canonical path, the one CUA_ENGINE_BIN names; lookup: the path it was found by; source}, null without the
// computer surface), which the scoped preflight protects, the lookup's links included. Deliberately never set:
// NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS, NODE_REPL_UNTRUSTED_ENV_ALLOWLIST (cells see only what the vendor launcher
// adds), SKY_CUA_SERVICE_NATIVE_PIPE_PATH, NODE_REPL_HOST_SERVICES_PIPE_PATH, NODE_REPL_WORKER_WRAPPER,
// NODE_REPL_DENIED_PATHS.
//
// cua's own REPL host (replHost `cua`, src/repl-host/supervisor.mjs) is launched instead as the Node ownHostNode resolves
// (at least NODE_FLOOR: CUA_NODE, the Node `cua install` pins under $CUA_HOME/node, else on macOS the user's; never the
// vendor's pinned Node) running the supervisor with --disable-sigusr1, under the same allowlist, surfaces, services and secrets
// settings, with the host's own settings under owned names in place of the vendor's NODE_REPL_ ones (no vendor
// launcher, node_repl or vendor Node path is set). Its children's sandbox is cua's own (src/sandbox), with neither
// CODEX_CLI_PATH nor CODEX_HOME:
//   CUA_REPL_SANDBOX_EXEC                    macOS: /usr/bin/sandbox-exec, which the supervisor runs each child under
//                                            with the profile src/sandbox renders for its role
//   CUA_REPL_SANDBOX_HELPER, CUA_REPL_SANDBOX_HELPER_SHA256   Linux: the pinned sandbox helper,
//                                            <home>/sandbox/<upstreamTag>/codex-linux-sandbox (src/sandbox/linux.mjs, the
//                                            pin runtime/sandbox/linux-sandbox.json), and its pinned SHA-256, which the
//                                            connection's preflight and the supervisor check the placed bytes against
//                                            before each launch
//   CUA_REPL_WORKER_NETWORK=enabled          Linux with the computer surface: the trusted worker's profile has the
//                                            network, so cua-engine (its child) reaches the X display and the session
//                                            bus; the kernel's never has
//   CUA_REPL_KERNEL_DIR                      Linux under the default mode: the kernel's own directory outside run/,
//                                            `kernelDir` (below)
//   CUA_REPL_NODE_PATH                      the resolved Node the kernel runs on
//   CUA_REPL_TRUSTED_CODE_PATHS              src/repl-host (the host's own code), src/cua-api and docs/cua-api (the cua
//                                            facade the banner imports and the documents it reads), then what
//                                            NODE_REPL_TRUSTED_CODE_PATHS lists for the vendor, but on Linux the module
//                                            tree: cua's ModuleTree there is no trusted code, since nothing trusted
//                                            imports from it. The scoped preflight protects these
//                                            (src/runtime/sandbox.mjs trustedCodePathsOf)
//   CUA_REPL_TRUSTED_SERVICES                with services registered, as NODE_REPL_TRUSTED_SERVICES: what the trusted
//                                            worker (src/repl-host/trusted-worker.mjs) loads; every service must lie
//                                            inside a trusted code path by real path (sandbox.mjs
//                                            assertTrustedServicesContained refuses the launch otherwise)
//   CUA_REPL_TRUSTED_RPC_ENABLED=1           with services registered: cells get nodeRepl.rpc
//   CUA_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS=1000
//   CUA_REPL_OWNED_GROUP=1                   the supervisor runs in the process group the proxy's anchor owns
//                                            (src/mcp/upstream.mjs), so it may reap what a finished kernel left there
//   CUA_REPL_NODE_MODULE_DIRS                the runtime's module tree, where cells resolve package imports as the vendor
//                                            launcher lets them: on macOS the vendor's, on Linux cua's ModuleTree under
//                                            either engine (#171 M6a, F5)
//   CUA_REPL_JS_BANNER                       imports cua's own facade bootstrap (src/cua-api/bootstrap.mjs, by file
//                                            URL), which installs `cua` (and `agent`) for the enabled surfaces
//   CUA_REPL_UNTRUSTED_ENV_ALLOWLIST         CUA_REPL_ENABLED_SURFACES,CUA_REPL_BROWSER_ENV, as the vendor launcher adds
//   CUA_REPL_TOOL_OVERRIDES                  the vendor launcher's tool text for this platform and these surfaces
//                                            (src/repl-host/instructions.mjs), as NODE_REPL_TOOL_OVERRIDES
//   NODE_REPL_DISABLE_ANALYTICS=1            kept: the retained vendor sky service reads it
//
// The launch record also carries `managedNodeRoot`, <home>/node (the Node `cua install` places for the own host),
// `stagingRoot`, <home>/staging (where install verifies what it places), and `sandboxHelperRoot`, <home>/sandbox (the
// Linux helper `cua install` places, which runs outside every sandbox and re-executes itself inside one), and on Linux
// `modulesRoot`, <home>/modules (the ModuleTree cells import from, and cua's own CLI loads classic-level from), which the
// scoped preflight protects for either host (src/runtime/sandbox.mjs assertSandboxFits); none is in `env`.
// A macOS vendor-host launch also carries `compat` ({home, sessionId, node}): createLaunchDirs writes the session's
// compat settings from it (src/sandbox/compat-settings.mjs: <home>/state/compat/<sessionId>.json with the deny list and
// the session temp, and .node with the Node), which the run directory's removal removes too (removeLaunchDirs, and
// src/runtime/run-dir.mjs for a session's release or sweep).
// The working directory is <home>/run/<sessionId>; model cells can see it, so it is never the caller's directory or
// the repository. The caller creates it and the session temp inside it (mode 0700, createLaunchDirs) before spawning
// and removes it when the connection ends. The launch record carries both (`cwd`, `sessionTmp`) and the deny list it
// resolved (`denyRead`; null for a disabled connection, `sandbox`), which the scoped preflight protects except for those
// two (src/runtime/sandbox.mjs).
// On Linux under the default mode the record also carries `kernelDir`, <home>/kernel/<sessionId>, named to the host as
// CUA_REPL_KERNEL_DIR: run/ is denied to the kernel whole there as under scoped, and since nothing is writable to it the
// helper re-binds nothing of run/<sessionId> inside the denied run/ (it re-binds only writable roots, #115 M0c), so the
// kernel works in that directory instead, with its tmp/ as its TMPDIR (src/repl-host/supervisor.mjs kernelLaunch). It
// holds nothing but the kernel's lifeline while it runs; createLaunchDirs makes it, and it goes with the session
// (removeLaunchDirs, src/runtime/run-dir.mjs). Null otherwise.
import {accessSync, chmodSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, rmSync, statSync} from 'node:fs';
import {homedir} from 'node:os';
import {basename, dirname, isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {CuaError, fail} from './errors.mjs';
import {defaultHome, homeLayout, realHome} from './layout.mjs';
import {spawnSync} from 'node:child_process';
import {ENGINE_RECORD, executableFile, linuxEnginePath, verifiedLinuxEngineVersion} from './linux-engine.mjs';
import {MIN_ENGINE_VERSION, engineVersionOf, isOlder} from '../services/engine/linux/client.mjs';
import {STORE_ENV} from '../secrets/store.mjs';
import {desktopSessionEnv} from './linux-desktop.mjs';
import {launchBackendPaths, MAWS_INSTANCE_MARKER} from '../chrome/discovery.mjs';
import {assertTrustedServicesContained, helperOutsideVendorTree} from './sandbox.mjs';
import {toolOverrides} from '../repl-host/instructions.mjs';
import {cuaNodeFrom} from '../mcp/surface.mjs';
import {NODE_FLOOR, managedNode, managedNodeIntoVendorTree, nodeVersion, readNodePointer} from './managed-node.mjs';
import {ownInstaller} from './manifest.mjs';
import {ENGINE_HINT} from './installer.mjs';
import {outsideVendorTree} from './vendor-tree.mjs';
import {denyListFor, realDenyList} from '../sandbox/policy.mjs';
import {SEATBELT_EXEC} from '../sandbox/seatbelt.mjs';
import {helperFor} from '../sandbox/linux.mjs';
import {removeCompatSettings, SESSION_ID, writeCompatSettings} from '../sandbox/compat-settings.mjs';
import {engineDirectory, enginePaths, installedEngine} from './engine.mjs';
import {engineSettingsPath, readEngineSettings} from './engine-sign.mjs';
import {plistString} from '../services/engine/client.mjs';
import {cursorContext, cursorEnv} from './cursor-identity.mjs';

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
// cua's own native engine service (#117), which the sky wrapper delegates to when CUA_SKY_SERVICE names it, on either
// host; trusted with the wrapper on macOS. By its spelled path under the real src/services: it may not exist yet, and a
// trusted root that does not exist is ignored (src/runtime/sandbox.mjs assertTrustedServicesContained, the worker).
export const ENGINE_SERVICE_DIR = join(ownedPath('../services'), 'engine');
// The module CUA_SKY_SERVICE names when cua's engine is selected (nativeEngineFor).
export const ENGINE_SERVICE = join(ENGINE_SERVICE_DIR, 'service.mjs');
// cua's own Linux service (#171 M3), CUA_SKY_SERVICE for cua's engine on Linux. It lies under src/services, the sky
// wrapper's directory, which the launch already trusts with the wrapper.
export const LINUX_ENGINE_SERVICE = join(ENGINE_SERVICE_DIR, 'linux', 'service.mjs');
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
// selection carries the Node it resolved (`node`), which the launch runs. `cursor` ({label, color, enabled}) is the
// connection's agent cursor context (./cursor-identity.mjs resolveCursorContext).
export function buildLaunch({runtime, home, sessionId, surfaces = ['computer'], services, secretsDir, secretsProjectDir, secretsUnavailable, ambient = process.env, browserBackends = null, replHost, resolveOwnNode, sandbox, cursor = null}) {
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) fail('invalid_session_id', 'session id must be 1-128 letters, digits or dashes');
  const enabled = canonicalSurfaces(surfaces);
  if (secretsUnavailable !== undefined && (typeof secretsUnavailable !== 'string' || !REASON.test(secretsUnavailable))) fail('invalid_secrets_reason', 'the secrets-unavailable reason must be a lowercase code');
  if (secretsDir !== undefined && (typeof secretsDir !== 'string' || !isAbsolute(secretsDir))) fail('invalid_secrets_dir', 'the secret store directory must be an absolute path');
  if (secretsProjectDir !== undefined && (typeof secretsProjectDir !== 'string' || !isAbsolute(secretsProjectDir) || !secretsDir)) fail('invalid_secrets_dir', 'the project secret store directory must be an absolute path beside the global one');
  replHost ??= replHostFor({platform: runtime.manifest.platform, arch: runtime.manifest.arch, surfaces: enabled, ambient, home, resolveOwnNode});
  const own = replHost.host === 'cua';
  const ownNode = own ? replHost.node : undefined;
  if (own && typeof ownNode !== 'string') throw new TypeError('buildLaunch: a cua selection carries the Node it resolved');
  const owned = homeLayout(realHome(home));
  const p = runtime.paths;
  const linux = runtime.manifest.platform === 'linux';

  // cua's own host confines its children with cua's own sandbox (macOS: sandbox-exec; Linux: the pinned helper), and the
  // macOS vendor host through cua's compat executable. Linux has no vendor host (replHostFor).
  if (linux && !own) fail('repl_host_refused', 'the vendor host is retired on Linux (#115); only cua\'s own host launches there');
  // The engine a Linux computer session drives, cua's (`bin`), as its selection resolved it once (linuxEngineFor), so
  // every launch of a connection, an idle relaunch too, runs what its open resolved (#171 M6a). There is no other: the
  // vendor's was retired on Linux by cua 0.30.0 (M6b), and its selection never reaches a launch.
  const linuxComputer = linux && enabled.includes('computer');
  const linuxEngine = linuxComputer && replHost.engine?.engine === 'cua' ? replHost.engine.bin : null;
  if (linuxComputer && !linuxEngine) throw new TypeError('buildLaunch: a Linux computer selection carries cua\'s engine it resolved (`bin`)');
  const compat = !own;
  const cwd = join(owned.run, sessionId);
  const sessionTmp = join(cwd, 'tmp');
  const kernelDir = linux && sandbox === 'default' ? join(owned.kernel, sessionId) : null;
  // A disabled connection confines nothing, so it neither needs the deny list nor fails on discovering it (an unreadable
  // store refuses only confined launches). Its launch carries no list, and the supervisor refuses any confined call
  // without one, so it can never be confined later without its list.
  const denyRead = sandbox === 'disabled' ? null
    : realDenyList(denyListFor({home: owned.home, env: ambient, secretsDir, secretsProjectDir, sessionId, sessionTmp, platform: runtime.manifest.platform}));

  const env = {};
  for (const key of AMBIENT_ALLOWLIST) if (typeof ambient[key] === 'string') env[key] = ambient[key];
  env.TMPDIR = sessionTmp;
  if (linux) Object.assign(env, desktopSessionEnv(ambient));
  // On Linux the module tree is cua's ModuleTree, which cells import from and nothing trusted does, so it is no trusted
  // code (it is protected all the same: modulesRoot).
  const trustedCodePaths = own ? [REPL_HOST_DIR, CUA_API_DIR, CUA_API_DOCS_DIR, ...(linux ? [] : [p.moduleDir]), SANDBOX_DIR, BIN_DIR] : [p.moduleDir, SANDBOX_DIR, BIN_DIR];
  Object.assign(env, {PATH: FIXED_PATH}, denyRead ? {CUA_SANDBOX_DENY_READ: JSON.stringify(denyRead)} : {}, compat ? {CODEX_HOME: owned.codexHome} : {});
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
    if (registered.sky && !linux) trustedCodePaths.push(ENGINE_SERVICE_DIR);
  }
  if (enabled.includes('browser') && !trustedCodePaths.includes(BROWSER_SERVICE_IMPL_DIR)) trustedCodePaths.push(BROWSER_SERVICE_IMPL_DIR);
  Object.assign(env, {
    [names.codePaths]: trustedCodePaths.join(':'),
    [names.pipeTimeout]: '1000',
    NODE_REPL_DISABLE_ANALYTICS: '1',
    ...(compat ? {CODEX_CLI_PATH: compatExecutable(), CUA_COMPAT_NODE: p.node} : linux ? linuxSandboxEnv(owned.home, runtime.manifest.arch, enabled, sandbox) : {CUA_REPL_SANDBOX_EXEC: SEATBELT_EXEC}),
    ...(kernelDir ? {CUA_REPL_KERNEL_DIR: kernelDir} : {}),
  });
  // The engine a macOS computer session drives (nativeEngineFor): cua's own service and the approved bundle, on either
  // host, or the vendor's service and helper (a selection that names no engine is the vendor's: today's path).
  const cuaEngine = !linux && enabled.includes('computer') && replHost.engine?.engine === 'cua' ? replHost.engine.app : null;
  // On Linux cua's engine runs behind cua's own service (#171 M3), in the device mode the session resolves.
  if (enabled.includes('computer')) {
    if (linux) {
      Object.assign(env, {CUA_SKY_SERVICE: LINUX_ENGINE_SERVICE, CUA_ENGINE_BIN: linuxEngine.path, CUA_DESKTOP_MODE: desktopModeFor({env: ambient}).mode});
    } else {
      Object.assign(env, cuaEngine ? {CUA_SKY_SERVICE: ENGINE_SERVICE, CUA_ENGINE_APP: cuaEngine.bundlePath, CUA_DESKTOP_MODE: desktopModeFor({env: ambient}).mode,
        ...cursorEnv(cursor ?? cursorContext({env: ambient}))}
        : {SKY_CUA_SERVICE_PATH: p.skyServiceApp, CUA_SKY_SERVICE: p.skyVendorService});
      env.CUA_ENGINE_SCREENSHOTS = join(cwd, 'screenshots');
    }
  }
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
  const launch = {command: own ? ownNode : p.node, args: own ? ['--disable-sigusr1', REPL_HOST_SUPERVISOR] : [p.cuaRepl], env, cwd, sessionTmp, kernelDir, denyRead,
    replHost: {host: replHost.host, reason: replHost.reason}, managedNodeRoot: owned.node, stagingRoot: owned.staging, sandboxHelperRoot: owned.sandbox,
    engineRoot: linux ? owned.engine : null, modulesRoot: linux ? owned.modules : null, linuxEngine: linuxEngine ? {path: linuxEngine.path, lookup: linuxEngine.lookup, source: linuxEngine.source, ...(linuxEngine.links ? {links: linuxEngine.links} : {})} : null,
    nativeEngine: linux || !enabled.includes('computer') ? null : cuaEngine ? {engine: 'cua', version: cuaEngine.engineVersion, build: cuaEngine.build}
      : {engine: 'vendor', version: bundleVersion(p.skyServiceApp), build: runtime.release},
    compat: compat ? {home: owned.home, sessionId, node: p.node} : null};
  if (own) assertTrustedServicesContained(launch);
  return launch;
}

// Creates `launch`'s working directory and its session temp, and a Linux default-mode launch's kernel directory and its
// tmp/, each mode 0700 (a directory left from an earlier launch of the same session is reused and made private again),
// the runtime's CODEX_HOME where the launch has one, and a macOS vendor-host launch's compat settings (rewritten for each
// launch of the session).
export function createLaunchDirs(launch) {
  if (launch.env.CODEX_HOME) mkdirSync(launch.env.CODEX_HOME, {recursive: true, mode: 0o700});
  for (const dir of [launch.cwd, launch.sessionTmp, ...(launch.kernelDir ? [launch.kernelDir, join(launch.kernelDir, 'tmp')] : [])]) {
    mkdirSync(dir, {recursive: true, mode: 0o700});
    chmodSync(dir, 0o700);
  }
  if (launch.compat) writeCompatSettings({...launch.compat, denyRead: launch.denyRead, sessionTmp: launch.sessionTmp});
}

// Removes what createLaunchDirs made for `launch` but CODEX_HOME: its kernel directory, its run directory (with the
// session temp) and its compat settings. Throws what the removal of either directory throws.
export function removeLaunchDirs(launch) {
  if (launch.compat) removeCompatSettings(launch.compat);
  if (launch.kernelDir) rmSync(launch.kernelDir, {recursive: true, force: true});
  rmSync(launch.cwd, {recursive: true, force: true});
}

// The own host's Linux sandbox settings: the pinned helper for this home and architecture (placed by `cua install`; its
// bytes are checked by the connection's preflight and before each child, not here) and, with the computer surface, the
// network for the trusted worker alone. The helper is named by its path as the kernel resolves it, outside the vendor's
// tree (outsideVendorTree), so the host checks and runs the file the preflight checked (sandbox.mjs guardedLinuxHelper).
// A confined launch refuses one that leads into the tree here, at every launch, since a connection's later launches
// repeat no preflight; a disabled one runs no helper, and keeps the spelling, which names nothing in the tree.
function linuxSandboxEnv(home, arch, surfaces, sandbox) {
  const helper = helperFor({home, arch});
  const path = sandbox === 'disabled' ? outsideVendorTree(helper.path, home).real ?? helper.path : helperOutsideVendorTree({home, path: helper.path});
  return {CUA_REPL_SANDBOX_HELPER: path, CUA_REPL_SANDBOX_HELPER_SHA256: helper.sha256, ...(surfaces.includes('computer') ? {CUA_REPL_WORKER_NETWORK: 'enabled'} : {})};
}

// The REPL host a launch with `surfaces` on `platform` runs, and why -> {host: 'cua' | 'vendor', reason}, plus, for
// `cua`, `node`: the Node it runs on, for `own_host_node_unavailable`, `nodeTried`: the candidates ownHostNode tried, and
// for the computer surface, `engine`: the native engine the session drives (nativeEngineFor's, below; on Linux, #171,
// resolved before Node and never changing the host).
// On Linux it is always cua's own host (#115 M3, which closes #135): the vendor host there is retired, because its
// node_repl ran JavaScript unconfined when its launcher failed at run time, and cua's sandbox does not serve it.
// `resolveOwnNode` resolves the own host's Node (ownHostNode from `ambient`, `home`, `platform` and `arch` by default),
// asked at most once and only when the selection would be cua's own host: a connection resolves its selection once, so
// its Node too. `engine` reaches nativeEngineFor (its `config`, `installed`, `installedVersion` and `defaultEngine`, for
// tests); it too is asked only for the computer surface (on macOS or Linux), once. `arch` is the host's (the
// runtime's), whose managed Node a Linux session resolves. Either host runs cua's browser service with the browser
// surface.
// CUA_REPL_HOST in `ambient`, the caller's original environment:
//   vendor   the vendor host (`explicit`): the macOS rollback; Node is never asked for. Refused on Linux
//            (repl_host_refused, naming why), never downgraded.
//   cua      cua's own host (`explicit`) where it can run, else refused before launch, never downgraded: with the
//            computer surface on macOS where the vendor engine is selected, whose helper accepts only the vendor host's
//            node_repl as a peer (repl_host_refused); where no Node 24 or later resolves (repl_host_node).
//   unset or empty   for the computer surface on macOS, the host the engine needs: the vendor host for the vendor
//            engine (`macos_native_peer_requires_vendor`; MAWS client mode does not change that), cua's own for cua's
//            (`cua_engine`); else cua's own host, the default since #116's last stage (M5): `linux` on Linux,
//            `browser_only` for a macOS session with only the browser surface. That default needs a Node 24 or later:
//            on macOS, where none resolves, the vendor host with `own_host_node_unavailable`, never a refused session
//            (cua itself runs on Node 22); on Linux, which has no vendor host to fall back to, the session is refused
//            with the remedy: runtime_not_installed without the managed Node, naming this cua's own installer, which
//            places it; repl_host_node for a CUA_NODE that cannot serve (ownHostNode).
// The computer surface on macOS follows the engine × host table of the native engine's spec ("Engine selection, host
// switch and retirement"; macosComputerHost below). Any other CUA_REPL_HOST is refused (invalid_repl_host), as is a
// CUA_NODE that is not an absolute path wherever Node is asked for (invalid_setting).
export function replHostFor({platform, arch = process.arch, surfaces, ambient, home, resolveOwnNode = () => ownHostNode({ambient, home, platform, arch}), engine = {}}) {
  const value = ambient.CUA_REPL_HOST;
  const requested = value === undefined || value === '' ? null : value;
  if (requested !== null && !REPL_HOSTS.includes(requested)) fail('invalid_repl_host', `CUA_REPL_HOST must be ${REPL_HOSTS.join(' or ')}`);
  if (requested === 'vendor' && platform === 'linux')
    fail('repl_host_refused', 'CUA_REPL_HOST=vendor is not supported on Linux: the vendor host there is retired (#115), because its node_repl ran JavaScript cells unconfined when its sandbox launcher failed (#135), and cua\'s own sandbox does not serve it. Unset CUA_REPL_HOST (or use CUA_REPL_HOST=cua) for cua\'s own host');
  if (platform === 'darwin' && surfaces.includes('computer')) return macosComputerHost({requested, ambient, resolveOwnNode, engine});
  if (requested === 'vendor') return {host: 'vendor', reason: 'explicit'};
  // A Linux computer session's engine (#171), resolved before Node as on macOS; it never changes the host.
  const linuxEngine = platform === 'linux' && surfaces.includes('computer') ? {engine: nativeEngineFor({env: ambient, platform, arch, home, ...engine})} : {};
  if (requested === 'cua') return {host: 'cua', reason: 'explicit', node: resolveOwnNode(), ...linuxEngine};
  const reason = platform === 'linux' ? 'linux' : 'browser_only';
  try {
    return {host: 'cua', reason, node: resolveOwnNode(), ...linuxEngine};
  } catch (error) {
    if (error?.code !== 'repl_host_node' || platform === 'linux') throw error;
    return {host: 'vendor', reason: 'own_host_node_unavailable', nodeTried: error.tried};
  }
}

// The computer surface on macOS: the engine first (nativeEngineFor applies the refusals for an unknown value, the host
// setting and the approved engine, in that order), then the host it needs, Node last. cua's engine runs on cua's own
// host (`cua_engine`, or `explicit` with CUA_REPL_HOST=cua), or on the vendor host with CUA_REPL_HOST=vendor, cua's
// service loaded in the vendor trusted worker (comparison A's lane). With no Node 24 an explicit cua engine is refused
// (repl_host_node, naming CUA_REPL_HOST=vendor), never moved to the vendor engine; a default one keeps the vendor host
// and engine with a warning until M6 (`own_host_node_unavailable`), as does a default with no approved engine
// (`engine_not_installed`, nativeEngineFor's).
function macosComputerHost({requested, ambient, resolveOwnNode, engine}) {
  const selected = nativeEngineFor({env: ambient, requestedHost: requested, ...engine});
  if (selected.engine === 'vendor') {
    const reason = selected.reason === 'engine_not_installed' ? 'engine_not_installed' : requested === 'vendor' ? 'explicit' : 'macos_native_peer_requires_vendor';
    return {host: 'vendor', reason, engine: selected};
  }
  if (requested === 'vendor') return {host: 'vendor', reason: 'explicit', engine: selected};
  let node;
  try { node = resolveOwnNode(); } catch (error) {
    if (error?.code !== 'repl_host_node') throw error;
    if (selected.reason !== 'default' || requested === 'cua')
      throw Object.assign(new CuaError('repl_host_node', `${engineSource(selected.reason, 'cua')} selects cua's engine, which runs on cua's own REPL host: ${error.message}; or set CUA_REPL_HOST=vendor to run cua's engine on the vendor host`), {tried: error.tried});
    return {host: 'vendor', reason: 'own_host_node_unavailable', nodeTried: error.tried, engine: {engine: 'vendor', reason: 'own_host_node_unavailable', status: 'warn'}};
  }
  return {host: 'cua', reason: requested === 'cua' ? 'explicit' : 'cua_engine', node, engine: selected};
}

// ---- EngineSelection (#117; the native engine's spec, Interfaces) ----

// The engine a computer session drives when nothing selects one, per platform (#171 M5: one constant served both). On
// macOS the vendor's until #117's M5 flips it to cua's (#192 decides it there). On Linux cua's since #171's M5, on the
// owner's word: since M6a a home without one this cua can drive is refused, naming the installer (linuxEngineFor below).
const DEFAULT_NATIVE_ENGINES = Object.freeze({darwin: 'vendor', linux: 'cua'});
// The cua release that removed the vendor's engine from Linux (#171 M6b, ruling 1215's F1), which engine_retired names:
// no later than the plugin's version (.claude-plugin/plugin.json), which a test holds.
export const VENDOR_ENGINE_RETIRED_IN = '0.30.0';
export const defaultNativeEngine = (platform = 'darwin') => DEFAULT_NATIVE_ENGINES[platform] ?? DEFAULT_NATIVE_ENGINES.darwin;
const NATIVE_ENGINES = ['vendor', 'cua'];
const engineSource = (reason, value) => (reason === 'settings' ? `"engine": "${value}" in ~/.config/cua/engine.json` : reason === 'default' ? `the default engine (${value})` : `CUA_NATIVE_ENGINE=${value}`);

// The native engine of a macOS computer session -> {engine: 'vendor' | 'cua', reason, status, app?}. The setting is
// CUA_NATIVE_ENGINE in `env` (unset or empty: not set), else `engine` in ~/.config/cua/engine.json (`config`, read only
// then), else `defaultEngine`; reason `explicit`, `settings` or `default`. An unknown value is refused
// (invalid_setting, one sentence naming the two values), as is an engine.json that cannot be read. The vendor engine
// with `requestedHost` cua is refused (repl_host_refused, naming CUA_NATIVE_ENGINE=cua): its helper accepts only the
// vendor host. cua's engine needs an approved engine on this Mac (`installed`, asked only here and once:
// installedEngine reads the bundle's signature with codesign) and carries it as `app` {bundlePath, engineVersion,
// build}; without one an explicit setting, or CUA_REPL_HOST=cua, is refused (engine_not_installed, naming `cua install
// --engine`, which builds it pending, then `cua engine approve` with the owner at the console), while the default keeps
// the vendor engine (reason `engine_not_installed`, status `warn`) until M6, so a plugin update never breaks a session
// before the engine is installed. Status is `pass` otherwise. `env.HOME` locates engine.json and the approved engine, as
// `cua engine` places them.
//
// On Linux (`platform` linux; #171, docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, Selection; M6a's
// pre-flight, §3.3 and §3.4; M6b's, §2.1) the same setting, precedence and reasons select cua's own engine, installed in
// the cua home `home` (src/runtime/linux-engine.mjs linuxEnginePath; `installed`, a seam, stands in for its guarded
// lookup: {path} or null). There is no host to refuse (cua's own host is the only one there).
//   cua's engine carries `bin` {path, lookup, source: 'installed' | 'override'}. Either selection, the default as an
//   explicit setting, takes the installed engine only when it is at least MIN_ENGINE_VERSION, the oldest cua's Linux
//   service drives, by `installedVersion` (verifiedLinuxEngineVersion: the version its bytes bear out, a pinned release's
//   or a local build's, never by running it; F2): the pinned release, or one behind or ahead of the pin, of which doctor
//   warns. Otherwise the open is refused: engine_not_installed (none), engine_outdated (older) or engine_unrecorded (no
//   record of the file says what it is). M5's fallback to the vendor's engine is gone (F3). CUA_LINUX_ENGINE_BIN in
//   `env`, read only for cua's engine, names an engine to run in place of the installed one (an absolute path to an
//   executable file, else refused: invalid_setting, engine_not_installed). Its version is read once at the open, by
//   running the approved path's --version, and held to the same minimum (engine_outdated, engine_unrecorded; ruling
//   1110); the service checks it again at each start, as it does every engine's, which holds for a replacement at the
//   path.
//   Every refusal of an engine (M6b, rulings 1212, 1215 and 1216) says what was selected and why it cannot run, then,
//   after a colon, the prerequisite of the source that selected it (unset CUA_LINUX_ENGINE_BIN for an override's; move
//   a link into the vendor's tree aside; none for the installed engine), then the one command, `<this cua's installer>
//   --engine`; its hint (ENGINE_HINT) holds no command.
//   The vendor's engine (`vendor`, by CUA_NATIVE_ENGINE or engine.json) is refused as engine_retired before anything
//   else is looked at (retiredEngine below): cua 0.30.0 removed it from Linux.
//   No lookup of cua's engine is led into the vendor's tree (<home>/runtimes/): a CUA_LINUX_ENGINE_BIN that is, or
//   leads, under it is invalid_setting, and an installed engine whose path, or whose install record's, leads there
//   engine_not_installed, each refused before anything there is stat-ed, read or run (outsideVendorTree); what follows
//   uses only the path the guard resolved.
export function nativeEngineFor({env, platform = 'darwin', home, requestedHost = null, defaultEngine = defaultNativeEngine(platform), config = () => readEngineSettings({env}), installed, installedVersion, probeTimeoutMs}) {
  if (platform === 'linux') return linuxEngineFor({env, home, defaultEngine, config, installed, installedVersion, probeTimeoutMs});
  installed ??= () => installedEngine({dir: engineDirectory(env.HOME || homedir())});
  const setting = engineSetting(env, config, defaultEngine, platform);
  if (setting.engine === 'vendor') {
    if (requestedHost === 'cua')
      fail('repl_host_refused', `CUA_REPL_HOST=cua is not supported with the computer surface on macOS and ${setting.reason === 'default' ? 'the default vendor engine' : `the vendor engine (${engineSource(setting.reason, 'vendor')})`}: the vendor's computer-use helper accepts only the vendor host's node_repl as a peer. Set CUA_NATIVE_ENGINE=cua to run the computer surface on cua's own host with cua's engine, use CUA_SHIM_SURFACES=browser for a browser-only session there, or unset CUA_REPL_HOST (or use CUA_REPL_HOST=vendor) to keep the vendor engine`);
    return {engine: 'vendor', reason: setting.reason, status: 'pass'};
  }
  const app = installed();
  if (!app) {
    if (setting.reason !== 'default' || requestedHost === 'cua') {
      const bundle = enginePaths(engineDirectory(env.HOME || homedir())).bundle;
      fail('engine_not_installed', `${engineSource(setting.reason, 'cua')} selects cua's own engine, and no approved engine is installed on this Mac (${bundle}, approved by \`cua engine approve\`): install it with \`cua install --engine\`, which builds it pending approval, then approve it with \`cua engine approve\` with the owner at the console; or set CUA_NATIVE_ENGINE=vendor for the vendor engine`);
    }
    return {engine: 'vendor', reason: 'engine_not_installed', status: 'warn'};
  }
  return {engine: 'cua', reason: setting.reason, status: 'pass', app: {bundlePath: app.bundlePath, engineVersion: app.engineVersion, build: app.build}};
}

function linuxEngineFor({env, home, defaultEngine, config, installed, installedVersion, probeTimeoutMs}) {
  const setting = engineSetting(env, config, defaultEngine, 'linux');
  const cuaHome = () => realHome(home ?? defaultHome(env, {platform: 'linux'}));
  if (setting.engine === 'vendor') {
    const {code, message, hint} = retiredEngine({setting, env, cuaHome});
    fail(code, message, {hint});
  }
  const source = engineSource(setting.reason, 'cua');
  const install = `run \`${ownInstaller().command} --engine\``;
  const override = env.CUA_LINUX_ENGINE_BIN;
  if (override !== undefined && override !== '') {
    // The override's prerequisite, then the one command, which places the installed engine it stands in for (§2.1).
    const refuse = (code, why) => fail(code, `${source} selects cua's own engine, and CUA_LINUX_ENGINE_BIN names ${override}, which ${why}: unset CUA_LINUX_ENGINE_BIN, then ${install}`, {hint: ENGINE_HINT});
    if (!isAbsolute(override)) refuse('invalid_setting', 'is not an absolute path');
    const resolved = outsideVendorTree(override, cuaHome());
    if (resolved.lead) refuse('invalid_setting', `${intoTree(override, resolved.lead)}, and no engine of cua's runs from the vendor's release`);
    // A path the kernel would refuse as written is refused, never reinterpreted into one that exists.
    if (resolved.notDirectory) refuse('invalid_setting', unresolved(resolved));
    if (resolved.missing || !executableFile(resolved.real)) refuse('engine_not_installed', 'is not an executable file');
    // Ruling 1110: below the minimum is refused at the open, the override's too; its version is read once, here, from
    // the approved path. The service still checks whatever it starts (a replacement at the path).
    const version = overrideVersion(resolved.real, probeTimeoutMs);
    if (version === null) refuse('engine_unrecorded', 'answers --version with no version this cua recognizes');
    if (isOlder(version, MIN_ENGINE_VERSION)) refuse('engine_outdated', `is ${version}, older than ${MIN_ENGINE_VERSION}, which this cua needs`);
    return {engine: 'cua', reason: setting.reason, status: 'pass', bin: engineBin(resolved.real, override, 'override', resolved.links)};
  }
  const lookup = linuxEnginePath(cuaHome());
  const record = join(dirname(lookup), ENGINE_RECORD);
  const refuse = (code, why, first = '') => fail(code, `${source} selects cua's own engine, and ${why}: ${first}${install}`, {hint: ENGINE_HINT});
  // Every path the installed engine's lookup reads, the engine and its install record, resolved once and kept out of
  // the tree; what follows (the executable check, the record and digest check, the launch, the preflight) uses only what
  // these resolved. A link that leads there is named to be moved aside first: the installer refuses to install through
  // it (install.mjs installLinuxEngine).
  const [engineAt, recordAt] = [lookup, record].map(path => {
    const resolved = outsideVendorTree(path, cuaHome());
    if (resolved.lead) refuse('engine_not_installed', `${path === lookup ? 'the engine' : 'the install record of the engine'} installed in this cua home (${path}) ${intoTree(path, resolved.lead)}, which is no part of cua's`,
      `move ${resolved.links[0] ?? path} aside, then `);
    return resolved;
  });
  const found = installed ? installed() : engineAt.real && executableFile(engineAt.real) ? {path: engineAt.real, lookup, links: engineAt.links} : null;
  if (!found) refuse('engine_not_installed', `none is installed in this cua home (${lookup})`);
  const version = installedVersion ? installedVersion() : verifiedLinuxEngineVersion({home: cuaHome(), at: {engine: engineAt.real, record: recordAt.real ?? null}});
  if (version === null) refuse('engine_unrecorded', `no record says what the engine installed in this cua home (${lookup}) is: its install.json is absent, unreadable or another file's`);
  if (isOlder(version, MIN_ENGINE_VERSION)) refuse('engine_outdated', `the engine installed in this cua home (${lookup}) is ${version}, older than ${MIN_ENGINE_VERSION}, which this cua needs`);
  return {engine: 'cua', reason: setting.reason, status: 'pass', bin: engineBin(found.path, found.lookup ?? found.path, 'installed', found.links)};
}

// The engine as a launch names it -> {path, lookup, source, links?}: `path` the executable the selection approved (its
// resolution, the one that was checked), `lookup` the path it was found by, and `links` where the symbolic links on that
// lookup lie, when there are any, which the scoped preflight refuses inside a write root without walking the lookup
// again (src/runtime/sandbox.mjs).
const engineBin = (path, lookup, source, links) => ({path, lookup, source, ...(links?.length ? {links} : {})});

// The refusal of a vendor selection on Linux (#171 M6b; its pre-flight's §2.1 and §2.2) -> {code: 'engine_retired',
// message, hint}, for `setting`, the engine setting that named `vendor` (engineSetting's), read from `env`; `cuaHome()` gives
// the real cua home, asked only for the second look below. It looks for no tree and reads no pin, so it reads the same
// whatever the home holds. The sentence names every source that selects the vendor's engine, in precedence order: the
// variable, and, when the variable decided, engine.json too if a bounded second look finds `"engine": "vendor"` there
// (engineFileSetting); `"engine": "vendor"` alone when the file decided. After the colon comes each source's
// prerequisite, then, from a selection (`after` 'open'), the one command; from `cua install` (`after` 'install'), which
// is that command, that the install otherwise completed, and nothing about what a next open meets (F10). Linux's default
// is cua's, so a vendor selection is the variable's or engine.json's (a test's `defaultEngine` reads as the variable's).
export function retiredEngine({setting, env, cuaHome, after = 'open'}) {
  const path = engineSettingsPath(env);
  const sources = setting.reason === 'settings' ? ['settings'] : engineFileSetting(path, cuaHome) === 'vendor' ? ['explicit', 'settings'] : ['explicit'];
  const named = {explicit: 'CUA_NATIVE_ENGINE=vendor', settings: `"engine": "vendor" in ${path}`};
  const undo = {explicit: 'unset CUA_NATIVE_ENGINE', settings: `remove "engine" from ${path}`};
  const and = list => list.join(' and ');
  const message = `${and(sources.map(source => named[source]))} ${sources.length > 1 ? 'select' : 'selects'} the vendor's engine, which cua ${VENDOR_ENGINE_RETIRED_IN} removed from Linux, `
    + `where cua's own engine (CUA_NATIVE_ENGINE=cua, the default) is the only one: ${and(sources.map(source => undo[source]))}`
    + (after === 'install' ? '; the install otherwise completed' : `, then run \`${ownInstaller().command} --engine\``);
  return {code: 'engine_retired', message, ...(after === 'install' ? {} : {hint: ENGINE_HINT})};
}

// engine.json's `engine` at `path`, read a second time and bounded, or undefined (M6b's pre-flight, §2.1): only for the
// sentence of a vendor selection the variable already decided, so never through readEngineSettings, which follows a
// link and would wait on a FIFO. Its directory is resolved first and kept out of the vendor's tree of the cua home
// `cuaHome()` (outsideVendorTree, which touches nothing there), and every access after that names the file in the
// directory the guard resolved, never the spelling again: a link on the way that changes after the check cannot
// redirect the read, which O_NOFOLLOW alone would not stop. The file itself must be a regular file by lstat (a link is
// no second source, wherever it leads), of at most SETTINGS_BOUND bytes, opened without following a link and without
// blocking, and still a regular file by fstat. Any failure, a document that is no JSON object among them, is no second
// source: it never throws and never waits.
const SETTINGS_BOUND = 64 * 1024;
function engineFileSetting(path, cuaHome) {
  try {
    const directory = outsideVendorTree(dirname(path), cuaHome()).real;
    if (!directory) return undefined;
    const at = join(directory, basename(path));
    const stat = lstatSync(at);
    if (!stat.isFile() || stat.size > SETTINGS_BOUND) return undefined;
    const fd = openSync(at, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const opened = fstatSync(fd);
      if (!opened.isFile() || opened.size > SETTINGS_BOUND) return undefined;
      const buffer = Buffer.alloc(SETTINGS_BOUND + 1);
      let length = 0;
      for (let read; length <= SETTINGS_BOUND && (read = readSync(fd, buffer, length, buffer.length - length, length)) > 0;) length += read;
      if (length > SETTINGS_BOUND) return undefined;
      const settings = JSON.parse(buffer.subarray(0, length).toString('utf8'));
      return settings && typeof settings === 'object' && !Array.isArray(settings) ? settings.engine : undefined;
    } finally { closeSync(fd); }
  } catch { return undefined; }
}

// The refusal half for a path the walk could not follow as written.
const unresolved = resolved => (resolved.notDirectory ? `cannot be opened as written: ${resolved.notDirectory} is not a directory` : `is not found (${resolved.missing})`);
// Where `path` enters the vendor's tree, or null (outsideVendorTree's `lead`).
export const vendorTreeLead = (path, home) => outsideVendorTree(path, home).lead ?? null;
export {outsideVendorTree};
// The sentence half that says where a path that entered the tree went.
const intoTree = (path, lead) => (lead === resolve(path) ? 'lies under the vendor\'s tree' : `leads to ${lead}, under the vendor's tree`);

// The version an engine override at its approved real path `path` answers to --version, or null. It is run with a fixed
// PATH and nothing else of the caller's environment, as the service runs it, and killed outright at `timeoutMs`: a
// child that ignored SIGTERM would otherwise hold the open, and every connection of this process, past the deadline.
// Its first line is read exactly as the service reads it before each start (src/services/engine/linux/client.mjs
// engineVersionOf), so no override is compatible at one boundary and unrecognised at the other.
const VERSION_PROBE_MS = 5000;
function overrideVersion(path, timeoutMs = VERSION_PROBE_MS) {
  const run = spawnSync(path, ['--version'], {encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL', env: {PATH: FIXED_PATH}, stdio: ['ignore', 'pipe', 'ignore']});
  return run.status === 0 ? engineVersionOf(run.stdout.split('\n')[0].trim()) : null;
}

// The device mode cua's engine runs in, on Linux (#171, Design "Device mode") and on macOS (#282) -> {mode: 'shared' |
// 'dedicated', reason: 'explicit' | 'settings' | 'default'}: CUA_DESKTOP_MODE in `env` (unset or empty: not set), else
// `desktop` in ~/.config/cua/engine.json, else shared. Any other value is refused (invalid_setting), as is an engine.json
// that cannot be read. Doctor reports it; a launch with cua's engine names it to cua's own service (CUA_DESKTOP_MODE),
// which passes it to the engine: on Linux as the engine's --desktop (M3), on macOS in each connection's ping.
const DESKTOP_MODES = ['shared', 'dedicated'];
export function desktopModeFor({env, config = () => readEngineSettings({env})}) {
  const value = env.CUA_DESKTOP_MODE;
  if (value !== undefined && value !== '') {
    if (!DESKTOP_MODES.includes(value)) fail('invalid_setting', `CUA_DESKTOP_MODE must be ${DESKTOP_MODES.join(' or ')}`);
    return {mode: value, reason: 'explicit'};
  }
  let settings;
  try { settings = config(); } catch (error) {
    if (error instanceof CuaError) fail('invalid_setting', error.message);
    throw error;
  }
  if (settings?.desktop === undefined) return {mode: 'shared', reason: 'default'};
  if (!DESKTOP_MODES.includes(settings.desktop)) fail('invalid_setting', `"desktop" in ${engineSettingsPath(env)} must be ${DESKTOP_MODES.join(' or ')}`);
  return {mode: settings.desktop, reason: 'settings'};
}

// The engine the setting names, before the approved engine, the host and Node decide what a session gets -> {engine,
// reason: 'explicit' | 'settings' | 'default'}; invalid_setting as nativeEngineFor refuses. Doctor's engine row reports
// it as the preference beside the effective selection; the default is `platform`'s. On Linux `vendor` is still a known
// value, so that the selection refuses it by name (engine_retired), and an unknown value's sentence names cua alone, the
// one engine there (M6b's pre-flight, §2.1).
export function nativeEngineSetting({env, platform = 'darwin', config = () => readEngineSettings({env}), defaultEngine = defaultNativeEngine(platform)}) {
  return engineSetting(env, config, defaultEngine, platform);
}
function engineSetting(env, config, defaultEngine, platform) {
  const allowed = platform === 'linux' ? `cua (cua ${VENDOR_ENGINE_RETIRED_IN} removed the vendor's engine from Linux)` : NATIVE_ENGINES.join(' or ');
  const value = env.CUA_NATIVE_ENGINE;
  if (value !== undefined && value !== '') {
    if (!NATIVE_ENGINES.includes(value)) fail('invalid_setting', `CUA_NATIVE_ENGINE must be ${allowed}`);
    return {engine: value, reason: 'explicit'};
  }
  let settings;
  try { settings = config(); } catch (error) {
    if (error instanceof CuaError) fail('invalid_setting', error.message);
    throw error;
  }
  if (settings?.engine === undefined) return {engine: defaultEngine, reason: 'default'};
  if (!NATIVE_ENGINES.includes(settings.engine)) fail('invalid_setting', `"engine" in ${engineSettingsPath(env)} must be ${allowed}`);
  return {engine: settings.engine, reason: 'settings'};
}

// A bundle's CFBundleShortVersionString from its XML Info.plist, or null (the vendor engine's attestation).
function bundleVersion(appPath) {
  try {
    return plistString(readFileSync(join(appPath, 'Contents', 'Info.plist'), 'utf8'), 'CFBundleShortVersionString');
  } catch { return null; }
}

// The Node cua's own REPL host runs on, as its real path, which the launch can name in an environment whose PATH is
// fixed. On macOS: the first of an explicit CUA_NODE (an absolute path), the Node `cua install` placed in `home`
// (managed-node.mjs; a caller that names no home has none to try), the node running cua (`execPath`) and the first
// `node` on the caller's PATH whose `--version` (`versionOf`) is at least NODE_FLOOR. None: refused (repl_host_node),
// naming every candidate tried and its version, which the error also carries as `tried`. The vendor host's pinned Node
// is never a candidate. On Linux (#171 M6a, F2 and F2a): linuxHostNode below.
export function ownHostNode({ambient, home, platform = process.platform, arch = process.arch, execPath = process.execPath, versionOf = nodeVersion}) {
  if (platform === 'linux') return linuxHostNode({ambient, home, arch, versionOf});
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

// The Linux host's Node: two candidates, each asked for only when its turn comes. CUA_NODE, the named override: never a
// path that is, or leads, under the vendor's tree (invalid_setting, before anything there is touched, outsideVendorTree),
// and else its resolved path, and only that, run once for its --version and returned, refused below NODE_FLOOR or absent
// (repl_host_node). Else the managed Node `cua install` placed in `home` for this `arch`: every path its lookup reads
// (the pointer, the version's install record, the binary) kept out of the tree before it is read, offered only while
// its bytes are the ones its install record names (managedNode) and it can be executed, at or above NODE_FLOOR by that
// record: at the pinned version or behind it (doctor warns), and not run to find out. Neither: the runtime is not
// installed (runtime_not_installed), naming this cua's own installer, which places it. Each override refusal gives the
// override's own fix, then that installer. The node running cua and `node` on PATH are no candidates here: nobody asked
// for them (F2a).
function linuxHostNode({ambient, home, arch, versionOf}) {
  const real = home === undefined ? undefined : realHome(home);
  const installer = ownInstaller();
  const explicit = cuaNodeFrom(ambient);
  if (explicit) {
    // The override's own fix first, then the installer that restores the managed Node it stands in for (§3.4).
    const restore = `, or unset CUA_NODE for the Node \`${installer.command}\` installs`;
    const resolved = outsideVendorTree(explicit, real);
    if (resolved.lead) fail('invalid_setting', `CUA_NODE names ${explicit}, which ${intoTree(explicit, resolved.lead)}, and cua's own host never runs the vendor's Node: name a Node ${NODE_FLOOR} or later outside ${homeLayout(real).runtimes}${restore}`, {hint: installer.hint});
    const refuse = why => { throw Object.assign(new CuaError('repl_host_node', `cua's own REPL host needs Node ${NODE_FLOOR} or later, and CUA_NODE names ${explicit}, which ${why}: set CUA_NODE to the absolute path of a Node ${NODE_FLOOR} or later${restore}`, {hint: installer.hint}), {tried: [`CUA_NODE ${explicit} (${why})`]}); };
    // a path the kernel would refuse as written is refused, never reinterpreted into one that exists
    if (resolved.notDirectory) fail('invalid_setting', `CUA_NODE names ${explicit}, which ${unresolved(resolved)}: name the Node by a path that resolves as written${restore}`, {hint: installer.hint});
    if (resolved.missing) refuse('is not found');
    // the approved path, and only it, is probed and run
    const version = versionOf(resolved.real);
    if (!version || Number(version.slice(1).split('.')[0]) < NODE_FLOOR) refuse(`answers ${version ?? 'no readable version'}`);
    return resolved.real;
  }
  const missing = why => fail('runtime_not_installed', `cua's Linux runtime is not installed${real === undefined ? '' : ` in ${real}`}: its Node is not installed (${why})`, {hint: `${installer.hint}; or set CUA_NODE to the absolute path of a Node ${NODE_FLOOR} or later`});
  if (real === undefined) missing('no cua home was named');
  // Every path the managed lookup reads, kept out of the tree before it is read: the pointer first, then, for the version
  // it names, the install record and the binary (managedNode checks the directories on the way are no links).
  const guard = path => {
    const resolved = outsideVendorTree(path, real);
    if (resolved.lead) missing(`${path} ${intoTree(path, resolved.lead)}, which is no part of cua's`);
    return resolved;
  };
  const refuseInTree = version => {
    const into = managedNodeIntoVendorTree(real, version);
    if (into) missing(`${into.path} ${intoTree(into.path, into.lead)}, which is no part of cua's`);
  };
  refuseInTree();
  let pinned;
  try { pinned = readNodePointer(real); } catch (error) { missing(error.message); }
  if (!pinned) missing('not installed');
  refuseInTree(pinned);
  const managed = managedNode(real, {host: {platform: 'linux', arch}});
  if (!managed.path) missing(managed.missing);
  if (Number(managed.version.split('.')[0]) < NODE_FLOOR) missing(`its version ${managed.version} is below ${NODE_FLOOR}`);
  const binary = guard(managed.path);
  if (!binary.real) missing(`${managed.path} ${unresolved(binary)}`);
  // its recorded bytes, and runnable: one that lost its execute bit would fail at spawn (no version probe)
  try { accessSync(binary.real, constants.X_OK); } catch { missing(`${managed.path} is not executable`); }
  return binary.real;
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
