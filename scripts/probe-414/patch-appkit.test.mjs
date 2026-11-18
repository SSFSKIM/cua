import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {patchAppKit} from './patch-appkit.mjs';

const methods=`extension Engine {
  func dispatch(_ params: [String: Any]) throws -> Any {
    guard let method = params["method"] as? String else { throw EngineError() }
    let args = params["args"] as? [String: Any] ?? [:]
    return try typeText(args)
  }
}
`;
const readback=`final class TypeReadback<Element> {
  private func confirmLength(through end: Int, beforeKey: Bool) throws {
    var last: ReadbackLengthRead?
    while true {
      switch readbackLength(field, role: role, reads: reads) {
      case .closed(let why): throw unconfirmed(why, beforeKey)
      case .read(let count, let range): last = readbackLengthJudged(count: count, range: range, basis: basis, typed: typed)
      }
      if last == .confirmed { break }
    }
  }
}
`;
const gate=`func gatedPost(_ event: CGEvent, _ pid: pid_t) {
  if DesktopGate.allows("CGEvent.postToPid") { event.postToPid(pid) }
}
func gatedPostToHIDTap(_ event: CGEvent) {
  if DesktopGate.allows("CGEvent.post(tap: .cghidEventTap)") { event.post(tap: .cghidEventTap) }
}
`;
const length=`func readbackLength<Element>(_ field: Element, role: String, reads: ReadbackReads<Element>) -> ReadbackLength {
  return .closed(.fieldUnreadable)
}
`;
function tree(edit={}){
  const root=mkdtempSync(join(tmpdir(),'q414appkit-')),dir=join(root,'native/engine/Sources/Engine');mkdirSync(dir,{recursive:true});
  const files={'Methods.swift':methods,'TypeReadback.swift':readback,'DesktopGate.swift':gate,'TypeReadbackLength.swift':length,...edit};
  for(const [name,text] of Object.entries(files))writeFileSync(join(dir,name),text);
  return {root,dir};
}
const patched=edit=>{const t=tree(edit);try{return patchAppKit(t.root);}finally{rmSync(t.root,{recursive:true,force:true});}};

test('the scope, both posts and the judged confirmation are marked in place, once',()=>{
  const {root,dir}=tree();
  try{
    assert.equal(patchAppKit(root).seams,5);
    const m=readFileSync(join(dir,'Methods.swift'),'utf8');
    assert.ok(m.indexOf('Probe414AppKit.shared.begin(args)')>m.indexOf('let args ='));
    assert.ok(m.includes('method == "type_text" ? Probe414AppKit.shared.begin(args) : nil'));
    assert.ok(m.includes('defer { Probe414AppKit.shared.finish(probe414AppKitTag) }'));
    const g=readFileSync(join(dir,'DesktopGate.swift'),'utf8');
    assert.ok(g.includes('{ event.postToPid(pid); Probe414AppKit.shared.posted(event) }'));
    assert.ok(g.includes('{ event.post(tap: .cghidEventTap); Probe414AppKit.shared.posted(event) }'));
    const r=readFileSync(join(dir,'TypeReadback.swift'),'utf8');
    assert.ok(r.includes('typed: typed); if last == .confirmed { Probe414AppKit.shared.confirmed() }\n'));
    assert.ok(r.indexOf('confirmed() }')<r.indexOf('if last == .confirmed { break }'));
    const l=readFileSync(join(dir,'TypeReadbackLength.swift'),'utf8');
    assert.ok(l.startsWith('func readbackLengthUninstrumented<Element>(_ field: Element, role: String, reads: ReadbackReads<Element>) -> ReadbackLength {\n'));
    assert.ok(existsSync(join(dir,'Probe414AppKit.swift')));
    assert.throws(()=>patchAppKit(root),/already instrumented/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('the patch fails closed on any drift of a required seam',()=>{
  const drift={
    'args binding gone':{'Methods.swift':methods.replace('let args =','let argv =')},
    'args binding twice':{'Methods.swift':methods+methods.replace('func dispatch','func again')},
    'method guard after the binding':{'Methods.swift':methods.replace(/ {4}guard let method.*\n/,'').replace('    return try','    guard let method = params["method"] as? String else { throw X }\n    return try')},
    'post gone':{'DesktopGate.swift':gate.replace('{ event.postToPid(pid) }','{ other(pid) }')},
    'hid post gone':{'DesktopGate.swift':gate.replace('{ event.post(tap: .cghidEventTap) }','{ other() }')},
    'post twice':{'DesktopGate.swift':gate+gate.replaceAll('gatedPost','gatedAgain')},
    'judged line changed (stabilization)':{'TypeReadback.swift':readback.replace('typed: typed)','typed: typed, stable: true)')},
    'judged line twice':{'TypeReadback.swift':readback.replace('  private func confirmLength','  private func other(){\n    while true {\n      case .read(let count, let range): last = readbackLengthJudged(count: count, range: range, basis: basis, typed: typed)\n    }\n  }\n  private func confirmLength')},
    'judged line outside the poll':{'TypeReadback.swift':readback.replace('private func confirmLength','private func confirmElsewhere')},
    'length read gone':{'TypeReadbackLength.swift':length.replace('role: String','role: Int')},
    'length read twice':{'TypeReadbackLength.swift':length+length},
    'other instrumentation':{'Other.swift':'let x = Probe395Audit.shared\n'},
  };
  for(const [name,edit] of Object.entries(drift))assert.throws(()=>patched(edit),undefined,name);
});
