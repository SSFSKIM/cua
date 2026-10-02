// The launch record for one MCP connection's runtime: the relocated vendor `node` running the relocated `cua-repl`
// entry, with an allowlisted environment built only from the resolved runtime, owned paths under CUA_HOME and the
// caller's explicit services/broker settings. Nothing is read from an installed desktop app or its plugin cache.
//
// Environment contract (everything else from the caller's environment is dropped, including every NODE_REPL_*,
// SKY_*, BROWSER_USE_*, CUA_REPL_* and NODE_OPTIONS value, so an ambient override cannot redirect the runtime):
//   HOME USER LOGNAME TMPDIR LANG LC_ALL LC_CTYPE __CF_USER_TEXT_ENCODING   copied when set
//   PATH                                     fixed system path
//   CODEX_HOME                               <home>/state/codex: runtime config and per-user approvals
//   CUA_REPL_NODE_REPL_PATH                  relocated node_repl (required by the vendor launcher)
//   CUA_REPL_ENABLED_SURFACES=computer       required by the vendor launcher; native-only, never "browser" here
//   NODE_REPL_NODE_PATH, NODE_REPL_NODE_MODULE_DIRS    relocated vendor node and its module tree
//   NODE_REPL_TRUSTED_CODE_PATHS             CODEX_HOME, the vendor module tree, and each registered service's directory
//   NODE_REPL_TRUSTED_SERVICES               only when services are registered; unset lets the vendor launcher use
//                                            its own @oai/sky/service for the computer surface
//   NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS=1000, NODE_REPL_DISABLE_ANALYTICS=1
//   CODEX_CLI_PATH                           relocated CodexCLI.app executable (the sandbox; no unsandboxed fallback)
//   SKY_CUA_SERVICE_PATH                     relocated helper app, opened by the vendor through LaunchServices
//   CUA_SKY_VENDOR_SERVICE                   vendor sky service module, for a trusted wrapper to delegate to
//   CUA_SECRETS_BROKER_ENDPOINT, CUA_SECRETS_BROKER_TOKEN   only with a broker (src/secrets/broker.mjs): its socket
//                                            and capability token, read by src/secrets/client.mjs in the trusted
//                                            worker; untrusted cells see only the vendor's env allowlist
// Deliberately never set: NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS (it would let model cells reach the broker; the
// trusted wrapper uses nodeRepl.nativePipe instead), NODE_REPL_UNTRUSTED_ENV_ALLOWLIST (cells see only what the
// vendor launcher adds), SKY_CUA_SERVICE_NATIVE_PIPE_PATH, NODE_REPL_HOST_SERVICES_PIPE_PATH,
// NODE_REPL_WORKER_WRAPPER, NODE_REPL_DENIED_PATHS.
//
// The working directory is <home>/run/<sessionId>; model cells can see it, so it is never the caller's directory or
// the repository. The caller creates it (mode 0700) before spawning and removes it when the connection ends.
import {realpathSync, statSync} from 'node:fs';
import {dirname, isAbsolute, join} from 'node:path';
import {fail} from './errors.mjs';
import {homeLayout, realHome} from './layout.mjs';
import {BROKER_ENV} from '../secrets/client.mjs';

const AMBIENT_ALLOWLIST = ['HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', '__CF_USER_TEXT_ENCODING'];
const FIXED_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
const KNOWN_SERVICES = ['sky'];
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/;

export function buildLaunch({runtime, home, sessionId, services, broker, ambient = process.env}) {
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) fail('invalid_session_id', 'session id must be 1-128 letters, digits or dashes');
  const owned = homeLayout(realHome(home));
  const p = runtime.paths;

  const env = {};
  for (const key of AMBIENT_ALLOWLIST) if (typeof ambient[key] === 'string') env[key] = ambient[key];
  const trustedCodePaths = [owned.codexHome, p.moduleDir];
  Object.assign(env, {
    PATH: FIXED_PATH,
    CODEX_HOME: owned.codexHome,
    CUA_REPL_NODE_REPL_PATH: p.nodeRepl,
    CUA_REPL_ENABLED_SURFACES: 'computer',
    NODE_REPL_NODE_PATH: p.node,
    NODE_REPL_NODE_MODULE_DIRS: p.moduleDir,
  });
  if (services && Object.keys(services).length) {
    const registered = trustedServices(services);
    env.NODE_REPL_TRUSTED_SERVICES = JSON.stringify(registered);
    for (const module of Object.values(registered)) if (!trustedCodePaths.includes(dirname(module))) trustedCodePaths.push(dirname(module));
  }
  Object.assign(env, {
    NODE_REPL_TRUSTED_CODE_PATHS: trustedCodePaths.join(':'),
    NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS: '1000',
    NODE_REPL_DISABLE_ANALYTICS: '1',
    CODEX_CLI_PATH: p.codexCli,
    SKY_CUA_SERVICE_PATH: p.skyServiceApp,
    CUA_SKY_VENDOR_SERVICE: p.skyVendorService,
  });
  if (broker) {
    env[BROKER_ENV.endpoint] = broker.endpoint;
    env[BROKER_ENV.token] = broker.token;
  }
  return {command: p.node, args: [p.cuaRepl], env, cwd: join(owned.run, sessionId)};
}

// Service modules are registered by real path: the trusted worker only imports modules whose real path lies under
// NODE_REPL_TRUSTED_CODE_PATHS, so a symlinked checkout (npm link) must not leak its link path in here.
function trustedServices(services) {
  const out = {};
  for (const [name, module] of Object.entries(services)) {
    if (!KNOWN_SERVICES.includes(name)) fail('invalid_service', `unknown trusted service "${name}"; this delivery registers only ${KNOWN_SERVICES.join(', ')}`);
    if (typeof module !== 'string' || !isAbsolute(module)) fail('invalid_service', `trusted service ${name} must be an absolute module path`);
    let real;
    try { real = realpathSync(module); } catch { fail('invalid_service', `trusted service ${name} module ${module} does not exist`); }
    if (!statSync(real).isFile()) fail('invalid_service', `trusted service ${name} module ${module} is not a file`);
    out[name] = real;
  }
  return out;
}
