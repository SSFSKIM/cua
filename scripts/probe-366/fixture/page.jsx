import React,{useState,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import * as Dialog from '@radix-ui/react-dialog';
import {createLifecycle,pressMarker,valueMarker} from './lifecycle.mjs';
import {chrome} from './window-options.mjs';

const pageId=crypto.randomUUID().replaceAll('-',''),timeOrigin=performance.timeOrigin;
document.title='probe366:'+pageId;
document.body.style.margin='0';
const at=()=>performance.timeOrigin+performance.now();
let trial=null,events=[],api,reason=null;
const lifecycle=createLifecycle();
const label=node=>node?.id||node?.getAttribute?.('aria-label')||node?.tagName||null;
function note(type,data={}) {events.push({at:at(),wallAt:Date.now(),type,...data});}
window.__probe366Note=note;
window.__probe366Trap=true;
for(const type of ['focusin','focusout','pointerdown','pointerup','mousedown','mouseup','click','input','change','keydown'])
 document.addEventListener(type,e=>note(type,{target:label(e.target),related:label(e.relatedTarget),outside:!document.getElementById('content')?.contains(e.target),inToolbar:!!e.target?.closest?.('[data-toolbar]'),clientX:e.clientX,clientY:e.clientY,isTrusted:e.isTrusted,key:e.key,defaultPrevented:e.defaultPrevented}),true);
for(const type of ['focus','blur','visibilitychange'])window.addEventListener(type,()=>note('window.'+type,{hasFocus:document.hasFocus(),visibility:document.visibilityState}));
function outside(type,e) {
 reason=type;note(type,{target:label(e.target),originalType:e.detail?.originalEvent?.type,defaultPrevented:e.defaultPrevented});
 queueMicrotask(()=>note(type+'.after',{defaultPrevented:e.defaultPrevented}));
}
function Fixture() {
 const [open,setOpen]=useState(false),[presses,setPresses]=useState(0),[value,setValue]=useState('');
 useLayoutEffect(()=>{api={open,presses,value,setOpen,setPresses,setValue};});
 return <main>
  <header id="toolbar" data-toolbar style={{height:chrome.toolbarHeight,boxSizing:'border-box',display:'flex',alignItems:'center',minWidth:0,borderBottom:'1px solid #aaa',background:'#faf9f6',userSelect:'none',WebkitAppRegion:chrome.drag}}>
   <div style={{width:300,boxSizing:'border-box',height:'100%',display:'flex',alignItems:'center',justifyContent:'flex-end',gap:4,flexShrink:0,paddingLeft:chrome.trafficLightPadding,paddingRight:12}}>
    <button id="sidebar-control" aria-label="Sidebar control" style={{width:28,height:28,WebkitAppRegion:chrome.noDrag}}>S</button>
    <button id="overview-control" aria-label="Overview control" style={{width:28,height:28,WebkitAppRegion:chrome.noDrag}}>O</button>
   </div>
   <span style={{paddingLeft:20}}>Owned window toolbar</span>
   <div data-toolbar-end style={{marginLeft:'auto',display:'flex',paddingRight:12,WebkitAppRegion:chrome.noDrag}}>
    <button id="end-control" aria-label="Toolbar end control" style={{width:28,height:28}}>E</button>
   </div>
  </header>
  <h1>Owned dialog probe</h1><button id="outside">Outside button</button>
  <Dialog.Root open={open} onOpenChange={next=>{note('onOpenChange',{open:next,reason});setOpen(next);}}>
   <Dialog.Trigger id="trigger">Open dialog</Dialog.Trigger>
   <Dialog.Portal>
    <Dialog.Overlay id="overlay" style={{position:'fixed',inset:0,background:'#ddd'}}/>
    <Dialog.Content id="content" style={{position:'fixed',left:90,top:90,width:380,padding:24,background:'white',border:'2px solid black'}}
      onOpenAutoFocus={e=>{lifecycle.mounted();note('openAutoFocus');e.preventDefault();document.getElementById('action')?.focus();}}
      onCloseAutoFocus={()=>{note('closeAutoFocus');lifecycle.closed();}}
      onPointerDownOutside={e=>outside('pointerDownOutside',e)}
      onFocusOutside={e=>outside('focusOutside',e)}
      onInteractOutside={e=>outside('interactOutside',e)}
      onEscapeKeyDown={()=>{reason='escape';note('escape');}}>
     <Dialog.Title>Probe dialog</Dialog.Title><Dialog.Description>Button and controlled search field</Dialog.Description>
     <button id="action" onClick={()=>{note('button.handler');setPresses(n=>n+1);}}>Run probe button</button>
     <label htmlFor="search">Probe search</label>
     <input id="search" type="text" placeholder="Search" value={value} onChange={e=>{note('search.handler',{value:e.target.value});setValue(e.target.value);}}/>
     <p id="marker">{pressMarker(presses)}</p><p id="value-marker">{valueMarker(value)}</p>
     <Dialog.Close id="close">Close</Dialog.Close>
    </Dialog.Content>
   </Dialog.Portal>
  </Dialog.Root>
 </main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
function snapshot() {
 const toolbar=document.getElementById('toolbar'),control=document.getElementById('sidebar-control'),rect=toolbar.getBoundingClientRect();
 const chrome={toolbarHeight:rect.height,toolbarRegion:getComputedStyle(toolbar).getPropertyValue('-webkit-app-region'),controlRegion:getComputedStyle(control).getPropertyValue('-webkit-app-region')};
 return {pageId,timeOrigin,trial,at:at(),wallAt:Date.now(),visibility:document.visibilityState,hasFocus:document.hasFocus(),active:label(document.activeElement),open:!!document.getElementById('content'),presses:api.presses,value:document.getElementById('search')?.value??null,reactValue:api.value,trap:window.__probe366Trap,chrome,events:[...events]};
}
async function command(q) {
 if(q.op==='reset') {
  flushSync(()=>api.setOpen(false));
  await lifecycle.drained();
  window.__probe366Trap=q.scene==='modal';reason=null;trial=q.trial;
  flushSync(()=>{api.setPresses(0);api.setValue('');});
  flushSync(()=>api.setOpen(true));
  await new Promise(r=>setTimeout(r,50));events=[];note('trial.ready',{trap:window.__probe366Trap});
 } else if(q.op==='mark') {note(q.name,{controllerAt:q.controllerAt});}
 else if(q.op!=='read')throw Error('unknown fixture command');
 return snapshot();
}
const request=async(path,body)=>{
 const response=await fetch(path,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!response.ok)throw Error('transport '+response.status);
};
async function loop() {
 while(!api)await new Promise(r=>setTimeout(r,10));
 await request('/answer',{op:'ready',pageId,timeOrigin});
 for(;;) {
  try {
   const q=await (await fetch('/cmd?pageId='+pageId+'&timeOrigin='+timeOrigin,{cache:'no-store'})).json();
   if(q.op==='idle')continue;
   if(q.pageId!==pageId||q.timeOrigin!==timeOrigin||Date.now()>q.expiresAt)continue;
   let answer;try {answer=await command(q);}catch(e){answer={error:String(e)};}
   await request('/answer',{...answer,op:q.op,cmd:q.n,pageId,timeOrigin,ownerEpoch:q.ownerEpoch});
  } catch(e) {console.error(e);await new Promise(r=>setTimeout(r,100));}
 }
}
void loop();
