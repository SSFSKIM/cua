import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"capabilities/m3-disabled", milestone:"M3", commands:["tab_page_assets_list", "tab_page_assets_bundle", "webmcp_list_tools", "webmcp_invoke_tool", "tab_bot_detection_report", "tab_browser_auth_handoff"],
  setup:{page:"/counter.html",state:{}},
  disabledAssertions:['tab_page_assets_list','tab_page_assets_bundle','webmcp_list_tools','webmcp_invoke_tool','tab_bot_detection_report','tab_browser_auth_handoff'],
  cells:[
  {
    "label": "disabled",
    "code": "const missing=[];for(const id of ['pageAssets','webmcp','botDetection','browserAuth']){if((await tab.capabilities.list()).some(c=>c.id===id))throw new Error('unexpected capability '+id);try{await tab.capabilities.get(id);throw new Error('unexpected availability');}catch(e){if(e.message!=='Capability is not available: '+id)throw e;missing.push(id);}}return missing;"
  }
],
  assert:expectValues({disabled:['pageAssets','webmcp','botDetection','browserAuth']}),
};
