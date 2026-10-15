// Isolated no-services parity lane, not a production empty-surface option. Remote device only.
import {writeFileSync} from 'node:fs';
import {join,delimiter,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixtureServices as createFixtureServices} from './fixtures/service-home.mjs';
import {executionFacts,assertPreparedFacts,attestedOutput} from '../../scripts/repl-parity/provenance.mjs';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {cellsServeEnv} from './fixture-launch.mjs';
import {openConnection} from '../../src/mcp/connection.mjs';
import {prepareCapabilityHome} from '../../scripts/browser-parity/capability-home.mjs';
export function noServicesLaunch(launch,{host='vendor',witness=false,brokenSandbox=false,fixtureServices}={}) {
  const env={...launch.env};
  delete env[host==='vendor'?'NODE_REPL_TOOL_OVERRIDES':'CUA_REPL_TOOL_OVERRIDES'];
  if(brokenSandbox)env.CODEX_CLI_PATH=typeof brokenSandbox==='string'?brokenSandbox:'/cua-parity-unavailable-sandbox';
  const banner=witness?'globalThis.__parityBannerWitness = Symbol("fixture-banner");':'void 0;';
  for(const key of Object.keys(env))if(/^(SKY_|OAI_SKY_|CUA_SKY_|CUA_BROWSER_|BROWSER_USE_)/.test(key))delete env[key];
  if(fixtureServices){
    const prefix=host==='vendor'?'NODE_REPL':'CUA_REPL';
    Object.assign(env,fixtureServices.env,{[`${prefix}_TRUSTED_SERVICES`]:JSON.stringify(fixtureServices.services),[`${prefix}_TRUSTED_CODE_PATHS`]:fixtureServices.roots.join(delimiter),[`${prefix}_TRUSTED_RPC_ENABLED`]:'1',[`${prefix}_JS_BANNER`]:banner,[`${prefix}_UNTRUSTED_ENV_ALLOWLIST`]:'PARITY_CELL_VISIBLE'});
    if(launch.cwd&&fixtureServices.env.PARITY_PIPE)env.PARITY_PIPE_RELATIVE=relative(launch.cwd,fixtureServices.env.PARITY_PIPE);
    const command=host==='vendor'?env.CUA_REPL_NODE_REPL_PATH:launch.command,args=host==='vendor'?[]:launch.args;
    env.PARITY_HOST_COMMAND=JSON.stringify([command,...args]);
    return {...launch,command:process.execPath,args:[fileURLToPath(new URL('./fixtures/host-tap.mjs',import.meta.url))],env};
  }
  if(host==='vendor') {
    env.NODE_REPL_TRUSTED_SERVICES='{}';env.NODE_REPL_TRUSTED_RPC_ENABLED='0';env.NODE_REPL_JS_BANNER=banner;
    env.NODE_REPL_UNTRUSTED_ENV_ALLOWLIST='';
    return {...launch,command:env.CUA_REPL_NODE_REPL_PATH,args:[],env};
  }
  // The own host (src/repl-host/supervisor.mjs) under its owned names: the same no-op banner, no services or rpc and no
  // cell environment, so both hosts run the identical lane.
  env.CUA_REPL_TRUSTED_SERVICES='{}';env.CUA_REPL_TRUSTED_RPC_ENABLED='0';env.CUA_REPL_JS_BANNER=banner;
  env.CUA_REPL_UNTRUSTED_ENV_ALLOWLIST='';
  return {...launch,env};
}
export async function serveCells({source,host='vendor',sandbox='scoped',witness=false,brokenSandbox=false,controlDir,services=false,input=process.stdin,output=process.stdout}={}) {
  const facts=executionFacts({source});assertPreparedFacts(JSON.parse(process.env.CUA_PARITY_EXPECTED),facts);
  output=attestedOutput(output,facts);
  const scratch=prepareCapabilityHome({source});
  const env=cellsServeEnv(process.env,{scratch,sandbox,host});
  let connection,fixtureServices;
  try {
    fixtureServices=services?await createFixtureServices({timeoutPipe:process.env.CUA_PARITY_FIXTURE_CASE==='cells/native-pipe/connect-timeout'}):null;
    connection=await openConnection({home:scratch.dir,env,sessionId:randomUUID(),input,output,
      chrome:{profiles:[]},listBackends:async()=>[],prepareLaunch:l=>{if(host==='cua'&&l.command!==facts.ownNode?.path)throw new Error('The own host launch does not run the Node its provenance names');if(controlDir)writeFileSync(join(controlDir,'launch.json'),JSON.stringify({pid:process.pid,cwd:l.cwd,home:scratch.dir,nodePath:l.env.NODE_REPL_NODE_PATH??l.command}));return noServicesLaunch(l,{host,witness,brokenSandbox,fixtureServices});}});
    const terminate=()=>connection.close('signal');process.once('SIGTERM',terminate);process.once('SIGINT',terminate);
    try {const result=await connection.closed;if(controlDir)writeFileSync(join(controlDir,'closed.json'),JSON.stringify(result));process.exitCode=result.code;}finally{process.off('SIGTERM',terminate);process.off('SIGINT',terminate);}
  } finally {try{await fixtureServices?.close();}finally{scratch.cleanup();}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(process.env.CUA_PARITY_REMOTE!=='1')throw new Error('Live cells fixture is remote-only; local parity uses doubles');
  await serveCells({source:process.env.CUA_HOME,services:process.env.CUA_PARITY_FIXTURE_SERVICES==='1',host:process.env.CUA_REPL_HOST??'vendor',sandbox:process.env.CUA_PARITY_SANDBOX??'scoped',witness:process.env.CUA_PARITY_BANNER_WITNESS==='1',brokenSandbox:process.env.CUA_PARITY_BROKEN_SANDBOX||false,controlDir:process.env.CUA_PARITY_CONTROL_DIR});
}
