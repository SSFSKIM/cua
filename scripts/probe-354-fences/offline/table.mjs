// Offline: per-cell tables from downloaded fence-spike rows. node table.mjs <rows.jsonl>... (streams; reads no traces back out)
// Intent columns score the whole key+text sequence, not whether the reader's actual equalled its own expected value.
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {quantiles} from '../classify.mjs';
const groups=new Map(),add=(k,r)=>{if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)};
for(const path of process.argv.slice(2))for await(const line of createInterface({input:createReadStream(path)})){
 if(!line.trim())continue;const r=JSON.parse(line);if(r.recordKind!=='cell')continue;
 const rb=r.typeRPC?.readback,f=r.keyRPC?.fence,a=r.analysis;
 add([r.part,r.browser,r.editor,r.scene,r.mode,r.length].join('\t'),{valid:r.valid,setup:r.setupFailure,correct:r.correct,late:a?.lateEffect,effectBeforeText:a?.effectBeforeText,
  markerBeforeEffect:a?.markerBeforeEffect,effectAtMarker:a?.effectAtMarker,fenceConfirmed:r.fenceConfirmed,fenceMs:r.fenceMs,prePost:f?.prePostCount,arrivals:f?.arrivalCount,ackSource:f?.ackSource,
  rb:rb?.active?{confirmed:rb.confirmed,reason:rb.reason,ms:rb.readbackMs,snap:rb.snapshotMs,reads:rb.reads,role:rb.role}:null,verdict:r.verdict,gap:r.keyToTypeGapMs,typeMs:r.typeRPC?.durationMs,
  keyMs:r.keyRPC?.durationMs,privacy:!!r.privacyViolation,partial0:r.partialAtFirstSample,firstCorrect:r.firstCorrectSampleDelay});
}
const count=(a,f)=>a.filter(f).length,q=(a,f)=>{const s=quantiles(a.map(f));return s.n?`${s.p50}/${s.p95}/${s.max}`:'-'};
console.log(['part','browser','editor','scene','mode','len','n','valid','wrong','late','effect<text','marker<effect','effect@marker','fenceOK','fenceMs p50/p95/max','falseAck','rbOK','rbConfirmedWrongIntent','rbUnconfirmedRightIntent','rbUnconfirmedWrongIntent','rbMs p50/p95/max','snapMs p50/p95/max','rbReasons','keyRpcMs p50/p95/max','typeRpcMs p50/p95/max','partialAt0','privacy'].join('\t'));
for(const [k,rs] of [...groups].sort()){
 const v=rs.filter(r=>r.valid),mode=k.split('\t')[4],reasons={};for(const r of v)if(r.rb&&!r.rb.confirmed){const why=r.rb.reason??'?';reasons[why]=(reasons[why]??0)+1}
 console.log([k,rs.length,v.length,count(v,r=>r.correct===false),count(v,r=>r.late===true),count(v,r=>r.effectBeforeText===true),count(v,r=>r.markerBeforeEffect===true),count(v,r=>r.effectAtMarker===true),
  count(v,r=>r.fenceConfirmed===true),q(v,r=>r.fenceMs),mode==='ax-control'?count(v,r=>r.fenceConfirmed===true):'-',count(v,r=>r.rb?.confirmed===true),count(v,r=>r.verdict?.falseConfirm),count(v,r=>r.verdict?.falseUnconfirmed),
  count(v,r=>r.verdict?.detectedLoss),q(v,r=>r.rb?.ms),q(v,r=>r.rb?.snap),JSON.stringify(reasons),q(v,r=>r.keyMs),q(v,r=>r.typeMs),count(v,r=>r.partial0===true),count(rs,r=>r.privacy)].join('\t'));
}
