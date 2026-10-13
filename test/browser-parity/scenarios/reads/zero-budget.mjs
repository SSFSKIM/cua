import {expectError} from '../../support/assertions.mjs';
// An explicit zero budget on a locator read reaches the service (the REPL client sends the command without checking
// its schema): one resolution attempt, as the vendor's qe(0) makes it (on cua bounded by 3 s, the M1b ruling), so an
// element that is there is read and one that is not fails at once with the 0 ms sentence.
export default {
  id:'reads/zero-budget',milestone:'M1b',commands:['playwright_locator_text_content'],
  setup:{page:'/read.html',state:{}},
  cells:[
    {label:'present',code:"return await tab.playwright.locator('#enabled').textContent({timeoutMs:0});"},
    {label:'missing',code:"return await tab.playwright.locator('#absent').textContent({timeoutMs:0});"},
    {label:'default',code:"return await tab.playwright.locator('#enabled').textContent();"},
  ],
  assert:({results})=>({ok:results[0]?.ok===true&&results[0].value==='Enabled'
    &&expectError(results,'missing',/^Timed out after 0ms waiting for selector #absent: .*No element matched selector/)
    &&results[2]?.ok===true&&results[2].value==='Enabled'}),
};
