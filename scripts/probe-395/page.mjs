// Disposable #395 fixture page. Never product code. One document and one input node for the whole run: conditions change
// the node's type, value and selection in place, and add or remove the filler group before it (the group keeps its #354
// id, large-before-editor). The page answers only booleans and counts; it never returns the field's text, so a secret or
// password value that is compared here cannot reach the harness's records. The harness binds the document whose title
// nonce its browser window's AX title shows (../probe-354-fences/fixture.mjs).
import {largePagePrefix} from '../probe-354-fences/large-page.mjs';
export const TARGET_ID='probe395-target',TARGET_CLASS='probe395-field',FILLER_ID='large-before-editor';
export function page(){return `<!doctype html><html><head><meta charset="utf-8"><title>probe395</title><style>body{margin:16px;font:14px sans-serif}#${TARGET_ID}{font:16px/24px monospace;box-sizing:border-box;width:500px;height:44px;padding:8px;border:1px solid}</style></head><body><h3>Marker probe</h3><div id="host"><input id="${TARGET_ID}" class="${TARGET_CLASS}" type="text" aria-label="Draft control" autocomplete="off" spellcheck="false"></div><script>
"use strict";
const TARGET=${JSON.stringify(TARGET_ID)},FILLER=${JSON.stringify(FILLER_ID)};
const largePagePrefix=${largePagePrefix.toString()};
const DOC=(self.crypto&&crypto.randomUUID)?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
const NAV=(performance.getEntriesByType&&performance.getEntriesByType('navigation')[0]||{}).type||null,NONCE=DOC.replace(/-/g,'').slice(0,12);
document.title='probe395 '+NONCE;
const host=document.querySelector('#host'),e=document.getElementById(TARGET);
let keydowns=0,inputs=0;
// Counts only: no key, data or value is ever recorded.
document.addEventListener('keydown',()=>{keydowns++},true);
document.addEventListener('input',()=>{inputs++},true);
function state(x){
 const f=document.getElementById(FILLER),r=e.getBoundingClientRect(),v=e.value;
 return {doc:DOC,at:Date.now(),
  exact:x?v===x.value:null,selectionOk:x?e.selectionStart===x.start&&e.selectionEnd===x.end:null,kindOk:x?e.type===x.type:null,
  focused:document.activeElement===e,sameNode:document.getElementById(TARGET)===e&&e.isConnected&&e.classList.contains(${JSON.stringify(TARGET_CLASS)}),
  keydowns,inputs,fillerNodes:f?f.childElementCount:0,domNodes:document.getElementsByTagName('*').length,
  fieldAfterFiller:f?f.nextElementSibling===e:null,fillerAboveField:f?f.getBoundingClientRect().bottom<=r.top+1:null,
  inViewport:r.top>=0&&r.left>=0&&r.bottom<=innerHeight&&r.right<=innerWidth};
}
// No keepalive: it caps a body at 64 KB.
const send=o=>fetch('/answer',{method:'POST',body:JSON.stringify(o)}).catch(()=>{});
async function run(c){
 if(c.op==='setup'){
  const old=document.getElementById(FILLER);
  if(c.nodes>0){
   if(!old||old.childElementCount!==c.nodes){if(old)old.remove();const t=document.createElement('template');t.innerHTML=largePagePrefix(c.nodes);host.insertBefore(t.content.firstElementChild,e)}
  }else if(old)old.remove();
  if(e.type!==c.type)e.type=c.type;
  e.value=c.seed;e.focus();e.setSelectionRange(c.start,c.end,'forward');
  if(c.nodes>0)e.scrollIntoView({block:'nearest'});
  keydowns=0;inputs=0;
  await send({n:c.n,op:c.op,...state(c.expected)});return;
 }
 // A script selection only: no focus call, so a background window is never activated by it.
 if(c.op==='select'){e.setSelectionRange(c.start,c.end,'forward');await send({n:c.n,op:c.op,...state(c.expected)});return}
 if(c.op==='read'){await send({n:c.n,op:c.op,...state(c.expected)});return}
 throw Error('unknown op');
}
async function loop(){for(;;){let c;try{const r=await fetch('/cmd?doc='+encodeURIComponent(DOC));c=await r.json()}catch{await new Promise(r=>setTimeout(r,100));continue}
 if(c.op==='idle')continue;
 if(c.op==='stale'){await new Promise(r=>setTimeout(r,1000));continue}
 if(c.doc!==DOC){send({op:'foreign-command',doc:DOC,n:c.n,at:Date.now()});continue}
 // A generic failure only: an error message could carry a compared value.
 try{await run(c)}catch{await send({n:c.n,doc:DOC,op:c.op,error:'page-op-failed',at:Date.now()})}}}
send({op:'ready',doc:DOC,nonce:NONCE,nav:NAV,href:location.href,visibility:document.visibilityState,at:Date.now()}).finally(loop);
</script></body></html>`}
