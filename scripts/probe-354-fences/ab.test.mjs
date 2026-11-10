// Offline only: no engine, browser or GUI. Protects the A/B denominator and verdict/reporting boundaries.
import test from 'node:test';
import assert from 'node:assert/strict';
import {abPlan,answer,privacyFindings,summarize,assertPins,armOrder} from './ab-model.mjs';
const ok={jsonrpc:'2.0',id:1,result:{meta:{entered:30}}};
const refused={jsonrpc:'2.0',id:1,error:{code:-32000,errorName:'typeUnconfirmed',message:'Observe, then use setValue.',meta:{entered:30}}};

test('every race/clean cell has twenty trials; unsupported cells cannot silently dilute their denominator',()=>{
 let total=0;
 for(const browser of ['safari','cft','firefox'])for(const editor of ['textarea','input','contenteditable','compose']){
  const cells=abPlan({browser,editor,reps:20});total+=cells.length*2;
  assert.equal(new Set(cells.map(c=>c.id)).size,cells.length);
  for(const key of ['cmd+a','cmd+z','cmd+v'])assert.equal(cells.filter(c=>c.part==='race'&&c.key===key).length,20);
  for(const length of [30,120,500])assert.equal(cells.filter(c=>c.part==='clean'&&c.length===length).length,20);
  assert.ok(cells.filter(c=>c.part==='race').every(c=>c.length===30));
  assert.equal(cells.filter(c=>c.part==='unsupported').length,editor==='textarea'?60:0);
  assert.ok(cells.filter(c=>c.part==='unsupported').every(c=>c.editor==='canvas'||c.editor==='password'));
  assert.equal(cells.filter(c=>c.part==='unchanged').length,editor==='input'?40:0);
  assert.equal(cells.filter(c=>c.part==='truncation'&&c.variant==='spike').length,browser==='cft'&&editor==='textarea'?20:0);
  assert.equal(cells.filter(c=>c.part==='substitution').length,browser==='cft'&&editor==='contenteditable'?40:0);
 }
 assert.equal(total,4984);
 assert.deepEqual(abPlan({browser:'cft',editor:'textarea',reps:1}).slice(-3,-1).map(c=>c.editor),['password','password']);
 for(const browser of ['safari','cft','firefox'])for(const editor of ['textarea','input','contenteditable','compose']){
  const cells=abPlan({browser,editor,reps:20});assert.equal(cells.filter(c=>c.part==='ending-tab').length,1);assert.equal(cells.at(-1).part,'ending-tab');
 }
 assert.throws(()=>abPlan({browser:'cft',editor:'input',reps:0}));
 assert.throws(()=>abPlan({browser:'native',editor:'input',reps:20}));
});

test('only a real result is success; typeUnconfirmed remains a scored answer, not a setup loss',()=>{
 assert.deepEqual(answer(ok),{success:true,unconfirmed:false,errorName:null});
 assert.deepEqual(answer(refused),{success:false,unconfirmed:true,errorName:'typeUnconfirmed'});
 assert.deepEqual(answer({error:{errorName:'intervened'}}),{success:false,unconfirmed:false,errorName:'intervened'});
 assert.throws(()=>answer({id:1}));
 assert.throws(()=>answer({...ok,error:refused.error}));
});

test('a later wrong value dominates success; an honest refusal stays in the rate denominator',()=>{
 const base={recordKind:'cell',arm:'branch',browser:'cft',editor:'textarea',part:'race',key:'cmd+a',length:30,variant:'spike',valid:true};
 const rows=[{...base,id:'bad',correct:false,typeRPC:{raw:ok,durationMs:10}},
  {...base,id:'refusal',correct:false,typeRPC:{raw:refused,durationMs:1000}},
  {...base,id:'right',correct:true,typeRPC:{raw:ok,durationMs:20}},
  {...base,id:'invalid',valid:false,problem:'fixture lost'},
  {...base,id:'warm',recordKind:'warmup',correct:false,typeRPC:{raw:ok,durationMs:1}}];
 const s=summarize(rows);
 assert.deepEqual(s.wrongSuccesses.map(r=>r.id),['bad']);
 assert.equal(s.groups.length,1);
 assert.deepEqual(s.groups[0],{arm:'branch',browser:'cft',editor:'textarea',part:'race',key:'cmd+a',length:30,variant:'spike',attempted:4,valid:3,invalid:1,success:2,unconfirmed:1,keysUnconfirmed:0,otherErrors:0,wrong:2,wrongSuccess:1,falseUnconfirmed:0,privacyViolations:0});
 assert.equal(s.cost.find(c=>c.path==='unconfirmed-race-or-substitution').p95,1000);
});

test('an unconfirmed-ending-key qualifier cannot hide wrong success in an ordinary race cell',()=>{
 const raw={result:{meta:{typeReadback:{confirmed:true,keysUnconfirmed:1,checkpoints:1}}}},base={recordKind:'cell',arm:'branch',browser:'cft',editor:'input',key:'cmd+a',length:30,variant:'spike',valid:true,correct:false,text:'Tab prefix\t',expectedFinal:'Tab prefix',typeRPC:{raw,durationMs:10}};
 const witness={event:'keydown',key:'Tab',targetEditor:true,text:'Tab prefix',seq:85};
 const s=summarize([{...base,id:'ordinary',part:'race',trace:[witness]},
  {...base,id:'ending-wrong-prefix',part:'ending-tab',expectedAnswer:'keysUnconfirmed',trace:[{...witness,text:'Tab pre'}]},
  {...base,id:'ending-qualified',part:'ending-tab',expectedAnswer:'keysUnconfirmed',trace:[witness]}]);
 assert.deepEqual(s.wrongSuccesses.map(r=>r.id).sort(),['ending-wrong-prefix','ordinary']);
 assert.equal(s.groups.find(g=>g.part==='ending-tab').keysUnconfirmed,2);
});

test('clean false refusals and cost are reported separately from wrong race values',()=>{
 const b={recordKind:'cell',browser:'safari',editor:'compose',part:'clean',key:'cmd+a',length:120,variant:'spike',valid:true,correct:true};
 const rows=[{...b,id:'a',arm:'main',typeRPC:{raw:ok,durationMs:100}},
  {...b,id:'b',arm:'branch',typeRPC:{raw:ok,durationMs:130}},
  {...b,id:'c',arm:'branch',typeRPC:{raw:refused,durationMs:1200}}];
 const s=summarize(rows);
 assert.equal(s.groups.find(g=>g.arm==='branch').falseUnconfirmed,1);
 assert.equal(s.cost.find(c=>c.arm==='branch'&&c.path==='clean-all').p95,1200);
 assert.equal(s.cost.find(c=>c.arm==='branch'&&c.path==='clean-success').p50,130);
});

const noReads={textReadAttempts:0,rangeReadAttempts:0,byAttribute:{}};
test('secure, concealed and canvas error payloads never carry values; length metadata is allowed',()=>{
 assert.deepEqual(privacyFindings(refused,{privateField:true,audit:noReads}),[]);
 assert.deepEqual(privacyFindings({...refused,error:{...refused.error,expectedLength:30,actualLength:29}},{privateField:true,audit:noReads}),[]);
 assert.ok(privacyFindings({...refused,error:{...refused.error,readback:{actual:'fixture text'}}},{privateField:true,audit:noReads}).some(p=>p.includes('actual')));
 assert.ok(privacyFindings({...refused,error:{...refused.error,expectedExcerpt:'fixture text'}},{privateField:true,audit:noReads}).length);
 assert.deepEqual(privacyFindings({...refused,error:{...refused.error,actual:'x'}},{privateField:false}),[]);
 assert.ok(privacyFindings({...refused,error:{...refused.error,message:'Mismatch: Old draft sentence goes here.'}},{privateField:true,audit:noReads,knownValues:['Old draft sentence goes here.']}).includes('error.message'));
});

test('privacy audit rejects range-only reads even when the response is value-free and text reads are zero',()=>{
 // Negative control: an internal range read is a violation even if no value or range escapes in the answer.
 const rangeOnly={textReadAttempts:0,rangeReadAttempts:1,byAttribute:{AXSelectedTextRange:1}};
 assert.ok(privacyFindings(refused,{privateField:true,audit:rangeOnly}).some(p=>p.includes('range-read')));
 assert.ok(privacyFindings(refused,{privateField:true,audit:{...noReads,textReadAttempts:1,byAttribute:{AXValue:1}}}).some(p=>p.includes('text-read')));
 for(const audit of [undefined,{textReadAttempts:0,byAttribute:{}},{...noReads,rangeReadAttempts:null},{...noReads,rangeReadAttempts:-1}]){
  assert.ok(privacyFindings(refused,{privateField:true,audit}).length,'missing or invalid range accounting cannot certify zero reads');
 }
 assert.deepEqual(privacyFindings(refused,{privateField:true,audit:noReads}),[]);
});

test('pending or mutable heads cannot reach a hosted measurement; pair order is counterbalanced',()=>{
 assert.throws(()=>assertPins('9020bb18','PENDING_BRANCH_HEAD'));
 assert.throws(()=>assertPins('a'.repeat(40),'fix/354-type-readback'));
 assert.equal(assertPins('a'.repeat(40),'b'.repeat(40)),true);
 const orders=[];for(const b of ['safari','cft','firefox'])for(const e of ['textarea','input','contenteditable','compose'])orders.push(armOrder(b,e).join(','));
 assert.equal(orders.filter(s=>s==='main,branch').length,6);
 assert.equal(orders.filter(s=>s==='branch,main').length,6);
});
