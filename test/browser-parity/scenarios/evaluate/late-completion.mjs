import {expectError} from '../../support/assertions.mjs';
export default {
  id:'evaluate/late-completion',milestone:'M1b',commands:['playwright_evaluate'],
  setup:{page:'/mutation.html',state:{}},
  cells:[
    {label:'late',code:"return await tab.playwright.evaluate(async()=>{await fetch('/counter',{method:'POST'});await new Promise(resolve=>setTimeout(resolve,2000));return 'late';},undefined,{timeoutMs:500});"},
    {label:'usable',code:"return await tab.title();"},
  ],
  assert({results,fixtureState,service}) {
    return {ok:expectError(results,'late',service==='vendor'?/read.only|not (?:allowed|supported)|blocked|fetch|unsupported/i:/interrupt|timeout|timed out/i,['Error'])&&fixtureState.counter===(service==='vendor'?0:1)&&results[1]?.ok&&results[1].value==='Browser parity fixture'};
  },
};
