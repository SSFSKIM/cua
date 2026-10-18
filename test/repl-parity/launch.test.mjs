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
// #115 M1: a connection's TMPDIR is its session temp. A boundary lane's markers live in its probe's directory and must
// outlive the connection (a reconnect reads them), so that lane names the directory and it becomes the launch's TMPDIR,
// the write root the markers had before the session temp.
test('a boundary lane\'s marker directory is its launch\'s TMPDIR on either host; other lanes keep the session temp',()=>{
 for(const [host,launch] of [['vendor',{command:'node',args:[],cwd:'/run/s',env:{CUA_REPL_NODE_REPL_PATH:'/pinned/node_repl',TMPDIR:'/run/s/tmp'}}],['cua',{command:'/user/node',args:[],cwd:'/run/s',env:{CUA_REPL_SANDBOX_EXEC:'/usr/bin/sandbox-exec',TMPDIR:'/run/s/tmp'}}]]){
  assert.equal(noServicesLaunch(launch,{host,fixtureTmpdir:'/tmp/bounds-x/tmp'}).env.TMPDIR,'/tmp/bounds-x/tmp',host);
  assert.equal(noServicesLaunch(launch,{host}).env.TMPDIR,'/run/s/tmp',host);
 }
});

// #115 M2: on the macOS vendor host the compat executable finds the session from TMPDIR's shape and the renderer refuses a
// symlinked writable root, so a boundary lane's markers directory is shaped <X>/run/<id>/tmp and becomes the launch's
// real session temp: the launch passes the preflight, the compat locates its settings and renders it writable, and the
// markers outlive the connection's own run directory.
test('on the macOS vendor host a boundary lane\'s markers directory is the launch\'s real session temp, through the preflight, the compat and the renderer',async t=>{
 const {mkdtempSync,mkdirSync,rmSync,existsSync,writeFileSync,realpathSync,lstatSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {PassThrough}=await import('node:stream');
 const {buildLaunch,createLaunchDirs,removeLaunchDirs}=await import('../../src/runtime/launch.mjs');
 const {parsePin,runtimeFor}=await import('../../src/runtime/manifest.mjs');
 const {assertSandboxFits,sandboxArgs,sandboxPolicy,sandboxState}=await import('../../src/runtime/sandbox.mjs');
 const {main}=await import('../../src/sandbox/codex-compat.mjs');
 const {fixturePin}=await import('../fixtures/runtime-fixture.mjs');
 const {boundaryMarkersDir}=await import('./fixture-launch.mjs');
 const root=realpathSync(mkdtempSync(join(tmpdir(),'cua-bounds-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const home=join(root,'cua'),user=join(root,'user');mkdirSync(user);
 const runtime=runtimeFor({home,pin:parsePin(fixturePin({sha256:'a'.repeat(64),length:1})),record:null});
 const markers=boundaryMarkersDir(join(root,'bounds'),{host:'vendor',platform:'darwin'});mkdirSync(markers,{recursive:true});
 assert.equal(boundaryMarkersDir(join(root,'bounds'),{host:'cua',platform:'darwin'}),join(root,'bounds','tmp'));
 const launch=buildLaunch({runtime,home,sessionId:'s1',ambient:{HOME:user,PATH:'/usr/bin:/bin'},sandbox:'scoped'});
 const prepared=noServicesLaunch(launch,{host:'vendor',fixtureTmpdir:markers});
 assert.equal(prepared.env.TMPDIR,markers);assert.equal(prepared.sessionTmp,markers);
 assertSandboxFits('scoped',prepared);
 createLaunchDirs(prepared);
 assert.equal(lstatSync(markers).isDirectory(),true,'a real directory, never a link');
 const scripts=join(markers,'.tmpAbC123');mkdirSync(scripts);
 const argv=sandboxArgs(sandboxPolicy(sandboxState('scoped',prepared.cwd),{readPaths:[scripts]}),[runtime.paths.node,'--experimental-vm-modules',join(scripts,'kernel.js')]);
 const execs=[];let stderr='';
 const code=await main(argv,{HOME:user,PATH:'/usr/bin:/bin',TMPDIR:prepared.env.TMPDIR,CODEX_HOME:prepared.env.CODEX_HOME},{stdin:new PassThrough(),stdout:{write(){}},stderr:{write:x=>{stderr+=x;}},
  cwd:()=>prepared.cwd,chdir(){},execve:(file,args)=>execs.push({file,args}),canExecute:()=>true});
 assert.equal(code,undefined,stderr);
 assert.equal(execs.length,1);
 assert.ok(execs[0].args.some(a=>a.startsWith('-DWRITABLE_ROOT_')&&a.endsWith(`=${markers}`)),'the markers directory is a writable root');
 writeFileSync(join(markers,'counter'),'x');
 removeLaunchDirs(prepared);rmSync(launch.cwd,{recursive:true,force:true});
 assert.ok(existsSync(join(markers,'counter'))&&!existsSync(launch.cwd),'the markers outlive the connection\'s run directory');
});
