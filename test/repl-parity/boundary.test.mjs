import {test} from 'node:test';import assert from 'node:assert/strict';
import scenarios from './scenarios/index.mjs';
import {selectScenarios,inventory} from '../../scripts/repl-parity/registry.mjs';
import {descendants} from '../../scripts/repl-parity/processes.mjs';
test('every M1 case is executable on each applicable platform',()=>{
 for(const platform of ['darwin','linux']){const selected=selectScenarios(scenarios,inventory,{suite:'cells',through:'M1',platform});assert.equal(selected.pending.filter(s=>s.milestone<='M1').length,0);assert.ok(selected.scenarios.length>=111);}
});
test('process ownership follows only descendants of the harness process',()=>{
 const rows=[{pid:10,ppid:1},{pid:11,ppid:10},{pid:12,ppid:11},{pid:13,ppid:1},{pid:14,ppid:13}];
 assert.deepEqual(descendants(rows,10).map(p=>p.pid),[11,12]);assert.deepEqual(descendants(rows,99),[]);
});
