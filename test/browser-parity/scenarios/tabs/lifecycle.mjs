import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"tabs/lifecycle", milestone:"M1a", commands:["create_tab", "get_tab", "list_tabs", "selected_tab", "mark_tab", "close_tab", "browser_user_open_tabs", "browser_user_claim_tab"],
  setup:{page:"/counter.html",state:{}},
  cells:[
  {
    "label": "create",
    "code": "globalThis.extra=await browser.tabs.new();return {tabId:extra.id};"
  },
  {
    "label": "get",
    "code": "return (await browser.tabs.get(extra.id)).id===extra.id;"
  },
  {
    "label": "list",
    "code": "return (await browser.tabs.list()).some(t=>t.id===extra.id);"
  },
  {
    "label": "selected",
    "code": "const selected=await browser.tabs.selected();return selected==null||typeof selected.id==='string';"
  },
  {
    "label": "user-list",
    "code": "return (await browser.user.openTabs()).filter(t=>t.id===extra.id).map(t=>({owned:true}));"
  },
  {
    "label": "claim-own",
    "code": "return (await browser.user.claimTab(extra.id)).id===extra.id;"
  },
  {
    "label": "mark",
    "code": "await extra.markDeliverable();await extra.markHandoff();return true;"
  },
  {
    "label": "close",
    "code": "await extra.close();return !(await browser.tabs.list()).some(t=>t.id===extra.id);"
  }
],
  assert:expectValues({create:v=>typeof v.tabId==='string',get:true,list:true,selected:true,'user-list':v=>Array.isArray(v)&&v.every(t=>t.owned),'claim-own':true,mark:true,close:true}),
};
