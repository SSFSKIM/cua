import {randomUUID} from 'node:crypto';
import {endTask,drop} from '../../../../scripts/browser-parity/scenario.mjs';
// A document response that arrives while a JavaScript dialog is open stays paused (the service's release is refused
// while the dialog blocks the tab's commands) after the dialog is dismissed, until the tab is detached at the turn's
// end; then the navigation completes. The vendor's behaviour, kept (Decision Log 2026-10-14, the session on the
// document-response pause; a candidate lift for #116). A unique token identifies this case's tab and page.
const token=randomUUID();
export default {
  id:'dialogs/paused-response',milestone:'M2',commands:['tab_get_js_dialog','tab_handle_js_dialog'],
  setup:{page:`/paused-navigation.html?token=${token}`,state:{}},
  cells:[
    {label:'start',code:"await tab.playwright.locator('#go').click();return true;"},
    // The alert opens about 500 ms after the click and the response arrives about 1,200 ms after it: the dialog is
    // held open past the response.
    {label:'dialog',code:"const started=Date.now();globalThis.dialog=undefined;while(!dialog&&Date.now()-started<5000){dialog=await tab.getJsDialog();if(!dialog)await new Promise(r=>setTimeout(r,25));}await new Promise(r=>setTimeout(r,2500));return dialog?.type;"},
    {label:'dismiss',code:"await dialog.dismiss();return (await tab.getJsDialog())==null;"},
    // Still the first document, 2.5 s after the response was sent (the tab's title and committed URL, which the host
    // reads from Chrome's tab, not the page: a page call would wait on the paused navigation).
    {label:'paused',code:"await new Promise(r=>setTimeout(r,2500));return {title:await tab.title(),path:new URL(await tab.url()).pathname};"},
    {label:'mark',code:"await tab.markDeliverable();return true;"},
    endTask('end'),
    drop('release-primary'),
    {label:'arrived',client:'observer',code:`const started=Date.now();let tab;while(!tab&&Date.now()-started<10000){tab=(await browser.user.openTabs()).find(t=>t.title==='Arrived'&&String(t.url).includes(${JSON.stringify(token)}));if(!tab)await new Promise(r=>setTimeout(r,100));}if(!tab)return {arrived:false};const owned=await browser.user.claimTab(tab.id);await owned.close();return {arrived:true,closed:!(await browser.user.openTabs()).some(t=>String(t.url).includes(${JSON.stringify(token)}))};`},
  ],
  assert:({results,fixtureState})=>{
    const value=label=>results.find(r=>r.cell===label);
    const ok=['start','dialog','dismiss','paused','mark','end','release-primary','arrived'].every(label=>value(label)?.ok)
      &&value('dialog').value==='alert'&&value('dismiss').value===true
      &&value('paused').value?.title==='Browser parity fixture'&&value('paused').value?.path==='/paused-navigation.html'
      &&value('arrived').value?.arrived===true&&value('arrived').value?.closed===true
      &&fixtureState.events.some(e=>e.responded===token)&&fixtureState.events.some(e=>e.arrived===token);
    return ok?{ok:true}:{ok:false,reason:JSON.stringify(results.map(r=>[r.cell,r.ok,r.value??r.error?.message]))};
  },
};
