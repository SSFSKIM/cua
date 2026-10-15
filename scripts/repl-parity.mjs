#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {mkdirSync,readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {root,prepareCommand,execute,cellsCommand} from './repl-parity/topology.mjs';
import {selectScenarios,inventory,caseSchedule,inSuite,milestones,scenarioCellLabels} from './repl-parity/registry.mjs';
import scenarios from '../test/repl-parity/scenarios/index.mjs';
import {REPL_HOST_VERSION} from '../src/repl-host/identity.mjs';
import {AttestedConnections,runRawScenario} from './repl-parity/runner.mjs';
import {runSecretCase} from '../test/repl-parity/fixtures/secret-cases.mjs';
import {declaredVendorDefect,assessAssertions} from './repl-parity/vendor-defects.mjs';
import {runBoundaryScenario} from './repl-parity/boundaries.mjs';
import {remoteCapabilityLane} from './repl-parity/capability.mjs';
import {documentComparisonRun} from './repl-parity/document-comparison.mjs';
import {apiCommand,evidenceBackend} from './repl-parity/api-lanes.mjs';
import {runBrowserApiScenario} from './repl-parity/browser-api.mjs';
import {fixtureProcess} from './browser-parity/resources.mjs';
import {compareParityRuns,validateAttestations} from './repl-parity/compare.mjs';
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const state=device=>join(root,'.doperpowers/sde/repl-parity',`${device}.json`);
const save=(p,value)=>writeFileSync(p,JSON.stringify(value,null,2)+'\n');
export async function main(argv=process.argv.slice(2)){
 const {values:v,positionals:[action,a,b]}=parseArgs({args:argv,allowPositionals:true,options:{device:{type:'string',default:'local'},host:{type:'string',default:'vendor'},suite:{type:'string'},through:{type:'string'},out:{type:'string'},expected:{type:'string'},commit:{type:'string'},profile:{type:'string'},node:{type:'string'}}});
 if(v.through&&!milestones.includes(v.through))throw new Error('Invalid through milestone');
 if(!['local','mini','cua-linux'].includes(v.device)||!['vendor','cua'].includes(v.host)||!['cells','services','api','docs-profiles','secrets','secrets-live','all'].includes(v.suite??'cells'))throw new Error('Invalid parity selection');
 if(action==='prepare'){
  const prepared=JSON.parse(execute(prepareCommand(v)).trim().split('\n').at(-1));mkdirSync(dirname(state(v.device)),{recursive:true});save(state(v.device),prepared);
  if(v.out){mkdirSync(resolve(v.out),{recursive:true});save(join(resolve(v.out),'prepare.json'),prepared);}console.log(JSON.stringify(prepared,null,2));return;
 }
 if(action==='diff'){
  if(!a||!b)throw new Error('diff needs two run directories');
  const load=dir=>({meta:json(join(dir,'meta.json')),tools:json(join(dir,'tools.json')),rows:readFileSync(join(dir,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)});
  const left=load(a),right=load(b);
  if(v.expected&&left.meta.host==='vendor'&&right.meta.host==='vendor')throw new Error('No expected-differences file permitted for vendor determinism');
  const selected=selectScenarios(scenarios,inventory,{suite:v.suite??left.meta.suite,through:v.through??left.meta.through??undefined,platform:left.meta.platform}).scenarios;
  const caseIds=selected.map(s=>s.id);
  const result=compareParityRuns(documentComparisonRun(left),documentComparisonRun(right),{expected:v.expected?json(v.expected):[],caseIds,caseCells:Object.fromEntries(selected.map(s=>[s.id,scenarioCellLabels(s)]))});console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;return;
 }
 v.suite??='cells';
 if(action!=='run'||!v.out)throw new Error('Usage: repl-parity prepare|run|diff; run requires --out');
 if(v.device==='local'){
  const {scenarios:selected,pending}=selectScenarios(scenarios,inventory,{suite:v.suite,through:v.through,platform:process.platform});
  const doubles=selected.filter(s=>s.backend==='secret-double');
  if(!doubles.length)throw new Error('No local double cases selected; use --suite secrets (raw cells require a remote real host)');
  const out=resolve(v.out);mkdirSync(out,{recursive:false});const rows=[];
  for(const scenario of doubles){const result=await runSecretCase(scenario.id);rows.push({case:scenario.id,cell:'boundary',ok:true,value:result,fake:true},{case:scenario.id,assertion:await scenario.assert({results:[result]}),fake:true});}
  save(join(out,'meta.json'),{schema:1,device:'local',fake:true,complete:true,host:null,suite:v.suite,caseIds:doubles.map(s=>s.id),pending:[...pending,...selected.filter(s=>s.backend!=='secret-double')].map(c=>c.id),note:'Service/store doubles only; not live host parity'});
  writeFileSync(join(out,'results.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');console.log(JSON.stringify({fake:true,cases:doubles.length,assertions:'PASS',out}));return;
 }
 const prepared=json(state(v.device)),{scenarios:selected,pending}=selectScenarios(scenarios,inventory,{suite:v.suite,through:v.through,platform:prepared.platform});
 if(!selected.length)throw new Error('No executable cases selected');
 const out=resolve(v.out);mkdirSync(out,{recursive:false});
 const meta={schema:1,host:v.host,observedHost:v.host,commit:prepared.commit,harnessCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),node:prepared.node,runtimeRelease:prepared.release,ownNode:prepared.ownNode??null,hostVersion:v.host==='vendor'?prepared.release:REPL_HOST_VERSION,apiVersion:v.host==='vendor'?prepared.release:REPL_HOST_VERSION,device:v.device,platform:prepared.platform,surfaces:['browser'],sandbox:'scoped',service:'cua',backend:evidenceBackend(selected),profile:prepared.profile,suite:v.suite,through:v.through??null,caseIds:selected.map(s=>s.id),caseCells:Object.fromEntries(selected.map(s=>[s.id,scenarioCellLabels(s)])),pending:pending.map(c=>({id:c.id,milestone:c.milestone})),limitations:selected.filter(s=>s.limitations).map(s=>({case:s.id,notes:s.limitations})),caseProofs:Object.fromEntries(selected.map(s=>[s.id,s.boundaryProof??s.backend])),complete:false,connections:[],hostAttestations:[]};
 save(join(out,'meta.json'),meta);writeFileSync(join(out,'results.jsonl'),'');
 const pool=new AttestedConnections(v.host);let failed=false;const resources=[],runRows=[];
 const clients=new Map();let browserFixture,profileClient;const profileObservations=[];
 const profiles=async()=>{
  if(!profileClient)profileClient=await pool.open({...apiCommand({...prepared,host:v.host},{lane:'profiles'}),onNotification:message=>{if(message.method==='cua/parityProfiles')profileObservations.push(message.params);}});
  // The ordinary proxy connection and the separate bounded listing must both attest a real call.
  await profileClient.call('js_reset');
  const before=profileObservations.length,result=await profileClient.call('profiles_list');
  if(profileObservations.length!==before+1)throw new Error('Missing bounded profiles host observation');
  const observation=profileObservations.at(-1),connection='listing-'+profileObservations.length;
  pool.addObservations({connections:[connection],hostAttestations:[{connection,host:v.host,serverInfo:observation.serverInfo,_meta:observation._meta,executionFacts:observation.executionFacts}]},'profiles');
  return {result,observation};
 };
 const emit=row=>{const scenario=selected.find(s=>s.id===row.case);if(scenario?.boundaryProof||scenario?.backend==='binder-double')row={...row,proof:scenario.boundaryProof??'binder-double'};const defect=declaredVendorDefect(meta,row,[...runRows,row]);if(defect)row={...row,vendorDefect:defect.id};runRows.push(row);appendFileSync(join(out,'results.jsonl'),JSON.stringify(row)+'\n');};
 try{
  let client=await pool.open(cellsCommand({...prepared,host:v.host}));let lane='no-services';
  save(join(out,'tools.json'),await client.request('tools/list'));
  await client.call('js_reset'); // Even a fixture-only suite must attest its base-tools connection with a real host call.
  for(const scenario of selected){
    if(scenario.backend==='fixture-services'){
      const fixture=await pool.open(cellsCommand({...prepared,host:v.host,fixtureServices:true,fixtureCase:scenario.id}),{capabilities:scenario.capabilities});
      const assertion=await runRawScenario(scenario,{client:fixture,checkout:prepared.checkout,emit});if(!assertion.ok)failed=true;
      const status=await fixture.close();if(status.code!==0)throw new Error('Fixture service cleanup failed');continue;
    }
    if(scenario.backend==='host-boundary'){const result=await runBoundaryScenario(scenario,{prepared,host:v.host});pool.addObservations(result.observations,scenario.id);const assertion=scenario.assert({results:result.rows.filter(r=>r.cell==='boundary').map(r=>r.value)});for(const row of result.rows)emit(row.assertion?{...row,assertion}:row);continue;}
    if(scenario.backend==='secret-double'){
      const result=await runSecretCase(scenario.id);for(const row of [{case:scenario.id,cell:'boundary',ok:true,value:result,fake:true},{case:scenario.id,assertion:await scenario.assert({results:[result]}),fake:true}])emit(row);continue;
    }
    if(scenario.backend==='chrome'){
      if(!clients.has('chrome'))clients.set('chrome',await pool.open(apiCommand({...prepared,host:v.host})));
      if(scenario.browserCase&&!browserFixture){browserFixture=await fixtureProcess({device:prepared.device,checkout:prepared.checkout,port:48733});resources.push(browserFixture);}
      const assertion=await runBrowserApiScenario(scenario,{client:clients.get('chrome'),fixture:browserFixture,instanceId:prepared.extensionInstanceId,host:v.host,checkout:prepared.checkout,emit,profiles,prepared});if(!assertion.ok)failed=true;continue;
    }
    if(scenario.backend==='binder-double'){
      if(!clients.has('binder-double'))clients.set('binder-double',await pool.open(apiCommand({...prepared,host:v.host},{lane:'binder-double'})));
      const assertion=await runRawScenario(scenario,{client:clients.get('binder-double'),checkout:prepared.checkout,emit,context:{host:v.host}});if(!assertion.ok)failed=true;continue;
    }
    const requestedLane=scenario.liveSecrets?'capability-host-secrets':scenario.backend;
    if(requestedLane!==lane){
      if(scenario.backend!=='capability-host')throw new Error(`Backend not configured: ${scenario.backend}`);
      const resource=await remoteCapabilityLane({...prepared,host:v.host,api:true,liveSecrets:scenario.liveSecrets===true});resources.push(resource);client=await pool.open(resource.command);lane=requestedLane;
    }
    const assertion=await runRawScenario(scenario,{client,checkout:prepared.checkout,emit,context:{host:v.host}});if(!assertion.ok)failed=true;
  }
  const assertions=assessAssertions(meta,runRows);failed=assertions.unexpectedFailures.length>0;Object.assign(meta,{vendorDefects:assertions.vendorDefects,coveredCases:assertions.coveredCases,recordedCases:assertions.recordedCases});
  const ended=await client.call('end_task');if(ended.isError)throw new Error('Task cleanup failed');
  await pool.close();for(const resource of resources.reverse())await resource.close();resources.length=0;Object.assign(meta,pool.metadata(),{complete:true});validateAttestations(meta);
 }finally{try{if(!meta.complete)await pool.close();for(const resource of resources.reverse())await resource.close();}finally{Object.assign(meta,pool.metadata());save(join(out,'meta.json'),meta);}}
 console.log(JSON.stringify({out,cases:selected.length,pending:pending.length,complete:meta.complete,assertions:failed?'FAIL':meta.vendorDefects?.length?'RECORDED_VENDOR_DEFECT':'PASS',coveredCases:meta.coveredCases,recordedVendorDefects:meta.vendorDefects?.length??0}));if(failed)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
