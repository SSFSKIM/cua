import {createHash} from 'node:crypto';

export const primary=['short','long','selection','literal','unicode'];
export const negative=['drop','add'];
export const markerKey='confirmation';
export const lengthSuccess=r=>r?.confirmed===true&&r.secure===true&&r[markerKey]==='length';
export function plan(smoke,{selection=true,audit=false}={}){
  const rows=[],rounds=smoke?1:5;
  if(audit){
    for(let rep=0;rep<rounds;rep++)for(const kind of ['short','long','literal'])rows.push({head:'fix',kind,rep});
    return rows;
  }
  for(let rep=0;rep<rounds;rep++){
    primary.slice(0,-1).forEach((kind,i)=>{
      if(kind==='selection'&&!selection)return;
      for(const head of (rep+i)%2===0?['main','fix']:['fix','main'])rows.push({head,kind,rep});
    });
    for(const kind of negative)for(let i=0;i<(smoke?1:2);i++)rows.push({head:'fix',kind,rep:2*rep+i});
    rows.push({head:'fix',kind:'rewrite',rep});
    for(let i=0;i<(smoke?1:4);i++)for(const head of (rep+i)%2===0?['main','fix']:['fix','main'])rows.push({head,kind:'unicode',rep:(smoke?1:4)*rep+i});
  }
  return rows;
}

export function score({head,kind,lane,raw,forwarded,sky,fixture,domExact,controlExact}){
  const outcome=raw?.confirmed===true||forwarded?.confirmed===true?'confirmed':raw?.confirmed===false&&forwarded?.confirmed===false?'unconfirmed':'missing';
  const lengthConfirmed=lengthSuccess(raw)&&lengthSuccess(forwarded)&&sky==='ok';
  const isControl=negative.includes(kind)||kind==='rewrite';
  const valid=fixture&&(!isControl||controlExact===true);
  const unconfirmed=outcome==='unconfirmed'&&sky==='typeUnconfirmed'&&typeof raw.reason==='string'&&raw.reason===forwarded.reason;
  const knownLimit=unconfirmed&&(lane==='firefox'&&raw.reason==='notTextField'||head==='fix'&&lane==='appkit'&&kind==='selection'&&['lengthUnreadable','selectionUnreadable'].includes(raw.reason));
  return {valid, outcome, lengthConfirmed, knownLimit, informational:kind==='rewrite', wrongSuccess:valid&&outcome==='confirmed'&&domExact===false,
    pass:valid&&(isControl?unconfirmed&&domExact===false:domExact===true&&(knownLimit||(head==='main'?unconfirmed&&raw.reason==='secure':lengthConfirmed))),
    domExact:domExact===true};
}

const forbidden=/^(?:(?:cua\/)?(?:entered|checkpoints)|(?:ax)?(?:value|valueDescription|numberOfCharacters|selectedText|selectedTextRange)|selection(?:Start|End|Length)?|start|end|before|after|actual|expected|caret|range|location|offset|.*excerpt|.*(?:Length|Count)|length|count|characters|reads|pollMs|settleReads)$/i;
const textEvidence=/[•●◦]|\*{3,}|\b\d+\s*(?:characters?|chars?|code units?|bytes?)\b|\b(?:AXNumberOfCharacters|AXSelectedTextRange|length|count|numberOfCharacters|selectedText(?:Range)?|selection|range|offset|characters|(?:cua\/)?entered)\b["']?\s*(?:is\b|of\b|[=:])?\s*[[(]?\s*\d/i;
const readbackKeys=new Set(['confirmed','reason','snapshotMs','concealed','secure','keysUnconfirmed','stoppedBeforeKey',markerKey]);
export function inspect(input,values,{literal=false,stringsOnly=false}={}){
  const findings=new Set(),seen=new WeakSet();
  const needles=values.flatMap(v=>[v,Buffer.from(v).toString('hex'),Buffer.from(v).toString('base64').replace(/=+$/,''),...Array.from({length:Math.max(0,v.length-7)},(_,i)=>v.slice(i,i+8))]);
  function string(s){
    if(needles.some(n=>s.toLowerCase().includes(n.toLowerCase())))findings.add('synthetic-value');
    if(textEvidence.test(s))findings.add('private-text');
  }
  function walk(v,path=[]){
    if(typeof v==='string'){string(v);return;}
    if(!v||typeof v!=='object'||seen.has(v))return;
    seen.add(v);
    if(Array.isArray(v)&&v.length>=8&&v.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=65535))string(String.fromCharCode(...v.slice(0,64000)));
    for(const k of Object.getOwnPropertyNames(v)){
      if(k==='stack'&&v instanceof Error)continue;
      const x=v[k],at=path.join('.'),parent=path.at(-1),inReadback=parent==='typeReadback'||parent==='cua/typeReadback';
      string(k);
      const documentedBaseline=literal&&((k==='entered'||k==='cua/entered')&&Number.isSafeInteger(x)&&x>=0&&x<=values[0]?.length&&['result.meta','error.meta','meta',''].includes(at)
        ||inReadback&&['pollMs','reads'].includes(k)&&x===0&&['result.meta.typeReadback','error.meta.typeReadback','meta.typeReadback','cua/typeReadback'].includes(at));
      if(documentedBaseline)continue;
      if(!stringsOnly&&x!==null&&x!==undefined&&forbidden.test(k))findings.add('private-key');
      if(!stringsOnly&&inReadback&&(!readbackKeys.has(k)||k===markerKey&&x!=='length'||['secure','concealed','stoppedBeforeKey','keysUnconfirmed'].includes(k)&&typeof x!=='boolean'||k==='confirmed'&&typeof x!=='boolean'||k==='snapshotMs'&&!Number.isFinite(x)||k==='reason'&&(typeof x!=='string'||!/^[a-z][A-Za-z]{2,40}$/.test(x))))findings.add('readback-shape');
      walk(x,[...path,k]);
    }
  }
  walk(input);
  return [...findings].sort();
}

const forbiddenAX=new Set(['AXValue','AXValueDescription','AXSelectedText']);
// Trace entries are attribute names, first-seen element aliases and a closed secure classification,
// never AX data. An explicitly bounded polling region alone is eligible for normalization.
export function auditSchedule(events){
  const secure=new Set(events.filter(e=>e[3]==='secure').map(e=>e[2]));
  const forbiddenReads=events.filter(([api,name,element])=>secure.has(element)&&(api==='q'||(['r','b'].includes(api)&&name.split('+').some(n=>forbiddenAX.has(n))))).length;
  let chunks=[],span=null,structured=true;
  for(const [api,name,id] of events){
    if(api==='p'){
      if(name==='begin'&&span===null){span=[];continue;}
      if(name==='end'&&span!==null){
        const period=span.findIndex((_,i)=>i>0&&span.length%i===0&&span.every((x,j)=>x===span[j%i]));
        chunks.push('poll',...(period>0?span.slice(0,period):span),'end');span=null;continue;
      }
      structured=false;continue;
    }
    // Role classification identifies the secure element but is an answer, not an extra operation.
    (span??chunks).push(JSON.stringify([api,name,id]));
  }
  return {pass:structured&&span===null&&secure.size===1&&forbiddenReads===0,secureAliases:secure.size,forbiddenReads,
    shape:createHash('sha256').update(JSON.stringify(chunks)).digest('hex')};
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
    unconfirmed:a.filter(x=>x.valid&&x.outcome==='unconfirmed').length,reasons:count(a.filter(x=>x.valid&&x.outcome==='unconfirmed'),'reason'),
    knownLimits:a.filter(x=>x.valid&&x.knownLimit).length,domExact:a.filter(x=>x.valid&&x.domExact).length,wrongSuccesses:a.filter(x=>x.valid&&x.wrongSuccess).length,
    privacyViolations:a.filter(x=>x.privacy?.length).length,
    snapshotMs:quantiles(a.filter(x=>x.valid).map(x=>x.snapshotMs)),serviceMs:quantiles(a.filter(x=>x.valid).map(x=>x.serviceMs))});
  const scored=rows.filter(x=>!x.informational&&x.kind!=='rewrite'),limits=rows.filter(x=>x.kind==='rewrite'&&x.valid);
  return {heads:Object.fromEntries(['main','fix'].map(head=>[head,summary(rows.filter(x=>x.head===head&&primary.includes(x.kind)))])),
    cells:Object.fromEntries([...new Set(rows.map(r=>`${r.head}/${r.kind}`))].map(cell=>[cell,summary(rows.filter(r=>`${r.head}/${r.kind}`===cell))])),
    negative:summary(rows.filter(x=>negative.includes(x.kind))),invalid:count(rows.filter(x=>!x.valid),'invalid'),
    scored:summary(scored),wrongSuccesses:scored.filter(x=>x.wrongSuccess).length,knownLimit:{valid:limits.length,lengthConfirmed:limits.filter(x=>x.lengthConfirmed).length},
    privacyViolations:rows.filter(x=>x.privacy?.length).length};
}
