import {expectValues} from '../../support/assertions.mjs';
// A locator click on a covered button: neither service checks the hit target inside the element's own document (the
// vendor's only obstruction check is at out-of-process frame owners), so the click lands on the overlay.
export default {
  id:'actions/overlay',milestone:'M1c',commands:['playwright_locator_click'],
  setup:{page:'/overlay.html',state:{}},
  cells:[
    {label:'click',code:"await tab.playwright.locator('#under').click();await tab.playwright.locator('html[data-recorded-cover=\"true\"]').waitFor({state:'attached',timeoutMs:3000});return await tab.playwright.evaluate(()=>document.documentElement.hasAttribute('data-recorded-under'));"},
  ],
  assert:expectValues({click:false},s=>s.events.some(e=>e.cover===true)&&!s.events.some(e=>e.under===true)),
};
