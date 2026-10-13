import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"capabilities/m3-members", milestone:"M3", commands:["tab_content_export", "browser_user_get_tab_context"],
  setup:{page:"/counter.html",state:{}},
  disabledAssertions:['tab_content_export','browser_user_get_tab_context'],
  cells:[
  {
    "label": "disabled",
    "code": "return {export:tab.content.export===undefined,context:browser.user.getTabContext===undefined};"
  }
],
  assert:expectValues({disabled:{export:true,context:true}}),
};
