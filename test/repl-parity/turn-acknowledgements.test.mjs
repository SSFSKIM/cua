import {test} from 'node:test';import assert from 'node:assert/strict';
import {runRawScenario} from '../../scripts/repl-parity/runner.mjs';
const scenario={id:'fixture/duplicates',cells:[{label:'duplicates',op:'turn',repeat:3,witnessCount:1,args:{hook_event_name:'Stop',session_id:'session',turn_id:'turn'}}],assert:({results})=>({ok:results[0].replies.length===3&&results[0].replies.every(r=>r.observation.hookCompletedBeforeAck===true&&r.observation.afterHookMs>=0)})};
async function run(early){
 let id=0;const observations=new Map(),rows=[];
 const client={call:async()=>({content:[],isError:false}),request(){const requestId=++id,earlyAck=early&&requestId>1;return Promise.resolve({content:[{type:'text',text:'{}'}],isError:false,_meta:{'cua/parityTurnObservation':{requestAtNs:'0',ackAtNs:earlyAck?'1000000':'52000000',completedAtNs:earlyAck?null:'51000000',completedHooks:earlyAck?0:1,originalMetaPresent:false}}});}};
 const assertion=await runRawScenario(scenario,{client,checkout:'/fixture',emit:row=>rows.push(row)});return {assertion,rows};
}
test('every duplicate acknowledgement is retained and an early duplicate cannot hide behind the first result',async()=>{
 const good=await run(false);assert.equal(good.assertion.ok,true);assert.deepEqual(good.rows.filter(r=>r.cell).map(r=>r.cell),['duplicates-1','duplicates-2','duplicates-3']);
 const early=await run(true);assert.equal(early.assertion.ok,false);assert.equal(early.rows.filter(r=>r.cell&&r.value.hookCompletedBeforeAck===false).length,2);
});

test('hook deadline assertions use device request-to-ack duration and still reject a real five-second host delay',async()=>{
 const deadline={id:'fixture/deadline',cells:[{label:'turn',op:'turn',args:{}}],assert:({timings})=>({ok:timings[0]>=100&&timings[0]<2000})};
 for(const [duration,expected] of [[120,true],[5226,false]]){
  const client={call:async()=>({}),request:async()=>({content:[{type:'text',text:'{}'}],isError:false,_meta:{'cua/parityTurnObservation':{requestAtNs:'0',ackAtNs:String(duration*1e6),completedAtNs:null,completedHooks:0,originalMetaPresent:false}}})};
  const rows=[];const outcome=await runRawScenario(deadline,{client,checkout:'/fixture',emit:r=>rows.push(r)});
  assert.equal(outcome.ok,expected);assert.equal(rows[0].ms.hostTurn,duration);
 }
});
