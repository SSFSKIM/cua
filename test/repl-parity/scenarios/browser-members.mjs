// All observations come from this task's fixture tabs. Raw MCP content is never rewritten by the adapter.
// Member semantics: surface-inventory.md Table 1, pinned browser-client.js (chatgpt-26.928.40906)
// Tabs 6530-6596; Locator 6790-7458; Frame/Playwright 7565-7897; DOM/CUA 7900-8134;
// Content/clipboard/logs 8326-8470; dialogs/Tab 9241-9559; Documentation.get 6496-6507.
import {caseSchedule,validateRegistry} from '../../../scripts/repl-parity/registry.mjs';
import {cellCode,parseCell} from '../../../scripts/browser-parity/runner.mjs';
import {expectValues} from '../../browser-parity/support/assertions.mjs';
import navigation from '../../browser-parity/scenarios/tabs/navigation.mjs';
import reads from '../../browser-parity/scenarios/reads/locators.mjs';
import evaluate from '../../browser-parity/scenarios/evaluate/read.mjs';
import actions from '../../browser-parity/scenarios/actions/locators.mjs';
import doubleClick from '../../browser-parity/scenarios/actions/doubleclick.mjs';
import waitFor from '../../browser-parity/scenarios/actions/wait-for.mjs';
import coordinates from '../../browser-parity/scenarios/input/coordinates.mjs';
import dom from '../../browser-parity/scenarios/input/dom.mjs';
import cursor from '../../browser-parity/scenarios/capabilities/cursor.mjs';
import clipboard from '../../browser-parity/scenarios/capabilities/clipboard.mjs';
import logs from '../../browser-parity/scenarios/capabilities/logs.mjs';
import exports from '../../browser-parity/scenarios/capabilities/export-rejections.mjs';
import chooser from '../../browser-parity/scenarios/downloads/chooser.mjs';
import media from '../../browser-parity/scenarios/downloads/media.mjs';
import prompt from '../../browser-parity/scenarios/dialogs/prompt.mjs';
import screenshot from '../../browser-parity/scenarios/screenshot/clip.mjs';
import waits from '../../browser-parity/scenarios/waits/page.mjs';

const schedule=new Map(caseSchedule().map(c=>[c.id,c]));
const scenarios=[];
function add(member,source,witnessCells,options={}) {
 const id=`api/browser-${member}`,due=schedule.get(id);
 if(!due)throw new Error(`Unknown browser member ${id}`);
 if(!witnessCells.every(label=>source.cells.some(c=>c.label===label)))throw new Error(`${id}: invalid witness`);
 scenarios.push({...due,backend:'chrome',browserCase:true,corpusCase:source.id,witnessCells,
  setup:{...source.setup,open:'goto',...options.setup},
  ...(options.imageMode?{imageMode:options.imageMode,screenshotTolerance:source.screenshotTolerance??4}:{}),
  cells:source.cells.map(cell=>({...cell,raw:true,code:cellCode(cell)})),
  async assert(input) {
   try {
    if(input.results.length!==source.cells.length)return {ok:false,reason:`${id}: unexpected raw cell count`};
    const results=input.results.map((r,i)=>({cell:source.cells[i].label,...parseCell(r)}));
    return await source.assert({...input,results});
   }catch(error){return {ok:false,reason:`${id}: ${error.message}`};}
  },
 });
}
const fixture=(id,page,cells,expected,state)=>({id,setup:{page,state:{}},cells,assert:expectValues(expected,state)});
const cell=(label,code)=>({label,code});

// Each mapping names the actual member's outcome witness; reusing the corpus retains its side-effect assertions.
for(const [member,label] of [
 ['tab/back','back'],['tab/forward','forward'],['tab/goto','goto'],['tab/reload','reload'],['tab/title','reload'],['tab/url','goto'],
])add(member,navigation,[label]);
for(const [member,label] of [
 ['playwrightlocator/all','read-all'],['playwrightlocator/alltextcontents','all-text'],['playwrightlocator/count','count'],
 ['playwrightlocator/first','text'],['playwrightlocator/getattribute','attribute'],['playwrightlocator/innertext','inner'],
 ['playwrightlocator/isenabled','enabled'],['playwrightlocator/isvisible','visible'],['playwrightlocator/nth','inner'],
 ['playwrightlocator/textcontent','text'],['playwrightapi/locator','count'],
])add(member,reads,[label]);
for(const [member,label] of [
 ['playwrightapi/evaluate','page'],['playwrightlocator/evaluate','node'],['playwrightlocator/evaluateall','all'],['tab/playwright','page'],
])add(member,evaluate,[label]);
for(const [member,label] of [
 ['playwrightlocator/click','click'],['playwrightlocator/fill','fill'],['playwrightlocator/press','press'],
 ['playwrightlocator/presssequentially','press'],['playwrightlocator/selectoption','select'],['playwrightlocator/setchecked','check'],
])add(member,actions,[label]);
add('playwrightlocator/dblclick',doubleClick,['double']);
add('playwrightlocator/waitfor',waitFor,['visible']);
for(const [member,label] of [
 ['cuaapi/click','type'],['cuaapi/type','type'],['cuaapi/keypress','end-key'],['cuaapi/double-click','double'],
 ['cuaapi/drag','drag'],['cuaapi/scroll','scroll'],['tab/cua','type'],
])add(member,coordinates,[label]);
for(const [member,label] of [
 ['domcuaapi/click','type'],['domcuaapi/type','type'],['domcuaapi/keypress','end-key'],['domcuaapi/double-click','double'],
 ['domcuaapi/scroll','scroll'],['domcuaapi/get-visible-dom','nodes'],['tab/dom-cua','type'],
])add(member,dom,[label]);
add('cuaapi/move',cursor,['move']);
for(const member of ['tab/clipboard','tabclipboardapi/readtext','tabclipboardapi/writetext'])add(member,clipboard,['text']);
for(const member of ['tabclipboardapi/read','tabclipboardapi/write'])add(member,clipboard,['rich']);
for(const member of ['tab/dev','tabdevapi/logs'])add(member,logs,['logs']);
for(const [member,label] of [
 ['contentapi/exportgsuite','gsuite'],['contentapi/exportyoutubetranscript','youtube'],['tab/content','gsuite'],
])add(member,exports,[label]);
for(const [member,label] of [
 ['playwrightapi/waitforevent','download'],['playwrightdownload/path','path'],
 ['playwrightfilechooser/ismultiple','chooser'],['playwrightfilechooser/setfiles','set-files'],
])add(member,chooser,[label]);
add('playwrightlocator/downloadmedia',media,['media']);
for(const [member,label] of [
 ['playwrightapi/waitforurl','url'],['playwrightapi/waitforloadstate','load'],['playwrightapi/waitfortimeout','delay'],
])add(member,waits,[label]);
add('promptdialog/accept',prompt,['accept']);
add('tab/screenshot',screenshot,['clip'],{imageMode:'live'});

// Unlike the corpus lifecycle case, do not hand off or retain tabs and do not emit generated IDs.
const tabs=fixture('members/tabs','/counter.html',[
 cell('new',"globalThis.memberTab=await browser.tabs.new();await memberTab.goto(fixtureURL+'/read.html');return {distinct:typeof memberTab.id==='string'&&memberTab.id!==tab.id,path:new URL(await memberTab.url()).pathname};"),
 cell('get',"const found=await browser.tabs.get(memberTab.id);return {same:found.id===memberTab.id,title:await found.title()};"),
 cell('list',"return (await browser.tabs.list()).filter(t=>t.id===memberTab.id).map(t=>({same:true,path:new URL(t.url).pathname,title:t.title}));"),
 cell('selected',"const selected=await browser.tabs.selected();const own=await browser.tabs.list();return selected===undefined?{absent:true,fixturePresent:own.some(t=>t.id===tab.id)}:{absent:false,managed:own.some(t=>t.id===selected.id)};"),
 cell('close',"await memberTab.close();return !(await browser.tabs.list()).some(t=>t.id===memberTab.id);"),
],{new:{distinct:true,path:'/read.html'},get:{same:true,title:'Browser parity fixture'},list:[{same:true,path:'/read.html',title:'Browser parity fixture'}],selected:v=>v?.absent===true?v.fixturePresent===true:v?.absent===false&&v.managed===true,close:true});
for(const [member,label] of [['tabs/new','new'],['tabs/get','get'],['tabs/list','list'],['tabs/selected','selected'],['tab/id','get'],['tab/close','close']])add(member,tabs,[label]);

const capabilities=fixture('members/tab-capabilities','/counter.html',[
 cell('capabilities',"const list=await tab.capabilities.list();if(!Array.isArray(list)||!list.every(c=>typeof c.id==='string'&&c.id.length>0&&typeof c.description==='string')||new Set(list.map(c=>c.id)).size!==list.length)throw new Error('invalid capability collection');try{await tab.capabilities.get('__repl_member_missing__');throw new Error('missing capability unexpectedly available');}catch(e){if(e.message!=='Capability is not available: __repl_member_missing__')throw e;}return {valid:true,fixture:await tab.title()};"),
],{capabilities:{valid:true,fixture:'Browser parity fixture'}});
add('tab/capabilities',capabilities,['capabilities']);

const snapshot=fixture('members/snapshot','/read.html',[
 cell('snapshot','return await tab.playwright.domSnapshot();'),
],{snapshot:v=>typeof v==='string'&&v.includes('Read fixture')&&v.includes('Alpha')&&v.includes('Beta')&&v.includes('Enabled')});
// createBrowserTab installs the initial decorated-tab snapshot; keep that dependency explicit.
add('playwrightapi/domsnapshot',snapshot,['snapshot'],{setup:{open:'createBrowserTab'}});

const compositions=fixture('members/locator-composition','/read.html',[
 cell('and',"return await tab.playwright.locator('.item').and(tab.playwright.locator('[data-note=stable]')).textContent();"),
 cell('or',"return await tab.playwright.locator('[data-note=stable]').or(tab.playwright.locator('.item').last()).allTextContents();"),
 cell('filter',"return await tab.playwright.locator('.item').filter({hasText:'Beta'}).textContent();"),
 cell('last',"return await tab.playwright.locator('.item').last().textContent();"),
],{and:'Alpha',or:['Alpha','Beta'],filter:'Beta',last:'Beta'});
for(const name of ['and','or','filter','last'])add(`playwrightlocator/${name}`,compositions,[name]);

// The same labels/test IDs occur outside #scope and outside the frame, so wrong scoping cannot pass.
const selectors=fixture('members/selectors','/repl-members.html',[
 cell('p-label',"return await tab.playwright.getByLabel('Member field',{exact:true}).nth(1).getAttribute('id');"),
 cell('p-placeholder',"return await tab.playwright.getByPlaceholder('Member placeholder',{exact:true}).nth(1).getAttribute('id');"),
 cell('p-role',"return await tab.playwright.getByRole('button',{name:'Member button',exact:true}).nth(1).getAttribute('data-testid');"),
 cell('p-testid',"return await tab.playwright.getByTestId('member-input').nth(1).getAttribute('id');"),
 cell('p-text',"return await tab.playwright.getByText('Scoped Alpha',{exact:true}).textContent();"),
 cell('l-label',"return await tab.playwright.locator('#scope').getByLabel('Member field',{exact:true}).getAttribute('id');"),
 cell('l-placeholder',"return await tab.playwright.locator('#scope').getByPlaceholder('Member placeholder').getAttribute('id');"),
 cell('l-role',"return await tab.playwright.locator('#scope').getByRole('button',{name:'Member button',exact:true}).getAttribute('data-testid');"),
 cell('l-testid',"return await tab.playwright.locator('#scope').getByTestId('member-input').getAttribute('id');"),
 cell('l-text',"return await tab.playwright.locator('#scope').getByText('Scoped Beta',{exact:true}).textContent();"),
 cell('l-locator',"return await tab.playwright.locator('#scope').locator('.member-item').allTextContents();"),
 cell('f-label',"return await tab.playwright.frameLocator('#member-frame').getByLabel('Member field',{exact:true}).getAttribute('id');"),
 cell('f-placeholder',"return await tab.playwright.frameLocator('#member-frame').getByPlaceholder('Member placeholder',{exact:true}).getAttribute('id');"),
 cell('f-role',"return await tab.playwright.frameLocator('#member-frame').getByRole('button',{name:'Member button',exact:true}).getAttribute('data-testid');"),
 cell('f-testid',"return await tab.playwright.frameLocator('#member-frame').getByTestId('member-input').getAttribute('id');"),
 cell('f-text',"return await tab.playwright.frameLocator('#member-frame').getByText('Frame Alpha',{exact:true}).textContent();"),
 cell('f-locator',"return await tab.playwright.frameLocator('#member-frame').locator('.member-item').textContent();"),
 cell('f-nested',"return await tab.playwright.frameLocator('#member-frame').frameLocator('#inner').locator('#nested-member').textContent();"),
],{'p-label':'scoped-input','p-placeholder':'scoped-input','p-role':'member-button','p-testid':'scoped-input','p-text':'Scoped Alpha',
 'l-label':'scoped-input','l-placeholder':'scoped-input','l-role':'member-button','l-testid':'scoped-input','l-text':'Scoped Beta','l-locator':['Scoped Alpha','Scoped Beta'],
 'f-label':'frame-input','f-placeholder':'frame-input','f-role':'member-button','f-testid':'frame-input','f-text':'Frame Alpha','f-locator':'Frame Alpha','f-nested':'Nested member fixture'});
for(const [member,label] of [
 ['playwrightapi/getbylabel','p-label'],['playwrightapi/getbyplaceholder','p-placeholder'],['playwrightapi/getbyrole','p-role'],['playwrightapi/getbytestid','p-testid'],['playwrightapi/getbytext','p-text'],['playwrightapi/framelocator','f-text'],
 ['playwrightlocator/getbylabel','l-label'],['playwrightlocator/getbyplaceholder','l-placeholder'],['playwrightlocator/getbyrole','l-role'],['playwrightlocator/getbytestid','l-testid'],['playwrightlocator/getbytext','l-text'],['playwrightlocator/locator','l-locator'],
 ['playwrightframelocator/getbylabel','f-label'],['playwrightframelocator/getbyplaceholder','f-placeholder'],['playwrightframelocator/getbyrole','f-role'],['playwrightframelocator/getbytestid','f-testid'],['playwrightframelocator/getbytext','f-text'],['playwrightframelocator/locator','f-locator'],['playwrightframelocator/framelocator','f-nested'],
])add(member,selectors,[label]);

const checks=fixture('members/check-uncheck','/controls.html',[
 cell('check',"await tab.playwright.locator('#check').check();await tab.playwright.locator('html[data-recorded-checked=true]').waitFor({state:'attached',timeoutMs:3000});return await tab.playwright.locator('#check').evaluate(e=>e.checked);"),
 cell('uncheck',"await tab.playwright.locator('#check').uncheck();await tab.playwright.locator('html[data-recorded-checked=false]').waitFor({state:'attached',timeoutMs:3000});return await tab.playwright.locator('#check').evaluate(e=>e.checked);"),
],{check:true,uncheck:false},s=>s.events.some(e=>e.checked===true)&&s.events.some(e=>e.checked===false));
for(const member of ['check','uncheck'])add(`playwrightlocator/${member}`,checks,[member]);
const typing=fixture('members/type','/controls.html',[
 cell('type',"await tab.playwright.locator('#text').fill('seed');await tab.playwright.locator('#text').type(' tail');await tab.playwright.locator('html[data-recorded-text=\"seed tail\"]').waitFor({state:'attached',timeoutMs:3000});return await tab.playwright.locator('#text').evaluate(e=>e.value);"),
],{type:'seed tail'},s=>s.events.some(e=>e.text==='seed tail'));
add('playwrightlocator/type',typing,['type']);

const expectation=fixture('members/expect-navigation','/counter.html',[
 cell('navigation',"await tab.playwright.expectNavigation(()=>tab.playwright.locator('#navigate').click(),{url:fixtureURL+'/counter.html?navigated=1',waitUntil:'load',timeoutMs:5000});return {path:new URL(await tab.url()).pathname,query:new URL(await tab.url()).search,content:await tab.playwright.locator('#value').textContent()};"),
],{navigation:{path:'/counter.html',query:'?navigated=1',content:'Counter fixture'}},s=>s.counter===1);
add('playwrightapi/expectnavigation',expectation,['navigation']);

// Service-unreachable optional members are owned by capability-api.mjs as explicit boundary-double proofs:
// PlaywrightAPI.elementInfo/elementScreenshot and CUAAPI/DomCUAAPI.downloadMedia. They are not live failures.

const pollDialog="let dialog;for(const deadline=Date.now()+3000;!dialog&&Date.now()<deadline;){dialog=await tab.getJsDialog();if(!dialog)await new Promise(r=>setTimeout(r,25));}";
function dialogCase(kind,action,result) {
 return fixture(`members/${kind}-${action}`,'/repl-dialogs.html',[
  cell('open',`await tab.playwright.locator('#${kind}').click();return true;`),
  cell('dialog',pollDialog+`if(dialog?.type!==${JSON.stringify(kind)})throw new Error('wrong dialog type');const type=dialog.type;await dialog.${action}();await tab.playwright.locator('#result[data-recorded=yes]').waitFor({state:'attached',timeoutMs:3000});return {type,result:await tab.playwright.locator('#result').textContent(),cleared:(await tab.getJsDialog())===undefined};`),
 ],{open:true,dialog:{type:kind,result:result==null?'':String(result),cleared:true}},s=>s.events.some(e=>e.dialog===kind&&e.result===result));
}
const alert=dialogCase('alert','dismiss','closed');
for(const member of ['alertdialog/type','alertdialog/dismiss'])add(member,alert,['dialog']);
const confirmAccept=dialogCase('confirm','accept',true),confirmDismiss=dialogCase('confirm','dismiss',false);
for(const member of ['confirmdialog/type','confirmdialog/accept'])add(member,confirmAccept,['dialog']);
add('confirmdialog/dismiss',confirmDismiss,['dialog']);
const promptDismiss=dialogCase('prompt','dismiss',null);
for(const member of ['promptdialog/type','promptdialog/dismiss'])add(member,promptDismiss,['dialog']);
// The retained service automatically accepts beforeunload (BS:48659-48733; cua cdp.mjs:978-1002).
// Do not race its handler or expect dismiss() to keep the old document. The ephemeral subtype's client proof is
// owned by capability-api.mjs; this real Chrome supplement verifies navigation, fixture DOM and cleared dialog.
const getJsDialog=fixture('members/get-js-dialog','/repl-dialogs.html',[
 ...alert.cells,
 cell('beforeunload-page',"await tab.goto(fixtureURL+'/repl-beforeunload.html');return true;"),
 cell('arm',"await tab.playwright.locator('#arm').click();await tab.playwright.getByText('armed',{exact:true}).waitFor({state:'visible',timeoutMs:3000});return true;"),
 cell('navigation',"const waiting=tab.playwright.waitForURL(fixtureURL+'/counter.html?left=1',{waitUntil:'load',timeoutMs:5000});await tab.playwright.locator('#leave').click();await waiting;const url=new URL(await tab.url());return {path:url.pathname,query:url.search};"),
 cell('autoaccepted',"return {cleared:(await tab.getJsDialog())===undefined,fixture:await tab.playwright.locator('#value').textContent()};"),
],{open:true,dialog:{type:'alert',result:'closed',cleared:true},'beforeunload-page':true,arm:true,navigation:{path:'/counter.html',query:'?left=1'},autoaccepted:{cleared:true,fixture:'Counter fixture'}},s=>s.events.some(e=>e.dialog==='alert'&&e.result==='closed')&&s.events.some(e=>e.armed===true));
add('tab/getjsdialog',getJsDialog,['dialog','autoaccepted']);

// Whole retained documentation text, pinned to browser-desktop/environment-docs/codex-app/screenshots.md.
const screenshotsDoc='# Screenshots\n* Browser screenshots are JPEG: use `.jpg` and `image/jpeg`.\n* If you take a screenshot that the user should see, include the image inline in your Markdown response using Markdown image syntax so the image renders, rather than as a bare link:\n  ```md\n  ![screenshot](IMAGE_LINK)\n  ```\n* IMPORTANT: If the user has asked you to take screenshots, you MUST include them as part of your final markdown response.\n* If the user has asked you to test a website as part of development, you should take screenshots at key moments and include them in your final response.\n';
const documentation=fixture('members/documentation','/counter.html',[
 cell('documentation',`const text=await agent.documentation.get('screenshots');return {exact:text===${JSON.stringify(screenshotsDoc)},fixture:await tab.title()};`),
],{documentation:{exact:true,fixture:'Browser parity fixture'}});
add('documentation/get',documentation,['documentation']);

export default validateRegistry(scenarios);
