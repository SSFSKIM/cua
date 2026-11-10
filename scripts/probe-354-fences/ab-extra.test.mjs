import test from 'node:test';
import assert from 'node:assert/strict';
import * as extra from './ab-extra.mjs';
import {SEED} from './page.mjs';
const {extraPlan,readbackStatus,qualifiedKeyAnswer}=extra;

test('Return is text in multiline fields, but ending single-line Return and every Tab remain unconfirmed keys',()=>{
 for(const browser of ['safari','cft','firefox'])for(const editor of ['textarea','input','contenteditable','compose']){
  const cells=extraPlan({browser,editor,reps:20});
  assert.equal(cells.filter(c=>c.part==='ending-tab').length,1);
  assert.equal(cells.at(-1).part,'ending-tab');
  for(const c of cells.filter(c=>c.part==='ending-tab'))assert.equal(c.expectedAnswer,'keysUnconfirmed');
  const returns=cells.filter(c=>c.part==='ending-return');
  assert.equal(returns.length,editor==='compose'?0:20);
  assert.ok(returns.every(c=>c.expectedAnswer===(editor==='input'?'keysUnconfirmed':'confirmed')));
  assert.equal(cells.filter(c=>c.part==='multiline').length,['textarea','contenteditable'].includes(editor)?20:0);
  assert.equal(cells.filter(c=>c.part==='secret').length,editor==='input'?80:0);
  const selection=cells.filter(c=>c.part==='secret-selection');assert.equal(selection.length,editor==='input'?40:0);
  assert.ok(selection.every(c=>c.secret&&c.key===null&&c.seed===undefined&&c.selection===undefined&&c.length===null));
  for(const c of cells.filter(c=>c.part==='secret'&&c.returnUnits))assert.equal(c.returnUnits,c.variant==='one-return'?1:3);
  const unchanged=cells.filter(c=>c.part==='unchanged');
  assert.equal(unchanged.length,editor==='input'?40:0);
  for(const c of unchanged){assert.equal(c.text,SEED);assert.equal(c.key,'cmd+a');assert.equal(c.expectedAnswer,c.variant==='consumed'?'confirmed':'typeUnconfirmed');assert.equal(c.preventInput,c.variant==='prevented')}
  for(const c of cells.filter(c=>c.part==='secret'&&c.variant==='mismatch'))assert.equal(c.expectedReason,'concealedMismatch');
  const unicode=cells.filter(c=>c.variant==='unicode-cap');
  assert.equal(unicode.length,browser==='cft'&&editor==='textarea'?20:0);
  if(unicode.length){assert.equal([...unicode[0].seed].length,10001);assert.ok(Buffer.byteLength(unicode[0].seed)>10000);assert.equal(unicode[0].expectedReason,'possiblyTruncated')}
  assert.equal(new Set(cells.map(c=>c.id)).size,cells.length);
 }
});

test('the real answer explicitly distinguishes confirmed text from an unconfirmed ending key',()=>{
 assert.deepEqual(readbackStatus({result:{meta:{typeReadback:{confirmed:true,keysUnconfirmed:1,checkpoints:1}}}}),{confirmed:true,keysUnconfirmed:1,checkpoints:1,reason:null});
 assert.deepEqual(readbackStatus({error:{errorName:'typeUnconfirmed',meta:{typeReadback:{confirmed:false,reason:'valueMismatch'}}}}),{confirmed:false,keysUnconfirmed:0,checkpoints:0,reason:'valueMismatch'});
});

const keyed=(typeReadback={})=>({result:{meta:{typeReadback:{confirmed:true,keysUnconfirmed:1,checkpoints:1,...typeReadback}}}});
const refusal=(reason,extra={})=>({error:{errorName:'typeUnconfirmed',meta:{typeReadback:{confirmed:false,reason,...extra}}}});
const ending={part:'ending-tab',expectedAnswer:'keysUnconfirmed',text:'Tab prefix\t',expectedText:'Tab prefix',expectedFinal:'Tab prefix',correct:false,
 trace:[{event:'keydown',key:'Tab',seq:85,targetEditor:true,text:'Tab prefix',meta:false,alt:false,ctrl:false}]};

test('an ending-key mismatch is qualified only by confirmed prefix checkpoints and the pre-effect keydown witness',()=>{
 assert.equal(qualifiedKeyAnswer(ending,keyed()),true);
 assert.equal(qualifiedKeyAnswer({...ending,part:'ending-return',text:'First line\n',expectedFinal:'First line',trace:[{...ending.trace[0],key:'Enter',text:'First line'}]},keyed()),true);
 for(const raw of [keyed({confirmed:false}),keyed({checkpoints:0}),keyed({keysUnconfirmed:true}),keyed({keysUnconfirmed:'1'}),refusal('valueMismatch',{keysUnconfirmed:1,checkpoints:1})])assert.equal(qualifiedKeyAnswer(ending,raw),false);
 for(const trace of [[],[{...ending.trace[0],text:'Tab pre'}],[{...ending.trace[0],targetEditor:false}],[{...ending.trace[0],key:'Enter'}],[{...ending.trace[0],meta:true}]])assert.equal(qualifiedKeyAnswer({...ending,trace},keyed()),false);
 assert.equal(qualifiedKeyAnswer({...ending,text:'\t',expectedFinal:''},keyed()),false,'a bare key has no preceding nonempty text checkpoint');
 assert.equal(qualifiedKeyAnswer({...ending,part:'race'},keyed()),false);
});

test('ending-key contract rejects errors, unconfirmed text, absent checkpoints and an unwitnessed wrong prefix',()=>{
 const fail=(cell,raw)=>extra.diagnosticContractFailure(cell,raw);
 assert.equal(fail({...ending,correct:true},keyed()),false);
 for(const raw of [refusal('valueMismatch',{keysUnconfirmed:1}),keyed({confirmed:false}),keyed({checkpoints:0}),keyed({keysUnconfirmed:0})])assert.equal(fail({...ending,correct:true},raw),true);
 assert.equal(fail(ending,keyed()),false);
 assert.equal(fail({...ending,trace:[]},keyed()),true);
});

test('a cap cell requires possiblyTruncated and a response without field values or lengths',()=>{
 const cell={part:'truncation',variant:'unicode-cap',expectedAnswer:'typeUnconfirmed',expectedReason:'possiblyTruncated'};
 const fail=raw=>extra.diagnosticContractFailure(cell,raw);
 assert.equal(fail(refusal('valueMismatch',{expectedLength:10001,actualLength:3333})),true,'an unrelated refusal cannot pass the cap diagnostic');
 assert.equal(fail(refusal('possiblyTruncated',{expectedLength:10001})),true);
 assert.equal(fail({...refusal('possiblyTruncated'),error:{...refusal('possiblyTruncated').error,excerpt:{actual:'fixture text'}}}),true);
 assert.equal(fail(refusal('possiblyTruncated')),false);
});

test('secret mismatches require concealedMismatch rather than any typeUnconfirmed',()=>{
 const cell={part:'secret',variant:'mismatch',expectedAnswer:'typeUnconfirmed',expectedReason:'concealedMismatch'};
 assert.equal(extra.diagnosticContractFailure(cell,refusal('valueMismatch')),true);
 assert.equal(extra.diagnosticContractFailure(cell,refusal('concealedMismatch')),false);
});

test('unchanged controls distinguish a consumed identical replacement from the original selection',()=>{
 const base={part:'unchanged',text:SEED,correct:true};
 const good={...base,variant:'consumed',expectedAnswer:'confirmed',finalSelection:[SEED.length,0]};
 const blocked={...base,variant:'prevented',expectedAnswer:'typeUnconfirmed',expectedReason:'unchanged',finalSelection:[0,SEED.length],trace:[{event:'beforeinput',targetEditor:true,defaultPrevented:true}]};
 assert.equal(extra.diagnosticContractFailure(good,keyed({keysUnconfirmed:0,checkpoints:0})),false);
 assert.equal(extra.diagnosticContractFailure({...good,finalSelection:[0,SEED.length]},keyed()),true);
 assert.equal(extra.diagnosticContractFailure(blocked,refusal('unchanged')),false);
 assert.equal(extra.diagnosticContractFailure(blocked,refusal('valueMismatch')),true);
 assert.equal(extra.diagnosticContractFailure({...blocked,finalSelection:[SEED.length,0]},refusal('unchanged')),true);
 assert.equal(extra.diagnosticContractFailure({...blocked,trace:[]},refusal('unchanged')),true,'the cancellation must be witnessed, not inferred from missing input');
});

test('selection-pair comparison is required while latency values never determine its verdict',()=>{
 const cell={part:'secret-selection',variant:'different',secret:true,correct:true};
 for(const secretSelectionEqual of [undefined,null,false])assert.equal(extra.diagnosticContractFailure({...cell,secretSelectionEqual},refusal('unchanged')),true);
 assert.equal(extra.diagnosticContractFailure({...cell,secretSelectionEqual:true,typeRPC:{durationMs:100000,engineTiming:{durationMs:1}}},refusal('unchanged')),false,'an honest refusal is not recast as a wrong success or a timing gate');
 assert.equal(extra.diagnosticContractFailure({...cell,variant:'equal'},refusal('unchanged')),false);
});

test('rendered text is scored against independent foreground DOM and AX evidence, never its acknowledgement',()=>{
 const cell={part:'ending-return',editor:'contenteditable',browser:'cft',arm:'branch',engine:'b'.repeat(40),renderedText:true,text:'First line\n',expectedText:'First line\n'};
 const dom={text:'First line\n',innerText:'First line\n\n',domText:'First line',html:'<span>First line</span><div><span><br></span></div>'};
 const reference={...cell,foregroundVerified:true,route:"2'",dom,ax:{readable:true,secure:false,valueRead:true,value:'First line\n'}};
 const measured={route:"2'",dom,ax:{...reference.ax}};
 assert.equal(extra.needsForegroundReference?.(cell),true);
 for(const excluded of [{...cell,secret:true},{...cell,privateField:true},{...cell,editor:'password'},{...cell,editor:'canvas'}])assert.equal(extra.needsForegroundReference?.(excluded),false);
 const score=(ref=reference,got=measured)=>extra.renderedVerdict?.(cell,ref,got);
 assert.equal(score()?.correct,true);assert.equal(score()?.scorable,true);
 assert.equal(score(reference,{...measured,ax:{...measured.ax,value:'First line\n\n'},engineConfirmed:true})?.correct,false,'confirmed success with AX different from reference remains wrong');
 assert.equal(score(reference,{...measured,dom:{...dom,html:'<span>First line<br></span>'}})?.scorable,false,'DOM-only layout disagreement must not invent a false success when AX matches');
 assert.equal(score({...reference,ax:{...reference.ax,readable:false}})?.scorable,false);
 assert.equal(score({...reference,dom:{...dom,text:'Wrong reference'}})?.scorable,false);
 assert.equal(score(reference,{...measured,route:'paste'})?.scorable,false);
 assert.equal(score({...reference,foregroundVerified:false})?.scorable,false);
});

test('a stable foreground AX terminal marker is the AX oracle, not the literal DOM editing string',()=>{
 const cell={part:'ending-return',editor:'contenteditable',browser:'cft',arm:'branch',engine:'b'.repeat(40),renderedText:true,text:'First line\n'};
 const dom={text:'First line\n',innerText:'First line\n\n',domText:'First line',html:'<span>First line</span><div><span><br></span></div>'};
 const reference={...cell,foregroundVerified:true,route:"2'",dom,ax:{readable:true,secure:false,valueRead:true,value:'First line\n\n'}};
 const measured={route:"2'",dom,ax:{...reference.ax}};
 const matches=extra.renderedVerdict(cell,reference,measured);
 assert.equal(matches.scorable,true);assert.equal(matches.correct,true);assert.equal(matches.axMatches,true);
 const diverges=extra.renderedVerdict(cell,reference,{...measured,ax:{...measured.ax,value:'First line\n'}});
 assert.equal(diverges.scorable,true);assert.equal(diverges.correct,false);assert.equal(diverges.axMatches,false);
});

test('the three-Return diagnostic fails a missing or unequal complete readback comparison',()=>{
 const cell={part:'secret',variant:'three-returns',returnUnits:3,secret:true,expectedAnswer:'confirmed',correct:true},raw={result:{meta:{typeReadback:{confirmed:true}}}};
 for(const secretReadbackEqual of [undefined,null,false])assert.equal(extra.diagnosticContractFailure({...cell,secretReadbackEqual},raw),true);
 assert.equal(extra.diagnosticContractFailure({...cell,secretReadbackEqual:true},raw),false);
});
