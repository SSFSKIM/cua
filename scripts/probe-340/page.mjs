// The owned browser fixture for #340 (Chrome for Testing, Safari, Electron), nonce-bound to the long-poll server of
// ./fixture-server.mjs. The page judges its own links: only booleans, closed names and CSS geometry leave it.
// Three links in a column, each in its own row: the target, then Archive and Drafts (never the target). `prepare` builds
// all three afresh with the cell's text, so the observation's handles are fresh; `mark`, after the observation and
// before the click, applies the cell's change: the target's `textContent` replaced (re-creating its text node), or, for
// `moved`, the target and Archive swapping rows, so Archive lies where the target was. Every pointer event the page
// receives is logged with the link it reached (`target`, `archive`, `drafts`, `twin`, `other` or `none`). For `twin`, the
// second row holds a link with the target's label and another destination (and Drafts is left out); `mark` removes the
// target and moves the twin up into its row.
import {CELLS,OTHERS} from './cells.mjs';

export const page=()=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Links</title>
<style>body{font:16px sans-serif;margin:20px} .row{height:64px} a.l{display:inline-block;padding:14px 32px;font:20px/28px sans-serif;color:#00c;white-space:nowrap}
a.tabular{width:180px;font-variant-numeric:tabular-nums} a.mono{font-family:monospace}
a.right{width:260px;text-align:right} a.centre{width:260px;text-align:center}</style></head><body>
<nav id="nav"><div class="row" id="slot0"></div><div class="row" id="slot1"></div><div class="row" id="slot2"></div></nav>
<script>
const CELLS=${JSON.stringify(CELLS)}, OTHERS=${JSON.stringify(OTHERS)};
const slots=[0,1,2].map(i=>document.getElementById('slot'+i));
const doc=self.crypto.randomUUID(), nonce=doc.split('-')[0];
document.title='Links '+nonce;
let trial=null, cell=null, target=null, archive=null, drafts=null, twin=null, marked=null, clicks=[];
const post=o=>fetch('/answer',{method:'POST',body:JSON.stringify({doc,...o})});
const nameOf=el=>!el?'none':el===target?'target':el===archive?'archive':el===drafts?'drafts':el===twin?'twin':'other';
for(const type of ['pointerdown','mousedown','mouseup','click'])document.addEventListener(type,e=>{
  const link=e.target&&e.target.closest?e.target.closest('a'):null;
  if(clicks.length<40)clicks.push({type,link:nameOf(link),trusted:e.isTrusted===true});
  if(type==='click'&&link)e.preventDefault();
},true);
const r2=x=>Math.round(x*100)/100;
const rect=r=>r?{x:r2(r.x),y:r2(r.y),width:r2(r.width),height:r2(r.height)}:null;
function geometry(){
  if(!target)return null;
  const range=document.createRange();range.selectNodeContents(target);
  const text=Array.from(range.getClientRects()).find(r=>r.width>0&&r.height>0);
  return {text:target.textContent,link:rect(target.getBoundingClientRect()),textRect:rect(text)};
}
function link(id,text,style){
  const a=document.createElement('a');a.id=id;a.href='#'+id;a.className='l'+(style?' '+style:'');a.textContent=text;return a;
}
function run(c){
  if(c.op==='prepare'){
    const spec=CELLS[c.cell];if(!spec)throw Error('cell');
    trial=c.trial;cell=c.cell;marked=null;
    target=link('target',spec.before,spec.style);archive=link('archive',OTHERS.archive);
    if(spec.twin){twin=link('twin',spec.before,spec.style);drafts=null;slots[0].replaceChildren(target);slots[1].replaceChildren(twin);slots[2].replaceChildren(archive);}
    else{twin=null;drafts=link('drafts',OTHERS.drafts);slots[0].replaceChildren(target);slots[1].replaceChildren(archive);slots[2].replaceChildren(drafts);}
    if(document.activeElement&&document.activeElement!==document.body)document.activeElement.blur();
    clicks=[];
    return {trial,cell,present:target.isConnected,text:target.textContent,geometry:geometry()};
  }
  if(c.trial!==trial)throw Error('generation');
  if(c.op==='mark'){
    const spec=CELLS[cell],before=geometry(),clicksBeforeMark=clicks.length;
    if(spec.move){slots[0].replaceChildren(archive);slots[1].replaceChildren(target);}
    else if(spec.twin){target.remove();slots[0].replaceChildren(twin);}
    else target.textContent=spec.after;
    marked=target;
    return {trial,clicksBeforeMark,before,after:geometry(),archive:rect(archive.getBoundingClientRect())};
  }
  if(c.op==='read')return {trial,clicks:clicks.slice(),present:!!target&&target.isConnected,sameNode:!!target&&target===marked,
    text:target?target.textContent:null};
  throw Error('op');
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
</script></body></html>`;
