import {expectError} from '../../support/assertions.mjs';
export default {
  id:'evaluate/counter',milestone:'M1b',commands:['playwright_evaluate'],
  setup:{page:'/mutation.html',state:{}},
  cells:[
    {label:'submit',code:"return await tab.playwright.evaluate(async()=>{const r=await fetch('/counter',{method:'POST'});return (await r.json()).counter;});"},
    {label:'usable',code:"return await tab.title();"},
  ],
  assert({results,fixtureState,service}) {
    const submitted=service==='vendor'?expectError(results,'submit',/read.only|not (?:allowed|supported)|blocked|fetch|unsupported/i):results[0]?.ok&&results[0].value===1;
    return {ok:submitted&&fixtureState.counter===(service==='vendor'?0:1)&&results[1]?.ok&&results[1].value==='Browser parity fixture'};
  },
};
