import React,{useState,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {chrome} from './window-options.mjs';
import {transform} from '../protocol.mjs';
const pageId=crypto.randomUUID().replaceAll('-',''),timeOrigin=performance.timeOrigin;
document.title='probe366:'+pageId;document.body.style.margin='0';
let trial=null,events=[],api,mode='plain';
const label=e=>e?.id||e?.tagName||null;
const note=(type,data={})=>events.push({type,wallAt:Date.now(),at:performance.timeOrigin+performance.now(),...data});
for(const type of ['focus','blur','focusin','focusout','pointerdown','pointerup','pointermove','mousedown','mouseup','mousemove','click','input','change','keydown','keyup'])document.addEventListener(type,e=>note(type,{target:label(e.target),related:label(e.relatedTarget),isTrusted:e.isTrusted,key:e.key}),true);
for(const type of ['focus','blur','visibilitychange'])window.addEventListener(type,()=>note('window.'+type,{hasFocus:document.hasFocus(),visibility:document.visibilityState}));
function Fixture(){
 const [value,setValue]=useState('');useLayoutEffect(()=>{api={value,setValue};});
 return <main><header style={{height:chrome.toolbarHeight,background:'#eee',WebkitAppRegion:chrome.drag}}>Owned probe toolbar</header><h1>Background value probe</h1><button id="action">Run probe button</button><p><label htmlFor="search">Probe search</label><input id="search" type="text" value={value} onChange={e=>{const received=e.target.value,next=transform(mode,received);note('search.handler',{received,next});flushSync(()=>setValue(next));e.target.value=next;}}/></p><p id="marker">{value}</p></main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
function snapshot(){return {pageId,timeOrigin,trial,wallAt:Date.now(),active:label(document.activeElement),hasFocus:document.hasFocus(),value:document.getElementById('search')?.value,reactValue:api.value,events:[...events]};}
async function command(q){
 if(q.op==='reset'){trial=q.trial;mode=q.mode;flushSync(()=>api.setValue(''));document.getElementById('search').value='';document.getElementById('action').focus();events=[];}
 else if(q.op==='clear-events')events=[];
 else if(q.op!=='read')throw Error('unknown command');
 return snapshot();
}
async function answer(body){const r=await fetch('/answer',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('answer '+r.status);}
async function loop(){while(!api)await new Promise(r=>setTimeout(r,10));await answer({op:'ready',pageId,timeOrigin});for(;;){try{const q=await(await fetch('/cmd?pageId='+pageId+'&timeOrigin='+timeOrigin,{cache:'no-store'})).json();if(q.op==='idle')continue;if(q.pageId!==pageId||q.timeOrigin!==timeOrigin||Date.now()>q.expiresAt)continue;let a;try{a=await command(q);}catch(e){a={error:String(e)};}await answer({...a,op:q.op,cmd:q.n,pageId,timeOrigin,ownerEpoch:q.ownerEpoch});}catch{await new Promise(r=>setTimeout(r,100));}}}
void loop();
