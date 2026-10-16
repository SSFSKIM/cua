// Doctor's real repl.host row (src/runtime/doctor.mjs inspectRuntime) for a scratch home on the cua route, every other
// inspection stubbed, so oracle tests grade the formatter's actual output rather than a hand-written shape. `node` is
// what the own host's Node resolves to (the managed Node a live row answers on).
import {inspectRuntime} from '../../../src/runtime/doctor.mjs';
import {scratch} from '../../fixtures/runtime-fixture.mjs';
import {writeCuaRecord} from '../../fixtures/route-records.mjs';
const HOSTS={darwin:{platform:'darwin',arch:'arm64'},linux:{platform:'linux',arch:'x64'}};
const stubs={inspectHelper:async()=>({socket:'/x',holders:[]}),inspectSecrets:async()=>({dir:'/none',exists:false}),inspectAgent:async()=>[],
 inspectChrome:async()=>[],inspectLogin:async()=>({state:'logged-out'}),inspectLinux:async()=>[],verifySignatures:async()=>[]};
export async function doctorReplHost(t,{platform='darwin',env,node}){
 const s=scratch('cua-doctor-row-');t.after(s.cleanup);writeCuaRecord(s.dir);
 const report=await inspectRuntime({home:s.dir,host:HOSTS[platform],env,resolveOwnNode:()=>node,...stubs});
 return report.checks.find(c=>c.name==='repl.host');
}
