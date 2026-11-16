import {SEED} from '../probe-354/page.mjs';
export const ENGINE_REF='3c669314e0a5f35aedf20f9b792604fc09628c45';
export const EDITORS=['textarea','input','contenteditable','compose'];
export const KEYS=['Left','alt+Left','cmd+Left','cmd+shift+Left'];
export const VARIANTS=['baseline','window','nsevent-window','numpad','function','arrow-flags','private-source','combined-source','equivalent-prelude','ax-range'];
export const DELAYS=[0,50,250,1000];
// NSWorkspace's foreground state refreshes only as the helper's main run loop turns; a sample taken this long after the
// last turn can be frozen, so it cannot show that the foreground was undisturbed. This bounds a frozen loop, not lag.
export const MAIN_LOOP_STALE_MS=250;
export function expected(key,boundary=false){if(boundary)return [0,0];return {'Left':[28,0],'alt+Left':[24,0],'cmd+Left':[0,0],'cmd+shift+Left':[0,29]}[key]?.slice()??null}
export function plan(smoke=false){
 const cells=[];
 function add(editor,key,variant='baseline',scene='background',reader=true,boundary=false){
  const cell=[editor,key,variant,scene,reader?'AX':'DOM-only',boundary?'boundary':'end'].join('/');
  cells.push({cell,editor,key,variant,scene,reader,boundary,expected:expected(key,boundary)});
 }
 for(const e of EDITORS){
  for(const v of VARIANTS)for(const k of KEYS.slice(0,2))add(e,k,v);
  for(const k of KEYS.slice(2))for(const v of ['baseline','equivalent-prelude'])add(e,k,v);
  for(const k of KEYS)add(e,k,'baseline','foreground');
  for(const k of KEYS.slice(0,2)){add(e,k,'baseline','background',false);add(e,k,'baseline','background',true,true)}
 }
 // Rotate the order each repetition; no cell is retried to replace a failure.
 const rows=[];for(let rep=1;rep<=(smoke?1:20);rep++){
  const shift=(rep-1)*17%cells.length;
  for(const c of [...cells.slice(shift),...cells.slice(0,shift)])rows.push({...c,rep,id:c.cell+'/'+rep});
 }return rows;
}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const range=r=>Array.isArray(r)&&r.length===2&&r.every(n=>Number.isSafeInteger(n)&&n>=0);
function owner(a,b){return a?.pageId===b?.pageId&&a?.timeOrigin===b?.timeOrigin&&a?.ownerEpoch===b?.ownerEpoch}
export function classify(r){
 const final=r.samples?.find(s=>s.delay===1000),before=r.boundary?[0,0]:[SEED.length,0];
 const samplesOK=DELAYS.every(d=>r.samples?.filter(s=>s.delay===d).length===1)&&r.samples.every(s=>owner(s,r.owner)&&s.visibility==='visible'&&typeof s.text==='string'&&range(s.selection)&&!s.error);
 const identityOK=!!r.owner&&r.identityBefore?.windowTitle?.includes('probe354:'+r.owner.pageId)&&r.identityAfter?.windowTitle?.includes('probe354:'+r.owner.pageId)&&r.identityBefore.windowID>0&&r.identityBefore.windowID===r.identityAfter.windowID;
 const setupOK=owner(r.setup,r.owner)&&r.setup?.text===SEED&&equal(r.setup.selection,before)&&r.setup.focused;
 const watchOK=r.watch?.complete===true&&r.watch.samples?.length>0;
 const expectedFront=r.scene==='foreground'?r.targetPid:r.coverPid;
 const sideEffectKnown=watchOK&&r.watch.samples.every(s=>s.frontmostPid>0&&s.orderReadable===true&&Number.isFinite(s.mainLoopAgeMs)&&s.mainLoopAgeMs<=MAIN_LOOP_STALE_MS);
 const sideEffect=!!r.watch?.samples?.some(s=>s.frontmostPid!==expectedFront||(r.scene!=='foreground'&&s.targetAboveCover===true));
 const scorable=!!(samplesOK&&identityOK&&setupOK&&watchOK&&!r.problem);
 const editorFocusLost=!!r.samples?.some(s=>s.focused!==true);
 const effect=scorable?final.focused&&final.text===SEED&&equal(final.selection,r.expected):null;
 const a=r.axBefore,b=r.axSamples?.find(s=>s.delay===1000);
 const axPairReadable=!!(range(a?.range)&&range(b?.range)&&a.sameFocused&&b.sameFocused);
 const axBeforeAgrees=axPairReadable?equal(a.range,r.setup?.selection):null;
 const axAfterAgrees=axPairReadable&&final?equal(b.range,final.selection):null;
 // A transition at an independently known, non-boundary caret is necessary; equality at a boundary acknowledges nothing.
 const axConfirms=!!(scorable&&!r.boundary&&axPairReadable&&axBeforeAgrees&&equal(b.range,r.expected)&&!equal(a.range,b.range));
 const error=!!r.action?.error;
 return {scorable,effect,error,sideEffectKnown,sideEffect,editorFocusLost,safeEffect:effect===true&&sideEffectKnown&&!sideEffect&&!editorFocusLost,
  plainSuccessNoEffect:scorable&&!error&&effect===false,axPairReadable,axBeforeAgrees,axAfterAgrees,axConfirms,axFalseConfirm:axConfirms&&effect!==true,
  keydown:r.samples?.flatMap(s=>s.trace??[]).filter(e=>e.event==='keydown').length??0,
  beforeinput:r.samples?.flatMap(s=>s.trace??[]).filter(e=>e.event==='beforeinput').length??0,
  selectionchange:r.samples?.flatMap(s=>s.trace??[]).filter(e=>e.event==='selectionchange').length??0};
}
export function summarize(rows,smoke){
 const wanted=plan(smoke),ids=new Map(wanted.map(c=>[c.id,c])),counts=new Map(),groups=new Map(wanted.map(c=>[c.cell,{cell:c.cell,planned:smoke?1:20,attempted:0,scorable:0,effect:0,safeEffect:0,errors:0,plainSuccessNoEffect:0,sideEffects:0,editorFocusLost:0,sideEffectUnknown:0,axPairReadable:0,axBeforeAgrees:0,axAfterAgrees:0,axConfirms:0,axFalseConfirm:0}]));
 let duplicates=0,unknown=0,mismatched=0;
 for(const r of rows){
  if(!ids.has(r.id)){unknown++;continue}
  counts.set(r.id,(counts.get(r.id)??0)+1);if(counts.get(r.id)>1){duplicates++;continue}
  const c=ids.get(r.id);if(Object.keys(c).some(k=>!equal(c[k],r[k]))){mismatched++;continue}
  const g=groups.get(c.cell),s=classify(r);g.attempted++;if(s.scorable)g.scorable++;
  for(const k of ['effect','safeEffect','plainSuccessNoEffect','axPairReadable','axBeforeAgrees','axAfterAgrees','axConfirms','axFalseConfirm'])if(s[k]===true)g[k]++;
  if(s.error)g.errors++;if(s.sideEffect)g.sideEffects++;if(s.editorFocusLost)g.editorFocusLost++;if(!s.sideEffectKnown)g.sideEffectUnknown++;
 }
 const missing=wanted.filter(c=>!counts.has(c.id)).length;
 return {smoke,planned:wanted.length,recorded:rows.length,coverage:{missing,duplicates,unknown,mismatched,complete:missing+duplicates+unknown+mismatched===0},cells:[...groups.values()],
  interpretation:'effect/scorable is observed DOM end-state, safeEffect additionally requires readable sampled foreground/order, each sample taken within MAIN_LOOP_STALE_MS of a main run-loop turn, with no violation. AX agreement is against DOM, never its replacement. An unchanged boundary never acknowledges consumption. Missing coverage is not a pass.'};
}
