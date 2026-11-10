// Offline checks of the fence kit's pure parts and its document-identity protocol (a fake page over real HTTP).
// node --test scripts/probe-354-fences/kit.test.mjs. Touches no browser, GUI or engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import {SEED,page} from './page.mjs';
import {measuredFrontPid,setupForeground,plan,modeSpec,expectedFinal,analyzeTrace,readbackVerdict,privacyViolation,abortReason,coverage,sentence,FENCE_MODES} from './classify.mjs';
import {matrix} from './matrix.mjs';
import {createFixture,FixtureLost} from './fixture.mjs';

const L=SEED.length;
let seq=0;
const ev=(event,o={})=>({event,seq:seq++,meta:false,len:L,at:seq,...o});
const reset=()=>{seq=0};

test('plan sizes and identities', () => {
 const t=plan({shard:'textarea',reps:20,lanes:['fence','readback','unreadable']}),i=plan({shard:'input',reps:20,lanes:['fence','readback','unreadable']});
 assert.equal(t.length,20*(FENCE_MODES.length*2+3+3));
 assert.equal(i.length,20*(FENCE_MODES.length*2+3));
 assert.equal(new Set(t.map(c=>c.id)).size,t.length);
 assert.ok(t.slice(-60).every(c=>c.part==='unreadable')&&t.slice(0,-60).every(c=>c.part!=='unreadable'));
 assert.equal(plan({shard:'compose',reps:1,lanes:['readback']}).every(c=>c.part==='readback'),true);
 assert.throws(()=>modeSpec('nope'));
});

test('password cells keep the browser frontmost and run after every canvas cell (smoke 42806930603)', () => {
 const t=plan({shard:'textarea',reps:20,lanes:['fence','readback','unreadable']}),tail=t.slice(-60);
 assert.ok(tail.slice(0,20).every(c=>c.editor==='canvas')&&tail.slice(20).every(c=>c.editor==='password'));
 assert.deepEqual([...new Set(tail.slice(20).map(c=>c.mode))].sort(),['readback','readback-concealed']);
 const pids={pid:11,coverPid:22};
 for(const c of t)assert.equal(measuredFrontPid(c,pids),c.editor==='password'?11:22,c.id);
 assert.equal(t.filter(setupForeground).length,40);
 assert.equal(plan({shard:'input',reps:20,lanes:['fence','readback','unreadable']}).some(setupForeground),false);
});

test('intended finals', () => {
 const x=sentence(30);
 assert.equal(x.length,30);
 assert.equal(expectedFinal({part:'fence',scene:'normal',mode:'ax-notify'},x),x);
 assert.equal(expectedFinal({part:'fence',scene:'normal',mode:'ax-control'},x),'Old'+x+' draft sentence goes here.');
 assert.equal(expectedFinal({part:'fence',scene:'already-selected',mode:'ax-control'},x),x);
 assert.equal(expectedFinal({part:'unreadable',scene:'normal',mode:'readback'},x),'Old'+x+' draft sentence goes here.');
});

test('trace: Safari late select-all after the first typed key (run 42776542139 shape)', () => {
 reset();
 const a=analyzeTrace([ev('keydown',{key:'a',meta:true,selection:[0,L]}),ev('keydown',{key:'N',selection:[0,L]}),ev('beforeinput',{selection:[0,L]}),
  ev('input',{selection:[1,0],len:1}),ev('selectionchange',{selection:[1,0],len:1}),ev('selectionchange',{selection:[0,1],len:1}),ev('keydown',{key:'e',selection:[0,1],len:1})],{scene:'already-selected'});
 assert.equal(a.lateEffect,true);assert.equal(a.effectBeforeText,false);assert.equal(a.firstTextKey,'N');
});

test('trace: a late select-all seen only in the next key\'s recorded selection (CFT input shape)', () => {
 reset();
 const a=analyzeTrace([ev('keydown',{key:'a',meta:true,selection:[0,L]}),ev('keyup',{key:'a',meta:true,selection:[0,L]}),ev('keydown',{key:'N',selection:[0,L]}),ev('input',{selection:[1,0],len:1}),ev('keydown',{key:'e',selection:[1,0],len:1}),ev('input',{selection:[2,0],len:2}),ev('keydown',{key:'w',selection:[0,2],len:2})],{scene:'already-selected'});
 assert.equal(a.lateEffect,true);assert.equal(a.effectBeforeText,false);assert.equal(a.fullSelectionEvents,0);
});

test('trace: Safari no-op select-all leaves no event (indeterminate, not confirmed)', () => {
 reset();
 const a=analyzeTrace([ev('keydown',{key:'a',meta:true,selection:[0,L]}),ev('keydown',{key:'N',selection:[0,L]}),ev('input',{selection:[1,0],len:1}),ev('selectionchange',{selection:[1,0],len:1})],{scene:'already-selected'});
 assert.equal(a.effectBeforeText,null);assert.equal(a.lateEffect,false);assert.equal(a.fullSelectionEvents,0);
});

test('trace: marker consumed before the effect vs after it', () => {
 reset();
 const before=analyzeTrace([ev('keydown',{key:'a',meta:true,selection:[3,0]}),ev('keydown',{key:'F20',code:'F20',selection:[3,0]}),ev('selectionchange',{selection:[0,L]}),ev('keydown',{key:'N',selection:[0,L]}),ev('input',{selection:[1,0],len:1})],{scene:'normal'});
 assert.equal(before.markerBeforeEffect,true);assert.equal(before.effectAtMarker,false);assert.equal(before.effectBeforeText,true);
 reset();
 const after=analyzeTrace([ev('keydown',{key:'a',meta:true,selection:[3,0]}),ev('selectionchange',{selection:[0,L]}),ev('keydown',{key:'F20',code:'F20',selection:[0,L]}),ev('keyup',{key:'F20',code:'F20',selection:[0,L]}),ev('keydown',{key:'N',selection:[0,L]}),ev('input',{selection:[1,0],len:1})],{scene:'normal'});
 assert.equal(after.markerBeforeEffect,false);assert.equal(after.effectAtMarker,true);assert.ok(after.markerKeyupAt);
 reset();
 const ctl=analyzeTrace([ev('keydown',{key:'F20',code:'F20',meta:true,selection:[3,0]}),ev('keydown',{key:'N',selection:[3,0]}),ev('input',{selection:[4,0],len:L+1})],{scene:'normal',key:'cmd+F20'});
 assert.ok(ctl.cmdKeydownAt);assert.equal(ctl.markerKeydownAt,null);assert.equal(ctl.fullSelectionEvents,0);
});

test('readback verdicts and privacy', () => {
 assert.equal(readbackVerdict({active:false},{correct:true}),null);
 assert.equal(readbackVerdict({active:true,confirmed:true,status:'confirmed',expected:'x'},{correct:false,intent:'x'}).falseConfirm,true);
 assert.equal(readbackVerdict({active:true,confirmed:false,status:'typeUnconfirmed',reason:'valueMismatch',expected:'y'},{correct:true,intent:'x'}).falseUnconfirmed,true);
 assert.equal(readbackVerdict({active:true,confirmed:false,status:'typeUnconfirmed',reason:'valueMismatch',expected:'x'},{correct:false,intent:'x'}).detectedLoss,true);
 assert.equal(privacyViolation({active:true,secure:true,reason:'secure',before:null,actual:null,expected:null,beforeRange:null}),false);
 assert.equal(privacyViolation({active:true,secure:true,reason:'secure',before:null,actual:'leak',expected:null,beforeRange:null}),true);
 assert.equal(privacyViolation({active:true,secure:false,reason:'concealed',before:'leak'}),true);
 assert.equal(privacyViolation({active:true,secure:false,reason:null,before:'Old',actual:'New'}),false);
 assert.equal(privacyViolation({active:true,secure:false,reason:null,before:'Old',actual:'New'},{passwordField:true}),true);
 assert.equal(privacyViolation({active:true,secure:true,reason:'concealed'},{passwordField:true}),false);
 // A field that became secure or unreadable after the input reports no value, range or caret at all.
 assert.equal(privacyViolation({active:true,secure:false,reason:'becameSecureAfterInput',closedAfterInput:'becameSecureAfterInput',before:null,beforeRange:null,expected:null,actual:null,actualRange:null,expectedCaret:null}),false);
 for(const k of ['before','beforeRange','expected','actual','actualRange','expectedCaret'])assert.equal(privacyViolation({active:true,secure:false,closedAfterInput:'roleUnreadableAfterInput',[k]:k.endsWith('Range')||k==='expectedCaret'?[0,1]:'leak'}),true,k);
});

test('abort and coverage', () => {
 assert.equal(abortReason({consecutiveInvalid:2,setupFailures:5}),null);
 assert.match(abortReason({consecutiveInvalid:3,setupFailures:0}),/consecutive/);
 assert.match(abortReason({consecutiveInvalid:0,setupFailures:6}),/setup/);
 assert.deepEqual(coverage({planned:10,valid:10,aborted:false}).complete,true);
 assert.deepEqual(coverage({planned:10,valid:9,aborted:false}).complete,false);
 assert.deepEqual(coverage({planned:10,valid:10,aborted:true}).complete,false);
});

test('matrix', () => {
 assert.equal(matrix('all').include.length,12);
 assert.deepEqual(matrix('safari-textarea, cft-input').include.map(c=>c.id),['safari-textarea','cft-input']);
 assert.throws(()=>matrix('safari-special'));assert.throws(()=>matrix(' , '));
});

test('page script parses', () => {
 const html=page(),src=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
 assert.doesNotThrow(()=>new Function(src));
});

// A fake page document: the same /cmd and /answer protocol as page.mjs.
function fakeDoc(url,doc,{answer=true}={}){
 let stop=false;const seen=[],nonce='n'+doc;
 const post=o=>fetch(url+'answer',{method:'POST',body:JSON.stringify({doc,...o})});
 (async()=>{await post({op:'ready',nonce,nav:'navigate',at:Date.now()});while(!stop){let c;try{c=await (await fetch(url+'cmd?doc='+doc)).json()}catch{break}
  if(c.op==='idle')continue;if(c.op==='stale'){seen.push('stale');await new Promise(r=>setTimeout(r,50));continue}
  seen.push(c);if(answer&&!stop)await post({n:c.n,op:c.op,cell:c.cell,text:'t-'+doc})}})();
 return {seen,post,nonce,stop:()=>{stop=true}};
}

test('document identity: a hidden realm never takes the visible owner; a lost owner is rebound only to a visible one', async () => {
 const f=await createFixture('<p>x</p>',{idleMs:200,lostMs:400});
 try{
  // The hidden realm is ready first; the visible window shows only A's nonce.
  const hidden=fakeDoc(f.url,'H');await f.waitReady(2000);await new Promise(r=>setTimeout(r,60));
  const a=fakeDoc(f.url,'A');let visible=['probe354f nA — Mozilla Firefox'];
  assert.throws(()=>f.send({op:'read'}),FixtureLost);
  assert.equal(await f.bindVisible(async()=>visible,2000),'A');assert.equal(f.fx.boundNonce,'nA');
  const r=await f.command({op:'read',cell:'c1'});assert.equal(r.text,'t-A');assert.equal(r.doc,'A');
  await new Promise(r=>setTimeout(r,120));
  assert.ok(hidden.seen.includes('stale'));assert.ok(!hidden.seen.some(c=>typeof c==='object'));
  await hidden.post({n:999,op:'read'});assert.ok(f.fx.foreignAnswers.some(x=>x.doc==='H'&&x.n===999));
  // A marker armed before posting catches an acknowledgement that arrives before the waiter; a hidden one never counts.
  const arm=f.armMarker('c2');await a.post({kind:'marker',phase:'keydown',cell:'c2',at:Date.now()});
  await new Promise(r=>setTimeout(r,30));const hit=await f.awaitMarker(arm,Date.now()+200);assert.equal(hit.cell,'c2');
  const arm2=f.armMarker('c3');await hidden.post({kind:'marker',phase:'keydown',cell:'c3'});assert.equal(await f.awaitMarker(arm2,Date.now()+100),null);
  f.disarm();
  // The owner goes away: its command is a loss, the hidden realm is not adopted, a new visible document is.
  a.stop();await new Promise(r=>setTimeout(r,250));
  await assert.rejects(f.command({op:'read',cell:'c4'}),FixtureLost);
  await assert.rejects(f.bindVisible(async()=>visible,500),FixtureLost);
  const b=fakeDoc(f.url,'B');visible=['probe354f nB'];
  assert.equal(await f.bindVisible(async()=>visible,2000),'B');assert.equal(f.fx.bindings.length,2);
  const r2=await f.command({op:'read',cell:'c5'});assert.equal(r2.text,'t-B');
  // An expired command is never handed out later.
  b.stop();await new Promise(r=>setTimeout(r,250));
  await assert.rejects(f.command({op:'read',cell:'c6'},100),FixtureLost);
  hidden.stop();
 }finally{f.close()}
});
