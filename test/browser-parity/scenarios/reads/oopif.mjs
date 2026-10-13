import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"reads/oopif", milestone:"M1b", commands:["playwright_locator_text_content"],
  setup:{page:"/oopif.html",state:{}},
  cells:[
  {
    "label": "frame",
    "code": "return await tab.playwright.frameLocator('#outer').locator('#frame-button').textContent();"
  }
],
  assert:expectValues({frame:'Frame button'}),
};
