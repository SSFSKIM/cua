// Scratch checkouts only. Adapted from the #395 ordered AX trace patch; probes the shipping call sites unchanged.
import {copyFileSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const hooks={AXUIElementCopyAttributeValue:'probe395CopyAttributeValue',AXUIElementCopyMultipleAttributeValues:'probe395CopyMultipleAttributeValues',
  AXUIElementCopyParameterizedAttributeValue:'probe395CopyParameterizedAttributeValue',AXUIElementCopyAttributeNames:'probe395CopyAttributeNames',
  AXUIElementCopyActionNames:'probe395CopyActionNames',AXUIElementCopyElementAtPosition:'probe395CopyElementAtPosition',
  AXUIElementSetAttributeValue:'probe395SetAttributeValue',AXUIElementPerformAction:'probe395PerformAction'};
const type='  func typeText(_ args: [String: Any], _ context: ExecutionContext) throws -> Any {';
export function patchAudit(root,poll){
  if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(poll??''))throw Error('secure poll function name required');
  const dir=join(root,'native/engine/Sources/Engine'), own=join(dir,'Probe395Audit.swift');
  const paths=readdirSync(dir,{recursive:true}).filter(x=>x.endsWith('.swift')).sort().map(x=>join(dir,x));
  const source=new Map(paths.map(p=>[p,readFileSync(p,'utf8')]));
  if(source.has(own))throw Error('already instrumented');
  function one(regex,replacement){
    const at=[...source].flatMap(([p,t])=>[...t.matchAll(regex)].map(()=>[p,t]));
    if(at.length!==1)throw Error('required audit anchor missing or ambiguous');
    const [[p,t]]=at;source.set(p,t.replace(regex,replacement));
  }
  one(new RegExp(type.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),s=>s+'\n    let probeTag = Probe395Audit.shared.begin(args)\n    defer { Probe395Audit.shared.finish(probeTag) }');
  one(new RegExp(`\\bfunc ${poll}(?=[<(])[^{}]*\\{`,'g'),s=>s+'\n  let probePoll = Probe395Audit.shared.phaseBegin("securePoll")\n  defer { Probe395Audit.shared.phaseEnd("securePoll", probePoll) }');
  for(const call of ['event.postToPid(pid)','event.post(tap: .cghidEventTap)']){
    const escaped=call.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    one(new RegExp(`\\{ ${escaped} \\}`,'g'),()=>`{ Probe395Audit.shared.eventPosted(event); ${call} }`);
  }
  const counts={};
  for(const [p,s] of source){
    let t=s;
    for(const [from,to] of Object.entries(hooks))t=t.replace(new RegExp('(?<![\\w"])'+from+'(?=\\s*\\()','g'),()=>{counts[from]=(counts[from]??0)+1;return to;});
    source.set(p,t);
  }
  for(const name of Object.keys(hooks).slice(0,3))if(!counts[name])throw Error('AX audit API missing');
  for(const [p,t] of source)writeFileSync(p,t);
  copyFileSync(new URL('./audit.swift',import.meta.url),own);
  return {poll,counts};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  try{console.log(JSON.stringify(patchAudit(process.argv[2],process.argv[3])));}
  catch{console.error('Audit scratch patch failed: missing or ambiguous required seam');process.exitCode=1;}
}
