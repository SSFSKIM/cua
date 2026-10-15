// Production serve, unchanged launch/services/banner. Only initialize gets harness provenance.
import {serve} from '../../src/mcp/server.mjs';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {executionFacts,attestedOutput} from '../../scripts/repl-parity/provenance.mjs';
if(process.env.CUA_SHIM_SURFACES!=='browser')throw new Error('Production parity is browser-only');
const home=defaultHome(),facts=executionFacts({source:home});
process.exitCode=await serve({home,output:attestedOutput(process.stdout,facts)});
