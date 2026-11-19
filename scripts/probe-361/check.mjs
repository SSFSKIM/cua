// Scoring, the privacy scan and the summaries. Pure: unit-tested by kit.test.mjs; nothing here reads a field or the cua
// observation. Content truth is the owned fixture's own booleans. Every projected diagnostic is a member of a closed
// vocabulary, so no artifact can republish a string the scan tests for.
import {CONTROLS,PLAIN,LONG_SIDE} from './cells.mjs';

export const NATIVE_CODES=new Set(['typeUnconfirmed','pasteUnconfirmed','clipboardReadTimedOut','clipboardConflict','clipboardWriteFailed',
  'concealedInputUnavailable','inputSourceChanged','keyboardLayoutUnavailable','userIntervened','timeoutReached','windowMinimized',
  'accessibilityError','permissionsNotGranted','runningApplicationNotFound','screenLocked','invalidArguments','eventCreationFailed',
  'unknownError','jsonRPCError']);
const closed=values=>{const set=new Set(values);return x=>x==null?null:set.has(x)?x:'other';};
export const CODES={
  stage:closed(['read','effect','returnEffect']),
  wait:closed(['notification','reading','timeout','noChannel','deadline','handedOver','released']),
  restore:closed(['restored','skippedChanged','notTaken']),
  source:closed(['trusted','untrusted','none']),
  readback:closed(['noFocusedElement','roleUnreadable','secure','notTextField','valueUnreadable','rangeUnreadable','possiblyTruncated',
    'valueMismatch','concealedMismatch','unchanged','becameSecure','fieldUnreadable','fieldChanged','selectionChanged']),
  focus:closed(['target','setup','other','none']),
  role:x=>typeof x==='string'&&/^AX(TextField|TextArea|ComboBox|WebArea|Group|Window|Unknown|ScrollArea|Application|SecureTextField)$/.test(x)?x:x==null?null:'other',
  witness:closed(['presenter-not-front-at-disarm','owner-not-cover-at-disarm','cover-changed-at-disarm','not-armed']),
  hitVia:closed(['keydown','paste','input','change']),
};

// The route the engine took, from the native reply's meta: the paste route, a keyed route, or none.
export const routeOf=native=>{
  const r=(native?.result?.meta??native?.error?.meta)?.inputRoute;
  return r==='paste'?'paste':r==null?null:'keyed';
};

// The last line's native record (`paste.perLine`'s last entry carries its opening Return).
const lastLine=paste=>Array.isArray(paste?.perLine)&&paste.perLine.length?paste.perLine.at(-1):null;

// What the action answered and why, in closed codes. The fix's read-back (`typeReadback`) wins when present; otherwise the
// paste route's own last-line stage and its wait: the opening Return's settle, the effect wait, or the clipboard read wait.
export function outcomeOf({native,skyError,guarded}){
  if(!guarded)return {outcome:'request-shape',reason:null};
  if(!native)return {outcome:'missing',reason:null};
  const meta=native.result?.meta??native.error?.meta??{},rb=meta.typeReadback,paste=meta.paste;
  const outcome=native.error?NATIVE_CODES.has(native.error.errorName)?native.error.errorName:'native-other':skyError?'wrapper-error':'success';
  let reason=null;
  if(rb&&typeof rb==='object')reason='readback:'+(rb.confirmed===true?'confirmed':CODES.readback(rb.reason)??'none');
  else if(paste&&typeof paste==='object'){
    const stage=CODES.stage(paste.stage),line=lastLine(paste);
    const wait=stage==='returnEffect'?'return-'+(CODES.wait(line?.openingReturn?.settle??paste.openingReturn?.settle)??'none'):
      stage==='read'?'read-'+(CODES.wait(paste.readWait)??'none'):CODES.wait(paste.effectWait)??'none';
    reason=`paste:${stage??'none'}:${wait}`;
  }
  return {outcome,reason};
}

// The fix's exact confirmation: a success whose read-back says confirmed, on the native reply and the forwarded meta alike.
export const readbackConfirmed=(native,forwarded)=>native?.result?.meta?.typeReadback?.confirmed===true&&forwarded?.['cua/typeReadback']?.confirmed===true;

// Every string reachable in a value (keys too), JSON-in-strings included one level down.
export function strings(value,out=[]){
  const seen=new WeakSet();
  const walk=(v,depth)=>{
    if(typeof v==='string'){out.push(v);if(depth<2&&/^\s*[[{]/.test(v)){try{walk(JSON.parse(v),depth+1);}catch{}}return;}
    if(!v||typeof v!=='object'||seen.has(v))return;
    seen.add(v);
    if(v instanceof Error){walk(v.message,depth);walk(v.errorName,depth);walk(v.code,depth);walk(v.meta,depth);}
    for(const k of Object.getOwnPropertyNames(v)){if(k==='stack'||k==='length'&&Array.isArray(v))continue;out.push(k);walk(v[k],depth);}
  };
  walk(value,0);
  return out;
}
const contains=(list,needle)=>typeof needle==='string'&&needle.length>0&&list.some(s=>s.includes(needle));
// 6-unit windows of a value, so a partial disclosure is caught too.
const windows=(v,n=6)=>v.length<=n?[v]:Array.from({length:v.length-n+1},(_,i)=>v.slice(i,i+n));
export const EXCERPT_RADIUS=100, VALID_BAR=0.8;
// #354's excerpt in a message: `From character N, expected "…"; the field reads "…"`, quoted as JSON-like strings.
const EXCERPT=/From character (\d+), expected ("(?:[^"\\]|\\.)*"); the field reads ("(?:[^"\\]|\\.)*")/;
const unquote=q=>{try{return JSON.parse(q);}catch{return null;}};

// #354's literal excerpt rules applied to the paste route, over one trial's answer surfaces (native reply, sky result and
// error, forwarded meta, emitted content, captured console, engine output):
// - another field's content (the setup field's canary) and the pre-trial clipboard never appear;
// - the field's content appears only on a `valueMismatch`, and then only inside the native or sky error message;
// - the excerpt stays bounded: in the long rewrite cell nothing of the prefill farther than the radius from the first
//   difference appears, and a parsed excerpt is at most 2 × radius units of each side.
// `realized`: the rewrite control's perturbation landed exactly, so the first difference is known (the caret, LONG_SIDE)
// and the excerpt's start and far ends can be checked; otherwise the bounds are unknown and only the lengths are.
export function scan(surfaces,{setupText,clipText,initial,text,expected,control,canaries=[],mismatch,realized=false}){
  const all=strings(surfaces),flags=new Set();
  if(windows(setupText).some(w=>contains(all,w)))flags.add('other-field');
  if(windows(clipText).some(w=>contains(all,w)))flags.add('clipboard');
  const known=canaries.length>0&&realized&&typeof expected==='string';
  if(known){
    // Outside [first − radius, first + radius) of the expected value.
    const far=[...windows(expected.slice(0,LONG_SIDE-EXCERPT_RADIUS)),...windows(expected.slice(LONG_SIDE+EXCERPT_RADIUS))];
    if(far.some(w=>w.length===6&&contains(all,w)))flags.add('excerpt-unbounded');
  }
  const content=[...new Set([initial,text,expected,control].filter(v=>typeof v==='string'&&v.length>0))];
  // Field content as 3-unit windows holding a CJK character and 6-unit all-ASCII ones.
  const probes=[...new Set(content.flatMap(v=>[...windows(v,3).filter(w=>/[^\x00-\x7f]/.test(w)),
    ...windows(v,6).filter(w=>w.length===6&&/^[\x21-\x7e]+$/.test(w))]))];
  const messageList=[surfaces?.native?.error?.message,surfaces?.skyError?.message].filter(m=>typeof m==='string');
  const outside=strings({...surfaces,native:{...surfaces?.native,error:{...surfaces?.native?.error,message:undefined}},
    skyError:surfaces?.skyError?{meta:surfaces.skyError.meta,code:surfaces.skyError.code,errorName:surfaces.skyError.errorName}:null});
  if(probes.some(w=>contains(outside,w)))flags.add('content-outside-message');
  // On a mismatch only the two quoted excerpt spans are exempt; the rest of each message is scanned as any surface.
  const rest=[];
  for(const m of messageList){
    const x=mismatch?EXCERPT.exec(m):null;
    if(!x){rest.push(m);continue;}
    rest.push(m.slice(0,x.index)+'From character '+x[1]+m.slice(x.index+x[0].length));
    const e=unquote(x[2]),a=unquote(x[3]),start=Number(x[1])-1;
    if(e===null||a===null||e.length>2*EXCERPT_RADIUS||a.length>2*EXCERPT_RADIUS)flags.add('excerpt-unbounded');
    if(known&&start!==LONG_SIDE-EXCERPT_RADIUS)flags.add('excerpt-unbounded');
  }
  if(probes.some(w=>contains(rest,w)))flags.add(mismatch?'content-outside-excerpt':'content-without-mismatch');
  return [...flags].sort();
}

// One row's verdicts. `valid` needs a witnessed setup through the action's start, the paste route, and for a control its
// perturbation realized. A wrong success counts only on the paste route (a keyed row is setup-invalid and kept apart).
export function score({cell,attested,route,outcome,reason,domExact,controlExact,hit,confirmed,clip}){
  const control=CONTROLS.includes(cell);
  const realized=control?hit===true&&controlExact===true:null;
  const invalid=!attested?'setup':route!=='paste'?'route-not-paste':control&&!realized?'control-not-realized':null;
  const success=outcome==='success';
  return {control,realized,success,outcome,reason,domExact:domExact===true,valid:invalid===null,invalid,
    // Success while the field holds anything but the expected text: the gap #361 closes.
    wrongSuccess:attested===true&&route==='paste'&&success&&domExact!==true,
    readbackConfirmed:confirmed===true,
    clipboardRestored:clip?.stringEqual===true&&clip?.typesEqual===true};
}

export function percentile(values,p){
  const v=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!v.length)return null;
  return v[Math.min(v.length-1,Math.max(0,Math.ceil(p/100*v.length)-1))];
}
const tally=list=>list.reduce((o,k)=>(o[k??'none']=(o[k??'none']??0)+1,o),{});

// Per source, head and cell: valid trials, successes, exact contents, wrong successes, clipboard restores, outcomes and
// reasons, service time p50/p95; and the invalid-setup tally apart.
export function summarize(rows){
  const groups=new Map();
  for(const r of rows){
    const k=[r.source,r.head,r.cell].join('|');
    if(!groups.has(k))groups.set(k,[]);
    groups.get(k).push(r);
  }
  return [...groups].map(([k,list])=>{
    const [source,head,cell]=k.split('|'),v=list.filter(r=>r.valid);
    return {source,head,cell,planned:list.length,valid:v.length,invalid:tally(list.filter(r=>!r.valid).map(r=>r.invalid)),
      success:v.filter(r=>r.success).length,exact:v.filter(r=>r.domExact).length,exactFirstPostReply:v.filter(r=>r.exactFirstPostReply).length,
      wrongSuccess:v.filter(r=>r.wrongSuccess).length,wrongSuccessInvalid:list.filter(r=>!r.valid&&r.wrongSuccess).length,
      readbackConfirmed:v.filter(r=>r.readbackConfirmed).length,clipboardRestored:v.filter(r=>r.clipboardRestored).length,
      presentationHeld:v.filter(r=>r.presentationHeld).length,outcomes:tally(v.map(r=>r.outcome)),reasons:tally(v.map(r=>r.reason)),
      privacy:tally(list.flatMap(r=>r.privacy)),serviceMs:{p50:percentile(v.map(r=>r.serviceMs),50),p95:percentile(v.map(r=>r.serviceMs),95)}};
  });
}

// Coverage: every planned row of every usable source ran, and how many of them are valid, per source, head and cell.
export function coverage(rows,{planned,sources,heads,cells}){
  const per={};
  for(const s of sources)for(const h of heads)for(const c of cells){
    const list=rows.filter(r=>r.source===s&&r.head===h&&r.cell===c);
    per[`${s}/${h}/${c}`]={planned:planned[`${s}/${h}/${c}`]??0,ran:list.length,valid:list.filter(r=>r.valid).length};
  }
  const entries=Object.entries(per);
  // Valid evidence, not attempts: at least VALID_BAR of each source, head and cell's planned rows valid.
  const uncovered=entries.filter(([,e])=>e.valid<Math.ceil(VALID_BAR*e.planned)||e.planned===0).map(([k])=>k);
  return {complete:entries.length>0&&entries.every(([,e])=>e.ran===e.planned&&e.planned>0),
    covered:entries.length>0&&uncovered.length===0,uncovered,allValid:entries.length>0&&entries.every(([,e])=>e.valid===e.planned),per};
}

// Phase 2's gates on the fix's rows (main's are the comparison), per source and cell:
// - every plain paste whose own content is exact, or whose paired main row delivered exactly, is an exact fix delivery
//   confirmed by the read-back (a delivery the baseline makes and the fix loses fails here);
// - every realized control answers `typeUnconfirmed`; no wrong success on the paste route; the clipboard restored on every
//   attested row; the route unchanged from main's for the cell; no privacy flag; and full coverage.
const clipFlag=r=>r.privacy.some(f=>f==='clipboard'||f==='late-clipboard');
export function gates(rows,{fixHead='fix',coverage:cov=null}={}){
  const fix=rows.filter(r=>r.head===fixHead),main=rows.filter(r=>r.head!==fixHead);
  const key=r=>`${r.source}|${r.cell}|${r.rep}`;
  const mainExact=new Set(main.filter(r=>r.valid&&r.domExact).map(key));
  const owed=fix.filter(r=>r.valid&&PLAIN.includes(r.cell)&&(r.domExact||mainExact.has(key(r))));
  const missed=owed.filter(r=>!(r.domExact&&r.success&&r.readbackConfirmed));
  const controls=fix.filter(r=>r.valid&&r.control);
  const mainRoutes=new Set(main.filter(r=>r.attested).map(r=>r.source+'|'+r.cell+'|'+r.route));
  const routeRegressions=fix.filter(r=>r.attested&&!mainRoutes.has(r.source+'|'+r.cell+'|'+r.route)).length;
  const perCell=Object.fromEntries([...new Set(fix.map(r=>r.source+'/'+r.cell))].map(k=>{
    const list=fix.filter(r=>r.source+'/'+r.cell===k&&r.valid);
    return [k,{valid:list.length,success:list.filter(r=>r.success).length,confirmed:list.filter(r=>r.readbackConfirmed).length,
      exact:list.filter(r=>r.domExact).length,wrong:list.filter(r=>r.wrongSuccess).length}];
  }));
  return {
    coverage:{pass:cov?.complete===true&&cov?.covered===true,uncovered:cov?.uncovered??null,allValid:cov?.allValid??null},
    exactConfirmed:{pass:owed.length>0&&missed.length===0,n:owed.length,missed:missed.length,
      lostDelivery:missed.filter(r=>!r.domExact).length,missedOutcomes:tally(missed.map(r=>r.outcome+'/'+r.reason))},
    controlsUnconfirmed:{pass:controls.length>0&&controls.every(r=>r.outcome==='typeUnconfirmed'),n:controls.length,
      succeeded:controls.filter(r=>r.success).length,outcomes:tally(controls.map(r=>r.outcome+'/'+r.reason))},
    wrongSuccess:{pass:fix.every(r=>!r.wrongSuccess),fix:fix.filter(r=>r.wrongSuccess).length,main:main.filter(r=>r.wrongSuccess).length},
    clipboard:{pass:fix.filter(r=>r.attested).every(r=>r.clipboardRestored),n:fix.filter(r=>r.attested).length,
      missed:fix.filter(r=>r.attested&&!r.clipboardRestored).length,mainMissed:main.filter(r=>r.attested&&!r.clipboardRestored).length},
    route:{pass:routeRegressions===0,regressions:routeRegressions},
    privacy:{pass:fix.every(r=>r.privacy.length===0),fix:fix.filter(r=>r.privacy.length).length,main:main.filter(r=>r.privacy.length).length},
    // The pre-trial clipboard's content in any answer surface (a field's excerpt included), on any row of either head.
    clipboardContent:{pass:fix.every(r=>!clipFlag(r)),fix:fix.filter(clipFlag).length,main:main.filter(clipFlag).length},
    // Delivery no worse than main's: every valid fix row whose paired main row (same source, cell and repetition) delivered
    // its planned content (the expected text, or a control's exact perturbation) delivered it too.
    delivery:(()=>{
      const delivered=r=>r.control?r.realized===true:r.domExact;
      const mainOk=new Set(main.filter(r=>r.valid&&delivered(r)).map(key));
      const paired=fix.filter(r=>r.attested&&r.route==='paste'&&mainOk.has(key(r)));
      const lost=paired.filter(r=>!delivered(r));
      return {pass:paired.length>0&&lost.length===0,n:paired.length,lost:lost.length,lostCells:tally(lost.map(r=>r.cell))};
    })(),
    perCell,
  };
}
