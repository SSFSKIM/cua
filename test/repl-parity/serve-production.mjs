// Production serve, unchanged launch/services/banner. Only initialize gets harness provenance. The lane's
// CUA_BROWSER_SERVICE (vendor or cua; cua when unset) picks the browser service: `vendor` applies the test-only vendor
// oracle (test/browser-parity/vendor-oracle.mjs) to every launch, `cua` leaves production's own service.
import {serve} from '../../src/mcp/server.mjs';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {listLiveBackends} from '../../src/profiles/inventory.mjs';
import {executionFacts,assertPreparedFacts,attestedOutput} from '../../scripts/repl-parity/provenance.mjs';
import {attestFixtureLaunch,fixtureNodeEnvironment} from './serve-cells.mjs';
import {oracleLaunch} from '../browser-parity/vendor-oracle.mjs';
if(process.env.CUA_SHIM_SURFACES!=='browser')throw new Error('Production parity is browser-only');
const home=defaultHome(),facts=executionFacts({source:home});
if(process.env.CUA_PARITY_EXPECTED)assertPreparedFacts(JSON.parse(process.env.CUA_PARITY_EXPECTED),facts);
const env=fixtureNodeEnvironment(process.env),runtime=resolveRuntime({home});
const service=process.env.CUA_BROWSER_SERVICE??'cua';
const prepareLaunch=launch=>attestFixtureLaunch(oracleLaunch(launch,{runtime,service}),{home,facts});
process.exitCode=await serve({home,env,output:attestedOutput(process.stdout,facts),prepareLaunch,
 listBackends:()=>listLiveBackends({home,runtime,ambient:env,tabCounts:false,prepareLaunch})});
