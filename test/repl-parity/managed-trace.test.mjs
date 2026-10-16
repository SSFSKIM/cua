import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {traceControl} from '../../scripts/browser-parity/resources.mjs';
import {sessionTrace,traceSession} from '../../src/chrome/trace.mjs';
test('a scratch session captures its unchanged backend host trace from the discovery home',async()=>{
 const root=mkdtempSync(join(tmpdir(),'cua-managed-trace-')),home=join(root,'scratch'),discoveryHome=join(root,'source'),path=join(home,'trace.jsonl');mkdirSync(home);
 let trace;
 try{trace=traceControl({device:'local',home,discoveryHome,path});const tracePath=sessionTrace(discoveryHome);assert.equal(tracePath,path);assert.equal(sessionTrace(home),null);
  traceSession({tracePath,id:'fixture',title:'fixture'},'request','executeCdp',{method:'Runtime.evaluate',commandParams:{expression:'not persisted'}});
  const rows=await trace.read();assert.equal(rows.length,1);assert.equal(rows[0].cdp,'Runtime.evaluate');assert.ok(!JSON.stringify(rows).includes('not persisted'));
  trace.close();trace=null;assert.equal(sessionTrace(discoveryHome),null);assert.equal(existsSync(path),false);
 }finally{trace?.close();rmSync(root,{recursive:true,force:true});}
});
