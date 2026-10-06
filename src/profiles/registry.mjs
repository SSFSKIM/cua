// The profile registry: user-chosen keys for existing Chrome profiles, kept in $CUA_HOME/profiles.json, separate from
// any credential:
//   {version: 1, profiles: {<key>: {chromeProfileDirectory, extensionInstanceId?, boundAt?}}}
// A key names one existing profile directory under Chrome's user-data directory; no two keys share a directory or an
// extension instance. `extensionInstanceId` is the OpenAI extension instance this profile's backend reports, recorded
// by `cua profiles bind` (bind.mjs); the vendor API selects a browser by it (cua.getBrowser({extensionInstanceId})).
// Registering or removing a key never creates, changes or deletes anything in Chrome. Readiness is computed when asked
// (the user may install the extension later): a profile is ready when its directory exists, the extension is
// installed there, it is bound, and (where the live backends were listed, withLiveness) its bound instance is live: an
// extension disable/enable or reinstall can mint a new instance id, so a binding can go stale. When this process may not
// read Chrome's data directory (macOS privacy protection, chrome.mjs), the file facts are unknown, never "absent": a
// bound profile whose instance is live is ready on that live evidence, and otherwise it is chrome_data_unreadable.
// Parsing is strict: a damaged or unknown file is refused with a fix, never silently rewritten.
import {mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fail} from '../runtime/errors.mjs';
import {realHome} from '../runtime/layout.mjs';
import {ACCESS_NOTE} from './chrome.mjs';

export const PROFILE_KEY = /^[a-z][a-z0-9-]{0,31}$/;
const INSTANCE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const ENTRY_KEYS = ['chromeProfileDirectory', 'extensionInstanceId', 'boundAt'];
const KEY_RULE = 'a profile key is 1-32 lowercase letters, digits or dashes, starting with a letter';

export const registryFile = home => join(realHome(home), 'profiles.json');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function parseRegistry(text, file) {
  const invalid = why => fail('profiles_invalid', `${file} is not a valid profile registry: ${why}`, {hint: `fix or remove ${file}; registered keys would then need to be added again`});
  let json;
  try { json = JSON.parse(text); } catch { invalid('not JSON'); }
  if (!isObject(json) || json.version !== 1 || !isObject(json.profiles) || Object.keys(json).some(k => !['version', 'profiles'].includes(k))) invalid('expected {version: 1, profiles: {...}}');
  for (const [key, entry] of Object.entries(json.profiles)) {
    if (!PROFILE_KEY.test(key)) invalid(`bad key ${JSON.stringify(key)}`);
    if (!isObject(entry) || Object.keys(entry).some(k => !ENTRY_KEYS.includes(k))) invalid(`entry ${key} has unknown fields`);
    if (typeof entry.chromeProfileDirectory !== 'string' || !entry.chromeProfileDirectory) invalid(`entry ${key} has no chromeProfileDirectory`);
    if (entry.extensionInstanceId !== undefined && (typeof entry.extensionInstanceId !== 'string' || !INSTANCE_ID.test(entry.extensionInstanceId))) invalid(`entry ${key} has a bad extensionInstanceId`);
    if (entry.boundAt !== undefined && typeof entry.boundAt !== 'string') invalid(`entry ${key} has a bad boundAt`);
  }
  return json;
}

export function readRegistry(home) {
  const file = registryFile(home);
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return {version: 1, profiles: {}};
    throw error;
  }
  return parseRegistry(text, file);
}

// Write-then-rename, private to the user.
function writeRegistry(home, registry) {
  const file = registryFile(home);
  mkdirSync(realHome(home, {create: true}), {recursive: true, mode: 0o700});
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify(registry, null, 2) + '\n', {mode: 0o600});
    renameSync(temp, file);
  } catch (error) {
    rmSync(temp, {force: true});
    throw error;
  }
}

function entryOf(registry, key) {
  if (!Object.hasOwn(registry.profiles, key)) fail('unknown_profile', `no registered profile "${key}"`, {hint: 'cua profiles list shows the registered keys'});
  return registry.profiles[key];
}

export function addProfile({home, key, directory, chrome}) {
  if (typeof key !== 'string' || !PROFILE_KEY.test(key)) fail('invalid_profile_key', KEY_RULE);
  const registry = readRegistry(home);
  const found = chrome.profileDirectoryExists(directory);
  if (found !== 'exists' && found !== 'unreadable') fail('chrome_profile_not_found', `no Chrome profile directory named ${JSON.stringify(directory)} in ${chrome.userData}`, {hint: 'name an existing directory such as "Default" or "Profile 1" (chrome://version shows a profile\'s directory as the last part of its Profile Path)'});
  if (Object.hasOwn(registry.profiles, key)) fail('profile_exists', `profile "${key}" is already registered`, {hint: `cua profiles remove ${key} first to register it again`});
  const holder = Object.entries(registry.profiles).find(([, entry]) => entry.chromeProfileDirectory === directory)?.[0];
  if (holder) fail('chrome_profile_registered', `Chrome profile ${JSON.stringify(directory)} is already registered as "${holder}"`);
  registry.profiles[key] = {chromeProfileDirectory: directory};
  writeRegistry(home, registry);
  // Registered even when this process may not look inside Chrome's data directory: the live check decides later.
  const extension = found === 'unreadable' ? 'unreadable' : chrome.extensionInstalled(directory);
  return {key, chromeProfileDirectory: directory, extension, ...unreadableCode(chrome, directory, extension)};
}

const unreadableCode = (chrome, directory, state) => state === 'unreadable' ? {chromeDataError: chrome.readError?.(directory) ?? 'unknown'} : {};

export function removeProfile({home, key}) {
  const registry = readRegistry(home);
  entryOf(registry, key);
  delete registry.profiles[key];
  writeRegistry(home, registry);
}

// `expected` is the entry as it stood when the instance id was looked for (bind's discovery takes seconds): the id is
// recorded only if the entry is still exactly that, so an id found for one Chrome profile directory is never stored
// under a key that was removed, re-added for another directory, or bound by another command meanwhile.
export function bindProfile({home, key, extensionInstanceId, expected, now = new Date()}) {
  if (typeof extensionInstanceId !== 'string' || !INSTANCE_ID.test(extensionInstanceId)) fail('invalid_instance_id', 'an extension instance id is 1-128 letters, digits or . _ : -');
  const registry = readRegistry(home);
  if (expected !== undefined && !isDeepStrictEqual(registry.profiles[key], expected)) {
    if (!Object.hasOwn(registry.profiles, key)) fail('profile_changed', `profile "${key}" was removed while its live backends were being listed; nothing was bound`, {hint: 'cua profiles list shows the registered keys'});
    fail('profile_changed', `profile "${key}" changed while its live backends were being listed (removed and added again, or bound by another command); the instance found for Chrome profile ${JSON.stringify(expected.chromeProfileDirectory)} was not recorded`, {hint: `run cua profiles bind ${key} again`});
  }
  const entry = entryOf(registry, key);
  const holder = Object.entries(registry.profiles).find(([other, e]) => other !== key && e.extensionInstanceId === extensionInstanceId)?.[0];
  if (holder) fail('instance_already_bound', `that extension instance is already bound to profile "${holder}"`, {hint: 'each Chrome profile has its own extension instance; check which profile you meant'});
  registry.profiles[key] = {chromeProfileDirectory: entry.chromeProfileDirectory, extensionInstanceId, boundAt: now.toISOString()};
  writeRegistry(home, registry);
  return registry.profiles[key];
}

// Every registered profile with its readiness from files alone, sorted by key. `reason` names why a profile is not
// ready: profile_directory_missing, extension_not_installed, chrome_data_unreadable (with `chromeDataError`, the error
// code) or not_bound (withLiveness adds the live check).
export function profileStatuses({home, chrome}) {
  const {profiles} = readRegistry(home);
  return Object.keys(profiles).sort().map(key => {
    const {chromeProfileDirectory, extensionInstanceId, boundAt} = profiles[key];
    const directory = chrome.profileDirectoryExists(chromeProfileDirectory);
    const extension = directory === 'missing' ? 'absent' : directory === 'unreadable' ? 'unreadable' : chrome.extensionInstalled(chromeProfileDirectory);
    const reason = directory === 'missing' ? 'profile_directory_missing'
      : extension === 'absent' ? 'extension_not_installed'
        : extension === 'unreadable' ? 'chrome_data_unreadable'
          : !extensionInstanceId ? 'not_bound' : null;
    return {key, chromeProfileDirectory, ready: reason === null, ...(reason ? {reason} : {}),
      ...(extensionInstanceId ? {extensionInstanceId} : {}), ...(boundAt ? {boundAt} : {}), ...unreadableCode(chrome, chromeProfileDirectory, extension)};
  });
}

// A bound profile whose files could not be read: only the live listing can make it ready.
export const awaitsLiveEvidence = p => p.reason === 'chrome_data_unreadable' && Boolean(p.extensionInstanceId);

// A bound, otherwise ready profile against the live Google Chrome backends' instance ids at this request (another
// browser's backends are no evidence; `liveIds` is null when the listing failed): ready only when its id is among them;
// host_not_live when the listing worked and no Chrome backend is live at all (Chrome closed, or its host exited), since
// then no host serves this profile whatever its binding; binding_stale when other backends are live but not its id,
// which is either a new instance id or this profile's host alone not running (backends are usually unlabelled, so the
// two cannot be told apart); backends_unlistable when the listing failed. A bound profile whose Chrome data this
// process may not read is ready when its id is live (the live backend is the evidence) and stays chrome_data_unreadable
// otherwise: without the files, a stale binding cannot be told from a removed extension.
export function withLiveness(statuses, liveIds) {
  return statuses.map(p => {
    if (awaitsLiveEvidence(p)) {
      if (!liveIds?.includes(p.extensionInstanceId)) return p;
      const {reason, ...rest} = p;
      return {...rest, ready: true};
    }
    if (!p.ready) return p;
    const reason = !liveIds ? 'backends_unlistable' : !liveIds.length ? 'host_not_live' : !liveIds.includes(p.extensionInstanceId) ? 'binding_stale' : null;
    return reason ? {...p, ready: false, reason} : p;
  });
}

// The one step that brings a profile's host back without changing its binding (`cua profiles open <key>` takes it for
// the user who asks; nothing takes it for them). Toggling the extension wakes it too, but can mint a new instance id
// (Surprises, 2026-10-04; not always, second-mac-acceptance.md), so it is offered only with the rebind it may then need.
const WAKE = 'open a window in Chrome profile "<dir>" (one line: cua profiles open <key>; Chrome unloads a profile and its extension host when the profile\'s last window closes, including a window a cua task opened and then closed) and click the OpenAI (ChatGPT) extension\'s icon if it still has no backend, then retry';

export const REASONS = {
  profile_directory_missing: 'the Chrome profile directory no longer exists',
  extension_not_installed: 'the OpenAI extension is not installed in this Chrome profile (install it there yourself; cua never does)',
  not_bound: 'not bound to an extension instance yet: run cua profiles bind',
  host_not_live: `no live OpenAI extension backend serves it (Chrome is closed, or no window of that profile is open): ${WAKE}; turning the extension off and on at chrome://extensions also wakes it but can mint a new instance id, so run cua profiles bind <key> after that`,
  binding_stale: `its bound extension instance is not among the live backends (other backends are live), and cua cannot tell which of two causes it is: this profile is not loaded or its host is not running (${WAKE}), or the extension was turned off and on or reinstalled, which can mint a new instance id (bind it again with cua profiles bind <key>)`,
  backends_unlistable: 'the live OpenAI extension backends could not be listed at this request (the listing launch failed), so whether its bound instance is live cannot be told',
  chrome_data_unreadable: `this process cannot read Chrome's data directory (${ACCESS_NOTE}, or run from a process that has it); the live check still works`,
};

// The unreadable case says what the live check can still do for this profile.
const UNREADABLE_NEXT = {
  bound: `its bound extension instance was not confirmed live: if Chrome is closed or its extension host exited, ${WAKE}`,
  unbound: 'it is not bound yet: cua profiles bind <key> works without that access',
};

// The registered profile's Chrome directory appears only where the user's step happens in that profile.
export const reasonText = ({key, reason, extensionInstanceId, chromeProfileDirectory}) => (reason === 'chrome_data_unreadable'
  ? `${REASONS[reason]}; ${UNREADABLE_NEXT[extensionInstanceId ? 'bound' : 'unbound']}` : REASONS[reason]).replaceAll('<key>', () => key).replaceAll('<dir>', () => chromeProfileDirectory);
