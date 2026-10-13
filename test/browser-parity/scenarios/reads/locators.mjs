import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"reads/locators", milestone:"M1b", commands:["playwright_locator_count", "playwright_locator_text_content", "playwright_locator_inner_text", "playwright_locator_get_attribute", "playwright_locator_is_visible", "playwright_locator_is_enabled", "playwright_locator_all_text_contents", "playwright_locator_read_all"],
  setup:{page:"/read.html",state:{}},
  cells:[
  {
    "label": "count",
    "code": "return await tab.playwright.locator('.item').count();"
  },
  {
    "label": "text",
    "code": "return await tab.playwright.locator('.item').first().textContent();"
  },
  {
    "label": "inner",
    "code": "return await tab.playwright.locator('.item').nth(1).innerText();"
  },
  {
    "label": "attribute",
    "code": "return await tab.playwright.locator('.item').first().getAttribute('data-note');"
  },
  {
    "label": "visible",
    "code": "return [await tab.playwright.locator('#enabled').isVisible(),await tab.playwright.locator('#hidden').isVisible(),await tab.playwright.locator('#absent').isVisible()];"
  },
  {
    "label": "enabled",
    "code": "return [await tab.playwright.locator('#enabled').isEnabled(),await tab.playwright.locator('#disabled').isEnabled()];"
  },
  {
    "label": "all-text",
    "code": "return await tab.playwright.locator('.item').allTextContents();"
  },
  {
    "label": "read-all",
    "code": "const items=await tab.playwright.locator('.item').all();return await Promise.all(items.map(i=>i.textContent()));"
  }
],
  assert:expectValues({count:2,text:'Alpha',inner:'Beta',attribute:'stable',visible:[true,false,false],enabled:[true,false],'all-text':['Alpha','Beta'],'read-all':['Alpha','Beta']}),
};
