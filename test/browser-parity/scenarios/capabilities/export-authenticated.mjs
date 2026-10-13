export default {
  id:'capabilities/export-authenticated',milestone:'M3',commands:['tab_content_export_gsuite','tab_content_export_youtube_transcript'],
  setup:{page:'/counter.html',state:{}},cells:[],
  skip:'external: authenticated Google Workspace document and stable captioned YouTube fixture are not provided; fixture-host rejection contracts remain executable',
  assert:()=>({ok:true}),
};
