import {expectError} from '../../support/assertions.mjs';
// Every attached tab's document responses are paused and released by the browser service (Decision Log 2026-10-14,
// the session on the document-response pause): a bare navigation to a response Chrome would download, with no
// download wait armed, is failed with BlockedByClient on both services; the tab stays usable; with a wait armed the
// same navigation downloads the file.
export default {
  id:'downloads/blocked-navigation',milestone:'M2',commands:['playwright_wait_for_download'],
  setup:{page:'/downloads.html',state:{}},
  cells:[
    // The sentence names the run's tab id, masked so the two services' sentences compare.
    {label:'bare',code:"try{await tab.goto(fixtureURL+'/download');}catch(e){throw new Error(e.message.replace(/ in tab \\d+\\./,' in tab <tab>.'));}return await tab.url();"},
    {label:'usable',code:"await tab.goto(fixtureURL+'/counter.html');return await tab.playwright.locator('#value').textContent();"},
    {label:'armed',code:"const waiting=tab.playwright.waitForEvent('download',{timeoutMs:10000});const [download,navigation]=await Promise.all([waiting,tab.goto(fixtureURL+'/download').then(()=>'loaded',e=>e.message)]);const path=await download.path({timeoutMs:10000});return {navigation:typeof navigation,downloaded:typeof path==='string'&&/\\/parity(?: \\(\\d+\\))?\\.txt$/.test(path)};"},
  ],
  assert:({results})=>({ok:expectError(results,'bare',/^Browser Use cannot open http:\/\/[^ ]+\/download in tab <tab>\. Browser reported: net::ERR_BLOCKED_BY_CLIENT$/)&&results[1]?.ok&&results[1].value==='Counter fixture'
    &&results[2]?.ok&&results[2].value?.downloaded===true}),
};
