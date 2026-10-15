// M3 acceptance 6: live selected host/client + retained production secret wrapper/fileStore.
// The service AFTER substitution is a recorder double, not Chrome or an implemented AX service.
import assert from 'node:assert/strict';
import {caseSchedule} from '../../../scripts/repl-parity/registry.mjs';
import {liveSecretCases,LIVE_SECRET_LABEL} from '../fixtures/live-secret-cases.mjs';
const plan=new Map(caseSchedule().map(c=>[c.id,c]));
const proof='service-boundary-double';
function observation(result){
 assert.equal(result?.isError,false,'secret oracle cell failed');
 const lines=(result.content??[]).filter(c=>c.type==='text').flatMap(c=>c.text.split('\n')).filter(line=>line.startsWith('LIVE_SECRET:'));
 assert.equal(lines.length,1,'one safe secret observation required');return JSON.parse(lines[0].slice('LIVE_SECRET:'.length));
}
const say=`globalThis.__secretSay=value=>nodeRepl.write('\\nLIVE_SECRET:'+JSON.stringify(value)+'\\n');`;
export default liveSecretCases.map(row=>({
 ...plan.get(row.id),id:row.id,backend:'capability-host',liveSecrets:true,boundaryProof:proof,
 limitations:['Real selected host/client and retained secret wrapper; downstream browser service is a source-grounded recorder double. Native text input remains M4.'],
 cells:[
  {label:'setup',code:`${say}\nvar ready=await nodeRepl.rpc('browser',{method:'secret.configure',params:{id:${JSON.stringify(row.id)}}});globalThis.agent=await __capabilitySetup();globalThis.browser=await agent.browsers.get('fixture');globalThis.tab=await browser.tabs.new();__secretSay(ready);`},
  {label:'exercise',code:`var secretOutcome={rejected:false};try{${row.calls.map(call=>`await (${call});`).join('')}}catch(e){secretOutcome={rejected:true,message:e.message,stack:e.stack,cause:String(e.cause),serialized:JSON.stringify(e),messageOnly:e.name==='Error'&&!('code' in e)&&!('cause' in e)&&Object.keys(e).length===0};}var safeSecretObservation=await nodeRepl.rpc('browser',{method:'secret.observe',params:secretOutcome});__secretSay(safeSecretObservation);`},
 ],
 assert:({results})=>{
  assert.equal(results.length,2);assert.deepEqual(observation(results[0]),{ready:true,boundaryProof:proof});
  const backendCalled=!row.error||row.substitute;
  assert.deepEqual(observation(results[1]),{boundaryProof:proof,requestMatches:true,readMatches:true,readLabels:Array(row.reads).fill(LIVE_SECRET_LABEL),backendMatches:true,backendCalled,substituted:backendCalled&&row.substitute,resultMatches:true,errorSafe:true,labelReportMatches:true,messageOnly:true});
  return {ok:true};
 },
}));
