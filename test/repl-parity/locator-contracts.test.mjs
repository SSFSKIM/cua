import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
// The pinned Meriyah cua's kernel ships (src/repl-host/vendor/meriyah, the devDependency's exact version): npm test runs
// without node_modules (README), as acceptance 10's clean clone does.
import meriyah from '../../src/repl-host/vendor/meriyah/meriyah.mjs';
const {parseModule}=meriyah;
import {augmentLocatorContracts,augmentCapabilityLocatorContracts} from '../../scripts/repl-parity/locator-contracts.mjs';
import {createCapabilityOracleService} from '../browser-parity/capability-api-fixture.mjs';
import {parseCell,RESULT_MARKER} from '../../scripts/browser-parity/runner.mjs';

const id=method=>`api/browser-playwrightlocator/${method}`;
const methods=['and','or','filter','locator','all','click','waitfor'];
const labels={
 and:['cross-tab','invalid-operand'],or:['cross-tab','invalid-operand'],
 filter:['cross-tab-has','cross-tab-hasnot','invalid-has','invalid-hasnot','invalid-visible','same-tab'],
 locator:['cross-tab-has','cross-tab-hasnot','invalid-has','invalid-hasnot','empty-selector','same-tab'],
 all:['collection-cache'],click:['diagnostics-sampling'],waitfor:['diagnostics-no-matches'],
};
const raw=row=>({content:[{type:'text',text:RESULT_MARKER+JSON.stringify(row)}],isError:false,structuredContent:{keep:'structured'},_meta:{keep:'metadata'}});
const success=value=>raw({ok:true,value});
const failure=message=>raw({ok:false,error:{code:'Error',message}});
const sameTab='Locators must belong to the same tab';
const scenario=(method,check=async()=>({ok:true}))=>({id:id(method),backend:'chrome',browserCase:true,setup:{page:'/read.html'},witnessCells:['base'],cells:[{label:'base',raw:true,code:'return "base";'}],assert:check});
const augmented=method=>augmentLocatorContracts([scenario(method)])[0];
const extras=method=>augmented(method).cells.slice(1);
const cell=(method,label)=>{const found=extras(method).find(c=>c.label===`locator-contract-${label}`);assert.ok(found,`${method}/${label}`);return found;};
const match=(tag,text)=>({tag,role:null,type:null,ariaLabel:null,text,visible:true,disabled:false});
// Source browser-client.js:7216-7249 samples five matches and trims text to 120 characters.
// The fixture link precedes the 250 .grid buttons (corpus-pages.mjs visible-dom-dense).
const longText='A link whose text runs long enough to be cut. A link whose text runs long enough to be cut. A link whose text runs long ';
const sampling={kind:'multiple_matches',action:'click',locator:'.grid button, a[title="Counter link"]',matchCount:251,visibleCount:251,matches:[match('a',longText),match('button','g0'),match('button','g1'),match('button','g2'),match('button','g3')],truncated:true};
const empty={kind:'no_matches',action:'waitFor',locator:'#locator-contract-absent',matchCount:0,visibleCount:0,matches:[],truncated:false};
const diagnostic=(value,description)=>failure(`Error: ${description}\n${value.action==='click'?'waiting on click for selector '+value.locator:'locator.waitFor(visible) timed out for selector '+value.locator}\nLocator diagnostics: ${JSON.stringify(value)}`);
function expected(method){
 if(method==='and'||method==='or')return [failure(sameTab),failure(`locator.${method} requires a PlaywrightLocator`)];
 if(method==='filter')return [failure(sameTab),failure(sameTab),failure('locator.filter has requires a PlaywrightLocator'),failure('locator.filter hasNot requires a PlaywrightLocator'),failure('locator.filter visible must be a boolean'),success([1,2])];
 if(method==='locator')return [failure(sameTab),failure(sameTab),failure('locator.filter has requires a PlaywrightLocator'),failure('locator.filter hasNot requires a PlaywrightLocator'),failure('locator.locator requires a selector'),success([1,2])];
 if(method==='all')return [success({before:['Click','','click',null],cached:'',after:'recorded'})];
 if(method==='click')return [diagnostic(sampling,'strict mode violation: multiple elements')];
 return [diagnostic(empty,'timed out waiting for visible')];
}

test('augmentation adds only source-required locator contracts without changing the input scenarios',()=>{
 const originals=[...methods.map(m=>scenario(m)),scenario('getbyrole'),{id:'api/unrelated',cells:[],assert:()=>({ok:true})}];
 const cells=originals.map(s=>s.cells),checks=originals.map(s=>s.assert);
 const result=augmentLocatorContracts(originals);
 assert.notEqual(result,originals);assert.deepEqual(result.map(s=>s.id),originals.map(s=>s.id));
 for(const [i,method] of methods.entries()){
  assert.deepEqual(result[i].cells.slice(1).map(c=>c.label),labels[method].map(l=>'locator-contract-'+l));
  assert.equal(result[i].cells[0],cells[i][0]);assert.deepEqual(result[i].setup,originals[i].setup);
  assert.deepEqual(originals[i].cells,cells[i]);assert.equal(originals[i].assert,checks[i]);
  assert.ok(result[i].cells.slice(1).every(c=>c.raw===true));
 }
 assert.equal(result.at(-2),originals.at(-2));assert.equal(result.at(-1),originals.at(-1));
});

test('wrapper slices raw base results and timings, retains every named field and awaits the base verdict',async()=>{
 const base=success('base'),sentinel={getFixtureState:()=>{},fixtureState:{events:[]},service:'cua',host:'vendor',other:{preserved:true}};
 const baseVerdict={ok:false,reason:'base failed',detail:'retain'};let seen;
 const [s]=augmentLocatorContracts([scenario('and',async input=>{await Promise.resolve();seen=input;return input.fixtureState.fail?baseVerdict:{ok:true};})]);
 const results=[base,...expected('and')],before=structuredClone(results),timings=[17,19,23];
 assert.deepEqual(await s.assert({...sentinel,results,timings}),{ok:true});
 assert.deepEqual(seen.results,[base]);assert.equal(seen.results[0],base);assert.deepEqual(seen.timings,[17]);
 for(const key of Object.keys(sentinel))assert.equal(seen[key],sentinel[key],key);
 assert.deepEqual(results,before);assert.deepEqual(timings,[17,19,23]);
 assert.equal(await s.assert({...sentinel,fixtureState:{fail:true},results,timings}),baseVerdict);
});

test('assertions require every appended observation and reject arbitrary errors, MCP errors, bad markers and wrong fixture values',async()=>{
 for(const method of methods){
  const s=augmented(method),results=[success('base'),...expected(method)];
  assert.equal((await s.assert({results})).ok,true,method);
  for(const shortened of [results.slice(0,-1),[...results,success(null)]])assert.equal((await s.assert({results:shortened})).ok,false,method);
  for(let i=1;i<results.length;i++)for(const bad of [success(null),failure('method not implemented'),{isError:true,content:[{type:'text',text:sameTab}]},{content:[{type:'text',text:'no marker'}]}]){
   const broken=results.slice();broken[i]=bad;assert.equal((await s.assert({results:broken})).ok,false,`${method}/${i}`);
  }
 }
 for(const method of ['and','or','filter','locator']){
  const results=[success('base'),...expected(method)];results[1]=failure('prefix '+sameTab);
  assert.equal((await augmented(method).assert({results})).ok,false,`${method}: exact source sentence`);
 }
});

test('diagnostic oracles check all source fields, sample cap, text truncation, classification and action context',async()=>{
 assert.equal(longText.length,120);
 for(const [method,original,description] of [['click',sampling,'strict mode violation'],['waitfor',empty,'timeout']]){
  const s=augmented(method),check=diag=>s.assert({results:[success('base'),diagnostic(diag,description)]});
  for(const key of Object.keys(original)){
   const changed=structuredClone(original);delete changed[key];assert.equal((await check(changed)).ok,false,`${method}/${key}`);
  }
  if(method==='click')for(const changed of [
   {...sampling,matches:sampling.matches.slice(1)},
   {...sampling,matches:[{...sampling.matches[0],text:longText+'x'},...sampling.matches.slice(1)]},
   {...sampling,matches:[{...sampling.matches[0],disabled:true},...sampling.matches.slice(1)]},
  ])assert.equal((await check(changed)).ok,false);
  const missingContext=failure(`Error: ${description}\nLocator diagnostics: ${JSON.stringify(original)}`);
  assert.equal((await s.assert({results:[success('base'),missingContext]})).ok,false);
  const malformed=failure(`waiting on click for selector ${original.locator}\nLocator diagnostics: {`);
  assert.equal((await s.assert({results:[success('base'),malformed]})).ok,false);
 }
});

async function runCell(c,globals={}){
 const content=[],context=vm.createContext({...globals,nodeRepl:{...globals.nodeRepl,write:text=>content.push({type:'text',text}),emitImage:async()=>{throw new Error('Unexpected image');}}});
 await vm.runInContext(`(async()=>{${c.code}\n})()`,context,{timeout:1000});
 return {result:{content},parsed:parseCell({content}),context};
}

// Narrow boundary double for the vendor's synchronous class/tab checks at :7330-7383,7463-7469.
function crossTabBoundary({gotoFails=false,closeFails=false,refuse=true,onGuard=()=>{}}={}){
 const calls=[];
 class Locator{
  constructor(owner,selector){this.owner=owner;this.selector=selector;}
  compatible(other){onGuard();assert.ok(other instanceof Locator);if(refuse&&other.owner!==this.owner)throw new Error(sameTab);}
  and(other){calls.push('and');this.compatible(other);return this;}
  or(other){calls.push('or');this.compatible(other);return this;}
  filter(options={}){for(const key of ['has','hasNot'])if(options[key]!==undefined){calls.push('filter.'+key);this.compatible(options[key]);}return this;}
  locator(selector,options){calls.push('locator');return new Locator(this.owner,selector).filter(options);}
 }
 const tab={id:'fixture-tab',playwright:{locator:selector=>new Locator('fixture',selector)}};
 const scratch={id:'scratch-tab',playwright:{locator:selector=>new Locator('scratch',selector)},goto:async url=>{calls.push(['goto',url]);if(gotoFails)throw new Error('navigation failed');},close:async()=>{calls.push('close');if(closeFails)throw new Error('close failed');}};
 return {calls,tab,browser:{tabs:{new:async()=>{calls.push('new');return scratch;},get:()=>{throw new Error('must not borrow an existing tab');},list:()=>{throw new Error('must not borrow an existing tab');}}},fixtureURL:'http://fixture'};
}

test('all cross-tab cells create an actual scratch handle and close it in finally, including navigation/refusal failures',async()=>{
 for(const method of ['and','or','filter','locator'])for(const label of labels[method].filter(l=>l.startsWith('cross-tab'))){
  const boundary=crossTabBoundary(),{parsed,context}=await runCell(cell(method,label),boundary);
  assert.deepEqual(parsed,{ok:false,error:{code:'Error',message:sameTab}});
  assert.equal(boundary.calls[0],'new');assert.deepEqual(boundary.calls[1],['goto','http://fixture/read.html']);assert.equal(boundary.calls.at(-1),'close');
  assert.equal(context.scratch,undefined);assert.equal(context.tab,boundary.tab);
  for(const flag of ['gotoFails','closeFails']){
   const failed=crossTabBoundary({[flag]:true}),result=await runCell(cell(method,label),failed);
   assert.equal(result.parsed.ok,false);assert.equal(result.parsed.error.message,flag==='gotoFails'?'navigation failed':'close failed');assert.equal(failed.calls.at(-1),'close');
  }
  const broken=crossTabBoundary({refuse:false}),observed=await runCell(cell(method,label),broken);
  assert.equal(observed.parsed.ok,true);
  const rows=[success('base'),...expected(method)],position=augmented(method).cells.findIndex(c=>c.label===cell(method,label).label);rows[position]=observed.result;
  assert.equal((await augmented(method).assert({results:rows})).ok,false);
 }
});

test('collection cache cell exercises independent relative keys, external-action staleness and shared local-action invalidation',async()=>{
 const calls=[];let text='',cache=new Map();
 const result={textContent:async()=>{calls.push('result.text');if(!cache.has('result'))cache.set('result',text);return cache.get('result');}};
 const trigger={textContent:async()=>{calls.push('trigger.text');return 'Click';},getAttribute:async key=>{calls.push(['attribute',key]);return key==='id'?'click':null;},click:async()=>{calls.push('cached.click');cache.clear();text='recorded';}};
 const body={locator:selector=>{calls.push(['relative',selector]);return selector==='#click'?trigger:result;}};
 const direct={click:async()=>{calls.push('external.click');text='recorded';},filter:()=>direct,waitFor:async()=>{calls.push('wait');assert.equal(text,'recorded');}};
 const scratch={goto:async url=>calls.push(['goto',url]),close:async()=>calls.push('close'),playwright:{locator:selector=>{calls.push(['locator',selector]);return selector==='body'?{all:async()=>[body]}:direct;}}};
 const observed=await runCell(cell('all','collection-cache'),{fixtureURL:'http://fixture',browser:{tabs:{new:async()=>{calls.push('new');return scratch;}}}});
 assert.deepEqual(observed.parsed,{ok:true,value:{before:['Click','','click',null],cached:'',after:'recorded'}});
 assert.ok(calls.indexOf('external.click')<calls.indexOf('cached.click'));assert.equal(calls.filter(c=>c==='result.text').length,3);assert.equal(calls.at(-1),'close');
 assert.equal((await augmented('all').assert({results:[success('base'),observed.result]})).ok,true);
 const stale=success({before:['Click','','click',null],cached:'',after:''});
 assert.equal((await augmented('all').assert({results:[success('base'),stale]})).ok,false);
});

test('every supplemental browser cell is a complete parsable raw MCP envelope',()=>{
 for(const method of methods)for(const c of extras(method)){assert.equal(c.raw,true);parseModule(c.code,{next:true});}
});

const boundaryId='api/browser-playwrightapi/elementinfo';
const boundaryScenario=check=>({...scenario('all',check),id:boundaryId,backend:'capability-host',boundaryProof:'real-service+boundary-double'});
const boundary=()=>augmentCapabilityLocatorContracts([boundaryScenario()])[0];
const boundaryCell=label=>{const found=boundary().cells.find(c=>c.label==='locator-boundary-'+label);assert.ok(found,label);return found;};
const wire=(type,extra={})=>({type,browser_id:'$browser',tab_id:'$tab',...extra});
const read=(relative,timeout)=>wire('playwright_locator_read_all',{selector:'.row',...(relative?{relative_selector:relative}:{}),timeout_ms:timeout,client_timeout_ms:timeout});
const cacheObservation={
 initial:['Alpha','Beta inner','b',null],failed:{rejected:true,message:'transport send returned empty response'},retried:['Child Alpha','Child Beta inner'],rootStill:'Alpha',after:['Changed Beta','Changed Alpha'],
 commands:[wire('playwright_locator_count',{selector:'.row'}),read(undefined,66),read('.child',77),read('.child',77),wire('playwright_locator_click',{selector:'.row >> nth=0',timeout_ms:88,client_timeout_ms:88}),read(undefined,99),read('.child',100)],
};
const crossObservation={distinct:true,errors:Array.from({length:6},()=>({rejected:true,message:sameTab})),commands:[],created:[{type:'create_tab',browser_id:'$browser'}],cleanup:[{type:'close_tab',browser_id:'$browser',tab_id:'$scratch'}]};
const boundaryPayload={matchCount:1,visibleCount:1,matches:[match('button','Target')]};
const boundaryDiag={kind:'action_failed',action:'click',locator:'.row',matchCount:1,matches:[{ariaLabel:null,disabled:false,role:null,tag:'button',text:'Target',type:null,visible:true}],visibleCount:1,truncated:false};
const diagnosticObservation={error:{rejected:true,message:'transport send returned empty response\nwaiting on click for selector .row\nLocator diagnostics: '+JSON.stringify(boundaryDiag)},commands:[wire('playwright_locator_click',{selector:'.row',timeout_ms:88,client_timeout_ms:88}),wire('playwright_evaluate',{selector:'.row',selector_mode:'all',timeout_ms:1000,client_timeout_ms:1000,scriptPresent:true})]};
const boundaryResults=()=>[success('base'),success(crossObservation),success(cacheObservation),success(diagnosticObservation)];

test('capability augmentation attaches no-dispatch, cache lifecycle and diagnostic observations to the existing selected-client case',async()=>{
 const original=boundaryScenario(),other=scenario('and');const [s,untouched]=augmentCapabilityLocatorContracts([original,other]);
 assert.equal(untouched,other);assert.equal(original.cells.length,1);assert.equal(s.backend,'capability-host');assert.equal(s.boundaryProof,'real-service+boundary-double');
 assert.deepEqual(s.cells.slice(1).map(c=>c.label),['locator-boundary-cross-tab','locator-boundary-cache-lifecycle','locator-boundary-action-diagnostics']);
 for(const c of s.cells.slice(1)){assert.equal(c.raw,true);parseModule(c.code,{next:true});}
 assert.equal((await s.assert({results:boundaryResults()})).ok,true);
 for(let i=1;i<4;i++){const broken=boundaryResults();broken[i]=success(null);assert.equal((await s.assert({results:broken})).ok,false);}
});

test('capability assertion slices all original cells/timings without removing raw MCP fields or caller context',async()=>{
 let seen;const original=boundaryScenario(async input=>{seen=input;return {ok:true};});original.cells.push({label:'second',code:'0'});
 const s=augmentCapabilityLocatorContracts([original])[0],results=[success('one'),success('two'),...boundaryResults().slice(1)],snapshot=structuredClone(results),other={opaque:true};
 assert.equal((await s.assert({results,timings:[1,2,3,4,5],other})).ok,true);
 assert.deepEqual(seen.results,results.slice(0,2));assert.equal(seen.results[1],results[1]);assert.deepEqual(seen.timings,[1,2]);assert.equal(seen.other,other);assert.deepEqual(results,snapshot);
});

test('capability oracle rejects dispatched cross-tab guards and every missing cache phase or command',async()=>{
 const s=boundary();
 for(const change of [v=>v[1].commands.push(wire('playwright_locator_count',{selector:'.row'})),v=>v[1].errors[0].message+=' extra',v=>v[1].distinct=false,v=>v[1].cleanup=[],v=>v[2].commands.splice(3,1),v=>v[2].commands.push(read('.child',77)),v=>v[2].after[0]='Beta',v=>v[2].failed.rejected=false,v=>v[2].retried[0]='Alpha']){
  const values=[null,structuredClone(crossObservation),structuredClone(cacheObservation),structuredClone(diagnosticObservation)];change(values);
  assert.equal((await s.assert({results:[success('base'),...values.slice(1).map(success)]})).ok,false);
 }
});

test('diagnostic boundary oracle requires exact text and dispatch while rejecting absent script evidence',async()=>{
 const s=boundary();
 for(const change of [v=>v.error.message='unrelated\nLocator diagnostics: '+JSON.stringify(boundaryDiag),v=>v.commands[1].timeout_ms=999,v=>delete v.commands[1].client_timeout_ms,v=>v.commands[1].scriptPresent=false,v=>delete v.commands[1].scriptPresent,v=>v.commands[1].script='unstable script leaked',v=>v.commands.pop()]){
  const changed=structuredClone(diagnosticObservation);change(changed);const results=boundaryResults();results[3]=success(changed);
  assert.equal((await s.assert({results})).ok,false);
 }
});

// Local boundary model, only the vendor's collection lifecycle at :7063-7139,7447-7513.
// The worker is never loaded: fixtures script transport values, and mutations deliberately break lifecycle rules.
async function exerciseCache({reuse=true,evict=true,invalidate=true}={}){
 const service=createCapabilityOracleService({handleRpc:async()=>{throw Error('No live service');}});
 const rpc=(_name,request)=>service.handleRpc(request);
 const send=async command=>{const value=await rpc('browser',{method:'execute',params:command});if(value==null)throw Error('transport send returned empty response');return value;};
 const command=(type,extra={})=>({type,browser_id:'fixture',tab_id:'7',...extra});
 class Locator{
  constructor(selector,cache,index,relative){this.selector=selector;this.cache=cache;this.index=index;this.relative=relative;}
  locator(selector){return new Locator(this.selector+' >> '+selector,this.cache,this.index,selector);}
  async all(){const {count}=await send(command('playwright_locator_count',{selector:this.selector})),cache=new Map();return Array.from({length:count},(_,i)=>new Locator(this.selector+' >> nth='+i,cache,i));}
  async read(timeoutMs){const key=this.relative??'';let promise=reuse&&this.cache.get(key);if(!promise){promise=send(command('playwright_locator_read_all',{selector:'.row',...(this.relative?{relative_selector:this.relative}:{}),...(timeoutMs?{timeout_ms:timeoutMs,client_timeout_ms:timeoutMs}:{})})).then(v=>v.values);if(evict)promise=promise.catch(error=>{this.cache.delete(key);throw error;});this.cache.set(key,promise);}return (await promise)[this.index];}
  async textContent({timeoutMs}={}){return (await this.read(timeoutMs)).text_content;}
  async innerText({timeoutMs}={}){return (await this.read(timeoutMs)).inner_text;}
  async getAttribute(name){return (await this.read()).attributes[name]??null;}
  async click({timeoutMs}={}){await send(command('playwright_locator_click',{selector:this.selector,timeout_ms:timeoutMs,client_timeout_ms:timeoutMs}));if(invalidate)this.cache.clear();}
 }
 const browser={browserId:'fixture'},tab={id:'7',playwright:{locator:selector=>new Locator(selector)}};
 return runCell(boundaryCell('cache-lifecycle'),{browser,tab,nodeRepl:{rpc},__boot:async()=>{await rpc('browser',{method:'oracle.configure',params:{mode:'boundary-double'}});},__trace:()=>rpc('browser',{method:'oracle.trace'}),__command:cmd=>Object.fromEntries(Object.entries(cmd).map(([k,v])=>[k,k==='browser_id'?'$browser':k==='tab_id'?'$tab':v]))});
}

test('actual cache lifecycle supplemental cell detects disabled reuse, failed-read eviction and action invalidation',async()=>{
 const s=boundary(),good=await exerciseCache();assert.deepEqual(good.parsed,{ok:true,value:cacheObservation});
 const results=boundaryResults();results[2]=good.result;assert.equal((await s.assert({results})).ok,true);
 for(const mutation of ['reuse','evict','invalidate']){
  const broken=await exerciseCache({[mutation]:false}),rows=boundaryResults();rows[2]=broken.result;
  assert.equal((await s.assert({results:rows})).ok,false,mutation);
 }
});

async function exerciseBoundaryCross({dispatch=false}={}){
 const service=createCapabilityOracleService({handleRpc:async()=>{throw Error('No live service');}});
 const rpc=(_name,request)=>service.handleRpc(request),command=(type,extra={})=>({type,browser_id:'fixture',...extra});
 const globals=crossTabBoundary({onGuard:()=>{if(dispatch)void rpc('browser',{method:'execute',params:command('playwright_locator_count',{tab_id:'fixture-tab',selector:'.row'})});}});
 globals.browser.browserId='fixture';
 const create=globals.browser.tabs.new;
 globals.browser.tabs.new=async()=>{
  const info=await rpc('browser',{method:'execute',params:command('create_tab')}),scratch=await create();scratch.id=info.id;
  scratch.close=async()=>{await rpc('browser',{method:'execute',params:command('close_tab',{tab_id:scratch.id})});};
  return scratch;
 };
 return runCell(boundaryCell('cross-tab'),{...globals,nodeRepl:{rpc},__boot:async()=>{
  await rpc('browser',{method:'oracle.configure',params:{mode:'boundary-double'}});
  await rpc('browser',{method:'oracle.reply',params:{type:'playwright_locator_count',value:{count:1}}});
 },__trace:()=>rpc('browser',{method:'oracle.trace'}),__command:cmd=>Object.fromEntries(Object.entries(cmd).map(([k,v])=>[k,k==='browser_id'?'$browser':k==='tab_id'&&v===globals.tab.id?'$tab':v]))});
}

test('actual boundary cross-tab supplemental cell excludes setup/cleanup dispatch and rejects a guard that dispatches before refusing',async()=>{
 const good=await exerciseBoundaryCross();assert.deepEqual(good.parsed,{ok:true,value:crossObservation});
 const rows=boundaryResults();rows[1]=good.result;assert.equal((await boundary().assert({results:rows})).ok,true);
 const broken=await exerciseBoundaryCross({dispatch:true});assert.equal(broken.parsed.value.commands.length,6);
 rows[1]=broken.result;assert.equal((await boundary().assert({results:rows})).ok,false);
});

// The trusted-service JSON reply follows Rust serde's recursive object-key ordering;
// model that wire boundary before the selected client spreads the diagnostic value.
const serviceWire=value=>Array.isArray(value)?value.map(serviceWire):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,serviceWire(item)])):value;

async function exerciseBoundaryDiagnostic({diagnose=true,script='return vendorProjection(elements);'}={}){
 const service=createCapabilityOracleService({handleRpc:async()=>{throw Error('No live service');}}),rpc=async(_name,request)=>serviceWire(await service.handleRpc(request));
 const send=async params=>{const value=await rpc('browser',{method:'execute',params});if(value==null)throw Error('transport send returned empty response');return value;};
 const command=(type,extra)=>({type,browser_id:'fixture',tab_id:'7',...extra});
 const tab={id:'7',playwright:{locator:selector=>({click:async({timeoutMs})=>{
  try{await send(command('playwright_locator_click',{selector,timeout_ms:timeoutMs,client_timeout_ms:timeoutMs}));}
  catch(error){if(!diagnose)throw error;const {value}=await send(command('playwright_evaluate',{selector,selector_mode:'all',script,timeout_ms:1000,client_timeout_ms:1000}));
   throw Error(error.message+'\nwaiting on click for selector '+selector+'\nLocator diagnostics: '+JSON.stringify({kind:'action_failed',action:'click',locator:selector,...value,truncated:value.matchCount>value.matches.length}));}
 }})}};
 return runCell(boundaryCell('action-diagnostics'),{tab,nodeRepl:{rpc},__boot:()=>rpc('browser',{method:'oracle.configure',params:{mode:'boundary-double'}}),__trace:()=>rpc('browser',{method:'oracle.trace'}),__command:cmd=>Object.fromEntries(Object.entries(cmd).map(([k,v])=>[k,k==='browser_id'?'$browser':k==='tab_id'?'$tab':v]))});
}

test('actual diagnostic supplemental cell drives a transport rejection, then captures diagnostic dispatch and appended source text',async()=>{
 const good=await exerciseBoundaryDiagnostic();assert.deepEqual(good.parsed,{ok:true,value:diagnosticObservation});
 const rows=boundaryResults();rows[3]=good.result;assert.equal((await boundary().assert({results:rows})).ok,true);
 const broken=await exerciseBoundaryDiagnostic({diagnose:false});assert.equal(broken.parsed.value.error.message,'transport send returned empty response');
 rows[3]=broken.result;assert.equal((await boundary().assert({results:rows})).ok,false);
});


test('authored diagnostic observation omits minifier-dependent bytes, retains all non-script fields and rejects empty scripts',async()=>{
 const vendor=await exerciseBoundaryDiagnostic({script:'const fn=e=>e.length; return fn(elements);'});
 const own=await exerciseBoundaryDiagnostic({script:'const projector = nodes => nodes.length; return projector(elements);'});
 assert.deepEqual(vendor.result,own.result);
 assert.deepEqual(vendor.parsed.value.commands[1],wire('playwright_evaluate',{selector:'.row',selector_mode:'all',timeout_ms:1000,client_timeout_ms:1000,scriptPresent:true}));
 assert.equal(Object.hasOwn(vendor.parsed.value.commands[1],'script'),false);
 for(const script of ['',undefined]){
  const observed=await exerciseBoundaryDiagnostic({script:script===undefined?null:script});
  assert.equal(observed.parsed.value.commands[1].scriptPresent,false);
  const rows=boundaryResults();rows[3]=observed.result;assert.equal((await boundary().assert({results:rows})).ok,false);
 }
});


test('diagnostic exact text pins observed host ordering rather than treating reordered JSON as equivalent',async()=>{
 const observed='transport send returned empty response\nwaiting on click for selector .row\nLocator diagnostics: {"kind":"action_failed","action":"click","locator":".row","matchCount":1,"matches":[{"ariaLabel":null,"disabled":false,"role":null,"tag":"button","text":"Target","type":null,"visible":true}],"visibleCount":1,"truncated":false}';
 assert.equal(diagnosticObservation.error.message,observed);
 const s=boundary(),good=boundaryResults();assert.equal((await s.assert({results:good})).ok,true);
 const unsorted=structuredClone(diagnosticObservation);
 unsorted.error.message='transport send returned empty response\nwaiting on click for selector .row\nLocator diagnostics: '+JSON.stringify({kind:'action_failed',action:'click',locator:'.row',...boundaryPayload,truncated:false});
 const broken=boundaryResults();broken[3]=success(unsorted);assert.equal((await s.assert({results:broken})).ok,false);
});
