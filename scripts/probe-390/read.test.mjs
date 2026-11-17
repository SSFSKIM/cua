import {test} from 'node:test';
import assert from 'node:assert/strict';
import {plan,judge,coverage,summarize} from './read.mjs';
import {CAP_LENGTH,CAP_SUFFIX,capValue,modeFor,transform} from './protocol.mjs';
const state={pageId:'abc',timeOrigin:1,trial:'x',value:'v',reactValue:'v',events:[]};
const MS=[0,50,250,1000],cps=(a=state)=>MS.map(ms=>({requestedMs:ms,after:{...a,events:[...a.events]}}));
// after mirrors the last (1000 ms) checkpoint, as in measure.mjs; fin() changes both so hand edits stay realistic.
const fin=(r,patch)=>{Object.assign(r.after,patch);Object.assign(r.checkpoints.at(-1).after,patch);};
const at=(r,ms,patch)=>Object.assign(r.checkpoints.find(c=>c.requestedMs===ms).after,patch);
const row=()=>({id:'x',browser:'cft',head:'fix',cell:'background',rep:0,valid:true,expected:'v',before:{...state,value:'',reactValue:''},after:{...state},checkpoints:cps(),samples:[{frontmostPid:2,order:{targetAboveCover:false}}],nativeBefore:{frontmostPid:2,order:{targetAboveCover:false}},coverPid:2,targetPid:1,call:{startedAt:0,endedAt:100,raw:{result:{meta:{unfocusedValue:{result:'confirmed',reads:2,ms:50}}}}}});
test('DOM and React both judge delivery; engine ok alone is a false ok',()=>{const r=row();assert.equal(judge(r).delivered,true);fin(r,{reactValue:''});assert.equal(judge(r).falseOk,true);assert.equal(judge(r).pass,false);});
test('a guard mismatch must be unconfirmed, not a successful transient AX read',()=>{const r=row();r.cell='guard';fin(r,{value:'V',reactValue:'V'});r.call.raw={error:{errorName:'valueUnconfirmed',meta:{unfocusedValue:{result:'mismatch',reads:180,ms:999}}}};assert.equal(judge(r).pass,true);r.call.raw={result:{meta:{unfocusedValue:{result:'confirmed',reads:1,ms:0}}}};assert.equal(judge(r).falseOk,true);assert.equal(judge(r).pass,false);});
test('a capped read of a long delivered value cannot confirm the write',()=>{const r=row();r.cell='long';r.expected='x'.repeat(10001);fin(r,{value:r.expected,reactValue:r.expected});r.call.raw={result:{meta:{unfocusedValue:{result:'confirmed',reads:1,ms:0}}}};assert.equal(judge(r).pass,false);r.call.raw={error:{errorName:'valueUnconfirmed',meta:{unfocusedValue:{result:'mismatch',reads:180,ms:999}}}};assert.equal(judge(r).pass,false);r.call.raw={error:{errorName:'valueUnconfirmed',meta:{unfocusedValue:{result:'possiblyTruncated',reads:180,ms:999}}}};assert.equal(judge(r).pass,true);});
test('secret delivery is not enough: concealed meta must report zero reads',()=>{const r=row();r.cell='secret';r.call.raw={error:{errorName:'valueUnconfirmed',meta:{unfocusedValue:{result:'concealed',reads:0,ms:0}}}};assert.equal(judge(r).pass,true);r.call.raw.error.meta.unfocusedValue.reads=1;assert.equal(judge(r).pass,false);});
test('ownership drift and unknown order cannot look valid; transient raising remains counted',()=>{const r=row();fin(r,{trial:'other'});assert.equal(judge(r).eligible,false);fin(r,{trial:'x'});r.samples.push({frontmostPid:1,order:{targetAboveCover:true}});assert.equal(judge(r).activation,true);assert.equal(judge(r).raised,true);assert.equal(judge(r).pass,false);r.samples[0].order={};assert.equal(judge(r).nativeKnown,false);});
test('full cell coverage requires each unique rep and both heads, not a matching aggregate count',()=>{const p=plan('cft',false);assert.equal(p.filter(x=>x.cell==='background'&&x.head==='fix').length,20);assert.equal(p.filter(x=>x.cell==='foreground'&&x.head==='main').length,5);const rs=p.map(x=>({...row(),...x,valid:false}));assert.equal(coverage(rs,'cft',false).ok,false);rs[1]=rs[0];assert.ok(coverage(rs,'cft',false).duplicates.length);assert.equal(summarize([row()])[0].confirmed,1);});

test('an ok write is a false ok when any early DOM or React checkpoint disagrees, though the final snapshot matches',()=>{
 for(const [ms,patch] of [[0,{value:''}],[50,{reactValue:''}],[250,{value:'other'}]]){const r=row();at(r,ms,patch);const j=judge(r);assert.equal(j.delivered,true,'final delivery stays its own metric');assert.equal(j.falseOk,true,String(ms));assert.equal(j.pass,false,String(ms));}
 assert.equal(judge(row()).falseOk,false);assert.equal(judge(row()).pass,true);
});
test('the checkpoint set must be exactly 0/50/250/1000, once each, bound to the owned page and trial',()=>{
 const bad=[r=>{r.checkpoints.pop();},r=>{r.checkpoints.push({...r.checkpoints[0]});},r=>{r.checkpoints.push({requestedMs:2000,after:{...state}});},r=>{r.checkpoints[1].requestedMs=0;},r=>{delete r.checkpoints;},r=>{at(r,0,{pageId:'other'});},r=>{at(r,50,{timeOrigin:2});},r=>{at(r,250,{trial:'other'});}];
 bad.forEach((f,i)=>{const r=row();f(r);const j=judge(r);assert.equal(j.eligible,false,String(i));assert.equal(j.pass,false,String(i));});
});
test('an unconfirmed secret may arrive after the first sample without becoming a false ok',()=>{
 const r=row();r.cell='secret';r.call.raw={error:{errorName:'valueUnconfirmed',meta:{unfocusedValue:{result:'concealed',reads:0,ms:0}}}};at(r,0,{value:'',reactValue:''});at(r,50,{value:'',reactValue:''});
 const j=judge(r);assert.equal(j.falseOk,false);assert.equal(j.delivered,true);assert.equal(j.pass,true);
 fin(r,{value:'',reactValue:''});assert.equal(judge(r).pass,false);
});
test('refused baseline cells stay empty at every checkpoint',()=>{
 const r=row();r.head='main';r.call.raw={error:{errorName:'backgroundClickRefused',meta:{}}};for(const c of r.checkpoints)Object.assign(c.after,{value:'',reactValue:''});Object.assign(r.after,{value:'',reactValue:''});
 assert.equal(judge(r).pass,true);at(r,250,{value:'v',reactValue:'v'});assert.equal(judge(r).pass,false);
});
const cap=()=>{const r=row();r.cell='cap-suffix';r.expected=capValue('cap-a1b2c3d4-0');const landed=r.expected+CAP_SUFFIX;for(const c of r.checkpoints)Object.assign(c.after,{value:landed,reactValue:landed});Object.assign(r.after,{value:landed,reactValue:landed});r.call.raw={error:{errorName:'valueUnconfirmed',meta:{unfocusedValue:{result:'possiblyTruncated',reads:1,ms:5}}}};return r;};
test('cap-suffix: exact-length request, synchronous suffix, never ok, only possiblyTruncated with reads passes',()=>{
 assert.equal(capValue('p').length,CAP_LENGTH);assert.equal(CAP_LENGTH,10000);assert.equal(modeFor('cap-suffix'),'suffix');assert.equal(modeFor('guard'),'uppercase');assert.equal(modeFor('long'),'plain');
 assert.equal(transform('suffix','ab'),'ab'+CAP_SUFFIX);assert.equal(transform('uppercase','ab'),'AB');assert.equal(transform('plain','ab'),'ab');
 const r=cap();assert.equal(judge(r).pass,true);assert.equal(judge(r).falseOk,false);
 for(const result of ['mismatch','unavailable','confirmed','absent']){const q=cap();q.call.raw.error.meta.unfocusedValue=result==='absent'?undefined:{result,reads:1,ms:5};assert.equal(judge(q).pass,false,result);assert.equal(judge(q).falseOk,false,result);}
 const noReads=cap();noReads.call.raw.error.meta.unfocusedValue.reads=0;assert.equal(judge(noReads).pass,false);
 const noMeta=cap();delete noMeta.call.raw.error.meta;assert.equal(judge(noMeta).pass,false);
 const ok=cap();ok.call.raw={result:{meta:{unfocusedValue:{result:'confirmed',reads:1,ms:5}}}};assert.equal(judge(ok).falseOk,true);assert.equal(judge(ok).pass,false);
 const okMeta=cap();okMeta.call.raw={result:{meta:{}}};assert.equal(judge(okMeta).pass,false);
});
test('cap-suffix: final DOM and React must be exactly the request plus the suffix, at the exact length',()=>{
 const a=cap();a.checkpoints.at(-1).after.reactValue=a.after.reactValue=a.expected;assert.equal(judge(a).pass,false);
 const b=cap();b.expected=b.expected.slice(1);assert.equal(judge(b).pass,false);
 const c=cap();c.head='main';c.call.raw={error:{errorName:'backgroundClickRefused',meta:{}}};for(const x of [c.after,...c.checkpoints.map(k=>k.after)])Object.assign(x,{value:'',reactValue:''});assert.equal(judge(c).pass,true);
});
test('plan adds cap-suffix to Chromium only: 290 full and 40 smoke actions',()=>{
 const n=smoke=>['cft','electron','electron-parity','safari'].reduce((t,b)=>t+plan(b,smoke).length,0);assert.equal(n(false),290);assert.equal(n(true),40);
 assert.equal(plan('cft',false).filter(x=>x.cell==='cap-suffix'&&x.head==='fix').length,5);assert.equal(plan('safari',false).some(x=>x.cell==='cap-suffix'),false);
});
test('a setup-invalid row with no RPC and no native evidence is reported as no answer, not ok or activation',()=>{
 const r={id:'x',browser:'electron',head:'fix',cell:'long',rep:4,valid:false,targetPid:1,coverPid:2,startedAt:0,samples:[],problem:'Error: frontmost not verified'};
 const j=judge(r);assert.equal(j.eligible,false);assert.equal(j.pass,false);assert.equal(j.answered,false);assert.equal(j.ok,false);assert.equal(j.nativeKnown,false);assert.equal(j.activation,false);assert.equal(j.raised,false);assert.equal(j.falseOk,false);
 const s=summarize([r])[0];assert.deepEqual(s.answers,{noAnswer:1});assert.equal(s.activation,0);assert.equal(s.raised,0);assert.equal(s.nativeUnknown,1);assert.equal(s.valid,0);assert.equal(s.pass,0);
 const mixed=summarize([r,{...row(),browser:'electron',cell:'long',head:'fix',id:'y'}])[0];assert.deepEqual(mixed.answers,{noAnswer:1,ok:1});
});
test('an observed activation is still counted when other native samples are absent',()=>{
 const r=row();r.samples.push({frontmostPid:1,order:{targetAboveCover:false}});assert.equal(judge(r).activation,true);
});
