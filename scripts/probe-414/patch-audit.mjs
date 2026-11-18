// Scratch checkouts only. Adapted from the #395 ordered AX trace patch; probes the shipping call sites unchanged.
// Every seam is required exactly once and fails closed on drift: the dispatch boundary (before the input enablement and the
// app resolution, armed for type_text alone), the actual `while true {` iteration of the secure length poll, and the posts.
import {copyFileSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const hooks={AXUIElementCopyAttributeValue:'probe395CopyAttributeValue',AXUIElementCopyMultipleAttributeValues:'probe395CopyMultipleAttributeValues',
  AXUIElementCopyParameterizedAttributeValue:'probe395CopyParameterizedAttributeValue',AXUIElementCopyAttributeNames:'probe395CopyAttributeNames',
  AXUIElementCopyActionNames:'probe395CopyActionNames',AXUIElementCopyElementAtPosition:'probe395CopyElementAtPosition',
  AXUIElementSetAttributeValue:'probe395SetAttributeValue',AXUIElementPerformAction:'probe395PerformAction'};
export const DEFAULT_POLL='confirmLength';
const dispatchBinding='    let args = params["args"] as? [String: Any] ?? [:]\n';
const methodBinding='guard let method = params["method"] as? String';
const enablement='webAccessibility.inputEnablement(';
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const count=(text,part)=>text.split(part).length-1;
export function patchAudit(root,poll=DEFAULT_POLL){
  if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(poll??''))throw Error('secure poll function name required');
  const dir=join(root,'native/engine/Sources/Engine'), own=join(dir,'Probe395Audit.swift');
  const paths=readdirSync(dir,{recursive:true}).filter(x=>x.endsWith('.swift')).sort().map(x=>join(dir,x));
  const source=new Map(paths.map(p=>[p,readFileSync(p,'utf8')]));
  if(source.has(own))throw Error('already instrumented');
  // `change(text, match)` rewrites the one file holding exactly one `regex` match; anything else is drift.
  function one(regex,change){
    const at=[...source].flatMap(([p,t])=>[...t.matchAll(regex)].map(m=>[p,t,m]));
    if(at.length!==1)throw Error('required audit anchor missing or ambiguous');
    const [[p,t,m]]=at;source.set(p,change(t,m));
  }
  // The native dispatch boundary: armed for type_text only, inside the request's own scope, before enablement and resolution.
  one(new RegExp(escape(dispatchBinding),'g'),t=>{
    const at=t.indexOf(dispatchBinding);
    if(count(t,methodBinding)!==1||t.indexOf(methodBinding)>at||count(t,enablement)!==1||t.indexOf(enablement)<at)throw Error('dispatch boundary drift');
    return t.replace(dispatchBinding,()=>dispatchBinding+'    let probeTag = method == "type_text" ? Probe395Audit.shared.begin(args) : nil\n    defer { Probe395Audit.shared.finish(probeTag) }\n');
  });
  // The secure length poll: each pass of its own loop is one bracketed iteration; the focus checks after the loop stay outside it.
  one(new RegExp(`\\bfunc ${poll}(?=[<(])[^{}]*\\{\\n`,'g'),(t,m)=>{
    const head=m.index+m[0].length, end=t.indexOf('\n  }\n',head);
    if(end<0)throw Error('poll boundary drift');
    const body=t.slice(head,end), loop=['    poll: while true {\n','    while true {\n'].find(x=>body.includes(x)), at=body.indexOf(loop), focus=body.indexOf('reads.stillFocused('), batch=body.indexOf('readbackLength(');
    if(count(body,'while true {')!==1||at<0||count(body,'reads.stillFocused(')!==1||count(body,'readbackLength(')!==1||count(body,'reads.sleep(typeReadbackPollIntervalMs)')!==1||
       !(at<batch&&batch<focus))throw Error('poll boundary drift');
    const open='      let probeIteration = Probe395Audit.shared.phaseBegin("securePoll")\n      defer { Probe395Audit.shared.phaseEnd("securePoll", probeIteration) }\n';
    return t.slice(0,head)+body.slice(0,at+loop.length)+open+body.slice(at+loop.length)+t.slice(end);
  });
  for(const call of ['event.postToPid(pid)','event.post(tap: .cghidEventTap)'])
    one(new RegExp(`\\{ ${escape(call)} \\}`,'g'),t=>t.replace(`{ ${call} }`,()=>`{ Probe395Audit.shared.eventPosted(event); ${call} }`));
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
  try{console.log(JSON.stringify(patchAudit(process.argv[2],process.argv[3]||DEFAULT_POLL)));}
  catch{console.error('Audit scratch patch failed: missing or ambiguous required seam');process.exitCode=1;}
}
