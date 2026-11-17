import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {busyFixture, qualificationPage} from './qualification-page.mjs';

test('busy fixture acknowledges the owned command before blocking and retains actual start/end evidence',()=>{
 let at=1000, answer, ackAt;
 const trace=[];
 const run=vm.runInNewContext('('+busyFixture.toString()+')',{Date:{now:()=>{const t=at;at+=100;return t}},performance:{now:()=>at}});
 run({n:7,busyMs:900},()=>({text:'seed',selection:[3,0]}),trace,o=>{answer=o;ackAt=at});
 assert.equal(answer.cmd,7);
 assert.equal(answer.busyStartedAt,1000);
 assert.equal(answer.busyUntil,1900);
 assert.ok(ackAt<answer.busyUntil);
 assert.deepEqual(trace.map(e=>e.event),['busy-start','busy-end']);
 assert.ok(trace[1].at>=answer.busyUntil);
 assert.equal(answer.text,'seed');
});

test('busy fixture refuses unbounded, short, or fractional blocking commands before acknowledging',()=>{
 for(const busyMs of [-1,0,300,1201,900.5,'900',Infinity]){
  let called=false;
  assert.throws(()=>busyFixture({n:1,busyMs},()=>({}),[],()=>{called=true}));
  assert.equal(called,false);
 }
});

test('qualification page is valid browser JavaScript and retains the original visible owner protocol',()=>{
 const html=qualificationPage(),script=html.match(/<script>([\s\S]*)<\/script>/)[1];
 assert.doesNotThrow(()=>new vm.Script(script));
 // Run the actual page with a dormant poll, rather than execute unowned commands.
 const titles=[],handlers=[];
 const document={set title(v){titles.push(v)},addEventListener:(...args)=>handlers.push(args)};
 vm.runInNewContext(script,{document,crypto:{randomUUID:()=> 'a'.repeat(32)},performance:{timeOrigin:1,now:()=>0},location:{href:'http://fixture/'},fetch:()=>new Promise(()=>{}),setTimeout});
 assert.equal(titles[0],'probe354:'+'a'.repeat(32));
 assert.ok(handlers.some(([event])=>event==='mousedown'));
});
