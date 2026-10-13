import {expectValues} from '../../support/assertions.mjs';
export default {
  id:'capabilities/cursor',milestone:'M2',commands:['cua_move'],setup:{page:'/input.html',state:{}},
  cells:[{label:'move',code:"await tab.cua.move({x:50,y:40});await tab.cua.move({x:140,y:60});await tab.playwright.getByText('140,60',{exact:true}).waitFor({state:'visible',timeoutMs:1500});return await tab.playwright.locator('#pointer').textContent();"}],
  assert:expectValues({move:'140,60'},s=>s.events.some(e=>e.pointer?.x===140&&e.pointer?.y===60)),
};
