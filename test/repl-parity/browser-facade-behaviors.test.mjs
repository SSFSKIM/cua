// No Chrome, installed runtime or native helper is launched by these adapter/oracle unit tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseModule} from 'meriyah';
import scenarios from './scenarios/browser-facade-behaviors.mjs';
import {caseSchedule,validateRegistry} from '../../scripts/repl-parity/registry.mjs';
import {RESULT_MARKER,parseCell} from '../../scripts/browser-parity/runner.mjs';

const ids=['api/decorated-tab/paste','api/decorated-tab/presskey','api/decorated-tab/typetext','cells/facade/emit-false-state','cells/facade/emit-false-screenshot','cells/facade/emit-false-combined','cells/facade/dom-only-input-refusal'];
const domError='This tab does not support accessibility input. Use its Playwright API.';
const inputError='Browser input requires an element index from the latest AX snapshot, or null to use current focus.';
const raw=value=>({isError:false,content:[{type:'text',text:RESULT_MARKER+JSON.stringify({ok:true,value,$imageCount:0})}]});
const find=id=>{const s=scenarios.find(s=>s.id===id);assert.ok(s,id);return s;};
const empty={counter:0,events:[]};
const expected=id=>id.endsWith('emit-false-state')?{axAbsent:true,string:true,fixture:true,snapshotMatches:true,heading:'Read fixture'}:
 id.endsWith('emit-false-screenshot')?{axAbsent:true,bytes:true,nonempty:true,image:true,baselineMatches:true,caption:'Parity screenshot'}:
 id.endsWith('emit-false-combined')?{axAbsent:true,state:true,fixture:true,snapshotMatches:true,bytes:true,nonempty:true,image:true,baselineMatches:true,heading:'Read fixture'}:
 {axAbsent:true,focused:true,before:'',after:'',errors:id==='cells/facade/dom-only-input-refusal'?Array(9).fill(domError):[domError,domError,...Array(6).fill(inputError)]};

test('seven facade obligations use real Chrome on both platforms with exact schedule contracts',()=>{
 assert.deepEqual(scenarios.map(s=>s.id).sort(),[...ids].sort());validateRegistry(scenarios);
 const plan=new Map(caseSchedule().map(c=>[c.id,c]));
 for(const s of scenarios){
  assert.deepEqual(s.platforms,['darwin','linux']);assert.deepEqual(s.contracts,plan.get(s.id).contracts);
  assert.equal(s.backend,'chrome');assert.equal(s.browserCase,true);assert.equal(s.setup.open,'goto');
  assert.equal(s.cells.length,1);assert.equal(s.cells[0].raw,true);parseModule(s.cells[0].code,{next:true});
  if(/screenshot|combined/.test(s.id))assert.equal(s.imageMode,'live');
 }
});

test('each independent oracle accepts its complete fixture observation and rejects wrong returns or side effects',async()=>{
 for(const id of ids){
  const s=find(id),results=[raw(expected(id))];
  assert.deepEqual(await s.assert({results,fixtureState:empty}),{ok:true},id);
  assert.equal((await s.assert({results:[raw(null)],fixtureState:empty})).ok,false,id);
  assert.equal((await s.assert({results:[],fixtureState:empty})).ok,false,id);
  if(/decorated-tab|input-refusal/.test(id))assert.equal((await s.assert({results,fixtureState:{events:[{text:'unexpected input'}]}})).ok,false,id);
 }
});

test('emit:false oracles reject leaked state, image items, extra markers and successful MCP errors',async()=>{
 for(const id of ids.filter(id=>id.includes('emit-false'))){
  const s=find(id),value=expected(id);
  for(const change of [
   r=>r.content.unshift({type:'text',text:'fixture automatic state'}),
   r=>{r.content[0].text='fixture automatic state'+r.content[0].text;},
   r=>r.content.push({type:'image',mimeType:'image/jpeg',data:'leaked-image'}),
   r=>r.content.push({...r.content[0]}),
   r=>{r.isError=true;},
  ]){const result=raw(value);change(result);assert.equal((await s.assert({results:[result],fixtureState:empty})).ok,false,id);}
 }
});

// Test our generated raw cells using a fixture handle, not a browser backend or a replacement parity subject.
async function exercise(scenario,tab){
 const content=[];
 const nodeRepl={write:text=>content.push({type:'text',text}),emitImage:async()=>content.push({type:'image',mimeType:'image/jpeg',data:'unexpected'})};
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 await new AsyncFunction('tab','nodeRepl',scenario.cells[0].code)(tab,nodeRepl);
 return {isError:false,content};
}
const snapshot='- heading "Read fixture"\n- paragraph: Alpha\n- paragraph: Beta\n- button "Enabled"';
const image=new Uint8Array(readFileSync(new URL('./fixtures/pattern.jpeg',import.meta.url)));
function observationTab({plainBytes=false,wrongState=false}={}){
 const bytes=()=>plainBytes?Array.from(image):new Uint8Array(image);
 return {ax:undefined,playwright:{domSnapshot:async()=>snapshot,locator:()=>({textContent:async()=>'Read fixture'})},screenshot:async()=>new Uint8Array(image),
  getAXState:async()=>wrongState?'wrong fixture':snapshot,getScreenshot:async()=>bytes(),getAXStateAndScreenshot:async()=>({state:wrongState?'wrong fixture':snapshot,screenshot:bytes()})};
}

test('state and combined raw cells use the fixture snapshot and returned image type, not merely callable methods',async()=>{
 for(const tail of ['state','combined']){
  const s=find('cells/facade/emit-false-'+tail);
  const result=await exercise(s,observationTab());
  assert.equal((await s.assert({results:[result],fixtureState:empty})).ok,true);
  const wrong=await exercise(s,observationTab({wrongState:true}));assert.equal((await s.assert({results:[wrong],fixtureState:empty})).ok,false);
 }
 const s=find('cells/facade/emit-false-combined'),plain=await exercise(s,observationTab({plainBytes:true}));
 assert.equal((await s.assert({results:[plain],fixtureState:empty})).ok,false);
});

test('screenshot raw cell validates Uint8Array JPEG bytes and safe fixture caption without emitting an image',async()=>{
 const s=find('cells/facade/emit-false-screenshot'),tab=observationTab();tab.playwright.locator=()=>({textContent:async()=>'Parity screenshot'});
 const result=await exercise(s,tab);assert.equal((await s.assert({results:[result],fixtureState:empty})).ok,true);
 assert.equal(result.content.length,1);assert.equal(result.content[0].type,'text');assert.equal(parseCell(result).value.bytes,true);
 tab.getScreenshot=async()=>new Uint8Array([1,2,3]);const invalid=await exercise(s,tab);assert.equal((await s.assert({results:[invalid],fixtureState:empty})).ok,false);
});

test('decorated input raw cells invoke both valid focus/index inputs and reject invalid targets before DOM-only input',async()=>{
 for(const method of ['paste','pressKey','typeText']){
  const id='api/decorated-tab/'+method.toLowerCase(),s=find(id),calls=[];
  const tab={ax:undefined,playwright:{locator:()=>({click:async()=>{},evaluate:async()=>''}),evaluate:async()=>true}};
  tab[method]=async(...args)=>{calls.push(args);const index=args[0];if(index!==null&&(!Number.isInteger(index)||index<0))throw new Error(inputError);throw new Error(domError);};
  const result=await exercise(s,tab);assert.equal(calls.length,8,method);assert.equal(calls[0][0],0);assert.equal(calls[1][0],null);
  assert.equal((await s.assert({results:[result],fixtureState:empty})).ok,true,method);
  const bad=raw({...parseCell(result).value,errors:Array(8).fill(domError)});assert.equal((await s.assert({results:[bad],fixtureState:empty})).ok,false,method);
 }
});

test('DOM-only refusal raw cell invokes all nine decorated methods with their real signatures',async()=>{
 const s=find('cells/facade/dom-only-input-refusal'),calls=[];
 const tab={ax:undefined,playwright:{locator:()=>({click:async()=>{},evaluate:async()=>''}),evaluate:async()=>true}};
 for(const method of ['click','drag','scroll','selectText','setValue','performSecondaryAction','paste','pressKey','typeText']){
  tab[method]=(...args)=>{calls.push([method,args]);throw new Error(domError);};
 }
 const result=await exercise(s,tab);
 assert.deepEqual(calls,[['click',[0]],['drag',[[1,2],[3,4]]],['scroll',[0,'down',1]],['selectText',[0,'text']],['setValue',[0,'value']],['performSecondaryAction',[0,'menu']],['paste',[null,'text']],['pressKey',[null,'ENTER']],['typeText',[null,'text']]]);
 assert.equal((await s.assert({results:[result],fixtureState:empty})).ok,true);
 const before=structuredClone(result);await s.assert({results:[result],fixtureState:empty});assert.deepEqual(result,before);
 tab.typeText=()=>{};const unrefused=await exercise(s,tab);assert.equal((await s.assert({results:[unrefused],fixtureState:empty})).ok,false);
});
