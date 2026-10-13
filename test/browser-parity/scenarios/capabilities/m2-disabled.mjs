import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"capabilities/m2-disabled", milestone:"M2", commands:["browser_management_call", "browser_management_get_audit_trail", "browser_visibility_get", "browser_visibility_set", "tab_cdp_call", "tab_cdp_events"],
  setup:{page:"/counter.html",state:{}},
  disabledAssertions:['browser_management_call','browser_management_get_audit_trail','browser_visibility_get','browser_visibility_set','tab_cdp_call','tab_cdp_events'],
  cells:[
  {
    "label": "disabled",
    "code": "const missing=[];for(const [scope,id] of [[browser,'management'],[browser,'visibility'],[tab,'cdp']]){if((await scope.capabilities.list()).some(c=>c.id===id))throw new Error('unexpected capability '+id);try{await scope.capabilities.get(id);throw new Error('unexpected availability');}catch(e){if(e.message!=='Capability is not available: '+id)throw e;missing.push(id);}}return missing;"
  }
],
  assert:expectValues({disabled:['management','visibility','cdp']}),
};
