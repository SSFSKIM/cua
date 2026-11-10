import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as relabel from './relabelled.mjs';
import {WEB_PLAN,NATIVE_PLAN,SEED,TYPED,relabelledPage,relabelTarget,typedCoverage} from './relabelled.mjs';
const rect=(x,y,width,height)=>({x,y,width,height});

test('paced typing uses real one-character calls with settling, while bulk stays one call',async()=>{
  const calls=[],run=async(method,args)=>calls.push([method,args]),sleep=async ms=>calls.push(['wait',ms]);
  await relabel.deliverText('New.',run,sleep,true);
  assert.deepEqual(calls,[['type_text',{text:'N'}],['wait',100],['type_text',{text:'e'}],['wait',100],['type_text',{text:'w'}],['wait',100],['type_text',{text:'.'}],['wait',100]]);
  calls.length=0;await relabel.deliverText('New.',run,sleep,false);
  assert.deepEqual(calls,[['type_text',{text:'New.'}]]);
});

test('editor evidence distinguishes AXTextArea from a plain AXGroup without changing focus',()=>{
  const web={role:'AXWebArea',depth:3,frame:rect(0,0,620,700)},group={role:'AXGroup',depth:4,frame:rect(16,60,500,140)};
  const area={role:'AXTextArea',depth:5,frame:rect(16,60,500,140),actions:['AXFocus']};
  const fixture={anchor:rect(16,60,500,140)};
  assert.equal(relabel.editorEvidence({nodes:[web,group,area]},fixture).role,'AXTextArea');
  const plain=relabel.editorEvidence({nodes:[web,group]},fixture);
  assert.equal(plain.role,'AXGroup');assert.deepEqual(plain.emittedRoleChain,['AXGroup','AXWebArea']);
});

test('edited-region negative control targets the actionable link, not its replaced short text',()=>{
  const n={role:'AXLink',title:'Save',actions:['AXPress'],frame:rect(400,100,130,32)};
  const found=relabelTarget({nodes:[n]},{key:'typed-link',typed:true},{label:'Save'});
  assert.deepEqual(found.point,{x:526,y:116});
  assert.equal(found.node,n);
});
test('typed coverage rejects padding clicks and requires an actionable link inside the edited region',()=>{
  assert.equal(SEED.length,TYPED.length);
  const plan={key:'typed-contenteditable',typed:true};
  const row={click:{},fixture:{before:{text:SEED},domPoint:{x:30,y:70}},steps:[{method:'type_text',answer:{error:null}}],mutations:[{mutation:'relabel',after:{text:TYPED,textRects:[rect(16,60,280,20)]}}]};
  assert.equal(typedCoverage(row,plan).valid,true);
  row.fixture.domPoint={x:450,y:70};assert.equal(typedCoverage(row,plan).valid,false);
  row.fixture.before={label:'Save',inEditable:true};row.mutations[0].after={label:'Delete',text:'Typed sentence. '+SEED,inEditable:true};
  row.observation={chosen:{role:'AXLink',actions:['AXPress']}};
  assert.equal(typedCoverage(row,{key:'typed-link',typed:true}).valid,true);
  row.observation.chosen.actions=[];assert.equal(typedCoverage(row,{key:'typed-link',typed:true}).valid,false);
});
test('settled coverage distinguishes an immediate partial value from a later complete sentence',()=>{
  const partial={text:'New t',textRects:[rect(16,60,50,20)]};
  const full={text:TYPED,typedTextRects:[rect(16,60,280,20)]};
  const row={click:{},fixture:{before:{text:SEED},domPoint:{x:30,y:70}},steps:[{answer:{error:null}}],mutations:[{mutation:'relabel',after:partial}],typingSamples:[0,250,1000,3000].map(delayMs=>({delayMs,...(delayMs===3000?full:partial)}))};
  assert.equal(typedCoverage(row,{key:'typed-gmail',typed:true,delivery:'paced'}).valid,true);
  row.typingSamples.pop();assert.equal(typedCoverage(row,{key:'typed-gmail',typed:true,delivery:'paced'}).valid,false);
});

test('all requested fixture scripts parse, with complete must-refuse and timing manifests',()=>{
  const required=['save','btnnv','linksavenv','divbtn','linkmono','savearia','deleteall','dialog','follow','play','typed-link'];
  for(const name of required)assert.ok(WEB_PLAN.some(p=>p.caseName===name&&p.expectation==='relabelled'));
  for(const name of ['relabel','alabel','noid'])assert.ok(NATIVE_PLAN.some(p=>p.caseName===name&&p.expectation==='relabelled'));
  for(const seconds of [1,5,20])for(const plan of [WEB_PLAN,NATIVE_PLAN])assert.ok(plan.some(p=>p.caseName===`tick-${seconds}s`&&p.delay===seconds*1000));
  for(const key of new Set(WEB_PLAN.map(p=>p.key)))for(const s of relabelledPage(key,'').matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(s[1],{filename:key+'.js'});
});
