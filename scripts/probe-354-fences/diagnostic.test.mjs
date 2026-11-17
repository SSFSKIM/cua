import test from 'node:test';
import assert from 'node:assert/strict';
import * as kit from './caret.mjs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('single-head diagnostic selectors never build or run the control, while measurement arm order is preserved',()=>{
 for(const mode of ['firefox-caret','safari-no-key-ax']){
  assert.deepEqual(kit.buildArmsFor(mode),['branch']);
  assert.deepEqual(kit.runArmsFor(mode,'safari','input'),['branch']);
 }
 assert.deepEqual(kit.buildArmsFor('primary'),['main','branch']);
 assert.deepEqual(kit.buildArmsFor('followup'),['main','branch']);
 assert.deepEqual(kit.runArmsFor('primary','safari','input'),['branch','main']);
 assert.deepEqual(kit.runArmsFor('followup','cft','textarea'),['branch','main']);
 assert.throws(()=>kit.buildArmsFor('unknown'));
});

test('the workflow CLI emits branch-only build/run lists and the isolated Safari matrix',()=>{
 const cli=(...args)=>execFileSync(process.execPath,[fileURLToPath(new URL('./caret.mjs',import.meta.url)),...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 assert.equal(cli('build-arms','firefox-caret'),'branch');assert.equal(cli('build-arms','primary'),'main branch');
 assert.equal(cli('run-arms','safari-no-key-ax','safari','input'),'branch');assert.equal(cli('run-arms','primary','safari','input'),'branch main');
 assert.equal(cli('matrix','all','safari-no-key-ax'),'matrix={"include":[{"id":"safari-input","browser":"safari","shard":"input"}]}');
});

test('ten repetitions are accepted only as an explicitly diagnostic cohort, never as a primary rate run',()=>{
 for(const diagnostic of ['firefox-caret','safari-no-key-ax'])assert.deepEqual(kit.validateRunInputs({diagnostic,reps:10,smoke:'false'}),{diagnostic,reps:10,smoke:false});
 assert.throws(()=>kit.validateRunInputs({diagnostic:'primary',reps:10,smoke:'false'}));
 assert.throws(()=>kit.validateRunInputs({diagnostic:'followup',reps:10,smoke:false}));
 assert.deepEqual(kit.validateRunInputs({diagnostic:'primary',reps:20,smoke:'false'}),{diagnostic:'primary',reps:20,smoke:false});
 assert.deepEqual(kit.validateRunInputs({diagnostic:'primary',reps:1,smoke:'true'}),{diagnostic:'primary',reps:1,smoke:true});
 for(const bad of [{diagnostic:'firefox-caret',reps:10,smoke:true},{diagnostic:'primary',reps:1,smoke:false},{diagnostic:'unknown',reps:20,smoke:false},{diagnostic:'safari-no-key-ax',reps:10,smoke:'anything'}])assert.throws(()=>kit.validateRunInputs(bad));
});

test('Safari AX mode isolates ten no-key states and ten held-key reference states without an editing key in the no-key cells',()=>{
 const plan=kit.planFor({browser:'safari',editor:'input',arm:'branch',reps:10,diagnostic:'safari-no-key-ax'});
 assert.equal(plan.length,20);assert.equal(new Set(plan.map(c=>c.id)).size,20);
 assert.deepEqual(plan.slice(0,2).map(c=>[c.variant,c.key,c.holdKey,c.rep]),[['no-key',null,null,1],['key-first',null,'cmd+a',1]]);
 assert.equal(plan.filter(c=>c.variant==='no-key').length,10);
 assert.equal(plan.filter(c=>c.variant==='key-first').length,10);
 assert.ok(plan.every(c=>c.editor==='input'&&c.text.length===64&&c.key===null));
 assert.deepEqual(kit.matrixFor('all','safari-no-key-ax'),{include:[{id:'safari-input',browser:'safari',shard:'input'}]});
 assert.throws(()=>kit.planFor({browser:'firefox',editor:'input',arm:'branch',reps:10,diagnostic:'safari-no-key-ax'}));
 assert.throws(()=>kit.planFor({browser:'safari',editor:'input',arm:'main',reps:10,diagnostic:'safari-no-key-ax'}));
 assert.throws(()=>kit.matrixFor('firefox-input','safari-no-key-ax'));
});
