import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {remoteBridge} from '../../scripts/repl-parity/remote-client.mjs';
const until=async check=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,1));}throw new Error('No bridge reply');};
test('remote client forwards the actual endpoint handshake, real result markers and elicitation replies',async()=>{
 const input=new PassThrough(),output=new PassThrough(),messages=[],responses=[];let notify,ended=0;
 output.on('data',chunk=>messages.push(...chunk.toString().trim().split('\n').map(JSON.parse)));
 const init={protocolVersion:'2025-06-18',serverInfo:{name:'cua-repl-host',version:'0.5.0'},capabilities:{tools:{}}};
 const result={content:[{type:'text',text:'actual'}],_meta:{'cua/replHost':{host:'cua',version:'0.5.0'}}};
 const directory={open:async(name,{initializeParams,onMessage})=>{assert.equal(name,'repl-m5-mini-browser');assert.equal(initializeParams.clientInfo.name,'fixture');notify=onMessage;return {initializeResult:init,request:async(method,params)=>{assert.equal(method,'tools/call');assert.equal(params.name,'js');return {result};},respond:async(id,reply)=>responses.push({id,reply}),notify:async()=>{},close:async()=>ended++};}};
 const bridge=remoteBridge({name:'repl-m5-mini-browser',input,output,directory});
 const send=value=>input.write(JSON.stringify(value)+'\n');
 send({id:7,method:'initialize',params:{clientInfo:{name:'fixture'}}});await until(()=>messages.length===1);assert.deepEqual(messages[0].result,init);
 send({id:8,method:'tools/call',params:{name:'js',arguments:{code:'1'}}});await until(()=>messages.length===2);assert.deepEqual(messages[1],{jsonrpc:'2.0',id:8,result});
 notify({jsonrpc:'2.0',id:'approval-1',method:'elicitation/create',params:{message:'fixture'}});send({id:'approval-1',result:{action:'decline'}});await until(()=>responses.length===1);assert.equal(responses[0].reply.result.action,'decline');
 input.end();await bridge.closed;assert.equal(ended,1);
});
test('failed remote initialization emits only an error code and cleanup settles without an unhandled rejection',async()=>{
 const input=new PassThrough(),output=new PassThrough();let text='';output.on('data',c=>text+=c);
 const bridge=remoteBridge({name:'repl-m5-mini-browser',input,output,directory:{open:async()=>{throw Object.assign(new Error('private detail'),{code:'credential_missing'});}}});
 input.write(JSON.stringify({id:1,method:'initialize',params:{}})+'\n');await until(()=>text.length>0);input.end();await bridge.closed;
 assert.equal(JSON.parse(text).error.message,'credential_missing');assert.ok(!text.includes('private detail'));
});
