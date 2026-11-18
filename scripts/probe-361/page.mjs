// The owned browser fixture: a setup input, a single-line input and a textarea, nonce-bound to the long-poll server of
// ../probe-414/fixture-server.mjs. The page judges its own content: only booleans and counts leave it.
// Negative controls, each at most once per trial and recorded as `hit`:
// - rewrite: the first paste input event's handler rewrites the first pasted character in place (same length);
// - add: the first paste input event's handler inserts one 'z' at the caret;
// - stale: ⌘V's keydown (or, failing one, the paste event, still before the insertion) moves the caret to the field's start.
export const LABELS={setup:'Probe361 setup',single:'Probe361 single',multi:'Probe361 multi'};
export const page=()=>`<!doctype html><meta charset="utf-8"><title>Qualification</title>
<style>body{font: 18px sans-serif; margin: 28px} input,textarea{display:block; width:420px; margin:14px; padding:6px} textarea{height:120px}</style>
<input id="setup" type="text" aria-label="${LABELS.setup}" autocomplete="off" spellcheck="false">
<input id="single" type="text" aria-label="${LABELS.single}" autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="off">
<textarea id="multi" aria-label="${LABELS.multi}" autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="off"></textarea>
<script>
const setup=document.getElementById('setup'), fields={single:document.getElementById('single'),multi:document.getElementById('multi')};
const doc=self.crypto.randomUUID(), nonce=doc.split('-')[0];
document.title='Qualification '+nonce;
let trial=null, target=null, effect='none', start=0, staleTo=null, rewriteChar='', hit=false, hitVia=null, pastes=0, pasteInputs=0, keys=0;
const post=o=>fetch('/answer',{method:'POST',body:JSON.stringify({doc,...o})});
const stale=via=>{
  if(hit||effect!=='stale')return;
  hit=true;hitVia=via;fields[target].setSelectionRange(staleTo,staleTo);
};
for(const [name,field] of Object.entries(fields)){
  field.addEventListener('keydown',e=>{
    if(name!==target||!e.isTrusted)return;
    keys++;
    if(e.metaKey&&(e.code==='KeyV'||e.key==='v'||e.key==='V'))stale('keydown');
  });
  field.addEventListener('paste',e=>{if(name!==target||!e.isTrusted)return;pastes++;stale('paste');});
  field.addEventListener('input',e=>{
    if(name!==target||e.inputType!=='insertFromPaste')return;
    pasteInputs++;
    if(hit||(effect!=='rewrite'&&effect!=='add'))return;
    hit=true;hitVia='input';
    if(effect==='rewrite')field.setRangeText(rewriteChar,start,start+1,'preserve');
    else field.setRangeText('z',field.selectionEnd,field.selectionEnd,'end');
  });
}
function state(c){
  const f=fields[target];
  return {trial,target,shape:!!f&&f.isConnected&&(target==='single'?f.type==='text':f.tagName==='TEXTAREA'),
    focused:!!f&&document.activeElement===f,setupFocused:document.activeElement===setup,
    exact:!!f&&f.value===c.expected,controlExact:!!f&&c.control!=null&&f.value===c.control,
    setupExact:typeof c.setupText==='string'?setup.value===c.setupText:null,
    selection:!!f&&c.start!=null&&f.selectionStart===c.start&&f.selectionEnd===c.end,
    hit,hitVia,pastes,pasteInputs,keys};
}
function run(c){
  if(c.op==='prepare'){
    trial=c.trial;target=null;effect='none';hit=false;hitVia=null;pastes=pasteInputs=keys=0;
    fields.single.value='';fields.multi.value='';
    setup.value=c.setupText??'';setup.focus();setup.setSelectionRange(setup.value.length,setup.value.length);
  }else if(c.op==='seed'){
    if(c.trial!==trial||!fields[c.target])throw Error('generation');
    target=c.target;effect=c.effect;start=c.start;staleTo=c.staleTo;rewriteChar=c.rewriteChar;
    const f=fields[target];f.value=c.initial;f.focus();f.setSelectionRange(c.start,c.end);
  }
  return state(c);
}
(async()=>{
 await post({op:'ready',nonce});
 for(;;){try{
   const r=await fetch('/cmd?doc='+encodeURIComponent(doc)),c=await r.json();
   if(c.n&&!['idle','stale'].includes(c.op)&&Date.now()<=c.expiresAt){
     let q;try{q=run(c)}catch{q={error:true}}
     await post({op:c.op,n:c.n,...q});
   }else if(c.op==='stale')await new Promise(ok=>setTimeout(ok,100));
 }catch{await new Promise(ok=>setTimeout(ok,100));}}
})();
</script>`;
