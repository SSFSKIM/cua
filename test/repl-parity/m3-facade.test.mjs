import test from 'node:test';
import assert from 'node:assert/strict';
import scenarios from './scenarios/facade-api.mjs';
const result=value=>({isError:false,content:[{type:'text',text:'CUA_PARITY_RESULT '+JSON.stringify({ok:true,value})}]});
test('facade oracle rejects missing state fields, unavailable selected browser and missing initial snapshot',async()=>{
 const state=scenarios.find(s=>s.id==='api/cua/getstate');
 assert.equal((await state.assert({results:[result({apps:true,browsers:true,selected:true,errors:true})]})).ok,true);
 assert.throws(()=>state.assert({results:[result({apps:true,browsers:true,selected:false,errors:true})]}));
 const snapshot=scenarios.find(s=>s.id==='cells/facade/initial-tab-snapshot');
 assert.throws(()=>snapshot.assert({results:[result(true)]}),/snapshot/);
 assert.equal(snapshot.assert({results:[{isError:false,content:[{type:'text',text:'Counter fixture'},...result(true).content]}]}).ok,true);
});
