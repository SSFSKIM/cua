import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {page} from '../probe-354/page.mjs';
import {pageQualification,layout,hashText,SEED} from './qualification-page.mjs';

test('keeps the owner-v3 scaffold of the inherited page verbatim',()=>{
 const base=page(),mine=pageQualification();
 for(const f of [
  "document.title='probe354:'+identity.pageId",
  "if(!c.n||c.pageId!==identity.pageId||c.timeOrigin!==identity.timeOrigin||c.ownerEpoch<latestEpoch||Date.now()>c.expiresAt)return;",
  "latestEpoch=c.ownerEpoch;const reply=o=>send({...o,ownerEpoch:c.ownerEpoch});",
  "const send=o=>fetch('/answer',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({...identity,href:location.href,...o})});",
  "if(c.ownerEpoch!==latestEpoch||Date.now()>c.expiresAt)return;",
  "(async()=>{await send({op:'ready',at:Date.now(),visibility:document.visibilityState});for(;;){try{const r=await fetch('/cmd?pageId='+identity.pageId+'&timeOrigin='+identity.timeOrigin,{cache:'no-store'});const c=await r.json();if(!c.n){await new Promise(r=>setTimeout(r,100));continue}try{await run(c)}catch(error){await send({cmd:c.n,id,op:c.op,ownerEpoch:c.ownerEpoch,error:String(error),at:Date.now()})}}catch{await new Promise(r=>setTimeout(r,100))}}})();",
 ]){assert.ok(base.includes(f),'inherited lost '+f);assert.ok(mine.includes(f),'qualification lost '+f)}
});

test('layout: original keys keep the 29-char end seed, navigation keys get interior caret and scroll',()=>{
 for(const e of ['textarea','input','contenteditable','compose'])for(const k of ['Left','alt+Left','cmd+Left','cmd+shift+Left']){
  const l=layout(e,k);assert.equal(l.text,SEED);assert.equal(l.caret,29);assert.equal(l.kind,'seed');assert.equal(l.scrollTop,0);
 }
 for(const k of ['Home','End','PageUp','PageDown']){
  for(const e of ['textarea','contenteditable']){const l=layout(e,k);assert.equal(l.lines.length,120);assert.equal(l.text.split('\n').length,120);assert.ok(l.caret>0&&l.caret<l.textLength);assert.equal(l.scrollTop,24*55);assert.equal(l.text.slice(l.caret-17,l.caret).startsWith('L060'),true)}
  const c=layout('compose',k);assert.equal(c.text.includes('\n'),false);assert.equal(c.textLength,120*39);assert.equal(c.text.slice(c.caret-17,c.caret).startsWith('L060'),true);
  const i=layout('input',k);assert.equal(i.text.includes('\n'),false);assert.ok(i.textLength>1000);assert.equal(i.text.slice(i.caret-17,i.caret).startsWith('L020'),true);
 }
 assert.deepEqual(layout('textarea','Home'),layout('textarea','Home'));
 assert.equal(hashText(layout('textarea','Home').text),layout('textarea','Home').textHash);
 assert.throws(()=>layout('textarea','cmd+z'),/unknown fixture key/);
});

function harness(){
 const answers=[];let field,host;
 const root={tagName:'HTML',id:'',scrollTop:0,scrollLeft:0,scrollHeight:700,scrollWidth:640,clientHeight:700,clientWidth:640,parentElement:null};
 const body={tagName:'BODY',id:'',scrollTop:0,scrollLeft:0,scrollHeight:300,scrollWidth:640,clientHeight:300,clientWidth:640,parentElement:root};
 const mk=tag=>{const f={tag,value:'',selectionStart:0,selectionEnd:0,selectionDirection:'none',scrollLeft:0,scrollHeight:tag==='input'?44:2896,scrollWidth:tag==='input'?15400:520,clientHeight:tag==='input'?44:232,clientWidth:520,offsetWidth:520,offsetHeight:234,parentElement:host,
  focus(){document.activeElement=this},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b},getBoundingClientRect:()=>({x:0,y:0})};
  Object.defineProperty(f,'scrollTop',{get(){return f._t??0},set(v){f._t=Math.min(v,f.scrollHeight-f.clientHeight)}});return f};
 host={tagName:'DIV',id:'host',scrollTop:0,scrollLeft:0,scrollHeight:260,scrollWidth:520,clientHeight:260,clientWidth:520,parentElement:body,set innerHTML(v){field=mk(/^<input/.test(v)?'input':'textarea')}};
 const document={activeElement:null,visibilityState:'visible',hasFocus:()=>true,scrollingElement:root,addEventListener(){},querySelector:s=>s==='#host'?host:field,createElement:()=>({getContext:()=>({measureText:()=>({width:9.6})})})};
 const context=vm.createContext({document,crypto:{randomUUID:()=> 'a'.repeat(32)},performance:{timeOrigin:123},location:{href:'http://fixture/'},Date,console,setTimeout,
  fetch:async(url,options)=>{if(url==='/answer'){answers.push(JSON.parse(options.body));return {}}return new Promise(()=>{})}});
 vm.runInContext(pageQualification().match(/<script>([\s\S]*)<\/script>/)[1],context);
 const run=vm.runInContext('run',context);let n=1;
 const send=async(q,epoch=1,pageId='a'.repeat(32))=>{const before=answers.length;await run({pageId,timeOrigin:123,ownerEpoch:epoch,expiresAt:Date.now()+10000,n:n++,...q});return answers.length>before?answers.at(-1):null};
 return {send,answers,get field(){return field}};
}

test('reset and prepare record deterministic text and position; arm, read and sample never mutate',async()=>{
 const h=harness();
 const r=await h.send({op:'reset',editor:'textarea',id:'t',key:'Home'});
 const L=layout('textarea','Home');
 assert.equal(r.text,L.text);assert.equal(r.textHash,L.textHash);assert.deepEqual(r.selection,[L.caret,0]);assert.equal(r.fixture.kind,'long');
 assert.deepEqual(r.fixture.initial.selection,[L.caret,0]);assert.equal(r.fixture.scrollSetup.reached,true);assert.equal(r.scroll.field.top,L.scrollTop);
 assert.equal(r.scroll.ancestors.length,3);assert.equal(r.scroll.document.top,0);
 const p=await h.send({op:'prepare',editor:'textarea',key:'Home'});
 assert.deepEqual(p.fixture.initial,r.fixture.initial);assert.equal(p.text,L.text);
 // an external change must be reported by arm/read/sample, never repaired
 h.field.selectionStart=h.field.selectionEnd=5;h.field.scrollTop=10;
 const a=await h.send({op:'arm'}),rd=await h.send({op:'read'});
 for(const s of [a,rd]){assert.deepEqual(s.selection,[5,0]);assert.equal(s.scroll.field.top,10)}
 assert.equal(a.text,undefined);assert.equal(rd.text,L.text);assert.equal(h.field.value,L.text);
 const before=h.answers.length;await h.send({op:'sample',returnedAt:Date.now(),delays:[0]});
 assert.equal(h.answers.length,before+1);assert.equal(h.answers.at(-1).delay,0);assert.equal(h.answers.at(-1).selection[0],5);assert.equal(h.field.scrollTop,10);
 assert.deepEqual((await h.send({op:'prepare',editor:'textarea',key:'Home'})).selection,[L.caret,0]);
 await assert.rejects(h.send({op:'prepare',editor:'input',key:'Left'}),/differs from reset editor/);
});

test('input stays single-line with interior sideways scroll; seed keys give the end caret',async()=>{
 const h=harness();
 const r=await h.send({op:'reset',editor:'input',id:'t',key:'End'}),L=layout('input','End');
 assert.deepEqual(r.selection,[L.caret,0]);assert.equal(r.text.includes('\n'),false);
 assert.ok(r.scroll.field.left>1&&r.scroll.field.left<r.scroll.field.width-r.scroll.field.clientWidth);assert.equal(r.fixture.scrollSetup.reached,true);
 const s=await h.send({op:'prepare',editor:'input',key:'Left'});
 assert.equal(s.text,SEED);assert.deepEqual(s.selection,[29,0]);assert.equal(s.scroll.field.left,0);
});

test('stale owner epoch and wrong page nonce are ignored',async()=>{
 const h=harness();await h.send({op:'reset',editor:'textarea',id:'t',key:'Left'},2);
 assert.equal(await h.send({op:'read'},1),null);
 assert.equal(await h.send({op:'read'},2,'b'.repeat(32)),null);
 assert.equal((await h.send({op:'read'},2)).selection[0],29);
});
