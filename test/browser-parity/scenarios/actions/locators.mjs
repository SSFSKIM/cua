import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"actions/locators", milestone:"M1c", commands:["playwright_locator_click", "playwright_locator_fill", "playwright_locator_press", "playwright_locator_press_sequentially", "playwright_locator_select_option", "playwright_locator_set_checked"],
  setup:{page:"/controls.html",state:{}},
  cells:[
  {
    "label": "fill",
    "code": "await tab.playwright.locator('#text').fill('alpha');await tab.playwright.locator('html[data-recorded-text=\"alpha\"]').waitFor({state:'attached',timeoutMs:3000});return await tab.playwright.locator('#text').evaluate(e=>e.value);"
  },
  {
    "label": "press",
    "code": "await tab.playwright.locator('#text').press('Home');const before=await tab.playwright.locator('#text').evaluate(e=>e.selectionStart);await tab.playwright.locator('#text').press('End');const after=await tab.playwright.locator('#text').evaluate(e=>e.selectionStart);await tab.playwright.locator('#text').pressSequentially(' beta');await tab.playwright.locator('html[data-recorded-text=\"alpha beta\"]').waitFor({state:'attached',timeoutMs:3000});return {before,after,value:await tab.playwright.locator('#text').evaluate(e=>e.value)};"
  },
  {
    "label": "select",
    "code": "await tab.playwright.locator('#select').selectOption('b');await tab.playwright.locator('html[data-recorded-selected=\"b\"]').waitFor({state:'attached',timeoutMs:3000});return await tab.playwright.locator('#select').evaluate(e=>e.value);"
  },
  {
    "label": "check",
    "code": "await tab.playwright.locator('#check').setChecked(true);await tab.playwright.locator('html[data-recorded-checked=\"true\"]').waitFor({state:'attached',timeoutMs:3000});return await tab.playwright.locator('#check').evaluate(e=>e.checked);"
  },
  {
    "label": "click",
    "code": "await tab.playwright.locator('#click').click();await tab.playwright.locator('html[data-recorded-click=\"true\"]').waitFor({state:'attached',timeoutMs:3000});return true;"
  }
],
  assert(input) {const result=expectValues({fill:'alpha',press:{before:0,after:5,value:'alpha beta'},select:'b',check:true,click:true},s=>s.events.some(e=>e.click===true)&&s.events.some(e=>e.selected==='b')&&s.events.some(e=>e.checked===true))(input);return result.ok?result:{...result,reason:result.reason+'; fixture='+JSON.stringify(input.fixtureState)};},
};
