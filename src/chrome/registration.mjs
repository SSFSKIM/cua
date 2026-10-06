// `cua chrome register|unregister`: point the browsers' native-messaging registration for the OpenAI extension at the
// host cua placed in its active release, and take it back.
//
// The OpenAI extension connects to exactly one native-messaging name (com.openai.codexextension), and a browser
// holds one manifest per name, so cua's host and the desktop app's cannot both be registered in one browser. The rule:
//   - register writes the manifest only where none exists, or where the existing one already names cua's host in this
//     home (the pinned host location of a release directory; rewritten if it names another release). Any other existing manifest (the desktop's, another host's, or
//     one that does not parse) makes register refuse as a whole, before anything is written, naming its class. One
//     that appears mid-run, or any other failure there, makes register undo what it already wrote in this run
//     (undoRun), or report exactly what it could not undo.
//   - register --replace backs each such manifest up byte-for-byte under <home>/chrome/manifest-backup/<browser>.json
//     and records it before overwriting; the caller announces the consequences first (REPLACE_CONSEQUENCES). Only a
//     whole native-messaging manifest is backed up (see `isManifestSnapshot`); anything else is left in place.
//   - unregister removes only manifests that name cua's host in this home. Where cua replaced one, it restores the
//     backup and verifies the restored bytes. A backup is restored only when the record holds its hash; when there is
//     no backup, no record, or no matching hash, or the restore does not verify, restoration is BLOCKED with the exact
//     user action and an unverified backup is kept, never installed.
// The manifest is the vendor installManifest.mjs format byte-for-byte except `path`. Browsers are those of
// `browsersFor` (the vendor's targets on this platform) whose user-data directory exists; their NativeMessagingHosts
// directory is created when missing.
// A slot this process may not read is `unreadable`, never absent or foreign: macOS 26+ puts browsers' user-data
// directories behind privacy protection, so a process without Full Disk Access gets EPERM there. A user-data directory
// it may not even stat counts as present (whether that browser is installed is unknown). Register and unregister both
// read every slot first and refuse as a whole with chrome_data_unreadable, before anything is written, when any slot is
// unreadable; one that becomes unreadable mid-run is never reported as removed or absent.
// The slots are shared with the desktop app, which re-syncs its manifest: cua takes exactly the file it read before
// replacing or removing it and publishes without clobbering (see `publish`/`take`), so a concurrent write is detected
// and never destroyed. Two cua commands sharing a CUA_HOME never interleave: register and unregister each hold the
// home's registration lock for their whole run (see `acquireLock`).
// No chrome-native-hosts-v2.json entry is written: the browser-use socket does not need one (only the desktop's
// side-panel app-server does, which is not cua's feature). Nothing here launches or signals a host or a browser.
import {linkSync, mkdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {homedir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {basename, dirname, isAbsolute, join, normalize} from 'node:path';
import {CuaError, fail} from '../runtime/errors.mjs';
import {realHome} from '../runtime/layout.mjs';
import {verifyCodeSignatures} from '../runtime/checks.mjs';
import {locateChromeComponent, verifyPlacedChromeComponent} from '../runtime/chrome-component.mjs';
import {loadPins} from '../runtime/manifest.mjs';
import {hostPathClass, linuxConfigHome, PERMISSION_FIX, readFailure} from '../profiles/chrome.mjs';

// macOS user-data directories, relative to the user's home (the vendor's chromium-family manifest directories).
const DARWIN_BROWSERS = [
  {browser: 'chrome', name: 'Google Chrome', dataDir: 'Library/Application Support/Google/Chrome'},
  {browser: 'edge', name: 'Microsoft Edge', dataDir: 'Library/Application Support/Microsoft Edge'},
  {browser: 'brave', name: 'Brave', dataDir: 'Library/Application Support/BraveSoftware/Brave-Browser'},
  {browser: 'opera', name: 'Opera', dataDir: 'Library/Application Support/com.operasoftware.Opera'},
  {browser: 'vivaldi', name: 'Vivaldi', dataDir: 'Library/Application Support/Vivaldi'},
];
// Linux user-data directories, relative to the configuration base (linuxConfigHome): the vendor's user-level table
// less google-chrome-for-testing, where no user profile lives. The keys are what registration.json and the backups
// record, so the darwin ones keep their names.
const LINUX_BROWSERS = [
  {browser: 'chrome', name: 'Google Chrome', dataDir: 'google-chrome', chromeFamily: true},
  {browser: 'chrome-beta', name: 'Google Chrome Beta', dataDir: 'google-chrome-beta', chromeFamily: true},
  {browser: 'chrome-unstable', name: 'Google Chrome Unstable', dataDir: 'google-chrome-unstable', chromeFamily: true},
  {browser: 'chromium', name: 'Chromium', dataDir: 'chromium', chromeFamily: true},
  {browser: 'edge', name: 'Microsoft Edge', dataDir: 'microsoft-edge'},
  {browser: 'brave', name: 'Brave', dataDir: 'BraveSoftware/Brave-Browser'},
  {browser: 'opera', name: 'Opera', dataDir: 'opera'},
  {browser: 'vivaldi', name: 'Vivaldi', dataDir: 'vivaldi'},
];

// The browsers cua registers with on `host`, each {browser, name, dataDir} with its absolute user-data directory.
export function browsersFor({host = {platform: process.platform}, env = process.env, userHome = homedir()} = {}) {
  if (host.platform === 'linux')
    return LINUX_BROWSERS.map(({chromeFamily, ...b}) => ({...b, dataDir: join(linuxConfigHome({env, userHome, chromeFamily}), b.dataDir)}));
  return DARWIN_BROWSERS.map(b => ({...b, dataDir: join(userHome, b.dataDir)}));
}

// "Chrome, Edge, … or Vivaldi user-data directory under <their common parent>": what register looked for.
function searched(browsers) {
  const names = browsers.map(b => b.name.replace(/^(Google|Microsoft) /, ''));
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : names.join('');
  const split = browsers.map(b => b.dataDir.split('/'));
  const common = split[0]?.slice(0, -1).filter((part, i) => split.every(parts => i < parts.length - 1 && parts[i] === part)) ?? [];
  return `${list} user-data directory under ${common.join('/') || '/'}`;
}

export const REPLACE_CONSEQUENCES = [
  'While cua\'s host is registered, the ChatGPT desktop app\'s Codex side panel and other app-server features in the browser stop working: no chrome-native-hosts-v2.json entry names cua\'s host, and that registry gates the app-server.',
  'The ChatGPT desktop app rewrites its own com.openai.codexextension manifest when it next runs, which replaces cua\'s registration again; `cua chrome unregister` restores the backed-up manifest now.',
];

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// A user-data directory this process may not stat counts as present: whether that browser is installed is unknown.
const mayBePresent = path => { try { return statSync(path).isDirectory(); } catch (error) { return readFailure(error) !== null; } };
const chromeDir = home => join(home, 'chrome');
const recordFile = home => join(chromeDir(home), 'registration.json');
const backupFile = (home, browser) => join(chromeDir(home), 'manifest-backup', `${browser}.json`);
const lockFile = home => join(chromeDir(home), 'registration.lock');

export function manifestText({name, description, extensionIds}, hostPath) {
  const manifest = {allowed_origins: [...new Set(extensionIds.map(id => `chrome-extension://${id}/`))], description, name, path: hostPath, type: 'stdio'};
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function slots({browsers, nativeHost, onlyPresent}) {
  return browsers.filter(b => !onlyPresent || mayBePresent(b.dataDir)).map(b => {
    const manifestDir = join(b.dataDir, 'NativeMessagingHosts');
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

// What a browser's manifest slot holds: nothing, a manifest naming cua's host in this home, anything else (with the
// class of the host it names, or `unreadable` when it names none), or `unreadable` with the code when this process may
// not read the slot at all (so what it holds is unknown).
function readSlot(path, {home, userHome, suffixes}) {
  let bytes;
  try { bytes = readFileSync(path); } catch (error) {
    const code = readFailure(error);
    return code ? {state: 'unreadable', code} : {state: 'absent'};
  }
  let manifest;
  try { manifest = JSON.parse(bytes.toString('utf8')); } catch { manifest = null; }
  const hostPath = typeof manifest?.path === 'string' ? manifest.path : null;
  if (isOwnHostPath(hostPath, {home, suffixes})) return {state: 'ours', bytes, hostPath};
  return {state: 'foreign', bytes, pathClass: hostPath ? hostPathClass(hostPath, {cuaHome: home, userHome}) : 'unreadable'};
}

// What cua wrote, per browser ({manifest, replaced}); an absent or unreadable record reads as empty.
export function readRecord(home) {
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

function publish(path, bytes, io, mode = 0o644) {
  mkdirSync(dirname(path), {recursive: true});
  const temp = sibling(path, 'tmp');
  try {
    io.writeFileSync(temp, bytes, {mode, flag: 'wx'});
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

// register and unregister in one CUA_HOME run one at a time, across processes: each holds <home>/chrome/registration.lock
// for its whole run (plan, every manifest write, the record and backups, any undo), so no second command can act on
// a slot the first has taken aside, or rewrite the recovery record under it. The lock is published like a manifest
// (link(2): never half-written, never clobbered) and names its holder's pid. A lock whose pid no longer runs is stale
// and is broken; one held by a running process, or one that names no pid, is waited for (`waitMs`), then the command
// refuses with registration_contended before changing anything. A directory created only for the lock goes with it,
// so a command that changed nothing leaves nothing behind.
export const LOCK_TIMING = {waitMs: 5000, pollMs: 50};
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const running = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
const holderOf = bytes => {
  let pid;
  try { ({pid} = JSON.parse(bytes.toString('utf8'))); } catch {}
  return Number.isInteger(pid) && pid > 0 ? pid : null;
};

function acquireLock(cuaHome, {waitMs, pollMs} = LOCK_TIMING) {
  const dir = chromeDir(cuaHome);
  const path = lockFile(cuaHome);
  const bytes = Buffer.from(`${JSON.stringify({pid: process.pid, token: randomUUID()})}\n`);
  const deadline = Date.now() + waitMs;
  let created;
  for (;;) {
    let held;
    try {
      created ??= mkdirSync(dir, {recursive: true, mode: 0o700});
      if (publish(path, bytes, FS, 0o600)) return {path, bytes, dir, created};
      held = readFileSync(path);
    } catch (error) {
      // The directory or the lock went away between the steps (its holder released it): look again.
      if (error.code === 'ENOENT' && Date.now() < deadline) continue;
      fail('registration_lock_failed', `could not take the registration lock ${path} (${error.code ?? error.message}); nothing was changed`, {cause: error});
    }
    const pid = holderOf(held);
    if (pid !== null && !running(pid)) { breakStaleLock(path, held); continue; }
    if (Date.now() >= deadline) {
      fail('registration_contended', pid === null
        ? `the registration lock ${path} is held but names no process; nothing was changed`
        : `another cua command (process ${pid}) is registering or unregistering cua's Chrome host in ${cuaHome}; nothing was changed`,
      {hint: pid === null
        ? `if no \`cua chrome register\` or \`unregister\` is running, remove the lock yourself (rm "${path}") and run the command again`
        : `run the command again once it has finished; if process ${pid} is not a cua command, remove the stale lock yourself (rm "${path}")`});
    }
    sleep(pollMs);
  }
}

// Moves a stale lock aside and deletes it only if it is still exactly the one read; a lock some live process took
// meanwhile goes back (an even newer one, if any, stands).
function breakStaleLock(path, stale) {
  const aside = sibling(path, 'stale');
  try { renameSync(path, aside); } catch (error) {
    if (error.code === 'ENOENT') return;
    fail('registration_lock_failed', `could not remove the stale registration lock ${path} (${error.code ?? error.message}); nothing was changed`, {hint: `remove it yourself (rm "${path}") and run the command again`, cause: error});
  }
  let same = false;
  try { same = readFileSync(aside).equals(stale); } catch {}
  if (!same) {
    try { linkSync(aside, path); } catch (error) {
      if (error.code !== 'EEXIST') fail('registration_lock_failed', `could not put a live registration lock back at ${path} (${error.code ?? error.message}); it is kept in ${aside}`, {hint: `mv "${aside}" "${path}"`, cause: error});
    }
  }
  rmSync(aside, {force: true});
}

// Removes only this run's own lock; a lock that stays behind (removal failed) names a pid that will be gone, so the
// next command breaks it.
function releaseLock({path, bytes, dir, created}) {
  try { if (readFileSync(path).equals(bytes)) rmSync(path, {force: true}); } catch {}
  if (!created) return;
  for (let d = dir; ; d = dirname(d)) {
    try { rmdirSync(d); } catch { return; }
    if (d === created) return;
  }
}

function refusal(foreign, nativeHost) {
  const where = foreign.map(s => `${s.browser} (${s.slot.pathClass})`).join(', ');
  const why = foreign.every(s => s.slot.pathClass === 'desktop')
    ? 'the desktop\'s registration is in use and already works with `cua serve`'
    : 'cua does not overwrite a registration it did not write';
  return `${nativeHost} is already registered for another host in ${where}: ${why}. Nothing was changed.`;
}

// Slots this process may not read: what they hold is unknown, so the command refuses as a whole and names the fix.
function unreadable(slotsRead, nativeHost, command) {
  const where = slotsRead.map(s => `${s.name} (${dirname(s.manifestPath)}: ${s.slot.code})`).join(', ');
  fail('chrome_data_unreadable', `this process cannot read the native-messaging directory of ${where}, so whether ${nativeHost} is registered there is unknown. Nothing was changed.`,
    {hint: `${PERMISSION_FIX}; then run \`cua chrome ${command}\` again`});
}

const ATTEMPTS = 3;
const contended = (path, unsettled) => fail('registration_contended', unsettled
  ? `${path} did not read as a whole native-messaging manifest in ${ATTEMPTS} attempts (another program may be writing it, or it is damaged); cua backs up only a whole manifest, so nothing more was changed there`
  : `${path} kept changing while cua was writing it; nothing more was changed there`,
{hint: unsettled
  ? `if an application is rewriting it, quit it and run the command again; if it stays like this, inspect it, move it aside yourself (mv "${path}" "${path}.damaged") and run the command again`
  : 'quit the application that keeps rewriting it, then run the command again'});

// A snapshot of a manifest cua is about to replace may become its backup, which unregister later restores, only when
// it is a whole native-messaging manifest for this name. The vendor installer publishes with an asynchronous
// fs/promises writeFile, whose truncating open and whose write are separate steps: a read between them sees an empty
// (or partly written) file, and that write then lands on the inode cua took aside. Such a read is contention, never a
// backup; a verified backup from an earlier run is therefore never replaced by one.
function isManifestSnapshot(bytes, name) {
  let manifest;
  try { manifest = JSON.parse(bytes.toString('utf8')); } catch { return false; }
  return manifest !== null && typeof manifest === 'object' && !Array.isArray(manifest) && manifest.name === name
    && typeof manifest.path === 'string' && manifest.path.length > 0 && manifest.type === 'stdio';
}
// How long register gives a writer before reading a manifest that did not read whole again.
const SETTLE_MS = 100;

// Registers the active release's Chrome host. `onReplace(consequences)` is called once, immediately before the first
// manifest cua did not write is actually replaced (including one that appeared after the plan); the consequences are
// therefore always announced before anything foreign is overwritten. `onStep(step, {browser, manifestPath})` (called
// right before each publish or take, and as `settle` before waiting for a manifest that did not read whole), `io`
// (see FS) and `lockTiming` (see LOCK_TIMING) are test seams, module API only. `browsers` is this host's table
// (browsersFor).
export async function registerHost({home, runtime, replace = false, userHome = homedir(), browsers = browsersFor({userHome}), verifySignatures = verifyCodeSignatures, onReplace, onStep, pins = loadPins(), io = FS, lockTiming = LOCK_TIMING}) {
  const cuaHome = realHome(home);
  const lock = acquireLock(cuaHome, lockTiming);
  try {
    return await registerLocked({cuaHome, runtime, replace, userHome, browsers, verifySignatures, onReplace, onStep, pins, io});
  } finally {
    releaseLock(lock);
  }
}

async function registerLocked({cuaHome, runtime, replace, userHome, browsers: table, verifySignatures, onReplace, onStep, pins, io}) {
  const paths = locateChromeComponent(runtime);
  const native = runtime.manifest.chromePlugin.nativeHost;
  const desired = Buffer.from(manifestText(native, paths.host));
  const context = {home: cuaHome, userHome, suffixes: hostSuffixes([...pins, runtime.manifest])};
  const planned = slots({browsers: table, nativeHost: native.name, onlyPresent: true}).map(s => ({...s, slot: readSlot(s.manifestPath, context)}));
  if (!planned.length)
    fail('no_supported_browser', `no ${searched(table)}`, {hint: 'open the browser once so it creates its profile, then run `cua chrome register` again'});
  const refused = planned.filter(s => s.slot.state === 'unreadable');
  if (refused.length) unreadable(refused, native.name, 'register');
  const foreign = planned.filter(s => s.slot.state === 'foreign');
  const replaceHint = `\`cua chrome register --replace\` backs each one up under ${join(chromeDir(cuaHome), 'manifest-backup')} and replaces it, after printing what stops working; \`cua chrome unregister\` restores it`;
  if (foreign.length && !replace) fail('registration_in_use', refusal(foreign, native.name), {hint: replaceHint});
  // The host must be cua's verified host, with the configuration it reads, before any browser is pointed at it.
  await verifyPlacedChromeComponent(runtime, {verifySignatures});

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
      let unsettled = false;
      for (let attempt = 0; attempt < ATTEMPTS && !done; attempt++) {
        unsettled = false;
        // Read again right before writing; a write by anyone else after this read is detected, never overwritten.
        const slot = readSlot(s.manifestPath, context);
        if (slot.state === 'unreadable') unreadable([{...s, slot}], native.name, 'register');
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
          if (!isManifestSnapshot(slot.bytes, native.name)) {
            // Mid-write or damaged: nothing is taken, backed up or announced; give a writer a moment, then read again.
            unsettled = true;
            if (attempt + 1 < ATTEMPTS) { step('settle'); await delay(SETTLE_MS); }
            continue;
          }
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
      browsers.push(done ?? contended(s.manifestPath, unsettled));
    }
  } catch (error) {
    throw undoRun(error, applied, {cuaHome, record, desired, io, onStep, context});
  }
  return {host: paths.host, browsers};
}

// A failure (a refusal included) after earlier browsers were written in this run undoes those writes, newest first,
// with the same discipline: take exactly cua's manifest (a concurrent writer's file is left standing) and put back the
// bytes that were there (the previous cua manifest, or the replaced foreign one) without clobbering. The record entry
// and backup this run made are discarded only when the earlier manifest is confirmed back, or when another program's
// manifest now stands there so no cua registration needs them. When the slot ends up holding some other cua manifest
// (or restoring lost a race to one), the restoration is unconfirmed: recovery data is kept and the result is
// `registration_partial` naming the path. A recovery-data cleanup failure after a settled undo is reported the same way
// (state `cleanup`, with the leftover backup) and does not stop the remaining undos. Returns the error to throw.
function undoRun(error, applied, {cuaHome, record, desired, io, onStep, context}) {
  if (!applied.length) return error;
  const outcomes = [];
  for (const change of [...applied].reverse()) {
    let outcome;
    try {
      outcome = undoChange(change, {desired, io, context, step: name => onStep?.(name, {browser: change.browser, manifestPath: change.manifestPath})});
    } catch (undoError) {
      outcome = {state: 'unconfirmed', why: undoError.message, hint: undoError.hint};
    }
    if (outcome.state !== 'unconfirmed') {
      // Recovery data goes only after the undo is settled; a cleanup failure keeps the record entry, is reported with
      // the leftover backup, and never stops the remaining undos.
      const backup = backupFile(cuaHome, change.browser);
      try {
        if (change.action === 'replaced') rmSync(backup, {force: true});
        if (change.action !== 'updated') delete record.browsers[change.browser];
      } catch (cleanupError) {
        outcome = {state: 'cleanup', why: `undone, but its backup ${backup} could not be removed (${cleanupError.code ?? cleanupError.message})`, hint: `remove it yourself: rm "${backup}"`};
      }
    }
    outcomes.push({...change, ...outcome});
  }
  try { writeRecord(cuaHome, record); } catch (recordError) { outcomes.push({browser: 'record', manifestPath: recordFile(cuaHome), state: 'unconfirmed', why: recordError.message}); }
  const left = outcomes.filter(o => o.state === 'unconfirmed' || o.state === 'cleanup');
  const superseded = outcomes.filter(o => o.state === 'superseded').map(o => o.browser);
  const note = superseded.length ? `; in ${superseded.join(', ')} another program's manifest now stands, so nothing of cua's remains there` : '';
  if (!left.length) {
    // Nothing of cua's from this run remains, so a refusal's "Nothing was changed." stands as written.
    if (error.code === 'registration_in_use' || error.code === 'chrome_data_unreadable') return error;
    error.message += `; cua undid what it had registered earlier in this run (${applied.map(c => c.browser).join(', ')})${note}`;
    return error;
  }
  const base = error.message.replace(/ Nothing was changed\.$/, '');
  const undone = outcomes.filter(o => (o.state === 'restored' || o.state === 'superseded' || o.state === 'cleanup') && o.browser !== 'record').map(o => o.browser);
  const unfinished = left.map(l => `${l.browser} (${l.manifestPath}: ${l.why})`).join('; ');
  // A run stopped by an unreadable directory needs the access first: without it the recovery steps are denied too.
  const access = error.code === 'chrome_data_unreadable' ? [PERMISSION_FIX] : [];
  return new CuaError('registration_partial',
    `${base} (${error.code ?? 'error'}). cua had already registered ${applied.map(c => c.browser).join(', ')} in this run${undone.length ? ` and undid ${undone.join(', ')}` : ''}${note}, but could not finish ${unfinished}`,
    {hint: [...new Set([...access, ...left.filter(l => l.hint).map(l => l.hint)])].concat('then run `cua chrome unregister` to remove cua\'s remaining registrations (it restores what cua replaced from the kept backup)').join('; '), cause: error});
}

// One change's undo: `restored` (cua's write is gone and the earlier bytes, if any, are back), `superseded` (another
// program's manifest stands in the slot), or `unconfirmed` with why.
function undoChange(change, {desired, io, context, step}) {
  const {manifestPath: path, prior} = change;
  const restore = () => {
    step('undo-publish');
    return publish(path, prior, io);
  };
  // What a slot that cua could not (or no longer could) restore now holds.
  const settle = () => {
    const now = readSlot(path, context);
    if (now.state === 'unreadable') return {state: 'unconfirmed', why: `this process can no longer read it (${now.code}), so whether cua's manifest is still there is unknown; its recovery data was kept`, hint: PERMISSION_FIX};
    if (now.state === 'foreign') return {state: 'superseded'};
    if (now.state === 'absent') {
      if (!prior || restore()) return {state: 'restored'};
      return readSlot(path, context).state === 'foreign' ? {state: 'superseded'} : {state: 'unconfirmed', why: 'another cua manifest took the slot while cua was restoring it; restoration of the earlier manifest is unconfirmed and its recovery data was kept'};
    }
    return {state: 'unconfirmed', why: 'the slot now holds a cua manifest other than this run\'s; restoration of the earlier manifest is unconfirmed and its recovery data was kept'};
  };
  step('undo');
  const aside = take(path, desired, io);
  if (!aside) return settle();
  if (!prior) { rmSync(aside, {force: true}); return {state: 'restored'}; }
  const placed = withTaken(aside, path, io, restore);
  rmSync(aside, {force: true});
  return placed ? {state: 'restored'} : settle();
}

const restoreYourself = (name, manifestPath) => `restore ${name}'s previous registration yourself: if it was the ChatGPT desktop app's, quit and reopen ChatGPT so it writes ${manifestPath} again, then run \`cua doctor\` and check that chrome.host.registered names the desktop host`;

// Removes cua's manifests from every browser and restores what cua replaced. Never touches a manifest it did not write:
// each removal takes exactly the file it read (see `take`), and a restore publishes without clobbering. Every slot is
// read first; when any is unreadable the command refuses as a whole (chrome_data_unreadable) before changing anything.
// Then every browser is processed; an I/O failure in one is that browser's BLOCKED result (backup and record kept),
// never a stop.
export function unregisterHost({home, userHome = homedir(), browsers = browsersFor({userHome}), nativeHost = 'com.openai.codexextension', pins = loadPins(), onStep, io = FS, lockTiming = LOCK_TIMING}) {
  const cuaHome = realHome(home);
  const lock = acquireLock(cuaHome, lockTiming);
  try {
    return unregisterLocked({cuaHome, userHome, browsers, nativeHost, pins, onStep, io});
  } finally {
    releaseLock(lock);
  }
}

function unregisterLocked({cuaHome, userHome, browsers: table, nativeHost, pins, onStep, io}) {
  const context = {home: cuaHome, userHome, suffixes: hostSuffixes(pins)};
  const record = readRecord(cuaHome);
  let recordChanged = false;
  const forget = browser => { if (record.browsers[browser]) { delete record.browsers[browser]; recordChanged = true; } };
  const all = slots({browsers: table, nativeHost, onlyPresent: false});
  const refused = all.map(s => ({...s, slot: readSlot(s.manifestPath, context)})).filter(s => s.slot.state === 'unreadable');
  if (refused.length) unreadable(refused, nativeHost, 'unregister');
  const browsers = all.map(s => {
    const row = {browser: s.browser, manifestPath: s.manifestPath};
    try {
      return unregisterSlot(s, row, {context, record, cuaHome, forget, io, step: name => onStep?.(name, row)});
    } catch (error) {
      const backup = backupFile(cuaHome, s.browser);
      // What the slot holds now decides what is reported; one this process cannot read is unknown, never "removed".
      const now = readSlot(s.manifestPath, context);
      const [action, state] = now.state === 'ours' ? ['not_removed', 'cua\'s registration is still in place']
        : now.state === 'unreadable' ? ['unknown', `whether cua's registration is still there is unknown (this process cannot read it: ${now.code})`]
        : ['removed', 'cua\'s registration is no longer there'];
      // Every recovery step touches the slot, so for one this process cannot read the access comes first.
      const recovery = error.code === 'manifest_rollback_failed' ? `${error.hint}; then run \`cua chrome unregister\` again`
        : now.state === 'unreadable' ? 'run `cua chrome unregister` again'
        : record.browsers[s.browser]?.replaced
        ? `fix the cause (${error.code ?? 'see above'}) and run \`cua chrome unregister\` again, or by hand: copy ${backup} to ${s.manifestPath} (cp "${backup}" "${s.manifestPath}"), then run \`cua doctor\``
        : `fix the cause (${error.code ?? 'see above'}) and run \`cua chrome unregister\` again, or ${restoreYourself(s.name, s.manifestPath)}`;
      return {...row, action, restoration: 'blocked',
        reason: `${['manifest_rollback_failed', 'manifest_write_failed', 'chrome_data_unreadable'].includes(error.code) ? error.message : error.code ?? error.message} while unregistering ${s.manifestPath}; ${state}, and the backup and its record were kept`,
        userAction: now.state === 'unreadable' ? `${PERMISSION_FIX}; then ${recovery}` : recovery};
    }
  });
  if (recordChanged) writeRecord(cuaHome, record);
  return {browsers, blocked: browsers.some(b => b.restoration === 'blocked')};
}

function unregisterSlot(s, row, {context, record, cuaHome, forget, io, step}) {
  const backup = backupFile(cuaHome, s.browser);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const slot = readSlot(s.manifestPath, context);
    if (slot.state === 'unreadable') fail('chrome_data_unreadable', `this process cannot read ${s.manifestPath} (${slot.code})`);
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
