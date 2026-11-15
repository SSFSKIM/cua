// Offline: the follow-up cohort's plans, matrix and partial-plan startup needs. No browser, engine or GUI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {abPlan,warmupCell,calibrationKeys,BROWSERS,EDITORS,KEYS} from './ab-model.mjs';
import {FOLLOWUP,CAP_RETRIES,NO_KEY_TEXT,followupMatrix,followupPlan} from './followup.mjs';
import {planFor,matrixFor,traceArgs} from './caret.mjs';
import {matrix} from './matrix.mjs';

const ARMS=['main','branch'],plan=(id,arm,reps=20)=>{const [browser,editor]=id.split('-');return followupPlan({browser,editor,arm,reps})};
const FULL=['cft-contenteditable','cft-compose','firefox-textarea','firefox-input','firefox-contenteditable','firefox-compose'];

test('the cohort is the six missing shards plus the four partial ones, in matrix order',()=>{
 const ids=followupMatrix('all').include.map(c=>c.id);
 assert.deepEqual(ids,['safari-textarea','safari-input','safari-contenteditable','cft-textarea',...FULL.slice(0,2),...FULL.slice(2)]);
 assert.equal(ids.length,10);
 assert.deepEqual(followupMatrix('cft-textarea, firefox-input').include.map(c=>c.id),['cft-textarea','firefox-input']);
 assert.ok(followupMatrix('all').include.every(c=>matrix('all').include.some(m=>m.id===c.id&&m.browser===c.browser&&m.shard===c.shard)));
 for(const bad of ['safari-compose','cft-input',' , ','nope'])assert.throws(()=>followupMatrix(bad),/follow-up shard ids/);
});

test('the six missing shards reuse their full existing plans, cell for cell, for both arms',()=>{
 const counts={'cft-contenteditable':201,'cft-compose':121,'firefox-textarea':221,'firefox-input':301,'firefox-contenteditable':161,'firefox-compose':121};
 for(const id of FULL)for(const arm of ARMS){
  const [browser,editor]=id.split('-'),cells=plan(id,arm);
  assert.deepEqual(cells,abPlan({browser,editor,reps:20}),id);assert.equal(cells.length,counts[id],id);
  for(const key of ['cmd+a','cmd+z','cmd+v'])assert.equal(cells.filter(c=>c.part==='race'&&c.key===key).length,20);
 }
});

test('the four invalidated Unicode-cap attempts keep their ids and differ by arm',()=>{
 assert.deepEqual(CAP_RETRIES,{branch:[1,4,7],main:[7]});
 const source=abPlan({browser:'cft',editor:'textarea',reps:20}).filter(c=>c.variant==='unicode-cap'),caps=cells=>cells.filter(c=>c.variant==='unicode-cap');
 for(const reps of [20,1]){
  const branch=caps(plan('cft-textarea','branch',reps)),main=caps(plan('cft-textarea','main',reps));
  assert.deepEqual(branch.map(c=>c.id),['truncation/textarea/unicode-cap/1','truncation/textarea/unicode-cap/4','truncation/textarea/unicode-cap/7']);
  assert.deepEqual(main.map(c=>c.id),['truncation/textarea/unicode-cap/7']);
  for(const c of [...branch,...main])assert.deepEqual(c,source.find(s=>s.id===c.id));
  assert.equal(branch.length+main.length,4);
 }
 const cell=caps(plan('cft-textarea','main'))[0];assert.equal([...cell.seed].length,10001);assert.equal(cell.expectedReason,'possiblyTruncated');assert.equal(cell.key,null);
});

test('both textareas add 20 ending-Return and 20 multiline controls per head, expected confirmed; the CFT caps run last',()=>{
 for(const id of ['safari-textarea','cft-textarea'])for(const arm of ARMS){
  const [browser,editor]=id.split('-'),cells=plan(id,arm),controls=cells.filter(c=>['ending-return','multiline'].includes(c.part));
  assert.equal(controls.length,40,id);assert.equal(controls.filter(c=>c.part==='ending-return').length,20);assert.equal(controls.filter(c=>c.part==='multiline').length,20);
  assert.deepEqual(controls,abPlan({browser,editor,reps:20}).filter(c=>['ending-return','multiline'].includes(c.part)),'the full plan\'s own cells and ids');
  assert.ok(controls.every(c=>c.expectedAnswer==='confirmed'&&c.editor==='textarea'&&!c.renderedText&&!c.secret&&!c.privateField));
  assert.equal(new Set(cells.map(c=>c.id)).size,cells.length);
  if(id==='safari-textarea')assert.deepEqual(cells,controls);
  else{
   const caps=cells.length-controls.length;assert.equal(caps,arm==='branch'?3:1);
   assert.deepEqual(cells.slice(0,40),controls,'controls first');assert.ok(cells.slice(40).every(c=>c.variant==='unicode-cap'));
  }
 }
 assert.deepEqual(plan('safari-textarea','main'),plan('safari-textarea','branch'));
});

test('totals: 1267 control and 1269 branch cells at 20 repetitions, 142 for one smoke repetition',()=>{
 const total=(reps,arm)=>followupMatrix('all').include.reduce((n,{id})=>n+plan(id,arm,reps).length,0);
 assert.equal(total(20,'main'),1267);assert.equal(total(20,'branch'),1269);assert.equal(total(20,'main')+total(20,'branch'),2536);
 assert.equal(total(1,'main')+total(1,'branch'),142);
});

test('Safari input has 20 plain no-key and 20 trusted-secret cells per head, none pressing a key',()=>{
 for(const arm of ARMS){
  const cells=plan('safari-input',arm),plain=cells.filter(c=>c.part==='no-key'),secret=cells.filter(c=>c.part==='secret');
  assert.equal(cells.length,40);assert.equal(plain.length,20);assert.equal(secret.length,20);
  assert.ok(cells.every(c=>c.key===null),'no press_key between setup and type_text');
  assert.deepEqual(secret,abPlan({browser:'safari',editor:'input',reps:20}).filter(c=>c.part==='secret'&&c.variant==='equality'));
  assert.ok(secret.every(c=>c.secret===true&&c.text==='{{secret:PROBE354}}'&&c.seed===undefined&&c.expectedAnswer==='confirmed'));
  assert.ok(plain.every(c=>!c.secret&&!c.privateField&&c.editor==='input'&&c.variant==='plain'&&c.text===NO_KEY_TEXT&&c.seed===undefined&&c.expectedAnswer==='confirmed'));
  assert.equal(NO_KEY_TEXT.length,64);assert.match(NO_KEY_TEXT,/^[0-9a-f]{64}$/);
  assert.equal(new Set(cells.map(c=>c.id)).size,40);assert.equal(plain[0].id,'no-key/input/plain/1');
  // The two kinds alternate within a repetition, and which comes first alternates by repetition.
  assert.deepEqual(cells.slice(0,4).map(c=>c.part),['no-key','secret','secret','no-key']);
 }
 assert.deepEqual(plan('safari-input','main'),plan('safari-input','branch'));
});

test('Safari contenteditable has only the 20 ending-Return cells, with their foreground reference needs intact',()=>{
 for(const arm of ARMS){
  const cells=plan('safari-contenteditable',arm);
  assert.deepEqual(cells,abPlan({browser:'safari',editor:'contenteditable',reps:20}).filter(c=>c.part==='ending-return'));
  assert.equal(cells.length,20);assert.ok(cells.every(c=>c.renderedText===true&&c.expectedAnswer==='confirmed'));
 }
});

test('smoke repetitions scale every scope except the fixed cap retries; invalid requests are refused',()=>{
 assert.equal(plan('safari-input','branch',1).length,2);assert.equal(plan('safari-contenteditable','main',1).length,1);
 assert.equal(plan('safari-textarea','branch',1).length,2);assert.equal(plan('cft-textarea','main',1).length,3);assert.equal(plan('cft-textarea','branch',1).length,5);
 assert.equal(plan('firefox-compose','main',1).length,abPlan({browser:'firefox',editor:'compose',reps:1}).length);
 assert.throws(()=>followupPlan({browser:'safari',editor:'compose',arm:'main',reps:20}),/invalid follow-up plan/);
 assert.throws(()=>followupPlan({browser:'cft',editor:'input',arm:'main',reps:20}));
 assert.throws(()=>followupPlan({browser:'cft',editor:'textarea',arm:'control',reps:20}));
 assert.throws(()=>followupPlan({browser:'cft',editor:'textarea',reps:20}));
 assert.throws(()=>followupPlan({browser:'cft',editor:'textarea',arm:'main',reps:0}));
});

test('a partial plan still has a warmup and calibrates every key its cells press',()=>{
 for(const {id} of followupMatrix('all').include)for(const arm of ARMS){
  const [browser,editor]=id.split('-'),cells=plan(id,arm),warm=warmupCell({browser,editor}),keys=calibrationKeys([...cells,warm]);
  assert.equal(warm.part,'clean');assert.equal(warm.length,30);assert.equal(warm.editor,editor);assert.equal(warm.key,'cmd+a');
  assert.ok(keys.includes(warm.key));for(const c of cells)if(c.key)assert.ok(keys.includes(c.key),id+' '+c.id);
  if(!FULL.includes(id))assert.deepEqual(keys,['cmd+a'],id+' calibrates only what it uses');
 }
});

test('primary startup is unchanged: its warmup is the plan\'s first clean-30 cell and all three keys calibrate',()=>{
 for(const browser of BROWSERS)for(const editor of EDITORS){
  const cells=abPlan({browser,editor,reps:20}),warm=warmupCell({browser,editor});
  assert.deepEqual(warm,cells.find(c=>c.part==='clean'&&c.length===30));
  assert.deepEqual(calibrationKeys([...cells,warm]),KEYS);
 }
});

test('the cohort selector dispatches by name and leaves primary and caret behavior alone',()=>{
 for(const id of ['safari-input','cft-textarea','firefox-input'])for(const arm of ARMS){
  const [browser,editor]=id.split('-');assert.deepEqual(planFor({browser,editor,reps:20,arm,diagnostic:FOLLOWUP}),followupPlan({browser,editor,arm,reps:20}));
 }
 assert.deepEqual(matrixFor('all',FOLLOWUP),followupMatrix('all'));assert.deepEqual(matrixFor('cft-textarea',FOLLOWUP).include.map(c=>c.id),['cft-textarea']);
 assert.deepEqual(planFor({browser:'cft',editor:'textarea',reps:20,arm:'main'}),abPlan({browser:'cft',editor:'textarea',reps:20}),'primary ignores the arm');
 assert.deepEqual(matrixFor('all'),matrix('all'));assert.deepEqual(traceArgs(FOLLOWUP,'id'),{});
 assert.equal(planFor({browser:'firefox',editor:'input',reps:1,diagnostic:'firefox-caret'}).length,6);
 assert.throws(()=>planFor({browser:'safari',editor:'input',reps:1,arm:'main',diagnostic:'nope'}));
});
