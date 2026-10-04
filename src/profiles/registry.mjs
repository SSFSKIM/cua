// The profile registry: user-chosen keys for existing Chrome profiles, kept in $CUA_HOME/profiles.json, separate from
// any credential:
//   {version: 1, profiles: {<key>: {chromeProfileDirectory, extensionInstanceId?, boundAt?}}}
// A key names one existing profile directory under Chrome's user-data directory; no two keys share a directory or an
// extension instance. `extensionInstanceId` is the OpenAI extension instance this profile's backend reports, recorded
// by `cua profiles bind` (bind.mjs); the vendor API selects a browser by it (cua.getBrowser({extensionInstanceId})).
// Registering or removing a key never creates, changes or deletes anything in Chrome. Readiness is computed when asked
// (the user may install the extension later): a profile is ready when its directory exists, the extension is
// installed there, it is bound, and (where the live backends were listed, withLiveness) its bound instance is live: an
// extension disable/enable or reinstall mints a new instance id, so a binding can go stale.
// Parsing is strict: a damaged or unknown file is refused with a fix, never silently rewritten.
import {mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fail} from '../runtime/errors.mjs';
import {realHome} from '../runtime/layout.mjs';

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
  if (!chrome.profileDirectoryExists(directory)) fail('chrome_profile_not_found', `no Chrome profile directory named ${JSON.stringify(directory)} in ${chrome.userData}`, {hint: 'name an existing directory such as "Default" or "Profile 1" (chrome://version shows a profile\'s directory as the last part of its Profile Path)'});
  if (Object.hasOwn(registry.profiles, key)) fail('profile_exists', `profile "${key}" is already registered`, {hint: `cua profiles remove ${key} first to register it again`});
  const holder = Object.entries(registry.profiles).find(([, entry]) => entry.chromeProfileDirectory === directory)?.[0];
  if (holder) fail('chrome_profile_registered', `Chrome profile ${JSON.stringify(directory)} is already registered as "${holder}"`);
  registry.profiles[key] = {chromeProfileDirectory: directory};
  writeRegistry(home, registry);
  return {key, chromeProfileDirectory: directory, extensionInstalled: chrome.extensionInstalled(directory)};
}

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
// ready: profile_directory_missing, extension_not_installed or not_bound (withLiveness adds the live check).
export function profileStatuses({home, chrome}) {
  const {profiles} = readRegistry(home);
  return Object.keys(profiles).sort().map(key => {
    const {chromeProfileDirectory, extensionInstanceId, boundAt} = profiles[key];
    const reason = !chrome.profileDirectoryExists(chromeProfileDirectory) ? 'profile_directory_missing'
      : !chrome.extensionInstalled(chromeProfileDirectory) ? 'extension_not_installed'
        : !extensionInstanceId ? 'not_bound' : null;
    return {key, chromeProfileDirectory, ready: reason === null, ...(reason ? {reason} : {}),
      ...(extensionInstanceId ? {extensionInstanceId} : {}), ...(boundAt ? {boundAt} : {})};
  });
}

// A bound, otherwise ready profile against the live Google Chrome backends' instance ids at this request (another
// browser's backends are no evidence): ready only when its id is among them; binding_stale when other backends are live
// but not its id; backends_unlistable when no backend was listed at all (Chrome closed, no host, or the listing failed),
// since then whether the binding is current cannot be told. `liveIds` is empty for a failed listing.
export function withLiveness(statuses, liveIds) {
  return statuses.map(p => {
    if (!p.ready) return p;
    const reason = !liveIds.length ? 'backends_unlistable' : !liveIds.includes(p.extensionInstanceId) ? 'binding_stale' : null;
    return reason ? {...p, ready: false, reason} : p;
  });
}

export const REASONS = {
  profile_directory_missing: 'the Chrome profile directory no longer exists',
  extension_not_installed: 'the OpenAI extension is not installed in this Chrome profile (install it there yourself; cua never does)',
  not_bound: 'not bound to an extension instance yet: run cua profiles bind',
  binding_stale: 'its bound extension instance is not among the live backends (an extension disable/enable or reinstall mints a new id): bind it again with cua profiles bind <key>',
  backends_unlistable: 'no live OpenAI extension backend could be listed (is Chrome open with the extension enabled?), so whether its binding is current cannot be told',
};

export const reasonText = ({key, reason}) => REASONS[reason].replaceAll('<key>', key);
