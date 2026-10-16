import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {remoteCommand,quote} from '../browser-parity/topology.mjs';
import {assertPreparedFacts} from './provenance.mjs';
import {linuxSession,ownNodeEnv} from './topology.mjs';
// `execute` is a test seam only; runs use execFile. The 120 s bound covers the probe's fresh fixture installs.
export async function runBoundaryScenario(scenario,{prepared,host},{execute=promisify(execFile)}={}) {
 const command=remoteCommand(prepared.device,`${linuxSession}\ncd ${quote(prepared.checkout)} && exec env ${ownNodeEnv(prepared)}CUA_PARITY_EXPECTED=${quote(JSON.stringify(prepared))} CUA_PARITY_REMOTE=1 CUA_HOME=${quote(prepared.home)} CUA_REPL_HOST=${quote(host)} node test/repl-parity/probe-boundary.mjs ${quote(scenario.id.slice('cells/'.length))}`);
 const {stdout}=await execute(command.command,command.args,{encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
 const result=JSON.parse(stdout);assertPreparedFacts(prepared,result.executionFacts);if(!Array.isArray(result.rows)||!result.observations)throw new Error('Invalid boundary evidence');return result;
}
