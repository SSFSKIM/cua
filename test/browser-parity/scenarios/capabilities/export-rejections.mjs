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
  }
],
  assert:({results,service})=>({ok:expectError(results,'gsuite',/Tab is not a Google Workspace document/,service==='vendor'?['Error']:['invalid_url','unsupported_protocol'])&&expectError(results,'youtube',/Tab is not a supported YouTube watch page/,service==='vendor'?['Error']:['invalid_url','unsupported_protocol'])}),
};
