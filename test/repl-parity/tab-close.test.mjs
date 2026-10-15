import {test} from 'node:test';import assert from 'node:assert/strict';
import {closeObservedTab} from './fixtures/close-observed-tab.mjs';
test('a no-op close fails at the observation deadline, without replay',async()=>{
 let closes=0,reads=0;const tab={id:'owned',close:async()=>{closes++;}},browser={tabs:{list:async()=>{reads++;return [{id:'owned'}];}}};
 assert.equal(await closeObservedTab(browser,tab,{timeoutMs:15,pollMs:1}),false);assert.equal(closes,1);assert.ok(reads>1);
});
