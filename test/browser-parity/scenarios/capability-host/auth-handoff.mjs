// The auth handoff on the capability host (test/browser-parity/capability-host.mjs), the one backend announcing
// `browserAuth`. A valid request on the request's origin is cua's local form, handing the tab to the person
// ({status:'declined', reason:'user_took_over'}), where the vendor's flow needs OpenAI's broker and answers
// {status:'unavailable'} without it (an expected difference); a request for another origin and one whose fields share
// an id are refused alike. Runs only with `run --device local --backend capability-host`.
import {expectValues} from '../../support/assertions.mjs';
const handedOff={vendor:{status:'unavailable'},cua:{status:'declined',reason:'user_took_over'}};
export default {
  id:'capability-host/auth-handoff', milestone:'M3', commands:['tab_browser_auth_handoff'], backend:'capability-host',
  setup:{page:'https://cua-capability.example/signin',open:'goto',state:{}},
  cells:[
    {label:'qr',code:"globalThis.auth=await tab.capabilities.get('browserAuth');await auth.documentation();return await auth.request({origin:'https://cua-capability.example',fields:[],qr_code:true});"},
    {label:'other-origin',code:"return await auth.request({origin:'https://other.example',fields:[],qr_code:true});"},
    {label:'duplicate-ids',code:"return await auth.request({origin:'https://cua-capability.example',fields:[{id:'user',label:'Email',type:'email',required:true,selector:'#email'},{id:'user',label:'Password',type:'password',required:true,selector:'#password'}]});"},
  ],
  assert:args=>expectValues({qr:handedOff[args.service],'other-origin':{status:'origin_changed'},'duplicate-ids':{status:'locator_invalid'}})(args),
};
