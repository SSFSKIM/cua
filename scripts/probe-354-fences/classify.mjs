// Pure plan and classification for the #354 fence spike: no I/O. Disposable experiment kit.
import {SEED} from './page.mjs';
export const FENCE_MODES=['baseline','readback','marker','marker-ack','ax-notify','ax-control'];
export const SCENES=['normal','already-selected'];
export const LENGTHS=[30,120,500];
export const BUDGET_MS=1000;
export const sentence=n=>('New typed sentence goes here. Every word is delivered in order. ').repeat(Math.ceil(n/62)).slice(0,n);
export const cellId=c=>[c.part,c.editor,c.scene,c.mode,c.length,c.rep].join('/');

/// What each fence mode posts and waits for. `readback` arms type_text's exact readback.
export function modeSpec(mode){
 const spec={
  baseline:{key:'cmd+a',fence:'none',readback:false,waitMarker:false},
  readback:{key:'cmd+a',fence:'none',readback:true,waitMarker:false},
  marker:{key:'cmd+a',fence:'marker',readback:false,waitMarker:false},
  'marker-ack':{key:'cmd+a',fence:'marker',readback:true,waitMarker:true},
  'ax-notify':{key:'cmd+a',fence:'ax',readback:true,waitMarker:false},
  // Same route and key-equivalent path as cmd+a, no selection effect: any acknowledgement is a false one.
  'ax-control':{key:'cmd+F20',fence:'ax',readback:true,waitMarker:false},
 }[mode];
 if(!spec)throw Error('unknown fence mode '+mode);return spec;
}

/// The shard's cells, interleaved by repetition so drift spreads over every mode; the unreadable lane runs last, so a
/// failure particular to its fixtures can only truncate the tail, and its password cells run after every canvas cell.
export function plan({shard,reps,lanes}){
 const cells=[],unreadable=lanes.includes('unreadable')&&shard==='textarea';
 for(let rep=1;rep<=reps;rep++){
  if(lanes.includes('fence'))for(const scene of SCENES)for(const mode of FENCE_MODES)cells.push({part:'fence',editor:shard,scene,mode,length:30,rep});
  if(lanes.includes('readback'))for(const length of LENGTHS)cells.push({part:'readback',editor:shard,scene:'normal',mode:'readback',length,rep});
 }
 if(unreadable)for(let rep=1;rep<=reps;rep++)cells.push({part:'unreadable',editor:'canvas',scene:'normal',mode:'readback',length:30,rep});
 if(unreadable)for(let rep=1;rep<=reps;rep++)for(const mode of ['readback','readback-concealed'])cells.push({part:'unreadable',editor:'password',scene:'normal',mode,length:30,rep});
 return cells.map(c=>({...c,id:cellId(c)}));
}

/// Whether a cell's setup keeps the browser frontmost instead of bringing the cover forward. Smoke run 42806930603: in
/// all three browsers, with a password field focused the cover's activation was accepted but the browser stayed
/// frontmost (secure event input, presumably), so every password cell failed setup. The password cells measure the
/// readback's privacy refusal, not key ordering, so they type into the frontmost browser; every other cell stays behind.
export const FOREGROUND_REASON='focused password field: the cover cannot become frontmost (smoke 42806930603); privacy lane, not an ordering lane';
export const setupForeground=c=>c.editor==='password';
/// The pid that must be frontmost through the settle and at the last check before the measured key or text.
export const measuredFrontPid=(c,{pid,coverPid})=>setupForeground(c)?pid:coverPid;

export const initialSelection=scene=>scene==='already-selected'?[0,SEED.length]:[3,0];
export const insertAtCaret=text=>SEED.slice(0,3)+text+SEED.slice(3);
/// The intended DOM outcome: select-all then type replaces everything; a key with no selection effect types at the
/// prepared selection.
export function expectedFinal({part,scene,mode},text){
 if(part==='unreadable')return insertAtCaret(text);
 if(part==='fence'&&modeSpec(mode).key!=='cmd+a')return scene==='already-selected'?text:insertAtCaret(text);
 return text;
}

const sameSel=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a[0]===b[0]&&a[1]===b[1];
const isMarker=t=>t.code==='F20'||t.key==='F20';
const isText=t=>t.event==='keydown'&&!t.meta&&typeof t.key==='string'&&t.key.length===1;
/// Where the key's effect landed against the marker and the first typed key, from the page's own event trace.
/// A full-selection event is a selection change selecting all of a non-empty value after the command key went down.
export function analyzeTrace(trace,{scene,key='cmd+a'}={}){
 const t=[...(trace??[])].sort((a,b)=>a.seq-b.seq),out={};
 const cmd=t.find(x=>x.event==='keydown'&&x.meta&&(key==='cmd+a'?(x.key==='a'||x.key==='A'):isMarker(x)));
 const marker=t.find(x=>x.event==='keydown'&&!x.meta&&isMarker(x)),markerUp=t.find(x=>x.event==='keyup'&&!x.meta&&isMarker(x));
 const firstText=t.find(isText),firstInput=t.find(x=>x.event==='input');
 const full=t.filter(x=>(x.event==='selectionchange'||x.event==='select')&&(!cmd||x.seq>cmd.seq)&&x.len>0&&sameSel(x.selection,[0,x.len]));
 const firstFull=full[0]??null;
 out.cmdKeydownAt=cmd?.at??null;out.markerKeydownAt=marker?.at??null;out.markerKeyupAt=markerUp?.at??null;
 out.markerSelection=marker?.selection??null;out.firstTextKeydownAt=firstText?.at??null;out.firstTextKey=firstText?.key??null;
 out.fullSelectionAt=firstFull?.at??null;out.fullSelectionEvents=full.length;
 // Effect observed before any typed text reached the field.
 out.effectBeforeText=firstFull?(firstInput?firstFull.seq<firstInput.seq:true):null;
 // A select-all landing on typed text: the race's signature (the typed prefix is then replaced). Typing never selects,
 // so any event recording a full selection of a non-empty value after the first input counts, a selection change or
 // not (Chromium's input element can show it only on the next key's recorded selection).
 const late=firstInput?t.filter(x=>x.seq>firstInput.seq&&x.len>0&&sameSel(x.selection,[0,x.len])):[];
 out.lateEffect=late.length>0;out.lateEffectAt=late[0]?.at??null;
 if(out.lateEffect)out.effectBeforeText=false;
 // Marker against effect: did the page see the marker before the key's effect was applied?
 const effect=out.lateEffect?late[0]:firstFull;
 out.markerBeforeEffect=marker&&effect?marker.seq<effect.seq:marker&&out.lateEffect?true:null;
 out.effectAtMarker=marker&&scene==='normal'?sameSel(marker.selection,[0,SEED.length]):null;
 return out;
}

/// The exact readback against the DOM's final truth. A false confirmation is the one outcome a design cannot accept.
export function readbackVerdict(rb,{correct,intent}){
 if(!rb?.active)return null;
 return {status:rb.status,reason:rb.reason??null,confirmed:rb.confirmed===true,falseConfirm:rb.confirmed===true&&correct===false,
  falseUnconfirmed:rb.confirmed!==true&&correct===true,detectedLoss:rb.confirmed!==true&&correct===false,
  expectedIsIntent:typeof rb.expected==='string'?rb.expected===intent:null};
}

/// Whether a secure, concealed or after-input-closed readback leaked anything it must not have read, or read a
/// password field that was not exposed as secure.
export const READBACK_VALUE_KEYS=['before','beforeRange','expected','actual','actualRange','expectedCaret'];
export function privacyViolation(rb,{passwordField=false}={}){
 if(!rb?.active)return false;
 if(passwordField&&rb.reason!=='concealed'&&rb.secure!==true)return true;
 const closed=rb.secure===true||rb.reason==='concealed'||rb.reason==='secure'||rb.closedAfterInput!=null;
 return closed&&READBACK_VALUE_KEYS.some(k=>rb[k]!=null);
}

/// Repeated setup loss aborts the shard; its coverage is then incomplete by construction.
export function abortReason({consecutiveInvalid,setupFailures}){
 if(consecutiveInvalid>=3)return `${consecutiveInvalid} consecutive invalid cells`;
 if(setupFailures>=6)return `${setupFailures} setup failures`;
 return null;
}
export function coverage({planned,valid,aborted}){return {planned,valid,missing:planned-valid,complete:!aborted&&valid===planned}}

export function quantiles(a){const v=a.filter(x=>typeof x==='number'&&Number.isFinite(x)).sort((x,y)=>x-y);if(!v.length)return {n:0,p50:null,p95:null,max:null};const q=p=>v[Math.min(v.length-1,Math.floor(p*(v.length-1)+0.5))];return {n:v.length,p50:+q(.5).toFixed(2),p95:+q(.95).toFixed(2),max:+v.at(-1).toFixed(2)}}
