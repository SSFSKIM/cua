import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"downloads/ask-where-to-save", milestone:"M2", commands:["playwright_wait_for_download"],
  setup:{page:"/downloads.html",state:{}},
  skip:'human: Chrome Ask where to save requires a person; never change profile download preferences',
  cells:[],
  assert:()=>({ok:true}),
};
