import {expectValues} from '../../support/assertions.mjs';
export default {
  id:'input/coordinates',milestone:'M1c',commands:['cua_click','cua_double_click','cua_drag','cua_keypress','cua_scroll','cua_type'],
  setup:{page:'/input.html',state:{}},
  cells:[
    {label:'type',code:"await tab.cua.click({x:80,y:40});await tab.cua.type({text:'pointer'});await tab.playwright.locator('html[data-recorded-text=\"pointer\"]').waitFor({state:'attached',timeoutMs:3000});return await tab.playwright.locator('#input').evaluate(e=>e.value);"},
    {label:'end-key',code:"await tab.cua.keypress({keys:['HOME']});const before=await tab.playwright.locator('#input').evaluate(e=>e.selectionStart);await tab.cua.keypress({keys:['END']});const after=await tab.playwright.locator('#input').evaluate(e=>e.selectionStart);return {before,after};"},
    {label:'double',code:"await tab.cua.double_click({x:80,y:110});await tab.playwright.locator('html[data-recorded-double=\"true\"]').waitFor({state:'attached',timeoutMs:3000});return true;"},
    {label:'drag',code:"await tab.cua.drag({path:[{x:60,y:180},{x:100,y:180},{x:160,y:180}]});await tab.playwright.getByText('ended',{exact:true}).waitFor({state:'visible',timeoutMs:1500});return await tab.playwright.locator('#drag-status').textContent();"},
    {label:'scroll',code:"const before=await tab.playwright.evaluate('window.scrollY');await tab.cua.scroll({x:280,y:200,scrollY:400,scrollX:0});const after=await tab.playwright.evaluate('window.scrollY');return {before,moved:after>before};"},
  ],
  assert:expectValues({type:'pointer','end-key':{before:0,after:7},double:true,drag:'ended',scroll:{before:0,moved:true}},s=>s.events.some(e=>e.text==='pointer')&&s.events.some(e=>e.double)&&s.events.some(e=>e.dragStart&&e.x===60&&e.y===180)&&s.events.some(e=>e.dragEnd&&e.x===160&&e.y===180)),
};
