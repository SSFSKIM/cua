import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Writable} from 'node:stream';
import {nativeProvenance} from '../../scripts/native-baseline/provenance.mjs';

test('the answering executable is captured from the actual launch, never an initialize cache', async () => {
  const messages=[];
  const output=new Writable({write(chunk,_e,done){messages.push(JSON.parse(chunk));done();}});
  const proof=nativeProvenance({home:'/scratch',host:'cua',mode:'managed',output,versionOf:()=> 'v24.22.0'});
  const send=message=>new Promise((resolve,reject)=>proof.output.write(JSON.stringify(message)+'\n',e=>e?reject(e):resolve()));
  await send({id:1,result:{protocolVersion:'2025-06-18',serverInfo:{name:'cua-repl-host',version:'0.5.0'}}});
  assert.equal(messages[0].result._meta,undefined);
  const launch={command:'/scratch/node/24.22.0/bin/node',args:['--disable-sigusr1','supervisor.mjs']};
  assert.equal(proof.prepareLaunch(launch),launch);
  await send({id:2,result:{content:[],_meta:{'cua/replHost':{host:'cua',version:'0.5.0'}}}});
  assert.deepEqual(messages[1].result._meta['cua/nativeExecution'],{path:launch.command,version:'v24.22.0'});
  assert.deepEqual(messages[1].result._meta['cua/replHost'],{host:'cua',version:'0.5.0'});
  assert.throws(()=>proof.prepareLaunch({...launch,command:'/foreign/node'}),/managed Node/);
});

// What confines the launch's children, as the same-host comparison (#115 acceptance 11) permits it to change: the
// launcher CODEX_CLI_PATH names (the Codex CLI, cua's compat executable, or none: cua's own launcher) and whether
// TMPDIR is the session's own directory under the home or the caller's.
test('the sandbox launch witness classifies the launcher and the TMPDIR of the actual launch', async () => {
  const {sandboxLaunchOf} = await import('../../scripts/native-baseline/provenance.mjs');
  const home = '/scratch/home';
  const of = env => sandboxLaunchOf({command: '/node', env}, home);
  assert.deepEqual(of({CODEX_CLI_PATH: home + '/runtimes/r/CodexCLI.app/Contents/MacOS/codex', TMPDIR: '/var/folders/xy/T/'}), {launcher: 'codex-cli', tmpdir: 'inherited'});
  assert.deepEqual(of({CODEX_CLI_PATH: '/checkout/bin/cua-codex-compat', TMPDIR: home + '/run/abc/tmp'}), {launcher: 'cua-compat', tmpdir: 'session'});
  assert.deepEqual(of({TMPDIR: home + '/tmp/abc'}), {launcher: 'cua', tmpdir: 'session'});
  assert.deepEqual(of({}), {launcher: 'cua', tmpdir: 'unset'});
  assert.deepEqual(of({TMPDIR: home + '/runner'}), {launcher: 'cua', tmpdir: 'inherited'});
});

test('every real answer after the launch carries the sandbox launch witness beside the answering executable', async () => {
  const messages=[];
  const output=new Writable({write(chunk,_e,done){messages.push(JSON.parse(chunk));done();}});
  const proof=nativeProvenance({home:'/scratch',host:'vendor',mode:'managed',output,versionOf:()=> 'v24.21.0'});
  const send=message=>new Promise((resolve,reject)=>proof.output.write(JSON.stringify(message)+'\n',e=>e?reject(e):resolve()));
  proof.prepareLaunch({command:'/scratch/runtimes/r/node',args:[],env:{CODEX_CLI_PATH:'/scratch/runtimes/r/codex',TMPDIR:'/tmp/caller'}});
  await send({id:2,result:{content:[]}});
  assert.deepEqual(messages[0].result._meta,{'cua/nativeExecution':{path:'/scratch/runtimes/r/node',version:'v24.21.0'},'cua/sandboxLaunch':{launcher:'codex-cli',tmpdir:'inherited'}});
});
