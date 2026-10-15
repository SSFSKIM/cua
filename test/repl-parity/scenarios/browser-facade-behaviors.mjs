// Cross-platform decorated-tab obligations run on the real DOM-only Chrome tab, not the native binder double.
// Source: readable chatgpt-26.928.40906/cua_node/@oai/cua/dist/lib/js/oai_js_cua/src/
// tinysky_alt/bind_tab.js:4-108 and core/display.js:3-25. Setup output is discarded by browser-api.mjs.
import {isDeepStrictEqual} from 'node:util';
import {caseSchedule,validateRegistry} from '../../../scripts/repl-parity/registry.mjs';
import {cellCode,parseCell,RESULT_MARKER} from '../../../scripts/browser-parity/runner.mjs';

const plan=new Map(caseSchedule().map(c=>[c.id,c])),scenarios=[];
const domError='This tab does not support accessibility input. Use its Playwright API.';
const inputError='Browser input requires an element index from the latest AX snapshot, or null to use current focus.';
function add(id,page,code,expected,{image=false}={}) {
 const scheduled=plan.get(id);if(!scheduled)throw new Error(`Unknown facade obligation ${id}`);
 scenarios.push({...scheduled,backend:'chrome',browserCase:true,setup:{page,state:{},open:'goto'},
  ...(image?{imageMode:'live'}:{}),cells:[{label:'exercise',raw:true,code:cellCode({code})}],
  assert({results,fixtureState}) {
   try {
    if(results.length!==1)return {ok:false,reason:'unexpected cell count'};
    const raw=results[0],row=parseCell(raw);
    // emit:false must suppress both state text and images. A success marker alone is not sufficient.
    const canonical=RESULT_MARKER+JSON.stringify({...row,$imageCount:0});
    if(!row.ok||raw.content?.length!==1||raw.content[0].type!=='text'||raw.content[0].text!==canonical)return {ok:false,reason:'unexpected automatic output or cell error'};
    if(!isDeepStrictEqual(row.value,expected))return {ok:false,reason:'incorrect facade result'};
    if(!Array.isArray(fixtureState?.events)||fixtureState.events.length!==0)return {ok:false,reason:'fixture input was mutated'};
    return {ok:true};
   }catch(error){return {ok:false,reason:error.message};}
  },
 });
}

// A focused fixture field makes accidental focus-directed input observable, without exposing owner tabs or text.
const focus=`const axAbsent=tab.ax===undefined;
await tab.playwright.locator('#text').click();
const focused=await tab.playwright.evaluate('document.activeElement.id === "text"');
const before=await tab.playwright.locator('#text').evaluate(e=>e.value);
const errors=[];`;
const take=calls=>`for(const call of [${calls.map(call=>`()=>tab.${call}`).join(',')}]){try{await call();errors.push(null);}catch(error){errors.push(error.message);}}
const after=await tab.playwright.locator('#text').evaluate(e=>e.value);
return {axAbsent,focused,before,after,errors};`;
for(const [id,method,value] of [['paste','paste','paste fixture'],['presskey','pressKey','ENTER'],['typetext','typeText','typed fixture']]) {
 const call=index=>`${method}(${index},${JSON.stringify(value)}${method==='paste'?",{format:'html'}":''})`;
 const calls=['0','null','-1','0.5','"0"','undefined','NaN','{}'].map(call);
 add(`api/decorated-tab/${id}`,'/controls.html',focus+take(calls),
  {axAbsent:true,focused:true,before:'',after:'',errors:[domError,domError,...Array(6).fill(inputError)]});
}
const refused=['click(0)','drag([1,2],[3,4])',"scroll(0,'down',1)","selectText(0,'text')","setValue(0,'value')","performSecondaryAction(0,'menu')","paste(null,'text')","pressKey(null,'ENTER')","typeText(null,'text')"];
add('cells/facade/dom-only-input-refusal','/controls.html',focus+take(refused),
 {axAbsent:true,focused:true,before:'',after:'',errors:Array(refused.length).fill(domError)});

// The pinned screenshot contract is JPEG. Validate returned Uint8Array data against a direct capture, but emit
// only safe booleans: screenshot bytes and raw DOM snapshots never enter the MCP observation.
const imageCheck=`function imageSize(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<=100||bytes[0]!==255||bytes[1]!==216)return null;
 if(bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)return null;
 for(let offset=2;offset+9<bytes.length;){
  if(bytes[offset]!==255){offset++;continue;}
  const marker=bytes[offset+1];
  if(marker>=192&&marker<=207&&![196,200,204].includes(marker)){
   const height=bytes[offset+5]*256+bytes[offset+6],width=bytes[offset+7]*256+bytes[offset+8];
   return width>0&&height>0&&width*height<=40000000?{width,height}:null;
  }
  const length=bytes[offset+2]*256+bytes[offset+3];if(length<2)return null;offset+=2+length;
 }
 return null;
}
const baseline=imageSize(await tab.screenshot());`;
const stateCheck=`typeof state==='string'&&['Read fixture','Alpha','Beta','Enabled'].every(text=>state.includes(text))`;
add('cells/facade/emit-false-state','/read.html',`
const axAbsent=tab.ax===undefined;
const baseline=await tab.playwright.domSnapshot();
const state=await tab.getAXState({emit:false,disableDiffing:false});
const full=await tab.getAXState({emit:false,disableDiffing:true});
const heading=await tab.playwright.locator('h1').textContent();
return {axAbsent,string:typeof state==='string',fixture:${stateCheck},snapshotMatches:state===baseline&&full===baseline,heading};`,
 {axAbsent:true,string:true,fixture:true,snapshotMatches:true,heading:'Read fixture'});
add('cells/facade/emit-false-screenshot','/screenshot.html',imageCheck+`
const axAbsent=tab.ax===undefined;
const returned=await tab.getScreenshot({emit:false});
const size=imageSize(returned);
const caption=await tab.playwright.locator('p').textContent();
return {axAbsent,bytes:returned instanceof Uint8Array,nonempty:returned.byteLength>100,image:size!==null,baselineMatches:baseline!==null&&size!==null&&size.width===baseline.width&&size.height===baseline.height,caption};`,
 {axAbsent:true,bytes:true,nonempty:true,image:true,baselineMatches:true,caption:'Parity screenshot'},{image:true});
add('cells/facade/emit-false-combined','/read.html',imageCheck+`
const axAbsent=tab.ax===undefined;
const baselineState=await tab.playwright.domSnapshot();
const returned=await tab.getAXStateAndScreenshot({emit:false,disableDiffing:true});
const state=returned?.state,bytes=returned?.screenshot,size=imageSize(bytes);
const heading=await tab.playwright.locator('h1').textContent();
return {axAbsent,state:typeof state==='string',fixture:${stateCheck},snapshotMatches:state===baselineState,bytes:bytes instanceof Uint8Array,nonempty:bytes?.byteLength>100,image:size!==null,baselineMatches:baseline!==null&&size!==null&&size.width===baseline.width&&size.height===baseline.height,heading};`,
 {axAbsent:true,state:true,fixture:true,snapshotMatches:true,bytes:true,nonempty:true,image:true,baselineMatches:true,heading:'Read fixture'},{image:true});

export default validateRegistry(scenarios);
