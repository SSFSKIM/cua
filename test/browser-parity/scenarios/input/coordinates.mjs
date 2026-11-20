import {expectValues} from '../../support/assertions.mjs';
// #168: Chrome drops a page's input, all but pointer moves, until the page's first contentful paint, and the dropped
// click still answers ok. So each cell first waits, bounded, for the page to say it has painted (the fixture's
// html[data-first-contentful-paint]), and starts from the page state it needs rather than the one the cell before it
// left (scrolled to the top; for the keys, the input focused and holding 'pointer'). The type cell confirms its click
// focused the input before it types. Every failure says what the page showed: whether it had painted, what had the
// focus, the input's value, the pointer's last recorded point, and what is at the click's point.
const seen = "const seen=()=>tab.playwright.evaluate(()=>{const a=document.activeElement,i=document.querySelector('#input'),hit=document.elementFromPoint(80,40);return {painted:performance.getEntriesByName('first-contentful-paint').length>0,focused:a!=null&&a===i,active:a?{tag:a.tagName.toLowerCase(),id:a.id||''}:null,value:i?i.value:null,pointer:document.querySelector('#pointer')?.textContent?.split(',').map(Number)??null,hit:hit?{tag:hit.tagName.toLowerCase(),id:hit.id||''}:null,scrollY:window.scrollY};});";
const painted = "try{await tab.playwright.locator('html[data-first-contentful-paint=\"yes\"]').waitFor({state:'attached',timeoutMs:5000});}catch{throw new Error('the page reported no first contentful paint within 5000ms; seen '+JSON.stringify(await seen()));}";
const ready = seen + painted + "await tab.playwright.evaluate(()=>window.scrollTo(0,0));";
export default {
  id:'input/coordinates',milestone:'M1c',commands:['cua_click','cua_double_click','cua_drag','cua_keypress','cua_scroll','cua_type'],
  setup:{page:'/input.html',state:{}},
  cells:[
    {label:'type',code:ready+"await tab.cua.click({x:80,y:40});{const s=await seen();if(!s.focused)throw new Error('the click did not focus the input; seen '+JSON.stringify(s));}await tab.cua.type({text:'pointer'});try{await tab.playwright.locator('html[data-recorded-text=\"pointer\"]').waitFor({state:'attached',timeoutMs:3000});}catch{throw new Error('the typed text was not acknowledged within 3000ms; seen '+JSON.stringify(await seen()));}return await tab.playwright.locator('#input').evaluate(e=>e.value);"},
    {label:'end-key',code:ready+"await tab.playwright.locator('#input').evaluate(e=>{e.focus();e.value='pointer';});await tab.cua.keypress({keys:['HOME']});const before=await tab.playwright.locator('#input').evaluate(e=>e.selectionStart);await tab.cua.keypress({keys:['END']});const after=await tab.playwright.locator('#input').evaluate(e=>e.selectionStart);return {before,after};"},
    {label:'double',code:ready+"await tab.cua.double_click({x:80,y:110});await tab.playwright.locator('html[data-recorded-double=\"true\"]').waitFor({state:'attached',timeoutMs:3000});return true;"},
    {label:'drag',code:ready+"await tab.cua.drag({path:[{x:60,y:180},{x:100,y:180},{x:160,y:180}]});await tab.playwright.locator('html[data-recorded-dragend=\"true\"]').waitFor({state:'attached',timeoutMs:3000});return await tab.playwright.locator('#drag-status').textContent();"},
    {label:'scroll',code:ready+"const before=await tab.playwright.evaluate('window.scrollY');await tab.cua.scroll({x:280,y:200,scrollY:400,scrollX:0});const after=await tab.playwright.evaluate('window.scrollY');return {before,moved:after>before};"},
  ],
  assert:expectValues({type:'pointer','end-key':{before:0,after:7},double:true,drag:'ended',scroll:{before:0,moved:true}},s=>s.events.some(e=>e.text==='pointer')&&s.events.some(e=>e.double)&&s.events.some(e=>e.dragStart&&e.x===60&&e.y===180)&&s.events.some(e=>e.dragEnd&&e.x===160&&e.y===180)),
};
