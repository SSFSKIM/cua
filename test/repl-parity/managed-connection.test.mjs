import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AttestedConnections} from '../../scripts/repl-parity/runner.mjs';
const facts={checkout:'/repo',home:'/source',commit:'a'.repeat(40),release:'pin',node:'v22.0.0',platform:'linux',dirty:false,ownNode:{path:'/source/node/24.x/bin/node',version:'v24.18.0'},nodeMode:'managed'};
function command(witness){return {command:process.execPath,args:['--input-type=module','-e',`
 import {createInterface} from 'node:readline';const lines=createInterface({input:process.stdin});
 lines.on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;
 if(m.method==='initialize')console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{serverInfo:{name:'cua-repl-host',version:'0.5.0'},_meta:{'cua/parityExecution':${JSON.stringify(facts)}},protocolVersion:'2025-06-18',capabilities:{tools:{}}}}));
 else {${witness?`console.log(JSON.stringify({jsonrpc:'2.0',method:'cua/parityAnsweringHost',params:{home:'/scratch',ownNode:{path:'/scratch/node/24.x/bin/node',version:'v24.18.0'},nodeMode:'managed'}}));`:''}
 console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{isError:false,content:[],_meta:{'cua/replHost':{host:'cua',version:'0.5.0'}}}}));}});
 `],expectedFacts:facts};}
test('a cached initialize is insufficient until a real managed launch notification and result arrive',async()=>{
 for(const witness of [false,true]){const pool=new AttestedConnections('cua'),notifications=[];
 try{const client=await pool.open({...command(witness),onNotification:m=>notifications.push(m)});
  if(!witness)await assert.rejects(client.call('js_reset'),/managed|answering/);
  else{await client.call('js_reset');assert.equal(pool.metadata().hostAttestations[0].executionFacts.answeringHost.home,'/scratch');assert.equal(notifications.length,1);}
 }finally{await pool.close();}}
});
