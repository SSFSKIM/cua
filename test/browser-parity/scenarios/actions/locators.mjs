import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"actions/locators", milestone:"M1c", commands:["playwright_locator_click", "playwright_locator_dblclick", "playwright_locator_fill", "playwright_locator_press", "playwright_locator_press_sequentially", "playwright_locator_select_option", "playwright_locator_set_checked", "playwright_locator_wait_for"],
  setup:{page:"/controls.html",state:{}},
  cells:[
  {
    "label": "fill",
    "code": "await tab.playwright.locator('#text').fill('alpha');return await tab.playwright.locator('#text').evaluate(e=>e.value);"
  },
  {
    "label": "press",
    "code": "await tab.playwright.locator('#text').press('End');await tab.playwright.locator('#text').pressSequentially(' beta');return await tab.playwright.locator('#text').evaluate(e=>e.value);"
  },
  {
    "label": "select",
    "code": "await tab.playwright.locator('#select').selectOption('b');return await tab.playwright.locator('#select').evaluate(e=>e.value);"
  },
  {
    "label": "check",
    "code": "await tab.playwright.locator('#check').setChecked(true);return await tab.playwright.locator('#check').evaluate(e=>e.checked);"
  },
  {
    "label": "click",
    "code": "await tab.playwright.locator('#click').click();return true;"
  },
  {
    "label": "double",
    "code": "await tab.playwright.locator('#double').dblclick();return true;"
  },
  {
    "label": "wait",
    "code": "await tab.playwright.getByText('recorded',{exact:true}).waitFor({state:'visible',timeoutMs:1000});return true;"
  }
],
  assert:expectValues({fill:'alpha',press:'alpha beta',select:'b',check:true,click:true,double:true,wait:true},s=>s.events.some(e=>e.click===true)&&s.events.some(e=>e.double===true)&&s.events.some(e=>e.selected==='b')&&s.events.some(e=>e.checked===true)),
};
