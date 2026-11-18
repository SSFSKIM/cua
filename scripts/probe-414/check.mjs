import {createHash} from 'node:crypto';

export const primary=['short','long','selection','literal','unicode'];
export const negative=['drop','add'];
export const markerKey='confirmation';
// The product's fixed success note opens with this; the harness checks the prefix and that the rendered item is the engine's own note.
export const NOTE_PREFIX='Typed into a password field, confirmed by its length only:';
export const lengthSuccess=r=>r?.confirmed===true&&r.secure===true&&r[markerKey]==='length';
// The note the engine sent, as the production wrapper emitted it into the rendered content: one item, a prefix of the engine's note.
export const noteAttested=(note,items)=>typeof note==='string'&&note.startsWith(NOTE_PREFIX)&&Array.isArray(items)&&items.length===1&&
  typeof items[0]==='string'&&items[0].startsWith(NOTE_PREFIX)&&note.startsWith(items[0]);
export function plan(smoke,{selection=true,audit=false}={}){
  const rows=[];
  if(audit){
    for(let rep=0;rep<(smoke?1:5);rep++)for(const kind of ['short','long','literal'])rows.push({head:'fix',kind,rep});
    return rows;
  }
  for(let rep=0;rep<(smoke?1:20);rep++){
    primary.forEach((kind,i)=>{
      if(kind==='selection'&&!selection||rep>=10&&['selection','literal'].includes(kind))return;
      for(const head of (rep+i)%2===0?['main','fix']:['fix','main'])rows.push({head,kind,rep});
    });
    if(rep<10)rows.push({head:'fix',kind:'drop',rep,literal:rep%2===1});
    rows.push({head:'fix',kind:'add',rep,literal:rep%2===1});
    if(rep<5)rows.push({head:'fix',kind:'rewrite',rep});
  }
  return rows;
}

// Stock reduced run (mode=reduced): per head 10 short and 10 long concealed and 5 literal; the fix alone adds 20 adds (10 concealed, 10
// literal) and 10 drops (5/5). No rewrite or unicode. AppKit alone adds 5 fix-only prefilled selections, a separately labeled
// snapshot-refusal control (never part of a head's comparison). Product pins interleave exactly as in the full plan.
export const REDUCED_LANES=['cft','electron','electron-parity','safari','appkit'];
export const SNAPSHOT_REFUSAL_LABEL='appkit-selection-snapshot-refusal';
export function reducedPlan(lane){
  const rows=[];
  for(let rep=0;rep<20;rep++){
    [['short',0,10],['long',1,10],['literal',3,5]].forEach(([kind,i,n])=>{
      if(rep>=n)return;
      for(const head of (rep+i)%2===0?['main','fix']:['fix','main'])rows.push({head,kind,rep});
    });
    if(lane==='appkit'&&rep<5)rows.push({head:'fix',kind:'selection',rep,label:SNAPSHOT_REFUSAL_LABEL});
    if(rep<10)rows.push({head:'fix',kind:'drop',rep,literal:rep%2===1});
    rows.push({head:'fix',kind:'add',rep,literal:rep%2===1});
  }
  return rows;
}

// The reduced AppKit selection row is an explicit snapshot-refusal test, never an optional success: both readbacks must agree on an
// unconfirmed secure concealed refusal at the snapshot (lengthUnreadable or selectionUnreadable), with the observed content exact.
export const snapshotRefusalPass=({valid,raw,forwarded,sky,domExact})=>valid===true&&domExact===true&&sky==='typeUnconfirmed'&&
  [raw,forwarded].every(r=>r?.confirmed===false&&r.secure===true)&&raw.concealed===true&&
  ['lengthUnreadable','selectionUnreadable'].includes(raw.reason)&&raw.reason===forwarded.reason;
export function score({head,kind,lane,literal=false,preliminary=false,raw,forwarded,sky,fixture,domExact,controlExact,noted,label}){
  // Confirmed means the agreed length metadata on both surfaces and the production sky success; any other success claim is bare.
  const agreed=lengthSuccess(raw)&&lengthSuccess(forwarded)&&sky==='ok';
  const claim=raw?.confirmed===true||forwarded?.confirmed===true||sky==='ok';
  const outcome=agreed?'confirmed':claim?'bare':raw?.confirmed===false&&forwarded?.confirmed===false?'unconfirmed':'missing';
  const lengthConfirmed=agreed&&noted===true;
  const isControl=negative.includes(kind)||kind==='rewrite';
  const valid=fixture&&(!isControl||controlExact===true);
  const unconfirmed=outcome==='unconfirmed'&&sky==='typeUnconfirmed'&&typeof raw.reason==='string'&&raw.reason===forwarded.reason;
  const firefoxLimit=unconfirmed&&lane==='firefox'&&raw.reason==='notTextField';
  const knownLimit=firefoxLimit||unconfirmed&&head==='fix'&&lane==='appkit'&&kind==='selection'&&['lengthUnreadable','selectionUnreadable'].includes(raw.reason);
  // A controlled count change is rejected by the count (or, on the AppKit caret fallback, the caret); a Firefox notTextField is not that proof.
  const lengthRejected=unconfirmed&&raw.secure===true&&forwarded.secure===true&&(raw.reason==='lengthMismatch'||raw.reason==='caretMismatch'&&(literal||preliminary&&lane==='appkit'));
  const controlled=negative.includes(kind);
  const refusalTest=label===SNAPSHOT_REFUSAL_LABEL;
  return {valid, outcome, lengthConfirmed, knownLimit, lengthRejected:controlled&&lengthRejected, informational:kind==='rewrite',
    // A wrong success is any success claim over a DOM known to differ, even when the control's own edit was not the only corruption.
    wrongSuccess:fixture===true&&(outcome==='confirmed'||outcome==='bare')&&domExact===false,
    pass:refusalTest?head==='fix'&&lane==='appkit'&&kind==='selection'&&snapshotRefusalPass({valid,raw,forwarded,sky,domExact}):valid&&(kind==='rewrite'?unconfirmed&&domExact===false:controlled?domExact===false&&(lengthRejected||firefoxLimit):
      domExact===true&&(knownLimit||(head==='main'?unconfirmed&&raw.reason==='secure':lengthConfirmed))),
    domExact:domExact===true};
}

// Private names, as keys of a structure and as `name:` / `name=` in text. AX attribute names are private wherever they appear.
const forbidden=/^(?:(?:cua\/)?(?:entered|checkpoints)|(?:ax)?(?:value|valueDescription|valueMarkdown|numberOfCharacters|selectedText|selectedTextRange)|selection(?:Start|End|Length)?|start|end|before|after|actual|expected|caret|range|location|offset|.*excerpt|.*(?:Length|Count)|length|count|characters|reads|pollMs|settleReads)$/i;
const textEvidence=/[•●◦\uf79a]|\*{3,}|\b\d+\s*(?:characters?|chars?|code units?|bytes?)\b|\b(?:AXNumberOfCharacters|AXSelectedTextRange|length|count|numberOfCharacters|selectedText(?:Range)?|selection|range|offset|characters|(?:cua\/)?entered)\b["']?\s*(?:is\b|of\b|[=:])?\s*[[(]?\s*\d/i;
const axNames=/\bAX(?:Value|ValueDescription|SelectedText|SelectedTextRange|NumberOfCharacters)\b/;
const textName=/(?<![A-Za-z0-9_])(?:cua\/)?(?:entered|checkpoints|reads|pollMs|settleReads|expectedLength|actualLength|selectionStart|selectionEnd|selectionLength|selectedTextRange|selectedText|numberOfCharacters|valueDescription|value|length|count|characters|caret|range|location|offset|actual|expected|excerpt)["']?\s*[:=]/i;
const readbackKeys=new Set(['confirmed','reason','snapshotMs','concealed','secure','keysUnconfirmed','stoppedBeforeKey',markerKey]);
// A literal request's `entered` is a count of public units, posted at three production positions only.
const enteredAt={ipc:[['result.meta','entered'],['error.meta','entered']],'sky-error':[['meta','entered']],forwarded:[['','cua/entered']]};
const readbackPaths=['result.meta.typeReadback','error.meta.typeReadback','meta.typeReadback','cua/typeReadback'];
// Every JSON value a line carries: the whole line, or what follows a prefix (and precedes a suffix) of diagnostics.
function embedded(s){
  if(typeof s!=='string'||s.length>200000||!/[{[]/.test(s))return [];
  const starts=[...s.matchAll(/[{[]/g)].map(m=>m.index).slice(0,12), ends=[...s.matchAll(/[}\]]/g)].map(m=>m.index+1).reverse().slice(0,12);
  for(const a of starts)for(const b of ends){
    if(b<=a)continue;
    try{return [JSON.parse(s.slice(a,b))];}catch{}
  }
  return [];
}
export function inspect(input,values,{literal=false,stringsOnly=false,surface=null,baseline=false,names=true}={}){
  const findings=new Set(),seen=new WeakSet();
  const needles=[...new Set(values.flatMap(v=>[v,Buffer.from(v).toString('hex'),Buffer.from(v).toString('base64').replace(/=+$/,''),...Array.from({length:Math.max(0,v.length-7)},(_,i)=>v.slice(i,i+8))]).map(x=>x.toLowerCase()))].filter(Boolean);
  function string(s,depth){
    const lower=s.toLowerCase();
    if(needles.some(n=>n.length<=lower.length&&lower.includes(n)))findings.add('synthetic-value');
    if(textEvidence.test(s))findings.add('private-text');
    if(names&&(axNames.test(s)||textName.test(s)))findings.add('private-name');
    // JSON inside a string is structure too, without any exemption.
    if(depth<2)for(const data of embedded(s))walk(data,[],depth+1,true);
  }
  function walk(v,path=[],depth=0,nested=false){
    if(typeof v==='string'){string(v,depth);return;}
    if(!v||typeof v!=='object'||seen.has(v))return;
    seen.add(v);
    if(Array.isArray(v)&&v.length>=8&&v.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=65535))string(String.fromCharCode(...v.slice(0,64000)),depth);
    for(const k of Object.getOwnPropertyNames(v)){
      // Array.length is not serialized; actual length keys inside its items still fail.
      if(k==='length'&&Array.isArray(v)||k==='stack'&&v instanceof Error)continue;
      const x=v[k],at=path.join('.'),parent=path.at(-1),inReadback=parent==='typeReadback'||parent==='cua/typeReadback';
      string(k,depth);
      const exempt=!nested&&literal&&(
        // The count of public units, at the exact production position of this surface.
        (enteredAt[surface]??[]).some(([where,key])=>at===where&&k===key)&&Number.isSafeInteger(x)&&x>=0&&x<=values[0]?.length||
        // The baseline's literal secure refusal alone carries its old, constant zero counters.
        baseline&&inReadback&&['pollMs','reads'].includes(k)&&x===0&&readbackPaths.includes(at)&&v.reason==='secure'&&v.confirmed===false&&v.secure===undefined&&v.concealed===undefined);
      if(exempt)continue;
      if(!stringsOnly&&x!==null&&x!==undefined&&forbidden.test(k))findings.add('private-key');
      if(!stringsOnly&&inReadback&&(!readbackKeys.has(k)||k===markerKey&&x!=='length'||['secure','concealed','stoppedBeforeKey','keysUnconfirmed'].includes(k)&&typeof x!=='boolean'||k==='confirmed'&&typeof x!=='boolean'||k==='snapshotMs'&&!Number.isFinite(x)||k==='reason'&&(typeof x!=='string'||!/^[a-z][A-Za-z]{2,40}$/.test(x))))findings.add('readback-shape');
      walk(x,[...path,k],depth,nested);
    }
  }
  if(typeof input==='string'){string(input,0);}else walk(input);
  return [...findings].sort();
}

// Only the Firefox diagnostic uses this projection. The sealed observation is of the *surface*, not the field's identity.
export function firefoxDisclosure(surface,{setupText,passwordText}={}){
  const diagnostics=surface?.error??surface?.result??surface;
  const r=diagnostics?.meta?.typeReadback??surface?.['cua/typeReadback']??{};
  const text=typeof surface==='string'?surface:typeof diagnostics?.message==='string'?diagnostics.message:'';
  const present=k=>r[k]!==null&&r[k]!==undefined;
  // Only the actual excerpt can identify a field. Expected normally repeats the literal request even on a wrong target.
  const quoted=text.match(/\bthe field reads ("(?:[^"\\]|\\.)*")/);
  let actual=typeof r.actual==='string'?r.actual:'';
  if(!actual&&quoted)try{actual=JSON.parse(quoted[1]);}catch{}
  const matches=value=>typeof value==='string'&&value.length>=6&&Array.from({length:value.length-5},(_,i)=>value.slice(i,i+6)).some(part=>actual.includes(part));
  const setup=matches(setupText),password=matches(passwordText)||/[•]/.test(actual);
  const actualClass=setup===password?'unknown':setup?'setup':'password';
  return {excerpt:present('excerpt')||/\bFrom character \d+, expected /.test(text),
    expected:present('expected')||/\bexpected ["']/.test(text),
    actual:present('actual')||/\bthe field reads ["']/.test(text),
    masks:/[•]/.test(text)||/[•]/.test(JSON.stringify(r)),
    lengths:present('expectedLength')||present('actualLength')||/\b\d+ characters long\b/.test(text),actualClass};
}

// Only same-machine elapsed times leave the scratch timing lane. The p99 sizing metric excludes intentional quiet sampling.
// What shape a run takes follows from its lane and mode alone: only the focus diagnostic has (and verifies) a setup field,
// and only the single-cell Firefox retry insists on real background cover rather than a frontmost fallback.
export const runShape=(lane,mode)=>({singlePassword:lane==='firefox'&&mode!=='firefox-focus',setupCanary:lane==='firefox'&&mode==='firefox-focus',
  requireBackground:lane==='firefox'&&mode==='firefox-single'});
// A password-only setup failure names the platform step that failed; only these fixed labels leave the run.
const setupSteps=new Set(['foreground-activation','foreground-focus','foreground-seed','cover-activation','cover-lost','password-focus-lost','witness','background-seed','seed-unstable']);
export const setupLabel=e=>setupSteps.has(e?.setupStep)?e.setupStep:null;
// The Firefox focus identity probe runs as the smoke mode's scratch job as well as in the dedicated diagnostic modes.
export const focusAllowed=(lane,mode,phase)=>phase==='focus'&&lane==='firefox'&&(mode==='smoke'||mode.startsWith('firefox-'));
// Require a genuine edit. The independently injected prefix precedes the last regular key and cannot stand in for it.
export const terminalEditAtMs=d=>Number.isFinite(d?.lastInputAtMs)?d.lastInputAtMs:Number.isFinite(d?.lastKeyAppliedAtMs)?d.lastKeyAppliedAtMs:null;
// Timings only: include the genuine edit just before the final post if it gives way to a later edit.
export function appliedEditGaps(times,post){
  if(!Array.isArray(times)||!Number.isFinite(post)||times.some((x,i)=>!Number.isFinite(x)||i>0&&x<times[i-1]))return [];
  const crossed=times.findIndex(x=>x>=post);
  return crossed<0?[]:times.slice(Math.max(crossed,1)).map((x,i)=>Math.round((x-times[Math.max(crossed,1)+i-1])*1000)/1000);
}
export function drainIntervals(trace,{replyAtMs,confirmed=false,app,editAtMs,editTimesMs}={}){
  const {lastPostAtMs:post,firstReadAtMs:first,sampledAtMs:changes,finalReadStartedAtMs:started,finalReadAtMs:final,confirmReadAtMs:confirmation,sampledDropped:dropped}=trace??{};
  if(dropped!==0||![post,first,started,final].every(Number.isFinite)||!Array.isArray(changes)||!changes.every(Number.isFinite)||
    final<post||first>final||started>final||changes.some((x,i)=>x<first||x>final||i>0&&x<changes[i-1]))return null;
  const observed=changes.filter(t=>t>post),last=observed.at(-1)??Math.max(first,post);
  const delta=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)?Math.round((a-b)*1000)/1000:null;
  const bool=x=>typeof x==='boolean'?x:null;
  return {changeGapsMs:observed.slice(1).map((x,i)=>delta(x,observed[i])),fixtureEditGapsMs:appliedEditGaps(editTimesMs,post),drainMs:delta(last,post),finalReadMs:delta(final,post),
    finalStartAfterEditMs:delta(started,editAtMs),editAfterPostMs:delta(editAtMs,post),
    confirmReadMs:confirmed&&confirmation>=post?delta(confirmation,post):null,replyMs:delta(replyAtMs,post),
    consumptionAfterPostMs:delta(app?.lastKeyAppliedAtMs,post),arrivalAfterPostMs:delta(app?.lastKeyAtMs,post),
    insertionRelativeToLastKeyMs:delta(app?.addedAtMs,app?.lastKeyAppliedAtMs),replyAfterLastKeyMs:delta(replyAtMs,app?.lastKeyAppliedAtMs),
    addAdvancedCaret:bool(app?.addAdvancedCaret),requestedCaretOk:bool(app?.requestedCaretOk),controlCaretOk:bool(app?.controlCaretOk)};
}
export function drainStats(values){
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b),p=q=>sorted[Math.ceil(sorted.length*q)-1]??null;
  return {n:sorted.length,p50:p(.5),p95:p(.95),p99:p(.99),max:sorted.at(-1)??null};
}
// A row sizes the drain only when its terminal content is realized and the production final sample began strictly after the
// fixture's own last edit; a sample that began earlier raced the edit (a truncated read) and stays evidence only. Labels are fixed.
export function drainIneligible({valid,realized,elapsed}){
  if(valid!==true)return 'invalid';
  if(realized!==true)return 'content-unrealized';
  if(!elapsed)return 'no-elapsed';
  if(!Number.isFinite(elapsed.finalStartAfterEditMs))return 'no-edit-time';
  if(elapsed.finalStartAfterEditMs<=0)return 'final-before-edit';
  return null;
}
// Fewer eligible samples than this still describe the run, but do not qualify it.
export const SIZING_MIN_RATIO=0.99;
// Usable elapsed projections and independent final-delivery coverage are reported apart; only the sizing subset feeds the statistics.
export function drainSummary(rows,planned){
  const sizing=rows.filter(r=>r.ineligible===null&&r.elapsed),reasons={};
  for(const r of rows)if(r.ineligible)reasons[r.ineligible]=(reasons[r.ineligible]??0)+1;
  const metric=k=>drainStats(sizing.map(r=>r.elapsed[k]));
  return {planned,sampled:rows.filter(r=>r.sampled).length,elapsed:rows.filter(r=>r.elapsed).length,realized:rows.filter(r=>r.valid&&r.realized).length,
    eligible:sizing.length,reasons,minimum:Math.ceil(planned*SIZING_MIN_RATIO),
    stats:{changeGapsMs:drainStats(sizing.flatMap(r=>r.elapsed.changeGapsMs)),
      fixtureEditGapsMs:drainStats(rows.filter(r=>r.valid&&r.realized).flatMap(r=>r.elapsed?.fixtureEditGapsMs??[])),
      drainMs:metric('drainMs'),editAfterPostMs:drainStats(rows.filter(r=>r.valid&&r.realized).map(r=>r.elapsed?.editAfterPostMs)),finalReadMs:metric('finalReadMs')}};
}
export const drainSizingOk=(summary,recorded)=>recorded===summary.planned&&summary.eligible>=summary.minimum;

// Stock IPC supplies first/last native post timestamps, but not the snapshot end. The budget starts after typing.
// The window is a seam: the legacy gate (full run) is one second after the last post, 999..1100 ms. The reduced run's product pads
// every posted concealed secure refusal, a snapshot refusal after posting included, to the 1000 ms budget plus the fixed
// 100 ms focus-read cap. REDUCED_OVERHEAD_MS is the independent native IPC timing allowance above the nominal 1100 ms.
export const REDUCED_PAD_MS=1100, REDUCED_OVERHEAD_MS=50;
export const budgetProfile=mode=>mode==='reduced'?{name:'reduced',minMs:REDUCED_PAD_MS-1,maxMs:REDUCED_PAD_MS+REDUCED_OVERHEAD_MS,snapshotBudgeted:true}:
  {name:'legacy',minMs:999,maxMs:1100,snapshotBudgeted:false};
export function concealedFailureTiming({head,lane,kind,literal,action,raw,startedAt,endedAt,replyAt,mode='full'}){
  if(head!=='fix'||literal||action!=='typeUnconfirmed'||raw?.confirmed!==false||raw?.concealed!==true||raw?.secure!==true)return null;
  const posted=Number.isFinite(startedAt),profile=budgetProfile(mode);
  const snapshot=raw.reason==='selectionUnreadable'||raw.reason==='lengthUnreadable'&&lane==='appkit'&&kind==='selection';
  const phase=!posted?'before-input':snapshot?'snapshot-refused':'after-input';
  const interval=t=>Number.isFinite(t)&&Number.isFinite(replyAt)?replyAt-t:null;
  const fromLastPostMs=interval(endedAt),fromFirstPostMs=interval(startedAt);
  const budgeted=phase==='after-input'||phase==='snapshot-refused'&&profile.snapshotBudgeted;
  return {phase,fromLastPostMs,fromFirstPostMs,
    withinBudget:budgeted?(fromLastPostMs!==null&&fromLastPostMs>=profile.minMs&&fromLastPostMs<=profile.maxMs):null};
}

// The reduced budget gate is never vacuous: every realized concealed fix add/drop control must yield a known post-input failure
// timing row (15 per lane), and AppKit's five selection controls must each yield a snapshot-refused timing row. Rows are valid-only.
export const REDUCED_EXPECTED={afterInput:15,snapshot:lane=>lane==='appkit'?5:0};
export function reducedBudgetCoverage(lane,rows){
  const timed=rows.filter(r=>r.valid&&r.head==='fix'&&r.concealedFailure);
  const afterInput=timed.filter(r=>['add','drop'].includes(r.kind)&&r.literal!==true&&r.concealedFailure.phase==='after-input').length;
  const snapshot=timed.filter(r=>r.label===SNAPSHOT_REFUSAL_LABEL&&r.concealedFailure.phase==='snapshot-refused').length;
  const expected={afterInput:REDUCED_EXPECTED.afterInput,snapshot:REDUCED_EXPECTED.snapshot(lane)};
  return {expected,afterInput,snapshot,ok:afterInput===expected.afterInput&&snapshot===expected.snapshot};
}

// Output-only diagnosis of a baseline readback that the strict privacy scan flags (zero pollMs/reads counters). It grants no
// exemption: from the raw record held in memory it reports closed booleans about one surface's readback, never a key or a value.
const legacyKeys=new Set([...readbackKeys,'pollMs','reads']);
export function readbackProfile(r){
  if(!r||typeof r!=='object'||Array.isArray(r))return {present:false};
  const keys=Object.getOwnPropertyNames(r),own=k=>Object.prototype.hasOwnProperty.call(r,k);
  const answer=/excerpt|actual|expected/i,length=/length|count|characters|entered|checkpoints|range|location|offset|caret|selection/i,value=/value|text|mask|bullet/i;
  const plain=k=>!answer.test(k)&&!length.test(k)&&!value.test(k);
  const typed=keys.filter(k=>plain(k)&&legacyKeys.has(k)).every(k=>['confirmed','secure','concealed','stoppedBeforeKey','keysUnconfirmed'].includes(k)?typeof r[k]==='boolean':
    k==='reason'?typeof r[k]==='string'&&/^[a-z][A-Za-z]{2,40}$/.test(r[k]):k===markerKey?r[k]==='length':Number.isFinite(r[k]));
  return {present:true,hasPollMs:own('pollMs'),hasReads:own('reads'),zeroCounters:own('pollMs')&&own('reads')&&r.pollMs===0&&r.reads===0,
    answerFields:keys.some(k=>answer.test(k)),valueFields:keys.some(k=>!answer.test(k)&&value.test(k)),lengthFields:keys.some(k=>!answer.test(k)&&length.test(k)),
    novelKeys:keys.some(k=>plain(k)&&!legacyKeys.has(k))||!typed,nested:keys.some(k=>r[k]!==null&&typeof r[k]==='object')};
}
const profileClean=p=>p?.present===true&&p.zeroCounters===true&&!p.answerFields&&!p.valueFields&&!p.lengthFields&&!p.novelKeys&&!p.nested;
// Findings this diagnosis may explain are exactly the key/shape flags on the three readback-bearing surfaces; any other is unexplained.
const explainable=/^(?:ipc-type|sky-error|forwarded)\/(?:private-key|readback-shape)$/;
const surfaceNames=['ipc','wrapper','forwarded'];
export function legacyBaselineCase({head,reason,flags,surfaces}){
  if(!(flags??[]).some(f=>explainable.test(f)))return null;
  const allowed=head==='main'&&flags.every(f=>explainable.test(f))&&surfaceNames.every(n=>profileClean(surfaces?.[n]));
  return {head:head==='fix'?'fix':'main',reason:typeof reason==='string'?reason:'none',allowed,
    surfaces:Object.fromEntries(surfaceNames.map(n=>[n,Object.fromEntries(['present','hasPollMs','hasReads','zeroCounters','answerFields','valueFields','lengthFields','novelKeys','nested'].map(k=>[k,surfaces?.[n]?.[k]===true]))]))};
}
// Counts per head and reason; unproven rows stay fail-closed in the privacy gate regardless.
export function legacyBaselineTally(cases){
  const out={flagged:0,allowed:{main:{},fix:{}},unproven:{main:{},fix:{}},surfaces:{}};
  for(const c of cases.filter(Boolean)){
    out.flagged++;
    const tally=(c.allowed?out.allowed:out.unproven)[c.head];tally[c.reason]=(tally[c.reason]??0)+1;
    for(const [n,p] of Object.entries(c.surfaces)){
      const s=out.surfaces[n]??={};
      for(const [k,v] of Object.entries(p))if(v)s[k]=(s[k]??0)+1;
    }
  }
  return out;
}

const forbiddenAX=new Set(['AXValue','AXValueDescription','AXSelectedText']);
const countRead=(api,name,id,secure)=>api==='b'&&secure.has(id)&&name==='AXRole+AXSubrole+AXSelectedTextRange+AXNumberOfCharacters';
// Trace entries are attribute names, first-seen element aliases and a closed classification ('secure' or 'webArea'), never AX data.
// Only identical consecutive iterations of the marked secure length poll collapse; operations inside one iteration and every
// distinct iteration stay in order. `marker` (Safari) requires the scoped web-area marker pair before the first input, and
// nothing of the kind otherwise. The pre-input baseline count batch and the post-input poll count batches must really occur.
export function auditSchedule(events,{marker=false}={}){
  const secure=new Set(events.filter(e=>e[3]==='secure').map(e=>e[2])), web=new Set(events.filter(e=>e[3]==='webArea').map(e=>e[2]));
  const first=events.findIndex(e=>e[0]==='event');
  const forbiddenReads=events.filter(([api,name,element])=>secure.has(element)&&(api==='q'||(['r','b'].includes(api)&&name.split('+').some(n=>forbiddenAX.has(n))))).length;
  const chunks=[];let iteration=null,previous=null,structured=true,polls=0,polled=0,baseline=false;
  events.forEach(([api,name,id],i)=>{
    if(api==='p'){
      if(name==='begin'&&iteration===null){iteration={ops:[],start:i,counted:false};return;}
      if(name==='end'&&iteration!==null){
        const key=JSON.stringify(iteration.ops);
        if(key!==previous){chunks.push('poll',...iteration.ops,'end');previous=key;}
        polls++;if(first>=0&&iteration.start>first&&iteration.counted)polled++;
        iteration=null;return;
      }
      structured=false;return;
    }
    // Role classification identifies the secure element but is an answer, not an extra operation.
    if(countRead(api,name,id,secure)){if(iteration)iteration.counted=true;else if(first>=0&&i<first)baseline=true;}
    const op=JSON.stringify([api,name,id]);
    if(iteration)iteration.ops.push(op);else{chunks.push(op);previous=null;}
  });
  const marked=events.map(([api,name,id],i)=>({api,name,id,i})).filter(e=>['r','b','q'].includes(e.api)&&/TextMarker/.test(e.name));
  const [range,element]=marked;
  const markerOk=marker?marked.length===2&&range.api==='r'&&range.name==='AXSelectedTextMarkerRange'&&element.api==='q'&&element.name==='AXUIElementForTextMarker'&&
    range.id===element.id&&web.has(range.id)&&first>=0&&element.i<first&&
    events.slice(0,range.i).some(([api,name,id])=>['r','b'].includes(api)&&id===range.id&&name.split('+').includes('AXRole')):marked.length===0;
  return {pass:structured&&iteration===null&&secure.size===1&&forbiddenReads===0&&baseline&&polls>0&&polled===polls&&markerOk,secureAliases:secure.size,forbiddenReads,
    baseline,poll:polls>0&&polled===polls,marker:markerOk,shape:createHash('sha256').update(JSON.stringify(chunks)).digest('hex')};
}
export function auditPairs(rows,reps){
  let matched=0;
  for(let rep=0;rep<reps;rep++){
    const pick=kind=>rows.find(r=>r.rep===rep&&r.kind===kind&&r.valid&&r.pass);
    const a=pick('short');
    for(const kind of ['long','literal'])if(a&&pick(kind)?.shape===a.shape)matched++;
  }
  return {required:2*reps,matched,pass:matched===2*reps};
}
const quantiles=values=>{
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b),q=p=>sorted[Math.ceil(sorted.length*p)-1]??null;
  return {p50:q(.5),p95:q(.95)};
};
export function summarize(rows){
  const count=(a,key)=>{const o={};for(const x of a){const k=x[key]??'unknown';o[k]=(o[k]??0)+1;}return o;};
  const summary=a=>({planned:a.length,valid:a.filter(x=>x.valid).length,passed:a.filter(x=>x.pass).length,confirmed:a.filter(x=>x.valid&&x.outcome==='confirmed').length,
    bare:a.filter(x=>x.valid&&x.outcome==='bare').length,
    unconfirmed:a.filter(x=>x.valid&&x.outcome==='unconfirmed').length,reasons:count(a.filter(x=>x.valid&&x.outcome==='unconfirmed'),'reason'),
    knownLimits:a.filter(x=>x.valid&&x.knownLimit).length,lengthRejected:a.filter(x=>x.valid&&x.lengthRejected).length,
    noted:a.filter(x=>x.valid&&x.outcome==='confirmed'&&x.lengthConfirmed).length,
    domExact:a.filter(x=>x.valid&&x.domExact).length,wrongSuccesses:a.filter(x=>x.wrongSuccess).length,
    privacyViolations:a.filter(x=>x.privacy?.length).length,
    snapshotMs:quantiles(a.filter(x=>x.valid).map(x=>x.snapshotMs)),serviceMs:quantiles(a.filter(x=>x.valid).map(x=>x.serviceMs))});
  const scored=rows.filter(x=>!x.informational&&x.kind!=='rewrite'),limits=rows.filter(x=>x.kind==='rewrite'&&x.valid);
  return {heads:Object.fromEntries(['main','fix'].map(head=>[head,summary(rows.filter(x=>x.head===head&&primary.includes(x.kind)&&!x.label))])),
    cells:Object.fromEntries([...new Set(rows.map(r=>`${r.head}/${r.kind}`))].map(cell=>[cell,summary(rows.filter(r=>`${r.head}/${r.kind}`===cell))])),
    negative:summary(rows.filter(x=>negative.includes(x.kind))),invalid:count(rows.filter(x=>!x.valid),'invalid'),
    scored:summary(scored),wrongSuccesses:scored.filter(x=>x.wrongSuccess).length,knownLimit:{valid:limits.length,lengthConfirmed:limits.filter(x=>x.lengthConfirmed).length},
    privacyViolations:rows.filter(x=>x.privacy?.length).length};
}

// The projection that may leave a privacy-failed run: counts and timings only, rebuilt from closed codes (integers, finite
// numbers, a fixed vocabulary of reasons and stages), never from rows, strings the run produced or the audit's hashes.
const codes=new Set(['secure','noFocusedElement','roleUnreadable','notTextField','valueUnreadable','rangeUnreadable','fieldUnreadable','fieldChanged','becameSecure',
  'selectionChanged','concealedMismatch','valueMismatch','unchanged','possiblyTruncated','secureCountUnavailable','secureCountMismatch','secureRangeUnavailable',
  'secureCountUnreadable','secureRangeUnreadable','secureMismatch','lengthUnreadable','lengthMismatch','caretMismatch','selectionUnreadable','noLongerSecure','other','unknown']);
const stages=new Set(['launch','target-ready','cover-launch','presentation-probe','engine-start','prepare','cover','witness','seed','action','delivery','witness-end','observation','audit','control-not-realized','unknown']);
const whole=n=>Number.isSafeInteger(n)&&n>=0?n:null, ms=n=>Number.isFinite(n)?n:null;
const closed=(o,allowed)=>Object.fromEntries(Object.entries(o??{}).filter(([k,n])=>allowed.has(k)&&whole(n)!==null));
const codedGroup=g=>({planned:whole(g?.planned),valid:whole(g?.valid),passed:whole(g?.passed),confirmed:whole(g?.confirmed),bare:whole(g?.bare),unconfirmed:whole(g?.unconfirmed),
  reasons:closed(g?.reasons,codes),knownLimits:whole(g?.knownLimits),lengthRejected:whole(g?.lengthRejected),noted:whole(g?.noted),domExact:whole(g?.domExact),
  wrongSuccesses:whole(g?.wrongSuccesses),privacyViolations:whole(g?.privacyViolations),
  snapshotMs:{p50:ms(g?.snapshotMs?.p50),p95:ms(g?.snapshotMs?.p95)},serviceMs:{p50:ms(g?.serviceMs?.p50),p95:ms(g?.serviceMs?.p95)}});
export function coded(summary,auditGate=null){
  const cells=Object.fromEntries(Object.entries(summary.cells??{}).filter(([k])=>/^(?:main|fix)\/(?:short|long|selection|literal|unicode|drop|add|rewrite)$/.test(k)).map(([k,g])=>[k,codedGroup(g)]));
  return {heads:{main:codedGroup(summary.heads?.main),fix:codedGroup(summary.heads?.fix)},cells,negative:codedGroup(summary.negative),scored:codedGroup(summary.scored),
    invalid:closed(summary.invalid,stages),wrongSuccesses:whole(summary.wrongSuccesses),
    knownLimit:{valid:whole(summary.knownLimit?.valid),lengthConfirmed:whole(summary.knownLimit?.lengthConfirmed)},privacyViolations:whole(summary.privacyViolations),
    auditGate:auditGate?{required:whole(auditGate.required),matched:whole(auditGate.matched),pass:auditGate.pass===true}:null};
}
