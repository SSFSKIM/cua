// The owned browser fixture for #398 (Chrome for Testing, Safari, Electron), nonce-bound to the long-poll server of
// ./fixture-server.mjs. The page judges its own fields: only booleans, counts and closed names leave it.
// Every placeholder-change field carries its own aria-label, so its accessible name never comes from its placeholder and
// the placeholder is the only attribute that changes:
// - static: never changes (the control);
// - focus: cleared on focus, restored on blur (a floating label);
// - rotate: rotates every ROTATE_MS while its cell runs ("Search people…", "Search files…");
// - input: switches on the first input event (a mode hint);
// - search: an <input type=search> whose hint switches on focus and back on blur (a scoped search box).
// The twins are two fields alike in everything but their placeholder (the same aria-label, type and parent), rebuilt at
// every prepare so the observation's handles are fresh; `mark` then makes the first twin's handle stale: recreated alike,
// recreated with another placeholder, or removed. The solo field has its own label and no twin: `mark` recreates it with
// another placeholder, so the stale handle's only otherwise-matching replacement differs from it by the placeholder alone.
// Every field but the target, the setup field's canary included, is reported when written (`othersWritten`).
export const LABELS={setup:'Probe398 setup',static:'Probe398 static',focus:'Probe398 focus',rotate:'Probe398 rotate',
  input:'Probe398 input',search:'Probe398 search',twin:'Probe398 twin',solo:'Probe398 solo'};
export const PLACEHOLDERS={static:'Probe398 static hint',focus:'Probe398 email address',
  rotate:['Probe398 search people','Probe398 search files','Probe398 search messages'],
  input:['Probe398 type a name','Probe398 keep typing'],search:['Probe398 search','Probe398 search this folder'],
  twinA:'Probe398 first name',twinB:'Probe398 last name',twinRenamed:'Probe398 given name',
  solo:'Probe398 street address',soloRenamed:'Probe398 street and number'};
export const ROTATE_MS=150;
export const FIELD_NAMES=['static','focus','rotate','input','search','twinA','twinB','solo'];
export const page=()=>`<!doctype html><meta charset="utf-8"><title>Qualification</title>
<style>body{font: 16px sans-serif; margin: 20px} input{display:block; width:380px; margin:8px; padding:5px}</style>
<form id="form" onsubmit="return false">
<input id="setup" type="text" aria-label="${LABELS.setup}" autocomplete="off" spellcheck="false">
<input id="static" type="text" aria-label="${LABELS.static}" autocomplete="off" spellcheck="false">
<input id="focus" type="text" aria-label="${LABELS.focus}" autocomplete="off" spellcheck="false">
<input id="rotate" type="text" aria-label="${LABELS.rotate}" autocomplete="off" spellcheck="false">
<input id="input" type="text" aria-label="${LABELS.input}" autocomplete="off" spellcheck="false">
<input id="search" type="search" aria-label="${LABELS.search}" autocomplete="off" spellcheck="false">
<div id="twins"></div>
<div id="solo"></div>
</form>
<script>
const P=${JSON.stringify(PLACEHOLDERS)}, ROTATE_MS=${ROTATE_MS}, NAMES=${JSON.stringify(FIELD_NAMES)};
const setup=document.getElementById('setup'), twins=document.getElementById('twins'), soloBox=document.getElementById('solo');
const f={static:document.getElementById('static'),focus:document.getElementById('focus'),rotate:document.getElementById('rotate'),
  input:document.getElementById('input'),search:document.getElementById('search'),twinA:null,twinB:null,solo:null};
const doc=self.crypto.randomUUID(), nonce=doc.split('-')[0];
document.title='Qualification '+nonce;
let trial=null, cell=null, target=null, marked=null, rotation=null, rotateAt=0;
let changes={}, focuses={}, inputs={};
const post=o=>fetch('/answer',{method:'POST',body:JSON.stringify({doc,...o})});
const nameOf=el=>{for(const k of NAMES)if(f[k]&&f[k]===el)return k;return el===setup?'setup':el&&el!==document.body?'other':'none';};
function setPh(name,text){const el=f[name];if(!el||el.placeholder===text)return;el.placeholder=text;changes[name]=(changes[name]??0)+1;}
f.focus.addEventListener('focus',()=>setPh('focus',''));
f.focus.addEventListener('blur',()=>setPh('focus',P.focus));
f.input.addEventListener('input',()=>setPh('input',P.input[1]));
f.search.addEventListener('focus',()=>setPh('search',P.search[1]));
f.search.addEventListener('blur',()=>setPh('search',P.search[0]));
for(const k of ['static','focus','rotate','input','search'])watch(k,f[k]);
function watch(k,el){
  el.addEventListener('focus',()=>{if(f[k]===el)focuses[k]=(focuses[k]??0)+1;});
  el.addEventListener('input',()=>{if(f[k]===el)inputs[k]=(inputs[k]??0)+1;});
}
function twin(k,ph,label=${JSON.stringify(LABELS.twin)}){
  const el=document.createElement('input');
  el.type='text';el.setAttribute('aria-label',label);el.autocomplete='off';el.spellcheck=false;el.placeholder=ph;
  watch(k,el);return el;
}
function rebuildTwins(){
  twins.replaceChildren();f.twinA=twin('twinA',P.twinA);f.twinB=twin('twinB',P.twinB);twins.append(f.twinA,f.twinB);
  soloBox.replaceChildren();f.solo=twin('solo',P.solo,${JSON.stringify(LABELS.solo)});soloBox.append(f.solo);
}
function stopRotation(){if(rotation){clearInterval(rotation);rotation=null;}}
const targetOf=c=>c==='static'||c==='focus'||c==='rotate'||c==='input'||c==='search'?c:c==='solo-renamed'?'solo':c&&c.startsWith('twin')?'twinA':null;
function state(c){
  const t=target?f[target]:null, others=NAMES.filter(k=>k!==target&&f[k]);
  return {trial,cell,target,present:!!t&&t.isConnected,
    sameNode:!!t&&t===marked,
    exact:!!t&&typeof c.expected==='string'&&t.value===c.expected,
    targetEmpty:!!t&&t.value==='',
    othersWritten:[...(typeof c.setupText==='string'&&setup.value!==c.setupText?['setup']:[]),...others.filter(k=>f[k].value!=='')],
    setupExact:typeof c.setupText==='string'?setup.value===c.setupText:null,
    focused:nameOf(document.activeElement),
    placeholderChanges:target?changes[target]??0:0,
    focusesSinceMark:Object.fromEntries(NAMES.map(k=>[k,focuses[k]??0])),
    inputsSinceMark:Object.fromEntries(NAMES.map(k=>[k,inputs[k]??0])),
    rotating:!!rotation};
}
function run(c){
  if(c.op==='prepare'){
    stopRotation();
    trial=c.trial;cell=c.cell;target=targetOf(c.cell);marked=null;
    if(!target)throw Error('cell');
    for(const k of ['static','focus','rotate','input','search'])f[k].value='';
    f.static.placeholder=P.static;f.focus.placeholder=P.focus;f.rotate.placeholder=P.rotate[0];f.input.placeholder=P.input[0];f.search.placeholder=P.search[0];
    rebuildTwins();
    setup.value=c.setupText??'';setup.focus();setup.setSelectionRange(setup.value.length,setup.value.length);
    if(cell==='rotate'){rotateAt=0;rotation=setInterval(()=>{rotateAt=(rotateAt+1)%P.rotate.length;setPh('rotate',P.rotate[rotateAt]);},ROTATE_MS);}
    changes={};focuses={};inputs={};
  }else if(c.op==='mark'){
    if(c.trial!==trial)throw Error('generation');
    // The twin and solo cells make the target's observed handle stale, after the observation and before any action.
    if(cell==='twin-recreate'||cell==='twin-renamed'){
      const fresh=twin('twinA',cell==='twin-renamed'?P.twinRenamed:P.twinA);f.twinA.replaceWith(fresh);f.twinA=fresh;
    }else if(cell==='twin-removed'){f.twinA.remove();}
    else if(cell==='solo-renamed'){const fresh=twin('solo',P.soloRenamed,${JSON.stringify(LABELS.solo)});f.solo.replaceWith(fresh);f.solo=fresh;}
    marked=f[target];changes={};focuses={};inputs={};
  }else if(c.op!=='read')throw Error('op');
  else if(c.trial!==trial)throw Error('generation');
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
