import {isDeepStrictEqual} from 'node:util';
import {cellCode,parseCell} from '../browser-parity/runner.mjs';

// Independent oracle: pinned chatgpt-26.928.40906 browser-client.js, not src/cua-api.
// and/or:7330-7357; filter and locator(options):7271-7286,7358-7393,7463-7469.
// all()/cached reads and invalidation:6810,7063-7139,7271-7286,7447-7513.
// actionError and classification:6685-6715,7216-7249. The existing strict-error corpus
// records the same error suffix in m2/browser-diagnostics/corpus-c49777c/vendor-host/results.jsonl.
const sameTab='Locators must belong to the same tab';
const errorIs=message=>row=>row.ok===false&&row.error?.code==='Error'&&row.error.message===message;
const valueIs=value=>row=>row.ok===true&&isDeepStrictEqual(row.value,value);
const scratch=(page,code)=>`const scratch=await browser.tabs.new();try{await scratch.goto(fixtureURL+${JSON.stringify(page)});${code}\n}finally{await scratch.close();}`;
const contract=(label,code,check)=>({cell:{label:'locator-contract-'+label,raw:true,code:cellCode({code})},check});
const errorContract=(label,code,message)=>contract(label,code,errorIs(message));

const supplements=new Map();
for(const method of ['and','or'])supplements.set(method,[
 errorContract('cross-tab',scratch('/read.html',`tab.playwright.locator('.item').${method}(scratch.playwright.locator('.item'));return true;`),sameTab),
 errorContract('invalid-operand',`tab.playwright.locator('.item').${method}({});return true;`,`locator.${method} requires a PlaywrightLocator`),
]);
for(const method of ['filter','locator']){
 const apply=options=>method==='filter'?`tab.playwright.locator('body').filter(${options})`:`tab.playwright.locator('html').locator('body',${options})`;
 const cells=[];
 for(const option of ['has','hasNot'])cells.push(errorContract('cross-tab-'+option.toLowerCase(),scratch('/read.html',`${apply(`{${option}:scratch.playwright.locator('.item')}`)};return true;`),sameTab));
 for(const option of ['has','hasNot'])cells.push(errorContract('invalid-'+option.toLowerCase(),`${apply(`{${option}:{}}`)};return true;`,`locator.filter ${option} requires a PlaywrightLocator`));
 cells.push(method==='filter'
  ?errorContract('invalid-visible',`${apply("{visible:'yes'}")};return true;`,'locator.filter visible must be a boolean')
  :errorContract('empty-selector',"tab.playwright.locator('body').locator('');return true;",'locator.locator requires a selector'));
 const positive=method==='filter'
  ?`return [await scratch.playwright.locator('body').filter({has:scratch.playwright.locator('[data-note=stable]')}).count(),await scratch.playwright.locator('.item').filter({hasNot:scratch.playwright.locator('button')}).count()];`
  :`return [await scratch.playwright.locator('html').locator('body',{has:scratch.playwright.locator('[data-note=stable]')}).count(),await scratch.playwright.locator('body').locator('.item',{hasNot:scratch.playwright.locator('button')}).count()];`;
 cells.push(contract('same-tab',scratch('/read.html',positive),valueIs([1,2])));
 supplements.set(method,cells);
}
supplements.set('all',[contract('collection-cache',scratch('/controls.html',`
const [body]=await scratch.playwright.locator('body').all();
const trigger=body.locator('#click'),result=body.locator('#result');
const before=[await trigger.textContent(),await result.textContent(),await trigger.getAttribute('id'),await trigger.getAttribute('data-missing')];
await scratch.playwright.locator('#click').click();
await scratch.playwright.locator('#result').filter({hasText:'recorded'}).waitFor({state:'attached',timeoutMs:3000});
const cached=await result.textContent();
await trigger.click();
return {before,cached,after:await result.textContent()};
`),valueIs({before:['Click','','click',null],cached:'',after:'recorded'}))]);

const sample=(tag,text)=>({tag,role:null,type:null,ariaLabel:null,text,visible:true,disabled:false});
const sampleSelector='.grid button, a[title="Counter link"]';
// Fixture source: corpus-pages.mjs visible-dom-dense has one long link followed by 250 grid buttons.
const sampling={kind:'multiple_matches',action:'click',locator:sampleSelector,matchCount:251,visibleCount:251,matches:[
 sample('a','A link whose text runs long enough to be cut. A link whose text runs long enough to be cut. A link whose text runs long '),
 sample('button','g0'),sample('button','g1'),sample('button','g2'),sample('button','g3'),
],truncated:true};
const absentSelector='#locator-contract-absent';
const absent={kind:'no_matches',action:'waitFor',locator:absentSelector,matchCount:0,visibleCount:0,matches:[],truncated:false};
function diagnostics(expected,context,origin){
 return row=>{
  if(row.ok!==false||row.error?.code!=='Error'||typeof row.error.message!=='string')return false;
  const match=row.error.message.match(/\nLocator diagnostics: (.+)$/);
  if(!match||!row.error.message.slice(0,match.index).endsWith('\n'+context)||!origin.test(row.error.message.slice(0,match.index)))return false;
  return isDeepStrictEqual(JSON.parse(match[1]),expected);
 };
}
supplements.set('click',[contract('diagnostics-sampling',scratch('/visible-dom-dense.html',`await scratch.playwright.locator(${JSON.stringify(sampleSelector)}).click({timeoutMs:1000});return true;`),diagnostics(sampling,'waiting on click for selector '+sampleSelector,/strict mode violation/i))]);
supplements.set('waitfor',[contract('diagnostics-no-matches',scratch('/read.html',`await scratch.playwright.locator(${JSON.stringify(absentSelector)}).waitFor({state:'visible',timeoutMs:100});return true;`),diagnostics(absent,'locator.waitFor(visible) timed out for selector '+absentSelector,/timed out|timeout/i))]);

// Keep raw MCP results and all caller context intact. Only slice the original assertion's
// results/timings; appended cells have their own independent source-grounded expectations.
export function augmentLocatorContracts(scenarios){
 return scenarios.map(scenario=>{
  const extra=supplements.get(scenario.id.replace(/^api\/browser-playwrightlocator\//,''));
  if(!scenario.id.startsWith('api/browser-playwrightlocator/')||!extra)return scenario;
  const offset=scenario.cells.length;
  return {...scenario,cells:[...scenario.cells,...extra.map(({cell})=>({...cell}))],async assert(input){
   try{
    if(input.results.length!==offset+extra.length)return {ok:false,reason:`${scenario.id}: unexpected locator contract cell count`};
    const base=await scenario.assert({...input,results:input.results.slice(0,offset),timings:input.timings?.slice(0,offset)});
    if(base?.ok!==true)return base;
    for(let i=0;i<extra.length;i++)if(!extra[i].check(parseCell(input.results[offset+i])))return {ok:false,reason:`${scenario.id}: ${extra[i].cell.label} did not satisfy the vendor locator contract`};
    return {ok:true};
   }catch(error){return {ok:false,reason:`${scenario.id}: ${error.message}`};}
  }};
 });
}


// Selected-client boundary supplements make transport/cache properties observable without
// replacing the real Chrome positives. Existing capability setup supplies __boot/__trace/__command.
// vm.send (:10013-10034) rejects a null transport response with this exact sentence.
const emptyResponse='transport send returned empty response';
const reply=(type,value)=>`await nodeRepl.rpc('browser',{method:'oracle.reply',params:{type:${JSON.stringify(type)},value:${JSON.stringify(value)}}});`;
const boundaryContract=(label,code,check)=>{
 const c=contract(label,code,check);c.cell.label='locator-boundary-'+label;return c;
};
const wire=(type,extra={})=>({type,browser_id:'$browser',tab_id:'$tab',...extra});
const readWire=(relative,timeout)=>wire('playwright_locator_read_all',{selector:'.row',...(relative?{relative_selector:relative}:{}),timeout_ms:timeout,client_timeout_ms:timeout});
const record=(text,inner,note)=>({text_content:text,inner_text:inner,attributes:{'data-note':note}});
const boundaryCross=boundaryContract('cross-tab',`
await __boot('boundary-double');
${reply('create_tab',{id:'8',title:'Locator scratch',url:'about:blank'})}
${reply('close_tab',{})}
const start=(await __trace()).length,scratch=await browser.tabs.new();
const created=(await __trace()).slice(start).map(__command);let errors,commands;
try{
 const left=tab.playwright.locator('.row'),right=scratch.playwright.locator('.row');
 const before=(await __trace()).length;
 errors=[];
 for(const call of [()=>left.and(right),()=>left.or(right),()=>left.filter({has:right}),()=>left.filter({hasNot:right}),()=>left.locator('.child',{has:right}),()=>left.locator('.child',{hasNot:right})]){
  try{await call();errors.push({rejected:false});}catch(error){errors.push({rejected:true,message:error.message});}
 }
 commands=(await __trace()).slice(before).map(__command);
}finally{await scratch.close();}
const cleanup=(await __trace()).slice(start+created.length+commands.length).map(command=>({...__command(command),...(command.tab_id===scratch.id?{tab_id:'$scratch'}:{})}));
return {distinct:scratch.id!==tab.id,errors,commands,created,cleanup};
`,valueIs({distinct:true,errors:Array.from({length:6},()=>({rejected:true,message:sameTab})),commands:[],created:[{type:'create_tab',browser_id:'$browser'}],cleanup:[{type:'close_tab',browser_id:'$browser',tab_id:'$scratch'}]}));
const cacheExpected={
 initial:['Alpha','Beta inner','b',null],failed:{rejected:true,message:emptyResponse},retried:['Child Alpha','Child Beta inner'],rootStill:'Alpha',after:['Changed Beta','Changed Alpha'],
 commands:[wire('playwright_locator_count',{selector:'.row'}),readWire(undefined,66),readWire('.child',77),readWire('.child',77),wire('playwright_locator_click',{selector:'.row >> nth=0',timeout_ms:88,client_timeout_ms:88}),readWire(undefined,99),readWire('.child',100)],
};
const boundaryCache=boundaryContract('cache-lifecycle',`
await __boot('boundary-double');
${reply('playwright_locator_count',{count:2})}
${reply('playwright_locator_read_all',{values:[record('Alpha','Alpha inner','a'),record('Beta','Beta inner','b')]})}
const before=(await __trace()).length,rows=await tab.playwright.locator('.row').all();
const initial=[await rows[0].textContent({timeoutMs:66}),await rows[1].innerText({timeoutMs:900}),await rows[1].getAttribute('data-note'),await rows[1].getAttribute('missing')];
${reply('playwright_locator_read_all',null)}
let failed;
try{await rows[0].locator('.child').textContent({timeoutMs:77});failed={rejected:false};}catch(error){failed={rejected:true,message:error.message};}
${reply('playwright_locator_read_all',{values:[record('Child Alpha','Child Alpha inner','a'),record('Child Beta','Child Beta inner','b')]})}
const retried=[await rows[0].locator('.child').textContent({timeoutMs:77}),await rows[1].locator('.child').innerText({timeoutMs:900})];
const rootStill=await rows[0].textContent();
${reply('playwright_locator_click',{})}
${reply('playwright_locator_read_all',{values:[record('Changed Alpha','Changed Alpha inner','a'),record('Changed Beta','Changed Beta inner','b')]})}
await rows[0].click({timeoutMs:88});
const after=[await rows[1].textContent({timeoutMs:99}),await rows[0].locator('.child').textContent({timeoutMs:100})];
return {initial,failed,retried,rootStill,after,commands:(await __trace()).slice(before).map(__command)};
`,valueIs(cacheExpected));

const boundaryPayload={matchCount:1,visibleCount:1,matches:[sample('button','Target')]};
// The service's Rust serde wire recursively orders reply keys before actionError spreads
// the value (:7236-7246). Preserve that order in the exact message, as in the pinned
// M2 strict-error corpus and the reviewed vendor boundary smoke (2026-10-15).
const boundaryDiagnostic={kind:'action_failed',action:'click',locator:'.row',matchCount:1,matches:[{ariaLabel:null,disabled:false,role:null,tag:'button',text:'Target',type:null,visible:true}],visibleCount:1,truncated:false};
const boundaryMessage=emptyResponse+'\nwaiting on click for selector .row\nLocator diagnostics: '+JSON.stringify(boundaryDiagnostic);
// Author a stable observation before emitting raw MCP: generated projector spelling varies
// across clients. The real-Chrome sampling cell proves its behavior; this trace retains
// every non-script field and attests that the diagnostic command supplied nonempty code.
const boundaryAction=boundaryContract('action-diagnostics',`
await __boot('boundary-double');
${reply('playwright_locator_click',null)}
${reply('playwright_evaluate',{value:boundaryPayload})}
const before=(await __trace()).length;let error;
try{await tab.playwright.locator('.row').click({timeoutMs:88});error={rejected:false};}catch(caught){error={rejected:true,message:caught.message};}
return {error,commands:(await __trace()).slice(before).map(command=>{
 const value=__command(command);
 if(value.type!=='playwright_evaluate')return value;
 const {script,...fields}=value;
 return {...fields,scriptPresent:typeof script==='string'&&script.trim().length>0};
})};
`,valueIs({error:{rejected:true,message:boundaryMessage},commands:[
 wire('playwright_locator_click',{selector:'.row',timeout_ms:88,client_timeout_ms:88}),
 wire('playwright_evaluate',{selector:'.row',selector_mode:'all',timeout_ms:1000,client_timeout_ms:1000,scriptPresent:true}),
]}));

export function augmentCapabilityLocatorContracts(scenarios){
 const extra=[boundaryCross,boundaryCache,boundaryAction];
 return scenarios.map(scenario=>{
  if(scenario.id!=='api/browser-playwrightapi/elementinfo')return scenario;
  const offset=scenario.cells.length;
  return {...scenario,locatorContractSupplements:extra.map(({cell})=>cell.label),cells:[...scenario.cells,...extra.map(({cell})=>({...cell}))],async assert(input){
   try{
    if(input.results.length!==offset+extra.length)return {ok:false,reason:`${scenario.id}: unexpected locator boundary cell count`};
    const base=await scenario.assert({...input,results:input.results.slice(0,offset),timings:input.timings?.slice(0,offset)});
    if(base?.ok!==true)return base;
    for(let i=0;i<extra.length;i++)if(!await extra[i].check(parseCell(input.results[offset+i])))return {ok:false,reason:`${scenario.id}: ${extra[i].cell.label} did not satisfy the vendor locator boundary contract`};
    return {ok:true};
   }catch(error){return {ok:false,reason:`${scenario.id}: ${error.message}`};}
  }};
 });
}
