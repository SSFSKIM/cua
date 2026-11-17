// Source-boundary tests only: never compile or execute Swift locally. The compatibility tests export the exact reviewed head's
// engine sources (git archive), apply audit-patch then walk-patch, and prove every hook strips back to the production bytes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {patchAudit} from './audit-patch.mjs';
import {patchWalk,patchReaderText,placeHooks,hookBlock,INPUT_HOOKS,WALKER_HOOKS,CLASSIFIER_HOOKS,WALK_PINS} from './walk-patch.mjs';

const HEAD='a7529ee006d79cd7a5bf40d9d37dc0e829df790d',REPO=fileURLToPath(new URL('../..',import.meta.url));
const SRC='native/engine/Sources/Engine';
const strip=s=>{const out=[];let skipping=false;for(const line of s.split('\n')){
 if(/^\s*\/\/ probe354-walk [^\n]+ begin$/.test(line)){skipping=true;continue}
 if(/^\s*\/\/ probe354-walk [^\n]+ end$/.test(line)){skipping=false;continue}
 if(!skipping)out.push(line)}return out.join('\n')};
const haveHead=(()=>{try{execFileSync('git',['-C',REPO,'cat-file','-e',HEAD+'^{commit}'],{stdio:'ignore'});return true}catch{return false}})();
// A fresh source-only export of the exact head, audit-patched the way the settle-ab after build is.
function exported(t){
 const root=mkdtempSync(join(tmpdir(),'probe354-walk-head-')),tar=join(root,'src.tar'),dir=join(root,SRC);
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 execFileSync('git',['-C',REPO,'archive','-o',tar,HEAD,SRC]);execFileSync('tar',['-xf',tar,'-C',root]);
 patchAudit(root);
 const snapshot=()=>{const out={};(function visit(d,rel){for(const e of readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:1)){const p=join(d,e.name),r=rel+e.name;if(e.isDirectory())visit(p,r+'/');else out[r]=readFileSync(p,'utf8')}})(dir,'');return out};
 return {root,dir,audited:snapshot(),snapshot};
}
const skip=haveHead?false:'reviewed head '+HEAD+' is not in this checkout';

test('applied to the exact reviewed head, stripping every hook restores each audited production byte',{skip},t=>{
 const {root,dir,audited,snapshot}=exported(t),report=patchWalk(root),after=snapshot();
 assert.equal(report.pinnedWalker,'a7529ee0');assert.equal(report.hooks,INPUT_HOOKS.length+WALKER_HOOKS.length+CLASSIFIER_HOOKS.length);
 assert.equal(report.changesEngineResponses,false);assert.equal(report.addsAXRequests,false);
 assert.deepEqual(Object.keys(after).sort(),[...Object.keys(audited),'Probe354WalkTrace.swift'].sort());
 const changed=Object.keys(audited).filter(n=>after[n]!==audited[n]);assert.deepEqual(changed.sort(),['Input.swift','TypeReadback.swift']);
 for(const n of Object.keys(audited))assert.equal(strip(after[n]),audited[n],n);
 // Only whole marker blocks were added: the marker counts match the hook lists.
 const blocks=s=>(s.match(/\/\/ probe354-walk [^\n]+ begin\n/g)??[]).length;
 assert.equal(blocks(after['Input.swift']),INPUT_HOOKS.length);assert.equal(blocks(after['TypeReadback.swift']),WALKER_HOOKS.length+CLASSIFIER_HOOKS.length);
 assert.equal(readFileSync(join(dir,'Probe354WalkTrace.swift'),'utf8'),readFileSync(new URL('./walk.swift',import.meta.url),'utf8'));
});

test('hooks sit in the walker at the stages the sink infers each exit from',{skip},t=>{
 const {root,dir}=exported(t);patchWalk(root);
 const all=readFileSync(join(dir,'TypeReadback.swift'),'utf8').split('\n');
 const lines=all.slice(all.findIndex(l=>l.startsWith('func readbackFocusedByWalk<Element>'))),at=s=>{const i=lines.findIndex(l=>l.includes(s));assert.ok(i>=0,s);return i};
 const order=['var found: Element?','probe354-walk start end','probe354-walk top begin','if index >= typeReadbackFocusWalkNodes ||','index += 1','probe354-walk visit begin','case .value(let role) where','probe354-walk leaf begin','case .value(true):','probe354-walk focused begin','if found != nil { return nil }','probe354-walk children begin','switch walk.children(element)','case .value(let children):','probe354-walk children-read begin','if depth >= typeReadbackFocusWalkDepth { return nil }','probe354-walk completed begin','  return found'].map(at);
 assert.deepEqual(order,[...order].sort((a,b)=>a-b));
 // The cap hook precedes the production cap line and reads only its own bound, never the clock.
 assert.ok(lines[at('probe354-walk top begin')+1].includes('atNodeCap: index >= typeReadbackFocusWalkNodes'));
 assert.equal(lines[at('probe354-walk top begin')+1].includes('walk.now'),false);
 // The end hook runs in a defer and is the only place a hook reads the clock; no hook issues a walk read.
 const hookText=lines.filter(l=>l.includes('Probe354WalkTrace')||l.includes('probe354Walk?.')).join('\n');
 assert.equal((hookText.match(/walk\.now\(\)/g)??[]).length,1);assert.ok(hookText.includes('defer { Probe354WalkTrace.shared.endWalk'));
 assert.equal(/walk\.(children|role|isFocused)\(/.test(hookText),false);
 const classifier=all.findIndex(l=>l.includes('Probe354WalkTrace.shared.noteRead'));
 assert.ok(all[classifier-1].includes('probe354-walk read begin'));assert.ok(all[classifier+2].includes('switch error {'));
});

test('a changed walker, bound, classifier or caller is refused before any scratch write',{skip},t=>{
 const base=exported(t);
 const mutations={
  'node bound':s=>s.replace('typeReadbackFocusWalkNodes = 200','typeReadbackFocusWalkNodes = 300'),
  'depth bound':s=>s.replace('typeReadbackFocusWalkDepth = 12','typeReadbackFocusWalkDepth = 14'),
  'time bound':s=>s.replace('typeReadbackFocusWalkMs: Double = 40','typeReadbackFocusWalkMs: Double = 60'),
  'claimed roles':s=>s.replace('.union(["AXSecureTextField"])','.union([])'),
  'a walker exit':s=>s.replace('    case .failed: return nil\n    case .value(let role) where','    case .failed: break\n    case .value(let role) where'),
  'the depth cut':s=>s.replace('if depth >= typeReadbackFocusWalkDepth { return nil }','if depth > typeReadbackFocusWalkDepth { return nil }'),
  'the classifier':s=>s.replace('case .noValue, .attributeUnsupported: return .absent','case .noValue: return .absent'),
  'the caller':s=>s.replace('primaryWindow(application).flatMap { readbackFocusedByWalk($0, walk) }','primaryWindow(application).flatMap { readbackFocusedByWalk($0, walk) } ?? nil'),
  'the read vocabulary':s=>s.replace('enum ReadbackWalkRead<Value> {\n  case value(Value)\n  case absent\n','enum ReadbackWalkRead<Value> {\n  case value(Value)\n  case absent\n  case other\n')
 };
 for(const [name,mutate] of Object.entries(mutations)){
  const reader=base.audited['TypeReadback.swift'],bad=mutate(reader);assert.notEqual(bad,reader,name+' mutation did not apply');
  const root=mkdtempSync(join(tmpdir(),'probe354-walk-mut-')),dir=join(root,SRC);t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(dir,{recursive:true});
  for(const n of ['Input.swift','TypeReadback.swift'])writeFileSync(join(dir,n),n==='TypeReadback.swift'?bad:base.audited[n]);
  assert.throws(()=>patchWalk(root),/walker source (mismatch|ambiguous)/,name);
  assert.equal(readFileSync(join(dir,'TypeReadback.swift'),'utf8'),bad,name);assert.equal(readFileSync(join(dir,'Input.swift'),'utf8'),base.audited['Input.swift'],name);
  assert.equal(existsSync(join(dir,'Probe354WalkTrace.swift')),false,name);
 }
 assert.throws(()=>patchReaderText(base.audited['TypeReadback.swift']+'\n'+WALK_PINS.walker),/ambiguous/);
 assert.throws(()=>patchReaderText('func other() {}\n'),/mismatch/);
});

test('it requires the audit patch first, both source files, and refuses a second application',{skip},t=>{
 const {root,dir}=exported(t);
 const input=join(dir,'Input.swift'),text=readFileSync(input,'utf8');
 writeFileSync(input,text.replace('Probe354Audit.shared.begin(args)','args'));assert.throws(()=>patchWalk(root),/audit/);
 assert.equal(existsSync(join(dir,'Probe354WalkTrace.swift')),false);
 writeFileSync(input,text);patchWalk(root);assert.throws(()=>patchWalk(root),/already walk-traced/);
 const bare=mkdtempSync(join(tmpdir(),'probe354-walk-bare-'));t.after(()=>rmSync(bare,{recursive:true,force:true}));mkdirSync(join(bare,SRC),{recursive:true});
 assert.throws(()=>patchWalk(bare),/needs Input.swift and TypeReadback.swift/);
});

// The hook mechanism itself, on a stand-in function.
const reader='func f() {\n  var found: Int?\n  while true {\n    if done { return nil }\n    step()\n  }\n  return found\n}\n';
const hooks=[
 {name:'start',anchor:'  var found: Int?\n',where:'after',indent:'  ',lines:['let probe = begin()']},
 {name:'top',anchor:'    if done { return nil }\n',where:'before',indent:'    ',lines:['probe?.top()']}
];
test('hooks land on the intended side of whole-line anchors and strip back to the original bytes',()=>{
 const out=placeHooks(reader,hooks,'T'),lines=out.split('\n'),at=s=>lines.findIndex(l=>l.includes(s));
 assert.ok(at('var found')<at('probe354-walk start begin'));assert.ok(at('probe354-walk top end')<at('if done'));
 assert.equal(strip(out),reader);
 assert.equal(hookBlock('  ','x',['a','b']),'  // probe354-walk x begin\n  a\n  b\n  // probe354-walk x end\n');
});
test('missing, ambiguous, partial and colliding anchors are refused',()=>{
 assert.throws(()=>placeHooks(reader.replace('found: Int?','seen: Int?'),hooks,'T'),/missing/);
 assert.throws(()=>placeHooks(reader+reader,hooks,'T'),/ambiguous/);
 assert.throws(()=>placeHooks(reader,[{...hooks[0],anchor:'  var found: Int?'}],'T'),/whole lines/);
 assert.throws(()=>placeHooks(reader,[hooks[0],{name:'same',anchor:'  var found: Int?\n',where:'after',indent:'  ',lines:['x']}],'T'),/collide/);
});

test('the Swift sink is gated, makes no AX request of its own and its wire keys are the parser schema',()=>{
 const swift=readFileSync(new URL('./walk.swift',import.meta.url),'utf8');
 assert.ok(swift.includes('probe354WalkTagValid')&&swift.includes('"large-page/input/plain/"'));
 assert.ok(/concealed.*!= true/.test(swift));
 assert.equal(/AXUIElement|kAX|stringAttribute|CFString|\.value|String\(describing|copyAttribute/.test(swift),false);
 for(const k of ['visited','queued','elapsedMs','leaves','focused','claimed','cutShort','reason','depthReached','failedAXError','index','probe354FocusWalkTrace'])assert.ok(swift.includes('"'+k+'"'),k);
 for(const r of ['node','time','depth','role-failed','focus-failed','children-failed','multiple','no-candidate','finished'])assert.ok(swift.includes('"'+r+'"'),r);
});

// A model of the pinned walker with the hooks at their patched positions, against the Swift sink's reason mapping. Each
// production `return` records the true exit, so the stage inference is checked against it over many trees and clocks.
function walkModel(root,{nodes=200,depthLimit=12,ms=40,tick=0}){
 let clock=0;const now=()=>(clock+=tick);const started=now();
 const S={stage:'start',atNodeCap:false,done:false,leaves:0,focused:0,depth:null,lastAXError:null};
 const read=r=>{S.lastAXError=r.error??0;return r};
 const queue=[[root,0]];let index=0,found=null,truth;
 const run=()=>{
  while(index<queue.length){
   S.stage='cap';S.atNodeCap=index>=nodes;
   if(index>=nodes){truth='node';return}if(now()-started>ms){truth='time';return}
   const [el,depth]=queue[index];index+=1;S.stage='role';S.depth=Math.max(S.depth??depth,depth);
   const role=read(el.role??{kind:'value',v:'AXGroup'});
   if(role.kind==='failed'){truth='role-failed';return}
   if(role.kind==='value'&&role.v==='AXTextField'){
    S.stage='leaf';S.leaves+=1;
    const f=read(el.focused??{kind:'absent'});
    if(f.kind==='failed'){truth='focus-failed';return}
    if(f.kind==='value'&&f.v===true){S.focused+=1;if(found){truth='multiple';return}found=el}
    continue;
   }
   S.stage='children';
   const c=read(el.children??{kind:'absent'});
   if(c.kind==='failed'){truth='children-failed';return}
   if(c.kind==='value'){S.stage='childrenRead';if(c.v.length===0)continue;if(depth>=depthLimit){truth='depth';return}for(const k of c.v)queue.push([k,depth+1])}
  }
  S.done=true;truth=found?'finished':'no-candidate';
 };
 run();
 // The Swift mapping in Probe354WalkState.reason.
 const reason=S.done?(S.focused===1?'finished':S.focused===0?'no-candidate':'unclassified'):{cap:S.atNodeCap?'node':'time',role:'role-failed',leaf:S.focused>=2?'multiple':'focus-failed',children:'children-failed',childrenRead:'depth',start:'unclassified'}[S.stage];
 return {truth,reason,visited:index,queued:queue.length,S};
}
const val=v=>({kind:'value',v}),leaf=(focused,extra={})=>({role:val('AXTextField'),focused:focused===null?{kind:'absent'}:val(focused),...extra});
const group=(children,extra={})=>({children:children===null?{kind:'absent'}:val(children),...extra});
test('the stage inference names every exit of the walker model, with its counters',()=>{
 const deep=n=>n===0?group([]):group([deep(n-1)]);
 const wide=n=>group(Array.from({length:n},()=>group([])));
 const cases=[
  ['finished',group([group([leaf(true)]),leaf(false)]),{}],
  ['finished',group([leaf(true)]),{}],
  ['no-candidate',group([leaf(false),leaf(null),group([])]),{}],
  ['no-candidate',group(null),{}],
  ['multiple',group([leaf(true),leaf(true),leaf(true)]),{}],
  ['node',wide(250),{}],
  ['time',wide(20),{tick:3}],
  ['depth',deep(13),{}],
  ['no-candidate',deep(12),{}],
  ['role-failed',group([{role:{kind:'failed',error:-25204}}]),{}],
  ['focus-failed',group([leaf(true),{role:val('AXTextField'),focused:{kind:'failed',error:-25212}}]),{}],
  ['children-failed',group([group([],{children:{kind:'failed',error:0}})]),{}]
 ];
 for(const [want,tree,opts] of cases){const r=walkModel(tree,opts);assert.equal(r.truth,want,want+' truth');assert.equal(r.reason,want,want);}
 const r=walkModel(group([leaf(true),{role:val('AXTextField'),focused:{kind:'failed',error:-25212}}]),{});assert.equal(r.S.lastAXError,-25212);assert.equal(r.S.focused,1);assert.equal(r.S.leaves,2);
 const d=walkModel(deep(13),{});assert.equal(d.S.depth,12);assert.equal(d.visited,13);
});
test('over many random trees and clocks the inferred exit equals the true exit',()=>{
 let seed=12345;const rnd=()=>(seed=(seed*1664525+1013904223)>>>0)/2**32;
 const pick=a=>a[Math.floor(rnd()*a.length)];
 const make=depth=>{
  const r=rnd();
  if(r<0.18)return leaf(pick([true,false,null,true]),rnd()<0.05?{focused:{kind:'failed',error:-25204}}:{});
  const node={};if(rnd()<0.03)node.role={kind:'failed',error:-25204};
  if(rnd()<0.03)node.children={kind:'failed',error:0};
  else if(rnd()<0.1)node.children={kind:'absent'};
  else node.children=val(depth>=14||rnd()<0.2?[]:Array.from({length:Math.floor(rnd()*7)},()=>make(depth+1)));
  return node;
 };
 const seen=new Set();
 for(let i=0;i<4000;i++){const r=walkModel(make(0),{tick:pick([0,0,0.2,1,3]),nodes:pick([200,200,40]),depthLimit:pick([12,12,5])});assert.equal(r.reason,r.truth,'tree '+i);seen.add(r.truth)}
 assert.deepEqual([...seen].sort(),['children-failed','depth','finished','focus-failed','multiple','no-candidate','node','role-failed','time']);
});
