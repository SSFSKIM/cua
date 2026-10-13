// Development-only substitute for the vendor runtime, behind the actual cua MCP server and actual host.
// This is NOT vendor parity evidence. It never discovers a runtime or Chrome, and its only profile is scratch.
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {createServer} from '../../src/mcp/server.mjs';
import {createHost} from '../../src/chrome/host.mjs';
import {createFakeCuaExtension} from '../helpers/fake-cua-extension.mjs';
import {UPSTREAM_TOOLS} from '../fixtures/mcp-harness.mjs';
const ext=createFakeCuaExtension();
const host=createHost({extension:ext.api,hello:ext.hello(),home:process.env.CUA_HOME});
const peer={notify(){}};
ext.onNotify=(method,params)=>host.onExtensionNotification({method,params});
let emit=()=>{}, currentMeta={}, output=[], approved=false, approvalResolve;
const call=(method,params={})=>host.handleBackendRequest(peer,{method,params:{...params,...currentMeta}});
const fakeTab=created=>{
  let current='about:blank';
  return {id:String(created.id),
    async goto(url){await call('attach',{tabId:created.id});await call('executeCdp',{target:{tabId:created.id},method:'Page.navigate',commandParams:{url}});current=url;},
    title:async()=> 'Browser parity fixture',url:async()=>current,close:()=>call('executeCdp',{target:{tabId:created.id},method:'Page.close'})};
};
const browser={browserId:`browser-${randomUUID()}`,nameSession:name=>call('nameSession',{name}),tabs:{new:async()=>fakeTab(await call('createTab'))},
  documentation:async()=>`# Selected Browser\n- Name: cua\n- Type: extension\n${process.env.CUA_BROWSER_SERVICE==='cua'?'cua browser service 0.1.0':''}`};
const context=vm.createContext({setTimeout,clearTimeout,URL,Promise,fetch,console:{log:(...a)=>output.push(a.join(' '))},
  nodeRepl:{write:text=>output.push(text)},cua:{
    async getBrowser(){output.push(await browser.documentation());return browser;},
    async createBrowserTab(id,url){
      const tab=await browser.tabs.new();
      await tab.goto(url);
      return tab;
    },
  }});
const upstream={
  onMessage(fn){emit=fn;},onExit(){},async terminate(){await host.clientClosed(peer);return {confirmed:true};},
  send(msg){
    if(!msg.method){if(msg.id==='approval'){approved=msg.result?.action==='accept';approvalResolve?.();}return;}
    if(msg.id===undefined)return;
    const respond=result=>emit({jsonrpc:'2.0',id:msg.id,result});
    (async()=>{
      if(msg.method==='initialize')return respond({protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'fake-runtime',version:'1'}});
      if(msg.method==='tools/list')return respond({tools:UPSTREAM_TOOLS});
      if(msg.method!=='tools/call')throw new Error('Unexpected request');
      currentMeta=msg.params._meta?.['x-codex-turn-metadata'] ?? {};
      if(msg.params.name==='turn_ended'){await call('turnEnded');return respond({content:[],isError:false});}
      if(!approved){const waiting=new Promise(resolve=>{approvalResolve=resolve;});emit({jsonrpc:'2.0',id:'approval',method:'elicitation/create',params:{message:'Approve fake browser?',requestedSchema:{type:'object',properties:{}}}});await waiting;if(!approved)throw new Error('Fake approval declined');}
      output=[];
      await vm.runInContext(`(async()=>{${msg.params.arguments.code}\n})()`,context);
      respond({content:output.map(text=>({type:'text',text})),isError:false});
    })().catch(e=>respond({content:[{type:'text',text:e.message}],isError:true}));
  },
};
const server=createServer({input:process.stdin,output:process.stdout,upstream,surfaces:['browser'],profiles:{list:()=>[{key:'scratch',ready:true,extensionInstanceId:ext.instanceId}]},diagnostics:()=>{}});
process.once('SIGTERM',()=>server.close('signal'));
await server.closed;
