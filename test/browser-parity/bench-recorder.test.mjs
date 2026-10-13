import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
const source = readFileSync(new URL('./bench-recorder.js',import.meta.url),'utf8');
const epoch = Date.parse('2026-10-13T00:00:00Z');
async function recorder(t, {baseDir, fileSystem = fs} = {}) {
  if (!baseDir) {baseDir=fs.mkdtempSync(join(tmpdir(),'bench-recorder-'));t.after(()=>fs.rmSync(baseDir,{recursive:true,force:true}));}
  const clock = {wall:epoch,mono:100};
  class ClockDate extends Date {constructor(...args) {super(...(args.length ? args : [clock.wall]));} static now() {return clock.wall;}}
  const context = vm.createContext({Date:ClockDate,performance:{now:()=>clock.mono}});
  vm.runInContext(source,context);
  const state=await context.bench.init({service:'vendor',run:1,fs:fileSystem,os:{tmpdir:()=>baseDir}});
  return {bench:context.bench,clock,baseDir,directory:state.directory,state};
}
const rows = bench => bench.dump().calls.trim().split('\n').map(JSON.parse);

test('recorder measures awaited call time monotonically and records start/end timestamps without manual rows', async t=>{
  const {bench,clock} = await recorder(t);
  bench.start('T1');
  assert.equal(await bench.call('tab.title','observe',async()=>{clock.mono+=23.5;clock.wall+=2000;return 'title';},'read title'),'title');
  bench.done('title',true);
  assert.deepEqual(rows(bench),[
    {t:'2026-10-13T00:00:00.000Z',task:'T1',tool:'tab.title',kind:'observe',ok:true,ms:23.5,note:'read title'},
    {task:'T1',done:'2026-10-13T00:00:02.000Z',answer:'title',ok:true},
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(bench.dump().outcomes)),{T1:{answer:'title',ok:true}});
});

test('failed calls retain duration and error message, then rethrow the original error',async t=>{
  const {bench,clock}=await recorder(t),failure=new Error('fixture failed');
  bench.start('T2');
  await assert.rejects(bench.call('tab.goto','action',async()=>{clock.mono+=12;throw failure;},'navigate'),e=>e===failure);
  assert.deepEqual(rows(bench),[{t:'2026-10-13T00:00:00.000Z',task:'T2',tool:'tab.goto',kind:'action',ok:false,ms:12,note:'navigate',error:'fixture failed'}]);
  bench.done(null,false);
  assert.equal(bench.dump().outcomes.T2.ok,false);
});

test('deferred scoring preserves append-only done rows and dumps are independent snapshots',async t=>{
  const {bench,clock}=await recorder(t);
  bench.start('T1');
  await bench.call('tab.read','observe',async()=>42);
  bench.done(42,null);
  const before=bench.dump();
  clock.wall+=10000;
  bench.score('T1',true);
  const after=bench.dump();
  assert.equal(before.outcomes.T1.ok,null);
  assert.equal(after.outcomes.T1.ok,true);
  assert.equal(JSON.parse(before.calls.trim().split('\n').at(-1)).done,after.calls.trim().split('\n').map(JSON.parse).find(r=>r.done).done);
  assert.ok(after.calls.startsWith(before.calls),'scoring only appends an audit row');
  assert.equal(after.calls.trim().split('\n').map(JSON.parse).find(r=>r.done).ok,null);
  assert.deepEqual(JSON.parse(after.calls.trim().split('\n').at(-1)),{task:'T1',scored:true,ok:true,t:'2026-10-13T00:00:10.000Z'});
  after.outcomes.T1.ok=false;
  assert.equal(bench.dump().outcomes.T1.ok,true);
});

test('external MCP measurements enter only diagnostic setup/cleanup tasks',async t=>{
  const {bench}=await recorder(t);
  bench.start('T0');
  bench.recordExternal('profiles_list','other',{t:'2026-10-13T00:00:00.000Z',ms:321,ok:true,note:'shell-timed MCP call'});
  bench.done('ready',true);
  assert.equal(rows(bench)[0].ms,321);
  bench.start('T1');
  assert.throws(()=>bench.recordExternal('tab.title','observe',{t:'2026-10-13T00:00:00Z',ms:10,ok:true}),/T0|T9/);
});

test('recorder refuses missing task ids, duplicate completion and invalid correctness flags',async t=>{
  const {bench}=await recorder(t);
  await assert.rejects(bench.call('tab.title','observe',async()=>''),/start/);
  assert.throws(()=>bench.start(''),/task/);
  bench.start('T1');
  assert.throws(()=>bench.done('answer','yes'),/ok/);
  bench.done('answer',true);
  assert.throws(()=>bench.done('answer',true),/start|complete/);
  assert.throws(()=>bench.start('T1'),/complete/);
  assert.throws(()=>bench.score('T2',true),/completed/);
});

test('calls, failures, completion and scores persist before any dump is requested',async t=>{
  const {bench,directory,clock}=await recorder(t);
  const callsPath=join(directory,'calls.jsonl'),outcomesPath=join(directory,'outcomes.json');
  bench.start('T1');
  await bench.call('tab.title','observe',async()=>{clock.mono+=7;return 'fixture';});
  assert.equal(readFileSync(callsPath,'utf8').trim().split('\n').length,1);
  await assert.rejects(bench.call('tab.goto','action',async()=>{throw new Error('navigation failed');}),/navigation failed/);
  assert.equal(JSON.parse(readFileSync(callsPath,'utf8').trim().split('\n').at(-1)).ok,false);
  bench.done('fixture',null);
  const journal=readFileSync(callsPath,'utf8');
  assert.equal(JSON.parse(readFileSync(outcomesPath,'utf8')).T1.ok,null);
  bench.score('T1',true);
  assert.ok(readFileSync(callsPath,'utf8').startsWith(journal));
  assert.equal(JSON.parse(readFileSync(callsPath,'utf8').trim().split('\n').at(-1)).scored,true);
  assert.deepEqual(JSON.parse(readFileSync(outcomesPath,'utf8')),{T1:{answer:'fixture',ok:true}});
});

test('a fresh REPL reopens the same files, restores an unfinished task and never duplicates completed T0',async t=>{
  const first=await recorder(t);
  first.bench.start('T0');
  first.bench.recordExternal('profiles_list','other',{t:'2026-10-13T00:00:00Z',ms:10,ok:true});
  first.bench.done('ready',true);
  first.bench.start('T1');
  await first.bench.call('tab.title','observe',async()=>'fixture');
  const previous=readFileSync(join(first.directory,'calls.jsonl'),'utf8');
  const resumed=await recorder(t,{baseDir:first.baseDir});
  assert.equal(resumed.directory,first.directory);
  assert.deepEqual([...resumed.state.completed],['T0']);
  assert.equal(resumed.state.currentTask,'T1');
  assert.equal(readFileSync(join(first.directory,'calls.jsonl'),'utf8'),previous);
  assert.throws(()=>resumed.bench.start('T0'),/complete/);
  await resumed.bench.call('tab.url','observe',async()=>'http://fixture/');
  resumed.bench.done('fixture',null);
  resumed.bench.score('T1',true);
  const again=await recorder(t,{baseDir:first.baseDir});
  const persisted=readFileSync(join(first.directory,'calls.jsonl'),'utf8');
  assert.ok(persisted.startsWith(previous));
  assert.equal(persisted.trim().split('\n').map(JSON.parse).filter(r=>r.task==='T0'&&r.done).length,1);
  assert.equal(again.bench.dump().outcomes.T1.ok,true);
});

test('reopening recovers a done row if interruption prevented the outcome snapshot write',async t=>{
  let fail=false;
  const fileSystem={...fs,renameSync(...args){if(fail)throw new Error('interrupted snapshot');return fs.renameSync(...args);}};
  const first=await recorder(t,{fileSystem});
  first.bench.start('T1');
  await first.bench.call('tab.title','observe',async()=>'fixture');
  fail=true;
  assert.throws(()=>first.bench.done('fixture',true),/interrupted snapshot/);
  const resumed=await recorder(t,{baseDir:first.baseDir});
  assert.deepEqual(JSON.parse(readFileSync(join(resumed.directory,'outcomes.json'),'utf8')),{T1:{answer:'fixture',ok:true}});
  assert.throws(()=>resumed.bench.start('T1'),/complete/);
});

test('default node imports use os.tmpdir rather than the hard-coded /tmp path', t=>{
  const baseDir=fs.mkdtempSync(join(tmpdir(),'bench-recorder-imports-'));
  t.after(()=>fs.rmSync(baseDir,{recursive:true,force:true}));
  const code=`await import(${JSON.stringify(new URL('./bench-recorder.js',import.meta.url).href)});const state=await bench.init({service:'vendor',run:1});bench.start('T1');await bench.call('tab.title','observe',async()=>42);bench.done(42,true);console.log(JSON.stringify(state));`;
  const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',env:{...process.env,TMPDIR:baseDir,TMP:baseDir,TEMP:baseDir}}));
  assert.equal(result.directory,join(baseDir,'cua-bench/vendor-run-1'));
  assert.equal(JSON.parse(readFileSync(join(result.directory,'outcomes.json'),'utf8')).T1.answer,42);
});

test('score audit recovers final correctness if a reset interrupts the outcome snapshot',async t=>{
  let fail=false;
  const fileSystem={...fs,renameSync(...args){if(fail)throw new Error('interrupted score snapshot');return fs.renameSync(...args);}};
  const first=await recorder(t,{fileSystem});
  first.bench.start('T1');
  await first.bench.call('tab.title','observe',async()=>'fixture');
  first.bench.done('fixture',null);
  fail=true;
  assert.throws(()=>first.bench.score('T1',true),/interrupted score snapshot/);
  const resumed=await recorder(t,{baseDir:first.baseDir});
  assert.equal(JSON.parse(readFileSync(join(resumed.directory,'outcomes.json'),'utf8')).T1.ok,true);
});
