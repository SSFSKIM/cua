// start/join execute inside the one persistent REPL, not as simultaneous serialized MCP js calls.
export default {
  id:'examples/concurrency',milestone:'M1a',commands:[],
  setup:{page:'/counter.html',state:{}},
  cells:[
    {label:'wait',start:true,code:'return await new Promise(resolve=>{globalThis.releaseParityWait=()=>resolve("armed");});'},
    {label:'trigger',code:'releaseParityWait(); return true;'},
    {label:'join',join:'wait'},
    {label:'drop',op:'drop'},
  ],
  assert({results}) {return {ok:results.every(r=>r.ok) && results.find(r=>r.cell==='join').value==='armed'};},
};
