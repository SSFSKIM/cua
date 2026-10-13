import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {startFixture} from './fixture/serve.mjs';
import {runScenario} from '../../scripts/browser-parity/runner.mjs';
import controls from './scenarios/actions/locators.mjs';
const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Run the actual fixture's inline handlers and actual scenario cells. Only browser input/DOM plumbing is doubled.
async function controlsClient(base,delayedKey) {
  const html=await (await fetch(base+'/controls.html')).text(),elements=new Map(),attributes=new Map(),pending=[];
  for(const [,tag,attrs] of html.matchAll(/<(input|select|button|output)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
    const id=attrs.match(/\bid="([^"]+)"/)?.[1];if(!id)continue;
    elements.set(id,{value:tag==='select'?'a':'',checked:false,selectionStart:0,textContent:'',handlers:Object.fromEntries([...attrs.matchAll(/\b(on\w+)="([^"]*)"/g)].map(m=>m.slice(1)))});
  }
  const document={documentElement:{setAttribute:(k,v)=>attributes.set(k.toLowerCase(),String(v)),getAttribute:k=>attributes.get(k)??null},querySelector:s=>elements.get(s.slice(1))};
  const page=vm.createContext({document,fetch:async(url,options)=>{
    const value=JSON.parse(options.body);if(delayedKey in value)await pause(80);
    return fetch(base+url,options);
  }});
  for(const [,script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(script,page);
  const fire=(element,event)=>{
    if(!element.handlers[event])return;
    page.activeElement=element;
    const promise=vm.runInContext(`(function(){return (${element.handlers[event]});}).call(activeElement)`,page);
    pending.push(Promise.resolve(promise));pending.at(-1).catch(()=>{});
  };
  const locate=selector=>{
    if(selector.startsWith('#'))return elements.get(selector.slice(1));
    const match=selector.match(/^html\[([^=]+)="([^"]*)"\]$/);
    return match&&attributes.get(match[1])===match[2]?document.documentElement:undefined;
  };
  const locator=selector=>({
    async fill(value){const e=locate(selector);e.value=value;e.selectionStart=value.length;fire(e,'oninput');},
    async press(key){const e=locate(selector);e.selectionStart=key==='Home'?0:e.value.length;},
    async pressSequentially(value){const e=locate(selector);for(const char of value){e.value=e.value.slice(0,e.selectionStart)+char+e.value.slice(e.selectionStart);e.selectionStart++;fire(e,'oninput');}},
    async selectOption(value){const e=locate(selector);e.value=value;fire(e,'onchange');},
    async setChecked(value){const e=locate(selector);e.checked=value;fire(e,'onchange');},
    async click(){fire(locate(selector),'onclick');},
    async evaluate(fn){return fn(locate(selector));},
    async waitFor({timeoutMs}){for(const deadline=Date.now()+timeoutMs;!locate(selector);){if(Date.now()>deadline)throw new Error('fixture acknowledgement timed out');await pause(5);}},
  });
  const tab={id:'fixture-tab',async goto(){},playwright:{locator}},browser={browserId:'fixture-browser',async nameSession(){},tabs:{new:async()=>tab}};
  let content=[];const boundaries={};
  const context={nodeRepl:{write:text=>content.push({type:'text',text})},cua:{getBrowser:async()=>browser,createBrowserTab:async()=>tab}};context.globalThis=context;
  return {boundaries,async drain(){await Promise.allSettled(pending);},async close(){},async call(name,args={}){
    if(name==='end_task')return {content:[],structuredContent:{ended:true}};
    content=[];await new AsyncFunction('context',`with(context){${args.code}\n}`)(context);
    const label=args.title?.split(' ').at(-1);if(label)boundaries[label]=await (await fetch(base+'/state')).json();
    return {content};
  }};
}

for(const [key,cell,value] of [['click','click',true],['selected','select','b'],['checked','check',true],['text','press','alpha beta']]) {
  test(`the ${cell} cell awaits its actual page handler when only ${key} POSTs are delayed`,async t=>{
    const fixture=await startFixture({port:0}),client=await controlsClient(fixture.url,key);
    t.after(async()=>{await client.drain();await fixture.close();});
    const result=await runScenario(controls,{client,service:'vendor',fixtureURL:fixture.url,instanceId:'fake',emit:()=>{}});
    assert.equal(result.assertion.ok,true,JSON.stringify(result.assertion));
    assert.ok(client.boundaries[cell].events.some(e=>e[key]===value),`${cell} completed before its handler acknowledgement`);
  });
}

test('acknowledging the final record also acknowledges earlier records, even when their POST is slower',async t=>{
  const fixture=await startFixture({port:0});const html=await (await fetch(fixture.url+'/input.html')).text();const pending=[];
  t.after(async()=>{await Promise.allSettled(pending);await fixture.close();});
  const page=vm.createContext({document:{documentElement:{setAttribute(){}}},fetch:async(url,options)=>{
    if(JSON.parse(options.body).dragStart)await pause(120);return fetch(fixture.url+url,options);
  }});
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],page);
  pending.push(vm.runInContext('record({dragStart:true})',page));
  pending.push(vm.runInContext('record({dragEnd:true})',page));
  await pending[1];
  assert.deepEqual((await (await fetch(fixture.url+'/state')).json()).events,[{dragStart:true},{dragEnd:true}]);
});
