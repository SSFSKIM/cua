import {observeTurnReplies,turnCellLabels} from './turns.mjs';
import {StdioClient} from '../browser-parity/mcp.mjs';
import {cellCode,captureRawResult} from '../browser-parity/runner.mjs';
import {createNormalizer} from '../browser-parity/normalize.mjs';
import {exactImage,imageHash} from '../browser-parity/image-hash.mjs';
import {assertPreparedFacts} from './provenance.mjs';
import {validateAttestations} from './compare.mjs';
export class AttestedConnections {
  constructor(host){this.host=host;this.clients=[];this.hostAttestations=[];this.externalConnections=[];}
  async open(command,{capabilities}={}){
    const client=new StdioClient(command),connection=`connection-${this.clients.length+1}`;
    this.clients.push({client,connection});
    const init=await client.initialize(capabilities);
    const executionFacts=init._meta?.['cua/parityExecution'];if(command.expectedFacts)assertPreparedFacts(command.expectedFacts,executionFacts);
    const call=client.call.bind(client);let observation;
    client.call=(name,args,meta)=>{
      const pending=call(name,args,meta);
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
    if(cell.answer)client.setElicitationAnswer(async()=>{if(cell.answerDelayMs)await new Promise(r=>setTimeout(r,cell.answerDelayMs));return cell.answer;});
    const start=performance.now();let result,timer;
    if(cell.op==='turn'&&cell.witnessCount!==undefined){
      const replies=await observeTurnReplies(cell,{client});results.push({replies});timings.push(performance.now()-start);
      for(const [index,reply] of replies.entries()){const {afterHookMs,...proof}=reply.observation;await emit({case:scenario.id,cell:turnCellLabels(cell)[index],ok:true,...await normalizeRawResult(reply.result,{normalize}),value:proof,ms:{elapsed:reply.elapsed,afterHook:afterHookMs}});}
      continue;
    }
    try {
      if(cell.op==='reset')result=await client.call('js_reset');
      else if(cell.op==='turn'){const replies=await Promise.all(Array.from({length:cell.repeat??1},()=>client.request('parity/turn-ended',cell.args)));result=replies[0];if(replies.some(r=>r.isError))throw new Error('Turn completion refused');}
      else if(cell.op==='endTask')result=await client.call('end_task');
      else {
        const code=cellCode({...cell,raw:true,code:cell.code.replaceAll('@@CHECKOUT@@',checkout)});
        const pending=client.call('js',{code,title:'REPL parity fixture',...(cell.timeoutMs?{timeout_ms:cell.timeoutMs}:{})},cell.requestMeta);
        if(cell.cancelAfterMs!==undefined)timer=setTimeout(()=>client.cancel(pending.requestId),cell.cancelAfterMs);
        if(cell.ping){let settled=false;pending.then(()=>{settled=true;},()=>{settled=true;});await client.request('ping',{},1000);if(settled)throw new Error('ping completed only after the cell settled');}
        result=await pending;
      }
    } finally {clearTimeout(timer);}
    timings.push(performance.now()-start);results.push(result);
    const raw=await normalizeRawResult(result,{normalize,imageMode:scenario.imageMode??'exact',tool:cell.op==='endTask'?'end_task':undefined});
    // A tool error is raw outcome data; only independent assertions decide if the error was expected.
    await emit({case:scenario.id,cell:cell.label,ok:true,...raw,...(scenario.screenshotTolerance!==undefined?{screenshotTolerance:scenario.screenshotTolerance}:{}),ms:performance.now()-start});
  }
  let assertion;try{assertion=await scenario.assert({results,timings});if(!assertion||typeof assertion.ok!=='boolean')throw new Error('Invalid independent assertion');}catch(e){assertion={ok:false,reason:e.message};}
  await emit({case:scenario.id,assertion});return assertion;
}

// The only byte projection is the data field of an actual MCP image content item. Application objects in
// structuredContent/meta are opaque, and every non-byte image field (including absence) remains exact.
export async function normalizeRawResult(result,{normalize=createNormalizer({schemaFields:false}),imageMode='exact',tool}={}) {
 const raw=captureRawResult(result);
 if(Array.isArray(raw.content))raw.content=raw.content.map(item=>{
   if(item.type!=='image'||typeof item.data!=='string')return item;
   const bytes=Buffer.from(item.data,'base64'),exact=exactImage(bytes,{mimeType:item.mimeType});
   return {...item,data:imageMode==='live'?{...imageHash(bytes),mimeType:exact.mimeType}:exact};
 });
 const ids={'meta.cua/taskId':'task','meta.cua/callId':'call','meta.cua/sessionId':'session'};
 // Only the proxy-owned end_task status schema gets this mapping. Arbitrary js structured content remains opaque.
 const status=tool==='end_task'&&raw.structuredContent?.status==='ended'&&typeof raw.structuredContent.taskId==='string';
 const canonical=status?JSON.stringify(raw.structuredContent):null;
 if(status)ids['structuredContent.taskId']='task';
 const normalized=await normalize(raw,{ids});
 if(status&&Array.isArray(normalized.content))normalized.content=normalized.content.map((item,index)=>raw.content[index]?.type==='text'&&raw.content[index].text===canonical?{...item,text:JSON.stringify(normalized.structuredContent)}:item);
 return normalized;
}
