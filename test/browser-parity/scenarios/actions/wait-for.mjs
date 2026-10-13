import {expectValues} from '../../support/assertions.mjs';
export default {
  id:'actions/wait-for',milestone:'M1c',commands:['playwright_locator_wait_for'],
  setup:{page:'/locator-wait.html',state:{}},
  cells:[{label:'visible',code:"const output=tab.playwright.locator('#wait-result');if(await output.textContent()!=='')throw new Error('fixture was not pending');const waiting=output.waitFor({state:'visible',timeoutMs:2500});const trigger=tab.playwright.locator('#start-wait').click();await waiting;const value=await output.textContent();await trigger;return value;"}],
  assert:expectValues({visible:'ready'}),
};
