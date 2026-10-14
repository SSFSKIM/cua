import {test} from 'node:test';import assert from 'node:assert/strict';import {normalizeHostDiagnostic} from '../../scripts/repl-parity/diagnostics.mjs';
const row=pid=>({case:'cells/lifecycle/child-exit-settles',cell:'interrupted',isError:true,content:[{type:'text',text:'node_repl kernel exited unexpectedly\n\nnode_repl diagnostics: '+JSON.stringify({kernel_pid:pid,kernel_status:'exited(code=137)',kernel_stderr_tail:`(node:${pid+1}) ExperimentalWarning: VM Modules is an experimental feature and might change at any time`,reason:'stdout_eof',stream_error:null})}]});
test('only schema-known diagnostic PIDs are normalized in the two controlled process-exit cases',()=>{
 assert.deepEqual(normalizeHostDiagnostic(row(100)),normalizeHostDiagnostic(row(200)));
 const changed=row(200);changed.content[0].text=changed.content[0].text.replace('code=137','code=1');assert.notDeepEqual(normalizeHostDiagnostic(row(100)),normalizeHostDiagnostic(changed));
 const application={...row(100),case:'cells/output/write-values'};assert.deepEqual(normalizeHostDiagnostic(application),application);
 const textChange=row(100);textChange.content[0].text=textChange.content[0].text.replace('unexpectedly','differently');assert.deepEqual(normalizeHostDiagnostic(textChange),textChange);
});
