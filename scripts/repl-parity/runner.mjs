import {StdioClient} from '../browser-parity/mcp.mjs';
import {cellCode,captureRawResult} from '../browser-parity/runner.mjs';
import {createNormalizer} from '../browser-parity/normalize.mjs';
import {exactImage,imageHash} from '../browser-parity/image-hash.mjs';
import {assertPreparedFacts} from './provenance.mjs';
import {validateAttestations} from './compare.mjs';
export class AttestedConnections {
  constructor(host){this.host=host;this.clients=[];this.hostAttestations=[];this.externalConnections=[];}
  async open(command){
    const client=new StdioClient(command),connection=`connection-${this.clients.length+1}`;
    this.clients.push({client,connection});
    const init=await client.initialize();
    const executionFacts=init._meta?.['cua/parityExecution'];if(command.expectedFacts)assertPreparedFacts(command.expectedFacts,executionFacts);
    const call=client.call.bind(client);let observation;
    client.call=(name,args)=>{
      const pending=call(name,args);
      const result=pending.then(r=>{
        // Proxy-local tools cannot establish host identity. Every real host result is checked, not just the first.
        if(name==='js'||name==='js_reset'){
          const a={connection,host:this.host,serverInfo:init.serverInfo,...(executionFacts?{executionFacts}:{}),_meta:Object.hasOwn(r,'_meta')?r._meta:null};
          validateAttestations({host:this.host,complete:true,connections:[connection],hostAttestations:[a]});
          if(!observation){observation=a;this.hostAttestations.push(a);}
        }
        return r;
      });result.requestId=pending.requestId;return result;
    };
    return client;
  }
  addObservations(observations,prefix){if(!observations.connections.length)return;validateAttestations({host:this.host,complete:true,...observations});for(const connection of observations.connections)this.externalConnections.push(`${prefix}/${connection}`);for(const a of observations.hostAttestations)this.hostAttestations.push({...a,connection:`${prefix}/${a.connection}`});}
  metadata(){return {connections:[...this.clients.map(c=>c.connection),...this.externalConnections],hostAttestations:this.hostAttestations};}
  async close(){for(const {client} of this.clients){const status=await client.close();if(status.code!==0)throw new Error(`Harness connection cleanup failed (${status.code??status.signal})`);}}
}
export async function runRawScenario(scenario,{client,emit,checkout}) {
  const results=[],timings=[],normalize=createNormalizer({imageMode:scenario.imageMode??'exact',schemaFields:false});
  await client.call('js_reset');
  for(const cell of scenario.cells){
    if(cell.answer)client.setElicitationAnswer(()=>cell.answer);
    const start=performance.now();let result,timer;
    try {
      if(cell.op==='reset')result=await client.call('js_reset');
      else if(cell.op==='endTask')result=await client.call('end_task');
      else {
        const code=cellCode({...cell,raw:true,code:cell.code.replaceAll('@@CHECKOUT@@',checkout)});
        const pending=client.call('js',{code,title:'REPL parity fixture',...(cell.timeoutMs?{timeout_ms:cell.timeoutMs}:{})});
        if(cell.cancelAfterMs!==undefined)timer=setTimeout(()=>client.cancel(pending.requestId),cell.cancelAfterMs);
        if(cell.ping){let settled=false;pending.then(()=>{settled=true;},()=>{settled=true;});await client.request('ping',{},1000);if(settled)throw new Error('ping completed only after the cell settled');}
        result=await pending;
      }
    } finally {clearTimeout(timer);}
    timings.push(performance.now()-start);results.push(result);
    const raw=await normalizeRawResult(result,{normalize,imageMode:scenario.imageMode??'exact'});
    // A tool error is raw outcome data; only independent assertions decide if the error was expected.
    await emit({case:scenario.id,cell:cell.label,ok:true,...raw,...(scenario.screenshotTolerance!==undefined?{screenshotTolerance:scenario.screenshotTolerance}:{}),ms:performance.now()-start});
  }
  let assertion;try{assertion=await scenario.assert({results,timings});if(!assertion||typeof assertion.ok!=='boolean')throw new Error('Invalid independent assertion');}catch(e){assertion={ok:false,reason:e.message};}
  await emit({case:scenario.id,assertion});return assertion;
}

// The only byte projection is the data field of an actual MCP image content item. Application objects in
// structuredContent/meta are opaque, and every non-byte image field (including absence) remains exact.
export async function normalizeRawResult(result,{normalize=createNormalizer({schemaFields:false}),imageMode='exact'}={}) {
 const raw=captureRawResult(result);
 if(Array.isArray(raw.content))raw.content=raw.content.map(item=>{
   if(item.type!=='image'||typeof item.data!=='string')return item;
   const bytes=Buffer.from(item.data,'base64'),exact=exactImage(bytes,{mimeType:item.mimeType});
   return {...item,data:imageMode==='live'?{...imageHash(bytes),mimeType:exact.mimeType}:exact};
 });
 return normalize(raw,{ids:{'meta.cua/taskId':'task','meta.cua/callId':'call','meta.cua/sessionId':'session'}});
}
