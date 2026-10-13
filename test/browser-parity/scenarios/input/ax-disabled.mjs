import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"input/ax-disabled", milestone:"M1c", commands:["tab_ax_action"],
  setup:{page:"/counter.html",state:{}},
  disabledAssertions:['tab_ax_action'],
  cells:[
  {
    "label": "disabled",
    "code": "return tab.ax===undefined;"
  }
],
  assert:expectValues({disabled:true}),
};
