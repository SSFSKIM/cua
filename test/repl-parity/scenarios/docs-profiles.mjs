// M3 independent document oracle: Table 3 applied to hash-pinned readable vendor documents.
// Chrome lane must be browser-only, using the prepared profile's @@INSTANCE_ID@@. No getState/openTabs or tab content
// is persisted. Named MCP content order relies on the independently proven raw-cell named-write contract.
import assert from 'node:assert/strict';
import {caseSchedule} from '../../../scripts/repl-parity/registry.mjs';
import {coreDocument,auxiliary,assertProfileObservation,assertSelectedBrowserDocument} from '../../../scripts/repl-parity/docs-oracle.mjs';
const plan=new Map(caseSchedule().map(c=>[c.id,c])),scenarios=[];
const done='nodeRepl.write("DOCS_DONE","docs.oracle");';
const select='let docsBrowser=await cua.getBrowser({extensionInstanceId:"@@INSTANCE_ID@@"});';
const first=select+done,rewrite='await cua.rewriteDocumentation();'+done;
function add(tail,cells,check){const id=`cells/${tail}`,entry=plan.get(id);assert.ok(entry,id);const normalized=cells.map((c,i)=>typeof c==='string'?{label:`cell-${i+1}`,code:c}:c);scenarios.push({...entry,backend:'chrome',cells:normalized,assert:context=>{assert.ok(['vendor','cua'].includes(context.host),'explicit observed host required');assert.equal(context.results.length,normalized.length,'missing or extra cell results');check(context);return {ok:true};}});}
function blocks(result){assert.equal(result.isError,false);assert.ok(Array.isArray(result.content));for(const item of result.content)assert.deepEqual(Object.keys(item).sort(),['text','type']);assert.ok(result.content.every(item=>item.type==='text'));return result.content.map(item=>item.text);}
function exact(result,texts){assert.deepEqual(blocks(result),texts);}
function browserText(result,{host,requestMeta}={}){const texts=blocks(result);assert.equal(texts[0],coreDocument({host,requestMeta}));assert.equal(texts.at(-1),'DOCS_DONE');assertSelectedBrowserDocument(texts[1],{auxiliary:true});return texts[1];}
function firstBrowser(result,context){const text=browserText(result,context);exact(result,[coreDocument(context),text,'DOCS_DONE']);return text;}
function inventoryState(text,browserDocument){
 const browsers=JSON.parse(text);assert.ok(Array.isArray(browsers));assert.ok(browsers.length>0);
 for(const browser of browsers){
  assert.ok(Object.keys(browser).every(key=>['id','name','type','family','profileName','metadata'].includes(key)),'browser state must not include tab titles/URLs');
  assert.equal(typeof browser.id,'string');assert.equal(typeof browser.name,'string');assert.ok(['extension','cdp'].includes(browser.type));
  if(browser.metadata)assert.ok(Object.keys(browser.metadata).every(key=>key==='extensionInstanceId'),'unexpected browser metadata');
 }
 const id=/^# Selected Browser\n- Name: [^\n]+\n- Type: [^\n]+\n- ID: ([^\n]+)/m.exec(browserDocument)?.[1];assert.ok(browsers.some(b=>b.id===id),'selected browser missing from state');
}
add('documentation/first-call-core-policy-bytes',[done],({results,host})=>exact(results[0],[coreDocument({host}),'DOCS_DONE']));
add('documentation/browser-docs-before-state',[select+'await cua.listBrowsers();'+done],context=>{const {results}=context,text=browserText(results[0],context),all=blocks(results[0]);assert.equal(all.length,4);inventoryState(all[2],text);});
add('documentation/emit-false-keeps-first-use-docs',[
 'let docsEntry=(await cua.listBrowsers({emit:false})).find(b=>b.metadata?.extensionInstanceId==="@@INSTANCE_ID@@");if(!docsEntry)throw new Error("Prepared browser unavailable");await cua.listTabs({browser:docsEntry.id,emit:false});'+done,
],context=>firstBrowser(context.results[0],context));
add('documentation/core-once',[done,'await cua.listBrowsers({emit:false});'+done],context=>{exact(context.results[0],[coreDocument(context),'DOCS_DONE']);exact(context.results[1],['DOCS_DONE']);});
add('documentation/browser-once',[first,'await cua.getBrowser({id:docsBrowser.browserId});await cua.listTabs({browser:docsBrowser.browserId,emit:false});'+done],context=>{firstBrowser(context.results[0],context);exact(context.results[1],['DOCS_DONE']);});
add('documentation/rewrite-cached-order',[first,rewrite],context=>{firstBrowser(context.results[0],context);assert.deepEqual(blocks(context.results[1]),blocks(context.results[0]));});
add('documentation/rewrite-same-request-meta-suppressed',[select+'await cua.rewriteDocumentation();await cua.rewriteDocumentation();'+done],context=>firstBrowser(context.results[0],context));
// Equal serialized metadata on later cells is a fresh object, not the same requestMeta identity.
add('documentation/rewrite-later-request-meta',[
 {label:'first',code:first,requestMeta:{'docs/oracle':'equal-value'}},
 {label:'later',code:'await cua.rewriteDocumentation();await cua.rewriteDocumentation();'+done,requestMeta:{'docs/oracle':'equal-value'}},
 {label:'later-again',code:rewrite,requestMeta:{'docs/oracle':'equal-value'}},
],context=>{firstBrowser(context.results[0],context);for(const result of context.results.slice(1))assert.deepEqual(blocks(result),blocks(context.results[0]));});
add('documentation/reset-timeout-fresh-bootstrap',[
 {label:'first',code:first},{label:'reset',op:'reset'},{label:'after-reset',code:first},
 {label:'timeout',code:'await new Promise(()=>{});',timeoutMs:100},{label:'after-timeout',code:first},
],context=>{for(const index of [0,2,4])firstBrowser(context.results[index],context);assert.equal(context.results[1].isError,false);assert.equal(context.results[3].isError,true);assert.match(context.results[3].content.filter(c=>c.type==='text').map(c=>c.text).join('\n'),/timed out|timeout/i);});
const overrides=[
 ['valid-whitespace',{computer_use:' \n# Fixture confirmations\nPreserve this exact host policy.\n '}],
 ['utf8-at-limit',{computer_use:'é'.repeat(6000)}],
 ['utf8-over-limit',{computer_use:'é'.repeat(6001)}],
 ['blank',{computer_use:' \n\t'}],['non-string',{computer_use:42}],['array',[]],['null',null],
 ['cached',{computer_use:'# Cached fixture confirmations\nKeep this original policy.'}],
];
const overrideCells=[];for(const [label,policy] of overrides){if(overrideCells.length)overrideCells.push({label:`reset-${label}`,op:'reset'});overrideCells.push({label,code:done,requestMeta:{'openai/confirmation_policies':policy}});}
overrideCells.push({label:'later-policy-cannot-replace-cache',code:rewrite,requestMeta:{'openai/confirmation_policies':{computer_use:'# Different valid policy\nMust not replace cached bytes.'}}});
add('documentation/confirmations-policy-override',overrideCells,({results,host})=>{let cached;for(const [index,cell] of overrideCells.entries()){if(cell.op==='reset'){assert.equal(results[index].isError,false);continue;}if(index!==overrideCells.length-1)cached=coreDocument({host,requestMeta:cell.requestMeta});exact(results[index],[cached,'DOCS_DONE']);}});
add('documentation/auxiliary-other-browser-apis',[first,rewrite],context=>{const text=firstBrowser(context.results[0],context);assert.equal(text.slice(0,auxiliary.length),auxiliary);assert.deepEqual(blocks(context.results[1]),blocks(context.results[0]));});
add('profiles/bounded-inventory-own-host',[{label:'profiles',op:'profiles'}],({results,host})=>{
 const {result,observation}=results[0];assertProfileObservation(observation,{host});assert.equal(result.isError,false);
 const value=result.structuredContent;assert.equal(value?.status,'ok');assert.ok(Array.isArray(value.profiles));assert.ok(Object.keys(value).every(key=>['status','profiles','guidance'].includes(key)));
 const live=new Set(observation.backends.filter(b=>b.family==='chrome').map(b=>b.instanceId));
 for(const profile of value.profiles){assert.ok(Object.keys(profile).every(key=>['key','ready','extensionInstanceId','reason'].includes(key)));assert.equal(typeof profile.key,'string');assert.equal(typeof profile.ready,'boolean');if(profile.ready){assert.equal(typeof profile.extensionInstanceId,'string');assert.ok(live.has(profile.extensionInstanceId),'ready profile absent from bounded host inventory');}}
 assert.ok(value.profiles.some(profile=>profile.ready),'prepared live profile is not ready');
 const {guidance,...fields}=value;const text=(guidance?guidance+'\n':'')+JSON.stringify(fields);exact(result,[text]);
});
export default scenarios;
