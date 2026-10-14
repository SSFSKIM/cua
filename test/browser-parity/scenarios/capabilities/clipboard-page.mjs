import {expectValues} from '../../support/assertions.mjs';
// The page's own navigator.clipboard, served from the browser service's virtual clipboard by its page bridge: a
// clipboard command installs the bridge, then the page reads what the agent wrote and the agent reads what the page
// wrote. The fixture's buttons refuse to touch navigator.clipboard without the bridge, so the machine's clipboard is
// never read or written.
export default {
  id:'capabilities/clipboard-page',milestone:'M2',commands:['tab_clipboard_write_text','tab_clipboard_read_text'],
  setup:{page:'/clipboard-page.html',state:{}},
  cells:[
    {label:'page-reads',code:"await tab.clipboard.writeText('from agent');await tab.playwright.locator('#paste').click();await tab.playwright.locator('#pasted[data-pasted=yes]').waitFor({state:'attached',timeoutMs:3000});return await tab.playwright.locator('#pasted').textContent();"},
    {label:'page-writes',code:"await tab.playwright.locator('#copy').click();await tab.playwright.locator('#pasted[data-copied=yes]').waitFor({state:'attached',timeoutMs:3000});return await tab.clipboard.readText();"},
  ],
  assert:expectValues({'page-reads':'from agent','page-writes':'from page'},
    s=>s.events.some(e=>e.pasted==='from agent')&&s.events.some(e=>e.copied===true)&&!s.events.some(e=>e.bridge===false||e.copyError||e.pasteError)),
};
