import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"input/coordinates", milestone:"M1c", commands:["cua_click", "cua_double_click", "cua_drag", "cua_keypress", "cua_scroll", "cua_type"],
  setup:{page:"/input.html",state:{}},
  cells:[
  {
    "label": "type",
    "code": "await tab.cua.click({x:80,y:40});await tab.cua.type({text:'pointer'});await tab.cua.keypress({keys:['END']});return await tab.playwright.locator('#input').evaluate(e=>e.value);"
  },
  {
    "label": "double",
    "code": "await tab.cua.double_click({x:80,y:110});return true;"
  },
  {
    "label": "drag",
    "code": "await tab.cua.drag({path:[{x:60,y:180},{x:100,y:180},{x:160,y:180}]});return true;"
  },
  {
    "label": "scroll",
    "code": "await tab.cua.scroll({x:280,y:200,scrollY:400,scrollX:0});return true;"
  }
],
  assert:expectValues({type:'pointer',double:true,drag:true,scroll:true},s=>s.events.some(e=>e.text==='pointer')&&s.events.some(e=>e.double)&&s.events.some(e=>e.dragStart)),
};
