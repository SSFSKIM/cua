import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"tabs/navigation", milestone:"M1a", commands:["navigate_tab_url", "navigate_tab_back", "navigate_tab_forward", "navigate_tab_reload"],
  setup:{page:"/counter.html",state:{}},
  cells:[
  {
    "label": "goto",
    "code": "await tab.goto(fixtureURL+'/read.html');return new URL(await tab.url()).pathname;"
  },
  {
    "label": "back",
    "code": "await tab.back();return new URL(await tab.url()).pathname;"
  },
  {
    "label": "forward",
    "code": "await tab.forward();return new URL(await tab.url()).pathname;"
  },
  {
    "label": "reload",
    "code": "await tab.reload();return new URL(await tab.url()).pathname;"
  }
],
  assert:expectValues({goto:'/read.html',back:'/counter.html',forward:'/read.html',reload:'/read.html'}),
};
