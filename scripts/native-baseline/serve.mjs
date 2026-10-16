// The production native serve, with harness-only executable provenance; no API or timing behavior replacement.
import {serve} from '../../src/mcp/server.mjs';
import {nativeProvenance} from './provenance.mjs';
if (process.env.CUA_SHIM_SURFACES !== 'computer') throw new Error('Native baseline requires computer-only surfaces');
const home = process.env.CUA_HOME;
const witness = nativeProvenance({home, host: process.env.CUA_REPL_HOST, mode: process.env.CUA_NATIVE_NODE_MODE, output: process.stdout});
process.exitCode = await serve({home, env: process.env, output: witness.output, prepareLaunch: witness.prepareLaunch});
