import {dragBoxPlan} from '../../drag-rules.mjs';
import {taskPage,startCells,outcomeCell,episodeAssert} from '../../episode.mjs';
const boxes = "const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};return {small:rect('#draggableSmall'),large:rect('#draggableLarge')};";
export default {
  id: 'bench/drag-box', milestone: 'M5',
  commands: ['create_tab', 'navigate_tab_url', 'name_session', 'playwright_locator_click', 'playwright_locator_inner_text', 'playwright_evaluate', 'cua_drag', 'tab_dev_logs'],
  setup: {page: taskPage('drag-box'), open: 'goto'},
  cells: [
    ...startCells,
    {label: 'rects', code: `globalThis.benchBoxes=await tab.playwright.evaluate(()=>{${boxes}});return benchBoxes;`},
    {label: 'drag', code: `const plan=(${dragBoxPlan})(benchQuery,benchBoxes.small,benchBoxes.large);await tab.cua.drag({path:plan.path});return plan;`},
    {label: 'rects-after', code: `return await tab.playwright.evaluate(()=>{${boxes}});`},
    {label: 'submit', code: "await tab.playwright.locator('#subbtn').click();return true;"},
    outcomeCell,
  ],
  assert: episodeAssert,
};
