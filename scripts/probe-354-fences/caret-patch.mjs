// Opt-in scratch-build instrumentation, applied AFTER audit-patch.mjs. Never used for a primary build.
import {readFileSync,writeFileSync,existsSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const once=(text,from,to)=>{if(text.split(from).length!==2)throw Error('caret hook missing or ambiguous');return text.replace(from,to)};
export function patchCaret(root){
 const dir=join(root,'native/engine/Sources/Engine'),input=join(dir,'Input.swift'),audit=join(dir,'Probe354Audit.swift'),reader=join(dir,'TypeReadback.swift');
 let i=readFileSync(input,'utf8'),a=readFileSync(audit,'utf8'),r=existsSync(reader)?readFileSync(reader,'utf8'):null;
 if(!i.includes('Probe354Audit.shared.begin(args)')||i.includes('Probe354CaretTrace'))throw Error('caret patch requires a fresh observationally audited scratch build');
 i=once(i,'    let probe354AuditTag = Probe354Audit.shared.begin(args)','    let probe354AuditTag = Probe354Audit.shared.begin(args)\n    // probe354-caret request begin\n    let probe354CaretTag = Probe354CaretTrace.shared.begin(args)\n    defer { Probe354CaretTrace.shared.finish(probe354CaretTag) }\n    // probe354-caret request end');
 a=once(a,'  return AXUIElementCopyAttributeValue(element, name, out)',`  // probe354-caret single begin
  let probe354Started = probe354CaretNow()
  let probe354Code = AXUIElementCopyAttributeValue(element, name, out)
  Probe354CaretTrace.shared.rangeReply(name as String, raw: out.pointee, code: probe354Code, api: "single", started: probe354Started, ended: probe354CaretNow())
  return probe354Code
  // probe354-caret single end`);
 a=once(a,'  return AXUIElementCopyMultipleAttributeValues(element, names, options, out)',`  // probe354-caret batch begin
  let probe354Started = probe354CaretNow()
  let probe354Code = AXUIElementCopyMultipleAttributeValues(element, names, options, out)
  Probe354CaretTrace.shared.batchReplies((names as? [String]) ?? [], raw: out.pointee, code: probe354Code, started: probe354Started, ended: probe354CaretNow())
  return probe354Code
  // probe354-caret batch end`);
 if(r!==null){
  if(r.split('func readbackPoll<Element>').length!==2)throw Error('production readback poll missing or ambiguous');
  r=once(r,'    poll.reads += 1\n    poll.last = compare(field)',`    poll.reads += 1
    // probe354-caret poll begin
    let probe354Poll = Probe354CaretTrace.shared.beginPoll(field as AnyObject, readerRead: poll.reads)
    // probe354-caret poll end
    poll.last = compare(field)
    // probe354-caret outcome begin
    let probe354Outcome: String
    switch poll.last {
    case .unreadable?: probe354Outcome = "unreadable"
    case .equal?: probe354Outcome = "equal"
    case .equalUnconsumed?: probe354Outcome = "equalUnconsumed"
    case .differs?: probe354Outcome = "differs"
    case nil: probe354Outcome = "none"
    }
    Probe354CaretTrace.shared.endPoll(probe354Poll, outcome: probe354Outcome)
    // probe354-caret outcome end`);
  r=once(r,'  try keyText(units, concealed: concealed, checkSource: checkSource, beforeUnit: readback.beforeUnit,','  // probe354-caret start begin\n  Probe354CaretTrace.shared.typingStarted()\n  // probe354-caret start end\n  try keyText(units, concealed: concealed, checkSource: checkSource, beforeUnit: readback.beforeUnit,');
  r=once(r,'  try readback.finish()','  // probe354-caret typing begin\n  Probe354CaretTrace.shared.typingComplete()\n  // probe354-caret typing end\n  try readback.finish()');
 }
 // Validate every anchor before writing any scratch source. Main intentionally has no reader hook.
 const readerHook=r===null?'none':'TypeReadback',trace=once(readFileSync(new URL('./caret.swift',import.meta.url),'utf8'),'__READER_HOOK__',readerHook);
 writeFileSync(input,i);writeFileSync(audit,a);if(r!==null)writeFileSync(reader,r);writeFileSync(join(dir,'Probe354CaretTrace.swift'),trace);
 return {cohort:'firefox-caret',readerHook,productionRangeReplies:['single','batch'],addedProbe:'AXNumberOfCharacters after production role/subrole guards; diagnostic only',pollDefinition:'one production compare call after its guards',observerEffect:true,changesEngineResponses:false};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!process.argv[2])throw Error('usage: caret-patch.mjs <audited-scratch-source-root>');console.log(JSON.stringify(patchCaret(process.argv[2])));
}
