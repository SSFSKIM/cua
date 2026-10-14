import {expectError} from '../../support/assertions.mjs';
// waitForLoadState with timeoutMs 0 on a page that has loaded and gone network-idle. On cua a zero budget is one
// observation (the M1b ruling), so a state that already holds succeeds; the vendor's zero budget times out before its
// first observation (an expected difference in cua's favour, Decision Log 2026-10-14). Each cell reads the document
// back, so a service that does nothing fails.
const settle="await new Promise(resolve=>setTimeout(resolve,1000));";
export default {
  id:'waits/zero-budget',milestone:'M1c',commands:['playwright_wait_for_load_state'],
  setup:{page:'/read.html',state:{}},
  cells:[
    {label:'load',code:`${settle}await tab.playwright.waitForLoadState({state:'load',timeoutMs:0});return await tab.playwright.evaluate('document.readyState');`},
    {label:'idle',code:"await tab.playwright.waitForLoadState({state:'networkidle',timeoutMs:0});return await tab.playwright.evaluate('document.readyState');"},
  ],
  assert:({results,service})=>{
    const value=label=>results.find(r=>r.cell===label);
    const succeeded=label=>value(label)?.ok===true&&value(label).value==='complete';
    if(results.length!==2)return {ok:false,reason:'unexpected cell count'};
    // The vendor's outcome is its timeout; a completed observation is accepted too (timing), never a silent no-op.
    const vendorCell=(label,pattern)=>succeeded(label)||expectError(results,label,pattern);
    const ok=service==='vendor'
      ?vendorCell('load',/Timed out waiting for load/)&&vendorCell('idle',/Timed out waiting for networkidle|deadline/)
      :succeeded('load')&&succeeded('idle');
    return ok?{ok:true}:{ok:false,reason:results.map(r=>`${r.cell}: ${r.ok?JSON.stringify(r.value):r.error?.message}`).join('; ')};
  },
};
