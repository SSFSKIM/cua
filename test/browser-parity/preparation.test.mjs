import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertPreparedProfile} from '../../scripts/browser-parity/topology.mjs';
test('prepare accepts an already-ready profile and refuses missing/stale bindings without modifying them',()=>{
  const profile={key:'ssfs',ready:true,extensionInstanceId:'bound-instance'};
  assert.equal(assertPreparedProfile({profiles:[profile]},'ssfs'),undefined);
  for(const profiles of [[],[{...profile,ready:false}],[{...profile,extensionInstanceId:undefined}],[{...profile,key:'other'}]])assert.throws(()=>assertPreparedProfile({profiles},'ssfs'),/already-bound ready profile/);
});
