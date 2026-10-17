import {test} from 'node:test';import assert from 'node:assert/strict';
import {noServicesLaunch} from './serve-cells.mjs';
test('isolated vendor lane bypasses the banner-overwriting launcher and cannot reach browser/native services',()=>{
 const launch=noServicesLaunch({command:'node',args:['launcher'],env:{CUA_REPL_NODE_REPL_PATH:'/pinned/node_repl',NODE_REPL_TRUSTED_SERVICES:'production',SKY_CUA_SERVICE_PATH:'helper',BROWSER_USE_BACKEND_PATHS:'owner'}});
 assert.equal(launch.command,'/pinned/node_repl');assert.deepEqual(launch.args,[]);assert.equal(launch.env.NODE_REPL_TRUSTED_SERVICES,'{}');assert.equal(launch.env.NODE_REPL_JS_BANNER,'void 0;');assert.equal(launch.env.SKY_CUA_SERVICE_PATH,undefined);assert.equal(launch.env.BROWSER_USE_BACKEND_PATHS,undefined);
});
test('isolated own-host lane keeps the supervisor launch and gives it the same no-op banner, no services, rpc or cell environment',()=>{
 const supervisor={command:'/user/node',args:['--disable-sigusr1','/checkout/src/repl-host/supervisor.mjs'],cwd:'/run/s',replHost:{host:'cua',reason:'explicit'},
  env:{CUA_REPL_NODE_PATH:'/user/node',CUA_REPL_TRUSTED_SERVICES:'production',CODEX_CLI_PATH:'/codex',SKY_CUA_SERVICE_PATH:'helper',CUA_BROWSER_SERVICE:'cua',BROWSER_USE_BACKEND_PATHS:'owner'}};
 const launch=noServicesLaunch(supervisor,{host:'cua',witness:true});
 assert.deepEqual([launch.command,launch.args,launch.cwd,launch.replHost],[supervisor.command,supervisor.args,supervisor.cwd,supervisor.replHost]);
 assert.deepEqual([launch.env.CUA_REPL_TRUSTED_SERVICES,launch.env.CUA_REPL_TRUSTED_RPC_ENABLED,launch.env.CUA_REPL_UNTRUSTED_ENV_ALLOWLIST],['{}','0','']);
 assert.equal(launch.env.CUA_REPL_JS_BANNER,'globalThis.__parityBannerWitness = Symbol("fixture-banner");');
 for(const key of ['SKY_CUA_SERVICE_PATH','CUA_BROWSER_SERVICE','BROWSER_USE_BACKEND_PATHS'])assert.equal(launch.env[key],undefined,key);
 assert.equal(noServicesLaunch(supervisor,{host:'cua',brokenSandbox:'/fixture/failing-sandbox'}).env.CODEX_CLI_PATH,'/fixture/failing-sandbox');
 const seatbelt={...supervisor,env:{...supervisor.env,CODEX_CLI_PATH:undefined,CUA_REPL_SANDBOX_EXEC:'/usr/bin/sandbox-exec'}};
 const broken=noServicesLaunch(seatbelt,{host:'cua',brokenSandbox:'/fixture/failing-sandbox'}).env;
 assert.deepEqual([broken.CUA_REPL_SANDBOX_EXEC,broken.CODEX_CLI_PATH],['/fixture/failing-sandbox',undefined],'cua\'s own sandbox launcher is the one replaced on the macOS own host');
});
