import {dragItemsPlan} from '../../drag-rules.mjs';
import {taskPage,startCells,outcomeCell,episodeAssert} from '../../episode.mjs';
export default {
  id: 'bench/drag-items', milestone: 'M5',
  commands: ['create_tab', 'navigate_tab_url', 'name_session', 'playwright_locator_click', 'playwright_locator_inner_text', 'playwright_evaluate', 'cua_drag', 'playwright_locator_all_text_contents', 'tab_dev_logs'],
  setup: {page: taskPage('drag-items'), open: 'goto'},
  cells: [
    ...startCells,
    {label: 'rects', code: "globalThis.benchItems=await tab.playwright.evaluate(()=>[...document.querySelectorAll('#sortable li')].map(li=>{const r=li.getBoundingClientRect();return {text:li.innerText,x:r.x,y:r.y,width:r.width,height:r.height};}));return benchItems;"},
    {label: 'drag', code: `const plan=(${dragItemsPlan})(benchQuery,benchItems);await tab.cua.drag({path:plan.path});return plan;`},
    {label: 'order', code: "return await tab.playwright.locator('#sortable li').allTextContents();"},
    outcomeCell,
  ],
  assert: episodeAssert,
};
