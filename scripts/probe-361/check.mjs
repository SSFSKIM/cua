// Scoring, the privacy scan and the summaries. Pure: unit-tested by check.test.mjs; nothing here reads a field or the cua
// observation. Content truth is the owned fixture's own booleans.
import {CONTROLS} from './cells.mjs';

export const NATIVE_CODES=new Set(['typeUnconfirmed','pasteUnconfirmed','clipboardReadTimedOut','clipboardConflict','clipboardWriteFailed',
  'concealedInputUnavailable','inputSourceChanged','keyboardLayoutUnavailable','userIntervened','timeoutReached','windowMinimized',
  'accessibilityError','permissionsNotGranted','runningApplicationNotFound','screenLocked','invalidArguments','eventCreationFailed',
  'unknownError','jsonRPCError']);
const word=x=>typeof x==='string'&&/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(x)?x:x==null?null:'other';

// The route the engine took, from the native reply's meta: it must be the paste route, else the row is setup-invalid.
export const routeOf=native=>word((native?.result?.meta??native?.error?.meta)?.inputRoute);

// What the action answered and why, in closed codes. The fix's read-back (`typeReadback`) wins when present; otherwise the
// paste route's own last-line stage and wait (#187).
export function outcomeOf({native,skyError,guarded}){
  if(!guarded)return {outcome:'request-shape',reason:null};
  if(!native)return {outcome:'missing',reason:null};
  const meta=native.result?.meta??native.error?.meta??{},rb=meta.typeReadback,paste=meta.paste;
  const outcome=native.error?NATIVE_CODES.has(native.error.errorName)?native.error.errorName:'native-other':skyError?'wrapper-error':'success';
  let reason=null;
  if(rb&&typeof rb==='object')reason='readback:'+(rb.confirmed===true?'confirmed':word(rb.reason)??'none');
  else if(paste&&typeof paste==='object')reason=`paste:${word(paste.stage)??'none'}:${word(paste.effectWait)??(paste.openingReturn?'return-'+(word(paste.openingReturn.settle)??'none'):'none')}`;
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

// #354's literal excerpt rules applied to the paste route, over one trial's answer surfaces (native reply, sky result and
// error, forwarded meta, emitted content, captured console, engine output):
// - another field's content (the setup field's canary) and the pre-trial clipboard never appear;
// - the field's content appears only on a `valueMismatch`, and then only inside an error message (the excerpt);
// - the excerpt stays bounded: the long prefill's far ends (beyond 100 units of the first difference) never appear.
export function scan(surfaces,{setupText,clipText,initial,text,expected,control,canaries=[],mismatch}){
  const all=strings(surfaces),flags=new Set();
  if(windows(setupText).some(w=>contains(all,w)))flags.add('other-field');
  if(windows(clipText).some(w=>contains(all,w)))flags.add('clipboard');
  for(const c of canaries)if(contains(all,c))flags.add('excerpt-unbounded');
  // Field content: the prefill and the text as typed, as 3-unit windows holding a CJK character and 6-unit all-ASCII ones
  // (random letters; a shorter ASCII window could be an English word of a sentence).
  const content=[...new Set([initial,text,expected,control].filter(v=>typeof v==='string'&&v.length>0))];
  const probes=[...new Set(content.flatMap(v=>[...windows(v,3).filter(w=>/[^\x00-\x7f]/.test(w)),
    ...windows(v,6).filter(w=>w.length===6&&/^[\x21-\x7e]+$/.test(w))]))];
  const messages=strings([surfaces?.native?.error?.message,surfaces?.skyError?.message,surfaces?.content]);
  const outside=strings({...surfaces,native:{...surfaces?.native,error:{...surfaces?.native?.error,message:undefined}},
    skyError:surfaces?.skyError?{meta:surfaces.skyError.meta,code:surfaces.skyError.code,errorName:surfaces.skyError.errorName}:null,content:undefined});
  if(probes.some(w=>contains(outside,w)))flags.add('content-outside-message');
  if(!mismatch&&probes.some(w=>contains(messages,w)))flags.add('content-without-mismatch');
  return [...flags].sort();
}

// One row's verdicts. `valid` needs a witnessed setup, the paste route, and for a control its perturbation realized.
export function score({cell,head,attested,route,outcome,reason,domExact,controlExact,hit,confirmed,clip}){
  const control=CONTROLS.includes(cell);
  const realized=control?hit===true&&controlExact===true:null;
  const invalid=!attested?'setup':route!=='paste'?'route-not-paste':control&&!realized?'control-not-realized':null;
  const success=outcome==='success';
  return {cell,head,valid:invalid===null,invalid,control,realized,success,outcome,reason,domExact:domExact===true,
    // Success while the field holds anything but the expected text: the gap #361 closes.
    wrongSuccess:attested===true&&success&&domExact!==true,
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
      success:v.filter(r=>r.success).length,exact:v.filter(r=>r.domExact).length,wrongSuccess:v.filter(r=>r.wrongSuccess).length,
      wrongSuccessInvalid:list.filter(r=>!r.valid&&r.wrongSuccess).length,readbackConfirmed:v.filter(r=>r.readbackConfirmed).length,
      clipboardRestored:v.filter(r=>r.clipboardRestored).length,presentationHeld:v.filter(r=>r.presentationHeld).length,
      outcomes:tally(v.map(r=>r.outcome)),reasons:tally(v.map(r=>r.reason)),privacy:tally(v.flatMap(r=>r.privacy)),
      serviceMs:{p50:percentile(v.map(r=>r.serviceMs),50),p95:percentile(v.map(r=>r.serviceMs),95)}};
  });
}

// Phase 2's gates on the fix's rows (main's are the comparison): every exact plain paste confirmed by the read-back, every
// realized control answered with no success, no wrong success, the clipboard restored on every row, the route unchanged
// from main's for the cell, and no privacy flag.
export function gates(rows,{fixHead='fix'}={}){
  const fix=rows.filter(r=>r.head===fixHead&&r.valid),main=rows.filter(r=>r.head!==fixHead&&r.valid);
  const plainExact=fix.filter(r=>!r.control&&r.domExact);
  const mainRoutes=new Set(rows.filter(r=>r.head!==fixHead&&r.attested).map(r=>r.source+'|'+r.cell+'|'+r.route));
  const routeRegressions=rows.filter(r=>r.head===fixHead&&r.attested&&!mainRoutes.has(r.source+'|'+r.cell+'|'+r.route)).length;
  return {
    exactConfirmed:{pass:plainExact.length>0&&plainExact.every(r=>r.success&&r.readbackConfirmed),n:plainExact.length,
      missed:plainExact.filter(r=>!(r.success&&r.readbackConfirmed)).length},
    controlsUnconfirmed:{pass:fix.some(r=>r.control)&&fix.filter(r=>r.control).every(r=>!r.success),n:fix.filter(r=>r.control).length,
      succeeded:fix.filter(r=>r.control&&r.success).length,outcomes:tally(fix.filter(r=>r.control).map(r=>r.outcome))},
    wrongSuccess:{pass:fix.every(r=>!r.wrongSuccess)&&rows.filter(r=>r.head===fixHead&&!r.valid).every(r=>!r.wrongSuccess),
      fix:rows.filter(r=>r.head===fixHead&&r.wrongSuccess).length,main:main.filter(r=>r.wrongSuccess).length},
    clipboard:{pass:fix.every(r=>r.clipboardRestored),n:fix.length,missed:fix.filter(r=>!r.clipboardRestored).length,
      mainMissed:main.filter(r=>!r.clipboardRestored).length},
    route:{pass:routeRegressions===0,regressions:routeRegressions},
    privacy:{pass:rows.filter(r=>r.head===fixHead).every(r=>r.privacy.length===0),fix:rows.filter(r=>r.head===fixHead&&r.privacy.length).length,
      main:rows.filter(r=>r.head!==fixHead&&r.privacy.length).length},
  };
}
