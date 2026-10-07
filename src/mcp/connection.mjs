// One MCP connection inside a cua process: the per-connection half of what `cua serve` did, so that one process (the
// stdio `serve`, or the HTTP agent's listener, src/mcp/http.mjs) can hold one connection or several.
//
// `openConnection` resolves the installed runtime (per connection, so a `cua runtime use` or a first `cua install`
// takes effect on the next connection without restarting an agent), claims run/<sessionId> (src/runtime/run-dir.mjs),
// resolves the secret store (src/secrets/store.mjs: $HOME/.config/claude-secrets, unless secrets are off), builds the
// launch for the enabled surfaces (CUA_SHIM_SURFACES) with their trusted services registered (src/services/sky.mjs for
// computer use, src/services/browser.mjs for the browser) and the store's directory (or the reason there is none) in
// its environment, spawns the runtime in an owned working directory, and serves `input`/`output` through
// `createServer` until EOF, a transport loss, a failure or `close(reason)`. With the browser surface, profiles_list
// reads $CUA_HOME's profile registry and, when a profile is bound, checks it against the live backends with one bounded
// listing launch (inventory.mjs, no tab counts); the connection's close waits for such a listing.
//
// Before `closed` settles, everything the connection created is released: the session's app-approval file the runtime
// wrote, and its run entries. `closed` resolves (never rejects) {code, reason, completion, teardown, listingLeftover}: `code` is the connection's own (1 when its runtime teardown was unconfirmed or a release step
// failed), and `listingLeftover`
// says a readiness listing's runtime could not be confirmed stopped. An open that fails rejects with the error (its
// `code` classified) after releasing whatever it had taken.
//
// `prepareLaunch` may adjust the launch record; it exists for tests and the opt-in live probes
// (scripts/probe-secrets.mjs points the sky service at a controlled fake target) and is not reachable from the CLI. `chrome` (the Chrome facts), `listBackends` (the readiness listing) and `host` ({platform,
// arch}, the process's by default: which pin resolves and the host notes) and
// `probeUserns` (whether bubblewrap can create a user namespace, asked for a scoped launch on Linux) exist for tests
// only. `onWithdrawn(requestId)` is told when a cancellation withdrew a request before it reached the runtime, the one
// case in which a request is never answered (the HTTP layer ends the stream that waits for it). `devices` (a device
// directory, src/remote/directory.mjs) gives the connection the device tools and their host-notes rule: the stdio `serve`
// passes one; the HTTP agent never does, so a device never drives a third one through itself.
import {chmodSync, mkdirSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {createServer, settingsFrom} from './server.mjs';
import {spawnUpstream} from './upstream.mjs';
import {resolveRuntime} from '../runtime/manifest.mjs';
import {buildLaunch, SKY_SERVICE, BROWSER_SERVICE} from '../runtime/launch.mjs';
import {claimRunSession} from '../runtime/run-dir.mjs';
import {connectionSecrets} from '../secrets/store.mjs';
import {chromeFacts} from '../profiles/chrome.mjs';
import {chromeRoute, extensionIdFor} from '../chrome/route.mjs';
import {profileReadiness} from '../profiles/commands.mjs';
import {listLiveBackends} from '../profiles/inventory.mjs';
import {assertSandboxConfines, assertSandboxFits, sandboxState as sandboxStateFor} from '../runtime/sandbox.mjs';

const SERVICES = {computer: {sky: SKY_SERVICE}, browser: {browser: BROWSER_SERVICE}};

export async function openConnection({home, env = process.env, sessionId, input, output, host = {platform: process.platform, arch: process.arch},
  devices = null, settings = settingsFrom(env, {platform: host.platform, devices: devices !== null}),
  diagnostics = line => process.stderr.write(`cua serve: ${line}\n`), prepareLaunch = launch => launch, chrome = chromeFacts({host, env, extensionId: extensionIdFor(chromeRoute(home))}),
  listBackends, onWithdrawn, probeUserns}) {
  const {secrets: secretsEnabled, sandbox, ...serverSettings} = settings;
  const runtime = resolveRuntime({home, host});
  // The readiness listing runs under this connection's own mode (src/profiles/inventory.mjs listLiveBackends).
  listBackends ??= () => listLiveBackends({home, runtime, ambient: env, tabCounts: false, sandbox, probeUserns});
  const claim = claimRunSession(home, sessionId);
  let launch;
  let listingLeftover = false;

  // Everything the connection took, in the order serve has always released it. The approval file: the runtime records
  // a "session" app approval under this connection's random session ID, which no later connection can use; it goes
  // with the connection. Other sessions' files are never touched. Each step runs whatever the one before it did; a
  // step that fails is reported and makes the release incomplete (false), never an exception: in the HTTP agent a
  // throw here would end every other session with the process.
  const release = async () => {
    let complete = true;
    const step = async (what, fn) => {
      try { await fn(); } catch (error) {
        complete = false;
        diagnostics(`${what} failed at close (${error.code ?? error.message}); left in place`);
      }
    };
    if (launch) await step('removing the session\'s approval file', () => rmSync(join(launch.env.CODEX_HOME, 'computer-use', 'sessions', `${sessionId}.toml`), {force: true}));
    await step('removing the run entries', () => {
      const leftovers = claim.release();
      if (leftovers.length) diagnostics(`this connection's run entries could not all be removed (${leftovers.join(', ')}); the next cua serve or cua doctor sweeps them`);
    });
    return complete;
  };

  let server;
  try {
    const secrets = connectionSecrets({enabled: secretsEnabled, env});
    launch = prepareLaunch(buildLaunch({
      runtime, home, sessionId, ambient: env, surfaces: serverSettings.surfaces,
      services: Object.assign({}, ...serverSettings.surfaces.map(s => SERVICES[s])),
      secretsDir: secrets.dir, secretsUnavailable: secrets.unavailable?.code,
    }));
    assertSandboxFits(sandbox, launch);
    await assertSandboxConfines(sandbox, {platform: runtime.manifest.platform, probe: probeUserns});
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
      sandboxState: sandboxStateFor(sandbox, launch.cwd), onWithdrawn, devices, ...serverSettings});
  } catch (error) {
    await release();
    throw error;
  }

  const closed = server.closed.then(async result => {
    const released = await release();
    return {...result, code: released ? result.code : 1, listingLeftover};
  });
  return {
    sessionId,
    closed,
    close: reason => { server.close(reason); return closed; },
    // The task state (src/mcp/task.mjs): `idle` means no task is open.
    get state() { return server.state; },
  };
}
