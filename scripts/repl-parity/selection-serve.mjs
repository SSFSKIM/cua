// Same production serve as bin/cua.mjs; observation-only early refusal frame, no alternate launcher.
import {serve} from '../../src/mcp/server.mjs';
if(process.env.CUA_PARITY_REMOTE!=='1')throw new Error('Remote selection fixture only');
try{process.exitCode=await serve({home:process.env.CUA_HOME});}
catch(error){console.log(JSON.stringify({jsonrpc:'2.0',id:1,error:{code:-32000,message:error.code??'unexpected_error'}}));process.exitCode=1;}
