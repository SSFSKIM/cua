// cua's real `serve` for #115 M0's experiments, with the launch's CODEX_CLI_PATH pointed at the run's CLI slot
// (CUA_PROBE_SLOT, written by experiment.mjs); everything else is what buildLaunch builds. The pattern is the #115
// spike's serve-spike.mjs (docs/doperpowers/research/2026-10-17-own-sandbox/spike-helper/).
import {serve} from '../../src/mcp/server.mjs';
import {defaultHome} from '../../src/runtime/layout.mjs';

const slot = process.env.CUA_PROBE_SLOT;
if (!slot?.startsWith('/')) throw new Error('CUA_PROBE_SLOT must name the run\'s CLI slot by its absolute path');
const code = await serve({home: defaultHome(), prepareLaunch: launch => {
  process.stderr.write(`serve-slot: built CODEX_CLI_PATH=${launch.env.CODEX_CLI_PATH}; the run uses ${slot}\n`);
  return {...launch, env: {...launch.env, CODEX_CLI_PATH: slot}};
}});
setTimeout(() => process.exit(code), 1000).unref();
