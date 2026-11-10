import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createExclusions,enumerateCells,snapshot,disablePeriod,annotateConfig,assertHosted,SELECTED_IDS,PERIOD_KEY,CFT_DOMAIN} from './diagnostic.mjs';
const driver=readFileSync(new URL('../probe-354/measure.mjs',import.meta.url),'utf8');
test('actual unmodified CE partial driver schedules220 cells; diagnostic exclusions leave exactly the requested two once',async()=>{
 const scheduled=await enumerateCells(driver),input=await createExclusions(driver);
 assert.equal(scheduled.length,220);assert.equal(input.completedIds.length,218);assert.equal(input.excludedCounts.partial,178);assert.equal(input.excludedCounts.mechanism,40);
 const excluded=new Set(input.completedIds),remaining=scheduled.filter(id=>!excluded.has(id));assert.deepEqual(remaining,SELECTED_IDS);assert.equal(new Set(remaining).size,2);
 assert.equal(input.sourceRun,null);assert.match(input.purpose,/exclusions.*not.*completed/i);assert.deepEqual(input.selectedIds,SELECTED_IDS);
});
test('bad selected IDs fail before measurement rather than expand or silently change scope',async()=>{
 await assert.rejects(createExclusions(driver,['not-a-cell']),/selected/);await assert.rejects(createExclusions(driver,[]),/selected/);
});
test('unset defaults are explicitly unset/null, never false',()=>{
 const s=snapshot('before',()=>({status:1,stdout:'',stderr:'The domain/default pair does not exist'}));
 assert.ok(s.preferences.every(p=>p.state==='unset'&&p.value===null));assert.equal(s.preferences.length,14);
});
test('default capture errors are not mislabeled as unset',()=>{
 assert.throws(()=>snapshot('before',()=>({status:1,stdout:'',stderr:'permission denied'})),/permission denied/);
});
test('only period substitution is written, globally and in CFT app domain',()=>{
 const calls=[];disablePeriod((cmd,args)=>{calls.push([cmd,args]);return {status:0,stdout:'',stderr:''}});
 assert.deepEqual(calls,[['defaults',['write','NSGlobalDomain',PERIOD_KEY,'-bool','NO']],['defaults',['write',CFT_DOMAIN,PERIOD_KEY,'-bool','NO']]]);
});
test('diagnostic config is distinct from primary and preserves the old-driver evidence fields',()=>{
 const c=annotateConfig({fixtureOwnershipVersion:3,reps:20,measuredCells:2},{selectedIds:SELECTED_IDS,purpose:'diagnostic exclusions'});
 assert.equal(c.fixtureOwnershipVersion,3);assert.equal(c.diagnostic.name,'period-substitution-off-two-outliers');assert.equal(c.diagnostic.sourceRun,null);assert.deepEqual(c.diagnostic.selectedIds,SELECTED_IDS);assert.match(c.diagnostic.limit,/one.*cell/i);
});
test('the real CLI cannot touch preferences outside a disposable hosted runner',()=>{
 assert.throws(()=>assertHosted({}),/hosted/);assert.throws(()=>assertHosted({RUNNER_ENVIRONMENT:'self-hosted'}),/hosted/);assert.doesNotThrow(()=>assertHosted({RUNNER_ENVIRONMENT:'github-hosted'}));
});
