import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import * as caret from './caret.mjs';
import {abPlan} from './ab-model.mjs';
import {matrix} from './matrix.mjs';

const range=(pollIndex=1,overrides={})=>({source:'production',api:'single',attribute:'AXSelectedTextRange',pollIndex,startedAt:11,endedAt:12,axError:0,shape:'range',range:{location:'64',length:'0'},...overrides});
const count=(overrides={})=>({source:'diagnostic-added',attribute:'AXNumberOfCharacters',queried:true,startedAt:9,endedAt:10,axError:0,shape:'number',count:'64',...overrides});
const packet=(overrides={})=>({id:'caret/secret-equal/1',readerHook:'TypeReadback',startedAt:1,typingCompleteAt:8,endedAt:20,outsidePollRanges:[],polls:[{index:1,readerRead:1,startedAt:9,endedAt:13,outcome:'equalUnconsumed',rangeRead:true,ranges:[range()],characterCount:count()}],...overrides});

test('flag-off plans, matrix and request args remain primary and untraced',()=>{
 assert.equal(typeof caret.planFor,'function');
 for(const browser of ['safari','cft','firefox'])for(const editor of ['textarea','input','contenteditable','compose'])assert.deepEqual(caret.planFor({browser,editor,reps:20}),abPlan({browser,editor,reps:20}));
 assert.deepEqual(caret.matrixFor('all'),matrix('all'));assert.deepEqual(caret.traceArgs('primary','id'),{});
});

test('the small isolated cohort covers private and plain identical-selection paths plus non-ASCII units',()=>{
 assert.equal(typeof caret.planFor,'function');
 const cells=caret.planFor({browser:'firefox',editor:'input',reps:1,diagnostic:'firefox-caret'});
 assert.deepEqual(cells.map(c=>c.variant),['secret-insertion','secret-equal','secret-different','plain-identical','plain-insertion','plain-unicode']);
 assert.equal(cells.filter(c=>c.secret).length,3);assert.ok(cells.every(c=>c.part==='caret-diagnostic'&&c.key===null));
 const unicode=cells.find(c=>c.variant==='plain-unicode');assert.deepEqual(unicode.knownUnits,{codePoints:3,utf16:4,utf8:8,expectedOffsets:{codePoints:3,utf16:4,utf8:8}});
 assert.deepEqual(caret.matrixFor('all','firefox-caret'),matrix('firefox-input'));
 assert.throws(()=>caret.planFor({browser:'cft',editor:'input',reps:1,diagnostic:'firefox-caret'}));
 assert.throws(()=>caret.matrixFor('safari-input','firefox-caret'));
 assert.deepEqual(caret.traceArgs('firefox-caret',cells[0].id),{probe354Audit:cells[0].id,probe354CaretTrace:true});
});

test('safe serialization admits case names and actual numeric API replies, never associated text',()=>{
 assert.equal(typeof caret.parseCaretLine,'function');
 const valid=packet();assert.deepEqual(caret.parseCaretLine(JSON.stringify({probe354CaretTrace:valid})),{trace:valid});
 for(const bad of [packet({polls:[{...valid.polls[0],outcome:'differs(actual: private-bytes)'}]}),packet({polls:[{...valid.polls[0],actual:'private-bytes'}]})]){
  const result=caret.parseCaretLine(JSON.stringify({probe354CaretTrace:bad}));assert.deepEqual(result,{error:'invalid caret trace'});assert.equal(JSON.stringify(result).includes('private-bytes'),false);
  assert.equal(JSON.stringify(caret.sanitizeCaretRow({caretTrace:bad})).includes('private-bytes'),false);
 }
 assert.equal(caret.caretLogLine('accidental field text private-bytes').includes('private-bytes'),false);
});

test('poll/range association and production-versus-diagnostic labels cannot be silently swapped',()=>{
 assert.equal(typeof caret.parseCaretLine,'function');
 const good=packet(),p=good.polls[0];
 for(const bad of [{...p,ranges:[range(2)]},{...p,characterCount:count({source:'production'})},{...p,rangeRead:false},{...p,characterCount:count({queried:false,startedAt:null,endedAt:null,axError:null})},{...p,characterCount:count({shape:'not-probed',count:null})}])assert.deepEqual(caret.parseCaretLine(JSON.stringify({probe354CaretTrace:packet({polls:[bad]})})),{error:'invalid caret trace'});
});

test('a poll without a range and an unsupported range/count stay distinct; main has no reader polls',()=>{
 assert.equal(typeof caret.parseCaretLine,'function');
 const base=packet().polls[0],noRange={...base,rangeRead:false,ranges:[],outcome:'differs'},unsupported={...base,ranges:[range(1,{axError:-25205,shape:'missing',range:null})],characterCount:count({axError:-25205,shape:'missing',count:null})};
 for(const polls of [[noRange],[unsupported]])assert.deepEqual(caret.parseCaretLine(JSON.stringify({probe354CaretTrace:packet({polls})})).trace?.polls,polls);
 const main=packet({readerHook:'none',typingCompleteAt:null,polls:[]});assert.deepEqual(caret.parseCaretLine(JSON.stringify({probe354CaretTrace:main})),{trace:main});
});

test('late snapshots preserve actual delay and API failure metadata without reading values',async()=>{
 assert.equal(typeof caret.lateCaretSnapshot,'function');let now=105,waited;
 const snapshot={startedAt:400,endedAt:405,ok:true,role:'AXTextField',subrole:null,secure:false,readable:false,valueRead:false,range:range(null,{source:'diagnostic-added-late',startedAt:402,endedAt:403,axError:-25205,shape:'missing',range:null}),characterCount:count({source:'diagnostic-added-late',startedAt:404,endedAt:405,count:'64'})};
 const result=await caret.lateCaretSnapshot({replyAt:100,now:()=>now,wait:async ms=>{waited=ms;now+=ms},read:async()=>{now=405;return snapshot}});
 assert.equal(waited,295);assert.equal(result.requestedDelayMs,300);assert.equal(result.actualDelayMs,302);assert.equal(result.source,'diagnostic-added-late');assert.deepEqual(result.snapshot,snapshot);
 const unsafe=await caret.lateCaretSnapshot({replyAt:100,now:()=>now,wait:async()=>{},read:async()=>({...snapshot,valueRead:true,value:'private-bytes'})});
 assert.equal(JSON.stringify(unsafe).includes('private-bytes'),false);assert.equal(unsafe.error,'unsafe late snapshot');
 const mislabelled=await caret.lateCaretSnapshot({replyAt:100,now:()=>now,wait:async()=>{},read:async()=>({...snapshot,range:range(null)})});assert.equal(mislabelled.error,'unsafe late snapshot');
});

test('diagnostic artifacts withhold both public field text and private exceptions while retaining real answers/meta',()=>{
 assert.equal(typeof caret.sanitizeCaretRow,'function');
 const marker='private-field-bytes',row={id:'caret/plain-identical/1',recordKind:'caret-diagnostic',text:marker,seed:marker,expectedFinal:marker,final:marker,problem:'Mismatch '+marker,setup:{text:marker,length:19,selection:[0,19]},
  typeRPC:{durationMs:20,meta:{debugDetail:marker,typeReadback:{confirmed:false,reason:'valueMismatch',reads:3}},raw:{error:{code:-32000,errorName:'typeUnconfirmed',message:'Mismatch '+marker,meta:{typeReadback:{confirmed:false,reason:'valueMismatch',actual:marker,expected:marker,reads:3}}}}},secretService:{error:{stack:'Error: '+marker},logs:[marker]},caretTrace:packet()};
 const clean=caret.sanitizeCaretRow(row);assert.equal(JSON.stringify(clean).includes(marker),false);assert.equal(clean.typeRPC.raw.error.errorName,'typeUnconfirmed');assert.equal(clean.typeRPC.raw.error.meta.typeReadback.reads,3);assert.deepEqual(clean.caretTrace,packet());
});

test('pre-typing AX selection and expected caret are derived from real replies, not invented when the range is unreadable',()=>{
 const intent=caret.caretIntent({selection:[3,0],typedUtf16:64});
 assert.deepEqual(intent,{domBefore:{location:'3',length:'0'},typedUtf16:64,expectedDOM:{location:'67',length:'0'}});
 const before=range(null,{startedAt:2,endedAt:3,range:{location:'3',length:'0'}}),trace=packet({typingStartedAt:7,outsidePollRanges:[before]});
 assert.deepEqual(caret.parseCaretLine(JSON.stringify({probe354CaretTrace:trace})),{trace});
 const evidence=caret.caretBeforeEvidence({caretIntent:intent,caretTrace:trace});
 assert.deepEqual(evidence.beforeRange,{location:'3',length:'0'});assert.deepEqual(evidence.expectedAX,{location:'67',length:'0'});assert.equal(evidence.beforeReplies.length,1);
 const missing=caret.caretBeforeEvidence({caretIntent:intent,caretTrace:packet({typingStartedAt:7,outsidePollRanges:[range(null,{startedAt:2,endedAt:3,axError:-25205,shape:'missing',range:null})]})});
 assert.equal(missing.beforeRange,null);assert.equal(missing.expectedAX,null);assert.equal(missing.beforeReplies[0].axError,-25205);
 assert.throws(()=>caret.caretIntent({selection:[-1,0],typedUtf16:64}));
});

test('caret comparison tables retain before selection and actual poll/late timing against the expected caret',()=>{
 const out=mkdtempSync(join(tmpdir(),'probe354-caret-target-'));try{
  const before=range(null,{startedAt:2,endedAt:3,range:{location:'3',length:'0'}}),trace=packet({typingStartedAt:7,outsidePollRanges:[before]});
  trace.polls[0].ranges=[range(1,{range:{location:'3',length:'0'}})];
  const row={id:trace.id,recordKind:'caret-diagnostic',arm:'branch',variant:'secret-insertion',valid:true,caretIntent:caret.caretIntent({selection:[3,0],typedUtf16:64}),caretTrace:trace,typeRPC:{endedAt:20,raw:{error:{errorName:'typeUnconfirmed',meta:{typeReadback:{reason:'unchanged'}}}}},lateCaretSnapshot:{source:'diagnostic-added-late',replyAt:20,actualDelayMs:300,snapshot:{range:range(null,{source:'diagnostic-added-late',startedAt:320,endedAt:321,range:{location:'67',length:'0'}})}}};
  caret.writeCaretTables(out,[row]);
  const s=JSON.parse(readFileSync(join(out,'summary.json'),'utf8'));assert.deepEqual(s.cases[0].expectedCaretAX,{location:'67',length:'0'});assert.deepEqual(s.cases[0].beforeRange,{location:'3',length:'0'});
  assert.match(readFileSync(join(out,'caret-before.tsv'),'utf8'),/location/);
  const polls=readFileSync(join(out,'caret-polls.tsv'),'utf8');assert.match(polls,/matchesExpectedAX/);assert.match(polls,/false/);
  const final=readFileSync(join(out,'caret-final.tsv'),'utf8');assert.match(final,/true/);assert.match(final,/300/);
 }finally{rmSync(out,{recursive:true,force:true})}
});

test('compact tables keep the main no-poll distinction and never emit primary rates or cost',()=>{
 assert.equal(typeof caret.writeCaretTables,'function');const out=mkdtempSync(join(tmpdir(),'probe354-caret-'));
 try{
  const rows=[{id:'caret/secret-equal/1',recordKind:'caret-diagnostic',arm:'branch',variant:'secret-equal',valid:true,caretTrace:packet(),typeRPC:{raw:{error:{errorName:'typeUnconfirmed',meta:{typeReadback:{reason:'unchanged'}}}}}},
   {id:'caret/secret-equal/1',recordKind:'caret-diagnostic',arm:'main',variant:'secret-equal',valid:true,caretTrace:packet({readerHook:'none',typingCompleteAt:null,polls:[]}),typeRPC:{raw:{result:{meta:{}}}}}];
  caret.writeCaretTables(out,rows);
  const s=JSON.parse(readFileSync(join(out,'summary.json'),'utf8'));assert.equal(s.primaryEvidence,false);assert.equal(s.observerEffect,true);
  assert.match(readFileSync(join(out,'caret-cases.tsv'),'utf8'),/main\tsecret-equal\ttrue\tnone\t0/);
  assert.match(readFileSync(join(out,'caret-polls.tsv'),'utf8'),/production/);
  assert.throws(()=>readFileSync(join(out,'rates.tsv')));assert.throws(()=>readFileSync(join(out,'cost.tsv')));
 }finally{rmSync(out,{recursive:true,force:true})}
});
