import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"downloads/media", milestone:"M1c", commands:["playwright_locator_download_media"],
  setup:{page:"/media.html",state:{}},
  cells:[
  {
    "label": "media",
    "code": "const path=await tab.playwright.locator('#image').downloadMedia({timeoutMs:10000});return typeof path==='string'&&path.length>0;",
    "timeoutMs": 20000
  }
],
  assert:expectValues({media:true}),
};
