import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"dialogs/prompt", milestone:"M2", commands:["tab_get_js_dialog", "tab_handle_js_dialog"],
  setup:{page:"/dialogs.html",state:{}},
  cells:[
  {
    "label": "open",
    "code": "await tab.playwright.locator('#prompt').click();return true;"
  },
  {
    "label": "accept",
    "code": "let dialog;for(const deadline=Date.now()+3000;!dialog&&Date.now()<deadline;){dialog=await tab.getJsDialog();if(!dialog)await new Promise(r=>setTimeout(r,25));}if(dialog?.type!=='prompt')throw new Error('expected prompt');await dialog.accept('parity');return await tab.playwright.locator('#result').textContent();"
  }
],
  assert:expectValues({open:true,accept:'parity'}),
};
