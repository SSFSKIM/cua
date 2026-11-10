// Source-boundary tests only: never compile or execute Swift locally.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {patchCaret} from './caret-patch.mjs';
// Captured anchors from bd63a0cc's generic poll and keyed finish. No reader implementation is executed here.
const reader=`func readbackPoll<Element>(_ field: Element, role: String, reads: ReadbackReads<Element>, compare: (Element) -> ReadbackRead) -> ReadbackPoll {
  var poll = ReadbackPoll()
  let started = reads.now()
  repeat {
    guard let seenRole = reads.role(field) else { return ReadbackPoll(reads: poll.reads, closed: .fieldUnreadable) }
    let subrole = reads.subrole(field)
    if case .failed = subrole { return ReadbackPoll(reads: poll.reads, closed: .fieldUnreadable) }
    if readbackSecure(role: seenRole, subrole: subrole) { return ReadbackPoll(reads: poll.reads, closed: .becameSecure) }
    if seenRole != role { return ReadbackPoll(reads: poll.reads, closed: .fieldChanged) }
    poll.reads += 1
    poll.last = compare(field)
    if poll.last == .equal { poll.matched = true; break }
    if reads.now() - started >= typeReadbackBudgetMs { break }
    reads.sleep(typeReadbackPollIntervalMs)
  } while true
  return poll
}
func finishFixture() throws {
  try readback.finish()
}
`;
const input='func fixture(_ args: [String: Any]) {\n    let probe354AuditTag = Probe354Audit.shared.begin(args)\n    defer { Probe354Audit.shared.finish(probe354AuditTag) }\n}\n';
function fixture(t,withReader=true){
 const root=mkdtempSync(join(tmpdir(),'probe354-caret-patch-')),dir=join(root,'native/engine/Sources/Engine');mkdirSync(dir,{recursive:true});t.after(()=>rmSync(root,{recursive:true,force:true}));
 const audit=readFileSync(new URL('./audit.swift',import.meta.url),'utf8');writeFileSync(join(dir,'Input.swift'),input);writeFileSync(join(dir,'Probe354Audit.swift'),audit);if(withReader)writeFileSync(join(dir,'TypeReadback.swift'),reader);
 return {root,dir,audit};
}
const strip=s=>s.replace(/^\s*\/\/ probe354-caret [^\n]+ begin\n[\s\S]*?^\s*\/\/ probe354-caret [^\n]+ end\n/gm,'');
test('reader instrumentation leaves every production guard, compare, exit and response byte unchanged outside hooks',t=>{
 const {root,dir}=fixture(t),report=patchCaret(root);
 assert.equal(report.readerHook,'TypeReadback');assert.equal(strip(readFileSync(join(dir,'TypeReadback.swift'),'utf8')),reader);
 assert.equal(strip(readFileSync(join(dir,'Input.swift'),'utf8')),input);
 assert.throws(()=>patchCaret(root),/fresh/);
});
test('main is instrumented for actual API replies but does not acquire an invented production reader',t=>{
 const {root,dir,audit}=fixture(t,false),report=patchCaret(root);
 assert.equal(report.readerHook,'none');assert.equal(existsSync(join(dir,'TypeReadback.swift')),false);
 let restored=readFileSync(join(dir,'Probe354Audit.swift'),'utf8');
 restored=restored.replace(/  \/\/ probe354-caret single begin\n[\s\S]*?  \/\/ probe354-caret single end/,'  return AXUIElementCopyAttributeValue(element, name, out)');
 restored=restored.replace(/  \/\/ probe354-caret batch begin\n[\s\S]*?  \/\/ probe354-caret batch end/,'  return AXUIElementCopyMultipleAttributeValues(element, names, options, out)');
 assert.equal(restored,audit);
});
test('an ambiguous poll anchor refuses before modifying scratch source',t=>{
 const {root,dir}=fixture(t);writeFileSync(join(dir,'TypeReadback.swift'),reader+reader);
 assert.throws(()=>patchCaret(root),/ambiguous/);assert.equal(readFileSync(join(dir,'Input.swift'),'utf8'),input);
 assert.equal(existsSync(join(dir,'Probe354CaretTrace.swift')),false);
});
