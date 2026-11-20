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
a.item{display:block;font:14px/20px sans-serif} table.grid{border-collapse:collapse} table.grid th,table.grid td{font:12px/16px sans-serif;padding:0 6px;border:1px solid #ccc} div.tiny{font:3px/4px sans-serif;white-space:nowrap} div.tiny span{display:inline-block;margin-right:1px}</style></head><body>
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
// #433's overlay over the target's row (slot 0), alive through the change: a group nested WRAP groups below the row, so
// it lies deeper than the link's text and the record takes it at either point. \`veil\` covers the row and lets the
// pointer through (pointer-events:none, every layer); \`scrim\` covers it and catches the pointer (no pointer-events rule,
// no interactive role); \`beside\` is a veil laid past the target's right edge, over nothing interactive; \`sticky\` is a
// scrim fixed to the viewport over the target's row (a sticky header strip), which stays as the page scrolls under it.
const WRAP=2;
function cover(kind){
  slots[0].style.position='relative';
  const left=kind==='beside'?(target.offsetLeft+target.offsetWidth+20)+'px':'0',width=kind==='beside'?'240px':'100%';
  const through=kind==='scrim'||kind==='sticky'?'':';pointer-events:none';
  const place=kind==='sticky'?'position:fixed;left:0;top:'+Math.round(slots[0].getBoundingClientRect().top)+'px;width:100%;height:64px;background:rgba(255,255,255,.5)'
    :'position:absolute;left:'+left+';top:0;width:'+width+';height:64px';
  let outer=null,inner=null;
  for(let i=0;i<=WRAP;i++){
    const d=document.createElement('div');d.setAttribute('role','group');
    d.style.cssText=(i?'position:absolute;left:0;top:0;width:100%;height:100%':place)+through;
    if(inner)inner.append(d);else outer=d;inner=d;
  }
  inner.id='veil';slots[0].append(outer);
}
function run(c){
  if(c.op==='prepare'){
    const spec=CELLS[c.cell];if(!spec)throw Error('cell');
    trial=c.trial;cell=c.cell;marked=null;twins=[];mover=null;drafts=null;
    // The cap filler is kept across consecutive cap trials (only the twin's row is rebuilt): rebuilding 6,000 nodes every
    // trial left both Chromium lanes' page unanswering after 15 repetitions (run 44611947576).
    slots=[row(),row(),row()];nav.replaceChildren(...slots);
    if(spec.twin==='cap'&&far.dataset.filler==='1'){for(const ch of [...far.children])if(!ch.classList.contains('fill'))ch.remove();}
    else{far.replaceChildren();far.dataset.filler='';}
    far.className=spec.twin==='cap'||spec.hide==='cv'||spec.scroll?'on':'';
    if(scrollY)scrollTo(0,0);  // #433's stickyscroll scrolls the page; every prepare starts at the top
    // For the cap twin, the region and the twin's row are groups of their own, so neither is flattened into a sibling the walk
    // reads before the filler.
    if(spec.twin==='cap')far.setAttribute('role','group');else far.removeAttribute('role');
    target=control('target',spec.before,spec);archive=control('archive',OTHERS.archive);
    slots[0].append(target);
    if(spec.twin==='move'){twins=[control('twin',spec.before,spec)];mover=twins[0];slots[1].append(mover);slots[2].append(archive);}
    else if(spec.twin==='list'){twins=[control('twin',spec.before,spec),control('twin2',spec.before,spec)];slots[1].append(twins[0]);slots[2].append(twins[1]);archive=null;}
    else if(spec.twin==='cap'){
      // Below the fold, so the walk defers it and reads it in the document's order: the filler, then the twin.
      if(far.dataset.filler!=='1'){
        for(let g=0;g<FILLER.groups;g++){
          const group=document.createElement('div');group.setAttribute('role','group');group.className='fill';
          for(let i=0;i<FILLER.each;i++){const d=document.createElement('div');d.textContent='x'+i;group.append(d);}
          far.append(group);
        }
        far.dataset.filler='1';
      }
      twins=[control('twin',spec.before,spec)];mover=row();mover.setAttribute('role','group');mover.append(twins[0]);far.append(mover);slots[1].append(archive);
    }else if(spec.twin==='deep'){
      // The twin under DEEP nested groups in the second row, so the walk stops above it.
      twins=[control('twin',spec.before,spec)];let inner=twins[0];
      for(let i=0;i<DEEP;i++){const d=document.createElement('div');d.setAttribute('role','group');d.append(inner);inner=d;}
      mover=inner;slots[1].append(mover);slots[2].append(archive);
    }else if(spec.twin==='hidden'){
      // #435: the twin inside a container that may leave it listed without a frame; mark removes it and renders a new one
      // with its label in the target's row (new handles, so #431's record-membership check cannot refuse it). \`cv\` lies below the fold (content-visibility:auto skips only what is off screen), so its row holds
      // Archive.
      twins=[control('twin',spec.before,spec)];mover=twins[0];
      let box;
      if(spec.hide==='details'){box=document.createElement('details');const s=document.createElement('summary');s.textContent='More';box.append(s,mover);}
      else{
        box=document.createElement('div');
        if(spec.hide==='until')box.setAttribute('hidden','until-found');
        box.style.cssText=spec.hide==='cv'?'content-visibility:auto;contain-intrinsic-size:auto 64px'
          :spec.hide==='zero'?'width:0;height:0;overflow:hidden':spec.hide==='clip'?'height:64px;overflow:hidden':'';
        if(spec.hide==='clip'){const pad=document.createElement('div');pad.style.height='64px';box.append(pad);}
        box.append(mover);
      }
      if(spec.hide==='cv'){far.append(box);slots[1].append(archive);}else{slots[1].append(box);slots[2].append(archive);}
    }else if(spec.twin==='swap'){
      // The target alone in its row; mark moves it two rows down (absolutely, so its element survives) and puts a new
      // control with its label, a link or a button, at its old place.
      slots[0].style.position='relative';slots[1].append(archive);
    }else if(spec.twin==='cover'){
      // As move, under a group laid over the target's row that survives the change (a transparent overlay, which lets
      // the pointer through to what lies under it).
      twins=[control('twin',spec.before,spec)];mover=twins[0];slots[1].append(mover);slots[2].append(archive);
      cover(spec.cover);
    }else if(spec.twin==='row'){
      // Rows that are groups of their own: the target's row is removed, and the twin's row, alive, moves up into its place
      // with the twin re-rendered in it.
      for(const s of slots)s.setAttribute('role','group');
      twins=[control('twin',spec.before,spec)];slots[1].append(twins[0]);slots[2].append(archive);
    }else if(spec.twin==='wide'){
      // A group of WIDE links (the shape whose width cut Safari shows: a role=list of rows it read whole, smoke run
      // 44605406784), placed so that the target is the last the window shows and the twin, right after it, the first it
      // does not (the width rule reads the visible children only): links 56 px high, 8 px apart, the target 48 px, so the
      // twin starts 40 px past the window and, the target removed, moves up exactly into its place. The others carry
      // other labels.
      const list=document.createElement('div');list.setAttribute('role','group');
      list.style.cssText='position:absolute;left:20px;top:'+(innerHeight-3*64)+'px';
      rows=[];
      for(let i=0;i<WIDE;i++){
        const a=i===2?target:i===3?control('twin',spec.before,spec):control('r'+i,'Row '+i);
        a.style.cssText='display:block;width:max-content;margin-bottom:'+(i===2?48:8)+'px';
        if(i===3)twins=[a];rows.push(a);list.append(a);
      }
      archive=null;slots[0].replaceChildren(list);
    }else if(spec.table){
      // A data table (a header row, so Chromium lists its cells under both its rows and its columns) beside the target
      // (\`outside\`: the target alone in the first row, the table in the second), or holding it in its first cell.
      const table=document.createElement('table');table.className='grid';
      const tr=cells=>{const r=document.createElement('tr');r.append(...cells);return r;};
      const cellOf=(tag,x)=>{const c=document.createElement(tag);if(typeof x==='string')c.textContent=x;else c.append(x);return c;};
      table.append(tr(['A','B','C','D'].map(h=>cellOf('th',h))));
      for(let r=0;r<3;r++)table.append(tr([0,1,2,3].map(k=>cellOf('td',spec.table==='cell'&&r===0&&k===0?target:'Cell '+r+k))));
      archive=null;
      if(spec.table==='cell')slots[0].replaceChildren(table);else slots[1].append(table);
    }else if(spec.big||spec.layout==='wide'){
      // The target first in a container the record cannot hold whole: 150 more links running past the window (the width
      // rule's visible subset), or 59 shown groups of 100 small texts (the node cap inside it). The other rows stay empty.
      // With \`overlay\` (#330's wide parent), the same 150 links, and \`mark\` adds a text over the target as their sibling.
      const box=document.createElement('div');box.setAttribute('role','group');box.style.position='relative';box.append(target);archive=null;mover=box;
      if((spec.big||spec.layout)==='wide')for(let i=0;i<BIG.wide;i++){const a=document.createElement('a');a.href='#i'+i;a.className='item';a.textContent='Item '+i;box.append(a);}
      else for(let g=0;g<BIG.groups;g++){
        const group=document.createElement('div');group.setAttribute('role','group');group.className='tiny';
        for(let i=0;i<BIG.each;i++){const s=document.createElement('span');s.textContent='x';group.append(s);}
        box.append(group);
      }
      slots[0].replaceChildren(box);
    }else if(spec.list){
      // #433's twinunder: the target and two links with its label below it (twins, never the target), the veil over the
      // target's row.
      twins=[control('twin',spec.before,spec),control('twin2',spec.before,spec)];slots[1].append(twins[0]);slots[2].append(twins[1]);archive=null;
      cover(spec.cover);
    }else{drafts=control('drafts',OTHERS.drafts);slots[1].append(archive);slots[2].append(drafts);if(spec.cover)cover(spec.cover);}
    if(document.activeElement&&document.activeElement!==document.body)document.activeElement.blur();
    clicks=[];
    return {trial,cell,present:target.isConnected,text:target.textContent,geometry:geometry()};
  }
  if(c.trial!==trial)throw Error('generation');
  if(c.op==='mark'){
    const spec=CELLS[cell],before=geometry(),clicksBeforeMark=clicks.length;
    if(spec.move){slots[0].replaceChildren(archive);slots[1].replaceChildren(target);}
    else if(spec.twin==='list')slots[0].remove();
    else if(spec.overlay){
      // A new element of the wide parent, over the target: a text that takes the pointer (a page's own suggestion box).
      const r=target.getBoundingClientRect(),o=document.createElement('div');o.id='overlay';
      o.style.cssText='position:absolute;left:0;top:0;width:'+r.width+'px;height:'+r.height+'px;padding:14px 4px;box-sizing:border-box;font:20px/28px sans-serif;background:#fff';
      o.textContent='Suggestion';mover.append(o);
    }
    else if(spec.twin==='swap'){
      target.style.cssText='position:absolute;left:0;top:128px';
      const n=control('twin',spec.before,{control:spec.swap});twins=[n];slots[0].prepend(n);
    }
    else if(spec.twin==='cover'){target.remove();slots[0].prepend(mover);}
    else if(spec.twin==='row'){slots[0].remove();const n=control('twin',spec.before,spec);twins[0].replaceWith(n);twins.push(n);}
    else if(spec.twin==='wide')rows[2].remove();
    else if(spec.twin==='hidden'){target.remove();mover.remove();const n=control('twin',spec.before,spec);twins.push(n);slots[0].replaceChildren(n);}
    else if(spec.twin){target.remove();slots[0].replaceChildren(mover);}
    else if(spec.scroll)scrollBy(0,spec.scroll);  // #433's stickyscroll: the link moves away under the fixed header
    else if(spec.cover&&!spec.remount){}  // #433's controls: the overlay over a live link, nothing changing
    else if(spec.remount==='link'){const n=control('target',spec.after,spec);target.replaceWith(n);target=n;}
    else if(spec.remount==='text'){const s=document.createElement('span');s.textContent=spec.after;target.firstChild.replaceWith(s);}
    else target.textContent=spec.after;
    marked=target;
    // For a twin cell the target is gone: the geometry after is the twin's that took its place.
    // The twin that took the target's place: the first, but for twinrow the one re-rendered in the live row (the last).
    const t=spec.twin==='row'||spec.twin==='hidden'?twins[twins.length-1]:twins[0];
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
