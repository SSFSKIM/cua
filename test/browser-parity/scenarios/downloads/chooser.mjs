import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"downloads/chooser", milestone:"M2", commands:["playwright_wait_for_download", "playwright_download_path", "playwright_wait_for_file_chooser", "playwright_file_chooser_set_files"],
  setup:{page:"/downloads.html",state:{}},
  cells:[
  {
    "label": "download-wait",
    "code": "globalThis.download=await tab.playwright.waitForEvent('download',{timeoutMs:10000});return true;",
    "start": true
  },
  {
    "label": "download-trigger",
    "code": "await tab.playwright.locator('#download').click();return true;"
  },
  {
    "label": "download-join",
    "join": "download-wait"
  },
  {
    "label": "path",
    "code": "globalThis.uploadPath=await download.path({timeoutMs:10000});return typeof uploadPath==='string'&&uploadPath.length>0;"
  },
  {
    "label": "chooser-page",
    "code": "await tab.goto(fixtureURL+'/chooser.html');return true;"
  },
  {
    "label": "chooser-wait",
    "code": "globalThis.chooser=await tab.playwright.waitForEvent('filechooser',{timeoutMs:10000});return chooser.isMultiple();",
    "start": true
  },
  {
    "label": "chooser-trigger",
    "code": "await tab.playwright.locator('#file').click();return true;"
  },
  {
    "label": "chooser-join",
    "join": "chooser-wait"
  },
  {
    "label": "set-files",
    "code": "await chooser.setFiles([uploadPath]);return (await tab.playwright.locator('#filename').textContent()).length>0;"
  }
],
  assert:expectValues({'download-wait':{started:'download-wait'},'download-trigger':true,'download-join':true,path:true,'chooser-page':true,'chooser-wait':{started:'chooser-wait'},'chooser-trigger':true,'chooser-join':false,'set-files':true},s=>s.events.some(e=>typeof e.file==='string'&&e.file.length>0)),
};
