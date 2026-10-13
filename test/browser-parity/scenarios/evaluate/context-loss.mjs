import {expectError} from '../../support/assertions.mjs';
export default {
  id:'evaluate/context-loss',milestone:'M1b',commands:['playwright_evaluate'],
  setup:{page:'/mutation.html',state:{}},
  cells:[
    {label:'reload',code:"return await tab.playwright.evaluate(async()=>{await fetch('/counter',{method:'POST'});location.reload();await new Promise(()=>{});},undefined,{timeoutMs:1000});"},
    {label:'usable',code:"return await tab.title();"},
  ],
  assert({results,fixtureState,service}) {
    return {ok:expectError(results,'reload',service==='vendor'?/read.only|not (?:allowed|supported)|blocked|fetch|unsupported/i:/interrupt|context|timeout|navigation/i,service==='vendor'?['Error']:['evaluate_interrupted'])&&fixtureState.counter===(service==='vendor'?0:1)&&results[1]?.ok&&results[1].value==='Browser parity fixture'};
  },
};
