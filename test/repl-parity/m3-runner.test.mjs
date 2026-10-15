import test from 'node:test';
import assert from 'node:assert/strict';
import {profileObserver} from '../../scripts/repl-parity/profile-observer.mjs';

test('profile proof needs an actual initialized listing call and preserves absence',()=>{
 const p=profileObserver();
 p.request({id:1,method:'initialize'});p.response({id:1,result:{serverInfo:{name:'rmcp',version:'1'}}});
 assert.throws(()=>p.proof(),/listing/);
 p.request({id:2,method:'tools/call',params:{name:'js',arguments:{code:'nodeRepl.write("CUABACKENDS ");'}}});
 p.response({id:2,result:{isError:false,content:[{type:'text',text:'CUABACKENDS '+JSON.stringify({backends:[{family:'chrome',instanceId:'fixture',profileName:'Fixture',tabCount:null}]})}]}});
 assert.deepEqual(p.proof(),{serverInfo:{name:'rmcp',version:'1'},_meta:null,backends:[{family:'chrome',instanceId:'fixture',profileName:'Fixture',tabCount:null}],tabCounts:false});
});
test('profile proof rejects tab enumeration and any leaked owner title or URL',()=>{
 for(const code of ['cua.listTabs({emit:false})','await cua.listTabs()'])assert.throws(()=>profileObserver().request({id:2,method:'tools/call',params:{name:'js',arguments:{code}}}),/tabs/);
 const p=profileObserver();p.request({id:1,method:'initialize'});p.response({id:1,result:{serverInfo:{name:'rmcp',version:'1'}}});
 p.request({id:2,method:'tools/call',params:{name:'js',arguments:{code:'CUABACKENDS'}}});
 assert.throws(()=>p.response({id:2,result:{content:[{type:'text',text:'CUABACKENDS {"backends":[{"family":"chrome","title":"private"}]}'}]}}),/unexpected/);
});
