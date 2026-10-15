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

test('the connection collector records both reconnects rather than recycling the initial handshake',async t=>{
 const {AttestedConnections}=await import('../../scripts/repl-parity/runner.mjs');
 const {validateAttestations}=await import('../../scripts/repl-parity/compare.mjs');
 const pool=new AttestedConnections('vendor');t.after(()=>pool.close());
 const command={command:process.execPath,args:[fileURLToPath(new URL('./fixtures/control-server.mjs',import.meta.url))]};
 const one=await pool.open(command);await one.call('js');await one.close();
 const two=await pool.open(command);
 assert.throws(()=>validateAttestations({host:'vendor',complete:true,...pool.metadata()}),/attestation/);
 await two.call('js');validateAttestations({host:'vendor',complete:true,...pool.metadata()});
 assert.equal(pool.metadata().hostAttestations.length,2);
 assert.notEqual(pool.metadata().hostAttestations[0].connection,pool.metadata().hostAttestations[1].connection);
});

test('harness cleanup has its own configurable wait without changing production completion deadlines',async()=>{
 const command={command:process.execPath,args:['-e',`process.stdin.resume();process.stdin.on('end',()=>setTimeout(()=>{},300));`]};
 const short=new StdioClient({...command,closeTimeoutMs:20});assert.equal((await short.close()).signal,'SIGKILL');
 const enough=new StdioClient({...command,closeTimeoutMs:1000});assert.equal((await enough.close()).code,0);
});
