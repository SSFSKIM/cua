import {observeTurnReplies,turnCellLabels} from './turns.mjs';
import {StdioClient} from '../browser-parity/mcp.mjs';
import {cellCode,captureRawResult} from '../browser-parity/runner.mjs';
import {createNormalizer} from '../browser-parity/normalize.mjs';
import {exactImage,imageHash} from '../browser-parity/image-hash.mjs';
import {assertPreparedFacts} from './provenance.mjs';
import {validateAttestations} from './compare.mjs';
import {NO_PAUSE} from '../mini-pause.mjs';
import {join} from 'node:path';
// The run's pause gate (scripts/mini-pause.mjs pauseGate, MAWS DL 58), set once per run: every lane's cells wait at
// their boundary while the mini's CI runner is busy, and every js call a connection makes waits there too (a lane's
// own setup cells included), so nothing reaches the mini's GUI during a pause. A cell that waited, or that a pause
// overlapped (it held at the cell's end, or one began while the cell ran), keeps its
// raw `ms` but is marked `pause`, and its timing is handed to the scenario's assertion as undefined: dropped, not judged.
let runPause=NO_PAUSE;
export const usePauseGate=gate=>{runPause=gate??NO_PAUSE;};
export class AttestedConnections {
  // `diagnostics`: a directory for each connection's stderr tail when it ends abnormally (StdioClient stderrFile).
  constructor(host,{diagnostics}={}){this.host=host;this.diagnostics=diagnostics;this.clients=[];this.hostAttestations=[];this.externalConnections=[];}
  async open(command,{capabilities}={}){
    let answeringHost;
    const connection=`connection-${this.clients.length+1}`;
    const client=new StdioClient({...command,...(this.diagnostics?{stderrFile:join(this.diagnostics,`${connection}.stderr.log`)}:{}),onNotification:message=>{
      if(message.method==='cua/parityAnsweringHost')answeringHost=message.params;
      command.onNotification?.(message);
    }});
    this.clients.push({client,connection});
    const init=await client.initialize(capabilities);
    const executionFacts=init._meta?.['cua/parityExecution'];if(command.expectedFacts)assertPreparedFacts(command.expectedFacts,executionFacts);
    const call=client.call.bind(client);let observation;
    client.call=(name,args,meta)=>{
      // Every js call waits at the run's pause first, whoever makes it (a lane's setup cells too). `dispatched` settles
      // once the request has been written (StdioClient writes on the call) with the host's own request: control traffic
      // and cancellation aimed at the call start from there, and judge it by the host's answer, not this wrapper's.
      let pending;const send=()=>{pending=call(name,args,meta);return {request:pending};};
      const dispatched=name==='js'?Promise.resolve(runPause.wait(`a js call on ${connection}`)).then(send):Promise.resolve(send());
      const result=dispatched.then(()=>pending).then(r=>{
        // Proxy-local tools cannot establish host identity. Every real host result is checked, not just the first.
        if(name==='js'||name==='js_reset'){
          const observedFacts=executionFacts?{...executionFacts,...(answeringHost?{answeringHost}:{})}:undefined;
          const a={connection,host:this.host,serverInfo:init.serverInfo,...(observedFacts?{executionFacts:observedFacts}:{}),_meta:Object.hasOwn(r,'_meta')?r._meta:null};
          validateAttestations({host:this.host,nodeMode:command.expectedFacts?.nodeMode,complete:true,connections:[connection],hostAttestations:[a]});
          if(!observation){observation=a;this.hostAttestations.push(a);}
        }
        return r;
      });Object.defineProperty(result,'requestId',{get:()=>pending?.requestId});result.dispatched=dispatched;return result;
    };
    return client;
  }
  addObservations(observations,prefix){if(!observations.connections.length)return;validateAttestations({host:this.host,complete:true,...observations});for(const connection of observations.connections)this.externalConnections.push(`${prefix}/${connection}`);for(const a of observations.hostAttestations)this.hostAttestations.push({...a,connection:`${prefix}/${a.connection}`});}
  metadata(){return {connections:[...this.clients.map(c=>c.connection),...this.externalConnections],hostAttestations:this.hostAttestations};}
  // Every connection is closed before a failed one is reported, so one failure leaves no other serve running.
  async close(){const failed=[];for(const {client,connection} of this.clients){const status=await client.close();if(status.code!==0)failed.push(`${connection} (${status.code??status.signal})`);}if(failed.length)throw new Error(`Harness connection cleanup failed: ${failed.join(', ')}`);}
}
// -> {request}, the host's own request (boxed, so awaiting does not adopt it), once it has been written: a wrapped call
// may be held at the run's pause first, and a held call that fails (the pause lost) fails here too.
const written=pending=>pending.dispatched??Promise.resolve({request:pending});
export async function runRawScenario(scenario,{client,emit,checkout,reset=true,context={},profiles,replaceCode=code=>code,pause=runPause}) {
  const results=[],timings=[],pausedCells=[],normalize=createNormalizer({imageMode:scenario.imageMode??'exact',schemaFields:false});
  if(reset)await client.call('js_reset');
  // A cell's pause: it waited at its boundary, or a pause overlapped it (the gate's generation history, not only the file).
  const pausedDuring=(where,waited,token)=>waited??pause.overlapped(token,where);
  const timed=(paused,ms)=>{if(paused){pausedCells.push(timings.length);timings.push(undefined);}else timings.push(ms);};
  for(const cell of scenario.cells){
    const where=`${scenario.id} ${cell.label??cell.op}`,waited=await pause.wait(where),token=pause.begin();
    if(cell.answer)client.setElicitationAnswer(async()=>{if(cell.answerDelayMs)await new Promise(r=>setTimeout(r,cell.answerDelayMs));return cell.answer;});
    const start=performance.now();let result,timer;
    if(cell.op==='turn'){
      const replies=await observeTurnReplies(cell,{client}),witnessed=cell.witnessCount!==undefined;
      if(replies.some(r=>r.result.isError))throw new Error('Turn completion refused');
      const paused=pausedDuring(where,waited,token);
      results.push(witnessed?{replies}:replies[0].result);timed(paused,Math.max(...replies.map(r=>r.hostTurnMs)));
      for(const [index,reply] of replies.entries()){
        const {afterHookMs,...proof}=reply.observation;
        await emit({case:scenario.id,cell:turnCellLabels(cell)[index],ok:true,...await normalizeRawResult(reply.result,{normalize}),...(witnessed?{value:proof}:{}),ms:{elapsed:reply.elapsed,hostTurn:reply.hostTurnMs,...(witnessed?{afterHook:afterHookMs}:{})},...(paused?{pause:paused}:{})});
      }
      continue;
    }
    try {
      if(cell.op==='profiles'){
        if(!profiles)throw new Error('Profiles host observer unavailable');
        const observed=await profiles();result=observed.result;
        const paused=pausedDuring(where,waited,token),ms=performance.now()-start;
        results.push(observed);timed(paused,ms);
        await emit({case:scenario.id,cell:cell.label,ok:true,...await normalizeRawResult(result,{normalize}),ms,...(paused?{pause:paused}:{})});continue;
      }
      if(cell.op==='reset')result=await client.call('js_reset');
      else if(cell.op==='endTask')result=await client.call('end_task');
      else {
        const code=cellCode({...cell,raw:true,code:replaceCode(cell.code.replaceAll('@@CHECKOUT@@',checkout))});
        const pending=client.call('js',{code,title:'REPL parity fixture',...(cell.timeoutMs?{timeout_ms:cell.timeoutMs}:{})},cell.requestMeta);
        // Handled from the start: it may reject while the dispatch or the ping is awaited, or be left behind when the
        // ping check throws; it is still awaited below, where its own rejection reaches the cell.
        pending.catch(()=>{});
        const {request}=cell.cancelAfterMs!==undefined||cell.ping?await written(pending):{};
        if(cell.cancelAfterMs!==undefined)timer=setTimeout(()=>client.cancel(request.requestId),cell.cancelAfterMs);
        if(cell.ping){let settled=false;request.then(()=>{settled=true;},()=>{settled=true;});await client.request('ping',{},1000);if(settled)throw new Error('ping completed only after the cell settled');}
        result=await pending;
      }
    } finally {clearTimeout(timer);}
    const ms=performance.now()-start,paused=pausedDuring(where,waited,token);
    timed(paused,ms);results.push(result);
    const raw=await normalizeRawResult(result,{normalize,imageMode:scenario.imageMode??'exact',tool:cell.op==='endTask'?'end_task':undefined});
    // A tool error is raw outcome data; only independent assertions decide if the error was expected.
    await emit({case:scenario.id,cell:cell.label,ok:true,...raw,...(scenario.screenshotTolerance!==undefined?{screenshotTolerance:scenario.screenshotTolerance}:{}),ms,...(paused?{pause:paused}:{})});
  }
  let assertion;try{assertion=await scenario.assert({results,timings,pausedCells,...context,...(context.getFixtureState?{fixtureState:await context.getFixtureState()}: {})});if(!assertion||typeof assertion.ok!=='boolean')throw new Error('Invalid independent assertion');}catch(e){assertion={ok:false,reason:e.message};}
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
