import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {patchAudit} from './patch-audit.mjs';

const methods=`extension Engine {
  func dispatch(_ params: [String: Any]) throws -> Any {
    guard let method = params["method"] as? String else { throw EngineError() }
    let args = params["args"] as? [String: Any] ?? [:]
    let context = 1
    if let active, inputMethods.contains(method) {
      webAccessibility.inputEnablement(chromium: false)
    }
    return try typeText(args, context)
  }
}
`;
const readback=`final class TypeReadback<Element> {
  private func confirmLength(through end: Int, beforeKey: Bool) throws {
    guard case .expectLength(let field, let role, let basis, _, let found) = plan else { return }
    var last: ReadbackLengthRead?
    while true {
      switch readbackLength(field, role: role, reads: reads) {
      case .closed(let why): throw unconfirmed(why, beforeKey)
      case .read(let count, let range): last = readbackLengthJudged(count: count, range: range, basis: basis, typed: 1)
      }
      if last == .confirmed { break }
      reads.sleep(typeReadbackPollIntervalMs)
    }
    guard reads.stillFocused(field, found) else { throw unconfirmed(.fieldChanged, beforeKey) }
  }
}
`;
const gate=`func post(_ event: CGEvent, pid: pid_t) {
  if DesktopGate.allows("CGEvent.postToPid") { event.postToPid(pid) }
  if DesktopGate.allows("CGEvent.post(tap: .cghidEventTap)") { event.post(tap: .cghidEventTap) }
}
`;
const ax=`func read(_ e: AXUIElement, _ out: inout CFArray?) {
  _ = AXUIElementCopyAttributeValue(e, "AXRole" as CFString, &v)
  _ = AXUIElementCopyMultipleAttributeValues(e, names, AXCopyMultipleAttributeOptions(rawValue: 0), &out)
  _ = AXUIElementCopyParameterizedAttributeValue(e, "AXUIElementForTextMarker" as CFString, p, &v)
}
`;
function tree(edit={}){
  const root=mkdtempSync(join(tmpdir(),'q414patch-')),dir=join(root,'native/engine/Sources/Engine');mkdirSync(dir,{recursive:true});
  const files={'Methods.swift':methods,'TypeReadback.swift':readback,'DesktopGate.swift':gate,'Fetch.swift':ax,...edit};
  for(const [name,text] of Object.entries(files))writeFileSync(join(dir,name),text);
  return {root,dir};
}
const patched=(edit,poll)=>{const t=tree(edit);try{return patchAudit(t.root,poll);}finally{rmSync(t.root,{recursive:true,force:true});}};

test('the dispatch boundary is armed for type_text alone, in the request scope before enablement; the loop iteration is bracketed',()=>{
  const {root,dir}=tree();
  try{
    const result=patchAudit(root);
    assert.equal(result.poll,'confirmLength');
    const m=readFileSync(join(dir,'Methods.swift'),'utf8');
    const begin=m.indexOf('let probeTag = method == "type_text" ? Probe395Audit.shared.begin(args) : nil');
    assert.ok(begin>m.indexOf('let args =')&&begin<m.indexOf('inputEnablement('));
    assert.ok(m.includes('defer { Probe395Audit.shared.finish(probeTag) }'));
    const r=readFileSync(join(dir,'TypeReadback.swift'),'utf8');
    assert.ok(r.indexOf('while true {\n      let probeIteration')>0&&r.indexOf('defer { Probe395Audit.shared.phaseEnd("securePoll", probeIteration) }')<r.indexOf('switch readbackLength('));
    assert.ok(r.indexOf('reads.stillFocused(')>r.indexOf('phaseEnd("securePoll"')&&r.indexOf('reads.stillFocused(')>r.indexOf('reads.sleep('));
    assert.equal((r.match(/phaseBegin\("securePoll"\)/g)??[]).length,1);
    const g=readFileSync(join(dir,'DesktopGate.swift'),'utf8');
    assert.equal((g.match(/eventPosted\(event\)/g)??[]).length,2);
    const a=readFileSync(join(dir,'Fetch.swift'),'utf8');
    assert.ok(a.includes('probe395CopyMultipleAttributeValues(e,')&&a.includes('probe395CopyAttributeValue(')&&a.includes('probe395CopyParameterizedAttributeValue('));
    assert.ok(existsSync(join(dir,'Probe395Audit.swift')));
    assert.throws(()=>patchAudit(root),/already instrumented/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('the patch fails closed on any drift of a required seam',()=>{
  const drift={
    'args binding gone':{'Methods.swift':methods.replace('let args =','let argv =')},
    'args binding twice':{'Methods.swift':methods+methods.replace('func dispatch','func again')},
    'enablement before the binding':{'Methods.swift':methods.replace('    let args = params["args"] as? [String: Any] ?? [:]\n','').replace('    return try','    let args = params["args"] as? [String: Any] ?? [:]\n    return try')},
    'method guard after the binding':{'Methods.swift':methods.replace(/ {4}guard let method.*\n/,'').replace('    let context = 1\n','    let context = 1\n    guard let method = params["method"] as? String else { throw EngineError() }\n')},
    'no enablement call':{'Methods.swift':methods.replace('webAccessibility.inputEnablement(','other.inputEnablement(')},
    'poll function renamed':{'TypeReadback.swift':readback.replace('confirmLength','confirmCount')},
    'poll function twice':{'TypeReadback.swift':readback+readback},
    'no loop':{'TypeReadback.swift':readback.replace('while true {','if true {')},
    'second loop':{'TypeReadback.swift':readback.replace('    guard reads.stillFocused','    while true { break }\n    guard reads.stillFocused')},
    'batch outside the loop':{'TypeReadback.swift':readback.replace('    while true {','    _ = readbackLength(field, role: role, reads: reads)\n    while true {').replace('switch readbackLength(','switch other(')},
    'second batch':{'TypeReadback.swift':readback.replace('      if last','      _ = readbackLength(field, role: role, reads: reads)\n      if last')},
    'focus check inside the loop':{'TypeReadback.swift':readback.replace('    while true {\n','    while true {\n      guard reads.stillFocused(field, found) else { throw X }\n').replace('    guard reads.stillFocused(field, found) else { throw unconfirmed(.fieldChanged, beforeKey) }\n','')},
    'no sleep':{'TypeReadback.swift':readback.replace('reads.sleep(','other.nap(')},
    'no post':{'DesktopGate.swift':gate.replace('{ event.postToPid(pid) }','{ other(pid) }')},
    'no AX API':{'Fetch.swift':'func nothing() {}\n'},
  };
  for(const [name,edit] of Object.entries(drift))assert.throws(()=>patched(edit),undefined,name);
  assert.throws(()=>patched({},'not a name!'));
  assert.throws(()=>patched({},''),undefined,'empty name');
});
test('a separately reviewed anchor can replace the poll function name',()=>{
  const other={'TypeReadback.swift':readback.replaceAll('confirmLength','confirmElsewhere')};
  assert.equal(patched(other,'confirmElsewhere').poll,'confirmElsewhere');
  assert.throws(()=>patched(other));
});
