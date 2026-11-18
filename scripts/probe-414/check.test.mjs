import {test} from 'node:test';
import assert from 'node:assert/strict';
import {plan, score, inspect, auditSchedule, auditPairs, summarize, coded, noteAttested, NOTE_PREFIX, firefoxDisclosure, drainIntervals, drainStats, terminalEditAtMs, drainIneligible, drainSummary, drainSizingOk, runShape, setupLabel, focusAllowed, concealedFailureTiming, appliedEditGaps, reducedPlan, REDUCED_LANES, SNAPSHOT_REFUSAL_LABEL, budgetProfile, REDUCED_PAD_MS, REDUCED_OVERHEAD_MS, readbackProfile, legacyBaselineCase, legacyBaselineTally, reducedBudgetCoverage, lateReplyPresent, failureDistributions, failureReasonParity, failureTimingByLength} from './check.mjs';

const success={confirmed:true,secure:true,confirmation:'length',snapshotMs:4};
const old={confirmed:false,concealed:true,reason:'secure',snapshotMs:3};
const reject={confirmed:false,secure:true,reason:'lengthMismatch',snapshotMs:3};
function row({head='fix',kind='short',lane='cft',literal=false,preliminary=false,raw=success,forwarded=raw,sky=raw.confirmed?'ok':'typeUnconfirmed',fixture=true,domExact=true,controlExact=null,noted=true}={}){
  return score({head,kind,lane,literal,preliminary,raw,forwarded,sky,fixture,domExact,controlExact,noted});
}
test('plan balances each cell and interleaves product pins',()=>{
  const rows=plan(false);
  assert.equal(rows.length,195);
  for(const [kind,n] of Object.entries({short:20,long:20,selection:10,literal:10,unicode:20})){
    const paired=rows.filter(r=>r.kind===kind);
    assert.equal(paired.length,2*n);
    for(let i=0;i<2*n;i+=2){assert.equal(paired[i].rep,paired[i+1].rep);assert.notEqual(paired[i].head,paired[i+1].head);}
  }
  assert.equal(rows.filter(r=>r.kind==='drop'&&r.head==='fix').length,10);
  assert.equal(rows.filter(r=>r.kind==='add'&&r.head==='fix').length,20);
  assert.equal(rows.filter(r=>r.kind==='drop'&&r.literal===true).length,5);
  assert.equal(rows.filter(r=>r.kind==='add'&&r.literal===true).length,10);
  assert.equal(rows.filter(r=>r.kind==='rewrite').length,5);
  for(const head of ['main','fix'])assert.equal(rows.filter(r=>r.kind==='unicode'&&r.head===head).length,20);
  assert.equal(plan(true).length,13);
});
test('score requires a length-marked success on both surfaces, the production note and independently exact delivery',()=>{
  assert.equal(row().pass,true);
  assert.equal(row().outcome,'confirmed');
  assert.equal(row({noted:false}).pass,false);
  assert.equal(row({head:'main',raw:old}).pass,true);
  assert.equal(row({raw:{confirmed:true,secure:true}}).pass,false);
  assert.equal(row({forwarded:old}).pass,false);
  assert.equal(row({domExact:false}).wrongSuccess,true);
  assert.equal(row({kind:'rewrite',domExact:false,controlExact:true}).informational,true);
  assert.equal(row({kind:'rewrite',domExact:false,controlExact:true}).wrongSuccess,true);
});
test('only agreed length metadata with sky success is confirmed; unilateral and bare success stay separate and are wrong over a known mismatch',()=>{
  const bare={confirmed:true,secure:true,snapshotMs:3};
  for(const [raw,forwarded,sky] of [[bare,bare,'ok'],[success,old,'ok'],[old,success,'ok'],[success,success,'typeUnconfirmed'],[old,old,'ok']]){
    const r=row({raw,forwarded,sky});
    assert.equal(r.outcome,'bare',JSON.stringify([raw,forwarded,sky]));
    assert.equal(r.lengthConfirmed,false);
    assert.equal(r.pass,false);
    assert.equal(r.wrongSuccess,false);
    assert.equal(row({raw,forwarded,sky,domExact:false}).wrongSuccess,true);
  }
  // A negative control whose content has extra corruption is not realized, yet its success is still a wrong success.
  const corrupt=row({kind:'drop',raw:success,controlExact:false,domExact:false});
  assert.equal(corrupt.valid,false);
  assert.equal(corrupt.wrongSuccess,true);
  assert.equal(row({kind:'drop',raw:success,controlExact:false,domExact:false,fixture:false}).wrongSuccess,false);
  const s=summarize([{...corrupt,head:'fix',kind:'drop',invalid:'control-not-realized'},{...row({raw:{confirmed:true,secure:true},domExact:true}),head:'fix',kind:'short'}]);
  assert.equal(s.wrongSuccesses,1);
  assert.equal(s.heads.fix.bare,1);
});
test('concealed controls use lengthMismatch; literal and preliminary AppKit controls can use caretMismatch',()=>{
  const ok=(kind,raw,more={})=>row({kind,raw,domExact:false,controlExact:true,...more});
  for(const kind of ['drop','add']){
    assert.equal(ok(kind,reject).pass,true);
    assert.equal(ok(kind,reject).lengthRejected,true);
    assert.equal(ok(kind,{...reject,reason:'caretMismatch'}).pass,false);
    assert.equal(ok(kind,{...reject,reason:'caretMismatch'},{lane:'appkit'}).pass,false);
    assert.equal(ok(kind,{...reject,reason:'caretMismatch'},{lane:'appkit',preliminary:true}).pass,true);
    assert.equal(ok(kind,{...reject,reason:'caretMismatch'},{literal:true}).lengthRejected,true);
    for(const reason of ['lengthUnreadable','secure','valueMismatch','selectionUnreadable'])assert.equal(ok(kind,{...reject,reason}).pass,false,reason);
    assert.equal(ok(kind,{...reject,secure:undefined}).pass,false);
    const firefox=ok(kind,{confirmed:false,reason:'notTextField',snapshotMs:2},{lane:'firefox'});
    assert.equal(firefox.pass,true);
    assert.equal(firefox.knownLimit,true);
    assert.equal(firefox.lengthRejected,false);
    assert.equal(ok(kind,{confirmed:false,reason:'notTextField',snapshotMs:2}).pass,false);
    assert.equal(ok(kind,success).pass,false);
  }
  assert.equal(row({kind:'drop',raw:reject,domExact:false,controlExact:false}).valid,false);
  assert.equal(row({kind:'drop',raw:reject,fixture:false}).valid,false);
  // AppKit's prefilled selection may be unconfirmed lengthUnreadable with exact delivery.
  const select=row({kind:'selection',lane:'appkit',raw:{confirmed:false,secure:true,reason:'lengthUnreadable',snapshotMs:2}});
  assert.equal(select.pass,true);
  assert.equal(select.knownLimit,true);
  assert.equal(row({kind:'selection',lane:'cft',raw:{confirmed:false,secure:true,reason:'lengthUnreadable',snapshotMs:2}}).pass,false);
  const s=summarize([{...ok('drop',reject),head:'fix',kind:'drop'},{...ok('add',{confirmed:false,reason:'notTextField',snapshotMs:2},{lane:'firefox'}),head:'fix',kind:'add'}]);
  assert.equal(s.negative.lengthRejected,1);
  assert.equal(s.negative.knownLimits,1);
});
test('the fixed success note is attested from the production rendered content without keeping its text',()=>{
  const note=NOTE_PREFIX+' the field took exactly as many characters as were typed.';
  assert.equal(noteAttested(note,[note]),true);
  assert.equal(noteAttested(note,[note.slice(0,80)]),true);
  assert.equal(noteAttested(note,[]),false);
  assert.equal(noteAttested(note,[note,note]),false);
  assert.equal(noteAttested(note,['other text']),false);
  assert.equal(noteAttested(note,[note+' more']),false);
  assert.equal(noteAttested('Typed elsewhere',['Typed elsewhere']),false);
  assert.equal(noteAttested(undefined,[note]),false);
  assert.equal(row({noted:null}).lengthConfirmed,false);
});
const words=['zcjqmtbr','evwkpctgxldusfrynhjqmavoqzbgtdi'];
test('privacy detects values, ranges, masks, and length metadata in every observed surface',()=>{
  const base={jsonrpc:'2.0',id:8,result:{meta:{typeReadback:success,app:{pid:31},startedAt:17345678}}};
  assert.deepEqual(inspect(base,words),[]);
  assert.notDeepEqual(inspect({elsewhere:{entered:8}},words,{literal:true}),[]);
  for(const raw of [
    {error:{meta:{entered:8}}}, {'cua/typeReadback':{...success,count:31}}, {range:[0,8]}, {AXSelectedTextRange:'(0, 8)'},
    {message:'read 31 characters'}, new Error('secure field count=8'), {text:'The secret was ••••••••'}, {stderr:'value=' + words[0]},
    {extra:words[1].slice(2,12)}, {message:'AXNumberOfCharacters = 31'}, {data:'\uf79a\uf79a'},
    {data:words[0].split('').map(c=>c.charCodeAt(0))}, {'cua/typeReadback':{...success,confirmation:'content'}},
  ]) assert.notEqual(inspect(raw,words).length,0,JSON.stringify(raw));
});
test('privacy parses JSON, prefixed diagnostics and plain text for private names, in stdout, stderr and nested strings',()=>{
  const leaks=[
    JSON.stringify({result:{meta:{typeReadback:{...success,length:8}}}}),
    JSON.stringify({AXValue:'x'}), '[engine] '+JSON.stringify({reads:3}), 'warn: '+JSON.stringify({typeReadback:{...success,count:8}})+' done',
    JSON.stringify({stderr:JSON.stringify({selectedTextRange:{location:0,length:8}})}),
    JSON.stringify({entered:8}),
    'AXValue was unreadable', 'typeReadback pollMs=0', 'selectedTextRange: {location: 0}', 'length: eight', 'cua/entered=8', 'value: '+words[0].slice(0,3),
    'caught '+words[0], 'trace '+JSON.stringify({text:words[1]}),
  ];
  for(const line of leaks)assert.notEqual(inspect(line,words).length,0,line);
  // Fixed product prose, and diagnostics without a private name, carry no finding.
  const prose=[NOTE_PREFIX+' the field took exactly as many characters as were typed, in place of any selected text, so none was dropped or added.',
    'The text was typed, but the password field\'s length is not what the text should have made it, so a character may have been dropped or added. Observe the field before going on (a screenshot shows its masked characters; getAXState() shows only that it is a password field), then use setValue to put it right.',
    '[engine] listening on a socket', JSON.stringify({level:'info',msg:'ready',pid:31})];
  for(const line of prose)assert.deepEqual(inspect(line,words),[],line);
  // The rendered observation is scanned for values, never for field labels the tree legitimately shows.
  assert.deepEqual(inspect('Value: a plain label',words,{names:false}),[]);
  assert.notEqual(inspect('Value: '+words[0],words,{names:false}).length,0);
});
test('a literal entered count is exempt only at its three production positions',()=>{
  const lit={literal:true};
  const at=(surface,v)=>inspect(v,words,{...lit,surface});
  assert.deepEqual(at('ipc',{result:{meta:{entered:8,typeReadback:{...success}}}}),[]);
  assert.deepEqual(at('ipc',{error:{meta:{entered:8}}}),[]);
  assert.deepEqual(at('sky-error',Object.assign(new Error('failed'),{meta:{entered:8}})),[]);
  assert.deepEqual(at('forwarded',{'cua/entered':8,'cua/typeReadback':success}),[]);
  for(const [surface,v] of [
    ['ipc',{result:{meta:{'cua/entered':8}}}], ['ipc',{entered:8}], ['ipc',{result:{entered:8}}], ['ipc',{result:{meta:{nested:{entered:8}}}}],
    ['ipc',{result:{meta:{entered:-1}}}], ['ipc',{result:{meta:{entered:9}}}], ['ipc',{result:{meta:{entered:'8'}}}],
    ['sky-error',{entered:8}], ['sky-error',{meta:{'cua/entered':8}}], ['sky-error',{meta:{extra:{entered:8}}}],
    ['forwarded',{entered:8}], ['forwarded',{meta:{'cua/entered':8}}], ['forwarded',{'cua/entered':9}],
    ['sky-result',{meta:{entered:8}}], [null,{'cua/entered':8}], ['forwarded',{note:JSON.stringify({entered:8})}],
  ])assert.notDeepEqual(at(surface,v),[],JSON.stringify([surface,v]));
  assert.notDeepEqual(inspect({result:{meta:{entered:8}}},words,{surface:'ipc'}),[],'concealed entered');
  assert.notDeepEqual(inspect({'cua/entered':1},words,{surface:'forwarded'}),[]);
});
test('legacy zero reads and pollMs are exempt only for the baseline literal secure refusal',()=>{
  const legacy={confirmed:false,reason:'secure',snapshotMs:3,pollMs:0,reads:0};
  const wrap=r=>({result:{meta:{typeReadback:r}}});
  const baseline={literal:true,surface:'ipc',baseline:true};
  assert.deepEqual(inspect(wrap(legacy),words,baseline),[]);
  assert.deepEqual(inspect({'cua/typeReadback':legacy},words,{literal:true,surface:'forwarded',baseline:true}),[]);
  for(const [r,opts] of [
    [legacy,{literal:true,surface:'ipc'}],                                          // the fix
    [legacy,{surface:'ipc',baseline:true}],                                         // not literal
    [{...legacy,pollMs:3},baseline], [{...legacy,reads:2},baseline],                // a measurement
    [{...legacy,reason:'unchanged'},baseline], [{...legacy,confirmed:true},baseline],
    [{...legacy,secure:true},baseline], [{...legacy,concealed:true},baseline],
    [{...legacy,settleReads:0},baseline],
  ])assert.notEqual(inspect(wrap(r),words,opts).length,0,JSON.stringify([r,opts]));
  assert.notDeepEqual(inspect({pollMs:0},words,baseline),[]);
});
const trace=(polls=1,tail=[['b','AXRole+AXSubrole+AXSelectedTextRange+AXNumberOfCharacters',2]],bad=[],{baseline=true,input=true}={})=>[
  ['b','AXRole+AXSubrole',1], ['b','AXRole+AXSubrole',2,'secure'],
  ...(baseline?[['b','AXRole+AXSubrole+AXSelectedTextRange+AXNumberOfCharacters',2]]:[]),
  ...bad,
  ...(input?[['event','keyDown',-1]]:[]),
  ...Array.from({length:polls},()=>[['p','begin'],...tail,['p','end']]).flat(),
  ['r','AXFocused',2],
];
const web=(extra=[])=>[['b','AXRole+AXSubrole',7,'webArea'],['r','AXSelectedTextMarkerRange',7],['q','AXUIElementForTextMarker',7],...extra];
test('audit collapses only identical repeated poll iterations, distinguishes elements and forbids secure reads',()=>{
  assert.equal(auditSchedule(trace()).shape,auditSchedule(trace(4)).shape);
  assert.notEqual(auditSchedule(trace()).shape,auditSchedule(trace(1,[['b','AXNumberOfCharacters',1]])).shape);
  // Repeated operations within one iteration, and distinct terminal iterations, are kept.
  const batch=['b','AXRole+AXSubrole+AXSelectedTextRange+AXNumberOfCharacters',2], twice=[batch,batch], poll=(...its)=>[...trace(0),...its.flatMap(t=>[['p','begin'],...t,['p','end']])];
  assert.notEqual(auditSchedule(trace(1,twice)).shape,auditSchedule(trace(1)).shape);
  assert.equal(auditSchedule(trace(5,twice)).shape,auditSchedule(trace(1,twice)).shape);
  assert.notEqual(auditSchedule(poll([batch],[batch],[batch,['r','AXFocused',2]])).shape,auditSchedule(poll([batch])).shape);
  assert.notEqual(auditSchedule(poll([batch],[batch,['r','AXFocused',2]],[batch])).shape,auditSchedule(poll([batch,['r','AXFocused',2]],[batch])).shape);
  assert.equal(auditSchedule(poll([batch],[batch],[batch,['r','AXFocused',2]])).shape,auditSchedule(poll([batch],[batch,['r','AXFocused',2]])).shape);
  assert.equal(auditSchedule(trace(1,undefined,[['q','AXUIElementForTextMarker',2]])).pass,false);
  assert.equal(auditSchedule(trace(1,undefined,[['r','AXValue',2]])).pass,false);
  assert.equal(auditSchedule(trace(1,undefined,[['b','AXRole+AXValue',2]])).pass,false);
  assert.equal(auditSchedule(trace(1,undefined,[['r','AXValue',1]])).pass,true);
  assert.equal(auditSchedule([['b','AXRole',1]]).pass,false);
  assert.equal(auditSchedule([...trace(),['p','end']]).pass,false);
  assert.equal(auditSchedule([...trace(),['p','begin']]).pass,false);
  assert.equal(auditSchedule(trace(1,[batch,['r','AXSelectedTextRange',2]])).pass,true);
  const rows=['short','long','literal'].map(kind=>({...auditSchedule(trace()),kind,head:'fix',rep:0,valid:true}));
  assert.deepEqual(auditPairs(rows,1),{required:2,matched:2,pass:true});
  rows[1].shape='changed';
  assert.deepEqual(auditPairs(rows,1),{required:2,matched:1,pass:false});
  assert.equal(auditPairs(rows.slice(0,1),1).pass,false);
});
test('audit requires a real pre-input baseline count batch and a post-input poll count batch on the secure alias',()=>{
  assert.equal(auditSchedule(trace()).pass,true);
  assert.equal(auditSchedule(trace(1,undefined,[],{baseline:false})).pass,false);
  assert.equal(auditSchedule(trace(1,undefined,[],{baseline:false})).baseline,false);
  assert.equal(auditSchedule(trace(0)).pass,false);
  assert.equal(auditSchedule(trace(1,[['b','AXRole+AXSubrole',2]])).pass,false);
  assert.equal(auditSchedule(trace(1,[['b','AXNumberOfCharacters',1]])).pass,false);
  assert.equal(auditSchedule(trace(1,undefined,[],{input:false})).pass,false);
  // A count batch on another element is no baseline and no poll.
  const other=trace().map(e=>e[0]==='b'&&e[1].includes('AXNumberOfCharacters')?[e[0],e[1],1]:e);
  assert.equal(auditSchedule(other).pass,false);
  // A poll that begins before the first input is no post-input poll.
  const early=[['b','AXRole+AXSubrole',2,'secure'],['p','begin'],['b','AXNumberOfCharacters',2],['p','end'],['event','keyDown',-1]];
  assert.equal(auditSchedule(early).poll,false);
  assert.equal(auditSchedule(early).pass,false);
});
test('Safari audit requires exactly the scoped marker pair on the classified web area before input, and none elsewhere',()=>{
  const safari=(...extra)=>[...web(),...trace(1,undefined,[],{}),...extra];
  const withMarkers=(inject,{marker=true}={})=>auditSchedule(inject,{marker});
  assert.equal(withMarkers(safari()).pass,true);
  assert.equal(withMarkers(safari()).marker,true);
  // A marker op in a non-Safari lane fails; the Safari lane without the pair fails.
  assert.equal(auditSchedule(safari()).pass,false);
  assert.equal(withMarkers(trace()).pass,false);
  assert.equal(withMarkers([web()[0],...trace()]).pass,false);
  // Order, element and count are exact.
  assert.equal(withMarkers([web()[0],web()[2],web()[1],...trace()]).pass,false);
  assert.equal(withMarkers([web()[0],web()[1],...trace()]).pass,false);
  assert.equal(withMarkers([...web(),web()[1],...trace()]).pass,false);
  assert.equal(withMarkers([...web(),web()[2],...trace()]).pass,false);
  assert.equal(withMarkers([web()[0],web()[1],['q','AXUIElementForTextMarker',3],...trace()]).pass,false);
  assert.equal(withMarkers([['b','AXRole+AXSubrole',7],web()[1],web()[2],...trace()]).pass,false);
  assert.equal(withMarkers([web()[1],web()[2],web()[0],...trace()]).pass,false);
  assert.equal(withMarkers([...web(),...trace(),...web().slice(1)]).pass,false);
  assert.equal(withMarkers([...web(),...trace(),['r','AXSelectedTextMarkerRange',7]]).pass,false);
  // Any parameterized read on the secure alias is refused.
  assert.equal(withMarkers([...web(),...trace(1,undefined,[['q','AXUIElementForTextMarker',2]])]).pass,false);
  assert.equal(withMarkers([...web(),...trace(1,undefined,[['q','AXStringForRange',2]])]).forbiddenReads,1);
  // The marker pair classifies on the same web area, never the secure field.
  assert.equal(withMarkers([['b','AXRole+AXSubrole',2,'secure'],['r','AXSelectedTextMarkerRange',2],['q','AXUIElementForTextMarker',2],...trace()]).pass,false);
});
test('summary excludes setup-invalid and known-limit controls from scored product misses',()=>{
  const rows=[{...row(),head:'fix',kind:'short',reason:null,snapshotMs:4,serviceMs:8},
    {...row({fixture:false}),head:'fix',kind:'short',invalid:'arm'},
    {...row({kind:'rewrite',domExact:false,controlExact:true}),head:'fix',kind:'rewrite',reason:null}];
  const s=summarize(rows);
  assert.equal(s.heads.fix.confirmed,1);
  assert.deepEqual(s.heads.fix.snapshotMs,{p50:4,p95:4});
  assert.deepEqual(s.invalid,{arm:1});
  assert.equal(s.knownLimit.lengthConfirmed,1);
  assert.equal(s.wrongSuccesses,0);
});
test('the coded projection holds only counts, timings and closed codes',()=>{
  const rows=[{...row(),head:'fix',kind:'short',reason:null,snapshotMs:4,serviceMs:8,privacy:['stderr/private-name']},
    {...row({head:'main',raw:{confirmed:false,reason:'secure',snapshotMs:2}}),head:'main',kind:'short',reason:'secure',snapshotMs:2,serviceMs:5,
      secret:words[0]},
    {...row({fixture:false}),head:'fix',kind:'long',invalid:'witness '+words[1]}];
  const out=coded(summarize(rows),{required:2,matched:1,pass:false,leaked:words[0]});
  const text=JSON.stringify(out);
  assert.deepEqual(inspect(text,words,{names:false}),[]);
  assert.equal(out.heads.fix.confirmed,1);
  assert.deepEqual(out.heads.main.reasons,{secure:1});
  assert.deepEqual(out.heads.fix.snapshotMs,{p50:4,p95:4});
  assert.deepEqual(out.invalid,{});
  assert.deepEqual(out.auditGate,{required:2,matched:1,pass:false});
  assert.equal(out.privacyViolations,1);
  assert.equal(out.heads.fix.privacyViolations,1);
  assert.equal(JSON.stringify(coded({heads:{},cells:{['fix/'+words[0]]:{planned:1}},invalid:{[words[0]]:2},negative:{reasons:{[words[1]]:3,secure:2}}})).includes(words[0]),false);
  assert.equal(JSON.stringify(coded({negative:{reasons:{[words[1]]:3,secure:2}}})).includes(words[1]),false);
});

test('JSON-facing arrays do not disclose their JavaScript implementation length',()=>{
  const observation={secure:true,actions:['AXConfirm','AXCancel','AXPick'],actionDescriptions:['confirm','cancel','pick'],domClassList:[],value:null};
  assert.deepEqual(inspect(observation,[]),[]);
  assert.notDeepEqual(inspect([{length:8}],[]),[]);
  assert.notDeepEqual(inspect(['cua-engine: {"actualLength":8}'],[]),[]);
});

test('Firefox diagnostic reports excerpt, expected/actual, masks and lengths as booleans only',()=>{
  const normal={meta:{typeReadback:{confirmed:false,reason:'secure',snapshotMs:3}},message:'the field is a password field'};
  assert.deepEqual(firefoxDisclosure(normal),{excerpt:false,expected:false,actual:false,masks:false,lengths:false,actualClass:'unknown'});
  const mismatch={meta:{typeReadback:{confirmed:false,reason:'valueMismatch',expectedLength:13,actualLength:4}},
    message:'From character 4, expected "vptbgw"; the field reads "••••". The expected text is 13 characters long, the field\'s 4.'};
  assert.deepEqual(firefoxDisclosure(mismatch),{excerpt:true,expected:true,actual:true,masks:true,lengths:true,actualClass:'password'});
  assert.deepEqual(firefoxDisclosure({meta:{typeReadback:{actual:''}}}),{excerpt:false,expected:false,actual:true,masks:true,lengths:false,actualClass:'password'});
  assert.equal(firefoxDisclosure({message:'From character 5, expected "stqbot"; the field reads "wqpjuz".'},
    {setupText:'qwqpjuzq',passwordText:'stqbotcv'}).actualClass,'setup');
});

test('drain projections exclude pre-final-post samples and distinguish the final read from the change bound',()=>{
  const trace={lastPostAtMs:1000,firstReadAtMs:980,sampledAtMs:[991,1012,1034],finalReadStartedAtMs:1080,finalReadAtMs:1086,confirmReadAtMs:1085,sampledDropped:0};
  const x=drainIntervals(trace,{replyAtMs:1090,confirmed:true,app:{lastKeyAtMs:1001,lastKeyAppliedAtMs:1002,addedAtMs:994,addAdvancedCaret:true,controlCaretOk:true}});
  assert.deepEqual(x.changeGapsMs,[22]);
  assert.equal(x.drainMs,34);
  assert.equal(x.finalReadMs,86);
  assert.equal(x.confirmReadMs,85);
  assert.equal(x.replyMs,90);
  assert.equal(x.insertionRelativeToLastKeyMs,-8);
  assert.equal(x.replyAfterLastKeyMs,88);
  assert.equal(x.controlCaretOk,true);
  assert.equal(drainIntervals({...trace,sampledDropped:1},{}),null);
  assert.equal(drainIntervals({...trace,firstReadAtMs:1003,sampledAtMs:[]},{}).drainMs,3);
  assert.equal(drainIntervals({...trace,finalReadAtMs:990},{}),null);
  // The final read must have a start no later than its return. A single-read trace may start it before the first read's recorded return.
  assert.equal(drainIntervals({...trace,finalReadStartedAtMs:undefined},{}),null);
  assert.equal(drainIntervals({...trace,finalReadStartedAtMs:1090},{}),null);
  const single={...trace,sampledAtMs:[],firstReadAtMs:1086,finalReadStartedAtMs:1040};
  assert.equal(drainIntervals(single,{editAtMs:1030}).finalStartAfterEditMs,10);
  assert.equal(drainIntervals({...single,firstReadAtMs:1090},{}),null);
  assert.deepEqual(drainStats([1,2,3,4,5]),{n:5,p50:3,p95:5,p99:5,max:5});
  assert.deepEqual(drainStats([]),{n:0,p50:null,p95:null,p99:null,max:null});
});

const sample={lastPostAtMs:1000,firstReadAtMs:980,sampledAtMs:[1012,1034],finalReadStartedAtMs:1080,finalReadAtMs:1086,sampledDropped:0};
const entry=(over={},edit=1050,t=sample)=>{
  const elapsed=drainIntervals(t,{editAtMs:edit});
  const r={valid:true,realized:true,sampled:t!==null,elapsed,...over};
  return {...r,ineligible:drainIneligible(r)};
};
test('a final sample is sizing-eligible only when it started after the fixture\'s own terminal edit', ()=>{
  assert.equal(terminalEditAtMs({lastInputAtMs:1050}),1050);
  assert.equal(terminalEditAtMs({lastKeyAppliedAtMs:1040,addedAtMs:1000}),1040);
  assert.equal(terminalEditAtMs({lastKeyAppliedAtMs:null,addedAtMs:1000}),null);
  assert.equal(terminalEditAtMs(undefined),null);
  assert.equal(drainIntervals(sample,{editAtMs:1050}).finalStartAfterEditMs,30);
  assert.equal(entry().ineligible,null);
  // A final read that began before (or at) the edit is a truncated race, never a sizing sample; its projection is still kept.
  const race=entry({},1083);
  assert.equal(race.ineligible,'final-before-edit');
  assert.equal(race.elapsed.finalStartAfterEditMs,-3);
  assert.equal(entry({},1080).ineligible,'final-before-edit');
  // A trace envelope with no independent edit timestamp cannot size, whatever it carries.
  assert.equal(entry({},null).ineligible,'no-edit-time');
  assert.equal(entry({valid:false}).ineligible,'invalid');
  assert.equal(entry({realized:false}).ineligible,'content-unrealized');
  assert.equal(entry({},1050,{...sample,sampledDropped:1}).ineligible,'no-elapsed');
  assert.equal(entry({},1050,null).ineligible,'no-elapsed');
});
test('drain summary sizes only the eligible subset and reports coverage and fixed reasons separately', ()=>{
  const good=Array.from({length:8},()=>entry());
  const rows=[...good,entry({},1083),entry({},null),entry({realized:false}),entry({},1050,null)];
  const s=drainSummary(rows,12);
  assert.equal(s.sampled,11);
  assert.equal(s.elapsed,11);
  assert.equal(s.realized,11);
  assert.equal(s.eligible,8);
  assert.deepEqual(s.reasons,{'final-before-edit':1,'no-edit-time':1,'content-unrealized':1,'no-elapsed':1});
  // The truncated race (final read begun before a late edit) does not move the sizing statistics.
  assert.deepEqual(s.stats.finalReadMs,{n:8,p50:86,p95:86,p99:86,max:86});
  assert.deepEqual(s.stats.drainMs,{n:8,p50:34,p95:34,p99:34,max:34});
  assert.equal(s.stats.changeGapsMs.n,8);
  // A run of envelopes with no edit timestamp has traces but no sizing samples, so it cannot pass the gate.
  const bare=drainSummary(Array.from({length:12},()=>entry({},null)),12);
  assert.equal(bare.sampled,12);
  assert.equal(bare.eligible,0);
  assert.deepEqual(bare.stats.finalReadMs,{n:0,p50:null,p95:null,p99:null,max:null});
  assert.equal(drainSizingOk(bare,12),false);
  assert.equal(drainSizingOk(s,12),false);
  // 99 of 100 qualify; fewer are descriptive only.
  const hundred=Array.from({length:100},(_,i)=>entry({},i<1?1083:1050));
  assert.equal(drainSizingOk(drainSummary(hundred,100),100),true);
  assert.equal(drainSizingOk(drainSummary([entry({},1083),...hundred.slice(0,1)].concat(hundred.slice(1,99)),100),100),false);
  assert.equal(drainSummary(hundred,100).minimum,99);
  assert.equal(drainSizingOk(drainSummary(good,10),9),false);
  // The listed reasons are only fixed labels.
  assert.deepEqual(inspect(JSON.stringify(s),words,{names:false}),[]);
});
test('Firefox smoke is password-only and only the focus diagnostic carries a setup canary', ()=>{
  assert.deepEqual(runShape('firefox','smoke'),{singlePassword:true,setupCanary:false,requireBackground:false});
  assert.deepEqual(runShape('firefox','full'),{singlePassword:true,setupCanary:false,requireBackground:false});
  assert.deepEqual(runShape('firefox','firefox-single'),{singlePassword:true,setupCanary:false,requireBackground:true});
  assert.deepEqual(runShape('firefox','firefox-focus'),{singlePassword:false,setupCanary:true,requireBackground:false});
  for(const lane of ['cft','safari','appkit'])assert.deepEqual(runShape(lane,'smoke'),{singlePassword:false,setupCanary:false,requireBackground:false});
});
test('every post-input secure concealed failure has a native one-second budget, regardless of readback reason',()=>{
  const s={head:'fix',lane:'cft',kind:'add',literal:false,action:'typeUnconfirmed',startedAt:1000,endedAt:1040,replyAt:2048};
  for(const reason of ['lengthMismatch','lengthUnreadable','noLongerSecure','fieldChanged','fieldUnreadable']){
    const raw={confirmed:false,concealed:true,secure:true,reason};
    assert.deepEqual(concealedFailureTiming({...s,raw}),{phase:'after-input',fromLastPostMs:1008,fromFirstPostMs:1048,withinBudget:true});
    assert.equal(concealedFailureTiming({...s,raw,replyAt:1148}).withinBudget,false);
    assert.equal(concealedFailureTiming({...s,raw,replyAt:2200}).withinBudget,false);
  }
  const basisRefused={confirmed:false,concealed:true,secure:true,reason:'lengthUnreadable'};
  assert.equal(concealedFailureTiming({...s,raw:basisRefused,lane:'appkit',kind:'selection'}).phase,'snapshot-refused');
  assert.equal(concealedFailureTiming({...s,raw:basisRefused,lane:'appkit',kind:'add'}).phase,'after-input');
  assert.equal(concealedFailureTiming({...s,raw:basisRefused,startedAt:null,endedAt:null}).phase,'before-input');
  assert.equal(concealedFailureTiming({...s,raw:basisRefused,literal:true}),null);
  assert.equal(concealedFailureTiming({...s,raw:basisRefused,head:'main'}),null);
  assert.equal(concealedFailureTiming({...s,raw:{...basisRefused,secure:false}}),null);
});
test('genuine edit intervals include the state active at the last post, not the whole typing cadence',()=>{
  assert.deepEqual(appliedEditGaps([980,999,1009,1038],1000),[10,29]);
  assert.deepEqual(appliedEditGaps([980,990,999],1000),[]);
  assert.deepEqual(appliedEditGaps([1005,1012],1000),[7]);
  assert.deepEqual(appliedEditGaps([999,1008,1005],1000),[]);
  assert.deepEqual(appliedEditGaps([999,'1010',1040],1000),[]);
  assert.deepEqual(appliedEditGaps([999,1009],null),[]);
});
test('the smoke focus scratch job is allowed for Firefox only and setup failures project fixed labels', ()=>{
  assert.equal(focusAllowed('firefox','smoke','focus'),true);
  assert.equal(focusAllowed('firefox','firefox-focus','focus'),true);
  assert.equal(focusAllowed('cft','smoke','focus'),false);
  assert.equal(focusAllowed('firefox','smoke','stock'),false);
  assert.equal(focusAllowed('firefox','full','focus'),false);
  assert.equal(setupLabel(Object.assign(Error('x'),{setupStep:'cover-activation'})),'cover-activation');
  assert.equal(setupLabel(Object.assign(Error('x'),{setupStep:words[0]})),null);
  assert.equal(setupLabel(Error('x')),null);
  assert.equal(setupLabel(undefined),null);
});

test('reduced plan: per-head counts, fix-only controls, interleaving, AppKit-only labeled selection',()=>{
  assert.deepEqual(REDUCED_LANES,['cft','electron','electron-parity','safari','appkit']);
  const count=(rows,f)=>rows.filter(f).length;
  for(const lane of REDUCED_LANES){
    const rows=reducedPlan(lane);
    for(const head of ['main','fix']){
      assert.equal(count(rows,r=>r.head===head&&r.kind==='short'),10);
      assert.equal(count(rows,r=>r.head===head&&r.kind==='long'),10);
      assert.equal(count(rows,r=>r.head===head&&r.kind==='literal'),5);
    }
    assert.equal(count(rows,r=>r.head==='main'&&!['short','long','literal'].includes(r.kind)),0);
    assert.equal(count(rows,r=>r.kind==='add'),20);
    assert.equal(count(rows,r=>r.kind==='add'&&r.literal),10);
    assert.equal(count(rows,r=>r.kind==='drop'),10);
    assert.equal(count(rows,r=>r.kind==='drop'&&r.literal),5);
    assert.equal(count(rows,r=>['rewrite','unicode'].includes(r.kind)),0);
    const sel=rows.filter(r=>r.kind==='selection');
    assert.equal(sel.length,lane==='appkit'?5:0);
    assert.ok(sel.every(r=>r.head==='fix'&&r.label===SNAPSHOT_REFUSAL_LABEL));
    assert.equal(rows.length,lane==='appkit'?85:80);
    for(const kind of ['short','long','literal']){
      const paired=rows.filter(r=>r.kind===kind);
      for(let i=0;i<paired.length;i+=2){assert.equal(paired[i].rep,paired[i+1].rep);assert.notEqual(paired[i].head,paired[i+1].head);}
    }
  }
  // The added scratch audit jobs run the existing five trios per lane.
  assert.equal(plan(false,{audit:true}).length,15);
});
test('deadline plan retains paired concealed positives and independent short/long failure cohorts',()=>{
  for(const lane of REDUCED_LANES){
    const rows=reducedPlan(lane,{mode:'deadline'});
    const controls=rows.filter(r=>['add','drop'].includes(r.kind));
    const n=(kind,literal,inputClass)=>controls.filter(r=>r.kind===kind&&r.literal===literal&&r.inputClass===inputClass).length;
    assert.equal(rows.length,lane==='appkit'?90:85);
    assert.ok(controls.every(r=>r.head==='fix'));
    assert.equal(new Set(controls.map(r=>`${r.kind}/${r.rep}`)).size,controls.length,'inputs must not collide across cohorts');
    assert.deepEqual([n('add',false,'short'),n('add',false,'long'),n('drop',false,'short'),n('drop',false,'long'),
      n('add',true),n('drop',true)],[10,10,5,5,10,5]);
    for(const kind of ['short','long']){
      const pairs=rows.filter(r=>r.kind===kind);
      assert.equal(pairs.length,20);
      for(let i=0;i<pairs.length;i+=2){
        assert.equal(pairs[i].rep,pairs[i+1].rep);
        assert.deepEqual(new Set([pairs[i].head,pairs[i+1].head]),new Set(['main','fix']));
      }
    }
    assert.ok(!rows.some(r=>r.kind==='literal'));
    assert.equal(rows.filter(r=>r.head==='fix'&&r.kind==='selection'&&r.label===SNAPSHOT_REFUSAL_LABEL).length,lane==='appkit'?5:0);
  }
});
test('deadline-controls runs only the balanced concealed controls and keeps the deadline gates',()=>{
  const mode='deadline-controls';
  for(const lane of REDUCED_LANES){
    const rows=reducedPlan(lane,{mode});
    assert.equal(rows.length,lane==='appkit'?35:30);
    assert.deepEqual(rows,reducedPlan(lane,{mode:'deadline'}).filter(r=>r.literal===false||r.label===SNAPSHOT_REFUSAL_LABEL));
    const timed=rows.map(r=>({...r,valid:true,concealedFailure:{phase:r.label?'snapshot-refused':'after-input',fromLastPostMs:1101}}));
    assert.equal(reducedBudgetCoverage(lane,timed,mode).ok,true);
    assert.equal(reducedBudgetCoverage(lane,timed.slice(1),mode).ok,false);
    assert.equal(failureDistributions(timed,mode).pass,true);
  }
  const raw={confirmed:false,concealed:true,secure:true,reason:'lengthMismatch'};
  const wait={head:'fix',lane:'cft',kind:'add',literal:false,action:'typeUnconfirmed',startedAt:1000,endedAt:1040,replyAt:2141,mode,raw};
  assert.equal(concealedFailureTiming(wait).withinBudget,true);
  assert.equal(concealedFailureTiming({...wait,lateReply:true}).withinBudget,false);
  assert.equal(concealedFailureTiming({...wait,replyAt:2140-2}).withinBudget,false);
});
test('sampled-hold uses the identical balanced stock manifest without deadline decisions',()=>{
  const mode='sampled-hold';
  for(const lane of REDUCED_LANES)assert.deepEqual(reducedPlan(lane,{mode}),reducedPlan(lane,{mode:'deadline'}));
  const raw={confirmed:false,concealed:true,secure:true,reason:'lengthMismatch'};
  const args={head:'fix',lane:'cft',kind:'add',literal:false,action:'typeUnconfirmed',startedAt:1000,endedAt:1040,mode,raw};
  assert.deepEqual(concealedFailureTiming({...args,replyAt:2040}),{phase:'after-input',fromLastPostMs:1000,fromFirstPostMs:1040,withinBudget:null});
  assert.equal(concealedFailureTiming({...args,replyAt:2200,lateReply:true}).withinBudget,null);
  assert.deepEqual(concealedFailureTiming({...args,lane:'appkit',kind:'selection',raw:{...raw,reason:'lengthUnreadable'},replyAt:1043}),
    {phase:'snapshot-refused',fromLastPostMs:3,fromFirstPostMs:43,withinBudget:null});
});
test('concealed failure reply times pool valid add and drop rows only within each length',()=>{
  const timed=(kind,inputClass,fromLastPostMs)=>({head:'fix',kind,inputClass,literal:false,valid:true,concealedFailure:{phase:'after-input',fromLastPostMs}});
  const s=timed('add','short',901),l=timed('drop','long',987);
  const r=failureTimingByLength([s,l,timed('drop','short',917),timed('add','short',905),
    {...s,head:'main'},{...s,literal:true},{...l,valid:false},{...l,kind:'selection'},
    {...l,concealedFailure:{phase:'after-input',fromLastPostMs:null}},{...l,concealedFailure:{phase:'snapshot-refused',fromLastPostMs:2}}]);
  assert.deepEqual(r.short,{n:3,p50:905,p95:917,p99:917,max:917});
  assert.deepEqual(r.long,{n:1,p50:987,p95:987,p99:987,max:987});
});
test('removed wire key detection catches presence anywhere in structured replies without following cycles or reading getters',()=>{
  const error=Error('fixed');Object.defineProperty(error,'meta',{value:{detail:[{'cua/lateReply':false}]}});
  const cyclic={};cyclic.self=cyclic;
  Object.defineProperty(cyclic,'computed',{get(){throw Error('must not inspect computed values');}});
  assert.equal(lateReplyPresent(cyclic,{error}),true);
  assert.equal(lateReplyPresent(cyclic,{payload:{lateReply:null}}),true);
  assert.equal(lateReplyPresent(cyclic,{payload:'the lateReply key is absent'}),false);
});
test('selection control is excluded from the head comparison but scored like any row',()=>{
  const sel={...row({kind:'selection',lane:'appkit',raw:{confirmed:false,secure:true,reason:'lengthUnreadable',snapshotMs:2}}),head:'fix',kind:'selection',label:SNAPSHOT_REFUSAL_LABEL};
  const s=summarize([sel,{...row(),head:'fix',kind:'short'}]);
  assert.equal(s.heads.fix.planned,1);
  assert.equal(s.cells['fix/selection'].passed,1);
});
test('the reduced AppKit selection is an explicit snapshot-refusal test and the reduced budget gate is never vacuous',()=>{
  const refused={confirmed:false,concealed:true,secure:true,reason:'lengthUnreadable',snapshotMs:2};
  const sel=(over={})=>score({head:'fix',kind:'selection',lane:'appkit',label:SNAPSHOT_REFUSAL_LABEL,raw:refused,forwarded:refused,sky:'typeUnconfirmed',fixture:true,domExact:true,...over});
  assert.equal(sel().pass,true);
  assert.equal(sel({raw:{...refused,reason:'selectionUnreadable'},forwarded:{...refused,reason:'selectionUnreadable'}}).pass,true);
  // A success, a disagreement, an unrelated refusal, inexact content or an unlabeled lane are not the test.
  for(const over of [{raw:success,forwarded:success,sky:'ok'},{forwarded:{...refused,reason:'selectionUnreadable'}},{forwarded:old},
    {raw:{...refused,reason:'lengthMismatch'},forwarded:{...refused,reason:'lengthMismatch'}},{raw:{...refused,concealed:false}},{raw:{...refused,secure:false}},
    {domExact:false},{domExact:undefined},{sky:'unexpected-error'},{fixture:false},{lane:'cft'},{head:'main'}])
    assert.equal(sel(over).pass,false,JSON.stringify(over));
  const timed=(over={})=>({valid:true,head:'fix',...over});
  const post={phase:'after-input'},snap={phase:'snapshot-refused'};
  const ctl=Array.from({length:15},(_,i)=>timed({kind:i<10?'add':'drop',literal:false,concealedFailure:post}));
  const five=Array.from({length:5},()=>timed({kind:'selection',label:SNAPSHOT_REFUSAL_LABEL,concealedFailure:snap}));
  assert.equal(reducedBudgetCoverage('cft',ctl).ok,true);
  assert.equal(reducedBudgetCoverage('appkit',[...ctl,...five]).ok,true);
  assert.equal(reducedBudgetCoverage('cft',[]).ok,false,'zero failures is not a pass');
  assert.equal(reducedBudgetCoverage('appkit',ctl).ok,false);
  assert.equal(reducedBudgetCoverage('appkit',[...ctl,...five.slice(1)]).ok,false);
  assert.equal(reducedBudgetCoverage('cft',ctl.slice(1)).ok,false);
  assert.equal(reducedBudgetCoverage('cft',[...ctl.slice(1),timed({kind:'add',literal:false,concealedFailure:{phase:'before-input'}})]).ok,false);
  assert.equal(reducedBudgetCoverage('cft',[...ctl.slice(1),timed({kind:'add',literal:false,valid:false,concealedFailure:post})]).ok,false);
  assert.equal(reducedBudgetCoverage('cft',[...ctl.slice(1),timed({kind:'short',concealedFailure:post})]).ok,false);
});
test('the budget window is a seam: legacy 999..1100, reduced pads every posted refusal including snapshot refusals',()=>{
  assert.deepEqual(budgetProfile('full'),{name:'legacy',minMs:999,maxMs:1100,snapshotBudgeted:false});
  assert.equal(budgetProfile('reduced').minMs,REDUCED_PAD_MS-1);
  assert.equal(budgetProfile('reduced').maxMs,REDUCED_PAD_MS+REDUCED_OVERHEAD_MS);
  const s={head:'fix',lane:'cft',kind:'add',literal:false,action:'typeUnconfirmed',startedAt:1000,endedAt:1040};
  const raw={confirmed:false,concealed:true,secure:true,reason:'lengthMismatch'};
  const at=(ms,more={},mode)=>concealedFailureTiming({...s,raw,replyAt:1040+ms,mode,...more});
  for(const [ms,ok] of [[998,false],[999,true],[1100,true],[1101,false]])assert.equal(at(ms).withinBudget,ok,'legacy '+ms);
  for(const [ms,ok] of [[1000,false],[1098,false],[1099,true],[1150,true],[1151,false]])assert.equal(at(ms,{},'reduced').withinBudget,ok,'reduced '+ms);
  assert.equal(at(1120,{},'reduced').fromFirstPostMs,1160);
  // A snapshot refusal after posting: evidence only under legacy, budgeted under reduced.
  const snap={raw:{confirmed:false,concealed:true,secure:true,reason:'lengthUnreadable'},lane:'appkit',kind:'selection'};
  assert.equal(at(1120,snap).phase,'snapshot-refused');
  assert.equal(at(1120,snap).withinBudget,null);
  assert.equal(at(1120,snap,'reduced').withinBudget,true);
  assert.equal(at(500,snap,'reduced').withinBudget,false);
  assert.equal(at(1120,{startedAt:null,endedAt:null},'reduced').withinBudget,null);
  assert.equal(at(1120,{literal:true},'reduced'),null);
});
test('deadline timing rejects a late wire reply independently of the stock IPC allowance',()=>{
  const raw={confirmed:false,concealed:true,secure:true,reason:'lengthMismatch',snapshotMs:4};
  const s={head:'fix',lane:'cft',kind:'add',literal:false,action:'typeUnconfirmed',startedAt:1000,endedAt:1040,replyAt:2148,mode:'deadline'};
  assert.equal(concealedFailureTiming({...s,raw}).withinBudget,true);
  assert.equal(concealedFailureTiming({...s,raw:{...raw,lateReply:true}}).withinBudget,false);
  assert.equal(concealedFailureTiming({...s,raw,lateReply:true}).withinBudget,false);
  assert.equal(concealedFailureTiming({...s,raw,replyAt:2138}).withinBudget,false);
  assert.equal(concealedFailureTiming({...s,raw,replyAt:2191}).withinBudget,false);
  const snap={...s,lane:'appkit',kind:'selection',raw:{...raw,reason:'lengthUnreadable'}};
  assert.equal(concealedFailureTiming(snap).withinBudget,true);
  assert.equal(concealedFailureTiming({...snap,lateReply:true}).withinBudget,false);
  assert.equal(concealedFailureTiming({...snap,replyAt:1042}).withinBudget,false);
  assert.equal(lateReplyPresent(null,raw,{}),false);
  assert.equal(lateReplyPresent(raw,{'cua/lateReply':true}),true);
  assert.equal(lateReplyPresent({...raw,lateReply:false}),true,'malformed flag presence is still a failure');
  assert.deepEqual(inspect({error:{meta:{typeReadback:{...raw,lateReply:true}}}},[],{surface:'ipc'}),[]);
  assert.ok(inspect({error:{meta:{typeReadback:{...raw,lateReply:false}}}},[],{surface:'ipc'}).includes('readback-shape'));
});
test('deadline distributions fail on missing cohorts, disjoint ranges, or separated medians',()=>{
  const group=(kind,inputClass,ms)=>ms.map(fromLastPostMs=>({kind,inputClass,head:'fix',literal:false,valid:true,concealedFailure:{phase:'after-input',fromLastPostMs}}));
  const a=group('add','short',[1100,1101,1102,1103,1104,1105,1106,1107,1108,1109]);
  const b=group('add','long',[1108,1108,1108,1108,1108,1109,1109,1109,1109,1110]);
  const c=group('drop','short',[1100,1101,1102,1108,1109]);
  const d=group('drop','long',[1101,1102,1105,1107,1109]);
  const rows=[...a,...b,...c,...d];
  const extras=[{...a[0],valid:false},{...a[0],literal:true},{...a[0],head:'main'},
    {...a[0],concealedFailure:{phase:'before-input',fromLastPostMs:2}},
    {...a[0],kind:'selection',label:SNAPSHOT_REFUSAL_LABEL,concealedFailure:{phase:'snapshot-refused',fromLastPostMs:1123}}];
  const report=failureDistributions([...rows,...extras],'deadline');
  assert.equal(report.pass,true);
  assert.deepEqual(report.groups['add-short'],{n:10,min:1100,p50:1104.5,p95:1109,max:1109});
  assert.deepEqual(report.groups['drop-long'],{n:5,min:1101,p50:1105,p95:1109,max:1109});
  assert.ok(report.pairs.add.overlap&&report.pairs.drop.overlap);
  assert.equal(report.spreadMs,6.5);
  assert.equal(reducedBudgetCoverage('cft',rows,'deadline').ok,true);
  assert.equal(reducedBudgetCoverage('appkit',rows,'deadline').ok,false);
  assert.equal(reducedBudgetCoverage('appkit',[...rows,...Array(5).fill(extras.at(-1))],'deadline').ok,true);
  assert.equal(failureDistributions(rows.slice(1),'deadline').pass,false);
  assert.equal(failureDistributions([{...a[0],inputClass:undefined},...rows.slice(1)],'deadline').pass,false);
  const shifted=(kind,ms)=>failureDistributions([...rows.filter(r=>r.kind!==kind||r.inputClass!=='long'),...group(kind,'long',ms)],'deadline');
  const disjoint=shifted('add',Array(10).fill(1110));
  assert.equal(disjoint.pairs.add.overlap,false);
  assert.equal(disjoint.pass,false);
  const separated=shifted('drop',[1109,1115,1116,1117,1118]);
  assert.equal(separated.pairs.drop.overlap,true);
  assert.equal(separated.spreadMs,14);
  assert.equal(separated.pass,false);
  assert.equal(failureDistributions([],'deadline').pass,false);
});
test('concealed refusal reasons compare equal-sized short and long distributions for each mutation',()=>{
  const control=(kind,inputClass,reason)=>({valid:true,head:'fix',kind,inputClass,literal:false,reason});
  const groups=(kind,n)=>['short','long'].flatMap(inputClass=>Array.from({length:n},(_,i)=>
    control(kind,inputClass,i===0?'fieldChanged':'lengthMismatch')));
  const rows=[...groups('add',10),...groups('drop',5)];
  const extras=[{...rows[0],literal:true},{...rows[0],valid:false},{...rows[0],head:'main'},
    {...rows[0],kind:'selection',label:SNAPSHOT_REFUSAL_LABEL,reason:'lengthUnreadable'}];
  const report=failureReasonParity([...rows,...extras]);
  assert.equal(report.pass,true);
  assert.deepEqual(report.groups['add-short'],{fieldChanged:1,lengthMismatch:9});
  assert.deepEqual(report.groups['drop-long'],{fieldChanged:1,lengthMismatch:4});
  const uneven=failureReasonParity([{...rows[1],reason:'fieldChanged'},...rows.filter((_,i)=>i!==1)]);
  assert.equal(uneven.pass,false,'the same codes at different rates are not identical');
  assert.equal(uneven.pairs.add,false);
  assert.equal(uneven.pairs.drop,true);
  assert.equal(failureReasonParity(rows.slice(1)).pass,false,'missing coverage cannot pass');
  assert.equal(failureReasonParity([{...rows[0],reason:'other'},{...rows[10],reason:'other'},...rows.filter((_,i)=>i!==0&&i!==10)]).pass,false,'unknown reasons cannot pass by matching');
});
const zero={confirmed:false,reason:'noFocusedElement',snapshotMs:3,pollMs:0,reads:0};
const surfaces=(r=zero)=>({ipc:readbackProfile(r),wrapper:readbackProfile(r),forwarded:readbackProfile(r)});
const baselineFlags=['ipc-type/private-key','ipc-type/readback-shape','forwarded/private-key','sky-error/private-key'];
test('legacy baseline diagnostic reports closed booleans, grants no exemption and fails closed when unknown',()=>{
  assert.notDeepEqual(inspect({result:{meta:{typeReadback:zero}}},words,{literal:true,surface:'ipc',baseline:true}),[],'strict scan still flags noFocusedElement');
  const ok=legacyBaselineCase({head:'main',reason:'noFocusedElement',flags:baselineFlags,surfaces:surfaces()});
  assert.equal(ok.allowed,true);
  assert.equal(ok.surfaces.ipc.zeroCounters,true);
  assert.equal(legacyBaselineCase({head:'main',reason:'x',flags:[],surfaces:surfaces()}),null);
  const bad=r=>legacyBaselineCase({head:'main',reason:'noFocusedElement',flags:baselineFlags,surfaces:surfaces(r)});
  for(const r of [{...zero,pollMs:3},{...zero,reads:1},{confirmed:false,reason:'noFocusedElement',snapshotMs:3},{...zero,excerpt:'x'},{...zero,actual:'x'},{...zero,expected:'x'},
    {...zero,value:'x'},{...zero,masks:1},{...zero,expectedLength:3},{...zero,length:3},{...zero,novel:true},{...zero,secure:'yes'},{...zero,nested:{a:1}},null])
    assert.equal(bad(r).allowed,false,JSON.stringify(r));
  assert.equal(legacyBaselineCase({head:'main',reason:'noFocusedElement',flags:[...baselineFlags,'ipc-type/private-text'],surfaces:surfaces()}).allowed,false);
  assert.equal(legacyBaselineCase({head:'main',reason:'noFocusedElement',flags:[...baselineFlags,'sky-error/synthetic-value'],surfaces:surfaces()}).allowed,false);
  assert.equal(legacyBaselineCase({head:'fix',reason:'noFocusedElement',flags:baselineFlags,surfaces:surfaces()}).allowed,false);
  assert.equal(legacyBaselineCase({head:'main',reason:'noFocusedElement',flags:baselineFlags,surfaces:{...surfaces(),wrapper:{present:false}}}).allowed,false);
  assert.equal(legacyBaselineCase({head:'main',reason:'noFocusedElement',flags:baselineFlags,surfaces:undefined}).allowed,false);
  const t=legacyBaselineTally([ok,bad({...zero,pollMs:3}),null,legacyBaselineCase({head:'fix',reason:'secure',flags:baselineFlags,surfaces:surfaces()})]);
  assert.deepEqual(t.allowed,{main:{noFocusedElement:1},fix:{}});
  assert.deepEqual(t.unproven,{main:{noFocusedElement:1},fix:{secure:1}});
  assert.equal(t.flagged,3);
  assert.equal(t.surfaces.ipc.zeroCounters,2);
  assert.deepEqual(inspect(JSON.stringify(ok),words,{names:false,stringsOnly:true}),[]);
});
