// Pure qualification manifest, route driver and scorer for #359's hosted A/B. Launches nothing.
import {SEED,REQUESTED} from './page.mjs';
export const QUAL_BROWSERS=['safari','cft','firefox'],QUAL_EDITORS=['textarea','input','contenteditable','compose'];
const TAIL_QUEUE_MS=900,TAIL_MIN_GAP_MS=300;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export function qualificationCells({smoke=false,heads,browsers=QUAL_BROWSERS,editors=QUAL_EDITORS}={}){
 const names=Object.keys(heads??{});
 if(!names.length||names.some(h=>!/^[A-Za-z0-9_.-]+$/.test(h)||typeof heads[h]!=='string'||!heads[h]))throw Error('heads must map safe names to non-empty engine refs');
 if(browsers.some(b=>!QUAL_BROWSERS.includes(b))||editors.some(e=>!QUAL_EDITORS.includes(e)))throw Error('unknown browser or editor');
 const fgReps=smoke?1:20,bgReps=smoke?1:10,out=[];
 const add=(base,rep)=>{const c={...base,rep,qualification:true,mode:'natural'};c.id=['qual',c.cohort,c.head,c.suite,c.browser,c.editor,c.selection,rep].join('/');out.push(c)};
 for(const browser of browsers)for(const editor of editors){
  const textarea=editor==='textarea';
  // Heads are innermost so both arms of every repetition are neighbours in the plan.
  if(textarea){
   for(let rep=1;rep<=fgReps;rep++)for(const selection of ['select_text','set_value_type','cmd+a'])for(const suite of ['rate','control'])for(const head of names)
    add({cohort:'foreground',head,engineRef:heads[head],suite,browser,editor,selection,initialCaret:'target',foreground:true},rep);
   for(let rep=1;rep<=fgReps;rep++)for(const head of names)
    add({cohort:'tail',head,engineRef:heads[head],suite:'rate',browser,editor,selection:'select_text',initialCaret:'target',foreground:true,stressQueueMs:TAIL_QUEUE_MS},rep);
  }
  for(let rep=1;rep<=bgReps;rep++)for(const selection of ['script','cmd+a'])for(const head of names)
   add({cohort:'background',head,engineRef:heads[head],suite:'rate',browser,editor,selection,initialCaret:'end',foreground:false},rep);
 }
 return out;
}

export function qualificationExpected(cell){
 if(cell.cohort==='tail')return {text:SEED,caret:null,requested:REQUESTED,safeRefusalRequired:true};
 const text=cell.selection==='set_value_type'?REQUESTED+REQUESTED:REQUESTED;
 return {text,caret:[text.length,0],requested:REQUESTED,safeRefusalRequired:false};
}

// The parent always follows with type_text; the RPC result is returned unchanged and nothing is retried.
export async function qualificationFollow(cell,{rpc,command,target}){
 const s=cell.selection;
 if(s==='script')return await command({op:'select-all',id:cell.id});
 if(s==='cmd+a')return await rpc('press_key',{key:'cmd+a'});
 if(!['select_text','set_value_type'].includes(s))throw Error('unknown continuation route '+s);
 if(!target?.element||!target?.lineage)throw Error('AX continuation target token/lineage missing');
 if(s==='select_text')return await rpc('select_text',{...target,text:SEED,selection_type:'text'});
 return await rpc('set_value',{...target,value:REQUESTED});
}

// ---- scoring ----
const metas=x=>x?[x.meta,x.error?.meta,x.error?.data?.meta,x.answer?.result?.meta,x.answer?.error?.meta,x.answer?.error?.data?.meta].filter(Boolean):[];
const field=(x,name)=>metas(x).map(m=>m[name]).find(v=>v&&typeof v==='object');
const answerOf=x=>x.error?(x.error.errorName??'otherError'):'success';
const bump=(o,k,n=1)=>{o[k]=(o[k]??0)+n};
const waits=x=>({pendingRecord:field(x,'pendingClick'),baselineRecord:field(x,'typeReadback')?.baselineWait,pending:field(x,'pendingClick')?.waitMs,baseline:field(x,'typeReadback')?.baselineWait?.waitMs});
// type_text's UTF-16 units entered: the wire's top-level meta.entered (Input.swift), never inside typeReadback.
const entered=x=>metas(x).map(m=>m.entered).find(v=>Number.isInteger(v));
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
function pct(v){v=v.filter(Number.isFinite).sort((a,b)=>a-b);const q=p=>v.length?v[Math.ceil(p*v.length)-1]:null;return {n:v.length,p50:q(.5),p95:q(.95),max:v.at(-1)??null}}
const NUMS=['requested','attempted','valid','invalid','scorable','typeMissing','noFinalSample','finalUnstable','finalMet','wrongFinal','wrongPlacement','placedClaims','placedFinalWrong',
 'typeSuccess','typeFalseSuccess','typeHonestUnconfirmed','typeUnconfirmedCorrect','selectionChanged','safeNoType','unsafeRefusal','typedEvents',
 'valueSuccess','valueUnconfirmed','valueFieldClosed','tailQualified','tailUnqualified','tailScorable','tailOk','tailUnsafeOk','tailOkTextMatchesRequested','nothingTypedSeedUnchanged','safeRefusal',
 'foregroundViolations','windowRaisesObserved','backgroundWaitViolations','backgroundWaitPositive','backgroundWaitObserved','backgroundAX','backgroundPosted','backgroundUnknown','backgroundWaitUnclassified','tailReadbackDecline'];
const MAPS=['typeAnswers','typeUnconfirmedReasons','valueAnswers','valueUnconfirmedDrift','tailUnqualifiedReasons','tailUnqualifiedTypeAnswers','tailUnqualifiedTypeUnconfirmedReasons','backgroundRoutes'];
const SERIES=['pendingClickWaitMs','baselineWaitMs','totalWaitMs','clickMs','nextMs','typeMs'];
const blank=()=>({...Object.fromEntries(NUMS.map(k=>[k,0])),...Object.fromEntries(MAPS.map(k=>[k,{}])),...Object.fromEntries(SERIES.map(k=>[k,[]]))});
const merge=(a,b)=>{for(const k of NUMS)a[k]+=b[k];for(const k of MAPS)for(const [x,n] of Object.entries(b[k]))bump(a[k],x,n);for(const k of SERIES)a[k].push(...b[k])};
const finish=g=>({...g,...Object.fromEntries(SERIES.map(k=>[k,pct(g[k])]))});
const groupKey=c=>[c.head,c.cohort,c.browser,c.editor,c.selection,c.suite].join('/');
const LINEAGE=['cohort','head','engineRef','suite','browser','editor','selection','rep','foreground','initialCaret','stressQueueMs','qualification','mode'];
const inputsSince=(r,since)=>(r.events??[]).filter(e=>['input','beforeinput'].includes(e.event)&&(!(e.at<since))).length;

// Within one DOM event stream: the fixture's seq, then its monotonic clock, then its epoch. A tie is ambiguous (null).
const domOrder=(a,b)=>{
 for(const k of ['seq','monoMs','at'])if(Number.isFinite(a[k])&&Number.isFinite(b[k]))return a[k]===b[k]?null:a[k]<b[k]?-1:1;
 return null;
};
// Keyboard.swift posts flags, down, up and restore per typed unit: REQUESTED's 6 units are 24 key events.
const KEY_TYPES={10:6,11:6,12:12},KEYBOARD=new Set([10,11,12]);

// Prove an intact posted-event FIFO and that the selection plus typing baseline ran while its click was pending.
// Either the complete type RPC or its actual first key post (which follows the baseline) must precede delivery.
// This uses action timestamps, never snapshotMs or the typing answer, and keeps recovered stress unqualified.
// The watcher replays its buffer after closing the tap, so a producer still posting at the release could overtake
// buffered keys; the raw stressExercised flag is not FIFO proof. Only a producer-quiescent capture qualifies: either
// all 24 measured key posts are in the buffer and their actual last post precedes the release, or nothing was
// entered, no key was held and the whole type RPC ended before the release. Everything else is unqualified.
export function tailQualification(r){
 const events=r.events??[],downs=events.filter(e=>e.event==='mousedown'),u=r.clockUncertaintyMs??2;
 const mdEvent=downs.reduce((x,e)=>!x||domOrder(e,x)===-1?e:x,null),md=mdEvent?.at;
 const stress=num(r.stress?.busyStartedAt)??num(r.stress?.startedAt)??num(events.find(e=>e.event==='busy-start')?.at);
 const no=reason=>({qualified:false,reason});
 if(!Number.isFinite(md))return no('noMousedown');
 if(!(stress!==null&&stress<r.click?.startedAt))return no('stressNotBeforeClick');
 if(!(md>r.click.endedAt+TAIL_MIN_GAP_MS+u))return no('mousedownNotLate');
 if(!r.next||r.next.error||!Number.isFinite(r.next.endedAt))return no('selectionNotSuccessful');
 if(!(r.next.endedAt+u<md))return no('mousedownBeforeSelection');
 if(!r.type||!Number.isFinite(r.type.startedAt)||!Number.isFinite(r.type.endedAt))return no('typeNotAttempted');
 const h=r.ax?.pointerHold,captures=Array.isArray(h?.captures)?h.captures:null,released=num(h?.releasedAt);
 if(!h||h.stressExercised!==true||h.earlyRelease!==false||h.pointerCaptured!==2||h.pointerReleased!==2||!Number.isInteger(h.captured)||h.captured<2||h.released!==h.captured||h.extraEvents!==0||h.copyFailures!==0||h.overflow||h.error
  ||!captures||captures.length!==h.captured||released===null)return no('holdNotComplete');
 // Cross-process: a DOM mousedown before the release (beyond the uncertainty) cannot be the held pointer.
 if(md<released-u)return no('mousedownBeforeRelease');
 // Same-stream order: no clock-uncertainty excuse inside the page's own event history.
 for(const e of events)if(['keydown','keyup','beforeinput','input'].includes(e.event)){
  const o=domOrder(e,mdEvent);if(o===-1)return no('postedInputOvertookPointer');if(o===null)return no('domOrderAmbiguous');
 }
 // InputMeta.startedAt is the actual first key post, after the baseline. No snapshotMs reconstruction.
 const m=metas(r.type),firstPost=m.map(x=>num(x.startedAt)).find(v=>v!==null),lastPost=m.map(x=>num(x.endedAt)).find(v=>v!==null);
 const postedBefore=Number.isFinite(firstPost)&&firstPost+u<md;
 if(!(r.type.endedAt+u<md)&&!postedBefore)return no('mousedownBeforeTypeReturn');
 const n=entered(r.type);
 if(n!==0&&n!==REQUESTED.length)return no('producerUnaccounted');
 // Every held event has its actual time and comes from the process that posted the triggering down.
 const src=captures[0]?.sourcePid;
 if(captures[0]?.type!==1||!Number.isInteger(src)||captures.some(c=>![1,2,...KEYBOARD].includes(c.type)||c.sourcePid!==src||num(c.at)===null))return no('capturedStreamUnexpected');
 const keys=captures.filter(c=>KEYBOARD.has(c.type));
 if(n===0){
  if(!(r.type.endedAt+u<released))return no('producerNotQuiescent');
  if(keys.length)return no('keyboardStreamIncomplete');
  return {qualified:true};
 }
 if(firstPost==null||lastPost==null||!(lastPost+u<released))return no('producerNotQuiescent');
 if(Object.entries(KEY_TYPES).some(([t,c])=>keys.filter(k=>k.type===+t).length!==c))return no('keyboardStreamIncomplete');
 // Captures are tap receipts after each post returned, so they may trail meta.endedAt (the last post), never the release.
 if(keys.some(k=>!(k.at>=firstPost-u&&k.at<=released+u)))return no('capturedStreamUnexpected');
 return {qualified:true};
}

function scoreRow(r,cell,g){
 // next and valueWrite are one RPC for set_value_type (equal but distinct objects after JSON); valueWrite is only a fallback.
 const rpcs=[r.click,r.next??r.valueWrite,r.type].filter(Boolean),tail=cell.cohort==='tail',e=qualificationExpected(cell);
 if(r.foregroundViolation)g.foregroundViolations++;if(r.windowRaiseObserved)g.windowRaisesObserved++;
 if(!r.valid){g.invalid++;return}
 g.valid++;
 // Timing and wait observations are recorded as observed; absent metadata contributes nothing.
 const w=rpcs.map(waits),pend=w.map(x=>num(x.pending)).filter(v=>v!==null),base=w.map(x=>num(x.baseline)).filter(v=>v!==null);
 g.pendingClickWaitMs.push(...pend);g.baselineWaitMs.push(...base);if(pend.length||base.length)g.totalWaitMs.push([...pend,...base].reduce((a,b)=>a+b,0));
 if(r.click&&!r.click.noClick)g.clickMs.push(r.click.endedAt-r.click.startedAt);
 if(r.next)g.nextMs.push(r.next.endedAt-r.next.startedAt);
 if(r.type)g.typeMs.push(r.type.endedAt-r.type.startedAt);
 if(cell.cohort==='background'){
  // #341's AX action arms nothing. A posted background pointer deliberately arms ruling 785's window.
  const cm=metas(r.click)[0]??{},ec=cm.elementClick;
  const carrier=ec?.plan==='action'?'AX:'+String(ec.action??'action'):cm.coordinateClick&&Number.isFinite(cm.startedAt)?'posted':'unknown';
  bump(g.backgroundRoutes,carrier);
  const ax=carrier.startsWith('AX:'),posted=carrier==='posted',observed=w.some(x=>x.pendingRecord||x.baselineRecord);
  if(ax)g.backgroundAX++;else if(posted)g.backgroundPosted++;else g.backgroundUnknown++;
  if(observed){g.backgroundWaitObserved++;if(ax)g.backgroundWaitViolations++;else if(!posted)g.backgroundWaitUnclassified++}
  if([...pend,...base].some(v=>v>0))g.backgroundWaitPositive++;
 }
 if(tail){const q=tailQualification(r);if(!q.qualified){
   g.tailUnqualified++;bump(g.tailUnqualifiedReasons,q.reason);
   // Raw type answers of unqualified stress stay countable, apart from the scored outcomes.
   if(r.type){const a=answerOf(r.type);bump(g.tailUnqualifiedTypeAnswers,a);if(a==='typeUnconfirmed'){const why=field(r.type,'typeReadback')?.reason;bump(g.tailUnqualifiedTypeUnconfirmedReasons,typeof why==='string'&&why?why:'unknown')}}
   return;
  }g.tailQualified++;g.tailScorable++}
 g.scorable++;
 const samples=r.samples??[],final=samples.at(-1),prev=samples.at(-2);
 if(!final)g.noFinalSample++;else if(prev&&!(prev.text===final.text&&same(prev.selection,final.selection)))g.finalUnstable++;
 const placed=r.click?.meta?.elementClick?.caret==='placed';if(placed)g.placedClaims++;
 if(r.valueWrite){
  const a=answerOf(r.valueWrite);bump(g.valueAnswers,a);
  if(a==='success')g.valueSuccess++;
  else if(a==='valueUnconfirmed'){g.valueUnconfirmed++;const d=field(r.valueWrite,'pendingClick')?.drift;bump(g.valueUnconfirmedDrift,typeof d==='string'&&d?d:'unknown');if(d==='fieldClosed')g.valueFieldClosed++}
 }
 const type=r.type,a=type?answerOf(type):null,rb=type?field(type,'typeReadback'):null,reason=type&&a==='typeUnconfirmed'?(typeof rb?.reason==='string'&&rb.reason?rb.reason:'unknown'):null;
 if(!type)g.typeMissing++;else{bump(g.typeAnswers,a);if(a==='success')g.typeSuccess++;if(reason){bump(g.typeUnconfirmedReasons,reason);if(reason==='selectionChanged')g.selectionChanged++}}
 const typed=inputsSince(r,tail?-Infinity:type?.startedAt??-Infinity)>0;if(typed)g.typedEvents++;
 const nothingTyped=!typed&&type&&entered(type)===0,refusal=reason==='selectionChanged'&&nothingTyped;
 if(tail){
  const seedKept=final?.text===SEED,safe=refusal&&seedKept;
  if(type&&a==='typeUnconfirmed'&&reason!=='selectionChanged')g.tailReadbackDecline++;
  if(type&&a==='success'){g.tailOk++;g.tailUnsafeOk++;if(final?.text===REQUESTED)g.tailOkTextMatchesRequested++}
  if(!typed&&seedKept)g.nothingTypedSeedUnchanged++;
  if(!seedKept)g.wrongFinal++;
  if(safe)g.safeRefusal++;else g.wrongPlacement++;
  return;
 }
 const met=Boolean(final)&&final.text===e.text&&same(final.selection,e.caret),wrong=!met||!type;
 if(met)g.finalMet++;
 if(wrong)g.wrongFinal++;
 if(type&&a==='success'&&!met)g.typeFalseSuccess++;
 if(type&&a==='typeUnconfirmed'){if(met)g.typeUnconfirmedCorrect++;else g.typeHonestUnconfirmed++}
 // A safe refusal is not a wrong placement, and not a successful placement either.
 if(reason==='selectionChanged'){if(refusal)g.safeNoType++;else g.unsafeRefusal++}
 const unsafeWrong=wrong&&!(refusal&&type);
 if(unsafeWrong){g.wrongPlacement++;if(placed)g.placedFinalWrong++}
}

export function qualificationSummary(rows,expected,{smoke=false}={}){
 if(rows.some(r=>r.smoke===true)&&!smoke)throw Error('smoke evidence cannot enter primary summary; use explicit smoke mode');
 if(smoke&&rows.some(r=>r.smoke!==true))throw Error('mixed smoke and primary evidence');
 const byId=new Map(expected.map(c=>[c.id,c])),groups=new Map(),scored=new Set(),duplicates=new Set(),unexpected=[],mismatched=[],unqualifiedTails=[];
 const group=c=>{const k=groupKey(c);if(!groups.has(k))groups.set(k,{key:k,head:c.head,cohort:c.cohort,browser:c.browser,editor:c.editor,selection:c.selection,suite:c.suite,...blank()});return groups.get(k)};
 for(const c of expected)group(c).requested++;
 const seen=new Set();
 for(const r of rows){
  if(seen.has(r.id)){duplicates.add(r.id);continue}seen.add(r.id);
  const c=byId.get(r.id);
  if(!c){unexpected.push(r.id);continue}
  if(LINEAGE.some(k=>!same(r[k],c[k]))){mismatched.push(r.id);continue}
  scored.add(r.id);const g=group(c);g.attempted++;scoreRow(r,c,g);
  if(c.cohort==='tail'&&r.valid&&!tailQualification(r).qualified)unqualifiedTails.push(r.id);
 }
 const missing=expected.filter(c=>!scored.has(c.id)).map(c=>c.id),arms=new Map();
 for(const g of groups.values()){const k=g.head+'/'+g.cohort;if(!arms.has(k))arms.set(k,{key:k,head:g.head,cohort:g.cohort,...blank()});merge(arms.get(k),g)}
 const tailUnexercised=[...groups.values()].filter(g=>g.cohort==='tail'&&g.requested>0&&g.tailScorable===0).map(g=>g.key);
 const complete=![missing,unexpected,mismatched].some(a=>a.length)&&!duplicates.size;
 return {smoke,requested:expected.length,attempted:rows.length,missing,unexpected,duplicates:[...duplicates],mismatched,unqualifiedTails,tailUnexercised,exercisedAllTails:tailUnexercised.length===0,complete,
  groups:[...groups.values()].map(finish),arms:Object.fromEntries([...arms].map(([k,v])=>[k,finish(v)]))};
}

// Dispatch-wide plan from the surviving configs' qualificationRequest, independent of which shards survived.
const HEX40=/^[a-f0-9]{40}$/;
export function qualificationPlan(configs){
 const requests=configs.map(c=>c?.qualificationRequest);
 if(!requests.length||requests.some(r=>!r))throw Error('qualification request manifests missing; cannot infer coverage from surviving shards');
 const sig=r=>JSON.stringify([r.smoke,r.heads,r.browsers,r.editors,r.tailStimulus]),request=requests[0];
 if(requests.some(r=>sig(r)!==sig(request)))throw Error('inconsistent qualification requests; keep dispatches separate');
 const names=Object.keys(request.heads??{}),unique=a=>new Set(a).size===a.length;
 if(request.tailStimulus!=='queue-hold-v1')throw Error('qualification request must name queue-hold-v1; keep earlier busy-stress runs on their pinned reader');
 if(typeof request.smoke!=='boolean')throw Error('invalid qualification request: smoke must be boolean');
 if(!same(names,['main','fix'])||names.some(h=>!HEX40.test(request.heads[h]))||request.heads.main===request.heads.fix)throw Error('invalid qualification request: heads must be exactly main and fix, distinct 40-hex refs');
 for(const [key,known] of [['browsers',QUAL_BROWSERS],['editors',QUAL_EDITORS]])
  if(!Array.isArray(request[key])||!request[key].length||!unique(request[key])||request[key].some(v=>!known.includes(v)))throw Error('invalid qualification request: '+key);
 return qualificationCells({smoke:request.smoke,heads:request.heads,browsers:request.browsers,editors:request.editors});
}
