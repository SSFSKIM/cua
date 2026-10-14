// WebMCP's success path on the capability host (test/browser-parity/capability-host.mjs), the one backend announcing
// `webmcp`: the page's one registered tool is listed and invoked. A registration's call name carries a random id, shown
// here as <registration>. Runs only with `run --device local --backend capability-host`.
import {expectValues} from '../../support/assertions.mjs';
export default {
  id:'capability-host/webmcp', milestone:'M3', commands:['webmcp_list_tools','webmcp_invoke_tool'], backend:'capability-host',
  setup:{page:'https://cua-capability.example/shop',open:'goto',state:{}},
  cells:[
    {label:'list',code:"const webmcp=await tab.capabilities.get('webmcp');await webmcp.documentation();globalThis.tools=await webmcp.fetchTools();const text=tools.description();const listed=JSON.parse(text.slice(text.indexOf('['),text.lastIndexOf(']')+1));globalThis.toolName=listed[0].name;return listed.map(t=>({...t,name:t.name.replace(/__[0-9a-f-]{36}$/,'__<registration>')}));"},
    {label:'invoke',code:"return await tools.call(toolName,{q:'lamps'});"},
  ],
  assert:expectValues({
    list:[{name:'search__<registration>',title:'Search',description:'Search the catalogue',inputSchema:{properties:{q:{type:'string'}},type:'object'},origin:'https://cua-capability.example',pageUrl:'https://cua-capability.example/shop'}],
    invoke:'results for lamps',
  }),
};
