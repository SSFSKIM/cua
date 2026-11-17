import test from 'node:test';
import assert from 'node:assert/strict';
import {largePagePrefix,largeMarkerEvidence,observeLargeMarker,writeLargePageTables} from './large-page.mjs';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
test('the public large-page fixture emits semantic controls before the editor without changing the normal fixture',()=>{
 assert.equal(largePagePrefix(0),'');
 assert.equal(largePagePrefix(2),'<div id="large-before-editor" role="group" aria-label="Filler controls"><button type="button" tabindex="-1" id="large-node-0">Filler 0</button><button type="button" tabindex="-1" id="large-node-1">Filler 1</button></div>');
 const html=largePagePrefix(1600)+'<input id="editor">';assert.equal((html.match(/<button /g)??[]).length,1600);assert.ok(html.indexOf('large-node-1599')<html.indexOf('<input id="editor">'));assert.equal(new Set([...html.matchAll(/id="(large-node-\d+)"/g)].map(m=>m[1])).size,1600);
 for(const n of [-1,1.5,6000,'1600'])assert.throws(()=>largePagePrefix(n));
});
test('large-page marker evidence must be for the owned Safari behind its cover, never an activating observation',()=>{
 const s={schema:'probe354.safariLargeMarker.v1',pid:42,frontmostPidBefore:7,frontmostPidAfter:7,frontmost:{changed:false,activationDetected:false},startedAt:110,endedAt:120,queries:[],textMarker:{attempted:true}};
 assert.equal(largeMarkerEvidence(s,{pid:42,coverPid:7}),s);
 for(const change of [{pid:43},{frontmostPidAfter:42},{frontmost:{changed:true}},{schema:'other'},{startedAt:null}])assert.throws(()=>largeMarkerEvidence({...s,...change},{pid:42,coverPid:7}));
});
test('the post-type marker observation records its actual delay and times out fatally before a late FIFO reply can be reused',async()=>{
 let now=100;const result=await observeLargeMarker({pid:42,coverPid:7,replyAt:95,now:()=>now,read:async()=>{now=112;return {schema:'probe354.safariLargeMarker.v1',pid:42,frontmostPidBefore:7,frontmostPidAfter:7,startedAt:101,endedAt:111,queries:[]}}});
 assert.deepEqual(result.transport,{requestedAt:100,receivedAt:112,roundTripMs:12,afterReplyMs:5});
 await assert.rejects(()=>observeLargeMarker({pid:42,coverPid:7,replyAt:95,read:()=>new Promise(()=>{}),timeoutMs:5}),e=>e.fatalDiagnostic===true);
});
test('large-page tables retain actual marker errors, size evidence and native walk data separately from rate files',t=>{
 const out=mkdtempSync(join(tmpdir(),'large-page-table-'));t.after(()=>rmSync(out,{recursive:true,force:true}));writeFileSync(join(out,'rates.tsv'),'unchanged');
 const row={id:'large-page/input/plain/1',part:'large-page',variant:'plain',rep:1,valid:true,correct:true,largePageNodes:1600,largeAXElements:1600,largeAXSizeVerified:true,walkTrace:{id:'large-page/input/plain/1',walks:[]},typeRPC:{raw:{error:{errorName:'typeUnconfirmed',meta:{typeReadback:{confirmed:false,reason:'noFocusedElement'}}}},durationMs:500},largeMarker:{startedAt:100,endedAt:110,transport:{afterReplyMs:2},largeGroup:{available:true,children:{count:1600,nonElements:0,cap:0,capped:true}},textMarker:{attempted:true,selectedRange:{axError:-25212,axErrorName:'noValue'}},queries:[{phase:'textMarker',path:'webArea.AXSelectedTextMarkerRange',attribute:'AXSelectedTextMarkerRange',axError:-25212,valueType:'none',startedAt:103,endedAt:104,durationMs:1}],elements:[]}};
 writeLargePageTables(out,[{part:'race',id:'not-large'},row]);const report=JSON.parse(readFileSync(join(out,'large-page-summary.json'),'utf8'));assert.equal(report.primaryEvidence,false);assert.equal(report.cases.length,1);assert.equal(report.cases[0].largeAXSizeVerified,true);assert.deepEqual(report.cases[0].nativeWalks,[]);assert.equal(report.cases[0].textMarker.selectedRange.axError,-25212);assert.equal(readFileSync(join(out,'rates.tsv'),'utf8'),'unchanged');
 const table=readFileSync(join(out,'large-page-markers.tsv'),'utf8');assert.match(table,/-25212/);assert.match(table,/AXSelectedTextMarkerRange/);
});
