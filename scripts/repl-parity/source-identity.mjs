// A version allowance is tied to the code that answered, not to the comparator's checkout or a self-reported marker.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),versions=new Map();
export function attestedSourceVersion(meta,{repo=root}={}){
 if(!/^[0-9a-f]{40}$/.test(meta.commit??''))throw new Error('Own identity allowance requires the recorded source commit');
 for(const a of meta.hostAttestations??[])if(a.executionFacts?.commit!==meta.commit||a.executionFacts?.dirty!==false)throw new Error('Attested connection differs from the recorded source commit');
 const key=`${repo}:${meta.commit}`;let version=versions.get(key);
 if(!version){
  let source;try{source=execFileSync('git',['show',`${meta.commit}:src/repl-host/identity.mjs`],{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe']});}catch{throw new Error(`Identity source commit unavailable: ${meta.commit}`);}
  version=/^export const REPL_HOST_VERSION\s*=\s*['"]([^'"\n]+)['"];?\s*$/m.exec(source)?.[1];
  if(!version)throw new Error('Recorded identity source has no literal host version');versions.set(key,version);
 }
 if(meta.hostVersion!==version||meta.hostAttestations.some(a=>a.serverInfo.version!==version||a._meta?.['cua/replHost']?.version!==version))throw new Error('Attested host version differs from recorded source');
 return version;
}
