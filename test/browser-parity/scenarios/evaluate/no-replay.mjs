import {expectError} from '../../support/assertions.mjs';
export default {
  id:"evaluate/no-replay", milestone:"M1b", commands:["playwright_evaluate"],
  setup:{page:"/mutation.html",state:{}},
  cells:[
  {
    "label": "submit-navigate",
    "code": "return await tab.playwright.evaluate(async()=>{await fetch('/counter',{method:'POST'});location.replace('/counter.html?navigated=1');await new Promise(()=>{});},undefined,{timeoutMs:1000});"
  },
  {
    "label": "usable",
    "code": "return typeof await tab.title()==='string';"
  }
],
  assert:({results,fixtureState,service})=>({ok:expectError(results,'submit-navigate',service==='vendor'?/read.only|not (?:allowed|supported)|blocked|fetch|unsupported/i:/interrupt|context|timeout|navigation/i,service==='vendor'?['Error']:['evaluate_interrupted'])&&fixtureState.counter===(service==='vendor'?0:1)&&results[1]?.ok&&results[1].value===true}),
};
