import {crossAsset} from '../../fixture/serve.mjs';
// pageAssets on a page that fetched an asset from another origin (the fixture's second listener). The extension route
// announces no pageAssets capability, so the client offers none (the first cell asserts that); the commands are sent
// as the client would send them, through node_repl's browser RPC, to prove what each service does when a backend does
// announce it: the asset is listed from resource timing, and bundling it, with no loaded copy in Chrome (a fetch()
// response is not in the page's resource tree), fetches it again inside the page with the person's session, so the
// fixture records two requests (Decision Log 2026-10-14, the session's ruling on cross-origin page assets).
const rpc = `globalThis.assetsRpc=params=>nodeRepl.rpc('browser',{method:'execute',params:{browser_id:browser.browserId,tab_id:tab.id,...params}});`;
export default {
  id:'capabilities/page-assets', milestone:'M3', commands:['tab_page_assets_list','tab_page_assets_bundle'],
  setup:{page:'/page-assets.html',state:{}},
  disabledAssertions:['tab_page_assets_list','tab_page_assets_bundle'],
  cells:[
    {label:'absent', code:"if((await tab.capabilities.list()).some(c=>c.id==='pageAssets'))throw new Error('unexpected capability pageAssets');try{await tab.capabilities.get('pageAssets');}catch(e){if(e.message==='Capability is not available: pageAssets')return true;throw e;}throw new Error('unexpected availability');"},
    {label:'list', timeoutMs:30000, code:`${rpc}const until=Date.now()+10000;let found;while(!found&&Date.now()<until){const inventory=await assetsRpc({type:'tab_page_assets_list'});found=inventory.assets.find(a=>a.url.endsWith('/cross-asset.png'));if(found){globalThis.inventoryId=inventory.id;globalThis.crossId=found.id;}else await new Promise(r=>setTimeout(r,250));}if(!found)throw new Error('cross-origin asset not listed');return {kind:found.kind,name:found.name,sources:found.sources,crossOrigin:new URL(found.url).origin!==new URL(fixtureURL).origin};`},
    {label:'bundle', timeoutMs:30000, code:`${rpc}const result=await assetsRpc({type:'tab_page_assets_bundle',inventoryId,assetIds:[crossId]});const [asset]=result.assets;let contentMatches=false;if(asset&&typeof asset.path==='string'&&/\\/browser-use\\/assets\\/[0-9a-f-]{36}\\/[0-9a-f]{16}\\.png$/.test(asset.path)){const fs=await import('node:fs/promises');contentMatches=Buffer.from(await fs.readFile(asset.path)).toString('base64')===${JSON.stringify(crossAsset.toString('base64'))};}return {assets:result.assets.map(a=>({kind:a.kind,name:a.name,contentType:a.contentType})),failures:result.failures.map(f=>f.reason),contentMatches,summary:{downloadedCount:result.summary.downloadedCount,failedCount:result.summary.failedCount,requestedCount:result.summary.requestedCount}};`},
  ],
  assert:({results,fixtureState})=>{
    const value=label=>results.find(r=>r.cell===label);
    const ok=results.length===3&&results.every(r=>r.ok)&&value('absent').value===true
      &&JSON.stringify(value('list').value)===JSON.stringify({kind:'image',name:'cross-asset.png',sources:[{kind:'resource',property:'fetch'}],crossOrigin:true})
      &&JSON.stringify(value('bundle').value)===JSON.stringify({assets:[{kind:'image',name:'cross-asset.png',contentType:'image/png'}],failures:[],contentMatches:true,summary:{downloadedCount:1,failedCount:0,requestedCount:1}});
    const requests=(fixtureState.events??[]).filter(e=>e.asset==='cross').length;
    return ok&&requests===2?{ok:true}:{ok:false,reason:`results ${JSON.stringify(results.map(r=>r.ok?r.value:r.error))}, asset requests ${requests}`};
  },
};
