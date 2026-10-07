// What an installed agent runs, whichever service manager runs it (src/remote/launchd.mjs on macOS,
// src/remote/systemd.mjs on Linux): the node that ran `install` with this checkout's bin/cua.mjs `agent run`, plus
// `--relay` when the device has a relay URL and `--http <host:port>` when given, the log $CUA_HOME/state/agent.log, and
// the environment: CUA_HOME when it is set, CUA_SHIM_SURFACES (default computer,browser: remote use is for the browser
// as much as the desktop) and each of the agent's own settings (CUA_AGENT_MAX_SESSIONS, _IDLE_MINUTES,
// _ALLOWED_ORIGINS, _CONSOLE_CHECK) set in the environment `install` runs in, refused (invalid_setting) as `agent run`
// would refuse it. Every check that can refuse runs here, before a service manager is touched. `--relay` is refused
// (relay_unavailable) when this checkout cannot load the ws package the relay path needs: such a job would refuse at
// every start and be restarted every 10 s.
import {fileURLToPath} from 'node:url';
import {join, resolve} from 'node:path';
import {checkRelayUrl, readDevice} from './device.mjs';
import {AGENT_SETTINGS, limitsFrom} from './limits.mjs';
import {consoleCheckFrom} from './console.mjs';
import {parseFixedAddress} from './address.mjs';
import {surfacesFrom} from '../mcp/surface.mjs';
import {loadWebSocket} from './relay-link.mjs';
import {fail} from '../runtime/errors.mjs';

export const DEFAULT_SURFACES = 'computer,browser';
export const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));

export const agentLogPath = home => join(resolve(home), 'state', 'agent.log');

// `machine` names the host in refusals ("this Mac", "this machine").
export async function agentJobSpec({home, env, http, surfaces = DEFAULT_SURFACES, node, cli = CLI, loadRelay = loadWebSocket, machine = 'this Mac'}) {
  if (http !== undefined && http !== null) parseFixedAddress(http);
  const named = surfacesFrom(surfaces).join(',');
  limitsFrom(env);
  consoleCheckFrom(env);
  const device = readDevice(home);
  if (!device) fail('remote_not_enrolled', `${machine} is not enrolled for remote control`, {hint: 'run cua remote enroll first'});
  if (device.relayUrl) checkRelayUrl(device.relayUrl);
  if (device.relayUrl) await loadRelay();
  const args = [...(device.relayUrl ? ['--relay'] : []), ...(http ? ['--http', http] : [])];
  if (!args.length)
    fail('agent_nothing_to_serve', 'the agent would have nothing to serve: no relay is enrolled and no --http address was given', {hint: `give --http <${machine === 'this Mac' ? 'this Mac\'s' : 'this machine\'s'} LAN address>:7801, or enrol a relay with cua remote enroll --relay <wss url>`});
  const settings = Object.fromEntries(AGENT_SETTINGS.filter(key => env[key] !== undefined).map(key => [key, env[key]]));
  return {
    programArguments: [node, cli, 'agent', 'run', ...args],
    environment: {...(env.CUA_HOME ? {CUA_HOME: resolve(env.CUA_HOME)} : {}), CUA_SHIM_SURFACES: named, ...settings},
    log: agentLogPath(home),
  };
}
