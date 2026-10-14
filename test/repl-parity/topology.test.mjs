import {test} from 'node:test';import assert from 'node:assert/strict';
import {prepareCommand,cellsCommand} from '../../scripts/repl-parity/topology.mjs';
import {capabilityFixtureCommand} from '../../scripts/repl-parity/capability.mjs';
test('remote prepare uses only the parity clone and profile discovery never rebinds',()=>{
 const c=prepareCommand({device:'cua-linux',commit:'1234567890abcdef'});assert.equal(c.command,'ssh');assert.ok(c.args.includes('BatchMode=yes'));assert.match(c.args.at(-1),/cua-parity/);
 assert.throws(()=>prepareCommand({device:'mini',commit:'$(bad)',profile:'ssfs'}));
});
test('cells and capability resources execute on the device; local runtime copying is refused',()=>{
 for(const make of [cellsCommand,capabilityFixtureCommand]){
  assert.throws(()=>make({device:'local',checkout:'/fixture',home:'/runtime',host:'vendor'}),/local|Local/);
  const c=make({device:'mini',checkout:'/fixture',home:'/runtime',host:'vendor'});assert.equal(c.command,'ssh');assert.ok(c.args.includes('mini'));assert.match(c.args.at(-1),/\/fixture/);
 }
});
