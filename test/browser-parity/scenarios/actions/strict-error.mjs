import {expectError} from '../../support/assertions.mjs';
export default {
  id:"actions/strict-error", milestone:"M1c", commands:["playwright_locator_click"],
  setup:{page:"/strict.html",state:{}},
  cells:[
  {
    "label": "strict",
    "code": "await tab.playwright.locator('.duplicate').click({timeoutMs:500});return 'unexpected success';"
  },
  {
    "label": "usable",
    "code": "return await tab.playwright.locator('.duplicate').count();"
  }
],
  assert:({results,service})=>({ok:expectError(results,'strict',/strict|resolved to 2/i,['Error'])&&results[1]?.ok&&results[1].value===2}),
};
