// Isolated no-services parity lane, not a production empty-surface option. Remote device only.
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {executionFacts,assertPreparedFacts,attestedOutput} from '../../scripts/repl-parity/provenance.mjs';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {desktopSessionEnv} from '../../src/runtime/linux-desktop.mjs';
import {openConnection} from '../../src/mcp/connection.mjs';
import {prepareCapabilityHome} from '../../scripts/browser-parity/capability-home.mjs';
export function noServicesLaunch(launch,{host='vendor',witness=false,brokenSandbox=false}={}) {
  const env={...launch.env};
  if(brokenSandbox)env.CODEX_CLI_PATH=typeof brokenSandbox==='string'?brokenSandbox:'/cua-parity-unavailable-sandbox';
  const banner=witness?'globalThis.__parityBannerWitness = Symbol("fixture-banner");':'void 0;';
  for(const key of Object.keys(env))if(/^(SKY_|OAI_SKY_|CUA_SKY_|CUA_BROWSER_|BROWSER_USE_)/.test(key))delete env[key];
  if(host==='vendor') {
    env.NODE_REPL_TRUSTED_SERVICES='{}';env.NODE_REPL_TRUSTED_RPC_ENABLED='0';env.NODE_REPL_JS_BANNER=banner;
    env.NODE_REPL_UNTRUSTED_ENV_ALLOWLIST='';
    return {...launch,command:env.CUA_REPL_NODE_REPL_PATH,args:[],env};
  }
  env.CUA_REPL_TRUSTED_SERVICES='{}';env.CUA_REPL_TRUSTED_RPC_ENABLED='0';env.CUA_REPL_JS_BANNER=banner;
  return {...launch,env};
}
export async function serveCells({source,host='vendor',sandbox='scoped',witness=false,brokenSandbox=false,controlDir,input=process.stdin,output=process.stdout}={}) {
  const facts=executionFacts({source});assertPreparedFacts(JSON.parse(process.env.CUA_PARITY_EXPECTED),facts);
  output=attestedOutput(output,facts);
  const scratch=prepareCapabilityHome({source});
  const env={...desktopSessionEnv(process.env),PATH:process.env.PATH,HOME:scratch.userHome,TMPDIR:process.env.TMPDIR,
    CUA_HOME:scratch.dir,CUA_SHIM_SANDBOX:sandbox,CUA_REPL_HOST:host,CUA_BROWSER_SERVICE:'cua',CUA_SHIM_SURFACES:'browser',CUA_SHIM_SECRETS:'off'};
  let connection;
  try {
    connection=await openConnection({home:scratch.dir,env,sessionId:randomUUID(),input,output,
      chrome:{profiles:[]},listBackends:async()=>[],prepareLaunch:l=>{if(controlDir)writeFileSync(join(controlDir,'launch.json'),JSON.stringify({pid:process.pid,cwd:l.cwd,home:scratch.dir}));return noServicesLaunch(l,{host,witness,brokenSandbox});}});
    const terminate=()=>connection.close('signal');process.once('SIGTERM',terminate);process.once('SIGINT',terminate);
    try {const result=await connection.closed;if(controlDir)writeFileSync(join(controlDir,'closed.json'),JSON.stringify(result));process.exitCode=result.code;}finally{process.off('SIGTERM',terminate);process.off('SIGINT',terminate);}
  } finally {scratch.cleanup();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(process.env.CUA_PARITY_REMOTE!=='1')throw new Error('Live cells fixture is remote-only; local parity uses doubles');
  await serveCells({source:process.env.CUA_HOME,host:process.env.CUA_REPL_HOST??'vendor',sandbox:process.env.CUA_PARITY_SANDBOX??'scoped',witness:process.env.CUA_PARITY_BANNER_WITNESS==='1',brokenSandbox:process.env.CUA_PARITY_BROKEN_SANDBOX||false,controlDir:process.env.CUA_PARITY_CONTROL_DIR});
}
