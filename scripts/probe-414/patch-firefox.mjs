// Scratch checkouts only: the #414 Firefox focused-field diagnostic (firefox-focus.swift). Three seams, each required exactly once
// and failing closed on drift: the request scope (armed for type_text alone, finished by a defer), and the snapshot's own role and
// subrole reads in `readbackSnapshot`. Not for combination with the AX schedule audit: that patch renames every AX call.
import {copyFileSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const dispatchBinding='    let args = params["args"] as? [String: Any] ?? [:]\n';
const methodBinding='guard let method = params["method"] as? String';
const snapshotRead='  guard let role = reads.role(field) else { return .refused(.roleUnreadable) }\n  let subrole = reads.subrole(field)\n';
const count=(text,part)=>text.split(part).length-1;
export function patchFirefox(root){
  const dir=join(root,'native/engine/Sources/Engine'), own=join(dir,'Probe414Firefox.swift');
  const paths=readdirSync(dir,{recursive:true}).filter(x=>x.endsWith('.swift')).sort().map(x=>join(dir,x));
  const source=new Map(paths.map(p=>[p,readFileSync(p,'utf8')]));
  if(source.has(own))throw Error('already instrumented');
  if([...source.values()].some(t=>t.includes('Probe395Audit')))throw Error('audit instrumentation present');
  // Rewrites the one file in which `anchor` occurs exactly once across the whole tree.
  function one(anchor,change){
    const at=[...source].filter(([,t])=>t.includes(anchor));
    if(at.length!==1||count(at[0][1],anchor)!==1)throw Error('required anchor missing or ambiguous');
    source.set(at[0][0],change(at[0][1]));
  }
  // The request scope: after the args binding (the method guard is earlier), before the input enablement; finished when the request ends.
  one(dispatchBinding,t=>{
    if(count(t,methodBinding)!==1||t.indexOf(methodBinding)>t.indexOf(dispatchBinding))throw Error('request scope drift');
    return t.replace(dispatchBinding,()=>dispatchBinding+'    let probe414Tag = method == "type_text" ? Probe414Firefox.shared.begin(args) : nil\n    defer { Probe414Firefox.shared.finish(probe414Tag) }\n');
  });
  // The snapshot: the actual role and subrole the product read, right after its role guard.
  one(snapshotRead,t=>t.replace(snapshotRead,()=>snapshotRead+'  Probe414Firefox.shared.snapshot(field, role: role, subrole: subrole)\n'));
  for(const [p,t] of source)writeFileSync(p,t);
  copyFileSync(new URL('./firefox-focus.swift',import.meta.url),own);
  return {seams:3};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  try{console.log(JSON.stringify(patchFirefox(process.argv[2])));}
  catch{console.error('Firefox scratch patch failed: missing or ambiguous required seam');process.exitCode=1;}
}
