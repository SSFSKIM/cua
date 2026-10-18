// cua's real `serve` for #115 M0's experiments, with the launch's CODEX_CLI_PATH pointed at the run's CLI slot when it has one
// (CUA_PROBE_SLOT, written by experiment.mjs); everything else is what buildLaunch builds. The pattern is the #115
// spike's serve-spike.mjs (docs/doperpowers/research/2026-10-17-own-sandbox/spike-helper/).
// With CUA_PROBE_LAUNCH_LOG, each launch's run directory, session temp, TMPDIR and CODEX_HOME are appended there as one
// JSON line (#115 M2's opening probe, ./launch-env.mjs).
import {appendFileSync} from 'node:fs';
import {serve} from '../../src/mcp/server.mjs';
import {defaultHome} from '../../src/runtime/layout.mjs';

const slot = process.env.CUA_PROBE_SLOT;
const launchLog = process.env.CUA_PROBE_LAUNCH_LOG;
// Without CUA_PROBE_SLOT (#115 M2) the launch keeps the CODEX_CLI_PATH buildLaunch gave it.
if (slot !== undefined && !slot.startsWith('/')) throw new Error('CUA_PROBE_SLOT must name the run\'s CLI slot by its absolute path');
const code = await serve({home: defaultHome(), prepareLaunch: launch => {
  process.stderr.write(`serve-slot: built CODEX_CLI_PATH=${launch.env.CODEX_CLI_PATH}; the run uses ${slot ?? 'it'}\n`);
  const env = slot ? {...launch.env, CODEX_CLI_PATH: slot} : launch.env;
  if (launchLog) appendFileSync(launchLog, `${JSON.stringify({t: new Date().toISOString(), cwd: launch.cwd, sessionTmp: launch.sessionTmp, TMPDIR: env.TMPDIR, CODEX_HOME: env.CODEX_HOME, CODEX_CLI_PATH: env.CODEX_CLI_PATH})}\n`, {mode: 0o600});
  return {...launch, env};
}});
// The exit status is set first: the timer below is unreferenced, so a process with nothing left to run exits
// naturally before it fires, with this status (as bin/cua.mjs sets main's), never a default 0.
process.exitCode = code;
setTimeout(() => process.exit(code), 1000).unref();
