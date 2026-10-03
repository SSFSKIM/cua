// `cua chrome register|unregister`: point the browsers' native-messaging registration for the OpenAI extension at the
// host cua placed in its active release, and take it back.
//
// The OpenAI extension connects to exactly one native-messaging name (com.openai.codexextension), and a browser
// holds one manifest per name, so cua's host and the desktop app's cannot both be registered in one browser. The rule:
//   - register writes the manifest only where none exists, or where the existing one already names a cua host in this
//     home (rewritten if it names another release). Any other existing manifest (the desktop's, another host's, or
//     one that cannot be read) makes register refuse as a whole, before anything is written, naming its class.
//   - register --replace backs each such manifest up byte-for-byte under <home>/chrome/manifest-backup/<browser>.json
//     and records it before overwriting; the caller announces the consequences first (REPLACE_CONSEQUENCES).
//   - unregister removes only manifests that name a cua host in this home. Where cua replaced one, it restores the
//     backup and verifies the restored bytes; when there is no backup, it does not match, there is no record of what
//     was replaced, or the restore does not verify, restoration is BLOCKED with the exact user action.
// The manifest is the vendor installManifest.mjs format byte-for-byte except `path`. Browsers are the five the vendor
// targets on macOS whose user-data directory exists; their NativeMessagingHosts directory is created when missing.
// No chrome-native-hosts-v2.json entry is written: the browser-use socket does not need one (only the desktop's
// side-panel app-server does, which is not cua's feature). Nothing here launches or signals a host or a browser.
import {mkdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {homedir} from 'node:os';
import {basename, dirname, join} from 'node:path';
import {fail} from '../runtime/errors.mjs';
import {realHome} from '../runtime/layout.mjs';
import {verifyCodeSignatures} from '../runtime/checks.mjs';
import {locateChromeComponent, verifyChromeComponent} from '../runtime/chrome-component.mjs';
import {hostPathClass} from '../profiles/chrome.mjs';

// macOS user-data directories, relative to the user's home (the vendor's chromium-family manifest directories).
export const BROWSERS = [
  {browser: 'chrome', name: 'Google Chrome', dataDir: 'Library/Application Support/Google/Chrome'},
  {browser: 'edge', name: 'Microsoft Edge', dataDir: 'Library/Application Support/Microsoft Edge'},
  {browser: 'brave', name: 'Brave', dataDir: 'Library/Application Support/BraveSoftware/Brave-Browser'},
  {browser: 'opera', name: 'Opera', dataDir: 'Library/Application Support/com.operasoftware.Opera'},
  {browser: 'vivaldi', name: 'Vivaldi', dataDir: 'Library/Application Support/Vivaldi'},
];

export const REPLACE_CONSEQUENCES = [
  'While cua\'s host is registered, the ChatGPT desktop app\'s Codex side panel and other app-server features in the browser stop working: no chrome-native-hosts-v2.json entry names cua\'s host, and that registry gates the app-server.',
  'The ChatGPT desktop app rewrites its own com.openai.codexextension manifest when it next runs, which replaces cua\'s registration again; `cua chrome unregister` restores the backed-up manifest now.',
];

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const isDirectory = path => { try { return statSync(path).isDirectory(); } catch { return false; } };
const chromeDir = home => join(home, 'chrome');
const recordFile = home => join(chromeDir(home), 'registration.json');
const backupFile = (home, browser) => join(chromeDir(home), 'manifest-backup', `${browser}.json`);

export function manifestText({name, description, extensionIds}, hostPath) {
  const manifest = {allowed_origins: [...new Set(extensionIds.map(id => `chrome-extension://${id}/`))], description, name, path: hostPath, type: 'stdio'};
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function slots({userHome, nativeHost, onlyPresent}) {
  return BROWSERS.filter(b => !onlyPresent || isDirectory(join(userHome, b.dataDir))).map(b => {
    const manifestDir = join(userHome, b.dataDir, 'NativeMessagingHosts');
    return {...b, manifestDir, manifestPath: join(manifestDir, `${nativeHost}.json`)};
  });
}

// What a browser's manifest slot holds: nothing, a manifest naming a cua host in this home, or anything else (with
// the class of the host it names, or `unreadable`).
function readSlot(path, {home, userHome}) {
  let bytes;
  try { bytes = readFileSync(path); } catch (error) {
    if (error.code === 'ENOENT') return {state: 'absent'};
    fail('manifest_unreadable', `cannot read ${path}: ${error.code ?? error.message}`);
  }
  let manifest;
  try { manifest = JSON.parse(bytes.toString('utf8')); } catch { manifest = null; }
  const hostPath = typeof manifest?.path === 'string' ? manifest.path : null;
  if (hostPath?.startsWith(join(home, 'runtimes') + '/')) return {state: 'ours', bytes, hostPath};
  return {state: 'foreign', bytes, pathClass: hostPath ? hostPathClass(hostPath, {cuaHome: home, userHome}) : 'unreadable'};
}

function readRecord(home) {
  let record;
  try { record = JSON.parse(readFileSync(recordFile(home), 'utf8')); } catch { record = null; }
  const browsers = record?.schema === 1 && record.browsers && typeof record.browsers === 'object' && !Array.isArray(record.browsers) ? record.browsers : {};
  return {schema: 1, browsers};
}

const writeRecord = (home, record) => writeAtomic(recordFile(home), JSON.stringify(record, null, 2) + '\n', {mode: 0o600, dirMode: 0o700});

// Write-then-rename in the destination directory: readers see the old file or the new one, never a partial file.
function writeAtomic(path, bytes, {mode, dirMode}) {
  mkdirSync(dirname(path), {recursive: true, ...(dirMode ? {mode: dirMode} : {})});
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temp, bytes, {mode, flag: 'wx'});
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, {force: true});
    throw error;
  }
}

function refusal(foreign, nativeHost) {
  const where = foreign.map(s => `${s.browser} (${s.slot.pathClass})`).join(', ');
  const why = foreign.every(s => s.slot.pathClass === 'desktop')
    ? 'the desktop\'s registration is in use and already works with `cua serve`'
    : 'cua does not overwrite a registration it did not write';
  return `${nativeHost} is already registered for another host in ${where}: ${why}. Nothing was changed.`;
}

// Registers the active release's Chrome host. `onReplace(consequences)` is called once, before anything is
// overwritten, when --replace is about to replace at least one manifest cua did not write.
export async function registerHost({home, runtime, replace = false, userHome = homedir(), verifySignatures = verifyCodeSignatures, onReplace}) {
  const cuaHome = realHome(home);
  const paths = locateChromeComponent(runtime);
  const native = runtime.manifest.chromePlugin.nativeHost;
  const desired = Buffer.from(manifestText(native, paths.host));
  const context = {home: cuaHome, userHome};
  const planned = slots({userHome, nativeHost: native.name, onlyPresent: true}).map(s => ({...s, slot: readSlot(s.manifestPath, context)}));
  if (!planned.length)
    fail('no_supported_browser', `no Chrome, Edge, Brave, Opera or Vivaldi user-data directory under ${join(userHome, 'Library', 'Application Support')}`, {hint: 'open the browser once so it creates its profile, then run `cua chrome register` again'});
  const foreign = planned.filter(s => s.slot.state === 'foreign');
  if (foreign.length && !replace)
    fail('registration_in_use', refusal(foreign, native.name), {hint: `\`cua chrome register --replace\` backs each one up under ${join(chromeDir(cuaHome), 'manifest-backup')} and replaces it, after printing what stops working; \`cua chrome unregister\` restores it`});
  // The host must be cua's verified host before any browser is pointed at it.
  await verifyChromeComponent(paths.root, runtime.manifest, {verifySignatures});
  if (foreign.length) onReplace?.(REPLACE_CONSEQUENCES);

  const record = readRecord(cuaHome);
  const browsers = [];
  for (const s of planned) {
    // Read again right before writing, so nothing that appeared since the plan is overwritten without a backup.
    const slot = readSlot(s.manifestPath, context);
    const row = {browser: s.browser, manifestPath: s.manifestPath};
    const backup = backupFile(cuaHome, s.browser);
    if (slot.state === 'foreign') {
      if (!replace) fail('registration_in_use', refusal([{...s, slot}], native.name), {hint: 'something registered itself while cua was registering; rerun `cua chrome register`'});
      writeAtomic(backup, slot.bytes, {mode: 0o600, dirMode: 0o700});
      if (!readFileSync(backup).equals(slot.bytes)) fail('backup_failed', `the backup ${backup} does not match ${s.manifestPath}; nothing was replaced in ${s.browser}`);
      record.browsers[s.browser] = {manifest: s.manifestPath, replaced: true, backupSha256: sha256(slot.bytes)};
      writeRecord(cuaHome, record);
      writeAtomic(s.manifestPath, desired, {mode: 0o644});
      browsers.push({...row, action: 'replaced', backup});
    } else if (slot.state === 'ours') {
      if (slot.bytes.equals(desired)) { browsers.push({...row, action: 'unchanged'}); continue; }
      writeAtomic(s.manifestPath, desired, {mode: 0o644});
      browsers.push({...row, action: 'updated'});
    } else {
      record.browsers[s.browser] = {manifest: s.manifestPath, replaced: false};
      writeRecord(cuaHome, record);
      writeAtomic(s.manifestPath, desired, {mode: 0o644});
      browsers.push({...row, action: 'placed'});
    }
  }
  return {host: paths.host, browsers};
}

const restoreYourself = (name, manifestPath) => `restore ${name}'s previous registration yourself: if it was the ChatGPT desktop app's, quit and reopen ChatGPT so it writes ${manifestPath} again, then run \`cua doctor\` and check that chrome.host.registered names the desktop host`;

// Removes cua's manifests from every browser and restores what cua replaced. Never touches a manifest it did not write.
export function unregisterHost({home, userHome = homedir(), nativeHost = 'com.openai.codexextension'}) {
  const cuaHome = realHome(home);
  const context = {home: cuaHome, userHome};
  const record = readRecord(cuaHome);
  let recordChanged = false;
  const browsers = slots({userHome, nativeHost, onlyPresent: false}).map(s => {
    const slot = readSlot(s.manifestPath, context);
    const row = {browser: s.browser, manifestPath: s.manifestPath};
    if (slot.state === 'absent') return {...row, action: 'absent'};
    if (slot.state === 'foreign') return {...row, action: 'not_ours', pathClass: slot.pathClass};
    const entry = record.browsers[s.browser];
    const backup = backupFile(cuaHome, s.browser);
    if (entry) { delete record.browsers[s.browser]; recordChanged = true; }
    if (entry?.replaced === false) {
      unlinkSync(s.manifestPath);
      return {...row, action: 'removed', restoration: 'not_needed'};
    }
    let saved = null;
    try { saved = readFileSync(backup); } catch {}
    const blocked = (reason, userAction) => ({...row, action: 'removed', restoration: 'blocked', reason, userAction});
    if (!saved || (entry && sha256(saved) !== entry.backupSha256)) {
      unlinkSync(s.manifestPath);
      if (!entry) return blocked('cua has no record of what this registration replaced and no backup exists', restoreYourself(s.name, s.manifestPath));
      if (!saved) return blocked(`the backup ${backup} is missing`, restoreYourself(s.name, s.manifestPath));
      return blocked(`the backup ${backup} does not match what cua backed up; it was kept`, `inspect ${backup}; if it is the previous manifest, copy it to ${s.manifestPath}, otherwise ${restoreYourself(s.name, s.manifestPath)}`);
    }
    writeAtomic(s.manifestPath, saved, {mode: 0o644});
    let restored = null;
    try { restored = readFileSync(s.manifestPath); } catch {}
    if (!restored?.equals(saved))
      return {...row, action: 'restored', restoration: 'blocked', reason: `${s.manifestPath} does not read back as the backup`, userAction: `copy ${backup} to ${s.manifestPath} (cp "${backup}" "${s.manifestPath}"), then run \`cua doctor\``};
    rmSync(backup, {force: true});
    return {...row, action: 'restored', restoration: 'restored', backup};
  });
  if (recordChanged) writeRecord(cuaHome, record);
  return {browsers, blocked: browsers.some(b => b.restoration === 'blocked')};
}
