// Offline check of the schedule audit patch against the real, unmodified engine source of this checkout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,mkdirSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {patchQualAudit,REDIRECTS,EVENT_HOOKS,DEFAULT_PHASE_HOOKS,phaseInsertion} from './audit-patch.mjs';

const ENGINE=new URL('../../native/engine/Sources/Engine/',import.meta.url);
const undo354={probe354CopyAttributeValue:'AXUIElementCopyAttributeValue',probe354CopyMultipleAttributeValues:'AXUIElementCopyMultipleAttributeValues',probe354CopyParameterizedAttributeValue:'AXUIElementCopyParameterizedAttributeValue'};
// A stand-in for TypeReadback.swift, which only some heads have: the pinned signature lines with statement bodies.
const FIXTURE=`import Foundation

${DEFAULT_PHASE_HOOKS.map(h=>`${h.signature}\n  return nil\n}\n`).join('\n')}
`;
function stage(files,extra={}){
 const root=mkdtempSync(join(tmpdir(),'probe395-audit-')),dir=join(root,'native/engine/Sources/Engine'),before=new Map();
 mkdirSync(dir,{recursive:true});
 for(const name of files){const s=readFileSync(new URL(name,ENGINE),'utf8');before.set(name,s);writeFileSync(join(dir,name),s)}
 for(const [name,s] of Object.entries(extra)){before.set(name,s);writeFileSync(join(dir,name),s)}
 return {root,dir,before};
}
const FILES=['Input.swift','AX.swift','Fetch.swift','TextSelection.swift','DesktopGate.swift','Enablement.swift','WebAreaFocus.swift'];

test('schedule patch redirects every audited call, marks events and phases, and removing the markers restores each production byte',()=>{
 const {root,dir,before}=stage(FILES,{'TypeReadback.swift':FIXTURE});
 try{
  const report=patchQualAudit(root);
  for(const name of Object.keys(undo354))assert.ok(report.redirects[name]>0,name);
  assert.equal(report.boundaries.eventPost,true);assert.equal(report.boundaries.eventHid,true);
  assert.deepEqual(report.phases.applied,DEFAULT_PHASE_HOOKS.map(h=>h.name));assert.deepEqual(report.phases.skipped,[]);
  assert.match(report.source.audit,/^[0-9a-f]{16}$/);
  assert.ok(existsSync(join(dir,'Probe395Audit.swift')));assert.ok(existsSync(join(dir,'Probe354Audit.swift')));
  const undo395=Object.fromEntries(Object.entries(REDIRECTS).filter(([from])=>from.startsWith('probe354')).map(([from,to])=>[to,from]));
  const raw=Object.fromEntries(Object.entries(REDIRECTS).filter(([from])=>!from.startsWith('probe354')).map(([from,to])=>[to,from]));
  for(const [name,original] of before){
   let s=readFileSync(join(dir,name),'utf8');
   for(const [from,to] of Object.entries({...undo395,...raw}))s=s.replaceAll(from+'(',to+'(');
   for(const [from,to] of Object.entries(undo354))s=s.replaceAll(from,to);
   s=s.replace('\n    let probe354AuditTag = Probe354Audit.shared.begin(args)\n    defer { Probe354Audit.shared.finish(probe354AuditTag) }','');
   s=s.replace('    // probe395-audit request begin\n    let probe395AuditTag = Probe395Audit.shared.begin(args)\n    defer { Probe395Audit.shared.finish(probe395AuditTag) }\n','');
   for(const hook of EVENT_HOOKS)s=s.replace(hook.to,hook.from);
   for(const hook of DEFAULT_PHASE_HOOKS)s=s.replace(hook.signature+phaseInsertion(hook.name),hook.signature);
   assert.equal(s,original,name+' changed outside audit boundaries');
  }
  // The redirected sources keep every gate-name string literal byte for byte.
  assert.match(readFileSync(join(dir,'DesktopGate.swift'),'utf8'),/"AXUIElementPerformAction\(\\\(action\)\)"/);
  assert.throws(()=>patchQualAudit(root),/already audited/);
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('an absent or ambiguous phase anchor is skipped and reported, and a required one fails closed',()=>{
 const a=stage(FILES);
 try{
  const report=patchQualAudit(a.root);
  assert.deepEqual(report.phases.applied,[]);assert.deepEqual(report.phases.skipped.map(s=>s.reason),['anchor-absent','anchor-absent','anchor-absent','anchor-absent']);
 }finally{rmSync(a.root,{recursive:true,force:true})}
 const b=stage(FILES,{'TypeReadback.swift':FIXTURE+'\n'+DEFAULT_PHASE_HOOKS.find(h=>h.name==='walk').signature+'\n}\n'});
 try{
  const report=patchQualAudit(b.root);assert.deepEqual(report.phases.skipped.filter(s=>s.reason==='anchor-ambiguous').map(s=>s.name),['walk']);
 }finally{rmSync(b.root,{recursive:true,force:true})}
 const c=stage(FILES);
 try{assert.throws(()=>patchQualAudit(c.root,{require:['walk']}),/required phase hook anchor missing/)}finally{rmSync(c.root,{recursive:true,force:true})}
 const c2=stage(FILES);
 try{assert.throws(()=>patchQualAudit(c2.root,{require:['markedField']}),/required phase hook anchor missing/)}finally{rmSync(c2.root,{recursive:true,force:true})}
 const d=stage(FILES);
 try{assert.throws(()=>patchQualAudit(d.root,{require:['nope']}),/not configured/);assert.throws(()=>patchQualAudit(d.root,{phaseHooks:[{name:'bad name',signature:'func x() {'}]}),/invalid phase hook name/)}finally{rmSync(d.root,{recursive:true,force:true})}
});
test('a custom phase hook names a future head function without code changes',()=>{
 const sig='func futureMarkerRead(_ field: AXUIElement) -> Bool {';
 const s=stage(FILES,{'Marker.swift':`import ApplicationServices\n\n${sig}\n  return true\n}\n`});
 try{
  const report=patchQualAudit(s.root,{phaseHooks:[{name:'markerRead',signature:sig}],require:['markerRead']});
  assert.deepEqual(report.phases.applied,['markerRead']);
  assert.match(readFileSync(join(s.dir,'Marker.swift'),'utf8'),/phaseBegin\("markerRead"\)/);
 }finally{rmSync(s.root,{recursive:true,force:true})}
});
test('a head without the engine hooks it must have fails before writing the schedule files',()=>{
 const s=stage(['AX.swift']);
 try{assert.throws(()=>patchQualAudit(s.root))}finally{rmSync(s.root,{recursive:true,force:true})}
});
