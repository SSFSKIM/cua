import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {walkArgs,parseWalkLine,walkLogLine,writeWalkTables,validWalkTrace,WALK_REASONS} from './walk.mjs';

const ID='large-page/input/plain/3';
// A walk that finished and claimed its one focused field; overrides build every other exit.
const walk=(index,o={})=>({index,visited:28,queued:41,elapsedMs:4.7,leaves:3,focused:1,claimed:true,cutShort:false,reason:'finished',depthReached:6,failedAXError:null,...o});
const trace=(walks,id=ID)=>({id,walks});
const line=t=>JSON.stringify({probe354FocusWalkTrace:t});
const cut=(reason,o={})=>walk(1,{claimed:false,cutShort:['node','time','depth'].includes(reason),reason,focused:0,...o});
const failed=(reason,code,o={})=>cut(reason,{failedAXError:code,...o});

test('walkArgs tags only the plain large-page input cell',()=>{
 assert.deepEqual(walkArgs({id:ID,part:'large-page'}),{probe354WalkTrace:ID});
 assert.deepEqual(walkArgs({id:ID}),{probe354WalkTrace:ID});
 for(const c of [{id:'race/input/cmd+a/spike/30/1'},{id:'large-page/textarea/plain/1'},{id:'large-page/input/secret/1'},{id:'large-page/input/plain/0'},{id:'large-page/input/plain/1/x'},{id:ID,part:'secret'},{id:ID,secret:true},{id:ID,concealed:true},{id:ID,privateField:true},{},null,undefined])assert.deepEqual(walkArgs(c),{});
});

test('every exit of the pinned walk parses: claim, no walk, three bounds, three failed reads, ambiguity, no field',()=>{
 const cases={
  claimed:trace([walk(1)]),
  skipped:trace([]),
  nodeCut:trace([cut('node',{visited:200,queued:260,depthReached:9,elapsedMs:31,leaves:5,focused:1})]),
  timeCut:trace([cut('time',{visited:90,queued:150,elapsedMs:40.4}),walk(2)]),
  depthCut:trace([cut('depth',{visited:120,queued:180,depthReached:12})]),
  roleFailed:trace([failed('role-failed',-25204)]),
  focusFailed:trace([failed('focus-failed',-25212,{leaves:2,focused:1})]),
  childrenFailed:trace([failed('children-failed',-25204)]),
  wrongType:trace([failed('children-failed',0)]),
  multiple:trace([cut('multiple',{visited:17,queued:30,focused:2,leaves:2})]),
  none:trace([cut('no-candidate',{leaves:0})]),
  nothingVisited:trace([cut('time',{visited:0,queued:1,leaves:0,depthReached:null,elapsedMs:41})])
 };
 for(const [name,t] of Object.entries(cases))assert.deepEqual(parseWalkLine(line(t)),{trace:t},name);
 assert.equal(cases.skipped.walks.length,0);
 assert.deepEqual([...WALK_REASONS].sort(),['children-failed','depth','finished','focus-failed','multiple','no-candidate','node','role-failed','time']);
});

test('the schema is strict: fixed keys, consistent flags, counters that match the exit, sequential indexes, plain numbers',()=>{
 const bad=[
  trace([walk(1,{extra:1})]),trace([walk(2)]),trace([walk(1),walk(1)]),
  trace([walk(1,{claimed:false})]),trace([cut('node',{cutShort:false})]),trace([cut('depth',{cutShort:false})]),trace([cut('cut')]),trace([cut('unclassified')]),
  trace([cut('role-failed',{failedAXError:null})]),trace([cut('role-failed',{failedAXError:'-25204'})]),trace([cut('node',{failedAXError:-25204})]),trace([walk(1,{failedAXError:0})]),
  trace([walk(1,{focused:0})]),trace([cut('no-candidate',{focused:1,leaves:1})]),trace([cut('multiple',{focused:1,leaves:1})]),trace([cut('node',{focused:2,leaves:2})]),
  trace([walk(1,{leaves:0,focused:1})]),trace([walk(1,{leaves:29})]),trace([walk(1,{leaves:-1,focused:-1})]),
  trace([walk(1,{visited:50,queued:49})]),trace([walk(1,{visited:'28'})]),trace([walk(1,{visited:-1})]),trace([walk(1,{visited:1.5})]),
  trace([walk(1,{elapsedMs:-1})]),trace([walk(1,{elapsedMs:'4.7'})]),trace([walk(1,{elapsedMs:null})]),
  trace([walk(1,{depthReached:null})]),trace([cut('time',{visited:0,queued:1,leaves:0,depthReached:3})]),
  trace([(({failedAXError,...rest})=>rest)(walk(1))]),
  trace([walk(1)],'large-page/input/secret/3'),trace([walk(1)],'large-page/input/plain/3 private-bytes'),
  {id:ID},{id:ID,walks:{},extra:true},{id:ID,walks:[walk(1)],extra:1},{id:ID,walks:null},{walks:[]},null
 ];
 for(const b of bad)assert.equal(validWalkTrace(b),false,JSON.stringify(b));
 assert.deepEqual(parseWalkLine(JSON.stringify({probe354FocusWalkTrace:trace([walk(1)]),other:1})),{error:'invalid walk trace'});
 assert.deepEqual(parseWalkLine(JSON.stringify({probe354FocusWalkTrace:null})),{error:'invalid walk trace'});
});

test('no arbitrary string survives parsing, rejection or log filtering',()=>{
 const secret='private-bytes-from-the-field';
 const hostile=[
  trace([walk(1,{reason:secret})]),trace([walk(1,{role:'AXTextField',value:secret})]),trace([walk(1,{depthReached:secret})]),trace([walk(1,{failedAXError:secret})]),trace([walk(1)],ID+secret),
  {id:ID,walks:[],element:secret},{id:secret,walks:[]}
 ];
 for(const h of hostile){
  const r=parseWalkLine(line(h));assert.deepEqual(r,{error:'invalid walk trace'});assert.equal(JSON.stringify(r).includes(secret),false);
  assert.equal(walkLogLine(line(h)).includes(secret),false);
 }
 assert.deepEqual(parseWalkLine('not json '+secret),{ignored:true});assert.deepEqual(parseWalkLine(JSON.stringify({probe354Audit:{id:ID}})),{ignored:true});
 assert.equal(walkLogLine('accidental field text '+secret).includes(secret),false);
 assert.equal(walkLogLine(line(trace([walk(1)]))),line(trace([walk(1)])));
 // What the parser accepts holds only the fixed keys, numbers, booleans, null and the reason names.
 const ok=parseWalkLine(line(trace([walk(1),failed('focus-failed',-25212,{index:2,leaves:1,focused:0})]))).trace;
 for(const w of ok.walks)for(const v of Object.values(w))assert.ok(v===null||['number','boolean'].includes(typeof v)||WALK_REASONS.includes(v));
});

test('tables cover only large-page rows and never turn a missing or invalid trace into a cutoff',()=>{
 const out=mkdtempSync(join(tmpdir(),'probe354-walk-tables-'));
 try{
  const rows=[
   {id:'large-page/input/plain/1',arm:'branch',valid:true,walkTrace:trace([cut('node',{visited:200,queued:260,focused:1,leaves:4}),walk(2)],'large-page/input/plain/1')},
   {id:'large-page/input/plain/2',arm:'branch',valid:true,walkTrace:trace([],'large-page/input/plain/2')},
   {id:'large-page/input/plain/3',arm:'branch',valid:true},
   {id:'large-page/input/plain/4',arm:'branch',valid:true,walkTrace:{id:'large-page/input/plain/4',walks:[{reason:'private-bytes'}]}},
   {id:'large-page/input/plain/5',arm:'branch',valid:true,walkTrace:trace([walk(1)],'large-page/input/plain/6')},
   {id:'large-page/input/plain/7',arm:'branch',valid:true,walkTrace:trace([failed('role-failed',-25204)],'large-page/input/plain/7')},
   {id:'race/input/cmd+a/spike/30/1',arm:'branch',valid:true,walkTrace:trace([walk(1)])}
  ];
  assert.deepEqual(writeWalkTables(out,rows),{cases:6,walks:3});
  const cases=readFileSync(join(out,'walk-cases.tsv'),'utf8').slice(0,-1).split('\n').map(l=>l.split('\t')),head=cases[0],cell=(i,k)=>cases[i][head.indexOf(k)];
  assert.equal(cases.length,7);
  assert.deepEqual([1,2,3,4,5,6].map(i=>cell(i,'trace')),['valid','valid','missing','invalid','invalid','valid']);
  assert.equal(cell(1,'walkerRan'),'true');assert.equal(cell(1,'anyCutShort'),'true');assert.equal(cell(1,'anyClaimed'),'true');assert.equal(cell(1,'reasons'),'node,finished');
  assert.equal(cell(2,'walkerRan'),'false');assert.equal(cell(2,'walks'),'0');assert.equal(cell(2,'anyCutShort'),'false');
  for(const i of [3,4,5]){assert.equal(cell(i,'walkerRan'),'');assert.equal(cell(i,'anyCutShort'),'');assert.equal(cell(i,'anyFailedRead'),'');}
  assert.equal(cell(6,'anyFailedRead'),'true');assert.equal(cell(6,'anyCutShort'),'false');
  const walks=readFileSync(join(out,'walk-walks.tsv'),'utf8').slice(0,-1).split('\n'),wh=walks[0].split('\t');assert.equal(walks.length,4);
  assert.equal(walks[1].split('\t')[wh.indexOf('failedAXError')],'');assert.equal(walks[3].split('\t')[wh.indexOf('failedAXError')],'-25204');assert.equal(walks[3].split('\t')[wh.indexOf('reason')],'role-failed');
  assert.ok(walks[1].startsWith('large-page/input/plain/1\tbranch\t1\t200\t260'));
  for(const f of ['walk-summary.json','walk-cases.tsv','walk-walks.tsv'])assert.equal(readFileSync(join(out,f),'utf8').includes('private-bytes'),false);
  assert.equal(JSON.parse(readFileSync(join(out,'walk-summary.json'),'utf8')).cases.length,6);
 }finally{rmSync(out,{recursive:true,force:true})}
});
