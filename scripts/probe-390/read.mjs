import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {CAP_LENGTH,CAP_SUFFIX} from './protocol.mjs';
const CHECKPOINTS=[0,50,250,1000];
export function plan(browser,smoke){
 if(!['cft','electron','electron-parity','safari'].includes(browser))throw Error('unknown browser');
 const specs=browser==='safari'?{background:5,foreground:5}:{background:20,guard:5,long:5,'cap-suffix':5,secret:5,foreground:5},out=[];
 for(let rep=0;rep<(smoke?1:20);rep++)for(const [cell,n] of Object.entries(specs))if(rep<n)for(const head of rep%2?['fix','main']:['main','fix'])out.push({browser,head,cell,rep,id:[browser,cell,head,rep].join('/')});
 return out;
}
export function judge(r){
 const b=r.before,a=r.after,raw=r.call?.raw,meta=raw?.result?.meta??raw?.error?.meta,u=meta?.unfocusedValue;
 // Exactly the planned checkpoints, once each, each bound to the same page, time origin and trial as the row.
 const cps=Array.isArray(r.checkpoints)?r.checkpoints:[],bound=c=>!!c?.after&&!!b&&c.after.pageId===b.pageId&&c.after.timeOrigin===b.timeOrigin&&c.after.trial===r.id;
 const owned=cps.length===CHECKPOINTS.length&&CHECKPOINTS.every(ms=>cps.filter(c=>c?.requestedMs===ms).length===1)&&cps.every(bound);
 const eligible=r.valid===true&&!!b&&!!a&&b.pageId===a.pageId&&b.timeOrigin===a.timeOrigin&&b.trial===r.id&&a.trial===r.id&&Array.isArray(r.samples)&&r.samples.length>0&&!!(raw?.result||raw?.error)&&owned;
 const ok=!!raw?.result&&!raw?.error,error=raw?.error?.errorName??null,delivered=eligible&&a.value===r.expected&&a.reactValue===r.expected;
 const exactAt=c=>c.after.value===r.expected&&c.after.reactValue===r.expected,settled=eligible&&cps.every(exactAt),emptyAt=eligible&&cps.every(c=>c.after.value===''&&c.after.reactValue==='');
 const bg=r.cell!=='foreground',native=[r.nativeBefore,...(r.samples??[])],want=bg?r.coverPid:r.targetPid;
 const nativeKnown=native.length>1&&native.every(s=>Number.isInteger(s?.frontmostPid)&&typeof s?.order?.targetAboveCover==='boolean');
 const activation=native.some(s=>s?.frontmostPid!==want),raised=bg&&native.some(s=>s?.order?.targetAboveCover===true);
 const events=eligible?a.events.slice(b.events.length):[],counts={};for(const e of events)counts[e.type]=(counts[e.type]??0)+1;
 const pointer=events.some(e=>/^(pointer|mouse|click)/.test(e.type)),key=events.some(e=>/^key/.test(e.type));
 // An ok reply promises the requested value is in the page at every sample, not only the last; delivery stays its own metric.
 const falseOk=eligible&&ok&&!(delivered&&settled);
 let expectedAnswer=false;
 if(r.head==='main'&&bg&&r.browser!=='safari')expectedAnswer=error==='backgroundClickRefused'&&emptyAt;
 else if(r.cell==='guard')expectedAnswer=error==='valueUnconfirmed'&&u?.result==='mismatch'&&u.reads>0&&a?.value===r.expected.toUpperCase()&&a?.reactValue===r.expected.toUpperCase();
 else if(r.cell==='long')expectedAnswer=error==='valueUnconfirmed'&&u?.result==='possiblyTruncated'&&u.reads>0&&delivered;
 else if(r.cell==='cap-suffix'){const landed=eligible&&r.expected?.length===CAP_LENGTH&&a.value===r.expected+CAP_SUFFIX&&a.reactValue===r.expected+CAP_SUFFIX;expectedAnswer=error==='valueUnconfirmed'&&u?.result==='possiblyTruncated'&&u.reads>0&&landed;}
 else if(r.cell==='secret')expectedAnswer=error==='valueUnconfirmed'&&u?.result==='concealed'&&u.reads===0&&delivered;
 else expectedAnswer=ok&&delivered&&settled&&(!(bg&&r.browser!=='safari')||(u?.result==='confirmed'&&u.reads>0));
 // Main can post its old inert pointer. Only the new Chromium background path must be pointer/key free.
 const newPath=r.head==='fix'&&bg&&r.browser!=='safari';
 return {eligible,ok,error,delivered,falseOk,expectedAnswer,nativeKnown,activation,raised,pointer,key,events:counts,unfocusedValue:u??null,rpcMs:r.call?.endedAt-r.call?.startedAt,
  pass:eligible&&expectedAnswer&&nativeKnown&&!activation&&!raised&&(!newPath||(!pointer&&!key))};
}
const stats=xs=>{const a=xs.filter(Number.isFinite).sort((a,b)=>a-b),q=p=>a.length?a[Math.min(a.length-1,Math.ceil(p*a.length)-1)]:null;return {p50:q(.5),p95:q(.95),max:q(1)};};
export function summarize(rows){
 const groups=new Map();for(const r of rows){const k=[r.browser,r.cell,r.head].join('/');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
 return [...groups.entries()].map(([cell,rs])=>{const js=rs.map(judge),count=f=>js.filter(f).length,events={},answers={},results={};for(const j of js){answers[j.error??'ok']=(answers[j.error??'ok']??0)+1;const k=j.unfocusedValue?.result??'absent';results[k]=(results[k]??0)+1;for(const [k,v] of Object.entries(j.events))events[k]=(events[k]??0)+v;}return {cell,n:rs.length,valid:count(j=>j.eligible),pass:count(j=>j.pass),delivered:count(j=>j.delivered),falseOk:count(j=>j.falseOk),answers,unfocusedResults:results,confirmed:count(j=>j.unfocusedValue?.result==='confirmed'),reads:stats(js.map(j=>j.unfocusedValue?.reads)),readbackMs:stats(js.map(j=>j.unfocusedValue?.ms)),rpcMs:stats(js.map(j=>j.rpcMs)),activation:count(j=>j.activation),raised:count(j=>j.raised),nativeUnknown:count(j=>!j.nativeKnown),pointerRows:count(j=>j.pointer),keyRows:count(j=>j.key),events};});
}
export function coverage(rows,browser,smoke){const expected=plan(browser,smoke).map(r=>r.id),seen=new Set(),duplicates=[];for(const r of rows){if(seen.has(r.id))duplicates.push(r.id);seen.add(r.id);}const missing=expected.filter(id=>!seen.has(id)),extra=[...seen].filter(id=>!expected.includes(id)),failed=rows.filter(r=>!judge(r).pass).map(r=>({id:r.id,problem:r.problem??null,judge:judge(r)}));return {ok:!missing.length&&!extra.length&&!duplicates.length&&!failed.length,expected:expected.length,actual:rows.length,missing,extra,duplicates,failed};}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const out=resolve(process.argv[2]),config=JSON.parse(readFileSync(join(out,'config.json'))),rows=readFileSync(join(out,'rows.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);const summary=summarize(rows),c=coverage(rows,config.browser,config.smoke);writeFileSync(join(out,'summary.json'),JSON.stringify(summary,null,2));writeFileSync(join(out,'coverage.json'),JSON.stringify(c,null,2));console.log(JSON.stringify({summary,coverage:c},null,2));if(!c.ok)process.exitCode=1;}
