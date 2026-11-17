import test from 'node:test';
import assert from 'node:assert/strict';
import {plan,judge,summarize,timeline,confirmation,ab} from './read.mjs';
import {FixtureTransport} from './transport.mjs';
import {createLifecycle,pressMarker,valueMarker} from './fixture/lifecycle.mjs';
import {windowOptions} from './fixture/window-options.mjs';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const here=dirname(fileURLToPath(import.meta.url));

const state=(open=true,presses=0,value='')=>({pageId:'a'.repeat(32),timeOrigin:1000,trial:'t',visibility:'visible',open,presses,value,reactValue:value,events:[]});
const row=(extra={})=>({id:'t',phase:'rate',browser:'electron',variant:'main',scene:'modal',foreground:false,operation:'press',rep:0,valid:true,expected:'needle',before:state(),after:state(true,1),call:{startedAt:2000,endedAt:2010,raw:{result:{meta:{inputRoute:3}}}},samples:[],...extra});

test('rates do not turn setup failures, dropped actions or closed dialogs into delivery',()=>{
 const rows=[row(),row({id:'drop',after:state(false,0)}),row({id:'refused',after:state(),call:{raw:{error:{name:'unconfirmed'}}}}),row({id:'bad',valid:false,problem:'setup failed'})];
 assert.deepEqual(rows.map(judge).map(j=>[j.eligible,j.delivered,j.falseSuccess,j.closed]),[[true,true,false,false],[true,false,true,true],[true,false,false,false],[false,false,false,false]]);
 const s=summarize(rows)[0];
 assert.equal(s.attempted,4);assert.equal(s.valid,3);assert.equal(s.invalid,1);assert.equal(s.answeredOK,2);assert.equal(s.falseSuccess,1);assert.equal(s.delivered,1);assert.equal(s.closed,1);
 assert.deepEqual(s.callMs,{p50:10,p95:10,max:10});
});
test('a value is delivered only when the dialog and controlled value both survive',()=>{
 assert.equal(judge(row({operation:'value',after:state(true,0,'needle')})).delivered,true);
 assert.equal(judge(row({operation:'value',after:{...state(true,0,'needle'),reactValue:''}})).falseSuccess,true);
 assert.equal(judge(row({operation:'value',after:state(false,0,'needle')})).delivered,false);
 assert.equal(judge(row({after:{...state(true,1),pageId:'b'.repeat(32)}})).eligible,false);
 assert.equal(judge(row({before:state(true,1)})).eligible,false);
});
test('bounded AX disappearance is a refusal estimator, not proof of a button handler',()=>{
 const r=row({after:state(false,0),samples:[{at:2012,ax:{dialog:false,marker:0,value:null}},{at:2060,ax:{dialog:false,marker:0,value:null}}]});
 assert.deepEqual(confirmation(r,250),{policy:'dialog-survives',confirmed:false,decisionAt:2012,addedMs:2,deliveryProof:false});
 const dropped=row({after:state(),samples:[{at:2015,ax:{dialog:true,marker:0,value:''}},{at:2260,ax:{dialog:true,marker:0,value:''}}]});
 assert.equal(confirmation(dropped,250).confirmed,true);
 assert.equal(confirmation(dropped,250,'effect').confirmed,false);
 const good=row({samples:[{at:2015,ax:{dialog:true,marker:0,value:''}},{at:2060,ax:{dialog:true,marker:1,value:''}}]});
 assert.equal(confirmation(good,250,'effect').addedMs,50);
 assert.equal(confirmation(good,250,'effect').deliveryProof,true);
 const late=row({samples:[{at:2015,ax:{dialog:true,marker:0,value:''}},{at:3000,startedAt:2990,ax:{dialog:true,marker:1,value:''}}]});
 assert.equal(confirmation(late,250,'effect').confirmed,false);
 assert.equal(confirmation(late,250,'effect').addedMs,250);
});
test('timeline preserves asynchronous page events against native substeps and call boundaries',()=>{
 const r=row({after:{...state(false,0),events:[{at:2004.5,type:'pointerdown',target:'outside'},{at:2005,type:'onOpenChange',open:false}]},trace:[{at:2003,kind:'post',eventType:1},{at:2007,kind:'perform.begin',action:'AXPress'}]});
 assert.deepEqual(timeline(r).map(e=>[e.offsetMs,e.type??e.kind]),[[0,'call.begin'],[3,'post'],[4.5,'pointerdown'],[5,'onOpenChange'],[7,'perform.begin'],[10,'call.end']]);
});
test('cross-process timelines use renderer wall time when performance clocks drift',()=>{
 const r=row({after:{...state(false,0),events:[{at:1950,wallAt:2004,type:'pointerdown'},{at:1951,wallAt:2005,type:'onOpenChange'}]},trace:[{at:2003,kind:'post'},{at:2007,kind:'perform.begin'}]});
 const events=timeline(r);
 assert.deepEqual(events.map(e=>[e.offsetMs,e.type??e.kind]),[[0,'call.begin'],[3,'post'],[4,'pointerdown'],[5,'onOpenChange'],[7,'perform.begin'],[10,'call.end']]);
 assert.equal(events[2].performanceAt,1950);
});
test('MAWS-parity and default windows share focus preferences and differ only in native title chrome',()=>{
 const parity=windowOptions('maws'),control=windowOptions('default');
 assert.equal(parity.titleBarStyle,'hiddenInset');assert.deepEqual(parity.trafficLightPosition,{x:16,y:15});
 assert.deepEqual(parity.webPreferences,{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,plugins:true});
 assert.equal(parity.show,false);assert.equal(parity.width,1440);assert.equal(parity.height,900);
 assert.equal(parity.minWidth,960);assert.equal(parity.minHeight,600);
 assert.equal(parity.frame,undefined);assert.equal(parity.vibrancy,undefined);
 const {titleBarStyle:p,trafficLightPosition:t,...rest}=parity;
 const {titleBarStyle:c,...restControl}=control;
 assert.equal(c,'default');assert.deepEqual(rest,restControl);
 const a=plan({browser:'electron',smoke:true}),b=plan({browser:'electron-parity',smoke:true});
 assert.equal(b.length,60);assert.equal(new Set([...a,...b].map(r=>r.id)).size,120);
});
test('paired A/B excludes invalid pairs and prices the same repetition',()=>{
 const a=row({rep:0}),b=row({rep:0,variant:'bare',call:{startedAt:2000,endedAt:2005,raw:{result:{}}}});
 const a1=row({rep:1}),b1=row({rep:1,variant:'bare',valid:false});
 const p=ab([a,b,a1,b1])[0];
 assert.equal(p.paired,1);assert.equal(p.incomplete,1);assert.equal(p.mainDelivered,1);assert.equal(p.candidateDelivered,1);
 assert.deepEqual(p.deltaCallMs,{p50:-5,p95:-5,max:-5});
});
test('fixture transport rejects wrong realms, expired work and duplicate answers',()=>{
 let now=1000;const t=new FixtureTransport({now:()=>now});
 const owner={pageId:'a'.repeat(32),timeOrigin:500},other={pageId:'b'.repeat(32),timeOrigin:600};
 t.register(owner);t.register(other);t.bind('probe366:'+owner.pageId);
 const n=t.send({op:'read'}),q=t.pending.get(n).command;
 assert.equal(t.accept({...q,...other,cmd:n}),false);
 assert.equal(t.accept({...q,timeOrigin:501,cmd:n}),false);
 assert.equal(t.accept({...q,op:'reset',cmd:n}),false);
 assert.equal(t.accept({...q,cmd:n}),true);assert.equal(t.accept({...q,cmd:n}),false);
 const n2=t.send({op:'read'}),q2=t.pending.get(n2).command;now=12000;
 assert.equal(t.accept({...q2,cmd:n2}),false);
 t.bind('probe366:'+other.pageId);assert.equal(t.answer(n),undefined);
});
test('plan is reproducible, balanced and no measured action is retried',()=>{
 const full=plan({browser:'electron',smoke:false}),smoke=plan({browser:'electron',smoke:true});
 assert.equal(full.filter(c=>c.phase==='rate').length,560);
 assert.equal(full.filter(c=>c.phase==='diagnostic').length,96);
 assert.equal(smoke.filter(c=>c.phase==='rate').length,28);
 assert.equal(smoke.filter(c=>c.phase==='diagnostic').length,32);
 assert.equal(new Set(full.map(c=>c.id)).size,full.length);
 assert.deepEqual(plan({browser:'electron',smoke:false}),full);
 assert.equal(full.filter(c=>c.variant==='no-focus'&&c.operation==='press').length,0);
 assert.equal(full.filter(c=>c.variant==='no-click'&&c.foreground).length,0);
});

test('reset drains the old Radix close lifecycle instead of guessing a delay',async()=>{
 const lifecycle=createLifecycle(),log=[];
 assert.equal(await lifecycle.drained(),undefined); // nothing opened yet
 // Model react-focus-scope: unmount schedules a zero-timer that fires the close event, then focuses the trigger.
 const open=()=>lifecycle.mounted();
 const unmount=()=>setTimeout(()=>{lifecycle.closed();log.push('trigger focused');},0);
 open();unmount();
 const drained=lifecycle.drained().then(()=>log.push('reopen'));
 assert.deepEqual(log,[]);
 await drained;
 assert.deepEqual(log,['trigger focused','reopen']); // reopen's continuation runs after Radix's own callback
 // A dismissal caused by the previous action may still have a pending close; reset waits for it too.
 open();unmount();
 await lifecycle.drained();assert.equal(lifecycle.idle(),true);
});
test('a stuck close lifecycle fails the fixture and does not leave a waiter behind',async()=>{
 const lifecycle=createLifecycle();lifecycle.mounted();
 await assert.rejects(lifecycle.drained(5),/did not complete/);
 lifecycle.closed();assert.equal(lifecycle.idle(),true); // late completion is harmless
});
test('each marker renders as one text node',()=>{
 assert.equal(pressMarker(3),'Press marker 3');assert.equal(valueMarker('x'),'Search marker x');
 const require=createRequire(join(here,'fixture/package.json'));let server;
 try {server=require('react-dom/server');} catch {return;} // dependencies are installed by the workflow
 const React=require('react');
 assert.equal(server.renderToStaticMarkup(React.createElement('p',null,pressMarker(3))),'<p>Press marker 3</p>');
 assert.equal(server.renderToString(React.createElement('p',null,pressMarker(3))),'<p>Press marker 3</p>'); // no <!-- --> text-node split
});
test('AX lookup failures leave dialog presence unknown; only a clean complete walk proves absence',{skip:process.platform!=='darwin'||spawnSync('swiftc',['--version']).status!==0&&'swiftc unavailable'},()=>{
 const swift=readFileSync(join(here,'tool.swift'),'utf8'),begin=swift.indexOf('// presence:begin'),end=swift.indexOf('// presence:end');
 assert.ok(begin>=0&&end>begin);
 const dir=mkdtempSync(join(tmpdir(),'p366-presence-'));
 try {
  // Pure decision logic only: no AX call, no window and no GUI binary.
  const main=`import ApplicationServices
import Foundation
${swift.slice(begin,end)}
func check(_ ok: Bool, _ what: String) { if !ok { print("FAIL " + what); exit(1) } }
let timeout = ["AXRole:" + String(AXError.cannotComplete.rawValue): 1]
check(presence(found: false, complete: true, errors: [:]) == false, "clean absence")
check(presence(found: false, complete: true, errors: timeout) == nil, "role timeout is not absence")
check(presence(found: false, complete: false, errors: [:]) == nil, "incomplete walk is not absence")
check(presence(found: true, complete: false, errors: timeout) == true, "found button proves presence")
check(benign(.success) && benign(.attributeUnsupported) && benign(.noValue), "absent attributes are benign")
check(!benign(.cannotComplete) && !benign(.invalidUIElement) && !benign(.failure), "lookup errors are not benign")
print("ok")
`;
  writeFileSync(join(dir,'main.swift'),main);
  const build=spawnSync('swiftc',['-o',join(dir,'presence'),join(dir,'main.swift')],{encoding:'utf8'});
  assert.equal(build.status,0,build.stderr);
  const run=spawnSync(join(dir,'presence'),{encoding:'utf8'});
  assert.equal(run.stdout.trim(),'ok',run.stdout+run.stderr);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('null dialog reads never confirm, and are surfaced instead of counted as disappearance',()=>{
 const unknown=ax=>({dialog:null,marker:null,value:null,...ax});
 const r=row({after:state(false,0),samples:[{at:2012,ax:unknown()},{at:2060,ax:unknown()},{at:2300,startedAt:2290,ax:unknown()}]});
 for(const policy of ['dialog-survives','effect']) {
  const c=confirmation(r,250,policy);
  assert.equal(c.confirmed,false);assert.equal(c.deliveryProof,false);
  assert.equal(c.addedMs,250,'unknown reads still cost the full bounded wait');
 }
 // An unknown read followed by a definite absence is decided by the definite read, at its real time.
 const later=row({after:state(false,0),samples:[{at:2012,ax:unknown()},{at:2100,ax:{dialog:false,marker:null,value:null}}]});
 assert.deepEqual(confirmation(later,250),{policy:'dialog-survives',confirmed:false,decisionAt:2100,addedMs:90,deliveryProof:false});
 const s=summarize([r,row()])[0];
 assert.equal(s.axUnknownRows,1);
});
