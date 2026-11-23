import {test} from 'node:test';
import assert from 'node:assert/strict';
import {plan420, cellName, fields420, score420, summarize420, outcome420, runShape, inspect, FIXED_REFUSALS} from './check.mjs';
import {nonBmpShape} from './page.mjs';

test('plan420 pairs both heads on each of the three cells for 20 repetitions, alternating which head goes first',()=>{
  const rows=plan420(['plain','password']);
  assert.equal(rows.length,120);
  for(const cell of ['nonsecret-plain','nonsecret-password','secret-password']){
    const paired=rows.filter(r=>cellName(r)===cell);
    assert.equal(paired.length,40);
    for(let i=0;i<40;i+=2){assert.equal(paired[i].rep,paired[i+1].rep);assert.notEqual(paired[i].head,paired[i+1].head);}
    assert.notEqual(paired[0].head,paired[2].head);
  }
  assert.ok(rows.every(r=>r.kind==='unicode'));
  assert.equal(rows.filter(r=>r.field==='plain'&&r.literal!==true).length,0);
  assert.equal(plan420(['password']).length,80);
  assert.equal(plan420(['plain']).length,40);
});
test('Firefox runs its password cells on the password-only page and its plain cells on the with-setup page',()=>{
  assert.deepEqual(fields420('firefox','stock'),['password']);
  assert.deepEqual(fields420('firefox','plain'),['plain']);
  for(const lane of ['cft','electron','electron-parity','safari','appkit'])assert.deepEqual(fields420(lane,'stock'),['plain','password']);
  assert.equal(runShape('firefox','nonbmp-420','password').singlePassword,true);
  assert.equal(runShape('firefox','nonbmp-420','plain').singlePassword,false);
  assert.equal(runShape('firefox','full','plain').singlePassword,true);
  assert.equal(runShape('cft','nonbmp-420','plain').singlePassword,false);
});

const refusal={native:true,unposted:true,cause:'droppedCharacter',wrapper:true};
const typed={native:false,unposted:false,cause:null,wrapper:false};
const pasted={plainExact:true,plainEmpty:false,plainKey:true,plainInput:true,exact:true,empty:true,key:false,input:false};
function cell({lane='cft',head='fix',field='plain',literal=true,attested=true,delivery,route,answer='ok',refused=typed,pasteboardUnchanged=null,lengthConfirmed=false}={}){
  const d=delivery??(field==='plain'?pasted:{exact:true,empty:false,key:true,input:true,plainEmpty:true,plainKey:false,plainInput:false});
  return score420({lane,head,field,literal,attested,delivery:d,receipt:{route:route??(['cft','electron','electron-parity'].includes(lane)?'paste':"2'"),answer,refusal:refused},pasteboardUnchanged,lengthConfirmed});
}
test('a non-secret Chromium cell passes only by delivered text, its input event and the paste route',()=>{
  assert.equal(cell().pass,true);
  assert.equal(cell({route:"2'"}).pass,false);
  assert.equal(cell({delivery:{...pasted,plainExact:false}}).pass,false);
  assert.equal(cell({delivery:{...pasted,plainInput:false}}).pass,false);
  assert.equal(cell({field:'password'}).pass,true);
  assert.equal(cell({field:'password',delivery:{exact:false,input:true,key:true}}).pass,false);
  // The plain read-back is the plain field's own; a password field holding the text does not pass a plain cell.
  assert.equal(cell({delivery:{exact:true,input:true,key:true,plainExact:false,plainInput:false}}).pass,false);
  assert.equal(cell({attested:false}).valid,false);
  assert.equal(cell({attested:false}).pass,false);
});
test('a secret Chromium cell passes only as a refusal before any key: nothing posted, field empty, no events, pasteboard untouched',()=>{
  const empty={exact:false,empty:true,key:false,input:false};
  const ok=o=>cell({field:'password',literal:false,answer:'concealed_input_unavailable',refused:refusal,delivery:empty,pasteboardUnchanged:true,...o});
  assert.equal(ok().pass,true);
  assert.equal(ok().refusedClean,true);
  assert.equal(ok({refused:{...refusal,unposted:false}}).pass,false);
  assert.equal(ok({refused:{...refusal,cause:'inputSource'}}).pass,false);
  assert.equal(ok({refused:{...refusal,wrapper:false}}).pass,false);
  assert.equal(ok({refused:{...refusal,native:false}}).pass,false);
  assert.equal(ok({delivery:{...empty,key:true}}).pass,false);
  assert.equal(ok({delivery:{...empty,input:true}}).pass,false);
  assert.equal(ok({delivery:{...empty,empty:false}}).pass,false);
  assert.equal(ok({pasteboardUnchanged:false}).pass,false);
  assert.equal(ok({pasteboardUnchanged:null}).pass,false);
  for(const lane of ['electron','electron-parity'])assert.equal(ok({lane}).pass,true);
});
test('the controls keep typing: keyed delivery, and a secret length-confirmed outside Firefox',()=>{
  for(const lane of ['safari','appkit','firefox']){
    assert.equal(cell({lane}).pass,true,lane);
    assert.equal(cell({lane,route:'paste'}).pass,false,lane);
    assert.equal(cell({lane,field:'password'}).pass,true,lane);
  }
  const secret=o=>cell({field:'password',literal:false,route:"2'",...o});
  assert.equal(secret({lane:'safari',lengthConfirmed:true}).pass,true);
  assert.equal(secret({lane:'appkit',lengthConfirmed:false}).pass,false);
  // Firefox's secret confirmation is uncovered (#419): delivery alone.
  assert.equal(secret({lane:'firefox',lengthConfirmed:false,answer:'secret_input_failed'}).pass,true);
  assert.equal(secret({lane:'firefox',delivery:{exact:false,input:true,key:true}}).pass,false);
  // A refusal is not what a control does.
  assert.equal(secret({lane:'safari',answer:'concealed_input_unavailable',refused:refusal,delivery:{empty:true,key:false,input:false}}).pass,false);
});
test('a success claimed over text that did not arrive is a wrong success',()=>{
  assert.equal(cell({delivery:{...pasted,plainExact:false}}).wrongSuccess,true);
  assert.equal(cell({delivery:{...pasted,plainExact:false},answer:'typeUnconfirmed'}).wrongSuccess,false);
  assert.equal(cell().wrongSuccess,false);
  assert.equal(cell({attested:false,delivery:{...pasted,plainExact:false}}).wrongSuccess,false);
});
test('the outcome gates the fix head alone: every row attested and passing, none a wrong success',()=>{
  const fix=cell(), main={...cell({head:'main',route:"2'"}),head:'main'};
  const rows=[{head:'fix',...fix},{...main}];
  assert.equal(outcome420(rows),true);
  assert.equal(outcome420([...rows,{head:'fix',...cell({route:"2'"})}]),false);
  assert.equal(outcome420([...rows,{head:'fix',...cell(),evidenceFailure:'observation'}]),false);
  assert.equal(outcome420([{head:'main',...main}]),false);
});
test('the summary keeps closed codes and counts per head and cell',()=>{
  const rows=[
    {head:'fix',field:'plain',literal:true,...cell(),unicodeShape:'exact'},
    {head:'main',field:'plain',literal:true,...cell({head:'main',route:"2'",delivery:{...pasted,plainExact:false}}),unicodeShape:'missing'},
  ];
  const s=summarize420(rows);
  assert.equal(s['fix/nonsecret-plain'].passed,1);
  assert.deepEqual(s['fix/nonsecret-plain'].routes,{paste:1});
  assert.deepEqual(s['main/nonsecret-plain'].unicodeShapes,{missing:1});
  assert.equal(s['main/nonsecret-plain'].wrongSuccesses,1);
  assert.equal(JSON.stringify(s).includes('abcd'),false);
});
test('the plain field\'s miss is profiled like the password field\'s',()=>{
  const e='abcd'+String.fromCodePoint(0x1f4a1)+'efg';
  assert.equal(nonBmpShape(e,'abcdefg'),'missing');
});
test('the fixed refusal sentences are value-free and admitted whole, never as a prefix or with a count',()=>{
  const [engine,wrapper]=FIXED_REFUSALS;
  assert.deepEqual(inspect({error:{message:engine,errorName:'concealedInputUnavailable',meta:{startedAt:null,endedAt:null,concealedRefusal:'droppedCharacter'}}},['abcd\u{1f4a1}efg']),[]);
  assert.deepEqual(inspect({message:wrapper,code:'concealed_input_unavailable'},['abcd\u{1f4a1}efg']),[]);
  assert.deepEqual(inspect({message:engine+' entered: 5'},['abcd\u{1f4a1}efg']),['private-name','private-text']);
  assert.deepEqual(inspect({message:'Nothing was entered: 3 of 8'},['abcd\u{1f4a1}efg']),['private-name','private-text']);
  // A fixed sentence still carrying the value fails.
  assert.deepEqual(inspect({message:engine,x:'abcd\u{1f4a1}efg'},['abcd\u{1f4a1}efg']),['synthetic-value']);
});
test('a non-secret refusal before any read keeps its constant zero counters on both heads, and nothing else is admitted',()=>{
  const text='abcd\u{1f4a1}efg',rb=o=>({confirmed:false,reason:'notTextField',snapshotMs:2,pollMs:0,reads:0,...o});
  const at={ipc:r=>({error:{errorName:'typeUnconfirmed',meta:{typeReadback:r}}}),'sky-error':r=>({meta:{typeReadback:r}}),forwarded:r=>({'cua/typeReadback':r})};
  for(const [surface,wrap] of Object.entries(at))for(const reason of ['notTextField','noFocusedElement','secure']){
    assert.deepEqual(inspect(wrap(rb({reason})),[text],{literal:true,surface,preRead:true}),[],surface+' '+reason);
    // Off nonbmp-420 the #414 rule stands: the baseline's secure refusal alone.
    assert.equal(inspect(wrap(rb({reason})),[text],{literal:true,surface}).length>0,true);
  }
  const strict=r=>inspect(at.ipc(r),[text],{literal:true,surface:'ipc',preRead:true});
  assert.notDeepEqual(strict(rb({reads:2})),[]);
  assert.notDeepEqual(strict(rb({reason:'lengthMismatch'})),[]);
  assert.notDeepEqual(strict(rb({actualLength:7})),[]);
  assert.notDeepEqual(strict(rb({secure:true})),[]);
  assert.notDeepEqual(inspect(at.ipc(rb()),[text],{literal:false,surface:'ipc',preRead:true}),[]);
});
