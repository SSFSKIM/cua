// #360 whole-production-path qualification: plan, DOM-oracle scoring, summary. Pure functions, no I/O.
//
// Oracle: the same-repetition foreground control (engine 'fix', scene 'foreground', same editor/key/rep) is the DOM
// effect for that editor and key; fix and main background rows are judged against it at the 1s sample. AX ranges are
// never read (#394). A control that is valid but moves neither selection nor any scroll axis makes dependents (and itself)
// notApplicable; unchanged is never counted as key consumption. A missing or invalid control is uncalibrated.
//
// Row shape (planned fields from plan(), plus what the controller records):
//   owner {pageId,timeOrigin,ownerEpoch}; foregroundReset, foregroundPrepare (fixture answers), setup (read after the
//   deactivation settle), armed (arm answer), samples[4] (one per DELAYS), optional cleanup (state after the connection
//   closed), identityBefore/After {windowTitle,windowID}, watch {complete,samples[]}, action {durationMs,error},
//   targetPid, coverPid, problem. State answers carry textHash/textLength, selection [start,len], direction, focused,
//   documentHasFocus, visibility and scroll {field,ancestors[],document} metrics {top,left,height,width,clientHeight,clientWidth}.
import {layout} from './qualification-page.mjs';
export const ENGINE_REF='f066023e6e8f91dc3e1570b993bfda8f2f45a9aa';
export const MAIN_REF='c7eee72403d64c420231ce59baa445524032102f';
export const EDITORS=['textarea','input','contenteditable','compose'];
export const MAIN_EDITORS=['contenteditable','compose'];
export const KEYS=['Left','alt+Left','cmd+Left','cmd+shift+Left','Home','End','PageUp','PageDown'];
export const ORIGINAL_KEYS=KEYS.slice(0,4);
export const DELAYS=[0,50,250,1000];
export const FINAL_DELAY=1000;
// Scroll offsets differ by sub-pixel rounding and device scale; two positions closer than this are the same position.
// The same tolerance decides whether an axis "moved" in the control and whether setup stayed put after deactivation.
export const SCROLL_TOL_PX=2;
export const MAIN_LOOP_STALE_MS=250;
const EXPECTED={'Left':[28,0],'alt+Left':[24,0],'cmd+Left':[0,0],'cmd+shift+Left':[0,29]};
// Independent selection expectation for the four original keys at the 29-character end seed; null for navigation keys.
export function expected(key){return EXPECTED[key]?.slice()??null}
export const calKey=r=>[r.rep,r.editor,r.key].join('/');

// 80 smoke rows (one repetition) / 1600 full rows (20): per repetition 32 fix foreground controls first, then 32 fix and
// 16 main (rich editors only) background rows. Order rotates per repetition; nothing is retried or replaced.
export function plan(smoke=false){
 const fg=[],bg=[];
 for(const editor of EDITORS)for(const key of KEYS){
  fg.push({engine:'fix',scene:'foreground',editor,key});
  bg.push({engine:'fix',scene:'background',editor,key});
  if(MAIN_EDITORS.includes(editor))bg.push({engine:'main',scene:'background',editor,key});
 }
 const rot=(a,n)=>{const s=n%a.length;return [...a.slice(s),...a.slice(0,s)]};
 const rows=[];
 for(let rep=1;rep<=(smoke?1:20);rep++)for(const c of [...rot(fg,(rep-1)*5),...rot(bg,(rep-1)*7)]){
  const cell=[c.engine,c.scene,c.editor,c.key].join('/');rows.push({id:cell+'/'+rep,cell,...c,rep});
 }
 return rows;
}

const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const range=r=>Array.isArray(r)&&r.length===2&&r.every(n=>Number.isSafeInteger(n)&&n>=0);
const owner=(a,b)=>!!a&&!!b&&a.pageId===b.pageId&&a.timeOrigin===b.timeOrigin&&a.ownerEpoch===b.ownerEpoch;
const near=(a,b)=>Math.abs(a-b)<=SCROLL_TOL_PX;
const P=['top','left'],X=['height','width','clientHeight','clientWidth'];
const metricOK=m=>!!m&&[...P,...X].every(k=>Number.isFinite(m[k]));
const scrollOK=s=>!!s&&metricOK(s.field)&&metricOK(s.document)&&Array.isArray(s.ancestors)&&s.ancestors.every(metricOK);
const entries=s=>[['field',s.field],...s.ancestors.map((m,i)=>['ancestors.'+i,m]),['document',s.document]];
function axisValue(s,name){const m=name.startsWith('ancestors.')?s.ancestors[Number(name.split('.')[1])]:s[name];return m}
// Same offsets and extents for field, every ancestor and the document, within SCROLL_TOL_PX.
function scrollDiff(a,b,props=[...P,...X]){
 const ea=entries(a),eb=entries(b);if(ea.length!==eb.length)return ['ancestor-count'];
 return ea.flatMap(([n,m],i)=>props.filter(p=>!near(m[p],eb[i][1][p])).map(p=>n+'.'+p));
}
const movedAxes=(a,b)=>scrollDiff(a,b,P);
const interior=(v,max)=>max>2*SCROLL_TOL_PX&&v>SCROLL_TOL_PX&&v<max-SCROLL_TOL_PX;
function ck(c,name,fn){try{c[name]=!!fn()}catch{c[name]=false}}

// Explicit setup/calibration checks. Every check must hold for a row to be scorable; failures stay in the denominator.
// setupReasons(row) is the pre-action subset (no samples, identity-after or watch): owner, deterministic text/caret/scroll,
// setup stability and arm. The controller rejects a nonempty result before the watch and the key; classify's setupFailed
// includes the same names, so offline scoring agrees with what the controller refused.
const layoutOf=r=>{try{return layout(r.editor,r.key)}catch{return null}};
export function setupReasons(r){const c=integrity({...r,samples:undefined},true).checks;return Object.keys(c).filter(k=>!c[k])}
function integrity(r,preAction=false){
 const c={},fx=layoutOf(r);
 const o=r.owner,st={reset:r.foregroundReset,prepare:r.foregroundPrepare,setup:r.setup,armed:r.armed},S=r.samples,fg=r.scene==='foreground';
 ck(c,'problemFree',()=>!r.problem);
 ck(c,'ownerValid',()=>/^[a-f0-9]{32}$/.test(o.pageId)&&Number.isFinite(o.timeOrigin)&&o.timeOrigin>0&&Number.isInteger(o.ownerEpoch)&&o.ownerEpoch>0);
 ck(c,'ownerConsistent',()=>c.ownerValid&&Object.values(st).every(s=>owner(s,o))&&(preAction||(Array.isArray(S)&&S.every(s=>owner(s,o)))));
 ck(c,'noFixtureError',()=>!Object.values(st).some(s=>s.error)&&(preAction||!S.some(s=>s.error)));
 if(!preAction){
 ck(c,'identity',()=>r.identityBefore.windowTitle.includes('probe354:'+o.pageId)&&r.identityAfter.windowTitle.includes('probe354:'+o.pageId)&&r.identityBefore.windowID>0&&r.identityBefore.windowID===r.identityAfter.windowID);
 ck(c,'samplesComplete',()=>DELAYS.every(d=>S.filter(s=>s.delay===d).length===1)&&S.length===DELAYS.length&&S.every(s=>s.visibility==='visible'&&range(s.selection)&&typeof s.textHash==='string'&&scrollOK(s.scroll)));
 }
 ck(c,'fixtureDeterministic',()=>[st.reset,st.prepare].every(s=>s.text===fx.text&&s.textHash===fx.textHash&&s.fixture.kind===fx.kind&&s.fixture.textLength===fx.textLength&&s.fixture.textHash===fx.textHash&&equal(s.fixture.initial.selection,[fx.caret,0])));
 ck(c,'scrollSetupReached',()=>st.reset.fixture.scrollSetup.reached===true&&st.prepare.fixture.scrollSetup.reached===true);
 ck(c,'setupExact',()=>st.setup.textHash===fx.textHash&&equal(st.setup.selection,[fx.caret,0])&&st.setup.focused===true&&st.setup.visibility==='visible'&&(!fg||st.setup.documentHasFocus===true));
 ck(c,'setupInterior',()=>{if(fx.kind==='seed')return true;const f=st.setup.scroll.field;return r.editor==='input'?interior(f.left,f.width-f.clientWidth):interior(f.top,f.height-f.clientHeight)});
 ck(c,'setupScrollStable',()=>scrollOK(st.prepare.scroll)&&scrollOK(st.setup.scroll)&&scrollDiff(st.prepare.scroll,st.setup.scroll).length===0);
 ck(c,'armUnchanged',()=>st.armed.textHash===st.setup.textHash&&equal(st.armed.selection,st.setup.selection)&&st.armed.focused===true&&scrollDiff(st.setup.scroll,st.armed.scroll).length===0);
 if(!preAction){
 ck(c,'extentsStable',()=>S.every(s=>scrollDiff(st.setup.scroll,s.scroll,X).length===0));
 ck(c,'watchComplete',()=>r.watch.complete===true&&r.watch.samples.length>0);
 }
 const failed=Object.keys(c).filter(k=>!c[k]);
 return {checks:c,failed,ok:!failed.length,fx};
}
const finalOf=r=>r.samples?.find(s=>s.delay===FINAL_DELAY);
// Hard failures need no oracle: they cannot be hidden as not-applicable or uncalibrated.
function hard(r,fx){
 const S=r.samples??[],fg=r.scene==='foreground',front=fg?r.targetPid:r.coverPid,w=r.watch?.samples;
 const editorFocusLost=S.some(s=>s.focused!==true);
 const wrongText=!!fx&&S.some(s=>s.textHash!==fx.textHash||s.textLength!==fx.textLength);
 const error=!!r.action?.error;
 const sideEffectKnown=!!(r.watch?.complete===true&&w?.length&&w.every(s=>s.frontmostPid>0&&s.orderReadable===true&&Number.isFinite(s.mainLoopAgeMs)&&s.mainLoopAgeMs<=MAIN_LOOP_STALE_MS));
 const sideEffect=!!w?.some(s=>s.frontmostPid!==front||(!fg&&s.targetAboveCover===true));
 const foregroundDocFocusLost=fg&&S.some(s=>s.documentHasFocus!==true);
 // The state after the lease released must still be this owner's, focused, with the fixture text. Selection/scroll drift
 // there is reported separately (cleanupChanged) and does not alter the requested 1s verdict.
 const cu=r.cleanup,cleanupCorrupted=!!cu&&!(owner(cu,r.owner)&&!cu.error&&cu.focused===true&&!!fx&&cu.textHash===fx.textHash&&cu.textLength===fx.textLength);
 const failures=[editorFocusLost&&'editor-focus-lost',wrongText&&'wrong-text',error&&'action-error',sideEffect&&'side-effect-observed',foregroundDocFocusLost&&'foreground-document-focus-lost',cleanupCorrupted&&'cleanup-corrupted'].filter(Boolean);
 return {editorFocusLost,wrongText,cleanupCorrupted,error,sideEffect,sideEffectKnown,failures};
}

// Foreground control -> calibration. status: calibrated | invalid | missing.
export function calibrate(r){
 if(!r||r.scene!=='foreground')return {status:'missing',reasons:['no-foreground-control']};
 const of={id:r.id,rep:r.rep,editor:r.editor,key:r.key},i=integrity(r),h=hard(r,i.fx);
 const reasons=[...i.failed.map(x=>'setup:'+x),...(i.ok?h.failures:[])];
 if(!reasons.length){
  const fin=finalOf(r),exp=expected(r.key);
  if(exp&&!equal(fin.selection,exp))reasons.push('contradicts-independent-expectation:'+JSON.stringify(fin.selection)+' vs '+JSON.stringify(exp));
 }
 if(reasons.length)return {status:'invalid',reasons,of};
 const fin=finalOf(r),selectionChanged=!equal(r.setup.selection,fin.selection),moved=movedAxes(r.setup.scroll,fin.scroll);
 return {status:'calibrated',reasons:[],of,anyEffect:selectionChanged||moved.length>0,selectionChanged,moved,
  initial:{selection:r.setup.selection,scroll:r.setup.scroll},final:{selection:fin.selection,direction:fin.direction,scroll:fin.scroll}};
}
const asCal=(r,cal)=>{
 if(!cal)return {status:'missing',reasons:['no-foreground-control']};
 const c=cal.scene!==undefined?calibrate(cal):cal;
 return c.of&&(c.of.rep!==r.rep||c.of.editor!==r.editor||c.of.key!==r.key)?{status:'invalid',reasons:['calibration-for-other-cell'],of:c.of}:c;
};
// Compare one state to the calibrated foreground effect: selection exact (direction when the control selected a
// range), the four original keys also against their independent expectation, and every axis the control moved.
function judge(r,s,cal){
 const reasons=[],exp=expected(r.key);
 if(!equal(s.selection,cal.final.selection))reasons.push('selection-mismatch');
 else if(cal.final.selection[1]>0&&cal.final.direction&&s.direction!==cal.final.direction)reasons.push('direction-mismatch');
 if(exp&&!equal(s.selection,exp))reasons.push('expectation-mismatch');
 for(const a of cal.moved){const m=axisValue(s.scroll,a.slice(0,a.lastIndexOf('.'))),p=a.slice(a.lastIndexOf('.')+1),f=axisValue(cal.final.scroll,a.slice(0,a.lastIndexOf('.')));
  if(!m||!near(m[p],f[p]))reasons.push('scroll-mismatch:'+a)}
 return {ok:!reasons.length,reasons};
}
const count=(r,e)=>r.samples?.flatMap(s=>s.trace??[]).filter(t=>t.event===e).length??0;

// classify(row, calibration): calibration is calibrate(foregroundRow) or the foreground row itself; ignored for
// foreground rows, which calibrate themselves. outcome: pass | fail | notApplicable | uncalibrated | invalid.
export function classify(r,calibration){
 const i=integrity(r),h=hard(r,i.fx),fg=r.scene==='foreground',cal=fg?calibrate(r):asCal(r,calibration),fin=finalOf(r);
 let outcome,reasons=[],effect=null,matchByDelay=null,naReason=null;
 if(!i.ok){outcome='invalid';reasons=i.failed}
 else if(h.failures.length){outcome='fail';reasons=h.failures;effect=false}
 else if(fg){
  if(cal.status!=='calibrated'){outcome='fail';reasons=cal.reasons;effect=false}
  else if(!cal.anyEffect){outcome='notApplicable';naReason='foreground-control-no-dom-effect'}
  else{outcome='pass';effect=true}
 }else if(cal.status!=='calibrated'){outcome='uncalibrated';reasons=cal.reasons}
 else if(!cal.anyEffect){outcome='notApplicable';naReason='foreground-control-no-dom-effect'}
 else{
  const unlike=scrollDiff(r.setup.scroll,cal.initial.scroll);
  if(unlike.length){outcome='uncalibrated';reasons=['setup-differs-from-control:'+unlike.join(',')]}
  else{const j=judge(r,fin,cal);outcome=j.ok?'pass':'fail';effect=j.ok;reasons=j.reasons;matchByDelay=Object.fromEntries(r.samples.map(s=>[s.delay,judge(r,s,cal).ok]))}
 }
 const cu=r.cleanup;
 return {id:r.id,scene:r.scene,engine:r.engine,scorable:i.ok,outcome,effect,reasons,notApplicable:outcome==='notApplicable',naReason,
  calibration:cal.status,calibrationReasons:cal.reasons,setupFailed:i.failed,expectedSelection:expected(r.key),
  error:h.error,editorFocusLost:h.editorFocusLost,wrongText:h.wrongText,cleanupCorrupted:h.cleanupCorrupted,sideEffect:h.sideEffect,sideEffectKnown:h.sideEffectKnown,
  safePass:outcome==='pass'&&h.sideEffectKnown&&!h.sideEffect,matchByDelay,
  // After the connection closed; informational, the verdict is the 1s sample.
  cleanupChanged:cu&&i.ok&&fin?!(equal(cu.selection,fin.selection)&&cu.textHash===fin.textHash&&scrollDiff(fin.scroll,cu.scroll).length===0):null,
  actionMs:Number.isFinite(r.action?.durationMs)&&r.action.durationMs>=0?r.action.durationMs:null,
  keydown:count(r,'keydown'),beforeinput:count(r,'beforeinput'),selectionchange:count(r,'selectionchange'),scrollEvents:count(r,'scroll')};
}

const pct=(a,p)=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);return s[Math.max(0,Math.ceil(p*s.length)-1)]};
const COUNTS=['attempted','scorable','pass','fail','notApplicable','uncalibrated','invalid','safePass','errors','editorFocusLost','wrongText','sideEffects','sideEffectUnknown','cleanupChanged'];
const blank=(c,planned)=>({cell:c.cell,engine:c.engine,scene:c.scene,editor:c.editor,key:c.key,planned,missing:planned,...Object.fromEntries(COUNTS.map(k=>[k,0])),judged:0,...Object.fromEntries(DELAYS.map(d=>['matchedAt'+d,0])),actionMsN:0,actionMsP50:null,actionMsP95:null});
export function summarize(rows,smoke){
 const wanted=plan(smoke),ids=new Map(wanted.map(c=>[c.id,c])),reps=smoke?1:20,seen=new Set(),accepted=[];
 let duplicates=0,unknown=0,mismatched=0,orderViolations=0;
 rows.forEach((r,index)=>{
  if(!ids.has(r?.id)){unknown++;return}
  if(seen.has(r.id)){duplicates++;return}
  seen.add(r.id);const c=ids.get(r.id);
  if(Object.keys(c).some(k=>!equal(c[k],r[k]))){mismatched++;return}
  accepted.push({r,index});
 });
 const cals=new Map();
 for(const {r,index} of accepted)if(r.scene==='foreground'&&r.engine==='fix')cals.set(calKey(r),{cal:calibrate(r),index});
 const groups=new Map(),times=new Map();
 for(const c of wanted)if(!groups.has(c.cell)){groups.set(c.cell,blank(c,reps));times.set(c.cell,[])}
 for(const {r,index} of accepted){
  const g=groups.get(r.cell),c=r.scene==='foreground'?null:cals.get(calKey(r));
  if(c&&c.index>index)orderViolations++;
  const s=classify(r,c?.cal);
  g.attempted++;g.missing--;if(s.scorable)g.scorable++;g[s.outcome]++;g.judged=g.pass+g.fail;
  if(s.safePass)g.safePass++;if(s.error)g.errors++;if(s.editorFocusLost)g.editorFocusLost++;if(s.wrongText)g.wrongText++;
  if(s.sideEffect)g.sideEffects++;if(s.scorable&&!s.sideEffectKnown)g.sideEffectUnknown++;if(s.cleanupChanged)g.cleanupChanged++;
  if(s.matchByDelay)for(const d of DELAYS)if(s.matchByDelay[d])g['matchedAt'+d]++;
  if(s.actionMs!==null)times.get(r.cell).push(s.actionMs);
 }
 for(const [cell,g] of groups){const t=times.get(cell);g.actionMsN=t.length;g.actionMsP50=pct(t,0.5);g.actionMsP95=pct(t,0.95)}
 const cells=[...groups.values()],sum=(f)=>{const t={planned:0,missing:0,...Object.fromEntries(COUNTS.map(k=>[k,0])),judged:0};for(const g of cells.filter(f))for(const k of Object.keys(t))t[k]+=g[k];return t};
 const groupsKey=g=>g.engine+'/'+g.scene;
 const totals={all:sum(()=>true),...Object.fromEntries([...new Set(cells.map(groupsKey))].map(k=>[k,sum(g=>groupsKey(g)===k)]))};
 const missing=wanted.filter(c=>!seen.has(c.id)).length;
 return {smoke,planned:wanted.length,recorded:rows.length,
  // Coverage completeness is about attempts only; it never depends on whether keys took effect.
  coverage:{missing,duplicates,unknown,mismatched,orderViolations,complete:missing+duplicates+unknown+mismatched+orderViolations===0},
  denominator:{planned:wanted.length,attempted:totals.all.attempted,missing,judged:totals.all.judged,pass:totals.all.pass,fail:totals.all.fail,notApplicable:totals.all.notApplicable,uncalibrated:totals.all.uncalibrated,invalid:totals.all.invalid},
  totals,cells,
  interpretation:'pass/fail judge the 1s DOM end-state against the same-repetition foreground control (selection exact, plus every scroll axis the control moved, within SCROLL_TOL_PX); the four original keys also against their independent selection. notApplicable = valid control with no selection/scroll effect, never a pass. uncalibrated = control missing/invalid or not comparable. invalid = the trial itself failed setup or integrity. Hard failures (focus loss, wrong text, action error, observed foreground/order change) are fail regardless of the control. safePass additionally needs readable foreground/order sampling. Coverage is attempts only. AX ranges are not an oracle (#394) and are not read.'};
}
