import {expectError} from '../../support/assertions.mjs';
export default {
  id:"dialogs/alert", milestone:"M2", commands:["tab_get_js_dialog", "tab_handle_js_dialog"],
  setup:{page:"/dialogs.html",state:{}},
  cells:[
  {
    "label": "open",
    "code": "await tab.playwright.locator('#alert').click();return true;"
  },
  {
    "label": "get",
    "code": "globalThis.dialog=undefined;for(const deadline=Date.now()+3000;!dialog&&Date.now()<deadline;){dialog=await tab.getJsDialog();if(!dialog)await new Promise(r=>setTimeout(r,25));}return dialog?.type;"
  },
  {
    "label": "blocked",
    "code": "return await tab.playwright.locator('#confirm').click({timeoutMs:500});"
  },
  {
    "label": "dismiss",
    "code": "await dialog.dismiss();return (await tab.getJsDialog())==null;"
  }
],
  assert:({results,service})=>({ok:results[0]?.ok&&results[1]?.ok&&results[1].value==='alert'&&expectError(results,'blocked',service==='vendor'?/Playwright selector deadline exceeded/:/^A alert JavaScript dialog is active in this tab\. Use `tab\.getJsDialog\(\)` to get it and dismiss it first\./,['Error'])&&results[3]?.ok&&results[3].value===true}),
};
