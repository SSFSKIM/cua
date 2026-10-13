import {expectError} from '../../support/assertions.mjs';
export default {
  id:"evaluate/mutation", milestone:"M1b", commands:["playwright_evaluate"],
  setup:{page:"/mutation.html",state:{}},
  cells:[
  {
    "label": "mutate",
    "code": "return await tab.playwright.evaluate(()=>{document.title='changed';return document.title;});"
  },
  {
    "label": "title",
    "code": "return await tab.title();"
  }
],
  assert:({results,service})=>({ok:service==='vendor'?expectError(results,'mutate',/read.only|not (?:allowed|supported)|blocked|Cannot|unsupported/i)&&results[1]?.ok&&results[1].value==='Browser parity fixture':results.every(r=>r.ok)&&results[0].value==='changed'&&results[1].value==='changed'}),
};
