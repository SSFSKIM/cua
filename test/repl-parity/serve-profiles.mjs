// Production profiles_list with an observation-only tap on its independent bounded host.
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {serve} from '../../src/mcp/server.mjs';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {listLiveBackends} from '../../src/profiles/inventory.mjs';
import {executionFacts,assertPreparedFacts,attestedOutput} from '../../scripts/repl-parity/provenance.mjs';
if(process.env.CUA_PARITY_REMOTE!=='1'||process.env.CUA_SHIM_SURFACES!=='browser')throw new Error('Profiles parity is remote browser-only');
const home=defaultHome(),facts=executionFacts({source:home});assertPreparedFacts(JSON.parse(process.env.CUA_PARITY_EXPECTED),facts);
const runtime=resolveRuntime({home}),output=attestedOutput(process.stdout,facts);
async function listBackends(){
 const directory=mkdtempSync(join(tmpdir(),'cua-parity-profile-')),proofFile=join(directory,'proof.json');
 try{
  const result=await listLiveBackends({home,runtime,ambient:process.env,tabCounts:false,prepareLaunch:launch=>{
   if(process.env.CUA_REPL_HOST==='cua'&&launch.command!==facts.ownNode?.path)throw new Error('Profile launch Node differs from provenance');
   return {...launch,command:process.execPath,args:[fileURLToPath(new URL('./fixtures/profile-host-tap.mjs',import.meta.url))],env:{...launch.env,CUA_PARITY_PROFILE_COMMAND:JSON.stringify([launch.command,...launch.args]),CUA_PARITY_PROFILE_PROOF:proofFile}};
  }});
  const observation={...JSON.parse(readFileSync(proofFile,'utf8')),executionFacts:facts,teardown:{confirmed:result.teardown.confirmed}};
  output.write(JSON.stringify({jsonrpc:'2.0',method:'cua/parityProfiles',params:observation})+'\n');
  return result;
 }finally{rmSync(directory,{recursive:true,force:true});}
}
process.exitCode=await serve({home,output,listBackends});
