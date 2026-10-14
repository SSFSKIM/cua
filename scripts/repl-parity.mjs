#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {mkdirSync,readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {root,prepareCommand,execute,cellsCommand} from './repl-parity/topology.mjs';
import {selectScenarios,inventory,caseSchedule,inSuite,milestones} from './repl-parity/registry.mjs';
import scenarios from '../test/repl-parity/scenarios/index.mjs';
import {REPL_HOST_VERSION} from '../src/repl-host/identity.mjs';
import {AttestedConnections,runRawScenario} from './repl-parity/runner.mjs';
import {runSecretCase} from '../test/repl-parity/fixtures/secret-cases.mjs';
import {remoteCapabilityLane} from './repl-parity/capability.mjs';
import {compareParityRuns,validateAttestations} from './repl-parity/compare.mjs';
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const state=device=>join(root,'.doperpowers/sde/repl-parity',`${device}.json`);
const save=(p,value)=>writeFileSync(p,JSON.stringify(value,null,2)+'\n');
export async function main(argv=process.argv.slice(2)){
 const {values:v,positionals:[action,a,b]}=parseArgs({args:argv,allowPositionals:true,options:{device:{type:'string',default:'local'},host:{type:'string',default:'vendor'},suite:{type:'string',default:'cells'},through:{type:'string'},out:{type:'string'},expected:{type:'string'},commit:{type:'string'},profile:{type:'string'}}});
 if(v.through&&!milestones.includes(v.through))throw new Error('Invalid through milestone');
 if(!['local','mini','cua-linux'].includes(v.device)||!['vendor','cua'].includes(v.host)||!['cells','api','docs-profiles','all'].includes(v.suite))throw new Error('Invalid parity selection');
 if(action==='prepare'){
  const prepared=JSON.parse(execute(prepareCommand(v)).trim().split('\n').at(-1));mkdirSync(dirname(state(v.device)),{recursive:true});save(state(v.device),prepared);
  if(v.out){mkdirSync(resolve(v.out),{recursive:true});save(join(resolve(v.out),'prepare.json'),prepared);}console.log(JSON.stringify(prepared,null,2));return;
 }
 if(action==='diff'){
  if(!a||!b)throw new Error('diff needs two run directories');
  const load=dir=>({meta:json(join(dir,'meta.json')),tools:json(join(dir,'tools.json')),rows:readFileSync(join(dir,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)});
  const left=load(a),right=load(b);
  if(v.expected&&left.meta.host==='vendor'&&right.meta.host==='vendor')throw new Error('No expected-differences file permitted for vendor determinism');
  const caseIds=v.through?caseSchedule().filter(c=>c.milestone<=v.through&&c.platforms.includes(left.meta.platform)&&inSuite(c.id,left.meta.suite)).map(c=>c.id):selectScenarios(scenarios,inventory,{suite:left.meta.suite,through:left.meta.through??undefined,platform:left.meta.platform}).scenarios.map(c=>c.id);
  const result=compareParityRuns(left,right,{expected:v.expected?json(v.expected):[],caseIds,caseCells:Object.fromEntries(scenarios.filter(s=>caseIds.includes(s.id)).map(s=>[s.id,s.cells.map(c=>c.label)]))});console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;return;
 }
 if(action!=='run'||!v.out)throw new Error('Usage: repl-parity prepare|run|diff; run requires --out');
 if(v.device==='local'){
  const {scenarios:selected,pending}=selectScenarios(scenarios,inventory,{suite:v.suite,through:v.through,platform:process.platform});
  const doubles=selected.filter(s=>s.backend==='secret-double');
  if(!doubles.length)throw new Error('No local double cases selected; use --suite api (raw cells require a remote real host)');
  const out=resolve(v.out);mkdirSync(out,{recursive:false});const rows=[];
  for(const scenario of doubles){const result=await runSecretCase(scenario.id);rows.push({case:scenario.id,cell:'boundary',ok:true,value:result,fake:true},{case:scenario.id,assertion:await scenario.assert({results:[result]}),fake:true});}
  save(join(out,'meta.json'),{schema:1,device:'local',fake:true,complete:true,host:null,suite:v.suite,caseIds:doubles.map(s=>s.id),pending:pending.map(c=>c.id),note:'Service/store doubles only; not live host parity'});
  writeFileSync(join(out,'results.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');console.log(JSON.stringify({fake:true,cases:doubles.length,assertions:'PASS',out}));return;
 }
 const prepared=json(state(v.device)),{scenarios:selected,pending}=selectScenarios(scenarios,inventory,{suite:v.suite,through:v.through,platform:prepared.platform});
 if(!selected.length)throw new Error('No executable cases selected');
 const out=resolve(v.out);mkdirSync(out,{recursive:false});
 const meta={schema:1,host:v.host,observedHost:v.host,commit:prepared.commit,harnessCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),node:prepared.node,runtimeRelease:prepared.release,hostVersion:v.host==='vendor'?prepared.release:REPL_HOST_VERSION,apiVersion:v.host==='vendor'?prepared.release:REPL_HOST_VERSION,device:v.device,platform:prepared.platform,surfaces:['browser'],sandbox:'scoped',service:'cua',backend:'no-services',profile:prepared.profile,suite:v.suite,through:v.through??null,caseIds:selected.map(s=>s.id),caseCells:Object.fromEntries(selected.map(s=>[s.id,s.cells.map(c=>c.label)])),pending:pending.map(c=>({id:c.id,milestone:c.milestone})),complete:false,connections:[],hostAttestations:[]};
 save(join(out,'meta.json'),meta);writeFileSync(join(out,'results.jsonl'),'');
 const pool=new AttestedConnections(v.host);let failed=false;const resources=[];
 try{
  let client=await pool.open(cellsCommand({...prepared,host:v.host}));let lane='no-services';
  save(join(out,'tools.json'),await client.request('tools/list'));
  for(const scenario of selected){
    if(scenario.backend==='secret-double'){
      const result=await runSecretCase(scenario.id);for(const row of [{case:scenario.id,cell:'boundary',ok:true,value:result,fake:true},{case:scenario.id,assertion:await scenario.assert({results:[result]}),fake:true}])appendFileSync(join(out,'results.jsonl'),JSON.stringify(row)+'\n');continue;
    }
    if(scenario.backend!==lane){
      if(scenario.backend!=='capability-host')throw new Error(`Backend not configured: ${scenario.backend}`);
      const resource=await remoteCapabilityLane({...prepared,host:v.host});resources.push(resource);client=await pool.open(resource.command);lane='capability-host';
    }
    const assertion=await runRawScenario(scenario,{client,checkout:prepared.checkout,emit:r=>appendFileSync(join(out,'results.jsonl'),JSON.stringify(r)+'\n')});if(!assertion.ok)failed=true;
  }
  const ended=await client.call('end_task');if(ended.isError)throw new Error('Task cleanup failed');
  await pool.close();for(const resource of resources.reverse())await resource.close();resources.length=0;Object.assign(meta,pool.metadata(),{complete:true});validateAttestations(meta);
 }finally{try{if(!meta.complete)await pool.close();for(const resource of resources.reverse())await resource.close();}finally{Object.assign(meta,pool.metadata());save(join(out,'meta.json'),meta);}}
 console.log(JSON.stringify({out,cases:selected.length,pending:pending.length,complete:meta.complete,assertions:failed?'FAIL':'PASS'}));if(failed)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
