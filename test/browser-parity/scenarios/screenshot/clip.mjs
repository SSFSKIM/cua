import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"screenshot/clip", milestone:"M1c", commands:["tab_screenshot"],
  setup:{page:"/screenshot.html",state:{}},
  screenshotTolerance:4,
  cells:[
  {
    "label": "clip",
    "code": "return await tab.screenshot({clip:{x:0,y:0,width:320,height:240}});"
  }
],
  assert:expectValues({clip:v=>v?.type==='image'&&v.mimeType==='image/jpeg'&&typeof v.data==='string'&&v.data.length>100}),
};
