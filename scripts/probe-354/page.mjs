export const SEED='Old draft sentence goes here.', CLIP='Clipboard known text. ';
export function page(){return `<!doctype html><html><head><meta charset="utf-8"><title>probe354</title><style>body{margin:16px;font:14px sans-serif}#editor{font:16px/24px monospace;white-space:pre-wrap;box-sizing:border-box;width:500px;height:300px;padding:8px;border:1px solid}input#editor{height:44px}</style></head><body><h3>Typing delivery probe</h3><div id="host"></div><script>
const SEED=${JSON.stringify(SEED)},identity={pageId:crypto.randomUUID().replaceAll('-',''),timeOrigin:performance.timeOrigin};document.title='probe354:'+identity.pageId;let e,id,trace=[],lastSent=0,latestEpoch=0;
const value=()=>e.value??e.textContent;
function selection(){if('selectionStart'in e)return [e.selectionStart,e.selectionEnd-e.selectionStart];const s=getSelection();if(!s.rangeCount)return null;let r=s.getRangeAt(0),b=document.createRange();b.selectNodeContents(e);try{b.setEnd(r.startContainer,r.startOffset);return [b.toString().length,r.toString().length]}catch{return null}}
function select(start,len){e.focus();if(e.setSelectionRange)e.setSelectionRange(start,start+len);else{let w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),n,off=0,a,b;while(n=w.nextNode()){if(!a&&start<=off+n.length)a=[n,start-off];if(start+len<=off+n.length){b=[n,start+len-off];break}off+=n.length}if(!a||!b)throw Error('selection outside editor');const r=document.createRange();r.setStart(...a);r.setEnd(...b);getSelection().removeAllRanges();getSelection().addRange(r)}}
const state=()=>({id,text:value(),selection:selection(),at:Date.now(),focused:document.activeElement===e,documentHasFocus:document.hasFocus(),visibility:document.visibilityState,trace:trace.slice(lastSent)});
const send=o=>fetch('/answer',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({...identity,href:location.href,...o})});
for(const event of ['keydown','keyup','beforeinput','input','selectionchange','focusin'])document.addEventListener(event,x=>{if(e)trace.push({event,seq:trace.length,key:x.key??null,data:x.data??null,inputType:x.inputType??null,meta:x.metaKey??false,alt:x.altKey??false,shift:x.shiftKey??false,text:value(),selection:selection(),at:Date.now()})},true);
function seed(editor){if('value'in e)e.value=SEED;else if(editor==='compose')e.innerHTML='<div>'+SEED+'</div>';else e.innerHTML='<span>'+SEED+'</span>'}
async function run(c){
 if(!c.n||c.pageId!==identity.pageId||c.timeOrigin!==identity.timeOrigin||c.ownerEpoch<latestEpoch||Date.now()>c.expiresAt)return;
 latestEpoch=c.ownerEpoch;const reply=o=>send({...o,ownerEpoch:c.ownerEpoch});
 if(c.op==='reset'){
  id=c.id;trace=[];lastSent=0;let tag=c.editor==='input'?'input':c.editor==='textarea'?'textarea':'div';
  document.querySelector('#host').innerHTML=tag==='div'?'<div id="editor" contenteditable="true"'+(c.editor==='compose'?' role="textbox" aria-label="Message Body" aria-multiline="true"':' aria-label="Draft control"')+'></div>':'<'+tag+' id="editor" aria-label="Draft control"></'+tag+'>';
  e=document.querySelector('#editor');seed(c.editor);select(3,0);
  await reply({cmd:c.n,op:c.op,...state(),rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.offsetWidth,height:e.offsetHeight}});return;
 }
 // Foreground fixture-only setup: no engine click whose deferred caret could overwrite this selection.
 if(c.op==='prepare'){
  seed(c.editor);trace=[];lastSent=0;let pos=3,len=0;
  if(['cmd+Left','alt+Left','cmd+shift+Left','Left','cmd+z'].includes(c.key))pos=SEED.length;
  if(c.key==='cmd+x'||c.scene==='already-selected'){pos=0;len=SEED.length}if(c.key==='cmd+v')pos=0;select(pos,len);
  if(c.key==='cmd+z'&&!document.execCommand('insertText',false,' undo'))throw Error('undo setup insertText refused');
  await reply({cmd:c.n,op:c.op,...state()});return;
 }
 if(c.op==='sample'){
  for(const delay of c.delays){const f=()=>{if(c.ownerEpoch!==latestEpoch||Date.now()>c.expiresAt)return;const s=state();const o={cmd:c.n,op:'sample',delay,returnedAt:c.returnedAt,actualDelayMs:s.at-c.returnedAt,...s};lastSent=trace.length;reply(o)};if(delay===0)f();else setTimeout(f,Math.max(0,c.returnedAt+delay-Date.now()))}return;
 }
 if(c.op==='select-all'){
  const scriptRequestedAt=Date.now();trace.push({event:'script-selection-request',source:'fixture',seq:trace.length,at:scriptRequestedAt,text:value(),selection:selection(),requestedRange:[0,value().length]});
  select(0,value().length);const s=state();lastSent=trace.length;
  await reply({cmd:c.n,op:c.op,scriptRequestedAt,scriptCompletedAt:Date.now(),...s});return;
 }
 if(c.op==='read'){const s=state();lastSent=trace.length;await reply({cmd:c.n,op:c.op,...s});return}
}
(async()=>{await send({op:'ready',at:Date.now(),visibility:document.visibilityState});for(;;){try{const r=await fetch('/cmd?pageId='+identity.pageId+'&timeOrigin='+identity.timeOrigin,{cache:'no-store'});const c=await r.json();if(!c.n){await new Promise(r=>setTimeout(r,100));continue}try{await run(c)}catch(error){await send({cmd:c.n,id,op:c.op,ownerEpoch:c.ownerEpoch,error:String(error),at:Date.now()})}}catch{await new Promise(r=>setTimeout(r,100))}}})();
</script></body></html>`}
// DOM (or native AX) key-only calibration is the effect oracle, not a portable key/undo implementation.
// AX strings can include editor-specific newlines; browser replacement uses DOM offsets and text only.
export function expectation(calibrated,text){
 const {text:value,selection:range}=calibrated??{};
 if(typeof value!=='string'||!Array.isArray(range)||range.length!==2||range.some(n=>!Number.isInteger(n)||n<0)||range[0]+range[1]>value.length)throw Error('unreadable calibrated replacement range');
 return {value,range:[...range],final:value.slice(0,range[0])+text+value.slice(range[0]+range[1])};
}
