#!/usr/bin/env node
// M5 RemoteProofEndpoints: orchestration only. All device mutations are owned by remote-device.mjs.
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {validateAttestations} from './compare.mjs';
export function endpointPlan(experiment,device){
 if(!/^[a-z0-9][a-z0-9-]{0,13}$/.test(experiment))throw new Error('experiment must be a lowercase slug of at most 14 characters (device names are bounded)');
 if(!['mini','cua-linux'].includes(device))throw new Error('remote proof requires mini or cua-linux');
 return {device,name:`repl-${experiment}-${device==='mini'?'mini-browser':'linux'}`,surfaces:device==='mini'?['browser']:['computer','browser']};
}
export function safeEnrollment(value){
 const keys=['deviceId','relayEndpoint','clientSecretKey','devicesEntry'];
 if(keys.some(k=>typeof value?.[k]!=='string'||!value[k]))throw new Error('Missing safe enrollment fields');
 return Object.fromEntries(keys.map(k=>[k,value[k]]));
}
export function checkHost(host,observation){
 if(observation?.host!==host)throw new Error('Endpoint host attestation mismatch');
 validateAttestations({host,complete:true,connections:['endpoint'],hostAttestations:[{...observation,connection:'endpoint'}]});
 return observation;
}
export class RemoteProof {
 constructor({experiment,relay,io,state}){
  endpointPlan(experiment,'mini');const url=new URL(relay);
  if(url.protocol!=='wss:'||url.username||url.password||url.hash||url.search)throw new Error('relay requires a credential-free wss URL');
  this.io=io;this.state=state??{schema:1,experiment,relay,phase:'new',endpoints:[]};
  if(state&&(state.experiment!==undefined&&state.experiment!==experiment||state.relay!==undefined&&state.relay!==relay))throw new Error('Journal identity mismatch');
 }
 async save(){await this.io.save(this.state);return this.state;}
 async prepare(devices=['cua-linux','mini']){
  if(!['new','preparing'].includes(this.state.phase))throw new Error('Experiment already prepared; resume its journal');
  if(!devices.length||new Set(devices).size!==devices.length)throw new Error('Choose distinct proof devices');
  for(const device of devices)endpointPlan(this.state.experiment,device);
  this.state.phase='preparing';await this.save();
  for(const device of devices){if(this.state.endpoints.some(e=>e.device===device))continue;const endpoint=await this.io.prepare(endpointPlan(this.state.experiment,device));this.state.endpoints.push(endpoint);await this.save();}
  this.state.phase='handoff';return this.save();
 }
 async start({operatorReady=false,ownerReady=false}={}){
  if(!operatorReady||!ownerReady)throw new Error('Needs relay operator table merge and owner /secret transfer before start');
  try{for(const endpoint of this.state.endpoints)await this.startEndpoint(endpoint,'cua');}
  catch(error){
   const failures=[];
   for(const endpoint of this.state.endpoints)if(endpoint.pid)try{await this.io.stop(endpoint);delete endpoint.pid;endpoint.ready=false;}catch(e){failures.push(e.message);}
   this.state.phase=failures.length?'cleanup-failed':'handoff';await this.save();
   throw new Error(error.message+(failures.length?`; cleanup: ${failures.join('; ')}`:''));
  }
  this.state.phase='running';return this.save();
 }
 async startEndpoint(endpoint,host){
  if(endpoint.pid)throw new Error('Endpoint is already running');
  Object.assign(endpoint,await this.io.start(endpoint,host),{host});await this.save();
  if(!endpoint.ready||!Number.isInteger(endpoint.pid)||endpoint.pid<=0)throw new Error('Endpoint is not relay-ready with an owned PID');
  endpoint.hostAttestation=checkHost(host,await this.io.attest(endpoint,host));await this.save();
 }
 async restart(device,host){
  if(device!=='mini'||!['cua','vendor'].includes(host))throw new Error('Only the mini benchmark endpoint supports host restart');
  const endpoint=this.state.endpoints.find(e=>e.device===device);if(!endpoint?.pid)throw new Error('Endpoint not running');
  await this.io.stop(endpoint);delete endpoint.pid;delete endpoint.ready;delete endpoint.hostAttestation;await this.save();
  try{await this.startEndpoint(endpoint,host);}catch(error){if(endpoint.pid)await this.io.stop(endpoint);throw error;}
  return this.save();
 }
 async cleanup(){
  const errors=[];
  for(const endpoint of this.state.endpoints){
   try{if(endpoint.pid)await this.io.stop(endpoint);delete endpoint.pid;await this.io.remove(endpoint);endpoint.removed=true;}catch(e){errors.push(`${endpoint.device}: ${e.message}`);}
  }
  this.state.phase=errors.length?'cleanup-failed':'operator-cleanup';await this.save();
  if(errors.length)throw new Error(errors.join('; '));return this.state;
 }
}
// Never retry submit: SIGKILL makes its outcome uncertain. Observe through a new client instead.
export async function disconnectProbe(io){
 const client=await io.open();let replacement;
 try{
  await io.submit(client);await io.started(client);await io.kill(client.pid,'SIGKILL');
  replacement=await io.reconnect();await io.release(replacement);const count=await io.observe(replacement);
  if(count!==1)throw new Error(`Disconnect proof requires exactly one execution; observed ${count}`);
  return {requestId:client.requestId,disruption:'after-started',count};
 }finally{await io.end(replacement??client);}
}
export async function main(argv=process.argv.slice(2)){
 const {values:v}=parseArgs({args:argv,options:{experiment:{type:'string'},relay:{type:'string'},out:{type:'string'},action:{type:'string',default:'prepare'},device:{type:'string',multiple:true},'operator-ready':{type:'boolean'},'owner-ready':{type:'boolean'}}});
 if(!v.experiment||!v.relay||!v.out)throw new Error('Usage: remote.mjs --experiment <id> --relay <wss-url> --out <dir> [--action prepare|start|cleanup] [--device mini|cua-linux]');
 const {runRemoteProof}=await import('./remote-controller.mjs');await runRemoteProof(v);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
