import {execFileSync} from 'node:child_process';
import {remoteCommand,quote} from '../browser-parity/topology.mjs';
import {cellCode,parseCell} from '../browser-parity/runner.mjs';
// Housekeeping observation, like discarded fixture setup: the private artifact identity is never raw parity output.
// The actual selected host answers this call; a separate, owned process can unlink outside the child's sandbox.
export async function cleanupBrowserDownload({client,prepared},{run=execFileSync}={}){
 const observation=parseCell(await client.call('js',{code:cellCode({code:'return globalThis.__replDownloadCleanup;'}),title:'Attest owned fixture download for cleanup'}));
 if(!observation.ok||observation.value?.kind!=='repl-parity-fixture-download')throw new Error('Owned fixture download proof unavailable');
 const command=remoteCommand(prepared.device,`cd ${quote(prepared.checkout)} && test "$(git rev-parse HEAD)" = ${quote(prepared.commit)} && test -z "$(git status --porcelain)" && exec node test/repl-parity/cleanup-download.mjs`);
 let output;
 try{output=run(command.command,command.args,{input:JSON.stringify(observation.value),encoding:'utf8',timeout:30000,maxBuffer:1024*1024,stdio:['pipe','pipe','pipe']});}catch{throw new Error('Owned fixture download cleanup failed');}
 if(output!=='true\n')throw new Error('Owned fixture download cleanup failed');
 return true;
}
