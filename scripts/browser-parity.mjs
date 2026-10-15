#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {mkdirSync,writeFileSync,appendFileSync,readFileSync,mkdtempSync,rmSync,readdirSync,existsSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {AttestedConnections} from './repl-parity/runner.mjs';
import {validateAttestations} from './repl-parity/compare.mjs';
import {StdioClient,textOf} from './browser-parity/mcp.mjs';
import {attest,runScenario} from './browser-parity/runner.mjs';
import {compareRuns} from './browser-parity/compare.mjs';
import {miniPrepareCommand,serveCommand,localCuaServeCommand,root,execute,remoteCommand,quote} from './browser-parity/topology.mjs';
import {prepareCapabilityHome} from './browser-parity/capability-home.mjs';
import {startCapabilityHost} from '../test/browser-parity/capability-host.mjs';
import {fixtureProcess,traceControl} from './browser-parity/resources.mjs';
import {startFixture} from '../test/browser-parity/fixture/serve.mjs';
const readJson=path=>JSON.parse(readFileSync(path,'utf8'));
const preparedPath=device=>join(root,'.doperpowers/sde/browser-parity',`${device}.json`);
const jsonl=dir=>readFileSync(join(dir,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
function scenariosAt(dir) {
  return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?scenariosAt(join(dir,e.name)):e.name.endsWith('.mjs')?[join(dir,e.name)]:[]).sort();
}
function globRegex(glob) {
  return new RegExp('^'+glob.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*\*\//g,'\u0000').replace(/\*\*/g,'\u0001').replace(/\*/g,'[^/]*').replace(/\?/g,'[^/]').replaceAll('\u0000','(?:.*/)?').replaceAll('\u0001','.*')+'$');
}
// --scenarios: comma-separated globs over scenario paths, relative to the repository or to the corpus's directory.
const SCENARIOS_DIR='test/browser-parity/scenarios';
// --corpus bench: the scripted benchmark episodes (bench/scenarios/, the M5 drag check), cases for one live device's
// outcomes rather than for a differential diff, kept apart so the parity corpus and its inventory never include them.
const CORPORA={parity:SCENARIOS_DIR,bench:'test/browser-parity/bench/scenarios'};
export function corpusRoot(corpus='parity') {
  if(!Object.hasOwn(CORPORA,corpus))throw new Error('Invalid corpus');
  return CORPORA[corpus];
}
function scenarioMatcher(globs,dir=SCENARIOS_DIR) {
  const patterns=globs.split(',').map(g=>g.trim()).filter(Boolean).map(globRegex);
  return relativePath=>patterns.some(p=>p.test(relativePath)||p.test(`${dir}/${relativePath}`));
}
// The capability-host group (scenarios/capability-host/) runs only against the capability host (`--backend
// capability-host`), and that backend runs nothing else: the group needs the optional capabilities only that test
// backend announces, and the ordinary corpus needs a page engine its scripted pages do not have. Otherwise a remote
// run takes the corpus and a local one the examples, unless `scenarios` (globs) narrows either.
export const CAPABILITY_GROUP='capability-host/';
export function selectScenarioPaths(relativePaths,{local,backend,scenarios,corpus='parity'}={}) {
  if(corpus==='bench') {
    // Its pages are the benchmark fixture's MiniWoB tasks, which need a real browser: no fake or capability backend.
    if(local||backend!==undefined)throw new Error('The bench corpus runs on a live device');
    return scenarios?relativePaths.filter(scenarioMatcher(scenarios,CORPORA.bench)):relativePaths;
  }
  const capability=backend==='capability-host';
  let paths=relativePaths.filter(p=>p.startsWith(CAPABILITY_GROUP)===capability);
  if(scenarios) {const matches=scenarioMatcher(scenarios);paths=paths.filter(matches);}
  else if(local&&!capability) paths=paths.filter(p=>p.startsWith('examples/'));
  return paths;
}
export async function main(argv=process.argv.slice(2)) {
  const {values,positionals}=parseArgs({args:argv,allowPositionals:true,options:{device:{type:'string',default:'local'},service:{type:'string',default:'vendor'},'repl-host':{type:'string',default:'vendor'},corpus:{type:'string',default:'parity'},out:{type:'string'},profile:{type:'string'},commit:{type:'string'},scenarios:{type:'string'},expected:{type:'string'},backend:{type:'string'}}});
  const [action,a,b]=positionals;
  if(!['vendor','cua'].includes(values['repl-host']))throw new Error('Invalid REPL host');
  if(action==='diff') {
    if(!a||!b)throw new Error('diff requires two run directories');
    const ma=readJson(join(a,'meta.json')),mb=readJson(join(b,'meta.json'));
    if(ma.host!==undefined||mb.host!==undefined){validateAttestations(ma);validateAttestations(mb);}
    if(ma.complete!==true||mb.complete!==true)throw new Error('Cannot compare incomplete runs');
    if(ma.backend!==mb.backend || ma.profile!==mb.profile || ma.device!==mb.device)throw new Error('Cannot compare different devices, profiles or fake/live backends');
    if(ma.service==='vendor'&&mb.service==='vendor'&&values.expected)throw new Error('Vendor determinism must not use expected differences');
    const expected=values.expected?readJson(resolve(values.expected)):[];
    // A milestone's comparison covers its scenarios only: both runs are restricted to the same cases, and inside that
    // subset a case or cell missing from either run is still a cardinality difference.
    const inSubset=values.scenarios?scenarioMatcher(values.scenarios):null;
    const rows=dir=>inSubset?jsonl(dir).filter(r=>typeof r.case==='string'&&inSubset(`${r.case}.mjs`)):jsonl(dir);
    const result=compareRuns(rows(a),rows(b),{expected});
    for(const d of result.differences)console.log(JSON.stringify(d));
    console.log(`${result.differences.length} ${values.expected?'unexpected differences':'differences'} (${result.cases} cases, ${result.cells} cells${values.expected?`, ${result.expected.length} expected`:''}${values.scenarios?`; scenarios ${values.scenarios}`:''})`);
    return result.ok?0:1;
  }
  if(!['prepare','run'].includes(action))throw new Error('Usage: browser-parity.mjs prepare|run|diff [options]');
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(values.device))throw new Error('Invalid device');
  if(action==='prepare') {
    if(values.device==='local')throw new Error('Local runs use only the fake backend; prepare is for the parity clone on a remote device');
    const output=execute(miniPrepareCommand(values));
    const meta=JSON.parse(output.trim().split('\n').at(-1));
    const fixture=await fixtureProcess({...meta,device:values.device});
    await fixture.close();
    mkdirSync(resolve(preparedPath(values.device),'..'),{recursive:true});writeFileSync(preparedPath(values.device),JSON.stringify(meta,null,2)+'\n');
    console.log(`prepared ${values.device} at ${meta.commit}, profile ${meta.profile}, fixture 48732`);return 0;
  }
  if(!values.out)throw new Error('run requires --out');
  if(!['vendor','cua'].includes(values.service))throw new Error('Invalid service');
  const corpusDir=corpusRoot(values.corpus);
  const out=resolve(values.out);mkdirSync(out,{recursive:true});
  if(existsSync(join(out,'meta.json'))||existsSync(join(out,'results.jsonl')))throw new Error('Output directory already contains a run');
  const local=values.device==='local';
  if(local&&values['repl-host']==='cua')throw new Error('Local fake browser cannot attest the own host');
  // --backend capability-host: the real `cua serve` and REPL client on this machine, in a scratch home whose only
  // backend is the capability host (test/browser-parity/capability-host.mjs), selected by its instance id.
  const capability=values.backend==='capability-host';
  if(values.backend!==undefined&&!capability)throw new Error('Invalid backend');
  if(capability&&!local)throw new Error('The capability host runs with --device local');
  const capabilityHome=capability?prepareCapabilityHome():null;
  let capabilityHost=null;
  const scratch=local&&!capability?mkdtempSync(join(tmpdir(),'cua-parity-')):null;
  const localCommit=()=>execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const prepared=capability?{device:'local',profile:'capability-host',checkout:root,home:capabilityHome.dir,commit:localCommit(),runtime:capabilityHome.release}
    :local?{device:'local',profile:'scratch',checkout:root,home:scratch,commit:localCommit()}:readJson(preparedPath(values.device));
  const meta={...prepared,...(values.corpus!=='parity'?{corpus:values.corpus}:{}),host:values['repl-host'],observedHost:values['repl-host'],fake:local&&!capability,service:values.service,backend:capability?'capability-host':local?'fake':'live',environment:{CUA_REPL_HOST:values['repl-host'],CUA_BROWSER_SERVICE:values.service,CUA_SHIM_SURFACES:'browser',CUA_HOME:prepared.home},started:new Date().toISOString(),elicitations:[],attestations:[],complete:false};
  if(!local) {
    const actual=execute(remoteCommand(values.device,`cd ${quote(prepared.checkout)} && git rev-parse HEAD`)).trim();
    if(actual!==prepared.commit)throw new Error('Parity clone moved since prepare');
  }
  let fixture,trace,client,failed=false;const ownedClients=new Set(),pool=new AttestedConnections(values['repl-host']);
  try {
    fixture=local?await startFixture({port:0}):await fixtureProcess(prepared);
    if(capability)capabilityHost=await startCapabilityHost({home:capabilityHome.dir});
    trace=traceControl({device:values.device,home:prepared.home,path:join(prepared.home,'state',`parity-trace-${randomUUID()}.jsonl`)});
    const scenarioRoot=join(root,corpusDir);
    const paths=selectScenarioPaths(scenariosAt(scenarioRoot).map(p=>relative(scenarioRoot,p)),{local,backend:values.backend,scenarios:values.scenarios,corpus:values.corpus}).map(p=>join(scenarioRoot,p));
    if(!paths.length)throw new Error('No scenarios matched');
    const scenarios=await Promise.all(paths.map(async p=>(await import(pathToFileURL(p))).default));
    if(new Set(scenarios.map(s=>s.id)).size!==scenarios.length)throw new Error('Duplicate scenario ids');
    meta.cases=scenarios.map(s=>s.id);
    writeFileSync(join(out,'results.jsonl'),'');
    for(const scenario of scenarios) {
      const connectClient=async()=>{
        const command=capability?localCuaServeCommand({service:values.service,replHost:values['repl-host'],home:prepared.home,userHome:capabilityHome.userHome}):serveCommand({...prepared,service:values.service,replHost:values['repl-host']});
        if(!local)command.expectedFacts=prepared;
        const connected=await pool.open({...command,onElicitation:row=>meta.elicitations.push({...row,case:scenario.id})});
        ownedClients.add(connected);
        let instanceId=capabilityHost?.instanceId;
        if(!capability) {
          const profileResult=await connected.call('profiles_list');
          const profiles=profileResult.structuredContent?.profiles;
          const profile=profiles?.find(p=>p.key===prepared.profile);
          if(!profile?.ready||!profile.extensionInstanceId)throw new Error(`Prepared profile ${prepared.profile} is not ready`);
          instanceId=profile.extensionInstanceId;
        }
        const selected=await connected.call('js',{code:`globalThis.browser=await cua.getBrowser({extensionInstanceId:${JSON.stringify(instanceId)}}); nodeRepl.write(await browser.documentation());`,timeout_ms:60000,title:'Parity service attestation'});
        if(selected.isError)throw new Error('Service selection failed');
        const attestation=attest(textOf(selected),values.service);meta.attestations.push({case:scenario.id,...attestation});
        console.log(`attested: ${values.service} (${attestation.header}) at ${meta.commit}${capability?' [capability host]':local?' [fake development runtime]':''}`);
        return {client:connected,instanceId};
      };
      const connection=await connectClient();client=connection.client;
      const result=await runScenario(scenario,{client,service:values.service,fixtureURL:fixture.url,browserFixtureURL:fixture.browserURL ?? fixture.url,instanceId:connection.instanceId,createClient:async()=>(await connectClient()).client,readTrace:trace.read,
        emit:row=>appendFileSync(join(out,'results.jsonl'),JSON.stringify(row)+'\n')});
      console.log(`case ${scenario.id} ${result.assertion.ok?'ok':'FAIL '+(result.assertion.reason??'assertion')}`);
      failed ||= !result.assertion.ok;for(const owned of ownedClients)await owned.close();ownedClients.clear();client=null;
    }
    writeFileSync(join(out,'host-trace.jsonl'),(await trace.read()).map(JSON.stringify).join('\n')+'\n');
    Object.assign(meta,pool.metadata());meta.complete=true;validateAttestations(meta);
  } catch(e) {meta.error=e.message;throw e;}
  finally {
    const cleanupErrors=[];
    for(const owned of ownedClients)try{await owned.close();}catch(e){cleanupErrors.push(e.message);}
    try{if(trace)trace.close();}catch(e){cleanupErrors.push(e.message);}
    try{if(fixture)await fixture.close();}catch(e){cleanupErrors.push(e.message);}
    try{if(capabilityHost)await capabilityHost.close();}catch(e){cleanupErrors.push(e.message);}
    if(cleanupErrors.length){meta.complete=false;meta.cleanupErrors=cleanupErrors;failed=true;}
    Object.assign(meta,pool.metadata());meta.finished=new Date().toISOString();writeFileSync(join(out,'meta.json'),JSON.stringify(meta,null,2)+'\n');
    if(scratch)rmSync(scratch,{recursive:true,force:true});
    capabilityHome?.cleanup();
  }
  return failed?1:0;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().then(code=>{process.exitCode=code;},e=>{console.error(e.message);process.exitCode=1;});
}
