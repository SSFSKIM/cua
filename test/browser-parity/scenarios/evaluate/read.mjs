import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"evaluate/read", milestone:"M1b", commands:["playwright_evaluate"],
  setup:{page:"/read.html",state:{}},
  cells:[
  {
    "label": "page",
    "code": "return await tab.playwright.evaluate('({title:document.title,count:document.querySelectorAll(\".item\").length})');"
  },
  {
    "label": "node",
    "code": "return await tab.playwright.locator('.item').first().evaluate(e=>e.textContent);"
  },
  {
    "label": "all",
    "code": "return await tab.playwright.locator('.item').evaluateAll(es=>es.map(e=>e.textContent));"
  }
],
  assert:expectValues({page:{title:'Browser parity fixture',count:2},node:'Alpha',all:['Alpha','Beta']}),
};
