import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"reads/snapshot", milestone:"M1b", commands:["playwright_dom_snapshot", "dom_cua_get_visible_dom", "tab_ax_get_state"],
  setup:{page:"/read.html",state:{}},
  disabledAssertions:['tab_ax_get_state'],
  cells:[
  {
    "label": "snapshot",
    "code": "return await tab.playwright.domSnapshot();"
  },
  {
    "label": "visible-dom",
    "code": "return await tab.dom_cua.get_visible_dom();"
  },
  {
    "label": "ax-disabled",
    "code": "return tab.ax===undefined;"
  },
  {
    "label": "fallback",
    "code": "return await tab.getAXState({emit:false,disableDiffing:true});"
  }
],
  assert:expectValues({snapshot:v=>typeof v==='string'&&v.includes('Read fixture')&&v.includes('Enabled'),'visible-dom':v=>JSON.stringify(v).includes('Enabled'),'ax-disabled':true,fallback:v=>typeof v==='string'&&v.includes('Read fixture')}),
};
