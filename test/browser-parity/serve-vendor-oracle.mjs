// The capability host's serve entry for its CUA_BROWSER_SERVICE=vendor lane (scripts/browser-parity/topology.mjs
// localCuaServeCommand), test-only: the production `cua serve` (src/mcp/server.mjs serve) of this checkout, with the
// vendor oracle (vendor-oracle.mjs) applied to every launch it makes, the connection's and the readiness listing's, as
// the remote lanes' test/repl-parity/serve-production.mjs does. The cua lane runs `bin/cua.mjs serve` itself.
import {serve} from '../../src/mcp/server.mjs';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {listLiveBackends} from '../../src/profiles/inventory.mjs';
import {oracleLaunch} from './vendor-oracle.mjs';

const home = defaultHome(), runtime = resolveRuntime({home});
const prepareLaunch = launch => oracleLaunch(launch, {runtime, service: process.env.CUA_BROWSER_SERVICE});
// As `cua serve` (src/cli.mjs): stdout is the MCP stream, a lost stderr never crashes the teardown, and nothing keeps
// the process alive once the server has closed.
process.stderr.on('error', () => {});
const code = await serve({home, prepareLaunch, listBackends: () => listLiveBackends({home, runtime, ambient: process.env, tabCounts: false, prepareLaunch})});
setTimeout(() => process.exit(code), 1000).unref();
process.exitCode = code;
