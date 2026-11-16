import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {readEvidence} from './read.mjs';import {plan,ENGINE_REF} from './model.mjs';
test('artifact reader retains partial coverage and both sides of the native posting boundary',t=>{
 const out=mkdtempSync(join(tmpdir(),'probe360-reader-'));t.after(()=>rmSync(out,{recursive:true,force:true}));
 writeFileSync(join(out,'config.json'),JSON.stringify({smoke:true,engine:ENGINE_REF,kit:'test'}));
 const row={...plan(true)[0],action:{probe:{posted:[{phase:'key',type:10,targetPidField:0,postToPid:99,afterPost:{phase:'key',type:10,targetPidField:99,postToPid:99}}]}},samples:[{trace:[{event:'keydown',key:'ArrowLeft',meta:false,alt:true,shift:false,selection:[29,0]}]}]};
 writeFileSync(join(out,'rows.jsonl'),JSON.stringify(row)+'\n');
 let summary=readEvidence(out);assert.equal(summary.complete,false);assert.equal(summary.engineStopped,false);assert.equal(summary.coverage.missing,127);
 writeFileSync(join(out,'engine-stopped.json'),'{"stopped":true}');summary=readEvidence(out);assert.equal(summary.complete,false);assert.equal(summary.engineStopped,true);
 const events=readFileSync(join(out,'events.tsv'),'utf8').trim().split('\n').map(s=>s.split('\t'));
 const col=events[0].indexOf('targetPidField'),moment=events[0].indexOf('moment');
 assert.equal(events.length,3);assert.equal(events[1][col],'0');assert.equal(events[2][col],'99');
 assert.equal(events[1][moment],'before-post');assert.equal(events[2][moment],'after-post');
 const dom=readFileSync(join(out,'dom.tsv'),'utf8').trim().split('\n').map(s=>s.split('\t'));
 assert.equal(dom[1][dom[0].indexOf('alt')],'true');
});
