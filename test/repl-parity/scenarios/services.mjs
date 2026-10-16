// Independent oracles: chatgpt-26.928.40906 NR:trusted-worker.js:19-60,134-230;
// NR:privileged-node-repl.js:14-129,200-472,528-647; NR:kernel.js:rpc error boundary.
// Rust-only ordering/timer/turn behavior is checked against the committed mini vendor observations.
import assert from 'node:assert/strict';
import {caseSchedule} from '../../../scripts/repl-parity/registry.mjs';
const plan=new Map(caseSchedule().map(c=>[c.id,c])),scenarios=[];
const text=r=>(r.content??[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
const rpc=r=>`await nodeRepl.rpc('fixture',${JSON.stringify(r)})`;
const value=r=>`nodeRepl.write(JSON.stringify(${rpc(r)}));`;
const okText=(expected,index=-1)=>(r)=>{assert.equal(r[index<0?r.length+index:index].isError,false);assert.equal(text(r[index<0?r.length+index:index]),expected);};
const json=(expected,index=-1)=>r=>{const x=r[index<0?r.length+index:index];assert.equal(x.isError,false);assert.deepEqual(JSON.parse(text(x)),expected);};
function add(id,cells,check,options={}){if(!id.startsWith('secrets/'))id=`cells/${id}`;const p=plan.get(id);if(!p)throw new Error(id);scenarios.push({...p,backend:'fixture-services',cells:cells.map((c,i)=>typeof c==='string'?{label:`cell-${i+1}`,code:c}:c),assert:({results,timings,...context})=>{check(results,timings,context);return {ok:true};},...options});}
for(const action of ['accept','decline','cancel'])add(`elicitation/${action}`,[{label:'reply',answer:{action},code:value({op:'elicit'})}],json({action,content:action==='accept'?{}:null,_meta:action==='accept'?{persist:'session'}:null}));
add('elicitation/content-and-meta',[{label:'reply',answer:{action:'accept',content:{fixture:'yes'},_meta:{fixture:'reply'}},code:value({op:'elicit'})}],json({action:'accept',content:{fixture:'yes'},_meta:{fixture:'reply'}}));
add('elicitation/accepted-response-persistence',[{label:'reply',answer:{action:'accept',content:{fixture:'approved'}},code:value({op:'elicit'})}],json({action:'accept',content:{fixture:'approved'},_meta:{persist:'session'}}));
add('elicitation/unsupported-form',[`${rpc({op:'elicit'})};`],r=>{assert.equal(r[0].isError,true);assert.match(text(r[0]),/does not support form elicitation/);},{capabilities:{}});
add('elicitation/malformed-reply',[{label:'reply',answer:{action:'not-an-action'},code:`try{${rpc({op:'elicit'})};nodeRepl.write('GRANTED');}catch{nodeRepl.write('refused');}`}],okText('refused'));
for(const [id,request] of [['suspend-resume',{wait:450}],['nested-suspension',{wait:100,nested:true,after:350}]])add(`budget/${id}`,[{label:'suspended',timeoutMs:300,code:value({op:'suspend',...request})}],(r,t)=>{okText('"resumed"')(r);assert.ok(t[0]>=400);});
add('budget/remaining-budget',[{label:'remaining',timeoutMs:500,code:`await new Promise(r=>setTimeout(r,300));${rpc({op:'suspend',wait:400})};await new Promise(r=>setTimeout(r,350));nodeRepl.write('EXCEEDED');`},'nodeRepl.write("fresh");'],r=>{assert.equal(r[0].isError,true);assert.match(text(r[0]),/timed out|timeout/i);okText('fresh')(r);});
add('budget/approval-and-startup-waits',[{label:'approval',timeoutMs:300,answerDelayMs:450,answer:{action:'accept'},code:value({op:'approval-wait'})},{label:'bare-elicitation',timeoutMs:300,answerDelayMs:650,answer:{action:'accept'},code:value({op:'elicit'})}],(r,t)=>{for(const index of [0,1])json({action:'accept',content:{},_meta:{persist:'session'}},index)(r);assert.ok(t[0]>=550);assert.ok(t[1]>=600);});
const hook=(hooks)=>rpc({op:'hook',hooks})+';';
add('hooks/after-success',[hook([{name:'A',write:true}])+`nodeRepl.write('code|');`],okText('code|A:start|A:end|'));
add('hooks/after-ordinary-error',[hook([{name:'A',write:true}])+`throw new Error('ordinary-fixture-error');`,value({op:'events'})],r=>{assert.equal(r[0].isError,true);assert.match(text(r[0]),/ordinary-fixture-error/);assert.match(text(r[1]),/^\["A:start","A:end"\]/);});
add('hooks/sequential-after-code',[hook([{name:'A',delay:80,write:true},{name:'B',write:true}])],okText('A:start|A:end|B:start|B:end|'));
add('hooks/background-drain',[hook([{name:'A',write:true}])+`${rpc({op:'background'})};nodeRepl.write('code|');`,`nodeRepl.rpc('fixture',{op:'background'});nodeRepl.write('code|');`],r=>{okText('background|code|A:start|A:end|',0)(r);okText('code|background|A:start|A:end|',1)(r);});
add('hooks/submitted-code-phase',[{label:'hook-budget',timeoutMs:500,code:hook([{name:'A',delay:450,timeout:1000,write:true}])+`await new Promise(r=>setTimeout(r,400));nodeRepl.write('code|');`}],(r,t)=>{okText('code|A:start|A:end|')(r);assert.ok(t[0]>=800);});
add('hooks/separate-positive-timeouts',[value({op:'invalid-hooks'}),hook([{name:'A',hang:true,timeout:100,write:true},{name:'B',error:true,write:true},{name:'C',write:true}])],r=>{json([true,true,true,true],0)(r);okText('A:start|B:start|C:start|C:end|')(r);});
add('hooks/unregister',[hook([{name:'removed',unregister:true,write:true},{name:'kept',write:true}])],okText('kept:start|kept:end|'));
const turn={hook_event_name:'Stop',session_id:'fixture-session',turn_id:'fixture-turn'};
const turnCell={label:'turn',op:'turn',args:turn};
add('hooks/concurrent-best-effort-turn-end',[hook([{name:'A',turn:true,delay:80},{name:'B',turn:true,error:true},{name:'C',turn:true,delay:20}]),turnCell,value({op:'events'})],json(['A:start','B:start','C:start','C:end','A:end']));
add('hooks/turn-end-deadlines',[hook([{name:'A',turn:true,hang:true,timeout:120},{name:'B',turn:true,delay:30}]),turnCell,value({op:'events'})],(r,t)=>{json(['A:start','B:start','B:end'])(r);assert.ok(t[1]>=100&&t[1]<2000);});
add('hooks/end-task-after-hooks',[hook([{name:'A',turn:true,delay:80}]),{label:'end',op:'endTask'},value({op:'events'})],json(['A:start','A:end']));
add('hooks/deduplicated-turn-end',[hook([{name:'A',turn:true,delay:500,timeout:2000,witness:true}]),{label:'duplicates',op:'turn',args:turn,repeat:3,witnessCount:1},value({op:'events'}),{label:'again',op:'turn',args:turn,witnessCount:1},value({op:'events'}),{label:'other-session',op:'turn',witnessCount:2,args:{...turn,session_id:'other-session'}},value({op:'events'}),{label:'other-turn',op:'turn',witnessCount:3,args:{...turn,turn_id:'other-turn'}},value({op:'events'})],r=>{for(const index of [1,3,5,7]){assert.equal(r[index].replies.length,index===1?3:1);for(const reply of r[index].replies){assert.equal(reply.result.isError,false);assert.equal(reply.observation.hookCompletedBeforeAck,true);assert.ok(reply.observation.afterHookMs>=0);}}json(['A:start','A:end'],2)(r);json(['A:start','A:end'],4)(r);json(['A:start','A:end','A:start','A:end'],6)(r);json(['A:start','A:end','A:start','A:end','A:start','A:end'],8)(r);});
for(const [id,op] of [['realpath-roots','outside'],['symlink-escape-refused','symlink']])add(`trusted/${id}`,[`try{${rpc({op})};nodeRepl.write('ESCAPED');}catch(e){nodeRepl.write(e.message.startsWith('Trusted RPC dependency must resolve within a configured trusted code path:'));}`],okText('true'));
add('trusted/no-privileges-through-cell-import',[`let imported=await import('@@CHECKOUT@@/test/repl-parity/fixtures/trusted-service.mjs');nodeRepl.write(JSON.stringify(await imported.handleRpc({op:'privileges'})));`],json({elicitation:'undefined',hooks:'undefined',native:'undefined'}));
add('trusted/lazy-service-cache',[value({op:'cache'}),value({op:'cache'})],r=>{json(1,0)(r);json(2,1)(r);});
add('trusted/execution-request-correlation',[{label:'correlated',requestMeta:{fixture:'correlation'},code:`nodeRepl.write(JSON.stringify(await Promise.all([nodeRepl.rpc('fixture',{op:'echo',value:'slow',delay:100}),nodeRepl.rpc('fixture',{op:'echo',value:'fast'})])));`}],json([{value:'slow',meta:'correlation'},{value:'fast',meta:'correlation'}]));
add('trusted/message-only-error-boundary',[`try{${rpc({op:'error'})};}catch(e){nodeRepl.write(JSON.stringify({message:e.message,name:e.name,cause:e.cause??null,custom:e.custom??null,leaked:e.stack.includes('private-')}));}`],json({message:'fixture-message',name:'Error',cause:null,custom:null,leaked:false}));
for(const id of ['trusted/response-meta','output/structured-content-and-meta'])add(id,[`${rpc({op:'meta'})};nodeRepl.write('meta');`,'nodeRepl.write("next");'],r=>{assert.equal(r[0].isError,false);assert.deepEqual(r[0]._meta.fixture,{one:1});assert.equal(r[0]._meta.replace,'new');assert.equal(r[0]._meta.second,true);assert.equal(Object.hasOwn(r[0],'structuredContent'),false);assert.equal(Object.hasOwn(r[1]._meta,'fixture'),false);});
const metaAcross=scenarios.find(s=>s.id==='cells/trusted/response-meta');
metaAcross.cells.push({label:'across-rpcs-and-hook',code:`${rpc({op:'meta-patch',meta:{first:1}})};${rpc({op:'meta-patch',meta:{second:2}})};${hook([{name:'meta-hook',meta:{third:3}}])}nodeRepl.write('meta-patches');`});
const originalMetaAssert=metaAcross.assert;
metaAcross.assert=({results,timings})=>{originalMetaAssert({results,timings});const meta=results[2]._meta;assert.equal(results[2].isError,false);for(const [key,value] of Object.entries({first:1,second:2,third:3}))assert.equal(meta[key],value);assert.equal(Object.hasOwn(meta,'fixture'),false);return {ok:true};};
add('trusted/emit-content-item-order',[`nodeRepl.write('before|');${rpc({op:'content'})};nodeRepl.write('after|');`],r=>{assert.equal(r[0].isError,false);assert.deepEqual(r[0].content,[{type:'text',text:'before|worker-write|after|'},{type:'text',text:'item-one'},{type:'text',text:'item-two'}]);});
add('trusted/privileged-env-allowlist',[value({op:'env'}),`nodeRepl.write(JSON.stringify({frozen:Object.isFrozen(nodeRepl.env),keys:Object.keys(nodeRepl.env),value:nodeRepl.env.PARITY_CELL_VISIBLE}));`],r=>{json({frozen:true,worker:'worker-value',cellMarker:'cell-value'},0)(r);json({frozen:true,keys:['PARITY_CELL_VISIBLE'],value:'cell-value'},1)(r);});
add('trusted/no-account-telemetry-app-server',[`let results=[];for(let name of ['app-server','telemetry','account'])try{await nodeRepl.rpc(name,{});results.push(false);}catch(e){results.push(e.message==='Trusted RPC service is not configured: '+name);}nodeRepl.write(JSON.stringify(results));`],json([true,true,true]));
// Darwin vendor observation: 2026-10-16 mini; Linux control is recorded at M5's VM sitting.
// Keep the stat diagnostic byte-exact, independently of the subject's strerror table.
add('native-pipe/absolute-path',[`try{${rpc({op:'pipe',mode:'relative'})};nodeRepl.write('CONNECTED');}catch(e){nodeRepl.write(e.message.includes('absolute'));}`,
 {label:'stat-missing',code:`try{${rpc({op:'pipe',mode:'missing'})};nodeRepl.write('CONNECTED');}catch(e){nodeRepl.write(e.message);}`}],(r,t,{platform='darwin'}={})=>{
 okText('true',0)(r);
 const sentences={darwin:'native pipe path unavailable: No such file or directory (os error 2)',linux:'native pipe path unavailable: No such file or directory (os error 2)'};
 assert.ok(Object.hasOwn(sentences,platform));okText(sentences[platform],1)(r);
});
// macOS refuses a full Unix accept queue immediately. This proves the configured bound and refusal, NOT timer expiry.
// Linux also refuses immediately (vendor observation at 352f1e3); timer expiry retains its named socket-double proof.
add('native-pipe/connect-timeout',[value({op:'pipe',mode:'timeout'})],(r,t)=>{const v=JSON.parse(text(r.at(-1)));assert.equal(r.at(-1).isError,false);assert.equal(v.refused,true);assert.equal(v.budget,1000);assert.equal(v.observation,'saturated-peer-refused');if(v.platform==='linux'){assert.equal(v.message,'failed to connect native pipe: Resource temporarily unavailable (os error 11)');assert.equal(v.boundedRefusal,true);}const duration=r.at(-1)._meta?.['codex/nodeReplExecutionDurationMs'];assert.ok(Number.isFinite(duration)&&duration<3000);},{boundaryProof:'live-unreachable: non-blocking connect',limitations:['A full AF_UNIX backlog refuses immediately on both platforms. Live proof records the 1,000 ms setting and bounded refusal; socket-double unit proof covers timer expiry.']});
add('native-pipe/frozen-interface',[value({op:'pipe',mode:'interface'})],json({frozen:true,keys:['end','off','on','write'],destroy:'undefined',endAccepted:false}));
add('native-pipe/base64-correlation',[value({op:'pipe',mode:'echo'})],json({bytes:[0,255,128,10,13,65],removedCalled:false}));
add('native-pipe/data-close-error',[{label:'live-abort',code:value({op:'pipe',mode:'transport-error'})},{label:'wire-error',code:value({op:'pipe',mode:'wire-error'})}],(r,t,{platform='darwin'}={})=>{
 const linux=platform==='linux',message=linux?'Connection reset by peer (os error 104)':null;
 json({proof:'live-abort',events:linux?['error','close']:['close'],lateEvents:[...(linux?[{event:'error',message}]:[]),{event:'close'}],message},0)(r);
 json({proof:'boundary-double',events:['error','close'],lateEvents:[{event:'error',message:'fixture transport error'},{event:'close'}],message:'fixture transport error',entry:'worker-stdin',observedConnection:true},1)(r);
},{limitations:['Real macOS abort is close-only (EOF wins); Linux emits error-before-close with os error 104 and late replay. Error-before-close and late error are boundary-double proof injected into the selected worker stdin, not the supervisor.']});
add('launch-services/open-application-macos-boundary',[value({op:'launch-invalid'})],json(['nodeRepl.launchServices.openApplication expected a target object','nodeRepl.launchServices.openApplication expected exactly one of applicationPath or bundleIdentifier','nodeRepl.launchServices.openApplication expected exactly one of applicationPath or bundleIdentifier','nodeRepl.launchServices.openApplication received an unsupported target']));
for(const surface of ['browser','native'])add(`secrets/${surface}/errors/worker-rejection-message-only`,[`try{${rpc({op:'secret-error',surface})};nodeRepl.write('NO_REJECTION');}catch(e){nodeRepl.write(JSON.stringify({label:e.message.includes('PARITY_SYNTHETIC'),sanitized:!JSON.stringify([e.message,e.stack,e.cause,e.custom]).includes('fixture-private-value'),plain:e.name==='Error'&&e.cause===undefined&&e.custom===undefined}));}`],json({label:true,sanitized:true,plain:true}));
// Warm real kernel and worker before testing a sub-second submitted-code budget. Child startup is not the wait under test.
for(const scenario of scenarios.filter(s=>s.id.startsWith('cells/budget/')||s.id==='cells/hooks/submitted-code-phase'||s.id==='cells/native-pipe/connect-timeout')){
 scenario.cells.unshift({label:'warm',code:value({op:'echo',value:'warm'})});
 const check=scenario.assert;scenario.assert=({results,timings,...context})=>check({results:results.slice(1),timings:timings.slice(1),...context});
}
export default scenarios;
