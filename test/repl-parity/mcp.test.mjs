import {test} from 'node:test';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {StdioClient} from '../../scripts/browser-parity/mcp.mjs';
test('elicitation decisions can change per cell and cancellation targets the active request without rejecting its eventual result',async t=>{
 const notices=[];const client=new StdioClient({command:process.execPath,args:[fileURLToPath(new URL('./fixtures/control-server.mjs',import.meta.url))],onNotification:m=>notices.push(m)});t.after(()=>client.close());
 await client.initialize();client.setElicitationAnswer(async()=>({action:'decline',content:{fixture:true},_meta:{fixture:1}}));
 const pending=client.call('js',{code:'fixture'});assert.equal(typeof pending.requestId,'number');client.cancel(pending.requestId);
 const result=await pending;assert.deepEqual(JSON.parse(result.content[0].text),{action:'decline',content:{fixture:true},_meta:{fixture:1}});
 assert.equal(notices[0].params.requestId,pending.requestId);
 for(const action of ['accept','cancel']){client.setElicitationAnswer(()=>({action}));assert.equal(JSON.parse((await client.call('js')).content[0].text).action,action);}
});
