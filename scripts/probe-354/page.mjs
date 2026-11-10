export const SEED='Old draft sentence goes here.', CLIP='Clipboard known text. ';
export function page(){return `<!doctype html><html><head><meta charset="utf-8"><title>probe354</title><style>body{margin:16px;font:14px sans-serif}#editor{font:16px/24px monospace;white-space:pre-wrap;box-sizing:border-box;width:500px;height:300px;padding:8px;border:1px solid}input#editor{height:44px}</style></head><body><h3>Typing delivery probe</h3><div id="host"></div><script>
const SEED=${JSON.stringify(SEED)},CLIP=${JSON.stringify(CLIP)};let e,id,trace=[],lastSent=0;
const value=()=>e.value??e.textContent;
function selection(){if('selectionStart'in e)return [e.selectionStart,e.selectionEnd-e.selectionStart];const s=getSelection();if(!s.rangeCount)return null;let r=s.getRangeAt(0),b=document.createRange();b.selectNodeContents(e);try{b.setEnd(r.startContainer,r.startOffset);return [b.toString().length,r.toString().length]}catch{return null}}
function select(start,len){e.focus();if(e.setSelectionRange)e.setSelectionRange(start,start+len);else{let w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),n,off=0,a,b;while(n=w.nextNode()){if(!a&&start<=off+n.length)a=[n,start-off];if(start+len<=off+n.length){b=[n,start+len-off];break}off+=n.length}if(!a||!b)return;const r=document.createRange();r.setStart(...a);r.setEnd(...b);getSelection().removeAllRanges();getSelection().addRange(r)}}
const state=()=>({id,text:value(),selection:selection(),at:Date.now(),focused:document.activeElement===e,trace:trace.slice(lastSent)});
const send=o=>fetch('/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)});
for(const event of ['keydown','keyup','beforeinput','input','selectionchange','focusin'])document.addEventListener(event,x=>{if(e)trace.push({event,key:x.key??null,data:x.data??null,inputType:x.inputType??null,meta:x.metaKey??false,alt:x.altKey??false,shift:x.shiftKey??false,text:value(),selection:selection(),at:Date.now()})},true);
async function run(c){if(c.op==='reset'){id=c.id;trace=[];lastSent=0;let tag=c.editor==='input'?'input':c.editor==='textarea'?'textarea':'div';document.querySelector('#host').innerHTML=tag==='div'?'<div id="editor" contenteditable="true"'+(c.editor==='compose'?' role="textbox" aria-label="Message Body" aria-multiline="true"':' aria-label="Draft control"')+'></div>':'<'+tag+' id="editor" aria-label="Draft control"></'+tag+'>';e=document.querySelector('#editor');if('value'in e)e.value=SEED;else if(c.editor==='compose')e.innerHTML='<div>'+SEED+'</div>';else e.innerHTML='<span>'+SEED+'</span>';let pos=3,len=0;if(['cmd+Left','alt+Left','cmd+shift+Left','Left','cmd+z'].includes(c.key))pos=SEED.length;if(c.key==='cmd+x'){pos=0;len=SEED.length}if(c.key==='cmd+v')pos=0;select(pos,len);if(c.key==='cmd+z'){document.execCommand('insertText',false,' undo');}await send({cmd:c.n,op:c.op,...state(),rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.offsetWidth,height:e.offsetHeight}});return}
if(c.op==='sample'){for(const delay of c.delays){const f=()=>{const o={cmd:c.n,op:'sample',delay,...state()};lastSent=trace.length;send(o)};if(delay===0)f();else setTimeout(f,Math.max(0,c.returnedAt+delay-Date.now()))}return}
if(c.op==='read'){await send({cmd:c.n,op:c.op,...state()});lastSent=trace.length;return}
if(c.op==='fence'){e.dispatchEvent(new Event('probe-before-fence'));await send({cmd:c.n,op:c.op,...state()});return}}
(async()=>{for(;;){try{const r=await fetch('/cmd');const c=await r.json();await run(c)}catch{x=>x;await new Promise(r=>setTimeout(r,100))}}})();send({op:'ready',at:Date.now()});
</script></body></html>`}
export function expectation(key,text,seed=SEED){
 const n=seed.length;
 if(key==='cmd+a'||key==='cmd+x'||key==='cmd+shift+Left')return {value:key==='cmd+x'?'':seed,range:key==='cmd+x'?[0,0]:[0,n],final:text};
 if(key==='cmd+v')return {value:CLIP+seed,range:[CLIP.length,0],final:CLIP+text+seed};
 if(key==='cmd+z')return {value:seed,range:[n,0],final:seed+text};
 const p=key==='cmd+Left'?0:key==='alt+Left'?seed.lastIndexOf(' ')+1:key==='Left'?n-1:3;
 return {value:seed,range:[p,0],final:seed.slice(0,p)+text+seed.slice(p)};
}
