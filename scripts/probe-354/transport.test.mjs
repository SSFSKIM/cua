import test from 'node:test';
import assert from 'node:assert/strict';
import {FixtureTransport,FixtureError} from './transport.mjs';
import {page,SEED} from './page.mjs';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const controller=readFileSync(new URL('./measure.mjs',import.meta.url),'utf8');
function section(start,end){const a=controller.indexOf(start),b=controller.indexOf(end,a);assert.ok(a>=0&&b>a);return controller.slice(a,b)}
const A={pageId:'a'.repeat(32),timeOrigin:100,href:'http://fixture/'},B={pageId:'b'.repeat(32),timeOrigin:200,href:'http://fixture/'};
function response(){return {ended:false,handlers:{},end(body){this.ended=true;this.body=JSON.parse(body)},on(e,f){this.handlers[e]=f}}}
function setup(){let now=1000;const events=[],t=new FixtureTransport({now:()=>now,onEvent:e=>events.push(e)});t.register(A);t.register(B);return {t,events,advance:n=>now+=n}}
test('only the AX-window-title-selected realm receives commands; a hidden document cannot steal its poll',()=>{
 const {t}=setup(),visible=response(),hidden=response();t.poll(A,visible);t.poll(B,hidden);
 assert.throws(()=>t.send({op:'reset'}),/owner/);
 t.bindVisible('probe354:'+A.pageId+' — Mozilla Firefox');const n=t.send({op:'reset'});
 assert.equal(visible.body.n,n);assert.equal(visible.body.pageId,A.pageId);assert.equal(hidden.ended,false);
 const q=visible.body;assert.equal(t.accept({...q,cmd:q.n,op:'reset',pageId:B.pageId,timeOrigin:B.timeOrigin}),false);
 assert.equal(t.getAnswers(n).length,0);
 assert.equal(t.accept({...q,cmd:q.n,op:'reset',text:'seed'}),true);assert.equal(t.getAnswers(n)[0].text,'seed');
});
test('unregistered or merely activeElement-focused realms cannot bind; matching page title is required',()=>{
 const {t}=setup();assert.throws(()=>t.bindVisible('probe354'),/title/);assert.throws(()=>t.bindVisible('probe354:'+'c'.repeat(32)),/registered/);
 assert.equal(t.owner,null);
});
test('timed-out queued commands expire and cannot execute when a poll later returns',()=>{
 const {t,advance}=setup();t.bindVisible('probe354:'+A.pageId);const n=t.send({op:'reset'},10);advance(11);
 const res=response();t.poll(A,res);assert.equal(res.ended,false);assert.throws(()=>t.getAnswers(n),/expired|inactive/);
 const next=t.send({op:'read'});assert.equal(res.body.n,next);assert.notEqual(res.body.n,n);
});
test('explicit cancellation removes queued commands and rejects late answers',()=>{
 const {t}=setup();t.bindVisible('probe354:'+A.pageId);const old=t.send({op:'reset'});const q=t.pending.get(old).command;t.cancel(old,'timeout');
 assert.equal(t.accept({...q,cmd:old}),false);const res=response();t.poll(A,res);assert.equal(res.ended,false);
 const next=t.send({op:'read'});assert.equal(res.body.n,next);
});
test('retiring and rebinding even the same document rejects prior-epoch answers',()=>{
 const {t}=setup();t.bindVisible('probe354:'+A.pageId);const res=response();t.poll(A,res);const old=t.send({op:'sample',delays:[0,500]});const q=res.body;
 t.retire('context-loss');t.bindVisible('probe354:'+A.pageId);const current=t.send({op:'sample',delays:[0,500]});
 assert.equal(t.accept({...q,cmd:old,delay:500}),false);assert.equal(t.getAnswers(current).length,0);assert.notEqual(t.owner.ownerEpoch,q.ownerEpoch);
});
test('duplicate, wrong-op, wrong-delay, wrong-timeOrigin and expired sample answers are rejected',()=>{
 const {t,advance}=setup();t.bindVisible('probe354:'+A.pageId);const res=response();t.poll(A,res);const n=t.send({op:'sample',delays:[0,500]},10),q=res.body;
 assert.equal(t.accept({...q,cmd:n,delay:0,timeOrigin:999}),false);
 assert.equal(t.accept({...q,cmd:n,delay:0,op:'read'}),false);
 assert.equal(t.accept({...q,cmd:n,delay:250}),false);
 assert.equal(t.accept({...q,cmd:n,delay:0}),true);assert.equal(t.accept({...q,cmd:n,delay:0}),false);
 assert.equal(t.getAnswers(n).length,1);advance(11);assert.equal(t.accept({...q,cmd:n,delay:500}),false);
});
test('a second poll for the same realm releases the old response instead of orphaning it',()=>{
 const {t}=setup();t.bindVisible('probe354:'+A.pageId);const first=response(),second=response();t.poll(A,first);t.poll(A,second);
 assert.equal(first.ended,true);assert.equal(first.body.op,'idle');const n=t.send({op:'read'});assert.equal(second.body.n,n);
});
function fixture(){
 let now=1000;const posts=[],timers=[],host={},editor={value:'',selectionStart:0,selectionEnd:0,offsetWidth:500,offsetHeight:300,focus(){document.activeElement=this},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b},getBoundingClientRect(){return {x:16,y:50}}};
 const document={title:'',visibilityState:'visible',hasFocus:()=>true,activeElement:null,querySelector:s=>s==='#host'?host:editor,addEventListener(){}};
 const context=vm.createContext({document,crypto:{randomUUID:()=>A.pageId},performance:{timeOrigin:A.timeOrigin},location:{href:A.href},Date:{now:()=>now},setTimeout:(f,ms)=>timers.push({f,ms}),fetch:async(url,options)=>{posts.push({url,options,body:options?.body?JSON.parse(options.body):null});return new Promise(()=>{})}});
 const script=page().match(/<script>([\s\S]*)<\/script>/)[1];vm.runInContext(script.slice(0,script.indexOf('(async()=>'))+'\nglobalThis.run=run;',context);
 // Complete POSTs in run(), while retaining the exact request options for assertions.
 context.fetch=async(url,options)=>{posts.push({url,options,body:JSON.parse(options.body)})};
 return {context,editor,document,posts,timers,advance:n=>now+=n,script};
}
test('page rejects wrong-owner and expired commands before any DOM mutation; acknowledgements retain ownership',async()=>{
 const f=fixture(),q={...A,n:1,ownerEpoch:1,expiresAt:2000,op:'reset',id:'cell',editor:'textarea'};
 assert.equal(f.document.title,'probe354:'+A.pageId);
 await f.context.run(q);assert.equal(f.editor.value,SEED);f.editor.value='KEEP';const count=f.posts.length;
 await f.context.run({...q,pageId:B.pageId});await f.context.run({...q,timeOrigin:999});await f.context.run({...q,expiresAt:999});
 assert.equal(f.editor.value,'KEEP');assert.equal(f.posts.length,count);
 const answer=f.posts[0];assert.equal(answer.options.cache,'no-store');assert.equal(answer.body.pageId,A.pageId);assert.equal(answer.body.timeOrigin,A.timeOrigin);assert.equal(answer.body.ownerEpoch,1);
});
test('a delayed sample from an old epoch cannot fire after rebind/reset',async()=>{
 const f=fixture(),q={...A,n:1,ownerEpoch:1,expiresAt:2000,op:'reset',id:'cell',editor:'textarea'};
 await f.context.run(q);await f.context.run({...q,n:2,op:'sample',delays:[0,500],returnedAt:1000});
 await f.context.run({...q,n:3,ownerEpoch:2});const count=f.posts.length;f.advance(500);f.timers[0].f();assert.equal(f.posts.length,count);
});
test('the actual binder selects the AX title realm, not the first ready document',async()=>{
 const {t}=setup(),pa=response(),pb=response();t.poll(A,pa);t.poll(B,pb);
 const ctx=vm.createContext({Date,FixtureError,transport:t,pid:1,ask:async()=>({windowTitle:'probe354:'+B.pageId,frontmostPid:1}),until:async f=>{assert.equal(f(),true)},sleep:async()=>{}});
 vm.runInContext(section('async function bindVisibleFixture(', '\nasync function restoreFixtureURL('),ctx);const row={};await ctx.bindVisibleFixture(row);
 assert.equal(row.ownerPageId,B.pageId);assert.equal(t.owner.pageId,B.pageId);assert.equal(row.fixtureOwner.axWindow.windowTitle,'probe354:'+B.pageId);
});
test('setup retries are bounded and only restore before a measured action; recovered errors do not poison a valid row',async()=>{
 const events=[],ctx=vm.createContext({native:false,Date,transport:{retire:r=>events.push(r)},prepare:async(_,args,row)=>{events.push('prepare');if(events.filter(e=>e==='prepare').length===1)throw new FixtureError('owner missing');assert.equal(args.excludedPageId,A.pageId);row.fixtureOwner=B},settleSetup:async()=>events.push('settled'),restoreFixtureURL:async()=>{events.push('restore');return A.pageId}});
 vm.runInContext(section('async function prepareTrial(', '\nasync function prepare(w,'),ctx);const row={startedAt:42};await ctx.prepareTrial({}, {},row);
 assert.equal(events.filter(e=>e==='prepare').length,2);assert.equal(events.filter(e=>e==='restore').length,1);assert.equal(row.startedAt,42);assert.equal(row.problem,undefined);assert.equal(row.setupAttempts.length,2);assert.match(row.setupAttempts[0].setupProblem,/owner missing/);
 ctx.prepare=async()=>{throw new FixtureError('still unavailable')};await assert.rejects(ctx.prepareTrial({}, {},{}),/still unavailable/);
});
function cellHarness({loseOwner=false,failSetup=false,startRow=0}={}){
 const events=[],rows=[],owner={...A,ownerEpoch:1};let answers=[];
 const cal={id:'control',valid:true,effect:{text:SEED,selection:[0,SEED.length]},axOracleAvailable:true,axValue:SEED,axRange:[0,SEED.length]};
 const transport={owner,send(){},getAnswers:()=>answers,cancel(){},snapshot:()=>({owner}),retire:()=>events.push('retire')};
 const ctx=vm.createContext({Date,FixtureError,join:(...p)=>p.join('/'),OUT:'/memory',native:false,pid:1,coverPid:2,transport,skipIds:new Set(),skippedCompletedCells:0,rowCount:startRow,consecutiveSetupFailures:0,first20SetupFailures:0,
  budget(){},sentence:()=> 'NEW',calibrations:new Map([['control',cal]]),calibrationKey:()=> 'control',expectation:s=>({value:s.text,range:s.selection,final:'NEW'}),connect:async()=>({close(){}}),
  prepareTrial:async(_,__,row)=>{events.push('setup');if(failSetup)throw new FixtureError('setup unavailable');Object.assign(row,{fixtureOwner:owner,ownerPageId:A.pageId,ownerTimeOrigin:A.timeOrigin})},
  front:async()=>({frontmostPid:2}),rpc:async(_,op)=>{events.push(op);return {startedAt:100,endedAt:101,error:null,probe:null,fixtureOwner:owner,raw:{result:{}}}},clean:r=>r,
  send:q=>{answers=q.delays.map(delay=>({...owner,delay,text:'NEW',selection:[3,0],visibility:'visible',at:101+delay}));return 1},until:async f=>f(),observe:async()=>{},
  ask:async()=>({windowTitle:'probe354:'+(loseOwner?B.pageId:A.pageId)}),readable:s=>typeof s.text==='string',ocr:()=>({}),
  save:row=>{rows.push(row);ctx.rowCount++;ctx.consecutiveSetupFailures=row.setupFailure?ctx.consecutiveSetupFailures+1:0;if(ctx.rowCount<=20&&row.setupFailure)ctx.first20SetupFailures++},
 });
 vm.runInContext(section('async function cell(', '\ntry{\n if(native)'),ctx);return {ctx,rows,events};
}
test('mid-measurement owner loss preserves the posted actions and samples without retrying input',async()=>{
 const h=cellHarness({loseOwner:true});await h.ctx.cell({part:'rate',editor:'textarea',key:'cmd+a',mode:'baseline',rep:1});
 assert.equal(h.rows[0].valid,false);assert.ok(h.rows[0].contextLoss);assert.equal(h.rows[0].ownerPageId,A.pageId);assert.equal(h.rows[0].fixtureOwnershipVersion,3);assert.equal(h.rows[0].samples.length,2);
 assert.equal(h.events.filter(e=>e==='press_key').length,1);assert.equal(h.events.filter(e=>e==='type_text').length,1);assert.equal(h.events.filter(e=>e==='setup').length,1);assert.ok(h.events.includes('retire'));
});
test('the key-to-text boundary remains adjacent with owner-v3',async()=>{
 const h=cellHarness();await h.ctx.cell({part:'rate',editor:'textarea',key:'cmd+a',mode:'baseline',rep:1});assert.equal(h.rows[0].valid,true);
 const at=h.events.indexOf('press_key');assert.equal(h.events[at+1],'type_text');assert.equal(h.rows[0].key.fixtureOwner.pageId,A.pageId);assert.equal(h.rows[0].type.fixtureOwner.pageId,A.pageId);
});
test('three consecutive setup failures abort even after the first hundred cells',async()=>{
 const h=cellHarness({failSetup:true,startRow:100});for(let rep=1;rep<=2;rep++)await h.ctx.cell({part:'rate',editor:'textarea',key:'cmd+a',mode:'baseline',rep});
 await assert.rejects(h.ctx.cell({part:'rate',editor:'textarea',key:'cmd+a',mode:'baseline',rep:3}),/3 consecutive/);assert.equal(h.rows.length,3);assert.ok(!h.events.includes('press_key'));
});
test('the actual HTTP handler applies no-store to page, command, and answer responses',async()=>{
 const source=readFileSync(new URL('./measure.mjs',import.meta.url),'utf8'),start=source.indexOf('const server=createServer('),end=source.indexOf('await new Promise(ok=>server.listen',start);
 const {t}=setup(),ctx=vm.createContext({URL,transport:t,page,createServer:handler=>({handler})});
 vm.runInContext(source.slice(start,end)+'\nglobalThis.handler=server.handler;',ctx);
 const res=()=>({...response(),headers:{},setHeader(k,v){this.headers[k]=v},end(body){this.ended=true;this.body=body}});
 const root=res();await ctx.handler({url:'/'},root);assert.equal(root.headers['Cache-Control'],'no-store');
 const poll=res();await ctx.handler({url:'/cmd?pageId='+A.pageId+'&timeOrigin='+A.timeOrigin},poll);assert.equal(poll.headers['Cache-Control'],'no-store');
 const answer=res(),req={url:'/answer',async *[Symbol.asyncIterator](){yield JSON.stringify({op:'ready',...A})}};await ctx.handler(req,answer);assert.equal(answer.headers['Cache-Control'],'no-store');
});
