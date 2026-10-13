import {textOf} from './mcp.mjs';
import {createNormalizer} from './normalize.mjs';
export const RESULT_MARKER = 'CUA_PARITY_RESULT ';
export function attest(text, service) {
  const header=text.split('\n').find(line=>/^# Selected Browser\b/.test(line));
  const marker=text.match(/cua browser service ([0-9]+\.[0-9]+\.[0-9]+)/)?.[0];
  if(!header || (service==='cua') !== Boolean(marker)) throw new Error(`service attestation failed: requested ${service}`);
  return {service,header,...(marker ? {marker} : {})};
}
export function parseCell(result) {
  const text=textOf(result), matches=[...text.matchAll(/CUA_PARITY_RESULT (.+)(?:\n|$)/g)];
  if(result.isError) return {ok:false,error:{code:'mcp_tool_error',message:text}};
  if(matches.length) {
    const row=JSON.parse(matches.at(-1)[1]),count=row.$imageCount ?? 0;
    if(count) {
      const images=(result.content ?? []).filter(c=>c.type==='image').slice(-count);
      if(images.length!==count)throw new Error('Missing MCP screenshot image');
      const replace=value=>{
        if(value && typeof value==='object') {
          if(Object.hasOwn(value,'$imageIndex')) {
            if(!images[value.$imageIndex])throw new Error('Invalid MCP screenshot reference');
            return images[value.$imageIndex];
          }
          if(Array.isArray(value))return value.map(replace);
          return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v)]));
        }
        return value;
      };
      row.value=replace(row.value);
    }
    delete row.$imageCount;
    if(typeof row.ok!=='boolean')throw new Error('Invalid cell result');
    return row;
  }
  throw new Error('Cell did not emit its parity result marker');
}
// A cell is an async-function BODY, with an explicit return. Errors are data, never swallowed as success.
const envelope = code => `(async()=>{try{return {ok:true,value:(await (async()=>{${code}\n})())??null};}catch(e){return {ok:false,error:{code:e.code??e.reason??e.name??'Error',message:String(e.message??e)}};}})()`;
export function cellCode(cell) {
  let expr;
  if(cell.join) expr=`await __parityPending[${JSON.stringify(cell.join)}]`;
  else if(cell.start) return `globalThis.__parityPending ??= {}; __parityPending[${JSON.stringify(cell.label)}]=${envelope(cell.code)}; nodeRepl.write(${JSON.stringify(RESULT_MARKER)}+JSON.stringify({ok:true,value:{started:${JSON.stringify(cell.label)}}}));`;
  else expr=`await ${envelope(cell.code)}`;
  return `{const result=${expr};const images=[];
const json=JSON.stringify(result,(key,value)=>{
  const bytes=ArrayBuffer.isView(value)?value:value?.type==='Buffer'&&Array.isArray(value.data)?new Uint8Array(value.data):null;
  if(bytes){images.push(bytes);return {$imageIndex:images.length-1};}return value;
});
for(const image of images)await nodeRepl.emitImage(image);
nodeRepl.write(${JSON.stringify(RESULT_MARKER)}+JSON.stringify({...JSON.parse(json),$imageCount:images.length}));}`;
}
export async function runScenario(scenario,{client,fixtureURL,browserFixtureURL=fixtureURL,instanceId,service,emit,createClient,readTrace=async()=>[]}) {
  if (!scenario.id || !scenario.milestone || !Array.isArray(scenario.commands) || !Array.isArray(scenario.cells) || typeof scenario.assert !== 'function') throw new Error('Invalid scenario module');
  const labels=new Set(), handles=new Set();
  for(const c of scenario.cells) {
    if(!c.label || labels.has(c.label)) throw new Error(`${scenario.id}: duplicate/missing cell label`);
    labels.add(c.label);
    if(c.join && !handles.delete(`${c.client ?? 'primary'}:${c.join}`)) throw new Error(`${scenario.id}: join needs an earlier unmatched start`);
    if(c.start) handles.add(`${c.client ?? 'primary'}:${c.label}`);
  }
  if(handles.size && !scenario.cells.some(c=>c.op==='drop')) throw new Error(`${scenario.id}: unjoined start`);
  if(scenario.skip) {
    if(typeof scenario.skip!=='string') throw new Error('skip requires a reason');
    const row={case:scenario.id,skip:scenario.skip,assertion:{ok:true}};await emit(row);return row;
  }
  const normalize=createNormalizer(), results=[];
  const reset=await fetch(fixtureURL+'/reset',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(scenario.setup?.state ?? {})});
  if(!reset.ok) throw new Error('Fixture reset failed');
  const page=new URL(scenario.setup?.page ?? '/counter.html',browserFixtureURL+'/').href;
  // The case's tab is made with the browser API's own create_tab and navigate_tab_url (cua.createBrowserTab adds a
  // read of the new page's DOM snapshot, playwright_dom_snapshot, which a service serves only from M1b on); the
  // snapshot read is covered by its own scenario (reads/snapshot).
  const setup=`globalThis.fixtureURL=${JSON.stringify(browserFixtureURL)}; globalThis.browser=await cua.getBrowser({extensionInstanceId:${JSON.stringify(instanceId)}}); await browser.nameSession(${JSON.stringify(scenario.id)}); globalThis.tab=await browser.tabs.new(); await tab.goto(${JSON.stringify(page)});`;
  const bootstrap=async c=>parseCell(await c.call('js',{code:cellCode({code:setup}),timeout_ms:60000,title:`parity ${scenario.id} setup`}));
  const bootResult=await bootstrap(client);
  if(!bootResult.ok) {const row={case:scenario.id,assertion:{ok:false,reason:'setup failed',error:bootResult.error}};await emit(row);return row;}
  const clients=new Map([['primary',client]]),dropped=new Set();
  for(const cell of scenario.cells) {
    const before=(await readTrace()).length, started=performance.now(); let result;
    try {
      const key=cell.client ?? 'primary';
      if(dropped.has(key))throw new Error(`Client ${key} was dropped`);
      if(!clients.has(key)) {
        if(!createClient)throw new Error('Additional clients unavailable');
        const next=await createClient(key);clients.set(key,next);
        const ready=await bootstrap(next);if(!ready.ok)throw new Error(`Client ${key} setup failed: ${ready.error.message}`);
      }
      const active=clients.get(key);
      if(cell.op==='endTask') {const r=await active.call('end_task');result=r.isError ? {ok:false,error:{code:'end_task',message:textOf(r)}} : {ok:true,value:r.structuredContent ?? {ended:true}};}
      else if(cell.op==='drop') {await active.close({drop:true});dropped.add(key);result={ok:true,value:{dropped:true}};}
      else result=parseCell(await active.call('js',{code:cellCode(cell),timeout_ms:cell.timeoutMs ?? 60000,title:`parity ${scenario.id} ${cell.label}`}));
    } catch(e) {result={ok:false,error:{code:e.code ?? 'harness_error',message:e.message}};}
    const ms=performance.now()-started;
    const trace=(await readTrace()).slice(before).filter(r=>r.name===scenario.id);
    const row={case:scenario.id,cell:cell.label,...(cell.client?{client:cell.client}:{}),...result,ms,trace,
      ...(scenario.pollingAllowance ? {pollingAllowance:scenario.pollingAllowance} : {}),
      ...(scenario.screenshotTolerance !== undefined ? {screenshotTolerance:scenario.screenshotTolerance} : {})};
    if(result.ok) row.value=await normalize(result.value,cell.normalize);
    // Assertions receive raw results; JSONL receives stable projections.
    results.push({cell:cell.label,...result}); await emit(row);
  }
  const fixtureState=await (await fetch(fixtureURL+'/state')).json();
  let assertion;
  try {assertion=await scenario.assert({results,fixtureState,service});if(!assertion || typeof assertion.ok!=='boolean') throw new Error('assert must return {ok, reason?}');}
  catch(e) {assertion={ok:false,reason:e.message};}
  // An expected cell error is the scenario's responsibility; lifecycle cleanup errors are never ignored.
  for(const [key,active] of clients) if(!dropped.has(key)) {try {const r=await active.call('end_task');if(r.isError) throw new Error(textOf(r));}catch(e){assertion={ok:false,reason:`cleanup failed: ${e.message}`};}}
  const row={case:scenario.id,assertion};await emit(row);return row;
}
