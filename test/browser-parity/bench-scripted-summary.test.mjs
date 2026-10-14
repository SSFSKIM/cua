import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
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
