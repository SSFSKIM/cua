import {test} from 'node:test';import assert from 'node:assert/strict';
import {observeDrag,observeScroll,observeClick} from './fixtures/native-action-witness.mjs';
import scenarios from './scenarios/native.mjs';
function fixture(noop){
 let text=Array.from({length:200},(_,i)=>`line ${String(i).padStart(3,'0')} owned native scroll fixture`).join('\n'),cursor=0,selected=null,top=0,undo;const calls=[];
 return {read:async()=>text,calls,app:{
  async pressKey(key){calls.push(key);if(key==='ctrl+Home'){cursor=0;top=0;selected=null;}else if(key==='ctrl+z'){if(undo!==undefined)text=undo;undo=undefined;}else if(key==='BackSpace'&&selected){undo=text;text=text.slice(0,selected[0])+text.slice(selected[1]);selected=null;}else if(key==='Delete'){undo=text;text=text.slice(0,cursor)+text.slice(cursor+1);}},
  async drag(){calls.push('drag');if(noop!=='drag')selected=[192,207];},async click(){calls.push('click');if(noop!=='click')cursor=192+top;},async scroll(){calls.push('scroll');if(noop!=='scroll')top=629;},
 }};
}
function verify(id,value){const tail=id.endsWith('/scroll')?[{error:'Linux scroll accepts { pixels }, not pages.'},...Array(4).fill({error:'pixels must be a positive finite number.'})]:[];return scenarios.find(s=>s.id===id).assert({results:[{isError:false,content:[{type:'text',text:'NATIVE:'+JSON.stringify([value,...tail])}]},{isError:false,structuredContent:{status:'ended'}}]});}
for(const [kind,observe,ids] of [['click',observeClick,['native/target-app-decorated-tab/click']],['drag',observeDrag,['native/target-app-decorated-tab/drag']],['scroll',observeScroll,['native/app/scroll','native/target-app-decorated-tab/scroll']]])test(`${kind} witness executes the action once and its no-op mutation fails every consuming case`,async()=>{
 const real=fixture(),value=await observe(real.app,real.read);for(const id of ids)assert.equal(verify(id,value).ok,true);assert.equal(real.calls.filter(c=>c===kind).length,1);
 const noop=fixture(kind),unchanged=await observe(noop.app,noop.read);for(const id of ids)assert.throws(()=>verify(id,unchanged));
});
