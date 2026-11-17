import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,statSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {engineSockets,SUN_PATH_MAX} from './qualification-runtime.mjs';

// Production derives directory=dirname(socket), lock=directory/engine.lock, usage=directory/usage.json (Server.swift).
const derive=socket=>({directory:dirname(socket),lock:dirname(socket)+'/engine.lock',usage:dirname(socket)+'/usage.json'});

test('fix and main get separate private directories, so their directory-scoped lock and usage paths cannot alias',()=>{
 const base=mkdtempSync(join(tmpdir(),'q360-'));
 try {
  const s=engineSockets(base,['fix','main']);
  for(const k of ['fix','main']){
   assert.equal(statSync(dirname(s[k])).mode&0o777,0o700);assert.equal(dirname(s[k]),derive(s[k]).directory);
   assert.ok(Buffer.byteLength(s[k])<SUN_PATH_MAX);assert.ok(s[k].startsWith(base+'/'));
  }
  const f=derive(s.fix),m=derive(s.main);
  assert.notEqual(f.directory,m.directory);assert.notEqual(f.lock,m.lock);assert.notEqual(f.usage,m.usage);assert.notEqual(s.fix,s.main);
 } finally {rmSync(base,{recursive:true,force:true})}
});

test('a stale socket file is removed before launch, and an over-long path is refused',()=>{
 const base=mkdtempSync(join(tmpdir(),'q360-'));
 try {
  const first=engineSockets(base,['fix']);writeFileSync(first.fix,'stale');
  assert.equal(existsSync(engineSockets(base,['fix']).fix),false);
  assert.throws(()=>engineSockets(join(base,'x'.repeat(SUN_PATH_MAX)),['fix']),/socket path/);
 } finally {rmSync(base,{recursive:true,force:true})}
});
