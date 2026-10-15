import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,realpath,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {downloadDiagnosticCode} from './download-diagnostic.mjs';
import {cleanupDownload} from './cleanup-download.mjs';

async function run(path){
 const calls=[];
 const tab={goto:async url=>calls.push(['goto',url]),playwright:{waitForEvent:async(event,options)=>{calls.push(['wait',event,options.timeoutMs]);return {path:async()=>path};},locator:selector=>({click:async()=>calls.push(['click',selector])})}};
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 return {value:await new AsyncFunction('tab','fixtureURL',downloadDiagnosticCode)(tab,'http://fixture'),calls};
}
async function scratch(t){const dir=await mkdtemp(join(tmpdir(),'download-diagnostic-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}

test('diagnostic arms exactly one bounded fixture download and attests without kernel deletion',async t=>{
 const dir=await scratch(t),path=join(dir,'parity (12).txt'),neighbor=join(dir,'parity.txt');
 await writeFile(path,'parity download\n');await writeFile(neighbor,'parity download\n');
 const {value,calls}=await run(path);
 assert.deepEqual(calls,[['goto','http://fixture/downloads.html'],['wait','download',10000],['click','#download']]);
 assert.equal(value.kind,'string');assert.equal(value.absolute,true);assert.equal(value.basenameClass,'fixture-parity-txt');assert.equal(value.basename,'parity (12).txt');
 assert.equal(value.contentMatches,true);assert.equal(value.attested,true);assert.equal(value.cleaned,false);
 assert.equal(await readFile(path,'utf8'),'parity download\n');assert.equal(await readFile(neighbor,'utf8'),'parity download\n');
 assert.ok(!JSON.stringify(value).includes(dir));
});

test('unknown basename is hashed/classified but never emitted, read for content, or removed',async t=>{
 const dir=await scratch(t),basename='private-owner-document.txt',path=join(dir,basename);await writeFile(path,'parity download\n');
 const {value}=await run(path);assert.equal(value.basename,undefined);assert.equal(value.basenameClass,'other');
 assert.equal(value.basenameHash,createHash('sha256').update(basename).digest('hex'));assert.equal(value.contentMatches,undefined);assert.equal(value.cleaned,false);
 assert.equal(await readFile(path,'utf8'),'parity download\n');assert.ok(!JSON.stringify(value).includes(basename));assert.ok(!JSON.stringify(value).includes(dir));
});

test('a new fixture-looking collision format is diagnostic evidence, not permission to broaden accepted paths',async t=>{
 const dir=await scratch(t),basename='parity - 2026-10-15T0034.txt',path=join(dir,basename);await writeFile(path,'parity download\n');
 const {value}=await run(path);assert.equal(value.basenameClass,'fixture-prefixed-unrecognized');assert.equal(value.basename,undefined);
 assert.equal(value.contentMatches,undefined);assert.equal(value.cleaned,false);assert.ok(!JSON.stringify(value).includes(basename));
 assert.equal(await readFile(path,'utf8'),'parity download\n');
});

test('known fixture name with wrong contents remains untouched and no returned content or filesystem path leaks',async t=>{
 const dir=await scratch(t),path=join(dir,'parity.txt');await writeFile(path,'owner fixture mismatch');
 const {value}=await run(path);assert.equal(value.contentMatches,false);assert.equal(value.cleaned,false);
 assert.equal(await readFile(path,'utf8'),'owner fixture mismatch');assert.ok(!JSON.stringify(value).includes('owner fixture mismatch'));assert.ok(!JSON.stringify(value).includes(dir));
});

test('known-name symlinks are not followed or removed',async t=>{
 const dir=await scratch(t),target=join(dir,'private-owner-file'),path=join(dir,'parity.txt');await writeFile(target,'parity download\n');await symlink(target,path);
 const {value}=await run(path);assert.equal(value.regularFile,false);assert.equal(value.cleaned,false);assert.equal(value.contentMatches,undefined);
 assert.equal(await readFile(target,'utf8'),'parity download\n');assert.equal(await readFile(path,'utf8'),'parity download\n');
});

test('null, relative and non-string path results cannot cause file access or cleanup',async()=>{
 for(const path of [null,'parity.txt',{path:'private-owner-name'}]){
  const {value}=await run(path);assert.equal(value.cleaned,false);assert.equal(value.contentMatches,undefined);assert.ok(!JSON.stringify(value).includes('private-owner-name'));
 }
});

async function cleanup(path,{selectedName=path.split('/').at(-1),uploadPath}={}){
 uploadPath??=await realpath(path);
 const {default:scenarios}=await import('./scenarios/browser-members.mjs');
 const {parseCell}=await import('../../scripts/browser-parity/runner.mjs');
 const cell=scenarios.find(s=>s.id==='api/browser-playwrightdownload/path').cells.find(c=>c.label==='cleanup');
 const content=[],globals={},AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 await new AsyncFunction('globalThis','download','uploadPath','uploadName','tab','nodeRepl',cell.code)(globals,{path:async()=>path},uploadPath,path.split('/').at(-1),{playwright:{locator:()=>({textContent:async()=>selectedName})}},{write:text=>content.push({type:'text',text})});
 const result=parseCell({content});
 if(result.ok&&result.value===true&&!await cleanupDownload(globals.__replDownloadCleanup))return {ok:false,error:{code:'cleanup',message:'harness cleanup refused'}};
 return result;
}

test('chooser private handoff lets the harness delete only the selected descriptor-attested artifact',async t=>{
 const dir=await scratch(t),path=join(dir,'parity.txt'),neighbor=join(dir,'parity (1).txt');
 await writeFile(path,'parity download\n');await writeFile(neighbor,'parity download\n');
 assert.deepEqual(await cleanup(path),{ok:true,value:true});
 await assert.rejects(readFile(path),{code:'ENOENT'});assert.equal(await readFile(neighbor,'utf8'),'parity download\n');
});

test('chooser cleanup never deletes a changed file, unacknowledged selection, symlink or unrecognized path',async t=>{
 const dir=await scratch(t),known=join(dir,'parity.txt'),unknown=join(dir,'owner-document.txt'),linked=join(dir,'parity (1).txt');
 await writeFile(known,'not fixture bytes');await writeFile(unknown,'parity download\n');await symlink(unknown,linked);
 for(const [path,options] of [[known,{}],[unknown,{}],[linked,{uploadPath:unknown}],[known,{selectedName:'not uploaded'}]]){
  const result=await cleanup(path,options);assert.equal(result.ok,false);assert.ok(!result.error.message.includes(dir));
 }
 assert.equal(await readFile(known,'utf8'),'not fixture bytes');assert.equal(await readFile(unknown,'utf8'),'parity download\n');assert.equal(await readFile(linked,'utf8'),'parity download\n');
});

test('observed timestamp filename is kernel-attested read-only and cleaned only by harness handoff',async t=>{
 const dir=await scratch(t),basename='parity - 2026-10-15T003412.123.txt',path=join(dir,basename);await writeFile(path,'parity download\n');
 const {value}=await run(path);assert.equal(value.basenameClass,'fixture-parity-txt');assert.equal(value.basename,basename);
 assert.equal(value.contentMatches,true);assert.equal(value.attested,true);assert.equal(value.cleaned,false);assert.equal(await readFile(path,'utf8'),'parity download\n');
 await writeFile(path,'parity download\n');assert.deepEqual(await cleanup(path),{ok:true,value:true});await assert.rejects(readFile(path),{code:'ENOENT'});
});

test('nearby timestamp-like names do not expand into arbitrary fixture-prefixed paths',async t=>{
 const dir=await scratch(t);
 for(const basename of ['parity - 2026-1-15T003412.123.txt','parity - 2026-10-15T00341.123.txt','parity - 2026-10-15T003412.1234.txt','parity - 2026-10-15T003412.txt','parity - owner.txt']){
  const path=join(dir,basename);await writeFile(path,'parity download\n');const {value}=await run(path);
  assert.equal(value.basename,undefined);assert.equal(value.contentMatches,undefined);assert.equal(value.cleaned,false);assert.equal(await readFile(path,'utf8'),'parity download\n');
 }
});

async function attest(path){
 const {default:scenarios}=await import('./scenarios/browser-members.mjs');
 const {parseCell}=await import('../../scripts/browser-parity/runner.mjs');
 const cell=scenarios.find(s=>s.id==='api/browser-playwrightdownload/path').cells.find(c=>c.label==='path');
 const content=[],globals={},AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 await new AsyncFunction('globalThis','download','nodeRepl',cell.code)(globals,{path:async()=>path},{write:text=>content.push({type:'text',text})});
 return {result:parseCell({content}),globals};
}

test('REPL chooser path cell attests plain, numbered and observed timestamp downloads without persisting paths',async t=>{
 const dir=await scratch(t);
 for(const basename of ['parity.txt','parity (27).txt','parity - 2026-10-15T003412.123.txt']){
  const path=join(dir,basename);await writeFile(path,'parity download\n');const {result,globals}=await attest(path);
  assert.deepEqual(result,{ok:true,value:true});assert.equal(globals.uploadName,basename);assert.equal(globals.uploadPath,await realpath(path));
 }
});

test('REPL chooser attestation rejects wrong fixture bytes and near-match names without leaking paths',async t=>{
 const dir=await scratch(t);
 for(const [basename,body] of [['parity.txt','not fixture data'],['parity - 2026-10-15T003412.1234.txt','parity download\n'],['owner-document.txt','parity download\n']]){
  const path=join(dir,basename);await writeFile(path,body);const {result,globals}=await attest(path);
  assert.equal(result.ok,false);assert.equal(globals.uploadPath,undefined);assert.ok(!JSON.stringify(result).includes(dir));assert.ok(!JSON.stringify(result).includes(basename));
  assert.equal(await readFile(path,'utf8'),body);
 }
});
