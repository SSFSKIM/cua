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

test('closing the attested connections closes every one before reporting those that failed',async()=>{
 const {AttestedConnections}=await import('../../scripts/repl-parity/runner.mjs');const pool=new AttestedConnections('cua'),closed=[];
 const fake=(name,code)=>({connection:name,client:{close:async()=>{closed.push(name);return {code,signal:null};}}});
 pool.clients.push(fake('connection-1',0),fake('connection-2',1),fake('connection-3',0));
 await assert.rejects(pool.close(),/Harness connection cleanup failed: connection-2 \(1\)$/);
 assert.deepEqual(closed,['connection-1','connection-2','connection-3']);
});

// #157: a connection that ends abnormally leaves the tail of its stderr for a diagnosis; one that ends as asked leaves none.
test('stderr tail: written, bounded, only when a connection ends abnormally',async t=>{
 const {mkdtempSync,readFileSync,existsSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=mkdtempSync(join(tmpdir(),'cua-stderr-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const server=script=>({command:process.execPath,args:['-e',script]});
 // Exits 1 by itself, after more stderr than the bound: the file holds the last bytes and says why it was written.
 const failing=new StdioClient({...server(`process.stderr.write('x'.repeat(5000)+'THE END');setTimeout(()=>process.exit(1),50);`),stderrFile:join(dir,'a','connection-1.stderr.log'),stderrBytes:1000});
 assert.equal((await failing.exited).code,1);
 const text=readFileSync(join(dir,'a','connection-1.stderr.log'),'utf8');
 assert.match(text,/^# \S+ exit 1 before the harness closed it; the last 1000 bytes of stderr follow\n/);
 assert.ok(text.endsWith('THE END'));assert.equal(text.split('\n')[1].length,1000);
 assert.equal(failing.stderrFile,join(dir,'a','connection-1.stderr.log'));
 // Closed by the harness and exiting 0, or dropped with SIGTERM: nothing written.
 const calm=server(`process.stderr.write('noise');process.stdin.resume();process.stdin.on('end',()=>process.exit(0));`);
 const eof=new StdioClient({...calm,stderrFile:join(dir,'eof.log')});await new Promise(r=>setTimeout(r,100));assert.equal((await eof.close()).code,0);
 const dropped=new StdioClient({...calm,stderrFile:join(dir,'drop.log')});await new Promise(r=>setTimeout(r,100));assert.equal((await dropped.close({drop:true})).signal,'SIGTERM');
 assert.equal(existsSync(join(dir,'eof.log')),false);assert.equal(existsSync(join(dir,'drop.log')),false);
 // Closed by the harness but exiting nonzero: written.
 const sour=new StdioClient({...server(`process.stderr.write('bad');process.stdin.resume();process.stdin.on('end',()=>process.exit(3));`),stderrFile:join(dir,'sour.log')});
 await new Promise(r=>setTimeout(r,100));assert.equal((await sour.close()).code,3);
 assert.match(readFileSync(join(dir,'sour.log'),'utf8'),/exit 3 after the harness's eof[^\n]*\nbad$/);
 // The pool names each connection's file after the connection.
 const {AttestedConnections}=await import('../../scripts/repl-parity/runner.mjs');
 const pool=new AttestedConnections('vendor',{diagnostics:join(dir,'diagnostics')});
 const opened=pool.open(server(`process.stderr.write('pool');setTimeout(()=>process.exit(1),50);`));await assert.rejects(opened,/MCP exited \(1\)/);
 assert.match(readFileSync(join(dir,'diagnostics','connection-1.stderr.log'),'utf8'),/pool$/);
});
