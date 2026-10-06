// Which Chrome profile directory each OpenAI extension instance belongs to, computed by cua itself in the CLI process
// for `cua profiles bind`, independent of the vendor's own labelling (browser-service.mjs `sL`, which runs inside the
// sandboxed runtime and fails silently there). The method is the vendor's: each profile in Local State's
// profile.info_cache whose `Local Extension Settings/<extension id>` store exists has that LevelDB store copied to a
// private temporary directory under $CUA_HOME/staging (Chrome holds the live store open, so it is never opened in place,
// and nothing is ever written into Chrome's directory), the copy's LOCK removed, the copy opened with the installed
// runtime's own classic-level, and its `extensionInstanceId` key read (a JSON string). The copies hold the extension's
// local storage, so they are removed before this returns, failure or not, and copies a killed run left behind are
// swept on the next run.
//
// The result never fails the command: a Local State this process may not read (macOS privacy protection without Full
// Disk Access) makes the mapping `unavailable` with reason chrome_data_unreadable and the error code; a store that
// cannot be copied or read makes it `partial` (the stores that were read still count); anything else that stops the
// mapping as a whole is `unavailable` with its own reason. Display names come back only for the caller to show beside
// the candidates the mapping placed.
import {mkdirSync, mkdtempSync, readdirSync, rmSync, statSync} from 'node:fs';
import {cp} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {homeLayout, realHome} from '../runtime/layout.mjs';
import {readFailure} from './chrome.mjs';

export const STAGING_PREFIX = 'chrome-stores-';
const STALE_MS = 10 * 60_000;
const INSTANCE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const PERMISSION = new Set(['EPERM', 'EACCES']);
export const isPermissionError = code => PERMISSION.has(code);

const require = createRequire(import.meta.url);
// The runtime's classic-level, by absolute path inside the installed release (its own dependencies resolve beside it).
export function loadClassicLevel(moduleDir) {
  return require(join(moduleDir, 'classic-level')).ClassicLevel;
}

async function readInstanceId(ClassicLevel, copy) {
  rmSync(join(copy, 'LOCK'), {force: true});
  const db = new ClassicLevel(copy, {createIfMissing: false, keyEncoding: 'utf8', valueEncoding: 'utf8'});
  try {
    await db.open();
    const raw = await db.get('extensionInstanceId');
    if (typeof raw !== 'string') return null;
    let value;
    try { value = JSON.parse(raw); } catch { return null; }
    return typeof value === 'string' && INSTANCE_ID.test(value) ? value : null;
  } finally {
    await db.close().catch(() => {});
  }
}

function sweepStale(staging, now) {
  let entries;
  try { entries = readdirSync(staging); } catch { return; }
  for (const name of entries) {
    if (!name.startsWith(STAGING_PREFIX)) continue;
    const path = join(staging, name);
    try { if (now - statSync(path).mtimeMs > STALE_MS) rmSync(path, {recursive: true, force: true}); } catch {}
  }
}

// -> {status: 'complete'|'partial', stores: Map<directory, instanceId[]>, names: Map<directory, name>,
//     unreadableStores?: n, readError?: code}
//  | {status: 'unavailable', reason: 'chrome_data_unreadable'|'local_state_unreadable'|'classic_level_unavailable'|'staging_unavailable', readError?}
// `stores` holds every directory whose store was read (an empty list when it records no instance id).
export async function mapExtensionDirectories({home, chrome, moduleDir, extensionIds, classicLevel = loadClassicLevel, now = Date.now()}) {
  let names;
  try { names = chrome.displayNames(); } catch (error) {
    return error?.readError ? {status: 'unavailable', reason: 'chrome_data_unreadable', readError: error.readError} : {status: 'unavailable', reason: 'local_state_unreadable'};
  }
  const present = [];
  let unreadableStores = 0;
  let readError;
  const unreadable = code => { unreadableStores++; readError ??= code; };
  for (const directory of names.keys()) {
    if (!chrome.isDirectoryName(directory)) continue;
    for (const extensionId of extensionIds) {
      const store = join(chrome.userData, directory, 'Local Extension Settings', extensionId);
      try { if (statSync(store).isDirectory()) present.push({directory, store}); } catch (error) {
        const code = readFailure(error);
        if (code) unreadable(code);
      }
    }
  }
  const stores = new Map();
  if (present.length) {
    let ClassicLevel;
    try { ClassicLevel = classicLevel(moduleDir); } catch { return {status: 'unavailable', reason: 'classic_level_unavailable'}; }
    if (typeof ClassicLevel !== 'function') return {status: 'unavailable', reason: 'classic_level_unavailable'};
    const {staging} = homeLayout(realHome(home));
    let scratch;
    try {
      mkdirSync(staging, {recursive: true, mode: 0o700});
      sweepStale(staging, now);
      scratch = mkdtempSync(join(staging, STAGING_PREFIX));
    } catch (error) {
      return {status: 'unavailable', reason: 'staging_unavailable', readError: error?.code ?? 'error'};
    }
    try {
      for (const [i, {directory, store}] of present.entries()) {
        const copy = join(scratch, String(i));
        let id;
        try {
          // fs/promises cp, not cpSync: Node's native cpSync aborts the whole process on an unreadable source directory.
          // dereference: a store that is itself a symlink would otherwise be "copied" as a link to the live store, which
          // the LOCK removal and the open below would then act on in place.
          await cp(store, copy, {recursive: true, dereference: true});
          id = await readInstanceId(ClassicLevel, copy);
        } catch (error) {
          unreadable(error?.code && /^E[A-Z]+$/.test(error.code) ? error.code : 'store_unreadable');
          continue;
        } finally {
          rmSync(copy, {recursive: true, force: true});
        }
        if (!stores.has(directory)) stores.set(directory, []);
        if (id) stores.get(directory).push(id);
      }
    } finally {
      rmSync(scratch, {recursive: true, force: true});
    }
  }
  return {status: unreadableStores ? 'partial' : 'complete', stores, names, ...(unreadableStores ? {unreadableStores, readError} : {})};
}
