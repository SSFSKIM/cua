import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanupBrowserDownload} from '../../scripts/repl-parity/download-cleanup.mjs';
const proof={kind:'repl-parity-fixture-download',newHandle:true,uploadAcknowledged:true,path:'/fixture/parity.txt',realPath:'/fixture/parity.txt',basename:'parity.txt',dev:'1',ino:'2',size:16};
const client={call:async()=>({isError:false,content:[{type:'text',text:'CUA_PARITY_RESULT '+JSON.stringify({ok:true,value:proof})}]})};
const prepared={device:'mini',checkout:'/fixture/clone',commit:'a'.repeat(40)};
test('cleanup proof stays on private stdin, never remote argv or returned evidence',async()=>{
 const calls=[];const result=await cleanupBrowserDownload({client,prepared},{run:(...args)=>{calls.push(args);return 'true\n';}});
 assert.equal(result,true);assert.equal(calls.length,1);const [command,args,options]=calls[0];assert.equal(command,'ssh');assert.ok(!JSON.stringify(args).includes(proof.path));assert.deepEqual(JSON.parse(options.input),proof);assert.match(args.at(-1),/cleanup-download\.mjs/);assert.match(args.at(-1),/git rev-parse HEAD/);
});
test('cleanup refuses failed/malformed proofs, helper refusals and process failures without echoing proof',async()=>{
 for(const result of ['false\n','unexpected',null])await assert.rejects(()=>cleanupBrowserDownload({client,prepared},{run:()=>result}),/^Error: Owned fixture download cleanup failed$/);
 await assert.rejects(()=>cleanupBrowserDownload({client,prepared},{run:()=>{throw Error(proof.path);}}),/^Error: Owned fixture download cleanup failed$/);
 await assert.rejects(()=>cleanupBrowserDownload({client:{call:async()=>({isError:true,content:[]})},prepared},{run:()=>{throw Error('must not launch');}}),/proof unavailable/);
});
