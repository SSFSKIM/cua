// The owned browser fixture for #431 (Chrome for Testing, Safari, Electron), nonce-bound to the long-poll server of
// ./fixture-server.mjs. The page judges its own controls: only booleans, closed names and CSS geometry leave it.
// Three rows in a column: the target, then Archive and Drafts (never the target). `prepare` builds the rows and every
// control afresh with the cell's text, so the observation's handles are fresh; `mark`, after the observation and before
// the click, applies the cell's change (cells.mjs). Every pointer event the page receives is logged with the control it
// reached (`target`, `archive`, `drafts`, `twin`, `other` or `none`): for the twin cells, every control with the
// target's label that is not the target is `twin`.
import {CELLS,OTHERS,FILLER,DEEP,BIG,WIDE} from './cells.mjs';

export const page=()=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Links</title>
<style>body{font:16px sans-serif;margin:20px} .row{height:64px} .l{display:inline-block;padding:14px 32px;font:20px/28px sans-serif;color:#00c;white-space:nowrap}
button.l{border:0;margin:0;background:none;cursor:pointer;text-align:left} #far.on{margin-top:1600px} #far div{font:4px/5px sans-serif}
a.tabular{width:180px;font-variant-numeric:tabular-nums} a.mono{font-family:monospace}
a.right{width:260px;text-align:right} a.centre{width:260px;text-align:center}
a.item{display:block;font:14px/20px sans-serif} div.tiny{font:3px/4px sans-serif;white-space:nowrap} div.tiny span{display:inline-block;margin-right:1px}</style></head><body>
<nav id="nav"></nav><div id="far"></div>
<script>
const CELLS=${JSON.stringify(CELLS)}, OTHERS=${JSON.stringify(OTHERS)}, FILLER=${JSON.stringify(FILLER)}, DEEP=${DEEP}, BIG=${JSON.stringify(BIG)}, WIDE=${WIDE};
const nav=document.getElementById('nav'), far=document.getElementById('far');
const doc=self.crypto.randomUUID(), nonce=doc.split('-')[0];
document.title='Links '+nonce;
let trial=null, cell=null, slots=[], target=null, archive=null, drafts=null, twins=[], marked=null, clicks=[], rows=[];
// What a twin cell moves into the target's row (the twin, or the deep chain holding it).
let mover=null;
const post=o=>fetch('/answer',{method:'POST',body:JSON.stringify({doc,...o})});
const nameOf=el=>!el?'none':el===target?'target':el===archive?'archive':el===drafts?'drafts':twins.includes(el)?'twin':'other';
for(const type of ['pointerdown','mousedown','mouseup','click'])document.addEventListener(type,e=>{
  const c=e.target&&e.target.closest?e.target.closest('a,button'):null;
  if(clicks.length<40)clicks.push({type,link:nameOf(c),trusted:e.isTrusted===true});
  if(type==='click'&&c)e.preventDefault();
},true);
const r2=x=>Math.round(x*100)/100;
const rect=r=>r?{x:r2(r.x),y:r2(r.y),width:r2(r.width),height:r2(r.height)}:null;
function geometry(){
  if(!target)return null;
  const range=document.createRange();range.selectNodeContents(target);
  const text=Array.from(range.getClientRects()).find(r=>r.width>0&&r.height>0);
  return {text:target.textContent,link:rect(target.getBoundingClientRect()),textRect:rect(text)};
}
// A control of the cell's kind; with \`span\`, its text in a span (so the text's element can be re-created alone).
function control(id,text,spec={}){
  const el=document.createElement(spec.control==='button'?'button':'a');el.id=id;
  if(el.tagName==='A')el.href='#'+id;else el.type='button';
  el.className='l'+(spec.style?' '+spec.style:'');
  if(spec.remount==='text'){const s=document.createElement('span');s.textContent=text;el.append(s);}else el.textContent=text;
  return el;
}
const row=()=>{const d=document.createElement('div');d.className='row';return d;};
function run(c){
  if(c.op==='prepare'){
    const spec=CELLS[c.cell];if(!spec)throw Error('cell');
    trial=c.trial;cell=c.cell;marked=null;twins=[];mover=null;drafts=null;
    slots=[row(),row(),row()];nav.replaceChildren(...slots);far.replaceChildren();far.className=spec.twin==='cap'?'on':'';
    // For the cap twin, the region and the twin's row are groups of their own, so neither is flattened into a sibling the walk
    // reads before the filler.
    if(spec.twin==='cap')far.setAttribute('role','group');else far.removeAttribute('role');
    target=control('target',spec.before,spec);archive=control('archive',OTHERS.archive);
    slots[0].append(target);
    if(spec.twin==='move'){twins=[control('twin',spec.before,spec)];mover=twins[0];slots[1].append(mover);slots[2].append(archive);}
    else if(spec.twin==='list'){twins=[control('twin',spec.before,spec),control('twin2',spec.before,spec)];slots[1].append(twins[0]);slots[2].append(twins[1]);archive=null;}
    else if(spec.twin==='cap'){
      // Below the fold, so the walk defers it and reads it in the document's order: the filler, then the twin.
      for(let g=0;g<FILLER.groups;g++){
        const group=document.createElement('div');group.setAttribute('role','group');
        for(let i=0;i<FILLER.each;i++){const d=document.createElement('div');d.textContent='x'+i;group.append(d);}
        far.append(group);
      }
      twins=[control('twin',spec.before,spec)];mover=row();mover.setAttribute('role','group');mover.append(twins[0]);far.append(mover);slots[1].append(archive);
    }else if(spec.twin==='deep'){
      // The twin under DEEP nested groups in the second row, so the walk stops above it.
      twins=[control('twin',spec.before,spec)];let inner=twins[0];
      for(let i=0;i<DEEP;i++){const d=document.createElement('div');d.setAttribute('role','group');d.append(inner);inner=d;}
      mover=inner;slots[1].append(mover);slots[2].append(archive);
    }else if(spec.twin==='swap'){
      // The target alone in its row; mark moves it two rows down (absolutely, so its element survives) and puts a new
      // control with its label, a link or a button, at its old place.
      slots[0].style.position='relative';slots[1].append(archive);
    }else if(spec.twin==='cover'){
      // As move, under a group laid over the target's row that survives the change (a transparent overlay, which lets
      // the pointer through to what lies under it).
      twins=[control('twin',spec.before,spec)];mover=twins[0];slots[1].append(mover);slots[2].append(archive);
      slots[0].style.position='relative';
      const veil=document.createElement('div');veil.id='veil';veil.setAttribute('role','group');veil.style.cssText='position:absolute;left:0;top:0;width:100%;height:64px;pointer-events:none';
      slots[0].append(veil);
    }else if(spec.twin==='row'){
      // Rows that are groups of their own: the target's row is removed, and the twin's row, alive, moves up into its place
      // with the twin re-rendered in it.
      for(const s of slots)s.setAttribute('role','group');
      twins=[control('twin',spec.before,spec)];slots[1].append(twins[0]);slots[2].append(archive);
    }else if(spec.twin==='wide'){
      // A list of WIDE rows placed so that the target's row is the last the window shows and the twin's, right after it,
      // the first it does not (the width rule reads the visible rows only): the target's row is 104 px, so the twin's starts
      // 40 px past the window and, the target's row removed, moves up exactly into it. The other rows carry other labels.
      const list=document.createElement('div');list.setAttribute('role','list');
      list.style.cssText='position:absolute;left:20px;top:'+(innerHeight-3*64)+'px';
      rows=[];
      for(let i=0;i<WIDE;i++){
        const r=row();r.setAttribute('role','listitem');if(i===2)r.style.height='104px';
        const a=i===2?target:i===3?control('twin',spec.before,spec):control('r'+i,'Row '+i);
        if(i===3)twins=[a];r.append(a);rows.push(r);list.append(r);
      }
      archive=null;slots[0].replaceChildren(list);
    }else if(spec.big){
      // The target first in a container the record cannot hold whole: 150 more links running past the window (the width
      // rule's visible subset), or 59 shown groups of 100 small texts (the node cap inside it). The other rows stay empty.
      const box=document.createElement('div');box.setAttribute('role','group');box.append(target);archive=null;
      if(spec.big==='wide')for(let i=0;i<BIG.wide;i++){const a=document.createElement('a');a.href='#i'+i;a.className='item';a.textContent='Item '+i;box.append(a);}
      else for(let g=0;g<BIG.groups;g++){
        const group=document.createElement('div');group.setAttribute('role','group');group.className='tiny';
        for(let i=0;i<BIG.each;i++){const s=document.createElement('span');s.textContent='x';group.append(s);}
        box.append(group);
      }
      slots[0].replaceChildren(box);
    }else{drafts=control('drafts',OTHERS.drafts);slots[1].append(archive);slots[2].append(drafts);}
    if(document.activeElement&&document.activeElement!==document.body)document.activeElement.blur();
    clicks=[];
    return {trial,cell,present:target.isConnected,text:target.textContent,geometry:geometry()};
  }
  if(c.trial!==trial)throw Error('generation');
  if(c.op==='mark'){
    const spec=CELLS[cell],before=geometry(),clicksBeforeMark=clicks.length;
    if(spec.move){slots[0].replaceChildren(archive);slots[1].replaceChildren(target);}
    else if(spec.twin==='list')slots[0].remove();
    else if(spec.twin==='swap'){
      target.style.cssText='position:absolute;left:0;top:128px';
      const n=control('twin',spec.before,{control:spec.swap});twins=[n];slots[0].prepend(n);
    }
    else if(spec.twin==='cover'){target.remove();slots[0].prepend(mover);}
    else if(spec.twin==='row'){slots[0].remove();const n=control('twin',spec.before,spec);twins[0].replaceWith(n);twins.push(n);}
    else if(spec.twin==='wide')rows[2].remove();
    else if(spec.twin){target.remove();slots[0].replaceChildren(mover);}
    else if(spec.remount==='link'){const n=control('target',spec.after,spec);target.replaceWith(n);target=n;}
    else if(spec.remount==='text'){const s=document.createElement('span');s.textContent=spec.after;target.firstChild.replaceWith(s);}
    else target.textContent=spec.after;
    marked=target;
    // For a twin cell the target is gone: the geometry after is the twin's that took its place.
    const t=twins[twins.length-1];
    const after=spec.twin?{text:t.textContent,link:rect(t.getBoundingClientRect()),textRect:null}:geometry();
    return {trial,clicksBeforeMark,before,after,twin:spec.twin?rect(t.getBoundingClientRect()):null};
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
