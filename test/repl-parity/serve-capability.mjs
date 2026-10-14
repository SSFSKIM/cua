// Device-local fake backend, real selected host in a separate child. Never transfers the controller's runtime.
import {prepareCapabilityHome} from '../../scripts/browser-parity/capability-home.mjs';
import {startCapabilityHost} from '../browser-parity/capability-host.mjs';
const home=prepareCapabilityHome({source:process.env.CUA_HOME});let host;
try {
 host=await startCapabilityHost({home:home.dir});
 console.log(JSON.stringify({ready:true,home:home.dir,userHome:home.userHome,release:home.release,instanceId:host.instanceId,socketPath:host.socketPath,pid:process.pid}));
 await new Promise(resolve=>{process.stdin.resume();process.stdin.once('end',resolve);process.once('SIGTERM',resolve);process.once('SIGINT',resolve);});
}finally{await host?.close();home.cleanup();}
