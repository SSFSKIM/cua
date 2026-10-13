import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"tabs/discovery", milestone:"M1a", commands:["list_browsers", "get_browser", "get_default_browser", "get_browser_for_url", "get_browser_documentation", "get_documentation", "name_session"],
  setup:{page:"/counter.html",state:{}},
  cells:[
  {
    "label": "list",
    "code": "return (await cua.listBrowsers({emit:false})).filter(b=>b.id===browser.browserId).map(b=>({type:b.type}));"
  },
  {
    "label": "select",
    "code": "return (await cua.getBrowser({id:browser.browserId})).browserId===browser.browserId;"
  },
  {
    "label": "default",
    "code": "return typeof (await cua.browsers.getDefault()).browserId==='string';"
  },
  {
    "label": "url-selection",
    "code": "return typeof (await cua.browsers.getForUrl(fixtureURL+'/counter.html')).browserId==='string';"
  },
  {
    "label": "docs",
    "code": "return (await browser.documentation()).includes('# Selected Browser');"
  },
  {
    "label": "capability-docs",
    "code": "return (await (await browser.capabilities.get('viewport')).documentation()).includes('viewport');"
  },
  {
    "label": "name",
    "code": "await browser.nameSession('tabs/discovery');return true;"
  }
],
  assert:expectValues({list:[{type:'extension'}],select:true,default:true,'url-selection':true,docs:true,'capability-docs':true,name:true}),
};
