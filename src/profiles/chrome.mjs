// Passive facts about the user's Chrome that the profile registry and doctor need, read from files and the process
// table only: never a connection, a profile database, cookies, passwords or extension storage, and nothing is
// written. Display names are read from Chrome's `Local State` for the bind rule only; callers must never print or
// store them (they can be the account holder's name).
//   - a registered profile directory exists (a direct child of the user-data directory);
//   - the OpenAI extension is installed there: some Extensions/<id>/<version>/manifest.json exists (file presence
//     only; it says nothing about the extension being enabled or connected);
//   - the native-messaging manifest for com.openai.codexextension, and which host it names (desktop's or cua's);
//   - how many OpenAI hosts are running, each started by the user's Chrome.
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fail} from '../runtime/errors.mjs';

export const CHROME_USER_DATA = join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
export const OPENAI_EXTENSION_ID = 'hehggadaopoacecdllhhajmbjkdcmajg';
export const NATIVE_HOST_NAME = 'com.openai.codexextension';
export const HOST_BASENAME = 'ChatGPT for Chrome';
const CHROME_EXECUTABLE = /\/Google Chrome\.app\/Contents\/MacOS\/Google Chrome$/;

// A profile directory is named, never a path: one segment, no separators or dot names.
const isDirectoryName = name => typeof name === 'string' && name.length > 0 && name.length <= 255
  && !/[/\0]/.test(name) && name !== '.' && name !== '..';
const isDirectory = path => { try { return statSync(path).isDirectory(); } catch { return false; } };
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
    profileDirectoryExists: name => isDirectoryName(name) && isDirectory(join(userData, name)),
    extensionInstalled(name) {
      if (!isDirectoryName(name)) return false;
      const root = join(userData, name, 'Extensions', OPENAI_EXTENSION_ID);
      let versions;
      try { versions = readdirSync(root); } catch { return false; }
      return versions.some(version => existsSync(join(root, version, 'manifest.json')));
    },
    // Profile directory -> display name, from Local State's profile.info_cache.
    displayNames() {
      let state;
      try { state = JSON.parse(readFileSync(join(userData, 'Local State'), 'utf8')); } catch { state = null; }
      const cache = state?.profile?.info_cache;
      if (cache === null || typeof cache !== 'object' || Array.isArray(cache))
        fail('chrome_local_state_unreadable', `Chrome's Local State in ${userData} could not be read as a profile list`);
      return new Map(Object.entries(cache).filter(([, info]) => typeof info?.name === 'string').map(([dir, info]) => [dir, info.name]));
    },
    // The native-messaging manifest the OpenAI extension connects to, and the class of the host it names.
    nativeHost({cuaHome, userHome}) {
      const file = join(userData, 'NativeMessagingHosts', `${NATIVE_HOST_NAME}.json`);
      if (!existsSync(file)) return {present: false};
      let manifest;
      try { manifest = JSON.parse(readFileSync(file, 'utf8')); } catch { manifest = null; }
      if (typeof manifest?.path !== 'string') return {present: true, unreadable: true};
      return {present: true, path: manifest.path, pathClass: hostPathClass(manifest.path, {cuaHome, userHome})};
    },
  };
}
