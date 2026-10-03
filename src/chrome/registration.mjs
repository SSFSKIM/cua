// `cua chrome register|unregister`: point the browsers' native-messaging registration for the OpenAI extension at the
// host cua placed in its active release, and take it back.
//
// The OpenAI extension connects to exactly one native-messaging name (com.openai.codexextension), and a browser
// holds one manifest per name, so cua's host and the desktop app's cannot both be registered in one browser. The rule:
//   - register writes the manifest only where none exists, or where the existing one already names cua's host in this
//     home (the pinned host location of a release directory; rewritten if it names another release). Any other existing manifest (the desktop's, another host's, or
//     one that cannot be read) makes register refuse as a whole, before anything is written, naming its class. One
//     that appears mid-run, or any other failure there, makes register undo what it already wrote in this run
//     (undoRun), or report exactly what it could not undo.
//   - register --replace backs each such manifest up byte-for-byte under <home>/chrome/manifest-backup/<browser>.json
//     and records it before overwriting; the caller announces the consequences first (REPLACE_CONSEQUENCES).
//   - unregister removes only manifests that name cua's host in this home. Where cua replaced one, it restores the
//     backup and verifies the restored bytes. A backup is restored only when the record holds its hash; when there is
//     no backup, no record, or no matching hash, or the restore does not verify, restoration is BLOCKED with the exact
//     user action and an unverified backup is kept, never installed.
// The manifest is the vendor installManifest.mjs format byte-for-byte except `path`. Browsers are the five the vendor
// targets on macOS whose user-data directory exists; their NativeMessagingHosts directory is created when missing.
// The slots are shared with the desktop app, which re-syncs its manifest: cua takes exactly the file it read before
// replacing or removing it and publishes without clobbering (see `publish`/`take`), so a concurrent write is detected
// and never destroyed.
// No chrome-native-hosts-v2.json entry is written: the browser-use socket does not need one (only the desktop's
// side-panel app-server does, which is not cua's feature). Nothing here launches or signals a host or a browser.
import {linkSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {homedir} from 'node:os';
import {basename, dirname, isAbsolute, join, normalize} from 'node:path';
import {CuaError, fail} from '../runtime/errors.mjs';
import {realHome} from '../runtime/layout.mjs';
import {verifyCodeSignatures} from '../runtime/checks.mjs';
import {locateChromeComponent, verifyChromeComponent} from '../runtime/chrome-component.mjs';
import {loadPins} from '../runtime/manifest.mjs';
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

// The exact host locations that are cua's: <home>/runtimes/<release>/<chromePlugin.dir>/<layout.host> for a valid
// release directory name and any checked-in pin's plugin layout. Anything else in the home (another executable under
// runtimes/, a path with `..` or doubled separators) is not cua's host.
const RELEASE_DIR = /^\d+(\.\d+)+-[a-z0-9]+-[a-z0-9]+$/;
export const hostSuffixes = pins => new Set(pins.map(pin => `${pin.chromePlugin.dir}/${pin.chromePlugin.layout.host}`));

export function isOwnHostPath(hostPath, {home, suffixes}) {
  if (typeof hostPath !== 'string' || !isAbsolute(hostPath) || normalize(hostPath) !== hostPath) return false;
  const prefix = join(home, 'runtimes') + '/';
  if (!hostPath.startsWith(prefix)) return false;
  const rest = hostPath.slice(prefix.length);
  const slash = rest.indexOf('/');
  return slash > 0 && RELEASE_DIR.test(rest.slice(0, slash)) && suffixes.has(rest.slice(slash + 1));
}

// What a browser's manifest slot holds: nothing, a manifest naming cua's host in this home, or anything else (with
// the class of the host it names, or `unreadable`).
function readSlot(path, {home, userHome, suffixes}) {
  let bytes;
  try { bytes = readFileSync(path); } catch (error) {
    if (error.code === 'ENOENT') return {state: 'absent'};
    fail('manifest_unreadable', `cannot read ${path}: ${error.code ?? error.message}`);
  }
  let manifest;
  try { manifest = JSON.parse(bytes.toString('utf8')); } catch { manifest = null; }
  const hostPath = typeof manifest?.path === 'string' ? manifest.path : null;
  if (isOwnHostPath(hostPath, {home, suffixes})) return {state: 'ours', bytes, hostPath};
  return {state: 'foreign', bytes, pathClass: hostPath ? hostPathClass(hostPath, {cuaHome: home, userHome}) : 'unreadable'};
}

function readRecord(home) {
  let record;
  try { record = JSON.parse(readFileSync(recordFile(home), 'utf8')); } catch { record = null; }
  const browsers = record?.schema === 1 && record.browsers && typeof record.browsers === 'object' && !Array.isArray(record.browsers) ? record.browsers : {};
  return {schema: 1, browsers};
}

const writeRecord = (home, record) => writeAtomic(recordFile(home), JSON.stringify(record, null, 2) + '\n', {mode: 0o600, dirMode: 0o700});

const sibling = (path, kind) => join(dirname(path), `.${basename(path)}.${randomUUID()}.${kind}`);

// Write-then-rename for cua's own files: readers see the old file or the new one, never a partial file.
function writeAtomic(path, bytes, {mode, dirMode}) {
  mkdirSync(dirname(path), {recursive: true, ...(dirMode ? {mode: dirMode} : {})});
  const temp = sibling(path, 'tmp');
  try {
    writeFileSync(temp, bytes, {mode, flag: 'wx'});
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, {force: true});
    throw error;
  }
}

// A browser's manifest slot is shared with other writers (the desktop app re-syncs its manifest), so cua never
// overwrites or deletes it blindly:
//   publish  puts bytes into an empty slot with link(2), which fails with EEXIST instead of clobbering whatever
//            appeared there; returns false on that collision.
//   take     moves the file in the slot aside with one rename, so cua holds exactly the file it will replace or
//            remove, and checks it is the one just read; otherwise (or if the check itself fails) it puts it back and
//            returns null, and the caller reads the slot again.
//   withTaken runs what follows a take; if that throws, the taken file goes back into the slot (unless something
//            newer is there, which stands) and the failure is classified. If even that rollback fails, the taken bytes
//            stay in the hidden aside file and the error names it with the exact command to restore it.
// `io` carries the filesystem calls on this path so tests can inject failures; production always uses node:fs.
const FS = {linkSync, renameSync, readFileSync, writeFileSync};

function publish(path, bytes, io) {
  mkdirSync(dirname(path), {recursive: true});
  const temp = sibling(path, 'tmp');
  try {
    io.writeFileSync(temp, bytes, {mode: 0o644, flag: 'wx'});
    io.linkSync(temp, path);
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  } finally {
    rmSync(temp, {force: true});
  }
}

function take(path, expected, io) {
  const aside = sibling(path, 'taken');
  try { io.renameSync(path, aside); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const same = withTaken(aside, path, io, () => io.readFileSync(aside).equals(expected));
  if (same) return aside;
  rollback(aside, path, io, 'it changed after cua read it');
  return null;
}

// Returns a taken file to its slot unless something newer is there already, which then stands.
function putBack(aside, path, io) {
  try { io.linkSync(aside, path); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  rmSync(aside, {force: true});
}

// putBack whose failure is never silent: the taken bytes stay in `aside`, named with the exact command to restore them.
function rollback(aside, path, io, why, cause) {
  try { putBack(aside, path, io); } catch (error) {
    fail('manifest_rollback_failed', `${path}: ${why}, and putting the manifest that was there back failed (${error.code ?? error.message}); its bytes are kept in ${aside}`,
      {hint: `restore it yourself: mv "${aside}" "${path}"`, cause: cause ?? error});
  }
}

function withTaken(aside, path, io, work) {
  try {
    return work();
  } catch (error) {
    const cause = error.code ?? error.message;
    rollback(aside, path, io, cause, error);
    if (error instanceof CuaError) throw error;
    fail('manifest_write_failed', `the change to ${path} failed (${cause}); the manifest that was there is back in place`, {cause: error});
  }
}

function refusal(foreign, nativeHost) {
  const where = foreign.map(s => `${s.browser} (${s.slot.pathClass})`).join(', ');
  const why = foreign.every(s => s.slot.pathClass === 'desktop')
    ? 'the desktop\'s registration is in use and already works with `cua serve`'
    : 'cua does not overwrite a registration it did not write';
  return `${nativeHost} is already registered for another host in ${where}: ${why}. Nothing was changed.`;
}

const ATTEMPTS = 3;
const contended = path => fail('registration_contended', `${path} kept changing while cua was writing it; nothing more was changed there`, {hint: 'quit the application that keeps rewriting it, then run the command again'});

// Registers the active release's Chrome host. `onReplace(consequences)` is called once, immediately before the first
// manifest cua did not write is actually replaced (including one that appeared after the plan); the consequences are
// therefore always announced before anything foreign is overwritten. `onStep(step, {browser, manifestPath})` (called
// right before each publish or take) and `io` (see FS) are test seams, module API only.
export async function registerHost({home, runtime, replace = false, userHome = homedir(), verifySignatures = verifyCodeSignatures, onReplace, onStep, pins = loadPins(), io = FS}) {
  const cuaHome = realHome(home);
  const paths = locateChromeComponent(runtime);
  const native = runtime.manifest.chromePlugin.nativeHost;
  const desired = Buffer.from(manifestText(native, paths.host));
  const context = {home: cuaHome, userHome, suffixes: hostSuffixes([...pins, runtime.manifest])};
  const planned = slots({userHome, nativeHost: native.name, onlyPresent: true}).map(s => ({...s, slot: readSlot(s.manifestPath, context)}));
  if (!planned.length)
    fail('no_supported_browser', `no Chrome, Edge, Brave, Opera or Vivaldi user-data directory under ${join(userHome, 'Library', 'Application Support')}`, {hint: 'open the browser once so it creates its profile, then run `cua chrome register` again'});
  const foreign = planned.filter(s => s.slot.state === 'foreign');
  const replaceHint = `\`cua chrome register --replace\` backs each one up under ${join(chromeDir(cuaHome), 'manifest-backup')} and replaces it, after printing what stops working; \`cua chrome unregister\` restores it`;
  if (foreign.length && !replace) fail('registration_in_use', refusal(foreign, native.name), {hint: replaceHint});
  // The host must be cua's verified host before any browser is pointed at it.
  await verifyChromeComponent(paths.root, runtime.manifest, {verifySignatures});

  let announced = false;
  const announce = () => { if (!announced) { announced = true; onReplace?.(REPLACE_CONSEQUENCES); } };
  const record = readRecord(cuaHome);
  const browsers = [];
  const applied = [];
  try {
    for (const s of planned) {
      const row = {browser: s.browser, manifestPath: s.manifestPath};
      const step = name => onStep?.(name, row);
      const backup = backupFile(cuaHome, s.browser);
      let done = null;
      for (let attempt = 0; attempt < ATTEMPTS && !done; attempt++) {
        // Read again right before writing; a write by anyone else after this read is detected, never overwritten.
        const slot = readSlot(s.manifestPath, context);
        if (slot.state === 'absent') {
          record.browsers[s.browser] = {manifest: s.manifestPath, replaced: false};
          writeRecord(cuaHome, record);
          step('publish');
          let placed = false;
          try { placed = publish(s.manifestPath, desired, io); } catch (error) {
            delete record.browsers[s.browser];
            writeRecord(cuaHome, record);
            fail('manifest_write_failed', `could not write ${s.manifestPath} (${error.code ?? error.message}); nothing was placed there`, {cause: error});
          }
          if (placed) done = {...row, action: 'placed'};
          else { delete record.browsers[s.browser]; writeRecord(cuaHome, record); }
        } else if (slot.state === 'ours') {
          if (slot.bytes.equals(desired)) { done = {...row, action: 'unchanged'}; break; }
          step('take');
          const aside = take(s.manifestPath, slot.bytes, io);
          if (!aside) continue;
          const placed = withTaken(aside, s.manifestPath, io, () => { step('publish'); return publish(s.manifestPath, desired, io); });
          // Published, or a newer manifest took the slot meanwhile and stands: either way the old one is not needed.
          rmSync(aside, {force: true});
          if (placed) done = {...row, action: 'updated'};
        } else {
          if (!replace) fail('registration_in_use', refusal([{...s, slot}], native.name), {hint: `it appeared while cua was registering; ${replaceHint}`});
          announce();
          step('take');
          const aside = take(s.manifestPath, slot.bytes, io);
          if (!aside) continue;
          const placed = withTaken(aside, s.manifestPath, io, () => {
            writeAtomic(backup, slot.bytes, {mode: 0o600, dirMode: 0o700});
            if (!readFileSync(backup).equals(slot.bytes)) fail('backup_failed', `the backup ${backup} does not match ${s.manifestPath}; nothing was replaced in ${s.browser}`);
            record.browsers[s.browser] = {manifest: s.manifestPath, replaced: true, backupSha256: sha256(slot.bytes)};
            writeRecord(cuaHome, record);
            step('publish');
            return publish(s.manifestPath, desired, io);
          });
          rmSync(aside, {force: true});
          if (placed) done = {...row, action: 'replaced', backup};
        }
        if (done && done.action !== 'unchanged') applied.push({...row, action: done.action, prior: done.action === 'placed' ? null : slot.bytes});
      }
      browsers.push(done ?? contended(s.manifestPath));
    }
  } catch (error) {
    throw undoRun(error, applied, {cuaHome, record, desired, io, onStep});
  }
  return {host: paths.host, browsers};
}

// A failure (a refusal included) after earlier browsers were written in this run undoes those writes, newest first,
// with the same discipline: take exactly cua's manifest (a concurrent writer's file is left standing), put back the
// bytes that were there (the previous cua manifest, or the replaced foreign one, without clobbering), and forget the
// record entry and backup this run made. Returns the error to throw: the original when everything was undone (with a
// note when it was not a refusal), else `registration_partial` naming what stayed and how to remove it.
function undoRun(error, applied, {cuaHome, record, desired, io, onStep}) {
  if (!applied.length) return error;
  const left = [];
  for (const change of [...applied].reverse()) {
    try {
      onStep?.('undo', {browser: change.browser, manifestPath: change.manifestPath});
      const aside = take(change.manifestPath, desired, io);
      if (aside) {
        if (change.prior) withTaken(aside, change.manifestPath, io, () => publish(change.manifestPath, change.prior, io));
        rmSync(aside, {force: true});
      }
      if (change.action !== 'updated') delete record.browsers[change.browser];
      if (change.action === 'replaced') rmSync(backupFile(cuaHome, change.browser), {force: true});
    } catch (undoError) {
      left.push({...change, why: undoError.message, hint: undoError.hint});
    }
  }
  try { writeRecord(cuaHome, record); } catch (recordError) { left.push({browser: 'record', manifestPath: recordFile(cuaHome), why: recordError.message}); }
  if (!left.length) {
    if (error.code === 'registration_in_use') return error;
    error.message += `; cua undid what it had registered earlier in this run (${applied.map(c => c.browser).join(', ')})`;
    return error;
  }
  const base = error.message.replace(/ Nothing was changed\.$/, '');
  const undone = applied.filter(c => !left.some(l => l.browser === c.browser)).map(c => c.browser);
  return new CuaError('registration_partial',
    `${base} (${error.code ?? 'error'}). cua had already registered ${applied.map(c => c.browser).join(', ')} in this run${undone.length ? ` and undid ${undone.join(', ')}` : ''}, but could not undo ${left.map(l => `${l.browser} (${l.manifestPath}: ${l.why})`).join('; ')}`,
    {hint: [...left.filter(l => l.hint).map(l => l.hint), 'then run `cua chrome unregister` to remove cua\'s remaining registrations (it restores what cua replaced)'].join('; '), cause: error});
}

const restoreYourself = (name, manifestPath) => `restore ${name}'s previous registration yourself: if it was the ChatGPT desktop app's, quit and reopen ChatGPT so it writes ${manifestPath} again, then run \`cua doctor\` and check that chrome.host.registered names the desktop host`;

// Removes cua's manifests from every browser and restores what cua replaced. Never touches a manifest it did not write:
// each removal takes exactly the file it read (see `take`), and a restore publishes without clobbering. Every browser
// is processed; an I/O failure in one is that browser's BLOCKED result (backup and record kept), never a stop.
export function unregisterHost({home, userHome = homedir(), nativeHost = 'com.openai.codexextension', pins = loadPins(), onStep, io = FS}) {
  const cuaHome = realHome(home);
  const context = {home: cuaHome, userHome, suffixes: hostSuffixes(pins)};
  const record = readRecord(cuaHome);
  let recordChanged = false;
  const forget = browser => { if (record.browsers[browser]) { delete record.browsers[browser]; recordChanged = true; } };
  const browsers = slots({userHome, nativeHost, onlyPresent: false}).map(s => {
    const row = {browser: s.browser, manifestPath: s.manifestPath};
    try {
      return unregisterSlot(s, row, {context, record, cuaHome, forget, io, step: name => onStep?.(name, row)});
    } catch (error) {
      const backup = backupFile(cuaHome, s.browser);
      const stillOurs = (() => { try { return readSlot(s.manifestPath, context).state === 'ours'; } catch { return false; } })();
      return {...row, action: stillOurs ? 'not_removed' : 'removed', restoration: 'blocked',
        reason: `${error.code === 'manifest_rollback_failed' || error.code === 'manifest_write_failed' ? error.message : error.code ?? error.message} while unregistering ${s.manifestPath}; ${stillOurs ? 'cua\'s registration is still in place' : 'cua\'s registration is no longer there'}, and the backup and its record were kept`,
        userAction: error.code === 'manifest_rollback_failed' ? `${error.hint}; then run \`cua chrome unregister\` again`
          : record.browsers[s.browser]?.replaced
          ? `fix the cause (${error.code ?? 'see above'}) and run \`cua chrome unregister\` again, or by hand: copy ${backup} to ${s.manifestPath} (cp "${backup}" "${s.manifestPath}"), then run \`cua doctor\``
          : `fix the cause (${error.code ?? 'see above'}) and run \`cua chrome unregister\` again, or ${restoreYourself(s.name, s.manifestPath)}`};
    }
  });
  if (recordChanged) writeRecord(cuaHome, record);
  return {browsers, blocked: browsers.some(b => b.restoration === 'blocked')};
}

function unregisterSlot(s, row, {context, record, cuaHome, forget, io, step}) {
  const backup = backupFile(cuaHome, s.browser);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const slot = readSlot(s.manifestPath, context);
    if (slot.state === 'absent') return {...row, action: 'absent'};
    if (slot.state === 'foreign') return {...row, action: 'not_ours', pathClass: slot.pathClass};
    const entry = record.browsers[s.browser];
    let saved = null;
    if (entry?.replaced !== false) { try { saved = readFileSync(backup); } catch {} }
    // A backup is restored only on the record's word: a replacement entry whose hash matches it. Without one (record
    // missing, unreadable, or silent about this browser) the backup's provenance is unknown and it is never installed.
    const usable = saved && entry?.replaced === true && typeof entry.backupSha256 === 'string' && sha256(saved) === entry.backupSha256;
    step('take');
    const aside = take(s.manifestPath, slot.bytes, io);
    if (!aside) continue;
    if (entry?.replaced === false) {
      rmSync(aside, {force: true});
      forget(s.browser);
      return {...row, action: 'removed', restoration: 'not_needed'};
    }
    if (!usable) {
      rmSync(aside, {force: true});
      forget(s.browser);
      const blocked = (reason, userAction) => ({...row, action: 'removed', restoration: 'blocked', reason, userAction});
      const inspect = `inspect ${backup}; if it is the previous manifest, copy it to ${s.manifestPath}, otherwise ${restoreYourself(s.name, s.manifestPath)}`;
      if (!entry && !saved) return blocked('cua has no record of what this registration replaced and no backup exists', restoreYourself(s.name, s.manifestPath));
      if (!entry) return blocked(`cua has no record of what this registration replaced, so the backup ${backup} is unverified; it was kept, not restored`, inspect);
      if (!saved) return blocked(`the backup ${backup} is missing`, restoreYourself(s.name, s.manifestPath));
      return blocked(`the backup ${backup} does not match what cua recorded backing up; it was kept, not restored`, inspect);
    }
    const placed = withTaken(aside, s.manifestPath, io, () => { step('publish'); return publish(s.manifestPath, saved, io); });
    rmSync(aside, {force: true});
    if (!placed)
      return {...row, action: 'removed', restoration: 'blocked', reason: `another program wrote ${s.manifestPath} while cua was restoring it; that manifest was left as it is and the backup ${backup} was kept`, userAction: `check which host ${s.manifestPath} names (\`cua doctor\`, chrome.host.registered); if it is not the one you want, copy ${backup} to ${s.manifestPath}`};
    step('restored');
    let restored = null;
    try { restored = readFileSync(s.manifestPath); } catch {}
    if (!restored?.equals(saved))
      return {...row, action: 'restored', restoration: 'blocked', reason: `${s.manifestPath} does not read back as the backup; the backup and its record were kept`, userAction: `copy ${backup} to ${s.manifestPath} (cp "${backup}" "${s.manifestPath}"), then run \`cua doctor\``};
    rmSync(backup, {force: true});
    forget(s.browser);
    return {...row, action: 'restored', restoration: 'restored', backup};
  }
  return contended(s.manifestPath);
}
