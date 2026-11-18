// Hosted scratch source only, applied by the qualifier before `swift build` of the INSTRUMENTED lane. Never touches an exact
// stock build. Layers #395's schedule audit over the #354 audit patch (probe-354-fences/audit-patch.mjs, reused unchanged):
//   1. patchAudit (354): tagged type_text begin/finish, text and range read counts through probe354Copy* wrappers.
//   2. here: a second begin/finish for the schedule (`probe395Audit` request key); every audited AX call is redirected
//      through probe395* wrappers that time it and record only its name, an element alias and an outcome; the two CGEvent
//      posts in DesktopGate are marked (the pre-input boundary); AX writes and actions are recorded by name.
//   3. optional named phase hooks, each a one-line function signature anchor, inserted as `phaseBegin` + `defer phaseEnd`.
//      A hook whose anchor is absent or ambiguous is reported as skipped, never guessed, so a future head is not forced to
//      carry a function name; `--require <names>` makes a named hook mandatory (fail closed) when a lane must carry it.
// Observation only: every hook is a marker-delimited insertion or a wrapper-name swap, so undoing them restores each
// production byte (audit-patch.test.mjs does exactly that). stdout is the allowlisted provenance JSON (counts and names).
import {readFileSync,writeFileSync,readdirSync,copyFileSync,realpathSync} from 'node:fs';
import {join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {patchAudit as patch354} from '../probe-354-fences/audit-patch.mjs';
const MARK='// probe395-audit';
const AUDIT_DEFER='    defer { Probe354Audit.shared.finish(probe354AuditTag) }\n';
const BEGIN_395=`    ${MARK} request begin\n    let probe395AuditTag = Probe395Audit.shared.begin(args)\n    defer { Probe395Audit.shared.finish(probe395AuditTag) }\n`;
// 354's wrappers are re-pointed at 395's, which call them; the raw APIs below 354 never wrapped are wrapped here.
export const REDIRECTS=Object.freeze({
 probe354CopyAttributeValue:'probe395CopyAttributeValue',probe354CopyMultipleAttributeValues:'probe395CopyMultipleAttributeValues',probe354CopyParameterizedAttributeValue:'probe395CopyParameterizedAttributeValue',
 AXUIElementSetAttributeValue:'probe395SetAttributeValue',AXUIElementPerformAction:'probe395PerformAction',AXUIElementCopyAttributeNames:'probe395CopyAttributeNames',
 AXUIElementCopyActionNames:'probe395CopyActionNames',AXUIElementCopyElementAtPosition:'probe395CopyElementAtPosition'});
const REQUIRED_REDIRECTS=['probe354CopyAttributeValue','probe354CopyMultipleAttributeValues','probe354CopyParameterizedAttributeValue'];
// The pre-input boundary: the engine posts every CGEvent through these two gated seams (DesktopGate.swift).
export const EVENT_HOOKS=Object.freeze([
 {name:'post',from:'{ event.postToPid(pid) }',to:'{ /* probe395-audit */ Probe395Audit.shared.eventPosted(event); event.postToPid(pid) }'},
 {name:'hid',from:'{ event.post(tap: .cghidEventTap) }',to:'{ /* probe395-audit */ Probe395Audit.shared.eventPosted(event); event.post(tap: .cghidEventTap) }'}]);
// Signature lines of production functions with statement bodies, pinned at main 4291f3ba (TypeReadback.swift) and, for
// markedField (the whole text-marker route: web area search, marker calls and classification), at the candidate 60327d46
// (TypeReadbackMarker.swift). Optional here; a lane requires the ones its head must carry with `--require`.
export const DEFAULT_PHASE_HOOKS=Object.freeze([
 {name:'markedField',signature:'func readbackMarkedField<Element>(window: Element, walk: ReadbackFocusWalk<Element>, marker: ReadbackMarkerReads<Element>) -> ReadbackFound<Element>? {'},
 {name:'walk',signature:'func readbackFocusedByWalk<Element>(_ window: Element, _ walk: ReadbackFocusWalk<Element>) -> Element? {'},
 {name:'poll',signature:'func readbackPoll<Element>(_ field: Element, role: String, reads: ReadbackReads<Element>, compare: (Element) -> ReadbackRead) -> ReadbackPoll {'},
 {name:'fieldClosed',signature:'func readbackFieldClosed<Element>(_ field: Element, role: String, reads: ReadbackReads<Element>) -> TypeReadbackReason? {'}]);
const sha=s=>createHash('sha256').update(s).digest('hex').slice(0,16);
function swiftSources(dir){const out=[];(function walk(d){for(const e of readdirSync(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory())walk(p);else if(e.name.endsWith('.swift'))out.push(p)}})(dir);return out.sort()}
const occurrences=(text,needle)=>text.split(needle).length-1;
export function phaseInsertion(name){
 if(!/^[a-z][A-Za-z0-9]{0,20}$/.test(name))throw Error('invalid phase hook name');
 return `\n  ${MARK} phase ${name}\n  let probe395Phase_${name} = Probe395Audit.shared.phaseBegin("${name}")\n  defer { Probe395Audit.shared.phaseEnd("${name}", probe395Phase_${name}) }`;
}
export function patchQualAudit(root,{phaseHooks=DEFAULT_PHASE_HOOKS,require=[]}={}){
 const dir=join(root,'native/engine/Sources/Engine'),input=join(dir,'Input.swift'),own=join(dir,'Probe395Audit.swift');
for(const hook of phaseHooks){
  if(!/^[a-z][A-Za-z0-9]{0,20}$/.test(hook.name??''))throw Error('invalid phase hook name');
  if(!hook.signature||hook.signature.includes('\n')||!hook.signature.endsWith('{'))throw Error('phase hook signature must be one line ending in {: '+hook.name);
 }
 for(const name of require)if(!phaseHooks.some(h=>h.name===name))throw Error('required phase hook is not configured: '+name);
 // Validate everything the 354 patch does not before it writes: its own anchors fail on their own, ours fail before any 395 write.
 const base=readFileSync(input,'utf8');
 if(base.includes('Probe395Audit'))throw Error('source already audited for the schedule');
 if(occurrences(base,AUDIT_DEFER)!==0)throw Error('source already audited');
 const report354=patch354(root);
 let inputText=readFileSync(input,'utf8');
 if(occurrences(inputText,AUDIT_DEFER)!==1)throw Error('354 audit defer missing or ambiguous');
 inputText=inputText.replace(AUDIT_DEFER,()=>AUDIT_DEFER+BEGIN_395);
 const files=swiftSources(dir),texts=new Map(files.map(p=>[p,p===input?inputText:readFileSync(p,'utf8')])),redirects={};
 for(const [p,text] of texts){
  if(basename(p)==='Probe354Audit.swift')continue; // 354's own definitions keep their names
  let t=text;
  for(const [from,to] of Object.entries(REDIRECTS))t=t.replace(new RegExp('(?<![\\w"])'+from+'(?=\\s*\\()','g'),()=>{redirects[from]=(redirects[from]??0)+1;return to});
  texts.set(p,t);
 }
 for(const from of REQUIRED_REDIRECTS)if(!redirects[from])throw Error('expected audited AX boundary missing: '+from);
 const events={};
 for(const hook of EVENT_HOOKS){
  const holders=[...texts].filter(([,t])=>t.includes(hook.from));
  if(holders.length===1&&occurrences(holders[0][1],hook.from)===1){texts.set(holders[0][0],holders[0][1].replace(hook.from,()=>hook.to));events[hook.name]=true}
  else events[hook.name]=false;
 }
 const phases={applied:[],skipped:[]};
 for(const hook of phaseHooks){
  if(!hook.signature||hook.signature.includes('\n')||!hook.signature.endsWith('{'))throw Error('phase hook signature must be one line ending in {: '+hook.name);
  const holders=[...texts].filter(([,t])=>t.includes(hook.signature));
  if(holders.length===1&&occurrences(holders[0][1],hook.signature)===1){texts.set(holders[0][0],holders[0][1].replace(hook.signature,()=>hook.signature+phaseInsertion(hook.name)));phases.applied.push(hook.name)}
  else if(require.includes(hook.name))throw Error('required phase hook anchor missing or ambiguous: '+hook.name);
  else phases.skipped.push({name:hook.name,reason:holders.length===0?'anchor-absent':'anchor-ambiguous'});
 }
 for(const [p,t] of texts)writeFileSync(p,t);
 const swift=readFileSync(new URL('./audit.swift',import.meta.url),'utf8');
 writeFileSync(own,swift);
 return {audit:'schedule audit (order, names, element aliases, outcomes, clocks) layered over the #354 text/range counts; no AX requests added; response semantics unchanged; no value, range, marker, byte or length is read or kept',
  base354:report354,redirects,boundaries:{typeText:true,eventPost:events.post===true,eventHid:events.hid===true},phases,source:{audit:sha(swift)}};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const [root,...rest]=process.argv.slice(2);
 if(!root)throw Error('usage: audit-patch.mjs <scratch-source-root> [--hooks <phase-hooks.json>] [--require <name,name>]');
 let hooks=DEFAULT_PHASE_HOOKS,required=[];
 for(let i=0;i<rest.length;i+=2){
  if(rest[i]==='--hooks')hooks=JSON.parse(readFileSync(rest[i+1],'utf8'));
  else if(rest[i]==='--require')required=rest[i+1].split(',').filter(Boolean);
  else throw Error('unknown option');
 }
 console.log(JSON.stringify(patchQualAudit(root,{phaseHooks:hooks,require:required})));
}
