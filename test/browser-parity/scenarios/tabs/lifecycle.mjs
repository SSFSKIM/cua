import {randomUUID} from 'node:crypto';
import {expectValues} from '../../support/assertions.mjs';
import {endTask,drop} from '../../../../scripts/browser-parity/scenario.mjs';
// A unique per-run URL identifies only tabs created by this case across the primary kernel's end_task reset.
const token=randomUUID();
const suffixes=Object.fromEntries(['deliverable','handoff','discard'].map(role=>[role,`/counter.html?parity-lifecycle=${token}&role=${role}`]));
const urls=`const urls=Object.fromEntries(Object.entries(${JSON.stringify(suffixes)}).map(([role,path])=>[role,fixtureURL+path]));`;
export default {
  id:'tabs/lifecycle',milestone:'M1a',commands:['create_tab','get_tab','list_tabs','selected_tab','mark_tab','close_tab','browser_user_open_tabs','browser_user_claim_tab'],
  setup:{page:'/counter.html',state:{}},
  cells:[
    {label:'create',code:"globalThis.extra=await browser.tabs.new();return {tabId:extra.id};"},
    {label:'get',code:"return (await browser.tabs.get(extra.id)).id===extra.id;"},
    {label:'list',code:"return (await browser.tabs.list()).some(t=>t.id===extra.id);"},
    {label:'selected',code:"const selected=await browser.tabs.selected();return selected==null||typeof selected.id==='string';"},
    {label:'user-list',code:"return (await browser.user.openTabs()).filter(t=>t.id===extra.id).map(t=>({owned:true}));"},
    {label:'claim-own',code:"return (await browser.user.claimTab(extra.id)).id===extra.id;"},
    {label:'close',code:"await extra.close();return !(await browser.tabs.list()).some(t=>t.id===extra.id);"},
    {label:'mark',code:urls+"for(const role of ['deliverable','handoff','discard']){const created=await browser.tabs.new();await created.goto(urls[role]);if(role==='deliverable')await created.markDeliverable();if(role==='handoff')await created.markHandoff();}return {created:3};"},
    endTask('end'),
    // Disconnect releases the handed-off lease; a different client can then inspect and clean up the retained tabs.
    drop('release-primary'),
    {label:'retained',client:'observer',code:urls+"const own=(await browser.user.openTabs()).filter(t=>Object.values(urls).includes(t.url));globalThis.lifecycleCleanup=own.map(t=>t.id);return {deliverable:own.filter(t=>t.url===urls.deliverable).length===1,handoff:own.filter(t=>t.url===urls.handoff).length===1,discarded:!own.some(t=>t.url===urls.discard)};"},
    {label:'cleanup',client:'observer',code:"for(const id of lifecycleCleanup){const owned=await browser.user.claimTab(id);await owned.close();}return ![...await browser.user.openTabs(),...await browser.tabs.list()].some(t=>lifecycleCleanup.includes(t.id));"},
  ],
  assert:expectValues({create:v=>typeof v.tabId==='string',get:true,list:true,selected:true,'user-list':v=>Array.isArray(v)&&v.every(t=>t.owned),'claim-own':true,close:true,mark:{created:3},end:v=>v.ended===true,'release-primary':{dropped:true},retained:{deliverable:true,handoff:true,discarded:true},cleanup:true}),
};
