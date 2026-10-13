import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"input/dom", milestone:"M1c", commands:["dom_cua_click", "dom_cua_double_click", "dom_cua_keypress", "dom_cua_scroll", "dom_cua_type"],
  setup:{page:"/input.html",state:{}},
  cells:[
  {
    "label": "nodes",
    "code": "globalThis.domText=await tab.dom_cua.get_visible_dom();return domText.includes('Pointer input');"
  },
  {
    "label": "type",
    "code": "const m=domText.split(\"\\n\").find(line=>line.includes(\"Pointer input\"))?.match(/node_id[=\\\" :]+(\\d+)[^\\n]*Pointer input/);if(!m)throw new Error('fixture input node missing from visible DOM');await tab.dom_cua.click({node_id:m[1]});await tab.dom_cua.type({text:'dom'});return await tab.playwright.locator('#input').evaluate(e=>e.value);"
  },
  {
    "label": "end-key",
    "code": "await tab.dom_cua.keypress({keys:['HOME']});const before=await tab.playwright.locator('#input').evaluate(e=>e.selectionStart);await tab.dom_cua.keypress({keys:['END']});const after=await tab.playwright.locator('#input').evaluate(e=>e.selectionStart);return {before,after};"
  },
  {
    "label": "double",
    "code": "const text=await tab.dom_cua.get_visible_dom();const m=text.split(\"\\n\").find(line=>line.includes(\"Double target\"))?.match(/node_id[=\\\" :]+(\\d+)[^\\n]*Double target/);if(!m)throw new Error('fixture button node missing from visible DOM');await tab.dom_cua.double_click({node_id:m[1]});return true;"
  },
  {
    "label": "scroll",
    "code": "const before=await tab.playwright.evaluate('window.scrollY');await tab.dom_cua.scroll({x:0,y:400});const after=await tab.playwright.evaluate('window.scrollY');return {before,moved:after>before};"
  }
],
  assert:expectValues({nodes:true,type:'dom','end-key':{before:0,after:3},double:true,scroll:{before:0,moved:true}},s=>s.events.some(e=>e.text==='dom')&&s.events.some(e=>e.double)),
};
