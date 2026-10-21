// Ordinary parity preparation shares the remote proof's fresh-install/alias boundary, but never enrolls a relay.
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {userHomeBeside} from '../harness-home.mjs';
import {basename,dirname,join,resolve,isAbsolute} from 'node:path';
import {loadavg,availableParallelism} from 'node:os';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {declaredDevice} from './devices.mjs';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {executionFacts} from './provenance.mjs';
import {prepareEndpoint,removeEndpoint} from './remote-device.mjs';
import {endpointPlan} from './remote.mjs';
import {nodeEnvironment} from './node-provenance.mjs';
import {prepareCommand,nativePrepareCommand,remoteCommand,quote,execute as executeCommand} from './topology.mjs';
import {PARITY_CHECKOUT} from '../native-baseline/remote.mjs';

const SESSION_KEYS=['DISPLAY','XAUTHORITY','DBUS_SESSION_BUS_ADDRESS','XDG_RUNTIME_DIR','XDG_DATA_DIRS'];
const SAFE_KEYS=['PATH','TMPDIR','LANG','LC_ALL','LC_CTYPE','USER','LOGNAME','HOME','CUA_HOME','CHROME_CONFIG_HOME','XDG_CONFIG_HOME','CUA_PARITY_NODE_MODE',...SESSION_KEYS];
const selectKeys=(env,keys)=>Object.fromEntries(keys.filter(key=>env[key]!==undefined).map(key=>[key,env[key]]));
// The REPL host that answers preparation's profile listing. On Linux it is the own host: #115 M3 retires the vendor host
// there (CUA_REPL_HOST=vendor is refused), and only the M0 control runs select it explicitly, through `run --host
// vendor`. The mini keeps the vendor host, which macOS still serves.
export const listingHost=platform=>platform==='linux'?'cua':'vendor';
export function prepareDevice({device,profile,node,home}, {ambient=process.env,inspect=executionFacts,run=execFileSync,endpointOptions={}}={}) {
 const declaration=declaredDevice(device);
 const experiment='parity',plan=endpointPlan(experiment,device),source=home??declaration.discoveryHome??defaultHome(ambient);
 if(!isAbsolute(source)||/[\0\n]/.test(source))throw new Error('prepare --home needs an absolute path');
 const sourceEnv=nodeEnvironment({...ambient,CUA_HOME:source},node);delete sourceEnv.CUA_PARITY_NODE_MODE;
 const listing=JSON.parse(run(process.execPath,['bin/cua.mjs','profiles','list','--json'],{encoding:'utf8',timeout:90000,maxBuffer:1024*1024,env:{...sourceEnv,CUA_SHIM_SECRETS:'off',CUA_SHIM_SURFACES:'browser',CUA_REPL_HOST:listingHost(declaration.platform)}}));
 const ready=listing.profiles?.filter(p=>p.ready&&p.extensionInstanceId)??[],selected=profile?ready.find(p=>p.key===profile):ready.length===1?ready[0]:null;
 if(!selected)throw new Error('prepare requires one ready bound profile; candidates: '+ready.map(p=>p.key).join(', '));
 const mode=node?'diagnostic-override':'managed';
 // Source observations use the real HOME. Scratch observations use only its synthetic Chrome presence HOME.
 const inspectHome=({source:target,ambient:overrides})=>inspect({source:target,ambient:nodeEnvironment({...sourceEnv,...overrides,CUA_HOME:target,...(target===source?{}:{CUA_PARITY_NODE_MODE:mode})},node)});
 const prepared={...inspectHome({source}),profile:selected.key,extensionInstanceId:selected.extensionInstanceId,...(node?{nodeOverride:node}:{})};
 const endpoint=prepareEndpoint({experiment,plan,prepared,enrollment:false},{...endpointOptions,inspect:inspectHome});
 const userHome=userHomeBeside(endpoint.home),environment=nodeEnvironment({...sourceEnv,HOME:userHome,CUA_HOME:endpoint.home,CHROME_CONFIG_HOME:join(userHome,'.config'),XDG_CONFIG_HOME:join(userHome,'.config'),CUA_PARITY_NODE_MODE:mode},node);
 try {
  return {...inspectHome({source:endpoint.home,ambient:environment}),device,profile:selected.key,chromeProfileDirectory:selected.chromeProfileDirectory??null,extensionInstanceId:selected.extensionInstanceId,nodeMode:mode,nodeOverride:node??null,discoveryHome:source,fixturePort:48732,userHome,ownedPreparation:{device,home:endpoint.home,experiment:endpoint.experiment,token:endpoint.token},display:environment.DISPLAY??null,xSession:selectKeys(environment,SESSION_KEYS),environment:selectKeys(environment,SAFE_KEYS),load:{average:loadavg(),cpus:availableParallelism()}};
 }catch(error){removeEndpoint(endpoint);throw error;}
}

const readJson=file=>JSON.parse(readFileSync(file,'utf8'));
function save(file,value){mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});}
// A preparation made by a side whose own prepare-device still nests the user HOME inside the endpoint's CUA_HOME
// (before #115 M1's layout fix: the cfprefs before side at 90cbfe0) -> the same preparation in the sibling layout
// (../harness-home.mjs) and the move that makes it so on the device, or {prepared, move: null} when it already is. The
// controller's harness applies it, so both sides of a comparison run under one layout whatever commit each prepares.
export function siblingLayout(prepared) {
 const home=prepared.ownedPreparation?.home,nested=home&&`${home}/home`;   // the old layout, recognised, never made
 if(!home||prepared.userHome!==nested)return {prepared,move:null};
 const sibling=userHomeBeside(home),moved=value=>typeof value==='string'&&(value===nested||value.startsWith(nested+'/'))?sibling+value.slice(nested.length):value;
 const environment=Object.fromEntries(Object.entries(prepared.environment??{}).map(([key,value])=>[key,moved(value)]));
 return {prepared:{...prepared,userHome:sibling,...(prepared.environment?{environment}:{})},move:[nested,sibling]};
}

// Each runner owns its journal. Keep it until device removal succeeds; old discovery-only state owns nothing.
export function managePreparation(action,{journal,out,...options},{execute=executeCommand}={}) {
 if(action==='prepare') {
  if(existsSync(journal)&&readJson(journal).ownedPreparation)throw new Error('Owned preparation already exists; run cleanup-prepared before preparing again');
  const raw=JSON.parse(execute(prepareCommand(options)).trim().split('\n').at(-1)),{prepared,move}=siblingLayout(raw);
  // Ownership is journaled before the layout migration: a move that fails, or whose outcome is unknown, still leaves a
  // preparation cleanup-prepared removes (both layouts: the home, with any nested HOME, and the sibling).
  if(move){
   save(journal,{...raw,layoutMigration:{from:move[0],to:move[1],state:'pending'}});
   execute(remoteCommand(options.device,`set -e; test -d ${quote(move[0])}; test ! -e ${quote(move[1])}; mv ${quote(move[0])} ${quote(move[1])}`));
  }
  save(journal,prepared);
  if(out)save(join(resolve(out),'prepare.json'),prepared);
  return prepared;
 }
 if(action!=='cleanup-prepared')throw new Error('Unknown preparation action');
 const prepared=readJson(journal),owner=prepared.ownedPreparation;
 if(!owner||owner.device!==options.device||owner.home!==prepared.home||!owner.experiment||!owner.token)throw new Error('No matching journaled owned preparation to clean');
 // Project only the ownership capability, never a journal PID or a relay enrollment.
 const owned={home:owner.home,experiment:owner.experiment,token:owner.token};
 // The sibling user HOME goes too, after the side's own cleanup (a side from before the layout fix does not know it),
 // and the removal is confirmed only once both are gone. No `exec`: the shell must outlive the cleanup to remove it.
 const sibling=userHomeBeside(owner.home);
 const lines=execute(remoteCommand(options.device,`cd ${quote(prepared.checkout)} && env -u CUA_NODE -u CUA_PARITY_NODE_MODE CUA_PARITY_REMOTE=1 node scripts/repl-parity/prepare-device.mjs cleanup ${quote(JSON.stringify(owned))} && rm -rf ${quote(sibling)} && test ! -e ${quote(sibling)} && echo '{"siblingRemoved":true}'`)).trim().split('\n');
 const parsed=lines.map(line=>{try{return JSON.parse(line);}catch{return null;}}).filter(Boolean);
 if(!parsed.some(r=>r.removed===true))throw new Error('Prepared home removal was not confirmed; journal retained');
 if(parsed.at(-1)?.siblingRemoved!==true)throw new Error('The sibling user HOME\'s removal was not confirmed; journal retained');
 rmSync(journal);return {removed:true,siblingRemoved:true};
}

// The approved route (#117's native-mac suite; docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, M2b): on
// macOS a lane serves the runtime copy and the cua Engine.app the owner approved on the device, in place, because a new
// on-disk copy of either raises the screen-capture confirmation only the owner can answer. So prepare installs nothing:
// it places the harness checkout at the sitting's commit (nativePrepareCommand, as the native baseline's prepare does),
// checks that the approved engine exists and is that checkout's build (scripts/native-matrix/goldens-device.mjs
// engine-check, reading only; harnesses never build one), and journals the sitting. Each run then takes the approved
// home's admission, stops the engine at its start and its end (scripts/native-baseline/prepare.mjs) and gives it back,
// so between runs nothing on the device is the harness's, and cleanup-prepared removes only the journal.
const ENGINE_CHECK=`cd ${PARITY_CHECKOUT} && node scripts/native-matrix/goldens-device.mjs engine-check`;
export const isApprovedJournal=journal=>existsSync(journal)&&readJson(journal).route==='approved';
export function manageApprovedPreparation(action,{journal,out,device,commit,'approved-runtime':approvedRuntime,'approved-engine':approvedEngine},{execute=executeCommand,engineCheck=d=>JSON.parse(execute(remoteCommand(d,ENGINE_CHECK)).trim().split('\n').at(-1))}={}) {
 if(action==='prepare') {
  if(existsSync(journal)&&readJson(journal).ownedPreparation)throw new Error('Owned preparation already exists; run cleanup-prepared before preparing again');
  if(declaredDevice(device).platform!=='darwin')throw new Error('the approved route serves a macOS device');
  const head=execute(nativePrepareCommand({device,commit})).trim().split('\n').at(-1).trim();
  if(!/^[0-9a-f]{40}$/.test(head)||!head.startsWith(commit))throw new Error(`the harness checkout is not at ${commit} after its placement (HEAD ${head})`);
  const checked=engineCheck(device);
  if(!checked?.ok)throw new Error(`the approved engine cannot serve this sitting: ${(checked?.problems??['the device gave no answer']).join('; ')}`);
  const {build,engineVersion,signature}=checked.engine;
  const prepared={route:'approved',device,platform:'darwin',commit:head,approvedRuntime,approvedEngine,engine:{build,engineVersion,signature},preparedAt:new Date().toISOString()};
  save(journal,prepared);
  if(out)save(join(resolve(out),'prepare.json'),prepared);
  return prepared;
 }
 if(action!=='cleanup-prepared')throw new Error('Unknown preparation action');
 const prepared=existsSync(journal)?readJson(journal):null;
 if(prepared?.route!=='approved'||prepared.device!==device)throw new Error('No approved preparation of this device to clean');
 rmSync(journal);return {removed:true,owned:false};
}
// The journal a native-mac run may use: the approved route's, for this device, naming the run's approved runtime and
// engine (one sitting serves one of each).
export function approvedJournalFor(prepared,{device,'approved-runtime':approvedRuntime,'approved-engine':approvedEngine}) {
 if(prepared?.route!=='approved')throw new Error('the device\'s preparation is not the approved route: prepare it with --approved-runtime and --approved-engine (cleanup-prepared first if another is outstanding)');
 if(prepared.device!==device)throw new Error(`the preparation is of ${prepared.device}, not ${device}`);
 if(prepared.approvedRuntime!==approvedRuntime)throw new Error(`the sitting was prepared on the approved runtime ${prepared.approvedRuntime}, not ${approvedRuntime}`);
 if(prepared.approvedEngine!==approvedEngine)throw new Error(`the sitting was prepared on the approved engine ${prepared.approvedEngine}, not ${approvedEngine}`);
 return prepared;
}

function main(argv=process.argv.slice(2)) {
 if(process.env.CUA_PARITY_REMOTE!=='1'||basename(process.cwd())!=='cua-parity')throw new Error('Preparation helper is remote-only and requires the prepared parity clone');
 const [action,...args]=argv;
 if(action==='cleanup')return removeEndpoint(JSON.parse(args[0]));
 if(action!=='prepare')throw new Error('Unknown preparation operation');
 const {values}=parseArgs({args,options:{device:{type:'string'},profile:{type:'string'},node:{type:'string'},home:{type:'string'}}});
 return prepareDevice(values);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{console.log(JSON.stringify(main()));}catch(error){console.error(error.message);process.exitCode=1;}}
