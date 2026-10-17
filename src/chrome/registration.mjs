// `cua chrome register|unregister`: point every present browser's native-messaging registration for cua's own
// extension at this home's host launcher, and take it back (spec docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md,
// "Registration, launch, binding, doctor"). The rule:
//   - register points every present browser's io.github.ssfskim.cua manifest at this home's launcher,
//     $CUA_HOME/chrome/host: a shell script that bakes CUA_HOME (Chrome spawns hosts with its own environment) and execs
//     this node on the checkout's src/chrome/host.mjs (real paths: an `npm link` checkout is a symlink). A manifest
//     naming this home's launcher is cua's (rewritten when its bytes differ); none is placed; any other (another home's
//     launcher, or one that does not parse) refuses the whole run with other_home before anything is written, unless
//     --replace, which backs it up byte for byte under chrome/cua-manifest-backup/<browser>.json and records the
//     launcher it named (`previous`) so `cua chrome unregister` restores it;
//   - the home must fit a host socket: its longest socket path is at most 103 bytes (macOS sun_path), else
//     socket_path_too_long before anything is written;
//   - the launcher, chrome/b and chrome/logs (0700) and the record (route.mjs) are written before any manifest, so a
//     manifest never names a launcher that is not there and a run that stops midway leaves what unregister needs. A
//     failure midway undoes this run's manifest writes (or reports registration_partial naming what it could not undo).
//   - unregister removes only manifests naming this home's launcher, restoring a recorded backup whose hash matches
//     (else BLOCKED with the user action, the backup and record kept); with nothing blocked the record and the launcher
//     go too, so the home is off the cua route.
// The manifest is Chrome's native-messaging format (the vendor installManifest.mjs layout, key order included).
// Browsers are those of `browsersFor` (the vendor's targets on this platform) whose user-data directory exists; their
// NativeMessagingHosts directory is created when missing.
// A slot this process may not read is `unreadable`, never absent or foreign: macOS 26+ puts browsers' user-data
// directories behind privacy protection, so a process without Full Disk Access gets EPERM there. A user-data directory
// it may not even stat counts as present (whether that browser is installed is unknown). Register and unregister both
// read every slot first and refuse as a whole with chrome_data_unreadable, before anything is written, when any slot is
// unreadable.
// cua takes exactly the file it read before replacing or removing it and publishes without clobbering (see
// `publish`/`take`), so a concurrent write is detected and never destroyed. Two cua commands sharing a CUA_HOME never
// interleave: register and unregister each hold the home's registration lock for their whole run (see `acquireLock`).
// Nothing here launches or signals a host or a browser.
//
// The ChatGPT extension route (`cua chrome register --vendor`, com.openai.codexextension for OpenAI's extension) was
// removed by #79 (2026-10-17); route.mjs reads what it left, to tell the user how to move.
import {chmodSync, linkSync, mkdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, statSync, utimesSync, writeFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {homedir} from 'node:os';
import {basename, dirname, isAbsolute, join, resolve} from 'node:path';
import {CuaError, fail} from '../runtime/errors.mjs';
import {realHome} from '../runtime/layout.mjs';
import {linuxConfigHome, PERMISSION_FIX, readFailure} from '../profiles/chrome.mjs';
import {CUA_EXTENSION_ID, CUA_HOST_NAME, MAX_SOCKET_PATH_BYTES, backendDir, launcherLog, launcherPath, logDir, longestSocketPath} from './extension.mjs';
import {cuaRecordFile, readCuaRecord} from './route.mjs';

export {readCuaRecord};

// macOS user-data directories, relative to the user's home (the vendor's chromium-family manifest directories).
const DARWIN_BROWSERS = [
  {browser: 'chrome', name: 'Google Chrome', dataDir: 'Library/Application Support/Google/Chrome'},
  {browser: 'edge', name: 'Microsoft Edge', dataDir: 'Library/Application Support/Microsoft Edge'},
  {browser: 'brave', name: 'Brave', dataDir: 'Library/Application Support/BraveSoftware/Brave-Browser'},
  {browser: 'opera', name: 'Opera', dataDir: 'Library/Application Support/com.operasoftware.Opera'},
  {browser: 'vivaldi', name: 'Vivaldi', dataDir: 'Library/Application Support/Vivaldi'},
];
// Linux user-data directories, relative to the configuration base (linuxConfigHome): the vendor's user-level table
// less google-chrome-for-testing, where no user profile lives. The keys are what cua-registration.json and the backups
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
  const split = browsers.map(b => dirname(b.dataDir).split('/'));
  let shared = 0;
  while (shared < split[0].length && split.every(parts => parts[shared] === split[0][shared])) shared++;
  return `${list} user-data directory under ${split[0].slice(0, shared).join('/') || '/'}`;
}


const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// A user-data directory this process may not stat counts as present: whether that browser is installed is unknown.
const mayBePresent = path => { try { return statSync(path).isDirectory(); } catch (error) { return readFailure(error) !== null; } };
const chromeDir = home => join(home, 'chrome');
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

// A browser's manifest slot is shared with other writers (another cua home's register, a user's own edit), so cua never
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


// Slots this process may not read: what they hold is unknown, so the command refuses as a whole and names the fix.
function unreadable(slotsRead, nativeHost, command) {
  const where = slotsRead.map(s => `${s.name} (${dirname(s.manifestPath)}: ${s.slot.code})`).join(', ');
  fail('chrome_data_unreadable', `this process cannot read the native-messaging directory of ${where}, so whether ${nativeHost} is registered there is unknown. Nothing was changed.`,
    {hint: `${PERMISSION_FIX}; then run \`cua chrome ${command}\` again`});
}

const contended = path => fail('registration_contended', `${path} kept changing while cua was writing it; nothing more was changed there`,
  {hint: 'quit the application that keeps rewriting it, then run the command again'});

export const CUA_NATIVE_HOST = {name: CUA_HOST_NAME, description: 'cua browser native messaging host', extensionIds: [CUA_EXTENSION_ID]};
const cuaBackupDir = home => join(chromeDir(home), 'cua-manifest-backup');
const cuaBackupFile = (home, browser) => join(cuaBackupDir(home), `${browser}.json`);

// Single-quoted for sh; parseLauncher reads the assignments back for doctor.
const shellQuote = text => `'${text.replaceAll("'", "'\\''")}'`;
export function launcherText({home, nodePath, host}) {
  return [
    '#!/bin/sh',
    '# cua\'s Chrome native-messaging host launcher, written by `cua chrome register`. Chrome starts it with its own',
    '# environment, so the home is baked in; Node\'s own stderr (warnings, a crash before main) goes to the launcher log',
    '# (the host writes its own lines to chrome/logs/<name>.log; Chrome discards a host\'s stderr).',
    `CUA_HOME=${shellQuote(home)}`,
    'export CUA_HOME',
    `node=${shellQuote(nodePath)}`,
    `host=${shellQuote(host)}`,
    `logs=${shellQuote(logDir(home))}`,
    `log=${shellQuote(launcherLog(home))}`,
    'mkdir -p -m 700 "$logs" 2>/dev/null',
    'printf \'%s start pid %s\\n\' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$$" >>"$log"',
    'exec "$node" "$host" "$@" 2>>"$log"',
    '',
  ].join('\n');
}

// -> {home, node, host} as a launcher written by launcherText assigns them; a missing assignment is null.
export function parseLauncher(text) {
  const value = name => {
    const match = text.match(new RegExp(`^${name}='((?:[^']|'\\\\'')*)'$`, 'm'));
    return match ? match[1].replaceAll("'\\''", "'") : null;
  };
  return {home: value('CUA_HOME'), node: value('node'), host: value('host')};
}

// What a browser's io.github.ssfskim.cua slot holds: nothing, cua's manifest naming this home's launcher, another
// (with the launcher it names, or null when it names none), or `unreadable` with the code.
function readCuaSlot(path, launcher) {
  let bytes;
  try { bytes = readFileSync(path); } catch (error) {
    const code = readFailure(error);
    return code ? {state: 'unreadable', code} : {state: 'absent'};
  }
  let manifest;
  try { manifest = JSON.parse(bytes.toString('utf8')); } catch { manifest = null; }
  const named = typeof manifest?.path === 'string' ? manifest.path : null;
  return named === launcher ? {state: 'ours', bytes} : {state: 'foreign', bytes, previous: named};
}

function otherHome(foreign) {
  const where = foreign.map(s => `${s.browser} (${s.slot.previous ? `names ${s.slot.previous}` : 'names no host path'})`).join(', ');
  fail('other_home', `${CUA_HOST_NAME} is already registered for another host in ${where}: cua does not overwrite a registration this home did not write. Nothing was changed.`,
    {hint: '`cua chrome register --replace` backs each one up and records the launcher it named; `cua chrome unregister` restores it'});
}

function fileAt(path) {
  try { return statSync(path).isFile(); } catch { return false; }
}

// The real path a directory has, or will have once created: its deepest existing ancestor resolved, the rest appended
// (so a home under a symlinked parent, such as macOS /tmp, is baked as the path doctor later resolves it to).
function eventualRealPath(path) {
  const rest = [];
  for (let dir = resolve(path); ; dir = dirname(dir)) {
    try { return join(realpathSync(dir), ...rest); } catch (error) {
      if (dirname(dir) === dir) throw error;
      rest.unshift(basename(dir));
    }
  }
}

// Registers cua's own host for this home. `checkout` is the cua checkout whose src/chrome/host.mjs the launcher runs;
// `nodePath` the node that runs it; `browsers` this host's table (browsersFor); `io` and `lockTiming` are test seams.
// -> {launcher, backendsDir, browsers: [{browser, manifestPath, action: placed|replaced|updated|unchanged, previous, backup?}]}
export async function registerCuaHost({home, checkout, nodePath = process.execPath, replace = false, browsers = browsersFor(), io = FS, lockTiming = LOCK_TIMING}) {
  const cuaHome = eventualRealPath(home);
  const longest = longestSocketPath(cuaHome);
  const bytes = Buffer.byteLength(longest);
  if (bytes > MAX_SOCKET_PATH_BYTES)
    fail('socket_path_too_long', `a host socket in this home would be ${bytes} bytes long (${longest}), over the ${MAX_SOCKET_PATH_BYTES}-byte limit of a Unix socket path; nothing was changed`,
      {hint: `use a CUA_HOME at most ${MAX_SOCKET_PATH_BYTES - (bytes - Buffer.byteLength(cuaHome))} bytes long (the default home fits a username of up to 37 characters)`});
  // BROWSER_USE_BACKEND_PATHS separates its paths with ':' (discovery.mjs).
  if (cuaHome.includes(':')) fail('home_path_unsupported', `the cua route cannot use a CUA_HOME containing ':' (${cuaHome}); nothing was changed`, {hint: 'use a CUA_HOME without \':\''});
  let host = null;
  try { host = join(realpathSync(checkout), 'src', 'chrome', 'host.mjs'); } catch {}
  if (!host || !fileAt(host)) fail('host_missing', `${join(String(checkout), 'src', 'chrome', 'host.mjs')} is not there; nothing was changed`, {hint: 'run `cua chrome register` from a complete cua checkout'});
  if (typeof nodePath !== 'string' || !isAbsolute(nodePath) || !fileAt(nodePath)) fail('node_missing', `the node executable ${nodePath} is not there; nothing was changed`);
  const lock = acquireLock(cuaHome, lockTiming);
  try {
    return registerCuaLocked({cuaHome, host, nodePath, replace, table: browsers, io});
  } finally {
    releaseLock(lock);
  }
}

function registerCuaLocked({cuaHome, host, nodePath, replace, table, io}) {
  const launcher = launcherPath(cuaHome);
  const desired = Buffer.from(manifestText(CUA_NATIVE_HOST, launcher));
  const planned = slots({browsers: table, nativeHost: CUA_HOST_NAME, onlyPresent: true}).map(s => ({...s, slot: readCuaSlot(s.manifestPath, launcher)}));
  if (!planned.length)
    fail('no_supported_browser', `no ${searched(table)}`, {hint: 'open the browser once so it creates its profile, then run `cua chrome register` again'});
  const refused = planned.filter(s => s.slot.state === 'unreadable');
  if (refused.length) unreadable(refused, CUA_HOST_NAME, 'register');
  const foreign = planned.filter(s => s.slot.state === 'foreign');
  if (foreign.length && !replace) otherHome(foreign);

  for (const dir of [backendDir(cuaHome), logDir(cuaHome)]) {
    mkdirSync(dir, {recursive: true, mode: 0o700});
    chmodSync(dir, 0o700);
  }
  writeAtomic(launcher, launcherText({home: cuaHome, nodePath, host}), {mode: 0o700, dirMode: 0o700});
  const before = readCuaRecord(cuaHome);
  const beforeAt = before ? writtenAt(cuaRecordFile(cuaHome)) : null;
  const record = {schema: 1, route: 'cua', launcher, backendsDir: backendDir(cuaHome), browsers: {...before?.browsers}};
  const backups = [];
  for (const s of planned) {
    const kept = record.browsers[s.browser];
    if (s.slot.state === 'foreign') {
      const backup = cuaBackupFile(cuaHome, s.browser);
      writeAtomic(backup, s.slot.bytes, {mode: 0o600, dirMode: 0o700});
      if (!readFileSync(backup).equals(s.slot.bytes)) fail('backup_failed', `the backup ${backup} does not match ${s.manifestPath}; nothing was replaced`);
      backups.push(backup);
      record.browsers[s.browser] = {manifestPath: s.manifestPath, previous: s.slot.previous, backupSha256: sha256(s.slot.bytes)};
    } else if (!(s.slot.state === 'ours' && kept)) {
      record.browsers[s.browser] = {manifestPath: s.manifestPath, previous: null};
    }
  }
  writeAtomic(cuaRecordFile(cuaHome), `${JSON.stringify(record, null, 2)}\n`, {mode: 0o600, dirMode: 0o700});

  const rows = [];
  const applied = [];
  try {
    for (const s of planned) {
      const entry = record.browsers[s.browser];
      const row = {browser: s.browser, manifestPath: s.manifestPath, previous: entry.previous};
      if (s.slot.state === 'ours' && s.slot.bytes.equals(desired)) { rows.push({...row, action: 'unchanged'}); continue; }
      if (s.slot.state === 'absent') {
        if (!publish(s.manifestPath, desired, io)) contended(s.manifestPath);
        applied.push({...s, prior: null});
        rows.push({...row, action: 'placed'});
        continue;
      }
      const aside = take(s.manifestPath, s.slot.bytes, io);
      if (!aside) contended(s.manifestPath);
      const placed = withTaken(aside, s.manifestPath, io, () => publish(s.manifestPath, desired, io));
      rmSync(aside, {force: true});
      if (!placed) contended(s.manifestPath);
      applied.push({...s, prior: s.slot.bytes});
      rows.push(s.slot.state === 'ours' ? {...row, action: 'updated'} : {...row, action: 'replaced', backup: cuaBackupFile(cuaHome, s.browser)});
    }
  } catch (error) {
    throw undoCuaRun(error, applied, {cuaHome, before, beforeAt, backups, desired, io});
  }
  return {launcher, backendsDir: backendDir(cuaHome), browsers: rows};
}

// Undoes this run's manifest writes, newest first, putting back what was there; with every one undone the record is
// what it was before the run (and this run's backups go), otherwise the run's record and backups are kept for
// `cua chrome unregister` and the error is registration_partial naming what is left.
function undoCuaRun(error, applied, {cuaHome, before, beforeAt, backups, desired, io}) {
  const left = [];
  for (const change of [...applied].reverse()) {
    try {
      const aside = take(change.manifestPath, desired, io);
      if (!aside) { left.push(`${change.browser} (${change.manifestPath} changed meanwhile)`); continue; }
      if (change.prior) withTaken(aside, change.manifestPath, io, () => publish(change.manifestPath, change.prior, io) || fail('registration_contended', `${change.manifestPath} was written meanwhile`));
      rmSync(aside, {force: true});
    } catch (undoError) {
      left.push(`${change.browser} (${change.manifestPath}: ${undoError.code ?? undoError.message})`);
    }
  }
  if (left.length)
    return new CuaError('registration_partial', `${error.message.replace(/ Nothing was changed\.$/, '')} (${error.code ?? 'error'}); cua could not undo what this run registered in ${left.join('; ')}`,
      {hint: 'run `cua chrome unregister` to remove cua\'s remaining registrations (it restores what cua replaced from the kept backup)', cause: error});
  try {
    if (before) {
      writeAtomic(cuaRecordFile(cuaHome), `${JSON.stringify(before, null, 2)}\n`, {mode: 0o600, dirMode: 0o700});
      restoreWrittenAt(cuaRecordFile(cuaHome), beforeAt);
    }
    else rmSync(cuaRecordFile(cuaHome), {force: true});
    for (const backup of backups) rmSync(backup, {force: true});
  } catch {}
  if (applied.length) error.message += `; cua undid what it had registered earlier in this run (${applied.map(c => c.browser).join(', ')})`;
  return error;
}

// -> {launcher, browsers: [{browser, manifestPath, action: absent|not_ours|removed|restored, restoration?, previous?,
//    backup?, reason?, userAction?}], blocked}
export function unregisterCuaHost({home, browsers = browsersFor(), io = FS, lockTiming = LOCK_TIMING}) {
  const cuaHome = realHome(home);
  const lock = acquireLock(cuaHome, lockTiming);
  try {
    return unregisterCuaLocked({cuaHome, table: browsers, io});
  } finally {
    releaseLock(lock);
  }
}

function unregisterCuaLocked({cuaHome, table, io}) {
  const launcher = launcherPath(cuaHome);
  const record = readCuaRecord(cuaHome);
  const all = slots({browsers: table, nativeHost: CUA_HOST_NAME, onlyPresent: false}).map(s => ({...s, slot: readCuaSlot(s.manifestPath, launcher)}));
  const refused = all.filter(s => s.slot.state === 'unreadable');
  if (refused.length) unreadable(refused, CUA_HOST_NAME, 'unregister');
  const rows = all.map(s => {
    const row = {browser: s.browser, manifestPath: s.manifestPath};
    try {
      return unregisterCuaSlot(s, row, {cuaHome, entry: record?.browsers[s.browser], io});
    } catch (error) {
      const still = readCuaSlot(s.manifestPath, launcher).state === 'ours';
      return {...row, action: still ? 'not_removed' : 'removed', restoration: 'blocked', reason: `${error.message} while unregistering ${s.manifestPath}`,
        userAction: error.code === 'manifest_rollback_failed' ? `${error.hint}; then run \`cua chrome unregister\` again` : 'fix the cause and run `cua chrome unregister` again'};
    }
  });
  const blocked = rows.filter(r => r.restoration === 'blocked');
  if (blocked.length) {
    if (record) {
      const at = writtenAt(cuaRecordFile(cuaHome));
      writeAtomic(cuaRecordFile(cuaHome), `${JSON.stringify({...record, browsers: Object.fromEntries(blocked.filter(r => record.browsers[r.browser]).map(r => [r.browser, record.browsers[r.browser]]))}, null, 2)}\n`, {mode: 0o600, dirMode: 0o700});
      restoreWrittenAt(cuaRecordFile(cuaHome), at);
    }
  } else {
    rmSync(cuaRecordFile(cuaHome), {force: true});
    rmSync(launcher, {force: true});
    try { rmdirSync(cuaBackupDir(cuaHome)); } catch {}
  }
  return {launcher, browsers: rows, blocked: blocked.length > 0};
}

function unregisterCuaSlot(s, row, {cuaHome, entry, io}) {
  if (s.slot.state === 'absent') return {...row, action: 'absent'};
  if (s.slot.state === 'foreign') return {...row, action: 'not_ours', previous: s.slot.previous};
  const previous = entry?.previous ?? null;
  const backup = cuaBackupFile(cuaHome, s.browser);
  const aside = take(s.manifestPath, s.slot.bytes, io);
  if (!aside) contended(s.manifestPath);
  if (typeof entry?.backupSha256 !== 'string') {
    rmSync(aside, {force: true});
    return {...row, action: 'removed', restoration: 'not_needed', previous};
  }
  let saved = null;
  try { saved = readFileSync(backup); } catch {}
  const reregister = previous ? `register the previous host again yourself: run \`cua chrome register\` in the cua home whose launcher is ${previous}` : `inspect ${backup}; if it is the previous manifest, copy it to ${s.manifestPath} (cp "${backup}" "${s.manifestPath}")`;
  if (!saved || sha256(saved) !== entry.backupSha256) {
    rmSync(aside, {force: true});
    return {...row, action: 'removed', restoration: 'blocked', previous,
      reason: saved ? `the backup ${backup} does not match what cua recorded backing up; it was kept, not restored` : `the backup ${backup} is missing`, userAction: reregister};
  }
  const placed = withTaken(aside, s.manifestPath, io, () => publish(s.manifestPath, saved, io));
  rmSync(aside, {force: true});
  if (!placed)
    return {...row, action: 'removed', restoration: 'blocked', previous, reason: `another program wrote ${s.manifestPath} while cua was restoring it; that manifest was left as it is and the backup ${backup} was kept`, userAction: `check which host ${s.manifestPath} names; if it is not the one you want, copy ${backup} to ${s.manifestPath}`};
  let restored = null;
  try { restored = readFileSync(s.manifestPath); } catch {}
  if (!restored?.equals(saved))
    return {...row, action: 'restored', restoration: 'blocked', previous, reason: `${s.manifestPath} does not read back as the backup; the backup and its record were kept`, userAction: `copy ${backup} to ${s.manifestPath} (cp "${backup}" "${s.manifestPath}")`};
  rmSync(backup, {force: true});
  return {...row, action: 'restored', restoration: 'restored', previous, backup};
}

// The record's write time is when cua's registration last ran, which route.mjs chromeMigration compares with the removed
// ChatGPT route's, so a record rewrite that is not a registration (an undo, a blocked unregister keeping its entries)
// puts back the time the record had.
const writtenAt = path => { try { const {atimeMs, mtimeMs} = statSync(path); return {atimeMs, mtimeMs}; } catch { return null; } };
function restoreWrittenAt(path, at) {
  if (at) try { utimesSync(path, at.atimeMs / 1000, at.mtimeMs / 1000); } catch {}
}
