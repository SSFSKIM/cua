// cua #115 spike: the production `cua serve` with the launch's CODEX_CLI_PATH replaced by the logging shim
// (SPIKE_CLI=shim) or removed (SPIKE_CLI=unset); everything else as buildLaunch builds it.
import {serve} from '/Users/new/cua-115-spike/cua/src/mcp/server.mjs';
import {defaultHome} from '/Users/new/cua-115-spike/cua/src/runtime/layout.mjs';
const mode = process.env.SPIKE_CLI;
const SHIM = '/Users/new/cua-115-spike/shim/codex';
const code = await serve({home: defaultHome(), prepareLaunch: launch => {
  const env = {...launch.env};
  process.stderr.write(`spike: built CODEX_CLI_PATH=${launch.env.CODEX_CLI_PATH} CODEX_HOME=${launch.env.CODEX_HOME} SKY_CUA_SERVICE_PATH=${launch.env.SKY_CUA_SERVICE_PATH}\n`);
  if (mode === 'unset') delete env.CODEX_CLI_PATH; else if (mode === 'shim') env.CODEX_CLI_PATH = SHIM; else throw new Error('SPIKE_CLI must be shim or unset');
  return {...launch, env};
}});
setTimeout(() => process.exit(code), 1000).unref();
