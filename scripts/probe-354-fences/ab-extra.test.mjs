import test from 'node:test';
import assert from 'node:assert/strict';
import {extraPlan,readbackStatus} from './ab-extra.mjs';

test('Return is text in multiline fields, but ending single-line Return and every Tab remain unconfirmed keys',()=>{
 for(const browser of ['safari','cft','firefox'])for(const editor of ['textarea','input','contenteditable','compose']){
  const cells=extraPlan({browser,editor,reps:20});
  assert.equal(cells.filter(c=>c.part==='ending-tab').length,20);
  for(const c of cells.filter(c=>c.part==='ending-tab'))assert.equal(c.expectedAnswer,'keysUnconfirmed');
  const returns=cells.filter(c=>c.part==='ending-return');
  assert.equal(returns.length,editor==='compose'?0:20);
  assert.ok(returns.every(c=>c.expectedAnswer===(editor==='input'?'keysUnconfirmed':'confirmed')));
  assert.equal(cells.filter(c=>c.part==='multiline').length,['textarea','contenteditable'].includes(editor)?20:0);
  assert.equal(cells.filter(c=>c.part==='secret').length,editor==='input'?40:0);
  const unicode=cells.filter(c=>c.variant==='unicode-cap');
  assert.equal(unicode.length,browser==='cft'&&editor==='textarea'?20:0);
  if(unicode.length){assert.equal([...unicode[0].seed].length,10001);assert.ok(Buffer.byteLength(unicode[0].seed)>10000)}
  assert.equal(new Set(cells.map(c=>c.id)).size,cells.length);
 }
});

test('the real answer explicitly distinguishes confirmed text from an unconfirmed ending key',()=>{
 assert.deepEqual(readbackStatus({result:{meta:{typeReadback:{confirmed:true,keysUnconfirmed:1,checkpoints:1}}}}),{confirmed:true,keysUnconfirmed:1,checkpoints:1});
 assert.deepEqual(readbackStatus({error:{errorName:'typeUnconfirmed',meta:{typeReadback:{confirmed:false,reason:'valueMismatch'}}}}),{confirmed:false,keysUnconfirmed:0,checkpoints:0});
});
