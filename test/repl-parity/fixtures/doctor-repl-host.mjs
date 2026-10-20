// Doctor's real repl.host row (src/runtime/doctor.mjs inspectRuntime) for a scratch home carrying `registration` as the
// live selection lane writes it (cua's by default), every other inspection stubbed, so oracle tests grade the formatter's
// actual output rather than a hand-written shape. `node` is what the own host's Node resolves to (the managed Node a
// live row answers on), or null where none resolves (as ownHostNode refuses). `engine` is #117's engine selection inputs
// (src/runtime/launch.mjs nativeEngineFor's `config`, `installed`), fixed to no engine.json and no approved engine by
// default so the machine's own settings never leak in.
import {inspectRuntime} from '../../../src/runtime/doctor.mjs';
import {CuaError} from '../../../src/runtime/errors.mjs';
import {scratch} from '../../fixtures/runtime-fixture.mjs';
import {installRoutes} from '../../../scripts/repl-parity/selection-device.mjs';
const HOSTS={darwin:{platform:'darwin',arch:'arm64'},linux:{platform:'linux',arch:'x64'}};
const stubs={inspectHelper:async()=>({socket:'/x',holders:[]}),inspectSecrets:async()=>({dir:'/none',exists:false}),inspectAgent:async()=>[],
 inspectChrome:async()=>[],inspectLinux:async()=>[],verifySignatures:async()=>[]};
const noNode=()=>{throw Object.assign(new CuaError('repl_host_node','cua\'s own REPL host needs Node 24 or later, and none was found'),{tried:['node on PATH (not found)']});};
export async function doctorReplHost(t,{platform='darwin',env,node,registration='cua',engine={config:()=>({}),installed:()=>null}}){
 const s=scratch('cua-doctor-row-');t.after(s.cleanup);installRoutes(s.dir,registration);
 const report=await inspectRuntime({home:s.dir,host:HOSTS[platform],env,resolveOwnNode:node===null?noNode:()=>node,engine,...stubs});
 return report.checks.find(c=>c.name==='repl.host');
}
