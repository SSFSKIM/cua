// The real production services in the remote scratch capability home, with fixture-only startup attestation.
import {randomUUID} from 'node:crypto';
import {openConnection} from '../../src/mcp/connection.mjs';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {executionFacts,assertPreparedFacts,attestedOutput} from '../../scripts/repl-parity/provenance.mjs';
if(process.env.CUA_PARITY_REMOTE!=='1')throw new Error('Capability client is remote-only');
const facts=executionFacts({source:process.env.CUA_PARITY_SOURCE_HOME});assertPreparedFacts(JSON.parse(process.env.CUA_PARITY_EXPECTED),facts);
if(resolveRuntime({home:process.env.CUA_HOME}).release!==facts.release)throw new Error('Copied runtime provenance changed');
let prepareLaunch;
if(process.env.CUA_PARITY_LIVE_SECRETS==='1'){
 const {prepareLiveSecretsLaunch}=await import('./serve-live-secrets.mjs');
 prepareLaunch=launch=>prepareLiveSecretsLaunch(launch,{host:process.env.CUA_REPL_HOST,userHome:process.env.HOME,capabilityHome:process.env.CUA_HOME,remote:process.env.CUA_PARITY_REMOTE==='1'});
}else if(process.env.CUA_PARITY_API==='1'){
 const {prepareCapabilityApiLaunch}=await import('./serve-capability-api.mjs');
 prepareLaunch=launch=>prepareCapabilityApiLaunch(launch,{host:process.env.CUA_REPL_HOST});
}
const connection=await openConnection({prepareLaunch,home:process.env.CUA_HOME,env:process.env,sessionId:randomUUID(),input:process.stdin,output:attestedOutput(process.stdout,facts)});
const stop=()=>connection.close('signal');process.once('SIGTERM',stop);process.once('SIGINT',stop);
try{process.exitCode=(await connection.closed).code;}finally{process.off('SIGTERM',stop);process.off('SIGINT',stop);}
