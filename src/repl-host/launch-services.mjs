// The supervisor's half of the trusted worker's `nodeRepl.launchServices.openApplication`
// (docs/doperpowers/specs/2026-10-14-own-repl-host-design.md, Design "Trusted services and privileged APIs"; the
// worker's half normalizes the target, NR:privileged-node-repl.js:455-472,603-631). The worker sends
// `launch_services_action {id, exec_id, action: 'open_application', application_path?, bundle_identifier?}`; the
// supervisor opens the application outside every sandbox and answers `privileged_result`.
//
// macOS: through LaunchServices (`/usr/bin/open -a <path>` or `-b <bundle id>`, the OS boundary, injectable). Kept
// implemented and boundary-tested; native production use stays on the vendor host until #117. Sentences are the vendor
// supervisor's (recovered, docs/doperpowers/research/2026-10-14-own-repl-host/node-repl-embedded-INDEX.md "Gaps" 5)
// where they exist.
//
// Linux (#115 M3, docs/doperpowers/specs/2026-10-17-own-sandbox-design.md, Design "Linux computer sessions"): the
// trusted worker runs confined, and an application sky_linux fork/execs inside its sandbox dies at start (#115 M0's
// probe: MIT-SHM and a read-only dconf), so cua's sky wrapper (src/services/sky.mjs) sends `launch_app` here as the
// application's desktop entry, which is launched with `gio launch` in a session of its own (it is never in the
// supervisor's process group, which the reaper may clear) and with the desktop session's environment only. The entry
// must be a `.desktop` file whose real path lies in an `applications/` directory of the supervisor's own XDG data
// directories ($XDG_DATA_HOME or ~/.local/share, then $XDG_DATA_DIRS or /usr/local/share:/usr/share): nothing a cell
// or the worker can write is ever launched outside the sandbox.
import {execFile} from 'node:child_process';
import {realpathSync, statSync} from 'node:fs';
import {isAbsolute, join, relative} from 'node:path';

export const PATH_NOT_ABSOLUTE_SENTENCE = 'LaunchServices application path must be absolute';
export const EXACTLY_ONE_SENTENCE = 'LaunchServices open application expected exactly one of application_path or bundle_identifier';
export const DISPATCH_FAILED_PREFIX = 'failed to dispatch LaunchServices open: ';
export const MACOS_ONLY_SENTENCE = 'LaunchServices is available only on macOS';
export const LINUX_ENTRY_REFUSED_PREFIX = 'refused to launch ';
export const LINUX_LAUNCH_FAILED_PREFIX = 'failed to launch the application: ';
const OPEN = '/usr/bin/open';
const GIO = '/usr/bin/gio';
const OPEN_TIMEOUT_MS = 30_000;
// What a launched application inherits: the desktop session it runs in, nothing of cua's (src/runtime/launch.mjs
// copies these from the caller; PATH is cua's fixed one).
const DESKTOP_ENV = ['HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'PATH', 'DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'XDG_DATA_DIRS'];

// The OS boundary: runs `open` with `args`; rejects with its failure.
export function runOpen(args) {
  return new Promise((resolve, reject) => {
    execFile(OPEN, args, {timeout: OPEN_TIMEOUT_MS, env: {PATH: '/usr/bin:/bin'}}, (error, _stdout, stderr) => {
      if (error) reject(new Error(String(stderr).trim() || error.message));
      else resolve();
    });
  });
}

// The Linux boundary: `gio launch <entry>` in a new session (`detached`), with `env`; resolves when gio has asked for
// the launch (it exits then; the application lives on outside cua's process tree), rejects with gio's last line.
export function runGioLaunch(path, env) {
  return new Promise((resolve, reject) => {
    execFile(GIO, ['launch', path], {timeout: OPEN_TIMEOUT_MS, env, detached: true}, (error, _stdout, stderr) => {
      if (error) reject(new Error(String(stderr).trim().split('\n').at(-1) || error.message));
      else resolve();
    });
  });
}

const within = (path, root) => {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../'));
};
const realOrNull = path => { try { return realpathSync(path); } catch { return null; } };
const isFile = path => { try { return statSync(path).isFile(); } catch { return false; } };

// The applications directories of the XDG data directories `env` names, by real path (those that exist).
export function xdgApplicationDirs(env) {
  const home = isAbsolute(env.XDG_DATA_HOME ?? '') ? env.XDG_DATA_HOME : join(env.HOME ?? '/', '.local', 'share');
  const dirs = (env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter(isAbsolute);
  return [home, ...dirs].map(dir => realOrNull(join(dir, 'applications'))).filter(Boolean);
}

async function launchLinux(message, {launch, env}) {
  const path = message.application_path ?? null;
  if (path === null || message.bundle_identifier != null) throw new Error(`${LINUX_ENTRY_REFUSED_PREFIX}anything but a desktop entry's path on Linux`);
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error(PATH_NOT_ABSOLUTE_SENTENCE);
  const real = realOrNull(path);
  if (real === null || !isFile(real) || !real.endsWith('.desktop') || !xdgApplicationDirs(env).some(dir => within(real, dir)))
    throw new Error(`${LINUX_ENTRY_REFUSED_PREFIX}${path}: only a desktop entry in an XDG applications directory is launched`);
  const desktopEnv = Object.fromEntries(DESKTOP_ENV.filter(name => typeof env[name] === 'string').map(name => [name, env[name]]));
  try {
    await launch(real, desktopEnv);
  } catch (error) {
    throw new Error(`${LINUX_LAUNCH_FAILED_PREFIX}${error.message}`);
  }
}

// A `launch_services_action` -> resolves once the OS was asked to open the application; rejects with the sentence the
// worker is answered. `env` is the supervisor's environment (the XDG directories and the desktop session).
export async function launchServicesAction(message, {platform = process.platform, open = runOpen, launch = runGioLaunch, env = process.env} = {}) {
  if (message.action !== 'open_application') throw new Error(`unsupported LaunchServices action: ${String(message.action)}`);
  if (platform === 'linux') return launchLinux(message, {launch, env});
  const path = message.application_path ?? null;
  const bundle = message.bundle_identifier ?? null;
  if ((path === null) === (bundle === null)) throw new Error(EXACTLY_ONE_SENTENCE);
  if (path !== null && (typeof path !== 'string' || !isAbsolute(path))) throw new Error(PATH_NOT_ABSOLUTE_SENTENCE);
  if (bundle !== null && (typeof bundle !== 'string' || !bundle)) throw new Error(EXACTLY_ONE_SENTENCE);
  if (platform !== 'darwin') throw new Error(MACOS_ONLY_SENTENCE);
  try {
    await open(path !== null ? ['-a', path] : ['-b', bundle]);
  } catch (error) {
    throw new Error(`${DISPATCH_FAILED_PREFIX}${error.message}`);
  }
}
