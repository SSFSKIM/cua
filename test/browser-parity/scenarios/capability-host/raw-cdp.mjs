// Raw CDP's success path on the capability host (test/browser-parity/capability-host.mjs), the one backend announcing
// `cdp`: a call reaches the tab's page, a navigation it causes is read back as a raw event, and the vendor's method
// gate refuses what it refuses. Runs only with `run --device local --backend capability-host`.
import {expectValues} from '../../support/assertions.mjs';
const PAGE='https://cua-capability.example/shop';
export default {
  id:'capability-host/raw-cdp', milestone:'M2', commands:['tab_cdp_call','tab_cdp_events'], backend:'capability-host',
  setup:{page:PAGE,open:'goto',state:{}},
  cells:[
    {label:'listed',code:"return (await tab.capabilities.list()).map(c=>c.id);"},
    {label:'call',code:"globalThis.cdp=await tab.capabilities.get('cdp');await cdp.documentation();const r=await cdp.send('Page.getFrameTree');return {url:r.frameTree.frame.url,secure:r.frameTree.frame.secureContextType};"},
    {label:'events',code:"const {cursor}=await cdp.readEvents({limit:1});await cdp.send('Page.reload');const read=await cdp.readEvents({afterSequence:cursor,methods:['Page.frameNavigated'],timeoutMs:2000});return read.events.map(e=>({method:e.method,url:e.params.frame.url}));"},
    {label:'refused',code:"try{await cdp.send('Page.getNavigationHistory');return 'sent';}catch(e){return e.message;}"},
  ],
  assert:expectValues({
    listed:['cdp','webmcp','browserAuth'],
    call:{url:PAGE,secure:'Secure'},
    events:[{method:'Page.frameNavigated',url:PAGE}],
    refused:'This method is not supported through raw CDP. For supported history navigation, use tab.back() or tab.forward() instead.',
  }),
};
