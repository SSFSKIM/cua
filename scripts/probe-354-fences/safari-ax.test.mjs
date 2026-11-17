import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as safari from './safari-ax.mjs';
const snapshot=(tag,start,end)=>({schema:'probe354.safariAXPaths.v1',tag,pid:42,startedAt:start,endedAt:end,frontmostPidBefore:99,frontmostPidAfter:99,queries:[{seq:1,phase:'paths',path:'application.AXFocusedUIElement',attribute:'AXFocusedUIElement',startedAt:start,endedAt:end,axError:-25212,valueType:'missing',value:null}],walks:{focusedSearch:{depthLimit:12,nodeLimit:200,nodeCount:4,elapsedMs:end-start,found:[]}},flags:{mutationsSkipped:true,reason:'restoration cannot undo AX cache activation'}});
function context(events){return {
 hold:async key=>{events.push('hold:'+key);return {raw:{result:{meta:{inputRoute:'3'}}},meta:{inputRoute:'3'}}},
 verifyAndRestore:async()=>{events.push('verify-and-restore');return {verified:true}},
 snapshot:async phase=>{events.push('snapshot:'+phase);return snapshot(phase,phase==='before'?10:20,phase==='before'?12:25)},
 assertCovered:async()=>{events.push('check-cover')},
 type:async()=>{events.push('type');return {durationMs:7,raw:{error:{errorName:'typeUnconfirmed',meta:{typeReadback:{confirmed:false,reason:'noFocusedElement'}}}}}},
 readDOM:async()=>{events.push('read-dom');return {text:'public final',focused:true}},pid:42,coverPid:99
}}
test('no-key snapshots surround typing without any keyboard or restore action; the key reference verifies and restores selection first',async()=>{
 const no=[],plain=await safari.observeSafariCase({holdKey:null},context(no));
 assert.deepEqual(no,['snapshot:before','check-cover','type','snapshot:after','check-cover','read-dom']);
 assert.equal(plain.holdVerified,false);assert.equal(plain.beforeAX.queries[0].axError,-25212);assert.equal(plain.afterAX.endedAt,25);
 const yes=[],reference=await safari.observeSafariCase({holdKey:'cmd+a'},context(yes));
 assert.deepEqual(yes,['hold:cmd+a','verify-and-restore','snapshot:before','check-cover','type','snapshot:after','check-cover','read-dom']);
 assert.equal(reference.holdVerified,true);assert.equal(reference.holdRPC.meta.inputRoute,'3');
});
test('a failed hold or an activating/wrong-target snapshot cannot be treated as a valid no-key reference',async()=>{
 const c=context([]);c.verifyAndRestore=async()=>({verified:false});await assert.rejects(safari.observeSafariCase({holdKey:'cmd+a'},c),/hold/);
 const wrong=context([]);wrong.snapshot=async()=>({...snapshot('before',10,12),pid:7});await assert.rejects(safari.observeSafariCase({holdKey:null},wrong),/snapshot/);
 const active=context([]);active.snapshot=async()=>({...snapshot('before',10,12),frontmostPidAfter:42});await assert.rejects(safari.observeSafariCase({holdKey:null},active),/snapshot/);
 const serverActive=context([]);serverActive.snapshot=async()=>({...snapshot('before',10,12),frontmost:{changed:false,activationDetected:true}});await assert.rejects(safari.observeSafariCase({holdKey:null},serverActive),/snapshot/);
});
test('a slow snapshot is bounded and makes the diagnostic stop rather than misrouting a late reply',async()=>{
 const io=context([]),timers=[];io.snapshotTimeoutMs=5;io.snapshot=phase=>new Promise(ok=>timers.push(setTimeout(()=>ok(snapshot(phase,10,12)),50)));
 try{await assert.rejects(safari.observeSafariCase({holdKey:null},io),e=>e.fatalDiagnostic===true&&/timeout/.test(e.message))}finally{timers.forEach(clearTimeout)}
});
test('AX errors, costs, bounded walk summaries and skipped flags survive the diagnostic tables without primary rate/cost files',()=>{
 const out=mkdtempSync(join(tmpdir(),'safari-ax-tables-'));try{
  const before=snapshot('before',10,12),after=snapshot('after',20,25),row={id:'safari-ax/no-key/1',variant:'no-key',rep:1,valid:true,holdKey:null,holdVerified:false,typeRPC:{durationMs:7,raw:{error:{errorName:'typeUnconfirmed',meta:{typeReadback:{confirmed:false,reason:'noFocusedElement'}}}}},correct:true,beforeAX:before,afterAX:after};
  const result=safari.writeSafariAXTables(out,[row]);assert.deepEqual(result,{cohort:'safari-no-key-ax',primaryEvidence:false,observerEffect:true,cases:1,valid:1});
  const s=JSON.parse(readFileSync(join(out,'summary.json'),'utf8'));assert.deepEqual(s.cases,[{id:row.id,variant:'no-key',rep:1,valid:true,holdKey:null,holdVerified:false,answerKind:'error',errorName:'typeUnconfirmed',reason:'noFocusedElement',confirmed:false,typeMs:7,finalMatch:true,beforeSnapshotMs:2,afterSnapshotMs:5,flags:before.flags}]);
  const paths=readFileSync(join(out,'safari-ax-paths.tsv'),'utf8').trim().split('\n');assert.equal(paths.length,3);assert.match(paths[1],/before/);assert.match(paths[1],/-25212/);assert.match(paths[2],/after/);
  assert.match(readFileSync(join(out,'safari-ax-walks.tsv'),'utf8'),/focusedSearch/);
  assert.equal(existsSync(join(out,'rates.tsv')),false);assert.equal(existsSync(join(out,'cost.tsv')),false);
 }finally{rmSync(out,{recursive:true,force:true})}
});
