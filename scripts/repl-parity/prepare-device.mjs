// Ordinary parity preparation shares the remote proof's fresh-install/alias boundary, but never enrolls a relay.
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
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
import {prepareCommand,remoteCommand,quote,execute as executeCommand} from './topology.mjs';

const SESSION_KEYS=['DISPLAY','XAUTHORITY','DBUS_SESSION_BUS_ADDRESS','XDG_RUNTIME_DIR','XDG_DATA_DIRS'];
const SAFE_KEYS=['PATH','TMPDIR','LANG','LC_ALL','LC_CTYPE','USER','LOGNAME','HOME','CUA_HOME','CHROME_CONFIG_HOME','XDG_CONFIG_HOME','CUA_PARITY_NODE_MODE',...SESSION_KEYS];
const selectKeys=(env,keys)=>Object.fromEntries(keys.filter(key=>env[key]!==undefined).map(key=>[key,env[key]]));
export function prepareDevice({device,profile,node,home}, {ambient=process.env,inspect=executionFacts,run=execFileSync,endpointOptions={}}={}) {
 const experiment='parity',plan=endpointPlan(experiment,device),source=home??declaredDevice(device).discoveryHome??defaultHome(ambient);
 if(!isAbsolute(source)||/[\0\n]/.test(source))throw new Error('prepare --home needs an absolute path');
 const sourceEnv=nodeEnvironment({...ambient,CUA_HOME:source},node);delete sourceEnv.CUA_PARITY_NODE_MODE;
 const listing=JSON.parse(run(process.execPath,['bin/cua.mjs','profiles','list','--json'],{encoding:'utf8',timeout:90000,maxBuffer:1024*1024,env:{...sourceEnv,CUA_SHIM_SECRETS:'off',CUA_SHIM_SURFACES:'browser',CUA_REPL_HOST:'vendor',CUA_BROWSER_SERVICE:'cua'}}));
 const ready=listing.profiles?.filter(p=>p.ready&&p.extensionInstanceId)??[],selected=profile?ready.find(p=>p.key===profile):ready.length===1?ready[0]:null;
 if(!selected)throw new Error('prepare requires one ready bound profile; candidates: '+ready.map(p=>p.key).join(', '));
 const mode=node?'diagnostic-override':'managed';
 // Source observations use the real HOME. Scratch observations use only its synthetic Chrome presence HOME.
 const inspectHome=({source:target,ambient:overrides})=>inspect({source:target,ambient:nodeEnvironment({...sourceEnv,...overrides,CUA_HOME:target,...(target===source?{}:{CUA_PARITY_NODE_MODE:mode})},node)});
 const prepared={...inspectHome({source}),profile:selected.key,extensionInstanceId:selected.extensionInstanceId,...(node?{nodeOverride:node}:{})};
 const endpoint=prepareEndpoint({experiment,plan,prepared,enrollment:false},{...endpointOptions,inspect:inspectHome});
 const userHome=join(endpoint.home,'home'),environment=nodeEnvironment({...sourceEnv,HOME:userHome,CUA_HOME:endpoint.home,CHROME_CONFIG_HOME:join(userHome,'.config'),XDG_CONFIG_HOME:join(userHome,'.config'),CUA_PARITY_NODE_MODE:mode},node);
 try {
  return {...inspectHome({source:endpoint.home,ambient:environment}),device,profile:selected.key,chromeProfileDirectory:selected.chromeProfileDirectory??null,extensionInstanceId:selected.extensionInstanceId,nodeMode:mode,nodeOverride:node??null,discoveryHome:source,fixturePort:48732,userHome,ownedPreparation:{device,home:endpoint.home,experiment:endpoint.experiment,token:endpoint.token},display:environment.DISPLAY??null,xSession:selectKeys(environment,SESSION_KEYS),environment:selectKeys(environment,SAFE_KEYS),load:{average:loadavg(),cpus:availableParallelism()}};
 }catch(error){removeEndpoint(endpoint);throw error;}
}

const readJson=file=>JSON.parse(readFileSync(file,'utf8'));
function save(file,value){mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});}
// Each runner owns its journal. Keep it until device removal succeeds; old discovery-only state owns nothing.
export function managePreparation(action,{journal,out,...options},{execute=executeCommand}={}) {
 if(action==='prepare') {
  if(existsSync(journal)&&readJson(journal).ownedPreparation)throw new Error('Owned preparation already exists; run cleanup-prepared before preparing again');
  const prepared=JSON.parse(execute(prepareCommand(options)).trim().split('\n').at(-1));
  save(journal,prepared);
  if(out)save(join(resolve(out),'prepare.json'),prepared);
  return prepared;
 }
 if(action!=='cleanup-prepared')throw new Error('Unknown preparation action');
 const prepared=readJson(journal),owner=prepared.ownedPreparation;
 if(!owner||owner.device!==options.device||owner.home!==prepared.home||!owner.experiment||!owner.token)throw new Error('No matching journaled owned preparation to clean');
 // Project only the ownership capability, never a journal PID or a relay enrollment.
 const owned={home:owner.home,experiment:owner.experiment,token:owner.token};
 const result=JSON.parse(execute(remoteCommand(options.device,`cd ${quote(prepared.checkout)} && exec env -u CUA_NODE -u CUA_PARITY_NODE_MODE CUA_PARITY_REMOTE=1 node scripts/repl-parity/prepare-device.mjs cleanup ${quote(JSON.stringify(owned))}`)).trim().split('\n').at(-1));
 if(result.removed!==true)throw new Error('Prepared home removal was not confirmed; journal retained');
 rmSync(journal);return result;
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
