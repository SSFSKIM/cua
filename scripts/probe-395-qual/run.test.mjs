import test from 'node:test';
import assert from 'node:assert/strict';
import {page} from './fixture.mjs';
import {plan, expectationFor, outcomeOf, scoreRow} from './run.mjs';

test('twenty trials per cell and head, balanced interleaving with independent A/B pairs',()=>{
 const rounds=plan({reps:20,seed:395});
 assert.equal(rounds.flat().length,320);
 const first=new Map(), ids=new Set();
 for(const round of rounds){
  assert.equal(round.length,16);
  for(let i=0;i<round.length;i+=2){
   const [a,b]=round.slice(i,i+2);
   assert.equal(a.pairKey,b.pairKey);assert.notEqual(a.head,b.head);
   first.set(a.unit+'/'+a.head,(first.get(a.unit+'/'+a.head)??0)+1);
   ids.add(a.id);ids.add(b.id);
  }
 }
 assert.equal(ids.size,320);assert.equal(first.size,16);assert.ok([...first.values()].every(n=>n===10));
});

test('secure control is parsed as password, rather than assigned after load',()=>{
 const html=page();assert.match(html,/<input id="probe395q-secure"[^>]+type="password"/);
 const script=html.match(/<script>([\s\S]+)<\/script>/)[1];
 assert.doesNotThrow(()=>new Function(script));
 assert.doesNotMatch(script,/\bP\.type\s*=(?!=)/);
});

test('engine RPC success without confirmed readback, and confirmation without DOM equality, are not passes',()=>{
 const expected=expectationFor('fix','large','secretShort');
 const good={expected,reason:null,domEqual:true,domKnown:true,harnessValid:true};
 const unconfirmed=outcomeOf({error:{errorName:'typeUnconfirmed',meta:{typeReadback:{confirmed:false}}}});
 assert.equal(unconfirmed,'unconfirmed');
 assert.equal(scoreRow({...good,outcome:unconfirmed}).strict,false);
 const resultWithoutConfirmed=outcomeOf({result:{meta:{typeReadback:{confirmed:false}}}});
 assert.notEqual(resultWithoutConfirmed,'ok');
 const score=scoreRow({...good,outcome:'ok',domEqual:false,confirmed:true});
 assert.equal(score.strict,false);assert.equal(score.wrongSuccess,true);
});

test('main large no-focus baseline and candidate secure refusals stay distinct',()=>{
 const base={outcome:'unconfirmed',confirmed:false,domEqual:true,domKnown:true,harnessValid:true};
 assert.equal(scoreRow({...base,expected:expectationFor('main','large','plain'),reason:'noFocusedElement'}).strict,true);
 assert.equal(scoreRow({...base,expected:expectationFor('main','large','secure'),reason:'noFocusedElement'}).strict,true);
 for(const [head,page] of [['main','small'],['fix','small'],['fix','large']]){
  const expected=expectationFor(head,page,'secure');
  assert.equal(scoreRow({...base,expected,reason:'secure'}).strict,true);
  assert.equal(scoreRow({...base,expected,reason:'noFocusedElement'}).strict,false);
 }
});
