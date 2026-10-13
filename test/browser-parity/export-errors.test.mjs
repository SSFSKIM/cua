import {test} from 'node:test';
import assert from 'node:assert/strict';
import scenario from './scenarios/capabilities/export-rejections.mjs';
const messages=['Tab is not a Google Workspace document','Tab is not a supported YouTube watch page'];
const results=code=>['gsuite','youtube'].map((cell,i)=>({cell,ok:false,error:{code,message:messages[i]}}));
test('export refusal oracle accepts the plain Error with each sentence, on both services, and nothing else',()=>{
  // Only a rejection's message crosses node_repl's RPC boundary: model code sees a plain Error from either service.
  for(const service of ['vendor','cua'])assert.equal(scenario.assert({results:results('Error'),service}).ok,true,service);
  for(const code of ['invalid_url','tab_not_found'])assert.equal(scenario.assert({results:results(code),service:'cua'}).ok,false,code);
  const wrong=results('Error');wrong[0].error.message='different rejection';assert.equal(scenario.assert({results:wrong,service:'cua'}).ok,false);
});
