import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {attest, runScenario} from '../../scripts/browser-parity/runner.mjs';
import {miniPrepareCommand, serveCommand} from '../../scripts/browser-parity/topology.mjs';
const exec = promisify(execFile);
const repo = resolve(import.meta.dirname,'../..');
test('attestation refuses wrong marker and missing selected-browser documentation', () => {
  assert.equal(attest('# Selected Browser\n- Name: cua\n- Type: extension', 'vendor').service,'vendor');
  assert.equal(attest('# Selected Browser\ncua browser service 0.1.0', 'cua').service,'cua');
  assert.throws(() => attest('# Selected Browser\ncua browser service 0.1.0','vendor'), /attestation/);
  assert.throws(() => attest('# Selected Browser\n- Name: cua','cua'), /attestation/);
  assert.throws(() => attest('hello','vendor'), /attestation/);
});
test('mini commands pin clone and environment with BatchMode without touching resident checkout', () => {
  const p = miniPrepareCommand({device:'mini',commit:'abcdef1',profile:"ss'fs"});
  assert.equal(p.command,'ssh'); assert.deepEqual(p.args.slice(0,3),['-o','BatchMode=yes','mini']);
  assert.match(p.args[3], /cua-parity/); assert.match(p.args[3], /git checkout --detach 'abcdef1'/);
  assert.match(p.args[3], /npm ci/); assert.doesNotMatch(p.args[3], /'profiles','bind'/); assert.match(p.args[3], /already-bound ready profile/);
  assert.doesNotMatch(p.args[3], /agent install|launchctl|pkill/);
  const run = serveCommand({device:'mini',service:'cua',home:'/tmp/cua',checkout:'/tmp/parity'});
  assert.match(run.args[3], /CUA_BROWSER_SERVICE='cua'/);
  assert.match(run.args[3], /CUA_SHIM_SURFACES='browser'/);
});
test('local CLI exercises MCP, deterministic elicitation acceptance, scenario cells, assertions and diff', async t => {
  const root = mkdtempSync(join(tmpdir(),'parity-run-')); t.after(() => rmSync(root,{recursive:true,force:true}));
  for (const suffix of ['a','b']) {
    const {stdout} = await exec(process.execPath, ['scripts/browser-parity.mjs','run','--device','local','--service','vendor','--out',join(root,suffix)], {cwd:repo,timeout:30000});
    assert.match(stdout,/attested: vendor/); assert.match(stdout,/case examples\/tabs ok/);
    const meta = JSON.parse(readFileSync(join(root,suffix,'meta.json'),'utf8'));
    assert.equal(meta.backend,'fake'); assert.equal(meta.profile,'scratch');
    assert.ok(meta.elicitations.some(e => e.action === 'accept'));
    const rows = readFileSync(join(root,suffix,'results.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(rows.some(r => r.cell === 'created' && r.ok && r.value.tabId));
    assert.ok(rows.some(r => r.case === 'examples/concurrency' && r.assertion?.ok));
    assert.ok(rows.some(r => r.cell === 'join' && r.value === 'armed'));
  }
  const {stdout} = await exec(process.execPath,['scripts/browser-parity.mjs','diff',join(root,'a'),join(root,'b')],{cwd:repo});
  assert.match(stdout,/0 differences/);
});

test('scenario asserts expected errors independently and fails bad assertions even without a comparison', async()=>{
  const {startFixture}=await import('./fixture/serve.mjs');
  const {StdioClient}=await import('../../scripts/browser-parity/mcp.mjs');
  const fixture=await startFixture({port:0}),home=mkdtempSync(join(tmpdir(),'parity-errors-'));
  const client=new StdioClient(serveCommand({device:'local',service:'vendor',home}));
  try {
    await client.initialize();const emitted=[];
    const result=await runScenario({id:'errors',milestone:'M1a',commands:[],setup:{},cells:[{label:'error',code:'throw Object.assign(new Error("expected"),{code:"timeout"});'}],
      assert:({results})=>({ok:results[0].error.code==='timeout'})},{client,fixtureURL:fixture.url,instanceId:'fake',emit:r=>emitted.push(r)});
    assert.equal(result.assertion.ok,true);assert.equal(emitted[0].ok,false);assert.equal(emitted[0].error.message,'expected');
    const bad=await runScenario({id:'bad',milestone:'M1a',commands:[],setup:{},cells:[],assert:()=>{throw new Error('wrong state');}},
      {client,fixtureURL:fixture.url,instanceId:'fake',emit:()=>{}});
    assert.deepEqual(bad.assertion,{ok:false,reason:'wrong state'});
  } finally {await client.close();await fixture.close();rmSync(home,{recursive:true,force:true});}
});

test('named clients keep independent REPL globals and are initialized only once',async()=>{
  const {startFixture}=await import('./fixture/serve.mjs');
  const {StdioClient}=await import('../../scripts/browser-parity/mcp.mjs');
  const fixture=await startFixture({port:0}),home=mkdtempSync(join(tmpdir(),'parity-clients-')),clients=[];
  const connect=async()=>{const client=new StdioClient(serveCommand({device:'local',service:'vendor',home}));clients.push(client);await client.initialize();return client;};
  try {
    const result=await runScenario({id:'clients',milestone:'M1a',commands:[],setup:{},cells:[
      {label:'first',code:'globalThis.clientValue="primary";return clientValue;'},
      {label:'second',client:'second',code:'globalThis.clientValue="secondary";return clientValue;'},
      {label:'second-again',client:'second',code:'return clientValue;'},
      {label:'first-again',code:'return clientValue;'},
    ],assert:({results})=>({ok:results.map(r=>r.value).join(',')==='primary,secondary,secondary,primary'})},
      {client:await connect(),createClient:connect,fixtureURL:fixture.url,instanceId:'fake',emit:()=>{}});
    assert.equal(result.assertion.ok,true);assert.equal(clients.length,2);
  } finally {for(const c of clients)await c.close();await fixture.close();rmSync(home,{recursive:true,force:true});}
});

test('local trace activation refuses an existing observer and cleanup removes only its own files',async t=>{
  const {traceControl}=await import('../../scripts/browser-parity/resources.mjs');
  const {writeFileSync,existsSync}=await import('node:fs');
  const home=mkdtempSync(join(tmpdir(),'parity-trace-control-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  const path=join(home,'trace.jsonl'),trace=traceControl({device:'local',home,path});
  assert.deepEqual(await trace.read(),[]);
  assert.throws(()=>traceControl({device:'local',home,path:join(home,'other.jsonl')}),/EEXIST/);
  writeFileSync(path,JSON.stringify({cdp:'Page.navigate'})+'\n');
  assert.deepEqual(await trace.read(),[{cdp:'Page.navigate'}]);
  trace.close();assert.equal(existsSync(join(home,'state/host-trace.json')),false);assert.equal(existsSync(path),false);
});

test('binary cell results use MCP image blocks, not oversized JSON text; tool errors cannot masquerade as success',async()=>{
  const vm=await import('node:vm');
  const {cellCode,parseCell}=await import('../../scripts/browser-parity/runner.mjs');
  const content=[];
  await vm.runInNewContext(`(async()=>{${cellCode({code:'return {shot:new Uint8Array([255,216,255,217])};'})}})()`,{
    nodeRepl:{write:text=>content.push({type:'text',text}),emitImage:bytes=>content.push({type:'image',mimeType:'image/jpeg',data:Buffer.from(bytes).toString('base64')})},
  });
  assert.equal(content.filter(c=>c.type==='image').length,1);
  assert.deepEqual(parseCell({content}).value,{shot:{type:'image',mimeType:'image/jpeg',data:'/9j/2Q=='}});
  assert.equal(parseCell({isError:true,content:[{type:'text',text:'CUA_PARITY_RESULT {"ok":true,"value":1}\nlater tool error'}]}).ok,false);
});
