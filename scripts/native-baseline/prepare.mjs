// Computer-only fresh install: no Chrome discovery, H4 home, profile aliases or enrollment.
//
// Or, on macOS, a reused approved runtime (`approvedHome`, the spec's Decision Log "native runs on the mini"): a new
// on-disk copy of the native helper raises a one-time screen-capture confirmation only the owner can answer, so a run
// installs nothing and serves from the one copy the owner approved. Everything else stays the run's own: the home's
// state/ and run/ are moved aside into the run's scratch directory for the run and moved back at cleanup, HOME is the
// account's (native calls fail at the native pipe under a scratch HOME), and XDG_CONFIG_HOME is the run's scratch
// directory, so nothing under the account's configuration is read or written. A run refuses an approved home that is
// not the pinned release or that another process is using.
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
  const runtime = locateRuntime({home});
  return {release: runtime.release, root: runtime.root, helper: runtime.paths.skyServiceApp, pinned: selectPin(loadPins()).release};
};
// The processes whose command line names the home (pgrep -f, the path matched literally), so a reused home is never
// shared. The preparing process and its callers (the ssh shell whose command names the home) are not others.
export const processesUsing = home => {
  let found;
  try { found = execFileSync('/usr/bin/pgrep', ['-f', home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')], {encoding: 'utf8'}).split('\n').filter(Boolean).map(Number); }
  catch (error) { if (error.status === 1) return []; throw error; }
  const callers = new Set([process.pid]);
  for (let pid = process.ppid; pid > 1 && !callers.has(pid);) {
    callers.add(pid);
    pid = Number(execFileSync('/bin/ps', ['-o', 'ppid=', '-p', String(pid)], {encoding: 'utf8'}).trim()) || 1;
  }
  return found.filter(pid => !callers.has(pid));
};

const base = () => join(homedir(), '.local/share/cua-native-baseline');
export function prepareNative({device, display, node, approvedHome}, {directoryRoot = base(), tempRoot = fs.realpathSync(tmpdir()), ambient = process.env,
  desktop = () => discoverDesktopEnvironment(fs), run = execFileSync, inspect = executionFacts, locate = locateApproved, usersOf = processesUsing,
  userHomeDir = homedir()} = {}) {
  const declaration = declaredDevice(device);
  if (approvedHome !== undefined) return prepareReused({device, node, approvedHome, declaration}, {directoryRoot, tempRoot, inspect, locate, usersOf, userHomeDir});
  const xSession = declaration.platform === 'linux' ? sessionEnvironment(desktop()) : {};
  if (display !== undefined && display !== xSession.DISPLAY) throw new Error('--display does not match the discovered device X session');
  fs.mkdirSync(directoryRoot, {recursive: true, mode: 0o700});
  const parent = fs.realpathSync(directoryRoot);
  if (parent === tempRoot || parent.startsWith(tempRoot + '/')) throw new Error('Native scratch home must be outside TMPDIR');
  const home = fs.mkdtempSync(join(parent, 'run-')), userHome = join(home, 'home'), token = randomUUID();
  fs.writeFileSync(join(home, 'native-owner.json'), JSON.stringify({device, token}), {mode: 0o600, flag: 'wx'});
  const prepared = {device, home, userHome, token, xSession, nodeMode: node ? 'diagnostic-override' : 'managed', nodeOverride: node ?? null};
  try {
    fs.mkdirSync(userHome, {mode: 0o700});
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
function prepareReused({device, node, approvedHome, declaration}, {directoryRoot, tempRoot, inspect, locate, usersOf, userHomeDir}) {
  if (declaration.platform !== 'darwin') throw new Error('an approved runtime is reused only on macOS, where a new helper copy raises a confirmation');
  if (node) throw new Error('an approved-runtime run uses the home\'s managed Node, never a diagnostic override');
  const home = fs.realpathSync(approvedHome);
  const runtime = locate(home);
  if (runtime.release !== runtime.pinned) throw new Error(`the approved runtime ${runtime.release} is not the pinned release ${runtime.pinned}; refusing rather than installing a new copy`);
  const users = usersOf(home);
  if (users.length) throw new Error(`the approved home is in use by ${users.length} process(es); refusing to share it`);
  fs.mkdirSync(directoryRoot, {recursive: true, mode: 0o700});
  const parent = fs.realpathSync(directoryRoot);
  if (parent === tempRoot || parent.startsWith(tempRoot + '/')) throw new Error('Native scratch home must be outside TMPDIR');
  const scratch = fs.mkdtempSync(join(parent, 'run-')), token = randomUUID();
  fs.writeFileSync(join(scratch, 'native-owner.json'), JSON.stringify({device, token, approvedHome: home}), {mode: 0o600, flag: 'wx'});
  const stash = join(scratch, 'stash'), configHome = join(scratch, 'config');
  fs.mkdirSync(stash, {mode: 0o700});
  fs.mkdirSync(configHome, {mode: 0o700});
  const stashed = [];
  const prepared = {device, home, userHome: userHomeDir, configHome, scratch, token, xSession: {}, nodeMode: 'managed', nodeOverride: null,
    runtimeReuse: {approvedHome: home, release: runtime.release, runtimeRoot: runtime.root, helper: runtime.helper, reason: REUSE_REASON}, stashed};
  try {
    for (const name of RUN_OWNED) if (fs.existsSync(join(home, name))) { fs.renameSync(join(home, name), join(stash, name)); stashed.push(name); }
    const facts = inspect({source: home, ambient: {PATH: process.env.PATH, HOME: userHomeDir, CUA_HOME: home, XDG_CONFIG_HOME: configHome}});
    assertManagedNode(facts);
    return {...prepared, ownNode: facts.ownNode};
  } catch (error) { restoreReused(prepared); fs.rmSync(scratch, {recursive: true, force: true}); throw error; }
}
// What the run wrote to the reused home goes; what was there before comes back.
function restoreReused({home, scratch, stashed}) {
  for (const name of RUN_OWNED) fs.rmSync(join(home, name), {recursive: true, force: true});
  for (const name of stashed) fs.renameSync(join(scratch, 'stash', name), join(home, name));
  return [...stashed];
}
export function cleanupNative(prepared, {directoryRoot = base()} = {}) {
  const {device, token} = prepared;
  const scratch = prepared.runtimeReuse ? prepared.scratch : prepared.home;
  if (dirname(scratch) !== fs.realpathSync(directoryRoot) || !/^run-[A-Za-z0-9]+$/.test(basename(scratch))) throw new Error('Native scratch ownership mismatch');
  const owner = JSON.parse(fs.readFileSync(join(scratch, 'native-owner.json'), 'utf8'));
  if (!token || owner.token !== token || owner.device !== device) throw new Error('Native scratch ownership mismatch');
  if (prepared.runtimeReuse && owner.approvedHome !== prepared.home) throw new Error('Native scratch ownership mismatch');
  const restored = prepared.runtimeReuse ? restoreReused(prepared) : null;
  fs.rmSync(scratch, {recursive: true, force: true});
  return restored ? {removed: true, restored} : {removed: true};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (basename(process.cwd()) !== 'cua-parity') throw new Error('Native preparation requires the prepared parity clone');
    const [action, json] = process.argv.slice(2);
    if (!['prepare', 'cleanup'].includes(action)) throw new Error('Unknown native preparation operation');
    console.log(JSON.stringify((action === 'prepare' ? prepareNative : cleanupNative)(JSON.parse(json))));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
