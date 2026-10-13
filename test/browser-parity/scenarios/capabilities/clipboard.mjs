import {expectValues} from '../../support/assertions.mjs';
export default {
  id:"capabilities/clipboard", milestone:"M2", commands:["tab_clipboard_read", "tab_clipboard_read_text", "tab_clipboard_write", "tab_clipboard_write_text"],
  setup:{page:"/counter.html",state:{}},
  cells:[
  {
    "label": "text",
    "code": "await tab.clipboard.writeText('parity text');return await tab.clipboard.readText();"
  },
  {
    "label": "rich",
    "code": "await tab.clipboard.write([{entries:[{mimeType:'text/plain',text:'parity rich'}]}]);return (await tab.clipboard.read()).flatMap(i=>i.entries).filter(e=>e.mimeType==='text/plain').map(e=>e.text);"
  }
],
  assert:expectValues({text:'parity text',rich:['parity rich']}),
};
