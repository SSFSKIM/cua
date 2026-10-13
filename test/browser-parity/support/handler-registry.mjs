import assert from 'node:assert/strict';
const milestones=['M0','M1a','M1b','M1c','M2','M3'];
export function assertHandlerRegistry(registry,inventory,current) {
  assert.ok(milestones.includes(current),`unknown current milestone ${current}`);
  assert.ok(registry instanceof Map,'own service must export its actual COMMAND_HANDLERS dispatch Map');
  for(const row of inventory)if(milestones.indexOf(row.milestone)<=milestones.indexOf(current)) {
    assert.equal(typeof registry.get(row.type),'function',`missing registered handler ${row.type}`);
  }
}
