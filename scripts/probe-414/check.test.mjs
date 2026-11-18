import {test} from 'node:test';
import assert from 'node:assert/strict';
import {plan, score, inspect, auditSchedule, auditPairs, summarize} from './check.mjs';

const success={confirmed:true,secure:true,confirmation:'length',snapshotMs:4};
const old={confirmed:false,concealed:true,reason:'secure',snapshotMs:3};
function row({head='fix',kind='short',raw=success,forwarded=raw,sky=raw.confirmed?'ok':'typeUnconfirmed',fixture=true,domExact=true,controlExact=null}={}){
  return score({head,kind,raw,forwarded,sky,fixture,domExact,controlExact});
}
test('plan balances each cell and interleaves product pins',()=>{
  const rows=plan(false);
  assert.equal(rows.length,105);
  for(const kind of ['short','long','selection','literal']){
    const paired=rows.filter(r=>r.kind===kind);
    assert.equal(paired.length,10);
    for(let i=0;i<10;i+=2){assert.equal(paired[i].rep,paired[i+1].rep);assert.notEqual(paired[i].head,paired[i+1].head);}
  }
  for(const kind of ['drop','add'])assert.equal(rows.filter(r=>r.kind===kind&&r.head==='fix').length,10);
  assert.equal(rows.filter(r=>r.kind==='rewrite').length,5);
  for(const head of ['main','fix'])assert.equal(rows.filter(r=>r.kind==='unicode'&&r.head===head).length,20);
  assert.equal(plan(true).length,13);
});
test('score requires a length-marked success on both surfaces and independently exact delivery',()=>{
  assert.equal(row().pass,true);
  assert.equal(row({head:'main',raw:old}).pass,true);
  assert.equal(row({raw:{confirmed:true,secure:true}}).pass,false);
  assert.equal(row({forwarded:old}).pass,false);
  assert.equal(row({domExact:false}).wrongSuccess,true);
  assert.equal(row({kind:'drop',raw:old,domExact:false,controlExact:true}).pass,true);
  assert.equal(row({kind:'drop',raw:old,domExact:false,controlExact:false}).pass,false);
  assert.equal(row({kind:'drop',raw:old,fixture:false}).valid,false);
  assert.equal(row({kind:'rewrite',domExact:false,controlExact:true}).informational,true);
  assert.equal(row({kind:'rewrite',domExact:false,controlExact:true}).wrongSuccess,true);
});
test('privacy detects values, ranges, masks, and length metadata in every observed surface',()=>{
  const words=['zcjqmtbr','evwkpctgxldusfrynhjqmavoqzbgtdi'];
  const base={jsonrpc:'2.0',id:8,result:{meta:{typeReadback:success,app:{pid:31},startedAt:17345678}}};
  assert.deepEqual(inspect(base,words),[]);
  assert.deepEqual(inspect({result:{meta:{entered:8,typeReadback:{...old,pollMs:0,reads:0}}}},words,{literal:true}),[]);
  assert.notDeepEqual(inspect({elsewhere:{entered:8}},words,{literal:true}),[]);
  for(const raw of [
    {error:{meta:{entered:8}}}, {'cua/typeReadback':{...success,count:31}}, {range:[0,8]}, {AXSelectedTextRange:'(0, 8)'},
    {message:'read 31 characters'}, new Error('secure field count=8'), {text:'The secret was ••••••••'}, {stderr:'value=' + words[0]},
    {extra:words[1].slice(2,12)}, {message:'AXNumberOfCharacters = 31'}, {data:''},
    {data:words[0].split('').map(c=>c.charCodeAt(0))}, {'cua/typeReadback':{...success,confirmation:'content'}},
  ]) assert.notEqual(inspect(raw,words).length,0,JSON.stringify(raw));
});
const trace=(polls=1,tail=[['r','AXNumberOfCharacters',2]],bad=[])=>[
  ['r','AXRole',1], ['r','AXSubrole',2,'secure'], ...bad,
  ['p','begin'], ...Array.from({length:polls},()=>tail).flat(), ['p','end'],
];
test('audit collapses only repeated poll iterations, distinguishes elements and forbids secure reads',()=>{
  assert.equal(auditSchedule(trace()).shape,auditSchedule(trace(4)).shape);
  assert.notEqual(auditSchedule(trace()).shape,auditSchedule(trace(1,[['r','AXNumberOfCharacters',1]])).shape);
  assert.equal(auditSchedule(trace(1,undefined,[['q','AXUIElementForTextMarker',2]])).pass,false);
  assert.equal(auditSchedule(trace(1,undefined,[['q','AXUIElementForTextMarker',1]])).pass,true);
  assert.equal(auditSchedule(trace(1,undefined,[['r','AXValue',2]])).pass,false);
  assert.equal(auditSchedule(trace(1,undefined,[['b','AXRole+AXValue',2]])).pass,false);
  assert.equal(auditSchedule(trace(1,undefined,[['r','AXValue',1]])).pass,true);
  assert.equal(auditSchedule([['r','AXRole',1]]).pass,false);
  assert.equal(auditSchedule([...trace(),['p','end']]).pass,false);
  assert.equal(auditSchedule(trace(1,[['r','AXNumberOfCharacters',2],['r','AXSelectedTextRange',2]])).pass,true);
  const rows=['short','long','literal'].map(kind=>({...auditSchedule(trace()),kind,head:'fix',rep:0,valid:true}));
  assert.deepEqual(auditPairs(rows,1),{required:2,matched:2,pass:true});
  rows[1].shape='changed';
  assert.deepEqual(auditPairs(rows,1),{required:2,matched:1,pass:false});
  assert.equal(auditPairs(rows.slice(0,1),1).pass,false);
});
test('summary excludes setup-invalid and known-limit controls from scored product misses',()=>{
  const rows=[{...row(),head:'fix',kind:'short',reason:null,snapshotMs:4,serviceMs:8},
    {...row({fixture:false}),head:'fix',kind:'short',invalid:'arm'},
    {...row({kind:'rewrite',domExact:false,controlExact:true}),head:'fix',kind:'rewrite',reason:null}];
  const s=summarize(rows);
  assert.equal(s.heads.fix.confirmed,1);
  assert.deepEqual(s.heads.fix.snapshotMs,{p50:4,p95:4});
  assert.deepEqual(s.invalid,{arm:1});
  assert.equal(s.knownLimit.lengthConfirmed,1);
  assert.equal(s.wrongSuccesses,0);
});
