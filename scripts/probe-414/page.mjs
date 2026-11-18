// No input changes type. Commands and edited strings remain in this owned, nonce-bound document.
// `filler` buttons precede both inputs (the large page of #395: its 1,600 buttons, inert, in one labelled group), and each focus
// scrolls its input into view; shape then also asserts the filler's size and that it lies above the field. The default page has none.
export const FILLER=1600;
const group=n=>n?'<div id="large-before-editor" role="group" aria-label="Filler controls">'+Array.from({length:n},(_,i)=>`<button type="button" tabindex="-1" id="large-node-${i}">Filler ${i}</button>`).join('')+'</div>':'';
export const page=(filler=0)=>`<!doctype html><meta charset="utf-8"><title>Qualification</title>
<style>body{font: 18px sans-serif; margin: 28px} input{display:block; width:340px; margin:16px; padding:6px}</style>
${group(filler)}<input id="setup" type="text" aria-label="Setup control" autocomplete="off">
<input id="password" type="password" aria-label="PW walk test" autocomplete="off">
<script>
const FILLER=${filler};
const setup=document.getElementById('setup'), field=document.getElementById('password');
const doc=self.crypto.randomUUID(), nonce=doc.split('-')[0];
document.title='Qualification '+nonce;
let trial=null, effect='none', first='', hit=false, key=false, input=false;
const post=o=>fetch('/answer',{method:'POST',body:JSON.stringify({doc,...o})});
field.addEventListener('input',()=>{input=true});
field.addEventListener('keydown',event=>{
  if(!event.isTrusted||event.key.length!==1)return;
  key=true;
  if(hit||effect==='none'||event.key!==first)return;
  hit=true;
  if(effect==='drop'){event.preventDefault();return;}
  // Add one independent character but leave the genuine typed character to the default action.
  field.setRangeText('z',field.selectionStart,field.selectionEnd,'end');
  if(effect==='rewrite')event.preventDefault();
});
const filler=()=>{const g=document.getElementById('large-before-editor');
  return FILLER===0?g===null:g!==null&&g.childElementCount===FILLER&&g.getBoundingClientRect().bottom<=field.getBoundingClientRect().top+1;};
const reveal=el=>{if(FILLER>0)el.scrollIntoView({block:'nearest'});};
function state(c){return {trial,focused:document.activeElement===field,plainFocused:document.activeElement===setup,
  shape:field===document.getElementById('password')&&field.type==='password'&&field.isConnected&&filler(),
  exact:field.value===c.expected, controlExact:c.control!=null&&field.value===c.control,
  setupExact:typeof c.setupText==='string'?setup.value===c.setupText:null,
  selection:c.end!=null&&field.selectionStart===c.start&&field.selectionEnd===c.end,key,input,hit};}
function run(c){
  if(c.op==='prepare'){
    setup.value=c.setupText??'';setup.focus();setup.setSelectionRange(setup.value.length,setup.value.length);
    reveal(setup);trial=c.trial;field.value='';effect='none';first='';key=input=hit=false;
  }else if(c.op==='seed'){
    if(c.trial!==trial)throw Error('generation');
    effect=c.effect;first=c.first;field.value=c.expected;field.focus();reveal(field);field.setSelectionRange(c.start,c.end);
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
