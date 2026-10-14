import {expectError} from '../../support/assertions.mjs';
export default {
  id:"capabilities/export-rejections", milestone:"M3", commands:["tab_content_export_gsuite", "tab_content_export_youtube_transcript"],
  setup:{page:"/counter.html",state:{}},
  cells:[
  {
    "label": "gsuite",
    "code": "return await tab.content.exportGsuite('pdf');"
  },
  {
    "label": "youtube",
    "code": "return await tab.content.exportYouTubeTranscript();"
  },
  {
    "label": "format",
    "code": "return await tab.content.exportGsuite('html');"
  }
],
  // The client sends the format unchecked; the service checks it before reading the tab (BS:54375-54377, HY).
  assert:({results,service})=>({ok:expectError(results,'gsuite',/Tab is not a Google Workspace document/,['Error'])&&expectError(results,'youtube',/Tab is not a supported YouTube watch page/,['Error'])
    &&expectError(results,'format',/^tab_content_export_gsuite requires supported format$/,['Error'])}),
};
