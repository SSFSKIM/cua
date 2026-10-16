// Same production serve as bin/cua.mjs; observation-only early refusal frame, no alternate launcher.
import {serve} from '../../src/mcp/server.mjs';
import {observeLaunchNode} from './node-provenance.mjs';
if(process.env.CUA_PARITY_REMOTE!=='1')throw new Error('Remote selection fixture only');
try{process.exitCode=await serve({home:process.env.CUA_HOME,prepareLaunch:launch=>{
 console.log(JSON.stringify({jsonrpc:'2.0',method:'cua/paritySelectionLaunch',params:{node:observeLaunchNode(launch)}}));return launch;
}});}
// A refusal before serving (settingsFrom at start) answers initialize with its code and sentence; selection-device.mjs refusalOf reads them.
catch(error){console.log(JSON.stringify({jsonrpc:'2.0',id:1,error:{code:-32000,message:`serve refused before launch (${error.code??'unexpected_error'}): ${error.message}`}}));process.exitCode=1;}
