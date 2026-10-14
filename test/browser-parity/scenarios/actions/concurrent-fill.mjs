import {expectValues} from '../../support/assertions.mjs';
// Two fills started together in one document: each value lands in its own field (on cua each fill selects and pastes
// in one queued operation, its paste checked against its own field).
export default {
  id:'actions/concurrent-fill',milestone:'M1c',commands:['playwright_locator_fill'],
  setup:{page:'/fill-pair.html',state:{}},
  cells:[
    {label:'both',code:"const first=tab.playwright.locator('#first'),second=tab.playwright.locator('#second');await Promise.all([first.fill('one'),second.fill('two')]);await tab.playwright.locator('html[data-recorded-first=\"one\"][data-recorded-second=\"two\"]').waitFor({state:'attached',timeoutMs:3000});return [await first.evaluate(e=>e.value),await second.evaluate(e=>e.value)];"},
  ],
  assert:expectValues({both:['one','two']},s=>s.events.some(e=>e.first==='one')&&s.events.some(e=>e.second==='two')&&!s.events.some(e=>e.first==='two'||e.second==='one')),
};
