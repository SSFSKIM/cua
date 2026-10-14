import {expectValues} from '../../support/assertions.mjs';
// cua_type's rich text is the vendor's Markdown rendering (markdown-it): typed into a rich editor, the Markdown syntax
// arrives as bold, a list and a link.
const html=v=>typeof v==='string'&&v.includes('<strong>world</strong>')&&v.includes('<li>first item</li>')&&v.includes('<li>second item</li>')&&v.includes('<a href="https://example.com/docs">the docs</a>')&&!v.includes('**');
export default {
  id:'input/rich-text',milestone:'M1c',commands:['cua_type'],
  setup:{page:'/typing.html',state:{}},
  cells:[
    {label:'markdown',code:"await tab.playwright.locator('#editor').click();await tab.cua.type({text:'Hello **world**\\n\\n- first item\\n- second item\\n\\nSee [the docs](https://example.com/docs).'});await tab.playwright.locator('html[data-recorded-editor]').waitFor({state:'attached',timeoutMs:3000});return await tab.playwright.locator('#editor').evaluate(e=>e.innerHTML);"},
  ],
  assert:expectValues({markdown:html},s=>html(s.events.filter(e=>'editor' in e).at(-1)?.editor)),
};
