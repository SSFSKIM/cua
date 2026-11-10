import test from 'node:test';
import assert from 'node:assert/strict';
import {cells,summary,timeline} from './readers.mjs';
import {assertVisibleOwner,page,SEED} from './page.mjs';
import vm from 'node:vm';

test('a hidden old fixture cannot remain valid when the visible AX window changes',()=>{
 const owner={pageId:'a'.repeat(32),timeOrigin:100};
 assert.equal(assertVisibleOwner('probe354:'+owner.pageId+' — Firefox',owner),true);
 assert.throws(()=>assertVisibleOwner('probe354:'+'b'.repeat(32),owner),/owner/);
 assert.throws(()=>assertVisibleOwner('Unrelated page',owner),/owner/);
});
test('the generated fixture starts at a different caret and records its full-selection commit',async()=>{
 const id='a'.repeat(32),posts=[],listeners={},host={};let clock=1000;
 const editor={value:'',selectionStart:0,selectionEnd:0,offsetWidth:500,offsetHeight:300,focus(){document.activeElement=this},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b},getBoundingClientRect(){return {x:16,y:50}}};
 const document={title:'',visibilityState:'visible',hasFocus:()=>false,activeElement:null,querySelector:s=>s==='#host'?host:editor,addEventListener:(kind,fn)=>listeners[kind]=fn};
 const ctx=vm.createContext({document,crypto:{randomUUID:()=>id},performance:{timeOrigin:100,now:()=>clock-100},location:{href:'http://fixture/'},Date:{now:()=>clock++},setTimeout(){},fetch:async(_,options)=>posts.push(JSON.parse(options.body))});
 const script=page().match(/<script>([\s\S]*)<\/script>/)[1];vm.runInContext(script.slice(0,script.indexOf('(async()=>'))+'\nglobalThis.run=run;',ctx);
 const command={pageId:id,timeOrigin:100,n:1,ownerEpoch:1,expiresAt:2000,id:'cell',editor:'textarea'};
 await ctx.run({...command,op:'reset'});await ctx.run({...command,n:2,op:'prepare'});
 assert.equal(editor.selectionStart,SEED.length);assert.equal(editor.selectionEnd,SEED.length);
 await ctx.run({...command,n:3,op:'select-all'});assert.equal(editor.selectionStart,0);assert.equal(editor.selectionEnd,SEED.length);
 const committed=posts.at(-1).trace.find(e=>e.event==='script-selected');assert.deepEqual([...committed.selection],[0,29]);assert.equal(typeof committed.monoMs,'number');
 assert.equal(typeof listeners.blur,'function');assert.equal(typeof listeners.focus,'function');
});

test('the plan gives every browser/editor/selection its twenty attempts without mixing diagnostics',()=>{
 const all=cells();assert.equal(new Set(all.map(x=>x.id)).size,all.length);
 assert.equal(all.filter(x=>x.suite==='rate').length,480);
 for(const browser of ['safari','cft','firefox'])for(const editor of ['textarea','input','contenteditable','compose'])for(const selection of ['script','cmd+a'])assert.equal(all.filter(x=>x.suite==='rate'&&x.browser===browser&&x.editor===editor&&x.selection===selection).length,20);
 assert.equal(all.filter(x=>x.suite==='control').length,480);
 assert.equal(all.filter(x=>x.suite==='trace').length,480);
 assert.equal(all.filter(x=>x.suite==='candidate').length,1920);
 assert.equal(all.filter(x=>x.suite==='isolate').length,320);
});
const cell={...cells().find(x=>x.suite==='rate'&&x.selection==='script'),attempt:1};
const row={...cell,valid:true,click:{startedAt:90,endedAt:100,meta:{elementClick:{caret:'placed'}},probe:{events:[{kind:'write-end',name:'AXSelectedTextRange',at:95,range:[3,0]},{kind:'read',name:'AXSelectedTextRange',at:98,range:[3,0]}]}},next:{startedAt:100,endedAt:105,scriptCompletedAt:103},type:{startedAt:105,endedAt:120},samples:[{at:1500,text:'OldNEW draft sentence goes here.',selection:[6,0]}],events:[{event:'script-selected',at:103,selection:[0,29]},{event:'selectionchange',at:110,selection:[3,0]},{event:'input',at:115,selection:[4,0]}],requested:'NEW',clockUncertaintyMs:1};
test('a placed readback followed by an overriding caret is not classified as final',()=>{
 const s=summary([row],[cell]);assert.equal(s.groups[0].wrongFinal,1);assert.equal(s.groups[0].lateCaretAfterScript,1);assert.equal(s.groups[0].placedThenLate,1);assert.equal(s.groups[0].attempted,1);assert.equal(s.groups[0].valid,1);
});
test('a coalesced notification or caret at first input is not invented into a pre-input event',()=>{
 const r={...row,events:[row.events[0],{event:'input',at:115,selection:[4,0]}]};assert.equal(summary([r],[cell]).groups[0].lateCaretAfterScript,0);
});
test('near clock-boundary observations remain ambiguous',()=>{
 const r={...row,clockUncertaintyMs:10};assert.equal(summary([r],[cell]).groups[0].lateCaretAfterScript,0);assert.equal(summary([r],[cell]).groups[0].ambiguousTiming,1);
});
test('refusals and missing coverage stay in requested denominators, never in semantic rates',()=>{
 const refused={...row,valid:false,problem:'click refused',click:{...row.click,error:{errorName:'clickUnconfirmed'}}};
 const s=summary([refused],[cell,{...cell,id:'absent'}]);assert.equal(s.groups[0].requested,2);assert.equal(s.groups[0].attempted,1);assert.equal(s.groups[0].valid,0);assert.equal(s.groups[0].refused,1);assert.equal(s.missing.length,1);
});
test('duplicate evidence is an error, not extra repetitions',()=>{assert.throws(()=>summary([row,row],[cell]),/duplicate/)});
test('smoke cannot silently count toward primary evidence',()=>{
 assert.throws(()=>summary([{...row,smoke:true}],[cell]),/smoke/);
 const s=summary([{...row,smoke:true}],[cell],{smoke:true});assert.equal(s.smoke,true);assert.equal(s.attempted,1);
});
test('candidate false accept and latency use candidate decisions, not final correctness alone',()=>{
 const r={...row,suite:'candidate',mode:'stable100',click:{...row.click,probe:{...row.click.probe,barrier:{confirmed:true,ms:101}}}};
 const g=summary([r],[{...cell,suite:r.suite,mode:r.mode}]).groups[0];assert.equal(g.candidateAcceptedWrongFinal,1);assert.equal(g.barrierMs.p50,101);
});
test('a raised browser remains a semantic trial and separately violates the no-raise constraint',()=>{
 const g=summary([{...row,foregroundViolation:true,windowRaiseObserved:true}],[cell]).groups[0];
 assert.equal(g.valid,1);assert.equal(g.foregroundViolations,1);assert.equal(g.windowRaisesObserved,1);
});
test('timeline preserves source and click/next-call offsets',()=>{
 const t=timeline(row);const e=t.find(x=>x.source==='engine'&&x.kind==='read');assert.equal(e.clickReturnMs,-2);assert.equal(e.nextStartMs,-2);assert.ok(t.some(x=>x.source==='dom'&&x.kind==='selectionchange'&&x.clickReturnMs===10));
});
