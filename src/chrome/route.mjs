// The Chrome route of a cua home (spec docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md,
// "Registration, launch, binding, doctor"): cua's own extension and host, registered by `cua chrome register`
// (registration.mjs registerCuaHost) and recorded in
//   $CUA_HOME/chrome/cua-registration.json
// A home is on the route while that record exists; it is the only one. The ChatGPT extension route (OpenAI's extension
// and host, `cua chrome register --vendor`) was removed by #79 on 2026-10-17. Its record,
//   $CUA_HOME/chrome/registration.json   {schema: 1, browsers: {<browser>: {manifest, replaced, backupSha256?}}}
// is only read here, to tell a home that was on that route how to move (chromeMigration); nothing in cua writes it,
// restores what it lists or starts the host it named. A record that names no browser (what `unregister --vendor` left)
// counts as absent.
import {createHash} from 'node:crypto';
import {readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {realHome} from '../runtime/layout.mjs';
import {PERMISSION_FIX} from '../profiles/chrome.mjs';
import {readRegistry} from '../profiles/registry.mjs';

export const cuaRecordFile = home => join(home, 'chrome', 'cua-registration.json');
export const vendorRecordFile = home => join(home, 'chrome', 'registration.json');
const vendorBackupDir = home => join(home, 'chrome', 'manifest-backup');

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}
const writtenAt = path => { try { return statSync(path).mtimeMs; } catch { return null; } };
const iso = ms => new Date(ms).toISOString();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// One shell word that the shell takes literally (registration.mjs has the same).
const shellQuote = text => `'${text.replaceAll("'", "'\\''")}'`;
const PERMISSION = new Set(['EPERM', 'EACCES']);

// The cua record, or null when it is absent or not one: {schema: 1, route: 'cua', launcher, backendsDir,
// browsers: {<browser>: {manifestPath, previous: <launcher path>|null, backupSha256?}}}.
export function readCuaRecord(home) {
  const record = readJson(cuaRecordFile(realHome(home)));
  return record?.schema === 1 && record.route === 'cua' && isObject(record.browsers) ? record : null;
}

// The removed ChatGPT route's record, or null when it is absent, not one, or names no browser.
export function readVendorRecord(home) {
  const record = readJson(vendorRecordFile(realHome(home)));
  return record?.schema === 1 && isObject(record.browsers) && Object.keys(record.browsers).length ? record : null;
}

// -> 'cua' | null
export const chromeRoute = home => (readCuaRecord(home) ? 'cua' : null);

// The registered profiles bound other than on the cua route (a binding without `route` was made on the ChatGPT
// extension): each needs `cua profiles bind` again. None when the registry cannot be read (profiles list and doctor
// report that).
export function rebindRequired(home) {
  try {
    return Object.entries(readRegistry(home).profiles).filter(([, p]) => p.extensionInstanceId && p.route !== 'cua').map(([key]) => key);
  } catch { return []; }
}

// "a was bound on the ChatGPT extension: bind it again on the cua extension: cua profiles bind a"
export const rebindStep = keys => `${keys.join(', ')} ${keys.length === 1 ? 'was' : 'were'} bound on the ChatGPT extension: bind ${keys.length === 1 ? 'it' : 'them'} again on the cua extension: ${keys.map(key => `cua profiles bind ${key}`).join('; ')}`;

// What the ChatGPT route's registration left in the browsers, as the user's steps. Each com.openai.codexextension
// manifest its record lists that still names a host in this home (cua's relocated copy of OpenAI's host) is removed or,
// where it had replaced another program's manifest (the ChatGPT desktop app's), that one's backup is put back, but only
// on the record's word, as the removed unregister did: the backup exists and its sha256 is the record's backupSha256.
// A backup that is missing or does not match cannot be verified, so the step removes cua's manifest and leaves the
// desktop app's to the user (inspect the backup, or reopen the app, which rewrites its own). A manifest that is gone or
// names another host now is left alone; one this process may not read is named with the access to give it. Only when
// every listed manifest is resolved (left alone, or given an rm or a verified cp) do the record and its backups go;
// otherwise they are kept for manual recovery, and a later run, once the manifests are dealt with, names their
// removal. Every path in a command is one single-quoted shell word, so nothing in it is expanded when the user pastes it.
function leftoverSteps(root, record) {
  const steps = [];
  let unresolved = false;
  for (const [browser, entry] of Object.entries(record.browsers)) {
    const manifest = typeof entry?.manifest === 'string' ? entry.manifest : null;
    if (!manifest) continue;
    let named;
    try { named = JSON.parse(readFileSync(manifest, 'utf8'))?.path; } catch (error) {
      if (error instanceof SyntaxError || error.code === 'ENOENT' || error.code === 'ENOTDIR') continue;
      const code = error.code ?? 'error';
      unresolved = true;
      steps.push(`this process cannot read ${browser}'s manifest ${manifest} (${code}), so whether it names a host under ${root} is unknown: ${PERMISSION.has(code) ? PERMISSION_FIX : 'make it readable by the user cua runs as'}, then run \`cua doctor\` again`);
      continue;
    }
    if (typeof named !== 'string' || !named.startsWith(`${root}/`)) continue;
    if (entry.replaced !== true) {
      steps.push(`in ${browser}, remove the manifest cua placed: rm ${shellQuote(manifest)}`);
      continue;
    }
    const backup = join(vendorBackupDir(root), `${browser}.json`);
    const doubt = backupDoubt(backup, entry.backupSha256);
    if (!doubt) {
      steps.push(`in ${browser}, put back the manifest cua replaced: cp ${shellQuote(backup)} ${shellQuote(manifest)} (or quit and reopen the ChatGPT desktop app, which rewrites its own)`);
      continue;
    }
    unresolved = true;
    steps.push(`in ${browser}, cua wrote over the ChatGPT desktop app's manifest and its backup ${backup} ${doubt}, so it cannot be verified: remove cua's manifest: rm ${shellQuote(manifest)}, then quit and reopen the ChatGPT desktop app, which rewrites its own${doubt === 'is missing' ? '' : ' (or inspect the backup and put it back yourself if it is the desktop app\'s)'}`);
  }
  steps.push(unresolved
    ? `the old record ${vendorRecordFile(root)} and its backups in ${vendorBackupDir(root)} are kept for manual recovery: run \`cua doctor\` again once the manifests above are dealt with, and it names their removal`
    : `then remove the old record and its backups: rm -rf ${shellQuote(vendorRecordFile(root))} ${shellQuote(vendorBackupDir(root))}`);
  return steps;
}

// Why a backup cannot be put back on the record's word, or null when it can (it exists and its sha256 is the record's).
function backupDoubt(backup, recorded) {
  let bytes;
  try { bytes = readFileSync(backup); } catch (error) {
    return error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 'is missing' : `cannot be read (${error.code ?? 'error'})`;
  }
  if (typeof recorded !== 'string') return 'has no hash in the record';
  return sha256(bytes) === recorded ? null : 'does not match the hash in the record';
}

// What a home still has to do to be on the cua route alone, or null when nothing (spec, Decision Log 2026-10-17):
//   chrome_not_registered   no registration at all;
//   chatgpt_route_removed   the ChatGPT route's registration is the newest, or the only one;
//   chatgpt_route_leftover  cua's registration is the newer, and the ChatGPT route's record is still there;
//   rebind_required         cua's registration alone, with profiles still bound on the ChatGPT extension.
// -> {code, registered (cua's registration is in place), message: one sentence naming the steps in order}
export function chromeMigration(home) {
  const root = realHome(home);
  const cuaAt = readCuaRecord(root) ? writtenAt(cuaRecordFile(root)) : null;
  const vendor = readVendorRecord(root);
  const vendorAt = vendor ? writtenAt(vendorRecordFile(root)) : null;
  const rebind = rebindRequired(root);
  const register = 'run `cua chrome register` (cua\'s own host, for the cua extension)';
  const install = 'install or load the cua extension in each Chrome profile you use (README, "Chrome")';
  const bind = rebind.length ? [rebindStep(rebind)] : [];
  const sentence = (lead, steps) => `${lead}: ${steps.join('; ')}`;
  if (!vendor) {
    if (cuaAt !== null) return bind.length ? {code: 'rebind_required', registered: true, message: sentence('cua\'s own extension and host are registered', bind)} : null;
    return {code: 'chrome_not_registered', registered: false, message: sentence('this home has no Chrome registration', [register, install, ...bind])};
  }
  const removed = `this home was registered for the ChatGPT extension route (cua chrome register --vendor, ${iso(vendorAt)}), which cua no longer supports (removed in #79)`;
  if (cuaAt === null)
    return {code: 'chatgpt_route_removed', registered: false, message: sentence(removed, [register, install, ...bind, ...leftoverSteps(root, vendor)])};
  if (vendorAt > cuaAt)
    return {code: 'chatgpt_route_removed', registered: true, message: sentence(`${removed}, after cua's own registration of ${iso(cuaAt)}, which is the route now`,
      ['run `cua chrome register` again so cua\'s registration is the current one', ...bind, ...leftoverSteps(root, vendor)])};
  return {code: 'chatgpt_route_leftover', registered: true,
    message: sentence(`the ChatGPT extension route's registration of ${iso(vendorAt)} is left from before #79 removed that route, and cua no longer reads it`, [...bind, ...leftoverSteps(root, vendor)])};
}
