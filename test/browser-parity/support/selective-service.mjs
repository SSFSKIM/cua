// Stateful test backend: observations work while exactly one requested mutation can be disabled.
// Cell bodies still go through the production runScenario/cellCode/parseCell path.
const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
export function selectiveService({inert,artifactPath,corruptArtifactPath}) {
  const tabs=new Map([['preexisting',{id:'preexisting',url:'https://user.fixture.invalid/untouched',owner:null,origin:'claimed',mark:'none'}]]);let sequence=0,clients=0;
  const original={width:900,height:700};let dimensions={...original};
  function client() {
    const owner=++clients;let content=[];
    const end=()=>{for(const [id,t] of tabs)if(t.owner===owner){if(t.mark==='handoff')continue;if(t.mark==='deliverable'||t.origin==='claimed')t.owner=null;else tabs.delete(id);}};
    const handle=t=>({
      id:t.id,async goto(url){t.url=url;},async close(){tabs.delete(t.id);},
      async markDeliverable(){if(inert!=='markDeliverable')t.mark='deliverable';},
      async markHandoff(){if(inert!=='markHandoff')t.mark='handoff';},
      playwright:{async evaluate(){return {...dimensions};},locator(selector){return {async downloadMedia(){return inert==='downloadMedia'?artifactPath+'/missing/image.svg':inert==='downloadMedia.wrong-content'?corruptArtifactPath:artifactPath;},async textContent(){return t.waitText??'';},async waitFor(){if(inert==='locator.waitFor')return;if(t.waitText==='ready')return;await new Promise(resolve=>{t.ready=resolve;});},async click(){if(selector==='#start-wait')setTimeout(()=>{t.waitText='ready';t.ready?.();},20);}};}},
    });
    const create=async(url='about:blank')=>{const t={id:String(++sequence),url,owner,origin:'created',mark:'none'};tabs.set(t.id,t);return handle(t);};
    const browser={browserId:'fixture-browser',async nameSession(){},
      tabs:{new:()=>create(),async get(id){if(!tabs.has(id))throw new Error('tab not found');return handle(tabs.get(id));},async list(){return [...tabs.values()].filter(t=>t.owner===owner).map(t=>({id:t.id,url:t.url}));},async selected(){const t=[...tabs.values()].find(t=>t.owner===owner);return t?handle(t):undefined;}},
      user:{async openTabs(){return [...tabs.values()].filter(t=>t.owner===null).map(t=>({id:t.id,url:t.url}));},async claimTab(id){const t=tabs.get(typeof id==='string'?id:id.id);if(!t)throw new Error('tab not found');if(t.owner!==null&&t.owner!==owner)throw new Error('other session');t.owner=owner;t.origin='claimed';t.mark='none';return handle(t);}},
      capabilities:{async get(id){if(id!=='viewport')throw new Error('unsupported');return {async set(size){if(inert!=='viewport.set')dimensions={...size};},async reset(){if(inert!=='viewport.reset')dimensions={...original};}};}},
    };
    const context={URL,Date,console,nodeRepl:{write:text=>content.push({type:'text',text})},cua:{getBrowser:async()=>browser,createBrowserTab:async(_,url)=>create(url)}};
    context.globalThis=context;
    return {async call(name,args={}){if(name==='end_task'){end();return {content:[],structuredContent:{ended:true}};}content=[];await new AsyncFunction('context',`with(context){${args.code}\n}`)(context);return {content};},async close(){end();for(const t of tabs.values())if(t.owner===owner)t.owner=null;}};
  }
  return {client,remainingTabs:()=>[...tabs.values()]};
}
