// #395 qualification fixture page. Disposable experiment kit, never product code.
// One document for the whole run, with three inputs present in the markup from document load (parsed, not created later):
//   T  a plain text input (the normal field every plain and substituted-secret cell types into),
//   S  a plain setup input (focused while Safari is front, so the cover can take the front without any secure input active),
//   P  an input parsed as type=password. Its type is never written: a MutationObserver counts any later write to its type
//      attribute, and the page reports `typeMutations` (must stay 0) and `secureLoaded` (the type seen at parse time).
// A cell uses T alone (text cells) or S then P (the secure cell: S is focused in the foreground; under the verified cover
// the harness's `secure` op seeds P's value and gives focus to the already-password-typed P). Whichever input a cell
// targets carries the id the Swift tool looks up (`probe395-target`); the others take fallback ids. Filler (large page) is
// inserted before the first input. The page answers booleans and small counts only; it never returns a field's text.
import {largePagePrefix} from '../probe-354-fences/large-page.mjs';
export const TARGET_ID='probe395-target',TARGET_CLASS='probe395-field',FILLER_ID='large-before-editor';
export function page(){return `<!doctype html><html><head><meta charset="utf-8"><title>probe395q</title><style>body{margin:16px;font:14px sans-serif}#host input{display:block;font:16px/24px monospace;box-sizing:border-box;width:500px;height:44px;padding:8px;border:1px solid;margin:0 0 6px}#host input[hidden]{display:none}</style></head><body><h3>Qualification fixture</h3><div id="host"><input id="${TARGET_ID}" class="${TARGET_CLASS}" type="text" aria-label="Draft control" autocomplete="off" spellcheck="false"><input id="probe395q-setup" class="${TARGET_CLASS}" type="text" aria-label="Setup control" autocomplete="off" spellcheck="false" hidden><input id="probe395q-secure" class="${TARGET_CLASS}" type="password" aria-label="Secure control" autocomplete="off" hidden></div><script>
"use strict";
const TARGET=${JSON.stringify(TARGET_ID)},FILLER=${JSON.stringify(FILLER_ID)},CLS=${JSON.stringify(TARGET_CLASS)};
const largePagePrefix=${largePagePrefix.toString()};
const DOC=(self.crypto&&crypto.randomUUID)?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
const NAV=(performance.getEntriesByType&&performance.getEntriesByType('navigation')[0]||{}).type||null,NONCE=DOC.replace(/-/g,'').slice(0,12);
document.title='probe395q '+NONCE;
const host=document.querySelector('#host');
const T=document.getElementById(TARGET),S=document.getElementById('probe395q-setup'),P=document.getElementById('probe395q-secure');
const FALLBACK=new Map([[T,'probe395q-text'],[S,'probe395q-setup'],[P,'probe395q-secure']]);
// Read once, while the document is still loading: P was parsed as a password input, and nothing writes its type afterwards.
const secureLoaded=P.type==='password'&&P.getAttribute('type')==='password';
let typeMutations=0;new MutationObserver(r=>{typeMutations+=r.length}).observe(P,{attributes:true,attributeFilter:['type']});
let cur=T,keydowns=0,inputs=0;
document.addEventListener('keydown',()=>{keydowns++},true);
document.addEventListener('input',()=>{inputs++},true);
function aim(x){cur=x;for(const [el,id] of FALLBACK)el.id=el===x?TARGET:id}
function state(x){
 const f=document.getElementById(FILLER),r=cur.getBoundingClientRect(),v=cur.value;
 return {doc:DOC,at:Date.now(),
  exact:x?v===x.value:null,selectionOk:x?cur.selectionStart===x.start&&cur.selectionEnd===x.end:null,kindOk:x?cur.type===x.type:null,
  secureType:cur===P&&cur.type==='password',secureLoaded,typeMutations,visibleFields:[T,S,P].filter(e=>!e.hidden).length,
  focused:document.activeElement===cur,sameNode:document.getElementById(TARGET)===cur&&cur.isConnected&&cur.classList.contains(CLS),
  keydowns,inputs,fillerNodes:f?f.childElementCount:0,domNodes:document.getElementsByTagName('*').length,
  fillerAboveField:f?f.getBoundingClientRect().bottom<=r.top+1:null,
  inViewport:r.top>=0&&r.left>=0&&r.bottom<=innerHeight&&r.right<=innerWidth};
}
// Only the explicit literal-synthetic diagnostic asks for this. No DOM value, substring, index or absolute length leaves the page.
function mismatch(v,x){
 if(v===x)return null;
 const sizeDelta=v.length-x.length;
 const shape=sizeDelta<0?'shorter':sizeDelta>0?'longer':[...v].sort().join('')===[...x].sort().join('')?'reordered':'same-size-different';
 return {shape,sizeDelta};
}
const send=o=>fetch('/answer',{method:'POST',body:JSON.stringify(o)}).catch(()=>{});
async function run(c){
 if(c.op==='setup'){
  const old=document.getElementById(FILLER);
  if(c.nodes>0){
   if(!old||old.childElementCount!==c.nodes){if(old)old.remove();const t=document.createElement('template');t.innerHTML=largePagePrefix(c.nodes);host.insertBefore(t.content.firstElementChild,host.firstElementChild)}
  }else if(old)old.remove();
  const secure=c.mode==='secure';
  T.hidden=secure;S.hidden=!secure;P.hidden=!secure;
  T.value='';S.value='';P.value='';
  if(secure){aim(S);S.focus()}else{aim(T);T.value=c.seed;T.focus();T.setSelectionRange(c.start,c.end,'forward')}
  if(c.nodes>0)(secure?P:cur).scrollIntoView({block:'nearest'});
  keydowns=0;inputs=0;
  await send({n:c.n,op:c.op,...state(c.expected)});return;
 }
 // Secure cell only, with Safari in the background under the armed witness: the already-password-typed P takes its seed
 // and focus. Its type is not touched.
 if(c.op==='secure'){
  aim(P);P.value=c.seed;P.focus();P.setSelectionRange(c.start,c.end,'forward');
  await send({n:c.n,op:c.op,...state(c.expected)});return;
 }
 if(c.op==='read'){
  const diagnostic=c.diagnose===true&&cur===P?{mismatch:mismatch(P.value,c.expected.value)}:{};
  await send({n:c.n,op:c.op,...state(c.expected),...diagnostic});return;
 }
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
