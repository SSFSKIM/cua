import {expectValues} from '../../support/assertions.mjs';
// Two clipboard shortcuts at once: one waits in the virtual clipboard's queue while the other runs, and both paste.
export default {
  id:'input/queued-shortcuts',milestone:'M1c',commands:['playwright_locator_press'],
  setup:{page:'/typing.html',state:{}},
  cells:[
    {label:'copy',code:"const source=tab.playwright.locator('#copy-src');await source.press('ControlOrMeta+a');await source.press('ControlOrMeta+c');return await source.evaluate(e=>e.value.slice(e.selectionStart,e.selectionEnd));"},
    {label:'queued',code:"const a=tab.playwright.locator('#paste-a'),b=tab.playwright.locator('#paste-b');await Promise.all([a.press('ControlOrMeta+v'),b.press('ControlOrMeta+v')]);await tab.playwright.locator('html[data-recorded-pastea=\"queued\"][data-recorded-pasteb=\"queued\"]').waitFor({state:'attached',timeoutMs:3000});return [await a.evaluate(e=>e.value),await b.evaluate(e=>e.value)];"},
  ],
  assert:expectValues({copy:'queued',queued:['queued','queued']},s=>s.events.some(e=>e.pasteA==='queued')&&s.events.some(e=>e.pasteB==='queued')),
};
