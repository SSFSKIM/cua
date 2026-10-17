// Computer-only fresh install: no Chrome discovery, H4 home, profile aliases or enrollment.
//
// Or, on macOS, a reused approved runtime (`approvedHome`, the spec's Decision Log "native runs on the mini"): a new
// on-disk copy of the native helper raises a one-time screen-capture confirmation only the owner can answer, so a run
// installs nothing and serves from the one copy the owner approved. Everything else stays the run's own:
// - Admission. The run holds `<home>/.cua-native-admission` (created atomically, with its token and the time it was
//   taken) from preparation to the end of cleanup; a second run is refused while it is held. Every harness serve on that
//   home must present the token (CUA_NATIVE_ADMISSION, serve.mjs) and registers its pid there while it runs.
// - Nobody else. Preparation refuses while the admission is held (which covers the harness serves registered under it),
//   while any other process names the home on its command line, or while any process runs the approved helper's exact
//   executable. No process's environment is scanned to find users.
// - The TMPDIR witness. Since #115 M1, buildLaunch gives every launch its session's own TMPDIR,
//   `<home>/run/<session>/tmp`, and `open` passes node_repl's environment to the helper, so a helper the run's sessions
//   opened carries one of those. During the run the home's run/ is the run's own (the original is moved aside below,
//   and the admission keeps everyone else out), and preparation refuses while any process runs the approved helper: a
//   helper carrying a session temp of this home's run/ was opened by this run. Before M1 a launch copied the caller's
//   TMPDIR, so the run's own (`<scratch>/tmp`, 0700, which every serve of the run still carries) is accepted too.
// - State. The home's state/ and run/ are moved into the run's scratch directory and back. Every move is recorded in
//   `recovery.json` as it happens; a failed preparation undoes only the moves that happened, and a failed undo or
//   restoration deletes nothing, keeps the scratch directory and the admission, and names the recovery directory.
//   Cleanup moves what the run wrote out of the home before moving the originals back, and is resumable.
// - The helper. The native helper the run's native calls opened outlives the serve. Cleanup stops, by pid, only a helper
//   proven to be the run's: its executable (read from the process, lsof's txt, never its command line) is exactly the
//   approved helper's executable, and the TMPDIR in that pid's environment is the run's (above). Only TMPDIR is
//   extracted from that environment, only for such candidate pids, and only compared; nothing else from it is kept,
//   logged or reported. Anything not proven is never signalled, and nothing is restored while it remains.
// HOME is the account's (native calls fail at the native pipe under a scratch HOME), and XDG_CONFIG_HOME is the run's
// scratch directory, so nothing under the account's configuration is read or written.
import * as fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {homedir, tmpdir} from 'node:os';
import {join, dirname, basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {declaredDevice, sessionEnvironment} from '../repl-parity/devices.mjs';
import {discoverDesktopEnvironment} from '../repl-parity/desktop.mjs';
import {executionFacts} from '../repl-parity/provenance.mjs';
import {assertManagedNode, nodeEnvironment} from '../repl-parity/node-provenance.mjs';
import {loadPins, locateRuntime, selectPin} from '../../src/runtime/manifest.mjs';

export const REUSE_REASON = 'a new on-disk copy of the native helper raises a one-time screen-capture confirmation; the approved copy is reused';
// The run-owned parts of a reused home, moved aside for the run and back at cleanup.
const RUN_OWNED = ['state', 'run'];
// The approved home's runtime as the serve will resolve it, and the release this checkout pins for the machine.
const locateApproved = home => {
  const runtime = locateRuntime({home}), helper = runtime.paths.skyServiceApp;
  const name = execFileSync('/usr/bin/plutil', ['-extract', 'CFBundleExecutable', 'raw', '-o', '-', join(helper, 'Contents', 'Info.plist')], {encoding: 'utf8'}).trim();
  return {release: runtime.release, root: runtime.root, helper, executable: fs.realpathSync(join(helper, 'Contents', 'MacOS', name)), pinned: selectPin(loadPins()).release};
};
// The processes whose command line names `home` (pgrep -f, the path matched literally). The preparing process and its
// callers (the ssh shell whose command names the home) are not others.
const callerPids = () => {
  const callers = new Set([process.pid]);
  for (let pid = process.ppid; pid > 1 && !callers.has(pid);) {
    callers.add(pid);
    pid = Number(execFileSync('/bin/ps', ['-o', 'ppid=', '-p', String(pid)], {encoding: 'utf8'}).trim()) || 1;
  }
  return callers;
};
export const processesUsing = home => {
  let found;
  try { found = execFileSync('/usr/bin/pgrep', ['-f', home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')], {encoding: 'utf8'}).split('\n').filter(Boolean).map(Number); }
  catch (error) { if (error.status === 1) found = []; else throw error; }
  const callers = callerPids();
  return found.filter(pid => !callers.has(pid));
};
// The executable a process runs, from the process itself (lsof's first txt entry), never its argv; null once it is gone.
export function executableOf(pid, {exec = execFileSync} = {}) {
  let text;
  try { text = exec('/usr/sbin/lsof', ['-a', '-p', String(pid), '-d', 'txt', '-Fn'], {encoding: 'utf8'}); } catch (error) {
    if (!isAlive(pid)) return null;
    throw new Error(`could not read the executable of process ${pid}`);
  }
  const line = String(text).split('\n').find(l => l.startsWith('n'));
  if (!line) { if (!isAlive(pid)) return null; throw new Error(`could not read the executable of process ${pid}`); }
  return line.slice(1);
}
// Whether `pid`'s environment sets TMPDIR to exactly `tmpdir` (or to a value `tmpdir`, a predicate, accepts). The
// environment is the part of `ps -E`'s line after the process's own command; only TMPDIR is extracted, only compared,
// and nothing read leaves this function: a failure says only that it failed.
export function hasRunTmpdir(pid, tmpdir, {exec = execFileSync} = {}) {
  const failed = () => new Error(`could not read TMPDIR of process ${pid}`);
  let command, withEnvironment;
  try {
    command = String(exec('/bin/ps', ['-ww', '-o', 'command=', '-p', String(pid)], {encoding: 'utf8'})).replace(/\n$/, '');
    withEnvironment = String(exec('/bin/ps', ['-E', '-ww', '-o', 'command=', '-p', String(pid)], {encoding: 'utf8'})).replace(/\n$/, '');
  } catch { throw failed(); }
  if (!command || !withEnvironment.startsWith(command)) throw failed();
  const values = withEnvironment.slice(command.length).split(' ').filter(word => word.startsWith('TMPDIR=')).map(word => word.slice('TMPDIR='.length));
  return values.length === 1 && (typeof tmpdir === 'function' ? tmpdir(values[0]) === true : values[0] === tmpdir);
}
// Whether `value` is a session temp of `home`'s run/ (src/runtime/launch.mjs: <real home>/run/<session id>/tmp).
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/;
export function isSessionTmpOf(home, value) {
  let real;
  try { real = fs.realpathSync(home); } catch { return false; }
  const prefix = join(real, 'run') + '/';
  if (typeof value !== 'string' || !value.startsWith(prefix) || !value.endsWith('/tmp')) return false;
  const id = value.slice(prefix.length, -'/tmp'.length);
  return SESSION_ID.test(id) && join(prefix, id, 'tmp') === value;
}
// Every other process using `home`: whoever names it on the command line, and whoever runs the approved helper's exact
// executable. A helper is the run's (`owned`) only when its environment's TMPDIR is the run's: `tmpdir`, or a session
// temp of `home`'s run/ (the header); the environment of any other process is never read.
export function homeUsers(home, {executable, tmpdir}, {exec = execFileSync, candidates = processesUsing} = {}) {
  return candidates(home).flatMap(pid => {
    const running = executableOf(pid, {exec});
    if (running === null) return [];   // gone
    const helper = running === executable;
    let owned = false, unreadable = false;
    if (helper && tmpdir) { try { owned = hasRunTmpdir(pid, value => value === tmpdir || isSessionTmpOf(home, value), {exec}); } catch { unreadable = true; } }
    return [{pid, helper, owned, ...(unreadable ? {unreadable: true} : {})}];
  });
}
const isAlive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
export const ADMISSION = '.cua-native-admission';

const base = () => join(homedir(), '.local/share/cua-native-baseline');
export function prepareNative({device, display, node, approvedHome}, {directoryRoot = base(), tempRoot = fs.realpathSync(tmpdir()), ambient = process.env,
  desktop = () => discoverDesktopEnvironment(fs), run = execFileSync, inspect = executionFacts, ...reuse} = {}) {
  const declaration = declaredDevice(device);
  if (approvedHome !== undefined) return prepareReused({device, node, approvedHome, declaration}, {directoryRoot, tempRoot, inspect, ...reuse});
  const xSession = declaration.platform === 'linux' ? sessionEnvironment(desktop()) : {};
  if (display !== undefined && display !== xSession.DISPLAY) throw new Error('--display does not match the discovered device X session');
  fs.mkdirSync(directoryRoot, {recursive: true, mode: 0o700});
  const parent = fs.realpathSync(directoryRoot);
  if (parent === tempRoot || parent.startsWith(tempRoot + '/')) throw new Error('Native scratch home must be outside TMPDIR');
  const home = fs.mkdtempSync(join(parent, 'run-')), userHome = join(home, 'home'), token = randomUUID();
  fs.writeFileSync(join(home, 'native-owner.json'), JSON.stringify({device, token}), {mode: 0o600, flag: 'wx'});
  // On macOS a run's serves also get a TMPDIR of their own, as an approved-runtime run's do (one witness for every mini run).
  const runTmp = declaration.platform === 'darwin' ? join(home, 'harness-tmp') : undefined;
  const prepared = {device, home, userHome, token, xSession, ...(runTmp ? {tmpdir: runTmp} : {}), nodeMode: node ? 'diagnostic-override' : 'managed', nodeOverride: node ?? null};
  try {
    fs.mkdirSync(userHome, {mode: 0o700});
    if (runTmp) fs.mkdirSync(runTmp, {mode: 0o700});
    // All CUA settings belong to this run, not the invoking SSH login. X-session keys are the only desktop inheritance.
    const environment = Object.fromEntries(['PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'USER', 'LOGNAME'].filter(k => ambient[k] !== undefined).map(k => [k, ambient[k]]));
    Object.assign(environment, xSession, {HOME: userHome, CUA_HOME: home, XDG_CONFIG_HOME: join(userHome, '.config'), CUA_SHIM_SECRETS: 'off'});
    run(process.execPath, ['bin/cua.mjs', 'install'], {encoding: 'utf8', timeout: 300000, maxBuffer: 1024 * 1024, env: environment});
    const facts = inspect({source: home, ambient: nodeEnvironment(environment, node)});
    if (!node) assertManagedNode(facts);
    else if (!facts.ownNode?.version || facts.ownNode.path !== node) throw new Error('Diagnostic Node override did not resolve');
    return {...prepared, ownNode: facts.ownNode};
  } catch (error) { fs.rmSync(home, {recursive: true, force: true}); throw error; }
}
const reuseSeams = ({locate = locateApproved, usersOf = homeUsers, rename = fs.renameSync, undo, kill = pid => process.kill(pid, 'SIGTERM'), alive = isAlive,
  wait = () => pause(200), now = Date.now, userHomeDir = homedir()} = {}) => ({locate, usersOf, rename, undo: undo ?? rename, kill, alive, wait, now, userHomeDir});
const describeUsers = users => `${users.length} process(es) (pids ${users.map(u => u.pid).join(', ')})`;
const writeRecovery = (scratch, recovery) => fs.writeFileSync(join(scratch, 'recovery.json'), JSON.stringify(recovery, null, 2) + '\n', {mode: 0o600});
const recoveryOf = scratch => JSON.parse(fs.readFileSync(join(scratch, 'recovery.json'), 'utf8'));
const keptError = (what, error, scratch) => Object.assign(new Error(`${what}: ${error.message}; nothing was deleted, the admission is kept, recovery in ${scratch} (recovery.json)`), {cause: error});

function prepareReused({device, node, approvedHome, declaration}, {directoryRoot, tempRoot, inspect, ...options}) {
  const {locate, usersOf, rename, undo, now, userHomeDir} = reuseSeams(options);
  if (declaration.platform !== 'darwin') throw new Error('an approved runtime is reused only on macOS, where a new helper copy raises a confirmation');
  if (node) throw new Error('an approved-runtime run uses the home\'s managed Node, never a diagnostic override');
  const home = fs.realpathSync(approvedHome);
  const runtime = locate(home);
  if (runtime.release !== runtime.pinned) throw new Error(`the approved runtime ${runtime.release} is not the pinned release ${runtime.pinned}; refusing rather than installing a new copy`);
  fs.mkdirSync(directoryRoot, {recursive: true, mode: 0o700});
  const parent = fs.realpathSync(directoryRoot);
  if (parent === tempRoot || parent.startsWith(tempRoot + '/')) throw new Error('Native scratch home must be outside TMPDIR');
  const admission = join(home, ADMISSION), token = randomUUID(), admittedAt = now();
  try { fs.mkdirSync(admission, {mode: 0o700}); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let holder = 'unreadable';
    try { holder = JSON.parse(fs.readFileSync(join(admission, 'owner.json'), 'utf8')).scratch; } catch { /* a half-written admission is still held */ }
    throw new Error(`the approved home's admission (${admission}) is held by another run (scratch ${holder}); refusing to share it`);
  }
  let scratch;
  try {
    const users = usersOf(home, {executable: runtime.executable, tmpdir: null});
    if (users.length) throw new Error(`the approved home is in use by ${describeUsers(users)}${users.some(u => u.helper) ? ', including the approved helper' : ''}; refusing to share it`);
    scratch = fs.mkdtempSync(join(parent, 'run-'));
    fs.writeFileSync(join(scratch, 'native-owner.json'), JSON.stringify({device, token, approvedHome: home}), {mode: 0o600, flag: 'wx'});
    fs.mkdirSync(join(admission, 'serves'), {mode: 0o700});
    fs.writeFileSync(join(admission, 'owner.json'), JSON.stringify({token, scratch, admittedAt}), {mode: 0o600, flag: 'wx'});
  } catch (error) { if (scratch) fs.rmSync(scratch, {recursive: true, force: true}); fs.rmSync(admission, {recursive: true, force: true}); throw error; }
  const stash = join(scratch, 'stash'), configHome = join(scratch, 'config'), runTmp = join(scratch, 'tmp');
  fs.mkdirSync(stash, {mode: 0o700});
  fs.mkdirSync(configHome, {mode: 0o700});
  fs.mkdirSync(runTmp, {mode: 0o700});
  const recovery = {home, stash, stashed: [], restored: [], runWritten: []};
  writeRecovery(scratch, recovery);
  const prepared = {device, home, userHome: userHomeDir, configHome, tmpdir: runTmp, scratch, token, admission: token, xSession: {}, nodeMode: 'managed', nodeOverride: null,
    runtimeReuse: {approvedHome: home, release: runtime.release, runtimeRoot: runtime.root, helper: runtime.helper, executable: runtime.executable, reason: REUSE_REASON}};
  try {
    for (const name of RUN_OWNED) {
      if (!fs.existsSync(join(home, name))) continue;
      rename(join(home, name), join(stash, name));
      recovery.stashed.push(name);
      writeRecovery(scratch, recovery);
    }
    const facts = inspect({source: home, ambient: {PATH: process.env.PATH, HOME: userHomeDir, CUA_HOME: home, XDG_CONFIG_HOME: configHome}});
    assertManagedNode(facts);
    return {...prepared, stashed: [...recovery.stashed], ownNode: facts.ownNode};
  } catch (error) {
    // Undo only the moves that happened, newest first; a failed undo deletes nothing and keeps what recovery needs.
    for (const name of [...recovery.stashed].reverse()) {
      try { undo(join(stash, name), join(home, name)); } catch (undoError) {
        throw keptError(`preparation failed (${error.message}) and moving ${name}/ back could not be undone`, undoError, scratch);
      }
      recovery.stashed.pop();
      writeRecovery(scratch, recovery);
    }
    fs.rmSync(scratch, {recursive: true, force: true});
    fs.rmSync(admission, {recursive: true, force: true});
    throw error;
  }
}

// A harness serve on `home`: when the home carries an admission, the serve must present its token, and registers its pid
// until it ends. Returns the release.
export function admitServe({home, token, pid = process.pid}) {
  const admission = join(home, ADMISSION);
  if (!fs.existsSync(admission)) return () => undefined;
  let owner;
  try { owner = JSON.parse(fs.readFileSync(join(admission, 'owner.json'), 'utf8')); } catch { owner = null; }
  if (!owner?.token || owner.token !== token) throw new Error(`this home's admission (${admission}) is held by another run; this serve does not present its token`);
  const entry = join(admission, 'serves', String(pid));
  fs.writeFileSync(entry, `${pid}\n`, {mode: 0o600});
  return () => { fs.rmSync(entry, {force: true}); };
}

// After the run: stop the run's own helpers, then move what the run wrote out and the originals back.
function cleanupReused(prepared, options) {
  const {usersOf, rename, kill, alive, wait} = reuseSeams(options);
  const {home, scratch, token} = prepared, admission = join(home, ADMISSION);
  let owner;
  try { owner = JSON.parse(fs.readFileSync(join(admission, 'owner.json'), 'utf8')); } catch { owner = null; }
  if (owner?.token !== token || owner.scratch !== scratch) throw new Error('Native scratch ownership mismatch (the approved home\'s admission is not this run\'s)');
  const serving = fs.readdirSync(join(admission, 'serves')).map(Number).filter(pid => alive(pid));
  if (serving.length) throw new Error(`${serving.length} admitted serve(s) still running on the approved home; nothing was restored`);
  // Only a helper proven to be this run's is signalled: the approved helper's exact executable carrying this run's
  // TMPDIR. Anything else using the home (or a helper whose TMPDIR could not be read) stops the cleanup unsignalled.
  const users = usersOf(home, {executable: prepared.runtimeReuse.executable, tmpdir: prepared.tmpdir});
  const strangers = users.filter(u => !u.owned);
  if (strangers.length) throw new Error(`${describeUsers(strangers)} using the approved home are not proven this run's${strangers.some(u => u.unreadable) ? ' (a helper\'s TMPDIR could not be read)' : ''}; none was signalled, nothing was restored, the admission is kept, recovery in ${scratch}`);
  const helpersStopped = [];
  for (const {pid} of users) {
    kill(pid);
    for (let i = 0; i < 50 && alive(pid); i++) wait();
    if (alive(pid)) throw new Error(`the run's helper ${pid} did not stop; nothing was restored, recovery in ${scratch}`);
    helpersStopped.push(pid);
  }
  const recovery = recoveryOf(scratch);
  const pending = name => recovery.stashed.includes(name) && !recovery.restored.includes(name);
  try {
    // What the run wrote leaves the home first (kept in the scratch directory until the originals are back).
    for (const name of RUN_OWNED) {
      if (recovery.restored.includes(name) || !fs.existsSync(join(home, name))) continue;
      const kept = join(scratch, 'run-written', `${name}.${recovery.runWritten.length}`);
      fs.mkdirSync(join(scratch, 'run-written'), {recursive: true, mode: 0o700});
      rename(join(home, name), kept);
      recovery.runWritten.push(kept);
      writeRecovery(scratch, recovery);
    }
    for (const name of RUN_OWNED.filter(pending)) {
      rename(join(recovery.stash, name), join(home, name));
      recovery.restored.push(name);
      writeRecovery(scratch, recovery);
    }
  } catch (error) { throw keptError('restoring the approved home failed', error, scratch); }
  fs.rmSync(scratch, {recursive: true, force: true});
  fs.rmSync(admission, {recursive: true, force: true});
  return {removed: true, restored: [...recovery.restored], helpersStopped};
}

export function cleanupNative(prepared, {directoryRoot = base(), ...options} = {}) {
  const {device, token} = prepared;
  const scratch = prepared.runtimeReuse ? prepared.scratch : prepared.home;
  if (dirname(scratch) !== fs.realpathSync(directoryRoot) || !/^run-[A-Za-z0-9]+$/.test(basename(scratch))) throw new Error('Native scratch ownership mismatch');
  const owner = JSON.parse(fs.readFileSync(join(scratch, 'native-owner.json'), 'utf8'));
  if (!token || owner.token !== token || owner.device !== device) throw new Error('Native scratch ownership mismatch');
  if (prepared.runtimeReuse) {
    if (owner.approvedHome !== prepared.home) throw new Error('Native scratch ownership mismatch');
    return cleanupReused(prepared, options);
  }
  fs.rmSync(scratch, {recursive: true, force: true});
  return {removed: true};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (basename(process.cwd()) !== 'cua-parity') throw new Error('Native preparation requires the prepared parity clone');
    const [action, json] = process.argv.slice(2);
    if (!['prepare', 'cleanup'].includes(action)) throw new Error('Unknown native preparation operation');
    console.log(JSON.stringify((action === 'prepare' ? prepareNative : cleanupNative)(JSON.parse(json))));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
