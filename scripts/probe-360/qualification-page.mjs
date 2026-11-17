// #360 whole-production-path qualification fixture. Same owner-v3 transport contract as #354's page (title nonce
// probe354:<pageId>, ownerEpoch/expiry guard, command poll, answer POST, delayed sample), but an owned page: the
// editors need long, independently scrollable text and every state carries scroll geometry.
//
// Commands: reset (build the editor and set its fixture), prepare (re-seed the same editor, same fixture), read, arm
// (read-only, only advances the trace cursor), sample (delayed read-only states). Only reset and prepare change the DOM.
import {SEED} from '../probe-354/page.mjs';
export {SEED};

// Pure fixture description, shared by the page and the scorer so expectations never come from the answers under test.
// Original keys keep the 29-character end seed. Navigation keys get 120 fixed-width lines (textarea, contenteditable,
// compose) with the caret on line 60 column 17 and the field scrolled so that line is the fifth visible row; the
// single-line input keeps one line (first 40 lines joined by spaces) with the caret interior and scrolled sideways.
export const FIXTURE_JS=`
const SEED=${JSON.stringify(SEED)},ORIGINAL=['Left','alt+Left','cmd+Left','cmd+shift+Left'],NAV=['Home','End','PageUp','PageDown'];
const ROW_HEIGHT=24,LONG_LINES=120,CARET_LINE=60,CARET_COL=17,INPUT_LINES=40,INPUT_CARET_LINE=20,CARET_ROW=4;
function hashText(t){let h=0x811c9dc5;for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}return h.toString(16).padStart(8,'0')}
function layout(editor,key){
 if(ORIGINAL.includes(key))return {kind:'seed',editor,key,lines:[SEED],text:SEED,caret:SEED.length,caretLine:0,scrollTop:0,rowHeight:ROW_HEIGHT,textLength:SEED.length,textHash:hashText(SEED)};
 if(!NAV.includes(key))throw Error('unknown fixture key '+key);
 const all=[];for(let i=1;i<=LONG_LINES;i++)all.push('L'+String(i).padStart(3,'0')+' qualification fixture line '+String(i*7919%1000).padStart(3,'0')+' end');
 const single=editor==='input',lines=single?all.slice(0,INPUT_LINES):all,line=(single?INPUT_CARET_LINE:CARET_LINE)-1;
 // textarea and the contenteditable span hold real newlines; compose's nested divs carry none in their text nodes.
 const sep=single?' ':editor==='compose'?'':'\\n',text=lines.join(sep);
 let caret=CARET_COL;for(let i=0;i<line;i++)caret+=lines[i].length+sep.length;
 return {kind:'long',editor,key,lines,text,caret,caretLine:line,scrollTop:single?0:ROW_HEIGHT*(line-CARET_ROW),rowHeight:ROW_HEIGHT,textLength:text.length,textHash:hashText(text)};
}`;
export const {layout,hashText}=new Function(FIXTURE_JS+';return {layout,hashText}')();

export function pageQualification(){return `<!doctype html><html><head><meta charset="utf-8"><title>probe354</title><style>body{margin:16px;font:14px sans-serif}#host{height:260px}#editor{display:block;margin:0;font:16px/24px monospace;white-space:pre-wrap;box-sizing:border-box;width:520px;height:234px;padding:8px;border:1px solid;overflow:auto;scroll-behavior:auto}input#editor{height:44px;white-space:pre}</style></head><body><h3>Typing delivery qualification</h3><div id="host"></div><script>
${FIXTURE_JS}
const identity={pageId:crypto.randomUUID().replaceAll('-',''),timeOrigin:performance.timeOrigin};document.title='probe354:'+identity.pageId;let e,id,editor,fx,record=null,trace=[],lastSent=0,latestEpoch=0;
const value=()=>e.value??e.textContent;
function sel(){try{
 if('selectionStart'in e)return {range:[e.selectionStart,e.selectionEnd-e.selectionStart],direction:e.selectionDirection||'none'};
 const s=getSelection();if(!s.rangeCount||!e.contains(s.anchorNode)||!e.contains(s.focusNode))return null;
 const at=(n,o)=>{const b=document.createRange();b.selectNodeContents(e);b.setEnd(n,o);return b.toString().length},a=at(s.anchorNode,s.anchorOffset),f=at(s.focusNode,s.focusOffset);
 return {range:[Math.min(a,f),Math.abs(a-f)],direction:a===f?'none':f<a?'backward':'forward'}}catch{return null}}
function select(start,len){e.focus();if(e.setSelectionRange)e.setSelectionRange(start,start+len);else{let w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),n,off=0,a,b;while(n=w.nextNode()){if(!a&&start<=off+n.length)a=[n,start-off];if(start+len<=off+n.length){b=[n,start+len-off];break}off+=n.length}if(!a||!b)throw Error('selection outside editor');const r=document.createRange();r.setStart(...a);r.setEnd(...b);getSelection().removeAllRanges();getSelection().addRange(r)}}
const metric=n=>({top:n.scrollTop,left:n.scrollLeft,height:n.scrollHeight,width:n.scrollWidth,clientHeight:n.clientHeight,clientWidth:n.clientWidth});
function scroll(){const ancestors=[];for(let n=e.parentElement;n;n=n.parentElement)ancestors.push({tag:n.tagName.toLowerCase(),id:n.id||null,...metric(n)});return {field:metric(e),ancestors,document:metric(document.scrollingElement||document.documentElement)}}
const state=(full=false)=>{const t=value(),s=sel();return {id,textLength:t.length,textHash:hashText(t),...(full?{text:t}:{}),selection:s?.range??null,direction:s?.direction??null,at:Date.now(),focused:document.activeElement===e,documentHasFocus:document.hasFocus(),visibility:document.visibilityState,scroll:scroll(),trace:trace.slice(lastSent)}};
const send=o=>fetch('/answer',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({...identity,href:location.href,...o})});
for(const event of ['keydown','keyup','beforeinput','input','selectionchange','focusin','scroll'])document.addEventListener(event,x=>{if(e){const s=sel();trace.push({event,seq:trace.length,target:x.target===e?'field':String(x.target?.nodeName??'?').toLowerCase(),key:x.key??null,inputType:x.inputType??null,meta:x.metaKey??false,alt:x.altKey??false,shift:x.shiftKey??false,textLength:value().length,textHash:hashText(value()),selection:s?.range??null,scrollTop:e.scrollTop,scrollLeft:e.scrollLeft,at:Date.now()})}},true);
function render(){const L=fx;if(editor==='textarea'||editor==='input')e.value=L.text;else if(editor==='compose')e.innerHTML=L.lines.map(l=>'<div>'+l+'</div>').join('');else e.innerHTML='<span>'+L.text+'</span>'}
function charWidth(){try{const c=document.createElement('canvas').getContext('2d');c.font='16px monospace';const w=c.measureText('0').width;if(w>0)return w}catch{}return 9.6}
// Deterministic text, caret and scroll for this editor and key. The scroll is set after the caret (focus may scroll) and
// read back, so an unreachable position is a recorded setup fact, never silently accepted.
function setup(ed,key){
 editor=ed;fx=layout(ed,key);render();trace=[];lastSent=0;select(fx.caret,0);
 const want={top:0,left:0};
 if(ed==='input'){if(fx.kind==='long'){const max=e.scrollWidth-e.clientWidth;want.left=Math.max(1,Math.min(max-1,Math.round(9+fx.caret*charWidth()-250)))}e.scrollLeft=want.left}
 else{want.top=fx.scrollTop;e.scrollTop=want.top}
 const d=document.scrollingElement||document.documentElement;d.scrollTop=0;d.scrollLeft=0;
 const got={top:e.scrollTop,left:e.scrollLeft},s=sel();
 record={editor:ed,key,kind:fx.kind,lines:fx.lines.length,caretLine:fx.caretLine,textLength:fx.textLength,textHash:fx.textHash,initial:{selection:s?.range??null,direction:s?.direction??null,scroll:scroll()},scrollSetup:{requested:want,achieved:got,reached:Math.abs(got.top-want.top)<=1&&Math.abs(got.left-want.left)<=1}};
}
async function run(c){
 if(!c.n||c.pageId!==identity.pageId||c.timeOrigin!==identity.timeOrigin||c.ownerEpoch<latestEpoch||Date.now()>c.expiresAt)return;
 latestEpoch=c.ownerEpoch;const reply=o=>send({...o,ownerEpoch:c.ownerEpoch});
 if(c.op==='reset'){
  id=c.id;trace=[];lastSent=0;let tag=c.editor==='input'?'input':c.editor==='textarea'?'textarea':'div';
  document.querySelector('#host').innerHTML=tag==='div'?'<div id="editor" contenteditable="true"'+(c.editor==='compose'?' role="textbox" aria-label="Message Body" aria-multiline="true"':' aria-label="Draft control"')+'></div>':'<'+tag+' id="editor" aria-label="Draft control"></'+tag+'>';
  e=document.querySelector('#editor');setup(c.editor,c.key);
  await reply({cmd:c.n,op:c.op,...state(true),fixture:record,rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.offsetWidth,height:e.offsetHeight}});return;
 }
 // Foreground fixture-only setup: no engine click whose deferred caret could overwrite this selection.
 if(c.op==='prepare'){
  if(c.editor!==editor)throw Error('prepare editor differs from reset editor');
  setup(c.editor,c.key);await reply({cmd:c.n,op:c.op,...state(true),fixture:record});return;
 }
 if(c.op==='sample'){
  const last=Math.max(...c.delays);
  for(const delay of c.delays){const f=()=>{if(c.ownerEpoch!==latestEpoch||Date.now()>c.expiresAt)return;const s=state(delay===last);const o={cmd:c.n,op:'sample',delay,returnedAt:c.returnedAt,actualDelayMs:s.at-c.returnedAt,...s};lastSent=trace.length;reply(o)};if(delay===0)f();else setTimeout(f,Math.max(0,c.returnedAt+delay-Date.now()))}return;
 }
 // Read and arm never touch the DOM; both only advance the trace cursor so the samples carry post-arm events alone.
 if(c.op==='read'||c.op==='arm'){const s=state(c.op==='read');lastSent=trace.length;await reply({cmd:c.n,op:c.op,...s});return}
}
(async()=>{await send({op:'ready',at:Date.now(),visibility:document.visibilityState});for(;;){try{const r=await fetch('/cmd?pageId='+identity.pageId+'&timeOrigin='+identity.timeOrigin,{cache:'no-store'});const c=await r.json();if(!c.n){await new Promise(r=>setTimeout(r,100));continue}try{await run(c)}catch(error){await send({cmd:c.n,id,op:c.op,ownerEpoch:c.ownerEpoch,error:String(error),at:Date.now()})}}catch{await new Promise(r=>setTimeout(r,100))}}})();
</script></body></html>`}
