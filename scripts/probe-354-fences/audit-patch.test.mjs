// Offline check of the observational patch against the kit's real, unmodified engine source.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {patchAudit} from './audit-patch.mjs';

test('audit covers single, batch and parameterized reads without changing the engine response or reader logic',()=>{
 const root=mkdtempSync(join(tmpdir(),'probe354-audit-')),dir=join(root,'native/engine/Sources/Engine');mkdirSync(dir,{recursive:true});
 const files=['Input.swift','AX.swift','Fetch.swift','TextSelection.swift'],before=new Map();
 try{
  for(const name of files){const s=readFileSync(new URL('../../native/engine/Sources/Engine/'+name,import.meta.url),'utf8');before.set(name,s);writeFileSync(join(dir,name),s)}
  const report=patchAudit(root);
  assert.ok(report.hooks.AXUIElementCopyAttributeValue>0);
  assert.ok(report.hooks.AXUIElementCopyMultipleAttributeValues>0);
  assert.ok(report.hooks.AXUIElementCopyParameterizedAttributeValue>0);
  const undo={probe354CopyAttributeValue:'AXUIElementCopyAttributeValue',probe354CopyMultipleAttributeValues:'AXUIElementCopyMultipleAttributeValues',probe354CopyParameterizedAttributeValue:'AXUIElementCopyParameterizedAttributeValue'};
  for(const name of files){let s=readFileSync(join(dir,name),'utf8');
   for(const [from,to]of Object.entries(undo))s=s.replaceAll(from,to);
   s=s.replace('\n    let probe354AuditTag = Probe354Audit.shared.begin(args)\n    defer { Probe354Audit.shared.finish(probe354AuditTag) }','');
   assert.equal(s,before.get(name),name+' semantic source changed outside audit boundaries');
  }
  assert.throws(()=>patchAudit(root),/already audited/);
 }finally{rmSync(root,{recursive:true,force:true})}
});
