import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {fixtureJson} from '../../scripts/repl-parity/fixture-http.mjs';
test('fixture control requests use independent connections and never retry failed observations',async()=>{
 const sockets=new Set(),headers=[],requests=[];const server=createServer((req,res)=>{sockets.add(req.socket);headers.push(req.headers.connection);requests.push(req.url);if(req.url==='/failed'){req.socket.destroy();return;}res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
 try{assert.deepEqual(await fixtureJson(url+'/reset',{method:'POST',body:'{}'}),{ok:true});assert.deepEqual(await fixtureJson(url+'/state'),{ok:true});assert.equal(sockets.size,2);assert.deepEqual(headers,['close','close']);await assert.rejects(()=>fixtureJson(url+'/failed'),/fixture observation failed/);assert.equal(requests.filter(p=>p==='/failed').length,1);}finally{await new Promise(resolve=>server.close(resolve));}
});
