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
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {CuaError, fail} from '../runtime/errors.mjs';

export const CHROME_USER_DATA = join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
export const OPENAI_EXTENSION_ID = 'hehggadaopoacecdllhhajmbjkdcmajg';
export const NATIVE_HOST_NAME = 'com.openai.codexextension';
export const HOST_BASENAME = 'ChatGPT for Chrome';
// What to do about a read macOS privacy protection refused; the live check (the runtime's own listing) does not need it.
export const PERMISSION_FIX = 'grant Full Disk Access to your terminal (System Settings → Privacy & Security → Full Disk Access), or run from a process that has it';
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

// Which installation a native host path belongs to: cua's own home, the desktop app's installs (its bundle or the
// plugin cache it writes under ~/.codex), or something else.
export function hostPathClass(path, {cuaHome, userHome = homedir()}) {
  if (within(path, cuaHome)) return 'cua';
  const desktop = ['/Applications/ChatGPT.app', '/Applications/Codex.app', join(userHome, '.codex'), join(userHome, 'Library', 'Application Support', 'OpenAI')];
  return desktop.some(root => within(path, root)) ? 'desktop' : 'other';
}

// `ps -axo pid=,ppid=,comm=` -> running OpenAI hosts whose parent is Google Chrome.
export function countLiveHosts(psText) {
  const rows = psText.split('\n').map(line => line.match(/^\s*(\d+)\s+(\d+)\s+(.*?)\s*$/)).filter(Boolean)
    .map(([, pid, ppid, executable]) => ({pid: Number(pid), ppid: Number(ppid), executable}));
  const byPid = new Map(rows.map(row => [row.pid, row]));
  return rows.filter(row => row.executable.endsWith(`/${HOST_BASENAME}`) && CHROME_EXECUTABLE.test(byPid.get(row.ppid)?.executable ?? '')).length;
}

export function chromeFacts({userData = CHROME_USER_DATA} = {}) {
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
