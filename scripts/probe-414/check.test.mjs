import {test} from 'node:test';
import assert from 'node:assert/strict';
import {plan, score, inspect, auditSchedule, auditPairs, summarize, coded, noteAttested, NOTE_PREFIX} from './check.mjs';

const success={confirmed:true,secure:true,confirmation:'length',snapshotMs:4};
const old={confirmed:false,concealed:true,reason:'secure',snapshotMs:3};
const reject={confirmed:false,secure:true,reason:'lengthMismatch',snapshotMs:3};
function row({head='fix',kind='short',lane='cft',literal=false,preliminary=false,raw=success,forwarded=raw,sky=raw.confirmed?'ok':'typeUnconfirmed',fixture=true,domExact=true,controlExact=null,noted=true}={}){
  return score({head,kind,lane,literal,preliminary,raw,forwarded,sky,fixture,domExact,controlExact,noted});
}
test('plan balances each cell and interleaves product pins',()=>{
  const rows=plan(false);
  assert.equal(rows.length,105);
  for(const kind of ['short','long','selection','literal']){
    const paired=rows.filter(r=>r.kind===kind);
    assert.equal(paired.length,10);
    for(let i=0;i<10;i+=2){assert.equal(paired[i].rep,paired[i+1].rep);assert.notEqual(paired[i].head,paired[i+1].head);}
  }
  for(const kind of ['drop','add'])assert.equal(rows.filter(r=>r.kind===kind&&r.head==='fix').length,10);
  for(const kind of ['drop','add'])assert.equal(rows.filter(r=>r.kind===kind&&r.literal===true).length,5);
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
