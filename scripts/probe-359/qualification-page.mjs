// Fixture-only stress injection. The native engines are never patched for qualification.
import {page} from './page.mjs';

// Serialized into the owned fixture. Do not await the acknowledgement: the browser's
// network service can deliver it while this task keeps the renderer's main thread busy.
// Whether that really happened is checked by the driver, not assumed from this call.
export function busyFixture(c,state,trace,reply){
 if(!Number.isInteger(c.busyMs)||c.busyMs<350||c.busyMs>1200)throw Error('busyMs must be 350..1200');
 const busyStartedAt=Date.now(),busyUntil=busyStartedAt+c.busyMs;
 trace.push({event:'busy-start',seq:trace.length,at:busyStartedAt,monoMs:performance.now()});
 const acknowledgement=reply({cmd:c.n,op:c.op,...state(),busyStartedAt,busyUntil});
 while(Date.now()<busyUntil){} // Deliberately deny the page an input-dispatch turn.
 trace.push({event:'busy-end',seq:trace.length,at:Date.now(),monoMs:performance.now()});
 return acknowledgement;
}
export function qualificationPage(){
 return page().replace("async function run(c){",'const busyFixture='+busyFixture.toString()+';\nasync function run(c){')
  .replace(" if(c.op==='reset'){"," if(c.op==='busy'){await busyFixture(c,state,trace,reply);return;}\n if(c.op==='reset'){");
}
