import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {summarize} from '../../scripts/bench-summary.mjs';
function fixture(t, times = [1000, 1200, 1100]) {
  const dir = mkdtempSync(join(tmpdir(), 'bench-summary-'));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  for (const service of ['vendor','cua']) for (let n=1; n<=3; n++) {
    const root = join(dir, service, `run-${n}`); mkdirSync(root, {recursive:true});
    writeFileSync(join(root, 'meta.json'), JSON.stringify({service, commit:'abc', profile:'scratch', model:'test', runtime:'pinned', started:'2026-10-13T00:00:00Z', finished:'2026-10-13T00:01:00Z'}));
    writeFileSync(join(root, 'calls.jsonl'), [
      {t:'2026-10-13T00:00:00Z', task:'T1', tool:'js', kind:'observe', ok:true, ms:20},
      {task:'T1', done:new Date(Date.parse('2026-10-13T00:00:00Z') + (service === 'vendor' ? 1000 : times[n-1])).toISOString(), ok:true},
    ].map(JSON.stringify).join('\n')+'\n');
    writeFileSync(join(root, 'outcomes.json'), JSON.stringify({T1:{ok:true}}));
  }
  return dir;
}
test('synthetic six runs report medians, spreads and 500 ms floor without summing call durations', t => {
  const r = summarize(fixture(t));
  assert.equal(r.verdict, 'no regression');
  assert.deepEqual(r.tasks[0], {task:'T1', vendor:{median:1000, min:1000, max:1000, outcomes:[true,true,true], details:[{ok:true},{ok:true},{ok:true}]}, cua:{median:1100, min:1000, max:1200, outcomes:[true,true,true], details:[{ok:true},{ok:true},{ok:true}]}, ok:true});
});
test('one slower task, unequal outcomes, missing task or incomplete run fails closed', t => {
  const dir = fixture(t, [1501,1600,1700]);
  assert.equal(summarize(dir).verdict, 'regression');
  writeFileSync(join(dir, 'cua/run-1/outcomes.json'), JSON.stringify({T1:{ok:false}}));
  assert.throws(() => summarize(dir), /inconsistent/);
  writeFileSync(join(dir, 'cua/run-1/outcomes.json'), JSON.stringify({T1:{ok:true}}));
  writeFileSync(join(dir, 'cua/run-2/outcomes.json'), '{}');
  assert.throws(() => summarize(dir), /task|outcome/i);
  writeFileSync(join(dir, 'cua/run-2/outcomes.json'), JSON.stringify({T1:{ok:true}}));
  rmSync(join(dir, 'cua/run-3'), {recursive:true});
  assert.throws(() => summarize(dir), /three|run-3/i);
});
test('vendor-only baseline prints cua runs none but cannot claim no regression', t => {
  const dir = fixture(t); rmSync(join(dir, 'cua'), {recursive:true});
  assert.equal(summarize(dir).verdict, 'cua runs: none');
});

test('ten-percent tolerance dominates the floor on longer tasks; fewer cua successes still fail',t=>{
  const dir=fixture(t,[21999,22000,22001]);
  for(let n=1;n<=3;n++)writeFileSync(join(dir,`vendor/run-${n}/calls.jsonl`),[
    {t:'2026-10-13T00:00:00Z',task:'T1',tool:'js',kind:'observe',ok:true,ms:5},
    {task:'T1',done:'2026-10-13T00:00:20Z',ok:true},
  ].map(JSON.stringify).join('\n')+'\n');
  assert.equal(summarize(dir).verdict,'no regression');
  writeFileSync(join(dir,'cua/run-1/outcomes.json'),JSON.stringify({T1:{ok:false}}));
  writeFileSync(join(dir,'cua/run-1/calls.jsonl'),[
    {t:'2026-10-13T00:00:00Z',task:'T1',tool:'js',kind:'observe',ok:false,ms:5},
    {task:'T1',done:'2026-10-13T00:00:21.999Z',ok:false},
  ].map(JSON.stringify).join('\n')+'\n');
  assert.equal(summarize(dir).verdict,'regression');
});

test('different answers and discounted rewards are printed but do not change equal successful outcomes', t => {
  const dir = fixture(t);
  const vendor = {ok:true, answer:'42', rawReward:1, discountedReward:0.9};
  const cua = {ok:true, answer:'forty-two', rawReward:1, discountedReward:0.8};
  for (const [service, outcome] of [['vendor',vendor], ['cua',cua]]) for (let n=1; n<=3; n++) {
    writeFileSync(join(dir,service,`run-${n}/outcomes.json`), JSON.stringify({T1:outcome}));
  }
  const report = summarize(dir);
  assert.equal(report.verdict, 'no regression');
  assert.deepEqual(report.tasks[0].vendor.details, [vendor,vendor,vendor]);
  assert.deepEqual(report.tasks[0].cua.details, [cua,cua,cua]);
  const output = execFileSync(process.execPath, [fileURLToPath(new URL('../../scripts/bench-summary.mjs',import.meta.url)),dir], {encoding:'utf8'});
  assert.match(output, /outcome criterion:.*success count.*three runs.*at least.*vendor.*answers and rewards.*not compared/);
  const printed = JSON.parse(output.split('\n').find(line => line.startsWith('T1: ')).slice(4));
  assert.deepEqual(printed.vendor.details, [vendor,vendor,vendor]);
  assert.deepEqual(printed.cua.details, [cua,cua,cua]);
  assert.match(output, /verdict: no regression/);
});

test('identical mixed success vectors preserve outcomes despite a failure in both services', t => {
  const dir = fixture(t);
  for (const service of ['vendor','cua']) {
    const root = join(dir,service,'run-1');
    writeFileSync(join(root,'outcomes.json'), JSON.stringify({T1:{ok:false}}));
    const calls = readFileSync(join(root,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
    calls.find(row => row.done).ok = false;
    writeFileSync(join(root,'calls.jsonl'), calls.map(JSON.stringify).join('\n')+'\n');
  }
  assert.equal(summarize(dir).verdict, 'no regression');
});

test('outcomes compare success counts, accepting more cua successes and rejecting fewer', t => {
  const dir = fixture(t);
  const setFlags = (service, flags) => flags.forEach((ok, i) => {
    const root = join(dir,service,`run-${i+1}`);
    writeFileSync(join(root,'outcomes.json'), JSON.stringify({T1:{ok}}));
    const calls = readFileSync(join(root,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
    calls.find(row => row.done).ok = ok;
    writeFileSync(join(root,'calls.jsonl'), calls.map(JSON.stringify).join('\n')+'\n');
  });
  setFlags('vendor', [false,true,false]);
  setFlags('cua', [true,false,true]);
  assert.equal(summarize(dir).verdict, 'no regression');
  setFlags('cua', [true,false,false]);
  assert.equal(summarize(dir).verdict, 'no regression', 'equal counts need not align by run index');
  setFlags('cua', [false,false,false]);
  assert.equal(summarize(dir).verdict, 'regression');
});
