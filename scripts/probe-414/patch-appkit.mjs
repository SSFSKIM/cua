// Scratch checkouts only: the #414 AppKit timing probe (appkit-timing.swift). Each seam is required exactly once and fails
// closed on drift: the request scope (armed for type_text alone, finished by a defer), the actual gated posts (marked after the
// post call), the secure length poll's own judged line (marked only when that batch is `.confirmed`), and the production
// `readbackLength` itself (renamed behind the probe's same-signature wrapper, so every caller is sampled). Not for combination
// with the AX schedule audit or the Firefox diagnostic: each owns the request scope.
import {copyFileSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const dispatchBinding='    let args = params["args"] as? [String: Any] ?? [:]\n';
const methodBinding='guard let method = params["method"] as? String';
const judged='case .read(let count, let range): last = readbackLengthJudged(count: count, range: range, basis: basis, typed: typed)\n';
const lengthRead='func readbackLength<Element>(_ field: Element, role: String, reads: ReadbackReads<Element>) -> ReadbackLength {\n';
const posts=['event.postToPid(pid)','event.post(tap: .cghidEventTap)'];
const count=(text,part)=>text.split(part).length-1;
export function patchAppKit(root){
  const dir=join(root,'native/engine/Sources/Engine'), own=join(dir,'Probe414AppKit.swift');
  const paths=readdirSync(dir,{recursive:true}).filter(x=>x.endsWith('.swift')).sort().map(x=>join(dir,x));
  const source=new Map(paths.map(p=>[p,readFileSync(p,'utf8')]));
  if(source.has(own))throw Error('already instrumented');
  if([...source.values()].some(t=>t.includes('Probe395Audit')||t.includes('Probe414Firefox')))throw Error('other instrumentation present');
  // Rewrites the one file in which `anchor` occurs exactly once across the whole tree.
  function one(anchor,change){
    const at=[...source].filter(([,t])=>t.includes(anchor));
    if(at.length!==1||count(at[0][1],anchor)!==1)throw Error('required anchor missing or ambiguous');
    source.set(at[0][0],change(at[0][1]));
  }
  // The request scope: after the args binding (the method guard is earlier); finished when the request ends.
  one(dispatchBinding,t=>{
    if(count(t,methodBinding)!==1||t.indexOf(methodBinding)>t.indexOf(dispatchBinding))throw Error('request scope drift');
    return t.replace(dispatchBinding,()=>dispatchBinding+'    let probe414AppKitTag = method == "type_text" ? Probe414AppKit.shared.begin(args) : nil\n    defer { Probe414AppKit.shared.finish(probe414AppKitTag) }\n');
  });
  // The gated posts: the mark follows the post call inside the gate's own branch, so a refused post is never marked.
  for(const call of posts)one(`{ ${call} }`,t=>t.replace(`{ ${call} }`,()=>`{ ${call}; Probe414AppKit.shared.posted(event) }`));
  // The length poll's judged batch: marked right after the product's own judgement, only when it is `.confirmed`.
  one(judged,t=>{
    const at=t.indexOf(judged), head=t.lastIndexOf('private func confirmLength(',at), loop=t.lastIndexOf('    while true {\n',at);
    if(head<0||loop<head||t.slice(head,at).includes('\n  }\n'))throw Error('poll drift');
    return t.replace(judged,()=>judged.trimEnd()+'; if last == .confirmed { Probe414AppKit.shared.confirmed() }\n');
  });
  // The production length read keeps its body under another name; the probe file's wrapper takes the old name for every caller.
  one(lengthRead,t=>t.replace(lengthRead,()=>lengthRead.replace('readbackLength<','readbackLengthUninstrumented<')));
  for(const [p,t] of source)writeFileSync(p,t);
  copyFileSync(new URL('./appkit-timing.swift',import.meta.url),own);
  return {seams:5};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  try{console.log(JSON.stringify(patchAppKit(process.argv[2])));}
  catch{console.error('AppKit scratch patch failed: missing or ambiguous required seam');process.exitCode=1;}
}
