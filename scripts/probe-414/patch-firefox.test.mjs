import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {patchFirefox} from './patch-firefox.mjs';

const methods=`extension Engine {
  private func execute(_ params: [String: Any]) throws -> Any {
    guard let method = params["method"] as? String else { throw EngineError() }
    let args = params["args"] as? [String: Any] ?? [:]
    webAccessibility.inputEnablement(chromium: false)
    return try typeText(args)
  }
}
`;
const readback=`func readbackSnapshot<Element>(reads: ReadbackReads<Element>) -> ReadbackPlan<Element> {
  let field = reads.focused()
  guard let role = reads.role(field) else { return .refused(.roleUnreadable) }
  let subrole = reads.subrole(field)
  if readbackSecure(role: role, subrole: subrole) { return .refused(.secure) }
  return .expect(field: field)
}
func readbackFieldClosed<Element>(_ field: Element, reads: ReadbackReads<Element>) -> TypeReadbackReason? {
  guard let seenRole = reads.role(field) else { return .fieldUnreadable }
  let subrole = reads.subrole(field)
  return nil
}
`;
function tree(edit={}){
  const root=mkdtempSync(join(tmpdir(),'q414firefox-')),dir=join(root,'native/engine/Sources/Engine');mkdirSync(dir,{recursive:true});
  const files={'Methods.swift':methods,'TypeReadback.swift':readback,...edit};
  for(const [name,text] of Object.entries(files))writeFileSync(join(dir,name),text);
  return {root,dir};
}
const patched=edit=>{const t=tree(edit);try{return patchFirefox(t.root);}finally{rmSync(t.root,{recursive:true,force:true});}};

test('type_text alone is armed at the request scope, and the snapshot hook sits right after the role guard',()=>{
  const {root,dir}=tree();
  try{
    assert.equal(patchFirefox(root).seams,3);
    const m=readFileSync(join(dir,'Methods.swift'),'utf8');
    const begin=m.indexOf('let probe414Tag = method == "type_text" ? Probe414Firefox.shared.begin(args) : nil');
    assert.ok(begin>m.indexOf('let args =')&&begin<m.indexOf('inputEnablement('));
    assert.ok(m.indexOf('defer { Probe414Firefox.shared.finish(probe414Tag) }')>begin);
    const r=readFileSync(join(dir,'TypeReadback.swift'),'utf8');
    assert.equal((r.match(/Probe414Firefox\.shared\.snapshot\(/g)??[]).length,1);
    assert.ok(r.indexOf('let subrole = reads.subrole(field)\n  Probe414Firefox.shared.snapshot(field, role: role, subrole: subrole)\n')>r.indexOf('guard let role = reads.role(field)'));
    assert.ok(r.indexOf('snapshot(')<r.indexOf('readbackSecure('));
    assert.ok(existsSync(join(dir,'Probe414Firefox.swift')));
    assert.throws(()=>patchFirefox(root),/already instrumented/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('the patch fails closed on any drift of a required seam',()=>{
  const drift={
    'args binding gone':{'Methods.swift':methods.replace('let args =','let argv =')},
    'args binding twice':{'Methods.swift':methods+methods.replace('func execute','func again')},
    'method guard after the binding':{'Methods.swift':methods.replace(/ {4}guard let method.*\n/,'').replace('    webAccessibility','    guard let method = params["method"] as? String else { throw X }\n    webAccessibility')},
    'no method guard':{'Methods.swift':methods.replace('guard let method = params','guard let verb = params')},
    'role guard changed':{'TypeReadback.swift':readback.replace('.roleUnreadable','.other')},
    'subrole read gone':{'TypeReadback.swift':readback.replace('let subrole = reads.subrole(field)\n  if','if')},
    'role guard twice':{'TypeReadback.swift':readback+readback.replace('func readbackSnapshot','func again')},
    'audit already applied':{'Methods.swift':methods+'// Probe395Audit.shared\n'},
  };
  for(const [name,edit] of Object.entries(drift))assert.throws(()=>patched(edit),undefined,name);
});
