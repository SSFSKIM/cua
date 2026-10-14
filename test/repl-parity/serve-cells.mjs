// Isolated no-services parity lane, not a production empty-surface option. Remote device only.
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {desktopSessionEnv} from '../../src/runtime/linux-desktop.mjs';
import {openConnection} from '../../src/mcp/connection.mjs';
import {prepareCapabilityHome} from '../../scripts/browser-parity/capability-home.mjs';
export function noServicesLaunch(launch,{host='vendor'}={}) {
  const env={...launch.env};
  for(const key of Object.keys(env))if(/^(SKY_|OAI_SKY_|CUA_SKY_|CUA_BROWSER_|BROWSER_USE_)/.test(key))delete env[key];
  if(host==='vendor') {
    env.NODE_REPL_TRUSTED_SERVICES='{}';env.NODE_REPL_TRUSTED_RPC_ENABLED='0';env.NODE_REPL_JS_BANNER='void 0;';
    env.NODE_REPL_UNTRUSTED_ENV_ALLOWLIST='';
    return {...launch,command:env.CUA_REPL_NODE_REPL_PATH,args:[],env};
  }
  env.CUA_REPL_TRUSTED_SERVICES='{}';env.CUA_REPL_TRUSTED_RPC_ENABLED='0';env.CUA_REPL_JS_BANNER='void 0;';
  return {...launch,env};
}
export async function serveCells({source,host='vendor',input=process.stdin,output=process.stdout}={}) {
  const scratch=prepareCapabilityHome({source});
  const env={...desktopSessionEnv(process.env),PATH:process.env.PATH,HOME:scratch.userHome,TMPDIR:process.env.TMPDIR,
    CUA_HOME:scratch.dir,CUA_REPL_HOST:host,CUA_BROWSER_SERVICE:'cua',CUA_SHIM_SURFACES:'browser',CUA_SHIM_SECRETS:'off'};
  let connection;
  try {
    connection=await openConnection({home:scratch.dir,env,sessionId:randomUUID(),input,output,
      chrome:{profiles:[]},listBackends:async()=>[],prepareLaunch:l=>noServicesLaunch(l,{host})});
    const terminate=()=>connection.close('signal');process.once('SIGTERM',terminate);process.once('SIGINT',terminate);
    try {const result=await connection.closed;process.exitCode=result.code;}finally{process.off('SIGTERM',terminate);process.off('SIGINT',terminate);}
  } finally {scratch.cleanup();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(process.env.CUA_PARITY_REMOTE!=='1')throw new Error('Live cells fixture is remote-only; local parity uses doubles');
  await serveCells({source:process.env.CUA_HOME,host:process.env.CUA_REPL_HOST??'vendor'});
}
