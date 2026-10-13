import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"capabilities/viewport", milestone:"M2", commands:["browser_viewport_set", "browser_viewport_reset"],
  setup:{page:"/read.html",state:{}},
  cells:[
  {
    "label": "set",
    "code": "globalThis.viewport=await browser.capabilities.get('viewport');await viewport.set({width:640,height:480});try{return await tab.playwright.evaluate('({width:innerWidth,height:innerHeight})');}finally{await viewport.reset();}"
  },
  {
    "label": "reset",
    "code": "await viewport.reset();return true;"
  }
],
  assert:expectValues({set:{width:640,height:480},reset:true}),
};
