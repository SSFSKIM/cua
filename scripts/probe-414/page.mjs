// No input changes type. Commands and edited strings remain in this owned, nonce-bound document.
export const page=`<!doctype html><meta charset="utf-8"><title>Qualification</title>
<style>body{font: 18px sans-serif; margin: 28px} input{display:block; width:340px; margin:16px; padding:6px}</style>
<input id="setup" type="text" aria-label="Setup control" autocomplete="off">
<input id="password" type="password" aria-label="PW walk test" autocomplete="off">
<script>
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
function state(c){return {trial,focused:document.activeElement===field,plainFocused:document.activeElement===setup,
  shape:field===document.getElementById('password')&&field.type==='password'&&field.isConnected,
  exact:field.value===c.expected, controlExact:c.control!=null&&field.value===c.control,
  selection:c.end!=null&&field.selectionStart===c.start&&field.selectionEnd===c.end,key,input,hit};}
function run(c){
  if(c.op==='prepare'){
    setup.focus();trial=c.trial;field.value='';effect='none';first='';key=input=hit=false;
  }else if(c.op==='seed'){
    if(c.trial!==trial)throw Error('generation');
    effect=c.effect;first=c.first;field.value=c.expected;field.focus();field.setSelectionRange(c.start,c.end);
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
