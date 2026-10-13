import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"tabs/navigation", milestone:"M1a", commands:["navigate_tab_url", "navigate_tab_back", "navigate_tab_forward", "navigate_tab_reload"],
  setup:{page:"/counter.html",state:{}},
  cells:[
  {
    "label": "goto",
    "code": "await tab.goto(fixtureURL+'/reload.html');return new URL(await tab.url()).pathname;"
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
    "code": "const before=Number((await tab.title()).slice('Reload '.length));await tab.reload();const after=Number((await tab.title()).slice('Reload '.length));return {path:new URL(await tab.url()).pathname,reloaded:after===before+1};"
  }
],
  assert:expectValues({goto:'/reload.html',back:'/counter.html',forward:'/reload.html',reload:{path:'/reload.html',reloaded:true}},s=>s.reloads>=2),
};
