import {expectValues} from '../../support/assertions.mjs';
export default {
  id:'waits/page',milestone:'M1c',commands:['playwright_wait_for_url','playwright_wait_for_load_state','playwright_wait_for_timeout'],
  setup:{page:'/waits.html',state:{}},
  cells:[
    {label:'url',code:"const waiting=tab.playwright.waitForURL(fixtureURL+'/wait-target.html',{timeoutMs:2500});const trigger=tab.playwright.locator('#start-url').click();await waiting;const path=new URL(await tab.url()).pathname;await trigger;return path;"},
    {label:'load',code:"const navigating=Promise.resolve(tab.goto(fixtureURL+'/loading.html'));navigating.catch(()=>{});let pending=false;for(const deadline=Date.now()+2500;!pending&&Date.now()<deadline;){try{pending=await tab.playwright.evaluate('!!document.getElementById(\"pending-load\") && document.readyState !== \"complete\"');}catch(e){if(!/context|navigation|destroyed/i.test(e.message))throw e;}if(!pending)await new Promise(r=>setTimeout(r,20));}if(!pending){await navigating;throw new Error('fixture never exposed a pending load');}await tab.playwright.waitForLoadState({state:'load',timeoutMs:2500});const state=await tab.playwright.evaluate('document.readyState');await navigating;return {pending,state};"},
    {label:'delay',code:"const started=Date.now();await tab.playwright.waitForTimeout(250);return Date.now()-started>=200;"},
  ],
  assert:expectValues({url:'/wait-target.html',load:{pending:true,state:'complete'},delay:true}),
};
