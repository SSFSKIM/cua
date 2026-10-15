// Client-boundary double, NOT a browser service implementation or evidence that a backend gained capabilities.
// Replies/manifest below are grounded in readable chatgpt-26.928.40906
// cua_node/@oai/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js (BC):
// manifest proxies 10061-10212; user context 5108-5164,6611-6660; AX 8131-8350;
// botDetection 8587-8626; assets 9013-9130; management 9580-9721; visibility 9736-9798.
// See docs/doperpowers/specs/2026-10-14-own-repl-host-design.md, M3 oracle decision.
import {pathToFileURL} from 'node:url';

// The proxy recognizes runtime interface names, not capability subclasses (BC:10067-10080).
// A minimal source-grounded manifest avoids importing the owned facade or its validation implementation.
const members={Browser:['browserId','capabilities','tabs','user','documentation','history','nameSession'],
 BrowserUser:['claimTab','getTabContext','openTabs'],Tabs:['content','get','list','new','selected'],
 Tab:['id','ax','content','capabilities','playwright','cua','dom_cua','markDeliverable','markHandoff','requestManualHandoff'],
 AXAPI:['click','drag','get','paste','performSecondaryAction','pressKey','scroll','selectText','setValue','typeText','write'],ContentAPI:['export']};
const apiManifest={root:'Agent',interfaces:Object.fromEntries(Object.entries(members).map(([name,keys])=>[name,Object.fromEntries(keys.map(key=>[key,{}]))])),types:{}};
const capabilities={browser:['management','visibility','viewport'].map(id=>({id,description:`Fixture ${id}`})),tab:['botDetection','browserAuth','cdp','pageAssets','webmcp'].map(id=>({id,description:`Fixture ${id}`}))};
const url='https://cua-capability.example/shop';
export const ASSET_INVENTORY={assets:[{id:'asset-1',kind:'image',name:'lamp.png',sources:[{kind:'attribute',nodeId:3,property:'src'}],url:'https://cua-capability.example/lamp.png'}],id:'inventory-1',inlineSvgs:[{id:'svg-1',markup:'<svg/>',name:'icon'}],pageUrl:url,summary:{byKind:{image:1},inlineSvgCount:1,totalCount:1}};
export const ASSET_BUNDLE={assets:[{contentType:'image/png',id:'asset-1',kind:'image',name:'lamp.png',path:'/fixture/assets/lamp.png',url:'https://cua-capability.example/lamp.png'}],directoryPath:'/fixture/assets',failures:[{contentType:null,id:'asset-2',name:'missing.png',reason:'not available',url:'https://cua-capability.example/missing.png'}],manifestPath:'/fixture/assets/manifest.json',summary:{downloadedCount:1,elapsedMs:1,failedCount:1,requestedCount:2}};
export const AUDIT={changes:[{args:[{title:'Fixture'}],method:'create',namespace:'bookmarks',createdAt:1,before:{bookmarks:[{id:'b0',index:0,parentId:'root',title:'Before',url}],tabLayout:{groups:[{collapsed:false,color:'blue',id:1,title:'Group',windowId:1}],tabs:[{autoDiscardable:true,groupId:1,id:7,index:0,pinned:false,url,windowId:1}]},windows:[{focused:true,height:600,id:1,left:0,state:'normal',top:0,width:800}]},result:{id:'b1'}}]};
export function createCapabilityOracleService(delegate){
 let mode='real-service',disabled=[],trace=[],overrides=new Map(),recovery=false,envelopes=new Map();
 return {async handleRpc(request){
  const {method,params}=request;
  if(method==='oracle.configure'){
   if(!['real-service','boundary-double','hidden'].includes(params?.mode))throw Error('Invalid oracle mode');
   mode=params.mode;disabled=params.disabledMemberIds??[];trace=[];overrides=new Map();recovery=false;envelopes=new Map();return {mode};
  }
  if(method==='oracle.trace')return structuredClone(trace);
  // BC:10238-10284: select recovery v1 at setup; inject raw transport envelopes, not wrapped command values.
  if(method==='oracle.recovery'||method==='oracle.envelope'){
   if(mode!=='boundary-double')throw Error('Recovery injection requires boundary-double mode');
   if(method==='oracle.recovery')recovery=params.enabled===true;
   else envelopes.set(params.type,params.value);
   return {};
  }
  if(method==='oracle.reply'){
   if(mode==='real-service')throw Error('Cannot replace a real-service reply');
   overrides.set(params.type,params.value);return {};
  }
  if(mode==='real-service'){if(['execute','executeWithRecovery'].includes(method))trace.push(JSON.parse(JSON.stringify(params)));return delegate.handleRpc(request);}
  if(method==='setup')return {apiManifest:structuredClone(apiManifest),disabledMemberIds:[...disabled],...(recovery?{credentialRecoveryErrorVersion:1}:{})};
  if(!['execute','executeWithRecovery'].includes(method))throw Error(`Unscripted fixture method ${method}`);
  trace.push(JSON.parse(JSON.stringify(params)));
  if(method==='executeWithRecovery'&&envelopes.has(params.type))return structuredClone(envelopes.get(params.type));
  const result=overrides.has(params.type)?structuredClone(overrides.get(params.type)):answer(params);
  return method==='executeWithRecovery'?{ok:true,value:result}:result;
 }
 };
 function answer(p){
  switch(p.type){
   case 'get_browser':case 'get_default_browser':return {id:'fixture',name:'Capability boundary double',type:'extension',capabilities:mode==='hidden'?{browser:[],tab:[]}:structuredClone(capabilities)};
   case 'create_tab':case 'get_tab':case 'browser_user_claim_tab':return {id:p.tab_id??'7',title:'Fixture',url};
   case 'get_documentation':return `# Fixture documentation: ${p.name}\nClient-boundary fixture only.`;
   case 'browser_user_get_tab_context':return {dataBase64:'AQID',fileName:'fixture.pdf',kind:'document',mimeType:'application/pdf',title:'Fixture',url};
   case 'tabs_content':return {results:p.urls.map(url=>({url,title:'Fixture',content:'Fixture text'}))};
   case 'tab_ax_get_state':return {state:'AX fixture state',data:'AQID'};
   // BC:6430-6461,7877-7889,7977-7989,8117-8134 (optional client commands).
   case 'playwright_element_info':return [{tagName:'BUTTON',role:'button',visibleText:'Buy',ariaName:'Buy',testId:'buy',nodeId:3,boundingBox:{x:4,y:5,width:20,height:10},preview:'<button>Buy</button>',selector:{primary:'#buy',candidates:['#buy'],frameSelectors:[]}}];
   case 'playwright_element_screenshot':return {data:'AQID'};
   case 'cua_download_media':case 'dom_cua_download_media':
   // BC:5268-5286: dialog handling returns an empty object, interpreted as void by the client.
   case 'tab_handle_js_dialog':
   case 'tab_ax_action':case 'tab_manual_handoff_request':return {};
   case 'tab_content_export':return {path:'/fixture/export.pdf'};
   // BC:5304-5343: all retained GSuite formats and transcript return {path:string}; no actual file is produced.
   case 'tab_content_export_gsuite':return {path:`/fixture/gsuite.${p.format}`};
   case 'tab_content_export_youtube_transcript':return {path:'/fixture/transcript.txt'};
   case 'tab_bot_detection_report':return {status:'reported',hostname:'cua-capability.example'};
   case 'browser_management_call':return {value:{namespace:p.namespace,method:p.method,args:p.args}};
   case 'browser_management_get_audit_trail':return structuredClone(AUDIT);
   case 'browser_visibility_get':return {visible:true};
   case 'browser_visibility_set':case 'browser_viewport_set':case 'browser_viewport_reset':return {};
   case 'tab_page_assets_list':return structuredClone(ASSET_INVENTORY);
   case 'tab_page_assets_bundle':return structuredClone(ASSET_BUNDLE);
   default:throw Error(`Unscripted capability fixture command ${p.type}`);
  }
 }
}
// Loaded only by the remote parity launch, with the retained production browser service as delegate.
let service;
export async function handleRpc(request){
 if(!service){
  const path=globalThis.nodeRepl?.env?.PARITY_CAPABILITY_DELEGATE;
  if(!path)throw Error('Capability oracle requires its remote launch delegate');
  service=createCapabilityOracleService(await import(pathToFileURL(path).href));
 }
 return service.handleRpc(request);
}
