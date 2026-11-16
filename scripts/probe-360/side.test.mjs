import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';import {once} from 'node:events';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';

// The side helper must keep its main run loop turning while stdin is idle: NSWorkspace's foreground state is cached
// until the main run loop turns (NSRunningApplication.h), and the passive watcher reads it from another thread.
// The real helper is hosted-only and drives the GUI, so this compiles the helper's own `serve` region (between its
// serve:begin / serve:end markers) with a Foundation-only harness. No AppKit, AX or app is touched.
const here=dirname(fileURLToPath(import.meta.url));
const swiftc=spawnSync('swiftc',['--version']).status===0;
const skip=!swiftc&&'swiftc is not available';
let dir,bin;
before(()=>{
 if(!swiftc)return;
 const m=/^\/\/ serve:begin[^\n]*\n([\s\S]*?)^\/\/ serve:end/m.exec(readFileSync(join(here,'side.swift'),'utf8'));
 assert.ok(m,'side.swift lost its serve:begin/serve:end region');
 dir=mkdtempSync(join(tmpdir(),'probe360-side-'));bin=join(dir,'check');
 writeFileSync(join(dir,'main.swift'),m[1]+readFileSync(join(here,'side-loop-check.swift'),'utf8'));
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
