import {expectError} from '../../support/assertions.mjs';
export default {
  id:"capabilities/history", milestone:"M3", commands:["browser_user_history"],
  setup:{page:"/counter.html",state:{}},
  disabledAssertions:['browser_user_history'],
  cells:[
  {
    "label": "history",
    "code": "return await browser.history({queries:['cua-parity-nonexistent-history-sentinel'],from:'2100-01-01',to:'2100-01-02',limit:1});"
  }
],
  assert:({results,service})=>({ok:expectError(results,'history',/history|not supported|not available|handler/i,['Error'])}),
};
