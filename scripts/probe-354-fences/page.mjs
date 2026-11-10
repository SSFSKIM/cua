// Disposable #354 fence-spike fixture page. Never product code. Every command carries the document id the harness
// bound, and the harness binds only the document its browser window visibly shows: a hidden, reloaded or second
// document cannot take a command. No secrets: the password editor holds fixture text, and the
// page still never reports its value or typed characters (length and a match against the harness's expectation only).
export const SEED='Old draft sentence goes here.';
export const EDITORS=['textarea','input','contenteditable','compose','canvas','password'];
export function page(){return `<!doctype html><html><head><meta charset="utf-8"><title>probe354 fences</title><style>body{margin:16px;font:14px sans-serif}#editor{font:16px/24px monospace;white-space:pre-wrap;box-sizing:border-box;width:500px;height:300px;padding:8px;border:1px solid}input#editor{height:44px}canvas#editor{height:120px;padding:0}</style></head><body><h3>Typing fence probe</h3><div id="host"></div><script>
"use strict";
const SEED=${JSON.stringify(SEED)},TEXT_EVENTS=60;
const DOC=(self.crypto&&crypto.randomUUID)?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
const NAV=(performance.getEntriesByType&&performance.getEntriesByType('navigation')[0]||{}).type||null,NONCE=DOC.replace(/-/g,'').slice(0,12);
// The visible owner: the harness binds only the document whose nonce its browser window's AX title shows.
document.title='probe354f '+NONCE;
let e=null,editor=null,cell=null,trace=[],lastSent=0,model='',caret=0,seedValue=SEED,privateFixture=false,renderedFixture=false,dropInput=false;
const secure=()=>editor==='password'||privateFixture;
const value=()=>editor==='canvas'?model:e?(e.value??(renderedFixture?e.innerText:e.textContent)):null;
function selection(){if(!e)return null;if(editor==='canvas')return [caret,0];if('selectionStart'in e&&e.selectionStart!==null)return [e.selectionStart,e.selectionEnd-e.selectionStart];const s=getSelection();if(!s.rangeCount)return null;let r=s.getRangeAt(0),b=document.createRange();b.selectNodeContents(e);try{b.setEnd(r.startContainer,r.startOffset);return [b.toString().length,r.toString().length]}catch{return null}}
function select(start,len){e.focus();if(editor==='canvas'){caret=start;return}if(e.setSelectionRange)e.setSelectionRange(start,start+len);else{let w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),n,off=0,a,b;while(n=w.nextNode()){if(!a&&start<=off+n.length)a=[n,start-off];if(start+len<=off+n.length){b=[n,start+len-off];break}off+=n.length}if(!a||!b)throw Error('selection outside editor');const r=document.createRange();r.setStart(...a);r.setEnd(...b);getSelection().removeAllRanges();getSelection().addRange(r)}}
function draw(){const c=e.getContext('2d');c.clearRect(0,0,e.width,e.height);c.font='16px monospace';c.fillText(model,8,40)}
function seed(){if(editor==='canvas'){model=seedValue;draw()}else if('value'in e)e.value=seedValue;else{e.replaceChildren();const child=document.createElement(editor==='compose'?'div':'span');child.textContent=seedValue;e.appendChild(child)}}
// A secure editor's state never carries its value; with an expectation it carries only whether the value matches.
function state(expected){const v=value(),o={doc:DOC,cell,editor,selection:selection(),length:v==null?null:v.length,at:Date.now(),focused:!!e&&document.activeElement===e};if(secure()){o.text=null;o.secure=true;if(typeof expected==='string')o.matchesExpected=v===expected}else{o.text=v;if(renderedFixture){o.domText=e.textContent;o.html=e.innerHTML}}return o}
// No keepalive: it caps a body at 64 KB, and a long sample's trace is larger.
const send=o=>fetch('/answer',{method:'POST',body:JSON.stringify(o)}).catch(()=>{});
function take(){const t=trace.slice(lastSent);lastSent=trace.length;return t}
const isMarker=x=>x.code==='F20'||x.key==='F20'||x.keyCode===131;
for(const event of ['keydown','keyup','beforeinput','input','selectionchange','select','focusin','focusout'])document.addEventListener(event,x=>{
 if(!e)return;const v=value(),hide=secure()&&typeof x.key==='string'&&x.key.length===1;
 const t={event,seq:trace.length,key:hide?null:(x.key??null),code:secure()?null:(x.code??null),data:secure()?null:(x.data??null),inputType:x.inputType??null,meta:!!x.metaKey,alt:!!x.altKey,shift:!!x.shiftKey,selection:selection(),len:v==null?null:v.length,at:Date.now()};
 if(!secure()&&trace.length<TEXT_EVENTS)t.text=v;trace.push(t);
 // The marker's acknowledgement is cooperative page instrumentation, sent the moment the page sees the key.
 if((event==='keydown'||event==='keyup')&&isMarker(x))send({kind:'marker',phase:event,doc:DOC,cell,at:t.at,seq:t.seq,meta:t.meta,selection:t.selection,len:t.len,text:secure()?null:v});
},true);
document.addEventListener('input',()=>{if(dropInput&&editor==='input'){seed();select(3,0)}},true);
 document.addEventListener('keydown',x=>{if(editor!=='canvas'||document.activeElement!==e||x.metaKey||x.ctrlKey)return;if(typeof x.key==='string'&&x.key.length===1){model=model.slice(0,caret)+x.key+model.slice(caret);caret++;draw();x.preventDefault()}else if(x.key==='Backspace'&&caret>0){model=model.slice(0,caret-1)+model.slice(caret);caret--;draw();x.preventDefault()}});
async function run(c){
 if(c.op==='reset'){
  cell=c.cell;editor=c.editor;seedValue=typeof c.seed==='string'?c.seed:SEED;privateFixture=!!c.privateField;renderedFixture=!!c.renderedText;dropInput=!!c.dropInput;trace=[];lastSent=0;const host=document.querySelector('#host');
  if(editor==='canvas')host.innerHTML='<canvas id="editor" tabindex="0" width="500" height="120" aria-label="Canvas draft"></canvas>';
  else if(editor==='password')host.innerHTML='<input id="editor" type="password" autocomplete="off" aria-label="Fixture secret control">';
  else if(editor==='input'||editor==='textarea')host.innerHTML='<'+editor+' id="editor" aria-label="Draft control"></'+editor+'>';
  else host.innerHTML='<div id="editor" contenteditable="true"'+(editor==='compose'?' role="textbox" aria-label="Message Body" aria-multiline="true"':' aria-label="Draft control"')+'></div>';
  e=document.querySelector('#editor');seed();select(3,0);const r=e.getBoundingClientRect();
  await send({n:c.n,op:c.op,...state(c.expected),rect:{x:r.x,y:r.y,width:r.width,height:r.height},trace:take()});return;
 }
 if(c.op==='prepare'){
  if(c.cell!==cell||c.editor!==editor)throw Error('prepare for a cell this document was not reset for');
  seed();trace=[];lastSent=0;const [p,l]=c.selection;select(p,l);
  // Foreground, fixture-only undo preparation, as in the primary spike. Never an engine click or typed-text retry.
  if(c.key==='cmd+z'&&!document.execCommand('insertText',false,' undo'))throw Error('undo setup insertText refused');
  await send({n:c.n,op:c.op,...state(c.expected),trace:take()});return;
 }
 if(c.op==='read'){await send({n:c.n,op:c.op,...state(c.expected),trace:take()});return}
 if(c.op==='sample'){
  for(const delay of c.delays){const f=()=>{const s=state(c.expected);send({n:c.n,op:'sample',delay,returnedAt:c.returnedAt,actualDelayMs:s.at-c.returnedAt,...s,trace:take()})};if(delay===0)f();else setTimeout(f,Math.max(0,c.returnedAt+delay-Date.now()))}
  return;
 }
 throw Error('unknown op '+c.op);
}
async function loop(){for(;;){let c;try{const r=await fetch('/cmd?doc='+encodeURIComponent(DOC));c=await r.json()}catch{await new Promise(r=>setTimeout(r,100));continue}
 if(c.op==='idle')continue;
 if(c.op==='stale'){await new Promise(r=>setTimeout(r,1000));continue}
 if(c.doc!==DOC){send({op:'foreign-command',doc:DOC,commandDoc:c.doc,n:c.n,at:Date.now()});continue}
 try{await run(c)}catch(error){await send({n:c.n,doc:DOC,cell,op:c.op,error:String(error),at:Date.now()})}}}
send({op:'ready',doc:DOC,nonce:NONCE,nav:NAV,href:location.href,visibility:document.visibilityState,at:Date.now()}).finally(loop);
</script></body></html>`}
