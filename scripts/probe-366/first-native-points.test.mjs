import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const here=dirname(fileURLToPath(import.meta.url));
test('native candidate geometry clips the real window and rejects unavailable regions without inventing a fallback',{skip:process.platform!=='darwin'},()=>{
 const source=readFileSync(join(here,'trace.swift'),'utf8');
 const begin=source.indexOf('// candidate-point:begin'),end=source.indexOf('// candidate-point:end');
 assert.ok(begin>=0&&end>begin);
 mkdirSync(join(here,'.offline'),{recursive:true});const scratch=mkdtempSync(join(here,'.offline/native-point-'));
 try {
  writeFileSync(join(scratch,'main.swift'),`import Foundation
import CoreGraphics
${source.slice(begin,end)}
func check(_ ok: Bool) { if !ok { exit(1) } }
let screen = CGRect(x:0,y:0,width:1024,height:768), oversized = CGRect(x:0,y:25,width:1440,height:900)
check(try spike366CandidatePoint("inert-titlebar",window:oversized,web:oversized,screen:screen) == CGPoint(x:768,y:39))
check(try spike366CandidatePoint("inert-toolbar",window:oversized,web:oversized,screen:screen) == CGPoint(x:400,y:47))
check(try spike366CandidatePoint("bare",window:nil,web:nil,screen:screen) == nil)
let framed = CGRect(x:100,y:25,width:650,height:700), web = CGRect(x:100,y:130,width:650,height:595)
check(try spike366CandidatePoint("inert-titlebar",window:framed,web:web,screen:screen) == CGPoint(x:587.5,y:39))
check(try spike366CandidatePoint("inert-toolbar",window:framed,web:web,screen:screen) == CGPoint(x:425,y:152))
for (variant,window,web) in [("inert-titlebar",CGRect(x:1200,y:25,width:600,height:700),Optional(oversized)),("inert-titlebar",CGRect(x:0,y:-50,width:800,height:700),Optional(oversized)),("inert-toolbar",oversized,nil),("unknown",oversized,Optional(oversized))] {
 do { _ = try spike366CandidatePoint(variant,window:window,web:web,screen:screen); exit(2) } catch {}
}
print("ok")
`);
  const binary=join(scratch,'points'),built=spawnSync('swiftc',['-o',binary,join(scratch,'main.swift')],{encoding:'utf8'});
  assert.equal(built.status,0,built.stderr);
  const ran=spawnSync(binary,[],{encoding:'utf8'});assert.equal(ran.status,0,ran.stderr);assert.equal(ran.stdout.trim(),'ok');
 } finally {rmSync(scratch,{recursive:true,force:true});}
});
