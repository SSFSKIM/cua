import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectValues,expectError} from './support/assertions.mjs';
test('result oracle rejects missing, failing, extra and wrong-valued cells and wrong side effects',()=>{
  const check=expectValues({read:'fixture'},s=>s.counter===1);
  const good={results:[{cell:'read',ok:true,value:'fixture'}],fixtureState:{counter:1}};
  assert.equal(check(good).ok,true);
  for(const results of [[],[{cell:'read',ok:false}],[...good.results,{cell:'extra',ok:true,value:1}],[{cell:'read',ok:true,value:'wrong'}]])assert.equal(check({...good,results}).ok,false);
  assert.equal(check({...good,fixtureState:{counter:0}}).ok,false);
});
test('error oracle pins code as well as the expected sentence and never accepts success',()=>{
  const row={cell:'failure',ok:false,error:{code:'Error',message:'strict mode violation'}};
  assert.equal(expectError([row],'failure',/strict mode/),true);
  assert.equal(expectError([{...row,error:{...row.error,code:'transport_failed'}}],'failure',/strict mode/),false);
  assert.equal(expectError([{...row,ok:true}],'failure',/strict mode/),false);
  assert.equal(expectError([row],'failure',/timeout/),false);
});
