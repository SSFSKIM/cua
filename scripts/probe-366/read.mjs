// Offline readers. Only fixture-owned evidence; never imports a GUI/engine launcher.
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

export function plan({browser,smoke=false}) {
 if(!['electron','cft'].includes(browser))throw Error('unknown browser');
 const cells=[];
 for(let rep=0;rep<(smoke?1:20);rep++) {
  const block=[];
  for(const scene of ['modal','untrapped'])for(const foreground of [false,true])for(const operation of ['press','value']) {
   for(const variant of ['main','bare','no-focus','bare-no-focus','no-click']) {
    if(['no-focus','bare-no-focus'].includes(variant)&&operation!=='value')continue;
    if(variant==='no-click'&&foreground)continue;
    block.push({phase:'rate',browser,scene,foreground,operation,variant,rep});
   }
  }
  // Rotate paired treatment order deterministically, to avoid always running main on a colder app.
  const n=rep%block.length;cells.push(...block.slice(n),...block.slice(0,n));
 }
 for(let rep=0;rep<(smoke?1:3);rep++)for(const scene of ['modal','untrapped'])for(const foreground of [false,true]) {
  for(const operation of ['raw-press','raw-value','raw-focus','raw-main','raw-frontmost','raw-caret','hold-only','warm-press'])
   cells.push({phase:'diagnostic',browser,scene,foreground,operation,variant:'main',rep});
 }
 return cells.map(c=>({...c,id:[c.phase,c.browser,c.scene,c.foreground?'front':'behind',c.operation,c.variant,c.rep].join('/')}));
}
const q=(xs,p)=>{const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?a[Math.min(a.length-1,Math.ceil(p*a.length)-1)]:null};
const latency=xs=>({p50:q(xs,.5),p95:q(xs,.95),max:q(xs,1)});
export function judge(r) {
 const b=r.before,a=r.after;
 const eligible=r.valid===true&&!!b&&!!a&&b.pageId===a.pageId&&b.timeOrigin===a.timeOrigin&&b.trial===a.trial&&b.open===true&&b.presses===0&&b.value===''&&b.reactValue===''&&a.visibility==='visible';
 const answeredOK=eligible&&!!r.call?.raw?.result&&!r.call.raw.error;
 const closed=eligible&&a.open!==true;
 const delivered=eligible&&!closed&&(r.operation==='press'||r.operation==='raw-press'||r.operation==='warm-press'?a.presses===1:r.operation==='value'||r.operation==='raw-value'?a.value===r.expected&&a.reactValue===r.expected:false);
 return {eligible,answeredOK,delivered,falseSuccess:answeredOK&&!delivered,closed};
}
export function confirmation(r,budget=250,policy='dialog-survives') {
 const start=r.call?.endedAt;
 const samples=(r.samples??[]).filter(s=>Number.isFinite(s.at)&&s.at>=start).sort((a,b)=>a.at-b.at);
 let last=null;
 for(const [index,s] of samples.entries()) {
  // A read already in flight can overrun the soft bound; do not admit a later scheduled read.
  if(index>0&&(s.startedAt??s.at)>start+budget)break;
  last=s;
  const ax=s.ax;
  if(!ax||typeof ax.dialog!=='boolean')continue;
  const effect=r.operation==='press'?ax.marker===1:ax.value===r.expected;
  // This is a sampled, counterfactual wrapper cost, not a new product success contract.
  if(!ax.dialog || policy==='dialog-survives' || effect) return {policy,confirmed:ax.dialog&&(policy==='dialog-survives'||effect),decisionAt:s.at,addedMs:s.at-start,deliveryProof:policy==='effect'&&ax.dialog&&effect};
  if(s.at>=start+budget)break;
 }
 const decisionAt=Number.isFinite(start)?Math.max(start+budget,last?.at??start):null;
 return {policy,confirmed:false,decisionAt,addedMs:decisionAt===null?null:decisionAt-start,deliveryProof:false};
}
export function timeline(r) {
 const start=r.call?.startedAt??0;
 return [{at:start,kind:'call.begin'},...(r.trace??[]),...(r.after?.events??[]),{at:r.call?.endedAt,kind:'call.end'}]
  .filter(e=>Number.isFinite(e.at)&&e.at>=start).sort((a,b)=>a.at-b.at).map(e=>({...e,offsetMs:e.at-start}));
}
export function summarize(rows) {
 const groups=new Map();
 for(const r of rows.filter(r=>r.phase==='rate')) {
  const key=[r.browser,r.scene,r.foreground?'front':'behind',r.operation,r.variant].join('/');
  if(!groups.has(key))groups.set(key,{cell:key,attempted:0,valid:0,invalid:0,invalidByStage:{},answeredOK:0,delivered:0,falseSuccess:0,closed:0,axUnknownRows:0,raises:0,times:[],confirmations:{}});
  const g=groups.get(key),j=judge(r);g.attempted++;
  if(!j.eligible){g.invalid++;const stage=r.failureStage??'state-validation';g.invalidByStage[stage]=(g.invalidByStage[stage]??0)+1;continue}g.valid++;
  for(const k of ['answeredOK','delivered','falseSuccess','closed'])if(j[k])g[k]++;
  // An AX read that could not establish dialog presence is reported, never folded into disappearance.
  if(r.samples?.some(x=>x.ax&&x.ax.dialog===null))g.axUnknownRows++;
  if(!r.foreground&&(r.frontAfter?.frontmostPid===r.targetPid||r.trace?.some(e=>e.frontmostPid===r.targetPid)||r.samples?.some(s=>s.frontmostPid===r.targetPid||s.order?.targetAboveCover===true)))g.raises++;
  if(Number.isFinite(r.call?.endedAt-r.call?.startedAt))g.times.push(r.call.endedAt-r.call.startedAt);
  for(const policy of ['dialog-survives','effect'])for(const ms of [0,50,250,1000]) {
   const key=policy+'/'+ms,c=confirmation(r,ms,policy),v=g.confirmations[key]??={confirmed:0,falsePositive:0,falseNegative:0,added:[]};
   if(c.confirmed)v.confirmed++;
   if(c.confirmed&&!j.delivered)v.falsePositive++;
   if(!c.confirmed&&j.delivered)v.falseNegative++;
   if(c.addedMs!==null)v.added.push(c.addedMs);
  }
 }
 return [...groups.values()].map(({times,confirmations,...g})=>({...g,callMs:latency(times),confirmations:Object.fromEntries(Object.entries(confirmations).map(([k,{added,...v}])=>[k,{...v,addedMs:latency(added)}]))}));
}
export function ab(rows) {
 const rates=rows.filter(r=>r.phase==='rate'),result=[];
 const key=r=>[r.browser,r.scene,r.foreground?'front':'behind',r.operation].join('/');
 const groups=new Map();for(const r of rates)if(r.variant!=='main'){
  const k=key(r)+'/'+r.variant;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);
 }
 for(const [cell,candidates] of groups){
  const g={cell,paired:0,incomplete:0,mainDelivered:0,candidateDelivered:0,mainFalseSuccess:0,candidateFalseSuccess:0,mainClosed:0,candidateClosed:0},deltas=[];
  for(const candidate of candidates){
   const main=rates.find(r=>r.variant==='main'&&key(r)===key(candidate)&&r.rep===candidate.rep),m=main&&judge(main),c=judge(candidate);
   if(!m?.eligible||!c.eligible){g.incomplete++;continue;}g.paired++;
   for(const [label,j] of [['main',m],['candidate',c]])for(const prop of ['delivered','falseSuccess','closed'])if(j[prop])g[label+prop[0].toUpperCase()+prop.slice(1)]++;
   deltas.push((candidate.call.endedAt-candidate.call.startedAt)-(main.call.endedAt-main.call.startedAt));
  }
  result.push({...g,deltaCallMs:latency(deltas)});
 }
 return result;
}
function files(path) {
 if(!path.endsWith('.jsonl'))return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(path,e.name)):e.name==='rows.jsonl'?[join(path,e.name)]:[]);
 return [path];
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 const [mode,...paths]=process.argv.slice(2);
 if(mode==='plan'){console.log(JSON.stringify(plan({browser:paths[0]??'electron',smoke:paths[1]==='smoke'}),null,2));}
 else {
  if(!paths.length||!['summary','ab','timeline','coverage'].includes(mode))throw Error('read.mjs plan [electron|cft] [smoke] | summary|ab|timeline|coverage <artifact-directory-or-rows.jsonl>...');
  const rows=paths.flatMap(files).flatMap(p=>readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)));
  if(mode==='summary')console.log(JSON.stringify(summarize(rows),null,2));
  if(mode==='ab')console.log(JSON.stringify(ab(rows),null,2));
  if(mode==='timeline')for(const r of rows)console.log(JSON.stringify({id:r.id,valid:r.valid,problem:r.problem,call:r.call,readbacks:r.samples,timeline:timeline(r)}));
  if(mode==='coverage') {
   const keys=new Set(rows.map(r=>r.id)),duplicates=rows.filter((r,i)=>rows.findIndex(x=>x.id===r.id)!==i).map(r=>r.id);
   const smoke=rows.every(r=>r.smoke===true),browsers=[...new Set(rows.map(r=>r.browser))];
   const expected=browsers.flatMap(browser=>plan({browser,smoke})).map(c=>c.id),missing=expected.filter(id=>!keys.has(id));
   const report={smoke,rows:rows.length,expected:expected.length,duplicates,missing,invalid:rows.filter(r=>!judge(r).eligible).map(r=>({id:r.id,problem:r.problem}))};
   console.log(JSON.stringify(report,null,2));if(missing.length||duplicates.length||report.invalid.length)process.exitCode=1;
  }
 }
}
