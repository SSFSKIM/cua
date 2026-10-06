// Passive facts about the user's Chrome that the profile registry and doctor need, read from files and the process
// table only: never a connection, a profile database, cookies, passwords or extension storage, and nothing is
// written (bind's directory mapping reads copies of the OpenAI extension's own store; directory-map.mjs). Display names
// are read from Chrome's `Local State` for the bind rule and for showing beside bind's candidates only; nothing stores
// them (they can be the account holder's name).
//   - a registered profile directory exists (a direct child of the user-data directory);
//   - the OpenAI extension is installed there: some Extensions/<id>/<version>/manifest.json exists (file presence
//     only; it says nothing about the extension being enabled or connected);
//   - the native-messaging manifest for com.openai.codexextension, and which host it names (desktop's or cua's);
//   - how many OpenAI hosts are running, each started by the user's Chrome.
// Each file fact is three-valued: a path that is not there (ENOENT/ENOTDIR) is absent, but a read this process is not
// allowed to make (or any other failure) is `unreadable` with its error code, never absence. macOS 26+ can put
// Chrome's user-data directory behind privacy protection: a process without Full Disk Access (Terminal by default, and
// everything started from it) gets EPERM there while processes that have it read the same files.
// Chrome's user-data directory is ~/Library/Application Support/Google/Chrome on macOS and, on Linux,
// ${CHROME_CONFIG_HOME:-${XDG_CONFIG_HOME:-~/.config}}/google-chrome (the deb Chrome; Flatpak and snap are not supported).
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {homedir} from 'node:os';
import {isAbsolute, join} from 'node:path';
import {CuaError, fail} from '../runtime/errors.mjs';

const hostTarget = () => ({platform: process.platform, arch: process.arch});

// The base of the Linux browsers' configuration directories, as the vendor's installManifest.mjs resolves it: the
// Chrome family (Chrome and its channels, Chromium) honours CHROME_CONFIG_HOME, then XDG_CONFIG_HOME, then ~/.config;
// the other browsers XDG_CONFIG_HOME, then ~/.config. Empty or relative values count as unset (the XDG Base Directory
// specification has relative paths ignored).
export function linuxConfigHome({env, userHome, chromeFamily}) {
  if (chromeFamily && isAbsolute(env.CHROME_CONFIG_HOME ?? '')) return env.CHROME_CONFIG_HOME;
  return isAbsolute(env.XDG_CONFIG_HOME ?? '') ? env.XDG_CONFIG_HOME : join(userHome, '.config');
}

export function chromeUserData({host = hostTarget(), env = process.env, userHome = homedir()} = {}) {
  if (host.platform === 'linux') return join(linuxConfigHome({env, userHome, chromeFamily: true}), 'google-chrome');
  return join(userHome, 'Library', 'Application Support', 'Google', 'Chrome');
}
export const OPENAI_EXTENSION_ID = 'hehggadaopoacecdllhhajmbjkdcmajg';
export const NATIVE_HOST_NAME = 'com.openai.codexextension';
export const HOST_BASENAME = 'ChatGPT for Chrome';
// What to do about a read this process was refused; the live check (the runtime's own listing) does not need it. On
// macOS that is privacy protection (Full Disk Access); on Linux, ordinary file permissions.
export const permissionFix = platform => platform === 'darwin'
  ? 'grant Full Disk Access to your terminal (System Settings → Privacy & Security → Full Disk Access), or run from a process that has it'
  : 'make the browser\'s data directory readable by the user cua runs as (check its owner and mode), or run cua as the user whose browser it is';
export const PERMISSION_FIX = permissionFix(process.platform);
// The same fix as the short parenthetical the readiness and pick reasons carry (profiles/registry.mjs, bind.mjs).
export const ACCESS_NOTE = process.platform === 'darwin' ? 'macOS Privacy & Security → Full Disk Access for your terminal'
  : 'file permissions: the user cua runs as must be able to read it';
export const PERMISSION_HINT = `${PERMISSION_FIX}; the live check still works without it`;
const CHROME_EXECUTABLE = /\/Google Chrome\.app\/Contents\/MacOS\/Google Chrome$/;

// A profile directory is named, never a path: one segment, no separators or dot names.
const isDirectoryName = name => typeof name === 'string' && name.length > 0 && name.length <= 255
  && !/[/\0]/.test(name) && name !== '.' && name !== '..';
const ABSENT = new Set(['ENOENT', 'ENOTDIR']);
const PERMISSION = new Set(['EPERM', 'EACCES']);
// What a failed read means: the path is absent, or this process may not read it (kept with its code).
export const readFailure = error => ABSENT.has(error?.code) ? null : (error?.code ?? 'error');
// -> 'exists' | 'missing' | {unreadable: code}
function directoryState(path) {
  try { return statSync(path).isDirectory() ? 'exists' : 'missing'; } catch (error) {
    const code = readFailure(error);
    return code ? {unreadable: code} : 'missing';
  }
}
// -> 'installed' | 'absent' | {unreadable: code}
function extensionState(profile) {
  const root = join(profile, 'Extensions', OPENAI_EXTENSION_ID);
  let versions;
  try { versions = readdirSync(root); } catch (error) {
    const code = readFailure(error);
    return code ? {unreadable: code} : 'absent';
  }
  let unreadable = null;
  for (const version of versions) {
    try { statSync(join(root, version, 'manifest.json')); return 'installed'; } catch (error) { unreadable ??= readFailure(error); }
  }
  return unreadable ? {unreadable} : 'absent';
}
const stateName = state => typeof state === 'string' ? state : 'unreadable';
const within = (path, root) => root && (path === root || path.startsWith(root.replace(/\/+$/, '') + '/'));

// Which installation a native host path belongs to: cua's own home, the desktop app's installs (its macOS bundles, its
// Linux deb under /usr/lib/chatgpt, or the plugin cache it writes under ~/.codex), or something else. The roots of
// both platforms are listed together: each names a place only that platform's desktop app writes.
export function hostPathClass(path, {cuaHome, userHome = homedir()}) {
  if (within(path, cuaHome)) return 'cua';
  const desktop = ['/Applications/ChatGPT.app', '/Applications/Codex.app', '/usr/lib/chatgpt', join(userHome, '.codex'), join(userHome, 'Library', 'Application Support', 'OpenAI')];
  return desktop.some(root => within(path, root)) ? 'desktop' : 'other';
}

// The running OpenAI hosts. macOS: `ps -axo pid=,ppid=,comm=` (comm is the full path), counting hosts whose parent is
// Google Chrome. Linux: `ps -eo pid=,args=` (comm is truncated there), counting processes whose executable is a Linux
// host for this arch, the argument the browser passes after it.
export function countLiveHosts(psText, {host = hostTarget()} = {}) {
  if (host.platform === 'linux') {
    const executable = new RegExp(`^\\s*\\d+\\s+(/.*?/extension-host/linux/${host.arch}/extension-host)(?:\\s|$)`);
    return psText.split('\n').filter(line => executable.test(line)).length;
  }
  const rows = psText.split('\n').map(line => line.match(/^\s*(\d+)\s+(\d+)\s+(.*?)\s*$/)).filter(Boolean)
    .map(([, pid, ppid, executable]) => ({pid: Number(pid), ppid: Number(ppid), executable}));
  const byPid = new Map(rows.map(row => [row.pid, row]));
  return rows.filter(row => row.executable.endsWith(`/${HOST_BASENAME}`) && CHROME_EXECUTABLE.test(byPid.get(row.ppid)?.executable ?? '')).length;
}

export function chromeFacts({host = hostTarget(), env = process.env, userHome = homedir(), userData = chromeUserData({host, env, userHome})} = {}) {
  return {
    userData,
    isDirectoryName,
    // -> 'exists' | 'missing' | 'unreadable'
    profileDirectoryExists: name => isDirectoryName(name) ? stateName(directoryState(join(userData, name))) : 'missing',
    // -> 'installed' | 'absent' | 'unreadable'
    extensionInstalled: name => isDirectoryName(name) ? stateName(extensionState(join(userData, name))) : 'absent',
    // The error code behind an unreadable profile directory or extension directory, or undefined.
    readError(name) {
      if (!isDirectoryName(name)) return undefined;
      const directory = directoryState(join(userData, name));
      if (directory === 'missing') return undefined;
      return directory.unreadable ?? extensionState(join(userData, name)).unreadable;
    },
    // Profile directory -> display name, from Local State's profile.info_cache. A Local State this process may not
    // read fails with the permission cause and its code (`readError` on the error), not as a malformed file.
    displayNames() {
      const file = join(userData, 'Local State');
      let text;
      try { text = readFileSync(file, 'utf8'); } catch (error) {
        if (PERMISSION.has(error.code)) {
          const denied = new CuaError('chrome_local_state_unreadable', `this process may not read Chrome's Local State in ${userData} (${error.code})`, {hint: PERMISSION_HINT});
          denied.readError = error.code;
          throw denied;
        }
        text = null;
      }
      let state;
      try { state = JSON.parse(text); } catch { state = null; }
      const cache = state?.profile?.info_cache;
      if (cache === null || typeof cache !== 'object' || Array.isArray(cache))
        fail('chrome_local_state_unreadable', `Chrome's Local State in ${userData} could not be read as a profile list`);
      return new Map(Object.entries(cache).filter(([, info]) => typeof info?.name === 'string').map(([dir, info]) => [dir, info.name]));
    },
    // The native-messaging manifest the OpenAI extension connects to, and the class of the host it names; `readError`
    // when this process may not read it (so whether it exists is unknown).
    nativeHost({cuaHome, userHome}) {
      const file = join(userData, 'NativeMessagingHosts', `${NATIVE_HOST_NAME}.json`);
      let text;
      try { text = readFileSync(file, 'utf8'); } catch (error) {
        const code = readFailure(error);
        return code ? {readError: code} : {present: false};
      }
      let manifest;
      try { manifest = JSON.parse(text); } catch { manifest = null; }
      if (typeof manifest?.path !== 'string') return {present: true, unreadable: true};
      return {present: true, path: manifest.path, pathClass: hostPathClass(manifest.path, {cuaHome, userHome})};
    },
  };
}
