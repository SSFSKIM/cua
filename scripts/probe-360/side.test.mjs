import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';import {once} from 'node:events';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';

// The side helper must keep its main run loop turning while stdin is idle: NSWorkspace's foreground state is cached
// until the main run loop turns (NSRunningApplication.h), and the passive watcher reads it from another thread.
// The real helper is hosted-only and drives the GUI, so this compiles the helper's own `serve` and `logic` regions (between their
// begin/end markers) with a Foundation-only harness. No AppKit, AX or app is touched.
const here=dirname(fileURLToPath(import.meta.url));
const swiftc=spawnSync('swiftc',['--version']).status===0;
const skip=!swiftc&&'swiftc is not available';
let dir,bin;
before(()=>{
 if(!swiftc)return;
 const src=readFileSync(join(here,'side.swift'),'utf8');
 const m=/^\/\/ serve:begin[^\n]*\n([\s\S]*?)^\/\/ serve:end/m.exec(src),l=/^\/\/ logic:begin[^\n]*\n([\s\S]*?)^\/\/ logic:end/m.exec(src);
 assert.ok(m,'side.swift lost its serve:begin/serve:end region');assert.ok(l,'side.swift lost its logic:begin/logic:end region');
 dir=mkdtempSync(join(tmpdir(),'probe360-side-'));bin=join(dir,'check');
 writeFileSync(join(dir,'main.swift'),l[1]+m[1]+readFileSync(join(here,'side-loop-check.swift'),'utf8'));
 const built=spawnSync('swiftc',['-O','-module-name','side360check','-o',bin,join(dir,'main.swift')],{encoding:'utf8'});
 assert.equal(built.status,0,built.stderr);
});
after(()=>{if(dir)rmSync(dir,{recursive:true,force:true})});

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function session(t,...args){
 const child=spawn(bin,args,{stdio:['pipe','pipe','inherit']});t.after(()=>child.kill('SIGKILL'));
 const lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();
 const next=async()=>{
  const r=await Promise.race([lines.next(),sleep(5000).then(()=>({timeout:true}))]);
  assert.ok(!r.timeout&&!r.done,'helper stopped answering');return JSON.parse(r.value);
 };
 return {child,next,send:q=>child.stdin.write(JSON.stringify(q)+'\n'),
  async ask(q){this.send(q);return next()}};
}

test('the main run loop keeps turning while stdin is idle, and requests do not park it',{skip,timeout:60000},async t=>{
 const s=session(t),first=await s.ask({op:'pulse'});
 await sleep(600);
 const second=await s.ask({op:'pulse'});
 // A 5 ms heartbeat turns about 120 times in 600 ms; the bound only has to separate it from a frozen loop.
 assert.ok(second.turns-first.turns>=20,'main run loop did not turn while idle: '+JSON.stringify([first,second]));
 assert.ok(second.ageMs<250,'heartbeat is stale: '+second.ageMs);
 assert.equal(second.onMainThread,false,'requests must not run on the thread that turns the run loop');
 const slow=await s.ask({op:'slow'});
 assert.ok(slow.turnsDuring>=20,'main run loop stalled during a slow request: '+slow.turnsDuring);
});

test('the serial protocol keeps one answer per request, in order, and exits at end of input',{skip,timeout:60000},async t=>{
 const s=session(t);
 for(let seq=1;seq<=5;seq++)s.send({op:'echo',seq});
 for(let seq=1;seq<=5;seq++)assert.equal((await s.next()).seq,seq);
 s.send({op:'nonsense'});assert.equal((await s.next()).error,'unknown');
 s.child.stdin.end();
 const [code]=await Promise.race([once(s.child,'exit'),sleep(5000).then(()=>{throw Error('helper outlived its stdin')})]);
 assert.equal(code,0);
});

test('negative control: a main thread blocked in readLine, the old shape, fails the same measurement',{skip,timeout:60000},async t=>{
 const s=session(t,'legacy'),first=await s.ask({op:'pulse'});
 await sleep(600);
 const second=await s.ask({op:'pulse'});
 assert.equal(second.turns,first.turns,'the control was expected to freeze');
 assert.ok(second.ageMs>=500,'the control heartbeat should be stale: '+second.ageMs);
 assert.equal(second.onMainThread,true);
});

test('watch interval validation: legacy 20 ms default, bounded numbers only',{skip,timeout:60000},async t=>{
 const s=session(t),ask=v=>s.ask({op:'interval',...(v===undefined?{}:{value:v})});
 assert.deepEqual(await ask(),{interval:20,onMainThread:false});
 for(const v of [5,2,100,2.5])assert.equal((await ask(v)).interval,v);
 for(const v of [1.99,100.1,0,-5,'5',true,null,[5]])assert.ok((await ask(v)).rejected,'accepted '+JSON.stringify(v));
});

test('window ids are read from raw CGWindowID array elements, in order',{skip,timeout:60000},async t=>{
 const s=session(t),r=await s.ask({op:'ids',ids:[7,42,4294967295,3]});
 assert.deepEqual(r.ids,[7,42,4294967295,3]);
 assert.deepEqual((await s.ask({op:'ids',ids:[]})).ids,[]);
});

test('order observation: readable only with both windows, above is front-to-back index order',{skip,timeout:60000},async t=>{
 const s=session(t),o=(ids,target,cover)=>s.ask({op:'order',ids,target,cover});
 assert.deepEqual(await o([9,1,2],1,2),{readable:true,above:true,onMainThread:false});
 assert.equal((await o([9,2,1],1,2)).above,false);
 for(const ids of [[9,1],[2,9],[]]){const r=await o(ids,1,2);assert.equal(r.readable,false);assert.equal(r.above,undefined)}
});

test('observation summary reports actual gaps, blind intervals and spans from query times',{skip,timeout:60000},async t=>{
 const s=session(t),r=(await s.ask({op:'summary',obs:[[0,2],[5,6],[20,21],[22,26]]})).summary;
 assert.equal(r.samples,4);
 assert.deepEqual(r.gapMs,{n:3,p50:5,p95:15,max:15});  // start to start: 5,15,2
 assert.deepEqual(r.blindMs,{n:3,p50:3,p95:14,max:14}); // prev end to next start: 3,14,1
 assert.deepEqual(r.spanMs,{n:3,p50:6,p95:16,max:16});  // prev start to this end: 6,16,6
 assert.deepEqual(r.queryMs,{n:4,p50:1,p95:4,max:4});  // durations 2,1,1,4
 assert.deepEqual((await s.ask({op:'summary',obs:[[0,1]]})).summary.gapMs,{n:0});
});
