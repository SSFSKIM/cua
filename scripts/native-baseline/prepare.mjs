// Computer-only fresh install: no Chrome discovery, H4 home, profile aliases or enrollment.
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

const base = () => join(homedir(), '.local/share/cua-native-baseline');
export function prepareNative({device, display, node}, {directoryRoot = base(), tempRoot = fs.realpathSync(tmpdir()), ambient = process.env,
  desktop = () => discoverDesktopEnvironment(fs), run = execFileSync, inspect = executionFacts} = {}) {
  const declaration = declaredDevice(device);
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
export function cleanupNative(prepared, {directoryRoot = base()} = {}) {
  const {home, device, token} = prepared;
  if (dirname(home) !== fs.realpathSync(directoryRoot) || !/^run-[A-Za-z0-9]+$/.test(basename(home))) throw new Error('Native scratch ownership mismatch');
  const owner = JSON.parse(fs.readFileSync(join(home, 'native-owner.json'), 'utf8'));
  if (!token || owner.token !== token || owner.device !== device) throw new Error('Native scratch ownership mismatch');
  fs.rmSync(home, {recursive: true, force: true});
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
