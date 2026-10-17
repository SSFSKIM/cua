// The oracle's time bounds the archive cache must fit under, pinned where they are applied: a boundary probe's whole
// remote run (120 s) and a fixture connection's MCP requests, initialize included (150 s, the client default no
// fixture command overrides).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runBoundaryScenario} from '../../scripts/repl-parity/boundaries.mjs';
import {StdioClient} from '../../scripts/browser-parity/mcp.mjs';
import {nativeCommand} from '../../scripts/repl-parity/native.mjs';
import {cellsCommand} from '../../scripts/repl-parity/topology.mjs';

const prepared={device:'cua-linux',checkout:'/prepared/cua-parity',home:'/prepared/home',commit:'reviewed',release:'r1',node:'v22.0.0',platform:'linux',nodeMode:'managed'};

test('a boundary probe runs against the prepared home under the unchanged 120 s bound',async()=>{
 const calls=[];
 const result=await runBoundaryScenario({id:'cells/lifecycle/eof-settles-no-replay'},{prepared,host:'vendor'},{execute:async(command,args,options)=>{
  calls.push({command,args,options});return {stdout:JSON.stringify({rows:[],observations:{},executionFacts:{...prepared,dirty:false}})};
 }});
 assert.equal(calls.length,1);assert.equal(calls[0].options.timeout,120000);
 assert.match(calls[0].args.at(-1),/CUA_HOME='\/prepared\/home' .*node test\/repl-parity\/probe-boundary\.mjs 'lifecycle\/eof-settles-no-replay'/);
 assert.deepEqual(result.rows,[]);
});

test('fixture connections keep the 150 s request bound: the client default, overridden by neither native nor cells commands',async t=>{
 const client=new StdioClient({command:process.execPath,args:['-e','']});t.after(()=>client.exited);
 assert.equal(client.timeoutMs,150000);
 for(const command of [nativeCommand({...prepared,host:'cua'}),cellsCommand({...prepared,host:'cua'})]){
  assert.equal(Object.hasOwn(command,'timeoutMs'),false);
  assert.match(command.args.at(-1),/CUA_HOME='\/prepared\/home'/);
 }
});
