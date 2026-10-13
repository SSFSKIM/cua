import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"tabs/manual-handoff-disabled", milestone:"M1a", commands:["tab_manual_handoff_request"],
  setup:{page:"/counter.html",state:{}},
  disabledAssertions:['tab_manual_handoff_request'],
  cells:[
  {
    "label": "disabled",
    "code": "return tab.requestManualHandoff===undefined;"
  }
],
  assert:expectValues({disabled:true}),
};
