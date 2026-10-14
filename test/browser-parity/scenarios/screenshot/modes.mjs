import {expectValues} from '../../support/assertions.mjs';
// The viewport (a screencast frame, else a capture) and the full page, both JPEG.
const jpeg=v=>v?.type==='image'&&v.mimeType==='image/jpeg'&&typeof v.data==='string'&&v.data.length>100;
export default {
  id:'screenshot/modes',milestone:'M1c',commands:['tab_screenshot'],
  setup:{page:'/screenshot.html',state:{}},
  screenshotTolerance:4,
  cells:[
    {label:'viewport',code:"return await tab.screenshot();"},
    {label:'full',code:"return await tab.screenshot({fullPage:true});"},
  ],
  assert:expectValues({viewport:jpeg,full:jpeg}),
};
