// Service seam only: never implements a facade or imports src/cua-api.
// Oracle: readable/chatgpt-26.928.40906 (MAP.md: runtime 0.0.27/20260927214556-b77d38801cca,
// asar sha256 ed1b376c509ba9c222fd9f8c1a29817eb53ff926679e48396f676ac674525db0).
// cua_node/@oai/cua/dist/project/cua/sky_js/src/sky.js:11-14,55-66,109-141 (setup/execute wire);
// targets/mac/create_client.js:19-36 (method inventory), types/window/{AppState,ListApps,Screenshot}.d.ts.
// Tab service responses model the AX seam consumed by tinysky_alt/bind_tab.js:6-106, not browser-client.
import {readFileSync} from 'node:fs';
const image=readFileSync(new URL('./pattern.png',import.meta.url)).toString('base64');
const methods=['list_apps','get_app_state','click','drag','paste','perform_secondary_action','press_key','scroll','select_text','set_value','type_text'];
const tabMethods=['get','click','drag','paste','performSecondaryAction','pressKey','scroll','selectText','setValue','typeText'];
const apps=[{id:'com.fixture.Editor',displayName:'Fixture Editor',isRunning:true,lastUsedDate:'2026-10-14T12:00:00Z',useCount:7},{id:'com.fixture.Closed',displayName:'Closed Fixture',isRunning:false}];
const copy=value=>JSON.parse(JSON.stringify(value));
export function createBinderService(){
 let calls=[],config={};
 return async function handleRpc(request){
  if(request.type==='setup')return {target:'mac',methods:[...methods]};
  if(request.type==='fixture'){
   if(request.op==='reset'){calls=[];config={};return null;}
   if(request.op==='clear'){calls=[];return null;}
   if(request.op==='calls')return copy(calls);
   if(request.op==='configure'){const {type,op,...options}=request;Object.assign(config,options);return null;}
   throw new Error(`unsupported binder control: ${request.op}`);
  }
  if(request.type==='execute'&&methods.includes(request.method)){
   calls.push(copy(request));
   if(config.failMethod===request.method)throw new Error('fixture service rejection');
   if(request.method==='list_apps')return copy(apps);
   if(request.method==='get_app_state')return {app:'com.fixture.Editor',text:'[0] text field "Fixture editor"',screenshot:config.screenshot===false?null:{url:`data:image/png;base64,${image}`}};
   return null;
  }
  if(request.type==='inventory'&&['list','get','tabs'].includes(request.method)){
   calls.push(copy(request));
   if(request.method==='list'){
    if(config.browserFailure==='list')throw new Error('fixture browser list rejection');
    return ['fixture-good','fixture-broken'].map(id=>({id,name:id,family:'chromium',type:'extension',profileName:'Fixture profile',metadata:{extensionInstanceId:id+'-extension'}}));
   }
   if(!['fixture-good','fixture-broken'].includes(request.id))throw new Error('unsupported fixture browser');
   if(request.method==='get')return null;
   if(config.browserFailure==='tabs'&&request.id==='fixture-broken')throw new Error('fixture browser tabs rejection');
   return [{id:request.id+'-tab',providerTabId:'1',title:'Fixture page',url:'https://fixture.invalid/'}];
  }
  if(request.type==='tab'&&['ax','dom'].includes(request.tab)&&
     (request.tab==='ax'?tabMethods.includes(request.method):['domSnapshot','screenshot'].includes(request.method))){
   calls.push(copy(request));
   if(config.failMethod===request.method)throw new Error('fixture service rejection');
   if(request.method==='domSnapshot')return '- textbox "DOM fixture"';
   if(request.method==='screenshot')return {base64:image};
   if(request.method==='get'){
    const kind=request.args[0];
    if(kind==='state')return '[1] text field "AX fixture"';
    if(kind==='screenshot')return {base64:image};
    if(kind==='both')return {state:'[1] text field "AX fixture"',...(config.screenshot===false?{}:{screenshot:{base64:image}})};
    throw new Error(`unsupported AX observation: ${kind}`);
   }
   return null;
  }
  throw new Error(`unsupported binder request: ${request.type}/${request.method}`);
 };
}
// Both registered service names MUST resolve to this same module URL in one trusted worker.
export const handleRpc=createBinderService();
