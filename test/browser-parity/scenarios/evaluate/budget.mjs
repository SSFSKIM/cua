import {expectError} from '../../support/assertions.mjs';
// The lifted budget: a caller's timeoutMs above 3 s raises evaluate's budget on cua's service (up to 120 s); the
// vendor caps it at 3 s.
export default {
  id:'evaluate/budget',milestone:'M1b',commands:['playwright_evaluate'],
  setup:{page:'/read.html',state:{}},
  cells:[
    {label:'wait',code:"return await tab.playwright.evaluate(async()=>{await new Promise(resolve=>setTimeout(resolve,4000));return 'waited';},undefined,{timeoutMs:6000});",timeoutMs:20000},
    {label:'usable',code:"return await tab.title();"},
  ],
  assert:({results,service})=>({ok:(service==='vendor'?expectError(results,'wait',/deadline|timed out|timeout/i):results[0]?.ok===true&&results[0].value==='waited')
    &&results[1]?.ok===true&&results[1].value==='Browser parity fixture'}),
};
