// Acceptance 1, a one-off live check (not a corpus case): nytimes.com opens and an Opinion link click navigates; the
// vendor ends with its site-status refusal.
export default {
  id:'acceptance/nytimes',milestone:'M1c',commands:['create_tab','playwright_locator_click'],
  setup:{page:'/counter.html',state:{}},
  cells:[
    {label:'open',timeoutMs:90000,code:"globalThis.ny=await cua.createBrowserTab(browser.browserId,'https://www.nytimes.com/');return {url:await ny.url(),title:await ny.title()};"},
    {label:'opinion',timeoutMs:90000,code:"const before=await ny.url();await ny.playwright.getByRole('link',{name:/Opinion/i}).first().click();await ny.playwright.waitForURL('**/opinion**',{timeoutMs:20000});return {before,after:await ny.url(),title:await ny.title()};"},
  ],
  assert:({results,service})=>({ok:service==='cua'?results.every(r=>r.ok)&&/\/opinion/.test(results[1].value.after):results[0]?.ok===false}),
};
