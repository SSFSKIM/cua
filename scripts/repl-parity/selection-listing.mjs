// Independent profiles-listing consumer; only the answering identity leaves this process, never profile names.
import {listLiveBackends} from '../../src/profiles/inventory.mjs';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {observeLaunchNode} from './node-provenance.mjs';
if(process.env.CUA_PARITY_REMOTE!=='1')throw new Error('Remote selection fixture only');
try{
 let launchNode;
 const result=await listLiveBackends({home:process.env.CUA_HOME,runtime:resolveRuntime({home:process.env.CUA_HOME}),ambient:process.env,tabCounts:false,prepareLaunch:launch=>{launchNode=observeLaunchNode(launch);return launch;}});
 const a=result.hostAttestation;
 console.log(JSON.stringify({observation:{serverInfo:a.serverInfo,_meta:a._meta?{'cua/replHost':a._meta}:null,launchNode}}));
}catch(error){
 // A selection refusal's sentence names settings and routes only; other failures leave by code alone.
 const sentence=['invalid_repl_host','repl_host_refused','repl_host_node','invalid_setting'].includes(error.code)?{message:error.message}:{};
 console.log(JSON.stringify({error:error.code??'unexpected_error',...sentence}));
}
