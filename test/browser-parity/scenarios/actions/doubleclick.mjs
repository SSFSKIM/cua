import {expectValues} from '../../support/assertions.mjs';
export default {
  id:'actions/doubleclick',milestone:'M1c',commands:['playwright_locator_dblclick'],
  setup:{page:'/controls.html',state:{}},
  cells:[
    {label:'double',code:"await tab.playwright.locator('#double').dblclick();await tab.playwright.getByText('recorded',{exact:true}).waitFor({state:'visible',timeoutMs:3000});return true;"},
  ],
  assert:expectValues({double:true},s=>s.events.some(e=>e.double===true)),
};
