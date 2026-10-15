import {test} from 'node:test';import assert from 'node:assert/strict';
import {prepareCommand,cellsCommand,linuxSession,parityScratchPrefix} from '../../scripts/repl-parity/topology.mjs';
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

test('Linux prepare names the H4 cua-route home without changing another home or the shell profile',()=>{
 const script=prepareCommand({device:'cua-linux',commit:'1234567890abcdef',profile:'me'}).args.at(-1);
 assert.ok(script.includes("export CUA_HOME='/home/admin/.local/share/cua-h4'"));
 assert.throws(()=>prepareCommand({device:'cua-linux',commit:'1234567890abcdef',profile:'me',home:'relative'}),/absolute/);
});

test('the device scratch prefix is the harness run\'s own, validated before it reaches the remote shell',()=>{
 assert.equal(parityScratchPrefix({}),'cua-m4t1-');
 assert.equal(parityScratchPrefix({CUA_PARITY_SCRATCH_PREFIX:'cua-m4t3-'}),'cua-m4t3-');
 for(const bad of ['m4t3-','cua-m4t3','cua-$(id)-','cua-a/b-','cua-A b-'])assert.throws(()=>parityScratchPrefix({CUA_PARITY_SCRATCH_PREFIX:bad}),/scratch prefix/);
 assert.ok(linuxSession.includes(`export CUA_PARITY_SCRATCH_PREFIX=${parityScratchPrefix(process.env)}\n`));
});
