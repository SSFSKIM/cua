import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {summarize} from '../../scripts/bench-summary.mjs';
function fixture(t, times = [1000, 1200, 1100], wallTimes = [10000,10000,10000]) {
  const dir = mkdtempSync(join(tmpdir(), 'bench-summary-'));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  for (const service of ['vendor','cua']) for (let n=1; n<=3; n++) {
    const root = join(dir, service, `run-${n}`); mkdirSync(root, {recursive:true});
    writeFileSync(join(root, 'meta.json'), JSON.stringify({service, commit:'abc', profile:'scratch', model:'test', runtime:'pinned', started:'2026-10-13T00:00:00Z', finished:'2026-10-13T00:01:00Z'}));
    writeFileSync(join(root, 'calls.jsonl'), [
      {t:'2026-10-13T00:00:00Z', task:'T1', tool:'js', kind:'observe', ok:true, ms:200},
      {t:'2026-10-13T00:00:00.200Z', task:'T1', tool:'js', kind:'action', ok:true, ms:(service === 'vendor' ? 1000 : times[n-1])-200},
      {task:'T1', done:new Date(Date.parse('2026-10-13T00:00:00Z') + (service === 'vendor' ? 10000 : wallTimes[n-1])).toISOString(), ok:true},
    ].map(JSON.stringify).join('\n')+'\n');
    writeFileSync(join(root, 'outcomes.json'), JSON.stringify({T1:{ok:true}}));
  }
  return dir;
}
test('synthetic six runs report summed tool time and diagnostic wall time with the 500 ms floor', t => {
  const r = summarize(fixture(t));
  assert.equal(r.verdict, 'no regression');
  assert.deepEqual(r.tasks[0], {task:'T1', timingJudged:true, vendor:{toolMs:{median:1000, min:1000, max:1000}, wallMs:{median:10000,min:10000,max:10000}, outcomes:[true,true,true], details:[{ok:true},{ok:true},{ok:true}]}, cua:{toolMs:{median:1100, min:1000, max:1200}, wallMs:{median:10000,min:10000,max:10000}, outcomes:[true,true,true], details:[{ok:true},{ok:true},{ok:true}]}, ok:true});
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
  const partial = summarize(dir);
  assert.equal(partial.verdict, null);
  assert.deepEqual(partial.incomplete, [{service:'cua',runs:2}]);
});
test('vendor-only baseline prints cua runs none but cannot claim no regression', t => {
  const dir = fixture(t); rmSync(join(dir, 'cua'), {recursive:true});
  assert.equal(summarize(dir).verdict, 'cua runs: none');
});

test('ten-percent tolerance dominates the floor on longer tasks; fewer cua successes still fail',t=>{
  const dir=fixture(t,[21999,22000,22001],[30000,30000,30000]);
  for(let n=1;n<=3;n++)writeFileSync(join(dir,`vendor/run-${n}/calls.jsonl`),[
    {t:'2026-10-13T00:00:00Z',task:'T1',tool:'js',kind:'observe',ok:true,ms:20000},
    {task:'T1',done:'2026-10-13T00:00:20Z',ok:true},
  ].map(JSON.stringify).join('\n')+'\n');
  assert.equal(summarize(dir).verdict,'no regression');
  writeFileSync(join(dir,'cua/run-1/outcomes.json'),JSON.stringify({T1:{ok:false}}));
  writeFileSync(join(dir,'cua/run-1/calls.jsonl'),[
    {t:'2026-10-13T00:00:00Z',task:'T1',tool:'js',kind:'observe',ok:false,ms:21999},
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
  assert.match(output, /timing criterion:.*sum.*call.*ms.*wall time.*not judged/);
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

test('wall-time regression alone does not fail the tool-time verdict', t => {
  const report = summarize(fixture(t,[1000,1000,1000],[20000,22000,24000]));
  assert.equal(report.verdict, 'no regression');
  assert.deepEqual(report.tasks[0].cua.toolMs, {median:1000,min:1000,max:1000});
  assert.deepEqual(report.tasks[0].cua.wallMs, {median:22000,min:20000,max:24000});
});

test('tool-time regression fails even when wall time improves', t => {
  const report = summarize(fixture(t,[1600,1700,1800],[5000,6000,7000]));
  assert.equal(report.verdict, 'regression');
  assert.deepEqual(report.tasks[0].cua.toolMs, {median:1700,min:1600,max:1800});
  assert.deepEqual(report.tasks[0].cua.wallMs, {median:6000,min:5000,max:7000});
});

test('unmeasured or invalid tool-call durations cannot silently count as zero', t => {
  const dir = fixture(t), path = join(dir,'vendor/run-1/calls.jsonl');
  const calls = readFileSync(path,'utf8').trim().split('\n').map(JSON.parse);
  for (const ms of [null, undefined, -1, '200']) {
    calls[0].ms = ms;
    writeFileSync(path, calls.map(JSON.stringify).join('\n')+'\n');
    assert.throws(() => summarize(dir), /tool-call duration|call.*ms/);
  }
});

test('setup and cleanup timing is diagnostic, accepts unmeasured calls, but their outcomes count', t => {
  const dir = fixture(t);
  for (const service of ['vendor','cua']) for (let n=1;n<=3;n++) {
    const root = join(dir,service,`run-${n}`);
    const calls = readFileSync(join(root,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
    for (const task of ['T0','T9']) calls.push(
      {t:'2026-10-13T00:00:00Z',task,tool:'end_task',kind:'other',ok:true,ms:service==='vendor'?null:99999},
      {task,done:'2026-10-13T00:01:40Z',ok:true},
    );
    writeFileSync(join(root,'calls.jsonl'),calls.map(JSON.stringify).join('\n')+'\n');
    writeFileSync(join(root,'outcomes.json'),JSON.stringify({T1:{ok:true},T0:{ok:true},T9:{ok:true}}));
  }
  const report = summarize(dir);
  assert.equal(report.verdict,'no regression');
  for (const task of report.tasks.filter(r=>r.task!=='T1')) {
    assert.equal(task.timingJudged,false);
    assert.equal(task.vendor.toolMs,null);
    assert.deepEqual(task.vendor.wallMs,{median:100000,min:100000,max:100000});
    assert.deepEqual(task.cua.toolMs,{median:99999,min:99999,max:99999});
  }
  const root = join(dir,'cua/run-1');
  const calls = readFileSync(join(root,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  calls.find(r=>r.task==='T9'&&r.done).ok=false;
  writeFileSync(join(root,'calls.jsonl'),calls.map(JSON.stringify).join('\n')+'\n');
  writeFileSync(join(root,'outcomes.json'),JSON.stringify({T1:{ok:true},T0:{ok:true},T9:{ok:false}}));
  assert.equal(summarize(dir).verdict,'regression');
});

test('one available vendor run prints its descriptive measurements and incomplete status, not a verdict', t => {
  const dir = fixture(t);
  rmSync(join(dir,'vendor/run-2'),{recursive:true});
  rmSync(join(dir,'vendor/run-3'),{recursive:true});
  rmSync(join(dir,'cua'),{recursive:true});
  const report = summarize(dir);
  assert.equal(report.verdict,null);
  assert.deepEqual(report.incomplete,[{service:'vendor',runs:1}]);
  assert.deepEqual(report.runs[0].tasks,[{task:'T1',timingJudged:true,toolMs:1000,wallMs:10000,outcome:{ok:true}}]);
  const output = spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/bench-summary.mjs',import.meta.url)),dir],{encoding:'utf8'});
  assert.equal(output.status,1);
  assert.match(output.stdout,/vendor\/run-1 T1:.*"toolMs":1000.*"wallMs":10000/);
  assert.match(output.stdout,/incomplete: vendor has 1 of 3 runs/);
  assert.doesNotMatch(output.stdout,/verdict:/);
});

test('append-only deferred done markers use final scored outcomes without rewriting calls', t=>{
  const dir=fixture(t);
  const root=join(dir,'vendor/run-1'),path=join(root,'calls.jsonl');
  const calls=readFileSync(path,'utf8').trim().split('\n').map(JSON.parse);
  calls.find(r=>r.done).ok=null;
  calls.push({task:'T1',scored:true,ok:true,t:'2026-10-13T00:00:30Z'});
  writeFileSync(path,calls.map(JSON.stringify).join('\n')+'\n');
  assert.equal(summarize(dir).verdict,'no regression');
  calls.at(-1).ok=false;
  writeFileSync(path,calls.map(JSON.stringify).join('\n')+'\n');
  assert.throws(()=>summarize(dir),/score|inconsistent/);
  calls.pop();
  writeFileSync(path,calls.map(JSON.stringify).join('\n')+'\n');
  assert.throws(()=>summarize(dir),/score|inconsistent/);
  writeFileSync(join(root,'outcomes.json'),JSON.stringify({T1:{ok:null}}));
  assert.throws(()=>summarize(dir),/outcome|inconsistent/);
});

// Synthetic initialize/tool-result observations, not an env selection label.
function hostFixture(t, times) {
  const dir=fixture(t,times);
  for(const host of ['vendor','cua'])for(let n=1;n<=3;n++) {
    const path=join(dir,host,`run-${n}/meta.json`),meta=JSON.parse(readFileSync(path,'utf8'));
    Object.assign(meta,{experimentId:'host-parity',host,service:'cua',surfaces:['browser'],hostAttestations:[{
      host,serverInfo:{name:host==='cua'?'cua-repl-host':'node-repl',version:'1.0.0'},
      _meta:host==='cua'?{'cua/replHost':{host:'cua',version:'1.0.0'}}:null,
    }]});
    writeFileSync(path,JSON.stringify(meta));
  }
  return dir;
}
test('host axis judges host groups while retaining cua browser-service identity in data and CLI output',t=>{
  const dir=hostFixture(t),before=readFileSync(join(dir,'vendor/run-1/meta.json'),'utf8');
  const report=summarize(dir,{axis:'host'});
  assert.equal(report.verdict,'no regression');
  assert.equal(report.axis,'host');
  assert.equal(report.service,'cua');
  assert.deepEqual(report.runs.map(r=>[r.host,r.service,r.run]),[
    ['vendor','cua',1],['vendor','cua',2],['vendor','cua',3],['cua','cua',1],['cua','cua',2],['cua','cua',3],
  ]);
  assert.equal(report.tasks[0].vendor.toolMs.median,1000);
  assert.equal(readFileSync(join(dir,'vendor/run-1/meta.json'),'utf8'),before,'summary never rewrites archived identity');
  const script=fileURLToPath(new URL('../../scripts/bench-summary.mjs',import.meta.url));
  const run=spawnSync(process.execPath,[script,dir,'--axis','host'],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/comparison axis: host; browser service: cua/);
  assert.match(run.stdout,/verdict: no regression/);
  assert.equal(summarize(hostFixture(t,[1600,1700,1800]),{axis:'host'}).verdict,'regression');
});

test('host axis refuses missing, mismatched or mixed observed host metadata instead of inferring old evidence',t=>{
  const dir=hostFixture(t),path=join(dir,'cua/run-1/meta.json'),valid=JSON.parse(readFileSync(path,'utf8'));
  const mutations=[
    meta=>{delete meta.host;},
    meta=>{meta.host='vendor';},
    meta=>{delete meta.hostAttestations;},
    meta=>{meta.hostAttestations=[];},
    meta=>{meta.hostAttestations[0].host='vendor';},
    meta=>{meta.hostAttestations[0].serverInfo.name='node-repl';},
    meta=>{delete meta.hostAttestations[0].serverInfo.version;},
    meta=>{meta.hostAttestations[0]._meta={};},
    meta=>{meta.hostAttestations[0]._meta['cua/replHost'].host='vendor';},
    meta=>{meta.hostAttestations[0]._meta['cua/replHost'].version='old';},
    meta=>{meta.hostAttestations.push({host:'vendor',serverInfo:{name:'node-repl',version:'1'},_meta:null});},
  ];
  for(const change of mutations) {
    const meta=structuredClone(valid);change(meta);writeFileSync(path,JSON.stringify(meta));
    assert.throws(()=>summarize(dir,{axis:'host'}),/host attestation/i);
  }
  writeFileSync(path,JSON.stringify(valid));
  const vendorPath=join(dir,'vendor/run-1/meta.json'),vendor=JSON.parse(readFileSync(vendorPath,'utf8'));
  for(const change of [
    meta=>{delete meta.hostAttestations[0]._meta;},
    meta=>{meta.hostAttestations[0]._meta={'cua/replHost':null};},
    meta=>{meta.hostAttestations[0].serverInfo.name='cua-repl-host';},
  ]) {
    const meta=structuredClone(vendor);change(meta);writeFileSync(vendorPath,JSON.stringify(meta));
    assert.throws(()=>summarize(dir,{axis:'host'}),/host attestation/i);
  }
  // #113 archived service evidence is still readable on its original axis only.
  assert.throws(()=>summarize(fixture(t),{axis:'host'}),/host attestation|service attestation/i);
});

test('host axis validates actual browser service and labels partial groups as hosts, not services',t=>{
  const dir=hostFixture(t),path=join(dir,'vendor/run-1/meta.json'),meta=JSON.parse(readFileSync(path,'utf8'));
  writeFileSync(path,JSON.stringify({...meta,service:'vendor'}));
  assert.throws(()=>summarize(dir,{axis:'host'}),/service attestation/);
  writeFileSync(path,JSON.stringify(meta));
  rmSync(join(dir,'cua/run-3'),{recursive:true});
  const report=summarize(dir,{axis:'host'});
  assert.equal(report.verdict,null);
  assert.deepEqual(report.incomplete,[{host:'cua',runs:2}]);
  assert.equal(report.runs[0].service,'cua');
});

test('service axis stays explicit or default; unknown axes and CLI flags fail closed',t=>{
  const dir=fixture(t);
  assert.deepEqual(summarize(dir,{axis:'service'}),summarize(dir));
  assert.throws(()=>summarize(dir,{axis:'other'}),/axis/);
  const script=fileURLToPath(new URL('../../scripts/bench-summary.mjs',import.meta.url));
  for(const args of [['--axis','other'],['--axis']]) {
    const run=spawnSync(process.execPath,[script,dir,...args],{encoding:'utf8'});
    assert.equal(run.status,1);assert.doesNotMatch(run.stdout,/verdict:/);assert.match(run.stderr,/axis/);
  }
});
