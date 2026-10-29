#!/usr/bin/env node
import {resolvePendingDeclarations,pendingCellsFor,classifyPendingCell} from './repl-parity/pending-cells.mjs';
import {runNativeScenario} from './repl-parity/native.mjs';
import {nativeMacIo,runNativeMac} from './repl-parity/native-mac.mjs';
import {nativeMacDiff,summaryLine} from './repl-parity/native-mac-diff.mjs';
import {assertEngineOptions} from './native-baseline/engine.mjs';
import {parseArgs} from 'node:util';
import {mkdirSync,readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {root,cellsCommand} from './repl-parity/topology.mjs';
import {managePreparation,manageApprovedPreparation,approvedJournalFor,isApprovedJournal} from './repl-parity/prepare-device.mjs';
import {selectScenarios,inventory,caseSchedule,inSuite,milestones,scenarioCellLabels} from './repl-parity/registry.mjs';
import scenarios from '../test/repl-parity/scenarios/index.mjs';
import {REPL_HOST_VERSION} from '../src/repl-host/identity.mjs';
import {AttestedConnections,runRawScenario,usePauseGate} from './repl-parity/runner.mjs';
import {pauseGate} from './mini-pause.mjs';
import {runSecretCase} from '../test/repl-parity/fixtures/secret-cases.mjs';
import {declaredVendorDefect,assessAssertions} from './repl-parity/vendor-defects.mjs';
import {runBoundaryScenario} from './repl-parity/boundaries.mjs';
import {remoteCapabilityLane} from './repl-parity/capability.mjs';
import {documentComparisonRun} from './repl-parity/document-comparison.mjs';
import {apiCommand,evidenceBackend} from './repl-parity/api-lanes.mjs';
import {runBrowserApiScenario} from './repl-parity/browser-api.mjs';
import {fixtureProcess} from './browser-parity/resources.mjs';
import {LINUX_COMPUTER_DEFAULT,compareParityRuns,validateAttestations} from './repl-parity/compare.mjs';
import {DEVICES,isDeclaredDevice} from './repl-parity/devices.mjs';
import {laneEngineProblem} from './repl-parity/engine-answered.mjs';
import {checkEnginePair,declaredCandidateExpectation,validateNativeLinuxExpected} from './repl-parity/native-linux.mjs';
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const state=device=>join(root,'.doperpowers/sde/repl-parity',`${device}.json`);
const save=(p,value)=>writeFileSync(p,JSON.stringify(value,null,2)+'\n');
// The CLI's arguments, validated: the action, its options and positionals. It reads no journal and starts nothing.
export function parseSelection(argv){
 const {values:v,positionals:[action,a,b]}=parseArgs({args:argv,allowPositionals:true,options:{device:{type:'string',default:'local'},host:{type:'string',default:'vendor'},engine:{type:'string'},'engine-bin':{type:'string'},'approved-runtime':{type:'string'},'approved-engine':{type:'string'},suite:{type:'string'},through:{type:'string'},out:{type:'string'},expected:{type:'string'},commit:{type:'string'},profile:{type:'string'},node:{type:'string'},home:{type:'string'},'pending-cell':{type:'string',multiple:true},'pending-reason':{type:'string'},'pause-file':{type:'string'}}});
 if((v['pending-cell']?.length||v['pending-reason'])&&(action!=='run'||!isDeclaredDevice(v.device)||DEVICES[v.device].platform!=='linux'))throw new Error('Pending declarations require a live Linux run; diff reads recorded declarations');
 if(v.through&&!milestones.includes(v.through))throw new Error('Invalid through milestone');
 if(!(v.device==='local'||isDeclaredDevice(v.device))||!['vendor','cua'].includes(v.host)||!['cells','services','api','docs-profiles','secrets','secrets-live','native','native-mac','all'].includes(v.suite??'cells'))throw new Error('Invalid parity selection');
 const approved=v['approved-runtime']!==undefined||v['approved-engine']!==undefined;
 const linuxNative=action==='run'&&isDeclaredDevice(v.device)&&DEVICES[v.device].platform==='linux'&&['native','all'].includes(v.suite);
 if(v.suite==='native-mac'||action==='prepare'&&approved)nativeMacSelection(action,v,approved);
 else if(linuxNative&&!approved)linuxEngineSelection(v);
 else if(v.engine!==undefined||v['engine-bin']!==undefined||approved)throw new Error('--engine, --approved-runtime and --approved-engine select the macOS native engine: they belong to the native-mac suite (run --suite native-mac) and to its prepare; --engine and --engine-bin select the Linux one, on a Linux run of the native cases (run --suite native or all on a declared Linux device)');
 if(v.suite==='native-mac'&&v['engine-bin']!==undefined)throw new Error('--engine-bin names a Linux cua-engine; the native-mac suite serves the approved engine');
 return {action,v,a,b};
}
// The Linux native cases' engine lanes (#171, docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, The facade
// suites): `--engine vendor|cua` on cua's own host (the only one Linux serves), and `--engine-bin` (the cua lane only)
// naming a cua-engine on the device, which the serve runs through CUA_LINUX_ENGINE_BIN instead of the installed one.
function linuxEngineSelection(v){
 if(v['engine-bin']!==undefined&&v.engine!=='cua')throw new Error('--engine-bin names the engine of the cua lane: it needs --engine cua');
 if(v.engine===undefined)return;
 if(!['vendor','cua'].includes(v.engine))throw new Error('a Linux native run names its engine: --engine vendor|cua');
 if(v.host!=='cua')throw new Error('a Linux native engine lane runs on cua\'s own host, the only one Linux serves: --host cua');
 if(v['engine-bin']!==undefined&&!/^\/[^\0\n]*$/.test(v['engine-bin']))throw new Error('--engine-bin needs the absolute path of the cua-engine on the device');
}
// A run whose selection holds native cases names its engine (the lane is never left to a default or to the device's
// engine.json); the selection is known only once the prepared platform has chosen the cases.
export function assertNativeEngine(selected,v){
 if(selected.some(s=>s.backend==='native')&&v.engine===undefined)throw new Error('a run of the Linux native cases names its engine: --engine vendor|cua (and, on the cua lane, --engine-bin <path> for a cua-engine that is not installed)');
}
// The native-mac suite (#117; docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system part 3)
// and its prepare: on a declared macOS device, over the runtime and the engine the owner approved there, served in place
// (a fresh home would raise the screen-capture confirmation again); a run names its REPL host and its native engine
// apart, as the native baseline's lanes do (scripts/native-baseline/engine.mjs). A diff reads recorded runs only.
function nativeMacSelection(action,v,approved){
 if(action==='diff'){if(v.engine!==undefined||approved)throw new Error('diff reads the recorded runs: --engine and the approved options belong to the native-mac suite\'s run and prepare');return;}
 if(!isDeclaredDevice(v.device)||DEVICES[v.device].platform!=='darwin')throw new Error('the native-mac suite and its prepare run on a declared macOS device (scripts/repl-parity/devices.mjs)');
 for(const name of ['approved-runtime','approved-engine']){
  if(v[name]===undefined)throw new Error(`--${name} is required on macOS: every lane serves the ${name==='approved-runtime'?'runtime copy':'cua Engine.app'} the owner approved on the device, in place; harnesses never install or build one`);
  if(!/^\/[^\0\n]*$/.test(v[name]))throw new Error(`--${name} needs an absolute path`);
 }
 if(action==='prepare'){if(v.engine!==undefined)throw new Error('prepare serves the approved engine to every lane: --engine belongs to run');return;}
 if(action!=='run')throw new Error('the native-mac suite is prepared, run and diffed');
 if(v.through)throw new Error('the native-mac suite is not an inventory suite: --through does not apply');
 assertEngineOptions({platform:'darwin',surface:'computer',host:v.host,engine:v.engine,approvedEngine:v['approved-engine']});
}
export async function main(argv=process.argv.slice(2)){
 const {action,v,a,b}=parseSelection(argv);
 if(action==='prepare'||action==='cleanup-prepared'){
  // On macOS the approved route: the approved runtime and engine served in place, nothing installed (the native-mac suite).
  if(action==='prepare'?v['approved-runtime']!==undefined:isApprovedJournal(state(v.device))){console.log(JSON.stringify(manageApprovedPreparation(action,{...v,journal:state(v.device)}),null,2));return;}
  const prepared=managePreparation(action,{...v,journal:state(v.device)});
  console.log(JSON.stringify(prepared,null,2));return;
 }
 if(action==='diff'){
  if(!a||!b)throw new Error('diff needs two run directories');
  if((v.suite??json(join(a,'meta.json')).suite)==='native-mac'){
   // The JSON report, then its summary line (Acceptance 6): `summary: N unexpected differences`.
   const report=nativeMacDiff(a,b,{expected:v.expected});console.log(JSON.stringify(report,null,2));console.log(summaryLine(report));if(!report.ok)process.exitCode=1;return;
  }
  const load=dir=>({meta:json(join(dir,'meta.json')),tools:json(join(dir,'tools.json')),rows:readFileSync(join(dir,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)});
  const left=load(a),right=load(b);
  // The Linux engine lanes (#171): two runs that name their engine pair by engine, against the Linux native expected
  // file's declarations (./repl-parity/native-linux.mjs), never the host comparison's allowances.
  if(left.meta.engine!==undefined||right.meta.engine!==undefined){
   const declarations=v.expected?validateNativeLinuxExpected(json(v.expected)).declarations:[];
   checkEnginePair(left.meta,right.meta,{declarations});
   const selected=selectScenarios(scenarios,inventory,{suite:v.suite??left.meta.suite,through:v.through??left.meta.through??undefined,platform:left.meta.platform}).scenarios;
   const result=compareParityRuns(documentComparisonRun(left),documentComparisonRun(right),{engineDeclarations:declarations,caseIds:selected.map(s=>s.id),caseCells:Object.fromEntries(selected.map(s=>[s.id,scenarioCellLabels(s)]))});
   console.log(JSON.stringify({engines:[left.meta.engine,right.meta.engine],...result},null,2));if(!result.ok)process.exitCode=1;return;
  }
  if(v.expected&&left.meta.host==='vendor'&&right.meta.host==='vendor')throw new Error('No expected-differences file permitted for vendor determinism');
  const selected=selectScenarios(scenarios,inventory,{suite:v.suite??left.meta.suite,through:v.through??left.meta.through??undefined,platform:left.meta.platform}).scenarios;
  const caseIds=selected.map(s=>s.id);
  const result=compareParityRuns(documentComparisonRun(left),documentComparisonRun(right),{expected:v.expected?json(v.expected):[],caseIds,caseCells:Object.fromEntries(selected.map(s=>[s.id,scenarioCellLabels(s)]))});console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;return;
 }
 v.suite??='cells';
 if(action!=='run'||!v.out)throw new Error('Usage: repl-parity prepare|cleanup-prepared|run|diff; run requires --out');
 if(v.suite==='native-mac'){
  // One lane per run, on the prepared sitting's commit, approved runtime and approved engine (./repl-parity/native-mac.mjs);
  // the preparation's time is the hold's id the diff pairs the lanes by (one prepare per sitting).
  const prepared=approvedJournalFor(json(state(v.device)),v);
  process.exitCode=await runNativeMac({device:v.device,host:v.host,engine:v.engine,approvedRuntime:v['approved-runtime'],approvedEngine:v['approved-engine'],commit:prepared.commit,sitting:prepared.preparedAt,out:v.out},nativeMacIo(v.device));return;
 }
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
 assertNativeEngine(selected,v);
 const environmentPending=resolvePendingDeclarations({logicalCells:v['pending-cell']??[],reason:v['pending-reason'],platform:prepared.platform,through:v.through,scenarios:selected});
 const out=resolve(v.out);mkdirSync(out,{recursive:false});
 const meta={schema:1,...environmentPending,host:v.host,observedHost:v.host,commit:prepared.commit,harnessCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),node:prepared.node,runtimeRelease:prepared.release,ownNode:prepared.ownNode??null,nodeMode:prepared.nodeMode??null,nodeOverride:prepared.nodeOverride??null,hostVersion:v.host==='vendor'?prepared.release:REPL_HOST_VERSION,apiVersion:v.host==='vendor'?prepared.release:REPL_HOST_VERSION,device:v.device,platform:prepared.platform,surfaces:selected.some(s=>s.backend==='native')?['computer','browser']:['browser'],sandbox:selected.some(s=>s.backend==='native')?'per-case':'scoped',caseConfigurations:Object.fromEntries(selected.map(s=>[s.id,s.backend==='native'?{surfaces:[...LINUX_COMPUTER_DEFAULT.surfaces],sandbox:LINUX_COMPUTER_DEFAULT.sandbox}:{surfaces:['browser'],sandbox:'scoped'}])),service:'cua',backend:evidenceBackend(selected),profile:prepared.profile,suite:v.suite,through:v.through??null,caseIds:selected.map(s=>s.id),caseCells:Object.fromEntries(selected.map(s=>[s.id,scenarioCellLabels(s)])),pending:pending.map(c=>({id:c.id,milestone:c.milestone})),limitations:selected.filter(s=>s.limitations).map(s=>({case:s.id,notes:s.limitations})),caseProofs:Object.fromEntries(selected.map(s=>[s.id,s.boundaryProof??s.backend])),...(v.engine!==undefined?{engine:v.engine,engineBin:v['engine-bin']??null,engineAnswered:[]}:{}),complete:false,connections:[],hostAttestations:[]};
 // --pause-file or CUA_PAUSE_FILE (scripts/mini-pause.mjs): every cell waits at its boundary while the file exists; each pause is evidence.
 const pauseFile=v['pause-file']??process.env.CUA_PAUSE_FILE;
 if(pauseFile){meta.pauses=[];usePauseGate(pauseGate({file:pauseFile,record:p=>meta.pauses.push(p),log:line=>console.error(`repl-parity: ${line}`)}));}
 const pause=pauseFile?pauseGate({file:pauseFile,record:p=>meta.pauses.push(p)}):null;
 save(join(out,'meta.json'),meta);writeFileSync(join(out,'results.jsonl'),'');
 const pool=new AttestedConnections(v.host,{diagnostics:join(out,'diagnostics')});let failed=false;const resources=[],runRows=[];
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
 const emit=row=>{const declared=pendingCellsFor(meta.pendingEnvironment,row.case).find(p=>p.cell===row.cell);if(declared){let status;try{status=classifyPendingCell(row);}catch{status='unexpected-result';}row={...row,pendingCell:{...declared,status}};}const scenario=selected.find(s=>s.id===row.case);if(scenario?.boundaryProof||scenario?.backend==='binder-double')row={...row,proof:scenario.boundaryProof??'binder-double'};const defect=declaredVendorDefect(meta,row,[...runRows,row]);if(defect)row={...row,vendorDefect:defect.id};else{const candidate=declaredCandidateExpectation(meta,row,[...runRows,row]);if(candidate)row={...row,candidateExpectation:candidate.id};}runRows.push(row);appendFileSync(join(out,'results.jsonl'),JSON.stringify(row)+'\n');};
 try{
  let client=await pool.open(cellsCommand({...prepared,host:v.host}));let lane='no-services';
  save(join(out,'tools.json'),await client.request('tools/list'));
  await client.call('js_reset'); // Even a fixture-only suite must attest its base-tools connection with a real host call.
  for(const scenario of selected){
    if(scenario.backend==='native'){await runNativeScenario(scenario,{pool,prepared,host:v.host,engine:v.engine,engineBin:v['engine-bin'],emit,recordEngine:entry=>meta.engineAnswered.push(entry)});continue;}
    if(scenario.backend==='fixture-services'){
      const fixture=await pool.open(cellsCommand({...prepared,host:v.host,fixtureServices:true,fixtureCase:scenario.id}),{capabilities:scenario.capabilities});
      const assertion=await runRawScenario(scenario,{client:fixture,checkout:prepared.checkout,emit,context:{platform:prepared.platform}});if(!assertion.ok)failed=true;
      const status=await fixture.close();if(status.code!==0)throw new Error('Fixture service cleanup failed');continue;
    }
    // A lane that runs a whole case remotely (its own process, at the prepared commit) waits at the case boundary.
    if(pause&&['host-boundary','secret-double'].includes(scenario.backend))await pause.wait(scenario.id);
    if(scenario.backend==='host-boundary'){const result=await runBoundaryScenario(scenario,{prepared,host:v.host});pool.addObservations(result.observations,scenario.id);const assertion=scenario.assert({results:result.rows.filter(r=>r.cell==='boundary').map(r=>r.value)});for(const row of result.rows)emit(row.assertion?{...row,assertion}:row);continue;}
    if(scenario.backend==='secret-double'){
      const result=await runSecretCase(scenario.id);for(const row of [{case:scenario.id,cell:'boundary',ok:true,value:result,fake:true},{case:scenario.id,assertion:await scenario.assert({results:[result]}),fake:true}])emit(row);continue;
    }
    if(scenario.backend==='chrome'){
      if(!clients.has('chrome'))clients.set('chrome',await pool.open(apiCommand({...prepared,host:v.host})));
      if(scenario.browserCase&&!browserFixture){browserFixture=await fixtureProcess({device:prepared.device,checkout:prepared.checkout,port:48733});resources.push(browserFixture);}
      const assertion=await runBrowserApiScenario(scenario,{client:clients.get('chrome'),fixture:browserFixture,instanceId:prepared.extensionInstanceId,host:v.host,checkout:prepared.checkout,emit,profiles,prepared,pendingCells:pendingCellsFor(meta.pendingEnvironment,scenario.id).map(p=>p.cell)});if(!assertion.ok)failed=true;continue;
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
  const assertions=assessAssertions(meta,runRows);failed=assertions.unexpectedFailures.length>0;Object.assign(meta,{vendorDefects:assertions.vendorDefects,...(meta.engine!==undefined?{candidateExpectations:assertions.candidateExpectations}:{}),coveredCases:assertions.coveredCases,recordedCases:assertions.recordedCases});
  const ended=await client.call('end_task');if(ended.isError)throw new Error('Task cleanup failed');
  // Which engine answered every native case (./repl-parity/engine-answered.mjs): a lane anything else answered is incomplete.
  const engineProblem=laneEngineProblem(meta);if(engineProblem){meta.engineProblem=engineProblem;throw new Error(`The requested engine did not answer: ${engineProblem}`);}
  await pool.close();for(const resource of resources.reverse())await resource.close();resources.length=0;Object.assign(meta,pool.metadata(),{complete:true});validateAttestations(meta);
 }catch(error){meta.error=error.message;throw error;}
 // A failed run's cleanup must not mask why it failed: meta.error keeps the cause, and a cleanup failure names both.
 // Every owned resource is closed even when an earlier close fails, so a failed run never leaves device processes behind.
 finally{const cleanup=[];try{if(!meta.complete)try{await pool.close();}catch(e){cleanup.push(e.message);}for(const resource of resources.reverse())try{await resource.close();}catch(e){cleanup.push(e.message);}}finally{Object.assign(meta,pool.metadata());save(join(out,'meta.json'),meta);}
  if(cleanup.length){const failed=cleanup.join('; ');throw new Error(meta.error?`${meta.error} (then cleanup: ${failed})`:failed);}}
 console.log(JSON.stringify({out,cases:selected.length,pending:pending.length,pendingEnvironmentCells:meta.pendingEnvironment.flatMap(d=>d.cases).length,pendingObligations:meta.pendingObligations,complete:meta.complete,assertions:failed?'FAIL':meta.vendorDefects?.length?'RECORDED_VENDOR_DEFECT':'PASS',coveredCases:meta.coveredCases,recordedVendorDefects:meta.vendorDefects?.length??0,...(meta.engine!==undefined?{engine:meta.engine,candidateExpectations:meta.candidateExpectations?.length??0}:{})}));if(failed)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
