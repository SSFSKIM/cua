// Acceptance 8's loopback remote device (docs/doperpowers/specs/2026-10-30-macos-agent-cursor-design.md, Design,
// Remote devices): this Mac reached through cua's own remote route, a relay on 127.0.0.1 and an agent dialling it,
// driven by three client sessions whose cursor contexts their clients resolve and send as `cua/cursor`.
// Everything but the approved engine lives in the kit directory, so nothing of this account's remote setup is touched:
//   <kit>/device-home   the agent's CUA_HOME: its enrolment (remote/device.json) and an installed runtime (`cua install`
//                       into it, before the sitting); its HOME stays this account's, so its sessions serve the approved
//                       engine at its one place, with CUA_NATIVE_ENGINE=cua
//   <kit>/client-home   the clients' HOME: the device registry (~/.config/cua/devices.json, the device named `loop`) and
//                       the secret store holding its client credential (never this account's ~/.config/claude-secrets);
//                       the clients' CUA_HOME is the device home (it holds the runtime)
//   <kit>/relay/        the relay's devices file, built from the enrolment's devices.json line, and its log
//   <kit>/loop-bravo/   the project folder whose name client b's label falls back to
// The client credential goes from the enrolment's JSON answer into the client store in this process and is never
// printed or written anywhere else. Removing the kit removes the enrolment and the credential with it.
import {execFileSync, spawn} from 'node:child_process';
import {existsSync, mkdirSync, openSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {addDevice} from '../../src/remote/devices.mjs';
import {clientSecretKey} from '../../src/remote/device.mjs';
import {agentStatePath} from '../../src/remote/health.mjs';
import {fileStore, storeDir} from '../../src/secrets/store.mjs';
import {ALIGN_TOGGLE, CLICK_AT, CLICK_CONTROL} from './cells.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CLI = join(ROOT, 'bin/cua.mjs');
export const DEVICE = 'loop';
export const DEFAULT_PORT = 7835;

export const kitPaths = kit => ({
  kit, deviceHome: join(kit, 'device-home'), clientHome: join(kit, 'client-home'), relayDir: join(kit, 'relay'),
  relayDevices: join(kit, 'relay', 'devices.json'), bravo: join(kit, 'loop-bravo'), record: join(kit, 'remote.json'),
});

// The kit's directories, and what it still needs: the device home's runtime (`cua install` into it), npm ci for the
// checkout and the relay (the agent's relay link and the relay need the ws package). -> {paths, needs: [command]}.
export function prepareKit(kit) {
  const paths = kitPaths(kit);
  for (const dir of [paths.deviceHome, paths.clientHome, paths.relayDir, paths.bravo]) mkdirSync(dir, {recursive: true, mode: 0o700});
  const needs = [];
  if (!existsSync(join(paths.deviceHome, 'current.json'))) needs.push(`CUA_HOME=${paths.deviceHome} node bin/cua.mjs install   # or --archive <the pinned ChatGPT zip>`);
  if (!existsSync(join(ROOT, 'node_modules', 'ws'))) needs.push('npm ci');
  if (!existsSync(join(ROOT, 'relay', 'node_modules', 'ws'))) needs.push('(cd relay && npm ci)');
  return {paths, needs};
}

// The relay's devices file from an enrolment's `devicesEntry` line.
export const relayDevicesFile = entry => `{${entry}}\n`;

// Enrols the device home for the loopback relay and registers it for the clients. `enroll`: runs
// `cua remote enroll --relay <url> --json` in the device home and answers its parsed JSON. -> {deviceId, relayUrl, port}.
export async function enrollKit(kit, {port = DEFAULT_PORT, enroll = defaultEnroll} = {}) {
  const paths = kitPaths(kit);
  if (existsSync(paths.record)) throw new Error(`${paths.record} exists: this kit is enrolled already (remove the kit to start again)`);
  const answer = enroll({deviceHome: paths.deviceHome, relay: `ws://127.0.0.1:${port}/ws`});
  const {deviceId, devicesEntry, clientCredential} = answer;
  if (!deviceId || !devicesEntry || !clientCredential) throw new Error('the enrolment did not answer a device id, its devices.json line and a client credential');
  writeFileSync(paths.relayDevices, relayDevicesFile(devicesEntry), {mode: 0o600});
  const env = {HOME: paths.clientHome};
  const relayUrl = `http://127.0.0.1:${port}`;
  addDevice({env, name: DEVICE, relayUrl, deviceId});
  await fileStore({dir: storeDir(env)}).write(clientSecretKey(deviceId), clientCredential);
  const record = {deviceId, relayUrl, port};
  writeFileSync(paths.record, JSON.stringify(record, null, 2) + '\n', {mode: 0o600});
  return record;
}

function defaultEnroll({deviceHome, relay}) {
  const out = execFileSync(process.execPath, [CLI, 'remote', 'enroll', '--relay', relay, '--json'], {encoding: 'utf8', env: {...process.env, CUA_HOME: deviceHome}, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000});
  return JSON.parse(out);
}

// The relay and the agent as children of this process, their output in the kit. -> {stop(), relay, agent}.
export function startLoopback(kit) {
  const paths = kitPaths(kit);
  const {port} = JSON.parse(readFileSync(paths.record, 'utf8'));
  const log = name => openSync(join(kit, `${name}.log`), 'a', 0o600);
  const relay = spawn(process.execPath, [join(ROOT, 'relay', 'server.mjs'), '--port', String(port), '--devices', paths.relayDevices], {stdio: ['ignore', log('relay'), log('relay')]});
  const agent = spawn(process.execPath, [CLI, 'agent', 'run', '--relay'], {stdio: ['ignore', log('agent'), log('agent')],
    env: {...process.env, CUA_HOME: paths.deviceHome, CUA_NATIVE_ENGINE: 'cua'}});
  const stop = async () => {
    for (const child of [agent, relay]) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      child.kill('SIGTERM');
      await new Promise(resolve => { const t = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 10_000); child.once('exit', () => { clearTimeout(t); resolve(); }); });
    }
  };
  return {relay, agent, stop};
}

// Whether the agent reports its relay link up ($CUA_HOME/state/agent.json, which doctor's agent.relay row reads).
export function agentConnected(deviceHome) {
  try { return JSON.parse(readFileSync(agentStatePath(deviceHome), 'utf8'))?.relay?.status === 'connected'; } catch { return false; }
}

// Acceptance 8's steps: three clients of the loopback device, each resolving its own cursor context.
export function remoteSteps(kit) {
  const {clientHome, deviceHome, bravo} = kitPaths(kit);
  const client = extra => ({HOME: clientHome, CUA_HOME: deviceHome, ...extra});
  const scenes = ['textedit', 'chrome'];
  return [
    {say: 'Acceptance 8: three sessions through the loopback remote device'},
    {open: 'a', device: DEVICE, scenes, env: client({CUA_CURSOR_LABEL: 'Loop A', CUA_CURSOR_COLOR: '#1f883d'})},
    {open: 'b', device: DEVICE, scenes, env: client({CLAUDE_CODE_SESSION_ID: null, CLAUDE_PROJECT_DIR: bravo})},
    {open: 'c', device: DEVICE, scenes, env: client({CUA_CURSOR: '0'})},
    {together: [{run: 'a', cell: ALIGN_TOGGLE, label: 'a: TextEdit alignment'}, {run: 'b', cell: CLICK_CONTROL('sceneOption'), label: 'b: the page\'s checkbox'}]},
    {wait: 1500},
    {run: 'c', cell: CLICK_AT('textedit', [0.6, 0.7]), label: 'c (its client set CUA_CURSOR=0): TextEdit text'},
    {watch: 'two cursors: a\'s pill "Loop A" in green (#1f883d), b\'s "loop-bravo" in its own colour; c\'s click landed (the insertion point moved) with no cursor', id: 'remote-cursors'},
    {wait: 6000},
    {close: 'c'}, {close: 'b'}, {close: 'a'},
  ];
}
