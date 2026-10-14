import {test} from 'node:test';import assert from 'node:assert/strict';
import {secretCaseIds,runSecretCase} from './fixtures/secret-cases.mjs';
test('synthetic wrapper scenarios prove delivery, refusal-before-read and value-free errors without the owner store',async()=>{
 for(const id of secretCaseIds){const result=await runSecretCase(id);assert.equal(result.ok,true,id);assert.equal(result.fakeBackend,true);assert.deepEqual(Object.keys(result).sort(),['fakeBackend','ok']);}
 assert.rejects(()=>runSecretCase('secrets/browser/not-a-case'),/Unknown/);
});
