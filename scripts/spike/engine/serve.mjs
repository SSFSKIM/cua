#!/usr/bin/env node
// The own native engine spike's MCP stdio server (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, M0
// "Spike"): cua's own REPL host (src/repl-host/supervisor.mjs) with the computer surface on macOS, serving the spike's
// engine through the real facade and the real host, so "in-cell" means what it means in the native baseline:
// performance.now() around the facade call inside the kernel. It runs on the device, started by measure.mjs over ssh:
//
//   CUA_HOME=<approved runtime home> CUA_NODE=<Node 24+> CUA_ENGINE_APP=<bundle> node scripts/spike/engine/serve.mjs
//
// The launch is buildLaunch's own-host launch (src/runtime/launch.mjs), so the environment, the macOS sandbox launcher
// (sandbox-exec), the kernel's deny list and the trusted code paths are what a `cua serve` connection on the own host
// gets; only the selection is given rather than resolved, which is how replHostFor's macOS refusal is bypassed without
// touching src/. Then: the real trusted wrapper (src/services/sky.mjs) stays the `sky` service and delegates to the
// spike's service (./service.mjs) through CUA_SKY_VENDOR_SERVICE, whose directory joins the trusted code; CUA_ENGINE_APP
// names the engine bundle (default: the approved location, ~/Library/Application Support/cua/engine/cua Engine.app);
// the vendor helper's path is dropped; secrets are off (the spike sends no {{secret:…}} reference). CUA_SHIM_SANDBOX
// chooses the mode as for `cua serve` (scoped by default).
//
// What it does of the proxy's work (src/mcp/connection.mjs): it claims a run session under CUA_HOME, creates the
// launch's directories, runs the supervisor under spawnUpstream's anchor-owned process group, stamps every `js` call
// with the connection's sandbox state (`codex/sandbox-state-meta`, which the supervisor confines each child by), and on
// EOF or a signal tears the group down and removes the session. Everything else crosses unchanged: initialize, tools,
// results with their `_meta`, and elicitations both ways. The proxy's own tools, host notes and handshake records are
// not reproduced: none of them is in a cell's timing, and the records are keyed by host, so an own-host handshake
// recorded through a vendor-host connection would be replayed to the vendor lane.
import {randomUUID} from 'node:crypto';
import {realpathSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, isAbsolute, join} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {buildLaunch, createLaunchDirs, ownHostNode, removeLaunchDirs, SKY_SERVICE} from '../../../src/runtime/launch.mjs';
import {resolveRuntime} from '../../../src/runtime/manifest.mjs';
import {defaultHome} from '../../../src/runtime/layout.mjs';
import {claimRunSession} from '../../../src/runtime/run-dir.mjs';
import {assertSandboxFits, sandboxModeFrom, sandboxState, withSandbox} from '../../../src/runtime/sandbox.mjs';
import {spawnUpstream} from '../../../src/mcp/upstream.mjs';

export const SPIKE_DIR = realpathSync(dirname(fileURLToPath(import.meta.url)));
export const SPIKE_SERVICE = join(SPIKE_DIR, 'service.mjs');
export const APPROVED_ENGINE = join(homedir(), 'Library', 'Application Support', 'cua', 'engine', 'cua Engine.app');

// The launch record for one session: buildLaunch's own-host launch with the spike's service and engine.
export function spikeLaunch({home, env, sessionId, runtime = resolveRuntime({home}), node = ownHostNode({ambient: env, home})}) {
  const engineApp = env.CUA_ENGINE_APP || APPROVED_ENGINE;
  if (!isAbsolute(engineApp)) throw new Error('CUA_ENGINE_APP must be the absolute path of the engine bundle');
  const sandbox = sandboxModeFrom(env);
  const launch = buildLaunch({
    runtime, home, sessionId, surfaces: ['computer'], services: {sky: SKY_SERVICE}, secretsUnavailable: 'secrets_disabled',
    ambient: env, replHost: {host: 'cua', reason: 'spike_engine', node}, sandbox,
  });
  const {SKY_CUA_SERVICE_PATH: _vendorHelper, ...kept} = launch.env;
  return {...launch, sandbox, env: {
    ...kept,
    CUA_SKY_VENDOR_SERVICE: SPIKE_SERVICE,
    CUA_ENGINE_APP: engineApp,
    CUA_REPL_TRUSTED_CODE_PATHS: `${kept.CUA_REPL_TRUSTED_CODE_PATHS}:${SPIKE_DIR}`,
  }};
}

function serve() {
  if (process.platform !== 'darwin') throw new Error('the engine spike serves macOS only');
  const env = process.env;
  const home = env.CUA_HOME || defaultHome(env);
  const sessionId = randomUUID();
  const claim = claimRunSession(home, sessionId);
  let launch;
  try {
    launch = spikeLaunch({home, env, sessionId});
    assertSandboxFits(launch.sandbox, launch);
    createLaunchDirs(launch);
  } catch (error) {
    claim.release();
    throw error;
  }
  const state = sandboxState(launch.sandbox, launch.cwd);
  const diagnostics = line => process.stderr.write(`spike serve: ${line}\n`);
  const upstream = spawnUpstream(launch, {diagnostics});
  upstream.onMessage(msg => process.stdout.write(`${JSON.stringify(msg)}\n`));

  let closing = null;
  const close = code => (closing ??= (async () => {
    const teardown = await upstream.terminate();
    if (!teardown.confirmed) diagnostics(`the runtime's process group was not confirmed stopped (${teardown.reason})`);
    try { removeLaunchDirs(launch); } catch (error) { diagnostics(`the session's directories could not be removed (${error.code ?? error.message})`); }
    claim.release();
    process.exitCode = teardown.confirmed ? code : 1;
    setTimeout(() => process.exit(process.exitCode), 1000).unref();
  })());
  upstream.onExit(info => {
    if (info.code !== 0 || info.error) diagnostics(`the runtime exited (${info.error ?? `code ${info.code}, signal ${info.signal}`})`);
    close(info.code === 0 && !info.error ? 0 : 1);
  });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => close(1));

  createInterface({input: process.stdin}).on('line', line => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return diagnostics(`dropped a non-JSON line (${line.length} characters)`); }
    if (msg?.method === 'tools/call' && msg.params?.name === 'js') msg = {...msg, params: {...msg.params, _meta: withSandbox(msg.params._meta, state)}};
    upstream.send(msg);
  }).on('close', () => close(0));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    serve();
  } catch (error) {
    process.stderr.write(`spike serve: ${error.code ? `${error.message} [${error.code}]` : error.stack}\n`);
    process.exit(1);
  }
}
