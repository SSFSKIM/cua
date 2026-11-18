// Compiles the real schedule accumulator with the #354 audit it sits on and runs its offline check: no AX request reaches another
// process, no GUI is touched. Skipped where swiftc is unavailable (the hosted lane compiles it in the engine build).
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,copyFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {decodeRecord,buildSchedule} from './audit-schedule.mjs';

const have=process.platform==='darwin'&&spawnSync('swiftc',['--version'],{encoding:'utf8'}).status===0;
test('the accumulator compiles in Swift 6 mode and its stderr decodes to the schedule the check feeds it',{skip:!have,timeout:300000},()=>{
 const dir=mkdtempSync(join(tmpdir(),'probe395-swift-'));
 try{
  const path=f=>fileURLToPath(new URL(f,import.meta.url));
  copyFileSync(path('../probe-354-fences/audit.swift'),join(dir,'Probe354Audit.swift'));
  copyFileSync(path('./audit.swift'),join(dir,'Probe395Audit.swift'));
  copyFileSync(path('./audit-check.swift'),join(dir,'Check.swift'));
  const built=spawnSync('swiftc',['-parse-as-library','-swift-version','6','-o',join(dir,'check'),join(dir,'Probe354Audit.swift'),join(dir,'Probe395Audit.swift'),join(dir,'Check.swift')],{encoding:'utf8'});
  assert.equal(built.status,0,built.stderr.split('\n').filter(l=>/error/.test(l)).join('\n'));
  const run=spawnSync(join(dir,'check'),[],{encoding:'utf8'});
  assert.equal(run.status,0);
  const lines=run.stderr.trim().split('\n').map(l=>JSON.parse(l).probe395Audit);
  assert.deepEqual(lines.map(r=>r.id),['check-1','check-3']);
  const one=decodeRecord(lines[0]),sched=buildSchedule(one);
  // Untagged traffic and other threads never enter the schedule; a second begin is refused and counted.
  assert.equal(one.overlaps,1);assert.equal(one.offThread,1);assert.deepEqual(one.offThreadCounts,{AXValue:1});
  assert.deepEqual(sched.strictKey.split('|'),['r:AXRole@e0','r:AXSubrole@e0','b:AXRole+AXValue@e1','p:AXStringForTextMarkerRange@e0!absent','r:unnamed@e0!fail','r:AXChildren@e1','ev:keyDown','w:AXFocused@e1']);
  // A system-wide element seen twice (CFEqual) is one alias; a non-constant name is not recorded as itself; only a public role constant is kept.
  assert.equal(one.aliases,2);assert.deepEqual(one.roles,{0:'AXTextField'});assert.deepEqual(one.subroles,{});
  assert.equal(sched.preInput.entries,6);assert.equal(sched.counters.byClass.marker,1);assert.equal(sched.counters.events.keyDown,1);assert.deepEqual(sched.counters.writes,{AXFocused:1});
  assert.equal(sched.timeline.phases.walk.length,1);assert.equal(sched.complete,false); // overlaps>0: the overlapping request marks the record incomplete
  assert.equal(decodeRecord(lines[1]).entries.length,0); // a fresh request starts clean
  assert.ok(run.stderr.length<4000&&!/secret value|123/.test(run.stderr)); // names are sanitized, nothing else is written
 }finally{rmSync(dir,{recursive:true,force:true})}
});
