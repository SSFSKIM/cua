import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"waits/page", milestone:"M1c", commands:["playwright_wait_for_url", "playwright_wait_for_load_state", "playwright_wait_for_timeout"],
  setup:{page:"/counter.html",state:{}},
  cells:[
  {
    "label": "url",
    "code": "await tab.playwright.waitForURL(fixtureURL+'/counter.html',{timeoutMs:1000});return true;"
  },
  {
    "label": "load",
    "code": "await tab.playwright.waitForLoadState({state:'domcontentloaded',timeoutMs:1000});return true;"
  },
  {
    "label": "delay",
    "code": "await tab.playwright.waitForTimeout(10);return true;"
  }
],
  assert:expectValues({url:true,load:true,delay:true}),
};
