import {expectValues} from '../../support/assertions.mjs';
// #168: Chrome drops a page's input, all but pointer moves, until the page's first contentful paint, and the dropped
// click still answers ok. So each cell first observes the page as a model would, with a screenshot (which also makes
// an agent's background tab render), then waits, bounded, for the page to say it has rendered a frame of its content
// (the fixture's html[data-rendered]). The type cell confirms its click focused the input before it types, and that the
// input still has the focus once the text is acknowledged; end-key takes the input's focus and text itself (fill), so it
// does not depend on what the type cell left. The page's state is read through the fixture's attributes and plain DOM
// reads only, which every evaluator serves (the vendor's read-only one too). A failure says what the page showed: whether
// it had rendered, whether the input had the focus and what had it, the input's value, the pointer's last recorded
// point, and the page's scroll.
const seen = "const seen=()=>tab.playwright.evaluate(()=>{const h=document.documentElement,a=document.activeElement,i=document.querySelector('#input'),p=document.querySelector('#pointer');return {rendered:h.getAttribute('data-rendered'),inputFocus:h.getAttribute('data-input-focus'),active:a?{tag:a.tagName.toLowerCase(),id:a.id||''}:null,value:i?i.value:null,pointer:p&&p.textContent?p.textContent.split(',').map(Number):null,scrollY:window.scrollY};});";
const inputFocus = "((await tab.playwright.locator('html').getAttribute('data-input-focus'))==='yes')";
const ready = seen + "await tab.screenshot();try{await tab.playwright.locator('html[data-rendered=\"yes\"]').waitFor({state:'attached',timeoutMs:5000});}catch{throw new Error('the page had not rendered a frame within 5000ms of a screenshot; seen '+JSON.stringify(await seen()));}";
export default {
  id:'input/coordinates',milestone:'M1c',commands:['cua_click','cua_double_click','cua_drag','cua_keypress','cua_scroll','cua_type'],
  setup:{page:'/input.html',state:{}},
  cells:[
    {label:'type',code:ready+`await tab.cua.click({x:80,y:40});if(!${inputFocus})throw new Error('the click did not focus the input; seen '+JSON.stringify(await seen()));await tab.cua.type({text:'pointer'});try{await tab.playwright.locator('html[data-recorded-text=\"pointer\"]').waitFor({state:'attached',timeoutMs:3000});}catch{throw new Error('the typed text was not acknowledged within 3000ms; seen '+JSON.stringify(await seen()));}if(!${inputFocus})throw new Error('the input lost the focus after typing; seen '+JSON.stringify(await seen()));return await tab.playwright.locator('#input').evaluate(e=>e.value);`},
    {label:'end-key',code:ready+`await tab.playwright.locator('#input').fill('pointer');if(!${inputFocus})throw new Error('the input did not take the focus for the keys; seen '+JSON.stringify(await seen()));await tab.cua.keypress({keys:['HOME']});const before=await tab.playwright.locator('#input').evaluate(e=>e.selectionStart);await tab.cua.keypress({keys:['END']});const after=await tab.playwright.locator('#input').evaluate(e=>e.selectionStart);return {before,after};`},
    {label:'double',code:ready+"await tab.cua.double_click({x:80,y:110});await tab.playwright.locator('html[data-recorded-double=\"true\"]').waitFor({state:'attached',timeoutMs:3000});return true;"},
    {label:'drag',code:ready+"await tab.cua.drag({path:[{x:60,y:180},{x:100,y:180},{x:160,y:180}]});await tab.playwright.locator('html[data-recorded-dragend=\"true\"]').waitFor({state:'attached',timeoutMs:3000});return await tab.playwright.locator('#drag-status').textContent();"},
    {label:'scroll',code:ready+"const before=await tab.playwright.evaluate('window.scrollY');await tab.cua.scroll({x:280,y:200,scrollY:400,scrollX:0});const after=await tab.playwright.evaluate('window.scrollY');return {before,moved:after>before};"},
  ],
  assert:expectValues({type:'pointer','end-key':{before:0,after:7},double:true,drag:'ended',scroll:{before:0,moved:true}},s=>s.events.some(e=>e.text==='pointer')&&s.events.some(e=>e.double)&&s.events.some(e=>e.dragStart&&e.x===60&&e.y===180)&&s.events.some(e=>e.dragEnd&&e.x===160&&e.y===180)),
};
