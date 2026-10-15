// Source-grounded macOS binder lane: no native helper, selected real facade/binders over fixture services.
import {delimiter,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {openConnection} from '../../src/mcp/connection.mjs';
import {prepareCapabilityHome} from '../../scripts/browser-parity/capability-home.mjs';
import {executionFacts,assertPreparedFacts,attestedOutput} from '../../scripts/repl-parity/provenance.mjs';
import {cellsServeEnv} from './fixture-launch.mjs';
import {noServicesLaunch} from './serve-cells.mjs';
import {binderServices,binderBanner} from './fixtures/binder-bootstrap.mjs';
export function prepareBinderLaunch(launch,{host}={}){
 const prefix=host==='vendor'?'NODE_REPL':'CUA_REPL';
 const originalRoots=launch.env[`${prefix}_TRUSTED_CODE_PATHS`].split(delimiter);
 const services=binderServices();services.roots=[...new Set([...originalRoots,...services.roots])];
 const fixture=noServicesLaunch(launch,{host,fixtureServices:services});
 const modules=launch.env[`${prefix}_NODE_MODULE_DIRS`].split(delimiter)[0];
 const vendorRoot=join(modules,'@oai/cua/dist/lib/js/oai_js_cua/src');
 const ownRoot=fileURLToPath(new URL('../../src/cua-api/',import.meta.url));
 const facadeURL=pathToFileURL(host==='vendor'?join(vendorRoot,'tinysky_alt/create_tinysky_alt.js'):join(ownRoot,'create-tinysky-alt.mjs')).href;
 const bindTabURL=pathToFileURL(host==='vendor'?join(vendorRoot,'tinysky_alt/bind_tab.js'):join(ownRoot,'bind-tab.mjs')).href;
 const stateURL=pathToFileURL(host==='vendor'?join(vendorRoot,'get_state.js'):join(ownRoot,'get-state.mjs')).href;
 fixture.env[`${prefix}_JS_BANNER`]=binderBanner({facadeURL,bindTabURL,stateURL});
 return fixture;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.env.CUA_PARITY_REMOTE!=='1')throw new Error('Binder fixture is remote only; all native service calls are source-grounded doubles');
 const source=process.env.CUA_HOME,host=process.env.CUA_REPL_HOST,facts=executionFacts({source});assertPreparedFacts(JSON.parse(process.env.CUA_PARITY_EXPECTED),facts);
 const scratch=prepareCapabilityHome({source});
 try{
  const connection=await openConnection({home:scratch.dir,env:cellsServeEnv(process.env,{scratch,sandbox:'scoped',host}),sessionId:randomUUID(),input:process.stdin,output:attestedOutput(process.stdout,facts),chrome:{profiles:[]},listBackends:async()=>[],prepareLaunch:launch=>prepareBinderLaunch(launch,{host})});
  const stop=()=>connection.close('signal');process.once('SIGTERM',stop);process.once('SIGINT',stop);
  try{process.exitCode=(await connection.closed).code;}finally{process.off('SIGTERM',stop);process.off('SIGINT',stop);}
 }finally{scratch.cleanup();}
}
