import {expectError} from '../../support/assertions.mjs';
// An explicit zero budget on a locator read. The service's rule (the M1b ruling: timeout_ms 0 is one resolution
// attempt bounded by 3 s) is for direct callers: the unchanged REPL client's schemas take only a positive timeout_ms,
// so through the model's API a zero is refused before any command is sent, on both services alike.
export default {
  id:'reads/zero-budget',milestone:'M1b',commands:['playwright_locator_text_content'],
  setup:{page:'/read.html',state:{}},
  cells:[
    {label:'present',code:"return await tab.playwright.locator('#enabled').textContent({timeoutMs:0});"},
    {label:'missing',code:"return await tab.playwright.locator('#absent').textContent({timeoutMs:0});"},
    {label:'default',code:"return await tab.playwright.locator('#enabled').textContent();"},
  ],
  assert:({results})=>({ok:expectError(results,'present',/greater than 0|too_small|positive/i)&&expectError(results,'missing',/greater than 0|too_small|positive/i)
    &&results[2]?.ok===true&&results[2].value==='Enabled'}),
};
