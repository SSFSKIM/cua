import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {patchEngine} from './patch.mjs';import {ENGINE_REF} from './model.mjs';
// Exercise the engine actually built by the workflow, not the inherited kit checkout's older native source.
const original=execFileSync('git',['-C',fileURLToPath(new URL('../../',import.meta.url)),'show',ENGINE_REF+':native/engine/Sources/Engine/Input.swift'],{encoding:'utf8'});
function scratch(t,text=original){const root=mkdtempSync(join(tmpdir(),'probe360-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const dir=join(root,'native/engine/Sources/Engine');mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'Input.swift'),text);return {root,dir}}
test('patch scratch only; provenance identifies original bytes; second application refuses',t=>{
 const {root,dir}=scratch(t);const m=patchEngine(root);
 assert.equal(m.changes.length,2);assert.notEqual(readFileSync(join(dir,'Input.swift'),'utf8'),original);
 assert.equal(m.changes[0].before.length,64);assert.notEqual(m.changes[0].before,m.changes[0].after);
 assert.ok(existsSync(join(dir,'Probe360.swift')));assert.throws(()=>patchEngine(root));
 assert.throws(()=>patchEngine(new URL('../../',import.meta.url).pathname),/scratch/);
});
test('missing or duplicated anchor fails before any source write',t=>{
 const {root,dir}=scratch(t,'unrelated source');assert.throws(()=>patchEngine(root),/anchor/);
 assert.equal(readFileSync(join(dir,'Input.swift'),'utf8'),'unrelated source');assert.equal(existsSync(join(dir,'Probe360.swift')),false);
});
