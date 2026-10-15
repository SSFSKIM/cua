import {test} from 'node:test';import assert from 'node:assert/strict';
import {chromeLaunchFacts} from '../../scripts/repl-parity/chrome-launch.mjs';
test('Linux launch facts retain reproducible safe flags but no URLs, unknown values or unrelated environment',()=>{
 const records={1:['chrome',['/opt/google/chrome/chrome','--disable-gpu','--disable-background-timer-throttling','--profile-directory=Default','--token=synthetic-private','https://private.invalid/'],['DISPLAY=:0','PASSWORD=synthetic-private']],2:['chrome',['/opt/google/chrome/chrome','--type=renderer'],['DISPLAY=:0']],3:['chrome',['/opt/google/chrome/chrome'],['DISPLAY=:1']]};
 const fs={readdirSync:()=>Object.keys(records),readFileSync:path=>{const [,pid,file]=/^\/proc\/(\d+)\/(.*)$/.exec(path);const r=records[pid];return file==='comm'?r[0]+'\n':(file==='cmdline'?r[1]:r[2]).join('\0')+'\0';}};
 const facts=chromeLaunchFacts(fs,{display:':0',home:'/fixture/h4'});assert.equal(facts.length,1);assert.deepEqual(facts[0],{executable:'/opt/google/chrome/chrome',flags:['--disable-gpu','--disable-background-timer-throttling','--profile-directory=Default'],display:':0',profileDirectory:'Default',registrationHome:'/fixture/h4',unrecordedFlagNames:['--token'],omittedPositionalArguments:1});assert.ok(!JSON.stringify(facts).includes('synthetic-private'));assert.ok(!JSON.stringify(facts).includes('private.invalid'));
 assert.throws(()=>chromeLaunchFacts(fs,{display:':2',home:'/fixture/h4'}),/Chrome/);
});
