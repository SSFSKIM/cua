import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {summarizeScripted} from '../../scripts/bench-scripted-summary.mjs';
// One harness run per episode: <dir>/<service>/ep-<n>/{meta.json,results.jsonl}, each run holding both drag cases.
function evidence(t,{episodes=5,raw=()=>1,complete=()=>true,attested=service=>service}={}) {
  const dir=mkdtempSync(join(tmpdir(),'bench-scripted-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  for(const service of ['vendor','cua'])for(let n=1;n<=episodes;n++) {
    const root=join(dir,service,`ep-${n}`);mkdirSync(root,{recursive:true});
    writeFileSync(join(root,'meta.json'),JSON.stringify({corpus:'bench',service,commit:'abc',profile:'ssfs',device:'mini',backend:'live',complete:complete(service,n),
      attestations:[{case:'bench/drag-box',service:attested(service)},{case:'bench/drag-items',service:attested(service)}]}));
    const rows=[];
    for(const c of ['bench/drag-box','bench/drag-items']) {
      const r=raw(service,n,c);
      rows.push({case:c,cell:'drag',ok:true,value:{path:[{x:1,y:2},{x:3,y:4}]}});
      rows.push({case:c,cell:'outcome',ok:true,value:r===null?{done:false,raw:null,reward:null,line:null}:{done:true,raw:r,reward:r*0.9,line:`reward: ${r*0.9} (raw: ${r})`}});
      rows.push({case:c,assertion:r===1?{ok:true}:{ok:false,reason:`raw reward ${r}`}});
    }
    writeFileSync(join(root,'results.jsonl'),rows.map(JSON.stringify).join('\n')+'\n');
  }
  return dir;
}
test('per-episode raw rewards and per-task counts; equal when both services pass every episode', t => {
  const s=summarizeScripted(evidence(t));
  assert.deepEqual(s.tasks,{'bench/drag-box':{vendor:'5/5',cua:'5/5'},'bench/drag-items':{vendor:'5/5',cua:'5/5'}});
  assert.equal(s.episodes.length,20);
  assert.deepEqual(s.episodes[0],{case:'bench/drag-box',service:'vendor',episode:1,done:true,raw:1,reward:0.9,path:'(1,2)->(3,4)',ok:true});
  assert.equal(s.verdict,'equal: every scripted episode passes on both services');
  assert.match(s.text,/^bench\/drag-items: vendor 5\/5, cua 5\/5$/m);
  assert.match(s.text,/^verdict: equal/m);
});
test('a cua miss where the vendor passes is the defect verdict, naming the episode', t => {
  const s=summarizeScripted(evidence(t,{raw:(service,n,c)=>service==='cua'&&n===3&&c==='bench/drag-items'?-1:1}));
  assert.deepEqual(s.tasks['bench/drag-items'],{vendor:'5/5',cua:'4/5'});
  assert.equal(s.verdict,'defect: cua misses bench/drag-items ep-3 (raw -1)');
  const notDone=summarizeScripted(evidence(t,{raw:(service,n,c)=>service==='cua'&&n===1&&c==='bench/drag-box'?null:1}));
  assert.equal(notDone.verdict,'defect: cua misses bench/drag-box ep-1 (not done)');
});
test('misses on both services are reported without calling cua a regression', t => {
  const s=summarizeScripted(evidence(t,{raw:(service,n,c)=>n===2&&c==='bench/drag-box'?-1:1}));
  assert.equal(s.verdict,'cua not below vendor: bench/drag-box vendor 4/5, cua 4/5');
});
test('incomplete, unattested or unequal evidence gets no verdict', t => {
  assert.throws(()=>summarizeScripted(evidence(t,{complete:(service,n)=>!(service==='vendor'&&n===4)})),/vendor\/ep-4.*incomplete/);
  assert.throws(()=>summarizeScripted(evidence(t,{attested:()=>'vendor'})),/cua\/ep-1.*attest/);
  const dir=evidence(t);rmSync(join(dir,'cua','ep-5'),{recursive:true});
  assert.throws(()=>summarizeScripted(dir),/episodes/);
});
test('no verdict without episodes from both services: an empty or one-sided directory is refused', t => {
  const empty=mkdtempSync(join(tmpdir(),'bench-scripted-empty-'));t.after(()=>rmSync(empty,{recursive:true,force:true}));
  assert.throws(()=>summarizeScripted(empty),/no vendor episodes/);
  for(const missing of ['vendor','cua']) {
    const dir=evidence(t);rmSync(join(dir,missing),{recursive:true});
    assert.throws(()=>summarizeScripted(dir),new RegExp(`no ${missing} episodes`));
  }
  const script=fileURLToPath(new URL('../../scripts/bench-scripted-summary.mjs',import.meta.url));
  const run=spawnSync(process.execPath,[script,empty],{encoding:'utf8'});
  assert.equal(run.status,1);assert.equal(run.stdout,'');assert.match(run.stderr,/no vendor episodes/);
});
test('a case on one service only is refused', t => {
  const dir=evidence(t);
  const path=join(dir,'cua','ep-1','results.jsonl');
  writeFileSync(path,readFileSync(path,'utf8').split('\n').filter(l=>!l.includes('bench/drag-items')).join('\n'));
  assert.throws(()=>summarizeScripted(dir),/bench\/drag-items: unequal episodes \(vendor 5, cua 4\)/);
});

function hostEvidence(t,options={}) {
  const dir=evidence(t,options);
  for(const host of ['vendor','cua'])for(let n=1;n<=5;n++) {
    const path=join(dir,host,`ep-${n}/meta.json`),meta=JSON.parse(readFileSync(path,'utf8'));
    Object.assign(meta,{host,service:'cua',surfaces:['browser'],hostAttestations:[{
      host,serverInfo:{name:host==='cua'?'cua-repl-host':'node-repl',version:'1.0.0'},
      _meta:host==='cua'?{'cua/replHost':{host:'cua',version:'1.0.0'}}:null,
    }]});
    for(const attestation of meta.attestations)attestation.service='cua';
    writeFileSync(path,JSON.stringify(meta));
  }
  return dir;
}
test('host-axis scripted outcomes count observed hosts without relabelling the cua service',t=>{
  const dir=hostEvidence(t),before=readFileSync(join(dir,'vendor/ep-1/meta.json'),'utf8');
  const report=summarizeScripted(dir,{axis:'host'});
  assert.equal(report.axis,'host');assert.equal(report.service,'cua');
  assert.deepEqual(report.tasks['bench/drag-box'],{vendor:'5/5',cua:'5/5'});
  assert.deepEqual(report.episodes[0],{case:'bench/drag-box',host:'vendor',service:'cua',episode:1,done:true,raw:1,reward:0.9,path:'(1,2)->(3,4)',ok:true});
  assert.equal(report.verdict,'equal: every scripted episode passes on both hosts');
  assert.equal(readFileSync(join(dir,'vendor/ep-1/meta.json'),'utf8'),before);
  assert.equal(summarizeScripted(hostEvidence(t,{raw:(host,n,c)=>host==='cua'&&n===3&&c==='bench/drag-items'?-1:1}),{axis:'host'}).verdict,
    'defect: cua misses bench/drag-items ep-3 (raw -1)');
  const script=fileURLToPath(new URL('../../scripts/bench-scripted-summary.mjs',import.meta.url));
  const run=spawnSync(process.execPath,[script,dir,'--axis','host'],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/comparison axis: host; browser service: cua/);
  assert.match(run.stdout,/verdict: equal: every scripted episode passes on both hosts/);
});

test('host-axis scripted summary rejects unattested host claims and service/connection mismatches',t=>{
  const dir=hostEvidence(t),path=join(dir,'vendor/ep-1/meta.json'),valid=JSON.parse(readFileSync(path,'utf8'));
  for(const change of [
    meta=>{delete meta.hostAttestations;},
    meta=>{meta.host='cua';},
    meta=>{meta.hostAttestations[0].host='cua';},
    meta=>{delete meta.hostAttestations[0]._meta;},
    meta=>{meta.hostAttestations.push({host:'cua',serverInfo:{name:'cua-repl-host',version:'1'},_meta:{'cua/replHost':{host:'cua',version:'1'}}});},
    meta=>{meta.service='vendor';},
    meta=>{meta.attestations[1].service='vendor';},
  ]) {
    const meta=structuredClone(valid);change(meta);writeFileSync(path,JSON.stringify(meta));
    assert.throws(()=>summarizeScripted(dir,{axis:'host'}),/host attestation|service attestation/);
  }
  assert.throws(()=>summarizeScripted(evidence(t),{axis:'host'}),/host attestation|service attestation/);
});

test('host-axis scripted comparison still refuses incomplete or unequal episodes; invalid axes fail',t=>{
  const dir=hostEvidence(t);
  rmSync(join(dir,'cua/ep-5'),{recursive:true});
  assert.throws(()=>summarizeScripted(dir,{axis:'host'}),/unequal episodes/);
  assert.throws(()=>summarizeScripted(dir,{axis:'other'}),/axis/);
  const complete=hostEvidence(t),path=join(complete,'cua/ep-1/meta.json'),meta=JSON.parse(readFileSync(path,'utf8'));
  writeFileSync(path,JSON.stringify({...meta,complete:false}));
  assert.throws(()=>summarizeScripted(complete,{axis:'host'}),/incomplete/);
  const serviceDir=evidence(t);
  assert.deepEqual(summarizeScripted(serviceDir,{axis:'service'}),summarizeScripted(serviceDir));
  const script=fileURLToPath(new URL('../../scripts/bench-scripted-summary.mjs',import.meta.url));
  const run=spawnSync(process.execPath,[script,serviceDir,'--axis','other'],{encoding:'utf8'});
  assert.equal(run.status,1);assert.doesNotMatch(run.stdout,/verdict:/);assert.match(run.stderr,/axis/);
});

test('scripted service CLI still defaults to the working directory when no evidence argument is supplied',t=>{
  const dir=evidence(t),script=fileURLToPath(new URL('../../scripts/bench-scripted-summary.mjs',import.meta.url));
  const run=spawnSync(process.execPath,[script],{cwd:dir,encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/verdict: equal: every scripted episode passes on both services/);
});
