import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertHandlerRegistry} from './support/handler-registry.mjs';
test('removing a due handler fails even when its schema still accepts the command',()=>{
  const schemas=new Map([['navigate_tab_url',()=>true],['tab_screenshot',()=>true]]);
  const handlers=new Map([['navigate_tab_url',()=>{}],['tab_screenshot',()=>{}]]);
  const rows=[{type:'navigate_tab_url',milestone:'M1a'},{type:'tab_screenshot',milestone:'M1c'}];
  assert.doesNotThrow(()=>assertHandlerRegistry(handlers,rows,'M1c'));
  handlers.delete('navigate_tab_url');assert.equal(schemas.get('navigate_tab_url')({}),true);
  assert.throws(()=>assertHandlerRegistry(handlers,rows,'M1a'),/navigate_tab_url/);
});
test('registry rejects non-callable entries and does not require later milestones',()=>{
  const rows=[{type:'create_tab',milestone:'M1a'},{type:'tab_screenshot',milestone:'M1c'}];
  assert.doesNotThrow(()=>assertHandlerRegistry(new Map([['create_tab',()=>{}]]),rows,'M1a'));
  assert.throws(()=>assertHandlerRegistry(new Map([['create_tab',{}]]),rows,'M1a'),/create_tab/);
});
