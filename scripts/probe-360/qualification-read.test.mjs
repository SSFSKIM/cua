import test from 'node:test';import assert from 'node:assert/strict';
import {qualificationMetrics} from './qualification-read.mjs';
const row=(engine,key,ms,route)=>({engine,scene:'background',editor:'contenteditable',key,action:{durationMs:ms,error:null,meta:{inputRoute:route,activationGuardMs:route==='3'?ms-2:undefined}},watch:{samples:[]}});

test('price compares the same editor/key only when main really used plain posting',()=>{
 const rs=[row('fix','Left',12,'3'),row('fix','Left',20,'3'),row('main','Left',2,"2'"),row('main','Left',4,"2'"),row('fix','cmd+Left',10,'3'),row('main','cmd+Left',8,'3')];
 const m=qualificationMetrics(rs);
 assert.deepEqual(m.price.comparable.fix,{n:2,p50:12,p95:20,max:20});
 assert.deepEqual(m.price.comparable.mainPlain,{n:2,p50:2,p95:4,max:4});
 assert.equal(m.price.byCell.find(c=>c.key==='cmd+Left').mainPlain.n,0);
 assert.equal(m.routingViolations.length,0);
});

test('observation gaps never bridge independent trial windows and query spans remain explicit',()=>{
 const a=row('fix','Left',12,'3'),b=row('main','Left',2,"2'");
 a.watch={source:'CGWindowListCreate:ids',samples:[{frontAt:100,at:104,queryMs:4,mainLoopAgeMs:1},{frontAt:110,at:115,queryMs:5,gapMs:10,blindMs:6,spanMs:15,mainLoopAgeMs:2}]};
 b.watch={source:'CGWindowListCreate:ids',samples:[{frontAt:1000,at:1005,queryMs:5,mainLoopAgeMs:1},{frontAt:1020,at:1026,queryMs:6,gapMs:20,blindMs:15,spanMs:26,mainLoopAgeMs:2}]};
 const m=qualificationMetrics([a,b]);
 assert.deepEqual(m.watch.frontGapsMs,{n:2,p50:10,p95:20,max:20});
 assert.deepEqual(m.watch.orderStartGapsMs,{n:2,p50:10,p95:20,max:20});
 assert.equal(m.watch.orderSpanMs.max,26);assert.equal(m.watch.queryMs.max,6);
});

test('routing qualification notices a fixed background call that silently stayed on plain posting',()=>{
 const r=row('fix','Home',3,"2'");r.id='wrong-route';
 assert.deepEqual(qualificationMetrics([r]).routingViolations,[{id:'wrong-route',expected:'3',actual:"2'"}]);
});
