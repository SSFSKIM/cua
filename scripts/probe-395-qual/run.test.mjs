import test from 'node:test';
import assert from 'node:assert/strict';
import {page} from './fixture.mjs';
import {plan, expectationFor, outcomeOf, scoreRow, publicAuditRow, actualOf, contractsOf, publication, attestText, engineEnv, renameKeys} from './run.mjs';
import {createAuditCapture} from './audit-capture.mjs';

test('literal password diagnostic runs only balanced large password pairs and compares DOM on both heads',()=>{
 const rounds=plan({reps:40,seed:395,passwordLiteral:true});
 assert.equal(rounds.length,40);
 for(const [i,r] of rounds.entries()){
  assert.equal(r.length,2);
  assert.deepEqual(r.map(c=>[c.page,c.kind,c.rep]),[['large','secure',i+1],['large','secure',i+1]]);
  assert.deepEqual(r.map(c=>c.head),i%2?['fix','main']:['main','fix']);
  assert.ok(r.every(c=>c.expected.domRequired===true));
 }
});

test('literal password audits require literal arguments while keeping secure metadata rules',async()=>{
 const capture=createAuditCapture({mode:'stock'}),tag='fix-large-secure-r01';
 capture.begin(tag,{head:'fix',page:'large',kind:'secure',expectConcealed:false});
 capture.engineArgs(tag,'type_text',{});
 const readback={confirmed:false,reason:'secure',snapshotMs:5};
 capture.engineReply(tag,'type_text',{error:{errorName:'typeUnconfirmed',meta:{typeReadback:readback}}});
 capture.sky(tag,{meta:{'cua/typeReadback':readback}});
 const r=publicAuditRow(await capture.end(tag));
 assert.equal(r.publishable,true);
 assert.equal(r.row.ok,true);
 assert.deepEqual(r.row.typeReadback,readback);
 assert.equal(r.row.lane,'secure');
});

async function literalRow({literal=true,mode='stock',length=32,engineMeta,skyMeta,errorMeta=engineMeta,field=61,withError=true}){
 const capture=createAuditCapture({mode}),tag='main-large-secure-r01';
 capture.begin(tag,{head:'main',page:'large',kind:'secure',length,fieldLengths:[field],expectConcealed:false,literal});
 capture.engineArgs(tag,'type_text',{});
 capture.engineReply(tag,'type_text',{error:{errorName:'typeUnconfirmed',code:-1,message:'refused',meta:engineMeta}});
 const error=Object.assign(new Error('refused'),{name:'SkyComputerUseError',errorName:'typeUnconfirmed',meta:errorMeta});
 capture.sky(tag,{error:withError?error:null,meta:skyMeta});
 return capture.end(tag);
}
const refusal=(reason,extra={},entered=32)=>({typeReadback:{confirmed:false,reason,snapshotMs:5,pollMs:0,reads:0,...extra},entered,inputRoute:"2'",startedAt:1,endedAt:2});
const skyOf=(m,entered=m.entered)=>({'cua/typeReadback':m.typeReadback,'cua/entered':entered});

test('literal password diagnostic validates and discards the known refusal telemetry at its wire positions',async()=>{
 for(const reason of ['secure','noFocusedElement']){
  const m=refusal(reason),a=await literalRow({engineMeta:m,skyMeta:skyOf(m)});
  assert.deepEqual(a.privacy.codes,{},reason);
  const r=publicAuditRow(a);
  assert.equal(r.publishable,true,reason);assert.equal(r.row.ok,true);assert.equal(r.row.keyedRoute,true);
  const kept={confirmed:false,reason,snapshotMs:5};
  assert.deepEqual(r.row.typeReadback,kept);assert.deepEqual(r.row.skyTypeReadback,kept);
  assert.ok(!JSON.stringify(a).includes('"entered"')&&!JSON.stringify(a).includes('cua/entered')&&!JSON.stringify(a).includes('pollMs'));
 }
 // A refusal that posted nothing, and a sky result with null forwarded fields, are in shape too.
 const none=refusal('secure',{},0),a=await literalRow({engineMeta:none,skyMeta:{'cua/typeReadback':null,'cua/entered':null},withError:false});
 assert.equal(a.privacy.violations,0);
});

test('literal password diagnostic keeps keyedRoute a boolean from canonical wire meta and not for other routes',async()=>{
 const m=refusal('secure');m.inputRoute='3';
 const r=publicAuditRow(await literalRow({engineMeta:m,skyMeta:skyOf(m)}));
 assert.equal(r.row.keyedRoute,false);
 assert.ok(!JSON.stringify(r.row).includes('inputRoute'));
});

test('literal password diagnostic still fails closed on anything beyond the known fields',async()=>{
 const bad=[
  ['nonzero poll',refusal('secure',{pollMs:1})],['nonzero reads',refusal('secure',{reads:3})],['string poll',refusal('secure',{pollMs:'0'})],
  ['entered above the typed length',refusal('secure',{},33)],['entered at the field length',refusal('secure',{},61)],['negative entered',refusal('secure',{},-1)],
  ['fractional entered',refusal('secure',{},1.5)],['string entered',refusal('secure',{},'32')],['object entered',refusal('secure',{},{n:32})],
  ['actual length',refusal('secure',{actualLength:29})],['expected length',refusal('secure',{expectedLength:61})],['unknown field',refusal('secure',{extra:1})],
  ['checkpoints',refusal('secure',{checkpoints:2})],
 ];
 for(const [name,m] of bad){
  for(const where of ['engine','sky-meta','sky-error']){
   const clean=refusal('secure'),opts={engineMeta:clean,skyMeta:skyOf(clean),errorMeta:clean};
   if(where==='engine')opts.engineMeta=m;
   else if(where==='sky-meta'){opts.skyMeta=skyOf(m)}
   else opts.errorMeta=m;
   const a=await literalRow(opts),r=publicAuditRow(a);
   assert.ok(a.privacy.violations>0,name+' '+where);assert.equal(r.publishable,false,name+' '+where);
  }
 }
});

test('literal exemptions apply only at wire metadata positions, only when declared and only on a stock secure request',async()=>{
 const m=refusal('secure'),skyAt=meta=>({'cua/typeReadback':m.typeReadback,...meta});
 // The same fields anywhere else, or on a request that did not declare the literal diagnostic, remain violations.
 assert.ok((await literalRow({literal:false,engineMeta:m,skyMeta:skyOf(m),withError:false})).privacy.violations>0);
 const nested=await literalRow({engineMeta:{...m,extra:{entered:32}},skyMeta:skyOf(m),withError:false});
 assert.ok(nested.privacy.violations>0);
 const wrongKey=await literalRow({engineMeta:m,skyMeta:skyAt({entered:32}),withError:false});
 assert.ok(wrongKey.privacy.violations>0);
 const flat=await literalRow({engineMeta:m,skyMeta:skyOf(m),withError:false});
 const alias=createAuditCapture({mode:'stock'}),at='main-large-secure-r01';
 alias.begin(at,{head:'main',page:'large',kind:'secure',length:32,expectConcealed:false,literal:true});
 alias.engineArgs(at,'type_text',{});
 alias.engineReply(at,'type_text',{'error.meta':{entered:32,typeReadback:{confirmed:false,reason:'secure',snapshotMs:5,pollMs:0}}});
 alias.sky(at,{});
 assert.equal(flat.privacy.violations,0);
 assert.ok((await alias.end(at)).privacy.violations>=2);
 const inResult=createAuditCapture({mode:'stock'}),tag='main-large-secure-r01';
 inResult.begin(tag,{head:'main',page:'large',kind:'secure',length:32,expectConcealed:false,literal:true});
 inResult.engineArgs(tag,'type_text',{});
 inResult.engineReply(tag,'type_text',{result:{entered:32}});
 inResult.surface(tag,'content',[{entered:32}]);
 inResult.sky(tag,{});
 assert.ok((await inResult.end(tag)).privacy.violations>=2);
 assert.throws(()=>createAuditCapture({mode:'audit'}).begin('a-b-r01',{head:'main',page:'large',kind:'secure',length:32,expectConcealed:false,literal:true}));
 assert.throws(()=>createAuditCapture({mode:'stock'}).begin('a-b-r01',{head:'main',page:'large',kind:'plain',length:32,literal:true}));
 assert.throws(()=>createAuditCapture({mode:'stock'}).begin('a-b-r01',{head:'main',page:'large',kind:'secure',length:32,literal:true}));
});

test('twenty trials per cell and head, balanced interleaving with independent A/B pairs',()=>{
 const rounds=plan({reps:20,seed:395});
 assert.equal(rounds.flat().length,320);
 const first=new Map(), ids=new Set();
 for(const round of rounds){
  assert.equal(round.length,16);
  for(let i=0;i<round.length;i+=2){
   const [a,b]=round.slice(i,i+2);
   assert.equal(a.pairKey,b.pairKey);assert.notEqual(a.head,b.head);
   first.set(a.unit+'/'+a.head,(first.get(a.unit+'/'+a.head)??0)+1);
   ids.add(a.id);ids.add(b.id);
  }
 }
 assert.equal(ids.size,320);assert.equal(first.size,16);assert.ok([...first.values()].every(n=>n===10));
});

test('secure control is parsed as password, rather than assigned after load',()=>{
 const html=page();assert.match(html,/<input id="probe395q-secure"[^>]+type="password"/);
 const script=html.match(/<script>([\s\S]+)<\/script>/)[1];
 assert.doesNotThrow(()=>new Function(script));
 assert.doesNotMatch(script,/\bP\.type\s*=(?!=)/);
});

test('engine RPC success without confirmed readback, and confirmation without DOM equality, are not passes',()=>{
 const expected=expectationFor('fix','large','secretShort');
 const good={expected,reason:null,domEqual:true,domKnown:true,harnessValid:true};
 const unconfirmed=outcomeOf({error:{errorName:'typeUnconfirmed',meta:{typeReadback:{confirmed:false}}}});
 assert.equal(unconfirmed,'unconfirmed');
 assert.equal(scoreRow({...good,outcome:unconfirmed}).strict,false);
 const resultWithoutConfirmed=outcomeOf({result:{meta:{typeReadback:{confirmed:false}}}});
 assert.notEqual(resultWithoutConfirmed,'ok');
 const score=scoreRow({...good,outcome:'ok',domEqual:false,confirmed:true});
 assert.equal(score.strict,false);assert.equal(score.wrongSuccess,true);
});

test('main large no-focus baseline and candidate secure refusals stay distinct',()=>{
 const base={outcome:'unconfirmed',confirmed:false,forwarded:false,domEqual:true,domKnown:true,harnessValid:true};
 assert.equal(scoreRow({...base,expected:expectationFor('main','large','plain'),reason:'noFocusedElement'}).strict,true);
 assert.equal(scoreRow({...base,expected:expectationFor('main','large','secure'),reason:'noFocusedElement'}).strict,true);
 for(const [head,page] of [['main','small'],['fix','small'],['fix','large']]){
  const expected=expectationFor(head,page,'secure');
  assert.equal(scoreRow({...base,expected,reason:'secure'}).strict,true);
  assert.equal(scoreRow({...base,expected,reason:'noFocusedElement'}).strict,false);
 }
});

const goodPositive={expected:expectationFor('fix','large','plain'),outcome:'ok',reason:null,confirmed:true,forwarded:true,sky:'ok',domEqual:true,domKnown:true,harnessValid:true};
test('a positive needs successful sky and raw and forwarded confirmation; conflicts are never strict',()=>{
 assert.equal(scoreRow(goodPositive).strict,true);
 for(const bad of [{sky:'threw'},{sky:null},{forwarded:null},{forwarded:false},{confirmed:null},{conflict:true}])assert.equal(scoreRow({...goodPositive,...bad}).strict,false,JSON.stringify(bad));
 // an error carrying a confirmation true: not strict, and a wrong success over a mismatching page
 const refusal={expected:expectationFor('main','large','plain'),outcome:'unconfirmed',reason:null,confirmed:false,forwarded:false,sky:'threw',domEqual:true,domKnown:true,harnessValid:true};
 assert.equal(scoreRow(refusal).strict,true);
 assert.equal(scoreRow({...refusal,forwarded:null}).strict,false);
 const conflicting=scoreRow({...refusal,forwarded:true});
 assert.equal(conflicting.strict,false);assert.equal(conflicting.conflict,true);assert.equal(conflicting.wrongSuccess,false);
 assert.equal(scoreRow({...refusal,confirmed:true,domEqual:false}).wrongSuccess,true);
});
test('the raw readback is canonical: a forwarded reason or confirmation that differs is a conflict',()=>{
 const raw={confirmed:false,reason:'secure'};
 assert.deepEqual(actualOf({outcome:'unconfirmed',engineRecord:raw,forwarded:{confirmed:false,reason:'secure'}}),{outcome:'unconfirmed',reason:'secure',confirmed:false,forwarded:false,conflict:false});
 assert.equal(actualOf({outcome:'unconfirmed',engineRecord:raw,forwarded:{confirmed:false,reason:'noFocusedElement'}}).conflict,true);
 assert.equal(actualOf({outcome:'ok',engineRecord:{confirmed:true},forwarded:null}).forwarded,null);
});

const SECRET='9f3a1c5be7d24a60c8b1e5f7a3d9c204',PLAIN='1e8c4a7b0d3f59a6e2c8b4d7f1a0c935';
async function auditRowOf({kind='secretShort',reply,meta,surfaces=true,mode='stock'}){
 const a=createAuditCapture({mode});a.registerSecret(SECRET,'secret');a.registerSecret(PLAIN,'plain');a.registerSecret('Old draft sentence goes here.','seed');
 const tag='fix-small-'+kind+'-r01';
 a.begin(tag,{head:'fix',page:'small',kind,length:kind==='plain'?PLAIN.length:SECRET.length,fieldLengths:[61]});
 a.engineArgs(tag,'type_text',{concealed:kind!=='plain'});
 a.engineReply(tag,'type_text',reply);
 a.sky(tag,{rendered:null,error:null,meta});
 if(surfaces){a.surface(tag,'content',[]);a.surface(tag,'console',[])}
 return {a,tag,row:await a.end(tag,{timeoutMs:50,graceMs:2})};
}
test('the published audit row is a fixed projection that passes the attestation on production-shaped rows',async()=>{
 const rb={confirmed:true,snapshotMs:12.5,concealed:true};
 const {a,tag,row}=await auditRowOf({reply:{result:{meta:{startedAt:1770000000000,endedAt:1770000000040,inputRoute:'keyed',typeReadback:rb}}},meta:{'cua/typeReadback':rb}});
 const pub=publicAuditRow(row);
 assert.equal(pub.publishable,true);assert.equal(pub.withheld,false);
 assert.deepEqual(pub.row.typeReadback,rb);assert.deepEqual(pub.row.skyTypeReadback,rb);
 assert.deepEqual(Object.keys(pub.row.engine),['outcome','errorName','errorCode']);
 const text=JSON.stringify(pub.row);
 for(const forbidden of ['"reply"','"surfaces"','"sky"','"length"','"entered"','"keydowns"','"inputs"'])assert.equal(text.includes(forbidden),false,forbidden);
 assert.deepEqual(attestText(text+'\n'),{leakHits:0,forbidden:0,long:0});
 assert.deepEqual(pub.row.routeTimings,{snapshotMs:12.5,inputRoute:'keyed',routeWallMs:40});
});
test('a concealed reply that carries the entered unit count is a privacy violation, not a publishable row',async()=>{
 const rb={confirmed:true,snapshotMs:12.5,concealed:true};
 const {row}=await auditRowOf({reply:{result:{meta:{typeReadback:rb,entered:32}}},meta:{'cua/typeReadback':rb,'cua/entered':32}});
 const pub=publicAuditRow(row);
 assert.equal(pub.publishable,false);assert.equal(pub.row.privacy.ok,false);assert.equal(JSON.stringify(pub.row).includes('32'),false);
});
test('a plain row publishes its full sanitized readback; a value in it is withheld, never published',async()=>{
 const rb={confirmed:true,snapshotMs:3,pollMs:5,reads:2,expectedLength:61,actualLength:61,expected:'x'.repeat(5),actual:'y'.repeat(5),checkpoints:[{reads:1,ms:2},{reads:2,ms:4}]};
 const {row}=await auditRowOf({kind:'plain',reply:{result:{meta:{typeReadback:rb}}},meta:{'cua/typeReadback':rb}});
 const pub=publicAuditRow(row);
 assert.equal(pub.publishable,true);assert.equal(pub.row.typeReadback.checkpoints.length,2);assert.equal(pub.row.typeReadback.expected,'[plain quote withheld]');
 const leaky=publicAuditRow({...row,typeReadback:{...row.typeReadback,reason:SECRET.slice(0,20)}});
 assert.equal(leaky.publishable,false);assert.equal(JSON.stringify(leaky.row).includes(SECRET.slice(0,12)),false);
 const secret=await auditRowOf({reply:{result:{meta:{typeReadback:{confirmed:true,snapshotMs:1,concealed:true}}}},meta:{}});
 const bad=publicAuditRow({...secret.row,typeReadback:{confirmed:true,concealed:true,actualLength:32}});
 assert.equal(bad.publishable,false);assert.equal('actualLength' in bad.row.typeReadback,false);
});
test('a row the capture found a violation in is not publishable, and its diagnostic holds codes only',async()=>{
 const {row}=await auditRowOf({reply:{error:{errorName:'typeUnconfirmed',message:'Typed '+SECRET.slice(2,22),meta:{typeReadback:{confirmed:false,reason:'concealedMismatch',concealed:true}}}},meta:{}});
 const pub=publicAuditRow(row);
 assert.equal(pub.publishable,false);assert.equal(pub.row.privacy.ok,false);assert.deepEqual(pub.row.privacy.codes,['secret-fragment']);
 assert.equal(JSON.stringify(pub.row).includes(SECRET.slice(2,12)),false);
});
test('attestation publishable needs a clean scan, no row violation or withheld value, and complete clean audit privacy',()=>{
 const scan={files:4,leakHits:0,forbidden:0,long:0,ok:true},contracts={rawCaptureComplete:true,auditPrivacyClean:true};
 assert.equal(publication(scan,{contracts}).publishable,true);
 for(const [bad,blocker] of [[{privacyViolations:1},'privacy-violation'],[{auditWithheld:1},'audit-withheld'],[{contracts:{...contracts,rawCaptureComplete:false}},'capture-incomplete'],[{contracts:{...contracts,auditPrivacyClean:false}},'audit-privacy']]){
  const v=publication(scan,{contracts,...bad});assert.equal(v.publishable,false);assert.ok(v.blockers.includes(blocker));
 }
 assert.equal(publication({...scan,leakHits:1,ok:false},{contracts}).publishable,false);
});
test('stock contracts also need the raw capture, audit rows ok and a clean privacy gate',()=>{
 const summary={groups:[{kind:'secure',expected:{firm:true},strict:1,n:1}],wrongSuccess:0,firmCells:1,firmStrict:1,audit:{gates:{privacyClean:'pass',rowsOk:'pass'}}};
 assert.equal(contractsOf(summary,{phase:'stock'}).ok,true);
 assert.equal(contractsOf({...summary,audit:{gates:{privacyClean:'fail',rowsOk:'pass'}}},{phase:'stock'}).auditPrivacyClean,false);
 assert.equal(contractsOf(summary,{phase:'stock',captureMissing:1}).ok,false);
 assert.equal(contractsOf(summary,{phase:'stock',auditFailures:1}).auditRowsOk,false);
 assert.equal(contractsOf({...summary,audit:undefined},{phase:'stock'}).rawCaptureComplete,false);
});
test('the cross-row summary has no key the attestation forbids, and each engine gets a minimal environment',()=>{
 assert.deepEqual(renameKeys({byClassMedian:{text:1,range:2},list:[{value:3}]}),{byClassMedian:{textField:1,range:2},list:[{valueField:3}]});
 const env=engineEnv({home:'/h',tmpdir:'/t',socket:'/t/e.sock',from:{PATH:'/bin',HOME:'/real',GITHUB_TOKEN:'x',CUA_HOME:'/c',LANG:'C'}});
 assert.deepEqual(env,{PATH:'/bin',LANG:'C',HOME:'/h',TMPDIR:'/t',CUA_ENGINE_SOCKET:'/t/e.sock'});
});

test('a schedule publishes shapes (long ones as hashes), AX-only counts, poll repeats and timings, and passes the attestation',()=>{
 const counters={calls:3,attempts:4,byName:{AXRole:2,AXValue:1,AXTextMarkerForIndex:1},byClass:{text:1,range:0,marker:1,length:0,role:2,walk:0,other:0},markerByName:{AXTextMarkerForIndex:1},markerByKind:{index:1},byApi:{r:3,ev:32},events:{keyDown:32},writes:{},actions:{}};
 const long=Array.from({length:400},(_,i)=>'r:AXChildren@e'+i+(i%7?'':'!absent')).join('|');
 const sc={complete:true,dropped:0,aliasOverflow:0,overlaps:0,boundaryProvenance:'known',preInput:{available:true,boundary:'event',entries:9,exactHash:'0123456789abcdef',shape:'r:AXRole@e1|ph+:poll',...counters,timing:{calls:3,callMs:1,maxCallMs:1,firstStartMs:0,lastEndMs:2}},
  postInput:{entries:5,shape:long,...counters,timing:{calls:1,callMs:1,maxCallMs:1,firstStartMs:3,lastEndMs:4}},shape:long,strictHash:'fedcba9876543210',entriesTotal:41,pollCycleReps:[3,1],counters,
  timeline:{spanMs:8,overheadMs:0.1,firstEntryMs:0.5,firstEventMs:2,lastEventMs:30,preInputMs:2,classWindows:{text:{calls:1,callMs:1,maxCallMs:1,firstStartMs:1,lastEndMs:2}},phases:{poll:[{startMs:3,endMs:4,durMs:1,calls:3,callMs:1}]},
   markerAttempts:[{atMs:1,durMs:0.2,api:'r',alias:1,names:['AXTextMarkerForIndex'],outcome:0,preInput:true}],markerAttemptsTruncated:false}};
 const row={tag:'fix-large-secretShort-r01',mode:'audit',lane:'secret',ok:true,failures:[],privacy:{ok:true,violations:0,codes:{}},engine:{outcome:'success',errorName:null,errorCode:null},typeReadback:{confirmed:true},skyTypeReadback:{confirmed:true},schedule:sc,requests:{typeText:1,methods:{type_text:1}}};
 const pub=publicAuditRow(row);
 assert.equal(pub.publishable,true);
 assert.equal(pub.row.schedule.shape,null);assert.match(pub.row.schedule.shapeHash,/^[0-9a-f]{16}$/);assert.equal(pub.row.schedule.preInput.shape,'r:AXRole@e1|ph+:poll');
 assert.deepEqual(pub.row.schedule.pollCycleReps,[3,1]);assert.equal(pub.row.schedule.counters.byClass.textReads,1);assert.equal('byApi' in pub.row.schedule.counters,false);
 const text=JSON.stringify(pub.row);
 for(const absent of ['keyDown','firstEventMs','lastEventMs','entriesTotal','"entries"','"events"','"ev"'])assert.equal(text.includes(absent),false,absent);
 assert.deepEqual(attestText(text+'\n'),{leakHits:0,forbidden:0,long:0});
});
