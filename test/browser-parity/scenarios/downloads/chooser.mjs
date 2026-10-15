import {fixtureDownloadPathGuard} from '../../support/fixture-download-name.mjs';
import {expectValues} from '../../support/assertions.mjs';
// The real REPL drains outstanding browser RPCs before completing a cell. Arm and trigger in one cell.
export default {
  id:'downloads/chooser',milestone:'M2',commands:['playwright_wait_for_download','playwright_download_path','playwright_wait_for_file_chooser','playwright_file_chooser_set_files'],
  setup:{page:'/downloads.html',state:{}},
  cells:[
    {label:'download',code:"const waiting=tab.playwright.waitForEvent('download',{timeoutMs:10000});const [value]=await Promise.all([waiting,tab.playwright.locator('#download').click()]);globalThis.download=value;return true;"},
    {label:'path',code:"const path=await download.path({timeoutMs:10000});"+`const expected=${fixtureDownloadPathGuard};`+"if(typeof path!=='string'||!path.startsWith('/')||!expected.test(path))throw new Error('Unexpected fixture download path');const fs=await import('node:fs/promises');const real=await fs.realpath(path);if(!expected.test(real)||(await fs.readFile(real,'utf8'))!=='parity download\\n')throw new Error('Fixture download content differs');globalThis.uploadPath=real;globalThis.uploadName=real.split('/').at(-1);return true;"},
    {label:'chooser-page',code:"await tab.goto(fixtureURL+'/chooser.html');return true;"},
    {label:'chooser',code:"const waiting=tab.playwright.waitForEvent('filechooser',{timeoutMs:10000});const [value]=await Promise.all([waiting,tab.playwright.locator('#file').click()]);globalThis.chooser=value;return chooser.isMultiple();"},
    {label:'set-files',code:"await chooser.setFiles([uploadPath]);await tab.playwright.locator('#filename[data-recorded=yes]').waitFor({state:'visible',timeoutMs:3000});return (await tab.playwright.locator('#filename').textContent())===uploadName;"},
  ],
  assert:expectValues({download:true,path:true,'chooser-page':true,chooser:false,'set-files':true},s=>s.events.some(e=>typeof e.file==='string'&&e.file.length>0)),
};
