// The cell reloads the page first, restarting its 8 s clock, so a slow case setup cannot make #late appear before
// the click (it did once on the mini: the vendor clicked it at 494 ms).
import {expectError} from '../../support/assertions.mjs';
export default {
  id:"actions/slow-budget", milestone:"M1c", commands:["playwright_locator_click"],
  setup:{page:"/slow.html",state:{}},
  cells:[
  {
    "label": "late",
    "code": "await tab.goto(fixtureURL+'/slow.html');const started=Date.now();await tab.playwright.locator('#late').click({timeoutMs:15000});const waited=Date.now()-started;await tab.playwright.locator('html[data-recorded-late=\"true\"]').waitFor({state:'attached',timeoutMs:3000});return waited>=5000;",
    "timeoutMs": 25000
  }
],
  assert:({results,fixtureState,service})=>({ok:service==='vendor'?expectError(results,'late',/timeout|timed out|waiting/i)&&!fixtureState.events.some(e=>e.late):results[0]?.ok&&results[0].value===true&&fixtureState.events.some(e=>e.late===true)}),
};
