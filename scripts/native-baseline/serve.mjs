// The production native serve, with harness-only executable provenance; no API or timing behavior replacement.
import {serve} from '../../src/mcp/server.mjs';
import {nativeProvenance} from './provenance.mjs';
import {SURFACES} from './remote.mjs';
// One surface: the native one, or the browser one alone for the browser-surface cold rows (#115 acceptance 11).
if (!SURFACES.includes(process.env.CUA_SHIM_SURFACES)) throw new Error('The native baseline serves the computer surface or the browser surface alone');
const home = process.env.CUA_HOME;
const witness = nativeProvenance({home, host: process.env.CUA_REPL_HOST, mode: process.env.CUA_NATIVE_NODE_MODE, output: process.stdout});
process.exitCode = await serve({home, env: process.env, output: witness.output, prepareLaunch: witness.prepareLaunch});
