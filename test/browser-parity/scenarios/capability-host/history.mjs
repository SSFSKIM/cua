// User history's success path on the capability host (test/browser-parity/capability-host.mjs), which answers
// getUserHistory from the query it was sent (one visit per query, cut to the limit), so a request that never reached
// the host cannot pass. Runs only with `run --device local --backend capability-host`.
import {expectValues} from '../../support/assertions.mjs';
const visit=q=>({dateVisited:'2026-10-14T10:00:00.000Z',title:`History: ${q}`,url:`https://cua-capability.example/history/${q}`});
export default {
  id:'capability-host/history', milestone:'M3', commands:['browser_user_history'], backend:'capability-host',
  setup:{page:'https://cua-capability.example/shop',open:'goto',state:{}},
  cells:[
    {label:'queried',code:"return await browser.history({queries:['lamps','desks'],limit:1});"},
    {label:'unfiltered',code:"return await browser.history({limit:5});"},
  ],
  assert:expectValues({queried:[visit('lamps')],unfiltered:[visit('recent')]}),
};
