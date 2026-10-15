import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,lstat,realpath,rename,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {cleanupDownload} from './cleanup-download.mjs';
async function scratch(t){const dir=await mkdtemp(join(tmpdir(),'cleanup-download-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
async function proof(path){const identity=await lstat(path,{bigint:true});return {kind:'repl-parity-fixture-download',newHandle:true,uploadAcknowledged:true,path,realPath:await realpath(path),basename:basename(path),dev:identity.dev.toString(),ino:identity.ino.toString(),size:16};}
async function cli(input){
 const child=spawn(process.execPath,[fileURLToPath(new URL('./cleanup-download.mjs',import.meta.url))],{stdio:['pipe','pipe','pipe']});
 let stdout='',stderr='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);
 const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve({code,stdout,stderr}));});child.stdin.end(input);return done;
}

test('harness cleanup removes only the newly attested selected artifact for each exact filename grammar',async t=>{
 const dir=await scratch(t),neighbor=join(dir,'parity (999).txt');await writeFile(neighbor,'parity download\n');
 for(const name of ['parity.txt','parity (27).txt','parity - 2026-10-15T003412.123.txt']){
  const path=join(dir,name);await writeFile(path,'parity download\n');assert.equal(await cleanupDownload(await proof(path)),true);await assert.rejects(readFile(path),{code:'ENOENT'});
 }
 assert.equal(await readFile(neighbor,'utf8'),'parity download\n');
});

test('a plausible path is insufficient without private new-handle and upload acknowledgement proof',async t=>{
 const dir=await scratch(t),path=join(dir,'parity.txt');await writeFile(path,'parity download\n');const original=await proof(path);
 for(const change of [p=>{p.newHandle=false;},p=>{delete p.newHandle;},p=>{p.uploadAcknowledged=false;},p=>{p.kind='other';},p=>{delete p.dev;},p=>{p.size=17;},p=>{p.realPath='/not-the-attested-file';},p=>{p.basename='other.txt';}]){
  const bad={...original};change(bad);assert.equal(await cleanupDownload(bad),false);assert.equal(await readFile(path,'utf8'),'parity download\n');
 }
});

test('unknown names, wrong bytes and symlinks are never removed even with an apparent proof',async t=>{
 const dir=await scratch(t);
 for(const [name,body] of [['owner-document.txt','parity download\n'],['parity - 2026-10-15T003412.1234.txt','parity download\n'],['parity.txt','not fixture data']]){
  const path=join(dir,name);await writeFile(path,body);assert.equal(await cleanupDownload(await proof(path)),false);assert.equal(await readFile(path,'utf8'),body);
 }
 const target=join(dir,'parity (1).txt'),link=join(dir,'parity (2).txt');await writeFile(target,'parity download\n');await symlink(target,link);
 assert.equal(await cleanupDownload(await proof(link)),false);assert.equal(await readFile(target,'utf8'),'parity download\n');assert.equal(await readFile(link,'utf8'),'parity download\n');
});

test('replaced inode with identical fixture bytes cannot satisfy a stale kernel attestation',async t=>{
 const dir=await scratch(t),path=join(dir,'parity.txt'),replacement=join(dir,'replacement');await writeFile(path,'parity download\n');const original=await proof(path);
 await writeFile(replacement,'parity download\n');await rename(replacement,path);assert.equal(await cleanupDownload(original),false);assert.equal(await readFile(path,'utf8'),'parity download\n');
});

test('stdin-only remote command returns a boolean, never a path, basename, contents or filesystem error',async t=>{
 const dir=await scratch(t),path=join(dir,'parity.txt');await writeFile(path,'parity download\n');assert.deepEqual(await cli(JSON.stringify(await proof(path))),{code:0,stdout:'true\n',stderr:''});
 const unknown=join(dir,'private-owner-document.txt');await writeFile(unknown,'parity download\n');
 assert.deepEqual(await cli(JSON.stringify(await proof(unknown))),{code:1,stdout:'false\n',stderr:''});assert.equal(await readFile(unknown,'utf8'),'parity download\n');
 assert.deepEqual(await cli('{invalid-json'),{code:1,stdout:'false\n',stderr:''});
});

test('kernel cleanup cell only attests and hands off private proof; harness performs the actual unlink',async t=>{
 const {default:scenarios}=await import('./scenarios/browser-members.mjs');
 const {parseCell}=await import('../../scripts/browser-parity/runner.mjs');
 const scenario=scenarios.find(s=>s.id==='api/browser-playwrightdownload/path'),cell=scenario.cells.find(c=>c.label==='cleanup');
 const dir=await scratch(t),path=join(dir,'parity.txt');await writeFile(path,'parity download\n');
 const content=[],globals={},AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 await new AsyncFunction('globalThis','download','uploadPath','uploadName','tab','nodeRepl',cell.code)(globals,{path:async()=>path},await realpath(path),'parity.txt',{playwright:{locator:()=>({textContent:async()=>'parity.txt'})}},{write:text=>content.push({type:'text',text})});
 assert.deepEqual(parseCell({content}),{ok:true,value:true});
 assert.equal(await readFile(path,'utf8'),'parity download\n');
 assert.equal(scenario.cleanupDownload,true);
 assert.deepEqual(globals.__replDownloadCleanup,await proof(path));
 assert.ok(!JSON.stringify(content).includes(dir));assert.ok(!JSON.stringify(content).includes('parity.txt'));
 assert.equal(await cleanupDownload(globals.__replDownloadCleanup),true);await assert.rejects(readFile(path),{code:'ENOENT'});
});
