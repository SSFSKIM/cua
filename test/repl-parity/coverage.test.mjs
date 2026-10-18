import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {rowCovered,verifyUnitProofs,unitProofKey} from '../../scripts/repl-parity/coverage.mjs';
test('live-required obligations cannot be satisfied by a fake case or passing unit proof',()=>{
 const proof={file:'test/unit.test.mjs',name:'unit witness'},row={cases:['fake'],unitCases:['fake'],liveRequired:true,unitProof:proof};
 assert.equal(rowCovered(row,new Set(['fake']),new Set([unitProofKey(proof)])),false);
 assert.equal(rowCovered({...row,cases:['fake','live']},new Set(['fake','live']),new Set()),true);
 assert.equal(rowCovered({...row,liveRequired:false},new Set(['fake']),new Set()),false);
 assert.equal(rowCovered({...row,liveRequired:false},new Set(),new Set([unitProofKey(proof)])),true);
});
test('unit proof must exist, run by npm test and actually pass its exact named test',()=>{
 const root=mkdtempSync(join(tmpdir(),'cua-proof-'));
 try{
  mkdirSync(join(root,'test'));writeFileSync(join(root,'package.json'),JSON.stringify({type:'module',scripts:{test:'node --test "test/**/*.test.mjs"'}}));
  const proof={file:'test/unit.test.mjs',name:'unit witness'};
  assert.throws(()=>verifyUnitProofs([{unitProof:proof}],{root}),/missing/);
  writeFileSync(join(root,proof.file),"import test from 'node:test';test('other test',()=>{});");assert.throws(()=>verifyUnitProofs([{unitProof:proof}],{root}),/did not pass/);
  writeFileSync(join(root,proof.file),"import test from 'node:test';test('unit witness',()=>{throw Error('failed')});");assert.throws(()=>verifyUnitProofs([{unitProof:proof}],{root}),/did not pass/);
  writeFileSync(join(root,proof.file),"import test from 'node:test';test('unit witness',()=>{});");assert.ok(verifyUnitProofs([{unitProof:proof}],{root}).has(unitProofKey(proof)));
  writeFileSync(join(root,'package.json'),JSON.stringify({scripts:{test:'node --test "other/*.test.mjs"'}}));assert.throws(()=>verifyUnitProofs([{unitProof:proof}],{root}),/npm test/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
// #157: accept-native runs npm test with the TAP reporter in NODE_OPTIONS (scripts/accept/lib.mjs testReporterEnv); a
// proof child that added its own --test-reporter on top had two reporters for one destination and never started.
test('unit proofs run under a NODE_OPTIONS that already names a test reporter, in either spelling',()=>{
 const root=mkdtempSync(join(tmpdir(),'cua-proof-')),saved=process.env.NODE_OPTIONS;
 try{
  mkdirSync(join(root,'test'));writeFileSync(join(root,'package.json'),JSON.stringify({type:'module',scripts:{test:'node --test "test/**/*.test.mjs"'}}));
  const proof={file:'test/unit.test.mjs',name:'unit witness'};
  writeFileSync(join(root,proof.file),"import test from 'node:test';test('unit witness',()=>{});");
  for(const options of ['--test-reporter=tap --test-reporter-destination=stdout','--test-reporter spec --test-reporter-destination stderr','--test-reporter=dot']){
   process.env.NODE_OPTIONS=options;
   assert.ok(verifyUnitProofs([{unitProof:proof}],{root}).has(unitProofKey(proof)),options);
  }
 }finally{if(saved===undefined)delete process.env.NODE_OPTIONS;else process.env.NODE_OPTIONS=saved;rmSync(root,{recursive:true,force:true});}
});
