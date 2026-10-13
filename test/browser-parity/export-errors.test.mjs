import {test} from 'node:test';
import assert from 'node:assert/strict';
import scenario from './scenarios/capabilities/export-rejections.mjs';
const messages=['Tab is not a Google Workspace document','Tab is not a supported YouTube watch page'];
const results=code=>['gsuite','youtube'].map((cell,i)=>({cell,ok:false,error:{code,message:messages[i]}}));
test('export refusal oracle accepts vendor errors and kept cua URL codes, not arbitrary errors',()=>{
  assert.equal(scenario.assert({results:results('Error'),service:'vendor'}).ok,true);
  for(const code of ['invalid_url','unsupported_protocol'])assert.equal(scenario.assert({results:results(code),service:'cua'}).ok,true);
  assert.equal(scenario.assert({results:results('tab_not_found'),service:'cua'}).ok,false);
  const wrong=results('invalid_url');wrong[0].error.message='different rejection';assert.equal(scenario.assert({results:wrong,service:'cua'}).ok,false);
});
