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
