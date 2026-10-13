import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"capabilities/logs", milestone:"M2", commands:["tab_dev_logs"],
  setup:{page:"/counter.html",state:{}},
  cells:[
  {
    "label": "start",
    "code": "await tab.dev.logs({filter:'parity-log',limit:5});return true;"
  },
  {
    "label": "trigger",
    "code": "await tab.goto(fixtureURL+'/logs.html');return true;"
  },
  {
    "label": "logs",
    "code": "return (await tab.dev.logs({filter:'parity-log',limit:5})).map(l=>({level:l.level,message:l.message}));"
  }
],
  assert:expectValues({start:true,trigger:true,logs:v=>Array.isArray(v)&&v.some(l=>JSON.stringify(l).includes('parity-log'))}),
};
