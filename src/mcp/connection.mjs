// One MCP connection inside a cua process: the per-connection half of what `cua serve` did, so that one process (the
// stdio `serve`, or the HTTP agent's listener, src/mcp/http.mjs) can hold one connection or several.
//
// `openConnection` resolves the installed runtime (per connection, so a `cua runtime use` or a first `cua install`
// takes effect on the next connection without restarting an agent), claims run/<sessionId> (src/runtime/run-dir.mjs),
// starts the connection's secrets broker (unless secrets are off or the Keychain helper is not built), builds the
// launch for the enabled surfaces (CUA_SHIM_SURFACES) with their trusted services registered (src/services/sky.mjs for
// computer use, src/services/browser.mjs for the browser) and the broker's endpoint and token (or the reason there is
// no broker) in its environment, spawns the runtime in an owned working directory, and serves `input`/`output` through
// `createServer` until EOF, a transport loss, a failure or `close(reason)`. With the browser surface, profiles_list
// reads $CUA_HOME's profile registry and, when a profile is bound, checks it against the live backends with one bounded
// listing launch (inventory.mjs, no tab counts); the connection's close waits for such a listing.
//
// Before `closed` settles, everything the connection created is released: the broker, the session's app-approval file
// the runtime wrote, and its run entries. `closed` resolves {code, reason, completion, teardown, secrets,
// listingLeftover}: `code` is the connection's own (1 when its runtime teardown was unconfirmed), and `listingLeftover`
// says a readiness listing's runtime could not be confirmed stopped. An open that fails rejects with the error (its
// `code` classified) after releasing whatever it had taken.
//
// `keychainHelper` is the located helper and `prepareLaunch` may adjust the launch record; both exist for tests and the
// opt-in live probes (scripts/probe-secrets.mjs points the sky service at a controlled fake target) and are not
// reachable from the CLI. `chrome` (the Chrome facts) and `listBackends` (the readiness listing) exist for tests only.
import {chmodSync, mkdirSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {createServer, settingsFrom} from './server.mjs';
import {spawnUpstream} from './upstream.mjs';
import {resolveRuntime} from '../runtime/manifest.mjs';
import {buildLaunch, SKY_SERVICE, BROWSER_SERVICE} from '../runtime/launch.mjs';
import {claimRunSession} from '../runtime/run-dir.mjs';
import {locateHelper} from '../secrets/helper.mjs';
import {openSecrets} from '../secrets/broker.mjs';
import {chromeFacts} from '../profiles/chrome.mjs';
import {profileReadiness} from '../profiles/commands.mjs';
import {listLiveBackends} from '../profiles/inventory.mjs';
import {assertSandboxFits, sandboxState as sandboxStateFor} from '../runtime/sandbox.mjs';

const SERVICES = {computer: {sky: SKY_SERVICE}, browser: {browser: BROWSER_SERVICE}};
const NO_BROKER = {close: async () => ({confirmed: true, steps: []})};

export async function openConnection({home, env = process.env, sessionId, input, output, settings = settingsFrom(env),
  diagnostics = line => process.stderr.write(`cua serve: ${line}\n`), keychainHelper = locateHelper({home}),
  prepareLaunch = launch => launch, chrome = chromeFacts(), listBackends}) {
  const {secrets: secretsEnabled, sandbox, ...serverSettings} = settings;
  const runtime = resolveRuntime({home});
  listBackends ??= () => listLiveBackends({home, runtime, ambient: env, tabCounts: false});
  const claim = claimRunSession(home, sessionId);
  let secrets = NO_BROKER;
  let launch;
  let listingLeftover = false;

  // Everything the connection took, in the order serve has always released it. The approval file: the runtime records
  // a "session" app approval under this connection's random session ID, which no later connection can use; it goes
  // with the connection. Other sessions' files are never touched.
  const release = async () => {
    await secrets.close();
    if (launch) rmSync(join(launch.env.CODEX_HOME, 'computer-use', 'sessions', `${sessionId}.toml`), {force: true});
    const leftovers = claim.release();
    if (leftovers.length) diagnostics(`this connection's run entries could not all be removed (${leftovers.join(', ')}); the next cua serve or cua doctor sweeps them`);
  };

  let server;
  try {
    secrets = await openSecrets({enabled: secretsEnabled, helper: keychainHelper, home, sessionId, ambient: env, diagnostics});
    launch = prepareLaunch(buildLaunch({
      runtime, home, sessionId, ambient: env, surfaces: serverSettings.surfaces,
      services: Object.assign({}, ...serverSettings.surfaces.map(s => SERVICES[s])),
      broker: secrets.broker, secretsUnavailable: secrets.unavailable?.code,
    }));
    assertSandboxFits(sandbox, launch);
    mkdirSync(launch.env.CODEX_HOME, {recursive: true, mode: 0o700});
    mkdirSync(launch.cwd, {mode: 0o700});
    chmodSync(launch.cwd, 0o700);
    const profiles = {list: async () => {
      const {profiles: list, listingError} = await profileReadiness({home, chrome, listBackends});
      if (listingError) diagnostics(`profiles_list: the live Chrome extension backends could not be listed (${listingError.code})`);
      if (listingError?.code === 'runtime_teardown_unconfirmed') listingLeftover = true;
      return list;
    }};
    server = createServer({input, output, sessionId, upstream: spawnUpstream(launch), secrets, profiles, diagnostics,
      sandboxState: sandboxStateFor(sandbox, launch.cwd), ...serverSettings});
  } catch (error) {
    await release();
    throw error;
  }

  const closed = server.closed.then(async result => {
    await release();
    return {...result, listingLeftover};
  });
  return {
    sessionId,
    closed,
    close: reason => { server.close(reason); return closed; },
    // The task state (src/mcp/task.mjs): `idle` means no task is open.
    get state() { return server.state; },
  };
}
