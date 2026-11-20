import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {startFixture} from './fixture/serve.mjs';
import {runScenario} from '../../scripts/browser-parity/runner.mjs';
import controls from './scenarios/actions/locators.mjs';
import coordinates from './scenarios/input/coordinates.mjs';
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

// #168: the drag cell waits for the fixture's acknowledgement of the drag's end, which comes only once the records the
// page queued before it (the dragStart, and a pointermove's already in the chain) have been POSTed. On a loaded runner
// each POST is slow; here each takes 900 ms, so the end is acknowledged about two round trips (1.8 s) after the release,
// past the cell's old 1.5 s. The cell must still see it, within the scenario's 3 s acknowledgement budget, as the type
// and double cells do.
test('the drag cell sees the fixture acknowledge the drag\'s end when every queued record is slow to POST',async t=>{
  const fixture=await startFixture({port:0});const html=await (await fetch(fixture.url+'/input.html')).text();const pending=[];
  let page;
  // the page's own record chains (the pointermoves' too) settle before the fixture goes
  t.after(async()=>{await Promise.allSettled([...pending,vm.runInContext('pointerRecords',page),vm.runInContext('recording',page)]);await fixture.close();});
  const attributes=new Map(),listeners={},elements=new Map();
  for(const [,tag,attrs] of html.matchAll(/<(div|output)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g)){
    const id=attrs.match(/\bid="([^"]+)"/)?.[1];
    if(id)elements.set(id,{tag,textContent:'',handlers:Object.fromEntries([...attrs.matchAll(/\b(on\w+)="([^"]*)"/g)].map(m=>m.slice(1)))});
  }
  const document={documentElement:{setAttribute:(k,v)=>attributes.set(k.toLowerCase(),String(v))},querySelector:s=>elements.get(s.slice(1)),
    addEventListener:(name,handler)=>{(listeners[name]??=[]).push(handler);}};
  // the page has painted: its own observer marks html[data-first-contentful-paint], which the cell waits for
  const PerformanceObserver=class{constructor(callback){this.callback=callback;}observe(){this.callback({getEntriesByName:name=>name==='first-contentful-paint'?[{}]:[]});}};
  page=vm.createContext({document,window:{scrollY:0,scrollTo(){}},PerformanceObserver,fetch:async(url,options)=>{await pause(900);return fetch(fixture.url+url,options);}});
  for(const [,script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(script,page);
  const fire=(handler,point)=>{
    page.target=elements.get('drag');page.pointer={clientX:point.x,clientY:point.y};
    pending.push(Promise.resolve(vm.runInContext(`(function(event){return (${elements.get('drag').handlers[handler]});}).call(target,pointer)`,page)));
  };
  const move=point=>{for(const listener of listeners.pointermove??[])listener({clientX:point.x,clientY:point.y});};
  const find=selector=>{
    const attribute=selector.match(/^html\[([^=]+)="([^"]*)"\]$/);
    if(attribute)return attributes.get(attribute[1])===attribute[2]?document.documentElement:undefined;
    return elements.get(selector.slice(1));
  };
  const waitUntil=async(found,timeoutMs)=>{
    for(const deadline=Date.now()+timeoutMs;!found();){if(Date.now()>deadline)throw new Error('fixture acknowledgement timed out');await pause(5);}
  };
  const tab={
    cua:{async drag({path}){const [start,...rest]=path;move(start);fire('onpointerdown',start);for(const point of rest)move(point);fire('onpointerup',path.at(-1));}},
    playwright:{
      evaluate:async fn=>vm.runInContext(`(${fn.toString()})()`,page),
      locator:selector=>({waitFor:({timeoutMs})=>waitUntil(()=>find(selector),timeoutMs),textContent:async()=>find(selector)?.textContent??null}),
      getByText:text=>({waitFor:({timeoutMs})=>waitUntil(()=>[...elements.values()].some(e=>e.textContent===text),timeoutMs)}),
    },
  };
  const drag=coordinates.cells.find(c=>c.label==='drag');
  assert.equal(await new AsyncFunction('tab',drag.code)(tab),'ended');
  const events=(await (await fetch(fixture.url+'/state')).json()).events;
  assert.ok(events.some(e=>e.dragStart&&e.x===60&&e.y===180)&&events.some(e=>e.dragEnd&&e.x===160&&e.y===180),JSON.stringify(events));
});
