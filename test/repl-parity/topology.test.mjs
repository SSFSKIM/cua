import {test} from 'node:test';import assert from 'node:assert/strict';
import {prepareCommand,cellsCommand,linuxSession,parityScratchPrefix,ownNodeEnv} from '../../scripts/repl-parity/topology.mjs';
import {serveCommand} from '../../scripts/browser-parity/topology.mjs';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {capabilityFixtureCommand} from '../../scripts/repl-parity/capability.mjs';
test('remote prepare uses only the parity clone and profile discovery never rebinds',()=>{
 const c=prepareCommand({device:'cua-linux',commit:'1234567890abcdef'});assert.equal(c.command,'ssh');assert.ok(c.args.includes('BatchMode=yes'));assert.match(c.args.at(-1),/cua-parity/);
 assert.throws(()=>prepareCommand({device:'mini',commit:'$(bad)',profile:'ssfs'}));
});
test('cells and capability resources execute on the device; local runtime copying is refused',()=>{
 for(const make of [cellsCommand,capabilityFixtureCommand]){
  assert.throws(()=>make({device:'local',checkout:'/fixture',home:'/runtime',host:'vendor'}),/local|Local/);
  const c=make({device:'mini',checkout:'/fixture',home:'/runtime',host:'vendor'});assert.equal(c.command,'ssh');assert.ok(c.args.includes('mini'));assert.match(c.args.at(-1),/\/fixture/);
 }
});

test('the capability fixture refuses direct local invocation before opening a runtime home',async()=>{
 const {spawnSync}=await import('node:child_process');const {fileURLToPath}=await import('node:url');
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./serve-capability.mjs',import.meta.url))],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:'/tmp/cua-unconfigured-fixture',CUA_HOME:'/tmp/cua-unconfigured-fixture'}});
 assert.equal(result.status,1);assert.match(result.stderr,/remote-only/);
});

function deviceShell(run) {
 const home=mkdtempSync(join(tmpdir(),'cua-prepare-shell-')),bin=join(home,'.nvm/versions/node/v24.18.0/bin'),checkout=join(home,'Developer/GitHub/cua-parity'),log=join(home,'commands');
 mkdirSync(bin,{recursive:true});mkdirSync(join(checkout,'.git'),{recursive:true});
 writeFileSync(join(bin,'git'),'#!/bin/sh\nprintf "git %s\\n" "$*" >> "$COMMAND_LOG"\nif [ "$1" = status ]; then printf "%s" "$DIRTY"; fi\n',{mode:0o700});
 writeFileSync(join(bin,'npm'),'#!/bin/sh\nprintf "npm %s\\n" "$*" >> "$COMMAND_LOG"\n',{mode:0o700});
 writeFileSync(join(bin,'uname'),'#!/bin/sh\nprintf "%s\\n" "${DEVICE_OS:-Darwin}"\n',{mode:0o700});
 writeFileSync(join(bin,'node'),`#!${process.execPath}\nconst keys=['CUA_NODE','CUA_PARITY_NODE_MODE','CUA_HOME','HOME','CHROME_CONFIG_HOME','XDG_CONFIG_HOME','DISPLAY','CUA_PARITY_REMOTE'];if(process.argv[2]==='--input-type=module')console.log("export DISPLAY=':77'");else console.log(JSON.stringify({args:process.argv.slice(2),env:Object.fromEntries(keys.filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]))}));\n`,{mode:0o700});
 const execute=(command,env={})=>spawnSync('/bin/sh',['-c',command.args.at(-1)],{encoding:'utf8',env:{PATH:bin+':/usr/bin:/bin',HOME:home,COMMAND_LOG:log,CUA_NODE:'/ambient/node',CUA_PARITY_NODE_MODE:'ambient-mode',...env}});
 try{return run({execute,home,checkout,commands:()=>readFileSync(log,'utf8')});}finally{rmSync(home,{recursive:true,force:true});}
}

test('Linux prepare discovers H4 through the fresh preparation helper after clean clone setup',()=>deviceShell(({execute,commands})=>{
 const command=prepareCommand({device:'cua-linux',commit:'1234567890abcdef',profile:'me'});
 const result=execute(command,{DEVICE_OS:'Linux'});assert.equal(result.status,0,result.stderr);
 const output=JSON.parse(result.stdout);
 assert.deepEqual(output.args,['scripts/repl-parity/prepare-device.mjs','prepare','--device','cua-linux','--profile','me','--home','/home/admin/.local/share/cua-h4']);
 assert.equal(output.env.CUA_NODE,undefined);assert.equal(output.env.DISPLAY,':77');assert.equal(output.env.CUA_PARITY_REMOTE,'1');
 assert.match(commands(),/git fetch -q origin\ngit checkout --detach 1234567890abcdef\nnpm ci --silent/);
 assert.throws(()=>prepareCommand({device:'cua-linux',commit:'1234567890abcdef',profile:'me',home:'relative'}),/absolute/);
}));

test('prepare preserves explicit diagnostic options and refuses a dirty clone before preparation',()=>deviceShell(({execute})=>{
 const command=prepareCommand({device:'mini',commit:'1234567890abcdef',profile:'ssfs',home:"/source/owner's home",node:'/diagnostic/node'});
 const result=execute(command);assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout).args,['scripts/repl-parity/prepare-device.mjs','prepare','--device','mini','--profile','ssfs','--home',"/source/owner's home",'--node','/diagnostic/node']);
 const dirty=execute(command,{DIRTY:' M source.mjs'});assert.notEqual(dirty.status,0);assert.equal(dirty.stdout,'');assert.match(dirty.stderr,/dirty/);
}));

test('all ordinary launches clear ambient Node overrides and preserve private scratch HOME',()=>deviceShell(({execute,checkout})=>{
 for(const make of [facts=>cellsCommand({...facts,host:'cua'}),facts=>serveCommand({...facts,service:'cua',replHost:'cua'})]){
  for(const [nodeMode,nodeOverride] of [['managed',null],['diagnostic-override','/diagnostic/node'],[undefined,undefined]]){
   const command=make({device:'mini',checkout,home:'/owned/scratch',userHome:'/owned/scratch/home',ownNode:{path:'/source/resolved/node'},nodeMode,nodeOverride});
   const result=execute(command);assert.equal(result.status,0,result.stderr);const {env}=JSON.parse(result.stdout);
   assert.equal(env.CUA_NODE,nodeOverride??undefined);assert.equal(env.CUA_PARITY_NODE_MODE,nodeMode);
   assert.equal(env.HOME,'/owned/scratch/home');assert.equal(env.CHROME_CONFIG_HOME,'/owned/scratch/home/.config');assert.equal(env.XDG_CONFIG_HOME,env.CHROME_CONFIG_HOME);
  }
 }
 assert.ok(ownNodeEnv({nodeMode:'managed'}).startsWith('-u CUA_NODE '));
}));

test('the device scratch prefix is the harness run\'s own, validated before it reaches the remote shell',()=>{
 assert.equal(parityScratchPrefix({}),'cua-m4t1-');
 assert.equal(parityScratchPrefix({CUA_PARITY_SCRATCH_PREFIX:'cua-m4t3-'}),'cua-m4t3-');
 for(const bad of ['m4t3-','cua-m4t3','cua-$(id)-','cua-a/b-','cua-A b-'])assert.throws(()=>parityScratchPrefix({CUA_PARITY_SCRATCH_PREFIX:bad}),/scratch prefix/);
 assert.ok(linuxSession.includes(`export CUA_PARITY_SCRATCH_PREFIX=${parityScratchPrefix(process.env)}\n`));
});
