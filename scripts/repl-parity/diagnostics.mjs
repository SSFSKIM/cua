// Live vendor process-failure diagnostics contain PIDs inside a JSON suffix. Preserve the raw record; the comparator
// maps only these declared ID slots. Ordinary application text and every error sentence/status/unknown field stay exact.
const cases=new Set(['cells/lifecycle/child-exit-settles','cells/confinement/no-unsandboxed-fallback']);
export function normalizeHostDiagnostic(row){
 if(!cases.has(row.case)||row.isError!==true||!Array.isArray(row.content))return row;
 return {...row,content:row.content.map(item=>{
  if(item.type!=='text')return item;
  const match=item.text.match(/^(node_repl kernel exited unexpectedly\n\nnode_repl diagnostics: )(\{.*\})$/s);if(!match)return item;
  let info;try{info=JSON.parse(match[2]);}catch{return item;}
  if(!Number.isSafeInteger(info.kernel_pid)||info.kernel_pid<1)return item;
  const ids=new Map();const id=pid=>{const key=String(pid);if(!ids.has(key))ids.set(key,`<process:${ids.size+1}>`);return ids.get(key);};
  info.kernel_pid=id(info.kernel_pid);
  if(typeof info.kernel_stderr_tail==='string')info.kernel_stderr_tail=info.kernel_stderr_tail.replace(/\(node:(\d+)\)(?= ExperimentalWarning: VM Modules is an experimental feature)/g,(_,pid)=>`(node:${id(pid)})`);
  return {...item,text:match[1]+JSON.stringify(info)};
 })};
}
