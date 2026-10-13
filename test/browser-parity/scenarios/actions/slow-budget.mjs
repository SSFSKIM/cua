import {expectError} from '../../support/assertions.mjs';
export default {
  id:"actions/slow-budget", milestone:"M1c", commands:["playwright_locator_click"],
  setup:{page:"/slow.html",state:{}},
  cells:[
  {
    "label": "late",
    "code": "await tab.playwright.locator('#late').click({timeoutMs:15000});await tab.playwright.locator('html[data-recorded-late=\"true\"]').waitFor({state:'attached',timeoutMs:3000});return true;",
    "timeoutMs": 25000
  }
],
  assert:({results,fixtureState,service})=>({ok:service==='vendor'?expectError(results,'late',/timeout|timed out|waiting/i)&&!fixtureState.events.some(e=>e.late):results[0]?.ok&&results[0].value===true&&fixtureState.events.some(e=>e.late===true)}),
};
