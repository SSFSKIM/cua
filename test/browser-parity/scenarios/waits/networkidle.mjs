import {expectValues} from '../../support/assertions.mjs';
// waitForLoadState('networkidle') after a navigation whose page holds a slow resource (1.2 s).
export default {
  id:'waits/networkidle',milestone:'M1c',commands:['playwright_wait_for_load_state'],
  setup:{page:'/waits.html',state:{}},
  cells:[
    {label:'idle',code:"const navigating=Promise.resolve(tab.goto(fixtureURL+'/loading.html'));navigating.catch(()=>{});await navigating;await tab.playwright.waitForLoadState({state:'networkidle',timeoutMs:3000});return await tab.playwright.evaluate('[document.readyState, document.querySelector(\"img\").complete]');"},
  ],
  assert:expectValues({idle:['complete',true]}),
};
