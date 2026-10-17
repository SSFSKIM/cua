// Production serve, unchanged launch/services/banner. Only initialize gets harness provenance.
import {serve} from '../../src/mcp/server.mjs';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {listLiveBackends} from '../../src/profiles/inventory.mjs';
import {executionFacts,assertPreparedFacts,attestedOutput} from '../../scripts/repl-parity/provenance.mjs';
import {attestFixtureLaunch,fixtureNodeEnvironment} from './serve-cells.mjs';
if(process.env.CUA_SHIM_SURFACES!=='browser')throw new Error('Production parity is browser-only');
const home=defaultHome(),facts=executionFacts({source:home});
if(process.env.CUA_PARITY_EXPECTED)assertPreparedFacts(JSON.parse(process.env.CUA_PARITY_EXPECTED),facts);
const env=fixtureNodeEnvironment(process.env),runtime=resolveRuntime({home});
const prepareLaunch=launch=>attestFixtureLaunch(launch,{home,facts});
process.exitCode=await serve({home,env,output:attestedOutput(process.stdout,facts),prepareLaunch,
 listBackends:()=>listLiveBackends({home,runtime,ambient:env,tabCounts:false,prepareLaunch})});
