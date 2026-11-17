// Opt-in scratch-build instrumentation of the focused-field walk, applied AFTER audit-patch.mjs and only to the after head of
// settle-ab. Observation only: hooks are marker-delimited blocks inserted between production lines, never edits of them, so
// deleting every block restores each production byte. The walker's whole source (and what its exits depend on) is pinned
// below from a7529ee0; any other walker is refused, so a changed exit can never be reported under old semantics.
// Every pin and anchor is checked before any scratch write.
import {readFileSync,writeFileSync,existsSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const MARK='// probe354-walk';
const AUDIT_DEFER='    defer { Probe354Audit.shared.finish(probe354AuditTag) }\n';
// The walk's source at a7529ee0, whole: the bounds, the read vocabulary and its classifier, the live read, the caller and the
// walker. A walk hook infers each exit from where the walk stopped, so every exit's source must be exactly this.
export const WALK_PINS=Object.freeze({
 constants:String.raw`let typeReadbackFocusWalkNodes = 200
let typeReadbackFocusWalkDepth = 12
let typeReadbackFocusWalkMs: Double = 40
`,
 roles:String.raw`let typeReadbackFocusWalkRoles: Set<String> = typeReadbackTextRoles.union(["AXSecureTextField"])
`,
 readEnum:String.raw`enum ReadbackWalkRead<Value> {
  case value(Value)
  case absent
  case failed
}
`,
 walkStruct:String.raw`struct ReadbackFocusWalk<Element> {
  var children: (Element) -> ReadbackWalkRead<[Element]>
  var isFocused: (Element) -> ReadbackWalkRead<Bool>
  var role: (Element) -> ReadbackWalkRead<String>
  var now: () -> Double = monotonicMilliseconds
}
`,
 liveRead:String.raw`func liveWalkRead<Value>(_ element: AXUIElement, _ name: String, _ convert: (CFTypeRef) -> Value?) -> ReadbackWalkRead<Value> {
  let (raw, error) = copyAttribute(element, name)
  return readbackWalkRead(raw, error, convert)
}
`,
 readClassifier:String.raw`func readbackWalkRead<Value>(_ raw: CFTypeRef?, _ error: AXError, _ convert: (CFTypeRef) -> Value?) -> ReadbackWalkRead<Value> {
  switch error {
  case .success: return raw.flatMap(convert).map { .value($0) } ?? .failed
  case .noValue, .attributeUnsupported: return .absent
  default: return .failed
  }
}
`,
 focusedField:String.raw`func readbackFocusedField<Element>(application: Element, focused: (Element) -> Element?, primaryWindow: (Element) -> Element?,
                                   walk: ReadbackFocusWalk<Element>) -> Element? {
  if let field = focused(application) { return field }
  return primaryWindow(application).flatMap { readbackFocusedByWalk($0, walk) }
}
`,
 walker:String.raw`func readbackFocusedByWalk<Element>(_ window: Element, _ walk: ReadbackFocusWalk<Element>) -> Element? {
  let started = walk.now()
  var queue: [(element: Element, depth: Int)] = [(window, 0)]
  var index = 0
  var found: Element?
  while index < queue.count {
    if index >= typeReadbackFocusWalkNodes || walk.now() - started > typeReadbackFocusWalkMs { return nil }
    let (element, depth) = queue[index]
    index += 1
    switch walk.role(element) {
    case .failed: return nil
    case .value(let role) where typeReadbackFocusWalkRoles.contains(role):
      switch walk.isFocused(element) {
      case .failed: return nil
      case .value(true):
        if found != nil { return nil }
        found = element
      case .value(false), .absent: break
      }
      continue
    case .value, .absent: break
    }
    switch walk.children(element) {
    case .failed: return nil
    case .absent: break
    case .value(let children):
      if children.isEmpty { break }
      if depth >= typeReadbackFocusWalkDepth { return nil }
      queue += children.map { ($0, depth + 1) }
    }
  }
  return found
}
`
});
// A hook block: begin/end marker lines around the hook's own lines, at the anchor's indentation.
export function hookBlock(indent,name,lines){
 return `${indent}${MARK} ${name} begin\n${lines.map(l=>indent+l+'\n').join('')}${indent}${MARK} ${name} end\n`;
}
// hooks: [{anchor,where:'after'|'before',name,indent,lines}]. Each anchor must be whole lines and occur exactly once in
// `text`; nothing is returned until all of them have matched.
export function placeHooks(text,hooks,label){
 const spots=hooks.map(h=>{
  if(!h.anchor.endsWith('\n'))throw Error(label+' anchor must be whole lines: '+h.name);
  const first=text.indexOf(h.anchor);
  if(first<0)throw Error(label+' hook anchor missing: '+h.name);
  if(text.indexOf(h.anchor,first+1)>=0)throw Error(label+' hook anchor ambiguous: '+h.name);
  return {at:h.where==='before'?first:first+h.anchor.length,block:hookBlock(h.indent,h.name,h.lines)};
 });
 // Equal insertion points would make order depend on list order: refuse rather than guess.
 if(new Set(spots.map(s=>s.at)).size!==spots.length)throw Error(label+' hook anchors collide');
 let out=text;for(const s of [...spots].sort((a,b)=>b.at-a.at))out=out.slice(0,s.at)+s.block+out.slice(s.at);
 return out;
}
export const INPUT_HOOKS=Object.freeze([{name:'request',anchor:AUDIT_DEFER,where:'after',indent:'    ',lines:['let probe354WalkTag = Probe354WalkTrace.shared.begin(args)','defer { Probe354WalkTrace.shared.finish(probe354WalkTag) }']}]);
// Anchors are whole lines of the pinned walker; each occurs once in it. The stage a walk last reached, with the completed
// flag, tells the sink which `return nil` (or the final `return found`) ended it. No hook reads, branches or returns.
export const WALKER_HOOKS=Object.freeze([
 {name:'start',anchor:'  var found: Element?\n',where:'after',indent:'  ',lines:['let probe354Walk = Probe354WalkTrace.shared.beginWalk()','defer { Probe354WalkTrace.shared.endWalk(probe354Walk, visited: index, queued: queue.count, elapsedMs: walk.now() - started) }']},
 {name:'top',anchor:'    if index >= typeReadbackFocusWalkNodes || walk.now() - started > typeReadbackFocusWalkMs { return nil }\n',where:'before',indent:'    ',lines:['probe354Walk?.top(atNodeCap: index >= typeReadbackFocusWalkNodes)']},
 {name:'visit',anchor:'    index += 1\n',where:'after',indent:'    ',lines:['probe354Walk?.visit(depth: depth)']},
 {name:'leaf',anchor:'    case .value(let role) where typeReadbackFocusWalkRoles.contains(role):\n',where:'after',indent:'      ',lines:['probe354Walk?.leaf()']},
 {name:'focused',anchor:'      case .value(true):\n',where:'after',indent:'        ',lines:['probe354Walk?.focusedLeaf()']},
 {name:'children',anchor:'    switch walk.children(element) {\n',where:'before',indent:'    ',lines:['probe354Walk?.childrenStart()']},
 {name:'children-read',anchor:'    case .value(let children):\n',where:'after',indent:'      ',lines:['probe354Walk?.childrenRead()']},
 {name:'completed',anchor:'  return found\n',where:'before',indent:'  ',lines:['probe354Walk?.completed()']}
]);
// The classifier's one hook: every answer of an attribute read during a walk, so a failed read's AX error is kept as the
// system gave it (0 means the call succeeded but the value was missing or of the wrong type).
export const CLASSIFIER_HOOKS=Object.freeze([
 {name:'read',anchor:'  switch error {\n',where:'before',indent:'  ',lines:['Probe354WalkTrace.shared.noteRead(error: error.rawValue)']}
]);
function once(text,pin,label){
 const first=text.indexOf(pin);
 if(first<0)throw Error('walker source mismatch: '+label+' is not the pinned a7529ee0 text');
 if(text.indexOf(pin,first+1)>=0)throw Error('walker source ambiguous: '+label);
 return first;
}
// Returns the patched TypeReadback.swift text, or throws; writes nothing.
export function patchReaderText(r){
 for(const [name,pin] of Object.entries(WALK_PINS))once(r,pin,name);
 const walkerAt=once(r,WALK_PINS.walker,'walker'),walker=WALK_PINS.walker;
 const classifierAt=once(r,WALK_PINS.readClassifier,'readClassifier'),classifier=WALK_PINS.readClassifier;
 const w=placeHooks(walker,WALKER_HOOKS,'walker'),c=placeHooks(classifier,CLASSIFIER_HOOKS,'classifier');
 // Replace the later region first so the earlier offset stays valid.
 const edits=[[walkerAt,walker.length,w],[classifierAt,classifier.length,c]].sort((a,b)=>b[0]-a[0]);
 let out=r;for(const [at,len,text] of edits)out=out.slice(0,at)+text+out.slice(at+len);
 return out;
}
export function patchWalk(root){
 const dir=join(root,'native/engine/Sources/Engine'),input=join(dir,'Input.swift'),reader=join(dir,'TypeReadback.swift'),sink=join(dir,'Probe354WalkTrace.swift');
 if(!existsSync(input)||!existsSync(reader))throw Error('walk patch needs Input.swift and TypeReadback.swift');
 if(existsSync(sink))throw Error('source already walk-traced');
 const i=readFileSync(input,'utf8'),r=readFileSync(reader,'utf8');
 if(!i.includes('Probe354Audit.shared.begin(args)'))throw Error('walk patch requires an audited scratch build (audit-patch first)');
 if(i.includes('Probe354WalkTrace')||r.includes('Probe354WalkTrace'))throw Error('source already walk-traced');
 const patchedInput=placeHooks(i,INPUT_HOOKS,'Input'),patchedReader=patchReaderText(r);
 const swift=readFileSync(new URL('./walk.swift',import.meta.url),'utf8');
 writeFileSync(input,patchedInput);writeFileSync(reader,patchedReader);writeFileSync(sink,swift);
 return {cohort:'safari-large-page-walk',pinnedWalker:'a7529ee0',hooks:INPUT_HOOKS.length+WALKER_HOOKS.length+CLASSIFIER_HOOKS.length,observationOnly:true,changesEngineResponses:false,addsAXRequests:false};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!process.argv[2])throw Error('usage: walk-patch.mjs <audited-scratch-source-root>');console.log(JSON.stringify(patchWalk(process.argv[2])));
}
